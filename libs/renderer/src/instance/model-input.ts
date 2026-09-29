import { GroupModel, LinkModel, NodeModel, PortModel, ensureSideAnchorPort } from '@grafloria/engine';
import type {
  DiagramModel,
  LabelStyle,
  LinkConnectorName,
  LinkRouterName,
  LinkStyle,
  NodeStyle,
  Point,
  PortGatingSpec,
  PortLabelSpec,
  PortLayoutSpec,
  PortShapeSpec,
  PortSpot,
  PortSpreadSpec,
} from '@grafloria/engine';

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

/**
 * A port on a node. Omit `id` to get the deterministic `<nodeId>__<side>` name.
 *
 * ## wave10/gallery BUG FIX — the wave-6 port vocabulary was UNREACHABLE
 *
 * `PortSpec` used to be `{ id, side, type, index }` and `buildNode()` passed
 * exactly those four fields to `new PortModel(...)`. Everything else Wave 6
 * shipped — glyph shapes, port labels, the pluggable layout strategies, port
 * groups, data types, directional gating, link spots, link spreading — is
 * declared on `PortModel`, is accepted by its constructor, and is READ by the
 * renderer and the connection validator… and was silently dropped on the floor
 * by the one translator every host actually goes through.
 *
 * `Grafloria.render()`, `<grafloria-flow>` and `<GrafloriaFlow>` (React) ALL build their
 * ports here. So an entire wave of feature work — square/diamond/triangle/path
 * glyphs, `sideLinear`/`line`/`ellipse` layouts, typed data-flow ports, "this
 * port accepts at most one link" — could not be expressed by any embedder, from
 * any framework, through any public entry point. It had passing unit tests the
 * whole time, because the unit tests construct `PortModel` directly.
 *
 * This is the demo gallery's canonical finding shape, and it is why the gallery
 * exists: a unit test proves a unit works; it never proves anything CALLS it.
 */
export interface PortSpec {
  id?: string;
  /**
   * Which edge of the node the port sits on. Optional when the port names a
   * `group` that declares one — `PortModel.explicitSide` exists precisely so an
   * inherited side is not clobbered by a default.
   */
  side?: 'top' | 'right' | 'bottom' | 'left';
  type?: 'input' | 'output' | 'bi';
  index?: number;

  // --- Wave 6 (Ports & connections). Every field is optional and "unset" is
  // the pre-wave-6 behaviour, so an existing spec renders byte-identically.

  /** Named port group. Config is inherited from it; these fields override. */
  group?: string;
  /** Glyph: square / diamond / triangle / a custom SVG path. Default: circle. */
  shape?: PortShapeSpec;
  /** Port label + its placement (inside / outside / orthogonal / radial). */
  label?: PortLabelSpec;
  /** Layout strategy (line / sideLinear / ellipse / …). Default: the shape anchor. */
  layout?: PortLayoutSpec;
  /** Directional connectability + link caps + allowed types. */
  gating?: PortGatingSpec;
  /** Data-flow type. Drives glyph colour AND connection validity. */
  dataType?: string;
  /** Where links leave / land on the glyph box. */
  fromSpot?: PortSpot;
  toSpot?: PortSpot;
  /** Fan several links out along the port's edge instead of piling them. */
  spread?: PortSpreadSpec;
  /** Raw SVG presentation attributes merged onto the glyph. */
  style?: Record<string, unknown>;
  /** The legacy single cap. `gating` is the richer form. */
  maxConnections?: number;
  visible?: boolean;
}

/** A node, as a host hands it in. */
/** Where a zone's caption sits. */
export type GroupLabelPlacement = 'top-left' | 'top' | 'top-right' | 'bottom-left' | 'bottom' | 'bottom-right';

/**
 * A zone's own frame — what makes a group look like the tinted, captioned
 * regions of the diagrams AI tools draw instead of the theme's titled box.
 * Declaring any of it replaces the theme frame (no title band).
 */
export interface GroupFrameStyle {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  strokeDasharray?: string;
  borderRadius?: number;
  /** Caption colour. */
  color?: string;
  /** Caption size in px. Default 11. */
  fontSize?: number;
  fontWeight?: string | number;
  fontFamily?: string;
  /** Caption letter spacing in px. */
  letterSpacing?: number;
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
}

