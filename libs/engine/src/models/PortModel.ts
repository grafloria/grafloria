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

export interface SerializedPort extends SerializedEntity {
  nodeId: string;
  type: 'input' | 'output' | 'bi';
  systemType?: string;
  position: PortPosition;
  alignment: PortAlignment;
  offset: Point;
  index: number; // NEW: For multiple ports per side
  maxConnections: number;
  allowedTypes: string[];
  visible: boolean;
  style: Record<string, any>;
  data: Record<string, any>;
  renderingConfig?: any; // Phase 2: Port rendering configuration from templates
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

  // Visual
  visible: boolean = true;
  style: Record<string, any> = {};

  // User data
  data: Record<string, any> = {};

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
  }) {
    super(config.id);

    this.type = config.type;
    this.systemType = config.systemType;

    // NEW: Support 'side' as shorthand for alignment
    if (config.side) {
      this.alignment = { side: config.side, offset: 0 };
    } else if (config.alignment) {
      this.alignment = config.alignment;
    }

    if (config.position) {
      this.position = config.position;
    }

    // NEW: Set index
    if (config.index !== undefined) {
      this.index = config.index;
    }

    if (config.maxConnections !== undefined) {
      this.maxConnections = config.maxConnections;
    }
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
  addConnection(linkId: string): void {
    if (this.currentConnections.size >= this.maxConnections) {
      throw new Error(
        `Port ${this.id} has reached max connections (${this.maxConnections})`
      );
    }

    if (!this.currentConnections.has(linkId)) {
      this.currentConnections.add(linkId);
      this.trackChange('connections', null, linkId);
    }
  }

  /**
   * Remove connection
   */
  removeConnection(linkId: string): void {
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
   * Check if this port can connect to another port
   * Validates direction compatibility (input/output rules)
   *
   * Rules:
   * - input can connect to output or bi
   * - output can connect to input or bi
   * - bi can connect to any
   */
  canConnectTo(targetPort: PortModel): boolean {
    // Check if both ports can accept more connections
    if (!this.canConnect() || !targetPort.canConnect()) {
      return false;
    }

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
  getEffectiveVisibility(node: any): 'always' | 'on-hover' | 'never' {
    // Priority 1: Port's own rendering config
    if (this.renderingConfig?.visibility) {
      return this.renderingConfig.visibility;
    }

    // Priority 2: Node's metadata (legacy support)
    const nodeVisibility = node.getMetadata?.('portVisibility');
    if (nodeVisibility) {
      return nodeVisibility;
    }

    // Default: on-hover
    return 'on-hover';
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
      maxConnections: this.maxConnections,
      allowedTypes: Array.from(this.allowedTypes),
      visible: this.visible,
      style: { ...this.style },
      data: { ...this.data },
    };

    // Phase 2: Include template configuration if present
    if (this.renderingConfig) {
      serialized.renderingConfig = { ...this.renderingConfig };
    }

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
      maxConnections: data.maxConnections,
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

    // Restore metadata
    for (const [key, value] of Object.entries(data.metadata)) {
      port.metadata.set(key, value);
    }

    return port;
  }
}
