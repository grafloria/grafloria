import { useEffect, useRef } from 'react';
import type { DiagramInstance } from '@grafloria/react';
import { GrafloriaFlow } from '@grafloria/react';
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

/** Select B and press Delete: the chain heals — its two edges cascade away and
 *  a fresh A→C bridge is drawn through the same command stack a hand-drawn wire
 *  uses (so it is real and undoable). */
export default function DeleteMiddleNodeDemo() {
  const cleanup = useRef<() => void>();
  useEffect(() => () => cleanup.current?.(), []);

  const onInit = (instance: DiagramInstance) => {
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
    cleanup.current = () => window.removeEventListener('keydown', onKey, true);
    markReady();
  };

  return (
    <div style={{ height: '100vh' }}>
      <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} onInit={onInit} />
    </div>
  );
}
