import{_ as o}from"./preload-helper-D57DdDQb.js";import{y as n,I as r,L as i,d as a}from"./core.min-DSxUtzo6.js";import"./preloader-D7tuiBjF.js";const l=`
/* Full-bleed here (the gallery shell wraps the route), so the builder takes the
   whole viewport; the gallery page's own reset (box-sizing, colour scheme) is
   scoped to the builder and its measuring twin. */
#stage, #stage *, #wf-measure * { box-sizing: border-box; }
/* ---- page tokens (light), redefined for dark below --------------------- */
#stage {
  --wf-bg: #f4f5f8; --wf-dot: #d8dce4; --wf-panel: #ffffff; --wf-line: #e3e6ee; --wf-field: #d7dce6;
  --wf-ink: #1e2332; --wf-mut: #687083; --wf-faint: #9aa2b3;
  --wf-accent: #3B52D9; --wf-accent-wash: #eef1fe; --wf-accent-line: #c9d1fb;
  --wf-tile: #ffffff; --wf-tile-ring: #e0e4ec; --wf-ok: #16a34a; --wf-bad: #dc2626; --wf-run: #f59e0b;
  --wf-note: #fff5d1; --wf-note-line: #eedb93; --wf-note-ink: #4b3f10; --wf-note-mut: #6e5f2a;
  --wf-shadow: 0 1px 2px rgba(16,24,40,.06), 0 4px 12px rgba(16,24,40,.07);
  display: grid; grid-template-rows: 52px 1fr; height: 100vh; min-height: 560px; container-type: inline-size;
  color-scheme: light dark; -webkit-font-smoothing: antialiased;
  color: var(--wf-ink); font: 13px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
.wf-body { display: grid; grid-template-columns: minmax(0, 1fr) 300px; min-height: 0; position: relative; }
#canvas { height: 100%; position: relative; overflow: hidden; background-color: var(--wf-bg);
  background-image: radial-gradient(circle, var(--wf-dot) 1px, transparent 1px); background-size: 22px 22px; }
#canvas foreignObject { overflow: visible; }
/* The step's SHAPE is only a hit area: the HTML draws the tile, and selection
   is the tile's own ring (the theme also tints a hovered body). */
#canvas rect.diagram-node, #canvas rect.diagram-node.selected { fill: transparent !important; stroke: transparent !important; }
#canvas circle.port { fill: var(--wf-panel); stroke: var(--wf-accent); stroke-width: 1.5px; transition-property: r, stroke-width, opacity !important; }
#canvas circle.port.port-input.port-highlighted { fill: var(--wf-accent); }

/* ---- a step, painted inside its node's foreignObject --------------------- */
.wf-node { position: relative; width: 100%; height: 100%; color: var(--wf-ink);
  font: 11px/1.3 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; letter-spacing: normal; text-align: left; }
.wf-tile { position: absolute; inset: 0; box-sizing: border-box; border-radius: 50%; background: var(--wf-tile);
  border: 1px solid var(--wf-tile-ring); box-shadow: var(--wf-shadow); display: flex; align-items: center; justify-content: center; }
.wf-trigger .wf-tile { border-radius: 17px; }
.wf-logic .wf-tile { border-radius: 24px; background: var(--wf-accent-wash); border-color: var(--wf-accent-line); }
.wf-ph .wf-tile { background: transparent; border: 1.5px dashed #aeb7c8; box-shadow: none; color: var(--wf-accent); font: 300 26px/1 system-ui; }
.wf-ic { display: block; width: 27px; height: 27px; background: center / contain no-repeat; flex: none; }
.wf-logic .wf-ic { width: 22px; height: 22px; }
.wf-sel .wf-tile { border-color: var(--wf-accent); box-shadow: 0 0 0 3px rgba(59,82,217,.22), var(--wf-shadow); }
.wf-bolt { position: absolute; left: -19px; top: 50%; transform: translateY(-50%); color: var(--wf-faint); font-size: 12px; }
.wf-label { position: absolute; left: 50%; top: calc(100% + 7px); width: 170px; transform: translateX(-50%);
  text-align: center; pointer-events: auto; cursor: default; }
.wf-app-name { font-size: 10.5px; color: var(--wf-mut); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 14px; }
.wf-sum { font-size: 11.5px; font-weight: 550; line-height: 15px; color: var(--wf-ink); overflow: hidden;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow-wrap: anywhere; }
.wf-ph .wf-sum { color: var(--wf-accent); }
.wf-plus { position: absolute; width: 16px; height: 16px; margin: -8px 0 0 -8px; box-sizing: border-box; border-radius: 50%;
  background: var(--wf-panel); border: 1px solid #c3cad8; color: var(--wf-mut); font: 600 13px/14px system-ui, sans-serif;
  text-align: center; pointer-events: auto; cursor: pointer; user-select: none; }
.wf-plus:hover { background: var(--wf-accent); border-color: var(--wf-accent); color: #fff; }
.wf-out-label { position: absolute; transform: translateY(-100%); font-size: 10px; line-height: 12px; color: var(--wf-mut); white-space: nowrap;
  background: var(--wf-bg); padding: 0 3px; margin-left: -3px; border-radius: 4px; }
/* run states */
.wf-badge { position: absolute; top: -5px; right: -5px; width: 17px; height: 17px; box-sizing: border-box; border-radius: 50%;
  color: #fff; font: 700 10px/17px system-ui, sans-serif; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,.25); }
.st-success .wf-badge { background: var(--wf-ok); }
.st-failed .wf-badge { background: var(--wf-bad); }
.st-stopped .wf-badge { background: #7b8496; }
.st-running .wf-badge { background: var(--wf-panel); border: 3px solid rgba(245,158,11,.3); border-top-color: var(--wf-run); animation: wfspin .7s linear infinite; box-shadow: none; }
.st-running .wf-tile { border-color: var(--wf-run); animation: wfpulse 1.1s ease-in-out infinite; }
.st-success .wf-tile { border-color: #9fd8b0; }
.st-failed .wf-tile { border-color: var(--wf-bad); box-shadow: 0 0 0 3px rgba(220,38,38,.18); }
@keyframes wfspin { to { transform: rotate(360deg); } }
@keyframes wfpulse { 0%, 100% { box-shadow: 0 0 0 3px rgba(245,158,11,.25); } 50% { box-shadow: 0 0 0 7px rgba(245,158,11,.12); } }

/* ---- sticky notes: a layer UNDER the diagram, carrying the camera -------- */
.wf-notes { position: absolute; top: 0; left: 0; transform-origin: 0 0; pointer-events: none; }
.wf-note { position: absolute; box-sizing: border-box; border-radius: 14px; background: var(--wf-note);
  border: 1px solid var(--wf-note-line); padding: 14px 18px; color: var(--wf-note-ink); }
.wf-note.sel { outline: 2px solid var(--wf-accent); outline-offset: 3px; }
.wf-note-h { display: flex; align-items: center; gap: 7px; margin: 0 0 5px; font: 650 13px/1.3 system-ui, sans-serif; }
.wf-note-h::before { content: ""; width: 9px; height: 9px; border-radius: 2px; background: #e9b928; transform: rotate(45deg); flex: none; }
.wf-note-t { font: 11.5px/1.5 system-ui, sans-serif; white-space: pre-wrap; color: var(--wf-note-mut); max-width: 324px; }

/* ---- top bar --------------------------------------------------------------- */
.wf-top { display: flex; align-items: center; gap: 6px; padding: 0 12px; background: var(--wf-panel); border-bottom: 1px solid var(--wf-line); min-width: 0; }
.wf-ib { width: 32px; height: 32px; border: none; background: none; border-radius: 8px; color: var(--wf-ink); cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center; flex: none; }
.wf-ib:hover:not(:disabled) { background: var(--wf-accent-wash); }
.wf-ib:disabled { opacity: .3; cursor: default; }
.wf-ib svg { width: 18px; height: 18px; }
.wf-sep { width: 1px; height: 22px; background: var(--wf-line); margin: 0 4px; flex: none; }
.wf-tb { border: 1px solid var(--wf-field); background: var(--wf-panel); border-radius: 8px; padding: 6px 11px; cursor: pointer;
  font: 500 13px/1.2 system-ui, sans-serif; color: var(--wf-ink); white-space: nowrap; flex: none; }
.wf-tb:hover { border-color: #b6bfce; }
.wf-tb.primary { background: var(--wf-accent); border-color: var(--wf-accent); color: #fff; }
.wf-tb:disabled { opacity: .45; cursor: default; }
.wf-title { flex: 1; min-width: 80px; text-align: center; font: 650 15px/1.2 system-ui, sans-serif; color: var(--wf-ink);
  border: 1px solid transparent; background: transparent; padding: 6px 8px; border-radius: 8px; text-overflow: ellipsis; }
.wf-title:hover, .wf-title:focus { border-color: var(--wf-field); outline: none; }
.wf-state { font-size: 12px; color: var(--wf-mut); white-space: nowrap; flex: none; }
.wf-state.dirty { color: #b26a00; }

/* ---- the right-hand property panel ------------------------------------------ */
#panel { border-left: 1px solid var(--wf-line); background: var(--wf-panel); overflow-y: auto; min-width: 0; display: flex; flex-direction: column; }
.pn-empty { margin: auto; padding: 28px 24px; text-align: center; color: var(--wf-mut); display: grid; gap: 10px; justify-items: center; }
.pn-empty svg { width: 34px; height: 34px; color: var(--wf-faint); }
.pn-empty b { color: var(--wf-ink); font-weight: 600; font-size: 13.5px; }
.pn-empty ul { margin: 6px 0 0; padding: 0 0 0 16px; text-align: left; display: grid; gap: 5px; font-size: 12px; }
.pn-head { display: flex; gap: 12px; align-items: center; padding: 16px 18px 14px; border-bottom: 1px solid var(--wf-line); }
.pn-tile { width: 40px; height: 40px; border-radius: 50%; border: 1px solid var(--wf-tile-ring); background: var(--wf-tile);
  display: flex; align-items: center; justify-content: center; flex: none; box-sizing: border-box; }
.pn-tile.sq { border-radius: 12px; } .pn-tile.logic { background: var(--wf-accent-wash); border-color: var(--wf-accent-line); }
.pn-tile .wf-ic { width: 22px; height: 22px; }
.pn-kind { font-size: 10.5px; letter-spacing: .06em; text-transform: uppercase; color: var(--wf-mut); font-weight: 600; }
.pn-title { font: 600 15px/1.3 system-ui, sans-serif; }
.pn-body { padding: 14px 18px 20px; display: grid; gap: 12px; align-content: start; }
.pn-field { display: grid; gap: 5px; font-size: 12px; color: var(--wf-mut); font-weight: 500; }
.pn-field input, .pn-field select, .pn-field textarea, .pn-rule input, .pn-rule select, .pn-out input {
  font: 13px/1.35 system-ui, sans-serif; color: var(--wf-ink); background: var(--wf-panel); border: 1px solid var(--wf-field);
  border-radius: 8px; padding: 7px 9px; min-width: 0; box-sizing: border-box; width: 100%; }
.pn-field textarea { min-height: 76px; resize: vertical; }
.pn-req::after { content: " *"; color: var(--wf-bad); }
.pn-sec { font-size: 10.5px; letter-spacing: .06em; text-transform: uppercase; color: var(--wf-mut); font-weight: 600; margin-top: 4px; }
.pn-out { display: grid; gap: 6px; padding: 9px; border: 1px solid var(--wf-line); border-radius: 10px; }
.pn-out-h { display: grid; grid-template-columns: minmax(0, 1fr) 28px; gap: 6px; }
.pn-rule { display: grid; grid-template-columns: minmax(0, 1fr) 52px 62px; gap: 6px; align-items: center; }
.pn-rule span { font-size: 12px; color: var(--wf-mut); grid-column: span 3; }
.pn-row { display: flex; flex-wrap: wrap; gap: 6px; }
.pn-btn { border: 1px solid var(--wf-field); background: var(--wf-panel); border-radius: 8px; padding: 6px 10px; cursor: pointer;
  font: 500 12px/1.2 system-ui, sans-serif; color: var(--wf-ink); }
.pn-btn:hover { border-color: var(--wf-accent); color: var(--wf-accent); }
.pn-x { width: 28px; height: 28px; padding: 0; color: var(--wf-mut); }
.pn-del { color: var(--wf-bad); border-color: #f0c7c7; justify-self: start; margin-top: 6px; }
.pn-del:hover { border-color: var(--wf-bad); color: var(--wf-bad); }
.pn-hint { font-size: 12px; color: var(--wf-mut); margin: 0; line-height: 1.5; }
.pn-end { display: flex; gap: 10px; align-items: center; padding: 9px 10px; border: 1px solid var(--wf-line); border-radius: 10px; }
.pn-end .pn-tile { width: 32px; height: 32px; } .pn-end .wf-ic { width: 18px; height: 18px; }
.pn-end b { display: block; font-weight: 600; } .pn-end small { color: var(--wf-mut); }
.pn-arrow { text-align: center; color: var(--wf-faint); font-size: 16px; line-height: 1; }
.pn-picks { display: grid; gap: 6px; }
.pn-pick { display: flex; gap: 10px; align-items: center; text-align: left; border: 1px solid var(--wf-line); background: var(--wf-panel);
  border-radius: 10px; padding: 8px 10px; cursor: pointer; color: var(--wf-ink); font: 500 12.5px/1.3 system-ui, sans-serif; }
.pn-pick:hover { border-color: var(--wf-accent); }
.pn-pick .wf-ic { width: 20px; height: 20px; }
.pn-pick small { display: block; color: var(--wf-mut); font-weight: 400; }

/* ---- canvas chrome: menu, run log, navigator, toast ------------------------- */
.wf-menu { position: absolute; z-index: 20; width: 300px; max-height: 410px; display: flex; flex-direction: column;
  background: var(--wf-panel); border: 1px solid var(--wf-line); border-radius: 12px; box-shadow: 0 14px 36px rgba(16,24,40,.18); overflow: hidden; }
.wf-menu[hidden] { display: none; }
.mn-search { margin: 10px; padding: 8px 10px; border: 1px solid var(--wf-field); border-radius: 8px; font: 13px/1.3 system-ui, sans-serif;
  color: var(--wf-ink); background: var(--wf-panel); outline: none; }
.mn-search:focus { border-color: var(--wf-accent); }
.mn-list { overflow-y: auto; padding: 0 6px 8px; }
.mn-cat { font-size: 10.5px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--wf-mut); padding: 8px 8px 4px; }
.mn-item { display: flex; align-items: center; gap: 10px; width: 100%; border: none; background: none; text-align: left; padding: 6px 8px;
  border-radius: 8px; cursor: pointer; color: var(--wf-ink); font: 12.5px/1.25 system-ui, sans-serif; }
.mn-item.on, .mn-item:hover { background: var(--wf-accent-wash); }
.mn-ic { width: 28px; height: 28px; border-radius: 50%; border: 1px solid var(--wf-tile-ring); background: var(--wf-tile);
  display: flex; align-items: center; justify-content: center; flex: none; box-sizing: border-box; }
.mn-ic .wf-ic { width: 16px; height: 16px; }
.mn-item small { display: block; color: var(--wf-mut); font-size: 10.5px; }
.mn-none { padding: 14px 10px; color: var(--wf-mut); font-size: 12.5px; }

.wf-run { position: absolute; left: 14px; top: 14px; z-index: 9; width: 330px; max-width: calc(100% - 28px); max-height: calc(100% - 200px);
  display: flex; flex-direction: column; background: var(--wf-panel); border: 1px solid var(--wf-line); border-radius: 12px;
  box-shadow: 0 10px 30px rgba(16,24,40,.16); font-size: 12px; }
.wf-run[hidden] { display: none; }
.rn-head { display: flex; align-items: center; gap: 8px; padding: 9px 10px 9px 14px; border-bottom: 1px solid var(--wf-line); }
.rn-head b { font-size: 13px; }
.rn-chip { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 999px; background: #fff3d6; color: #9a5b00; }
.rn-chip.ok { background: #dcf5e4; color: #146c34; } .rn-chip.bad { background: #fde2e2; color: #a61b1b; } .rn-chip.idle { background: #eceef3; color: #586073; }
.rn-head .sp { flex: 1; }
.rn-head button { border: 1px solid var(--wf-field); background: var(--wf-panel); border-radius: 7px; padding: 4px 9px; cursor: pointer; font: 500 12px/1.2 system-ui, sans-serif; color: var(--wf-ink); }
.rn-head button[hidden] { display: none; }
.rn-in { display: grid; grid-template-columns: 1fr 104px; gap: 8px; padding: 9px 14px; border-bottom: 1px solid var(--wf-line); }
.rn-in label { display: grid; gap: 3px; color: var(--wf-mut); font-size: 11px; }
.rn-in input, .rn-in select { font: 12.5px/1.3 system-ui, sans-serif; border: 1px solid var(--wf-field); border-radius: 7px; padding: 5px 7px;
  color: var(--wf-ink); background: var(--wf-panel); min-width: 0; }
.rn-log { list-style: none; margin: 0; padding: 5px 0; overflow-y: auto; min-height: 40px; max-height: 164px; font-size: 11.5px; line-height: 1.4; }
.rn-log li { display: grid; grid-template-columns: 14px 18px 1fr; gap: 7px; align-items: start; padding: 4px 12px; }
.rn-log .rn-st { width: 14px; height: 14px; margin-top: 2px; border-radius: 50%; box-sizing: border-box; color: #fff; font: 700 9px/14px system-ui; text-align: center; }
.rn-log .success .rn-st { background: var(--wf-ok); } .rn-log .failed .rn-st { background: var(--wf-bad); } .rn-log .stopped .rn-st { background: #7b8496; }
.rn-log .running .rn-st { border: 2px solid rgba(245,158,11,.3); border-top-color: var(--wf-run); animation: wfspin .7s linear infinite; }
.rn-log .wf-ic { width: 16px; height: 16px; margin-top: 1px; }
.rn-log b { font-weight: 600; } .rn-log .rn-msg { color: var(--wf-mut); overflow-wrap: anywhere; }
.rn-log .note { grid-template-columns: 1fr; color: var(--wf-mut); }

.wf-nav { position: absolute; left: 14px; bottom: 14px; z-index: 8; width: 244px; background: var(--wf-panel); border: 1px solid var(--wf-line);
  border-radius: 12px; box-shadow: 0 8px 24px rgba(16,24,40,.13); overflow: hidden; }
.wf-mm { position: relative; height: 128px; border-bottom: 1px solid var(--wf-line); background: var(--wf-bg); }
.wf-mm[hidden] { display: none; }
.wf-nav-bar { display: flex; align-items: center; gap: 4px; padding: 5px 8px; }
.wf-nav-bar .wf-ib { width: 28px; height: 28px; }
.wf-nav-bar .wf-ib svg { width: 16px; height: 16px; }
.wf-nav-bar .wf-ib[aria-pressed="true"] { color: var(--wf-accent); }
.wf-nav-bar .wf-flash { background: var(--wf-accent-wash); }
.wf-zoom { flex: 1; min-width: 0; accent-color: var(--wf-accent); }
.wf-zoom-v { width: 38px; text-align: right; font: 12px/1 system-ui, sans-serif; color: var(--wf-mut); font-variant-numeric: tabular-nums; }

.wf-toast { position: absolute; left: 50%; top: 14px; z-index: 30; transform: translate(-50%, -8px); opacity: 0; pointer-events: none;
  background: #1e2332; color: #fff; padding: 9px 14px; border-radius: 10px; font: 500 12.5px/1.3 system-ui, sans-serif;
  box-shadow: 0 10px 24px rgba(16,24,40,.25); transition: opacity .18s, transform .18s; max-width: 80%; text-align: center; }
.wf-toast.on { opacity: 1; transform: translate(-50%, 0); }

#wf-measure { position: absolute; left: -10000px; top: 0; visibility: hidden; pointer-events: none; }

/* A narrow stage (the gallery's side panels open): the canvas takes the whole
   width and the property panel slides over it only while something is selected. */
@container (max-width: 1060px) {
  .wf-body { grid-template-columns: minmax(0, 1fr); }
  #panel { position: absolute; top: 0; right: 0; bottom: 0; width: 280px; z-index: 12; box-shadow: -10px 0 28px rgba(16,24,40,.14); transition: transform .18s ease, visibility .18s; }
  #panel.pn-idle { transform: translateX(100%); visibility: hidden; }
  .wf-state { display: none; }
}
@container (max-width: 760px) {
  .wf-nav { width: 200px; } .wf-mm { height: 92px; }
  .wf-top .wf-tb { padding: 6px 8px; }
}

@media (prefers-color-scheme: dark) {
  #stage {
    --wf-bg: #14161b; --wf-dot: #262a33; --wf-panel: #1b1e25; --wf-line: #2b2f39; --wf-field: #363b47;
    --wf-ink: #e7eaf1; --wf-mut: #9ba3b5; --wf-faint: #6c7486;
    --wf-accent: #8b9cf2; --wf-accent-wash: #232a44; --wf-accent-line: #3b4677;
    --wf-tile: #f4f6fa; --wf-tile-ring: #3a3f4b; --wf-note: #2f2a17; --wf-note-line: #5a4d1d; --wf-note-ink: #f1e3b0; --wf-note-mut: #cdbf8d;
    --wf-shadow: 0 1px 2px rgba(0,0,0,.35), 0 4px 12px rgba(0,0,0,.3);
  }
  .wf-logic .wf-tile { background: #dfe4fb; border-color: #5d6bb3; }
  .wf-plus { border-color: #4a5060; }
  .wf-ph .wf-tile { border-color: #5a6274; }
  .wf-toast { background: #eef0f6; color: #1e2332; }
  .rn-chip { background: #3d2f12; color: #f5c56b; } .rn-chip.ok { background: #153321; color: #7fd69c; } .rn-chip.bad { background: #3a1717; color: #f19a9a; } .rn-chip.idle { background: #2a2e38; color: #a3aab8; }
  .pn-del { border-color: #5a2a2a; }
  .wf-tb.primary { background: #4f63e3; border-color: #4f63e3; }
}
@media (prefers-reduced-motion: reduce) { .st-running .wf-tile, .st-running .wf-badge, .rn-log .running .rn-st { animation: none; } }
`,f=[],c={portVisibility:"always",connectionLineStyle:"bezier"},x={display:"block",height:"100%",width:"100%"},w=e=>e&&r("div",{class:a(e,"cls")},null,e.icon?r("span",{class:`wf-ic ic-${e.icon}`},null,null,3,"7K_0"):"+",1,"7K_1");function b(e,t){return e}const g=n(i(()=>o(()=>import("./workflow-builder.tsx_workflow_builder_component_TgJl2CC7c90-BM2uXAA5.js"),[],import.meta.url),"s_TgJl2CC7c90"));export{l as _auto_CSS,x as _auto_FLOW_STYLE,c as _auto_INTERACTION,f as _auto_NO_NODES,b as _auto_at,w as _auto_tile,g as default};
