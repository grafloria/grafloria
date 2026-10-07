# Angular conformance harness

A real `ng new`-shaped Angular 22 app consuming the PUBLISHED @grafloria
packages (or local tarballs) — the acceptance gate for the Angular-native
experience. It exercises, in a real browser:

- `[(nodes)]`/`[(edges)]` controlled data
- `<ng-template grafloriaNode>` custom nodes (with a click handler mutating
  controlled data — the ZONELESS litmus)
- `provideGrafloria({ theme })` app-wide defaults (no [theme] binding anywhere)
- `[layout]` / `applyLayout('elk')` — verifies the elkjs LAZY CHUNK is not
  fetched at boot and IS fetched on first layout
- `snapshot()` / `loadSnapshot()` round-trip
- `provideZonelessChangeDetection()` throughout (zone.js not loaded)

## The matrix — every Angular the package claims

`@grafloria/angular` declares a peer range (Angular 18.1 to 22). `matrix.mjs`
is what keeps that honest: for each major it makes a fresh copy of this app on
THAT Angular (with the TypeScript and builder it requires), installs with no
`--legacy-peer-deps`, builds, and drives the checks above in a real browser.

```sh
npx nx build renderer-angular-renderer-angular --configuration production
node tools/conformance/angular/matrix.mjs                     # every claimed major, the local build
node tools/conformance/angular/matrix.mjs 21 22               # just these
node tools/conformance/angular/matrix.mjs --published 0.13.5  # a version from npm
```

Run it before widening the range or publishing the package. A newer Angular CLI
may need a newer Node than the machine has; the script borrows one through
npm's `node` package for that one build and installs nothing.

Run this app by hand:

```sh
npm install                                  # or: npm install ../path/to/*.tgz
npx ng build
npx serve dist/gf-ng-proof/browser           # any static server
```

Then drive the page (or port the playwright probe from the session logs):
boot → no elk chunk; "Run ELK layout" → chunk fetched, nodes separate,
(layoutDone) fires; Snapshot → relayout → Restore returns positions.
