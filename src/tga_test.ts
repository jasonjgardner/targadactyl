import { pathToFileURL } from "https://deno.land/std@0.156.0/node/url.ts";
import {
  assertNotEquals,
  assertObjectMatch,
} from "https://deno.land/std@0.156.0/testing/asserts.ts";
import { TgaLoader } from "../mod.ts";

/**
 * Demo .tga file path. (Relative to repo root, not to script source.)
 */
const TEST_FILE = "./test/test.tga";

const TEST_URL = pathToFileURL(TEST_FILE);

const expectedHeader = {
  idLength: 0,
  colorMapType: 0,
  imageType: 2,
  colorMapIndex: 0,
  colorMapLength: 0,
  colorMapDepth: 0,
  offsetX: 0,
  offsetY: 0,
  width: 256,
  height: 256,
  pixelDepth: 32,
  flags: 8,
  hasEncoding: false,
  hasColorMap: false,
  isGreyColor: false,
} as const;

Deno.test("Open and load a TGA file to inspect its header data.", async () => {
  const tga = new TgaLoader();
  tga.load(await tga.open(TEST_FILE));

  assertNotEquals(tga.imageData, undefined);

  assertObjectMatch(tga.header, expectedHeader);
});

Deno.test("Fetch and load a TGA file to inspect its header data", async () => {
  const tga = new TgaLoader();

  const res = await fetch(TEST_URL);
  const buffer = await res.arrayBuffer();

  tga.load(
    new Uint8ClampedArray(buffer),
  );

  assertNotEquals(tga.imageData, undefined);

  assertObjectMatch(tga.header, expectedHeader);
});
