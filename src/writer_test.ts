import { test } from "node:test";
import assert from "node:assert";
import { unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TgaLoader, TgaWriter, TgaWriterError } from "../mod.js";

/**
 * 2x2 fully opaque RGBA fixture: red, green / blue, white.
 * Full opacity keeps 24-bit round-trips byte-identical (decoder restores
 * alpha as 255).
 */
const pixels2x2 = new Uint8ClampedArray([
  255, 0, 0, 255,
  0, 255, 0, 255,
  0, 0, 255, 255,
  255, 255, 255, 255,
]);

test("encode() writes a correct 18-byte header", () => {
  const cases = [
    { options: { bitDepth: 32 }, imageType: 2, pixelDepth: 32, flags: 0x28 },
    { options: { bitDepth: 24 }, imageType: 2, pixelDepth: 24, flags: 0x20 },
  ] as const;

  for (const { options, imageType, pixelDepth, flags } of cases) {
    const bytes = new TgaWriter(
      { data: pixels2x2, width: 2, height: 2 },
      options,
    ).encode();

    const expectedHeader = [
      0, 0, imageType,
      0, 0, 0, 0, 0,
      0, 0, 0, 0,
      2, 0, 2, 0,
      pixelDepth, flags,
    ];

    assert.deepEqual(
      [...bytes.subarray(0, 18)],
      expectedHeader,
      JSON.stringify(options),
    );
  }
});

test("uncompressed pixel data is BGR(A), top-down", () => {
  const bytes32 = new TgaWriter(
    { data: pixels2x2, width: 2, height: 2 },
  ).encode();

  // red pixel RGBA(255,0,0,255) -> file BGRA(0,0,255,255)
  assert.deepEqual([...bytes32.subarray(18, 22)], [0, 0, 255, 255]);
  assert.equal(bytes32.length, 18 + 2 * 2 * 4);

  const bytes24 = new TgaWriter(
    { data: pixels2x2, width: 2, height: 2 },
    { bitDepth: 24 },
  ).encode();

  assert.deepEqual([...bytes24.subarray(18, 21)], [0, 0, 255]);
  assert.equal(bytes24.length, 18 + 2 * 2 * 3);
});

test("decoder round-trips uncompressed output", () => {
  const combos = [{ bitDepth: 32 }, { bitDepth: 24 }] as const;

  for (const options of combos) {
    const bytes = new TgaWriter(
      { data: pixels2x2, width: 2, height: 2 },
      options,
    ).encode();

    const tga = new TgaLoader().load(new Uint8ClampedArray(bytes));
    const { data, width, height } = tga.getRGBA();

    assert.equal(width, 2, JSON.stringify(options));
    assert.equal(height, 2, JSON.stringify(options));
    assert.deepEqual([...data], [...pixels2x2], JSON.stringify(options));
  }
});

test("constructor rejects invalid input", () => {
  const data = pixels2x2;

  assert.throws(
    () => new TgaWriter({ data, width: 0, height: 2 }),
    TgaWriterError,
    "zero width",
  );
  assert.throws(
    () => new TgaWriter({ data, width: 2, height: -2 }),
    TgaWriterError,
    "negative height",
  );
  assert.throws(
    () => new TgaWriter({ data, width: 2, height: 1.5 }),
    TgaWriterError,
    "non-integer height",
  );
  assert.throws(
    () => new TgaWriter({ data, width: 3, height: 2 }),
    TgaWriterError,
    "data length mismatch",
  );
  assert.throws(
    () =>
      new TgaWriter(
        { data, width: 2, height: 2 },
        { bitDepth: 16 as unknown as 24 },
      ),
    TgaWriterError,
    "invalid bit depth",
  );
});

test("RLE header sets image type 10", () => {
  const bytes = new TgaWriter(
    { data: pixels2x2, width: 2, height: 2 },
    { rle: true },
  ).encode();

  assert.equal(bytes[0x02], 10);
  assert.equal(bytes[0x10], 32);
  assert.equal(bytes[0x11], 0x28);
});

