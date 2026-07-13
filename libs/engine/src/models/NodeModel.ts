// NodeModel - Represents a node in the diagram
// Layout item configuration storage added in Phase 1.7

import { DiagramEntity } from './DiagramEntity';
import type { DiagramModel } from './DiagramModel';
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
import type { TransformMatrix } from '../types/geometry.types';
import type { FlexItemConfig, GridItemConfig } from '../types/layout.types';
import { createBoundingBox } from '../utils';
import {
  composeMatrices,
  createTranslateMatrix,
  createRotateMatrix,
  createScaleMatrix,
  transformPoint,
  invertMatrix,
} from '../utils/transform';

/**
 * Positioning mode (Phase 1.6a)
 * - absolute: Position relative to diagram origin (default, backward compatible)
 * - relative: Position relative to parent
 * - layout: Position managed by parent's layout algorithm (future)
 */
export type PositioningMode = 'absolute' | 'relative' | 'layout';

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
  positionMode?: PositioningMode; // Phase 1.6a: Positioning mode
  transformOrigin?: Point; // Phase 1.6a: Transform origin (normalized 0-1)
  flexConfig?: FlexItemConfig; // Phase 1.7: Flexbox item configuration
  gridConfig?: GridItemConfig; // Phase 1.7: Grid item configuration
  portRenderingConfig?: any; // Phase 2: Port rendering configuration
  dragHandlerConfig?: any; // Phase 2: Drag handler configuration
  connectionGroup?: string; // Phase 2: Connection group identifier
}

export class NodeModel extends DiagramEntity {
  // Diagram reference (Phase 1.6a) - Non-enumerable to prevent circular cloning
  diagram?: DiagramModel;

  // Position & Transform
  position: Point;
  size: Size;
  rotation: number = 0;
  scale: Point = { x: 1, y: 1 };
  positionMode: PositioningMode = 'absolute'; // Phase 1.6a: Default to absolute for backward compatibility
  transformOrigin: Point = { x: 0.5, y: 0.5 }; // Phase 1.6a: Default to center (normalized 0-1)

  // Phase 1.7: Layout item configuration
  flexConfig?: FlexItemConfig;
  gridConfig?: GridItemConfig;

  // Phase 2: Template system support
  portRenderingConfig?: any; // PortRenderingConfig from templates
  dragHandlerConfig?: any; // DragHandlerConfig from templates
  connectionGroup?: string; // Connection group identifier

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

    // Define diagram property as non-enumerable to prevent circular reference issues (Phase 1.6a)
    Object.defineProperty(this, 'diagram', {
      value: undefined,
      writable: true,
      enumerable: false,
      configurable: true
    });

