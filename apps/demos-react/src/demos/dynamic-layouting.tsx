import { GrafloriaFlow } from '@grafloria/react';
import type { DiagramInstance } from '@grafloria/react';
import { markReady } from '../ready';

// A layered pipeline. Lay it out left-to-right; an incremental pass can later
// insert a node into the middle and move the existing nodes MUCH less than a
// from-scratch relayout would (engine.layoutIncremental).
const nodes = ['n0', 'n1', 'n2', 'n3', 'n4', 'n5'].map((id) => ({
  id, position: { x: 0, y: 0 }, size: { width: 110, height: 46 }, label: id,
}));
const edges = [
  { id: 'e0', source: 'n0', target: 'n1' },
  { id: 'e1', source: 'n1', target: 'n2' },
  { id: 'e2', source: 'n2', target: 'n3' },
  { id: 'e3', source: 'n3', target: 'n4' },
  { id: 'e4', source: 'n4', target: 'n5' },
];

/** Mental-map-preserving incremental layout: lay out the chain n0 → n5, then an
 *  incremental pass inserts a node with minimal disturbance to the rest. */
export default function DynamicLayoutingDemo() {
  const onInit = (instance: DiagramInstance) => {
    (async () => {
      const engine = instance.getEngine();
      await engine.layout('layered', { direction: 'LR' });
      instance.renderNow();
      instance.fitView(40);

      // Incremental insert wired into the middle of the chain, placed by an
      // incremental pass that leaves the existing nodes largely in place.
      instance.setNodes([
        ...nodes,
        { id: 'inserted', position: { x: 0, y: 0 }, size: { width: 110, height: 46 }, label: 'inserted' },
      ]);
      instance.setEdges([
        ...edges,
        { id: 'x0', source: 'n2', target: 'inserted' },
        { id: 'x1', source: 'inserted', target: 'n4' },
      ]);
      await engine.layoutIncremental({ changed: ['inserted'], direction: 'LR', radius: 1 });
      instance.renderNow();
      instance.fitView(40);
      markReady();
    })();
  };
  return (
    <div style={{ height: '100vh' }}>
      <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} onInit={onInit} />
    </div>
  );
}