test("decoder round-trips RLE output", () => {
  const combos = [
    { bitDepth: 32, rle: true },
    { bitDepth: 24, rle: true },
  ] as const;

  for (const options of combos) {
    const bytes = new TgaWriter(
      { data: pixels2x2, width: 2, height: 2 },
      options,
    ).encode();

    const tga = new TgaLoader().load(new Uint8ClampedArray(bytes));

    assert.deepEqual(
      [...tga.getRGBA().data],
      [...pixels2x2],
      JSON.stringify(options),
    );
  }
});

test("RLE packets cap at 128 pixels and never cross scanlines", () => {
  const width = 200;
  const height = 3;
  const solid = new Uint8ClampedArray(width * height * 4);

  for (let i = 0; i < solid.length; i += 4) {
    solid[i] = 12;
    solid[i + 1] = 34;
    solid[i + 2] = 56;
    solid[i + 3] = 255;
  }

  const image = { data: solid, width, height };
  const raw = new TgaWriter(image).encode();
  const rle = new TgaWriter(image, { rle: true }).encode();

  assert.ok(rle.length < raw.length, "RLE must shrink a solid image");

  // Each 200px scanline = one 128px run packet + one 72px run packet,
  // 5 bytes each (header + BGRA pixel); 3 rows. Packets crossing scanline
  // boundaries would produce 5 packets total (25 bytes), not 6 (30 bytes).
  const body = rle.subarray(18);
  assert.equal(body.length, 3 * 2 * (1 + 4));
  assert.equal(body[0], 0x80 | 127);
  assert.deepEqual([...body.subarray(1, 5)], [56, 34, 12, 255]);
  assert.equal(body[5 * 1], 0x80 | 71);

  const decoded = new TgaLoader().load(new Uint8ClampedArray(rle));
  assert.deepEqual([...decoded.getRGBA().data], [...solid]);
});

test("RLE emits raw packets for non-repeating pixels", () => {
  // 4 distinct pixels in one row: expect a single raw packet
  // header (count-1 = 3) followed by 4 BGRA pixels = 17 bytes.
  const distinct = new Uint8ClampedArray([
    1, 0, 0, 255,
    2, 0, 0, 255,
    3, 0, 0, 255,
    4, 0, 0, 255,
  ]);

  const bytes = new TgaWriter(
    { data: distinct, width: 4, height: 1 },
    { rle: true },
  ).encode();

  const body = bytes.subarray(18);
  assert.equal(body.length, 1 + 4 * 4);
  assert.equal(body[0], 3);

  const decoded = new TgaLoader().load(new Uint8ClampedArray(bytes));
  assert.deepEqual([...decoded.getRGBA().data], [...distinct]);
});

test("save() writes a file that reloads from disk", async () => {
  const path = join(tmpdir(), `targadactyl-writer-${process.pid}.tga`);
  const writer = new TgaWriter({ data: pixels2x2, width: 2, height: 2 });

  try {
    await writer.save(path);

    const tga = new TgaLoader();
    tga.load(await tga.open(path));

    assert.deepEqual([...tga.getRGBA().data], [...pixels2x2]);
  } finally {
    await unlink(path);
  }
});

test("save() wraps filesystem errors in TgaWriterError", async () => {
  const writer = new TgaWriter({ data: pixels2x2, width: 2, height: 2 });

  await assert.rejects(
    () => writer.save("./no-such-dir/out.tga"),
    TgaWriterError,
  );
});

test("fromLoader() round-trips every fixture", async () => {
  const fixtures = [
    "./test/test.tga",
    "./test/test_16.tga",
    "./test/test_24.tga",
    "./test/test_32.tga",
    "./test/test_rle.tga",
  ];

  for (const file of fixtures) {
    const original = new TgaLoader();
    original.load(await original.open(file));
    const source = original.getRGBA();

    const bytes = TgaWriter.fromLoader(original).encode();
    const reloaded = new TgaLoader().load(new Uint8ClampedArray(bytes));

    assert.deepEqual([...reloaded.getRGBA().data], [...source.data], file);
  }
});
