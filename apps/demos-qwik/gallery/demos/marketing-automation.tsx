import { component$, $, noSerialize, useSignal, useTask$, useVisibleTask$ } from '@builder.io/qwik';
import type { NoSerialize, Signal } from '@builder.io/qwik';
import { GrafloriaFlow } from '@grafloria/qwik';
import type { DiagramInstance } from '@grafloria/qwik';
import { markReady } from '../ready';
import {
  MarketingAutomation, initialUi, INTERACTION, RENDERER, MIN_ZOOM, MAX_ZOOM, DELAY_UNITS, type MaUi, type FieldUi,
} from './marketing-automation-controller';

/**
 * A marketing-automation studio on the Grafloria engine, built top-down:
 *
 *   • The automation is a TREE kept as plain JSON (marketing-automation-model.ts):
 *     a trigger, a spine of steps, Branches that fan out into named paths. The
 *     tidy-tree layout there decides every position — nothing is hand-placed —
 *     and every edit re-flows the whole tree with a short animation.
 *   • Steps are HTML cards (metadata.html) on rounded-rect nodes. Lines are real
 *     links, orthogonal with rounded corners (manual waypoints from the layout),
 *     and each Branch path carries its name as a chip (a link label).
 *   • The "+" buttons are WORLD-SPACE portals (createViewportPortal) — they pan
 *     and zoom with the canvas. Every line has one; so does the end of every
 *     path; the dashed one beside a Branch adds a path.
 *   • Every edit is a snapshot command on the engine's own CommandManager, so
 *     the toolbar, ⌘Z / Ctrl+Z and ⇧⌘Z all walk one history.
 *   • Test flow plans the run a sample contact would take and animates it: a
 *     token rides the lines, steps light up, delays fast-forward.
 *
 * The engine side (layout, re-flow, "+" buttons, history, keyboard, minimap, the
 * Test flow's token) lives in MarketingAutomation (marketing-automation-controller.ts,
 * shared by the four framework versions, noSerialize'd — it holds the live
 * instance); these components render the chrome — top bar, property panel,
 * step menu, dialogs, toast, navigator — from its `MaUi`.
 */

