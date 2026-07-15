// PortModel - Connection point on a node

import { DiagramEntity } from './DiagramEntity';
import type {
  Point,
  BoundingBox,
  PortPosition,
  PortAlignment,
  ValidationResult,
  SerializedEntity,
} from '../types';
// Wave 6 (Ports & connections): the declarative port vocabulary. Types only —
// no cycle (port-types imports nothing).
import type {
  PortLabelSpec,
  PortLayoutSpec,
  PortShapeSpec,
  PortSpot,
  PortSpreadSpec,
} from '../ports/port-types';
// Value import — the registry has no model dependencies, so there is no cycle.
import { arePortDataTypesCompatible } from '../ports/port-type-registry';

export interface SerializedPort extends SerializedEntity {
  nodeId: string;
  type: 'input' | 'output' | 'bi';
  systemType?: string;
  position: PortPosition;
  alignment: PortAlignment;
  offset: Point;
  index: number; // NEW: For multiple ports per side
  maxConnections: number | null; // null = unlimited (Infinity is not JSON-representable)
  allowedTypes: string[];
  visible: boolean;
  style: Record<string, any>;
  data: Record<string, any>;
  renderingConfig?: any; // Phase 2: Port rendering configuration from templates

  // --- Wave 6: every field below is OPTIONAL and omitted when unset, so a port
  // that uses none of the new config serializes byte-identically to before.
  group?: string;
  /** Was `side`/`alignment` explicitly declared (vs. inherited from a group)? */
  explicitSide?: boolean;
  shape?: PortShapeSpec;
  label?: PortLabelSpec;
  layout?: PortLayoutSpec;
  fromSpot?: PortSpot;
  toSpot?: PortSpot;
  spread?: PortSpreadSpec;
  dataType?: string;
  isConnectableStart?: boolean;
  isConnectableEnd?: boolean;
  /** null = unlimited (mirrors the `maxConnections` sentinel). */
  fromMaxLinks?: number | null;
  toMaxLinks?: number | null;
  allowSelfLink?: boolean;
  allowDuplicateLinks?: boolean;
  /** True for ports spawned by the dynamic auto-port allocator. */
  dynamic?: boolean;
}

export class PortModel extends DiagramEntity {
  nodeId: string = '';
  type: 'input' | 'output' | 'bi';
  systemType?: string;

  // Positioning
  position: PortPosition = { x: 0.5, y: 0.5 };
  alignment: PortAlignment = { side: 'right', offset: 0 };
  offset: Point = { x: 0, y: 0 };

  // NEW: Index for multiple ports per side (0-based)
  index: number = 0;

  // Constraints
  maxConnections: number = Infinity;
  currentConnections: Set<string> = new Set();
  allowedTypes: Set<string> = new Set();

  /**
   * Which END of each attached link this port is — `linkId → 'source'|'target'`.
   *
   * DERIVED state, rebuilt from the diagram's links by
   * `DiagramModel.reconcilePortConnections()`, exactly like `currentConnections`.
   * It exists because `fromMaxLinks` / `toMaxLinks` (Card 2) need a DIRECTIONAL
   * count and `currentConnections` is a direction-blind Set of link ids.
   *
   * A link registered without a role (legacy `addConnection(id)` callers) is
   * counted in NEITHER direction — which is exactly right, because the only
   * consumers are the directional caps, and those are opt-in.
   */
  linkRoles: Map<string, 'source' | 'target'> = new Map();

  // Visual
  visible: boolean = true;
  style: Record<string, any> = {};

  // User data
  data: Record<string, any> = {};

  // =========================================================================
  // Wave 6 (Ports & connections) — the declarative port seam.
  //
  // Every field below defaults to "unset", and every consumer treats "unset" as
  // the pre-wave-6 behaviour, so a port that touches none of this renders and
  // validates byte-identically to before.
  // =========================================================================

  /** Named port group (Card 3). Its config is inherited; these fields override it. */
  group?: string;

