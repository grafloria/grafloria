import type { DiagramInstance } from '@grafloria/react';
import { GrafloriaFlow } from '@grafloria/react';
import { markReady } from '../ready';

const nodes: any[] = [
  { id: 'm1', position: { x: 400, y: 200 }, size: { width: 100, height: 50 }, label: 'stage 1' },
  { id: 'm2', position: { x: 560, y: 220 }, size: { width: 100, height: 50 }, label: 'stage 2' },
  { id: 'outside', position: { x: 120, y: 500 }, size: { width: 100, height: 50 }, label: 'outside' },
];
const edges: any[] = [{ id: 'e1', source: 'm1', target: 'm2' }];

/** Drag a subflow container by its frame and the whole graph inside it moves
 *  with it — members and frame together, as one undoable step. The page only
 *  flips enableGroupDrag and builds the group; the engine does the rest. */
export default function ParentMoveDemo() {
  const onInit = (instance: DiagramInstance) => {
    const api = instance as any;
    const engine = instance.getEngine() as any;
    engine.setInteractionConfig({ enableGroupDrag: true });
    (async () => {
      const g = await engine.addGroup({ name: 'Pipeline' });
      g.setFrame({ x: 370, y: 180, width: 320, height: 170 });
      await engine.addToGroup(g.id, 'm1');
      await engine.addToGroup(g.id, 'm2');
      api.renderNow();
      markReady();
    })();
  };
  return (
    <div style={{ height: '100vh' }}>
      <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} onInit={onInit} />
    </div>
  );
}
