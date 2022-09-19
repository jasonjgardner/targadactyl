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
import TgaLoader from "https://deno.land/x/targadactyl@1.0.0/mod.ts";

const tga = new TgaLoader();

tga.load(
  await tga.open("./test/test.tga"),
);
```

### Loading a Remote .tga File

```ts
import TgaLoader from "https://deno.land/x/targadactyl@1.0.0/mod.ts";

const tga = new TgaLoader();

const res = await fetch(
  "https://raw.githubusercontent.com/jasonjgardner/targadactyl/main/test/test.tga",
);
const buffer = res.arrayBuffer();

tga.load(
  new Uint8ClampedArray(buffer),
);
```

### Serving a .tga File with [_Fresh_](https://fresh.deno.dev)

```ts
import { decode } from "https://deno.land/std@0.156.0/encoding/base64url.ts";
import {
  TgaLoader,
  TgaLoaderError,
} from "https://deno.land/x/targadactyl@1.0.0/mod.ts";

export const handler = async (
  _req: Request,
  ctx: HandlerContext,
): Promise<Response> => {
  try {
    const tga = new TgaLoader();

    tga.load(
      await tga.open(`./img/${ctx.params.tga}`),
    );

    const contentType = "image/png";

    return new Response(
      decode(tga.getDataURL(contentType)),
      {
        status: 200,
        headers: {
          "Content-Type": contentType,
        },
      },
    );
  } catch (err) {
    if (err instanceof TgaLoaderError) {
      return new Response(`Failed loading .tga image file: "${err}"`, {
        status: 404,
      });
    }

    return new Response("An unknown error has occurred.", { status: 500 });
  }
};
```