  /**
   * Was the side actually declared by the author? A port that only says
   * `group: 'in'` must inherit the GROUP's side — without this flag the
   * constructor's `alignment.side = 'right'` default would silently win.
   */
  explicitSide: boolean = false;

  /** Non-circle glyph (Card 0): square / diamond / triangle / custom SVG path. */
  shape?: PortShapeSpec;

  /** Port label + its layout mode (Card 1). */
  label?: PortLabelSpec;

  /** Layout strategy override (Card 4). Unset → the shape registry's anchor. */
  layout?: PortLayoutSpec;

  /** Where a link leaves / lands on the glyph (Card 5). */
  fromSpot?: PortSpot;
  toSpot?: PortSpot;

  /** Spread multiple links along this port's edge instead of piling them (Card 5). */
  spread?: PortSpreadSpec;

  /** Declarative data type (Card 7): drives link validity AND glyph colour. */
  dataType?: string;

  // -- Directional connectability (Card 2) ----------------------------------
  /** May a link START at this port? Unset → true. */
  isConnectableStart?: boolean;
  /** May a link END at this port? Unset → true. */
  isConnectableEnd?: boolean;
  /** Cap on OUTGOING links. null/unset → unlimited. */
  fromMaxLinks?: number | null;
  /** Cap on INCOMING links. null/unset → unlimited. */
  toMaxLinks?: number | null;
  /** Allow a link whose source node IS its target node. Unset → false. */
  allowSelfLink?: boolean;
  /** Allow a second link between the same ordered port pair. Unset → true. */
  allowDuplicateLinks?: boolean;

  /** Spawned by the dynamic auto-port allocator (Card 7) rather than authored. */
  dynamic?: boolean;

  // Phase 2: Template system support
  renderingConfig?: any; // Port rendering configuration from templates

  // Phase 1: Interaction state (for connection modes)
  /**
   * Whether mouse is currently hovering over this port
   * Used for visual feedback (scaling, highlighting)
   */
  isHovered: boolean = false;

  /**
   * Whether this port is highlighted as a valid connection target
   * Set during connection drag operations
   */
  isHighlighted: boolean = false;

  /**
   * Whether this port is a valid target for current connection
   * Set by ConnectionStateManager during drag
   */
  isValidTarget: boolean = false;

  constructor(config: {
    id?: string;
    type: 'input' | 'output' | 'bi';
    systemType?: string;
    position?: PortPosition;
    alignment?: PortAlignment;
    side?: 'left' | 'right' | 'top' | 'bottom'; // NEW: Convenience parameter
    index?: number; // NEW: For multiple ports per side
    maxConnections?: number;
    // --- Wave 6 (all optional; unset === pre-wave-6 behaviour) -------------
    group?: string;
    shape?: PortShapeSpec;
    label?: PortLabelSpec;
    layout?: PortLayoutSpec;
    fromSpot?: PortSpot;
    toSpot?: PortSpot;
    spread?: PortSpreadSpec;
    style?: Record<string, any>;
    visible?: boolean;
    dataType?: string;
    isConnectableStart?: boolean;
    isConnectableEnd?: boolean;
    fromMaxLinks?: number | null;
    toMaxLinks?: number | null;
    allowSelfLink?: boolean;
    allowDuplicateLinks?: boolean;
    allowedTypes?: string[];
    dynamic?: boolean;
  }) {
    super(config.id);

    this.type = config.type;
    this.systemType = config.systemType;

    // NEW: Support 'side' as shorthand for alignment
    if (config.side) {
      this.alignment = { side: config.side, offset: 0 };
      this.explicitSide = true;
    } else if (config.alignment) {
      this.alignment = config.alignment;
      this.explicitSide = true;
    }

    if (config.position) {
      this.position = config.position;
    }

    // NEW: Set index
    if (config.index !== undefined) {
      this.index = config.index;
    }

    if (config.maxConnections != null) {
      this.maxConnections = config.maxConnections;
    }

    // Wave 6 declarative config. Assigned only when supplied, so `undefined`
    // stays `undefined` and the resolver's "unset → default" path is taken.
    if (config.group !== undefined) this.group = config.group;
    if (config.shape !== undefined) this.shape = config.shape;
    if (config.label !== undefined) this.label = config.label;
    if (config.layout !== undefined) this.layout = config.layout;
    if (config.fromSpot !== undefined) this.fromSpot = config.fromSpot;
    if (config.toSpot !== undefined) this.toSpot = config.toSpot;
    if (config.spread !== undefined) this.spread = config.spread;
    if (config.style !== undefined) this.style = { ...config.style };
    if (config.visible !== undefined) this.visible = config.visible;
    if (config.dataType !== undefined) this.dataType = config.dataType;
    if (config.isConnectableStart !== undefined) this.isConnectableStart = config.isConnectableStart;
    if (config.isConnectableEnd !== undefined) this.isConnectableEnd = config.isConnectableEnd;
    if (config.fromMaxLinks !== undefined) this.fromMaxLinks = config.fromMaxLinks;
    if (config.toMaxLinks !== undefined) this.toMaxLinks = config.toMaxLinks;
    if (config.allowSelfLink !== undefined) this.allowSelfLink = config.allowSelfLink;
    if (config.allowDuplicateLinks !== undefined) this.allowDuplicateLinks = config.allowDuplicateLinks;
    if (config.allowedTypes?.length) this.allowedTypes = new Set(config.allowedTypes);
    if (config.dynamic !== undefined) this.dynamic = config.dynamic;
  }

