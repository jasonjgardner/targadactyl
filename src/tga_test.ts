import { pathToFileURL } from "node:url";
import { test } from "node:test";
import assert from "node:assert";
import { type TgaHeader, TgaType } from "./types.js";
import {
  TgaLoader,
  TgaLoaderError,
  TgaLoaderReferenceError,
} from "../mod.js";

const expects: Record<string, TgaHeader> = {
  "./test/test.tga": {
    idLength: 0,
    colorMapType: 0,
    imageType: TgaType.TYPE_RGB,
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
  },
  "./test/test_16.tga": {
    idLength: 0,
    colorMapType: 0,
    imageType: TgaType.TYPE_RGB,
    colorMapIndex: 0,
    colorMapLength: 0,
    colorMapDepth: 0,
    offsetX: 0,
    offsetY: 0,
    width: 256,
    height: 256,
    pixelDepth: 16,
    flags: 1,
    hasEncoding: false,
    hasColorMap: false,
    isGreyColor: false,
  },
  "./test/test_24.tga": {
    idLength: 0,
    colorMapType: 0,
    imageType: TgaType.TYPE_RGB,
    colorMapIndex: 0,
    colorMapLength: 0,
    colorMapDepth: 0,
    offsetX: 0,
    offsetY: 0,
    width: 256,
    height: 256,
    pixelDepth: 24,
    flags: 0,
    hasEncoding: false,
    hasColorMap: false,
    isGreyColor: false,
  },
  "./test/test_32.tga": {
    idLength: 0,
    colorMapType: 0,
    imageType: TgaType.TYPE_RGB,
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
  },
  "./test/test_rle.tga": {
    idLength: 0,
    colorMapType: 0,
    imageType: TgaType.TYPE_RLE_RGB,
    colorMapIndex: 0,
    colorMapLength: 0,
    colorMapDepth: 0,
    offsetX: 0,
    offsetY: 0,
    width: 256,
    height: 256,
    pixelDepth: 16,
    flags: 1,
    hasEncoding: true,
    hasColorMap: false,
    isGreyColor: false,
  },
};

test("Open and load a TGA file to inspect its header data.", async () => {
  for (const testFile in expects) {
    const tga = new TgaLoader();
    tga.load(await tga.open(testFile));

    assert.notEqual(tga.imageData, undefined, testFile);

    // Check that header matches expected values
    for (const [key, value] of Object.entries(expects[testFile])) {
      assert.equal(tga.header[key as keyof TgaHeader], value, 
        `${testFile}: ${key} should be ${value}`);
    }

    assert.match(tga.getDataURL(), /^data:image\/(png|jpeg);base64,.+/i);
  }
});

test("Fetch and load a TGA file to inspect its header data", async () => {
  for (const testFile in expects) {
    const tga = new TgaLoader();

    tga.load(
      await tga.fetch(pathToFileURL(testFile)),
    );

    assert.notEqual(tga.imageData, undefined, testFile);

    // Check that header matches expected values
    for (const [key, value] of Object.entries(expects[testFile])) {
      assert.equal(tga.header[key as keyof TgaHeader], value, 
        `${testFile}: ${key} should be ${value}`);
    }

    assert.match(tga.getDataURL(), /^data:image\/(png|jpeg);base64,.+/i);
  }
});

test("Throw error when file does not exist", async () => {
  await assert.rejects(
    async () => {
      const tga = new TgaLoader();
      await tga.open("./test/nonexistent.tga");
    },
    TgaLoaderError,
  );
});

test("getRGBA() returns decoded top-down RGBA pixels", async () => {
  const tga = new TgaLoader();
  tga.load(await tga.open("./test/test_24.tga"));

  const { data, width, height } = tga.getRGBA();

  assert.equal(width, 256);
  assert.equal(height, 256);
  assert.equal(data.length, 256 * 256 * 4);
  assert.ok(
    data.every((_value: number, i: number) => i % 4 !== 3 || data[i] === 255),
    "24-bit source must decode to fully opaque alpha",
  );
});

test("getRGBA() throws before load()", () => {
  assert.throws(() => new TgaLoader().getRGBA(), TgaLoaderReferenceError);
});
