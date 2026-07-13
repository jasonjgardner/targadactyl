import {
  type TgaImageSource,
  type TgaWriterOptions,
  TgaOrigin,
  TgaType,
} from "./types.js";
import { TgaWriterError } from "./errors.js";
import type { TgaLoader } from "./tga.js";

/**
 * Byte length of a v1.0 TGA header (no ID field, color map, or footer).
 */
const TGA_HEADER_SIZE = 0x12;

/**
 * Maximum pixels a single RLE packet (run or raw) can carry.
 */
const RLE_MAX_PACKET = 128;

/**
 * Writer options with defaults applied.
 */
type ResolvedWriterOptions = Required<TgaWriterOptions>;

/**
 * Build the 18-byte TGA v1.0 header. Origin is always top-left, so pixel
 * rows are written top-down and never flipped.
 *
 * @param width Image width in pixels (written as a little-endian word)
 * @param height Image height in pixels (written as a little-endian word)
 * @param options Resolved encoding options
 * @returns {Uint8Array} Complete 18-byte header
 */
const buildHeader = (
  width: number,
  height: number,
  options: ResolvedWriterOptions,
): Uint8Array => {
  const header = new Uint8Array(TGA_HEADER_SIZE);

  header[0x02] = options.rle ? TgaType.TYPE_RLE_RGB : TgaType.TYPE_RGB;
  header[0x0c] = width & 0xff;
  header[0x0d] = (width >> 8) & 0xff;
  header[0x0e] = height & 0xff;
  header[0x0f] = (height >> 8) & 0xff;
  header[0x10] = options.bitDepth;
  header[0x11] = (TgaOrigin.ORIGIN_TOP_LEFT << TgaOrigin.ORIGIN_SHIFT) |
    (options.bitDepth === 32 ? 8 : 0);

  return header;
};

/**
 * Convert top-down RGBA pixels to TGA file order: BGR for 24-bit output
 * (alpha dropped) or BGRA for 32-bit. Exact inverse of the channel swap
 * the decoder performs in `getImageData24bits`/`getImageData32bits`.
 *
 * @param rgba RGBA source pixels, 4 bytes per pixel
 * @param pixelSize Output bytes per pixel: 3 (BGR) or 4 (BGRA)
 * @returns {Uint8ClampedArray} Pixel data in TGA file order
 */
const toBGR = (
  rgba: Uint8ClampedArray,
  pixelSize: 3 | 4,
): Uint8ClampedArray => {
  const pixelCount = rgba.length / 4;
  const output = new Uint8ClampedArray(pixelCount * pixelSize);

  for (let i = 0; i < pixelCount; i++) {
    const src = i * 4;
    const dst = i * pixelSize;

    output[dst] = rgba[src + 2];
    output[dst + 1] = rgba[src + 1];
    output[dst + 2] = rgba[src];

    if (pixelSize === 4) {
      output[dst + 3] = rgba[src + 3];
    }
  }

  return output;
};

/**
 * Compare two pixels within TGA-ordered pixel data.
 *
 * @param data Pixel bytes in file order
 * @param a Byte offset of the first pixel
 * @param b Byte offset of the second pixel
 * @param pixelSize Bytes per pixel
 * @returns {boolean} True when every byte of both pixels matches
 */
const pixelsEqual = (
  data: Uint8ClampedArray,
  a: number,
  b: number,
  pixelSize: number,
): boolean => {
  for (let i = 0; i < pixelSize; i++) {
    if (data[a + i] !== data[b + i]) {
      return false;
    }
  }

  return true;
};

/**
 * Measure how many consecutive identical pixels start at `offset`,
 * bounded by the end of the scanline and the 128-pixel packet cap.
 *
 * @param data Pixel bytes in file order
 * @param offset Byte offset of the first pixel of the candidate run
 * @param rowEnd Exclusive byte offset where the scanline ends
 * @param pixelSize Bytes per pixel
 * @returns {number} Run length in pixels (at least 1)
 */
const runLength = (
  data: Uint8ClampedArray,
  offset: number,
  rowEnd: number,
  pixelSize: number,
): number => {
  let run = 1;

  while (
    run < RLE_MAX_PACKET &&
    offset + run * pixelSize < rowEnd &&
    pixelsEqual(data, offset, offset + run * pixelSize, pixelSize)
  ) {
    run++;
  }

  return run;
};

/**
 * Run-length encode TGA-ordered pixel data one scanline at a time.
 * Packets never cross scanline boundaries (spec recommendation; some
 * readers require it). Runs of 2+ identical pixels become run packets
 * (`0x80 | count-1` + one pixel); everything else accumulates into raw
 * packets (`count-1` + count pixels). Both cap at 128 pixels.
 *
 * @param pixels BGR(A) pixel bytes from `toBGR`
 * @param width Image width in pixels
 * @param height Image height in pixels
 * @param pixelSize Bytes per pixel: 3 or 4
 * @returns {Uint8Array} RLE-compressed pixel data
 */
