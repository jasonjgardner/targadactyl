# Targadactyl

A TGA (Targa) image loader for Node.js and Bun. This library allows you to load and decode TGA image files into canvas rendering contexts.

## Installation

```bash
npm install targadactyl
# or
bun add targadactyl
```

## Usage

### Loading a local TGA file

```typescript
import { TgaLoader } from 'targadactyl';

const tga = new TgaLoader();

try {
  tga.load(await tga.open('./path/to/image.tga'));
  
  // Access image data
  console.log(tga.header);
  console.log(tga.imageData);
  
  // Get as Data URL
  const dataUrl = tga.getDataURL('png');
  
  // Decode to buffer for serving
  const imageBuffer = tga.decode('png');
} catch (err) {
  console.error('Failed to load TGA:', err);
}
```

### Loading a remote TGA file

```typescript
import { TgaLoader } from 'targadactyl';

const tga = new TgaLoader();
const url = new URL('https://example.com/image.tga');

try {
  tga.load(await tga.fetch(url));
  const dataUrl = tga.getDataURL('png');
} catch (err) {
  console.error('Failed to fetch TGA:', err);
}
```

### Loading from raw data

```typescript
import { TgaLoader } from 'targadactyl';
import { readFileSync } from 'node:fs';

const tga = new TgaLoader();
const data = new Uint8ClampedArray(readFileSync('./image.tga'));

tga.load(data);
console.log(tga.header);
```

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

### Browser usage

Both reading and writing work in the browser through dependency-free subpaths — bundlers never see skia-canvas or Node builtins:

```typescript
import { TgaReader } from 'targadactyl/reader';
import { TgaWriter } from 'targadactyl/writer';

// Read: decode a fetched TGA into RGBA pixels
const reader = new TgaReader();
reader.load(await reader.fetch(new URL('https://example.com/image.tga')));
const { data, width, height } = reader.getRGBA();
ctx.putImageData(new ImageData(data, width, height), 0, 0);

// Write: encode canvas pixels as a TGA file
const bytes = new TgaWriter(ctx.getImageData(0, 0, width, height), {
  rle: true,
}).encode();
const blob = new Blob([bytes], { type: 'image/x-tga' });
```

`targadactyl/types` and `targadactyl/errors` are likewise dependency-free. Node-only functionality loads lazily (`open()`, `file://` fetches, `TgaWriter.save()`) or lives on `TgaLoader` (canvas output: `getCanvas`, `getDataURL`, `decode`), available from the root import or `targadactyl/loader` on Node.js/Bun.

## API

### `TgaReader`

Browser-safe TGA decoding (`targadactyl/reader`). Statically imports nothing but the package's own types and errors.

#### Methods

- `async open(path: string): Promise<Uint8ClampedArray>` - Load a TGA file from the filesystem (Node.js/Bun; `node:fs` imported lazily)
- `async fetch(uri: URL): Promise<Uint8ClampedArray>` - Load a TGA file from a URL (`http://`/`https://` in any runtime; `file://` on Node.js/Bun via lazy imports)
- `load(data: Uint8ClampedArray): this` - Parse TGA data from a Uint8ClampedArray
- `getRGBA(): TgaImageSource` - Get decoded top-down RGBA pixels (`{ data, width, height }`)

#### Properties

- `header: TgaHeader` - TGA file header information
- `imageData?: Uint8ClampedArray` - Raw image data
- `palette?: Uint8ClampedArray` - Color palette (for indexed images)

### `TgaLoader`

Extends `TgaReader` with canvas output via skia-canvas. Node.js/Bun only; available from the root import or `targadactyl/loader`.

#### Methods

- `getCanvas(): EmulatedCanvas2D` - Get a canvas containing the decoded TGA image
- `getDataURL(type?: 'image/png' | 'image/jpeg'): string` - Get the image as a base64-encoded data URL
- `decode(contentType: 'image/png' | 'image/jpeg'): Uint8Array` - Decode the TGA to PNG or JPEG format

### `TgaWriter`

Encodes RGBA pixel data as TGA file bytes. Always writes top-left origin, true-color output.

#### Methods

- `constructor(image: TgaImageSource, options?: TgaWriterOptions)` - `image` is `{ data: Uint8ClampedArray, width: number, height: number }` (any `ImageData` qualifies); options are `bitDepth: 24 | 32` (default `32`) and `rle: boolean` (default `false`)
- `encode(): Uint8Array` - Encode to complete TGA file bytes
- `async save(path: string): Promise<void>` - Encode and write to disk
- `static fromLoader(loader: TgaLoader, options?: TgaWriterOptions): TgaWriter` - Build a writer from a loaded `TgaLoader` for round-tripping

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

## Development

### Building

```bash
npm run build
# or
bun run build
```

### Testing

```bash
npm test
# or with Bun
bun run build && bun test src/tga_test.ts
```


## Credits

Based on [tga.js](https://github.com/vthibault/tga.js) by Vincent Thibault.

## License

MIT
