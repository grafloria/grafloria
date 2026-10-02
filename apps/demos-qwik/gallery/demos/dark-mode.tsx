import { component$, $, useSignal } from '@builder.io/qwik';
import { GrafloriaFlow, LIGHT_THEME, DARK_THEME } from '@grafloria/qwik';
import { markReady } from '../ready';

const nodes = [
  { id: 'a', position: { x: 120, y: 140 }, size: { width: 160, height: 70 }, label: 'Tokens' },
  { id: 'b', position: { x: 480, y: 140 }, size: { width: 160, height: 70 }, label: 'not CSS hacks' },
];
const edges = [{ id: 'e1', source: 'a', target: 'b', label: 'theme-bound' }];

/** Theme is a prop: swap `theme` between the built-in token sets at runtime and
 *  every painted element re-skins — no CSS surgery. */
export default component$(() => {
  const dark = useSignal(true);
  return (
    <div style={{ height: '100vh' }}>
      <div style={{ position: 'fixed', top: '12px', left: '50%', transform: 'translateX(-50%)', zIndex: '5' }}>
        <button onClick$={() => { dark.value = !dark.value; }}
          style={{ padding: '7px 18px', borderRadius: '999px', border: '1px solid #94A5F0', background: '#EEF1FE', color: '#3B52D9', fontWeight: '600', cursor: 'pointer' }}>
          {dark.value ? '☀ light' : '☾ dark'}
        </button>
      </div>
      <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} theme={dark.value ? DARK_THEME : LIGHT_THEME}
        onInit$={$(() => markReady())} />
    </div>
  );
});
