import {
  assertNotEquals,
  assertObjectMatch,
} from "https://deno.land/std@0.156.0/testing/asserts.ts";
import { TgaLoader } from "../mod.ts";

/**
 * Demo .tga file path. (Relative to repo root, not to script source.)
 */
const TEST_FILE = "./test/test.tga";

Deno.test("Open and load a TGA file to inspect its header data.", async () => {
  const tga = new TgaLoader();
  tga.load(await tga.open(TEST_FILE));

  assertNotEquals(tga.imageData, undefined);

  const expectedHeader = {
    idLength: 0,
    colorMapType: 0,
    imageType: 10,
    colorMapIndex: 0,
    colorMapLength: 0,
    colorMapDepth: 0,
    offsetX: 0,
    offsetY: 0,
    width: 256,
    height: 256,
    pixelDepth: 24,
    flags: 0,
    hasEncoding: true,
    hasColorMap: false,
    isGreyColor: false,
  } as const;

  assertObjectMatch(tga.header, expectedHeader);
});
