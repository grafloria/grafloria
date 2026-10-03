import{_ as o}from"./preload-helper-D57DdDQb.js";import{y as r,L as a}from"./core.min-DSxUtzo6.js";import"./preloader-D7tuiBjF.js";const d=[{kind:"kpi",label:"KPI stat",glyph:"#",color:"#3b52d9"},{kind:"line",label:"Line / area",glyph:"∿",color:"#0ea5e9"},{kind:"bar",label:"Bar chart",glyph:"▊",color:"#14b8a6"},{kind:"donut",label:"Donut",glyph:"◕",color:"#f59e0b"},{kind:"funnel",label:"Funnel",glyph:"▽",color:"#8b5cf6"},{kind:"table",label:"Table",glyph:"▤",color:"#64748b"}],s=`
  .db-page { height: 100vh; display: flex; flex-direction: column; }
  .db-bar { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding: 8px 20px;
    border-bottom: 1px solid rgba(127,127,127,.22); background: var(--db-bar-bg, #fbfbfd); }
  .db-tabs { display: flex; gap: 4px; margin-right: auto; }
  .db-tab { border: 1px solid transparent; background: none; cursor: pointer;
    font: 600 13px/1.2 system-ui, sans-serif; color: #5b6270; padding: 7px 14px; border-radius: 8px; }
  .db-tab:hover { background: rgba(127,127,127,.09); color: #2d2e3a; }
  .db-tab[aria-selected="true"] { background: #eef2ff; color: #3b52d9; border-color: #d6def9; }
  .db-tool { border: 1px solid #d8dce6; background: #fff; cursor: pointer;
    font: 500 12px/1.2 system-ui, sans-serif; color: #3c4254; padding: 7px 10px; border-radius: 7px; }
  .db-tool:hover { border-color: #b9c0d0; background: #f6f7fb; }
  .db-tool:disabled { opacity: .42; cursor: default; }
  .db-sep { width: 1px; height: 22px; background: rgba(127,127,127,.24); margin: 0 4px; }
  .db-body { flex: 1; min-height: 0; display: grid; grid-template-columns: 172px 1fr auto; }
  .db-palette { border-right: 1px solid rgba(127,127,127,.2); padding: 12px 12px 16px; overflow-y: auto; background: var(--db-pal-bg, #fafbfd); }
  .pal-title { font: 700 10px/1.4 system-ui, sans-serif; letter-spacing: .8px; text-transform: uppercase; color: #8a91a2; margin: 2px 2px 9px; }
  .pal-item { display: flex; align-items: center; gap: 9px; width: 100%; margin: 0 0 8px; padding: 8px 9px;
    border: 1px solid #e4e7ee; border-radius: 9px; background: #fff; cursor: pointer; text-align: left;
    font: 500 12.5px/1.2 system-ui, sans-serif; color: #2d2e3a; box-shadow: 0 1px 1px rgba(16,24,40,.04); }
  .pal-item:hover { border-color: #b9c0d0; background: #f6f7fb; }
  .pal-glyph { width: 26px; height: 26px; border-radius: 7px; flex: none; display: flex; align-items: center;
    justify-content: center; font-size: 15px; color: #fff; }
  .pal-note { margin: 12px 2px 0; font: 11px/1.5 system-ui, sans-serif; color: #949bab; }
  .pal-layout { display: flex; gap: 8px; }
  .pal-item.pal-half { width: auto; flex: 1; justify-content: center; }
  .pal-item[aria-pressed="true"] { background: rgba(59, 82, 217, .12); border-color: #3b52d9; color: #2c3fb0; }
  .db-canvas { --axdb-rs-radius: 3px; position: relative; overflow: hidden; height: 100%;
    background-color: var(--db-canvas-bg, #f1f3f7);
    background-image: radial-gradient(circle, rgba(120,128,145,.16) 1px, transparent 1px); background-size: 26px 26px; }
  .db-status { position: absolute; left: 14px; bottom: 12px; z-index: 6; max-width: 72%; padding: 6px 11px; border-radius: 8px;
    background: rgba(20,24,33,.86); color: #eef1f7; font: 500 11.5px/1.35 ui-monospace, SFMono-Regular, monospace;
    pointer-events: none; box-shadow: 0 3px 10px rgba(15,23,42,.2); opacity: 0; transition: opacity .18s; }
  .db-status.show { opacity: 1; }
  .db-history { display: flex; flex-direction: column; width: 272px; overflow: hidden;
    border-left: 1px solid rgba(127,127,127,.2); background: var(--db-pal-bg, #fafbfd); }
  .hist-head { display: flex; align-items: center; gap: 6px; padding: 12px 12px 8px; }
  .hist-title { font: 700 10px/1.4 system-ui, sans-serif; letter-spacing: .8px; text-transform: uppercase; color: #8a91a2; }
  .hist-count { font: 500 10.5px/1.4 ui-monospace, SFMono-Regular, monospace; color: #a9b0be; margin-right: auto; }
  .hist-btn { border: 1px solid #d8dce6; background: #fff; cursor: pointer; color: #5b6270;
    font: 500 11px/1.2 system-ui, sans-serif; padding: 4px 7px; border-radius: 6px; }
  .hist-list { flex: 1; min-height: 0; overflow-y: auto; padding: 0 12px 2px; }
  .hist-item { display: block; width: 100%; margin: 0 0 8px; padding: 7px; text-align: left;
    border: 1px solid #e4e7ee; border-radius: 9px; background: #fff; cursor: pointer; box-shadow: 0 1px 1px rgba(16,24,40,.04); }
  .hist-item:hover { border-color: #b9c0d0; background: #f6f7fb; }
  .hist-item.current { border-color: #3b52d9; background: #eef2ff; }
  .hist-thumb { display: block; width: 100%; height: auto; border: 1px solid #edeff4; border-radius: 5px; background: var(--db-canvas-bg, #f1f3f7); }
  .hist-thumb-none { display: flex; align-items: center; justify-content: center; height: 74px;
    font: 500 10.5px/1.2 system-ui, sans-serif; color: #b3b9c6; }
  .hist-row { display: flex; align-items: baseline; gap: 6px; margin: 7px 1px 0; }
  .hist-id { font: 700 11.5px/1.2 ui-monospace, SFMono-Regular, monospace; color: #2d2e3a; }
  .hist-when { font: 500 11px/1.2 system-ui, sans-serif; color: #8a91a2; margin-right: auto; }
  .hist-tag { font: 600 9.5px/1.6 system-ui, sans-serif; letter-spacing: .3px; text-transform: uppercase;
    padding: 1px 5px; border-radius: 4px; background: #eef0f5; color: #7c8494; }
  .hist-tag.now { background: #3b52d9; color: #fff; }
  .hist-sub { margin: 3px 1px 0; font: 500 11px/1.35 system-ui, sans-serif; color: #5b6270; }
  .hist-delta { margin: 1px 1px 0; font: 11px/1.35 system-ui, sans-serif; color: #949bab; }
  .hist-empty { padding: 8px 2px; font: 11.5px/1.55 system-ui, sans-serif; color: #949bab; }
  .hist-note { padding: 9px 12px 12px; border-top: 1px solid rgba(127,127,127,.14); font: 11px/1.5 system-ui, sans-serif; color: #949bab; }
  /* App chrome on top of the kit's widget cards: clickable tiles, the FOCUSED
     one ringed (the toolbar's target), PINNED ones marked. */
  .db-canvas .axdb-widget { cursor: pointer; transition: box-shadow .14s, border-color .14s; }
  .db-canvas .axdb-widget:hover { border-color: #c4ccdb; }
  .db-canvas .axdb-widget.focused { border-color: #3b52d9; box-shadow: 0 0 0 2px rgba(59,82,217,.28), 0 3px 12px rgba(59,82,217,.14); }
  .db-canvas .axdb-widget .pin { margin-left: auto; font-size: 12px; opacity: 0; }
  .db-canvas .axdb-widget.locked .pin { opacity: 1; color: #d0912a; }
  .db-canvas .grafloria-html-layer.glide > .grafloria-node-host {
    transition: left .28s cubic-bezier(.2, 0, .2, 1), top .28s cubic-bezier(.2, 0, .2, 1),
                width .28s cubic-bezier(.2, 0, .2, 1), height .28s cubic-bezier(.2, 0, .2, 1); }
  @media (prefers-color-scheme: dark) {
    .db-bar { --db-bar-bg: #171a21; } .db-palette, .db-history { --db-pal-bg: #14161c; }
    .db-canvas { --db-canvas-bg: #0f1116; background-image: radial-gradient(circle, rgba(150,160,180,.14) 1px, transparent 1px); }
    .db-tab { color: #9aa2b2; } .db-tab:hover { color: #e6e9f0; }
    .db-tab[aria-selected="true"] { background: #23294a; color: #b7c2ff; border-color: #33407a; }
    .db-tool, .pal-item, .hist-btn, .hist-item { background: #1c1f27; border-color: #333a49; color: #cbd2df; }
    .db-tool:hover, .pal-item:hover, .hist-item:hover { background: #232734; }
    .hist-item.current { background: #23294a; border-color: #33407a; }
    .hist-id { color: #e6e9f0; } .hist-sub { color: #aab2c2; }
  }
`,p=r(a(()=>o(()=>import("./dashboard-builder.tsx_dashboard_builder_component_DCLDmxhpHzE-BsI5hUnf.js"),[],import.meta.url),"s_DCLDmxhpHzE"));export{d as _auto_CHIPS,s as _auto_CSS,p as default};
