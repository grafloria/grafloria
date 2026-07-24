import { useRef } from 'react';
import type { DiagramInstance } from '@grafloria/react';
import { GrafloriaFlow } from '@grafloria/react';
import { markReady } from '../ready';

/** Drag a node type from the palette and drop it on the canvas: it is created
 *  at the drop point in WORLD space, so it lands under the cursor even after the
 *  camera has panned or zoomed. */
export default function DragAndDropDemo() {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const readoutRef = useRef<HTMLSpanElement | null>(null);
  const dragKind = useRef<string | null>(null);

  const onInit = (instance: DiagramInstance) => {
    const host = canvasRef.current!;
    const api = instance as any;
    const engine = instance.getEngine() as any;
    const model = api.getModel();

    const clientToWorld = (clientX: number, clientY: number) => {
      const rect = host.getBoundingClientRect();
      const vp = api.viewport;
      const zoom = vp.getZoom();
      const v = vp.getViewport();
      return { x: v.x + (clientX - rect.left) / zoom, y: v.y + (clientY - rect.top) / zoom };
    };
    const dropAt = async (kind: string, clientX: number, clientY: number) => {
      const w = clientToWorld(clientX, clientY);
      const node = await engine.addNode({ type: 'rect', position: { x: w.x - 55, y: w.y - 22 }, size: { width: 110, height: 44 } });
      node.data = { kind };
      node.setMetadata('label', kind);
      api.renderNow();
      if (readoutRef.current) readoutRef.current.textContent = `${model.getNodes().length} nodes`;
      return node;
    };

    host.addEventListener('dragover', (e) => e.preventDefault());
    host.addEventListener('drop', (e) => {
      e.preventDefault();
      if (dragKind.current) dropAt(dragKind.current, e.clientX, e.clientY);
    });

    // Seed two nodes so the canvas is populated on load (the same drop path).
    (async () => {
      const rect = host.getBoundingClientRect();
      await dropAt('source', rect.left + 260, rect.top + 180);
      await dropAt('filter', rect.left + 460, rect.top + 300);
      markReady();
    })();
  };

  const chip = { padding: 10, border: '1px dashed rgba(127,127,127,.5)', borderRadius: 8, textAlign: 'center' as const,
    cursor: 'grab', userSelect: 'none' as const, font: '13px/1.2 system-ui, sans-serif' };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', height: '100vh' }}>
      <div style={{ borderRight: '1px solid rgba(127,127,127,.25)', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {['source', 'filter', 'sink'].map((k) => (
          <div key={k} style={chip} draggable onDragStart={() => { dragKind.current = k; }}>
            {k[0].toUpperCase() + k.slice(1)}
          </div>
        ))}
      </div>
      <div ref={canvasRef} style={{ height: '100%', position: 'relative' }}>
        <span ref={readoutRef} style={{ position: 'absolute', right: 10, top: 8, zIndex: 5, font: '12px/1.4 ui-monospace, monospace', opacity: 0.75 }} />
        <GrafloriaFlow defaultNodes={[]} defaultEdges={[]} onInit={onInit} />
      </div>
    </div>
  );
}
