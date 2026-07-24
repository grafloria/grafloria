import { useEffect, useState } from 'react';
import { GrafloriaFlow, LIGHT_THEME, DARK_THEME } from '@grafloria/react';
import { markReady } from '../ready';

const nodes = [
  { id: 'a', position: { x: 120, y: 140 }, size: { width: 160, height: 70 }, label: 'Tokens' },
  { id: 'b', position: { x: 480, y: 140 }, size: { width: 160, height: 70 }, label: 'not CSS hacks' },
];
const edges = [{ id: 'e1', source: 'a', target: 'b', label: 'theme-bound' }];

/** Theme is a prop: swap `theme` between the built-in token sets at runtime and
 *  every painted element re-skins — no CSS surgery. */
export default function DarkModeDemo() {
  const [dark, setDark] = useState(true);
  useEffect(() => markReady(), []);
  return (
    <div style={{ height: '100vh' }}>
      <div style={{ position: 'fixed', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 5 }}>
        <button onClick={() => setDark((d) => !d)}
          style={{ padding: '7px 18px', borderRadius: 999, border: '1px solid #94A5F0', background: '#EEF1FE', color: '#3B52D9', fontWeight: 600, cursor: 'pointer' }}>
          {dark ? '☀ light' : '☾ dark'}
        </button>
      </div>
      <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} theme={dark ? DARK_THEME : LIGHT_THEME} />
    </div>
  );
}
