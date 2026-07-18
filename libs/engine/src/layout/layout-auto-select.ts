// Wave 7 (Auto-layout) — Card 7b: auto-algorithm selection.
//
// ---------------------------------------------------------------------------
// WHAT THIS IS FOR
// ---------------------------------------------------------------------------
//
// `engine.layout()` with no name should produce a good picture. Today the caller
// has to know that a tree wants `mrtree`, a dense mesh wants `force`, and a
// pipeline wants `layered` — i.e. they have to know graph-drawing theory to get a
// diagram drawn. They do not want to learn it, so they pick the default, and the
// default is wrong for their graph.
//
// So: RUN the plausible candidates, MEASURE the results, and keep the best one.
// Not a heuristic that guesses from node count — an actual bake-off, scored on the
// metrics that were sitting unused in layout-quality-metrics.ts.
//
// ---------------------------------------------------------------------------
// THE TWO RULES THAT KEEP IT FROM BEING A SUPPORT TICKET
// ---------------------------------------------------------------------------
//
// 1. DETERMINISTIC. Same graph => same choice, always. Candidates run in a fixed
//    order, every algorithm gets the same seed, and ties break by candidate name.
//    An auto-selector that picks differently on reload is worse than no
//    auto-selector: the diagram moves under the user for no reason they can see.
//
// 2. IT SHOWS ITS WORKING. `LayoutSelectionReport` carries every candidate, every
//    score and the reason the winner won. A black-box selector that picks a layout
//    the user dislikes leaves them with nowhere to go but a support ticket; one
//    that says "elk scored 91, dagre 78, force 44, and elk won on port respect"
//    lets them disagree with the SCORE, override it, and move on.

import type { DiagramModel } from '../models/DiagramModel';
import type { NodeModel } from '../models/NodeModel';
import type { LinkModel } from '../models/LinkModel';
import type { LayoutResult } from './layout-adapter.interface';
import type { LayoutRegistry, UnifiedLayoutOptions, RegisteredLayout } from './layout-registry';
import { LayoutQualityMetrics, LayoutQualityResult } from './layout-quality-metrics';
import {
  assessPortRespect,
  assessLabelClearance,
  countBends,
  layoutArea,
} from './layout-quality-extended';
import { derivePortInfos, linkLabelBox } from './port-label-bridge';
import { DEFAULT_LAYOUT_SEED } from './rng';

/** The registered name of the auto-selecting layout. */
export const AUTO_LAYOUT_NAME = 'auto';

// ---------------------------------------------------------------------------
// Graph shape
// ---------------------------------------------------------------------------

/**
 * What kind of graph is this? Used to pick which candidates are worth RUNNING
 * (a bake-off over five algorithms on a 5,000-node graph is not free) — never to
 * pick the winner. The winner is always decided by measurement.
 */
export interface GraphShape {
  nodeCount: number;
  linkCount: number;
  /** links / max-possible-links. */
  density: number;
  /** No cycles, and every node has at most one parent. */
  isTree: boolean;
  /** Directed, acyclic. */
  isDAG: boolean;
  /** Number of connected components. */
  components: number;
  /** Any node carries author-declared ports. */
  hasDeclaredPorts: boolean;
  /** Any link carries a label. */
  hasEdgeLabels: boolean;
}

export function analyseGraphShape(nodes: NodeModel[], links: LinkModel[]): GraphShape {
  const nodeCount = nodes.length;
  const real = links.filter((l) => l.sourceNodeId && l.targetNodeId);
  const linkCount = real.length;

  const adjacency = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  for (const node of nodes) {
    adjacency.set(node.id, []);
    indegree.set(node.id, 0);
  }
  for (const link of real) {
    adjacency.get(link.sourceNodeId!)?.push(link.targetNodeId!);
    indegree.set(link.targetNodeId!, (indegree.get(link.targetNodeId!) ?? 0) + 1);
  }

  const maxEdges = nodeCount > 1 ? (nodeCount * (nodeCount - 1)) / 2 : 1;
  const density = linkCount / maxEdges;

  return {
    nodeCount,
    linkCount,
    density,
    isTree: isTree(nodes, real, indegree),
    isDAG: isAcyclic(nodes, adjacency),
    components: countComponents(nodes, real),
    hasDeclaredPorts: derivePortInfos(nodes).length > 0,
    hasEdgeLabels: links.some((l) => linkLabelBox(l) !== undefined),
  };
}

