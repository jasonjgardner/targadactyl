# Targadactyl

**A .tga file loader for Deno.** (Forked from
[tga-js](https://github.com/vthibault/tga.js))

![GitHub repository license](https://img.shields.io/github/license/jasonjgardner/targadactyl?style=for-the-badge)

## Usage Examples

Instantiate the `TgaLoader` class and pass an `Uint8ClampedArray` of image data
to the `load()` method **before** attempting to get the canvas, image data or
header information.

A `TgaLoaderReferenceError` will be thrown by `TgaLoader.getImageData()`,
`TgaLoader.getCanvas()` and `TgaLoader.header` if the TGA file has not loaded
prior to the method call.

### Loading a Local .tga File

(Requires read permission.)

```ts
import TgaLoader from "https://deno.land/x/targadactyl/mod.ts";

const tga = new TgaLoader();

tga.load(
  await tga.open("./test/test.tga"),
);
```

### Loading a Remote .tga File

(Requires network permission.)

```ts
import TgaLoader from "https://deno.land/x/targadactyl/mod.ts";

const tga = new TgaLoader();
const src = new URL("https://raw.githubusercontent.com/jasonjgardner/targadactyl/main/test/test.tga");

tga.load(
  await tga.fetch(src);
);
```

### Serving a .tga File

> ![Logo .tga file served by Deno](https://targadactyl-serve.deno.dev/)\
> 🎉\
> Serving [`./test/test.tga`](./test/test.tga) via
> [deno.dev](https://targadactyl-serve.deno.dev)

#### [View in Playground Editor](https://dash.deno.com/playground/targadactyl-serve)
