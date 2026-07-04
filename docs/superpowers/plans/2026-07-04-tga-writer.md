# TGA Writer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add TGA encoding (`TgaWriter` class) to targadactyl so RGBA pixel data and loaded TGAs can be written back out as 24/32-bit, optionally RLE-compressed, TGA files.

**Architecture:** A new `src/writer.ts` holds a `TgaWriter` class whose internals are pure module-level helpers (header builder, RGBA→BGR converter, per-scanline RLE encoder). A small refactor makes `TgaLoader` expose decoded RGBA via `getRGBA()` without allocating through skia-canvas, which `TgaWriter.fromLoader()` consumes.

**Tech Stack:** TypeScript (strict, ESM), Node.js `node:test` + `node:assert`, `node:fs/promises`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-04-tga-writer-design.md`

## Global Constraints

- All relative imports in `src/` and `mod.ts` use `.js` extensions (compiled ESM runs directly under Node).
- Tests execute against **compiled** output: always `npm run build` before `node --test dist/src/<file>.js`. A TypeScript compile error is a valid RED state for TDD.
- Code style: no `else` / `else if` / `switch`; early returns; coalesce same-value guards with `||`/`&&`; TSDoc on every exported symbol; follow existing file conventions (the codebase uses `for`/`while` loops for byte-level work — matching that is correct here).
- Version bump lands in **both** `package.json` and `jsr.json` (2.1.0).
- Header constants (from spec): top-left origin always → flags `0x20` (24-bit) / `0x28` (32-bit, includes 8 attribute bits); image type 2 uncompressed, 10 RLE; little-endian width/height words; 18-byte header, no ID/color-map/footer.
- RLE (from spec): packets never cross scanline boundaries; run packets (`0x80 | count-1` + 1 pixel) for runs ≥ 2; raw packets (`count-1` + count pixels) otherwise; both capped at 128 pixels.
- Working state: `git status` currently shows a pre-existing unstaged `package.json` change (author field). Leave it out of commits unless a task explicitly modifies `package.json`, in which case commit only the lines the task changed... it is acceptable to include the whole file if unavoidable with `git add package.json`.

---

### Task 1: `TgaLoader.getRGBA()` + canvas-free pixel allocation

**Files:**
- Modify: `src/types.ts` (append types)
- Modify: `src/tga.ts:596-664` (private `getImageData`), `src/tga.ts:673-699` (`getCanvas`)
- Modify: `mod.ts` (re-export types)
- Test: `src/tga_test.ts` (append tests)

**Interfaces:**
- Consumes: existing `TgaLoader` internals (`this.header`, `this.imageData`, private pixel converters).
- Produces: `type TgaImageSource = { data: Uint8ClampedArray; width: number; height: number }` (exported from `src/types.ts` and `mod.ts`); public method `TgaLoader.getRGBA(): TgaImageSource` returning decoded top-down RGBA; private `getImageData()` signature becomes zero-argument.

- [ ] **Step 1: Write the failing tests**

Append to `src/tga_test.ts` (note: this file imports `TgaLoader, TgaLoaderError` from `../mod.js` — extend that import to include `TgaLoaderReferenceError`):

```typescript
test("getRGBA() returns decoded top-down RGBA pixels", async () => {
  const tga = new TgaLoader();
  tga.load(await tga.open("./test/test_24.tga"));

  const { data, width, height } = tga.getRGBA();

  assert.equal(width, 256);
  assert.equal(height, 256);
  assert.equal(data.length, 256 * 256 * 4);
  assert.ok(
    data.every((value, i) => i % 4 !== 3 || value === 255),
    "24-bit source must decode to fully opaque alpha",
  );
});

