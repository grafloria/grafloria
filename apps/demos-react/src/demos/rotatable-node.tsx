import type { DiagramInstance } from '@grafloria/react';
import { GrafloriaFlow } from '@grafloria/react';
import { registerTool } from '@grafloria/element';
import { markReady } from '../ready';

const nodes = [{ id: 'n', position: { x: 360, y: 150 }, size: { width: 200, height: 120 }, label: 'spin me' }];
const edges: any[] = [];

/** A node carries a rotation the renderer bakes into its SVG transform. Press
 *  it and orbit the pointer — a rotate gesture wired through the public
 *  registerTool seam spins it live. */
export default function RotatableNodeDemo() {
  const onInit = (instance: DiagramInstance) => {
    let grab: any = null;
    const center = (node: any) => ({
      x: node.position.x + node.size.width / 2,
      y: node.position.y + node.size.height / 2,
    });
    registerTool({
      id: 'demo-rotate',
      priority: 10,
      hitTest: (_e: any, hit: any) => !!hit.node,
      onPointerDown: (e: any, hit: any) => {
        const c = center(hit.node);
        grab = { node: hit.node, cx: c.x, cy: c.y,
          a0: Math.atan2(e.world.y - c.y, e.world.x - c.x), r0: hit.node.rotation };
      },
      onPointerMove: (e: any) => {
        if (!grab) return;
        const a = Math.atan2(e.world.y - grab.cy, e.world.x - grab.cx);
        grab.node.setRotation(grab.r0 + (a - grab.a0) * 180 / Math.PI);
      },
      onPointerUp: () => { grab = null; },
    } as any);
    markReady();
  };
  return (
    <div style={{ height: '100vh' }}>
      <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} onInit={onInit} />
    </div>
  );
}
