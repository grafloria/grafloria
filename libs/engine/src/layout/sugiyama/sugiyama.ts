// Wave 7 (Auto-layout) — Card 1: the zero-config layered (Sugiyama) default.
//
// ---------------------------------------------------------------------------
// WHY WE OWN THIS INSTEAD OF WRAPPING DAGRE
// ---------------------------------------------------------------------------
//
// Card 1 asks for a clean layered DAG with no configuration, and says "wrap the
// real dagre and ELK 'layered' engines behind it". We do keep those — dagre is
// still registered and still the fastest path for a plain graph. But the DEFAULT
// is this implementation, for one reason that Card 5 makes unavoidable:
//
//   SEMANTIC CONSTRAINTS CANNOT BE BOLTED ON FROM OUTSIDE.
//
// Today's constraint system (`ConstraintManager.applyConstraints`) takes a node id
// and an ALREADY-COMPUTED position and clamps it. That is not a constraint system;
// it is a post-hoc correction. A pinned node has no influence whatsoever on where
// anything else goes — the layout runs as if it were free, and then the pin snaps
// it back on top of whatever landed there. "Same rank as B", "left of C", "keep
// this cluster together" cannot even be expressed that way: they are decisions
// taken DURING ranking and ordering, and by the time you have coordinates the
// information needed to honour them is gone.
//
// So the layered pipeline is ours, and constraints enter at the phase where they
// belong. Everything here is pure, deterministic, and free of DOM/time/randomness.
//
// ---------------------------------------------------------------------------
// THE PIPELINE (Sugiyama's four phases, plus the two everyone forgets)
// ---------------------------------------------------------------------------
//
//   1. CYCLE BREAKING     DFS; reverse back-edges, remember them, restore at the end.
//   2. RANK ASSIGNMENT    longest-path ranking, then tightened; same-rank constraints
//                         are applied by contracting the graph BEFORE ranking (union-
//                         find), which is the only way "A and B share a rank" can be
//                         honoured rather than approximated.
//   3. NORMALISATION      insert dummy nodes so every edge spans exactly one rank.
//                         (The phase people skip — without it, crossing minimisation
//                         cannot see long edges and coordinate assignment has no way
//                         to bend them.)
//   4. ORDERING           median heuristic sweeps + adjacent-transpose, keeping the
//                         best crossing count seen. Relative-order constraints are
//                         re-imposed after every sweep, so they survive the heuristic.
//   5. COORDINATES        priority/median method: dummy chains are straightened first
//                         (they are the long edges — a bent long edge is the ugliest
//                         thing in a layered drawing), then real nodes pulled toward
//                         the median of their neighbours, all within non-overlap.
//   6. ORIENTATION        computed in TB space, then transformed for LR/BT/RL — one
//                         algorithm, four directions, no duplicated maths.

import type { LayoutRng } from '../rng';

export type LayoutDirection = 'TB' | 'BT' | 'LR' | 'RL';

export interface SugiyamaNode {
  id: string;
  width: number;
  height: number;
}

export interface SugiyamaEdge {
  id: string;
  source: string;
  target: string;
}

/**
 * Card 5's semantic constraints — honoured DURING the pipeline, not clamped after.
 * Every one of these is a decision taken in ranking or ordering.
 */
export interface SemanticConstraints {
  /** Groups of node ids that must share a rank/layer. Applied by contraction before ranking. */
  sameRank?: string[][];
  /** `[a, b]` means a must come before b within its layer (left-of in TB, above in LR). */
  order?: Array<[string, string]>;
  /** Node ids that must stay adjacent in the ordering — a cluster the sweeps may not split. */
  keepTogether?: string[][];
  /** Nodes pinned to a coordinate. Unlike the old clamp, everything else routes AROUND them. */
  anchors?: Record<string, { x?: number; y?: number }>;
}

