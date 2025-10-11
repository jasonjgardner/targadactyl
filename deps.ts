import { Canvas } from "skia-canvas";

export { ImageData, ExportFormat } from "skia-canvas";
export { Canvas };
export const createCanvas: (width: number, height: number) => Canvas = (
  width: number,
  height: number
) => new Canvas(width, height);

export type EmulatedCanvas2D = ReturnType<typeof createCanvas>;

/**
 * Decode base64 string to Uint8Array
 * @param base64 Base64 encoded string
 * @returns Decoded data as Uint8Array
 */
export function decode(base64: string): Uint8Array {
  return Buffer.from(base64, "base64");
}