function isTree(nodes: NodeModel[], links: LinkModel[], indegree: Map<string, number>): boolean {
  if (nodes.length === 0) return false;
  // Every node has at most one parent, and there are exactly n-1 edges across a
  // single component — the textbook shape.
  for (const node of nodes) if ((indegree.get(node.id) ?? 0) > 1) return false;
  return links.length === nodes.length - 1 && countComponents(nodes, links) === 1;
}

function isAcyclic(nodes: NodeModel[], adjacency: Map<string, string[]>): boolean {
  const WHITE = 0;
  const GREY = 1;
  const BLACK = 2;
  const colour = new Map<string, number>();
  for (const node of nodes) colour.set(node.id, WHITE);

  const visit = (id: string): boolean => {
    colour.set(id, GREY);
    for (const next of adjacency.get(id) ?? []) {
      const c = colour.get(next);
      if (c === GREY) return false; // back-edge => cycle
      if (c === WHITE && !visit(next)) return false;
    }
    colour.set(id, BLACK);
    return true;
  };

  for (const node of nodes) {
    if (colour.get(node.id) === WHITE && !visit(node.id)) return false;
  }
  return true;
}

/**
 * Longest-path layering estimate for a DAG — the two numbers that predict which
 * hierarchical engine will choke (measured, not guessed; see the perf spec):
 *
 *   • dagre's pathology is DEPTH: a 2,000-rank chain never returns, while a
 *     2,000-node, ~1,000-wide tree takes ~700ms.
 *   • our layered (Sugiyama) engine's pathology is WIDTH: crossing minimisation
 *     over a ~1,000-node rank runs for tens of seconds, while a 45-wide,
 *     90-deep mesh takes ~480ms and a width-1, 2,000-deep chain ~130ms.
 *
 * O(n + m) via Kahn's algorithm. Only meaningful when the graph is acyclic;
 * nodes left unranked by a cycle default to rank 0.
 */
export interface LayeringEstimate {
  /** Number of layers a longest-path layering would produce. */
  depth: number;
  /** Node count of the widest layer. */
  maxWidth: number;
}

export function estimateLayering(nodes: NodeModel[], links: LinkModel[]): LayeringEstimate {
  const indegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();
  for (const node of nodes) {
    indegree.set(node.id, 0);
    adjacency.set(node.id, []);
  }
  for (const link of links) {
    if (!link.sourceNodeId || !link.targetNodeId) continue;
    if (!indegree.has(link.sourceNodeId) || !indegree.has(link.targetNodeId)) continue;
    adjacency.get(link.sourceNodeId)!.push(link.targetNodeId);
    indegree.set(link.targetNodeId, indegree.get(link.targetNodeId)! + 1);
  }

  const rank = new Map<string, number>();
  const queue: string[] = [];
  for (const node of nodes) {
    if (indegree.get(node.id) === 0) {
      rank.set(node.id, 0);
      queue.push(node.id);
    }
  }
  let head = 0;
  while (head < queue.length) {
    const id = queue[head++];
    const r = rank.get(id) ?? 0;
    for (const next of adjacency.get(id) ?? []) {
      rank.set(next, Math.max(rank.get(next) ?? 0, r + 1));
      const remaining = indegree.get(next)! - 1;
      indegree.set(next, remaining);
      if (remaining === 0) queue.push(next);
    }
  }

  const widths = new Map<number, number>();
  let depth = 0;
  let maxWidth = 0;
  for (const node of nodes) {
    const r = rank.get(node.id) ?? 0;
    const width = (widths.get(r) ?? 0) + 1;
    widths.set(r, width);
    if (width > maxWidth) maxWidth = width;
    if (r + 1 > depth) depth = r + 1;
  }
  return { depth, maxWidth };
}