export interface SugiyamaOptions {
  direction?: LayoutDirection;
  /** Gap between nodes in the same layer. */
  nodeSpacing?: number;
  /** Gap between layers. */
  rankSpacing?: number;
  constraints?: SemanticConstraints;
  /** Ordering sweeps. More = fewer crossings, diminishing fast. */
  iterations?: number;
  rng?: LayoutRng;
}

export interface SugiyamaResult {
  positions: Map<string, { x: number; y: number }>;
  /** Rank per node — Card 7's auto-selection and Card 6's incremental pass both want it. */
  ranks: Map<string, number>;
  /** Bend points for edges that span more than one rank (the dummy chains). */
  bends: Map<string, Array<{ x: number; y: number }>>;
  /** Crossings in the final ordering — the headline quality number. */
  crossings: number;
}

const DEFAULTS = {
  direction: 'TB' as LayoutDirection,
  nodeSpacing: 50,
  rankSpacing: 80,
  iterations: 8,
};

// ---------------------------------------------------------------------------

interface Graph {
  nodes: Map<string, SugiyamaNode>;
  out: Map<string, string[]>;
  in: Map<string, string[]>;
}

function buildGraph(nodes: SugiyamaNode[], edges: SugiyamaEdge[]): Graph {
  const g: Graph = { nodes: new Map(), out: new Map(), in: new Map() };
  // Sorted insert: the whole pipeline must be order-independent (Card 0's lesson —
  // a seeded RNG does nothing if the graph is consumed in insertion order).
  for (const n of [...nodes].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    g.nodes.set(n.id, n);
    g.out.set(n.id, []);
    g.in.set(n.id, []);
  }
  for (const e of [...edges].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (!g.nodes.has(e.source) || !g.nodes.has(e.target)) continue;
    if (e.source === e.target) continue; // self-loops do not participate in layering
    g.out.get(e.source)!.push(e.target);
    g.in.get(e.target)!.push(e.source);
  }
  return g;
}

/**
 * Phase 1 — cycle breaking.
 *
 * DFS; any edge back to a node on the current stack is a back-edge. Reverse it,
 * remember it, restore the direction at the end. (Reversing rather than deleting
 * matters: the edge still constrains the layout, it just constrains it the other
 * way, which is what makes a cyclic graph layer sensibly instead of losing edges.)
 */
function breakCycles(g: Graph): Set<string> {
  const reversed = new Set<string>();
  const state = new Map<string, 0 | 1 | 2>(); // 0 unseen, 1 on stack, 2 done

  const visit = (v: string): void => {
    state.set(v, 1);
    for (const w of [...g.out.get(v)!]) {
      const s = state.get(w) ?? 0;
      if (s === 1) {
        // back-edge: reverse it
        reversed.add(`${v}->${w}`);
        g.out.set(v, g.out.get(v)!.filter((x) => x !== w));
        g.in.set(w, g.in.get(w)!.filter((x) => x !== v));
        g.out.get(w)!.push(v);
        g.in.get(v)!.push(w);
      } else if (s === 0) {
        visit(w);
      }
    }
    state.set(v, 2);
  };

  for (const id of g.nodes.keys()) if ((state.get(id) ?? 0) === 0) visit(id);
  return reversed;
}

