/**
 * Dagre Layout Adapter
 *
 * Integrates the Dagre library for hierarchical graph layouts.
 * Supports multiple directions, ranking algorithms, and fine-tuned spacing controls.
 *
 * @see https://github.com/dagrejs/dagre
 */

import * as dagre from '@dagrejs/dagre';
import { NodeModel } from '../models/NodeModel';
import { LinkModel } from '../models/LinkModel';
import {
  LayoutAdapter,
  LayoutOptions,
  LayoutResult,
  LayoutRoutingHints,
} from './layout-adapter.interface';
import { linkLabelBox } from './port-label-bridge';
import { ConstraintManager } from './layout-constraints.interface';
import {
  IncrementalLayoutOptions,
  IncrementalLayoutResult,
  IncrementalLayoutManager,
} from './incremental-layout.interface';
import { LayoutQualityMetrics } from './layout-quality-metrics';
import { PortAwareLayoutManager, PortInfo } from './port-aware-layout.interface';
import { SubgraphLayoutManager } from './subgraph-layout.interface';
import { EdgeBundlingManager, EdgeInfo } from './edge-bundling.interface';

/**
 * Dagre-specific layout options
 */
export interface DagreLayoutOptions extends LayoutOptions {
  /** Layout direction */
  rankdir: 'TB' | 'BT' | 'LR' | 'RL';
  /** Alignment for rank nodes */
  align?: 'UL' | 'UR' | 'DL' | 'DR';
  /** Separation between adjacent nodes on the same rank (pixels) */
  nodesep: number;
  /** Separation between adjacent edges (pixels) */
  edgesep: number;
  /** Separation between ranks (pixels) */
  ranksep: number;
  /** Horizontal margin (pixels) */
  marginx: number;
  /** Vertical margin (pixels) */
  marginy: number;
  /** Acyclic strategy for breaking cycles */
  acyclicer?: 'greedy' | undefined;
  /** Algorithm for assigning ranks to nodes */
  ranker: 'network-simplex' | 'tight-tree' | 'longest-path';
  /**
   * DEEP-GRAPH FAST PATH — rank-count threshold (default 300).
   *
   * MEASURED pathology (2026-07): dagre 0.8.5's crossing-minimization phase
   * builds one layer graph PER RANK, and `buildLayerGraph` scans ALL of
   * `g.nodes()` each time — O(ranks × V), quadratic in depth (and dagre doubles
   * the rank count internally to make room for edge labels). A 1000-node chain
   * spends 865ms of its 955ms total inside `build-layer-graph`; a 2000-node
   * chain either hangs for >25s or dies outright with a stack overflow in
   * dagre's RECURSIVE `acyclic.js` dfs (recursion depth = chain length).
   * Switching `ranker` does NOT help: the rank phase is 31ms of the 955.
   *
   * So above this many ranks (estimated by an O(V+E) iterative, cycle-safe
   * longest-path pass) the adapter bypasses `dagre.layout` entirely and runs
   * its own linear hierarchical placement: longest-path ranks, barycenter
   * ordering sweeps, centered coordinates. Deep graphs have few nodes per rank,
   * which is exactly where that simple scheme matches dagre's quality — and
   * where dagre itself is unusable. Below the threshold nothing changes:
   * dagre runs with the configured `ranker` and produces identical output.
   *
   * Set to `Infinity` to force full dagre regardless of depth.
   */
  deepRankThreshold?: number;
}

/**
 * Default Dagre layout options
 */
const DEFAULT_DAGRE_OPTIONS: Omit<DagreLayoutOptions, keyof LayoutOptions> = {
  rankdir: 'TB',
  nodesep: 50,
  edgesep: 10,
  ranksep: 50,
  marginx: 0,
  marginy: 0,
  ranker: 'network-simplex',
  deepRankThreshold: 300,
};

const DEFAULT_DEEP_RANK_THRESHOLD = 300;