function countComponents(nodes: NodeModel[], links: LinkModel[]): number {
  const parent = new Map<string, string>();
  for (const node of nodes) parent.set(node.id, node.id);

  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    return root;
  };

  for (const link of links) {
    const a = find(link.sourceNodeId!);
    const b = find(link.targetNodeId!);
    if (a !== b) parent.set(a, b);
  }

  const roots = new Set<string>();
  for (const node of nodes) roots.add(find(node.id));
  return roots.size;
}

// ---------------------------------------------------------------------------
// Candidates
// ---------------------------------------------------------------------------

export interface LayoutCandidate {
  /** Registered layout name to run. */
  name: string;
  /** Options to run it with. */
  options: UnifiedLayoutOptions;
  /** A stable id for this candidate — name + tuning. Ties break on this. */
  id: string;
  /** Is this engine able to honour port sides? */
  portAware: boolean;
}

/**
 * The candidate pool, in a FIXED order.
 *
 * Auto-tuning lives here too: a candidate is an algorithm PLUS its knobs, so
 * `dagre TB` and `dagre LR` compete as separate candidates and the better
 * direction simply wins on score. That is the whole of "auto-tune" — no separate
 * tuning pass, just more candidates in the bake-off.
 */
export function buildCandidates(shape: GraphShape, registry: LayoutRegistry): LayoutCandidate[] {
  const all: LayoutCandidate[] = [
    // Wave 7 Cards 1/5 — our own layered engine. In the pool like anything else: it
    // wins on merit or it does not win. (It is, however, the only engine that can
    // honour semantic constraints, which is why the incremental/mental-map path
    // names it explicitly instead of going through this bake-off.)
    { id: 'layered:TB', name: 'layered', options: { direction: 'TB' }, portAware: false },
    { id: 'layered:LR', name: 'layered', options: { direction: 'LR' }, portAware: false },
    { id: 'dagre:TB', name: 'dagre', options: { direction: 'TB' }, portAware: false },
    { id: 'dagre:LR', name: 'dagre', options: { direction: 'LR' }, portAware: false },
    {
      id: 'elk:layered:RIGHT',
      name: 'elk',
      options: { direction: 'LR', algorithm: 'layered' } as UnifiedLayoutOptions,
      portAware: true,
    },
    {
      id: 'elk:layered:DOWN',
      name: 'elk',
      options: { direction: 'TB', algorithm: 'layered' } as UnifiedLayoutOptions,
      portAware: true,
    },
    {
      id: 'elk:mrtree',
      name: 'elk',
      options: { algorithm: 'mrtree' } as UnifiedLayoutOptions,
      portAware: false,
    },
    {
      id: 'elk:stress',
      name: 'elk',
      options: { algorithm: 'stress' } as UnifiedLayoutOptions,
      portAware: false,
    },
    { id: 'force', name: 'force', options: {}, portAware: false },
  ];

  return all.filter((candidate) => {
    if (!registry.has(candidate.name)) return false;

    // Shape gating — which candidates are worth RUNNING. Never which one wins.
    if (candidate.id === 'elk:mrtree' && !shape.isTree) return false;

    // A hierarchical layout on a graph with no hierarchy is a waste of a run.
    if (candidate.name === 'dagre' && !shape.isDAG && shape.density > 0.5) return false;

    // Force on a big graph is slow and rarely wins against layered.
    if (candidate.name === 'force' && shape.nodeCount > FORCE_NODE_LIMIT) return false;

    // Stress majorisation is O(n²) per sweep with n-proportional sweeps — measured
    // at 33 SECONDS for a 300-node chain (perf spec). It only earns its keep on
    // small organic graphs; above this it is the single candidate that turns the
    // whole bake-off into a hang.
    if (candidate.id === 'elk:stress' && shape.nodeCount > STRESS_NODE_LIMIT) return false;

    return true;
  });
}

/** Above this, the force candidate is not worth its runtime. */
const FORCE_NODE_LIMIT = 200;

