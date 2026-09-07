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

/* Motion is a preference (WCAG 2.3.3): no glide for those who asked for none. */
@media (prefers-reduced-motion: reduce) {
  .grafloria-html-layer.axdb-glide > .grafloria-node-host { transition: none; }
}

/* ===== keyboard focus: the roving tab stop shows where it is (WCAG 2.4.7) ===== */
.grafloria-html-layer > .grafloria-node-host:focus-visible {
  outline: 2px solid #3b52d9;
  outline-offset: 2px;
  border-radius: var(--axdb-rs-radius, 6px);
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
  border-radius: var(--axdb-rs-radius, 6px);
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
  width: 24px;   /* WCAG 2.5.8: a 24-px minimum target (was 18) */
  height: 24px;
  cursor: nwse-resize;
  border-right: 3px solid rgba(120, 130, 148, .55);
  border-bottom: 3px solid rgba(120, 130, 148, .55);
  border-bottom-right-radius: var(--axdb-rs-radius, 6px);
  opacity: 0;
  transition: opacity .12s;
  z-index: 5;
}
.grafloria-node-host:hover > .axdb-rs { opacity: 1; }
/* A finger never hovers: on touch devices the corner handle is always visible
   (review D8 — hover-only meant no resize at all on a tablet). */
@media (hover: none) { .grafloria-node-host > .axdb-rs { opacity: .8; } }
.grafloria-node-host > .axdb-rs:hover { border-color: #3b52d9; }
/* RTL boards grow leftwards, so the grab corner mirrors with them. */
.grafloria-node-host > .axdb-rs.axdb-rs--rtl {
  right: auto;
  left: 0;
  cursor: nesw-resize;
  border-right: none;
  border-left: 3px solid rgba(120, 130, 148, .55);
  border-bottom-right-radius: 0;
  border-bottom-left-radius: var(--axdb-rs-radius, 6px);
}

/* ===== palette drag-in chip (screen-space clone following the cursor) ===== */
.axdb-drag-chip {
  position: fixed;
  z-index: 9999;
  pointer-events: none;
  opacity: .9;
  filter: drop-shadow(0 8px 14px rgba(16, 24, 40, .3));
  transition: opacity .12s, filter .12s;
}
/* A bounded board with no room refuses the entry: the chip dims to say so
   (the same signal a tile ghost gives outside the board). Without this rule
   the class was set and nothing showed — a refusal a user could not see. */
.axdb-drag-chip.axdb-out { opacity: .35; filter: grayscale(.7) drop-shadow(0 8px 14px rgba(16, 24, 40, .2)); }

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
  /* 5.95:1 on the card — WCAG 1.4.3 for the 9–11px captions this paints
     (the #7a8496 it replaced sat at 3.77:1, axe-core's first finding). */
  --axdb-muted: #5a6478;
  --axdb-grid: rgba(120, 130, 148, .22);
  --axdb-card: #fff;
  --axdb-line: #e7eaf1;
  --axdb-soft: rgba(120, 130, 148, .14);
  --axdb-up: #0f7a3d;     /* 5.42:1 */
  --axdb-down: #be123c;   /* 6.29:1 */
  /* The categorical palette, as tokens so the dark card can carry its own
     steps: every entry clears 3:1 against its card (WCAG 1.4.11). */
  --axdb-c1: #3b52d9; --axdb-c2: #0369a1; --axdb-c3: #0f766e;
  --axdb-c4: #b45309; --axdb-c5: #6d28d9; --axdb-c6: #475569;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 13px 15px 12px;
  background: var(--axdb-card);
  border: 1px solid var(--axdb-line);
  border-radius: var(--axdb-rs-radius, 6px);
  box-shadow: 0 1px 2px rgba(16, 24, 40, .05), 0 1px 3px rgba(16, 24, 40, .05);
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  color: var(--axdb-ink);
}
/* The host is the card's size container (named, so a widget's inner parts can
   ask the TILE's size as well as their own body's), so the card can shed its
   padding as the tile gets short instead of clipping its own content. */
.grafloria-html-layer > .grafloria-node-host { container: axdb-tile / size; }
/* Two class hops on the header: these blocks precede the header's own rule
   below and would lose the cascade at equal specificity — at 54 px the margin
   stayed 8 px, the body shrank to 14 px and the KPI figure hid. */
