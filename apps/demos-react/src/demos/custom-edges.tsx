import { useEffect } from 'react';
import { GrafloriaFlow } from '@grafloria/react';
import { registerLinkTemplate } from '@grafloria/element';
import { markReady } from '../ready';

// registerLinkTemplate() is the seam for an entirely custom edge shape. The
// template is handed the frame's routed polyline and the path string the default
// renderer would draw, and returns whatever SVG it likes — here a two-rail
// "pipe": a wide casing under a thin core.
registerLinkTemplate('pipe', (ctx: any) => {
  const d = ctx.pathData;
  const stroke = ctx.selected ? '#2563eb' : '#0ea5e9';
  return [
    { type: 'path', props: { d, className: 'pipe-casing', fill: 'none', stroke, 'stroke-width': 10, 'stroke-opacity': 0.35, 'stroke-linecap': 'round' } },
    { type: 'path', props: { d, className: 'pipe-core', fill: 'none', stroke, 'stroke-width': 2.5 } },
  ];
});

const nodes = [
  { id: 'a', position: { x: 120, y: 120 }, size: { width: 140, height: 64 }, label: 'Source' },
  { id: 'b', position: { x: 680, y: 340 }, size: { width: 140, height: 64 }, label: 'Sink' },
];
const edges = [{ id: 'e1', source: 'a', target: 'b', type: 'smooth' as const, style: { template: 'pipe' } }];

/** An author-supplied edge template via registerLinkTemplate() — a two-rail
 *  pipe drawn from the routed polyline, replacing the default edge. */
export default function CustomEdgesDemo() {
  useEffect(() => markReady(), []);
  return (
    <div style={{ height: '100vh' }}>
      <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} />
    </div>
  );
}
