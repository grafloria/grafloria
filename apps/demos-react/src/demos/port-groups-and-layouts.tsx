import { GrafloriaFlow } from '@grafloria/react';
import type { DiagramInstance } from '@grafloria/react';
import { markReady } from '../ready';

/** A port GROUP declares a layout once; its member ports inherit it. Three
 *  pluggable strategies: sideLinear (a column down one edge), line (evenly along
 *  a node-local segment), ellipseSpread (fanned around the inscribed ellipse). */
const ringPorts = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `r${i}`, group: 'g', shape: { shape: 'circle', size: 10 } }));

const nodes = [
  { id: 'side', position: { x: 80, y: 200 }, size: { width: 130, height: 220 }, label: 'sideLinear',
    metadata: { portGroups: { g: { id: 'g', side: 'left', layout: { strategy: 'sideLinear', args: { padding: 10 } } } } },
    ports: Array.from({ length: 4 }, (_, i) => ({ id: `s${i}`, group: 'g', shape: { shape: 'circle', size: 10 } })) },
  { id: 'line', position: { x: 330, y: 200 }, size: { width: 200, height: 220 }, label: 'line',
    metadata: { portGroups: { g: { id: 'g', layout: { strategy: 'line', args: { start: { x: 0, y: 0 }, end: { x: 200, y: 220 } } } } } },
    ports: Array.from({ length: 4 }, (_, i) => ({ id: `l${i}`, group: 'g', shape: { shape: 'circle', size: 10 } })) },
  { id: 'ring', position: { x: 640, y: 190 }, size: { width: 200, height: 200 }, label: 'ellipseSpread',
    metadata: { portGroups: { g: { id: 'g', layout: { strategy: 'ellipseSpread', args: { sweep: 360 } } } } },
    ports: ringPorts(6) },
];
const edges: never[] = [];

export default function PortGroupsAndLayoutsDemo() {
  const onInit = (instance: DiagramInstance) => {
    instance.getEngine().setInteractionConfig({ portVisibility: 'always' as never });
    instance.renderNow();
    markReady();
  };
  return (
    <div style={{ height: '100vh' }}>
      <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} onInit={onInit} />
    </div>
  );
}
