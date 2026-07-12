# TGA Writer Design

**Date:** 2026-07-04
**Status:** Approved
**Feature:** TGA encoding/writing support for targadactyl (currently decode-only)

## Goal

Add the ability to write TGA files from two input sources:

1. Arbitrary RGBA pixel data (browser/skia-canvas `ImageData` or plain `{ data, width, height }` objects).
2. Round-tripping a TGA loaded with `TgaLoader` (load → modify → save).

## Scope

**In scope:** true-color output — 24-bit BGR and 32-bit BGRA, each uncompressed (image type 2) or RLE-compressed (image type 10).

**Out of scope:** writing indexed (palette) and grayscale TGA variants, origin options other than top-left, ID field, extension/footer areas. The decoder continues to read all previously supported formats; this feature does not change decoding behavior.

## API

New file `src/writer.ts` exporting a `TgaWriter` class, chosen for API symmetry with `TgaLoader`. Internals are pure functional helpers; the class holds only the validated constructor input.

```typescript
type TgaImageSource = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};

type TgaWriterOptions = {
  bitDepth?: 24 | 32; // default 32
  rle?: boolean;      // default false
};

class TgaWriter {
  constructor(image: TgaImageSource, options?: TgaWriterOptions);
  encode(): Uint8Array;                 // complete TGA file bytes
  save(path: string): Promise<void>;    // encode() + fs writeFile
  static fromLoader(loader: TgaLoader, options?: TgaWriterOptions): TgaWriter;
}
```

`TgaImageSource` is structural, so `ImageData` instances satisfy it without conversion.

### Supporting changes

- `src/types.ts`: add `TgaWriterOptions` and `TgaImageSource`.
- `src/errors.ts`: add `TgaWriterError extends Error` (message prefix mirrors `TgaLoaderError`).
- `src/tga.ts` (targeted refactor):
  - The private `getImageData()` currently creates a throwaway canvas solely to allocate an `ImageData` buffer. Change it to allocate a plain `Uint8ClampedArray(width * height * 4)` instead.
  - Add a public `getRGBA(): TgaImageSource` accessor that returns decoded top-down RGBA pixels. `TgaWriter.fromLoader()` uses it, keeping the entire write path free of the skia-canvas dependency (canvas remains only for PNG/JPEG export).
- `mod.ts`: re-export `TgaWriter` and new types/error.
- Version bump to 2.1.0 in **both** `package.json` and `jsr.json`.
- README: "Writing TGA files" usage section + API listing. CHANGELOG: 2.1.0 entry.

## Encoding details

Output layout: 18-byte v1.0 header immediately followed by pixel data. No ID field, color map, or footer.

### Header

| Offset | Field | Value |
|--------|-------|-------|
| 0x00 | idLength | 0 |
| 0x01 | colorMapType | 0 |
| 0x02 | imageType | 2 (`TYPE_RGB`) or 10 (`TYPE_RLE_RGB`) when `rle: true` |
| 0x03–0x07 | colorMapIndex/Length/Depth | 0 |
| 0x08–0x0b | offsetX, offsetY | 0 |
| 0x0c | width | little-endian word |
| 0x0e | height | little-endian word |
| 0x10 | pixelDepth | 24 or 32 |
| 0x11 | flags | `0x20` (top-left origin) `| 8` attribute bits when 32-bit → `0x28`; `0x20` for 24-bit |

**Origin is always top-left.** `ImageData` rows are top-down already, so no row flipping is needed, and the existing decoder plus all modern readers honor the origin flag. Deliberate simplification; no origin option.

### Pixel conversion

Pure helper converts RGBA (canvas order) to file order: swap to BGR(A); drop alpha at `bitDepth: 24`. Exact inverse of the loader's `getImageData24bits`/`getImageData32bits` channel swaps. Rows written top-down.

### RLE compression

Pure helper, applied per scanline — packets never cross row boundaries (spec recommendation; some readers require it). Standard scheme:

- Run packet: `0x80 | (count - 1)` followed by one pixel, for runs of ≥ 2 identical pixels.
- Raw packet: `(count - 1)` followed by `count` pixels, for non-run stretches.
- Both packet types cap at 128 pixels.

### Data flow

1. Constructor validates input (see Error handling) and stores image + resolved options.
2. `encode()` = header bytes + (`rle` ? RLE(BGR data) : BGR data), concatenated into one `Uint8Array`.
3. `save(path)` = `encode()` → `writeFile` from `node:fs/promises`.
4. `fromLoader(loader)` = `loader.getRGBA()` → `new TgaWriter(...)`.

## Error handling

All input validation happens in the constructor (fail fast, mirroring the loader's `header` setter). `TgaWriterError` is thrown when:

- `width`/`height` are not positive integers,
- `data.length !== width * height * 4`, or
- `bitDepth` is not 24 or 32 (runtime guard for plain-JS callers).

`save()` wraps filesystem failures in `TgaWriterError` including the path, matching `open()`'s pattern. `fromLoader()` on an unloaded loader propagates the existing `TgaLoaderReferenceError` from `getRGBA()` — no new handling.

## Testing

`src/writer_test.ts` using `node:test` + `node:assert`, written test-first (TDD). Tests run against compiled `dist/` output like the existing suite.

1. **Header bytes** — encode a known 2×2 image; assert all 18 header bytes exactly for 24-bit, 32-bit, and RLE variants.
2. **Decoder round-trip** — encode → `TgaLoader.load()` → assert header fields and pixel-perfect RGBA equality for all four combos (24/32 × raw/RLE).
3. **Fixture round-trip** — for each `test/*.tga`: load, `fromLoader()`, encode, reload, assert RGBA equality with the original decode (16-bit fixtures re-encode at 24/32; compare post-decode pixels).
4. **RLE effectiveness** — solid-color image yields fewer bytes than uncompressed; width > 128 image exercises the 128-pixel packet cap and scanline boundaries.
5. **save()** — write to a temp file, reload from disk, clean up.
6. **Errors** — mismatched data length, zero/negative dimensions, and invalid bitDepth each throw `TgaWriterError`.

Also: `getRGBA()` unit test (loader refactor), and the existing loader suite must continue to pass unchanged.