const CSS = `
/* The JS page's own stylesheet, verbatim — except that the stage fills the
   whole view (the gallery shell wraps the route) and the page-level resets the
   JS page gets from the gallery's demo.css are scoped to the stage here. */
#stage, #stage *, #stage *::before, #stage *::after { box-sizing: border-box; }
#stage { color-scheme: light dark; -webkit-font-smoothing: antialiased; }
/* ---- palette (light; dark below) ------------------------------------------ */
#stage {
  --ma-bg: #f5f6fa; --ma-dot: #dde1ea;
  --ma-card: #ffffff; --ma-card-line: #e0e4ed; --ma-ink: #1d2433; --ma-mut: #6a7387; --ma-faint: #98a0b3;
  --ma-accent: #3b52d9; --ma-accent-ink: #2a3ca8; --ma-accent-wash: #eef1fe;
  --ma-done: #1f9d55; --ma-done-wash: #e5f5eb;
  --ma-branch-bg: #fffaf0; --ma-branch-line: #efd8a6;
  --ma-note-bg: #f3f4ff; --ma-note-line: #d8ddfa; --ma-note-ink: #30366e; --ma-note-h: #3b52d9;
  --ma-panel: #ffffff; --ma-panel-line: #e4e7ef; --ma-field: #ffffff; --ma-field-line: #d6dbe5;
  --ma-hint: #f5f6fa; --ma-hint-ink: #5d6679; --ma-danger: #c23b3b;
  --ma-shadow: 0 12px 36px rgba(20, 28, 48, .16);
  display: grid; grid-template-columns: minmax(0, 1fr) 312px; grid-template-rows: 48px minmax(0, 1fr);
  height: 100vh; min-height: 560px; color: var(--ma-ink);
  font: 13px/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
@media (prefers-color-scheme: dark) {
  #stage {
    --ma-bg: #12151c; --ma-dot: #222733;
    --ma-card: #1b1f28; --ma-card-line: #2e3441; --ma-ink: #e7eaf2; --ma-mut: #9aa3b8; --ma-faint: #6f788d;
    --ma-accent: #8b9cf2; --ma-accent-ink: #b7c2f7; --ma-accent-wash: rgba(139, 156, 242, .14);
    --ma-done: #3ccf7e; --ma-done-wash: rgba(60, 207, 126, .13);
    --ma-branch-bg: #241f14; --ma-branch-line: #574726;
    --ma-note-bg: #1c1f35; --ma-note-line: #343a64; --ma-note-ink: #cdd2f6; --ma-note-h: #a9b5f6;
    --ma-panel: #161921; --ma-panel-line: #292e3a; --ma-field: #10131a; --ma-field-line: #323846;
    --ma-hint: #1d2029; --ma-hint-ink: #a0a8bb; --ma-danger: #ff8a8a;
    --ma-shadow: 0 12px 36px rgba(0, 0, 0, .5);
  }
}

/* ---- top bar ------------------------------------------------------------- */
.ma-top { grid-column: 1 / -1; display: flex; align-items: center; gap: 8px; padding: 0 12px;
  background: var(--ma-panel); border-bottom: 1px solid var(--ma-panel-line); position: relative; z-index: 5; }
.ma-tb-group { display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0; }
.ma-tb-group.right { justify-content: flex-end; }
.ma-sep { width: 1px; height: 22px; background: var(--ma-panel-line); margin: 0 4px; }
.ma-ib, .ma-tb { border: 1px solid var(--ma-field-line); background: var(--ma-panel); color: var(--ma-ink); border-radius: 8px;
  height: 32px; cursor: pointer; font: 500 13px/1 inherit; font-family: inherit; display: inline-flex; align-items: center; gap: 6px; }
.ma-ib { width: 32px; justify-content: center; border-color: transparent; color: var(--ma-mut); }
.ma-ib:hover:not(:disabled) { background: var(--ma-hint); color: var(--ma-ink); }
.ma-ib:disabled { opacity: .35; cursor: default; }
.ma-tb { padding: 0 12px; }
.ma-tb:hover { border-color: var(--ma-faint); }
.ma-tb.primary { background: var(--ma-accent); border-color: var(--ma-accent); color: #fff; }
.ma-tb.primary:hover { background: var(--ma-accent-ink); }
@media (prefers-color-scheme: dark) { .ma-tb.primary { color: #10131a; } }
.ma-title-wrap { display: flex; align-items: center; gap: 8px; flex: 0 1 auto; min-width: 0; }
#ma-title { border: 1px solid transparent; background: transparent; color: inherit; font: 600 14.5px/1.2 inherit; font-family: inherit;
  padding: 6px 8px; border-radius: 7px; field-sizing: content; min-width: 140px; max-width: min(420px, 36vw); text-align: center; text-overflow: ellipsis; }
#ma-title:hover, #ma-title:focus { border-color: var(--ma-field-line); background: var(--ma-field); outline: none; }
.ma-status { font: 600 10.5px/1 inherit; font-family: inherit; letter-spacing: .04em; text-transform: uppercase; padding: 4px 7px; border-radius: 999px;
  background: var(--ma-hint); color: var(--ma-mut); white-space: nowrap; }
.ma-status.live { background: var(--ma-done-wash); color: var(--ma-done); }

/* ---- the canvas ------------------------------------------------------------ */
#canvas { position: relative; overflow: hidden; height: 100%; min-width: 0; background-color: var(--ma-bg);
  background-image: radial-gradient(circle, var(--ma-dot) 1px, transparent 1px); background-size: 22px 22px; }
#canvas foreignObject { overflow: visible; }
/* The node's SHAPE is the card (rounded rect); the HTML inside draws the rest.
   Kind and run state ride on the rect as classes (NodeModel.setClasses). */
#canvas rect.diagram-node.ma-n { fill: var(--ma-card) !important; stroke: var(--ma-card-line) !important; stroke-width: 1px !important;
  filter: drop-shadow(0 1px 1.5px rgba(16, 24, 40, .07)); }
#canvas rect.diagram-node.ma-n-branch { fill: var(--ma-branch-bg) !important; stroke: var(--ma-branch-line) !important; }
#canvas rect.diagram-node.ma-n.ma-s-done { stroke: var(--ma-done) !important; stroke-width: 1.6px !important; }
#canvas rect.diagram-node.ma-n.ma-s-run, #canvas rect.diagram-node.ma-n.ma-s-wait { stroke: var(--ma-accent) !important; stroke-width: 2.6px !important; }
#canvas rect.diagram-node.ma-n.ma-s-fail { stroke: var(--ma-danger) !important; stroke-width: 2px !important; }
#canvas rect.diagram-node.ma-n.selected { stroke: var(--ma-accent) !important; stroke-width: 2px !important; }
#canvas rect.diagram-node.ma-n-anchor { fill: transparent !important; stroke: none !important; filter: none; }
#canvas rect.diagram-node.ma-n-note { fill: var(--ma-note-bg) !important; stroke: var(--ma-note-line) !important; stroke-width: 1px !important; filter: none; }
@media (prefers-color-scheme: dark) { #canvas rect.diagram-node.ma-n { filter: none; } }

/* ---- icons: one mask per glyph, painted in currentColor (built in setup) ---- */
.ma-ico { display: inline-block; width: 18px; height: 18px; flex: none; background-color: currentColor;
  -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat; -webkit-mask-position: center; mask-position: center;
  -webkit-mask-size: contain; mask-size: contain; }
.ma-tile { width: 36px; height: 36px; border-radius: 10px; flex: none; display: inline-flex; align-items: center; justify-content: center; }
.ma-tile.sm { width: 24px; height: 24px; border-radius: 7px; }
.ma-tile.sm .ma-ico { width: 14px; height: 14px; }
.t-indigo { background: #eef1fe; color: #3b52d9; } .t-sky { background: #e6f3fc; color: #1673c4; }
.t-plum { background: #f3ecfa; color: #7b3db8; }   .t-green { background: #e6f5ec; color: #1d8a4b; }
.t-orange { background: #fdede4; color: #c2541c; } .t-pink { background: #fceaf2; color: #b4336a; }
.t-slate { background: #edf0f4; color: #4a5568; }  .t-violet { background: #efecfd; color: #6548d6; }
.t-amber { background: #fdf0d8; color: #a86400; }
@media (prefers-color-scheme: dark) {
  .t-indigo { background: rgba(139,156,242,.16); color: #a9b5f6; } .t-sky { background: rgba(56,160,240,.16); color: #7cc0f5; }
  .t-plum { background: rgba(170,110,230,.18); color: #c9a3f2; }   .t-green { background: rgba(60,200,120,.15); color: #6fd69b; }
  .t-orange { background: rgba(240,130,70,.16); color: #f5a473; }  .t-pink { background: rgba(236,90,150,.16); color: #f293bb; }
  .t-slate { background: rgba(150,165,190,.16); color: #b5c0d3; }  .t-violet { background: rgba(150,120,240,.18); color: #b6a5f7; }
  .t-amber { background: rgba(240,180,60,.16); color: #f1c76c; }
}

/* ---- a step card (inside the node's foreignObject) ------------------------- */
.ma-card { box-sizing: border-box; width: 100%; height: 100%; display: flex; align-items: center; gap: 11px; padding: 0 12px;
  color: var(--ma-ink); font: 12px/1.35 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; position: relative;
  text-align: left; letter-spacing: normal; }
.ma-txt { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.ma-type { font-size: 11px; color: var(--ma-mut); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ma-title { font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ma-badge { display: none; position: absolute; right: 9px; top: 9px; width: 18px; height: 18px; border-radius: 50%;
  background: var(--ma-done); color: #fff; align-items: center; justify-content: center; }
.ma-badge .ma-ico { width: 12px; height: 12px; }
.ma-card.ma-done .ma-badge, .ma-card.ma-fail .ma-badge { display: inline-flex; animation: ma-pop .28s ease-out; }
.ma-card.ma-fail .ma-badge { background: var(--ma-danger); }
.ma-card.ma-done .ma-title { padding-right: 18px; }
.ma-card.ma-run .ma-tile { box-shadow: 0 0 0 3px var(--ma-accent-wash); animation: ma-throb 1s ease-in-out infinite; }
.ma-ff { position: absolute; right: 9px; top: 7px; display: inline-flex; align-items: center; gap: 3px; font: 700 10.5px/1 inherit; color: var(--ma-accent);
  background: var(--ma-accent-wash); padding: 3px 6px; border-radius: 999px; }
.ma-ff .ma-ico, .ma-tick .ma-ico { width: 10px; height: 10px; }
.ma-bar { position: absolute; left: 12px; right: 12px; bottom: 6px; height: 3px; border-radius: 3px; background: var(--ma-accent-wash); overflow: hidden; }
.ma-bar::after { content: ""; position: absolute; inset: 0; background: var(--ma-accent); transform-origin: 0 50%; animation: ma-fill .8s linear forwards; }
.ma-card.ma-new { animation: ma-in .32s ease-out; }
@keyframes ma-pop { from { transform: scale(.3); opacity: 0; } }
@keyframes ma-throb { 50% { box-shadow: 0 0 0 6px var(--ma-accent-wash); } }
@keyframes ma-fill { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@keyframes ma-in { from { opacity: 0; transform: translateY(-6px); } }

/* trigger */
.ma-card.ma-k-trigger { flex-direction: column; align-items: stretch; justify-content: flex-start; gap: 8px; padding: 12px; }
.ma-trig-head { display: flex; align-items: center; gap: 11px; }
.ma-trig-event { font-size: 11.5px; color: var(--ma-mut); margin-top: -2px; }
.ma-chips { display: flex; flex-wrap: wrap; gap: 5px; }
.ma-chip { display: inline-flex; align-items: center; gap: 4px; max-width: 100%; background: var(--ma-accent-wash); color: var(--ma-accent-ink);
  border-radius: 7px; padding: 3px 4px 3px 8px; font-size: 11.5px; font-weight: 500; }
.ma-chip-t { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ma-chip-x { width: 16px; height: 16px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; flex: none; }
.ma-chip-x .ma-ico { width: 10px; height: 10px; }
.ma-chip-x:hover { background: var(--ma-accent); color: #fff; }
.ma-addcrit { display: flex; align-items: center; justify-content: center; gap: 5px; border-radius: 8px; padding: 6px 0;
  background: var(--ma-accent); color: #fff; font-weight: 600; font-size: 12px; cursor: pointer; }
.ma-addcrit .ma-ico { width: 13px; height: 13px; }
.ma-addcrit:hover { background: var(--ma-accent-ink); }
@media (prefers-color-scheme: dark) { .ma-addcrit { color: #10131a; } .ma-chip-x:hover { color: #10131a; } }

/* the workflow description note */
.ma-note { box-sizing: border-box; width: 100%; padding: 4px 18px 14px; color: var(--ma-note-ink);
  font: 12.5px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; text-align: left; }
.ma-note-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; cursor: pointer; padding: 10px 0 6px; }
.ma-note-h { font-size: 15px; font-weight: 700; color: var(--ma-note-h); letter-spacing: -.01em; }
.ma-note-toggle { width: 24px; height: 24px; border-radius: 7px; display: inline-flex; align-items: center; justify-content: center; color: var(--ma-note-h); }
.ma-note-head:hover .ma-note-toggle { background: var(--ma-note-line); }
.ma-note.ma-note-min { padding-bottom: 0; }
.ma-note.ma-note-min .ma-note-toggle .ma-ico { transform: rotate(-90deg); }
.ma-note-sec { border-top: 1px solid var(--ma-note-line); padding: 8px 0 2px; }
.ma-note-sec h4 { margin: 0 0 3px; font-size: 12px; font-weight: 700; color: var(--ma-note-h); text-transform: uppercase; letter-spacing: .05em; }
.ma-note-sec p { margin: 0 0 4px; }
.ma-note-sec ul { margin: 2px 0 4px; padding-left: 16px; }
.ma-note-sec li { margin: 1px 0; }

#ma-measure { position: absolute; left: -10000px; top: 0; visibility: hidden; pointer-events: none; }
#ma-measure > * { height: auto !important; }

/* ---- world-space chrome: the "+" buttons, the token, the day tick ---------- */
.ma-plus { width: 22px; height: 22px; border-radius: 50%; border: 1px solid var(--ma-field-line); background: var(--ma-card); color: var(--ma-mut);
  display: flex; align-items: center; justify-content: center; padding: 0; cursor: pointer; box-shadow: 0 1px 2px rgba(16,24,40,.08);
  transition: background-color .12s, color .12s, transform .12s; }
.ma-plus .ma-ico { width: 13px; height: 13px; }
.ma-plus:hover, .ma-plus:focus-visible, .ma-plus[aria-expanded="true"] { background: var(--ma-accent); border-color: var(--ma-accent); color: #fff; transform: scale(1.12); outline: none; }
.ma-plus.add { border-style: dashed; }
@media (prefers-color-scheme: dark) { .ma-plus:hover, .ma-plus:focus-visible, .ma-plus[aria-expanded="true"] { color: #10131a; } }
.ma-token { width: 14px; height: 14px; border-radius: 50%; background: var(--ma-accent); pointer-events: none !important;
  box-shadow: 0 0 0 4px var(--ma-accent-wash), 0 2px 8px rgba(59, 82, 217, .45); }
.ma-tick { pointer-events: none !important; display: inline-flex; align-items: center; gap: 4px; font: 700 12px/1 ui-sans-serif, system-ui, sans-serif; color: var(--ma-accent); background: var(--ma-card);
  border: 1px solid var(--ma-accent); border-radius: 999px; padding: 4px 8px; white-space: nowrap; animation: ma-rise 1.1s ease-out forwards; }
@keyframes ma-rise { 0% { opacity: 0; transform: translateY(6px); } 15% { opacity: 1; } 75% { opacity: 1; } 100% { opacity: 0; transform: translateY(-18px); } }

/* ---- canvas overlays (screen space) ------------------------------------------ */
.ma-nav { position: absolute; left: 14px; bottom: 14px; z-index: 6; width: 236px; background: var(--ma-panel); border: 1px solid var(--ma-panel-line);
  border-radius: 12px; box-shadow: var(--ma-shadow); overflow: hidden; }
.ma-nav-map { height: 132px; border-bottom: 1px solid var(--ma-panel-line); position: relative; }
.ma-nav-map[hidden] { display: none; }
.ma-nav-map .grafloria-minimap { position: absolute !important; inset: 0 !important; width: auto !important; height: auto !important;
  border: 0 !important; box-shadow: none !important; border-radius: 0 !important; background: transparent !important; }
.ma-nav-row { display: flex; align-items: center; gap: 4px; padding: 6px 8px; }
.ma-nav-row .ma-ib { width: 28px; height: 28px; }
.ma-nav-row .ma-ib[aria-pressed="true"] { background: var(--ma-accent-wash); color: var(--ma-accent); }
#ma-zoom { flex: 1; min-width: 0; accent-color: var(--ma-accent); }
#ma-zoom-pct { width: 38px; text-align: right; font: 500 11.5px/1 inherit; font-family: inherit; color: var(--ma-mut); font-variant-numeric: tabular-nums; }

#ma-menu { position: absolute; z-index: 20; width: 268px; max-height: min(430px, calc(100% - 24px)); display: flex; flex-direction: column;
  background: var(--ma-panel); border: 1px solid var(--ma-panel-line); border-radius: 12px; box-shadow: var(--ma-shadow); overflow: hidden; }
#ma-menu[hidden] { display: none; }
.ma-menu-search { display: flex; align-items: center; gap: 7px; padding: 9px 11px; border-bottom: 1px solid var(--ma-panel-line); color: var(--ma-faint); }
#ma-menu-q { flex: 1; border: 0; background: transparent; color: var(--ma-ink); font: 13px/1.3 inherit; font-family: inherit; outline: none; min-width: 0; }
.ma-menu-list { overflow-y: auto; padding: 6px; }
.ma-menu-h { font: 600 10.5px/1 inherit; font-family: inherit; letter-spacing: .06em; text-transform: uppercase; color: var(--ma-faint); padding: 9px 8px 6px; }
.ma-mi { display: flex; align-items: center; gap: 10px; width: 100%; border: 0; background: none; color: var(--ma-ink); text-align: left;
  padding: 6px 8px; border-radius: 9px; cursor: pointer; font: inherit; }
.ma-mi b { display: block; font-weight: 600; font-size: 13px; }
.ma-mi small { display: block; color: var(--ma-mut); font-size: 11.5px; }
.ma-mi:hover, .ma-mi.active { background: var(--ma-hint); }
.ma-mi .ma-tile { width: 30px; height: 30px; border-radius: 8px; }
.ma-mi .ma-tile .ma-ico { width: 16px; height: 16px; }
.ma-menu-empty { padding: 14px; color: var(--ma-mut); font-size: 12.5px; }
.ma-menu-empty[hidden], .ma-mi[hidden], .ma-menu-h[hidden] { display: none; }

#ma-dialog { position: absolute; inset: 0; z-index: 30; display: flex; align-items: flex-start; justify-content: center; padding-top: 70px;
  background: rgba(18, 22, 34, .28); }
#ma-dialog[hidden] { display: none; }
.ma-dlg { width: min(420px, calc(100% - 32px)); background: var(--ma-panel); border: 1px solid var(--ma-panel-line); border-radius: 14px;
  box-shadow: var(--ma-shadow); padding: 18px 18px 14px; }
.ma-dlg h3 { margin: 0 0 4px; font-size: 16px; letter-spacing: -.01em; }
.ma-dlg p { margin: 0 0 12px; color: var(--ma-mut); }
.ma-dlg-list { display: grid; gap: 7px; margin-bottom: 14px; }
.ma-pick { display: flex; align-items: center; gap: 10px; border: 1px solid var(--ma-field-line); background: var(--ma-field); color: var(--ma-ink);
  border-radius: 10px; padding: 8px 10px; cursor: pointer; text-align: left; font: inherit; }
.ma-pick:hover { border-color: var(--ma-faint); }
.ma-pick[aria-pressed="true"] { border-color: var(--ma-accent); background: var(--ma-accent-wash); }
.ma-pick b { display: block; font-size: 13px; }
.ma-pick small { display: block; color: var(--ma-mut); font-size: 11.5px; }
.ma-av { width: 30px; height: 30px; border-radius: 50%; flex: none; display: inline-flex; align-items: center; justify-content: center;
  font: 700 11px/1 inherit; font-family: inherit; color: #fff; background: linear-gradient(135deg, #6f7ff0, #3b52d9); }
.ma-dlg-actions { display: flex; justify-content: flex-end; gap: 8px; }
.ma-btn { border: 1px solid var(--ma-field-line); background: var(--ma-panel); color: var(--ma-ink); border-radius: 8px; padding: 7px 12px;
  cursor: pointer; font: 500 13px/1.2 inherit; font-family: inherit; }
.ma-btn:hover { border-color: var(--ma-faint); }
.ma-btn.primary { background: var(--ma-accent); border-color: var(--ma-accent); color: #fff; }
.ma-btn.danger { color: var(--ma-danger); border-color: color-mix(in srgb, var(--ma-danger) 45%, transparent); }
@media (prefers-color-scheme: dark) { .ma-btn.primary { color: #10131a; } }

#ma-toast { position: absolute; left: 50%; bottom: 18px; transform: translateX(-50%); z-index: 25; background: #1d2433; color: #fff;
  padding: 8px 14px; border-radius: 9px; font-size: 12.5px; box-shadow: var(--ma-shadow); pointer-events: none; max-width: 70%; text-align: center;
  transition: opacity .2s; }
#ma-toast[hidden] { display: none; }
@media (prefers-color-scheme: dark) { #ma-toast { background: #e7eaf2; color: #10131a; } }

/* ---- the property panel ---------------------------------------------------- */
#ma-panel { background: var(--ma-panel); border-left: 1px solid var(--ma-panel-line); overflow-y: auto; min-width: 0; }
.ma-p-head { display: flex; align-items: center; gap: 11px; padding: 16px 16px 14px; border-bottom: 1px solid var(--ma-panel-line); }
.ma-p-kind { font-size: 11px; color: var(--ma-mut); }
.ma-p-name { font-size: 15px; font-weight: 650; line-height: 1.25; overflow-wrap: anywhere; }
.ma-p-sec { padding: 8px 16px; background: var(--ma-hint); border-bottom: 1px solid var(--ma-panel-line); font-size: 11.5px; font-weight: 600;
  color: var(--ma-mut); box-shadow: inset 3px 0 0 var(--ma-accent); }
.ma-p-body { padding: 14px 16px 18px; display: grid; gap: 14px; }
.ma-f { display: grid; gap: 5px; }
.ma-f-l { font-size: 12.5px; font-weight: 600; }
.ma-f input, .ma-f select, .ma-f textarea, .ma-arm input, .ma-arm select { box-sizing: border-box; width: 100%; min-width: 0; border: 1px solid var(--ma-field-line);
  background: var(--ma-field); color: var(--ma-ink); border-radius: 8px; padding: 7px 9px; font: 13px/1.35 inherit; font-family: inherit; }
.ma-f textarea { min-height: 76px; resize: vertical; }
.ma-f input:focus, .ma-f select:focus, .ma-f textarea:focus, .ma-arm input:focus, .ma-arm select:focus { outline: 2px solid var(--ma-accent-wash); border-color: var(--ma-accent); }
.ma-f-h { display: flex; gap: 6px; align-items: flex-start; font-size: 11.5px; color: var(--ma-hint-ink); background: var(--ma-hint);
  border-radius: 7px; padding: 6px 8px; line-height: 1.4; }
.ma-f-h .ma-ico { width: 14px; height: 14px; color: #c99a16; margin-top: 1px; }
.ma-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.ma-arms { display: grid; gap: 7px; }
.ma-arm { display: grid; grid-template-columns: 1fr 1fr 28px; gap: 6px; align-items: center; }
.ma-arm-any { font-size: 12px; color: var(--ma-mut); padding: 0 4px; }
.ma-x { width: 28px; height: 28px; border: 0; background: none; color: var(--ma-faint); border-radius: 7px; cursor: pointer; display: inline-flex;
  align-items: center; justify-content: center; }
.ma-x:hover { background: var(--ma-hint); color: var(--ma-danger); }
.ma-x .ma-ico { width: 14px; height: 14px; }
.ma-add { border: 1px dashed var(--ma-field-line); background: none; color: var(--ma-accent); border-radius: 8px; padding: 7px; cursor: pointer;
  font: 600 12.5px/1.2 inherit; font-family: inherit; }
.ma-add:hover { border-color: var(--ma-accent); }
.ma-del { justify-self: start; border: 0; background: none; color: var(--ma-danger); cursor: pointer; font: 500 12.5px/1 inherit; font-family: inherit;
  display: inline-flex; align-items: center; gap: 6px; padding: 4px 0; }
.ma-del .ma-ico { width: 15px; height: 15px; }
.ma-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.ma-stats div { border: 1px solid var(--ma-panel-line); border-radius: 10px; padding: 8px 10px; font-size: 11.5px; color: var(--ma-mut); }
.ma-stats b { display: block; font-size: 18px; color: var(--ma-ink); font-variant-numeric: tabular-nums; }
.ma-tips { margin: 0; padding-left: 18px; display: grid; gap: 6px; color: var(--ma-mut); font-size: 12.5px; }
.ma-tips b { color: var(--ma-ink); font-weight: 600; }
.ma-run-who { display: flex; align-items: center; gap: 10px; }
.ma-run-who b { display: block; }
.ma-run-who small { color: var(--ma-mut); }
.ma-clock { display: flex; align-items: center; gap: 8px; border: 1px solid var(--ma-panel-line); border-radius: 10px; padding: 8px 10px; }
.ma-clock .ma-ico { color: var(--ma-accent); }
#ma-clock { font-weight: 600; font-variant-numeric: tabular-nums; }
.ma-run-state { margin-left: auto; font-size: 11.5px; color: var(--ma-accent); font-weight: 600; }
.ma-run-state.done { color: var(--ma-done); }
.ma-log { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
.ma-log li { display: grid; grid-template-columns: 24px 1fr; gap: 9px; padding: 6px 0; border-bottom: 1px dashed var(--ma-panel-line); animation: ma-in .25s ease-out; }
.ma-log-t { font-size: 10.5px; color: var(--ma-faint); font-variant-numeric: tabular-nums; }
.ma-log li > div { font-size: 12px; overflow-wrap: anywhere; }
.ma-run-actions { display: flex; flex-wrap: wrap; gap: 6px; }
@media (prefers-reduced-motion: reduce) {
  .ma-card.ma-run .ma-tile, .ma-bar::after, .ma-tick, .ma-log li, .ma-card.ma-new, .ma-badge { animation: none !important; }
}
`;

