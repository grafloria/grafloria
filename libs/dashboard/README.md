# @grafloria/dashboard

Grafloria Dashboards is an MIT JavaScript dashboard layout library: draggable, resizable widgets on a
grid or a splitter layout, with undo, nesting and persistence built in, for Angular, React, Vue or
plain JavaScript.

**Product page:** https://grafloria.com/dashboards/ · **Tutorial:** https://grafloria.com/learn/javascript-dashboards/ · **Live demo:** https://grafloria.com/demos/dashboard/fluid-board.html

```sh
npm install @grafloria/dashboard @grafloria/element @grafloria/renderer @grafloria/engine
```

```js
import { render, dashboard } from '@grafloria/dashboard';

const spec = dashboard({
  columns: 12,
  sizing: 'fit',          // 'fit' never scrolls; 'grow' extends the board
  dragHandle: true,       // the caption strip is the handle; { grip: true } paints a grip
  widgets: [
    { id: 'rev',   kind: 'kpi',  span: 3, data: { label: 'Revenue', value: '$6.8M', delta: 12.4 } },
    { id: 'trend', kind: 'line', span: 9, rows: 2, title: 'Revenue vs target', data: { series: [{ name: 'Revenue', values: [4, 5, 6] }], labels: ['J', 'F', 'M'] } },
  ],
});
render(spec, document.getElementById('board'));   // the element needs a real height

spec.handle.setLayout('split');   // the splitter layout, live
spec.handle.toJSON();             // the whole board: widgets, nesting, data, layout
```

Two layouts on one document: the 12-column grid with push-down re-packing, and `layout: 'split'`, the
splitter surface BI dashboard designers use (one widget fills, the next halves, dividers are
percentages). Containers nest a grid inside a widget; every gesture is one undo step; keyboard and
screen-reader operation are built in; the same engine exports the board as SVG, PNG or PDF.

Native components: `<grafloria-dashboard>` in `@grafloria/angular`, `<GrafloriaDashboard>` in
`@grafloria/react` and `@grafloria/vue`.

This package re-exports the dashboard kit of `@grafloria/element` under its own name; the code and
the versions are the same. Part of [Grafloria](https://grafloria.com/), an MIT diagram and dashboard
engine for JavaScript: one headless core, native Angular, React and Vue bindings, one document format
and one undo stack.
