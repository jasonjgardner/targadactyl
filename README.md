# Targadactyl

**A .tga file loader for Deno.** (Forked from
[tga-js](https://github.com/vthibault/tga.js))

[![License: MIT](https://img.shields.io/badge/License-MIT-brightgreen.svg)](https://opensource.org/licenses/MIT)

## Usage Examples

Instantiate the `TgaLoader` class and pass an `Uint8ClampedArray` of image data
to the `load()` method **before** attempting to get the canvas, image data or
header information.

A `TgaLoaderReferenceError` will be thrown by `TgaLoader.getImageData()`,
`TgaLoader.getCanvas()` and `TgaLoader.header` if the TGA file has not loaded
prior to the method call.

### Loading a Local .tga File

```ts
import TgaLoader from "https://deno.land/x/targadactyl@1.0.1/mod.ts";

const tga = new TgaLoader();

tga.load(
  await tga.open("./test/test.tga"),
);
```

### Loading a Remote .tga File

```ts
import TgaLoader from "https://deno.land/x/targadactyl@1.0.1/mod.ts";

const tga = new TgaLoader();

const res = await fetch(
  "https://raw.githubusercontent.com/jasonjgardner/targadactyl/main/test/test.tga",
);
const buffer = await res.arrayBuffer();

tga.load(
  new Uint8ClampedArray(buffer),
);
```

### Serving a .tga File

> ![Logo .tga file served by Deno](https://targadactyl-serve.deno.dev/)\
> 🎉\
> Serving [`./test/test.tga`](./test/test.tga) via
> [deno.dev](https://targadactyl-serve.deno.dev)

#### [View in Playground Editor](https://dash.deno.com/playground/targadactyl-serve)