// The flow goes in from the controller once this component's stylesheet is on
// the page (the trigger card and the note are measured in it), so the canvas
// mounts empty. Module constants, so a re-render never hands the flow new props.
const NONE: never[] = [];
const FLOW_STYLE = { display: 'block', height: '100%', width: '100%' };

type Ctl = Signal<NoSerialize<MarketingAutomation> | undefined>;
type Ui = Signal<MaUi>;

// The chrome is child components ON PURPOSE: each re-renders alone when the
// state changes, and the page component itself never does — Qwik drops DOM it
// did not render from a parent it re-renders, i.e. the minimap the controller
// moves into the navigator and the measuring twin it keeps in #stage.

// Inline components (plain functions): no handlers, no state of their own.
const Ico = (props: { name: string; size?: string }) => (
  <span class={`ma-ico ma-i-${props.name}`} style={props.size ? { width: props.size, height: props.size } : undefined} />
);

const TopBar = component$((props: { ui: Ui; ctl: Ctl }) => {
  const ui = props.ui.value, ctl = props.ctl;
  return (
    <div class="ma-top">
      <div class="ma-tb-group">
        <button class="ma-ib" id="ma-undo" title="Undo (⌘Z / Ctrl+Z)" aria-label="Undo" disabled={!ui.canUndo} onClick$={() => ctl.value?.undo()}><Ico name="undo" /></button>
        <button class="ma-ib" id="ma-redo" title="Redo (⇧⌘Z / Ctrl+Shift+Z)" aria-label="Redo" disabled={!ui.canRedo} onClick$={() => ctl.value?.redo()}><Ico name="redo" /></button>
        <span class="ma-sep"></span>
        <button class="ma-tb" id="ma-save" title="Save to this browser" onClick$={() => ctl.value?.save()}>Save</button>
        <button class="ma-tb" id="ma-load" title="Load the saved version" onClick$={() => ctl.value?.load()}>Load</button>
        <button class="ma-tb" id="ma-new" title="Start from a trigger" onClick$={() => ctl.value?.askNew()}>New</button>
      </div>
      <div class="ma-title-wrap">
        <input id="ma-title" aria-label="Automation name" autocomplete="off" spellcheck={false} value={ui.title}
          onInput$={(_, el) => ctl.value?.renameTitle(el.value)} onChange$={() => ctl.value?.commitLive()}
          onKeyDown$={(e, el) => { if (e.key === 'Enter') el.blur(); }} />
        <span class={'ma-status' + (ui.live ? ' live' : '')} id="ma-status">{ui.status}</span>
      </div>
      <div class="ma-tb-group right">
        <button class="ma-tb primary" id="ma-test" onClick$={() => ctl.value?.openTestDialog()}><Ico name="play" size="13px" />Test flow</button>
        <button class="ma-tb" id="ma-publish" onClick$={() => ctl.value?.publish()}>Publish</button>
      </div>
    </div>
  );
});

