// NodeModel - Represents a node in the diagram

import { DiagramEntity } from './DiagramEntity';
import { PortModel, SerializedPort } from './PortModel';
import type {
  Point,
  Size,
  BoundingBox,
  NodeState,
  NodeBehavior,
  NodeStyle,
  ValidationResult,
  SerializedEntity,
} from '../types';
import { createBoundingBox } from '../utils';

export interface SerializedNode extends SerializedEntity {
  position: Point;
  size: Size;
  rotation: number;
  scale: Point;
  type: string;
  systemType?: string;
  definitionId?: string;
  parentId?: string;
  children: string[];
  ports: SerializedPort[];
  state: NodeState;
  behavior: NodeBehavior;
  style: Partial<NodeStyle>;
  data: Record<string, any>;
  behaviorOverrides?: Record<string, Partial<NodeBehavior>>; // Mode-specific behavior overrides
}

export class NodeModel extends DiagramEntity {
  // Position & Transform
  position: Point;
  size: Size;
  rotation: number = 0;
  scale: Point = { x: 1, y: 1 };

  // Type System
  type: string;
  systemType?: string;
  definitionId?: string;

  // Hierarchy
  parentId?: string;
  children: Set<string> = new Set();
  depth: number = 0;

  // Ports
  ports: Map<string, PortModel> = new Map();

  // State
  state: NodeState = {
    visible: true,
    locked: false,
    selected: false,
    hovered: false,
    focused: false,
    expanded: true,
    enabled: true,
  };

  // Behavior
  behavior: NodeBehavior = {
    selectable: true,
    draggable: true,
    resizable: true,
    rotatable: false,
    deletable: true,
    editable: true,
    connectable: true,
    groupable: true,
    cloneable: true,
  };

  // Mode-specific behavior overrides
  behaviorOverrides: Map<string, Partial<NodeBehavior>> = new Map();

  // Styling
  style: Partial<NodeStyle> = {};
  classes: Set<string> = new Set();

  // User Data
  data: Record<string, any> = {};
  computed: Map<string, any> = new Map();

  constructor(config: {
    id?: string;
    type: string;
    position: Point;
    size?: Size;
    systemType?: string;
    definitionId?: string;
  }) {
    super(config.id);

    this.type = config.type;
    this.systemType = config.systemType;
    this.definitionId = config.definitionId;
    this.position = { ...config.position };
    this.size = config.size || { width: 100, height: 50 };
  }

  /**
   * Set position
   */
  setPosition(x: number, y: number, z?: number): void {
    const oldPosition = { ...this.position };
    this.position = { x, y, z };
    this.trackChange('position', oldPosition, this.position);
  }

  /**
   * Move by delta
   */
  move(dx: number, dy: number, dz?: number): void {
    this.setPosition(
      this.position.x + dx,
      this.position.y + dy,
      this.position.z !== undefined && dz !== undefined
        ? this.position.z + dz
        : this.position.z
    );
  }

  /**
   * Set size
   */
  setSize(width: number, height: number, depth?: number): void {
    const oldSize = { ...this.size };
    this.size = { width, height, depth };
    this.trackChange('size', oldSize, this.size);
  }

  /**
   * Resize by delta
   */
  resize(dw: number, dh: number, dd?: number): void {
    this.setSize(
      this.size.width + dw,
      this.size.height + dh,
      this.size.depth !== undefined && dd !== undefined
        ? this.size.depth + dd
        : this.size.depth
    );
  }

  /**
   * Set rotation
   */
  setRotation(degrees: number): void {
    const oldRotation = this.rotation;
    this.rotation = degrees % 360;
    this.trackChange('rotation', oldRotation, this.rotation);
  }

  /**
   * Rotate by delta
   */
  rotate(degrees: number): void {
    this.setRotation(this.rotation + degrees);
  }

  /**
   * Set scale
   */
  setScale(x: number, y: number): void {
    const oldScale = { ...this.scale };
    this.scale = { x, y };
    this.trackChange('scale', oldScale, this.scale);
  }

  /**
   * Add port
   */
  addPort(port: PortModel): void {
    if (this.ports.has(port.id)) {
      throw new Error(`Port with id ${port.id} already exists`);
    }

    port.nodeId = this.id;
    this.ports.set(port.id, port);
    this.trackChange('ports', null, port);
    this.emitter.emit('port:added', port);
  }

  /**
   * Remove port
   */
  removePort(portId: string): PortModel | undefined {
    const port = this.ports.get(portId);
    if (port) {
      this.ports.delete(portId);
      this.trackChange('ports', port, null);
      this.emitter.emit('port:removed', port);
    }
    return port;
  }

  /**
   * Get port by ID
   */
  getPort(portId: string): PortModel | undefined {
    return this.ports.get(portId);
  }

  /**
   * Get all ports
   */
  getPorts(): PortModel[] {
    return Array.from(this.ports.values());
  }

  /**
   * Get ports by type
   */
  getPortsByType(type: 'input' | 'output' | 'bi'): PortModel[] {
    return this.getPorts().filter((p) => p.type === type);
  }

  /**
   * Set state property
   */
  setState(state: Partial<NodeState>): void {
    const oldState = { ...this.state };
    this.state = { ...this.state, ...state };
    this.trackChange('state', oldState, this.state);
  }

  /**
   * Set behavior property
   */
  setBehavior(behavior: Partial<NodeBehavior>): void {
    const oldBehavior = { ...this.behavior };
    this.behavior = { ...this.behavior, ...behavior };
    this.trackChange('behavior', oldBehavior, this.behavior);
  }

