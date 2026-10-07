# @grafloria/renderer

The rendering layer of the [Grafloria](https://github.com/grafloria/grafloria)
diagram engine: an SVG renderer with interaction, theming, accessibility, and
a deterministic export pipeline — SVG, PNG/JPEG/WebP, and a self-contained
vector **PDF writer** (gradients, soft masks, images, real text). Plus the
`createDiagram()` instance API, canvas plugins (minimap, zoom controls,
background grid), and headless server-side rendering.

**Docs:** [tutorials & concept guides](https://grafloria.com/learn/) · [111 live demos](https://grafloria.com/demos/)

```sh
npm install @grafloria/renderer @grafloria/engine
```

```ts
import { createDiagram, attachCanvasPlugins } from '@grafloria/renderer';

const diagram = createDiagram(container, { nodes, edges, fitView: true });
attachCanvasPlugins(diagram, { minimap: true, controls: true, background: { variant: 'dots' } });
const svg = diagram.exportSvgString();
```

Framework packages build on this: `@grafloria/element`, `@grafloria/react`,
`@grafloria/angular`, `@grafloria/vue`.

## Bundle size — what actually ships

Don't judge this library by npm's **unpacked size** stat — that is
uncompressed ESM source plus full TypeScript declarations (the whole family
installs ~9 MB). None of it reaches your users as-is; what matters is what
your bundler emits.

Worst case, importing the **entire** public surface of `@grafloria/renderer`
(engine + the SVG renderer, interaction, minimap, PNG/SVG/PDF export, themes), measured with esbuild (minify, ESM, code-splitting):

| | minified | gzipped |
|---|---|---|
| eager bundle | 1176 KB | **343 KB** |
| elkjs — lazy chunk, downloads **only** if ELK layout is invoked | 1,423 KB | 432 KB |

A real app importing only what it uses ships less. Reproduce it in two minutes:

```sh
npm i -D esbuild @grafloria/renderer
echo "export * from '@grafloria/renderer';" > entry.mjs
npx esbuild entry.mjs --bundle --minify --format=esm --splitting --outdir=out
gzip -k9 out/entry.js && wc -c out/entry.js out/entry.js.gz
```

`--splitting` matters: without it esbuild inlines the lazily-imported ELK
chunk and inflates the number by ~1.4 MB. Real app bundlers (Angular CLI,
Vite, Next.js) split by default. Since engine 0.3.0 / renderer 0.4.0 /
element 0.4.0 the packages are **pure ESM** — every bundler tree-shakes them,
and Node ≥ 20.19 can `require()` them too.

MIT © [Grafloria](https://github.com/grafloria/grafloria)