/** Never re-renders: the controller moves the minimap into it. */
const MiniHost = component$(() => <div class="ma-nav-mini" />);

/** The navigator: the minimap, fit-all, fit-width, zoom. */
const Navigator = component$((props: { ui: Ui; ctl: Ctl }) => {
  const ui = props.ui.value, ctl = props.ctl;
  return (
    <div class="ma-nav" aria-label="Navigator">
      <div class="ma-nav-map" id="ma-nav-map" hidden={!ui.mapShown}><MiniHost /></div>
      <div class="ma-nav-row">
        <button class="ma-ib" id="ma-fit" title="Fit the whole automation" aria-label="Fit the whole automation" onClick$={() => ctl.value?.fitAll()}><Ico name="fit" /></button>
        <button class="ma-ib" id="ma-fitw" title="Fit the width, from the top" aria-label="Fit the width" onClick$={() => ctl.value?.fitWidth()}><Ico name="fitw" /></button>
        <input type="range" id="ma-zoom" min="20" max="200" step="5" value={String(ui.zoom)} aria-label="Zoom"
          onInput$={(_, el) => ctl.value?.setZoom(Number(el.value))} />
        <span id="ma-zoom-pct">{ui.zoom}%</span>
        <button class="ma-ib" id="ma-map" title="Show or hide the minimap" aria-label="Show or hide the minimap" aria-pressed={String(ui.mapShown)}
          onClick$={() => ctl.value?.toggleMap()}><Ico name="map" /></button>
      </div>
    </div>
  );
});