test("getRGBA() throws before load()", () => {
  assert.throws(() => new TgaLoader().getRGBA(), TgaLoaderReferenceError);
});
```

Change the existing import line at the top of `src/tga_test.ts` from:

```typescript
import { TgaLoader, TgaLoaderError } from "../mod.js";
```

to:

```typescript
import {
  TgaLoader,
  TgaLoaderError,
  TgaLoaderReferenceError,
} from "../mod.js";
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run build`
Expected: FAIL — `tsc` error `TS2339: Property 'getRGBA' does not exist on type 'TgaLoader'` (compile error is the RED state; the test runner never starts).

- [ ] **Step 3: Implement types, refactor, and `getRGBA()`**

Append to `src/types.ts`:

```typescript
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
```

(`TgaWriterOptions` is included here so `src/types.ts` is touched once; Task 2 consumes it.)

In `src/tga.ts`:

1. Extend the type import on line 1:

```typescript
import {
  type TgaHeader,
  type TgaImageSource,
  TgaOrigin,
  TgaType,
} from "./types.js";
```

2. Replace the private `getImageData(imageData?: ImageData)` method's signature and canvas allocation. The method currently begins:

```typescript
  private getImageData(imageData?: ImageData): Uint8ClampedArray {
    if (!this.header || !this.imageData) {
      throw new TgaLoaderReferenceError("Can not get image data.");
    }

    const { width, height, flags, pixelDepth, isGreyColor } = this.header;
    const origin = (flags & TgaOrigin.ORIGIN_MASK) >> TgaOrigin.ORIGIN_SHIFT;

    if (!imageData) {
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext("2d");
      imageData = ctx.createImageData(width, height);
    }
```

Replace that opening with:

```typescript
  private getImageData(): Uint8ClampedArray {
    if (!this.header || !this.imageData) {
      throw new TgaLoaderReferenceError("Can not get image data.");
    }

    const { width, height, flags, pixelDepth, isGreyColor } = this.header;
    const origin = (flags & TgaOrigin.ORIGIN_MASK) >> TgaOrigin.ORIGIN_SHIFT;

    const data = new Uint8ClampedArray(width * height * 4);
```

and change the first element of the `params` tuple from `imageData.data` to `data`:

```typescript
    const params = [
      data,
      this.imageData,
      <Uint8ClampedArray> this.palette,
      width,
      yStart,
      yStep,
      yEnd,
      xStart,
      xStep,
      xEnd,
    ] as const;
```

The rest of the method (dispatch to `getImageData8bits` etc.) is unchanged. Also update the method's TSDoc `@param` line — it no longer takes a parameter.

3. In `getCanvas()`, replace:

```typescript
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    const imageData = ctx.createImageData(width, height);
    const data = this.getImageData(imageData);

    ctx.putImageData(
      new ImageData(data, width, height),
```

with:

```typescript
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    ctx.putImageData(
      new ImageData(this.getImageData(), width, height),
```

(the trailing `0, 0, 0, 0, width, height)` arguments stay as-is).

4. Add the public accessor directly above `getCanvas()`:

```typescript
  /**
   * Get the decoded image as top-down RGBA pixels, independent of any
   * canvas implementation. This is the bridge into `TgaWriter.fromLoader`.
   *
   * @throws {TgaLoaderReferenceError} Thrown when called before `load`
   * @returns {TgaImageSource} Decoded RGBA pixel data with dimensions
   */
  getRGBA(): TgaImageSource {
    const { width, height } = this.header;

    return { data: this.getImageData(), width, height };
  }
```

In `mod.ts`, append:

```typescript
export * from "./src/types.js";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — all existing loader tests (including `getDataURL` assertions, which exercise the refactored `getCanvas`) plus the two new `getRGBA` tests.

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/tga.ts src/tga_test.ts mod.ts
git commit -m "feat: Add TgaLoader.getRGBA and drop canvas allocation from decode path"
```

---

### Task 2: `TgaWriter` core — validation, header, uncompressed encode

**Files:**
- Modify: `src/errors.ts` (append `TgaWriterError`)
- Create: `src/writer.ts`
- Modify: `mod.ts` (re-export writer)
- Modify: `package.json:18` (test script runs both test files)
- Test: Create `src/writer_test.ts`

**Interfaces:**
- Consumes: `TgaImageSource`, `TgaWriterOptions`, `TgaType`, `TgaOrigin` from `./types.js` (Task 1); `TgaLoader.getRGBA()` (Task 1, used in round-trip tests via `../mod.js`).
- Produces: `class TgaWriter { constructor(image: TgaImageSource, options?: TgaWriterOptions); encode(): Uint8Array }` and `class TgaWriterError extends Error`, both exported from `mod.ts`. Module-level helpers in `src/writer.ts` that Task 3 extends: `toBGR(rgba: Uint8ClampedArray, pixelSize: 3 | 4): Uint8ClampedArray`, `buildHeader(width: number, height: number, options: Required<TgaWriterOptions>): Uint8Array`.

- [ ] **Step 1: Write the failing tests**

Create `src/writer_test.ts`:

```typescript
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
```

Update the `test` script in `package.json` from:

```json
    "test": "npm run build && node --test dist/src/tga_test.js",
```

to:

```json
    "test": "npm run build && node --test dist/src/tga_test.js dist/src/writer_test.js",
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run build`
Expected: FAIL — `tsc` error `TS2305: Module '"../mod.js"' has no exported member 'TgaWriter'` (and the same for `TgaWriterError`).

- [ ] **Step 3: Write the implementation**

Append to `src/errors.ts`:

```typescript
/**
 * General error thrown by TgaWriter class for invalid input or failed
 * file writes.
 */
export class TgaWriterError extends Error {
  /**
   * Construct an error message with details
   * @param msg Error details
   */
  constructor(msg: string) {
    super(`Failed writing TGA: "${msg}"`);
  }
}
```

Create `src/writer.ts`:

```typescript
import {
  type TgaImageSource,
  type TgaWriterOptions,
  TgaOrigin,
  TgaType,
} from "./types.js";
import { TgaWriterError } from "./errors.js";

/**
 * Byte length of a v1.0 TGA header (no ID field, color map, or footer).
 */
const TGA_HEADER_SIZE = 0x12;

/**
 * Writer options with defaults applied.
 */
type ResolvedWriterOptions = Required<TgaWriterOptions>;

/**
 * Build the 18-byte TGA v1.0 header. Origin is always top-left, so pixel
 * rows are written top-down and never flipped.
 *
 * @param width Image width in pixels (written as a little-endian word)
 * @param height Image height in pixels (written as a little-endian word)
 * @param options Resolved encoding options
 * @returns {Uint8Array} Complete 18-byte header
 */
const buildHeader = (
  width: number,
  height: number,
  options: ResolvedWriterOptions,
): Uint8Array => {
  const header = new Uint8Array(TGA_HEADER_SIZE);

  header[0x02] = options.rle ? TgaType.TYPE_RLE_RGB : TgaType.TYPE_RGB;
  header[0x0c] = width & 0xff;
  header[0x0d] = (width >> 8) & 0xff;
  header[0x0e] = height & 0xff;
  header[0x0f] = (height >> 8) & 0xff;
  header[0x10] = options.bitDepth;
  header[0x11] = (TgaOrigin.ORIGIN_TOP_LEFT << TgaOrigin.ORIGIN_SHIFT) |
    (options.bitDepth === 32 ? 8 : 0);

  return header;
};

/**
 * Convert top-down RGBA pixels to TGA file order: BGR for 24-bit output
 * (alpha dropped) or BGRA for 32-bit. Exact inverse of the channel swap
 * the decoder performs in `getImageData24bits`/`getImageData32bits`.
 *
 * @param rgba RGBA source pixels, 4 bytes per pixel
 * @param pixelSize Output bytes per pixel: 3 (BGR) or 4 (BGRA)
 * @returns {Uint8ClampedArray} Pixel data in TGA file order
 */
const toBGR = (
  rgba: Uint8ClampedArray,
  pixelSize: 3 | 4,
): Uint8ClampedArray => {
  const pixelCount = rgba.length / 4;
  const output = new Uint8ClampedArray(pixelCount * pixelSize);

  for (let i = 0; i < pixelCount; i++) {
    const src = i * 4;
    const dst = i * pixelSize;

    output[dst] = rgba[src + 2];
    output[dst + 1] = rgba[src + 1];
    output[dst + 2] = rgba[src];

    if (pixelSize === 4) {
      output[dst + 3] = rgba[src + 3];
    }
  }

  return output;
};

/**
 * Encodes RGBA pixel data as a TGA (Targa) file. Counterpart to
 * `TgaLoader`: output from `encode()` round-trips through
 * `TgaLoader.load()` byte-for-byte (alpha restored to 255 for 24-bit).
 *
 * @example ```ts
 * const writer = new TgaWriter(ctx.getImageData(0, 0, w, h), {
 *   bitDepth: 24,
 * });
 * const bytes = writer.encode();
 * ```
 * @see https://www.gamers.org/dEngine/quake3/TGA.txt TGA file specs
 */
export class TgaWriter {
  /**
   * Validated RGBA source image
   */
  private readonly image: TgaImageSource;

  /**
   * Encoding options with defaults applied
   */
  private readonly options: ResolvedWriterOptions;

  /**
   * Validate the source image and store the encoding configuration.
   *
   * @param image RGBA pixels with dimensions; any `ImageData` satisfies it
   * @param options Optional bit depth (default 32) and RLE flag (default false)
   * @throws {TgaWriterError} Thrown for non-positive/non-integer dimensions,
   * a data length not equal to `width * height * 4`, or a bit depth other
   * than 24/32
   */
  constructor(image: TgaImageSource, options: TgaWriterOptions = {}) {
    const { data, width, height } = image;
    const bitDepth = options.bitDepth ?? 32;
    const rle = options.rle ?? false;

    if (
      !Number.isInteger(width) || !Number.isInteger(height) ||
      width <= 0 || height <= 0
    ) {
      throw new TgaWriterError(`Invalid image dimensions: ${width}x${height}`);
    }

    if (data.length !== width * height * 4) {
      throw new TgaWriterError(
        `Pixel data length ${data.length} does not match ${width}x${height} RGBA (expected ${
          width * height * 4
        }).`,
      );
    }

    if (bitDepth !== 24 && bitDepth !== 32) {
      throw new TgaWriterError(`Invalid bit depth "${bitDepth}". Use 24 or 32.`);
    }

    this.image = image;
    this.options = { bitDepth, rle };
  }

  /**
   * Encode the image as complete TGA file bytes: 18-byte header followed
   * by pixel data.
   *
   * @returns {Uint8Array} TGA file contents, ready to write or serve
   */
  encode(): Uint8Array {
    const { data, width, height } = this.image;
    const pixelSize = this.options.bitDepth === 32 ? 4 : 3;

    const header = buildHeader(width, height, this.options);
    const body = toBGR(data, pixelSize);

    const output = new Uint8Array(header.length + body.length);
    output.set(header, 0);
    output.set(body, header.length);

    return output;
  }
}
```

Append to `mod.ts`:

```typescript
export * from "./src/writer.js";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — 4 new writer tests plus all loader tests.

- [ ] **Step 5: Commit**

```bash
git add src/errors.ts src/writer.ts src/writer_test.ts mod.ts package.json
git commit -m "feat: Add TgaWriter with 24/32-bit uncompressed TGA encoding"
```

---

### Task 3: RLE compression

**Files:**
- Modify: `src/writer.ts` (add RLE helpers, wire into `encode()`)
- Test: `src/writer_test.ts` (append tests)

**Interfaces:**
- Consumes: `toBGR`, `buildHeader`, `TgaWriter.encode()` from Task 2; `pixels2x2` fixture defined at the top of `src/writer_test.ts`.
- Produces: `encode()` honors `rle: true` (image type 10 header + per-scanline RLE body). New module-level helper `encodeRLE(pixels: Uint8ClampedArray, width: number, height: number, pixelSize: number): Uint8Array`.

- [ ] **Step 1: Write the failing tests**

Append to `src/writer_test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run build && node --test dist/src/writer_test.js`
Expected: FAIL — "RLE header sets image type 10" passes (Task 2's `buildHeader` already honors `rle`), but the three body tests fail: `encode()` currently writes uncompressed bytes regardless of `rle`, so body lengths/packet bytes mismatch (e.g. `body.length` is 2400, not 30).

- [ ] **Step 3: Implement RLE encoding**

In `src/writer.ts`, add below `TGA_HEADER_SIZE`:

```typescript
/**
 * Maximum pixels a single RLE packet (run or raw) can carry.
 */
const RLE_MAX_PACKET = 128;
```

Add these helpers below `toBGR`:

```typescript
/**
 * Compare two pixels within TGA-ordered pixel data.
 *
 * @param data Pixel bytes in file order
 * @param a Byte offset of the first pixel
 * @param b Byte offset of the second pixel
 * @param pixelSize Bytes per pixel
 * @returns {boolean} True when every byte of both pixels matches
 */
const pixelsEqual = (
  data: Uint8ClampedArray,
  a: number,
  b: number,
  pixelSize: number,
): boolean => {
  for (let i = 0; i < pixelSize; i++) {
    if (data[a + i] !== data[b + i]) {
      return false;
    }
  }

  return true;
};

/**
 * Measure how many consecutive identical pixels start at `offset`,
 * bounded by the end of the scanline and the 128-pixel packet cap.
 *
 * @param data Pixel bytes in file order
 * @param offset Byte offset of the first pixel of the candidate run
 * @param rowEnd Exclusive byte offset where the scanline ends
 * @param pixelSize Bytes per pixel
 * @returns {number} Run length in pixels (at least 1)
 */
const runLength = (
  data: Uint8ClampedArray,
  offset: number,
  rowEnd: number,
  pixelSize: number,
): number => {
  let run = 1;

  while (
    run < RLE_MAX_PACKET &&
    offset + run * pixelSize < rowEnd &&
    pixelsEqual(data, offset, offset + run * pixelSize, pixelSize)
  ) {
    run++;
  }

  return run;
};

/**
 * Run-length encode TGA-ordered pixel data one scanline at a time.
 * Packets never cross scanline boundaries (spec recommendation; some
 * readers require it). Runs of 2+ identical pixels become run packets
 * (`0x80 | count-1` + one pixel); everything else accumulates into raw
 * packets (`count-1` + count pixels). Both cap at 128 pixels.
 *
 * @param pixels BGR(A) pixel bytes from `toBGR`
 * @param width Image width in pixels
 * @param height Image height in pixels
 * @param pixelSize Bytes per pixel: 3 or 4
 * @returns {Uint8Array} RLE-compressed pixel data
 */
const encodeRLE = (
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  pixelSize: number,
): Uint8Array => {
  const bytes: number[] = [];
  const rowBytes = width * pixelSize;

  for (let row = 0; row < height; row++) {
    const rowEnd = (row + 1) * rowBytes;
    let pos = row * rowBytes;

    while (pos < rowEnd) {
      const run = runLength(pixels, pos, rowEnd, pixelSize);

      if (run > 1) {
        bytes.push(0x80 | (run - 1));

        for (let i = 0; i < pixelSize; i++) {
          bytes.push(pixels[pos + i]);
        }

        pos += run * pixelSize;
        continue;
      }

      const rawStart = pos;
      let count = 0;

      while (
        pos < rowEnd && count < RLE_MAX_PACKET &&
        runLength(pixels, pos, rowEnd, pixelSize) === 1
      ) {
        count++;
        pos += pixelSize;
      }

      bytes.push(count - 1);

      for (let i = rawStart; i < pos; i++) {
        bytes.push(pixels[i]);
      }
    }
  }

  return Uint8Array.from(bytes);
};
```

In `encode()`, replace:

```typescript
    const body = toBGR(data, pixelSize);
```

with:

```typescript
    const bgr = toBGR(data, pixelSize);
    const body = this.options.rle
      ? encodeRLE(bgr, width, height, pixelSize)
      : bgr;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — all writer tests (8) and all loader tests.

- [ ] **Step 5: Commit**

```bash
git add src/writer.ts src/writer_test.ts
git commit -m "feat: Add per-scanline RLE compression to TgaWriter"
```

---

### Task 4: `save()` and `fromLoader()`

**Files:**
- Modify: `src/writer.ts` (add both methods)
- Test: `src/writer_test.ts` (append tests)

**Interfaces:**
- Consumes: `TgaLoader.getRGBA(): TgaImageSource` (Task 1); `TgaWriter.encode()` (Tasks 2-3).
- Produces: `save(path: string): Promise<void>`; `static fromLoader(loader: TgaLoader, options?: TgaWriterOptions): TgaWriter`.

- [ ] **Step 1: Write the failing tests**

Append to `src/writer_test.ts` (also extend its imports — add these lines below the existing `node:` imports at the top of the file):

```typescript
import { unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
```

New tests:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run build`
Expected: FAIL — `tsc` errors `TS2339: Property 'save' does not exist on type 'TgaWriter'` and `TS2339: Property 'fromLoader' does not exist on type 'typeof TgaWriter'`.

- [ ] **Step 3: Implement `save()` and `fromLoader()`**

In `src/writer.ts`, add imports at the top:

```typescript
import { writeFile } from "node:fs/promises";
import type { TgaLoader } from "./tga.js";
```

(`import type` keeps the loader out of the compiled writer module — no runtime circular dependency.)

Add to the `TgaWriter` class, below the constructor:

```typescript
  /**
   * Create a writer from an already-loaded `TgaLoader` for round-tripping
   * (load, modify, save). The loader's decoded RGBA pixels become the
   * source image; indexed/grayscale/16-bit sources re-encode as true color.
   *
   * @example ```ts
   * const tga = new TgaLoader();
   * tga.load(await tga.open("./in.tga"));
   * await TgaWriter.fromLoader(tga, { rle: true }).save("./out.tga");
   * ```
   *
   * @param loader Loader whose `load` method has been called
   * @param options Optional bit depth and RLE flag
   * @throws {TgaLoaderReferenceError} Propagated from `getRGBA` when the
   * loader has no data
   * @returns {TgaWriter} Writer sourcing the loader's decoded pixels
   */
  static fromLoader(loader: TgaLoader, options?: TgaWriterOptions): TgaWriter {
    return new TgaWriter(loader.getRGBA(), options);
  }
```

Add below `encode()`:

```typescript
  /**
   * Encode and write the TGA file to disk. Counterpart to
   * `TgaLoader.open`.
   *
   * @param path Filesystem destination for the .tga file
   * @throws {TgaWriterError} Thrown when the file cannot be written
   */
  async save(path: string): Promise<void> {
    try {
      await writeFile(path, this.encode());
    } catch (err) {
      throw new TgaWriterError(
        `Can not save file to path: "${path}". ${(err as Error).message}`,
      );
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — all writer tests (11) and all loader tests.

- [ ] **Step 5: Commit**

```bash
git add src/writer.ts src/writer_test.ts
git commit -m "feat: Add TgaWriter.save and TgaWriter.fromLoader"
```

---

### Task 5: Docs and version bump

**Files:**
- Modify: `package.json:3` (version), `jsr.json:3` (version)
- Modify: `README.md` (writer section + API listing)
- Modify: `CHANGELOG.md` (2.1.0 entry)

**Interfaces:**
- Consumes: final public API from Tasks 1-4 (`TgaWriter`, `TgaWriterError`, `TgaWriterOptions`, `TgaImageSource`, `TgaLoader.getRGBA`).
- Produces: released-documentation state; no code.

- [ ] **Step 1: Bump versions**

`package.json`: change `"version": "2.0.1"` to `"version": "2.1.0"`.
`jsr.json`: change `"version": "2.0.0"` to `"version": "2.1.0"`.

- [ ] **Step 2: Update README**

Insert after the "Loading from raw data" section (before `## API`):

````markdown
### Writing TGA files

```typescript
import { TgaLoader, TgaWriter } from 'targadactyl';

// Encode RGBA pixels (any ImageData works)
const ctx = canvas.getContext('2d');
const writer = new TgaWriter(ctx.getImageData(0, 0, width, height), {
  bitDepth: 24, // 24 (BGR) or 32 (BGRA, default)
  rle: true,    // run-length compression, default false
});

const bytes = writer.encode();   // Uint8Array of TGA file contents
await writer.save('./out.tga');  // or write it to disk directly

// Round-trip an existing TGA
const tga = new TgaLoader();
tga.load(await tga.open('./in.tga'));
await TgaWriter.fromLoader(tga, { rle: true }).save('./copy.tga');
```
````

Append to the `## API` section after the `TgaLoader` block:

```markdown
- `getRGBA(): TgaImageSource` - Get decoded top-down RGBA pixels (`{ data, width, height }`)

### `TgaWriter`

Encodes RGBA pixel data as TGA file bytes. Always writes top-left origin, true-color output.

#### Methods

- `constructor(image: TgaImageSource, options?: TgaWriterOptions)` - `image` is `{ data: Uint8ClampedArray, width: number, height: number }` (any `ImageData` qualifies); options are `bitDepth: 24 | 32` (default `32`) and `rle: boolean` (default `false`)
- `encode(): Uint8Array` - Encode to complete TGA file bytes
- `async save(path: string): Promise<void>` - Encode and write to disk
- `static fromLoader(loader: TgaLoader, options?: TgaWriterOptions): TgaWriter` - Build a writer from a loaded `TgaLoader` for round-tripping
```

Update the "Supported TGA Formats" section to clarify read vs. write support:

```markdown
## Supported TGA Formats

Reading:

- Uncompressed RGB (8, 16, 24, 32 bit)
- RLE-compressed RGB
- Indexed color
- Grayscale (8, 16 bit)
- RLE-compressed grayscale

Writing:

- Uncompressed RGB (24, 32 bit)
- RLE-compressed RGB (24, 32 bit)
```

- [ ] **Step 3: Update CHANGELOG**

Insert below the `## [2.0.0]` header line's preceding blank line (i.e., as the newest entry):

```markdown
## [2.1.0] - 2026-07-04

### Added
- `TgaWriter` class for encoding RGBA pixel data as TGA files (24/32-bit, optional per-scanline RLE compression, top-left origin)
- `TgaWriter.save(path)` for writing encoded TGA files to disk
- `TgaWriter.fromLoader(loader)` for round-tripping loaded TGA files
- `TgaLoader.getRGBA()` public accessor returning decoded top-down RGBA pixels
- `TgaWriterError`, `TgaWriterOptions`, and `TgaImageSource` exports

### Changed
- Decoding no longer allocates a throwaway canvas when building pixel data; skia-canvas is only used for PNG/JPEG export
```

- [ ] **Step 4: Verify the suite still passes**

Run: `npm test`
Expected: PASS — full suite green.

- [ ] **Step 5: Commit**

```bash
git add package.json jsr.json README.md CHANGELOG.md
git commit -m "docs: Document TgaWriter and bump version to 2.1.0"
```