  /**
   * Get the side this port is on (convenience getter)
   */
  get side(): 'left' | 'right' | 'top' | 'bottom' {
    return this.alignment.side;
  }

  /**
   * Set the side this port is on (convenience setter)
   */
  set side(value: 'left' | 'right' | 'top' | 'bottom') {
    const oldAlignment = { ...this.alignment };
    this.alignment = { ...this.alignment, side: value };
    this.explicitSide = true;
    this.trackChange('alignment', oldAlignment, this.alignment);
  }

  /**
   * Set position
   */
  setPosition(position: PortPosition): void {
    const oldPosition = { ...this.position };
    this.position = position;
    this.trackChange('position', oldPosition, position);
  }

  /**
   * Set alignment
   */
  setAlignment(alignment: PortAlignment): void {
    const oldAlignment = { ...this.alignment };
    this.alignment = alignment;
    this.explicitSide = true;
    this.trackChange('alignment', oldAlignment, alignment);
  }

  /**
   * Set offset
   */
  setOffset(offset: Point): void {
    const oldOffset = { ...this.offset };
    this.offset = offset;
    this.trackChange('offset', oldOffset, offset);
  }

  /**
   * Add allowed type
   */
  addAllowedType(type: string): void {
    if (!this.allowedTypes.has(type)) {
      this.allowedTypes.add(type);
      this.trackChange('allowedTypes', null, type);
    }
  }

  /**
   * Remove allowed type
   */
  removeAllowedType(type: string): void {
    if (this.allowedTypes.has(type)) {
      this.allowedTypes.delete(type);
      this.trackChange('allowedTypes', type, null);
    }
  }

  /**
   * Check if type is allowed
   */
  isTypeAllowed(type: string): boolean {
    if (this.allowedTypes.size === 0) {
      return true; // No restrictions
    }
    return this.allowedTypes.has(type);
  }

