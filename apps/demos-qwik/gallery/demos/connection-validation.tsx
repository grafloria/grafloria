import { component$, $, useVisibleTask$ } from '@builder.io/qwik';
import { GrafloriaFlow, type DiagramInstance } from '@grafloria/qwik';
import { registerConnectionValidator, clearConnectionValidators } from '@grafloria/element';
import { markReady } from '../ready';

/** A registered validator vetoes an invalid connection before it is made:
 *  output→output is rejected (with a reason), output→input is allowed. */
const nodes = [
  { id: 'a', position: { x: 120, y: 260 }, size: { width: 120, height: 70 }, label: 'A (out)',
    ports: [{ id: 'ao', side: 'right' as const, type: 'output', shape: { shape: 'triangle', size: 13 } }] },
  { id: 'b', position: { x: 640, y: 140 }, size: { width: 120, height: 70 }, label: 'B (in)',
    ports: [{ id: 'bi', side: 'left' as const, type: 'input', shape: { shape: 'circle', size: 13 } }] },
  { id: 'c', position: { x: 640, y: 400 }, size: { width: 120, height: 70 }, label: 'C (out)',
    ports: [{ id: 'co', side: 'left' as const, type: 'output', shape: { shape: 'triangle', size: 13 } }] },
];
const edges: never[] = [];

/** The rule: an output may only feed an input, never another output. */
const outputToOutputIsInvalid = ({ sourcePort, targetPort }: { sourcePort?: { type?: string }; targetPort?: { type?: string } }) => {
  if (!sourcePort || !targetPort) return true;
  if (sourcePort.type === 'output' && targetPort.type === 'output') return 'an output cannot feed another output';
  return true;
};

export default component$(() => {
  // The validator registry is global: register on mount, unregister on leave.
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ cleanup }) => {
    clearConnectionValidators();
    const dispose = registerConnectionValidator(outputToOutputIsInvalid as never);
    cleanup(() => { (dispose as unknown as (() => void) | undefined)?.(); clearConnectionValidators(); });
  });

  return (
    <div style={{ height: '100vh' }}>
      <GrafloriaFlow defaultNodes={nodes as never} defaultEdges={edges} onInit$={$((instance: DiagramInstance) => {
        instance.getEngine().setInteractionConfig({ portVisibility: 'always' as never });
        instance.renderNow();
        markReady();
      })} />
    </div>
  );
});