/** The step menu a "+" (or "Add criteria") opens: search, ↑ ↓, Enter. */
const StepMenu = component$((props: { ui: Ui; ctl: Ctl }) => {
  const menu = props.ui.value.menu, ctl = props.ctl;
  return (
    <div id="ma-menu" hidden={!menu} role="dialog" aria-label="Choose a step" style={menu ? { left: `${menu.left}px`, top: `${menu.top}px` } : undefined}>
      <div class="ma-menu-search"><Ico name="search" />
        <input id="ma-menu-q" placeholder={menu?.placeholder ?? 'Search steps…'} autocomplete="off" spellcheck={false} aria-label="Search steps"
          value={menu?.q ?? ''} onInput$={(_, el) => ctl.value?.setMenuQuery(el.value)} onKeyDown$={(e) => ctl.value?.menuKey(e)} /></div>
      <div class="ma-menu-list" id="ma-menu-list" role="listbox">
        {(menu?.groups ?? []).map((g) => [
          <div key={'h-' + g.group} class="ma-menu-h" hidden={g.hidden}>{g.group}</div>,
          ...g.items.map((it) => {
            const key = it.key;
            return (
              <button key={key} class={'ma-mi' + (it.active ? ' active' : '')} role="option" data-key={key} data-search={it.search}
                hidden={it.hidden} onClick$={() => ctl.value?.pickMenu(key)}>
                <span class={`ma-tile t-${it.tone}`}><Ico name={it.icon} /></span><span><b>{it.label}</b><small>{it.desc}</small></span></button>
            );
          }),
        ])}
      </div>
      <div class="ma-menu-empty" id="ma-menu-empty" hidden={!menu?.empty}>No step matches.</div>
    </div>
  );
});

