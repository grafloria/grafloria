import { useEffect } from 'react';
import { GrafloriaFlow, LIGHT_THEME, DARK_THEME } from '@grafloria/react';
import { markReady } from '../ready';

const SPEC = () => ({
  nodes: [
    { id: 'a', position: { x: 40, y: 70 }, size: { width: 150, height: 70 }, data: { label: 'Alpha' } },
    { id: 'b', position: { x: 260, y: 70 }, size: { width: 150, height: 70 }, data: { label: 'Beta' } },
    { id: 'c', position: { x: 150, y: 200 }, size: { width: 150, height: 70 }, data: { label: 'Gamma' } },
  ],
  edges: [{ id: 'e1', source: 'a', target: 'b' }, { id: 'e2', source: 'a', target: 'c' }],
});

const a = SPEC();
const b = SPEC();

const tag = {
  position: 'absolute', top: 8, left: 8, zIndex: 2, font: '11px ui-monospace,monospace',
  background: 'rgba(127,127,127,.2)', padding: '2px 6px', borderRadius: 4,
} as const;

/** Two diagrams, two themes, one page, one shared stylesheet: each instance
 *  writes only its own [data-grafloria-instance]-scoped variable block, so the
 *  light one and the dark one never clobber each other. */
export default function CssVariablesDemo() {
  useEffect(() => markReady(), []);
  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <div style={{ flex: 1, minWidth: 0, position: 'relative', borderRight: '1px solid rgba(127,127,127,.3)' }}>
        <span style={tag}>instance A — light</span>
        <GrafloriaFlow defaultNodes={a.nodes} defaultEdges={a.edges} theme={LIGHT_THEME} style={{ height: '100%' }} />
      </div>
      <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
        <span style={tag}>instance B — dark</span>
        <GrafloriaFlow defaultNodes={b.nodes} defaultEdges={b.edges} theme={DARK_THEME} style={{ height: '100%' }} />
      </div>
    </div>
  );
}