/** Longest-path ranks over the acyclic core of the graph (back edges dropped). */
interface DepthEstimate {
  /** node id -> rank (0-based; every node gets one) */
  rank: Map<string, number>;
  /** number of distinct ranks (maxRank + 1); 0 for an empty graph */
  rankCount: number;
}

/**
 * Estimate graph depth: longest-path ranks, O(V+E), fully ITERATIVE (dagre's
 * own recursive dfs is what stack-overflows on a 2000-chain — we must not
 * repeat that here). Cycle-safe: an explicit-stack DFS classifies back edges
 * (target currently on the DFS stack) and drops them, then Kahn's algorithm
 * assigns rank(v) = max(rank(pred) + 1) over the remaining DAG.
 */
function computeAcyclicLongestPathRanks(
  nodes: NodeModel[],
  links: LinkModel[]
): DepthEstimate {
  const n = nodes.length;
  const index = new Map<string, number>();
  nodes.forEach((node, i) => index.set(node.id, i));

  const out: number[][] = Array.from({ length: n }, () => []);
  links.forEach((link) => {
    if (!link.sourceNodeId || !link.targetNodeId) return;
    const s = index.get(link.sourceNodeId);
    const t = index.get(link.targetNodeId);
    if (s === undefined || t === undefined || s === t) return;
    out[s].push(t);
  });

  // Iterative DFS: keep tree/forward/cross edges, drop back edges.
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Uint8Array(n);
  const kept: number[][] = Array.from({ length: n }, () => []);
  const indeg = new Int32Array(n);
  const stackV: number[] = [];
  const stackI: number[] = [];
  for (let root = 0; root < n; root++) {
    if (color[root] !== WHITE) continue;
    color[root] = GRAY;
    stackV.push(root);
    stackI.push(0);
    while (stackV.length > 0) {
      const v = stackV[stackV.length - 1];
      const i = stackI[stackV.length - 1];
      if (i < out[v].length) {
        stackI[stackV.length - 1] = i + 1;
        const w = out[v][i];
        if (color[w] === GRAY) continue; // back edge — breaks the cycle
        kept[v].push(w);
        indeg[w]++;
        if (color[w] === WHITE) {
          color[w] = GRAY;
          stackV.push(w);
          stackI.push(0);
        }
      } else {
        color[v] = BLACK;
        stackV.pop();
        stackI.pop();
      }
    }
  }

  // Kahn's topological pass with longest-path relaxation.
  const rankArr = new Int32Array(n);
  const queue: number[] = [];
  for (let v = 0; v < n; v++) if (indeg[v] === 0) queue.push(v);
  let head = 0;
  let maxRank = 0;
  while (head < queue.length) {
    const v = queue[head++];
    for (const w of kept[v]) {
      if (rankArr[v] + 1 > rankArr[w]) {
        rankArr[w] = rankArr[v] + 1;
        if (rankArr[w] > maxRank) maxRank = rankArr[w];
      }
      if (--indeg[w] === 0) queue.push(w);
    }
  }

  const rank = new Map<string, number>();
  nodes.forEach((node, i) => rank.set(node.id, rankArr[i]));
  return { rank, rankCount: n === 0 ? 0 : maxRank + 1 };
}

/**
 * Dagre Layout Adapter
 *
 * Provides hierarchical layout using the Dagre library.
 * Converts between Grafloria's node/link model and Dagre's graph structure.
 */
export class DagreLayoutAdapter implements LayoutAdapter {
  readonly name = 'dagre';

