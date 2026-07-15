# The Grafloria demo gallery

**Every demo in this gallery is a test.** That is the whole point of it, and it is why the
gallery exists at all.

## Why this is not marketing

This project has found, in **every one of its nine waves**, features that existed, had
passing unit tests, and were **wired to nothing**:

- `engine.applyLayout()` required a `setLayoutService()` call that nothing in the codebase
  ever made. Dagre, ELK, force, spectral and community — thousands of lines — could not be
  run from the engine at all.
- All 17 LOD presets produced the identical picture. Every one was a no-op.
- The layout worker stack was 100% scaffolding, and its 28 tests **all forced
  `useWorker: false`**, so the worker path never ran in test or in production.
- An entire touch/mobile stack sat in the engine's **public API**, constructed by nothing,
  and was **unwireable** — its interface demanded engine methods that do not exist. Its 9
  unit tests passed the whole time.
- `Command.serialize()` exists on every command and there is **no deserializer anywhere**.
- And the engine library **did not build at all** while 2,847 unit tests were green, because
  every gate anyone ran was `nx test` and none was `nx build`.

A unit test proves a unit *works*. It never proves anything *calls* it. A demo you can drive
in a real browser is the only artefact that proves a feature is **reachable** — that a user
with a mouse and a keyboard can actually get to it.

So: **a broken demo is a red gate.** `demos/e2e/gallery-run.mjs` loads every page in this
gallery in headless Chromium, drives it, and asserts it did something real. If a feature
regresses, the demo that shows it off goes red, and CI fails.

## And working is not enough: the VISUAL gate

The 2026-07-15 screenshot audit found **47 visual defects sitting behind 89 green
asserts** — fish-hook edges from a frozen default port pick, group frames hiding their
own labels, a fit that magnified 8 nodes to 288% zoom, a blank canvas over three
perfectly true status lines. "The feature works" and "the picture is right" are
different claims, so they have different gates:

- `node demos/e2e/shoot.mjs [--out dir] [category]` — captures every demo as
  `boot` / `after` / (optional) `showcase` PNGs + a manifest. `showcase` is the money
  shot a round-tripping assert can never photograph (helper lines lit mid-drag, the
  collapsed group, the dark palette) — a demo declares one via `showcase(ctx)` in
  `defineDemo`, and it runs on a fresh page load, never as a gate.
- `node demos/e2e/visual-run.mjs` — re-captures all frames and pixel-diffs each against
  its blessed golden in `demos/e2e/goldens/` (the diff runs inside headless Chromium —
  zero added dependencies). Failures write a magenta `<name>.diff.png` next to the capture.
- `node demos/e2e/visual-run.mjs --update` — re-bless after a DELIBERATE visual change:
  captures twice, measures each frame's own run-to-run jitter, and derives its tolerance
  from that evidence (`tolerances.json` records both). Frames jitterier than 5% are
  excluded loudly, listed on every run. Goldens are per-platform (font rasterization).

The tolerance floor is mutation-tested: an uppercased-labels mutation survived a 0.15%
floor and is caught at 0.02% with zero false positives across the other 184 frames.

## And a still frame is not enough: the INTERACTION gate

A user dragged a node and reported "the line moves faster than the node." Nothing here
would have caught that: gallery-run asserts a model *consequence*, visual-run compares a
*static* frame — neither drives a live gesture and watches the *dynamics*. `interaction-run.mjs`
does:

- `node demos/e2e/interaction-run.mjs` drives REAL pointer gestures in headless Chromium and
  waits for REAL animation frames between steps (the scheduler paints on rAF; a bare
  `setTimeout` races it and reads a half-updated DOM — which is how a naive probe "sees" a
  stale link a real user never does). Three invariants:
  - **DRAG-ATTACH** — grab a node that owns a link endpoint, drag it, and the PAINTED link
    endpoint must FOLLOW the node (≥50% of its displacement, projected) every frame. A link
    that stays behind scores ~0%.
  - **POINTER-TRACK** — the dragged node's on-screen centre moves 1:1 with the pointer, at
    zoom 1 AND zoom 2 (a zoom-space bug shows here).
  - **LINK-SELECT** — selecting a link changes its own PATH (width/colour/opacity/dash or a
    select class) and must NOT spawn a rectangle the size of the link around it.
- It **skips setup-misses loudly** rather than failing them: if a drag never grabbed the node
  or a click missed a curved path, that's the harness's problem, not the demo's — a gate that
  cries wolf buries the real wolf. After hardening: 148/148 real checks pass, ~40 setup-misses
  skipped.
- MUTATION-PROVEN: stubbing the "re-dirty a link when its node moves" line makes DRAG-ATTACH
  go red on every edge demo ("endpoint followed 0% of the node's move") — exactly the reported
  symptom. Reverted, it is green again.

## Layout

```
demos/
  index.html              the gallery grid
  shell/                  shared page shell, styles, and the demo contract
  nodes/  edges/  interaction/  layout/  styling/  grouping/  collab/  misc/
  e2e/gallery-run.mjs     drives EVERY demo and asserts it works   (the FUNCTIONAL gate)
  e2e/visual-run.mjs      pixel-diffs every frame vs its golden     (the VISUAL gate)
  e2e/interaction-run.mjs drives live gestures, checks the dynamics (the INTERACTION gate)
  e2e/shoot.mjs           captures boot/after/showcase PNGs (used by visual-run)
  e2e/goldens/            blessed frames + jitter-derived tolerances.json
  e2e/probe-fit.mjs       one-off probe: content bounds vs visible viewBox
```

## The contract every demo must meet

1. **It runs from a plain `file://` page** with no build step and no framework. The engine is
   consumed through `<grafloria-flow>` / `Grafloria.render()`, which is also how we prove the
   framework-agnostic claim — an Angular-only demo would prove nothing about that.
2. **It declares what it asserts.** Each page sets `window.__demo = { name, assert }`, where
   `assert()` runs *in the page*, drives the feature, and throws if it did not work. The
   harness calls it.
3. **The assertion has teeth.** It must fail if the feature is removed. An assertion that
   only checks "the SVG rendered" is theatre — this repository has shipped exactly that kind
   of test before, and it is why several features stayed broken for months.
4. **It says what it does NOT do.** Where we do not cover something (see below), the gallery
   says so plainly rather than quietly omitting it.

## What we do not cover

Stated here rather than left as a silent gap, and kept in step with `reactflow.dev/examples`:

- Nothing currently. (The whiteboard wave landed: freehand draw, eraser, rectangle and
  stroke-edit are demos in `whiteboard/` with the same teeth as everything else.)
