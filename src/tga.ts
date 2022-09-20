import { type TgaHeader, TgaOrigin, TgaType } from "./types.ts";
import { createCanvas, type ImageData } from "../deps.ts";

export class TgaLoaderError extends Error {
  constructor(msg: string) {
    super(`Failed loading TGA: "${msg}"`);
  }
}

export class TgaLoaderReferenceError extends ReferenceError {
  constructor(msg: string) {
    super(`TGA file data has not been initialized. ${msg}`.trim());
  }
}

export class TgaLoader {
  imageData?: Uint8ClampedArray;

  palette?: Uint8ClampedArray;

  _header?: TgaHeader;

  /**
   * Check the header of TGA file to detect errors
   *
   * @throws TgaLoaderError
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

  get header() {
    if (!this._header) {
      throw new TgaLoaderReferenceError("Can not get TGA header data.");
    }

    return this._header;
  }

  /**
   * Decode RLE compression
   */
  static decodeRLE(
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
   * Return a ImageData object from a TGA file (8bits)
   */
  static getImageData8bits(
    imageData: Uint8ClampedArray,
    indexes: Uint8ClampedArray,
    colorMap: Uint8ClampedArray,
    width: number,
    y_start: number,
    y_step: number,
    y_end: number,
    x_start: number,
    x_step: number,
    x_end: number,
  ): Uint8ClampedArray {
    for (let i = 0, y = y_start; y !== y_end; y += y_step) {
      for (let x = x_start; x !== x_end; x += x_step, i++) {
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
   * Return a ImageData object from a TGA file (16bits)
   */
  static getImageData16bits(
    imageData: Uint8ClampedArray,
    pixels: Uint8ClampedArray,
    _colorMap: Uint8ClampedArray,
    width: number,
    y_start: number,
    y_step: number,
    y_end: number,
    x_start: number,
    x_step: number,
    x_end: number,
  ): Uint8ClampedArray {
    for (let i = 0, y = y_start; y !== y_end; y += y_step) {
      for (let x = x_start; x !== x_end; x += x_step, i += 2) {
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
   * Return a ImageData object from a TGA file (24bits)
   */
  static getImageData24bits(
    imageData: Uint8ClampedArray,
    pixels: Uint8ClampedArray,
    _colorMap: Uint8ClampedArray,
    width: number,
    y_start: number,
    y_step: number,
    y_end: number,
    x_start: number,
    x_step: number,
    x_end: number,
  ): Uint8ClampedArray {
    for (let i = 0, y = y_start; y !== y_end; y += y_step) {
      for (let x = x_start; x !== x_end; x += x_step, i += 3) {
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
   * Return a ImageData object from a TGA file (32bits)
   */
  static getImageData32bits(
    imageData: Uint8ClampedArray,
    pixels: Uint8ClampedArray,
    _colorMap: Uint8ClampedArray,
    width: number,
    y_start: number,
    y_step: number,
    y_end: number,
    x_start: number,
    x_step: number,
    x_end: number,
  ): Uint8ClampedArray {
    for (let i = 0, y = y_start; y !== y_end; y += y_step) {
      for (let x = x_start; x !== x_end; x += x_step, i += 4) {
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
   * Return a ImageData object from a TGA file (8bits grey)
   */
  static getImageDataGrey8bits(
    imageData: Uint8ClampedArray,
    pixels: Uint8ClampedArray,
    _colorMap: Uint8ClampedArray,
    width: number,
    y_start: number,
    y_step: number,
    y_end: number,
    x_start: number,
    x_step: number,
    x_end: number,
  ): Uint8ClampedArray {
    for (let i = 0, y = y_start; y !== y_end; y += y_step) {
      for (let x = x_start; x !== x_end; x += x_step, i++) {
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
   * Return a ImageData object from a TGA file (16bits grey)
   */
  static getImageDataGrey16bits(
    imageData: Uint8ClampedArray,
    pixels: Uint8ClampedArray,
    _colorMap: Uint8ClampedArray,
    width: number,
    y_start: number,
    y_step: number,
    y_end: number,
    x_start: number,
    x_step: number,
    x_end: number,
  ): Uint8ClampedArray {
    for (let i = 0, y = y_start; y !== y_end; y += y_step) {
      for (let x = x_start; x !== x_end; x += x_step, i += 2) {
        const offset = (x + width * y) * 4;
        imageData[offset] = pixels[i];
        imageData[offset + 1] = pixels[i];
        imageData[offset + 2] = pixels[i];
        imageData[offset + 3] = pixels[i + 1];
      }
    }

    return imageData;
  }

  async open(path: string) {
    return new Uint8ClampedArray(await Deno.readFile(path));
  }

  /**
   * Load and parse a TGA file
   */
  load(data: Uint8ClampedArray) {
    let offset = 0;

    // Not enough data to contain header ?
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
      ? TgaLoader.decodeRLE(data, offset, pixelSize, pixelTotal)
      : data.subarray(
        offset,
        offset + (header.hasColorMap ? imageSize : pixelTotal),
      );

    this.imageData = imageData;
  }

  /**
   * Return an ImageData object from a TGA file
   */
  getImageData(imageData?: ImageData): Uint8ClampedArray {
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

    let y_start = height - 1;
    let y_step = -1;
    let y_end = -1;

    let x_start = width - 1;
    let x_step = -1;
    let x_end = -1;

    if (
      origin === TgaOrigin.ORIGIN_TOP_LEFT ||
      origin === TgaOrigin.ORIGIN_TOP_RIGHT
    ) {
      y_start = 0;
      y_step = 1;
      y_end = height;
    }

    if (
      origin === TgaOrigin.ORIGIN_TOP_LEFT ||
      origin === TgaOrigin.ORIGIN_BOTTOM_LEFT
    ) {
      x_start = 0;
      x_step = 1;
      x_end = width;
    }

    // TODO: use this.header.offsetX and this.header.offsetY ?

    const params = [
      imageData.data,
      this.imageData,
      <Uint8ClampedArray> this.palette,
      width,
      y_start,
      y_step,
      y_end,
      x_start,
      x_step,
      x_end,
    ] as const;

    if (pixelDepth === 8) {
      return isGreyColor
        ? TgaLoader.getImageDataGrey8bits(...params)
        : TgaLoader.getImageData8bits(...params);
    }

    if (pixelDepth === 16) {
      return isGreyColor
        ? TgaLoader.getImageDataGrey16bits(...params)
        : TgaLoader.getImageData16bits(...params);
    }

    return pixelDepth === 24
      ? TgaLoader.getImageData24bits(...params)
      : TgaLoader.getImageData32bits(...params);
  }

  /**
   * Return a canvas with the TGA render on it
   */
  getCanvas() {
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
   * Return a dataURI of the TGA file (default: image/png)
   */
  getDataURL(type?: "image/png" | "image/jpeg"): string {
    return this.getCanvas().toDataURL(type ?? "image/png");
  }
}