  /**
   * Apply Dagre layout to nodes and links
   *
   * @param nodes - Nodes to layout
   * @param links - Links connecting the nodes
   * @param options - Dagre layout options
   * @returns Layout result with positions and metadata
   */
  async apply(
    nodes: NodeModel[],
    links: LinkModel[],
    options: Partial<DagreLayoutOptions> = {}
  ): Promise<LayoutResult> {
    const startTime = performance.now();

    // Merge default options with provided options
    const dagreOptions: DagreLayoutOptions = {
      ...DEFAULT_DAGRE_OPTIONS,
      ...options,
    } as DagreLayoutOptions;

    const labelAware = options.labelAware !== false;

    // DEEP-GRAPH FAST PATH decision — see DagreLayoutOptions.deepRankThreshold.
    // The estimate is O(V+E) and only runs when the threshold is finite.
    const threshold = dagreOptions.deepRankThreshold ?? DEFAULT_DEEP_RANK_THRESHOLD;
    const depth = Number.isFinite(threshold)
      ? computeAcyclicLongestPathRanks(nodes, links)
      : null;
    const useDeepFastPath = depth !== null && depth.rankCount > threshold;

    const core = useDeepFastPath
      ? this.runDeepFastPath(nodes, links, dagreOptions, labelAware, depth)
      : this.runDagre(nodes, links, dagreOptions, labelAware);

    const { nodePositions, nodeRanks, routing } = core;
    // The ranker that actually produced the ranks: the fast path IS a
    // longest-path ranking, whatever the configured dagre ranker was.
    const effectiveRanker = useDeepFastPath ? 'longest-path' : dagreOptions.ranker;

    // Apply layout constraints if provided
    if (options.constraints) {
      const constraintManager = new ConstraintManager(options.constraints);
      const conflictResolution = options.constraints.conflictResolution || 'priority';

      // Apply constraints to each node position
      nodePositions.forEach((position, nodeId) => {
        const constrainedPosition = constraintManager.applyConstraints(
          nodeId,
          position,
          conflictResolution
        );
        nodePositions.set(nodeId, constrainedPosition);
      });
    }

    // Calculate bounding box
    const bounds = this.calculateBounds(nodePositions, nodes);

    const endTime = performance.now();

    // Calculate quality metrics if requested
    let quality = undefined;
    if (options.calculateQuality) {
      // Apply positions to nodes temporarily for quality assessment
      nodes.forEach(node => {
        const newPos = nodePositions.get(node.id);
        if (newPos) {
          node.setPosition(newPos.x, newPos.y);
        }
      });

      quality = LayoutQualityMetrics.assess(nodes, links, {
        includeSuggestions: true,
        canvasDimensions: options.canvasDimensions,
      });
    }

    // Process port-aware layout if enabled (Phase 3)
    let portAware = undefined;
    if (options.portAware && options.portAware.enabled) {
      const nodeSizes = new Map<string, { width: number; height: number }>();
      nodes.forEach(node => {
        nodeSizes.set(node.id, {
          width: node.size.width || 150,
          height: node.size.height || 50,
        });
      });

      portAware = PortAwareLayoutManager.computePortLayout(
        options.portAware.ports || [],
        nodePositions,
        nodeSizes,
        links.map(link => ({
          sourcePortId: link.sourcePortId,
          targetPortId: link.targetPortId,
        })),
        options.portAware
      );
    }

    // Process subgraph layout if enabled (Phase 3)
    let subgraph = undefined;
    if (options.subgraph && options.subgraph.enabled && options.subgraph.groups) {
      const nodeSizes = new Map<string, { width: number; height: number }>();
      nodes.forEach(node => {
        nodeSizes.set(node.id, {
          width: node.size.width || 150,
          height: node.size.height || 50,
        });
      });

      // Convert NodeModel[] to generic node array
      const genericNodes = nodes.map(node => ({
        ...node
      }));

      const genericLinks = links.map(link => ({
        sourceNodeId: link.sourceNodeId || '',
        targetNodeId: link.targetNodeId || '',
        ...link
      }));

      subgraph = await SubgraphLayoutManager.computeSubgraphLayout(
        options.subgraph.groups,
        genericNodes,
        genericLinks,
        nodeSizes,
        this,
        options.subgraph
      );

      // If subgraph layout was performed, use those positions
      if (subgraph.nodePositions.size > 0) {
        // Replace node positions with subgraph positions
        subgraph.nodePositions.forEach((pos, nodeId) => {
          nodePositions.set(nodeId, { x: pos.x, y: pos.y });
        });

        // Update bounds
        bounds.x = subgraph.bounds.x;
        bounds.y = subgraph.bounds.y;
        bounds.width = subgraph.bounds.width;
        bounds.height = subgraph.bounds.height;
      }
    }

    // Process edge bundling if enabled (Phase 4)
    let edgeBundling = undefined;
    if (options.edgeBundling && options.edgeBundling.enabled) {
      // Convert links to EdgeInfo
      const edgeInfos: EdgeInfo[] = links.map(link => ({
        id: link.id,
        sourceNodeId: link.sourceNodeId || '',
        targetNodeId: link.targetNodeId || '',
        sourcePortId: link.sourcePortId,
        targetPortId: link.targetPortId,
        weight: 1,
      }));

      // Prepare node positions for bundling
      const bundlingNodePositions = new Map<string, { x: number; y: number }>();
      nodePositions.forEach((pos, nodeId) => {
        bundlingNodePositions.set(nodeId, { x: pos.x, y: pos.y });
      });

      // Prepare port positions if available
      const bundlingPortPositions = new Map<string, { x: number; y: number }>();
      if (portAware) {
        portAware.portPositions.forEach((pos, portId) => {
          // Port positions are relative, need to convert to absolute
          // For now, use node positions as approximation
          const portInfo = options.portAware?.ports?.find(p => p.id === portId);
          if (portInfo) {
            const nodePos = bundlingNodePositions.get(portInfo.nodeId);
            if (nodePos) {
              bundlingPortPositions.set(portId, {
                x: nodePos.x + pos.x,
                y: nodePos.y + pos.y,
              });
            }
          }
        });
      }

      // Compute edge bundling
      edgeBundling = EdgeBundlingManager.computeBundling(
        edgeInfos,
        bundlingNodePositions,
        bundlingPortPositions,
        options.edgeBundling
      );
    }

    return {
      nodePositions,
      bounds,
      metadata: {
        algorithm: 'dagre',
        direction: dagreOptions.rankdir,
        ranker: effectiveRanker,
        deepFastPath: useDeepFastPath,
        executionTime: endTime - startTime,
        nodeCount: nodes.length,
        linkCount: links.length,
        nodeRanks,  // NEW: Include hierarchical ranks for port assignment
        labelledEdges: routing.labelSpace.size,
      },
      quality,
      portAware,
      subgraph,
      edgeBundling,
      routing,
    };
  }