/** Union-find, for same-rank contraction. */
class UnionFind {
  private parent = new Map<string, string>();
  find(x: string): string {
    const p = this.parent.get(x);
    if (p === undefined || p === x) {
      this.parent.set(x, x);
      return x;
    }
    const root = this.find(p);
    this.parent.set(x, root);
    return root;
  }
  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

/**
 * Phase 2 — rank assignment, with same-rank constraints honoured by CONTRACTION.
 *
 * This is the part a post-hoc clamp can never do. "A and B are on the same rank"
 * is a statement about the ranking, so the graph is contracted (A and B become one
 * super-node), the quotient graph is ranked, and every member of a class inherits
 * its class's rank. Rank them separately and then "correct" it afterwards and you
 * either break edge monotonicity or shove nodes on top of each other.
 *
 * Ranking itself is longest-path (every node sits one below its deepest
 * predecessor), which is O(V+E), always valid, and — unlike network simplex —
 * short enough to be obviously correct. It can leave slack on some edges; the
 * tightening pass below pulls sources down toward their consumers, which removes
 * most of the ugly ones.
 */
function assignRanks(g: Graph, constraints: SemanticConstraints | undefined): Map<string, number> {
  const uf = new UnionFind();
  for (const id of g.nodes.keys()) uf.find(id);
  for (const group of constraints?.sameRank ?? []) {
    for (let i = 1; i < group.length; i++) {
      if (g.nodes.has(group[0]) && g.nodes.has(group[i])) uf.union(group[0], group[i]);
    }
  }

  // quotient graph
  const classOf = (id: string) => uf.find(id);
  const classes = new Set([...g.nodes.keys()].map(classOf));
  const qOut = new Map<string, Set<string>>();
  const qIn = new Map<string, Set<string>>();
  for (const c of classes) {
    qOut.set(c, new Set());
    qIn.set(c, new Set());
  }
  for (const [v, targets] of g.out) {
    for (const w of targets) {
      const cv = classOf(v);
      const cw = classOf(w);
      if (cv === cw) continue; // an edge inside a same-rank class cannot constrain rank
      qOut.get(cv)!.add(cw);
      qIn.get(cw)!.add(cv);
    }
  }

  // longest-path ranking over the quotient DAG (it IS a DAG: cycles were broken,
  // and contraction of a DAG can only create cycles between classes if the user
  // asked for something impossible — guarded below).
  const rank = new Map<string, number>();
  const sorted = topoSort(classes, qOut, qIn);
  for (const c of sorted) {
    let r = 0;
    for (const p of qIn.get(c)!) r = Math.max(r, (rank.get(p) ?? 0) + 1);
    rank.set(c, r);
  }

  // Tightening: pull each node down to just above its tightest successor, so a
  // source with one far-away consumer does not float at rank 0 for no reason.
  for (const c of [...sorted].reverse()) {
    const succ = [...qOut.get(c)!];
    if (succ.length === 0) continue;
    const minSucc = Math.min(...succ.map((s) => rank.get(s)!));
    if (minSucc - 1 > rank.get(c)!) {
      const preds = [...qIn.get(c)!];
      const maxPred = preds.length ? Math.max(...preds.map((p) => rank.get(p)!)) : -1;
      rank.set(c, Math.max(maxPred + 1, minSucc - 1));
    }
  }

  const out = new Map<string, number>();
  for (const id of g.nodes.keys()) out.set(id, rank.get(classOf(id)) ?? 0);
  return out;
}

function topoSort(
  nodes: Set<string>,
  out: Map<string, Set<string>>,
  inn: Map<string, Set<string>>
): string[] {
  const indeg = new Map<string, number>();
  for (const n of nodes) indeg.set(n, inn.get(n)!.size);
  // deterministic queue: always take the smallest id available
  const ready = [...nodes].filter((n) => indeg.get(n) === 0).sort();
  const order: string[] = [];
  while (ready.length) {
    const v = ready.shift()!;
    order.push(v);
    for (const w of [...out.get(v)!].sort()) {
      indeg.set(w, indeg.get(w)! - 1);
      if (indeg.get(w) === 0) {
        ready.push(w);
        ready.sort();
      }
    }
  }
  // A contracted cycle (the user demanded same-rank for nodes with a path between
  // them) leaves nodes unranked. Rather than hang or silently drop them, append
  // them in id order: the constraint is unsatisfiable and the layout degrades
  // predictably instead of mysteriously.
  for (const n of [...nodes].sort()) if (!order.includes(n)) order.push(n);
  return order;
}

interface LayerNode {
  id: string;
  /** dummy nodes carry the edge they belong to */
  edgeId?: string;
  width: number;
  height: number;
  isDummy: boolean;
}

/**
 * Phase 3 — normalisation: no edge may span more than one rank.
 *
 * The phase most naive implementations skip, and the reason their long edges cut
 * through nodes: crossing minimisation only sees edges BETWEEN ADJACENT layers, so
 * an unsplit rank-0-to-rank-4 edge is invisible to it, and coordinate assignment
 * has nowhere to bend it.
 */
function normalise(
  g: Graph,
  ranks: Map<string, number>,
  edges: SugiyamaEdge[]
): { layers: LayerNode[][]; chains: Map<string, string[]> } {
  const maxRank = Math.max(0, ...ranks.values());
  const layers: LayerNode[][] = Array.from({ length: maxRank + 1 }, () => []);

  for (const [id, node] of g.nodes) {
    layers[ranks.get(id)!].push({ id, width: node.width, height: node.height, isDummy: false });
  }

  const chains = new Map<string, string[]>();
  let dummySeq = 0;
  for (const e of [...edges].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (!g.nodes.has(e.source) || !g.nodes.has(e.target) || e.source === e.target) continue;
    const r1 = ranks.get(e.source)!;
    const r2 = ranks.get(e.target)!;
    const lo = Math.min(r1, r2);
    const hi = Math.max(r1, r2);
    if (hi - lo <= 1) continue;

    const chain: string[] = [];
    for (let r = lo + 1; r < hi; r++) {
      const did = `__dummy_${dummySeq++}`;
      layers[r].push({ id: did, edgeId: e.id, width: 1, height: 1, isDummy: true });
      chain.push(did);
    }
    chains.set(e.id, chain);
  }

  for (const layer of layers) layer.sort((a, b) => (a.id < b.id ? -1 : 1));
  return { layers, chains };
}

/** Adjacency between consecutive layers, including through dummy chains. */
function layerAdjacency(
  g: Graph,
  ranks: Map<string, number>,
  edges: SugiyamaEdge[],
  chains: Map<string, string[]>
): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  const push = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a)!.push(b);
    adj.get(b)!.push(a);
  };

  for (const e of [...edges].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (!g.nodes.has(e.source) || !g.nodes.has(e.target) || e.source === e.target) continue;
    const r1 = ranks.get(e.source)!;
    const r2 = ranks.get(e.target)!;
    const [top, bottom] = r1 <= r2 ? [e.source, e.target] : [e.target, e.source];
    const chain = chains.get(e.id) ?? [];
    if (chain.length === 0) {
      push(top, bottom);
    } else {
      push(top, chain[0]);
      for (let i = 1; i < chain.length; i++) push(chain[i - 1], chain[i]);
      push(chain[chain.length - 1], bottom);
    }
  }
  return adj;
}

