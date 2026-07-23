import { useEffect, useMemo } from 'react';
import { GrafloriaFlow } from '@grafloria/react';
import { markReady } from '../ready';

// A MESH of 900 nodes (30×30, each wired to its right + down neighbour). Only
// the visible slice is ever in the DOM (viewport culling), and one layout call
// snaps all 900 into a real engine layout.
const R = 30, C = 30;
const nid = (r: number, c: number) => 'n' + (r * C + c);

function buildMesh() {
  const nodes: any[] = [];
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      nodes.push({ id: nid(r, c), position: { x: c * 120, y: r * 80 }, size: { width: 92, height: 46 }, label: '' + (r * C + c) });
    }
  }
  const edges: any[] = [];
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      if (c + 1 < C) edges.push({ id: 'h' + r + '_' + c, source: nid(r, c), target: nid(r, c + 1) });
      if (r + 1 < R) edges.push({ id: 'v' + r + '_' + c, source: nid(r, c), target: nid(r + 1, c) });
    }
  }
  return { nodes, edges };
}

/** A 900-node mesh: viewport culling keeps only the visible slice in the DOM,
 *  and one layout call lays all 900 out with a real engine. */
export default function StressTestDemo() {
  useEffect(() => markReady(), []);
  const { nodes, edges } = useMemo(buildMesh, []);
  return (
    <div style={{ height: '100vh' }}>
      <GrafloriaFlow
        defaultNodes={nodes}
        defaultEdges={edges}
        layout={{ name: 'layered', options: { direction: 'TB', nodeSpacing: 20, rankSpacing: 52 } }}
        fitView
      />
    </div>
  );
}