/** Delete a Branch (keep which path?), start a new automation, or pick a test contact. */
const Dialog = component$((props: { ui: Ui; ctl: Ctl }) => {
  const d = props.ui.value.dialog, ctl = props.ctl;
  return (
    <div id="ma-dialog" hidden={!d} onClick$={(e, el) => { if (e.target === el) ctl.value?.closeDialog(); }}>
      <div class="ma-dlg" role="dialog" aria-modal="true" id="ma-dlg" data-kind={d?.kind}>
        {d?.kind === 'delete' && (
          <>
            <h3>Delete “{d.title}”?</h3>
            <p>{d.text}</p>
            <div class="ma-dlg-list">
              {d.picks.map((pk, i) => {
                const armId = pk.armId;
                return (
                  <button key={armId} class="ma-pick" data-act="keep" data-arm={armId} data-focus={i === 0 ? '' : undefined}
                    onClick$={() => ctl.value?.dialogAct('keep', armId)}>
                    <span class="ma-tile sm t-amber"><Ico name="fork" /></span><span><b>Keep the {pk.label} path</b><small>{pk.sub}</small></span></button>
                );
              })}
            </div>
            <div class="ma-dlg-actions"><button class="ma-btn" data-act="cancel" onClick$={() => ctl.value?.dialogAct('cancel')}>Cancel</button>
              <button class="ma-btn danger" data-act="all" onClick$={() => ctl.value?.dialogAct('all')}>{d.allLabel}</button></div>
          </>
        )}
        {d?.kind === 'new' && (
          <>
            <h3>Start a new automation?</h3><p>The canvas is cleared down to a bare trigger. Undo brings this one back.</p>
            <div class="ma-dlg-actions"><button class="ma-btn" data-act="cancel" onClick$={() => ctl.value?.dialogAct('cancel')}>Cancel</button>
              <button class="ma-btn primary" data-act="new" data-focus="" onClick$={() => ctl.value?.dialogAct('new')}>Start new</button></div>
          </>
        )}
        {d?.kind === 'test' && (
          <>
            <h3>Test flow</h3><p>Pick a sample contact. A token walks the automation exactly as they would — delays fast-forward, nothing is sent.</p>
            <div class="ma-dlg-list">
              {d.contacts.map((ct) => {
                const id = ct.id;
                return (
                  <button key={id} class="ma-pick" data-act="pick" data-id={id} aria-pressed={String(id === d.picked)}
                    onClick$={() => ctl.value?.dialogAct('pick', id)}>
                    <span class="ma-av">{ct.initials}</span><span><b>{ct.name}</b><small>{ct.company} · {ct.blurb}</small></span></button>
                );
              })}
            </div>
            <div class="ma-dlg-actions"><button class="ma-btn" data-act="cancel" onClick$={() => ctl.value?.dialogAct('cancel')}>Cancel</button>
              <button class="ma-btn primary" data-act="run" data-focus="" onClick$={() => ctl.value?.dialogAct('run')}>Run test</button></div>
          </>
        )}
      </div>
    </div>
  );
});

