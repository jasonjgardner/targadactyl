import { type TgaHeader, TgaOrigin, TgaType } from "./types.ts";
import {
  createCanvas,
  decode,
  type EmulatedCanvas2D,
  type ImageData,
} from "../deps.ts";
import { TgaLoaderError, TgaLoaderReferenceError } from "./errors.ts";

/**
 * Loads local or remote TGA files into a canvas rendering context.
 * @see https://www.gamers.org/dEngine/quake3/TGA.txt TGA file specs
 * @see https://github.com/vthibault/tga.js Original source. JavaScript TGA loader
 * @uses createCanvas https://deno.land/x/canvas@v1.4.1/mod.ts?s=createCanvas
 */
export class TgaLoader {
  /**
   * Array containing TGA image data
   */
  imageData?: Uint8ClampedArray;

  /**
   * Array containing TGA image color data
   */
  palette?: Uint8ClampedArray;

  /**
   * TGA file header information
   */
  _header?: TgaHeader;

  /**
   * Setter method for TGA header data. Checks the header of TGA file to detect errors before setting `TgaLoader._header` property
   * @param {TgaHeader} header TGA file information to validate and use
   * @throws {TgaLoaderError} Thrown if TGA header is invalid or incomplete
   */
  set header(header: TgaHeader) {
    if (!header || header.imageType === TgaType.TYPE_NO_DATA) {
      throw new TgaLoaderError(
        "TGA header is missing or indicates the file is empty.",
      );
    }

    if (!header.hasColorMap && header.colorMapType) {
      throw new TgaLoaderError(
        "A color map must be provided when a color map type is set.",
      );
    }

    // Indexed type
    if (
      header.hasColorMap && (
        header.colorMapLength > 256 ||
        header.colorMapDepth !== 24 ||
        header.colorMapType !== 1
      )
    ) {
      throw new TgaLoaderError("Invalid color map for indexed type.");
    }

    // Check image size
    if (!header.width || !header.height) {
      throw new TgaLoaderError("Invalid image dimensions.");
    }

    // Check pixel size
    if (
      header.pixelDepth !== 8 &&
      header.pixelDepth !== 16 &&
      header.pixelDepth !== 24 &&
      header.pixelDepth !== 32
    ) {
      throw new TgaLoaderError(`Invalid pixel size "${header.pixelDepth}"`);
    }

    this._header = header;
  }

  /**
   * Getter method for accessing header information
   * @see TgaLoader.load
   * @throws {TgaLoaderReferenceError} Thrown if method is called prior to loading TGA data
   */
  get header(): TgaHeader {
    if (!this._header) {
      throw new TgaLoaderReferenceError("Can not get TGA header data.");
    }

    return this._header;
  }

  /**
   * Decode compressed TGA file
   *
   * @param data TGA image data
   * @param offset Byte index offset for compression decoding
   * @param pixelSize Input image size
   * @param outputSize Output image size
   * @returns {Uint8ClampedArray} Decoded compressed TGA data
   */
  private decodeRLE(
    data: Uint8ClampedArray,
    offset: number,
    pixelSize: number,
    outputSize: number,
  ): Uint8ClampedArray {
    const output = new Uint8ClampedArray(outputSize);
    const pixels = new Uint8ClampedArray(pixelSize);
    let pos = 0;

    while (pos < outputSize) {
      const c = data[offset++];
      let count = (c & 0x7f) + 1;

      // RLE pixels.
      if (c & 0x80) {
        // Bind pixel tmp array
        for (let i = 0; i < pixelSize; ++i) {
          pixels[i] = data[offset + i];
        }

        offset += pixelSize;

        // Copy pixel array
        for (let i = 0; i < count; ++i) {
          output.set(pixels, pos);
          pos += pixelSize;
        }

        continue;
      }
      // Raw pixels.

      count *= pixelSize;

      for (let i = 0; i < count; ++i) {
        output[pos + i] = data[offset + i];
      }

      pos += count;
      offset += count;
    }

    return output;
  }