/** Above this, elk:stress costs seconds (33s at n=300, measured) and is excluded. */
const STRESS_NODE_LIMIT = 100;

// ---------------------------------------------------------------------------
// Scale-aware direct pick (no bake-off above BAKEOFF_NODE_LIMIT)
// ---------------------------------------------------------------------------

/**
 * Above this many nodes the bake-off itself is the pathology: it runs EVERY
 * candidate engine on the full graph, so its runtime is the SUM of the field —
 * including whichever engine happens to hang at that scale (measured: 16s+ at
 * 300 nodes, unbounded at 2,000). Past this limit the graph is classified
 * structurally and ONE engine is picked directly; the choice is still
 * deterministic and still explained in the selection report.
 */
export const BAKEOFF_NODE_LIMIT = 200;

/**
 * Rank-width ceiling for our layered (Sugiyama) engine. Measured: 45-wide mesh
 * ranks are fast (~480ms at n=2025); ~1,000-wide tree ranks take 5s+ and a
 * 2,000-node sparse DAG with wide ranks never returned.
 */
const LAYERED_RANK_WIDTH_LIMIT = 100;

/**
 * Rank-depth ceiling for dagre. Measured: ~700ms at 1,000-wide/11-deep,
 * ~790ms at a 1,000-rank chain, unbounded at a 2,000-rank chain.
 */
const DAGRE_RANK_DEPTH_LIMIT = 600;

/** A structural engine choice made without running a bake-off. */
export interface ScalePlan {
  /** Candidates to try, best-first; the first that runs wins. */
  candidates: LayoutCandidate[];
  /** The structural fact the pick rests on — goes into the report verbatim. */
  why: string;
}

/**
 * Pick the engine(s) for a graph too large to bake off, from its STRUCTURE.
 *
 * Every branch below is backed by a measurement in layout-auto-select.perf.spec.ts
 * (times on the dev machine, generous CI caps in the spec):
 *
 *   tree            → portfolio `tree`: 19ms at n=2000 (vs dagre 702ms, layered 5.3s)
 *   DAG, narrow     → `layered`: 156ms at 900-mesh, 479ms at 2025-mesh,
 *                     132ms at a 2,000-deep chain — width is what hurts it, and
 *                     narrow ranks are exactly where dagre's depth pathology lives.
 *   DAG, wide+shallow → `dagre`: 1.3s at a 2,000-node sparse DAG whose ~1,000-wide
 *                     ranks are what kill layered.
 *   DAG, wide+deep  → `elk` layered: the moderate-everywhere engine.
 *   cyclic          → `force`: completes in well under a second at this scale;
 *                     hierarchical engines would first have to break the cycles.
 *
 * Declared ports bump ELK (the only port-aware candidate) to the front for
 * hierarchical graphs — at this scale we cannot afford to MEASURE port respect
 * across a whole field, so we pick the engine built to honour it.
 *
 * Returns undefined when none of the preferred engines is registered; the caller
 * then falls back to the (gated) bake-off rather than failing.
 */
