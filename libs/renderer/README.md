# @grafloria/renderer

The rendering layer of the [Grafloria](https://github.com/grafloria/grafloria)
diagram engine: an SVG renderer with interaction, theming, accessibility, and
a deterministic export pipeline — SVG, PNG/JPEG/WebP, and a self-contained
vector **PDF writer** (gradients, soft masks, images, real text). Plus the
`createDiagram()` instance API, canvas plugins (minimap, zoom controls,
background grid), and headless server-side rendering.

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
`@grafloria/renderer-angular`, `@grafloria/vue`.

MIT © [Grafloria](https://github.com/grafloria/grafloria)