  /**
   * Copy image data from 8 bit RGB TGA file
   *
   * @param imageData Canvas data container
   * @param indexes TGA image data color indexes
   * @param colorMap Color map data
   * @param width Image width
   * @param yStart Y-axis start position of pixel data to copy
   * @param yStep The number of pixels offset per iteration over the Y-axis
   * @param yEnd Y-axis end position of pixel data to copy
   * @param xStart X-axis start position of pixel data to copy
   * @param xStep The number of pixels offset per iteration over the X-axis
   * @param xEnd X-axis end position of pixel data to copy
   * @returns {Uint8ClampedArray} Image data copied from TGA file
   */
  private getImageData8bits(
    imageData: Uint8ClampedArray,
    indexes: Uint8ClampedArray,
    colorMap: Uint8ClampedArray,
    width: number,
    yStart: number,
    yStep: number,
    yEnd: number,
    xStart: number,
    xStep: number,
    xEnd: number,
  ): Uint8ClampedArray {
    for (let i = 0, y = yStart; y !== yEnd; y += yStep) {
      for (let x = xStart; x !== xEnd; x += xStep, i++) {
        const color = indexes[i];
        const offset = (x + width * y) * 4;
        const idx = color * 3;

        imageData[offset + 3] = 255;
        imageData[offset + 2] = colorMap[idx];
        imageData[offset + 1] = colorMap[idx + 1];
        imageData[offset] = colorMap[idx + 2];
      }
    }

    return imageData;
  }

  /**
   * Copy image data from 16 bit RGB TGA file
   *
   * @param imageData Canvas data container
   * @param pixels TGA image data
   * @param _colorMap Color map data (unused)
   * @param width Image width
   * @param yStart Y-axis start position of pixel data to copy
   * @param yStep The number of pixels offset per iteration over the Y-axis
   * @param yEnd Y-axis end position of pixel data to copy
   * @param xStart X-axis start position of pixel data to copy
   * @param xStep The number of pixels offset per iteration over the X-axis
   * @param xEnd X-axis end position of pixel data to copy
   * @returns {Uint8ClampedArray} Image data copied from TGA file
   */
  private getImageData16bits(
    imageData: Uint8ClampedArray,
    pixels: Uint8ClampedArray,
    _colorMap: Uint8ClampedArray,
    width: number,
    yStart: number,
    yStep: number,
    yEnd: number,
    xStart: number,
    xStep: number,
    xEnd: number,
  ): Uint8ClampedArray {
    for (let i = 0, y = yStart; y !== yEnd; y += yStep) {
      for (let x = xStart; x !== xEnd; x += xStep, i += 2) {
        const color = pixels[i + 0] | (pixels[i + 1] << 8);
        const offset = (x + width * y) * 4;
        imageData[offset] = (color & 0x7c00) >> 7;
        imageData[offset * 4 + 1] = (color & 0x03e0) >> 2;
        imageData[offset * 4 + 2] = (color & 0x001f) >> 3;
        imageData[offset * 4 + 3] = color & 0x8000 ? 0 : 255;
      }
    }

    return imageData;
  }

  /**
   * Copy image data from 24 bit RGB TGA file
   *
   * @param imageData Canvas data container
   * @param pixels TGA image data
   * @param _colorMap Color map data (unused)
   * @param width Image width
   * @param yStart Y-axis start position of pixel data to copy
   * @param yStep The number of pixels offset per iteration over the Y-axis
   * @param yEnd Y-axis end position of pixel data to copy
   * @param xStart X-axis start position of pixel data to copy
   * @param xStep The number of pixels offset per iteration over the X-axis
   * @param xEnd X-axis end position of pixel data to copy
   * @returns {Uint8ClampedArray} Image data copied from TGA file
   */
  private getImageData24bits(
    imageData: Uint8ClampedArray,
    pixels: Uint8ClampedArray,
    _colorMap: Uint8ClampedArray,
    width: number,
    yStart: number,
    yStep: number,
    yEnd: number,
    xStart: number,
    xStep: number,
    xEnd: number,
  ): Uint8ClampedArray {
    for (let i = 0, y = yStart; y !== yEnd; y += yStep) {
      for (let x = xStart; x !== xEnd; x += xStep, i += 3) {
        const offset = (x + width * y) * 4;
        imageData[offset + 3] = 255;
        imageData[offset + 2] = pixels[i];
        imageData[offset + 1] = pixels[i + 1];
        imageData[offset] = pixels[i + 2];
      }
    }

    return imageData;
  }