  /**
   * The classic path: hand the graph to `dagre.layout` and read positions,
   * ranks and edge polylines back. Behavior-identical to the pre-fast-path
   * adapter — shallow graphs must lay out byte-for-byte the same.
   */
  private runDagre(
    nodes: NodeModel[],
    links: LinkModel[],
    dagreOptions: DagreLayoutOptions,
    labelAware: boolean
  ): {
    nodePositions: Map<string, { x: number; y: number }>;
    nodeRanks: Map<string, number>;
    routing: LayoutRoutingHints;
  } {
    // Create dagre graph.
    //
    // MULTIGRAPH — Wave 7, Card 7. A plain `new dagre.graphlib.Graph()` is NOT a
    // multigraph: `setEdge(a, b)` keyed only by its endpoints, so two parallel
    // links A→B silently COLLAPSED into one. Dagre then ranked the graph as if
    // the second edge did not exist, and — now that edges carry label boxes —
    // would have reserved room for one label where two were needed. Keying each
    // edge by its link id keeps them distinct and lets the route be read back
    // per link.
    const g = new dagre.graphlib.Graph({ multigraph: true });

    // Set graph-level options
    g.setGraph({
      rankdir: dagreOptions.rankdir,
      align: dagreOptions.align,
      nodesep: dagreOptions.nodesep,
      edgesep: dagreOptions.edgesep,
      ranksep: dagreOptions.ranksep,
      marginx: dagreOptions.marginx,
      marginy: dagreOptions.marginy,
      acyclicer: dagreOptions.acyclicer,
      ranker: dagreOptions.ranker,
    });

    g.setDefaultEdgeLabel(() => ({}));

    // Add nodes to dagre graph
    nodes.forEach((node) => {
      g.setNode(node.id, {
        width: node.size.width || 150,
        height: node.size.height || 50,
        // Store original node for reference
        nodeModel: node,
      });
    });

    // Add edges to dagre graph.
    //
    // LABEL-AWARE — Wave 7, Card 7. Dagre reserves space for an edge label when
    // the edge carries a `width`/`height`: it ranks the label as a dummy node, so
    // the channel between ranks genuinely widens to fit it. Before this, every
    // layout packed the ranks as though edges were bare lines, and the renderer's
    // edge optimizer was then asked to place a label into a gap that layout had
    // never left. Placement is still the optimizer's job — this is the reservation.
    links.forEach((link) => {
      if (!link.sourceNodeId || !link.targetNodeId) return;

      const box = labelAware ? linkLabelBox(link) : undefined;
      const edgeLabel = box
        ? { width: box.width, height: box.height, labelpos: 'c' as const }
        : {};

      g.setEdge(link.sourceNodeId, link.targetNodeId, edgeLabel, link.id);
    });

    // Run dagre layout algorithm
    dagre.layout(g);

    // Extract positions from dagre graph
    const nodePositions = new Map<string, { x: number; y: number }>();

    // Extract ranks for port assignment (hierarchical layer information)
    const nodeRanks = new Map<string, number>();

    g.nodes().forEach((nodeId: string) => {
      const node = g.node(nodeId);
      if (node) {
        // Dagre returns center position, convert to top-left corner
        nodePositions.set(nodeId, {
          x: node.x - (node.width || 0) / 2,
          y: node.y - (node.height || 0) / 2,
        });

        // Extract rank (hierarchical layer) - used for port side selection
        // Rank represents the layer in the hierarchy (0 = first layer, 1 = second, etc.)
        // Note: rank property exists at runtime but not in TypeScript types
        const nodeWithRank = node as any;
        if (nodeWithRank.rank !== undefined) {
          nodeRanks.set(nodeId, nodeWithRank.rank);
        }
      }
    });

    // Read back the polyline dagre computed for each edge — Wave 7, Card 7.
    // Dagre has always produced `edge.points`, and the adapter has always thrown
    // them away (the same bug shape as ELK's discarded sections). They are hints:
    // the wave-5 routing engine still owns the final path.
    const routing: LayoutRoutingHints = {
      portPositions: new Map(),
      edgeRoutes: new Map(),
      labelSpace: new Map(),
      orthogonal: false, // dagre emits a polyline, not an orthogonal route
    };

    links.forEach((link) => {
      if (!link.sourceNodeId || !link.targetNodeId) return;

      const edge = g.edge({ v: link.sourceNodeId, w: link.targetNodeId, name: link.id }) as
        | { points?: Array<{ x: number; y: number }> }
        | undefined;
      const points = edge?.points ?? [];
      if (points.length >= 2) {
        routing.edgeRoutes.set(link.id, {
          start: { x: points[0].x, y: points[0].y },
          end: { x: points[points.length - 1].x, y: points[points.length - 1].y },
          bends: points.slice(1, -1).map((p) => ({ x: p.x, y: p.y })),
        });
      }

      const box = labelAware ? linkLabelBox(link) : undefined;
      if (box) routing.labelSpace.set(link.id, { width: box.width, height: box.height });
    });

    return { nodePositions, nodeRanks, routing };
  }

