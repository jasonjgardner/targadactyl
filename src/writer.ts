import {
  type TgaImageSource,
  type TgaWriterOptions,
  TgaOrigin,
  TgaType,
} from "./types.js";
import { TgaWriterError } from "./errors.js";

/**
 * Byte length of a v1.0 TGA header (no ID field, color map, or footer).
 */
const TGA_HEADER_SIZE = 0x12;

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
   * Encode the image as complete TGA file bytes: 18-byte header followed
   * by pixel data.
   *
   * @returns {Uint8Array} TGA file contents, ready to write or serve
   */
  encode(): Uint8Array {
    const { data, width, height } = this.image;
    const pixelSize = this.options.bitDepth === 32 ? 4 : 3;

    const header = buildHeader(width, height, this.options);
    const body = toBGR(data, pixelSize);

    const output = new Uint8Array(header.length + body.length);
    output.set(header, 0);
    output.set(body, header.length);

    return output;
  }
}