  /**
   * Copy image data from 32 bit RGB TGA file
   *
   * @param imageData Canvas data container
   * @param pixels TGA image data
   * @param _colorMap Color map data (unused)
   * @param width Image width
   * @param yStart Y-axis start position of pixel data to copy
   * @param yStep The number of pixels offset per iteration over the Y-axis
   * @param yEnd Y-axis end position of pixel data to copy
   * @param xStart X-axis start position of pixel data to copy
   * @param xStep The number of pixels offset per iteration over the X-axis
   * @param xEnd X-axis end position of pixel data to copy
   * @returns {Uint8ClampedArray} Image data copied from TGA file
   */
  private getImageData32bits(
    imageData: Uint8ClampedArray,
    pixels: Uint8ClampedArray,
    _colorMap: Uint8ClampedArray,
    width: number,
    yStart: number,
    yStep: number,
    yEnd: number,
    xStart: number,
    xStep: number,
    xEnd: number,
  ): Uint8ClampedArray {
    for (let i = 0, y = yStart; y !== yEnd; y += yStep) {
      for (let x = xStart; x !== xEnd; x += xStep, i += 4) {
        const offset = (x + width * y) * 4;
        imageData[offset + 2] = pixels[i];
        imageData[offset + 1] = pixels[i + 1];
        imageData[offset] = pixels[i + 2];
        imageData[offset + 3] = pixels[i + 3];
      }
    }

    return imageData;
  }

  /**
   * Copy image data from 8 bit gray TGA file
   *
   * @param imageData Canvas data container
   * @param pixels TGA image data
   * @param _colorMap Color map data (unused)
   * @param width Image width
   * @param yStart Y-axis start position of pixel data to copy
   * @param yStep The number of pixels offset per iteration over the Y-axis
   * @param yEnd Y-axis end position of pixel data to copy
   * @param xStart X-axis start position of pixel data to copy
   * @param xStep The number of pixels offset per iteration over the X-axis
   * @param xEnd X-axis end position of pixel data to copy
   * @returns {Uint8ClampedArray} Image data copied from TGA file
   */
  private getImageDataGrey8bits(
    imageData: Uint8ClampedArray,
    pixels: Uint8ClampedArray,
    _colorMap: Uint8ClampedArray,
    width: number,
    yStart: number,
    yStep: number,
    yEnd: number,
    xStart: number,
    xStep: number,
    xEnd: number,
  ): Uint8ClampedArray {
    for (let i = 0, y = yStart; y !== yEnd; y += yStep) {
      for (let x = xStart; x !== xEnd; x += xStep, i++) {
        const color = pixels[i];
        const offset = (x + width * y) * 4;
        imageData[offset] = color;
        imageData[offset + 1] = color;
        imageData[offset + 2] = color;
        imageData[offset + 3] = 255;
      }
    }

    return imageData;
  }

  /**
   * Copy image data from 16 bit gray TGA file
   *
   * @param imageData Canvas data container
   * @param pixels TGA image data
   * @param _colorMap Color map data (unused)
   * @param width Image width
   * @param yStart Y-axis start position of pixel data to copy
   * @param yStep The number of pixels offset per iteration over the Y-axis
   * @param yEnd Y-axis end position of pixel data to copy
   * @param xStart X-axis start position of pixel data to copy
   * @param xStep The number of pixels offset per iteration over the X-axis
   * @param xEnd X-axis end position of pixel data to copy
   * @returns {Uint8ClampedArray} Image data copied from TGA file
   */
  private getImageDataGrey16bits(
    imageData: Uint8ClampedArray,
    pixels: Uint8ClampedArray,
    _colorMap: Uint8ClampedArray,
    width: number,
    yStart: number,
    yStep: number,
    yEnd: number,
    xStart: number,
    xStep: number,
    xEnd: number,
  ): Uint8ClampedArray {
    for (let i = 0, y = yStart; y !== yEnd; y += yStep) {
      for (let x = xStart; x !== xEnd; x += xStep, i += 2) {
        const offset = (x + width * y) * 4;
        imageData[offset] = pixels[i];
        imageData[offset + 1] = pixels[i];
        imageData[offset + 2] = pixels[i];
        imageData[offset + 3] = pixels[i + 1];
      }
    }

    return imageData;
  }

  /**
   * Open remote TGA file
   *
   * @example ```ts
   * const tga = new TgaLoader();
   * const src = new URL("https://raw.githubusercontent.com/jasonjgardner/targadactyl/main/test/test.tga");
   *
   * try {
   *  tga.load(
   *    await tga.fetch(src)
   *  );
   * } catch (err) {
   *  // Catch Fetch API errors or TgaLoaderError
   * }
   *
   * // TGA data has been initialized! 🍾
   * ```
   *
   * @param uri URL of TGA file
   * @throws {TgaLoaderError} Thrown if Deno does not have permission to access URL over network. Read permissions are required for file protocol URLs
   * @returns TGA data
   */
  async fetch(uri: URL): Promise<Uint8ClampedArray> {
    if (uri.protocol === "file:") {
      const readPermission = await Deno.permissions.query({
        name: "read",
        path: uri.pathname.substring(1),
      });
      if (readPermission.state !== "granted") {
        throw new TgaLoaderError(
          `Can not load file without read permission to path: "${uri.pathname}"`,
        );
      }
    } else {
      const netPermission = await Deno.permissions.query({
        name: "net",
        host: uri.host,
      });

      if (netPermission.state !== "granted") {
        throw new TgaLoaderError(
          `Can not fetch file without network access permission to host: "${uri.host}"`,
        );
      }
    }
    const res = await fetch(
      uri.href,
    );
    return new Uint8ClampedArray(await res.arrayBuffer());
  }

