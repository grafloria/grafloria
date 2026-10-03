import { useEffect, useRef } from 'react';
import { GrafloriaFlow } from '@grafloria/react';
import type { DiagramInstance } from '@grafloria/react';
import { registerStencils, bindShapeDataPanel, NodeFactory } from '@grafloria/element';
import { markReady } from '../ready';

/** T9/visio — Visio's "Shape Data" window. Every master ships a dataSchema and
 *  the values live on node.data. Select a shape and edit the fields its master
 *  declares — a framework-free property sheet (bindShapeDataPanel) driven by the
 *  template's dataSchema, writing through SetNodeDataCommand so every field edit
 *  is undoable (Ctrl/⌘+Z) and collab-safe. Click empty canvas to deselect; the
 *  panel follows the selection. */
type PanelHandle = ReturnType<typeof bindShapeDataPanel>;

export default function ShapeData() {
  const panel = useRef<HTMLDivElement>(null);
  const handle = useRef<PanelHandle | null>(null);
  useEffect(() => () => { handle.current?.destroy(); handle.current = null; }, []);

  const onInit = (api: DiagramInstance) => {
    const engine = api.getEngine() as any;
    // Masters carry the dataSchema the panel renders.
    registerStencils(engine.templateRegistry);
    const factory = new NodeFactory(engine.templateRegistry, api.getModel() as any);
    factory.createFromTemplate('flowchart-decision', { label: 'Approve?' }, { x: 220, y: 180 });
    factory.createFromTemplate('flowchart-process', { label: 'Pay' }, { x: 460, y: 180 });

    // The panel owns its element's inside; a remount re-binds a fresh one.
    handle.current?.destroy();
    handle.current = bindShapeDataPanel(api as any, panel.current!);

    api.renderNow();
    markReady();
  };

  return (
    <div style={{ display: 'flex', height: '100vh', minHeight: 0 }}>
      <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
        <GrafloriaFlow defaultNodes={[]} defaultEdges={[]} onInit={onInit} />
      </div>
      <div id="sd-panel" ref={panel} style={{ width: 232, flex: 'none' }} />
    </div>
  );
}