const Toast = component$((props: { ui: Ui }) => {
  const t = props.ui.value.toast;
  return <div id="ma-toast" hidden={!t} role="status">{t}</div>;
});

const Hint = (props: { text: string }) => <span class="ma-f-h"><Ico name="bulb" /><span>{props.text}</span></span>;

/** One labelled field with its hint (its value is written when the panel renders). */
const Field = (props: { f: FieldUi }) => {
  const f = props.f;
  return (
    <label class="ma-f"><span class="ma-f-l">{f.label}</span>
      {f.type === 'select' ? (
        <select data-k={f.key}>{f.options.map(([v, l]) => <option key={v} value={v} selected={v === f.value}>{l}</option>)}</select>
      ) : f.type === 'textarea' ? (
        <textarea data-k={f.key} rows={3} value={f.value} />
      ) : (
        <input data-k={f.key} type={f.type === 'number' ? 'number' : 'text'} min={f.min} value={f.value} placeholder={f.placeholder} autocomplete="off" />
      )}
      <Hint text={f.hint} /></label>
  );
};

/**
 * The right-hand panel: the automation overview, a step's form, or the test
 * run. Keyed by `rev`, so it re-renders exactly where the JS page re-renders
 * its HTML; a field's `input` paints live, its `change` lands in the history.
 */
