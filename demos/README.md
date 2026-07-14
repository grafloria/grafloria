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

## Layout

```
demos/
  index.html              the gallery grid
  shell/                  shared page shell, styles, and the demo contract
  nodes/  edges/  interaction/  layout/  styling/  grouping/  collab/  misc/
  e2e/gallery-run.mjs     drives EVERY demo and asserts it works
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

- Nothing currently. (Freehand draw / eraser / rectangle were React Flow's Whiteboard
  category and are being built as their own wave; until they land, they are listed here.)