/** Crossings between two adjacent layers, given their orders. */
function countCrossings(
  upper: LayerNode[],
  lower: LayerNode[],
  adj: Map<string, string[]>
): number {
  const posLower = new Map(lower.map((n, i) => [n.id, i]));
  const pairs: number[] = [];
  for (const u of upper) {
    const targets = (adj.get(u.id) ?? [])
      .filter((t) => posLower.has(t))
      .map((t) => posLower.get(t)!)
      .sort((a, b) => a - b);
    pairs.push(...targets);
  }
  // count inversions
  let crossings = 0;
  for (let i = 0; i < pairs.length; i++) {
    for (let j = i + 1; j < pairs.length; j++) {
      if (pairs[i] > pairs[j]) crossings++;
    }
  }
  return crossings;
}

function totalCrossings(layers: LayerNode[][], adj: Map<string, string[]>): number {
  let total = 0;
  for (let i = 0; i + 1 < layers.length; i++) total += countCrossings(layers[i], layers[i + 1], adj);
  return total;
}

/**
 * Phase 4 — ordering: median heuristic with adjacent transpose.
 *
 * Card 5's ORDER and KEEP-TOGETHER constraints are re-imposed after every sweep.
 * That is deliberate: the heuristic is free to explore, but it never gets to
 * publish an ordering that violates what the user asked for. (Imposing them only
 * once at the start would let the first sweep undo them.)
 */
