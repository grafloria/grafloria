# Angular conformance harness

A real `ng new`-shaped Angular 19 app consuming the PUBLISHED @grafloria
packages (or local tarballs) — the acceptance gate for the Angular-native
experience. It exercises, in a real browser:

- `[(nodes)]`/`[(edges)]` controlled data
- `<ng-template grafloriaNode>` custom nodes (with a click handler mutating
  controlled data — the ZONELESS litmus)
- `provideGrafloria({ theme })` app-wide defaults (no [theme] binding anywhere)
- `[layout]` / `applyLayout('elk')` — verifies the elkjs LAZY CHUNK is not
  fetched at boot and IS fetched on first layout
- `snapshot()` / `loadSnapshot()` round-trip
- `provideExperimentalZonelessChangeDetection()` throughout

Run:

```sh
npm install                                  # or: npm install ../path/to/*.tgz
npx ng build
npx serve dist/gf-ng-proof/browser           # any static server
```

Then drive the page (or port the playwright probe from the session logs):
boot → no elk chunk; "Run ELK layout" → chunk fetched, nodes separate,
(layoutDone) fires; Snapshot → relayout → Restore returns positions.