/**
 * A GROUP in the spec — a zone around some boxes. `bounds` pins its frame;
 * without it the frame is fitted around `children` with `padding`. The children
 * become the group's members (they travel with it). Stored as a GroupModel whose
 * `metadata.frameStyle` carries `style` + `labelPlacement`, so it serializes.
 */
export interface GroupSpec {
  id: string;
  label?: string;
  children?: string[];
  bounds?: { x: number; y: number; width: number; height: number };
  /** Space between the children and the fitted frame. Default 20. */
  padding?: number;
  style?: GroupFrameStyle;
  /** Default 'top-left'. */
  labelPlacement?: GroupLabelPlacement;
  /** How the zone lays its boxes out under a composing layout: `'LR'` a row, `'TB'` a column. */
  direction?: 'LR' | 'RL' | 'TB' | 'TD' | 'BT';
}

/** A node's second line, when it needs its own font or colour. See `NodeSpec.sublabel`. */
export interface NodeSublabel {
  text: string;
  /** A CSS font stack, or `'mono'` for a monospace one. */
  fontFamily?: string;
  /** px. Default: 0.85 of the label's size. */
  fontSize?: number;
  /** Default: the theme's secondary text colour. */
  color?: string;
  fontWeight?: string | number;
}

export interface NodeSpec {
  id?: string;
  /** Engine node type. Default `'rect'`. */
  type?: string;
  /**
   * Where the box sits. Optional: absent, a new box starts at the origin and an
   * existing one stays put — and a composing layout (`layout: 'architecture'`)
   * places it anyway.
   */
  position?: { x: number; y: number };
  size?: { width: number; height: number };
  /** Free-form user payload — passed straight to custom node components. */
  data?: Record<string, any>;
  /** Convenience for `metadata.label`. */
  label?: string;
  /**
   * A second, smaller, muted line under the label — the name-and-description
   * box of the diagrams AI tools draw ("Our API" / "sherkety-erp-api"). With a
   * sublabel the label is drawn semi-bold (a `style.fontWeight` still wins).
   * An object sets the line's own font (`'mono'` = a monospace stack), size and
   * colour. Stored on `metadata.sublabel`, so it serializes with the node.
   */
  sublabel?: string | NodeSublabel;
  /**
   * A note placed BESIDE what it is about — a relation, not a coordinate: the
   * architecture layout puts this box to the `side` of `target` (a node or zone),
   * `gap` px away. Stored on `metadata.near`.
   */
  near?: { target: string; side?: 'right' | 'left' | 'above' | 'below'; gap?: number } | null;
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

/**
 * An edge, as a host hands it in. Node-to-node, like React Flow.
 *
 * ## wave10/gallery BUG FIX — `router`, `connector`, `metadata` and `points`
 *
 * Wave 5 Card 0 split `pathType` into two orthogonal, per-link, SERIALIZABLE
 * settings — `router` (where the line goes) and `connector` (how it is drawn) —
 * and Wave 6 Card 2 made the connector a real registry addressed by name. Both
 * fields live on `LinkModel`, both round-trip through `serialize()`… and neither
 * was on `EdgeSpec`. So the A* / manhattan obstacle routers, and every custom
 * connector, were addressable only by reaching past the spec layer into the live
 * model. Same for `metadata`, which is how a link names its anchor and its
 * connection-point strategy (floating edges), and for `points`, which is how a
 * host restores saved waypoints.
 */
export interface EdgeSpec {
  id?: string;
  /** Source NODE id (a port id also resolves, for full control). */
  source: string;
  /** Target NODE id. */
  target: string;
  /**
   * Port id, or a bare side name (`'right'`). Naming a handle PINS the edge to
   * that port. When neither handle is named the edge is PORT-FACING: it
   * attaches to the node's real port on whichever side faces its partner (the
   * `'port-facing'` strategy), so a layouted tree connects bottom→top instead
   * of looping out of a frozen right→left pick — and the endpoint always sits
   * on a port, never sliding along the perimeter. `metadata.connectionPoint =
   * 'smart'` opts into true perimeter floating.
   */
  sourceHandle?: string;
  /**
   * Port id, a bare side name (`'left'`), or a side AT a point along it:
   * `'left@36'` (36 px down the left side), `'bottom@138'` (138 px from the
   * bottom's left end), `'right@50%'`. See `sourceHandle` for the default.
   */
  targetHandle?: string;
  type?: 'direct' | 'smooth' | 'orthogonal' | 'bezier';
  /**
   * WHERE the line goes: `straight` | `orthogonal` | `manhattan` | `avoid` |
   * `elk`, or any router registered on the RoutingEngine. Unset = derived from
   * `type`.
   */
  router?: LinkRouterName;
  /**
   * HOW the polyline is drawn: `straight` | `rounded` | `smooth` | `bezier`, or
   * any name passed to `registerConnector`. Unset = derived from `type`.
   */
  connector?: LinkConnectorName;
  label?: string;
  /**
   * Where the label sits: `'on'` the line on its own little box (the default),
   * or `'above'` / `'below'` it with no box — the labels of the diagrams AI tools
   * draw. Decided against the line's direction where the label lands, so on a
   * vertical run `'above'` means to its left.
   */
  labelPlacement?: 'on' | 'above' | 'below';
  /** The label's own colour, size, weight, family, background (`'none'` for no box). */
  labelStyle?: LabelStyle;
  /**
   * The bends the line must take, in world coordinates — interior points only;
   * its ends stay on their ports. Drawn as MANUAL waypoints (the user's own
   * bends), so the router keeps them: "M580,264 V204 H850 V154" is
   * `waypoints: [{ x: 580, y: 204 }, { x: 850, y: 204 }]`.
   */
  waypoints?: Point[];
  style?: Partial<LinkStyle>;
  selected?: boolean;
  data?: Record<string, any>;
  /**
   * Link metadata. This is how a link names its `sourceAnchor` / `targetAnchor`
   * and its `connectionPoint` strategy — i.e. how floating edges are turned on
   * per link.
   */
  metadata?: Record<string, any>;
  /** Explicit waypoints. Restores a user-edited route. */
  points?: Point[];
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
    position: { ...(spec.position ?? { x: 0, y: 0 }) },
    size: spec.size ? { ...spec.size } : undefined,
  });

  // Swap the nanoid-keyed auto-ports for deterministic ones (see the module doc).
  node.ports.clear();
  const ports: PortSpec[] =
    spec.ports ?? PORT_SIDES.map((side) => ({ side, type: 'bi' as const, index: 0 }));
  for (const [portIndex, port] of ports.entries()) {
    node.addPort(buildPort(id, port, portIndex));
  }

  applyNodeSpec(node, spec);
  return node;
}

