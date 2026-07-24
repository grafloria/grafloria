import type { DiagramInstance } from '@grafloria/react';
import { GrafloriaFlow } from '@grafloria/react';
import { markReady } from '../ready';

const nodes: any[] = [
  { id: 'a', position: { x: 100, y: 150 }, size: { width: 200, height: 120 }, label: 'A · press anywhere' },
  { id: 'b', position: { x: 560, y: 150 }, size: { width: 200, height: 120 }, label: 'B · release anywhere' },
];
const edges: any[] = [];

/** Easy Connect, in the ENGINE: press anywhere on a node body and release
 *  anywhere on another and they wire up — no aiming at a 6px port. The page only
 *  flips enableEasyConnect; the built-in drag path does the rest. */
export default function EasyConnectBodyDemo() {
  const onInit = (instance: DiagramInstance) => {
    (instance.getEngine() as any).setInteractionConfig({ enableEasyConnect: true });
    instance.renderNow();
    markReady();
  };
  return (
    <div style={{ height: '100vh' }}>
      <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} onInit={onInit} />
    </div>
  );
}