function orderLayers(
  layers: LayerNode[][],
  adj: Map<string, string[]>,
  constraints: SemanticConstraints | undefined,
  iterations: number
): { layers: LayerNode[][]; crossings: number } {
  let best = layers.map((l) => [...l]);
  enforceOrdering(best, constraints);
  let bestCount = totalCrossings(best, adj);

  let current = best.map((l) => [...l]);

  for (let iter = 0; iter < iterations; iter++) {
    const downward = iter % 2 === 0;
    const range = downward
      ? [...Array(current.length).keys()].slice(1)
      : [...Array(current.length).keys()].slice(0, -1).reverse();

    for (const i of range) {
      const fixed = downward ? current[i - 1] : current[i + 1];
      const pos = new Map(fixed.map((n, idx) => [n.id, idx]));
      const median = (n: LayerNode): number => {
        const ns = (adj.get(n.id) ?? []).filter((x) => pos.has(x)).map((x) => pos.get(x)!);
        if (ns.length === 0) return -1; // keep un-connected nodes where they are
        ns.sort((a, b) => a - b);
        const m = ns.length >> 1;
        return ns.length % 2 ? ns[m] : (ns[m - 1] + ns[m]) / 2;
      };
      const keyed = current[i].map((n, idx) => ({ n, m: median(n), idx }));
      keyed.sort((a, b) => {
        if (a.m === -1 && b.m === -1) return a.idx - b.idx;
        if (a.m === -1) return -1;
        if (b.m === -1) return 1;
        return a.m - b.m || a.idx - b.idx; // stable: index breaks ties deterministically
      });
      current[i] = keyed.map((k) => k.n);
    }

    transpose(current, adj);
    enforceOrdering(current, constraints);

    const count = totalCrossings(current, adj);
    if (count < bestCount) {
      bestCount = count;
      best = current.map((l) => [...l]);
    }
    current = best.map((l) => [...l]); // restart from the best, not from a worse local
  }

  return { layers: best, crossings: bestCount };
}

/** Swap adjacent pairs while it reduces crossings — the cheap local fix the median misses. */
function transpose(layers: LayerNode[][], adj: Map<string, string[]>): void {
  let improved = true;
  let guard = 0;
  while (improved && guard++ < 8) {
    improved = false;
    for (let i = 0; i + 1 < layers.length; i++) {
      for (let j = 0; j + 1 < layers[i].length; j++) {
        const before = countCrossings(layers[i], layers[i + 1], adj);
        [layers[i][j], layers[i][j + 1]] = [layers[i][j + 1], layers[i][j]];
        const after = countCrossings(layers[i], layers[i + 1], adj);
        if (after < before) improved = true;
        else [layers[i][j], layers[i][j + 1]] = [layers[i][j + 1], layers[i][j]]; // undo
      }
    }
  }
}

/**
 * Card 5: re-impose relative order and keep-together, in place.
 *
 * Order constraints: a topological pass within each layer (a must precede b).
 * Keep-together: members of a cluster are gathered to the position of their
 * earliest member, preserving their relative order — the sweeps may reorder a
 * cluster internally, but may not split it.
 */
function enforceOrdering(layers: LayerNode[][], constraints: SemanticConstraints | undefined): void {
  if (!constraints) return;

  for (const layer of layers) {
    const index = new Map(layer.map((n, i) => [n.id, i]));

    // keep-together: pull cluster members adjacent to their earliest member
    for (const cluster of constraints.keepTogether ?? []) {
      const present = cluster.filter((id) => index.has(id));
      if (present.length < 2) continue;
      const anchor = Math.min(...present.map((id) => index.get(id)!));
      const members = present
        .map((id) => layer[index.get(id)!])
        .sort((a, b) => index.get(a.id)! - index.get(b.id)!);
      const rest = layer.filter((n) => !present.includes(n.id));
      const head = rest.slice(0, anchor);
      const tail = rest.slice(anchor);
      layer.length = 0;
      layer.push(...head, ...members, ...tail);
      index.clear();
      layer.forEach((n, i) => index.set(n.id, i));
    }

    // relative order: bubble until every (a before b) holds. Bounded — an
    // unsatisfiable cycle of constraints degrades rather than hangs.
    const pairs = (constraints.order ?? []).filter(([a, b]) => index.has(a) && index.has(b));
    for (let guard = 0; guard < pairs.length * layer.length + 1; guard++) {
      let violated = false;
      for (const [a, b] of pairs) {
        const ia = layer.findIndex((n) => n.id === a);
        const ib = layer.findIndex((n) => n.id === b);
        if (ia > ib) {
          const [moved] = layer.splice(ia, 1);
          layer.splice(ib, 0, moved);
          violated = true;
        }
      }
      if (!violated) break;
    }
  }
}

