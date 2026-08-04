# @grafloria/element

`<grafloria-flow>` — the universal embed for the
[Grafloria](https://github.com/grafloria/grafloria) diagram engine. A custom
element with no framework wall: plain HTML, Vue, Svelte, Solid, Lit, a CMS
block, or a notebook cell all speak "element with attributes and events".
Includes the high-level kits: dashboard (drag-pack grid + widgets), class-UML,
and ERD.

```html
<script type="module" src="grafloria.js"></script>

<grafloria-flow theme="light" fit-view
  nodes='[{"id":"a","position":{"x":0,"y":0},"label":"Extract"},
          {"id":"b","position":{"x":220,"y":0},"label":"Load"}]'
  edges='[{"source":"a","target":"b"}]'>
  <template data-node-type="card">
    <div class="card"><h4 data-field="title"></h4></div>
  </template>
</grafloria-flow>
```

Simple data rides on attributes (JSON strings); rich data goes in as
properties (`el.nodes = [...]`) — the standard custom-element contract every
framework's template binding targets.

For first-class framework idioms use `@grafloria/react`,
`@grafloria/angular`, or `@grafloria/vue`.

## Bundle size — what actually ships

Don't judge this library by npm's **unpacked size** stat — that is
uncompressed ESM source plus full TypeScript declarations (the whole family
installs ~9 MB). None of it reaches your users as-is; what matters is what
your bundler emits.

Worst case, importing the **entire** public surface of `@grafloria/element`
(the whole stack: engine, renderer, the custom element, every kit (diagram, dashboard, table…)), measured with esbuild (minify, ESM, code-splitting):

| | minified | gzipped |
|---|---|---|
| eager bundle | 1660 KB | **451 KB** |
| elkjs — lazy chunk, downloads **only** if ELK layout is invoked | 1,423 KB | 432 KB |

A real app importing only what it uses ships less. Reproduce it in two minutes:

**Docs:** [JavaScript in 10 minutes](https://grafloria.com/learn/javascript/) · [guides & concepts](https://grafloria.com/learn/) · [111 live demos](https://grafloria.com/demos/)

```sh
npm i -D esbuild @grafloria/element
echo "export * from '@grafloria/element';" > entry.mjs
npx esbuild entry.mjs --bundle --minify --format=esm --splitting --outdir=out
gzip -k9 out/entry.js && wc -c out/entry.js out/entry.js.gz
```

`--splitting` matters: without it esbuild inlines the lazily-imported ELK
chunk and inflates the number by ~1.4 MB. Real app bundlers (Angular CLI,
Vite, Next.js) split by default. Since engine 0.3.0 / renderer 0.4.0 /
element 0.4.0 the packages are **pure ESM** — every bundler tree-shakes them,
and Node ≥ 20.19 can `require()` them too.

MIT © [Grafloria](https://github.com/grafloria/grafloria)
