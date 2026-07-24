import type { DiagramInstance } from '@grafloria/react';
import { GrafloriaFlow } from '@grafloria/react';
import { markReady } from '../ready';

const nodes: any[] = [
  { id: 'a', position: { x: 150, y: 150 }, size: { width: 150, height: 80 }, label: 'drag me →' },
  { id: 'b', position: { x: 600, y: 150 }, size: { width: 150, height: 80 }, label: 'B' },
];
const edges: any[] = [];

/** Proximity connect, wired into the ENGINE: drag a node next to another and the
 *  wire proposes AND commits itself — the engine's own drag path, not host glue.
 *  The page only sets enableProximityConnect. */
export default function ProximityConnectLiveDemo() {
  const onInit = (instance: DiagramInstance) => {
    (instance.getEngine() as any).setInteractionConfig({ enableProximityConnect: true });
    instance.renderNow();
    markReady();
  };
  return (
    <div style={{ height: '100vh' }}>
      <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} onInit={onInit} />
    </div>
  );
}
