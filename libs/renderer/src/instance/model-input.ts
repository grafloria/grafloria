import { LinkModel, NodeModel, PortModel } from '@grafloria/engine';
import type { DiagramModel, LinkStyle, NodeStyle } from '@grafloria/engine';

/**
 * Spec → model: the input layer every wrapper shares.
 *
 * A React/Vue/web-component host hands the diagram PLAIN DATA (`nodes`, `edges`)
 * — the React-Flow shape everyone already knows — and expects the library to
 * reconcile it against the live model. That reconciliation is diagram logic, not
 * framework logic, so it lives here and NOT in the wrappers.
 *
 * ## Determinism (Card 6 — SSR + hydration)
 *
 * The server and the client each build their own `DiagramEngine` from the SAME
 * spec, and the two VNode trees must come out byte-identical or hydration would
 * flash. Two sources of randomness had to go:
 *
 * 1. **Node / edge ids.** A spec entry without an `id` gets `node-<index>` /
 *    `edge-<index>`, never a nanoid.
 * 2. **Port ids.** `new NodeModel(...)` auto-creates four default ports whose ids
 *    are nanoids, and the renderer emits them as VNode keys (`port-<id>`). Two
 *    processes would therefore disagree on every port key. {@link buildNode}
 *    replaces those four ports with deterministic ones — `<nodeId>__top`,
 *    `__right`, `__bottom`, `__left` — which also gives edges a stable, readable
 *    handle name (`sourceHandle: 'right'`) instead of an opaque generated id.
 */

/** A port on a node. Omit `id` to get the deterministic `<nodeId>__<side>` name. */
export interface PortSpec {
  id?: string;
  side: 'top' | 'right' | 'bottom' | 'left';
  type?: 'input' | 'output' | 'bi';
  index?: number;
}

/** A node, as a host hands it in. */
export interface NodeSpec {
  id?: string;
  /** Engine node type. Default `'rect'`. */
  type?: string;
  position: { x: number; y: number };
  size?: { width: number; height: number };
  /** Free-form user payload — passed straight to custom node components. */
  data?: Record<string, any>;
  /** Convenience for `metadata.label`. */
  label?: string;
  /** Convenience for `metadata.shape` (fill / stroke / cornerRadius / …). */
  shape?: Record<string, any>;
  style?: Partial<NodeStyle>;
  selected?: boolean;
  draggable?: boolean;
  selectable?: boolean;
  /**
   * Render this node through the host's custom-node callback (React component,
   * slotted template, …) instead of as SVG. Sets `metadata.useHTMLLayer`.
   */
  custom?: boolean;
  /** Ports. Omit to keep the four deterministic defaults. */
  ports?: PortSpec[];
  /** Anything else you want on `node.metadata`. */
  metadata?: Record<string, any>;
}

/** An edge, as a host hands it in. Node-to-node, like React Flow. */
export interface EdgeSpec {
  id?: string;
  /** Source NODE id (a port id also resolves, for full control). */
  source: string;
  /** Target NODE id. */
  target: string;
  /** Port id, or a bare side name (`'right'`). Default: the source's right port. */
  sourceHandle?: string;
  /** Port id, or a bare side name (`'left'`). Default: the target's left port. */
  targetHandle?: string;
  type?: 'direct' | 'smooth' | 'orthogonal' | 'bezier';
  label?: string;
  style?: Partial<LinkStyle>;
  selected?: boolean;
  data?: Record<string, any>;
}

export const PORT_SIDES = ['top', 'right', 'bottom', 'left'] as const;

/** The deterministic id of a node's default port on `side`. */
export function defaultPortId(nodeId: string, side: (typeof PORT_SIDES)[number]): string {
  return `${nodeId}__${side}`;
}

/** Stable id for the nth node of a spec list. */
export function nodeSpecId(spec: NodeSpec, index: number): string {
  return spec.id ?? `node-${index}`;
}

/** Stable id for the nth edge of a spec list. */
export function edgeSpecId(spec: EdgeSpec, index: number): string {
  return spec.id ?? `edge-${index}`;
}

/** True for a live `NodeModel` (vs a plain spec object). */
export function isNodeModel(value: unknown): value is NodeModel {
  return value instanceof NodeModel;
}

/** True for a live `LinkModel`. */
export function isLinkModel(value: unknown): value is LinkModel {
  return value instanceof LinkModel;
}

