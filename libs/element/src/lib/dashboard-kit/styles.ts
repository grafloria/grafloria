/**
 * Dashboard-kit stylesheet — injected once, on first `bindDashboardGrid`.
 *
 * Everything is prefixed `axdb-` and scoped under `.grafloria-html-layer`, so
 * binding the kit can never restyle a host's own DOM. Four jobs:
 *
 *  - GLIDE: the reflow transition (the pattern from commit 180a27974) that
 *    makes displaced tiles slide to their new slot while a gesture is live.
 *    The kit arms `.axdb-glide` on the html layer for the WHOLE gesture, so
 *    every accepted moveCheck/resizeCheck animates the neighbours.
 *  - GHOST: the held tile is transition-EXEMPT (it must track the pointer
 *    1:1), floats above everything, and dims + lifts like the prototype's
 *    `.tile.drag`. When a drag leaves the board (drag-out-to-remove) the
 *    ghost dims further as the "release deletes" affordance.
 *  - PLACEHOLDER: the dashed slab that always shows the exact drop result
 *    (the prototype's `#ph`). It JUMPS — never animates — so it is always
 *    truthful about the engine's current cell.
 *  - RESIZE HANDLE: a corner affordance INSIDE each widget card, bottom-right,
 *    radius-matched via `--axdb-rs-radius`, revealed on hover. The binder
 *    injects it into each member host and re-injects if the host repaints
 *    (pages own their card innerHTML).
 */

export const DASHBOARD_KIT_STYLE_ID = 'grafloria-dashboard-kit-styles';

const CSS = `
/* ===== reflow glide (armed on the html layer for the whole gesture) ===== */
.grafloria-html-layer.axdb-glide > .grafloria-node-host {
  transition: left .28s cubic-bezier(.2, 0, .2, 1), top .28s cubic-bezier(.2, 0, .2, 1),
              width .28s cubic-bezier(.2, 0, .2, 1), height .28s cubic-bezier(.2, 0, .2, 1);
}

/* ===== the held tile: transition-exempt ghost, above everything ===== */
.grafloria-html-layer > .grafloria-node-host.axdb-ghost,
.grafloria-html-layer.axdb-glide > .grafloria-node-host.axdb-ghost {
  transition: none;
  z-index: 30;
  opacity: .85;
  cursor: grabbing;
  filter: drop-shadow(0 10px 16px rgba(16, 24, 40, .3));
}
/* Outside the board: release will REMOVE — dim the ghost to say so. */
.grafloria-html-layer > .grafloria-node-host.axdb-ghost.axdb-out { opacity: .35; filter: grayscale(.6); }

/* ===== the placeholder: dashed slab, truthful, never animated ===== */
.grafloria-html-layer > .axdb-ph {
  position: absolute;
  border-radius: var(--axdb-rs-radius, 12px);
  background: rgba(30, 34, 45, .14);
  border: 2px dashed rgba(30, 34, 45, .28);
  box-sizing: border-box;
  pointer-events: none;
  z-index: 0;
  transition: none;
}
@media (prefers-color-scheme: dark) {
  .grafloria-html-layer > .axdb-ph { background: rgba(220, 225, 240, .12); border-color: rgba(220, 225, 240, .3); }
}

/* ===== corner resize handle (hover-revealed, radius-matched) ===== */
.grafloria-node-host > .axdb-rs {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 18px;
  height: 18px;
  cursor: nwse-resize;
  border-right: 3px solid rgba(120, 130, 148, .55);
  border-bottom: 3px solid rgba(120, 130, 148, .55);
  border-bottom-right-radius: var(--axdb-rs-radius, 12px);
  opacity: 0;
  transition: opacity .12s;
  z-index: 5;
}
.grafloria-node-host:hover > .axdb-rs { opacity: 1; }
.grafloria-node-host > .axdb-rs:hover { border-color: #3b52d9; }

/* ===== palette drag-in chip (screen-space clone following the cursor) ===== */
.axdb-drag-chip {
  position: fixed;
  z-index: 9999;
  pointer-events: none;
  opacity: .9;
  filter: drop-shadow(0 8px 14px rgba(16, 24, 40, .3));
}
`;

/** Idempotently inject the kit stylesheet (safe to call per binder). */
export function ensureDashboardKitStyles(doc: Document = document): void {
  if (doc.getElementById(DASHBOARD_KIT_STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = DASHBOARD_KIT_STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}