  /**
   * Add connection
   */
  addConnection(linkId: string, role?: 'source' | 'target'): void {
    // Wave 10 BUG FIX: the capacity guard used to run BEFORE the already-registered
    // check, so re-registering a link this port ALREADY holds threw "reached max
    // connections" — even though the Set below would have deduped it and the count
    // would not have moved. Registering the same link twice is a no-op, never an
    // overflow. (It surfaced the moment `installLink()` started doing the bookkeeping
    // itself: every caller that also registered by hand, in either order, tripped it.)
    if (this.currentConnections.has(linkId)) {
      if (role) this.linkRoles.set(linkId, role);
      return;
    }

    if (this.currentConnections.size >= this.maxConnections) {
      throw new Error(
        `Port ${this.id} has reached max connections (${this.maxConnections})`
      );
    }

    if (role) {
      this.linkRoles.set(linkId, role);
    }

    this.currentConnections.add(linkId);
    this.trackChange('connections', null, linkId);
  }

  /**
   * Load-time reconcile: register a connection WITHOUT the maxConnections
   * guard or change tracking. The connection registry is derived state that
   * is rebuilt deterministically from the diagram's links on load — a
   * persisted graph may legitimately exceed a since-tightened maxConnections,
   * so enforcement applies to NEW interactive connections (addConnection),
   * never to reloading saved state.
   */
  restoreConnection(linkId: string, role?: 'source' | 'target'): void {
    this.currentConnections.add(linkId);
    if (role) {
      this.linkRoles.set(linkId, role);
    }
  }

  /**
   * Remove connection
   */
  removeConnection(linkId: string): void {
    this.linkRoles.delete(linkId);
    if (this.currentConnections.has(linkId)) {
      this.currentConnections.delete(linkId);
      this.trackChange('connections', linkId, null);
    }
  }

  /**
   * Check if can accept more connections
   */
  canConnect(): boolean {
    return this.currentConnections.size < this.maxConnections;
  }

  /**
   * Get connection count
   */
  getConnectionCount(): number {
    return this.currentConnections.size;
  }

  /**
   * Wave 6 (Card 2): how many links LEAVE this port / how many ARRIVE at it.
   *
   * A self-loop that both starts and ends here registers once in
   * `currentConnections` (the Set dedupes) but `linkRoles` can only hold one
   * role for it, so it is counted on whichever end was registered last. That is
   * acceptable — a port that allows self-links and also caps its directional
   * fan-out is pathological, and the TOTAL `maxConnections` cap still holds.
   */
  getFromLinkCount(): number {
    let count = 0;
    for (const role of this.linkRoles.values()) {
      if (role === 'source') count++;
    }
    return count;
  }

  getToLinkCount(): number {
    let count = 0;
    for (const role of this.linkRoles.values()) {
      if (role === 'target') count++;
    }
    return count;
  }

  /**
   * Check if this port (as the SOURCE) can connect to `targetPort` (as the
   * TARGET). Direction matters — this is not a symmetric predicate.
   *
   * Rules:
   * - input can connect to output or bi
   * - output can connect to input or bi
   * - bi can connect to any
   *
   * Wave 6 (Card 2) adds the DIRECTIONAL gates on top: `isConnectableStart` on
   * the source, `isConnectableEnd` on the target, the per-direction
   * `fromMaxLinks`/`toMaxLinks` caps, the `allowedTypes` whitelist (which was
   * dead config — `isTypeAllowed` had no caller anywhere in the tree) and
   * `dataType` compatibility (Card 7).
   *
   * Every new gate is opt-in: unset → the pre-wave-6 answer, unchanged.
   *
   * NOTE: this is the PORT-LOCAL rule. Rules that need the graph (self-links,
   * duplicate links, connection groups) live in `evaluatePortConnection()`,
   * which folds this in.
   */
  canConnectTo(targetPort: PortModel): boolean {
    // Check if both ports can accept more connections
    if (!this.canConnect() || !targetPort.canConnect()) {
      return false;
    }

    // Wave 6: directional connectability.
    if (this.isConnectableStart === false) return false;
    if (targetPort.isConnectableEnd === false) return false;

    // Wave 6: per-direction caps (null/undefined = unlimited).
    if (typeof this.fromMaxLinks === 'number' && this.getFromLinkCount() >= this.fromMaxLinks) {
      return false;
    }
    if (typeof targetPort.toMaxLinks === 'number' && targetPort.getToLinkCount() >= targetPort.toMaxLinks) {
      return false;
    }

    // Wave 6: the allowedTypes whitelist, at last consumed. Each side vets the
    // OTHER side's declared type identity (dataType > systemType > direction).
    if (!this.isTypeAllowed(targetPort.typeIdentity())) return false;
    if (!targetPort.isTypeAllowed(this.typeIdentity())) return false;

    // Wave 6 (Card 7): typed data-flow compatibility.
    if (!arePortDataTypesCompatible(this.dataType, targetPort.dataType)) return false;

    // Validate type compatibility
    const sourceType = this.type;
    const targetType = targetPort.type;

    // Bi-directional ports can connect to anything
    if (sourceType === 'bi' || targetType === 'bi') {
      return true;
    }

    // Input cannot connect to input
    if (sourceType === 'input' && targetType === 'input') {
      return false;
    }

    // Output cannot connect to output
    if (sourceType === 'output' && targetType === 'output') {
      return false;
    }

    return true;
  }