/**
 * Spec → `PortModel`, carrying the WHOLE wave-6 vocabulary through.
 *
 * The gating spec is flattened onto the model's individual fields because that
 * is the shape `resolvePortConfig()` reads; `PortSpec.gating` is only the
 * ergonomic grouping of them.
 *
 * A port with no explicit `side` and no `group` still lands on `right` (the
 * `PortModel` default) — but a port that names a group and no side is now built
 * WITHOUT `side`, so `explicitSide` stays false and the group's side is
 * inherited, which is the entire reason that flag exists.
 */
export function buildPort(nodeId: string, spec: PortSpec, index: number): PortModel {
  const gating = spec.gating;
  const id = spec.id ?? (spec.side ? defaultPortId(nodeId, spec.side) : `${nodeId}__p${index}`);

  return new PortModel({
    id,
    type: spec.type ?? 'bi',
    // Only pass `side` when the author actually declared one — see explicitSide.
    ...(spec.side ? { side: spec.side } : {}),
    index: spec.index ?? 0,
    group: spec.group,
    shape: spec.shape,
    label: spec.label,
    layout: spec.layout,
    fromSpot: spec.fromSpot,
    toSpot: spec.toSpot,
    spread: spec.spread,
    style: spec.style as Record<string, any> | undefined,
    visible: spec.visible,
    dataType: spec.dataType,
    maxConnections: gating?.maxConnections ?? spec.maxConnections ?? undefined,
    isConnectableStart: gating?.isConnectableStart,
    isConnectableEnd: gating?.isConnectableEnd,
    fromMaxLinks: gating?.fromMaxLinks,
    toMaxLinks: gating?.toMaxLinks,
    allowSelfLink: gating?.allowSelfLink,
    allowDuplicateLinks: gating?.allowDuplicateLinks,
    allowedTypes: gating?.allowedTypes,
  });
}