export function pickEngineForScale(
  shape: GraphShape,
  nodes: NodeModel[],
  links: LinkModel[],
  registry: LayoutRegistry
): ScalePlan | undefined {
  const pool: Record<string, LayoutCandidate> = {
    tree: { id: 'tree', name: 'tree', options: {}, portAware: false },
    'layered:TB': { id: 'layered:TB', name: 'layered', options: { direction: 'TB' }, portAware: false },
    'dagre:TB': { id: 'dagre:TB', name: 'dagre', options: { direction: 'TB' }, portAware: false },
    'elk:layered:DOWN': {
      id: 'elk:layered:DOWN',
      name: 'elk',
      options: { direction: 'TB', algorithm: 'layered' } as UnifiedLayoutOptions,
      portAware: true,
    },
    'elk:mrtree': {
      id: 'elk:mrtree',
      name: 'elk',
      options: { algorithm: 'mrtree' } as UnifiedLayoutOptions,
      portAware: false,
    },
    force: { id: 'force', name: 'force', options: {}, portAware: false },
    grid: { id: 'grid', name: 'grid', options: {}, portAware: false },
    circular: { id: 'circular', name: 'circular', options: {}, portAware: false },
  };

  let prefer: string[];
  let why: string;

  if (shape.isTree) {
    why = `the graph is a tree (${shape.nodeCount} nodes)`;
    prefer = ['tree', 'dagre:TB', 'elk:mrtree', 'elk:layered:DOWN', 'layered:TB'];
  } else if (shape.isDAG) {
    const { depth, maxWidth } = estimateLayering(nodes, links);
    if (maxWidth <= LAYERED_RANK_WIDTH_LIMIT) {
      why = `the graph is a DAG with narrow ranks (max width ${maxWidth} across ${depth} layers)`;
      prefer = ['layered:TB', 'elk:layered:DOWN', 'dagre:TB'];
    } else if (depth <= DAGRE_RANK_DEPTH_LIMIT) {
      why = `the graph is a DAG with wide, shallow ranks (max width ${maxWidth}, ${depth} layers)`;
      prefer = ['dagre:TB', 'elk:layered:DOWN', 'layered:TB'];
    } else {
      why = `the graph is a DAG with ranks both wide (${maxWidth}) and deep (${depth})`;
      prefer = ['elk:layered:DOWN', 'dagre:TB', 'layered:TB'];
    }
  } else {
    why = `the graph has cycles (density ${shape.density.toFixed(3)})`;
    prefer = ['force', 'grid', 'circular'];
  }

  // Ports at scale: pick the port-aware engine instead of measuring the field.
  if (shape.hasDeclaredPorts && (shape.isTree || shape.isDAG)) {
    why += ', and nodes declare ports (ELK is the port-aware engine)';
    prefer = ['elk:layered:DOWN', ...prefer.filter((id) => id !== 'elk:layered:DOWN')];
  }

  const candidates = prefer.map((id) => pool[id]).filter((c) => registry.has(c.name));
  if (candidates.length === 0) return undefined;
  return { candidates, why };
}

/**
 * How many nodes the quality metrics see on the direct (no-bake-off) path.
 * The classic metrics are O(n²)/O(m²) — 1.2s+ at n=2000, measured — so the
 * report is scored on a deterministic stride sample instead of the full graph.
 */
const METRIC_SAMPLE_LIMIT = 300;