  /**
   * The name this port answers to when another port's `allowedTypes` whitelist
   * is checked: its declared data type, else its systemType, else its direction.
   */
  typeIdentity(): string {
    return this.dataType ?? this.systemType ?? this.type;
  }

  /**
   * Get absolute position relative to node
   */
  getAbsolutePosition(nodeBounds: BoundingBox): Point {
    let x = 0;
    let y = 0;

    switch (this.alignment.side) {
      case 'left':
        x = nodeBounds.left - this.alignment.offset;
        y = nodeBounds.top + nodeBounds.height * this.position.y;
        break;
      case 'right':
        x = nodeBounds.right + this.alignment.offset;
        y = nodeBounds.top + nodeBounds.height * this.position.y;
        break;
      case 'top':
        x = nodeBounds.left + nodeBounds.width * this.position.x;
        y = nodeBounds.top - this.alignment.offset;
        break;
      case 'bottom':
        x = nodeBounds.left + nodeBounds.width * this.position.x;
        y = nodeBounds.bottom + this.alignment.offset;
        break;
    }

    return {
      x: x + this.offset.x,
      y: y + this.offset.y,
    };
  }

  /**
   * Phase 1: Get port position at node edge (for smart mode)
   * Returns the position at the edge midpoint based on alignment
   */
  getEdgePosition(nodeBounds: BoundingBox): Point {
    const { side } = this.alignment;

    switch (side) {
      case 'left':
        return {
          x: nodeBounds.left,
          y: nodeBounds.top + nodeBounds.height / 2,
        };
      case 'right':
        return {
          x: nodeBounds.right,
          y: nodeBounds.top + nodeBounds.height / 2,
        };
      case 'top':
        return {
          x: nodeBounds.left + nodeBounds.width / 2,
          y: nodeBounds.top,
        };
      case 'bottom':
        return {
          x: nodeBounds.left + nodeBounds.width / 2,
          y: nodeBounds.bottom,
        };
    }
  }

  /**
   * Phase 1: Find nearest port on a node to a given point
   * Used in smart mode for auto-connect to nearest port
   *
   * @param point - Point in world coordinates
   * @param node - Node to find port on
   * @param nodeBounds - Bounding box of the node
   * @returns Nearest port or null
   */
  static findNearestPort(
    point: Point,
    ports: Map<string, PortModel>,
    nodeBounds: BoundingBox
  ): PortModel | null {
    let nearestPort: PortModel | null = null;
    let minDistance = Infinity;

    ports.forEach((port) => {
      // Get port position at edge
      const portPos = port.getEdgePosition(nodeBounds);

      // Calculate distance
      const dx = point.x - portPos.x;
      const dy = point.y - portPos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < minDistance) {
        minDistance = distance;
        nearestPort = port;
      }
    });

