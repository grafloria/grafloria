import { component$, $, useSignal } from '@builder.io/qwik';
import { GrafloriaFlow } from '@grafloria/qwik';
import { markReady } from '../ready';

const nodes = [
  { id: 'a', position: { x: 500, y: 120 }, size: { width: 120, height: 60 }, label: 'A' },
  { id: 'b', position: { x: 500, y: 320 }, size: { width: 120, height: 60 }, label: 'B' },
];

/** Pan, pinch-zoom, tap-to-select and one-finger node drag — all from real touch
 *  PointerEvents through the same pipeline a phone uses. touch-action:none keeps
 *  the browser from eating the gestures; the engine binder does the rest. */
export default component$(() => {
  const readout = useSignal('');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{ padding: '8px 24px', font: '12px/1.5 ui-monospace, monospace', opacity: '0.85',
        borderBottom: '1px solid rgba(127,127,127,.25)', whiteSpace: 'pre' }}>{readout.value}</div>
      <div style={{ flex: '1', touchAction: 'none' }}>
        <GrafloriaFlow defaultNodes={nodes} defaultEdges={[]} onInit$={$(() => {
          readout.value = 'drive with a finger (or DevTools touch emulation): pan, pinch, tap, drag';
          markReady();
        })} />
      </div>
    </div>
  );
});
