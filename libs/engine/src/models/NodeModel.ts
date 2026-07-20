// NodeModel - Represents a node in the diagram
// Layout item configuration storage added in Phase 1.7

import { DiagramEntity } from './DiagramEntity';
import { writeBlocked, isSystemWrite } from './readonly-lock'; // Wave 9 — Card 7
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

/**
 * wave14/model — the LAST-KNOWN ANCHOR of a node the diagram has REMOVED.
 *
 * A removed parent leaves soft refs behind by design (children's `parentId`, group
 * `members`) — hard-clearing them would be irreversible under collab/undo, where the ref
 * dangling and later RE-RESOLVING is exactly what makes undo-of-parent-delete restore
 * children byte-identically (same argument as the link quarantine in collab/integrity.ts).
 * The price of keeping the ref is that the position readers must TOLERATE it: without
 * help, a relative child whose parent stopped resolving read its raw offset as world
 * coordinates and visually JUMPED. This anchor is the help — everything the three parent
 * frame readers (getWorldPosition / getGlobalPosition / getGlobalTransformMatrix) need to
 * freeze an orphaned subtree exactly where the user last saw it. Captured by
 * DiagramModel.removeNode() at the moment of removal; DERIVED, session-local, never
 * serialized (a document loaded with a dangle has no anchor to freeze at — that is
 * DiagramValidator's case, and the readers keep their deterministic raw-offset fallback).
 */
export interface DetachedParentAnchor {
  /** getWorldPosition() at removal — the summed offset chain, world coords. */
  world: Point;
  /** getGlobalPosition() at removal — the transform-aware position. */
  global: Point;
  /** Local rotation at removal (getGlobalPosition composes against the parent's LOCAL rotation). */
  rotation: number;
  /** Local scale at removal (same reason). */
  scale: Point;
  /** getGlobalTransformMatrix() at removal — for getGlobalBounds and friends. */
  matrix: TransformMatrix;
}

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
  // wave14/model — `behaviorOverrides` DELETED. It was dead machinery: its only reader
  // was DiagramEngine.getNodeBehaviorForMode, itself dead outside its own spec; the real
  // read-only mechanism is the wave-9 ReadonlyLock. Legacy documents that still carry the
  // key deserialize cleanly (fromJSON ignores unknown keys) and re-save WITHOUT it — see
  // NodeModel.legacy-keys.spec.ts for why that does not break the round-trip invariant.
  positionMode?: PositioningMode; // Phase 1.6a: Positioning mode
  transformOrigin?: Point; // Phase 1.6a: Transform origin (normalized 0-1)
  /**
   * Model-level stacking order. OMITTED when the node never set one, so every
   * document written before this field existed round-trips byte-for-byte and no
   * schema migration is needed — absence means "unset", not 0.
   */
  zIndex?: number;
  flexConfig?: FlexItemConfig; // Phase 1.7: Flexbox item configuration
  gridConfig?: GridItemConfig; // Phase 1.7: Grid item configuration
  portRenderingConfig?: any; // Phase 2: Port rendering configuration
  dragHandlerConfig?: any; // Phase 2: Drag handler configuration
  connectionGroup?: string; // Phase 2: Connection group identifier
}

export class NodeModel extends DiagramEntity {
  // Diagram reference (Phase 1.6a) - Non-enumerable to prevent circular cloning
  diagram?: DiagramModel;

  /**
   * Wave 9 — Card 7. Is a DOCUMENT write to this node forbidden right now?
   * True only while the owning diagram is read-only and we are not inside a
   * system write (auto-size / measurement). A detached node — one not yet added
   * to any diagram — is freely mutable; `DiagramModel.addNode` is what refuses.
   */
  private writeBlocked(): boolean {
    return writeBlocked(this.diagram);
  }

  /**
   * D — is a DOCUMENT write to this node's GEOMETRY forbidden right now?
   *
   * `state.locked` used to be honoured by the input layers and by nothing else, so
   * a "locked" node was moved without complaint by any command, script or importer
   * that called `setPosition` — the same security-shaped lie the Wave-9 document
   * lock was built to kill, one scope down.
   *
   * It draws exactly the Wave-9 distinction and for exactly the Wave-9 reason: a
   * SYSTEM write (auto-size measuring text, a portal placing itself — anything
   * inside `ReadonlyLock.runSystemWrite`) still passes, because refusing those
   * renders a locked node at the wrong size and would have "worked" in a unit test
   * while destroying the product.
   *
   * Scope is GEOMETRY only: position, size, rotation, scale. Style, data, classes,
   * selection and `setState` itself stay open — you must be able to un-lock a
   * locked node, and pinning a widget should not freeze its colour.
   *
   * A DETACHED node (no diagram back-reference) is freely mutable even with
   * `locked` set: there is no document yet to protect, and you have to be able to
   * BUILD a node before you can add it. Same tolerance `writeBlocked()` has.
   */
  private geometryWriteBlocked(): boolean {
    if (this.writeBlocked()) return true;
    if (this.state.locked !== true) return false;
    // Locked, and attached: refuse unless the engine is doing a system write.
    return this.diagram !== undefined && !isSystemWrite(this.diagram);
  }