/** Apply the mutable parts of a spec onto an existing node (the update path). */
export function applyNodeSpec(node: NodeModel, spec: NodeSpec): void {
  if (spec.position && (node.position.x !== spec.position.x || node.position.y !== spec.position.y)) {
    node.setPosition(spec.position.x, spec.position.y);
  }
  if (spec.size && (node.size.width !== spec.size.width || node.size.height !== spec.size.height)) {
    node.setSize(spec.size.width, spec.size.height);
  }

  if (spec.data) node.data = { ...spec.data };
  if (spec.style) node.style = { ...node.style, ...spec.style };
  if (spec.label !== undefined) node.setMetadata('label', spec.label);
  if (spec.sublabel !== undefined) node.setMetadata('sublabel', spec.sublabel);
  if (spec.near !== undefined) node.setMetadata('near', spec.near ? { ...spec.near } : undefined);
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
    // `'right@36'` — a point along a side (engine/ports/side-anchor).
    const anchored = ensureSideAnchorPort(node, handle);
    if (anchored) return anchored;
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

  // An edge that names NO handle has expressed no opinion about sides — but the
  // fallback above still had to pick ports, and that pick (right→left) froze at
  // build time. Once a layout stacks the nodes vertically, every such edge exits
  // the wrong side and loops back around its own node. So record the fact that
  // the anchoring was left to us: the renderer resolves this stamp to the 'smart'
  // (draw.io floating) strategy at the LOWEST precedence — an explicit
  // `metadata.connectionPoint`, per-end anchors, a diagram-wide
  // `connectionPoint` config, or explicit waypoints all still win, and naming
  // either handle pins the edge exactly as before.
  if (
    !spec.sourceHandle &&
    !spec.targetHandle &&
    spec.points === undefined &&
    spec.metadata?.['connectionPoint'] === undefined &&
    spec.metadata?.['sourceAnchor'] === undefined &&
    spec.metadata?.['targetAnchor'] === undefined
  ) {
    link.setMetadata('autoConnectionPoint', true);
  }
  return link;
}

