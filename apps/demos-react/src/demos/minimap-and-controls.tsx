import { useEffect } from 'react';
import { GrafloriaFlow } from '@grafloria/react';
import { markReady } from '../ready';

const nodes = Array.from({ length: 9 }, (_, i) => ({
  id: 'n' + i, position: { x: 90 + (i % 3) * 300, y: 70 + Math.floor(i / 3) * 190 },
  size: { width: 170, height: 74 }, data: { label: 'Step ' + (i + 1) },
}));
const edges = Array.from({ length: 8 }, (_, i) => ({
  id: 'e' + i, source: 'n' + i, target: 'n' + (i + 1),
}));

/** Editor chrome in one prop: plugins mounts minimap, zoom controls and the
 *  dotted background — lazy-loaded, so they cost nothing unused. */
export default function MinimapAndControlsDemo() {
  useEffect(() => markReady(), []);
  return (
    <div style={{ height: '100vh' }}>
      <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} plugins />
    </div>
  );
}
