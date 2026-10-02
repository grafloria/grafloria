import { component$, $, noSerialize, useSignal, useVisibleTask$, type NoSerialize } from '@builder.io/qwik';
import { GrafloriaFlow, type DiagramInstance } from '@grafloria/qwik';
import { registerConnectionValidator, clearConnectionValidators } from '@grafloria/element';
import { markReady } from '../ready';

/* eslint-disable @typescript-eslint/no-explicit-any */
const nodes = ['a', 'b', 'c', 'd'].map((id, i) => ({
  id, position: { x: 60 + i * 170, y: 120 }, size: { width: 110, height: 46 }, label: id.toUpperCase(),
}));
const edges = [
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
export default component$(() => {
  const model = useSignal<NoSerialize<any>>();
  const readout = useSignal('');

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ cleanup }) => {
    clearConnectionValidators();
    const dispose = registerConnectionValidator(({ sourceNode, targetNode }: any) => {
      if (!sourceNode || !targetNode) return true;
      if (model.value && reaches(model.value, targetNode.id, sourceNode.id)) return 'Refused: would create a cycle';
      return true;
    });
    cleanup(() => { (dispose as unknown as (() => void) | undefined)?.(); clearConnectionValidators(); });
  }, { strategy: 'document-ready' });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{ padding: '8px 24px', font: '12px/1.5 ui-monospace, monospace', opacity: '0.8',
        borderBottom: '1px solid rgba(127,127,127,.25)', whiteSpace: 'pre' }}>{readout.value}</div>
      <div style={{ flex: '1' }}>
        <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} onInit$={$((instance: DiagramInstance) => {
          model.value = noSerialize(instance.getModel());
          readout.value = 'acyclic guard active on a→b→c→d';
          markReady();
        })} />
      </div>
    </div>
  );
});
