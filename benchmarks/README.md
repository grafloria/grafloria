# Benchmarks — reproducible, and honest about where we lose

Side-by-side measurements of Grafloria and @xyflow/react (React Flow 12) on one
deterministic scene, driven identically by real mouse events in headless
Chromium. Run it yourself:

```sh
cd benchmarks && npm install && node run.mjs            # the published packages
cd benchmarks && node run.mjs --source                  # this working tree
```

## What this harness refuses to report

The first version of this benchmark produced numbers that looked authoritative
and were not measuring what they said. Three separate defects, all in the same
direction — *the two libraries were not doing the same thing*:

1. **The pan gesture never panned Grafloria.** It pressed at a fixed (1000,500),
   which happened to be empty pane in React Flow and a link in Grafloria. One
   library was timed panning; the other was timed hit-testing a link. The "pan"
   row compared them anyway.
2. **The drag gesture never moved a node.** It pressed where node `n0` had been
   before the pan moved the camera 2,400px away, and metered the resulting
   do-nothing frames as a drag.
3. **The two cameras were framing different amounts of the scene.** React Flow's
   default `minZoom` is 0.5, at which these meshes do not fit on screen — its
   `fitView` silently stopped there and drew a slice while Grafloria drew the
   whole mesh. And esbuild, walking up to the repo's `tsconfig.json`, resolved
   `@grafloria/*` to `libs/*/src`, so the run bundled the working tree while
   claiming to measure the published packages.

Each is now a hard failure rather than a number:

- `findEmpty()` starts every pan on genuinely empty canvas in both libraries,
  and the run **throws** if the camera did not move.
- The drag re-frames first, identifies the node **by id**, and **throws** if that
  node's position is unchanged afterwards.
- Both cameras are pinned to the same world rect via `__setCamera`, every
  framing is recorded in `results.json`, and a fairness gate **throws** if the
  two libraries were not looking at the same rectangle.
- The build mode is chosen explicitly and printed, and lands in `results.json`
  as `meta.grafloriaBuild`.

A benchmark that cannot fail cannot be trusted. These assertions exist because
all three defects above produced perfectly plausible tables.

## Methodology
- One scene generator (`pages/scene.js`) feeds both libraries: a √n×√n grid of
  labeled nodes with horizontal + vertical edges (a connected mesh).
- Both libraries run their **defaults**, with one documented exception: React
  Flow's `minZoom` is lowered to 0.02 so the harness can frame it on the same
  world rect as Grafloria. That raises no rendering limit and tunes nothing.
- Mount = script start → two rAFs after the library reports ready.
- Pan / drag = average and p95 rAF frame time during ~4s of scripted mouse
  gestures (real `mousedown/move/up`, 16ms steps).
- **pan fit** = the whole mesh on screen. **pan slice** = 1:1 zoom over the
  middle of it, the regime where a viewport-culling renderer has something to
  cull.
- Machine, date, build mode and framings are recorded in `results.json`.

## Current results (Apple M1 Pro, 2026-08-23)

Grafloria 0.4.5 / engine 0.3.5 — the **published** packages, so `node run.mjs`
reproduces this table without `--source`. React Flow 12.11.3. Median of three
consecutive runs.

| lib        | nodes | mount ms | pan fit avg/p95 | pan slice avg/p95 | drag avg/p95 |
|------------|------:|---------:|----------------:|------------------:|-------------:|
| grafloria  |   500 |      150 |     16.7 / 16.8 |       16.7 / 16.8 |  17.0 / 16.8 |
| reactflow  |   500 |      182 |     16.7 / 16.7 |       16.7 / 16.8 |  16.8 / 16.7 |
| grafloria  |  2000 |      362 |     17.0 / 16.8 |       16.7 / 16.8 |  29.4 / 83.3 |
| reactflow  |  2000 |      643 |     18.4 / 33.3 |       16.8 / 16.8 |  40.7 / 66.7 |

Reading it honestly: at 500 nodes everything holds 60fps in both libraries and
the differences are noise. At 2,000 nodes Grafloria mounts ~1.8× faster and both
pan rows hold 60fps with no dropped frames, where React Flow drops one on the
fitted pan. **Node drag at 2,000 nodes is the row that is still not 60fps in
either library** — 29.4ms average for us against React Flow's 40.7, and our p95
of 83.3ms is worse than their 66.7ms, meaning our slowest drag frames are the
uglier ones. Dragging a node re-routes its edges, and that work is still on the
frame.

Profiling that drag names the cost, and it is not routing: `getInteractionConfig`
alone accounts for ~590ms of a 4.5s gesture. That is the next thing to fix.

### Do not compare these numbers against an older table

Absolute milliseconds are only comparable **within one run**, and this is not a
platitude — between 2026-08-22 and 2026-08-23 React Flow's drag row moved from
39.4ms to 40.7ms on identical, untouched library code. That is the machine, not
the library. Whenever you want a before/after, measure both arms in the same
session; that is exactly what `run.mjs` does, and it is what makes the
comparison above meaningful even though the absolute numbers drift.

## Caveats
- One scene, one machine class, default configs. Different node counts, custom
  nodes, or tuned configs will move the numbers.
- Frame times measured via rAF deltas in-page; headless Chromium vsync differs
  from a real display but applies equally to both.
- rAF deltas are pinned to the vsync interval when nothing is dropped, so a row
  at 16.7ms means "no frames dropped", not "the frame was free". Where headroom
  is the question, measure CPU (`Performance.getMetrics`) instead.
- We will not quote these numbers in marketing until they have been reproduced
  on hardware that is not the machine that produced them. When we publish about
  performance, it will be this harness, in public, with whatever it says at
  that time.
