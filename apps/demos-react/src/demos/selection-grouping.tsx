import { GrafloriaFlow } from '@grafloria/react';
import type { DiagramInstance } from '@grafloria/react';
import { markReady } from '../ready';

const nodes = [
  { id: 'n1', position: { x: 160, y: 140 }, size: { width: 120, height: 60 }, label: 'n1' },
  { id: 'n2', position: { x: 360, y: 160 }, size: { width: 120, height: 60 }, label: 'n2' },
  { id: 'n3', position: { x: 700, y: 300 }, size: { width: 120, height: 60 }, label: 'n3 (leave out)' },
];
const edges = [{ id: 'e1', source: 'n1', target: 'n2' }];

/** Bundle a selection into a container: n1 and n2 are selected and grouped, and
 *  the fitted frame wraps exactly that pair — the far-off n3 stays outside. */
export default function SelectionGroupingDemo() {
  const onInit = (instance: DiagramInstance) => {
    const engine = instance.getEngine() as any;
    (async () => {
      const diagram = engine.getDiagram();
      diagram.getNode('n1')?.setSelected(true);
      diagram.getNode('n2')?.setSelected(true);
      const ids = diagram.getSelectedNodes().map((n: { id: string }) => n.id);
      const g = await engine.addGroup({ name: 'Group' });
      for (const id of ids) await engine.addToGroup(g.id, id);
      g.fitToContents(diagram);
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
