import { component$, $, useSignal } from '@builder.io/qwik';
import { GrafloriaFlow } from '@grafloria/qwik';
import { markReady } from '../ready';

const nodes = [
  { id: 'orig', position: { x: 120, y: 120 }, size: { width: 130, height: 50 }, label: 'Original' },
];

/** Copy a node, paste it twice — two independent copies, each with its own id
 *  and position. ⌘C / ⌘V drive the engine clipboard, and repeat pastes cascade. */
export default component$(() => {
  const readout = useSignal('');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{ padding: '8px 24px', font: '12px/1.5 ui-monospace, monospace', opacity: '0.8',
        borderBottom: '1px solid rgba(127,127,127,.25)', whiteSpace: 'pre' }}>{readout.value}</div>
      <div style={{ flex: '1' }}>
        <GrafloriaFlow defaultNodes={nodes} defaultEdges={[]} onInit$={$(() => {
          readout.value = 'one node — select it, then ⌘C / Ctrl+C to copy and ⌘V / Ctrl+V to paste';
          markReady();
        })} />
      </div>
    </div>
  );
});
