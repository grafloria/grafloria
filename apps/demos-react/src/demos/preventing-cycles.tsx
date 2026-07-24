import { useEffect, useRef } from 'react';
import type { DiagramInstance } from '@grafloria/react';
import { GrafloriaFlow } from '@grafloria/react';
import { registerConnectionValidator, clearConnectionValidators } from '@grafloria/element';
import { markReady } from '../ready';

const nodes: any[] = ['a', 'b', 'c', 'd'].map((id, i) => ({
  id, position: { x: 60 + i * 170, y: 120 }, size: { width: 110, height: 46 }, label: id.toUpperCase(),
}));
const edges: any[] = [
  { id: 'ab', source: 'a', target: 'b' },
  { id: 'bc', source: 'b', target: 'c' },
  { id: 'cd', source: 'c', target: 'd' },
];

function reaches(model: any, fromId: string, toId: string) {
  const nodeOf = (portId: string, cached: string) => model.getNodeByPortId(portId)?.id ?? cached;
  const seen = new Set<string>();
  const stack = [fromId];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === toId) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const link of model.getLinks()) {
      if (nodeOf(link.sourcePortId, link.sourceNodeId) === cur) stack.push(nodeOf(link.targetPortId, link.targetNodeId));
    }
  }
  return false;
}

/** A DAG a→b→c→d that stays acyclic: a connection whose target can already
 *  reach its source is refused by a registered validator, so the loop can never
 *  close. Driven through the real connect pipeline. */
export default function PreventingCyclesDemo() {
  const modelRef = useRef<any>(null);
  const readoutRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    clearConnectionValidators();
    const dispose = registerConnectionValidator(({ sourceNode, targetNode }: any) => {
      if (!sourceNode || !targetNode) return true;
      if (modelRef.current && reaches(modelRef.current, targetNode.id, sourceNode.id)) return 'Refused: would create a cycle';
      return true;
    });
    return () => { (dispose as () => void)?.(); clearConnectionValidators(); };
  }, []);

  const onInit = (instance: DiagramInstance) => {
    modelRef.current = (instance as any).getModel();
    if (readoutRef.current) readoutRef.current.textContent = 'acyclic guard active on a→b→c→d';
    markReady();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div ref={readoutRef} style={{ padding: '8px 24px', font: '12px/1.5 ui-monospace, monospace', opacity: 0.8,
        borderBottom: '1px solid rgba(127,127,127,.25)', whiteSpace: 'pre' }} />
      <div style={{ flex: 1 }}>
        <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} onInit={onInit} />
      </div>
    </div>
  );
}