    // Phase 0.5.1: Auto-create default ports (industry standard)
    this.initializeDefaultPorts();
  }

  /**
   * Initialize default ports (Phase 0.5.1)
   * Creates 4 bidirectional ports (top, right, bottom, left) automatically
   * This matches industry standards (Draw.io, Lucidchart, mxGraph, yFiles)
   *
   * Ports can be accessed via:
   * - node.getPortBySide('top')
   * - node.getPortsBySide('right')
   * - node.getPorts() // all ports
   */
  private initializeDefaultPorts(): void {
    const defaultPorts = [
      { side: 'top' as const, position: { x: 0.5, y: 0 } },
      { side: 'right' as const, position: { x: 1, y: 0.5 } },
      { side: 'bottom' as const, position: { x: 0.5, y: 1 } },
      { side: 'left' as const, position: { x: 0, y: 0.5 } },
    ];

    defaultPorts.forEach(({side, position}) => {
      const port = new PortModel({
        type: 'bi', // Bidirectional - can act as input or output
        side,
        position,
        index: 0, // First (and only) port on this side
      });
      port.nodeId = this.id;
      port.setMetadata('default', true); // Mark as auto-created
      port.setMetadata('side', side); // Store side for easy querying
      this.ports.set(port.id, port);
    });
  }

  /**
   * Set position
   */
  setPosition(x: number, y: number, z?: number): void {
    const oldPosition = { ...this.position };
    this.position = { x, y, z };
    this.trackChange('position', oldPosition, this.position);

    // Emit transform propagation event (Phase 1.6a Part 4)
    this.emitTransformPropagated('position', this.position);
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

    // Emit transform propagation event (Phase 1.6a Part 4)
    this.emitTransformPropagated('rotation', this.rotation);
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

    // Emit transform propagation event (Phase 1.6a Part 4)
    this.emitTransformPropagated('scale', this.scale);
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
   * Links arriving at this node (resolved through the owning diagram; empty
   * when the node isn't attached to a diagram yet)
   */
  getIncomingLinks(): import('./LinkModel').LinkModel[] {
    const diagram = (this as any).diagram as DiagramModel | undefined;
    if (!diagram?.getLinks) return [];
    return diagram.getLinks().filter((link) => link.targetNodeId === this.id);
  }

  /**
   * Links leaving this node (resolved through the owning diagram)
   */
  getOutgoingLinks(): import('./LinkModel').LinkModel[] {
    const diagram = (this as any).diagram as DiagramModel | undefined;
    if (!diagram?.getLinks) return [];
    return diagram.getLinks().filter((link) => link.sourceNodeId === this.id);
  }

  /**
   * Get ports by type
   */
  getPortsByType(type: 'input' | 'output' | 'bi'): PortModel[] {
    return this.getPorts().filter((p) => p.type === type);
  }

  /**
   * Get port by side (Phase 0.5.1)
   * Returns the first port found on the specified side
   *
   * @param side - The side to search ('top', 'right', 'bottom', 'left')
   * @returns The first port on that side, or undefined if none found
   */
  getPortBySide(side: 'top' | 'right' | 'bottom' | 'left'): PortModel | undefined {
    return Array.from(this.ports.values()).find((port) => port.side === side);
  }

  /**
   * Get all ports on a specific side (Phase 0.5.1)
   * Useful for nodes with multiple ports per side
   *
   * @param side - The side to search ('top', 'right', 'bottom', 'left')
   * @returns Array of ports on that side, sorted by index
   */
  getPortsBySide(side: 'top' | 'right' | 'bottom' | 'left'): PortModel[] {
    return Array.from(this.ports.values())
      .filter((port) => port.side === side)
      .sort((a, b) => a.index - b.index); // Sort by index for consistent ordering
  }

  /**
   * Get available ports that can accept connections (Phase 0.5.1)
   *
   * @param type - Optional filter by port type ('input', 'output', 'bi')
   * @returns Array of ports that can accept more connections
   */
  getAvailablePorts(type?: 'input' | 'output' | 'bi'): PortModel[] {
    let ports = Array.from(this.ports.values());

    if (type) {
      ports = ports.filter((port) => port.type === type || port.type === 'bi');
    }

    return ports.filter((port) => port.canConnect());
  }

  /**
   * Get ports that have active connections (Phase 0.5.1)
   *
   * @returns Array of ports with at least one connection
   */
  getConnectedPorts(): PortModel[] {
    return Array.from(this.ports.values()).filter(
      (port) => port.getConnectionCount() > 0
    );
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
   * Check if node is selected
   */
  isSelected(): boolean {
    return this.state.selected;
  }

  /**
   * Set selection state
   * @param selected - Whether the node should be selected
   * @emits node:selected when node becomes selected
   * @emits node:deselected when node becomes deselected
   */
  setSelected(selected: boolean): void {
    if (this.state.selected === selected) {
      return; // No change
    }

    const oldState = { ...this.state };
    this.state.selected = selected;
    this.trackChange('state', oldState, this.state);

    // Emit specific selection events
    this.emitter.emit(selected ? 'node:selected' : 'node:deselected', this);
  }

  /**
   * Check if node is highlighted (attention state, independent of selection)
   */
  isHighlighted(): boolean {
    return this.state.highlighted === true;
  }

  /**
   * Set highlight state (attention emphasis without selecting the node)
   * @param highlighted - Whether the node should be highlighted
   * @emits node:highlighted when node becomes highlighted
   * @emits node:unhighlighted when node stops being highlighted
   */
  setHighlighted(highlighted: boolean): void {
    if (this.isHighlighted() === highlighted) {
      return; // No change
    }

    const oldState = { ...this.state };
    this.state.highlighted = highlighted;
    this.trackChange('state', oldState, this.state);

    this.emitter.emit(highlighted ? 'node:highlighted' : 'node:unhighlighted', this);
  }

  /**
   * Check if node is selectable (based on behavior)
   * Note: Locked nodes are still selectable so users can unlock them
   */
  isSelectable(): boolean {
    return this.behavior.selectable;
  }

  /**
   * Check if node is draggable (based on behavior and state)
   * Note: Locked nodes cannot be dragged
   */
  isDraggable(): boolean {
    return this.behavior.draggable && !this.state.locked;
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
   * Get world position (absolute coordinates accounting for parent chain)
   * For nodes without parents, this is the same as position
   * For child nodes, this walks up the parent chain and accumulates offsets
   */
  getWorldPosition(): Point {
    let worldX = this.position.x;
    let worldY = this.position.y;
    let worldZ = this.position.z || 0;

    // Walk up parent chain
    let currentParentId = this.parentId;
    while (currentParentId && this.diagram) {
      const parentNode = this.diagram.getNode(currentParentId);
      if (parentNode) {
        worldX += parentNode.position.x;
        worldY += parentNode.position.y;
        worldZ += parentNode.position.z || 0;
        currentParentId = parentNode.parentId;
      } else {
        break;
      }
    }

    return { x: worldX, y: worldY, z: worldZ };
  }

  /**
   * Get bounding box in world coordinates
   * For child nodes, this accounts for parent position
   */
  getBoundingBox(): BoundingBox {
    const worldPos = this.getWorldPosition();
    return createBoundingBox(worldPos, this.size);
  }

  /**
   * Get center point in world coordinates
   */
  getCenter(): Point {
    const worldPos = this.getWorldPosition();
    return {
      x: worldPos.x + this.size.width / 2,
      y: worldPos.y + this.size.height / 2,
      z: worldPos.z,
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
    this.version++;
  }

  /**
   * Clear behavior override for specific mode
   */
  clearBehaviorOverride(mode: string): void {
    this.behaviorOverrides.delete(mode);
    this.version++;
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
    this.version++;
  }

  /**
   * Set transform origin (Phase 1.6a)
   * @param x Normalized X coordinate (0-1)
   * @param y Normalized Y coordinate (0-1)
   */
  setTransformOrigin(x: number, y: number): void {
    const oldOrigin = { ...this.transformOrigin };
    this.transformOrigin = { x, y };
    this.trackChange('transformOrigin', oldOrigin, this.transformOrigin);

    // Emit transform propagation event (Phase 1.6a Part 4)
    this.emitTransformPropagated('transformOrigin', this.transformOrigin);
  }

  /**
   * Get absolute transform origin in pixels (Phase 1.6a)
   */
  getAbsoluteTransformOrigin(): Point {
    return {
      x: this.transformOrigin.x * this.size.width,
      y: this.transformOrigin.y * this.size.height,
      z: this.transformOrigin.z !== undefined && this.size.depth !== undefined
        ? this.transformOrigin.z * this.size.depth
        : 0
    };
  }

  /**
   * Get local position (Phase 1.6a)
   * Returns the position property as-is
   */
  getLocalPosition(): Point {
    return { ...this.position };
  }

  /**
   * Get global position (Phase 1.6a)
   * In absolute mode: returns position as-is
   * In relative mode: transforms position by parent's hierarchy transform
   */
  getGlobalPosition(): Point {
    if (this.positionMode === 'absolute' || !this.parentId) {
      return { ...this.position };
    }

    // In relative mode with parent: apply parent's hierarchy transform
    const parent = this.getParentNode();
    if (!parent) {
      return { ...this.position };
    }

    // For hierarchical positioning, apply: scale -> rotate -> translate
    // (without transform origin offsets which are for visual transforms)
    const parentGlobalPos = parent.getGlobalPosition();

    // Scale child position by parent's scale
    let x = this.position.x * parent.scale.x;
    let y = this.position.y * parent.scale.y;

    // Rotate scaled position by parent's rotation
    if (parent.rotation !== 0) {
      const cos = Math.cos(parent.rotation);
      const sin = Math.sin(parent.rotation);
      const rotatedX = x * cos - y * sin;
      const rotatedY = x * sin + y * cos;
      x = rotatedX;
      y = rotatedY;
    }

    // Add parent's global position
    return {
      x: parentGlobalPos.x + x,
      y: parentGlobalPos.y + y,
      z: (this.position.z ?? 0) + (parentGlobalPos.z ?? 0)
    };
  }

  /**
   * Set local position (Phase 1.6a)
   * Sets position directly and switches to relative mode
   */
  setLocalPosition(x: number, y: number, z?: number): void {
    this.positionMode = 'relative';
    this.setPosition(x, y, z);
  }

  /**
   * Set global position (Phase 1.6a)
   * Converts global coordinates to local if parent exists
   */
  setGlobalPosition(x: number, y: number, z?: number): void {
    if (!this.parentId) {
      this.setPosition(x, y, z);
      return;
    }

    const parent = this.getParentNode();
    if (!parent) {
      this.setPosition(x, y, z);
      return;
    }

    // Convert global to local by inverting parent's hierarchy transform
    this.positionMode = 'relative';
    const parentGlobalPos = parent.getGlobalPosition();

    // Subtract parent's global position
    let localX = x - parentGlobalPos.x;
    let localY = y - parentGlobalPos.y;

    // Rotate by -parent.rotation
    if (parent.rotation !== 0) {
      const cos = Math.cos(-parent.rotation);
      const sin = Math.sin(-parent.rotation);
      const rotatedX = localX * cos - localY * sin;
      const rotatedY = localX * sin + localY * cos;
      localX = rotatedX;
      localY = rotatedY;
    }

    // Divide by parent's scale
    localX /= parent.scale.x;
    localY /= parent.scale.y;

    this.setPosition(localX, localY, z !== undefined ? z - (parentGlobalPos.z ?? 0) : undefined);
  }

  /**
   * Get local transform matrix (Phase 1.6a)
   * Composes translation, rotation, and scale relative to transform origin
   */
  getLocalTransformMatrix(): TransformMatrix {
    const origin = this.getAbsoluteTransformOrigin();

    // Compose: translate to position, rotate around origin, scale around origin
    // Order: translate-to-origin, scale, rotate, translate-back, translate-to-position
    return composeMatrices(
      createTranslateMatrix(this.position.x, this.position.y),
      createTranslateMatrix(origin.x, origin.y),
      createRotateMatrix(this.rotation),
      createScaleMatrix(this.scale.x, this.scale.y),
      createTranslateMatrix(-origin.x, -origin.y)
    );
  }

  /**
   * Get global transform matrix (Phase 1.6a)
   * In absolute mode: returns local matrix
   * In relative mode: composes parent's global matrix with local matrix
   */
  getGlobalTransformMatrix(): TransformMatrix {
    const localMatrix = this.getLocalTransformMatrix();

    if (this.positionMode === 'absolute' || !this.parentId) {
      return localMatrix;
    }

    const parent = this.getParentNode();
    if (!parent) {
      return localMatrix;
    }

    const parentMatrix = parent.getGlobalTransformMatrix();
    return composeMatrices(parentMatrix, localMatrix);
  }

  /**
   * Get global bounding box (Phase 1.6a)
   * Calculates bounds by transforming all 4 corners through global matrix
   */
  getGlobalBounds(): BoundingBox {
    const matrix = this.getGlobalTransformMatrix();

    // Get 4 corners in local space
    const corners = [
      { x: 0, y: 0 },
      { x: this.size.width, y: 0 },
      { x: this.size.width, y: this.size.height },
      { x: 0, y: this.size.height }
    ];

    // Transform all corners
    const transformedCorners = corners.map(corner => transformPoint(corner, matrix));

    // Find min/max to create axis-aligned bounding box
    const xs = transformedCorners.map(p => p.x);
    const ys = transformedCorners.map(p => p.y);

    const left = Math.min(...xs);
    const right = Math.max(...xs);
    const top = Math.min(...ys);
    const bottom = Math.max(...ys);

    return {
      left,
      top,
      right,
      bottom,
      width: right - left,
      height: bottom - top
    };
  }

  /**
   * Helper to get parent node (Phase 1.6a)
   * Uses diagram reference to look up parent by ID
   */
  private getParentNode(): NodeModel | undefined {
    if (!this.parentId || !this.diagram) {
      return undefined;
    }
    return this.diagram.getNode(this.parentId);
  }

  /**
   * Get direct children nodes (Phase 1.6a Part 3)
   */
  getChildren(): NodeModel[] {
    if (!this.diagram) {
      return [];
    }

    const children: NodeModel[] = [];
    for (const childId of this.children) {
      const child = this.diagram.getNode(childId);
      if (child) {
        children.push(child);
      }
    }
    return children;
  }

  /**
   * Get parent node (Phase 1.6a Part 3)
   * Public version of getParentNode
   */
  getParent(): NodeModel | undefined {
    return this.getParentNode();
  }

  /**
   * Get all ancestor nodes up to root (Phase 1.6a Part 3)
   * Returns array with direct parent first, then grandparent, etc.
   */
  getAncestors(): NodeModel[] {
    const ancestors: NodeModel[] = [];
    let current = this.getParent();

    while (current) {
      ancestors.push(current);
      current = current.getParent();
    }

    return ancestors;
  }

  /**
   * Get all descendant nodes recursively (Phase 1.6a Part 3)
   */
  getDescendants(): NodeModel[] {
    const descendants: NodeModel[] = [];
    const children = this.getChildren();

    for (const child of children) {
      descendants.push(child);
      descendants.push(...child.getDescendants());
    }

    return descendants;
  }

  /**
   * Get root node of hierarchy (Phase 1.6a Part 3)
   * Returns self if this is the root
   */
  getRoot(): NodeModel {
    let current: NodeModel = this;
    let parent = current.getParent();

    while (parent) {
      current = parent;
      parent = current.getParent();
    }

    return current;
  }

  /**
   * Get sibling nodes (same parent, excluding self) (Phase 1.6a Part 3)
   */
  getSiblings(): NodeModel[] {
    const parent = this.getParent();
    if (!parent) {
      return [];
    }

    return parent.getChildren().filter(child => child.id !== this.id);
  }

  /**
   * Check if this node is an ancestor of another node (Phase 1.6a Part 3)
   * @param nodeId ID of node to check
   * @returns true if this node is an ancestor of the given node
   */
  isAncestorOf(nodeId: string): boolean {
    if (nodeId === this.id) {
      return false; // Node is not ancestor of itself
    }

    if (!this.diagram) {
      return false;
    }

    const targetNode = this.diagram.getNode(nodeId);
    if (!targetNode) {
      return false;
    }

    const ancestors = targetNode.getAncestors();
    return ancestors.some(ancestor => ancestor.id === this.id);
  }

  /**
   * Get depth in hierarchy (Phase 1.6a Part 3)
   * Root nodes have depth 0, their children have depth 1, etc.
   * @returns depth level (0 = root)
   */
  getDepth(): number {
    let depth = 0;
    let current = this.getParent();

    while (current) {
      depth++;
      current = current.getParent();
    }

    return depth;
  }

  /**
   * Validate hierarchy for circular references (Phase 1.6a Part 3)
   * @returns true if hierarchy is valid (no cycles)
   */
  validateHierarchy(): boolean {
    const visited = new Set<string>();
    let current: NodeModel | undefined = this;

    while (current) {
      if (visited.has(current.id)) {
        // Found circular reference
        return false;
      }

      visited.add(current.id);
      current = current.getParent();
    }

    return true;
  }

  /**
   * Update depth for this node and all descendants (Phase 1.6a Part 3)
   * Recalculates depth values based on current hierarchy
   */
  updateHierarchyDepth(): void {
    // Update own depth
    this.depth = this.getDepth();

    // Recursively update children
    const children = this.getChildren();
    for (const child of children) {
      child.updateHierarchyDepth();
    }
  }

  /**
   * Get all nodes affected by transform changes (Phase 1.6a Part 4)
   * Returns this node plus all descendants in relative positioning mode
   * @returns Array of nodes that would be affected by this node's transform
   */
  getAffectedByTransform(): NodeModel[] {
    const affected: NodeModel[] = [this];
    const children = this.getChildren();

    for (const child of children) {
      // Only include children in relative mode (they inherit parent's transform)
      if (child.positionMode === 'relative') {
        affected.push(...child.getAffectedByTransform());
      }
    }

    return affected;
  }

  /**
   * Emit transform propagation event (Phase 1.6a Part 4)
   * Called after transform changes to notify renderers
   */
  private emitTransformPropagated(type: string, value: any): void {
    const affectedNodes = this.getAffectedByTransform();

    // Only emit if there are affected children (besides self)
    if (affectedNodes.length > 1) {
      this.emitter.emit('transform-propagated', {
        type,
        value,
        affectedNodes
      });
    }
  }

  /**
   * Set flexbox item configuration (Phase 1.7)
   */
  setFlexItem(config: FlexItemConfig): void {
    const oldConfig = this.flexConfig;
    this.flexConfig = config;
    this.trackChange('flexConfig', oldConfig, config);
    this.emitter.emit('flex-item:changed', config);
  }

  /**
   * Clear flexbox item configuration (Phase 1.7)
   */
  clearFlexItem(): void {
    const oldConfig = this.flexConfig;
    this.flexConfig = undefined;
    this.trackChange('flexConfig', oldConfig, undefined);
    this.emitter.emit('flex-item:cleared');
  }

  /**
   * Get flexbox item configuration (Phase 1.7)
   */
  getFlexItem(): FlexItemConfig | undefined {
    return this.flexConfig;
  }

  /**
   * Check if node has flex item configuration (Phase 1.7)
   */
  hasFlexItem(): boolean {
    return this.flexConfig !== undefined;
  }

  /**
   * Set grid item configuration (Phase 1.7)
   */
  setGridItem(config: GridItemConfig): void {
    const oldConfig = this.gridConfig;
    this.gridConfig = config;
    this.trackChange('gridConfig', oldConfig, config);
    this.emitter.emit('grid-item:changed', config);
  }

  /**
   * Clear grid item configuration (Phase 1.7)
   */
  clearGridItem(): void {
    const oldConfig = this.gridConfig;
    this.gridConfig = undefined;
    this.trackChange('gridConfig', oldConfig, undefined);
    this.emitter.emit('grid-item:cleared');
  }

  /**
   * Get grid item configuration (Phase 1.7)
   */
  getGridItem(): GridItemConfig | undefined {
    return this.gridConfig;
  }

  /**
   * Check if node has grid item configuration (Phase 1.7)
   */
  hasGridItem(): boolean {
    return this.gridConfig !== undefined;
  }

  // ========================================
  // Template Support Methods (Phase 2)
  // ========================================

  /**
   * Set port rendering configuration (Phase 2)
   */
  setPortRenderingConfig(config: any): void {
    const oldConfig = this.portRenderingConfig;
    this.portRenderingConfig = config;
    this.trackChange('portRenderingConfig', oldConfig, config);
    this.emitter.emit('port-rendering:changed', config);
  }

  /**
   * Get port rendering configuration (Phase 2)
   */
  getPortRenderingConfig(): any | undefined {
    return this.portRenderingConfig;
  }

  /**
   * Get port rendering mode (Phase 2)
   * Auto-detects based on configuration and metadata
   */
  getPortRenderingMode(): 'svg' | 'html' | 'auto' {
    // Priority 1: Explicit metadata override
    const metadataMode = this.getMetadata('portRenderingMode');
    if (metadataMode) {
      return metadataMode as 'svg' | 'html' | 'auto';
    }

    // Priority 2: Port rendering config
    if (this.portRenderingConfig?.mode) {
      return this.portRenderingConfig.mode;
    }

    // Priority 3: Auto-detect from HTML layer flag
    const useHTMLLayer = this.getMetadata('useHTMLLayer');
    if (useHTMLLayer === true) {
      return 'html';
    }

    // Default: SVG mode
    return 'svg';
  }

  /**
   * Set drag handler configuration (Phase 2)
   */
  setDragHandlerConfig(config: any): void {
    const oldConfig = this.dragHandlerConfig;
    this.dragHandlerConfig = config;
    this.trackChange('dragHandlerConfig', oldConfig, config);
    this.emitter.emit('drag-handler:changed', config);
  }

  /**
   * Get drag handler configuration (Phase 2)
   */
  getDragHandlerConfig(): any | undefined {
    return this.dragHandlerConfig;
  }

  /**
   * Check if this node is a drag handler (Phase 2)
   */
  isDragHandler(): boolean {
    return this.dragHandlerConfig?.isDragHandler === true;
  }

  /**
   * Set connection group (Phase 2)
   */
  setConnectionGroup(group: string): void {
    const oldGroup = this.connectionGroup;
    this.connectionGroup = group;
    this.trackChange('connectionGroup', oldGroup, group);
    this.emitter.emit('connection-group:changed', { group });
  }

  /**
   * Get connection group (Phase 2)
   */
  getConnectionGroup(): string | undefined {
    return this.connectionGroup;
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
      positionMode: this.positionMode, // Phase 1.6a
      transformOrigin: { ...this.transformOrigin }, // Phase 1.6a
    };

    // Include behavior overrides if any exist
    if (this.behaviorOverrides.size > 0) {
      serialized.behaviorOverrides = Object.fromEntries(this.behaviorOverrides);
    }

    // Phase 1.7: Include layout configs if they exist
    if (this.flexConfig) {
      serialized.flexConfig = { ...this.flexConfig };
    }
    if (this.gridConfig) {
      serialized.gridConfig = { ...this.gridConfig };
    }

    // Phase 2: Include template properties if they exist
    if (this.portRenderingConfig) {
      serialized.portRenderingConfig = { ...this.portRenderingConfig };
    }
    if (this.dragHandlerConfig) {
      serialized.dragHandlerConfig = { ...this.dragHandlerConfig };
    }
    if (this.connectionGroup) {
      serialized.connectionGroup = this.connectionGroup;
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

    // Restore Phase 1.6a properties (with defaults for backward compatibility)
    node.positionMode = data.positionMode || 'absolute';
    node.transformOrigin = data.transformOrigin || { x: 0.5, y: 0.5 };

    // Restore metadata
    for (const [key, value] of Object.entries(data.metadata)) {
      node.metadata.set(key, value);
    }

    // Restore ports. The SAVED port set is authoritative: the constructor
    // auto-creates default ports (Phase 0.5.1), and appending the serialized
    // ports on top of them made every save/load cycle GROW the set (4 defaults
    // + 4 restored = 8, then 12, …). Clear the auto-created defaults first so
    // a restored node has exactly the ports it was saved with — including
    // zero, if they were all removed. Legacy payloads with no `ports` field
    // keep the constructor defaults.
    if (Array.isArray(data.ports)) {
      node.ports.clear();
      for (const portData of data.ports) {
        const port = PortModel.fromJSON(portData);
        node.ports.set(port.id, port);
      }
    }

    // Restore behavior overrides
    if (data.behaviorOverrides) {
      for (const [mode, behavior] of Object.entries(data.behaviorOverrides)) {
        node.behaviorOverrides.set(mode, behavior);
      }
    }

    // Restore Phase 1.7 layout configs
    if (data.flexConfig) {
      node.flexConfig = data.flexConfig;
    }
    if (data.gridConfig) {
      node.gridConfig = data.gridConfig;
    }

    // Restore Phase 2 template properties (backward compatible)
    if ((data as any).portRenderingConfig) {
      node.portRenderingConfig = (data as any).portRenderingConfig;
    }
    if ((data as any).dragHandlerConfig) {
      node.dragHandlerConfig = (data as any).dragHandlerConfig;
    }
    if ((data as any).connectionGroup) {
      node.connectionGroup = (data as any).connectionGroup;
    }

    // Last: restore persisted identity (uuid) and mutation counter (version)
    // so a loaded node is indistinguishable from the one that was saved.
    node.restoreIdentity(data);

    return node;
  }
}