/** Build a fresh `NodeModel` from a spec, with deterministic ports. */
export function buildNode(spec: NodeSpec, index: number): NodeModel {
  const id = nodeSpecId(spec, index);

  const node = new NodeModel({
    id,
    type: spec.type ?? 'rect',
    position: { ...spec.position },
    size: spec.size ? { ...spec.size } : undefined,
  });

  // Swap the nanoid-keyed auto-ports for deterministic ones (see the module doc).
  node.ports.clear();
  const ports: PortSpec[] =
    spec.ports ?? PORT_SIDES.map((side) => ({ side, type: 'bi' as const, index: 0 }));
  for (const port of ports) {
    node.addPort(
      new PortModel({
        id: port.id ?? defaultPortId(id, port.side),
        type: port.type ?? 'bi',
        side: port.side,
        index: port.index ?? 0,
      })
    );
  }

  applyNodeSpec(node, spec);
  return node;
}

/** Apply the mutable parts of a spec onto an existing node (the update path). */
export function applyNodeSpec(node: NodeModel, spec: NodeSpec): void {
  if (node.position.x !== spec.position.x || node.position.y !== spec.position.y) {
    node.setPosition(spec.position.x, spec.position.y);
  }
  if (spec.size && (node.size.width !== spec.size.width || node.size.height !== spec.size.height)) {
    node.setSize(spec.size.width, spec.size.height);
  }

  if (spec.data) node.data = { ...spec.data };
  if (spec.style) node.style = { ...node.style, ...spec.style };
  if (spec.label !== undefined) node.setMetadata('label', spec.label);
  if (spec.shape !== undefined) node.setMetadata('shape', spec.shape);
  if (spec.custom !== undefined) node.setMetadata('useHTMLLayer', spec.custom);
  if (spec.metadata) {
    for (const [key, value] of Object.entries(spec.metadata)) node.setMetadata(key, value);
  }

  if (spec.draggable !== undefined) node.behavior.draggable = spec.draggable;
  if (spec.selectable !== undefined) node.behavior.selectable = spec.selectable;
  if (spec.selected !== undefined && spec.selected !== node.isSelected()) {
    node.setSelected(spec.selected);
  }
}

/**
 * Resolve an edge endpoint to a PORT id.
 * Accepts (in order): an explicit port id, a side name, or the node's default
 * port for `fallbackSide`. Returns undefined when the node does not exist.
 */
export function resolvePortId(
  diagram: DiagramModel,
  nodeOrPortId: string,
  handle: string | undefined,
  fallbackSide: (typeof PORT_SIDES)[number]
): string | undefined {
  const node = diagram.getNode(nodeOrPortId);

  if (!node) {
    // `source` may itself be a port id (full-control escape hatch).
    return diagram.getPortById(nodeOrPortId) ? nodeOrPortId : undefined;
  }

  if (handle) {
    if (node.getPort(handle)) return handle;
    if ((PORT_SIDES as readonly string[]).includes(handle)) {
      const port = node.getPortBySide(handle as (typeof PORT_SIDES)[number]);
      if (port) return port.id;
    }
    // An unknown handle name is a caller error; fall through to the default side
    // rather than silently dropping the edge.
  }

  return node.getPortBySide(fallbackSide)?.id;
}

/** Build a fresh `LinkModel` from a spec. Returns null when an endpoint is unresolvable. */
export function buildEdge(
  diagram: DiagramModel,
  spec: EdgeSpec,
  index: number
): LinkModel | null {
  const sourcePortId = resolvePortId(diagram, spec.source, spec.sourceHandle, 'right');
  const targetPortId = resolvePortId(diagram, spec.target, spec.targetHandle, 'left');
  if (!sourcePortId || !targetPortId) return null;

  const link = new LinkModel(sourcePortId, targetPortId, spec.type ?? 'smooth');
  // LinkModel's id is generated; force the deterministic one so SSR and the
  // client agree on the `link-<id>` VNode key.
  (link as { id: string }).id = edgeSpecId(spec, index);

  link.sourceNodeId = diagram.getNodeByPortId(sourcePortId)?.id;
  link.targetNodeId = diagram.getNodeByPortId(targetPortId)?.id;

  applyEdgeSpec(link, spec);
  return link;
}

