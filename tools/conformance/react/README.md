# React conformance harness

Bundle `app.jsx` against the published (or tarball-installed) @grafloria
packages and drive it in a browser. Proves: uncontrolled data, `plugins`
(minimap + controls + background), and the Mermaid text wreck-and-restore
round-trip through the live instance.

```sh
npm install @grafloria/react @grafloria/renderer @grafloria/engine react react-dom
npx esbuild app.jsx --bundle --format=esm --outfile=bundle.js \
  --main-fields=module,main --define:process.env.NODE_ENV='"production"' --jsx=automatic
npx serve .
```
Expected: three nodes with edges over a dotted grid, a live minimap
bottom-right (node rects + camera), zoom/fit controls, and the round-trip
button reporting `sidecar → 3 nodes`.
