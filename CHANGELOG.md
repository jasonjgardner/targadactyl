# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.2.0] - 2026-07-06

### Added
- `TgaReader` class (`targadactyl/reader`): browser-safe, tree-shakable TGA decoding — header parsing, RLE decode, and `getRGBA()` with no canvas or Node dependencies in the static module graph
- Regression test asserting the compiled `reader` and `writer` modules stay free of static Node/canvas imports

### Changed
- `TgaLoader` now extends `TgaReader`, adding only the skia-canvas output methods (`getCanvas`, `getDataURL`, `decode`); its public API is unchanged
- `TgaReader.open()` and `file://` fetches import Node builtins lazily
- `TgaWriter.fromLoader()` accepts any `TgaReader` (and therefore still accepts `TgaLoader`)
- `load()` returns `this`, so chaining works on subclasses

## [2.1.1] - 2026-07-06

### Added
- Subpath exports for browser-friendly imports: `targadactyl/writer`, `targadactyl/loader`, `targadactyl/types`, and `targadactyl/errors` (npm and JSR)

### Changed
- `TgaWriter.save()` imports `node:fs/promises` lazily, so `targadactyl/writer` bundles cleanly for the browser when only `encode()` is used
- Declared `sideEffects: false` for bundler tree-shaking

### Fixed
- 16-bit TGA decoding wrote the green, blue, and alpha channels to the wrong offsets (`offset * 4 + n` instead of `offset + n`), corrupting or dropping every pixel after the first
- 16-bit blue channel was scaled down (`>> 3`) instead of up (`<< 3`), flattening blues to near-black

## [2.1.0] - 2026-07-04

### Added
- `TgaWriter` class for encoding RGBA pixel data as TGA files (24/32-bit, optional per-scanline RLE compression, top-left origin)
- `TgaWriter.save(path)` for writing encoded TGA files to disk
- `TgaWriter.fromLoader(loader)` for round-tripping loaded TGA files
- `TgaLoader.getRGBA()` public accessor returning decoded top-down RGBA pixels
- `TgaWriterError`, `TgaWriterOptions`, and `TgaImageSource` exports

### Changed
- Decoding no longer allocates a throwaway canvas when building pixel data; skia-canvas is only used for PNG/JPEG export

## [2.0.0] - 2024

### Changed
- **BREAKING**: Migrated from Deno to Node.js/Bun compatibility
- **BREAKING**: Import paths now use `.js` extensions instead of `.ts`
- **BREAKING**: Package now requires a build step before use
- Replaced Deno canvas with `skia-canvas`
- Replaced Deno file I/O with Node.js `fs/promises` module
- Replaced Deno base64 encoding with Node.js `Buffer` API
- Migrated tests from Deno test runner to Node.js test runner

### Removed
- **BREAKING**: Removed Deno permission checks (now relies on OS permissions)
- **BREAKING**: Removed Deno-specific APIs

### Added
- Added `package.json` for npm distribution
- Added `tsconfig.json` for TypeScript compilation
- Added build script for TypeScript compilation
- Added examples directory with usage examples
- Added migration guide (MIGRATION.md)
- Added TypeScript declaration files generation
- Added support for Bun runtime

### Fixed
- Fixed import paths to be ESM-compatible
- Fixed error handling to work without Deno permission system

## [1.0.0] - Previous

### Added
- Initial Deno implementation
- TGA file format support (8, 16, 24, 32 bit)
- RLE compression support
- Indexed color support
- Grayscale support
- Canvas rendering support

