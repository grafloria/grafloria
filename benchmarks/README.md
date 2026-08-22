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

## Current results (Apple M1 Pro, 2026-08-22)

Grafloria 0.4.4, React Flow 12. Every row re-measured after the harness fixes
above; the previous table on this page was produced by the broken gestures and
should not be compared against.

| lib        | nodes | mount ms | pan fit avg/p95 | pan slice avg/p95 | drag avg/p95 |
|------------|------:|---------:|----------------:|------------------:|-------------:|
| grafloria  |   500 |      184 |     16.7 / 16.8 |       16.7 / 16.8 |  17.2 / 16.8 |
| reactflow  |   500 |      167 |     16.7 / 16.7 |       16.7 / 16.8 |  16.8 / 16.7 |
| grafloria  |  2000 |      393 |     17.0 / 16.8 |       17.3 / 16.8 |  26.6 / 66.7 |
| reactflow  |  2000 |      648 |     18.5 / 33.3 |       16.8 / 16.7 |  39.4 / 66.7 |

Reading it honestly: at 500 nodes everything holds 60fps in both libraries and
the differences are noise. At 2,000 nodes Grafloria mounts ~1.6× faster and both
pan rows hold 60fps with no dropped frames. **Node drag at 2,000 nodes is the
row that is still not 60fps in either library** — 26.6ms average with a 66.7ms
p95 for us. We are ahead of React Flow's 39.4/66.7 there, and neither number is
good; dragging a node re-routes its edges, and that work is still on the frame.

### What changed, and what it cost

Against the published 0.4.3 the same harness measured `pan fit` at 2,000 nodes
as **21.5ms avg / 66.6ms p95** — a real gap, though a much smaller one than the
broken harness had claimed. 0.4.4 adds a camera fast path: the SVG draws in
world coordinates, so a frame in which only the camera moved rewrites the
`viewBox` attribute and the HTML layer transform and skips the VNode build and
reconcile entirely. Measured directly, a 100-frame pan over the fitted 2,000
node mesh went from ~100 `render()` calls to **1**.

The cost is that every full frame now renders 25% beyond the viewport on each
side, so it has margin to pan across — about 2.25× the visible area. Mount did
not measurably change (404ms → 393ms across runs), because that overscan is
cheap next to what it saves.

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
