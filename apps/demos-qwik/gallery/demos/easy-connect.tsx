import { component$, $, noSerialize, useSignal, useVisibleTask$, type NoSerialize } from '@builder.io/qwik';
import { GrafloriaFlow, type DiagramInstance, type EdgeSpec } from '@grafloria/qwik';
import { registerTool, SnapController } from '@grafloria/element';
import { markReady } from '../ready';

const nodes = [
  { id: 'a', position: { x: 100, y: 150 }, size: { width: 200, height: 120 }, label: 'A · press anywhere' },
  { id: 'b', position: { x: 560, y: 150 }, size: { width: 200, height: 120 }, label: 'B · release anywhere' },
];
const edges: EdgeSpec[] = [];

/** Register the whole-node connect tool. Module level so the onInit$ QRL may
 *  call it; returns registerTool's disposer. */
function installEasyConnect(instance: DiagramInstance): () => void {
  const model = instance.getModel();
  const engine = instance.getEngine() as any;
  const snap = new SnapController();
  let src: any = null;
  return registerTool({
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
}

/** The whole node is a connection handle: press anywhere on one node, release
 *  anywhere on another, and they wire up — no tiny port to aim at. Wired through
 *  the public registerTool seam, committing a real link via the link command. */
export default component$(() => {
  // Tools are a global registry: unregister ours when the demo unmounts, or it
  // would keep hijacking node presses on whatever demo the router shows next.
  const dispose = useSignal<NoSerialize<() => void>>();
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ cleanup }) => cleanup(() => dispose.value?.()), { strategy: 'document-ready' });

  return (
    <div style={{ height: '100vh' }}>
      <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} onInit$={$((instance: DiagramInstance) => {
        dispose.value = noSerialize(installEasyConnect(instance));
        markReady();
      })} />
    </div>
  );
});
