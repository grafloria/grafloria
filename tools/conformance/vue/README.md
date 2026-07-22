# Vue conformance harness

Bundle `app.mjs` against the published (or tarball-installed) @grafloria
packages and drive it in a browser. Proves: `v-model` data, `#node-<type>`
slot custom nodes (auto-`custom` opt-in), declarative `layout` with
`@layout-done`, and plain SVG fallback for un-slotted nodes.

```sh
npm install @grafloria/vue @grafloria/renderer @grafloria/engine vue
npx esbuild app.mjs --bundle --format=esm --outfile=bundle.js \
  --main-fields=module,main --define:process.env.NODE_ENV='"production"'
npx serve .
```
Expected: two dark slot-rendered job cards + one SVG node, separated by the
grid layout, status flipping to `layout done`.