@container axdb-tile (max-height: 90px) {
  .axdb-widget { padding: 8px 14px 7px; }
  .axdb-widget > .axdb-widget-h { margin-bottom: 4px; }
}
@container axdb-tile (max-height: 46px) {
  .axdb-widget { padding: 4px 12px 3px; }
  .axdb-widget > .axdb-widget-h { margin-bottom: 0; }
}
@container axdb-tile (max-height: 26px) {
  .axdb-widget { padding: 2px 12px 1px; }
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
/* The data behind a chart, for readers that cannot see the chart: present in
   the accessibility tree, absent from the picture (WCAG 1.1.1). */
.axdb-sr {
  position: absolute; top: 0; left: 0; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden;
  clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; border: 0;
}
.axdb-widget-empty {
  display: flex; align-items: center; justify-content: center; height: 100%;
  font: 500 11.5px/1.3 system-ui, sans-serif; color: var(--axdb-muted);
}

/* kpi: value + delta stack, the spark yields its height before they do */
/* A SIZE CONTAINER, so the card's type scales with the tile instead of
   clipping. Fit-mode shrinks tiles when rows are added (dropping a chart above
   the KPI row took these from 122px to 85px) and fixed 30px/12px lines were
   sliced mid-glyph by the card's overflow — the audited "trimmed" widgets.
   cqh = 1% of the body's own height, clamped so full-size tiles look exactly
   as before and short tiles compress instead of cutting. */
.axdb-widget-b.axdb-kpi { display: flex; flex-direction: column; container: axdb-kpi / size; }
/* STEP DOWN, NEVER CLIP. As the body gets shorter the sparkline goes first, then the
   delta, then the value — the header alone at the row floor. Before this a 99-px row
   drew the sparkline as a 13-px sliver and a 28-px row cut the value mid-glyph (the
   fluid board, after a drag pushed the KPI row down). Thresholds are body heights. */
/* Two class hops, so these outrank ".axdb-widget-b > svg { display: block }" —
   a bare .axdb-kpi-s lost that cascade and the sparkline stayed. */
@container (max-height: 78px) { .axdb-kpi > .axdb-kpi-s { display: none; } }
@container (max-height: 40px) { .axdb-kpi > .axdb-kpi-d { display: none; } }
@container (max-height: 16px) { .axdb-kpi > .axdb-kpi-v { display: none; } }
.axdb-kpi-v { font: 700 clamp(15px, 44cqh, 30px)/1.05 system-ui, sans-serif; letter-spacing: -.02em; color: var(--axdb-ink); white-space: nowrap; }
.axdb-kpi-d { margin-top: clamp(1px, 5cqh, 6px); font: 600 clamp(9px, 19cqh, 12px)/1.2 system-ui, sans-serif; white-space: nowrap; }
.axdb-kpi-d span { color: var(--axdb-muted); font-weight: 500; }
.axdb-kpi-d.up { color: var(--axdb-up); }
.axdb-kpi-d.down { color: var(--axdb-down); }
/* Grows into a tall tile (a 3-row KPI is not a number over a void) and never
   takes more than two fifths of the body. */
.axdb-kpi-s { margin-top: auto; height: auto; min-height: 0; flex: 1 1 34px; max-height: 40%; }
/* SHORT AND WIDE — a one-row KPI on a fluid board. Stacked, a short tile dropped
   its sparkline and left a small figure in the corner of an empty card. Here the
   figure, its delta and the sparkline sit in a row and the spark fills the width.
   The outer query asks the TILE (host), the inner one the body, so a strip too
   thin for a readable spark (under 24 px) keeps the figure alone. 340 px is what
   a figure, its delta, the gaps and a spark worth reading need — the builder's
   236-px tiles got a 40-px wedge of spark beside the delta. */
@container axdb-tile (max-height: 125px) and (min-width: 340px) {
  .axdb-widget--kpi > .axdb-kpi { flex-direction: row; align-items: center; gap: 14px; }
  .axdb-widget--kpi .axdb-kpi-d { margin-top: 0; }
  @container axdb-kpi (min-height: 24px) {
    .axdb-kpi > .axdb-kpi-s { display: block; flex: 1 1 40%; min-width: 80px; height: 100%; max-height: 100%; margin-top: 0; align-self: stretch; }
  }
}
/* THE STRIP (row floor): header and figure on one line, the spark beside them
   when the tile is wide enough. */
@container axdb-tile (max-height: 46px) {
  .axdb-widget--kpi { flex-direction: row; align-items: center; gap: 12px; }
  .axdb-widget--kpi > .axdb-widget-h { flex: none; }
  /* The body is a SIZE container: in a centred row it would collapse to zero
     and every height query would fire. It takes the card's full inner height. */
  .axdb-widget--kpi > .axdb-kpi { flex: 1; align-self: stretch; }
}

/* SPLIT LAYOUT chrome: a divider sits in the gap between two siblings (a
   24-px hit zone around a 10-px gap) and shows its line on hover or while
   dragged; the insertion line marks the edge a dragged widget will land on. */
.grafloria-html-layer > .axdb-div { position: absolute; z-index: 2; pointer-events: auto; background: transparent; }
.grafloria-html-layer > .axdb-div--row { cursor: col-resize; }
.grafloria-html-layer > .axdb-div--column { cursor: row-resize; }
.grafloria-html-layer > .axdb-div::after {
  content: ""; position: absolute; border-radius: 2px; background: #3b52d9; opacity: 0; transition: opacity .12s ease;
}
.grafloria-html-layer > .axdb-div--row::after { left: 50%; top: 8px; bottom: 8px; width: 4px; margin-left: -2px; }
.grafloria-html-layer > .axdb-div--column::after { top: 50%; left: 8px; right: 8px; height: 4px; margin-top: -2px; }
.grafloria-html-layer > .axdb-div:hover::after, .grafloria-html-layer > .axdb-div.axdb-active::after { opacity: .9; }
.grafloria-html-layer > .axdb-ins {
  position: absolute; z-index: 3; pointer-events: none; border-radius: 2px;
  background: #3b52d9; box-shadow: 0 0 0 3px rgba(59, 82, 217, .22);
}
@media (prefers-reduced-motion: reduce) { .grafloria-html-layer > .axdb-div::after { transition: none; } }

/* donut: ring beside its legend. The ring takes the body's height (a tall
   tile gets a bigger ring, not dead card), square, capped so its centre figure
   stays a figure and not a headline. */
.axdb-widget-b.axdb-donut { display: flex; align-items: center; gap: 10px; }
.axdb-widget-b.axdb-donut > svg {
  flex: 0 0 auto; width: auto; height: 100%; max-height: 260px; max-width: 60%; aspect-ratio: 1 / 1;
}

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
    --axdb-up: #4ade80;
    --axdb-down: #fb7185;
    --axdb-c1: #8b9cff; --axdb-c2: #38bdf8; --axdb-c3: #2dd4bf;
    --axdb-c4: #fbbf24; --axdb-c5: #a78bfa; --axdb-c6: #94a3b8;
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