  // Position & Transform
  position: Point;
  size: Size;
  rotation: number = 0;
  scale: Point = { x: 1, y: 1 };
  positionMode: PositioningMode = 'absolute'; // Phase 1.6a: Default to absolute for backward compatibility
  transformOrigin: Point = { x: 0.5, y: 0.5 }; // Phase 1.6a: Default to center (normalized 0-1)

  /**
   * C — model-level stacking order (lower renders further back).
   *
   * `GroupModel` has had `zIndex` + `bringToFront`/`sendToBack` since Wave-5;
   * nodes had nothing, so the only way to restack one was to write `style.zIndex`
   * — a presentation field being used to carry a document fact, invisible to undo
   * and to the diff/collab layers that watch `trackChange`.
   *
   * DELIBERATELY OPTIONAL, unlike the group's `zIndex = 0`. `undefined` means "this
   * node never expressed an opinion", which is what lets {@link getEffectiveZIndex}
   * fall through to the legacy `style.zIndex` the renderer already honoured, and
   * what keeps `serialize()` byte-identical for every node that doesn't use it.
   */
  zIndex?: number;

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
    if (this.geometryWriteBlocked()) return;
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
    if (this.geometryWriteBlocked()) return;
    this.setPosition(
      this.position.x + dx,
      this.position.y + dy,
      this.position.z !== undefined && dz !== undefined
        ? this.position.z + dz
        : this.position.z
    );
  }

  /**
   * Set size.
   *
   * A — this used to be five lines that wrote a field and told NOBODY, while its
   * sibling `setPosition` has propagated since Phase 1.6a. A node growing inside a
   * flex/grid container is a layout-invalidating event: its siblings have to move.
   *
   * It notifies its LAYOUT CONTAINERS, and deliberately NOT the transform chain
   * `setPosition` uses: a parent's size does not move a relative child (the child's
   * offset is measured from the parent ORIGIN), so emitting `transform-propagated`
   * here would be noise that says something untrue.
   */
  setSize(width: number, height: number, depth?: number): void {
    if (this.geometryWriteBlocked()) return;
    const oldSize = { ...this.size };
    if (oldSize.width === width && oldSize.height === height && oldSize.depth === depth) {
      return; // no-op: never wake a layout pass for a write that changed nothing
    }
    this.size = { width, height, depth };
    this.trackChange('size', oldSize, this.size);

    this.notifyLayoutContainers();
  }

  /**
   * A — tell every layout container that owns this node that its geometry moved.
   *
   * The re-entrancy this obviously invites (container lays out → writes a child's
   * size → child notifies the container → …) is closed on the container side by
   * `GroupModel.applyLayout`'s in-flight guard: a push that arrives DURING a pass
   * is dropped, because that pass is already computing the answer it would ask for.
   */
  private notifyLayoutContainers(): void {
    const diagram = this.diagram;
    // `setSize` is HOT — layout adapters write thousands of them per run on graphs
    // that have no groups at all. Iterate the Map directly (no `getGroups()` array
    // allocation) and bail on the empty case before touching anything.
    const groups = diagram?.groups;
    if (!groups || groups.size === 0) return;
    for (const group of groups.values()) {
      if (group.members.has(this.id)) {
        group.requestLayout(diagram);
      }
    }
  }

  /**
   * Resize by delta
   */
  resize(dw: number, dh: number, dd?: number): void {
    if (this.geometryWriteBlocked()) return;
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
    if (this.geometryWriteBlocked()) return;
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
    if (this.geometryWriteBlocked()) return;
    this.setRotation(this.rotation + degrees);
  }

  /**
   * Set scale
   */
  setScale(x: number, y: number): void {
    if (this.geometryWriteBlocked()) return;
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
    if (this.writeBlocked()) return;
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
    if (this.writeBlocked()) return undefined;
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
    // Wave 9 — Card 7. A read-only document still needs EPHEMERAL view state:
    // selection, hover, highlight and a11y focus are how a viewer reads the
    // diagram, and the Wave-6 screen-reader layer depends on them. So read-only
    // filters setState to the view keys instead of refusing it — refusing
    // outright would have made a presentation-mode diagram unnavigable and
    // silently broken the roving-tabindex contract.
    //
    // Everything else on NodeState (locked, visible, expanded, enabled, error,
    // warning, status) is DOCUMENT state and is dropped while locked. `visible`
    // and `expanded` in particular are written by group collapse/expand, which
    // is an edit.
    let incoming = state;
    if (this.writeBlocked()) {
      const view: Partial<NodeState> = {};
      if ('selected' in state) view.selected = state.selected;
      if ('hovered' in state) view.hovered = state.hovered;
      if ('highlighted' in state) view.highlighted = state.highlighted;
      if ('focused' in state) view.focused = state.focused;
      if (Object.keys(view).length === 0) return;
      incoming = view;
    }

    const oldState = { ...this.state };
    this.state = { ...this.state, ...incoming };
    this.trackChange('state', oldState, this.state);
  }

  /**
   * Set behavior property
   */
  setBehavior(behavior: Partial<NodeBehavior>): void {
    if (this.writeBlocked()) return;
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
    if (this.writeBlocked()) return;
    const oldStyle = { ...this.style };
    this.style = { ...this.style, ...style };
    this.trackChange('style', oldStyle, this.style);
  }

  /**
   * REPLACE the whole style object — the write `setStyle` cannot express.
   *
   * `setStyle` merges, so it can add a key and overwrite a key but can never REMOVE
   * one. Restoring a snapshot therefore has to assign wholesale, and the obvious way to
   * do that — `node.style = snapshot` — is a plain field write that never passes
   * `trackChange()`. That funnel is what collab captures from, so the direct assignment
   * reaches the renderer (via markDirty) and reaches no other peer at all. That is not
   * hypothetical: it is exactly how an undone LINK style stayed applied on every peer
   * but the one that pressed Ctrl+Z. See collab/style-undo.spec.ts.
   *
   * Undo paths must use this, not the field.
   */
  replaceStyle(style: Partial<NodeStyle>): void {
    if (this.writeBlocked()) return;
    const oldStyle = { ...this.style };
    this.style = { ...style };
    this.trackChange('style', oldStyle, this.style);
  }

  /**
   * Add CSS class
   */
  addClass(className: string): void {
    if (this.writeBlocked()) return;
    if (!this.classes.has(className)) {
      this.classes.add(className);
      this.trackChange('classes', null, className);
    }
  }

  /**
   * Remove CSS class
   */
  removeClass(className: string): void {
    if (this.writeBlocked()) return;
    if (this.classes.has(className)) {
      this.classes.delete(className);
      this.trackChange('classes', className, null);
    }
  }

  /**
   * Set data property
   */
  setData(key: string, value: any): void {
    if (this.writeBlocked()) return;
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

    // Walk up the parent chain, honouring positionMode.
    //
    // wave13: fold in a parent's position only while the CURRENT node is RELATIVE to it —
    // an absolute node's stored position IS world coordinates, so it ends the walk. This
    // used to sum unconditionally, which double-counted an absolute-mode child that carried
    // a parentId, disagreeing with getGlobalPosition/getGlobalBounds. It is safe now because
    // setParent() finally declares its semantics (it flips a default-'absolute' child to
    // 'relative'), and a schema migration re-labels legacy documents the same way — so every
    // node that RELIED on the summation is 'relative' by the time this runs, and the walk
    // produces byte-identical results for all of them. Only the genuinely inconsistent case
    // (explicitly absolute + parentId) changes: it now means what it says.
    //
    // wave6/a11y — CYCLE GUARD, preserved. Without it a cyclic `parentId` (a→b→a) spins this
    // loop forever, and `getBoundingBox()` calls this on every node on every frame — one
    // corrupt parent link hangs the whole tab with no error. (`SetParentCommand`'s own cycle
    // check walks this same chain via `getAncestors()`, so it would hang too.)
    const seen = new Set<string>([this.id]);
    let current: NodeModel = this;
    while (current.positionMode !== 'absolute' && current.parentId && this.diagram) {
      if (seen.has(current.parentId)) break; // cycle — stop, do not spin
      seen.add(current.parentId);

      const parentNode = this.diagram.getNode(current.parentId);
      if (!parentNode) {
        // wave14/model — TOLERANT READER. An unresolvable parent resolves to its
        // LAST-KNOWN ANCHOR (see DetachedParentAnchor): the anchor IS the missing
        // parent's accumulated world position at removal time, so it terminates the
        // walk. Children of a deleted parent FREEZE where they were instead of
        // jumping to their raw offsets; the ref itself stays dangling so an undo
        // re-resolves it through the live node again. A parentId the diagram never
        // held (a document loaded with a dangle) has no anchor and keeps the old
        // deterministic raw-offset fallback — DiagramValidator owns flagging that.
        const anchor = this.diagram.getDetachedAnchor(current.parentId);
        if (anchor) {
          worldX += anchor.world.x;
          worldY += anchor.world.y;
          worldZ += anchor.world.z || 0;
        }
        break;
      }

      worldX += parentNode.position.x;
      worldY += parentNode.position.y;
      worldZ += parentNode.position.z || 0;
      current = parentNode;
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
    if (this.writeBlocked()) return;
    const oldParent = this.parentId;
    this.parentId = parentId;
    this.trackChange('parentId', oldParent, parentId);

    // The hierarchy has TWO writers — `parentId` here, the parent's `children`
    // Set in addChild/removeChild — and this method maintained only its own,
    // so getChildren() (Set-based) answered [] for a setParent() child and
    // transform propagation never saw it: the drag-handle grip stayed painted
    // at the old spot when its window moved. Keep both sides agreeing on every
    // path through here.
    if (this.diagram) {
      if (oldParent && oldParent !== parentId) {
        this.diagram.getNode(oldParent)?.removeChild(this.id);
      }
      if (parentId) {
        this.diagram.getNode(parentId)?.addChild(this.id);
      }
    }

    // wave13: gaining a parent through this API MEANS relative positioning — every consumer
    // (ERD tables, nested nodes, the world-coordinates contract) treats the child's position
    // as an offset from the parent, and getWorldPosition sums the chain on that assumption.
    // The model just never SAID so: positionMode stayed at its 'absolute' default, which made
    // it disagree with getGlobalPosition/getGlobalBounds (which honour positionMode) — an
    // absolute-mode child with a parentId double-counted in one method and not the other.
    // setLocalPosition/setGlobalPosition already set 'relative'; this was the odd one out.
    // Clearing the parent leaves the mode alone: 'relative' with no parent behaves as
    // absolute in every consumer, and flipping it back would lie about history.
    if (parentId && this.positionMode === 'absolute') {
      const oldMode = this.positionMode;
      this.positionMode = 'relative';
      this.trackChange('positionMode', oldMode, 'relative');
    }
  }

  /**
   * Add child
   */
  addChild(childId: string): void {
    if (this.writeBlocked()) return;
    if (!this.children.has(childId)) {
      this.children.add(childId);
      this.trackChange('children', null, childId);
    }
  }

  /**
   * Remove child
   */
  removeChild(childId: string): void {
    if (this.writeBlocked()) return;
    if (this.children.has(childId)) {
      this.children.delete(childId);
      this.trackChange('children', childId, null);
    }
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
      // wave14/model — TOLERANT READER (see getWorldPosition): a removed parent's
      // frozen frame keeps the transform-aware reading in agreement with the walk.
      const anchor = this.diagram?.getDetachedAnchor(this.parentId!);
      if (anchor) {
        return this.composeGlobalFromParentFrame(anchor.global, anchor.rotation, anchor.scale);
      }
      return { ...this.position };
    }

    return this.composeGlobalFromParentFrame(
      parent.getGlobalPosition(),
      parent.rotation,
      parent.scale
    );
  }

  /**
   * Compose this node's global position from a parent FRAME (global position +
   * local rotation/scale). For hierarchical positioning, apply:
   * scale -> rotate -> translate (without transform origin offsets, which are
   * for visual transforms). Shared by the live-parent path and the
   * detached-anchor path of getGlobalPosition so the two can never disagree.
   */
  private composeGlobalFromParentFrame(parentGlobalPos: Point, rotation: number, scale: Point): Point {
    // Scale child position by parent's scale
    let x = this.position.x * scale.x;
    let y = this.position.y * scale.y;

    // Rotate scaled position by parent's rotation
    if (rotation !== 0) {
      const cos = Math.cos(rotation);
      const sin = Math.sin(rotation);
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
      // wave14/model — the WRITER must share the readers' frame, or dragging an
      // orphaned child teleports it: convert through the removed parent's frozen
      // frame when one exists (see DetachedParentAnchor).
      const anchor = this.diagram?.getDetachedAnchor(this.parentId);
      if (anchor) {
        this.positionMode = 'relative';
        this.setPositionFromGlobalInParentFrame(anchor.global, anchor.rotation, anchor.scale, x, y, z);
        return;
      }
      this.setPosition(x, y, z);
      return;
    }

    // Convert global to local by inverting parent's hierarchy transform
    this.positionMode = 'relative';
    this.setPositionFromGlobalInParentFrame(
      parent.getGlobalPosition(),
      parent.rotation,
      parent.scale,
      x,
      y,
      z
    );
  }

  /**
   * Inverse of {@link composeGlobalFromParentFrame}: write a GLOBAL point as a
   * local offset against a parent frame. Shared by the live-parent path and the
   * detached-anchor path of setGlobalPosition.
   */
  private setPositionFromGlobalInParentFrame(
    parentGlobalPos: Point,
    rotation: number,
    scale: Point,
    x: number,
    y: number,
    z?: number
  ): void {
    // Subtract parent's global position
    let localX = x - parentGlobalPos.x;
    let localY = y - parentGlobalPos.y;

    // Rotate by -parent.rotation
    if (rotation !== 0) {
      const cos = Math.cos(-rotation);
      const sin = Math.sin(-rotation);
      const rotatedX = localX * cos - localY * sin;
      const rotatedY = localX * sin + localY * cos;
      localX = rotatedX;
      localY = rotatedY;
    }

    // Divide by parent's scale
    localX /= scale.x;
    localY /= scale.y;

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
      // wave14/model — TOLERANT READER (see getWorldPosition): compose against the
      // removed parent's frozen global matrix so getGlobalBounds does not jump.
      const anchor = this.diagram?.getDetachedAnchor(this.parentId!);
      if (anchor) {
        return composeMatrices(anchor.matrix, localMatrix);
      }
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

    // wave6/a11y — CYCLE GUARD, same bug as `getWorldPosition()`. This is the
    // walk `SetParentCommand` uses to REJECT a cycle, so leaving it unguarded
    // meant the cycle check hung the moment a cycle actually existed.
    const seen = new Set<string>([this.id]);
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
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

    // wave6/a11y — CYCLE GUARD (the third unguarded parent walk in this class;
    // `validateHierarchy()` below has always had one, which is the irony: the
    // cycle DETECTOR was safe while every hot path that walks the same chain
    // was not).
    const seen = new Set<string>([this.id]);
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
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

  // ========================================
  // C — Z-order (mirrors GroupModel's Wave-5 API)
  // ========================================

  /**
   * The stacking index a renderer should paint by.
   *
   * Precedence is explicit-model-field → legacy `style.zIndex` → 0. That ordering
   * is the whole compatibility story: diagrams that restacked via style keep
   * working untouched, and the moment a node states a model z-index it wins — so
   * `setZIndex(1)` on a node styled `zIndex: 4` does what it says instead of
   * silently losing to a stylesheet.
   */
  getEffectiveZIndex(): number {
    return this.zIndex ?? this.style?.zIndex ?? 0;
  }

  /** Set the stacking index (lower renders further back). Tracked for undo/diff. */
  setZIndex(z: number | undefined): void {
    if (this.writeBlocked()) return;
    if (this.zIndex === z) return;
    const old = this.zIndex;
    this.zIndex = z;
    this.trackChange('zIndex', old, z);
    this.emitter.emit('zindex:changed', z);
  }

  /**
   * Bring this node in front of every other node in the diagram.
   * Falls back to a relative bump when the node is detached, exactly as
   * `GroupModel.bringToFront` does.
   */
  bringToFront(diagram?: DiagramModel): void {
    const dm = diagram ?? this.diagram;
    if (!dm) {
      this.setZIndex(this.getEffectiveZIndex() + 1);
      return;
    }
    const max = Math.max(0, ...dm.getNodes().map((n) => n.getEffectiveZIndex()));
    this.setZIndex(max + 1);
  }

  /** Send this node behind every other node in the diagram. */
  sendToBack(diagram?: DiagramModel): void {
    const dm = diagram ?? this.diagram;
    if (!dm) {
      this.setZIndex(this.getEffectiveZIndex() - 1);
      return;
    }
    const min = Math.min(0, ...dm.getNodes().map((n) => n.getEffectiveZIndex()));
    this.setZIndex(min - 1);
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

    // C: only present when the node actually stated a z-index — see the field
    // comment. `0` is a real, serialized value; `undefined` writes no key at all.
    if (this.zIndex !== undefined) {
      serialized.zIndex = this.zIndex;
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

    // C: an absent key stays UNSET (not 0) so a legacy document keeps deferring to
    // whatever `style.zIndex` it was painted with.
    if (typeof data.zIndex === 'number') {
      node.zIndex = data.zIndex;
    }

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

    // (wave14/model — a legacy `behaviorOverrides` key, if present, is deliberately
    // IGNORED here: unknown-key tolerance. See the note on SerializedNode.)

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