    return nearestPort;
  }

  /**
   * Phase 1: Calculate distance from point to this port
   *
   * @param point - Point in world coordinates
   * @param nodeBounds - Bounding box of the node this port belongs to
   * @returns Distance in pixels
   */
  getDistanceFromPoint(point: Point, nodeBounds: BoundingBox): number {
    const portPos = this.getAbsolutePosition(nodeBounds);
    const dx = point.x - portPos.x;
    const dy = point.y - portPos.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Phase 1: Reset interaction state
   * Called when connection drag ends or is cancelled
   */
  resetInteractionState(): void {
    this.isHovered = false;
    this.isHighlighted = false;
    this.isValidTarget = false;
  }

  /**
   * Phase 2: Set port rendering configuration from template
   */
  setRenderingConfig(config: any): void {
    const oldConfig = this.renderingConfig;
    this.renderingConfig = config;
    this.trackChange('renderingConfig', oldConfig, config);
    // Dedicated event — template consumers listen for this, not the generic
    // change:renderingConfig channel
    this.emitter.emit('rendering-config:changed', config);
  }

  /**
   * Phase 2: Get port rendering configuration
   */
  getRenderingConfig(): any | undefined {
    return this.renderingConfig;
  }

  /**
   * Phase 2: Get effective visibility considering port and node configuration
   * Priority: port config > node metadata > default ('on-hover')
   */
  getEffectiveVisibility(
    node: any,
    globalDefault?: 'always' | 'on-hover' | 'never' | 'hidden'
  ): 'always' | 'on-hover' | 'never' | 'hidden' {
    // Priority 1: Port's own rendering config
    if (this.renderingConfig?.visibility) {
      return this.renderingConfig.visibility;
    }

    // Priority 2: Node's metadata (legacy support)
    const nodeVisibility = node.getMetadata?.('portVisibility');
    if (nodeVisibility) {
      return nodeVisibility;
    }

    // Priority 3: the diagram's GLOBAL interaction config — previously this
    // hardcoded 'on-hover', silently ignoring portVisibility=ALWAYS
    return globalDefault ?? 'on-hover';
  }

  /**
   * Serialize to JSON
   */
  serialize(): SerializedPort {
    const serialized: SerializedPort = {
      id: this.id,
      uuid: this.uuid,
      type: this.type,
      version: this.version,
      metadata: Object.fromEntries(this.metadata),
      nodeId: this.nodeId,
      systemType: this.systemType,
      position: { ...this.position },
      alignment: { ...this.alignment },
      offset: { ...this.offset },
      index: this.index, // NEW: Serialize index
      // Infinity is not JSON-representable (stringify silently yields null);
      // emit null as the EXPLICIT "unlimited" sentinel so payloads round-trip.
      maxConnections: Number.isFinite(this.maxConnections) ? this.maxConnections : null,
      allowedTypes: Array.from(this.allowedTypes),
      visible: this.visible,
      style: { ...this.style },
      data: { ...this.data },
    };

    // Phase 2: Include template configuration if present
    if (this.renderingConfig) {
      serialized.renderingConfig = { ...this.renderingConfig };
    }

    // Wave 6: emit a key ONLY when the author actually set it. A port that uses
    // none of the new config must serialize to the byte-identical payload it
    // produced before wave 6 — otherwise every saved diagram in the wild would
    // churn on its next round-trip.
    if (this.group !== undefined) serialized.group = this.group;
    if (this.explicitSide) serialized.explicitSide = true;
    if (this.shape !== undefined) serialized.shape = { ...this.shape };
    if (this.label !== undefined) serialized.label = { ...this.label };
    if (this.layout !== undefined) {
      serialized.layout = { ...this.layout, args: this.layout.args ? { ...this.layout.args } : undefined };
    }
    if (this.fromSpot !== undefined) serialized.fromSpot = { ...this.fromSpot };
    if (this.toSpot !== undefined) serialized.toSpot = { ...this.toSpot };
    if (this.spread !== undefined) serialized.spread = { ...this.spread };
    if (this.dataType !== undefined) serialized.dataType = this.dataType;
    if (this.isConnectableStart !== undefined) serialized.isConnectableStart = this.isConnectableStart;
    if (this.isConnectableEnd !== undefined) serialized.isConnectableEnd = this.isConnectableEnd;
    if (this.fromMaxLinks !== undefined) {
      // Same sentinel discipline as maxConnections: Infinity JSON-ifies to null
      // and silently became "0 links allowed" the last time we shipped a cap.
      serialized.fromMaxLinks = Number.isFinite(this.fromMaxLinks as number)
        ? (this.fromMaxLinks as number)
        : null;
    }
    if (this.toMaxLinks !== undefined) {
      serialized.toMaxLinks = Number.isFinite(this.toMaxLinks as number)
        ? (this.toMaxLinks as number)
        : null;
    }
    if (this.allowSelfLink !== undefined) serialized.allowSelfLink = this.allowSelfLink;
    if (this.allowDuplicateLinks !== undefined) serialized.allowDuplicateLinks = this.allowDuplicateLinks;
    if (this.dynamic !== undefined) serialized.dynamic = this.dynamic;

    return serialized;
  }

  /**
   * Deserialize from JSON
   */
  static fromJSON(data: SerializedPort): PortModel {
    const port = new PortModel({
      id: data.id,
      type: data.type,
      systemType: data.systemType,
      position: data.position,
      alignment: data.alignment,
      index: data.index, // NEW: Restore index (will be undefined for old diagrams)
      maxConnections: data.maxConnections ?? undefined, // null sentinel -> unlimited
    });

    port.nodeId = data.nodeId;
    port.offset = data.offset;

    // NEW: Backward compatibility - if index is undefined, default to 0
    if (data.index === undefined) {
      port.index = 0;
    }

    port.allowedTypes = new Set(data.allowedTypes);
    port.visible = data.visible;
    port.style = data.style; // BUG FIX: was using data.data for style
    port.data = data.data;

    // Phase 2: Restore template configuration if present
    if (data.renderingConfig) {
      port.renderingConfig = data.renderingConfig;
    }

    // Wave 6. `explicitSide` is written only when true, so its absence on a
    // pre-wave-6 payload means "no group existed" — and a port with no group
    // reads its side straight off `alignment` either way, so `false` is safe.
    port.explicitSide = data.explicitSide === true;
    if (data.group !== undefined) port.group = data.group;
    if (data.shape !== undefined) port.shape = data.shape;
    if (data.label !== undefined) port.label = data.label;
    if (data.layout !== undefined) port.layout = data.layout;
    if (data.fromSpot !== undefined) port.fromSpot = data.fromSpot;
    if (data.toSpot !== undefined) port.toSpot = data.toSpot;
    if (data.spread !== undefined) port.spread = data.spread;
    if (data.dataType !== undefined) port.dataType = data.dataType;
    if (data.isConnectableStart !== undefined) port.isConnectableStart = data.isConnectableStart;
    if (data.isConnectableEnd !== undefined) port.isConnectableEnd = data.isConnectableEnd;
    // null is the EXPLICIT "unlimited" sentinel — keep it, don't coerce it away.
    if (data.fromMaxLinks !== undefined) port.fromMaxLinks = data.fromMaxLinks;
    if (data.toMaxLinks !== undefined) port.toMaxLinks = data.toMaxLinks;
    if (data.allowSelfLink !== undefined) port.allowSelfLink = data.allowSelfLink;
    if (data.allowDuplicateLinks !== undefined) port.allowDuplicateLinks = data.allowDuplicateLinks;
    if (data.dynamic !== undefined) port.dynamic = data.dynamic;

    // Restore metadata
    for (const [key, value] of Object.entries(data.metadata)) {
      port.metadata.set(key, value);
    }

    // Last: restore persisted identity (uuid) and mutation counter (version).
    port.restoreIdentity(data);

    return port;
  }
}
