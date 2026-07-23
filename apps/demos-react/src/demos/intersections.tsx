import type { DiagramInstance } from '@grafloria/react';
import { GrafloriaFlow } from '@grafloria/react';
import { createDiagramApi } from '@grafloria/element';
import { markReady } from '../ready';

const nodes = [
  { id: 'a', position: { x: 120, y: 140 }, size: { width: 180, height: 110 }, label: 'A · drag me' },
  { id: 'b', position: { x: 460, y: 140 }, size: { width: 180, height: 110 }, label: 'B' },
  { id: 'c', position: { x: 800, y: 140 }, size: { width: 180, height: 110 }, label: 'C' },
  // Small enough to fit ENTIRELY inside another node (overlap vs containment).
  { id: 's', position: { x: 150, y: 430 }, size: { width: 60, height: 60 }, label: 'S' },
];
const edges: any[] = [];

// The shared highlight style. Identity (===) marks a highlight as ours.
const HILITE = { type: 'rect', fill: '#fecaca', stroke: '#dc2626' };
const rectOf = (n: any) => ({ x: n.position.x, y: n.position.y, width: n.size.width, height: n.size.height });

/** Drag a node and every node it overlaps lights up red, live — the public
 *  createDiagramApi(...).getIntersectingNodes wrapper on each move. */
export default function IntersectionsDemo() {
  const onInit = (instance: DiagramInstance) => {
    const model = instance.getModel() as any;
    const api = createDiagramApi(instance as any) as any;

    const hits = (id: string) => api
      .getIntersectingNodes(rectOf(model.getNode(id)))
      .filter((o: any) => o.id !== id)
      .map((o: any) => o.id);

    const relight = (movedId: string) => {
      const moved = model.getNode(movedId);
      if (!moved) return;
      const lit = hits(movedId);
      for (const n of model.getNodes()) {
        const want = lit.includes(n.id);
        const has = n.getMetadata('shape') === HILITE;
        if (want && !has) n.setMetadata('shape', HILITE);
        else if (!want && has) n.setMetadata('shape', undefined);
      }
    };
    model.on('node:moved', ({ nodeId }: any) => relight(nodeId));
    markReady();
  };
  return (
    <div style={{ height: '100vh' }}>
      <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} onInit={onInit} />
    </div>
  );
}
