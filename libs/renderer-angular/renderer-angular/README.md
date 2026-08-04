# @grafloria/angular

Angular components, directives, and providers for the
[Grafloria](https://github.com/grafloria/grafloria) diagram engine — built the
Angular way: standalone components, signal inputs/outputs, `OnPush`, and
verified **zoneless**.

**Docs:** [Angular in 10 minutes](https://grafloria.com/learn/angular/) · [Angular deep guides](https://grafloria.com/learn/angular-custom-nodes/) · [every demo as an Angular component](https://grafloria.com/demos-angular/)

```sh
npm install @grafloria/angular @grafloria/renderer @grafloria/engine
```

## The canvas

```ts
import { Component, signal } from '@angular/core';
import { DiagramCanvasComponent, GrafloriaNodeDefDirective } from '@grafloria/angular';
import type { NodeSpec, EdgeSpec } from '@grafloria/renderer';

@Component({
  selector: 'app-flow',
  imports: [DiagramCanvasComponent, GrafloriaNodeDefDirective],
  template: `
    <grafloria-diagram-canvas
      [(nodes)]="nodes" [(edges)]="edges"
      [layout]="'elk'" (layoutDone)="onLaidOut()">
      <ng-template grafloriaNode="job" let-node let-data="data">
        <div class="job-card">{{ data['title'] }}</div>
      </ng-template>
    </grafloria-diagram-canvas>
  `,
})
export class FlowComponent {
  nodes = signal<NodeSpec[]>([
    { id: 'a', type: 'job', position: { x: 0, y: 0 }, size: { width: 180, height: 80 }, data: { title: 'Extract' } },
    { id: 'b', position: { x: 240, y: 0 }, label: 'Load' },
  ]);
  edges = signal<EdgeSpec[]>([{ source: 'a', target: 'b' }]);
  onLaidOut() {}
}
```

- `[(nodes)]` / `[(edges)]` — two-way model signals; drags, connects, and edits
  round-trip into your arrays. `(modelChange)` emits a replayable delta.
- `[(viewport)]` / `[(zoom)]` — the camera, two-way.

## Custom nodes are `ng-template`s

Declare a template for a node `type` and you are done — the canvas routes
matching nodes to the HTML layer automatically. Full Angular change detection,
pipes, directives, and event handlers inside; `let-node` is the live model,
`let-data="data"` the user payload. `<ng-template grafloriaNode>` (no value) is
the wildcard for any custom node without an exact template.

## App-wide configuration

```ts
bootstrapApplication(AppComponent, {
  providers: [provideGrafloria({ theme: DARK_THEME })],
});
```

Precedence: explicit `[theme]` binding → `provideGrafloria` → built-in light.

## Layout

`[layout]="'elk'"` or `[layout]="{ name: 'auto', options: { ... } }"` — any
name in the engine's registry (`elk`, `dagre`, `force`, `tree`, `grid`,
`auto`, …). The binding re-runs when it changes — never when node data changes,
so user drags are not fought. Re-run on demand with `applyLayout()`; listen via
`(layoutDone)`. ELK loads lazily: consumers who never run it ship none of its
~1.4 MB.

## Export & persistence

```ts
canvas().exportSvg();                  // SVG string, synchronous
canvas().exportPdf();                  // vector PDF, synchronous
await canvas().exportDiagram('png');   // full async pipeline
const doc = canvas().snapshot();       // serialize …
canvas().loadSnapshot(doc);            // … and restore
```

## Included UI

Node toolbar, link toolbar, property panel with a typed editor registry
(string/number/boolean/color/date/file/JSON/slider/…), interaction config
panel, `grafloriaHandle` port directive, responsive-canvas directive. All
outputs are signal `output()`s.

## Notes

- **Zoneless ready** — the conformance app runs
  `provideExperimentalZonelessChangeDetection()`.
- Packages ship ESM for bundlers (tree-shakeable, `sideEffects: false`) plus
  CJS for Node. A basic canvas app builds to ~1.2 MB initial / ~300 KB
  transfer; raise the default Angular bundle budget accordingly.

## Bundle size — what actually ships

Don't judge this library by npm's **unpacked size** stat — that is
uncompressed ESM source plus full TypeScript declarations (the whole family
installs ~9 MB). None of it reaches your users as-is; what matters is what
your bundler emits.

Worst case, importing the **entire** public surface of `@grafloria/angular`
(engine + renderer + the full Angular component library), measured with esbuild (minify, ESM, code-splitting):

| | minified | gzipped |
|---|---|---|
| eager bundle | 1501 KB | **395 KB** |
| elkjs — lazy chunk, downloads **only** if ELK layout is invoked | 1,423 KB | 432 KB |

A real app importing only what it uses ships less. Reproduce it in two minutes:

```sh
npm i -D esbuild @grafloria/angular
echo "export * from '@grafloria/angular';" > entry.mjs
npx esbuild entry.mjs --bundle --minify --format=esm --splitting --outdir=out '--external:@angular/*' --external:rxjs
gzip -k9 out/entry.js && wc -c out/entry.js out/entry.js.gz
```

`--splitting` matters: without it esbuild inlines the lazily-imported ELK
chunk and inflates the number by ~1.4 MB. Real app bundlers (Angular CLI,
Vite, Next.js) split by default. Since engine 0.3.0 / renderer 0.4.0 /
element 0.4.0 the packages are **pure ESM** — every bundler tree-shakes them,
and Node ≥ 20.19 can `require()` them too.

MIT © [Grafloria](https://github.com/grafloria/grafloria)
