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
`@grafloria/renderer-angular`, or `@grafloria/vue`.

MIT © [Grafloria](https://github.com/grafloria/grafloria)