const encodeRLE = (
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  pixelSize: number,
): Uint8Array => {
  const bytes: number[] = [];
  const rowBytes = width * pixelSize;

  for (let row = 0; row < height; row++) {
    const rowEnd = (row + 1) * rowBytes;
    let pos = row * rowBytes;

    while (pos < rowEnd) {
      const run = runLength(pixels, pos, rowEnd, pixelSize);

      if (run > 1) {
        bytes.push(0x80 | (run - 1));

        for (let i = 0; i < pixelSize; i++) {
          bytes.push(pixels[pos + i]);
        }

        pos += run * pixelSize;
        continue;
      }

      const rawStart = pos;
      let count = 0;

      while (
        pos < rowEnd && count < RLE_MAX_PACKET &&
        runLength(pixels, pos, rowEnd, pixelSize) === 1
      ) {
        count++;
        pos += pixelSize;
      }

      bytes.push(count - 1);

      for (let i = rawStart; i < pos; i++) {
        bytes.push(pixels[i]);
      }
    }
  }

  return Uint8Array.from(bytes);
};

/**
 * Encodes RGBA pixel data as a TGA (Targa) file. Counterpart to
 * `TgaLoader`: output from `encode()` round-trips through
 * `TgaLoader.load()` byte-for-byte (alpha restored to 255 for 24-bit).
 *
 * @example ```ts
 * const writer = new TgaWriter(ctx.getImageData(0, 0, w, h), {
 *   bitDepth: 24,
 * });
 * const bytes = writer.encode();
 * ```
 * @see https://www.gamers.org/dEngine/quake3/TGA.txt TGA file specs
 */
export class TgaWriter {
  /**
   * Validated RGBA source image
   */
  private readonly image: TgaImageSource;

  /**
   * Encoding options with defaults applied
   */
  private readonly options: ResolvedWriterOptions;

  /**
   * Validate the source image and store the encoding configuration.
   *
   * @param image RGBA pixels with dimensions; any `ImageData` satisfies it
   * @param options Optional bit depth (default 32) and RLE flag (default false)
   * @throws {TgaWriterError} Thrown for non-positive/non-integer dimensions,
   * a data length not equal to `width * height * 4`, or a bit depth other
   * than 24/32
   */
  constructor(image: TgaImageSource, options: TgaWriterOptions = {}) {
    const { data, width, height } = image;
    const bitDepth = options.bitDepth ?? 32;
    const rle = options.rle ?? false;

    if (
      !Number.isInteger(width) || !Number.isInteger(height) ||
      width <= 0 || height <= 0
    ) {
      throw new TgaWriterError(`Invalid image dimensions: ${width}x${height}`);
    }

    if (data.length !== width * height * 4) {
      throw new TgaWriterError(
        `Pixel data length ${data.length} does not match ${width}x${height} RGBA (expected ${
          width * height * 4
        }).`,
      );
    }

    if (bitDepth !== 24 && bitDepth !== 32) {
      throw new TgaWriterError(`Invalid bit depth "${bitDepth}". Use 24 or 32.`);
    }

    this.image = image;
    this.options = { bitDepth, rle };
  }

  /**
   * Create a writer from an already-loaded `TgaLoader` for round-tripping
   * (load, modify, save). The loader's decoded RGBA pixels become the
   * source image; indexed/grayscale/16-bit sources re-encode as true color.
   *
   * @example ```ts
   * const tga = new TgaLoader();
   * tga.load(await tga.open("./in.tga"));
   * await TgaWriter.fromLoader(tga, { rle: true }).save("./out.tga");
   * ```
   *
   * @param loader Loader whose `load` method has been called
   * @param options Optional bit depth and RLE flag
   * @throws {TgaLoaderReferenceError} Propagated from `getRGBA` when the
   * loader has no data
   * @returns {TgaWriter} Writer sourcing the loader's decoded pixels
   */
  static fromLoader(loader: TgaLoader, options?: TgaWriterOptions): TgaWriter {
    return new TgaWriter(loader.getRGBA(), options);
  }

  /**
   * Encode the image as complete TGA file bytes: 18-byte header followed
   * by pixel data.
   *
   * @returns {Uint8Array} TGA file contents, ready to write or serve
   */
  encode(): Uint8Array {
    const { data, width, height } = this.image;
    const pixelSize = this.options.bitDepth === 32 ? 4 : 3;

    const header = buildHeader(width, height, this.options);
    const bgr = toBGR(data, pixelSize);
    const body = this.options.rle
      ? encodeRLE(bgr, width, height, pixelSize)
      : bgr;

    const output = new Uint8Array(header.length + body.length);
    output.set(header, 0);
    output.set(body, header.length);

    return output;
  }

  /**
   * Encode and write the TGA file to disk. Counterpart to
   * `TgaLoader.open`. `node:fs/promises` is imported lazily here — the
   * only Node-specific dependency in this module — so bundling this
   * module for the browser stays safe as long as `save` is never called.
   *
   * @param path Filesystem destination for the .tga file
   * @throws {TgaWriterError} Thrown when the file cannot be written
   */
  async save(path: string): Promise<void> {
    try {
      const { writeFile } = await import("node:fs/promises");
      await writeFile(path, this.encode());
    } catch (err) {
      throw new TgaWriterError(
        `Can not save file to path: "${path}". ${(err as Error).message}`,
      );
    }
  }
}
