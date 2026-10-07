// One deterministic scene for every library: a grid of nodes with edges to the
// next node and to the node below — a connected mesh with local structure.
export function makeScene(n) {
  const cols = Math.ceil(Math.sqrt(n));
  const nodes = [], edges = [];
  for (let i = 0; i < n; i++) {
    const col = i % cols, row = (i / cols) | 0;
    nodes.push({ id: 'n' + i, position: { x: col * 220, y: row * 120 },
      size: { width: 160, height: 60 }, data: { label: 'Node ' + i } });
    if (col > 0) edges.push({ id: 'eh' + i, source: 'n' + (i - 1), target: 'n' + i });
    if (row > 0) edges.push({ id: 'ev' + i, source: 'n' + (i - cols), target: 'n' + i });
  }
  return { nodes, edges };
}

/**
 * The scene's world bounds — the harness frames BOTH libraries to this exact
 * rect so neither is measured drawing a different amount of the same scene.
 * (Left to their own fitView defaults they do not agree: React Flow's default
 * minZoom of 0.5 cannot frame these meshes at all.)
 */
export function sceneBounds(n) {
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  return { x: 0, y: 0, width: (cols - 1) * 220 + 160, height: (rows - 1) * 120 + 60 };
}
