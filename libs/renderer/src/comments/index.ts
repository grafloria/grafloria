// Wave 9 (Collaboration) — Card 6: the comment overlay.
//
//   comment-pins    — the pins IN the canvas. A pure VNode function in WORLD coordinates,
//                     so pan/zoom carry them for free and SSR/export keep them. Each pin
//                     is a named `role=button` in the diagram's roving tabindex.
//   comment-panel   — the conversation ITSELF, as real HTML: headings, a list, a labelled
//                     reply box, Escape to leave. Not a keyboard trap.
//   comment-overlay — the controller. Owns the LOCAL view state (selection, focus, read
//                     markers) and is the one place that keeps wave 8's FRAME GATE honest:
//                     anything the model cannot see calls `renderer.invalidateFrame()`.

export * from './comment-pins';
export * from './comment-panel';
export * from './comment-overlay';
