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

## API

### `TgaLoader`

Main class for loading and decoding TGA files.

#### Methods

- `async open(path: string): Promise<Uint8ClampedArray>` - Load a TGA file from the filesystem
- `async fetch(uri: URL): Promise<Uint8ClampedArray>` - Load a TGA file from a URL (supports `file://`, `http://`, and `https://` protocols)
- `load(data: Uint8ClampedArray): TgaLoader` - Parse TGA data from a Uint8ClampedArray
- `getCanvas(): EmulatedCanvas2D` - Get a canvas containing the decoded TGA image
- `getDataURL(type?: 'image/png' | 'image/jpeg'): string` - Get the image as a base64-encoded data URL
- `decode(contentType: 'image/png' | 'image/jpeg'): Uint8Array` - Decode the TGA to PNG or JPEG format

#### Properties

- `header: TgaHeader` - TGA file header information
- `imageData?: Uint8ClampedArray` - Raw image data
- `palette?: Uint8ClampedArray` - Color palette (for indexed images)

## Supported TGA Formats

- Uncompressed RGB (8, 16, 24, 32 bit)
- RLE-compressed RGB
- Indexed color
- Grayscale (8, 16 bit)
- RLE-compressed grayscale

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
