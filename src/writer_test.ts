import { test } from "node:test";
import assert from "node:assert";
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