/**
 * Phase 5 — coordinate assignment (priority / median method).
 *
 * Dummy chains get the HIGHEST priority, and that is the single most important
 * decision in this function: a dummy chain IS a long edge, and a long edge that
 * zig-zags is the ugliest artefact a layered drawing can have. Straighten those
 * first, then let real nodes drift toward the median of their neighbours in
 * whatever room is left.
 *
 * Card 5's ANCHORS enter here with priority above everything: an anchored node
 * does not move, and — crucially, unlike the old clamp — everything else is laid
 * out AROUND it, because the non-overlap pass sees the anchor as an immovable
 * obstacle rather than discovering it afterwards.
 */
function assignCoordinates(
  layers: LayerNode[][],
  adj: Map<string, string[]>,
  nodeSpacing: number,
  constraints: SemanticConstraints | undefined,
  iterations: number
): Map<string, number> {
  const x = new Map<string, number>();

  // initial packing, left to right
  for (const layer of layers) {
    let cx = 0;
    for (const n of layer) {
      x.set(n.id, cx + n.width / 2);
      cx += n.width + nodeSpacing;
    }
  }

  const anchors = constraints?.anchors ?? {};
  const isAnchored = (id: string) => anchors[id]?.x !== undefined;
  for (const [id, a] of Object.entries(anchors)) {
    if (a.x !== undefined) x.set(id, a.x);
  }

  const priority = (n: LayerNode): number => {
    if (isAnchored(n.id)) return 1e9; // immovable
    if (n.isDummy) return 1e6; // straighten long edges before anything else
    return (adj.get(n.id) ?? []).length; // then by degree
  };

  for (let iter = 0; iter < iterations; iter++) {
    const downward = iter % 2 === 0;
    const order = downward
      ? [...Array(layers.length).keys()]
      : [...Array(layers.length).keys()].reverse();

    for (const li of order) {
      const layer = layers[li];
      const neighbourLayer = downward ? layers[li - 1] : layers[li + 1];
      if (!neighbourLayer) continue;

      const desired = new Map<string, number>();
      for (const n of layer) {
        const ns = (adj.get(n.id) ?? []).filter((m) => neighbourLayer.some((k) => k.id === m));
        if (ns.length === 0) continue;
        const xs = ns.map((m) => x.get(m)!).sort((a, b) => a - b);
        const mid = xs.length >> 1;
        desired.set(n.id, xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2);
      }

      // Move nodes toward their desired x in priority order, never violating
      // non-overlap with already-placed (higher-priority) neighbours.
      const byPriority = [...layer].sort((a, b) => priority(b) - priority(a) || (a.id < b.id ? -1 : 1));
      const placed = new Set<string>();
      for (const n of byPriority) {
        placed.add(n.id);
        if (isAnchored(n.id)) continue;
        const want = desired.get(n.id);
        if (want === undefined) continue;

        const idx = layer.findIndex((k) => k.id === n.id);
        // left bound: the nearest placed node to the left
        let lo = -Infinity;
        for (let k = idx - 1; k >= 0; k--) {
          if (placed.has(layer[k].id)) {
            lo = x.get(layer[k].id)! + layer[k].width / 2 + nodeSpacing + n.width / 2;
            break;
          }
        }
        let hi = Infinity;
        for (let k = idx + 1; k < layer.length; k++) {
          if (placed.has(layer[k].id)) {
            hi = x.get(layer[k].id)! - layer[k].width / 2 - nodeSpacing - n.width / 2;
            break;
          }
        }
        x.set(n.id, Math.max(lo, Math.min(hi, want)));
      }

      // A final left-to-right sweep guarantees non-overlap even where the bounds
      // above were both infinite (a layer whose nodes all wanted the same spot).
      for (let k = 1; k < layer.length; k++) {
        const prev = layer[k - 1];
        const cur = layer[k];
        const minX = x.get(prev.id)! + prev.width / 2 + nodeSpacing + cur.width / 2;
        if (x.get(cur.id)! < minX && !isAnchored(cur.id)) x.set(cur.id, minX);
      }
    }
  }

  return x;
}

