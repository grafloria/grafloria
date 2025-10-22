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
  maxConnections: number;
  allowedTypes: string[];
  visible: boolean;
  style: Record<string, any>;
  data: Record<string, any>;
}

export class PortModel extends DiagramEntity {
  nodeId: string = '';
  type: 'input' | 'output' | 'bi';
  systemType?: string;

  // Positioning
  position: PortPosition = { x: 0.5, y: 0.5 };
  alignment: PortAlignment = { side: 'right', offset: 0 };
  offset: Point = { x: 0, y: 0 };

  // Constraints
  maxConnections: number = Infinity;
  currentConnections: Set<string> = new Set();
  allowedTypes: Set<string> = new Set();

  // Visual
  visible: boolean = true;
  style: Record<string, any> = {};

  // User data
  data: Record<string, any> = {};

  constructor(config: {
    id?: string;
    type: 'input' | 'output' | 'bi';
    systemType?: string;
    position?: PortPosition;
    alignment?: PortAlignment;
    maxConnections?: number;
  }) {
    super(config.id);

    this.type = config.type;
    this.systemType = config.systemType;

    if (config.position) {
      this.position = config.position;
    }

    if (config.alignment) {
      this.alignment = config.alignment;
    }

    if (config.maxConnections !== undefined) {
      this.maxConnections = config.maxConnections;
    }
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
   * Serialize to JSON
   */
  serialize(): SerializedPort {
    return {
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
      maxConnections: this.maxConnections,
      allowedTypes: Array.from(this.allowedTypes),
      visible: this.visible,
      style: { ...this.style },
      data: { ...this.data },
    };
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
      maxConnections: data.maxConnections,
    });

    port.nodeId = data.nodeId;
    port.offset = data.offset;
    port.allowedTypes = new Set(data.allowedTypes);
    port.visible = data.visible;
    port.style = data.data;
    port.data = data.data;

    // Restore metadata
    for (const [key, value] of Object.entries(data.metadata)) {
      port.metadata.set(key, value);
    }

    return port;
  }
}
