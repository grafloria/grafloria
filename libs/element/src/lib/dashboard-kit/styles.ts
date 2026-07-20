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
/* RTL boards grow leftwards, so the grab corner mirrors with them. */
.grafloria-node-host > .axdb-rs.axdb-rs--rtl {
  right: auto;
  left: 0;
  cursor: nesw-resize;
  border-right: none;
  border-left: 3px solid rgba(120, 130, 148, .55);
  border-bottom-right-radius: 0;
  border-bottom-left-radius: var(--axdb-rs-radius, 12px);
}

/* ===== palette drag-in chip (screen-space clone following the cursor) ===== */
.axdb-drag-chip {
  position: fixed;
  z-index: 9999;
  pointer-events: none;
  opacity: .9;
  filter: drop-shadow(0 8px 14px rgba(16, 24, 40, .3));
}

/* ===========================================================================
   BUILT-IN WIDGET CARDS — what widgets.ts paints when a page writes no
   renderWidget. Class-prefixed (never element selectors), so this can only
   ever style DOM the kit itself produced. Colours are CSS variables on the
   card, so a page re-skins every built-in widget by setting them once; the
   corner radius follows --axdb-rs-radius, which is also the placeholder's and
   the resize handle's, so the three can never drift apart.
   =========================================================================== */
.axdb-widget {
  --axdb-ink: #1f2430;
  --axdb-muted: #7a8496;
  --axdb-grid: rgba(120, 130, 148, .22);
  --axdb-card: #fff;
  --axdb-line: #e7eaf1;
  --axdb-soft: rgba(120, 130, 148, .14);
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 13px 15px 12px;
  background: var(--axdb-card);
  border: 1px solid var(--axdb-line);
  border-radius: var(--axdb-rs-radius, 12px);
  box-shadow: 0 1px 2px rgba(16, 24, 40, .05), 0 1px 3px rgba(16, 24, 40, .05);
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  color: var(--axdb-ink);
}
.axdb-widget-h {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  font: 600 11px/1.3 system-ui, sans-serif;
  letter-spacing: .4px;
  text-transform: uppercase;
  color: var(--axdb-muted);
}
.axdb-widget-b { flex: 1; min-height: 0; position: relative; }
.axdb-widget-b > svg { display: block; width: 100%; height: 100%; }
.axdb-widget-b.axdb-scroll { overflow: auto; }
/* A chart WITH a legend under it: the plot yields height, the legend keeps its
   own (without this the 100%-tall svg pushes the legend out of the card). */
.axdb-widget-b.axdb-has-lg { display: flex; flex-direction: column; }
.axdb-widget-b.axdb-has-lg > svg { flex: 1; height: auto; min-height: 0; }
.axdb-widget-empty {
  display: flex; align-items: center; justify-content: center; height: 100%;
  font: 500 11.5px/1.3 system-ui, sans-serif; color: var(--axdb-muted); opacity: .75;
}

/* kpi: value + delta stack, the spark yields its height before they do */
.axdb-widget-b.axdb-kpi { display: flex; flex-direction: column; }
.axdb-kpi-v { font: 700 30px/1.05 system-ui, sans-serif; letter-spacing: -.02em; color: var(--axdb-ink); }
.axdb-kpi-d { margin-top: 6px; font: 600 12px/1.2 system-ui, sans-serif; }
.axdb-kpi-d span { color: var(--axdb-muted); font-weight: 500; }
.axdb-kpi-d.up { color: #12a150; }
.axdb-kpi-d.down { color: #e11d48; }
.axdb-kpi-s { margin-top: auto; height: 34px; min-height: 0; flex: 0 1 34px; }

/* donut: ring beside its legend */
.axdb-widget-b.axdb-donut { display: flex; align-items: center; gap: 10px; }
.axdb-widget-b.axdb-donut > svg { max-width: 150px; }

/* legend chips, shared by line and donut */
.axdb-lg { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 9px; }
.axdb-lg--col { flex-direction: column; flex-wrap: nowrap; gap: 6px; margin-top: 0; }
.axdb-lg i {
  display: inline-flex; align-items: center; gap: 5px; font-style: normal;
  font: 500 11px/1.3 system-ui, sans-serif; color: var(--axdb-muted);
}
.axdb-lg i b { width: 9px; height: 9px; border-radius: 3px; flex: none; }

/* table */
.axdb-table { width: 100%; border-collapse: collapse; font-size: 12px; color: var(--axdb-ink); }
.axdb-table th {
  text-align: left; padding: 4px 8px 7px; border-bottom: 1px solid var(--axdb-line);
  font: 600 10px/1.3 system-ui, sans-serif; letter-spacing: .4px; text-transform: uppercase;
  color: var(--axdb-muted);
}
.axdb-table td { padding: 6px 8px; border-bottom: 1px solid var(--axdb-line); white-space: nowrap; }
.axdb-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
.axdb-table tr:last-child td { border-bottom: none; }

@media (prefers-color-scheme: dark) {
  .axdb-widget {
    --axdb-ink: #eceef4;
    --axdb-muted: #98a1b4;
    --axdb-grid: rgba(150, 160, 182, .2);
    --axdb-card: #1a1d25;
    --axdb-line: #2b3040;
    --axdb-soft: rgba(150, 160, 182, .16);
  }
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