  /**
   * Open local TGA file. Requires read permissions.
   *
   * @example ```ts
   * const tga = new TgaLoader();
   * const src = "./test.tga";
   *
   * try {
   *  tga.load(
   *    await tga.open(src)
   *  );
   * } catch (err) {
   *  // Catch Deno read errors or TgaLoaderError
   * }
   *
   * // TGA data has been initialized! 🍾
   * ```
   * @param path Filesystem path to .tga file
   * @throws {TgaLoaderError} Thrown if Deno does not have read permission to the path specified
   * @returns TGA data
   */
  async open(path: string): Promise<Uint8ClampedArray> {
    const readPermission = await Deno.permissions.query({ name: "read", path });
    if (readPermission.state !== "granted") {
      throw new TgaLoaderError(
        `Can not load file without read permission to path: "${path}"`,
      );
    }
    return new Uint8ClampedArray(await Deno.readFile(path));
  }

  /**
   * Helper method for decoding the TGA file as an `Uint8Array`. Useful for serving the image.
   *
   * @example ```ts
   *  const tga = new TgaLoader();
   *  const contentType = "image/png";
   *  const res = new Response(
   *    tga.load(await tga.open("./test.tga")).decode(contentType),
   *    {
   *      status: 200,
   *      headers: {
   *       "Content-Type": contentType
   *      }
   *    }
   *  );
   *
   *  // Now serve it!
   * ```
   *
   * @param contentType Specify the MIME type to use in decoding and serving
   * @returns {Uint8Array} .tga data decoded in the specified MIME type
   */
  decode(contentType: "image/png" | "image/jpeg"): Uint8Array {
    return decode(this.getDataURL(contentType).split(",")[1]);
  }

  /**
   * Parse `Uint8ClampedArray` of TGA data
   *
   * @example ```ts
   * const tga = new TgaLoader();
   * const file = "./test.tga";
   * tga.load(
   *  await tga.open(file)
   * );
   *
   * // TGA data has been initialized! 🍾
   * ```
   *
   * @param {Uint8ClampedArray} data TGA data
   * @throws {TGALoaderError} Thrown if `data.length` is not long enough to contain TGA data
   * @returns {TgaLoader} Returns instance of self used for method chaining
   */
  load(data: Uint8ClampedArray): TgaLoader {
    let offset = 0;

    if (data.length < 0x12) {
      throw new TgaLoaderError("Not enough data to contain header");
    }

    const idLength = data[offset++];
    const colorMapType = data[offset++];
    const imageType = data[offset++];

    // Read TgaHeader
    const header = {
      /* 0x00  BYTE */ idLength,
      /* 0x01  BYTE */ colorMapType,
      /* 0x02  BYTE */ imageType,
      /* 0x03  WORD */ colorMapIndex: data[offset++] | (data[offset++] << 8),
      /* 0x05  WORD */ colorMapLength: data[offset++] | (data[offset++] << 8),
      /* 0x07  BYTE */ colorMapDepth: data[offset++],
      /* 0x08  WORD */ offsetX: data[offset++] | (data[offset++] << 8),
      /* 0x0a  WORD */ offsetY: data[offset++] | (data[offset++] << 8),
      /* 0x0c  WORD */ width: data[offset++] | (data[offset++] << 8),
      /* 0x0e  WORD */ height: data[offset++] | (data[offset++] << 8),
      /* 0x10  BYTE */ pixelDepth: <TgaHeader["pixelDepth"]> data[offset++],
      /* 0x11  BYTE */ flags: data[offset++],
      hasEncoding: imageType === TgaType.TYPE_RLE_INDEXED ||
        imageType === TgaType.TYPE_RLE_RGB ||
        imageType === TgaType.TYPE_RLE_GREY,
      hasColorMap: imageType === TgaType.TYPE_RLE_INDEXED ||
        imageType === TgaType.TYPE_INDEXED,
      isGreyColor: imageType === TgaType.TYPE_RLE_GREY ||
        imageType === TgaType.TYPE_GREY,
    };

    // Check if a valid TGA file (or if we can load it)
    this.header = header;

    // Move to data
    offset += header.idLength;
    if (offset >= data.length) {
      throw new TgaLoaderError("No TGA image data found.");
    }

    // Read palette
    if (header.hasColorMap) {
      const colorMapSize = header.colorMapLength * (header.colorMapDepth >> 3);
      this.palette = data.subarray(offset, offset + colorMapSize);
      offset += colorMapSize;
    }

    const pixelSize = header.pixelDepth >> 3;
    const imageSize = header.width * header.height;
    const pixelTotal = imageSize * pixelSize;

    const imageData = (header.hasEncoding)
      ? this.decodeRLE(data, offset, pixelSize, pixelTotal)
      : data.subarray(
        offset,
        offset + (header.hasColorMap ? imageSize : pixelTotal),
      );

    this.imageData = imageData;

    return this;
  }

