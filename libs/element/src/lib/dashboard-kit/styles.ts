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
  outline: 2px solid var(--axdb-accent, #3b52d9);
  outline-offset: 2px;
  border-radius: var(--axdb-rs-radius, 3px);
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
  border-radius: var(--axdb-rs-radius, 3px);
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
:is(.grafloria-node-host, .axdb-slab) > .axdb-rs {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 24px;   /* WCAG 2.5.8: a 24-px minimum target (was 18) */
  height: 24px;
  cursor: nwse-resize;
  border-right: 3px solid rgba(120, 130, 148, .55);
  border-bottom: 3px solid rgba(120, 130, 148, .55);
  border-bottom-right-radius: var(--axdb-rs-radius, 3px);
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
:is(.grafloria-node-host, .axdb-slab) > .axdb-rs.axdb-rs--rtl {
  right: auto;
  left: 0;
  cursor: nesw-resize;
  border-right: none;
  border-left: 3px solid rgba(120, 130, 148, .55);
  border-bottom-right-radius: 0;
  border-bottom-left-radius: var(--axdb-rs-radius, 3px);
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
/* A tab dragged off its strip: VS Code carries the TAB, not the editor, so
   what follows the pointer is a chip wearing the tab's own label. */
.axdb-tab-chip {
  padding: 5px 12px;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font: 500 12px/1.4 var(--axdb-font, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif);
  color: var(--axdb-tabs-on-fg, #1f2430);
  background: var(--axdb-tabs-on-bg, #fff);
  border-radius: var(--axdb-rs-radius, 3px);
  box-shadow: 0 0 0 1px rgba(31, 36, 48, .12);
}
@media (prefers-color-scheme: dark) {
  .axdb-tab-chip {
    color: var(--axdb-tabs-on-fg, #eceef4);
    background: var(--axdb-tabs-on-bg, #1a1d25);
    box-shadow: 0 0 0 1px rgba(236, 238, 244, .16);
  }
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
  border-radius: var(--axdb-rs-radius, 3px);
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
/* Drag-handle mode (DevExpress drags an item by its caption): the header is
   the grip and says so with a dot pattern and a grab cursor; the body keeps
   its own cursor because a press there starts nothing. */
.axdb-drag-handle .axdb-widget > .axdb-widget-h { cursor: grab; }
.axdb-drag-handle .axdb-widget > .axdb-widget-h::before {
  content: ''; flex: none; width: 8px; height: 12px; opacity: .55;
  background: radial-gradient(circle, currentColor 1.1px, transparent 1.5px) 0 0 / 4px 4px;
}
/* A PAINTED GRIP (dragHandle: { grip: true }): the only drag zone, a small
   dotted tab along the card's top edge. Inside sits in the header band and
   the header makes room for it; outside is a tab above the card, the
   DevExpress item bar. The host must not clip it. */
.grafloria-node-host > .axdb-grip {
  position: absolute; z-index: 4; box-sizing: border-box; width: 24px; height: 12px;
  border: 1px solid var(--axdb-line, #e7eaf1); border-radius: 3px; background: var(--axdb-card, #fff);
  color: var(--axdb-muted, #5a6478); cursor: grab;
  /* Shown on the SELECTED widget only (the DevExpress designer shows an item's
     bar on the selected item): a press or keyboard focus selects, a void
     click clears. Hidden, it takes no pointer either. */
  opacity: 0; pointer-events: none; transition: opacity .12s ease;
}
.grafloria-node-host.axdb-selected > .axdb-grip, .grafloria-node-host:focus-within > .axdb-grip { opacity: 1; pointer-events: auto; }
.grafloria-node-host > .axdb-grip::before {
  content: ''; position: absolute; left: 5px; top: 2px; width: 12px; height: 6px;
  background: radial-gradient(circle, currentColor 1px, transparent 1.4px) 0 0 / 4px 3px;
}
.grafloria-node-host > .axdb-grip:hover { border-color: var(--axdb-accent, #3b52d9); color: var(--axdb-accent, #3b52d9); }
/* The selected card says so, quietly. --axdb-accent themes the grip's hover, the
   ring and the focus outline together; --axdb-accent-ring the ring alone. */
.grafloria-node-host.axdb-selected > .axdb-widget { box-shadow: 0 0 0 1.5px var(--axdb-accent-ring, rgba(59, 82, 217, .55)), 0 1px 2px rgba(16, 24, 40, .05), 0 1px 3px rgba(16, 24, 40, .05); }
/* While a resize edge is near, the host and everything in it (a chart canvas
   with its own cursor included) show the edge's cursor. */
.grafloria-node-host[data-axdb-edge="ns-resize"], .grafloria-node-host[data-axdb-edge="ns-resize"] * { cursor: ns-resize !important; }
.grafloria-node-host[data-axdb-edge="ew-resize"], .grafloria-node-host[data-axdb-edge="ew-resize"] * { cursor: ew-resize !important; }
.grafloria-node-host[data-axdb-edge="nwse-resize"], .grafloria-node-host[data-axdb-edge="nwse-resize"] * { cursor: nwse-resize !important; }
.grafloria-node-host[data-axdb-edge="nesw-resize"], .grafloria-node-host[data-axdb-edge="nesw-resize"] * { cursor: nesw-resize !important; }
/* INSIDE: centred on the header's text line and flush with the card padding,
   per size tier (padding 13/15, then 8/14, 4/12, 2/12). */
.grafloria-node-host > .axdb-grip--inside { top: 14px; }
.grafloria-node-host > .axdb-grip--inside.axdb-grip--left { left: 15px; }
.grafloria-node-host > .axdb-grip--inside.axdb-grip--right { right: 15px; }
.grafloria-node-host > .axdb-grip--inside.axdb-grip--center { top: 3px; }
@container axdb-tile (max-height: 90px) {
  .grafloria-node-host > .axdb-grip--inside { top: 9px; }
  .grafloria-node-host > .axdb-grip--inside.axdb-grip--left { left: 14px; }
  .grafloria-node-host > .axdb-grip--inside.axdb-grip--right { right: 14px; }
  .grafloria-node-host > .axdb-grip--inside.axdb-grip--center { top: 2px; }
}
@container axdb-tile (max-height: 46px) {
  .grafloria-node-host > .axdb-grip--inside { top: 5px; }
  .grafloria-node-host > .axdb-grip--inside.axdb-grip--left { left: 12px; }
  .grafloria-node-host > .axdb-grip--inside.axdb-grip--right { right: 12px; }
  .grafloria-node-host > .axdb-grip--inside.axdb-grip--center { top: 1px; }
}
@container axdb-tile (max-height: 26px) {
  .grafloria-node-host > .axdb-grip--inside { top: 2px; }
}
/* OUTSIDE: a tab on the card's top edge, its corners in line with the card's. */
/* The OUTSIDE tab lives in the gap between tiles: never taller than the gap
   less a pixel (an 11-px tab in a 10-px gap sat on the tile above), never
   shorter than 6 px so the dots still read. */
.grafloria-node-host > .axdb-grip--outside { top: calc(-1 * clamp(6px, var(--axdb-gap, 11px) - 1px, 11px)); height: clamp(6px, calc(var(--axdb-gap, 11px) - 1px), 11px); border-bottom-left-radius: 0; border-bottom-right-radius: 0; border-bottom: 0; box-shadow: 0 -1px 2px rgba(16, 24, 40, .08); }
.grafloria-node-host > .axdb-grip--outside.axdb-grip--left { left: 10px; }
.grafloria-node-host > .axdb-grip--outside.axdb-grip--right { right: 10px; }
.grafloria-node-host > .axdb-grip--center { left: 50%; transform: translateX(-50%); }
/* The header makes room for an inside grip on its side; a centred one sits above it. */
.grafloria-node-host.axdb-gp-inside.axdb-gp-left .axdb-widget > .axdb-widget-h { padding-left: 32px; }
.grafloria-node-host.axdb-gp-inside.axdb-gp-right .axdb-widget > .axdb-widget-h { padding-right: 32px; }
.grafloria-node-host.axdb-gp-inside.axdb-gp-center .axdb-widget > .axdb-widget-h { padding-top: 12px; }
.axdb-widget-b { flex: 1; min-height: 0; position: relative; }
/* A drag across a STATIC board (nothing prevents the press's default there)
   used to select every label on it; kit cards are not prose. Tables stay
   copyable — a figure in a grid is the one thing a viewer selects. */
.axdb-widget { user-select: none; -webkit-user-select: none; }
.axdb-widget .axdb-table { user-select: text; -webkit-user-select: text; }
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
/* A legend taller than a SHORT body (a 2-row donut on a squeezed board) is
   clipped at its own foot, not centred over the title above it. */
.axdb-widget-b.axdb-donut > .axdb-lg--col { max-height: 100%; min-height: 0; overflow: hidden; }
.axdb-widget-b.axdb-donut > svg {
  flex: 0 0 auto; width: auto; height: 100%; max-height: 260px; max-width: 60%; aspect-ratio: 1 / 1;
}

/* READABILITY TIERS (widgets.ts chartTier): the text is always in the DOM;
   what a short body cannot afford is hidden, not dropped. */
.axdb-tier-1 .axdb-yt--q, .axdb-tier-1 .axdb-yl--q,
.axdb-tier-2 .axdb-yt--q, .axdb-tier-2 .axdb-yl--q,
.axdb-tier-2 .axdb-yt--h, .axdb-tier-2 .axdb-yl--h,
.axdb-tier-2 .axdb-xt, .axdb-tier-2 .axdb-vt,
.axdb-lg--off { display: none; }

/* SECTION CHROME: a pointer-transparent overlay on every member group. It
   wears the selection ring and, while selected, the corner handle. */
.grafloria-html-layer > .axdb-slab { position: absolute; pointer-events: none; border-radius: var(--axdb-rs-radius, 3px); z-index: 4; }
/* Selected, the overlay rises above the tiles so ITS corner handle wins a
   corner it shares with a child's; unselected, its handle takes no presses. */
.grafloria-html-layer > .axdb-slab.axdb-slab--selected { z-index: 6; box-shadow: 0 0 0 1.5px var(--axdb-accent-ring, rgba(59, 82, 217, .55)); }
.grafloria-html-layer > .axdb-slab > .axdb-rs { pointer-events: none; opacity: 0; }
.grafloria-html-layer > .axdb-slab.axdb-slab--selected > .axdb-rs { pointer-events: auto; opacity: 1; }
.grafloria-html-layer > .axdb-slab.axdb-slab--static > .axdb-rs { display: none; }

/* SECTION CAPTION (0.4.22): the band on the slab. Geometry is inline (the
   reserve and the pixels come from one function); everything visual is a
   variable the options write and a theme may override. The band takes the
   pointer — the slab does not — so a press on it is the section's. */
.grafloria-html-layer > .axdb-slab > .axdb-slab-h {
  position: absolute; box-sizing: border-box; pointer-events: auto; z-index: 1;
  display: flex; align-items: center; gap: 6px; min-width: 0;
  padding: var(--axdb-caption-pad, 0 10px);
  background: var(--axdb-caption-bg, rgba(31, 36, 48, .055));
  /* A hairline by default: two bands meeting (a captioned section inside a
     captioned section) read as two headers, not one grey block. */
  border-bottom: var(--axdb-caption-border, 1px solid rgba(31, 36, 48, .1));
  color: var(--axdb-caption-fg, #1f2430);
  font: var(--axdb-caption-font-weight, 600) var(--axdb-caption-font-size, 13px)/1.2 var(--axdb-caption-font-family, system-ui, -apple-system, "Segoe UI", sans-serif);
  text-transform: var(--axdb-caption-transform, none);
  letter-spacing: .01em;
  border-radius: var(--axdb-rs-radius, 3px) var(--axdb-rs-radius, 3px) 0 0;
  cursor: default; user-select: none; -webkit-user-select: none; overflow: hidden;
  transition: opacity .12s;
}
/* The modifiers carry the band's own selector so they outrank its defaults. */
.grafloria-html-layer > .axdb-slab > .axdb-slab-h.axdb-slab-h--center { justify-content: center; }
.grafloria-html-layer > .axdb-slab > .axdb-slab-h.axdb-slab-h--end { justify-content: flex-end; }
.grafloria-html-layer > .axdb-slab > .axdb-slab-h.axdb-slab-h--vtop { align-items: flex-start; }
.grafloria-html-layer > .axdb-slab > .axdb-slab-h.axdb-slab-h--vbottom { align-items: flex-end; }
/* 'tab': the same band sized to its text, a chip at the leading corner. It
   reserves its height like 'inside' — see captionReserve. */
.grafloria-html-layer > .axdb-slab > .axdb-slab-h.axdb-slab-h--tab {
  max-width: 100%; border-radius: var(--axdb-rs-radius, 3px);
  border-bottom: var(--axdb-caption-border-tab, none);
  box-shadow: inset 0 0 0 1px rgba(31, 36, 48, .08);
}
/* 'hover': an overlay. It reserves nothing, so while hidden it must not take
   the pointer (an invisible band swallowed clicks on the content beneath),
   and while shown it paints OPAQUE — a 5% tint over a chart is a smear. */
.grafloria-html-layer > .axdb-slab > .axdb-slab-h.axdb-slab-h--hover {
  opacity: 0; pointer-events: none;
  background: var(--axdb-caption-bg, #fff);
  box-shadow: 0 1px 4px rgba(31, 36, 48, .16);
}
/* .axdb-slab--hot is set by the binder from the live pointer (the overlay
   takes no pointer of its own, so CSS :hover can never fire on it). */
.grafloria-html-layer > .axdb-slab.axdb-slab--hot > .axdb-slab-h.axdb-slab-h--hover,
.grafloria-html-layer > .axdb-slab.axdb-slab--selected > .axdb-slab-h.axdb-slab-h--hover { pointer-events: auto; opacity: 1; }
/* the actions of a hovered or selected section */
.grafloria-html-layer > .axdb-slab.axdb-slab--hot > .axdb-slab-h > .axdb-slab-h-actions { opacity: 1; }
/* the tight tier: a section under 90 px */
.grafloria-html-layer > .axdb-slab > .axdb-slab-h.axdb-slab-h--tight { font-size: min(var(--axdb-caption-font-size, 12px), 12px); gap: 4px; }
.axdb-slab-h--tight .axdb-slab-h-sub, .axdb-slab-h--tight .axdb-slab-h-actions { display: none; }
.axdb-slab-h-icon { flex: none; }
.axdb-slab-h-body { display: flex; flex-direction: column; justify-content: center; min-width: 0; flex: 0 1 auto; }
.axdb-slab-h-text, .axdb-slab-h-sub { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.axdb-slab-h-sub { font-size: .85em; font-weight: 500; opacity: .72; }
.axdb-slab-h-info { flex: none; opacity: .6; font-size: .9em; cursor: help; }
.axdb-slab-h-actions { flex: none; display: flex; gap: 2px; margin-inline-start: auto; opacity: 0; transition: opacity .12s; }
.axdb-slab-h--center .axdb-slab-h-actions, .axdb-slab-h--end .axdb-slab-h-actions { margin-inline-start: 0; }
.axdb-slab-h:hover > .axdb-slab-h-actions, .axdb-slab--selected > .axdb-slab-h > .axdb-slab-h-actions, .axdb-slab-h:focus-within > .axdb-slab-h-actions { opacity: 1; }
.axdb-slab-h-action {
  all: unset; box-sizing: border-box; width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center;
  border-radius: 4px; cursor: pointer; font-size: 14px; line-height: 1; color: inherit;
}
.axdb-slab-h-action:hover { background: rgba(31, 36, 48, .08); }
.axdb-slab-h-action:focus-visible { outline: 2px solid var(--axdb-accent-ring, rgba(59, 82, 217, .55)); outline-offset: -2px; }
.axdb-slab-h-action[disabled] { opacity: .4; cursor: default; }
.axdb-slab-h-action[disabled]:hover { background: none; }
.grafloria-html-layer > .axdb-slab.axdb-slab--static > .axdb-slab-h { cursor: default; }
@media (prefers-color-scheme: dark) {
  .grafloria-html-layer > .axdb-slab > .axdb-slab-h {
    background: var(--axdb-caption-bg, rgba(236, 238, 244, .07));
    color: var(--axdb-caption-fg, #eceef4);
    border-bottom: var(--axdb-caption-border, 1px solid rgba(236, 238, 244, .12));
  }
  .grafloria-html-layer > .axdb-slab > .axdb-slab-h.axdb-slab-h--tab { box-shadow: inset 0 0 0 1px rgba(236, 238, 244, .12); }
  .grafloria-html-layer > .axdb-slab > .axdb-slab-h.axdb-slab-h--hover { background: var(--axdb-caption-bg, #1a1d25); box-shadow: 0 1px 4px rgba(0, 0, 0, .5); }
  .axdb-slab-h-action:hover { background: rgba(236, 238, 244, .1); }
}

/* TAB CONTAINER (0.4.27): a strip of pages across the container's top. The
   strip takes the pointer (the tabs are real buttons); the pages below it are
   ordinary boards. */
.grafloria-html-layer > .axdb-tabs {
  position: absolute; box-sizing: border-box; pointer-events: auto; z-index: 5;
  display: flex; align-items: flex-end; gap: 2px; padding: 0 6px; overflow-x: auto; overflow-y: hidden;
  background: var(--axdb-tabs-bg, rgba(31, 36, 48, .05));
  border-bottom: 1px solid var(--axdb-tabs-line, rgba(31, 36, 48, .12));
  border-radius: var(--axdb-rs-radius, 3px) var(--axdb-rs-radius, 3px) 0 0;
  scrollbar-width: thin;
}
.axdb-tabs--center { justify-content: center; }
.axdb-tabs--end { justify-content: flex-end; }
.axdb-tabs--stretch > .axdb-tab { flex: 1 1 0; }
.axdb-tab {
  all: unset; box-sizing: border-box; flex: 0 0 auto; max-width: 200px;
  padding: 0 12px; height: calc(100% - 4px); display: inline-flex; align-items: center;
  font: 600 12px/1 system-ui, -apple-system, "Segoe UI", sans-serif;
  color: var(--axdb-tabs-fg, #5a6478); cursor: pointer;
  border-radius: var(--axdb-rs-radius, 3px) var(--axdb-rs-radius, 3px) 0 0;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.axdb-tab:hover { background: rgba(31, 36, 48, .06); }
.axdb-tab:focus-visible { outline: 2px solid var(--axdb-accent-ring, rgba(59, 82, 217, .55)); outline-offset: -2px; }
/* The active tab reads as the front page: the card's own ground, lifted. */
.axdb-tab.axdb-tab--on {
  background: var(--axdb-tabs-on-bg, #fff);
  color: var(--axdb-tabs-on-fg, #1f2430);
  box-shadow: 0 -1px 0 var(--axdb-accent, #3b52d9) inset, 0 0 0 1px rgba(31, 36, 48, .1);
}
@media (prefers-color-scheme: dark) {
  .grafloria-html-layer > .axdb-tabs { background: var(--axdb-tabs-bg, rgba(236, 238, 244, .06)); border-bottom-color: var(--axdb-tabs-line, rgba(236, 238, 244, .14)); }
  .axdb-tab { color: var(--axdb-tabs-fg, #98a1b4); }
  .axdb-tab:hover { background: rgba(236, 238, 244, .08); }
  .axdb-tab.axdb-tab--on { background: var(--axdb-tabs-on-bg, #1a1d25); color: var(--axdb-tabs-on-fg, #eceef4); box-shadow: 0 -1px 0 var(--axdb-accent, #7d8ff0) inset, 0 0 0 1px rgba(236, 238, 244, .14); }
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
export function ensureDashboardKitStyles(doc?: Document): void {
  // SERVER-SAFE: `dashboard()` is a pure spec builder and runs where there is
  // no document (SSR, a Node script sizing a board). A default parameter of
  // `document` threw ReferenceError there — the packaging gate's raw-Node
  // import caught it. No document, no stylesheet, no error.
  const d = doc ?? (typeof document !== 'undefined' ? document : undefined);
  if (!d || d.getElementById(DASHBOARD_KIT_STYLE_ID)) return;
  const style = d.createElement('style');
  style.id = DASHBOARD_KIT_STYLE_ID;
  style.textContent = CSS;
  d.head.appendChild(style);
}
