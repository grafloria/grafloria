import { component$, $, noSerialize, useSignal, useVisibleTask$, type NoSerialize } from '@builder.io/qwik';
import { GrafloriaFlow, type DiagramInstance } from '@grafloria/qwik';
import { SnapController } from '@grafloria/element';
import { markReady } from '../ready';

const nodes = [
  { id: 'a', position: { x: 60,  y: 120 }, size: { width: 160, height: 80 }, label: 'A' },
  { id: 'b', position: { x: 340, y: 120 }, size: { width: 160, height: 80 }, label: 'B (middle)' },
  { id: 'c', position: { x: 620, y: 120 }, size: { width: 160, height: 80 }, label: 'C' },
];
const edges = [
  { id: 'ab', source: 'a', target: 'b' },
  { id: 'bc', source: 'b', target: 'c' },
];

/** Wire Delete/Backspace to a healing delete. Module level so the onInit$ QRL
 *  may call it; returns the disposer that unhooks the key listener. */
function installHealingDelete(instance: DiagramInstance): () => void {
  const model = instance.getModel() as any;
  const eng = instance.getEngine() as any;
  const snap = new SnapController();

  const healDelete = async (id: string) => {
    const links = model.getLinks();
    const incomers = [...new Set(links.filter((l: any) => l.targetNodeId === id).map((l: any) => l.sourceNodeId))];
    const outgoers = [...new Set(links.filter((l: any) => l.sourceNodeId === id).map((l: any) => l.targetNodeId))];
    await eng.removeNode(id);
    for (const s of incomers as string[]) for (const t of outgoers as string[]) {
      if (s === t) continue;
      const sn = model.getNode(s), tn = model.getNode(t);
      if (!sn || !tn) continue;
      if (model.getLinks().some((l: any) => l.sourceNodeId === s && l.targetNodeId === t)) continue;
      const candidate = {
        sourcePort: sn.getPortBySide('right') ?? sn.getPorts()[0],
        targetPort: tn.getPortBySide('left') ?? tn.getPorts()[0],
        sourceNodeId: s, targetNodeId: t, distance: 0,
      };
      eng.commandManager.execute(snap.buildProximityLinkCommand(candidate));
    }
    instance.renderNow();
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Delete' && e.key !== 'Backspace') return;
    const sel = model.getSelectedNodes ? model.getSelectedNodes() : [];
    if (!sel.length) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    (async () => { for (const n of sel) await healDelete(n.id); })();
  };
  window.addEventListener('keydown', onKey, true);
  return () => window.removeEventListener('keydown', onKey, true);
}

/** Select B and press Delete: the chain heals — its two edges cascade away and
 *  a fresh A→C bridge is drawn through the same command stack a hand-drawn wire
 *  uses (so it is real and undoable). */
export default component$(() => {
  // The key listener lives on window: unhook it when the demo unmounts.
  const dispose = useSignal<NoSerialize<() => void>>();
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ cleanup }) => cleanup(() => dispose.value?.()), { strategy: 'document-ready' });

  return (
    <div style={{ height: '100vh' }}>
      <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} onInit$={$((instance: DiagramInstance) => {
        dispose.value = noSerialize(installHealingDelete(instance));
        markReady();
      })} />
    </div>
  );
});