  /**
   * Get `ImageData` interface for the TGA
   * @todo Use header offsets in determining origin. ([See TODO in tga-js source.](https://github.com/vthibault/tga.js/blob/4877572f33058053adb3a892684fb3f822885bd9/src/tga.js#L516))
   * @param imageData TGA pixel data interface
   * @throws {TgaLoaderReferenceError} Thrown when method has been called without loading data via the class's `load` method
   * @returns {Uint8ClampedArray} TGA byte data
   */
  private getImageData(imageData?: ImageData): Uint8ClampedArray {
    if (!this.header || !this.imageData) {
      throw new TgaLoaderReferenceError("Can not get image data.");
    }

    const { width, height, flags, pixelDepth, isGreyColor } = this.header;
    const origin = (flags & TgaOrigin.ORIGIN_MASK) >> TgaOrigin.ORIGIN_SHIFT;

    if (!imageData) {
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext("2d");
      imageData = ctx.createImageData(width, height);
    }

    let yStart = height - 1;
    let yStep = -1;
    let yEnd = -1;

    let xStart = width - 1;
    let xStep = -1;
    let xEnd = -1;

    if (
      origin === TgaOrigin.ORIGIN_TOP_LEFT ||
      origin === TgaOrigin.ORIGIN_TOP_RIGHT
    ) {
      yStart = 0;
      yStep = 1;
      yEnd = height;
    }

    if (
      origin === TgaOrigin.ORIGIN_TOP_LEFT ||
      origin === TgaOrigin.ORIGIN_BOTTOM_LEFT
    ) {
      xStart = 0;
      xStep = 1;
      xEnd = width;
    }

    const params = [
      imageData.data,
      this.imageData,
      <Uint8ClampedArray> this.palette,
      width,
      yStart,
      yStep,
      yEnd,
      xStart,
      xStep,
      xEnd,
    ] as const;

    if (pixelDepth === 8) {
      return isGreyColor
        ? this.getImageDataGrey8bits(...params)
        : this.getImageData8bits(...params);
    }

    if (pixelDepth === 16) {
      return isGreyColor
        ? this.getImageDataGrey16bits(...params)
        : this.getImageData16bits(...params);
    }

    return pixelDepth === 24
      ? this.getImageData24bits(...params)
      : this.getImageData32bits(...params);
  }

  /**
   * Returns a canvas containing the TGA image
   * @uses createCanvas https://doc.deno.land/https://deno.land/x/canvas@v1.4.1/mod.ts/~/createCanvas
   * @see https://doc.deno.land/https://deno.land/x/canvas@v1.4.1/mod.ts Module docs
   * @throws {TgaLoaderReferenceError} Thrown if image dimensions can not be found in TGA header data.
   * @returns {EmulatedCanvas2D} Canvas containing TGA data
   */
  getCanvas(): EmulatedCanvas2D {
    if (!this.header) {
      throw new TgaLoaderReferenceError(
        "Can not get canvas without width and height from TGA header.",
      );
    }

    const { width, height } = this.header;

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    const imageData = ctx.createImageData(width, height);
    const data = this.getImageData(imageData);

    ctx.putImageData(
      {
        data,
        width,
        height,
      },
      0,
      0,
      0,
      0,
      width,
      height,
    );

    return canvas;
  }

  /**
   * Gets TGA image as Base64-encoded data URL
   * @uses TgaLoader.getCanvas
   * @param type PNG or JPEG MIME type to use
   * @returns {string} Returns TGA image as base64-encoded data URI
   */
  getDataURL(type?: "image/png" | "image/jpeg"): string {
    return this.getCanvas().toDataURL(type ?? "image/png");
  }
}
