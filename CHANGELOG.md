# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

