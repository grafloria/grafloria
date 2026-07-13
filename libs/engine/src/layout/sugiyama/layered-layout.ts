// Wave 7 (Auto-layout) — Cards 1 & 5: the layered engine, registered.
//
// This is what `engine.layout()` runs when you do not name an algorithm — the
// zero-config default Card 1 asks for. It is also the ONLY engine that can honour
// Card 5's semantic constraints, because those are decisions taken during ranking
// and ordering (see sugiyama.ts), and no amount of post-processing can recover
// them once you are holding coordinates.

import type { DiagramModel } from '../../models/DiagramModel';
import type { LayoutResult } from '../layout-adapter.interface';
import type { RegisteredLayout, UnifiedLayoutOptions } from '../layout-registry';
import {
  sugiyama,
  inferDirection,
  type LayoutDirection,
  type SemanticConstraints,
  type SugiyamaEdge,
  type SugiyamaNode,
} from './sugiyama';

export interface LayeredLayoutOptions extends UnifiedLayoutOptions {
  /** Card 5. Honoured DURING ranking/ordering — not clamped afterwards. */
  semantic?: SemanticConstraints;
  /** Ordering/coordinate sweeps. */
  iterations?: number;
}

/** Read the graph out of the model in the shape sugiyama wants. */
function readGraph(diagram: DiagramModel): { nodes: SugiyamaNode[]; edges: SugiyamaEdge[] } {
  const nodes: SugiyamaNode[] = diagram.getNodes().map((n) => ({
    id: n.id,
    width: n.size.width,
    height: n.size.height,
  }));

  const edges: SugiyamaEdge[] = [];
  for (const link of diagram.getLinks()) {
    const source = link.sourceNodeId ?? diagram.getNodeByPortId?.(link.sourcePortId)?.id;
    const target = link.targetNodeId ?? diagram.getNodeByPortId?.(link.targetPortId)?.id;
    if (!source || !target) continue;
    edges.push({ id: link.id, source, target });
  }
  return { nodes, edges };
}

export function createLayeredLayout(name = 'layered'): RegisteredLayout {
  return {
    name,
    async apply(diagram: DiagramModel, options: UnifiedLayoutOptions): Promise<LayoutResult> {
      const opts = options as LayeredLayoutOptions;
      const { nodes, edges } = readGraph(diagram);

      // Card 1: zero configuration. If the caller did not pick a direction, infer
      // one — a deep, narrow graph is a pipeline and reads better left-to-right; a
      // wide, shallow one is a tree and reads better top-to-bottom.
      const direction: LayoutDirection = opts.direction ?? inferDirection(nodes, edges);

      const started = Date.now();
      const result = sugiyama(nodes, edges, {
        direction,
        nodeSpacing: opts.nodeSpacing,
        rankSpacing: opts.rankSpacing,
        constraints: opts.semantic,
        iterations: opts.iterations,
      });

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const n of nodes) {
        const p = result.positions.get(n.id);
        if (!p) continue;
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x + n.width);
        maxY = Math.max(maxY, p.y + n.height);
      }
      if (!Number.isFinite(minX)) {
        minX = minY = maxX = maxY = 0;
      }

      return {
        nodePositions: result.positions,
        bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
        metadata: {
          algorithm: name,
          executionTime: Date.now() - started,
          direction,
          crossings: result.crossings,
          ranks: result.ranks,
          bends: result.bends,
        },
      };
    },
  };
}
