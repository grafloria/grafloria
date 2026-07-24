import { GrafloriaFlow } from '@grafloria/react';
import type { DiagramInstance } from '@grafloria/react';
import { markReady } from '../ready';

const nodes = [
  { id: 'n1', position: { x: 320, y: 160 }, size: { width: 120, height: 60 }, label: 'ingest' },
  { id: 'n2', position: { x: 520, y: 160 }, size: { width: 120, height: 60 }, label: 'transform' },
  { id: 'n3', position: { x: 420, y: 280 }, size: { width: 120, height: 60 }, label: 'retry' },
];
const edges = [
  { id: 'e1', source: 'n1', target: 'n2' },
  { id: 'e2', source: 'n1', target: 'n3' },
];

/** Groups draw a visible, labelled, themed frame — nested containers included.
 *  The "Pipeline" frame wraps three nodes; a nested "Retry handler" frame sits
 *  inside it, and both paint behind the nodes without stealing their clicks. */
export default function GroupFramesDemo() {
  const onInit = (instance: DiagramInstance) => {
    const engine = instance.getEngine() as any;
    (async () => {
      const diagram = engine.getDiagram();
      const outer = await engine.addGroup({ name: 'Pipeline' });
      outer.setFrame({ x: 290, y: 120, width: 400, height: 240 });
      await engine.addToGroup(outer.id, 'n1');
      await engine.addToGroup(outer.id, 'n2');
      await engine.addToGroup(outer.id, 'n3');

      const inner = await engine.addGroup({ name: 'Retry handler' });
      inner.setFrame({ x: 390, y: 250, width: 180, height: 100 });
      await engine.addToGroup(inner.id, 'n3');
      outer.addMember(inner.id, diagram);
      instance.renderNow();
      markReady();
    })();
  };
  return (
    <div style={{ height: '100vh' }}>
      <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} onInit={onInit} />
    </div>
  );
}