  /**
   * DEEP-GRAPH FAST PATH — O(V + E) hierarchical placement for graphs whose
   * rank count exceeds `deepRankThreshold`, where `dagre.layout` goes quadratic
   * (or stack-overflows — see the option's doc comment for the measurements).
   *
   * Longest-path ranks (already computed for the depth estimate), a few
   * deterministic barycenter ordering sweeps, then centered coordinates:
   * each rank is centered on the cross axis, ranks advance by
   * max-node-extent + ranksep (+ reserved label space when labelAware).
   * A deep chain comes out as dagre would draw it: one straight centered
   * column, `ranksep` apart.
   */
  private runDeepFastPath(
    nodes: NodeModel[],
    links: LinkModel[],
    opts: DagreLayoutOptions,
    labelAware: boolean,
    depth: DepthEstimate
  ): {
    nodePositions: Map<string, { x: number; y: number }>;
    nodeRanks: Map<string, number>;
    routing: LayoutRoutingHints;
  } {
    const horizontal = opts.rankdir === 'LR' || opts.rankdir === 'RL';
    const widthOf = (node: NodeModel) => node.size.width || 150;
    const heightOf = (node: NodeModel) => node.size.height || 50;
    // Extent along the rank axis / cross axis, per rankdir.
    const rankExtentOf = horizontal ? widthOf : heightOf;
    const crossExtentOf = horizontal ? heightOf : widthOf;

    const routing: LayoutRoutingHints = {
      portPositions: new Map(),
      edgeRoutes: new Map(),
      labelSpace: new Map(),
      orthogonal: false,
    };

    // ---- Layers (input order within a rank = deterministic initial order) ----
    const layers: NodeModel[][] = [];
    for (let r = 0; r < depth.rankCount; r++) layers.push([]);
    if (layers.length === 0 && nodes.length > 0) layers.push([]);
    nodes.forEach((node) => {
      layers[depth.rank.get(node.id) ?? 0].push(node);
    });

    // ---- Undirected adjacency for barycenter sweeps ----
    const neighbors = new Map<string, string[]>();
    nodes.forEach((node) => neighbors.set(node.id, []));
    links.forEach((link) => {
      if (!link.sourceNodeId || !link.targetNodeId) return;
      if (link.sourceNodeId === link.targetNodeId) return;
      const s = neighbors.get(link.sourceNodeId);
      const t = neighbors.get(link.targetNodeId);
      if (!s || !t) return;
      s.push(link.targetNodeId);
      t.push(link.sourceNodeId);
    });

    // ---- Barycenter ordering: 4 alternating sweeps over normalized positions.
    // Everything is deterministic: input order seeds the layers, Array.sort is
    // stable, ties keep their order. No RNG => same input, same result.
    const pos = new Map<string, number>(); // normalized [0..1] position in layer
    const refresh = (layer: NodeModel[]) => {
      layer.forEach((node, i) => {
        pos.set(node.id, layer.length > 1 ? i / (layer.length - 1) : 0.5);
      });
    };
    layers.forEach(refresh);
    const SWEEPS = 4;
    for (let s = 0; s < SWEEPS; s++) {
      const ordered = s % 2 === 0 ? layers : [...layers].reverse();
      for (const layer of ordered) {
        if (layer.length < 2) continue;
        const bary = new Map<string, number>();
        layer.forEach((node) => {
          const ns = neighbors.get(node.id) ?? [];
          if (ns.length === 0) {
            bary.set(node.id, pos.get(node.id) ?? 0.5);
            return;
          }
          let sum = 0;
          ns.forEach((id) => (sum += pos.get(id) ?? 0.5));
          bary.set(node.id, sum / ns.length);
        });
        layer.sort((a, b) => (bary.get(a.id) ?? 0.5) - (bary.get(b.id) ?? 0.5));
        refresh(layer);
      }
    }

    // ---- Label space reservation (the dagre path reserves via dummy ranks;
    // here we widen the gap after the label's source rank) ----
    const gapExtra = new Array<number>(Math.max(layers.length - 1, 0)).fill(0);
    links.forEach((link) => {
      if (!link.sourceNodeId || !link.targetNodeId) return;
      const box = labelAware ? linkLabelBox(link) : undefined;
      if (!box) return;
      routing.labelSpace.set(link.id, { width: box.width, height: box.height });
      const rs = depth.rank.get(link.sourceNodeId);
      const rt = depth.rank.get(link.targetNodeId);
      if (rs === undefined || rt === undefined || rs === rt) return;
      const gap = Math.min(rs, rt);
      const extent = horizontal ? box.width : box.height;
      if (gap >= 0 && gap < gapExtra.length) {
        gapExtra[gap] = Math.max(gapExtra[gap], extent);
      }
    });

    // ---- Rank-axis positions ----
    const rankCenter: number[] = [];
    let cursor = 0;
    layers.forEach((layer, r) => {
      const thickness = layer.reduce((m, node) => Math.max(m, rankExtentOf(node)), 0);
      rankCenter[r] = cursor + thickness / 2;
      cursor += thickness + opts.ranksep + (gapExtra[r] ?? 0);
    });
    const totalRankExtent = layers.length > 0 ? cursor - opts.ranksep : 0;

    // ---- Cross-axis positions: each layer packed with nodesep, centered on 0 ----
    const centers = new Map<string, { rank: number; cross: number }>();
    layers.forEach((layer, r) => {
      const sizes = layer.map(crossExtentOf);
      const total =
        sizes.reduce((a, b) => a + b, 0) + opts.nodesep * Math.max(layer.length - 1, 0);
      let c = -total / 2;
      layer.forEach((node, i) => {
        centers.set(node.id, { rank: rankCenter[r], cross: c + sizes[i] / 2 });
        c += sizes[i] + opts.nodesep;
      });
    });

    // ---- Map (rank, cross) -> (x, y) per rankdir; emit top-left corners ----
    const nodePositions = new Map<string, { x: number; y: number }>();
    nodes.forEach((node) => {
      const c = centers.get(node.id)!;
      let cx: number;
      let cy: number;
      switch (opts.rankdir) {
        case 'BT':
          cx = c.cross;
          cy = totalRankExtent - c.rank;
          break;
        case 'LR':
          cx = c.rank;
          cy = c.cross;
          break;
        case 'RL':
          cx = totalRankExtent - c.rank;
          cy = c.cross;
          break;
        default: // TB
          cx = c.cross;
          cy = c.rank;
      }
      nodePositions.set(node.id, {
        x: cx - widthOf(node) / 2,
        y: cy - heightOf(node) / 2,
      });
    });

    // Translate so the top-left of the drawing sits at (marginx, marginy),
    // mirroring dagre's translateGraph.
    if (nodePositions.size > 0) {
      let minX = Infinity;
      let minY = Infinity;
      nodePositions.forEach((p) => {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
      });
      const dx = (opts.marginx || 0) - minX;
      const dy = (opts.marginy || 0) - minY;
      nodePositions.forEach((p) => {
        p.x += dx;
        p.y += dy;
      });
    }

    // ---- Straight-line edge route hints (routing engine owns the final path) ----
    const nodeById = new Map<string, NodeModel>();
    nodes.forEach((node) => nodeById.set(node.id, node));
    links.forEach((link) => {
      if (!link.sourceNodeId || !link.targetNodeId) return;
      const sp = nodePositions.get(link.sourceNodeId);
      const tp = nodePositions.get(link.targetNodeId);
      const sn = nodeById.get(link.sourceNodeId);
      const tn = nodeById.get(link.targetNodeId);
      if (!sp || !tp || !sn || !tn) return;
      routing.edgeRoutes.set(link.id, {
        start: { x: sp.x + widthOf(sn) / 2, y: sp.y + heightOf(sn) / 2 },
        end: { x: tp.x + widthOf(tn) / 2, y: tp.y + heightOf(tn) / 2 },
        bends: [],
      });
    });

    return { nodePositions, nodeRanks: new Map(depth.rank), routing };
  }