// ---------------------------------------------------------------------------

/**
 * Lay out a graph in layers. Pure, deterministic, no DOM, no time, no randomness.
 */
export function sugiyama(
  nodes: SugiyamaNode[],
  edges: SugiyamaEdge[],
  options: SugiyamaOptions = {}
): SugiyamaResult {
  const direction = options.direction ?? DEFAULTS.direction;
  const nodeSpacing = options.nodeSpacing ?? DEFAULTS.nodeSpacing;
  const rankSpacing = options.rankSpacing ?? DEFAULTS.rankSpacing;
  const iterations = options.iterations ?? DEFAULTS.iterations;
  const constraints = options.constraints;

  if (nodes.length === 0) {
    return { positions: new Map(), ranks: new Map(), bends: new Map(), crossings: 0 };
  }

  // In LR/RL the roles of the axes swap. Rather than write the algorithm twice,
  // lay out in TB space using the node's CROSS-AXIS extent as its "width", then
  // transform at the end.
  const vertical = direction === 'TB' || direction === 'BT';
  const measured: SugiyamaNode[] = nodes.map((n) => ({
    id: n.id,
    width: vertical ? n.width : n.height,
    height: vertical ? n.height : n.width,
  }));

  // ANCHORS LIVE IN WORLD SPACE; the pipeline runs in TB space.
  //
  // The algorithm has exactly one free axis — the IN-LAYER coordinate — because the
  // other one IS the rank, and rank comes from the graph, not from the caller. In TB
  // the in-layer axis is world-x; in LR it is world-y. Handing `anchor.x` straight to
  // the coordinate pass therefore pins the wrong axis the moment direction inference
  // picks LR — and it does that for exactly the graphs (long chains) where a user is
  // most likely to be nudging nodes around. Caught by the region test: the x anchors
  // held perfectly and every node still slid 385px down the page.
  const tbConstraints: SemanticConstraints | undefined = constraints
    ? {
        ...constraints,
        anchors: Object.fromEntries(
          Object.entries(constraints.anchors ?? {}).map(([id, a]) => [
            id,
            vertical ? { x: a.x, y: a.y } : { x: a.y, y: a.x },
          ])
        ),
      }
    : undefined;

  const g = buildGraph(measured, edges);
  const reversed = breakCycles(g);
  const ranks = assignRanks(g, tbConstraints);
  const { layers, chains } = normalise(g, ranks, edges);
  const adj = layerAdjacency(g, ranks, edges, chains);
  const { layers: ordered, crossings } = orderLayers(layers, adj, tbConstraints, iterations);
  const xs = assignCoordinates(ordered, adj, nodeSpacing, tbConstraints, iterations);

  // rank -> y (TB space).
  //
  // Normally a layer is stacked below the previous one by its tallest node plus the
  // rank spacing. But an ANCHORED node also pins the RANK axis, and honouring that
  // is what makes "pin these nodes" exact rather than approximate:
  //
  //   The in-layer axis is the only one coordinate assignment is free to choose —
  //   the other one IS the rank, derived from the graph. So without this, a pinned
  //   node keeps its in-layer coordinate and still slides along the rank axis
  //   whenever the layer heights or the rank spacing differ by a pixel — which they
  //   always do the moment a different engine produced the previous layout. The
  //   nodes were "pinned" and moved anyway, which reads as the pins not working.
  //
  // So: if a layer contains anchored nodes, the LAYER sits where they say it does
  // (their median rank-axis coordinate). Monotonicity and non-overlap between layers
  // are then re-imposed, because an anchor may not reorder the ranks — rank is the
  // graph's decision, not the caller's.
  const anchorY = tbConstraints?.anchors ?? {};
  const rawLayerY: Array<number | undefined> = ordered.map((layer) => {
    const pinned = layer
      .map((n) => anchorY[n.id]?.y)
      .filter((v): v is number => typeof v === 'number');
    if (pinned.length === 0) return undefined;
    pinned.sort((a, b) => a - b);
    return pinned[pinned.length >> 1];
  });

  const layerY: number[] = [];
  let y = 0;
  ordered.forEach((layer, i) => {
    const h = Math.max(0, ...layer.map((n) => n.height));
    const pinnedY = rawLayerY[i];
    const stacked = y + h / 2;
    // A pinned layer sits where its anchors say — but never above the layer before
    // it, because that would invert the ranking the graph demands.
    const chosen = pinnedY !== undefined ? Math.max(pinnedY, stacked) : stacked;
    layerY.push(chosen);
    y = chosen + h / 2 + rankSpacing;
  });
  const totalHeight = Math.max(0, y - rankSpacing);

  const positions = new Map<string, { x: number; y: number }>();
  const bends = new Map<string, Array<{ x: number; y: number }>>();

  const place = (id: string, tx: number, ty: number): { x: number; y: number } => {
    // Transform TB-space (tx, ty) into the requested direction.
    switch (direction) {
      case 'TB':
        return { x: tx, y: ty };
      case 'BT':
        return { x: tx, y: totalHeight - ty };
      case 'LR':
        return { x: ty, y: tx };
      case 'RL':
        return { x: totalHeight - ty, y: tx };
    }
  };

  ordered.forEach((layer, li) => {
    for (const n of layer) {
      const p = place(n.id, xs.get(n.id)!, layerY[li]);
      if (n.isDummy) {
        const list = bends.get(n.edgeId!) ?? [];
        list.push(p);
        bends.set(n.edgeId!, list);
      } else {
        const original = nodes.find((k) => k.id === n.id)!;
        // positions are TOP-LEFT (the model's convention), not centres
        positions.set(n.id, { x: p.x - original.width / 2, y: p.y - original.height / 2 });
      }
    }
  });

  // Restore the edges we reversed for cycle-breaking, so bend chains read in the
  // author's direction rather than the algorithm's.
  for (const [edgeId, list] of bends) {
    const e = edges.find((k) => k.id === edgeId);
    if (e && reversed.has(`${e.target}->${e.source}`)) bends.set(edgeId, [...list].reverse());
  }

  return { positions, ranks, bends, crossings };
}

/**
 * Card 1: DIRECTION INFERENCE — "TB for trees, LR for pipelines".
 *
 * The heuristic, stated so it can be argued with: a graph that is deep and narrow
 * reads better across the page (a pipeline: A → B → C → D as a row, not a column),
 * and a graph that is wide and shallow reads better down it (a tree fans out).
 * The threshold is the aspect of the LAYER structure, not of the node count.
 */
export function inferDirection(nodes: SugiyamaNode[], edges: SugiyamaEdge[]): LayoutDirection {
  if (nodes.length === 0) return 'TB';
  const g = buildGraph(nodes, edges);
  breakCycles(g);
  const ranks = assignRanks(g, undefined);
  const depth = Math.max(0, ...ranks.values()) + 1;
  const widths = new Map<number, number>();
  for (const r of ranks.values()) widths.set(r, (widths.get(r) ?? 0) + 1);
  const maxWidth = Math.max(1, ...widths.values());

  // Deep and narrow => a chain/pipeline => lay it out left-to-right.
  return depth >= 4 && maxWidth <= 2 ? 'LR' : 'TB';
}
