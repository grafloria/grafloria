import { component$, $, noSerialize, useSignal, useVisibleTask$, type NoSerialize } from '@builder.io/qwik';
import { GrafloriaFlow, type DiagramInstance, type EdgeSpec } from '@grafloria/qwik';
import { registerTool } from '@grafloria/element';
import { markReady } from '../ready';

const nodes = [{ id: 'n', position: { x: 360, y: 150 }, size: { width: 200, height: 120 }, label: 'spin me' }];
const edges: EdgeSpec[] = [];

const center = (node: any) => ({
  x: node.position.x + node.size.width / 2,
  y: node.position.y + node.size.height / 2,
});

/** Register the rotate gesture. Module level so the onInit$ QRL may call it;
 *  returns registerTool's disposer. */
function installRotateTool(): () => void {
  let grab: any = null;
  return registerTool({
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
}

/** A node carries a rotation the renderer bakes into its SVG transform. Press
 *  it and orbit the pointer — a rotate gesture wired through the public
 *  registerTool seam spins it live. */
export default component$(() => {
  // Tools are a global registry: unregister ours when the demo unmounts.
  const dispose = useSignal<NoSerialize<() => void>>();
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ cleanup }) => cleanup(() => dispose.value?.()), { strategy: 'document-ready' });

  return (
    <div style={{ height: '100vh' }}>
      <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} onInit$={$((_instance: DiagramInstance) => {
        dispose.value = noSerialize(installRotateTool());
        markReady();
      })} />
    </div>
  );
});
