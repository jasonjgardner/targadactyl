import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { TgaReader, TgaWriter } from "../mod.js";

test("TgaReader decodes bytes to RGBA without canvas", async () => {
  const reader = new TgaReader();
  reader.load(await reader.open("./test/test_24.tga"));

  const { data, width, height } = reader.getRGBA();

  assert.equal(width, 256);
  assert.equal(height, 256);
  assert.equal(data.length, 256 * 256 * 4);
});

test("TgaReader.fetch() loads file:// URLs via lazy node imports", async () => {
  const reader = new TgaReader();
  reader.load(await reader.fetch(pathToFileURL("./test/test_32.tga")));

  assert.equal(reader.header.pixelDepth, 32);
});

test("TgaWriter.fromLoader() accepts a plain TgaReader", async () => {
  const reader = new TgaReader();
  reader.load(await reader.open("./test/test_rle.tga"));

  const bytes = TgaWriter.fromLoader(reader).encode();
  const reloaded = new TgaReader().load(new Uint8ClampedArray(bytes));

  assert.deepEqual([...reloaded.getRGBA().data], [...reader.getRGBA().data]);
});

test("compiled browser-safe modules have no static Node or canvas imports", () => {
  for (const file of ["./dist/src/reader.js", "./dist/src/writer.js"]) {
    const staticImports =
      readFileSync(file, "utf8").match(/^import .* from "[^"]+";?\r?$/gm) ?? [];
    const banned = staticImports.filter((line) =>
      line.includes("node:") || line.includes("deps.js") ||
      line.includes("skia")
    );

    assert.deepEqual(
      banned,
      [],
      `${file} must not statically import Node builtins or canvas modules`,
    );
  }
});