  /**
   * Validate Dagre layout options
   *
   * @param options - Options to validate
   * @returns true if valid, false otherwise
   */
  validateOptions(options: Partial<DagreLayoutOptions>): boolean {
    // Validate rankdir
    if (options.rankdir && !['TB', 'BT', 'LR', 'RL'].includes(options.rankdir)) {
      return false;
    }

    // Validate align
    if (options.align && !['UL', 'UR', 'DL', 'DR'].includes(options.align)) {
      return false;
    }

    // Validate ranker
    if (
      options.ranker &&
      !['network-simplex', 'tight-tree', 'longest-path'].includes(options.ranker)
    ) {
      return false;
    }

    // Validate acyclicer
    if (options.acyclicer !== undefined && options.acyclicer !== 'greedy') {
      return false;
    }

    // Validate numeric options are positive
    if (options.nodesep !== undefined && options.nodesep < 0) {
      return false;
    }
    if (options.edgesep !== undefined && options.edgesep < 0) {
      return false;
    }
    if (options.ranksep !== undefined && options.ranksep < 0) {
      return false;
    }

    // Validate deep-graph threshold (Infinity allowed = "never fast-path")
    if (
      options.deepRankThreshold !== undefined &&
      (typeof options.deepRankThreshold !== 'number' ||
        Number.isNaN(options.deepRankThreshold) ||
        options.deepRankThreshold < 0)
    ) {
      return false;
    }

    return true;
  }

