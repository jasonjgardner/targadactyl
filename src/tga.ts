import {
  createCanvas,
  decode,
  type EmulatedCanvas2D,
  type ExportFormat,
  ImageData,
} from "../deps.js";
import { TgaLoaderReferenceError } from "./errors.js";
import { TgaReader } from "./reader.js";

/**
 * Loads local or remote TGA files into a canvas rendering context.
 * Extends the browser-safe `TgaReader` with skia-canvas output (PNG/JPEG
 * export, data URLs) — this is the only module in the package that
 * statically depends on a canvas implementation, so import `TgaReader`
 * from `targadactyl/reader` instead when bundling for the browser.
 *
 * @see https://www.gamers.org/dEngine/quake3/TGA.txt TGA file specs
 * @see https://github.com/vthibault/tga.js Original source. JavaScript TGA loader
 * @uses createCanvas https://deno.land/x/canvas@v1.4.1/mod.ts?s=createCanvas
 */
export class TgaLoader extends TgaReader {
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
  decode(contentType: ExportFormat): Uint8Array {
    return decode(this.getDataURL(contentType).split(",")[1]);
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

    ctx.putImageData(
      new ImageData(this.getImageData(), width, height),
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
  getDataURL(type?: ExportFormat): string {
    return this.getCanvas().toDataURL(type ?? "png");
  }
}
