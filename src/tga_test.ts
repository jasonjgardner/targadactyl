import { pathToFileURL } from "https://deno.land/std@0.156.0/node/url.ts";
import {
  assertMatch,
  assertNotEquals,
  assertObjectMatch,
  assertRejects,
} from "https://deno.land/std@0.156.0/testing/asserts.ts";
import { type TgaHeader, TgaType } from "./types.ts";
import { TgaLoader, TgaLoaderError } from "../mod.ts";

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

Deno.test("Open and load a TGA file to inspect its header data.", {
  permissions: { read: true },
}, async () => {
  for (const testFile in expects) {
    const tga = new TgaLoader();
    tga.load(await tga.open(testFile));

    assertNotEquals(tga.imageData, undefined, testFile);

    assertObjectMatch(tga.header, expects[testFile]);

    assertMatch(tga.getDataURL(), /^data:image\/(png|jpeg);base64,.+/gi);
  }
});

Deno.test("Fetch and load a TGA file to inspect its header data", {
  permissions: { read: true, net: true },
}, async () => {
  for (const testFile in expects) {
    const tga = new TgaLoader();

    tga.load(
      await tga.fetch(pathToFileURL(testFile)),
    );

    assertNotEquals(tga.imageData, undefined, testFile);

    assertObjectMatch(tga.header, expects[testFile]);

    assertMatch(tga.getDataURL(), /^data:image\/(png|jpeg);base64,.+/gi);
  }
});

const src = pathToFileURL(Object.keys(expects)[0]);

Deno.test("Throw error when lacking Deno permissions", {
  permissions: {
    read: false,
    net: false,
  },
}, () => {
  assertRejects(
    async () => {
      const tga = new TgaLoader();

      tga.load(
        await tga.fetch(src),
      );
    },
    TgaLoaderError,
  );
});
