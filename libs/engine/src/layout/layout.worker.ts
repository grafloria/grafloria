// Wave 7 (Auto-layout) — Card 3: the layout worker.
//
// This is the whole worker. It is three lines, and that is the point: the
// message loop IS `serveLayout`, the same loop the inline host runs, so there is
// no worker-flavoured copy of anything to drift out of sync with the main-thread
// copy.
//
// WHAT WAS HERE BEFORE, AND WHY IT COULD NOT WORK
// -----------------------------------------------
// 256 lines that nothing ever instantiated. It:
//
//   • deserialized into NodeModels and called dagre — but its `handleCancel`
//     only set a flag, and (as its own comment conceded) "hoped the algorithm
//     checks it periodically". No algorithm did. Worse, a worker that is inside
//     a synchronous 300-iteration loop is not reading its message queue at all,
//     so the cancel it was hoping for could not even be DELIVERED until the loop
//     it meant to interrupt had already finished. Cancellation was unreachable
//     twice over.
//   • sent progress at four hardcoded points (0/10/30/90) that described the
//     worker's own bookkeeping rather than the algorithm's actual advancement —
//     and the pool on the other end never wired a callback to receive them.
//
// The fix for both is structural, and it lives in layout-host.ts: the algorithm
// is driven one iteration at a time, the loop yields the thread periodically so
// messages actually land, and progress is the real iteration count.
//
// BUILDING IT
// -----------
// The engine deliberately does not construct this Worker — that would bake one
// bundler's URL scheme into a library. The application does:
//
//     const worker = new Worker(new URL('./layout.worker', import.meta.url),
//                               { type: 'module' });
//     engine.setLayoutPort(worker as unknown as LayoutPort);
//
// Only the built-in algorithms are available in here. A layout registered at
// runtime is a closure, and closures do not survive postMessage — those run
// inline, and `LayoutHost` handles that without the caller noticing.

/// <reference lib="webworker" />

import { serveLayout, type LayoutServePort } from './layout-host';

serveLayout(self as unknown as LayoutServePort);
