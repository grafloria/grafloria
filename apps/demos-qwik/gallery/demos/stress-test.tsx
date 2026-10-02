import { component$, $, noSerialize, useSignal, type NoSerialize } from '@builder.io/qwik';
import { GrafloriaFlow, type DiagramInstance, type EdgeSpec, type NodeSpec } from '@grafloria/qwik';
import { markReady } from '../ready';

// A MESH of 900 nodes (30×30, each wired to its right + down neighbour). Only
// the visible slice is ever in the DOM (viewport culling), and one layout call
// snaps all 900 into a real engine layout.
const R = 30, C = 30;
const nid = (r: number, c: number) => 'n' + (r * C + c);

function buildMesh() {
  const nodes: NodeSpec[] = [];
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      nodes.push({ id: nid(r, c), position: { x: c * 120, y: r * 80 }, size: { width: 92, height: 46 }, label: '' + (r * C + c) });
    }
  }
  const edges: EdgeSpec[] = [];
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      if (c + 1 < C) edges.push({ id: 'h' + r + '_' + c, source: nid(r, c), target: nid(r, c + 1) });
      if (r + 1 < R) edges.push({ id: 'v' + r + '_' + c, source: nid(r, c), target: nid(r + 1, c) });
    }
  }
  return { nodes, edges };
}
const mesh = buildMesh();

/** A 900-node mesh: viewport culling keeps only the visible slice in the DOM,
 *  and one layout call lays all 900 out with a real engine. */
export default component$(() => {
  const instance = useSignal<NoSerialize<DiagramInstance>>();
  return (
    <div style={{ height: '100vh' }}>
      <GrafloriaFlow
        defaultNodes={mesh.nodes}
        defaultEdges={mesh.edges}
        layout={{ name: 'layered', options: { direction: 'TB', nodeSpacing: 20, rankSpacing: 52 } }}
        fitView
        onInit$={$((api: DiagramInstance) => { instance.value = noSerialize(api); })}
        // The layout moves all 900 nodes after the mount-time fit, so reframe
        // on the laid-out mesh (as the JS page does) and only then say "ready".
        onLayoutDone$={$(() => { instance.value?.fitView(40); markReady(); })}
      />
    </div>
  );
});
