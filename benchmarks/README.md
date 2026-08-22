# Benchmarks — reproducible, and honest about where we lose

Side-by-side measurements of Grafloria and @xyflow/react (React Flow 12) on one
deterministic scene, driven identically by real mouse events in headless
Chromium. Run it yourself:

```sh
cd benchmarks && npm install && node run.mjs
```

## Methodology
- One scene generator (`pages/scene.js`) feeds both libraries: a √n×√n grid of
  labeled nodes with horizontal + vertical edges (a connected mesh).
- Both libraries run their **defaults** — no per-library tuning, no custom
  nodes, no virtualization flags. Versions are pinned in `package.json`.
- Mount = script start → two rAFs after the library reports ready.
- Pan / drag = average and p95 rAF frame time during ~4s of scripted mouse
  gestures (real `mousedown/move/up`, 16ms steps).
- Machine and date are recorded in `results.json` next to the numbers.

## Current results (Apple M1 Pro, 2026-08-22)

| lib        | nodes | mount ms | pan avg/p95 ms | drag avg/p95 ms |
|------------|------:|---------:|---------------:|----------------:|
| grafloria  |   500 |      262 |    16.8 / 16.8 |     16.7 / 16.8 |
| reactflow  |   500 |      209 |    16.7 / 16.7 |     16.7 / 16.7 |
| grafloria  |  2000 |      415 |    30.3 / 66.8 |     29.9 / 66.7 |
| reactflow  |  2000 |      705 |    17.9 / 33.3 |     16.7 / 16.7 |

Reading that honestly: at 500 nodes both hold 60fps. At 2,000 nodes Grafloria
mounts ~1.7× faster, but **React Flow holds interaction at ~60fps where we
drop to ~30fps** on pan and drag. That's a real finding against us, it's why
this harness exists, and pan-at-scale is now an engine work item — panning
should be a pure viewport transform, and these numbers say ours currently
does more than that.

## Caveats
- One scene, one machine class, default configs. Different node counts, custom
  nodes, or tuned configs will move the numbers.
- Frame times measured via rAF deltas in-page; headless Chromium vsync differs
  from a real display but applies equally to both.
- We will not quote these numbers in marketing while the interaction row is
  ours to fix. When we publish about performance, it will be this harness, in
  public, with whatever it says at that time.
