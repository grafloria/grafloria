import { useEffect, useRef, useState } from 'react';
import { GrafloriaFlow } from '@grafloria/react';
import type { DiagramInstance } from '@grafloria/react';
import { markReady } from '../ready';
import {
  BAR, VISIO_NODES, VISIO_EDGES, VisioEditor, barDisabled, initialUi, type VisioUi,
} from './visio-editor-controller';

const CSS = `
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
`;

/**
 * Visio-style editor — the whole authoring surface: a page grid with snap, zoom
 * controls and a minimap, drop a shape OR a real database table, group, align,
 * drop into containers — every edit undoable.
 *
 *   T4/T5  stencil registry + 8 categorized stencils
 *   T6/T7  the palette, and drag-from-palette to place a master
 *   T3     align & distribute over the selection
 *   T8     drop a shape in a container and it joins it
 *   T9     the shape-data panel, driven by each master's dataSchema
 *   T10    double-click to rename
 *   T1/T2  snap guides on drag AND on resize (switched on HERE, not globally)
 *
 * The engine wiring lives in VisioEditor (visio-editor-controller.ts, shared by
 * the four framework versions); this component renders the chrome — toolbar,
 * zoom cluster, context menu — from the controller's state.
 */
export default function VisioEditorDemo() {
  const [ui, setUi] = useState<VisioUi>(initialUi);
  const ctl = useRef<VisioEditor | null>(null);
  const rail = useRef<HTMLDivElement | null>(null);
  const canvas = useRef<HTMLDivElement | null>(null);
  const panel = useRef<HTMLDivElement | null>(null);

  useEffect(() => () => { ctl.current?.dispose(); ctl.current = null; }, []);

  const onInit = (instance: DiagramInstance) => {
    // StrictMode mounts the flow twice in development: drop the first
    // instance's wiring (listeners, the global marquee tool) before re-binding.
    ctl.current?.dispose();
    const editor = new VisioEditor(instance, { canvas: canvas.current!, rail: rail.current!, panel: panel.current! }, setUi);
    ctl.current = editor;
    void editor.init().then(() => { if (ctl.current === editor) markReady(); });
  };

  return (
    <>
      <style>{CSS}</style>
      <div id="vs-shell">
        <div id="vs-bar">
          {BAR.map((item, i) => {
            if (item.kind === 'sep') return <span key={i} className="sep" />;
            if (item.kind === 'toggle') {
              const which = item.toggle;
              return (
                <button key={i} className="toggle" title={item.title} aria-pressed={ui[which] ? 'true' : 'false'}
                  onClick={() => ctl.current?.toggle(which)}>{item.label}</button>
              );
            }
            const action = item.action;
            return (
              <button key={i} title={item.title} disabled={barDisabled(item, ui)}
                onClick={() => void ctl.current?.run(action)}>{item.label}</button>
            );
          })}
          <span className="hint">drag a shape from the rail →</span>
        </div>

        <div id="vs-body">
          <div id="vs-rail" ref={rail} />
          <div id="vs-canvas" ref={canvas}
            onContextMenu={(e) => { e.preventDefault(); ctl.current?.openMenuAt(e.clientX, e.clientY); }}>
            <GrafloriaFlow defaultNodes={VISIO_NODES} defaultEdges={VISIO_EDGES} onInit={onInit} />

            {/* ZOOM CLUSTER — bottom-right, the Visio/Figma convention: − % + fit.
                The % readout doubles as reset-to-100%. */}
            <div id="vs-zoom">
              <button title="Zoom out (Ctrl/⌘ −)" onClick={() => ctl.current?.zoomOut()}>−</button>
              <button id="vs-zoom-pct" title="Zoom level — click to reset to 100% (Ctrl/⌘ 0)"
                onClick={() => ctl.current?.zoomReset()}>{ui.zoomPct}</button>
              <button title="Zoom in (Ctrl/⌘ =)" onClick={() => ctl.current?.zoomIn()}>＋</button>
              <button title="Fit the diagram in view (Ctrl/⌘+Shift+F)" onClick={() => ctl.current?.fit()}>⤢</button>
            </div>

            {/* CONTEXT MENU — whatever is under the pointer: node / edge / canvas. */}
            <div id="vs-menu" className={ui.menu ? 'open' : undefined}
              style={ui.menu ? { left: ui.menu.x, top: ui.menu.y } : undefined}>
              {ui.menu?.items.map((m, i) => (
                <button key={m.label} disabled={!m.enabled}
                  onClick={() => void ctl.current?.runMenuItem(i)}>{m.label}</button>
              ))}
            </div>
          </div>
          <div id="vs-panel" ref={panel} />
        </div>
      </div>
    </>
  );
}