/** Apply the mutable parts of an edge spec onto an existing link. */
export function applyEdgeSpec(link: LinkModel, spec: EdgeSpec): void {
  if (spec.type && link.pathType !== spec.type) link.setPathType(spec.type);
  if (spec.style) link.updateStyle(spec.style);
  if (spec.data) link.data = { ...spec.data };
  if (spec.label !== undefined) link.setMetadata('label', spec.label);
  if (spec.selected !== undefined) {
    const want = spec.selected ? 'selected' : 'default';
    if (link.state !== want) link.setState(want);
  }
}

/**
 * Reconcile the diagram's nodes against `specs`: add what is new, update what
 * moved, remove what disappeared. Live `NodeModel`s pass through untouched, so a
 * host can mix "give me the data" with "here is my own model".
 *
 * @returns whether anything changed (i.e. whether a repaint is warranted).
 */
export function applyNodes(diagram: DiagramModel, specs: Array<NodeSpec | NodeModel>): boolean {
  const seen = new Set<string>();
  let changed = false;

  specs.forEach((spec, index) => {
    if (isNodeModel(spec)) {
      seen.add(spec.id);
      if (!diagram.getNode(spec.id)) {
        diagram.addNode(spec);
        changed = true;
      }
      return;
    }

    const id = nodeSpecId(spec, index);
    seen.add(id);

    const existing = diagram.getNode(id);
    if (existing) {
      applyNodeSpec(existing, spec);
      changed = true; // conservative: specs are new objects every render
    } else {
      diagram.addNode(buildNode(spec, index));
      changed = true;
    }
  });

  for (const node of diagram.getNodes()) {
    if (!seen.has(node.id)) {
      diagram.removeNode(node.id);
      changed = true;
    }
  }

  return changed;
}

/**
 * Model → spec: the projection a host needs to write model changes BACK into its
 * own state (a React `useState`, a Vue `ref`, a web-component property). Without
 * it a wrapper would have to reach into engine models, which is exactly the
 * coupling these specs exist to avoid.
 */
export function toNodeSpec(node: NodeModel): NodeSpec {
  const spec: NodeSpec = {
    id: node.id,
    type: node.type,
    position: { x: node.position.x, y: node.position.y },
    size: { width: node.size.width, height: node.size.height },
    selected: node.isSelected(),
  };

  const data = node.data;
  if (data && Object.keys(data).length > 0) spec.data = { ...data };

  const label = node.getMetadata('label');
  if (label !== undefined) spec.label = label;

  const shape = node.getMetadata('shape');
  if (shape !== undefined) spec.shape = shape;

  if (node.getMetadata('useHTMLLayer')) spec.custom = true;

  return spec;
}

/** Model → spec for a link. See {@link toNodeSpec}. */
export function toEdgeSpec(link: LinkModel): EdgeSpec {
  const spec: EdgeSpec = {
    id: link.id,
    source: link.sourceNodeId ?? link.sourcePortId,
    target: link.targetNodeId ?? link.targetPortId,
    sourceHandle: link.sourcePortId,
    targetHandle: link.targetPortId,
    type: link.pathType,
    selected: link.state === 'selected',
  };

  const label = link.getMetadata('label');
  if (label !== undefined) spec.label = label;
  if (link.data && Object.keys(link.data).length > 0) spec.data = { ...link.data };

  return spec;
}

/** Reconcile the diagram's links against `specs`. See {@link applyNodes}. */
export function applyEdges(diagram: DiagramModel, specs: Array<EdgeSpec | LinkModel>): boolean {
  const seen = new Set<string>();
  let changed = false;

  specs.forEach((spec, index) => {
    if (isLinkModel(spec)) {
      seen.add(spec.id);
      if (!diagram.getLink(spec.id)) {
        diagram.addLink(spec);
        changed = true;
      }
      return;
    }

    const id = edgeSpecId(spec, index);
    seen.add(id);

    const existing = diagram.getLink(id);
    if (existing) {
      applyEdgeSpec(existing, spec);
      changed = true;
    } else {
      const link = buildEdge(diagram, spec, index);
      if (link) {
        diagram.addLink(link);
        changed = true;
      }
    }
  });

  for (const link of diagram.getLinks()) {
    if (!seen.has(link.id)) {
      diagram.removeLink(link.id);
      changed = true;
    }
  }

  return changed;
}