const Panel = component$((props: { ui: Ui; ctl: Ctl }) => {
  const p = props.ui.value.panel, ctl = props.ctl;
  const rev = p.rev;
  return (
    <aside id="ma-panel" aria-label="Step properties"
      onInput$={(e) => ctl.value?.panelInput(e.target, false)} onChange$={(e) => ctl.value?.panelInput(e.target, true)}>
      {p.view === 'overview' && (
        <>
          <div key={'h' + rev} class="ma-p-head" data-rev={rev}><span class="ma-tile t-indigo"><Ico name="automation" /></span>
            <div><div class="ma-p-name">Automation</div><div class="ma-p-kind">Select a step to configure it</div></div></div>
          <div key={'b' + rev} class="ma-p-body">
            <div class="ma-stats"><div><b>{p.steps}</b>steps</div><div><b>{p.paths}</b>paths</div><div><b>{p.wait}</b>longest wait</div></div>
            <Field f={p.description} />
            <ul class="ma-tips">
              <li>Click a <b>step</b> to edit it here.</li>
              <li>Press <b>+</b> on a line to insert a step there; the dashed <b>+</b> beside a Branch adds a path.</li>
              <li><b>Delete</b> removes the selected step; <b>⌘Z</b> / <b>Ctrl+Z</b> undoes.</li>
              <li><b>Test flow</b> walks a sample contact through it.</li>
            </ul>
          </div>
        </>
      )}
      {p.view === 'run' && (
        <>
          <div key={'h' + rev} class="ma-p-head" data-rev={rev}><span class="ma-tile t-indigo"><Ico name="play" /></span>
            <div><div class="ma-p-name">Test run</div><div class="ma-p-kind">Simulated — nothing is sent</div></div></div>
          <div key={'b' + rev} class="ma-p-body">
            <div class="ma-run-who"><span class="ma-av">{p.contact.initials}</span>
              <div><b>{p.contact.name}</b><small>{p.contact.company} · {p.contact.blurb}</small></div></div>
            <div class="ma-clock"><Ico name="clock" /><span id="ma-clock">{p.clock}</span>
              <span class={'ma-run-state' + (p.done ? ' done' : '')} id="ma-run-state">{p.state}</span></div>
            <div class="ma-run-actions">
              <button class="ma-btn primary" data-act="run-again" onClick$={() => ctl.value?.panelAct('run-again')}>Run again</button>
              <button class="ma-btn" data-act="run-pick" onClick$={() => ctl.value?.panelAct('run-pick')}>Another contact</button>
              <button class="ma-btn" data-act="run-exit" onClick$={() => ctl.value?.panelAct('run-exit')}>Exit test</button>
            </div>
            <ol class="ma-log" id="ma-log" aria-live="polite">
              {p.log.map((r) => (
                <li key={r.n} data-kind={r.kind}><span class={`ma-tile sm t-${r.tone}`}><Ico name={r.icon} /></span>
                  <div><div class="ma-log-t">{r.clock}</div>{r.text}</div></li>
              ))}
            </ol>
          </div>
        </>
      )}
      {p.view === 'step' && (
        <>
          <div key={'h' + rev} class="ma-p-head" data-rev={rev}><span class={`ma-tile t-${p.tone}`}><Ico name={p.icon} /></span>
            <div><div class="ma-p-name">{p.name}</div><div class="ma-p-kind">{p.sub}</div></div></div>
          <div key={'s' + rev} class="ma-p-sec">{p.sec}</div>
          <div key={'b' + rev} class="ma-p-body" data-step={p.stepId}>
            {p.fields.map((f) => <Field key={f.key} f={f} />)}
            {p.delay && (
              <div class="ma-f"><span class="ma-f-l">Wait for</span><div class="ma-pair">
                <input data-k="amount" type="number" min="1" value={p.delay.amount} aria-label="Amount" />
                <select data-k="unit" aria-label="Unit">{DELAY_UNITS.map((u) => <option key={u} selected={u === p.delay!.unit}>{u}</option>)}</select></div>
                <Hint text="How long the contact waits here. A Test flow fast-forwards it." /></div>
            )}
            {p.arms && (
              <div class="ma-f"><span class="ma-f-l">Paths</span><div class="ma-arms">
                {p.arms.map((a) => {
                  const armId = a.id;
                  return (
                    <div class="ma-arm" key={armId}>
                      <input data-arm={armId} data-ak="label" value={a.label} aria-label="Path name" />
                      {a.isDefault ? <span class="ma-arm-any">any other value</span> : (
                        <select data-arm={armId} data-ak="value" aria-label="Value">
                          {a.options.map(([v, l]) => <option key={v} value={v} selected={v === a.value}>{l}</option>)}
                        </select>
                      )}
                      {a.removable ? (
                        <button class="ma-x" data-act="rm-arm" data-arm={armId} title="Remove this path and its steps" aria-label={`Remove the ${a.label} path`}
                          onClick$={() => ctl.value?.panelAct('rm-arm', armId)}><Ico name="close" /></button>
                      ) : <span></span>}
                    </div>
                  );
                })}
              </div>
                <Hint text="A contact takes the first path whose value matches; “any other value” catches everyone else." />
                <button class="ma-add" data-act="add-arm" onClick$={() => ctl.value?.panelAct('add-arm')}>+ Add a path</button></div>
            )}
            {p.del && <button class="ma-del" data-act="delete" onClick$={() => ctl.value?.panelAct('delete')}><Ico name="trash" />{p.del}</button>}
          </div>
        </>
      )}
    </aside>
  );
});

export default component$(() => {
  const ctl = useSignal(() => noSerialize(new MarketingAutomation()));
  const ui = useSignal<MaUi>(initialUi());
  const stage = useSignal<HTMLElement>();

  // Before the flow mounts (its diagram is made in a visible task, after this
  // runs): the keydown listener must be on window ahead of the diagram's own Delete.
  useTask$(({ cleanup }) => {
    if (typeof window === 'undefined') return;
    const off = ctl.value?.hookKeys();
    cleanup(() => off?.());
  });
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ cleanup }) => { cleanup(() => ctl.value?.destroy()); });

  return (
    <>
      <style dangerouslySetInnerHTML={CSS} />
      <div id="stage" ref={stage}>
        <TopBar ui={ui} ctl={ctl} />
        <div id="canvas">
          <GrafloriaFlow defaultNodes={NONE} defaultEdges={NONE} minZoom={MIN_ZOOM} maxZoom={MAX_ZOOM}
            interaction={INTERACTION} rendererConfig={RENDERER} style={FLOW_STYLE}
            onInit$={$((instance: DiagramInstance) => {
              const c = ctl.value!;
              c.onChange = (next) => { ui.value = next; };
              void c.init(instance, stage.value!).then(() => markReady());
            })} />
          <Navigator ui={ui} ctl={ctl} />
          <StepMenu ui={ui} ctl={ctl} />
          <Dialog ui={ui} ctl={ctl} />
          <Toast ui={ui} />
        </div>
        <Panel ui={ui} ctl={ctl} />
      </div>
    </>
  );
});
