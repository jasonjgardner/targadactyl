export enum TgaType {
  TYPE_NO_DATA = 0,
  TYPE_INDEXED = 1,
  TYPE_RGB = 2,
  TYPE_GREY = 3,
  TYPE_RLE_INDEXED = 9,
  TYPE_RLE_RGB = 10,
  TYPE_RLE_GREY = 11,
}

export enum TgaOrigin {
  ORIGIN_BOTTOM_LEFT = 0x00,
  ORIGIN_BOTTOM_RIGHT = 0x01,
  ORIGIN_TOP_LEFT = 0x02,
  ORIGIN_TOP_RIGHT = 0x03,
  ORIGIN_SHIFT = 0x04,
  ORIGIN_MASK = 0x30,
}

export type PixelDepth = 8 | 16 | 24 | 32;

export type TgaHeader = {
  idLength: number;
  colorMapType: TgaType;
  imageType: TgaType;
  colorMapIndex: number;
  colorMapLength: number;
  colorMapDepth: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  pixelDepth: PixelDepth;
  flags: number;
  hasEncoding: boolean;
  hasColorMap: boolean;
  isGreyColor: boolean;
};

/**
 * Minimal structural shape of an RGBA image. Browser `ImageData`,
 * skia-canvas `ImageData`, and plain objects all satisfy it, so encoding
 * never requires a specific canvas implementation.
 */
export type TgaImageSource = {
  /** RGBA pixel bytes, 4 per pixel, rows ordered top-down */
  data: Uint8ClampedArray;
  /** Image width in pixels */
  width: number;
  /** Image height in pixels */
  height: number;
};

/**
 * Options controlling `TgaWriter` output.
 */
export type TgaWriterOptions = {
  /** Output pixel depth: 24 (BGR) or 32 (BGRA). Defaults to 32. */
  bitDepth?: 24 | 32;
  /** Run-length encode the pixel data (image type 10). Defaults to false. */
  rle?: boolean;
};