function sampleForMetrics(
  nodes: NodeModel[],
  links: LinkModel[]
): { nodes: NodeModel[]; links: LinkModel[]; sampled: boolean } {
  if (nodes.length <= METRIC_SAMPLE_LIMIT) return { nodes, links, sampled: false };
  // Nodes are already in canonical id order, so a stride sample is deterministic.
  const stride = Math.ceil(nodes.length / METRIC_SAMPLE_LIMIT);
  const kept = nodes.filter((_, i) => i % stride === 0);
  const ids = new Set(kept.map((n) => n.id));
  return {
    nodes: kept,
    links: links.filter((l) => ids.has(l.sourceNodeId ?? '') && ids.has(l.targetNodeId ?? '')),
    sampled: true,
  };
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/** Every number behind one candidate's verdict. */
export interface CandidateScore {
  id: string;
  name: string;
  options: UnifiedLayoutOptions;
  /** Final weighted score, 0-100. */
  score: number;
  /** The classic metrics (crossings, overlap, symmetry, …). */
  quality: LayoutQualityResult;
  /** Requirement 1: do edges leave in the direction their port faces? 0-100. */
  portRespect: number;
  /** Requirement 2: do edge labels stay off the nodes? 0-100. */
  labelClearance: number;
  /** Total bends across the engine's routes; undefined if it reported none. */
  bends: number | undefined;
  /** Bounding-box area in px². */
  area: number;
  /** Failed to run — kept in the report rather than hidden. */
  error?: string;
}

/**
 * How much each measure counts.
 *
 * Port respect and label clearance are weighted HARD, and deliberately: a layout
 * that runs an edge backwards out of its port, or drops a label on a node, is
 * WRONG in a way that a slightly-larger bounding box is not. They are also the two
 * things every other JS engine ignores — which is the whole point of this card.
 */
const WEIGHTS = {
  quality: 0.4, // the six classic metrics, already weighted among themselves
  portRespect: 0.3,
  labelClearance: 0.2,
  compactness: 0.1, // bends + area, relative to the best candidate
};

/**
 * Score one laid-out candidate. `area`/`bends` are scored RELATIVE to the rest of
 * the field (see `scoreField`), so this returns the raw measures.
 */
function measure(
  candidate: LayoutCandidate,
  nodes: NodeModel[],
  links: LinkModel[],
  result: LayoutResult
): Omit<CandidateScore, 'score'> {
  const quality = LayoutQualityMetrics.assess(nodes, links, { includeSuggestions: true });

  return {
    id: candidate.id,
    name: candidate.name,
    options: candidate.options,
    quality,
    portRespect: assessPortRespect(nodes, links).score,
    labelClearance: assessLabelClearance(nodes, links, result).score,
    bends: countBends(result),
    area: layoutArea(result),
  };
}

/**
 * Turn raw measures into final scores. Compactness is relative — the tightest
 * candidate in the field gets 100 and the rest are scored against it — because an
 * absolute px² threshold means nothing without knowing the graph.
 */
function scoreField(raw: Array<Omit<CandidateScore, 'score'>>): CandidateScore[] {
  const areas = raw.map((r) => r.area).filter((a) => a > 0);
  const bestArea = areas.length > 0 ? Math.min(...areas) : 0;

  const bendCounts = raw.map((r) => r.bends).filter((b): b is number => b !== undefined);
  const bestBends = bendCounts.length > 0 ? Math.min(...bendCounts) : undefined;

  return raw.map((r) => {
    // Area: best in field = 100, twice the best = 50, and so on.
    const areaScore = bestArea > 0 && r.area > 0 ? Math.max(0, (bestArea / r.area) * 100) : 100;

    // Bends: best in field = 100, decaying with each extra bend. An engine that
    // reported no routes is NOT scored on bends (it gets the field's average
    // rather than a free 100 — silence must not beat a measured result).
    let bendScore: number;
    if (r.bends === undefined || bestBends === undefined) {
      bendScore = 50;
    } else {
      bendScore = Math.max(0, 100 - (r.bends - bestBends) * BEND_PENALTY);
    }

    const compactness = areaScore * 0.5 + bendScore * 0.5;

    const score =
      r.quality.overallScore * WEIGHTS.quality +
      r.portRespect * WEIGHTS.portRespect +
      r.labelClearance * WEIGHTS.labelClearance +
      compactness * WEIGHTS.compactness;

    return { ...r, score: Math.round(score * 100) / 100 };
  });
}

/** Each bend past the field's best costs this much of the bend score. */
const BEND_PENALTY = 5;

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

/**
 * What the auto-selector chose, and WHY. Returned on the layout result, so the
 * reasoning is available to a UI, a log line or a test — never hidden.
 */
export interface LayoutSelectionReport {
  /** The candidate that won (its id, e.g. 'elk:layered:RIGHT'). */
  chosen: string;
  /** The registered algorithm behind it. */
  algorithm: string;
  /** One sentence a human can read. */
  reason: string;
  /** What we worked out about the graph before choosing. */
  shape: GraphShape;
  /** Every candidate, scored, best first. Losers included on purpose. */
  candidates: CandidateScore[];
}

/**
 * Say — in one sentence — why this candidate won. The sentence names the measure
 * that actually decided it, not a generic "it scored highest".
 */
function explain(winner: CandidateScore, field: CandidateScore[], shape: GraphShape): string {
  const runnerUp = field.find((c) => c.id !== winner.id);
  if (!runnerUp) {
    return `${winner.id} was the only candidate that ran (score ${winner.score}).`;
  }

  // Which measure separated them the most? That is the honest reason.
  const gaps: Array<[string, number]> = [
    ['port respect', (winner.portRespect - runnerUp.portRespect) * WEIGHTS.portRespect],
    ['label clearance', (winner.labelClearance - runnerUp.labelClearance) * WEIGHTS.labelClearance],
    [
      'layout quality (crossings, overlap, symmetry)',
      (winner.quality.overallScore - runnerUp.quality.overallScore) * WEIGHTS.quality,
    ],
  ];
  gaps.sort((a, b) => b[1] - a[1]);
  const [decisive, margin] = gaps[0];

  const shapeNote = shape.isTree
    ? 'the graph is a tree'
    : shape.isDAG
      ? 'the graph is acyclic'
      : `the graph has cycles (density ${shape.density.toFixed(2)})`;

  const because =
    margin > 0
      ? `it beat ${runnerUp.id} on ${decisive}`
      : `it edged out ${runnerUp.id} on the combined score`;

  return `Chose ${winner.id} (score ${winner.score} vs ${runnerUp.score}): ${because}. Context: ${shapeNote}${
    shape.hasDeclaredPorts ? ', nodes declare ports' : ''
  }${shape.hasEdgeLabels ? ', edges carry labels' : ''}.`;
}

// ---------------------------------------------------------------------------
// The selector
// ---------------------------------------------------------------------------

export interface AutoLayoutResult extends LayoutResult {
  /** Why this layout, and what the alternatives scored. */
  selection: LayoutSelectionReport;
}

/**
 * Run the bake-off and keep the best layout.
 *
 * IMPORTANT — this MUTATES node positions while it works: each candidate has to be
 * applied to the model before its quality can be measured (crossings are a
 * property of a drawn graph, not of a plan). The winner's positions are re-applied
 * at the end, so the model always lands on the layout we chose, never on the last
 * one we happened to try. `DiagramEngine.layout()` then commits them through
 * `setPosition()` as usual.
 */
export async function autoSelectLayout(
  diagram: DiagramModel,
  registry: LayoutRegistry,
  options: UnifiedLayoutOptions = {}
): Promise<AutoLayoutResult> {
  // Canonical input order — the Card 0 invariant. Without it the candidates see
  // different graphs on a reload and the "deterministic" selector picks differently.
  const nodes = [...diagram.getNodes()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const links = [...diagram.getLinks()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const shape = analyseGraphShape(nodes, links);

  // Above the bake-off limit, running every candidate would cost the SUM of the
  // field's runtimes — including whichever engine hangs at this scale. Classify
  // the structure and pick directly instead. (Below the limit, nothing changes:
  // the full measured bake-off runs exactly as before.)
  if (shape.nodeCount > BAKEOFF_NODE_LIMIT) {
    const plan = pickEngineForScale(shape, nodes, links, registry);
    if (plan) {
      return applyDirectPick(plan, shape, diagram, registry, nodes, links, options);
    }
  }

  const candidates = buildCandidates(shape, registry);

  if (candidates.length === 0) {
    throw new Error('Auto-layout: no candidate algorithms are registered.');
  }

  // Remember where everything started, so a failed candidate cannot leave the
  // model half-laid-out.
  const original = new Map(nodes.map((n) => [n.id, { x: n.position.x, y: n.position.y }]));
  const seed = options.seed ?? DEFAULT_LAYOUT_SEED;

  const raw: Array<Omit<CandidateScore, 'score'>> = [];
  const results = new Map<string, LayoutResult>();

  for (const candidate of candidates) {
    const engine = registry.get(candidate.name) as RegisteredLayout;

    try {
      // Every candidate gets the SAME seed. A candidate that won because it drew a
      // luckier random number is a candidate that will lose on the next reload.
      const result = await engine.apply(diagram, { ...options, ...candidate.options, seed });

      // Apply, then measure. Crossings and label collisions are properties of a
      // DRAWN graph — they cannot be read off a position map alone.
      applyPositions(nodes, result);
      raw.push(measure(candidate, nodes, links, result));
      results.set(candidate.id, result);
    } catch (error) {
      raw.push({
        id: candidate.id,
        name: candidate.name,
        options: candidate.options,
        quality: LayoutQualityMetrics.assess([], []),
        portRespect: 0,
        labelClearance: 0,
        bends: undefined,
        area: 0,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      restorePositions(nodes, original);
    }
  }

  const scored = scoreField(raw).sort(
    // Highest score wins; a tie breaks on candidate id, so the order is total and
    // the same graph always yields the same winner.
    (a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );

  const winner = scored.find((c) => !c.error);
  if (!winner) {
    throw new Error(
      `Auto-layout: every candidate failed. First error: ${scored[0]?.error ?? 'unknown'}`
    );
  }

  const winning = results.get(winner.id)!;
  applyPositions(nodes, winning);

  return {
    ...winning,
    metadata: {
      ...(winning.metadata ?? { algorithm: winner.name, executionTime: 0 }),
      algorithm: winner.name,
      autoSelected: winner.id,
    },
    selection: {
      chosen: winner.id,
      algorithm: winner.name,
      reason: explain(winner, scored, shape),
      shape,
      candidates: scored,
    },
  };
}

/**
 * The direct (no-bake-off) path: run the structurally-picked engine, score it on
 * a bounded sample so the report still shows its working, and fall through the
 * plan's alternates only if an engine actually fails.
 *
 * Deterministic by construction: the pick is a pure function of graph structure,
 * and the engine runs with the same fixed seed the bake-off would have used.
 */
async function applyDirectPick(
  plan: ScalePlan,
  shape: GraphShape,
  diagram: DiagramModel,
  registry: LayoutRegistry,
  nodes: NodeModel[],
  links: LinkModel[],
  options: UnifiedLayoutOptions
): Promise<AutoLayoutResult> {
  const seed = options.seed ?? DEFAULT_LAYOUT_SEED;
  const original = new Map(nodes.map((n) => [n.id, { x: n.position.x, y: n.position.y }]));
  const failures: CandidateScore[] = [];

  for (const candidate of plan.candidates) {
    const engine = registry.get(candidate.name) as RegisteredLayout;
    let result: LayoutResult;
    try {
      result = await engine.apply(diagram, { ...options, ...candidate.options, seed });
    } catch (error) {
      restorePositions(nodes, original);
      failures.push({
        id: candidate.id,
        name: candidate.name,
        options: candidate.options,
        score: 0,
        quality: LayoutQualityMetrics.assess([], []),
        portRespect: 0,
        labelClearance: 0,
        bends: undefined,
        area: 0,
        error: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    applyPositions(nodes, result);

    // Score on a bounded sample — the full-graph metrics are O(n²)/O(m²) and at
    // this scale would cost more than the layout did.
    const sample = sampleForMetrics(nodes, links);
    const [winner] = scoreField([measure(candidate, sample.nodes, sample.links, result)]);

    const reason =
      `Chose ${candidate.id} structurally, without a bake-off: ${plan.why}. ` +
      `${shape.nodeCount} nodes is above the ${BAKEOFF_NODE_LIMIT}-node bake-off limit` +
      (sample.sampled ? `; quality scored on a ${sample.nodes.length}-node sample.` : '.');

    return {
      ...result,
      metadata: {
        ...(result.metadata ?? { algorithm: candidate.name, executionTime: 0 }),
        algorithm: candidate.name,
        autoSelected: candidate.id,
      },
      selection: {
        chosen: candidate.id,
        algorithm: candidate.name,
        reason,
        shape,
        candidates: [winner, ...failures],
      },
    };
  }

  throw new Error(
    `Auto-layout: every structurally-picked engine failed. First error: ${
      failures[0]?.error ?? 'unknown'
    }`
  );
}

function applyPositions(nodes: NodeModel[], result: LayoutResult): void {
  for (const node of nodes) {
    const position = result.nodePositions.get(node.id);
    if (position) node.setPosition(position.x, position.y);
  }
}

function restorePositions(
  nodes: NodeModel[],
  original: Map<string, { x: number; y: number }>
): void {
  for (const node of nodes) {
    const position = original.get(node.id);
    if (position) node.setPosition(position.x, position.y);
  }
}
