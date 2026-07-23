import type { DiagramInstance } from '@grafloria/react';
import { GrafloriaFlow } from '@grafloria/react';
import { registerTool, SnapController } from '@grafloria/element';
import { markReady } from '../ready';

const nodes = [
  { id: 'a', position: { x: 100, y: 150 }, size: { width: 200, height: 120 }, label: 'A · press anywhere' },
  { id: 'b', position: { x: 560, y: 150 }, size: { width: 200, height: 120 }, label: 'B · release anywhere' },
];
const edges: any[] = [];

/** The whole node is a connection handle: press anywhere on one node, release
 *  anywhere on another, and they wire up — no tiny port to aim at. Wired through
 *  the public registerTool seam, committing a real link via the link command. */
export default function EasyConnectDemo() {
  const onInit = (instance: DiagramInstance) => {
    const model = instance.getModel();
    const engine = instance.getEngine() as any;
    const snap = new SnapController();
    let src: any = null;
    registerTool({
      id: 'demo-easy-connect',
      priority: 10,
      hitTest: (_e: any, hit: any) => !!hit.node,
      onPointerDown: (_e: any, hit: any) => { src = hit.node; },
      onPointerUp: (e: any) => {
        if (!src) return;
        const tgt = (model as any).getNodeAtPosition(e.world.x, e.world.y);
        if (tgt && tgt.id !== src.id) {
          const candidate = {
            sourcePort: src.getPortBySide('right') ?? src.getPorts()[0],
            targetPort: tgt.getPortBySide('left') ?? tgt.getPorts()[0],
            sourceNodeId: src.id, targetNodeId: tgt.id, distance: 0,
          };
          engine.commandManager.execute(snap.buildProximityLinkCommand(candidate));
        }
        src = null;
      },
      onCancel: () => { src = null; },
    } as any);
    markReady();
  };
  return (
    <div style={{ height: '100vh' }}>
      <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} onInit={onInit} />
    </div>
  );
}
