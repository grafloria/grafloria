import{_ as o}from"./preload-helper-D57DdDQb.js";import{y as r,L as e}from"./core.min-C7M5tFMw.js";import"./preloader-D7tuiBjF.js";const s=`
#vs-shell { display: flex; flex-direction: column; height: 100vh; min-height: 0; }
#vs-bar {
  display: flex; align-items: center; gap: 6px; padding: 6px 10px; flex: none;
  border-bottom: 1px solid var(--gf-line, #e5e7eb); background: var(--gf-panel, #fff);
  font: 12px ui-sans-serif, system-ui, sans-serif;
}
#vs-bar button {
  padding: 5px 10px; border-radius: 7px; border: 1px solid var(--gf-line, #e5e7eb);
  background: var(--gf-bg, #fff); color: var(--gf-ink, #1e2436); cursor: pointer; font: inherit;
}
#vs-bar button:hover:not(:disabled) { border-color: #3B52D9; color: #3B52D9; }
#vs-bar button:disabled { opacity: .45; cursor: default; }
#vs-bar button.toggle[aria-pressed="true"] {
  background: rgba(59,82,217,.12); border-color: #3B52D9; color: #3B52D9;
}
#vs-bar .sep { width: 1px; height: 18px; background: var(--gf-line, #e5e7eb); margin: 0 4px; }
#vs-bar .hint { margin-left: auto; color: var(--gf-mut, #6b7280); }
#vs-body { display: flex; flex: 1; min-height: 0; }
/* The rails must never crush the canvas: they shrink first, and the data panel
   drops out entirely when narrow. */
#vs-rail { flex: 0 1 200px; min-width: 128px; }
#vs-canvas { flex: 1 1 auto; min-width: 260px; position: relative; }
#vs-panel { flex: 0 1 200px; min-width: 150px; }
@media (max-width: 1500px) { #vs-panel { display: none; } }
@media (max-width: 1180px) { #vs-rail { flex-basis: 150px; } }
#vs-menu {
  position: absolute; z-index: 30; min-width: 170px; display: none;
  background: var(--gf-panel, #fff); border: 1px solid var(--gf-line, #e5e7eb);
  border-radius: 8px; box-shadow: 0 8px 30px rgba(0,0,0,.15); padding: 4px;
  font: 12px ui-sans-serif, system-ui, sans-serif;
}
#vs-menu.open { display: block; }
#vs-menu button {
  display: block; width: 100%; text-align: left; padding: 6px 10px; border: 0;
  background: transparent; color: var(--gf-ink, #1e2436); border-radius: 5px;
  cursor: pointer; font: inherit;
}
#vs-menu button:hover:not(:disabled) { background: rgba(59,82,217,.1); color: #3B52D9; }
#vs-menu button:disabled { opacity: .45; cursor: default; }
#vs-zoom {
  position: absolute; right: 10px; bottom: 34px; z-index: 25;
  display: flex; align-items: center; gap: 2px; padding: 3px;
  background: var(--gf-panel, #fff); border: 1px solid var(--gf-line, #e5e7eb);
  border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,.08);
  font: 12px ui-sans-serif, system-ui, sans-serif;
}
#vs-zoom button {
  padding: 4px 8px; border: 0; border-radius: 6px; background: transparent;
  color: var(--gf-ink, #1e2436); cursor: pointer; font: inherit;
}
#vs-zoom button:hover { background: rgba(59,82,217,.1); color: #3B52D9; }
#vs-zoom #vs-zoom-pct { min-width: 44px; text-align: center; font-variant-numeric: tabular-nums; }
`,n=r(e(()=>o(()=>import("./visio-editor.tsx_Toolbar_component_YT9j0k52EVo-DLCGzSMU.js"),[],import.meta.url),"s_YT9j0k52EVo")),p=r(e(()=>o(()=>import("./visio-editor.tsx_ZoomCluster_component_17Fqf4c0agc-cdP4aWTn.js"),[],import.meta.url),"s_17Fqf4c0agc")),d=r(e(()=>o(()=>import("./visio-editor.tsx_ContextMenu_component_15x460E7lII-BhDpX1Yk.js"),[],import.meta.url),"s_15x460E7lII")),l=r(e(()=>o(()=>import("./visio-editor.tsx_visio_editor_component_GVADNdO057E-nYMZqWj5.js"),[],import.meta.url),"s_GVADNdO057E"));export{s as _auto_CSS,d as _auto_ContextMenu,n as _auto_Toolbar,p as _auto_ZoomCluster,l as default};
