# Roadmap

## Phase 1 — Tree-shakeable packages (0.2.0)

Every TypeScript package ships dual-format: CommonJS at `main` (Node consumers,
unchanged) plus per-file ES modules at `module` (`dist/…/esm`), with
`sideEffects: false` so bundlers can drop unused sub-systems — layout engines,
kits, exporters — from consumer bundles. `@grafloria/element` deliberately does
NOT claim `sideEffects: false`: importing it registers the `<grafloria-flow>`
custom element, and that registration must survive tree-shaking. The Angular
packages already ship FESM via ng-packagr.

Yardstick: the Angular consumer proof app measured **3.41 MB** on the CJS-only
0.1.x line. Phase 1 is done when the same app builds without the CommonJS
bailout warning and measurably smaller.

## Phase 2 — Angular-native experience

- `<ng-template grafloriaNode="type">` declarative custom nodes (template mode
  already half-exists in `htmlNodeRenderer`)
- `provideGrafloria({...})` DI-based configuration
- Signal `output()` coverage audit; zoneless change-detection readiness
- Docs written in Angular vocabulary
- The consumer proof app becomes a per-adapter **conformance gate**:
  controlled/uncontrolled data, custom nodes, event surface, SSR,
  tree-shakeable install

## Phase 3 — Framework parity

- React: gap-check the existing hooks/provider/nodeTypes/SSR surface against
  React Flow idioms — audit, not rebuild
- Vue: new `@grafloria/vue` package (`v-model:nodes`, slot-based custom nodes)
  on top of the element/renderer layer
- Every adapter passes the same conformance gate before it ships