/** Apply the mutable parts of an edge spec onto an existing link. */
export function applyEdgeSpec(link: LinkModel, spec: EdgeSpec): void {
  if (spec.type && link.pathType !== spec.type) link.setPathType(spec.type);
  // A PLAIN side handle ('bottom') is also a relation a composing layout reads —
  // the line leaves that side, so its target sits that way (Mermaid: `from:bottom`).
  const plainSide = (h: string | undefined) => (h === 'top' || h === 'right' || h === 'bottom' || h === 'left' ? h : undefined);
  if (plainSide(spec.sourceHandle)) link.setMetadata('sourceSide', plainSide(spec.sourceHandle));
  if (plainSide(spec.targetHandle)) link.setMetadata('targetSide', plainSide(spec.targetHandle));
  // Router/connector go through the SETTERS, not assignment: `setRouter` drops
  // the stale polyline (it belongs to the old router) and both track the change,
  // which is what invalidates the link's cached VNode.
  if (spec.router !== undefined && link.router !== spec.router) link.setRouter(spec.router);
  if (spec.connector !== undefined && link.connector !== spec.connector) {
    link.setConnector(spec.connector);
  }
  if (spec.style) link.updateStyle(spec.style);
  if (spec.data) link.data = { ...spec.data };
  if (spec.label !== undefined) link.setMetadata('label', spec.label);
  // A placed or styled label is a real LinkLabel (its style is LabelStyle); the
  // plain `label` stays the link's accessible name. Above/below draw no box
  // unless the style asks for a background.
  if (spec.labelPlacement !== undefined) link.setMetadata('labelPlacement', spec.labelPlacement === 'on' ? undefined : spec.labelPlacement);
  const text = spec.label ?? link.getLabel();
  if (text !== undefined && text !== '' && (spec.labelPlacement !== undefined || spec.labelStyle !== undefined)) {
    const offLine = spec.labelPlacement === 'above' || spec.labelPlacement === 'below';
    link.setLabels([{ id: `${link.id}-label`, text: String(text), position: 0.5, offset: { x: 0, y: 0 }, style: { ...(offLine ? { background: 'none' } : {}), ...(spec.labelStyle ?? {}) } }]);
  }
  if (spec.metadata) {
    for (const [key, value] of Object.entries(spec.metadata)) link.setMetadata(key, value);
  }
  if (spec.points) link.setPoints(spec.points);
  if (spec.waypoints && spec.waypoints.length > 0) {
    // The ends are placeholders: the renderer refreshes both from the ports.
    const first = spec.waypoints[0];
    const last = spec.waypoints[spec.waypoints.length - 1];
    link.setPoints([{ ...first }, ...spec.waypoints.map((p) => ({ ...p })), { ...last }]);
    link.setMetadata('hasManualWaypoints', true);
  }
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

  const label = node.getLabel();
  if (label !== undefined) spec.label = label;
  const sublabel = node.getMetadata('sublabel') as NodeSpec['sublabel'] | undefined;
  if (sublabel !== undefined) spec.sublabel = sublabel;
  const near = node.getMetadata('near') as NodeSpec['near'] | undefined;
  if (near) spec.near = { ...near };

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

  // Round-trip the wave-5 split fields, or a host that projects the model back
  // into its own state would silently reset every custom router/connector.
  if (link.router !== undefined) spec.router = link.router;
  if (link.connector !== undefined) spec.connector = link.connector;

  const label = link.getLabel();
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

/** True for a live `GroupModel`. */
export function isGroupModel(value: unknown): value is GroupModel {
  return value instanceof GroupModel;
}

/**
 * Reconcile the diagram's groups against `specs` — add, update, remove — the
 * way {@link applyNodes} does for nodes. A live `GroupModel` passes through (a
 * Mermaid subgraph arrives that way). Removing a group never removes its boxes.
 *
 * @returns whether anything changed.
 */
export function applyGroups(diagram: DiagramModel, specs: Array<GroupSpec | GroupModel>): boolean {
  const seen = new Set<string>();
  let changed = false;
  for (const spec of specs) {
    if (isGroupModel(spec)) {
      seen.add(spec.id);
      if (!diagram.getGroup(spec.id)) {
        diagram.addGroup(spec);
        changed = true;
      }
      continue;
    }
    seen.add(spec.id);
    let group = diagram.getGroup(spec.id);
    if (!group) {
      group = new GroupModel({ id: spec.id, name: spec.label ?? '' });
      diagram.addGroup(group);
    }
    applyGroupSpec(diagram, group, spec);
    changed = true;
  }
  for (const group of diagram.getGroups()) {
    if (!seen.has(group.id)) {
      diagram.removeGroup(group.id);
      changed = true;
    }
  }
  return changed;
}

function applyGroupSpec(diagram: DiagramModel, group: GroupModel, spec: GroupSpec): void {
  group.name = spec.label ?? '';
  const styled = spec.style !== undefined || spec.labelPlacement !== undefined;
  group.setMetadata('frameStyle', styled ? { ...(spec.style ?? {}), labelPlacement: spec.labelPlacement ?? 'top-left' } : undefined);
  // A zone's caption lives in its padding, not in a title band.
  if (styled) group.headerHeight = 0;
  if (spec.direction !== undefined) group.setMetadata('direction', spec.direction);
  const wanted = new Set(spec.children ?? []);
  for (const id of [...group.members]) if (!wanted.has(id)) group.removeMember(id, diagram);
  for (const id of wanted) if (!group.members.has(id) && diagram.getNode(id)) group.addMember(id, diagram);
  if (spec.bounds) {
    group.position = { x: spec.bounds.x, y: spec.bounds.y };
    group.size = { width: spec.bounds.width, height: spec.bounds.height, depth: 0 };
    group.bounds = { ...spec.bounds };
  } else {
    group.padding = spec.padding ?? 20;
    group.fitToContents(diagram, { mode: 'exact' });
  }
}