  /**
   * Set style property
   */
  setStyle(style: Partial<NodeStyle>): void {
    const oldStyle = { ...this.style };
    this.style = { ...this.style, ...style };
    this.trackChange('style', oldStyle, this.style);
  }

  /**
   * Add CSS class
   */
  addClass(className: string): void {
    if (!this.classes.has(className)) {
      this.classes.add(className);
      this.trackChange('classes', null, className);
    }
  }

  /**
   * Remove CSS class
   */
  removeClass(className: string): void {
    if (this.classes.has(className)) {
      this.classes.delete(className);
      this.trackChange('classes', className, null);
    }
  }

  /**
   * Set data property
   */
  setData(key: string, value: any): void {
    const oldValue = this.data[key];
    this.data[key] = value;
    this.trackChange(`data.${key}`, oldValue, value);
  }

  /**
   * Get data property
   */
  getData(key: string): any {
    return this.data[key];
  }

  /**
   * Set computed property
   */
  setComputed(key: string, value: any): void {
    this.computed.set(key, value);
  }

  /**
   * Get computed property
   */
  getComputed(key: string): any {
    return this.computed.get(key);
  }

  /**
   * Get bounding box
   */
  getBoundingBox(): BoundingBox {
    return createBoundingBox(this.position, this.size);
  }

  /**
   * Get center point
   */
  getCenter(): Point {
    return {
      x: this.position.x,
      y: this.position.y,
      z: this.position.z,
    };
  }

  /**
   * Check if point is inside node
   */
  containsPoint(point: Point): boolean {
    const bounds = this.getBoundingBox();
    return (
      point.x >= bounds.left &&
      point.x <= bounds.right &&
      point.y >= bounds.top &&
      point.y <= bounds.bottom
    );
  }

  /**
   * Check if intersects with bounding box
   */
  intersectsBounds(bounds: BoundingBox): boolean {
    const myBounds = this.getBoundingBox();
    return !(
      myBounds.right < bounds.left ||
      myBounds.left > bounds.right ||
      myBounds.bottom < bounds.top ||
      myBounds.top > bounds.bottom
    );
  }

  /**
   * Set parent
   */
  setParent(parentId: string | undefined): void {
    const oldParent = this.parentId;
    this.parentId = parentId;
    this.trackChange('parentId', oldParent, parentId);
  }

  /**
   * Add child
   */
  addChild(childId: string): void {
    if (!this.children.has(childId)) {
      this.children.add(childId);
      this.trackChange('children', null, childId);
    }
  }

  /**
   * Remove child
   */
  removeChild(childId: string): void {
    if (this.children.has(childId)) {
      this.children.delete(childId);
      this.trackChange('children', childId, null);
    }
  }

  /**
   * Set behavior override for specific mode
   */
  setBehaviorOverride(mode: string, behavior: Partial<NodeBehavior>): void {
    this.behaviorOverrides.set(mode, behavior);
    this.incrementVersion();
  }

  /**
   * Clear behavior override for specific mode
   */
  clearBehaviorOverride(mode: string): void {
    this.behaviorOverrides.delete(mode);
    this.incrementVersion();
  }

  /**
   * Get behavior override for specific mode
   */
  getBehaviorOverride(mode: string): Partial<NodeBehavior> | undefined {
    return this.behaviorOverrides.get(mode);
  }

  /**
   * Clear all behavior overrides
   */
  clearAllBehaviorOverrides(): void {
    this.behaviorOverrides.clear();
    this.incrementVersion();
  }

  /**
   * Serialize to JSON
   */
  serialize(): SerializedNode {
    const serialized: SerializedNode = {
      id: this.id,
      uuid: this.uuid,
      type: this.type,
      version: this.version,
      metadata: Object.fromEntries(this.metadata),
      position: { ...this.position },
      size: { ...this.size },
      rotation: this.rotation,
      scale: { ...this.scale },
      systemType: this.systemType,
      definitionId: this.definitionId,
      parentId: this.parentId,
      children: Array.from(this.children),
      ports: Array.from(this.ports.values()).map((p) => p.serialize()),
      state: { ...this.state },
      behavior: { ...this.behavior },
      style: { ...this.style },
      data: { ...this.data },
    };

    // Include behavior overrides if any exist
    if (this.behaviorOverrides.size > 0) {
      serialized.behaviorOverrides = Object.fromEntries(this.behaviorOverrides);
    }

    return serialized;
  }

  /**
   * Deserialize from JSON
   */
  static fromJSON(data: SerializedNode): NodeModel {
    const node = new NodeModel({
      id: data.id,
      type: data.type,
      position: data.position,
      size: data.size,
      systemType: data.systemType,
      definitionId: data.definitionId,
    });

    node.rotation = data.rotation;
    node.scale = data.scale;
    node.parentId = data.parentId;
    node.children = new Set(data.children);
    node.state = data.state;
    node.behavior = data.behavior;
    node.style = data.style;
    node.data = data.data;

    // Restore metadata
    for (const [key, value] of Object.entries(data.metadata)) {
      node.metadata.set(key, value);
    }

    // Restore ports
    for (const portData of data.ports) {
      const port = PortModel.fromJSON(portData);
      node.ports.set(port.id, port);
    }

    // Restore behavior overrides
    if (data.behaviorOverrides) {
      for (const [mode, behavior] of Object.entries(data.behaviorOverrides)) {
        node.behaviorOverrides.set(mode, behavior);
      }
    }

    return node;
  }
}
