// Wave 7 follow-up — the sparse-DAG performance pathology, pinned.
//
// MEASURED DEFECT (live probes, 2026-07): `layered` was the flagship on meshes
// (40ms @ 400, 334ms @ 2025) but was KILLED at >25s on a sparse DAG of 2000
// nodes: a binary tree n((i-1)>>1)->n(i) plus an extra edge n(i-3)->n(i) every
// 4th node (~2500 edges). What is special about that shape: the extra edges
// deepen ranks past tree depth, so tree edges span several ranks and normalise()
// fills the ~500-wide layers with dummy nodes — and the old transpose() then ran
// TWO full O(E²) inter-layer crossing recounts per candidate adjacent swap.
// Instrumented at n=600: 3319ms of a 3351ms run inside transpose, 80,478
// countCrossings calls, 964,756,272 pair-comparison ops. ~Cubic growth; dead
// long before 2000.
//
// THE FIX (all inside this directory):
//   - transpose(): incremental swap decision. Swapping adjacent u,v changes only
//     the crossings among u's and v's own edges to the fixed lower layer, so
//     after-before = cross(v,u) - cross(u,v), computable in O(deg u + deg v)
//     from sorted neighbour positions. Provably (and measured) the SAME
//     accept/reject sequence as the full recount — identical output.
//   - countCrossings(): Fenwick-tree inversion count, O(k log w) not O(k²).
//   - assignCoordinates(): per-layer id-sets/index-maps/priority orders computed
//     once instead of O(width²) some()/findIndex() scans per sweep.
//
// After: n=2000 in ~200ms, crossings identical to the pre-fix algorithm at every
// probed size (n=200/300/400/600), 10x10 mesh output byte-identical.
//
// The assertions below are complexity/behaviour bounds plus one generous wall
// cap, so CI pins the fix without flaking.

import { sugiyama, type SugiyamaEdge, type SugiyamaNode } from './sugiyama';

const N = (id: string, w = 100, h = 50): SugiyamaNode => ({ id, width: w, height: h });

/** The measured-defect graph: binary tree + a chord n(i-3)->n(i) every 4th node. */
function sparseDag(n: number): { nodes: SugiyamaNode[]; edges: SugiyamaEdge[] } {
  const nodes: SugiyamaNode[] = [];
  const edges: SugiyamaEdge[] = [];
  for (let i = 0; i < n; i++) {
    nodes.push(N(`n${i}`));
    if (i > 0) edges.push({ id: `t${i}`, source: `n${(i - 1) >> 1}`, target: `n${i}` });
    if (i > 3 && i % 4 === 0) edges.push({ id: `x${i}`, source: `n${i - 3}`, target: `n${i}` });
  }
  return { nodes, edges };
}

/** R×C mesh with right+down edges — the healthy case the fix must not disturb. */
function mesh(R: number, C: number): { nodes: SugiyamaNode[]; edges: SugiyamaEdge[] } {
  const nodes: SugiyamaNode[] = [];
  const edges: SugiyamaEdge[] = [];
  const id = (r: number, c: number) => `m${r}_${c}`;
  for (let r = 0; r < R; r++)
    for (let c = 0; c < C; c++) {
      nodes.push(N(id(r, c)));
      if (c + 1 < C) edges.push({ id: `r${r}_${c}`, source: id(r, c), target: id(r, c + 1) });
      if (r + 1 < R) edges.push({ id: `d${r}_${c}`, source: id(r, c), target: id(r + 1, c) });
    }
  return { nodes, edges };
}

/** FNV-1a 32-bit — a stable fingerprint for "the output did not change at all". */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

describe('sugiyama — sparse-DAG performance regression (killed at >25s before the fix)', () => {
  it('lays out the pathological DAG @2000 well under 3s (was killed at >25s)', () => {
    const { nodes, edges } = sparseDag(2000);
    const t0 = Date.now();
    const r = sugiyama(nodes, edges, { direction: 'TB' });
    const ms = Date.now() - t0;
    expect(r.positions.size).toBe(2000);
    expect(ms).toBeLessThan(3000); // measured ~200ms; generous CI headroom
  }, 30000);

  it('does bounded work: the counters cannot silently re-explode', () => {
    const { nodes, edges } = sparseDag(2000);
    const { stats } = sugiyama(nodes, edges, { direction: 'TB' });

    // The shape itself (measured: 930 dummies, 18 layers, widest 550).
    expect(stats.dummyCount).toBeLessThan(10_000); // dummy creation stays linear in span sum
    expect(stats.maxLayerWidth).toBeGreaterThan(300); // the wide-layer pathology IS present

    // transpose: at most guard(8) passes per ordering iteration (8) …
    expect(stats.transposePasses).toBeLessThanOrEqual(64);
    // … and one O(deg) evaluation per adjacent pair per pass — NOT two full
    // inter-layer recounts per pair. Measured 139,632; the old code's equivalent
    // work was ~10^10 pair ops.
    expect(stats.transposeSwapsEvaluated).toBeLessThan(1_000_000);
    expect(stats.transposeSwapsApplied).toBeLessThanOrEqual(stats.transposeSwapsEvaluated);

    // full crossing counts happen once per iteration, not per swap: the elements
    // pushed through inversion counting stay ~(iterations+1) × inter-layer edges.
    expect(stats.crossingCountOps).toBeLessThan(5_000_000); // measured 30,852
  }, 30000);

  it('still produces a valid, deterministic layering on the pathological DAG', () => {
    const { nodes, edges } = sparseDag(2000);
    const r1 = sugiyama(nodes, edges, { direction: 'TB' });

    // every edge points strictly downward in rank — the fix skipped no real work
    for (const e of edges) {
      expect(r1.ranks.get(e.target)!).toBeGreaterThan(r1.ranks.get(e.source)!);
    }

    // deterministic: same input => same output, and insertion order must not matter
    const r2 = sugiyama([...nodes].reverse(), edges, { direction: 'TB' });
    const dump = (r: typeof r1) => JSON.stringify([...r.positions.entries()].sort());
    expect(dump(r2)).toBe(dump(r1));
    expect(r2.crossings).toBe(r1.crossings);
  }, 30000);
});

describe('sugiyama — quality guard: the perf fix must not change output', () => {
  it('10x10 mesh output is byte-identical to the pre-fix implementation', () => {
    // Fingerprint captured by running the ORIGINAL (pre-fix) algorithm on this
    // exact graph. The incremental transpose provably makes the same swap
    // decisions and the Fenwick count is exact, so the output must not move.
    const { nodes, edges } = mesh(10, 10);
    const r = sugiyama(nodes, edges, { direction: 'TB' });
    expect(r.crossings).toBe(0);
    const sorted = [...r.positions.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
    expect(fnv1a(JSON.stringify(sorted))).toBe(0xa5c97975);
  });

  it('sparse DAG @300 crossings do not regress from the pre-fix algorithm', () => {
    // Pre-fix measured crossings: 977 (and the fixed code measured exactly 977).
    const { nodes, edges } = sparseDag(300);
    const r = sugiyama(nodes, edges, { direction: 'TB' });
    expect(r.crossings).toBeLessThanOrEqual(977);
  }, 30000);
});
