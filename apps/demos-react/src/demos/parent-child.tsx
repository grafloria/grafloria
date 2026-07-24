import { GrafloriaFlow } from '@grafloria/react';
import type { DiagramInstance } from '@grafloria/react';
import { markReady } from '../ready';

const nodes = [
  { id: 'child', position: { x: 120, y: 420 }, size: { width: 100, height: 50 }, label: 'child' },
];
const edges: never[] = [];

/** A container group with a real frame: drag the child in — it becomes a
 *  member and the frame carries it; membership is explicit, geometry never
 *  silently detaches it. Group API via the public engine. */
export default function ParentChildDemo() {
  const onInit = (instance: DiagramInstance) => {
    const engine = instance.getEngine() as any;
    (async () => {
      engine.setInteractionConfig({ enableGroupDrag: true });
      const g = await engine.addGroup({ name: 'Container' });
      g.setFrame({ x: 400, y: 150, width: 320, height: 260 });
      g.constrainChildren = true;
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
