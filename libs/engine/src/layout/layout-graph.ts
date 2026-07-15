// Wave 7 (Auto-layout) — Card 3: the wire format for off-thread layout.
//
// A layout that runs behind a postMessage boundary cannot be handed NodeModel
// instances: structured clone rejects class instances with methods, event
// emitters and (in NodeModel's case) a back-reference to the whole diagram. So
// the graph crosses the boundary as PLAIN DATA and is revived on the other side.
//
// WHAT CROSSES, AND WHY THAT IS EXACTLY ENOUGH
// --------------------------------------------
// Every algorithm registered in the Card 0 registry (dagre, elk, force,
// spectral, community) was audited for what it actually reads off a model. The
// complete list is:
//
//     node.id, node.position, node.size
//     link.id, link.sourceNodeId, link.targetNodeId,
//     link.sourcePortId, link.targetPortId
//
// — geometry and topology, nothing else. So that is what the wire format
// carries. This is not a guess; it is the grep.
//
// `node.data` is deliberately NOT carried. It holds arbitrary application
// payloads, and application payloads routinely contain functions, class
// instances or DOM references — all of which throw DataCloneError the moment a
// real Worker is handed one. Since no layout algorithm reads it, carrying it
// would buy nothing and would turn "you used a worker" into a production crash
// for anyone whose node data is not clonable.
//
// Ports ARE carried, with their ids preserved. NodeModel auto-creates four
// default ports in its constructor with FRESH ids, so a naive revive would hand
// the algorithm a node whose port ids no longer match the `sourcePortId` on the
// links pointing at it — referential integrity silently broken, and port-aware
// layout quietly wrong. Reviving replaces the auto-created ports with the real
// ones.

import { NodeModel } from '../models/NodeModel';
import { LinkModel } from '../models/LinkModel';
import { PortModel } from '../models/PortModel';
import { inStableOrder } from './rng';

/** A port, as it crosses the boundary. Ids are preserved — see above. */
export interface LayoutGraphPort {
  id: string;
  type: 'input' | 'output' | 'bi';
  side?: 'left' | 'right' | 'top' | 'bottom';
  /** Order within a side — carried so multi-port sides revive in the same order. */
  index?: number;
  position?: { x: number; y: number };
}

/** A node, as it crosses the boundary: geometry + topology only. */
export interface LayoutGraphNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  /** Container membership — the nested-layout card needs it; harmless otherwise. */
  parentId?: string;
  /**
   * wave13: how `position` relates to the parent. Absent on pre-v3 payloads, which meant
   * summation — i.e. 'relative'; the consumer below applies exactly that default.
   */
  positionMode?: 'absolute' | 'relative' | 'layout';
  ports?: LayoutGraphPort[];
}

/** A link, as it crosses the boundary. */
export interface LayoutGraphLink {
  id: string;
  sourceNodeId?: string;
  targetNodeId?: string;
  sourcePortId?: string;
  targetPortId?: string;
}

/** A whole graph, structured-clone-safe: no functions, no class instances. */
export interface LayoutGraph {
  nodes: LayoutGraphNode[];
  links: LayoutGraphLink[];
}

/**
 * Freeze a live graph into the wire format.
 *
 * Emits nodes and links in CANONICAL (id-sorted) order — the same discipline
 * Card 0 established in `fromAdapter`. Determinism needs both halves: a seeded
 * PRNG *and* a stable input order. Serialising in map-iteration order would
 * quietly reintroduce the divergence Card 0 just removed, because an authored
 * diagram and the same diagram loaded from JSON do not iterate alike.
 */
export function serializeGraph(nodes: NodeModel[], links: LinkModel[]): LayoutGraph {
  return {
    nodes: inStableOrder(nodes).map((node) => ({
      id: node.id,
      type: node.type,
      position: { x: node.position.x, y: node.position.y },
      size: { width: node.size.width, height: node.size.height },
      ...(node.parentId
        ? { parentId: node.parentId, positionMode: node.positionMode }
        : {}),
      ports: node.getPorts().map((port) => ({
        id: port.id,
        type: port.type,
        ...(port.side ? { side: port.side } : {}),
        ...(port.index !== undefined ? { index: port.index } : {}),
        ...(port.position
          ? { position: { x: port.position.x, y: port.position.y } }
          : {}),
      })),
    })),
    links: inStableOrder(links).map((link) => ({
      id: link.id,
      sourceNodeId: link.sourceNodeId,
      targetNodeId: link.targetNodeId,
      sourcePortId: link.sourcePortId,
      targetPortId: link.targetPortId,
    })),
  };
}

/**
 * Rebuild live models from the wire format, on whichever thread we landed on.
 *
 * The revived models are THROWAWAY: the algorithm mutates them, we read the
 * positions out of the result, and the engine commits those positions onto the
 * REAL nodes via `setPosition()` so the spatial index and the routing obstacle
 * map see the move. Nothing that happens to these copies escapes.
 */
export function reviveGraph(graph: LayoutGraph): {
  nodes: NodeModel[];
  links: LinkModel[];
} {
  const nodes = graph.nodes.map((serialized) => {
    const node = new NodeModel({
      id: serialized.id,
      type: serialized.type,
      position: { ...serialized.position },
      size: { ...serialized.size },
    });

    if (serialized.parentId) {
      node.parentId = serialized.parentId;
      // wave13: carry the positioning semantics with the relationship. A payload that
      // predates positionMode-on-parents meant summation, i.e. 'relative' — the same
      // default the v2→v3 document migration applies. Without this, the ephemeral layout
      // copy would default to 'absolute' and getBoundingBox() would place parented nodes
      // differently here than in the live model.
      node.positionMode = serialized.positionMode ?? 'relative';
    }

    // Replace the four auto-created default ports with the real ones, ids
    // intact — otherwise every link's sourcePortId/targetPortId dangles.
    if (serialized.ports) {
      for (const existing of node.getPorts()) {
        node.removePort(existing.id);
      }
      for (const port of serialized.ports) {
        node.addPort(
          new PortModel({
            id: port.id,
            type: port.type,
            ...(port.side ? { side: port.side } : {}),
            ...(port.index !== undefined ? { index: port.index } : {}),
            ...(port.position ? { position: { ...port.position } } : {}),
          })
        );
      }
    }

    return node;
  });

  const links = graph.links.map((serialized) => {
    const link = new LinkModel(
      serialized.sourcePortId ?? '',
      serialized.targetPortId ?? ''
    );
    // `id` is readonly on DiagramEntity and LinkModel's constructor takes none,
    // so a revived link would otherwise get a fresh random id and the result
    // could not be keyed back to the original. Same cast DiagramEntity itself
    // uses when rehydrating from JSON.
    (link as unknown as { id: string }).id = serialized.id;
    link.sourceNodeId = serialized.sourceNodeId;
    link.targetNodeId = serialized.targetNodeId;
    return link;
  });

  return { nodes, links };
}