  /**
   * Calculate bounding box for all laid-out nodes
   *
   * @param positions - Map of node positions
   * @param nodes - Array of nodes
   * @returns Bounding box
   */
  private calculateBounds(
    positions: Map<string, { x: number; y: number }>,
    nodes: NodeModel[]
  ): { x: number; y: number; width: number; height: number } {
    if (positions.size === 0) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    // Map lookup, not nodes.find: the old per-position `nodes.find` scan made
    // bounds O(V²) — measurable dead weight on the very graphs (1-2k nodes)
    // this adapter now handles.
    const nodeById = new Map<string, NodeModel>();
    nodes.forEach((node) => nodeById.set(node.id, node));

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    positions.forEach((pos, nodeId) => {
      const node = nodeById.get(nodeId);
      if (node) {
        const width = node.size.width || 150;
        const height = node.size.height || 50;

        minX = Math.min(minX, pos.x);
        minY = Math.min(minY, pos.y);
        maxX = Math.max(maxX, pos.x + width);
        maxY = Math.max(maxY, pos.y + height);
      }
    });

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  /**
   * Apply incremental layout - layout new nodes while preserving existing positions
   *
   * @param nodes - Array of all nodes (existing + new)
   * @param links - Array of all links
   * @param incrementalOptions - Options for incremental layout
   * @param layoutOptions - Base layout options
   * @returns Layout result with positions and incremental statistics
   */
  async applyIncremental(
    nodes: NodeModel[],
    links: LinkModel[],
    incrementalOptions: IncrementalLayoutOptions,
    layoutOptions?: Partial<DagreLayoutOptions>
  ): Promise<LayoutResult & { incremental: IncrementalLayoutResult }> {
    // Store original positions for movement calculation
    const oldPositions = new Map<string, { x: number; y: number }>();
    nodes.forEach(node => {
      const pos = node.position;
      oldPositions.set(node.id, { x: pos.x, y: pos.y });
    });

    // Identify new nodes
    const newNodeIds = IncrementalLayoutManager.identifyNewNodes(nodes, incrementalOptions);
    const strategy = incrementalOptions.strategy || 'pin-existing';

    // Generate constraints based on strategy
    const generatedConstraints = IncrementalLayoutManager.generateConstraints(
      nodes,
      incrementalOptions
    );

    // Merge layout options with generated constraints
    const mergedOptions: Partial<DagreLayoutOptions> = {
      ...layoutOptions,
      constraints: generatedConstraints,
    };

    // Apply normal layout with constraints
    const layoutResult = await this.apply(nodes, links, mergedOptions);

    // Calculate incremental statistics
    const incrementalResult = IncrementalLayoutManager.calculateResult(
      nodes,
      oldPositions,
      newNodeIds,
      generatedConstraints,
      strategy
    );

    // Return combined result
    return {
      ...layoutResult,
      incremental: incrementalResult,
    };
  }
}
