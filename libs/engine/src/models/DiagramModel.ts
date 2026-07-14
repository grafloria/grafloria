// DiagramModel - Root container for all diagram entities

import { DiagramEntity } from './DiagramEntity';
import { ReadonlyLock } from './readonly-lock'; // Wave 9 — Card 7
import { NodeModel, SerializedNode } from './NodeModel';
import { LinkModel, SerializedLink } from './LinkModel';
import { PortModel } from './PortModel';
import { GroupModel, SerializedGroup } from './GroupModel'; // Phase 1.6c
import type { SerializedEntity, Point } from '../types';
import { SpatialIndex } from '../performance/SpatialIndex'; // Phase 5.1
import type { Rectangle } from '../types/geometry.types'; // Phase 5.1
import type {
  LODLevel,
  EntityWithLOD,
  LODConfig,
  LODTier,
  LODFeature,
} from '../types/performance.types'; // Phase 5.3
import { createDefaultLODConfig } from '../types/performance.types'; // wave2/rendering
import { LayoutManager } from '../layout/LayoutManager'; // Layout system
import type { LayoutAlgorithmType, LayoutConfiguration } from '../layout/types';
import { isPointInShape } from '../utils/geometry'; // Phase 3.3
import { runDiagramMigrations, DIAGRAM_SCHEMA_VERSION } from '../serialization/DiagramMigrations';
import {
  validateSerializedDiagram,
  DiagramValidationError,
  type DiagramValidationReport,
} from '../serialization/DiagramValidator';
import { INCREMENTAL_FORMAT, type DiagramIncremental } from '../serialization/Incremental';

/**
 * How near a port must be to a point for {@link DiagramModel.findNearestPort} to
 * consider it, in world units. Roughly a fingertip at 100% zoom.
 */
export const DEFAULT_PORT_SNAP_RADIUS = 24;

/**
 * Slack added to the node-candidate search in {@link DiagramModel.findNearestPort},
 * to cover ports pushed off their node's bounding box by `port.offset`.
 */
const PORT_OFFSET_PAD = 64;

/** Options for {@link DiagramModel.findNearestPort}. */
export interface NearestPortOptions {
  /** Maximum distance, in world units (default {@link DEFAULT_PORT_SNAP_RADIUS}). */
  radius?: number;
  /** Consider only the ports this accepts (e.g. valid targets for the dragged link). */
  filter?: (port: PortModel, node: NodeModel) => boolean;
  /**
   * Where a port actually IS. Defaults to the bounding-box edge midpoint. Callers
   * inside a renderer must pass the SHAPE-AWARE resolver (`portWorldPosition`) —
   * see the note on `findNearestPort`.
   */
  portPosition?: (port: PortModel, node: NodeModel) => Point;
}

/** What {@link DiagramModel.findNearestPort} found. */
export interface NearestPortHit {
  port: PortModel;
  node: NodeModel;
  /** Distance from the query point to the port, in world units. */
  distance: number;
}

export interface SerializedDiagram extends SerializedEntity {
  /**
   * Document schema version (shape of THIS payload), distinct from the
   * per-entity mutation counter `version`. Absent on pre-versioning
   * documents, which are treated as schemaVersion 1 and migrated on load.
   */
  schemaVersion?: number;
  name: string;
  nodes: SerializedNode[];
  links: SerializedLink[];
  groups: SerializedGroup[]; // Phase 1.6c
  viewport: {
    x: number;
    y: number;
    width: number;   // Phase 0.5 - Viewport-aware layout
    height: number;  // Phase 0.5 - Viewport-aware layout
    zoom: number;
  };
}

export interface DiagramLoadOptions {
  /**
   * Structural integrity policy for the incoming document:
   *  - 'off'    (default) skip validation
   *  - 'warn'   validate and console.warn a one-line summary with the report
   *  - 'strict' validate and throw DiagramValidationError on any error
   */
  validate?: 'off' | 'warn' | 'strict';
}

export class DiagramModel extends DiagramEntity {
  name: string = 'Untitled Diagram';
  nodes: Map<string, NodeModel> = new Map();
  links: Map<string, LinkModel> = new Map();
  groups: Map<string, GroupModel> = new Map(); // Phase 1.6c

  /**
   * Wave 9 — Card 7. The read-only lock. THE enforcement point for
   * `DiagramMode.VIEW` / `PRESENTATION`, which before this wave were advisory flags
   * that gated nothing at all (see ./readonly-lock.ts).
   *
   * Kept on the model rather than the engine because the model is what the mutators
   * live on, and a lock the mutator cannot see is not a lock. `NodeModel` reaches it
   * via its `diagram` back-reference; `LinkModel` via the one this wave added
   * (`installLink`), without which every waypoint / label / reconnect edit — all of
   * which are `LinkModel` methods — would have been an unguardable hole.
   */
  private readonlyLock = new ReadonlyLock();

  // O(1) port -> owning node/port lookup. Maintained whenever nodes or ports
  // are added/removed so callers (renderer per-frame link resolution, routing,
  // connection validation) never linear-scan every node's ports.
  private portIndex: Map<string, { node: NodeModel; port: PortModel }> = new Map();

  viewport = {
    x: 0,
    y: 0,
    width: 1200,  // Default viewport width
    height: 800,  // Default viewport height
    zoom: 1,
  };

  // Phase 5.1: Spatial indexing for viewport virtualization
  private nodeSpatialIndex: SpatialIndex<NodeModel>;
  private linkSpatialIndex: SpatialIndex<LinkModel>;

  // Layout system
  private _layoutManager: LayoutManager;
  private _autoLayoutEnabled: boolean = false;

  // Batch update support for event queueing
  private _pendingEvents: Array<{ type: string; data?: any }> = [];

  // wave2/rendering: declarative, per-diagram Level-of-Detail policy. Replaces
  // the old hardcoded zoom breakpoints (>=1.0 / >0.2) and per-tier feature
  // gates. Defaults to the historical three tiers so behaviour is unchanged.
  private _lodConfig: LODConfig;
  // Tiers pre-sorted highest-minZoom first so getLODLevel() is a linear scan,
  // not a per-call sort. Kept in sync whenever _lodConfig changes.
  private _lodTiersDesc: LODTier[] = [];

  constructor(
    name?: string,
    options?: { lodConfig?: LODConfig; id?: string; uuid?: string }
  ) {
    // id/uuid pass-through exists so deserialization can reproduce the SAVED
    // diagram identity instead of minting a new one (lossless round-trip).
    super(options?.id, options?.uuid);
    if (name) this.name = name;

    // wave2/rendering: install the LOD policy (custom or default).
    this._lodConfig = options?.lodConfig ?? createDefaultLODConfig();
    this._resortLODTiers();

    // Initialize layout manager
    this._layoutManager = new LayoutManager(this, 'grid');

    // Phase 5.1: Initialize spatial indices
    this.nodeSpatialIndex = new SpatialIndex<NodeModel>({
      cellSize: 100,
      getBounds: (node) => {
        // Get bounds considering rotation and scale
        const bounds = node.getBoundingBox();
        return {
          x: bounds.left,
          y: bounds.top,
          width: bounds.width,
          height: bounds.height,
        };
      },
    });

    this.linkSpatialIndex = new SpatialIndex<LinkModel>({
      cellSize: 100,
      getBounds: (link) => this.computeLinkBounds(link),
    });
  }

  /**
   * Bounding box of a link, for viewport culling (`getVisibleLinks`).
   *
   * It is the union of TWO things, and it needs both:
   *
   *  - `link.points` — the routed path (including orthogonal detours). Renderers
   *    write this back per frame, so for anything that has been drawn it is the
   *    real geometry.
   *  - the LIVE endpoints, resolved O(1) through the port index. Points alone are
   *    not trustworthy: a link built with `new LinkModel()` + `addLink()` has NO
   *    points until something routes it (it would otherwise be indexed as a
   *    zero-size box at the world origin and get culled everywhere except there),
   *    and points go stale the moment a node moves without a reroute. The drawn
   *    path always runs between the live ports, so folding them in keeps the box
   *    a correct SUPERSET of what will actually be painted.
   *
   * Being a superset is the safe direction: culling too little costs a few
   * VNodes, culling too much makes edges vanish off-screen.
   */
  private computeLinkBounds(link: LinkModel): Rectangle {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    const include = (point: Point) => {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    };

    for (const point of link.points) {
      include(point);
    }

    const source = this.portIndex.get(link.sourcePortId);
    if (source) {
      include(source.port.getAbsolutePosition(source.node.getBoundingBox()));
    }
    const target = this.portIndex.get(link.targetPortId);
    if (target) {
      include(target.port.getAbsolutePosition(target.node.getBoundingBox()));
    }

    if (minX === Infinity) {
      // Nothing to go on (no points, no resolvable ports).
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  /**
   * Re-index a link after its geometry changed WITHOUT a `change:points` event.
   *
   * Renderers route links per frame and assign `link.points` directly (using
   * `setPoints()` would emit `change` → `link:changed` → another render, i.e. a
   * render loop). The spatial index therefore never hears about the routed path,
   * and its grid cells would keep pointing at the geometry the link had when it
   * was added. Call this after writing points directly.
   */
  refreshLinkBounds(link: LinkModel): void {
    if (!this.links.has(link.id)) return;
    this.linkSpatialIndex.update(link);
  }

  /**
   * Add node to diagram
   */
  // ==========================================================================
  // Wave 9 — Card 7: the read-only lock (see ./readonly-lock.ts).
  // ==========================================================================

  /** Is this document locked against edits? */
  isReadonly(): boolean {
    return this.readonlyLock.isReadonly();
  }

  /**
   * Lock / unlock the document. Normally driven by `DiagramEngine.setMode()` —
   * VIEW and PRESENTATION lock, DESIGNER unlocks — so `DiagramMode` finally means
   * something. Can also be set directly for a host that has no mode concept.
   */
  setReadonly(value: boolean): void {
    if (this.readonlyLock.isReadonly() === value) return;
    this.readonlyLock.setReadonly(value);
    this.emitOrQueue('readonly:change', value);
  }

  /** True when a document mutation must be refused right now. */
  blocksDocumentWrite(): boolean {
    return this.readonlyLock.blocksDocumentWrite();
  }

  /**
   * Run a SYSTEM write — a derived/measured value (auto-size, portal placement)
   * the engine needs in order to render the document as it already is. Permitted
   * even while locked. NOT reachable from user input; see readonly-lock.ts.
   */
  runSystemWrite<T>(fn: () => T): T {
    return this.readonlyLock.runSystemWrite(fn);
  }

  addNode(node: NodeModel): void {
    this.assertNotDisposed(); // Phase 5.4
    if (this.blocksDocumentWrite()) return;

    if (this.nodes.has(node.id)) {
      throw new Error(`Node with id ${node.id} already exists`);
    }

    this.installNode(node);
  }

  /**
   * THE single per-node install path — every route a node takes into the
   * diagram (interactive addNode, undo restoreNode, document fromJSON) runs
   * through here, so a restored node is wired IDENTICALLY to an authored one:
   * diagram back-reference, change tracking, events, port index, spatial
   * index, and change-forwarding listeners.
   */
  private installNode(node: NodeModel): void {
    // Set diagram reference (Phase 1.6a)
    node.diagram = this;

    this.nodes.set(node.id, node);
    this.trackChange('nodes', null, node);
    this.emitOrQueue('node:added', node);

    // Maintain O(1) port -> node index (covers ports added before AND after
    // the node joins the diagram)
    this.indexNodePorts(node);

    // Phase 5.1: Add to spatial index and listen for spatial changes
    // Do this AFTER trackChange to avoid cloning issues
    this.nodeSpatialIndex.add(node);
    const updateSpatialIndex = () => this.nodeSpatialIndex.update(node);
    node.on('change:position', updateSpatialIndex);
    node.on('change:size', updateSpatialIndex);
    node.on('change:rotation', updateSpatialIndex);
    node.on('change:scale', updateSpatialIndex);

    // Phase 0.2: Forward position and size changes as diagram-level events for LiveReroutingEngine
    node.on('change:position', () => {
      this.emitOrQueue('node:moved', { nodeId: node.id, position: node.position });
    });
    node.on('change:size', () => {
      this.emitOrQueue('node:resized', { nodeId: node.id, size: node.size });
    });

    // Listen for any node changes and forward as diagram-level 'node:changed' event
    // This allows components like diagram-canvas to re-render when node properties change
    node.on('change', () => {
      this.emitOrQueue('node:changed', node);
    });
  }

  /**
   * Remove node from diagram
   */
  removeNode(nodeId: string): NodeModel | undefined {
    if (this.blocksDocumentWrite()) return undefined;
    const node = this.nodes.get(nodeId);
    if (node) {
      this.nodes.delete(nodeId);

      // Drop this node's ports from the O(1) port index
      this.unindexNodePorts(node);

      // Phase 5.1: Remove from spatial index
      this.nodeSpatialIndex.remove(nodeId);

      this.trackChange('nodes', node, null);
      this.emitOrQueue('node:removed', node);
    }
    return node;
  }

  /**
   * Restore node from serialized data (Phase 1.8)
   */
  restoreNode(data: any): NodeModel | undefined {
    try {
      const node = NodeModel.fromJSON(data);
      this.installNode(node);
      return node;
    } catch (error) {
      console.error('Failed to restore node:', error);
      return undefined;
    }
  }

  /**
   * Get node by ID
   */
  getNode(nodeId: string): NodeModel | undefined {
    return this.nodes.get(nodeId);
  }

  /**
   * Get all nodes
   */
  getNodes(): NodeModel[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Phase 3: Get node that owns a specific port
   * Used for connection group validation and other port-based queries.
   * O(1) via the portIndex (was an O(nodes×ports) linear scan).
   */
  getNodeByPortId(portId: string): NodeModel | undefined {
    return this.portIndex.get(portId)?.node;
  }

  /**
   * Get the port model for a port id, O(1) via the portIndex.
   * Companion to getNodeByPortId for callers that need the port itself.
   */
  getPortById(portId: string): PortModel | undefined {
    return this.portIndex.get(portId)?.port;
  }

  /**
   * Index every current port of a node and keep the index current as ports are
   * added/removed on that node. Called from addNode/restoreNode/fromJSON.
   * Listeners are guarded so a removed node can never re-pollute the index.
   */
  private indexNodePorts(node: NodeModel): void {
    for (const port of node.getPorts()) {
      this.portIndex.set(port.id, { node, port });
    }

    // Keep the index correct when ports change AFTER the node is in the diagram.
    node.on('port:added', (port: PortModel) => {
      // Ignore late additions from a node that is no longer this diagram's.
      if (this.nodes.get(node.id) === node) {
        this.portIndex.set(port.id, { node, port });
      }
    });
    node.on('port:removed', (port: PortModel) => {
      const entry = this.portIndex.get(port.id);
      if (entry && entry.node === node) {
        this.portIndex.delete(port.id);
      }
    });
  }

  /**
   * Drop a node's ports from the index (called on removeNode).
   */
  private unindexNodePorts(node: NodeModel): void {
    for (const port of node.getPorts()) {
      const entry = this.portIndex.get(port.id);
      if (entry && entry.node === node) {
        this.portIndex.delete(port.id);
      }
    }
  }

  /**
   * Clear all nodes
   */
  clearNodes(): void {
    if (this.blocksDocumentWrite()) return;
    this.nodes.clear();
    this.portIndex.clear();
    this.emitOrQueue('nodes:cleared');
  }

  /**
   * Add link to diagram
   */
  addLink(link: LinkModel): void {
    this.assertNotDisposed(); // Phase 5.4
    if (this.blocksDocumentWrite()) return;

    if (this.links.has(link.id)) {
      throw new Error(`Link with id ${link.id} already exists`);
    }

    this.installLink(link);
  }

  /**
   * THE single per-link install path (see installNode) — interactive add,
   * undo restore, and document load all wire links identically, including
   * the owning-node-id backfill renderers resolve port sides through.
   */
  private installLink(link: LinkModel): void {
    // Wave 9 — Card 7. The diagram back-reference. NodeModel has had one since
    // Phase 1.6a; LinkModel never did — which meant every waypoint, control-point,
    // label and reconnect edit (all LinkModel methods) could not see a read-only
    // lock and was therefore unguardable. Symmetric with installNode.
    link.diagram = this;

    // Cache the owning node ids (renderers resolve port sides through them —
    // without this, links built via `new LinkModel()` + addLink never resolve
    // port direction, unlike connectNodes() which sets the ids itself)
    if (!link.sourceNodeId) {
      link.sourceNodeId = this.getNodeByPortId(link.sourcePortId)?.id;
    }
    if (!link.targetNodeId) {
      link.targetNodeId = this.getNodeByPortId(link.targetPortId)?.id;
    }

    this.links.set(link.id, link);
    this.trackChange('links', null, link);
    this.emitOrQueue('link:added', link);

    // Phase 5.1: Add to spatial index and listen - AFTER trackChange
    this.linkSpatialIndex.add(link);
    link.on('change:points', () => this.linkSpatialIndex.update(link));
    // generatePath() (layout, live-rerouting, node drag) rewrites `points` in
    // place and only emits 'link:path-changed' — without this the index keeps the
    // grid cells the link had when it was added and viewport culling loses it.
    link.on('link:path-changed', () => this.linkSpatialIndex.update(link));

    // Listen for any link changes and forward as diagram-level 'link:changed' event
    link.on('change', () => {
      this.emitOrQueue('link:changed', link);
    });
  }

  /**
   * Remove link from diagram
   */
  removeLink(linkId: string): LinkModel | undefined {
    if (this.blocksDocumentWrite()) return undefined;
    const link = this.links.get(linkId);
    if (link) {
      this.links.delete(linkId);

      // Phase 5.1: Remove from spatial index
      this.linkSpatialIndex.remove(linkId);

      this.trackChange('links', link, null);
      this.emitOrQueue('link:removed', link);
    }
    return link;
  }

  /**
   * Restore link from serialized data (Phase 1.8)
   */
  restoreLink(data: any): LinkModel | undefined {
    try {
      const link = LinkModel.fromJSON(data);
      this.installLink(link);
      return link;
    } catch (error) {
      console.error('Failed to restore link:', error);
      return undefined;
    }
  }

  /**
   * Get link by ID
   */
  getLink(linkId: string): LinkModel | undefined {
    return this.links.get(linkId);
  }

  /**
   * Get all links
   */
  getLinks(): LinkModel[] {
    return Array.from(this.links.values());
  }

  /**
   * Phase 0.2: Get all links connected to a specific port
   */
  getLinksForPort(portId: string): LinkModel[] {
    return this.getLinks().filter(link =>
      link.sourcePortId === portId || link.targetPortId === portId
    );
  }

  /**
   * Clear all links
   */
  clearLinks(): void {
    if (this.blocksDocumentWrite()) return;
    this.links.clear();
    this.emitOrQueue('links:cleared');
  }

  /**
   * Phase 0.5.3: Create a smart link with automatic port selection
   *
   * This high-level API simplifies link creation by:
   * - Automatically selecting optimal ports based on node geometry
   * - Creating the link with proper port connections
   * - Registering connections in port models
   * - Generating the initial path
   *
   * @param sourceNode - The source node
   * @param targetNode - The target node
   * @param pathType - Path rendering type (default: 'smooth')
   * @returns The created link, or undefined if port selection failed
   *
   * @example
   * ```typescript
   * const link = diagram.createSmartLink(node1, node2, 'smooth');
   * if (link) {
   *   console.log('Connected with optimal ports!');
   * }
   * ```
   */
  createSmartLink(
    sourceNode: NodeModel,
    targetNode: NodeModel,
    pathType: 'direct' | 'orthogonal' | 'smooth' | 'bezier' = 'smooth'
  ): LinkModel | undefined {
    // Use layout manager's intelligent port selection
    const optimalPorts = this._layoutManager.selectOptimalPorts(sourceNode, targetNode);

    if (!optimalPorts) {
      console.warn(`⚠️ Could not select optimal ports for nodes ${sourceNode.id} → ${targetNode.id}`);
      return undefined;
    }

    const { sourcePort, targetPort } = optimalPorts;

    // Validate port compatibility
    if (!sourcePort.canConnectTo(targetPort)) {
      console.warn(`⚠️ Ports are not compatible: ${sourcePort.type} → ${targetPort.type}`);
      return undefined;
    }

    // Create the link
    const link = new LinkModel(sourcePort.id, targetPort.id, pathType);
    link.sourceNodeId = sourceNode.id;
    link.targetNodeId = targetNode.id;

    // Register connections in ports
    sourcePort.addConnection(link.id, 'source');
    targetPort.addConnection(link.id, 'target');

    // Calculate initial path
    const sourceBounds = sourceNode.getBoundingBox();
    const targetBounds = targetNode.getBoundingBox();
    const sourcePoint = sourcePort.getAbsolutePosition(sourceBounds);
    const targetPoint = targetPort.getAbsolutePosition(targetBounds);

    // Get port directions for orthogonal routing
    const sourceDirection = sourcePort.alignment?.side;
    const targetDirection = targetPort.alignment?.side;

    link.generatePath(sourcePoint, targetPoint, sourceDirection, targetDirection);

    // Add to diagram
    this.addLink(link);

    return link;
  }

  /**
   * Phase 0.5.3: High-level API to connect two nodes
   *
   * Convenience method that creates a smart link and returns success status.
   * This is the simplest way to connect nodes.
   *
   * @param sourceNode - The source node
   * @param targetNode - The target node
   * @param pathType - Path rendering type (default: 'smooth')
   * @returns true if connection was successful, false otherwise
   *
   * @example
   * ```typescript
   * if (diagram.connectNodes(node1, node2)) {
   *   console.log('Nodes connected successfully!');
   * }
   * ```
   */
  connectNodes(
    sourceNode: NodeModel,
    targetNode: NodeModel,
    pathType: 'direct' | 'orthogonal' | 'smooth' | 'bezier' = 'smooth'
  ): boolean {
    const link = this.createSmartLink(sourceNode, targetNode, pathType);
    return link !== undefined;
  }

  /**
   * Phase 0.5.3: Get all connections for a node
   *
   * Returns all links where the node is either source or target.
   * Useful for querying node connectivity.
   *
   * @param node - The node to query
   * @returns Object containing incoming and outgoing links
   *
   * @example
   * ```typescript
   * const connections = diagram.getNodeConnections(node);
   * console.log(`Incoming: ${connections.incoming.length}`);
   * console.log(`Outgoing: ${connections.outgoing.length}`);
   * console.log(`Total: ${connections.all.length}`);
   * ```
   */
  getNodeConnections(node: NodeModel): {
    incoming: LinkModel[];
    outgoing: LinkModel[];
    all: LinkModel[];
  } {
    const incoming: LinkModel[] = [];
    const outgoing: LinkModel[] = [];

    // Get node's port IDs
    const portIds = new Set(node.getPorts().map((p) => p.id));

    // Check all links
    for (const link of this.links.values()) {
      const isTarget = portIds.has(link.targetPortId);
      const isSource = portIds.has(link.sourcePortId);

      if (isTarget) {
        incoming.push(link);
      }
      if (isSource) {
        outgoing.push(link);
      }
    }

    return {
      incoming,
      outgoing,
      all: [...incoming, ...outgoing],
    };
  }

  /**
   * Phase 0.5.3: Disconnect two nodes
   *
   * Removes all links between the specified nodes.
   * Handles cleanup of port connections.
   *
   * @param sourceNode - The source node
   * @param targetNode - The target node
   * @returns Number of links removed
   *
   * @example
   * ```typescript
   * const removed = diagram.disconnectNodes(node1, node2);
   * console.log(`Removed ${removed} connections`);
   * ```
   */
  disconnectNodes(sourceNode: NodeModel, targetNode: NodeModel): number {
    const sourcePortIds = new Set(sourceNode.getPorts().map((p) => p.id));
    const targetPortIds = new Set(targetNode.getPorts().map((p) => p.id));

    const linksToRemove: string[] = [];

    // Find all links between these nodes
    for (const link of this.links.values()) {
      const hasSourcePort = sourcePortIds.has(link.sourcePortId);
      const hasTargetPort = targetPortIds.has(link.targetPortId);

      if (hasSourcePort && hasTargetPort) {
        linksToRemove.push(link.id);
      }
    }

    // Remove the links
    for (const linkId of linksToRemove) {
      const link = this.getLink(linkId);
      if (link) {
        // Clean up port connections
        const sourcePort = sourceNode.getPorts().find((p) => p.id === link.sourcePortId);
        const targetPort = targetNode.getPorts().find((p) => p.id === link.targetPortId);

        if (sourcePort) {
          sourcePort.removeConnection(link.id);
        }
        if (targetPort) {
          targetPort.removeConnection(link.id);
        }

        // Remove link from diagram
        this.removeLink(linkId);
      }
    }

    return linksToRemove.length;
  }

  /**
   * Add group (Phase 1.6c)
   */
  addGroup(group: GroupModel): void {
    if (this.blocksDocumentWrite()) return;
    this.assertNotDisposed(); // Phase 5.4

    if (this.groups.has(group.id)) {
      throw new Error(`Group with id ${group.id} already exists`);
    }

    this.installGroup(group);
  }

  /**
   * THE single per-group install path (see installNode). The diagram
   * back-reference is RUNTIME wiring: GroupModel.serialize() deliberately
   * excludes it from payloads, and this re-stashes it on every install so a
   * loaded group can resolve its diagram exactly like an authored one.
   */
  private installGroup(group: GroupModel): void {
    // Store diagram reference for layout operations. Written to the map
    // DIRECTLY (not setMetadata): this is runtime wiring, not a user
    // mutation — it must not bump the group's version or land in its change
    // log, or a loaded group would report a different version than it was
    // saved with (and every install would count as an edit).
    group.metadata.set('diagram', this);

    this.groups.set(group.id, group);
    this.trackChange('groups', null, group);
    this.emitOrQueue('group:added', group);
  }

  /**
   * Remove group (Phase 1.6c)
   */
  removeGroup(groupId: string): GroupModel | undefined {
    if (this.blocksDocumentWrite()) return undefined;
    const group = this.groups.get(groupId);
    if (group) {
      this.groups.delete(groupId);
      this.trackChange('groups', group, null);
      this.emitOrQueue('group:removed', group);
    }
    return group;
  }

  /**
   * Restore group from serialized data (Phase 1.8)
   */
  restoreGroup(data: any): GroupModel | undefined {
    try {
      const group = GroupModel.fromJSON(data);
      this.installGroup(group);
      return group;
    } catch (error) {
      console.error('Failed to restore group:', error);
      return undefined;
    }
  }

  /**
   * Get group by ID (Phase 1.6c)
   */
  getGroup(groupId: string): GroupModel | undefined {
    return this.groups.get(groupId);
  }

  /**
   * Get all groups (Phase 1.6c)
   */
  getGroups(): GroupModel[] {
    return Array.from(this.groups.values());
  }

  /**
   * Wave-5 Card 3: groups in deterministic back-to-front stacking order —
   * ascending `zIndex`, ties broken by Map insertion order (a STABLE sort keeps
   * it). This is the model-level z-order story that replaces "stacking == Map
   * insertion order" as the only determinant; a renderer paints groups in this
   * order (behind their members) instead of relying on iteration order.
   */
  getGroupsInRenderOrder(): GroupModel[] {
    return this.getGroups().sort((a, b) => a.zIndex - b.zIndex);
  }

  /**
   * Wave-5 Card 4: the placeholder "group-as-node" for a collapsed group, if
   * present. Placeholder nodes are ordinary NodeModels tagged with the group id
   * so callers can filter them out of exports / counts.
   */
  getProxyNodeForGroup(groupId: string): NodeModel | undefined {
    for (const node of this.nodes.values()) {
      if (node.getMetadata('__collapsedGroupId') === groupId) {
        return node;
      }
    }
    return undefined;
  }

  /** Wave-5 Card 4: is this node a collapsed-group placeholder? */
  isProxyNode(node: NodeModel): boolean {
    return node.getMetadata('__isGroupProxy') === true;
  }

  /**
   * Clear all groups (Phase 1.6c)
   */
  clearGroups(): void {
    this.groups.clear();
    this.emitOrQueue('groups:cleared');
  }

  /**
   * Compound-graph containment (Wave-2)
   *
   * These derive the nesting tree from each GroupModel.parentGroupId pointer,
   * which addMember/removeMember/setParent keep authoritative. Coordinates stay
   * ABSOLUTE across the codebase; nesting is purely a logical containment tree.
   */

  /**
   * Get a group's ancestor chain (nearest parent first), walking parentGroupId
   * upward. Robust against malformed self/looping pointers.
   */
  getAncestors(groupId: string): GroupModel[] {
    const result: GroupModel[] = [];
    const seen = new Set<string>([groupId]);

    let current = this.groups.get(groupId);
    while (current && current.parentGroupId) {
      if (seen.has(current.parentGroupId)) {
        break; // defensive: never loop on a corrupt pointer
      }
      const parent = this.groups.get(current.parentGroupId);
      if (!parent) {
        break;
      }
      result.push(parent);
      seen.add(parent.id);
      current = parent;
    }

    return result;
  }

  /**
   * Get every group nested (directly or transitively) inside `groupId`.
   * Breadth-first over the parentGroupId back-pointers.
   */
  getDescendants(groupId: string): GroupModel[] {
    const result: GroupModel[] = [];
    const seen = new Set<string>([groupId]);
    const queue: string[] = [groupId];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      for (const group of this.groups.values()) {
        if (group.parentGroupId === currentId && !seen.has(group.id)) {
          seen.add(group.id);
          result.push(group);
          queue.push(group.id);
        }
      }
    }

    return result;
  }

  /**
   * Nesting depth of a group: number of ancestors (0 for a top-level group).
   */
  getDepth(groupId: string): number {
    return this.getAncestors(groupId).length;
  }

  /**
   * Selection Management
   */

  /**
   * Get all selected nodes
   */
  getSelectedNodes(): NodeModel[] {
    return this.getNodes().filter((node) => node.isSelected());
  }

  /**
   * Select a single node (clears previous selection)
   * @param node - Node to select
   */
  selectNode(node: NodeModel): void {
    if (!node.isSelectable()) {
      return;
    }

    // Clear previous selection
    this.clearSelection();

    // Select the node
    node.setSelected(true);

    // Emit selection changed event
    this.emitOrQueue('selection:changed', {
      selected: [node],
      deselected: []
    });
  }

  /**
   * Add node to selection (multi-select)
   * @param node - Node to add to selection
   */
  addToSelection(node: NodeModel): void {
    if (!node.isSelectable() || node.isSelected()) {
      return;
    }

    node.setSelected(true);

    this.emitOrQueue('selection:changed', {
      selected: [node],
      deselected: []
    });
  }

  /**
   * Remove node from selection
   * @param node - Node to remove from selection
   */
  removeFromSelection(node: NodeModel): void {
    if (!node.isSelected()) {
      return;
    }

    node.setSelected(false);

    this.emitOrQueue('selection:changed', {
      selected: [],
      deselected: [node]
    });
  }

  /**
   * Toggle node selection (add if not selected, remove if selected)
   * @param node - Node to toggle
   */
  toggleNodeSelection(node: NodeModel): void {
    if (!node.isSelectable()) {
      return;
    }

    if (node.isSelected()) {
      this.removeFromSelection(node);
    } else {
      this.addToSelection(node);
    }
  }

  /**
   * Clear all selections
   */
  clearSelection(): void {
    const selectedNodes = this.getSelectedNodes();
    if (selectedNodes.length === 0) {
      return;
    }

    selectedNodes.forEach((node) => node.setSelected(false));

    this.emitOrQueue('selection:changed', {
      selected: [],
      deselected: selectedNodes
    });
  }

  /**
   * Select all nodes
   */
  selectAll(): void {
    const selectableNodes = this.getNodes().filter((node) => node.isSelectable());
    const previouslySelected = this.getSelectedNodes();
    const newlySelected = selectableNodes.filter((node) => !node.isSelected());

    newlySelected.forEach((node) => node.setSelected(true));

    if (newlySelected.length > 0) {
      this.emitOrQueue('selection:changed', {
        selected: newlySelected,
        deselected: []
      });
    }
  }

  /**
   * Delete all selected nodes and their connected links
   * @returns Number of nodes deleted
   */
  deleteSelected(): number {
    if (this.blocksDocumentWrite()) return 0;
    const selectedNodes = this.getSelectedNodes();
    if (selectedNodes.length === 0) {
      return 0;
    }

    // Delete nodes (this will also trigger link cleanup via events)
    selectedNodes.forEach((node) => {
      this.removeNode(node.id);
    });

    return selectedNodes.length;
  }

  /**
   * Get node at position (for click detection)
   * Returns the topmost node at the given position
   * @param x - X coordinate
   * @param y - Y coordinate
   * @returns Node at position, or undefined if none found
   * Phase 3.3: Uses shape-aware hit detection
   */
  getNodeAtPosition(x: number, y: number): NodeModel | undefined {
    const nodes = this.getNodes();

    // Iterate in reverse order (topmost node first)
    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i];
      const bounds = node.getBoundingBox();

      // Phase 3.3: Use shape-aware hit detection
      const shapeConfig = node.getMetadata('shape');
      if (isPointInShape(x, y, bounds, shapeConfig)) {
        return node;
      }
    }

    return undefined;
  }

  /**
   * Option 3: Lock/pin selected nodes
   * Locked nodes will not move during layout operations
   */
  lockSelected(): number {
    const selectedNodes = this.getSelectedNodes();
    if (selectedNodes.length === 0) {
      return 0;
    }

    selectedNodes.forEach((node) => {
      node.setState({ locked: true });
    });

    return selectedNodes.length;
  }

  /**
   * Option 3: Unlock selected nodes
   */
  unlockSelected(): number {
    const selectedNodes = this.getSelectedNodes();
    if (selectedNodes.length === 0) {
      return 0;
    }

    selectedNodes.forEach((node) => {
      node.setState({ locked: false });
    });

    return selectedNodes.length;
  }

  /**
   * Option 3: Get locked nodes
   */
  getLockedNodes(): NodeModel[] {
    return this.getNodes().filter((node) => node.state.locked);
  }

  /**
   * Option 3: Unlock all nodes
   */
  unlockAll(): number {
    const lockedNodes = this.getLockedNodes();
    lockedNodes.forEach((node) => {
      node.setState({ locked: false });
    });
    return lockedNodes.length;
  }

  /**
   * Set viewport (Phase 0.5 - Viewport-Aware Layout)
   */
  setViewport(x: number, y: number, width: number, height: number, zoom?: number): void {
    const oldViewport = { ...this.viewport };
    this.viewport = {
      x,
      y,
      width,
      height,
      zoom: zoom !== undefined ? zoom : this.viewport.zoom
    };
    this.trackChange('viewport', oldViewport, this.viewport);
    this.emitOrQueue('viewport:changed', this.viewport);
  }

  /**
   * Get current viewport
   */
  getViewport(): { x: number; y: number; width: number; height: number; zoom: number } {
    return { ...this.viewport };
  }

  /**
   * Pan viewport
   */
  pan(dx: number, dy: number): void {
    this.setViewport(
      this.viewport.x + dx,
      this.viewport.y + dy,
      this.viewport.width,
      this.viewport.height,
      this.viewport.zoom
    );
  }

  /**
   * Zoom viewport (relative adjustment)
   */
  zoom(delta: number, center?: Point): void {
    const newZoom = Math.max(0.1, Math.min(10, this.viewport.zoom + delta));
    this.setViewport(
      this.viewport.x,
      this.viewport.y,
      this.viewport.width,
      this.viewport.height,
      newZoom
    );
  }

  /**
   * Set absolute zoom level
   * Phase 0.5 - Option B: Pan/Zoom controls
   * @param level - Zoom level (0.1 to 10.0)
   * @param center - Optional center point for zoom (defaults to viewport center)
   */
  setZoom(level: number, center?: Point): void {
    const newZoom = Math.max(0.1, Math.min(10, level));
    this.setViewport(
      this.viewport.x,
      this.viewport.y,
      this.viewport.width,
      this.viewport.height,
      newZoom
    );
  }

  /**
   * Fit viewport to show all nodes (without changing zoom level)
   * Phase 0.5 - Option B: Pan/Zoom controls
   * @param padding - Padding around content (default 100)
   */
  fitToView(padding: number = 100): void {
    const nodes = this.getNodes();

    if (nodes.length === 0) {
      // No nodes - reset to default viewport
      this.setViewport(0, 0, 1200, 800, this.viewport.zoom);
      return;
    }

    // Calculate bounding box of all nodes
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    nodes.forEach(node => {
      const bounds = node.getBoundingBox();
      minX = Math.min(minX, bounds.left);
      minY = Math.min(minY, bounds.top);
      maxX = Math.max(maxX, bounds.right);
      maxY = Math.max(maxY, bounds.bottom);
    });

    // Calculate content dimensions
    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;

    // Calculate viewport size to fit content with padding
    const viewportWidth = contentWidth + padding * 2;
    const viewportHeight = contentHeight + padding * 2;

    // Center the viewport on the content
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    this.setViewport(
      centerX - viewportWidth / 2,
      centerY - viewportHeight / 2,
      viewportWidth,
      viewportHeight,
      this.viewport.zoom
    );

    console.log(`📐 Fit to view: ${nodes.length} nodes, bounds=(${minX.toFixed(1)}, ${minY.toFixed(1)}) to (${maxX.toFixed(1)}, ${maxY.toFixed(1)})`);
  }

  /**
   * Fit viewport to show all nodes AND adjust zoom to fit screen
   * Phase 0.5 - Option B: Pan/Zoom controls
   * @param targetWidth - Target viewport width (e.g. screen width)
   * @param targetHeight - Target viewport height (e.g. screen height)
   * @param padding - Padding around content (default 100)
   */
  zoomToFit(targetWidth: number, targetHeight: number, padding: number = 100): void {
    const nodes = this.getNodes();

    if (nodes.length === 0) {
      // No nodes - reset to default
      this.setViewport(0, 0, targetWidth, targetHeight, 1.0);
      return;
    }

    // Calculate bounding box of all nodes
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    nodes.forEach(node => {
      const bounds = node.getBoundingBox();
      minX = Math.min(minX, bounds.left);
      minY = Math.min(minY, bounds.top);
      maxX = Math.max(maxX, bounds.right);
      maxY = Math.max(maxY, bounds.bottom);
    });

    // Calculate content dimensions
    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;

    // Calculate zoom level to fit content in target viewport
    const availableWidth = targetWidth - padding * 2;
    const availableHeight = targetHeight - padding * 2;

    const scaleX = availableWidth / contentWidth;
    const scaleY = availableHeight / contentHeight;
    const newZoom = Math.min(scaleX, scaleY, 1.0); // Don't zoom in beyond 1.0, only zoom out

    // Center the content in the target viewport
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    this.setViewport(
      centerX - targetWidth / 2,
      centerY - targetHeight / 2,
      targetWidth,
      targetHeight,
      Math.max(0.1, Math.min(10, newZoom))
    );

    console.log(`🔍 Zoom to fit: ${nodes.length} nodes, zoom=${newZoom.toFixed(2)}, content=${contentWidth.toFixed(1)}x${contentHeight.toFixed(1)}`);
  }

  /**
   * Clear all nodes, links, and groups (Phase 1.6c)
   */
  clear(): void {
    // Remove all links first
    const linkIds = Array.from(this.links.keys());
    for (const linkId of linkIds) {
      this.removeLink(linkId);
    }

    // Remove all nodes
    const nodeIds = Array.from(this.nodes.keys());
    for (const nodeId of nodeIds) {
      this.removeNode(nodeId);
    }

    // Remove all groups (Phase 1.6c)
    const groupIds = Array.from(this.groups.keys());
    for (const groupId of groupIds) {
      this.removeGroup(groupId);
    }

    // Phase 5.1: Clear spatial indices
    this.nodeSpatialIndex.clear();
    this.linkSpatialIndex.clear();

    this.emitOrQueue('diagram:cleared');
  }

  /**
   * Get nodes visible in viewport (Phase 5.1)
   * This enables viewport virtualization - only render visible nodes
   *
   * @param viewport - Rectangular viewport region in world coordinates
   * @returns Array of nodes that intersect with the viewport
   *
   * @example
   * ```typescript
   * const viewport = {
   *   x: camera.x,
   *   y: camera.y,
   *   width: canvas.width / camera.zoom,
   *   height: canvas.height / camera.zoom,
   * };
   * const visibleNodes = diagram.getVisibleNodes(viewport);
   * // Only render visibleNodes instead of all nodes
   * ```
   */
  getVisibleNodes(viewport: Rectangle): NodeModel[] {
    return this.nodeSpatialIndex.queryRegion(viewport, {
      filter: (node) => node.state.visible !== false,
    });
  }

  /**
   * Get links visible in viewport (Phase 5.1)
   * This enables viewport virtualization - only render visible links
   *
   * @param viewport - Rectangular viewport region in world coordinates
   * @returns Array of links that intersect with the viewport
   */
  getVisibleLinks(viewport: Rectangle): LinkModel[] {
    return this.linkSpatialIndex.queryRegion(viewport);
  }

  /**
   * The nearest port to a world point, served BY THE SPATIAL INDEX.
   *
   * wave8/culling — Card 2. This is the query a link drag makes on every
   * pointermove, so it is the one query that must never be a scan: the existing
   * answer (`PortModel.findNearestPort`) could only search ONE node — the one the
   * pointer happened to be over — because searching more would have meant walking
   * every node in the diagram. The index turns "which port am I near" into a
   * bounded region query, so a drag can snap to a port it is merely NEAR, not one
   * it is already on top of, without paying O(nodes) sixty times a second.
   *
   * `portPosition` is injectable because THE ENGINE DOES NOT KNOW WHERE PORTS ARE.
   * Its default (`getAbsolutePosition`) walks the bounding box — edge midpoints,
   * blind to the silhouette and to how many ports share a side — while the
   * renderer draws them shape-aware (`portWorldPosition`). Wave 6 fixed exactly
   * this divergence for the port hit-test and the magnet, and it is why callers
   * inside the renderer MUST pass the shape-aware resolver: otherwise you snap to
   * a point several pixels from the circle you can see.
   *
   * @param point   World-space point (usually the drag position).
   * @param options radius (default 24 world units), an optional port filter, and
   *                the port-position resolver described above.
   */
  findNearestPort(
    point: Point,
    options?: NearestPortOptions
  ): NearestPortHit | null {
    const radius = options?.radius ?? DEFAULT_PORT_SNAP_RADIUS;
    const positionOf =
      options?.portPosition ??
      ((port: PortModel, node: NodeModel) =>
        port.getAbsolutePosition(node.getBoundingBox()));

    // A port normally sits ON its node's bounding box, so any port within
    // `radius` belongs to a node whose box is within `radius`. `port.offset` can
    // push it outside, though, so the CANDIDATE search is padded — a few extra
    // candidate nodes cost nothing (they fail the real distance test below),
    // whereas missing one silently loses a snap target.
    const candidates = this.nodeSpatialIndex.queryNear(
      point,
      radius + PORT_OFFSET_PAD,
      { filter: (node) => node.state.visible !== false }
    );

    let best: NearestPortHit | null = null;

    for (const node of candidates) {
      for (const port of node.getPorts()) {
        if (options?.filter && !options.filter(port, node)) continue;

        const p = positionOf(port, node);
        const dx = point.x - p.x;
        const dy = point.y - p.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > radius) continue;
        if (!best || distance < best.distance) {
          best = { port, node, distance };
        }
      }
    }

    return best;
  }

  /**
   * Get bounding box of all visible entities (Phase 5.1)
   * Useful for "fit to viewport" operations
   *
   * @param viewport - Rectangular viewport region
   * @returns Bounding rectangle of visible entities, or null if none visible
   */
  getVisibleBounds(viewport: Rectangle): Rectangle | null {
    const visibleNodes = this.getVisibleNodes(viewport);
    const visibleLinks = this.getVisibleLinks(viewport);

    if (visibleNodes.length === 0 && visibleLinks.length === 0) {
      return null;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    // Include visible nodes
    for (const node of visibleNodes) {
      const bounds = node.getBoundingBox();
      minX = Math.min(minX, bounds.left);
      minY = Math.min(minY, bounds.top);
      maxX = Math.max(maxX, bounds.right);
      maxY = Math.max(maxY, bounds.bottom);
    }

    // Include visible links
    for (const link of visibleLinks) {
      for (const point of link.points) {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      }
    }

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  /**
   * Get all dirty nodes (Phase 5.2)
   * Returns nodes that need re-rendering
   */
  getDirtyNodes(): NodeModel[] {
    return this.getNodes().filter((node) => node.isDirty);
  }

  /**
   * Get all dirty links (Phase 5.2)
   * Returns links that need re-rendering
   */
  getDirtyLinks(): LinkModel[] {
    return this.getLinks().filter((link) => link.isDirty);
  }

  /**
   * Get all dirty groups (Phase 5.2)
   * Returns groups that need re-rendering
   */
  getDirtyGroups(): GroupModel[] {
    return this.getGroups().filter((group) => group.isDirty);
  }

  /**
   * Mark all entities as clean (Phase 5.2)
   * Call this after rendering to reset dirty flags
   */
  markAllClean(): void {
    // Mark all nodes clean
    for (const node of this.nodes.values()) {
      node.markClean();
    }

    // Mark all links clean
    for (const link of this.links.values()) {
      link.markClean();
    }

    // Mark all groups clean
    for (const group of this.groups.values()) {
      group.markClean();
    }

    // Emit event
    this.emitOrQueue('dirty:cleared');
  }

  /**
   * Get total count of dirty entities (Phase 5.2)
   * Useful for monitoring render performance
   */
  getDirtyCount(): number {
    let count = 0;

    for (const node of this.nodes.values()) {
      if (node.isDirty) count++;
    }

    for (const link of this.links.values()) {
      if (link.isDirty) count++;
    }

    for (const group of this.groups.values()) {
      if (group.isDirty) count++;
    }

    return count;
  }

  /**
   * Get visible dirty nodes (Phase 5.2)
   * Combines viewport virtualization with dirty marking
   * Only returns nodes that are both visible AND need re-rendering
   *
   * @param viewport - Rectangular viewport region
   * @returns Array of nodes that are visible and dirty
   *
   * @example
   * ```typescript
   * const viewport = { x: 0, y: 0, width: 800, height: 600 };
   * const dirtyVisible = diagram.getVisibleDirtyNodes(viewport);
   * // Only re-render these nodes - maximum efficiency!
   * ```
   */
  getVisibleDirtyNodes(viewport: Rectangle): NodeModel[] {
    return this.getVisibleNodes(viewport).filter((node) => node.isDirty);
  }

  /**
   * Get visible dirty links (Phase 5.2)
   * Combines viewport virtualization with dirty marking
   * Only returns links that are both visible AND need re-rendering
   *
   * @param viewport - Rectangular viewport region
   * @returns Array of links that are visible and dirty
   */
  getVisibleDirtyLinks(viewport: Rectangle): LinkModel[] {
    return this.getVisibleLinks(viewport).filter((link) => link.isDirty);
  }

  /**
   * Get LOD level based on zoom (Phase 5.3)
   *
   * wave2/rendering: driven by the declarative {@link LODConfig}. Picks the
   * tier whose `minZoom` the zoom crosses — tiers are pre-sorted highest-first,
   * so the first match wins. With the default config this is exactly:
   *   zoom >= 1.0        -> 'high'
   *   0.5 <= zoom < 1.0  -> 'medium'
   *   zoom <  0.5        -> 'low'
   *
   * (wave8/culling moved the medium/low breakpoint 0.2 → 0.5 — see
   * {@link createDefaultLODConfig} for why.)
   *
   * @param zoom - Current zoom level
   * @returns Tier name (default policy: 'high' | 'medium' | 'low')
   */
  getLODLevel(zoom: number): LODLevel {
    const tiers = this._lodTiersDesc;
    for (const tier of tiers) {
      if (zoom >= tier.minZoom) {
        return tier.name;
      }
    }
    // Below every tier's minZoom → fall back to the coarsest (last) tier.
    return tiers.length > 0 ? tiers[tiers.length - 1].name : 'low';
  }

  /**
   * wave2/rendering: single feature gate that reads the active LOD tier's
   * feature set. Renderers call this instead of hardcoding `lod === 'high'`
   * checks, so custom tiers work automatically.
   *
   * @param feature - Visual feature being considered
   * @param lod - Current tier name (from {@link getLODLevel})
   * @returns true if the tier renders that feature
   */
  shouldRender(feature: LODFeature, lod: LODLevel): boolean {
    const tier = this._lodConfig.tiers.find((t) => t.name === lod);
    return tier ? tier.features.has(feature) : false;
  }

  // =========================================================================
  // LOD configuration API (wave2/rendering)
  // =========================================================================

  /** Get the current Level-of-Detail policy. */
  getLODConfig(): LODConfig {
    return this._lodConfig;
  }

  /**
   * Replace the Level-of-Detail policy wholesale. Apps use this to define
   * their own tiers (names, breakpoints and feature sets).
   */
  setLODConfig(config: LODConfig): void {
    this._lodConfig = config;
    this._resortLODTiers();
  }

  /**
   * Register (or replace, by name) a single LOD tier. Lets apps extend the
   * default policy with an extra tier without rebuilding the whole config.
   */
  registerLODTier(tier: LODTier): void {
    const idx = this._lodConfig.tiers.findIndex((t) => t.name === tier.name);
    if (idx >= 0) {
      this._lodConfig.tiers[idx] = tier;
    } else {
      this._lodConfig.tiers.push(tier);
    }
    this._resortLODTiers();
  }

  /** Keep the highest-minZoom-first tier cache in sync with _lodConfig. */
  private _resortLODTiers(): void {
    this._lodTiersDesc = [...this._lodConfig.tiers].sort(
      (a, b) => b.minZoom - a.minZoom
    );
  }

  /**
   * Get visible nodes with LOD information (Phase 5.3)
   * Combines viewport virtualization with Level of Detail
   *
   * @param viewport - Rectangular viewport region
   * @param zoom - Current zoom level
   * @returns Array of nodes with LOD level
   */
  getNodesWithLOD(viewport: Rectangle, zoom: number): EntityWithLOD<NodeModel>[] {
    const lod = this.getLODLevel(zoom);
    const visibleNodes = this.getVisibleNodes(viewport);

    return visibleNodes.map((node) => ({
      entity: node,
      lod,
    }));
  }

  /**
   * Get visible links with LOD information (Phase 5.3)
   * Combines viewport virtualization with Level of Detail
   *
   * @param viewport - Rectangular viewport region
   * @param zoom - Current zoom level
   * @returns Array of links with LOD level
   */
  getLinksWithLOD(viewport: Rectangle, zoom: number): EntityWithLOD<LinkModel>[] {
    const lod = this.getLODLevel(zoom);
    const visibleLinks = this.getVisibleLinks(viewport);

    return visibleLinks.map((link) => ({
      entity: link,
      lod,
    }));
  }

  /**
   * Check if labels should be rendered at this LOD level (Phase 5.3)
   * wave2/rendering: now reads the LOD tier's feature set.
   */
  shouldRenderLabels(lod: LODLevel): boolean {
    return this.shouldRender('labels', lod);
  }

  /**
   * Check if icons should be rendered at this LOD level (Phase 5.3)
   * wave2/rendering: now reads the LOD tier's feature set.
   */
  shouldRenderIcons(lod: LODLevel): boolean {
    return this.shouldRender('icons', lod);
  }

  /**
   * Check if borders should be rendered at this LOD level (Phase 5.3)
   * wave2/rendering: now reads the LOD tier's feature set.
   */
  shouldRenderBorders(lod: LODLevel): boolean {
    return this.shouldRender('borders', lod);
  }

  /**
   * Check if shadows should be rendered at this LOD level (Phase 5.3)
   * wave2/rendering: now reads the LOD tier's feature set.
   */
  shouldRenderShadows(lod: LODLevel): boolean {
    return this.shouldRender('shadows', lod);
  }

  // =============================================================================
  // Layout Management API
  // =============================================================================

  /**
   * Get the layout manager for this diagram
   */
  getLayoutManager(): LayoutManager {
    return this._layoutManager;
  }

  /**
   * Set layout algorithm
   * @param type - Algorithm type ('grid', 'force-directed', 'hierarchical', 'hybrid')
   * @param config - Optional configuration
   */
  setLayoutAlgorithm(type: LayoutAlgorithmType, config?: LayoutConfiguration): void {
    this._layoutManager.setAlgorithm(type, config);
  }

  /**
   * Get current layout algorithm type
   */
  getLayoutAlgorithm(): LayoutAlgorithmType {
    return this._layoutManager.getCurrentAlgorithmType();
  }

  /**
   * Configure current layout algorithm
   */
  configureLayout(config: LayoutConfiguration): void {
    this._layoutManager.configure(config);
  }

  /**
   * Get layout configuration
   */
  getLayoutConfiguration(): LayoutConfiguration {
    return this._layoutManager.getConfiguration();
  }

  /**
   * Enable or disable automatic layout for new nodes
   * When enabled, newly added nodes will be automatically positioned using the current layout algorithm
   */
  setAutoLayout(enabled: boolean): void {
    this._autoLayoutEnabled = enabled;
  }

  /**
   * Check if auto-layout is enabled
   */
  isAutoLayoutEnabled(): boolean {
    return this._autoLayoutEnabled;
  }

  /**
   * Re-layout all nodes using current algorithm
   * This will recalculate positions for all nodes in the diagram
   */
  async reLayout(config?: LayoutConfiguration): Promise<void> {
    return this._layoutManager.reLayout(config);
  }

  /**
   * Override: End batch update mode
   * Fires accumulated events when all batches complete
   */
  override endBatch(): void {
    // Call parent to handle dirty state
    super.endBatch();

    // When all batches complete (check parent's isBatching), fire queued events
    if (!this.isBatching() && this._pendingEvents.length > 0) {
      // Fire all queued events individually
      const events = [...this._pendingEvents];
      this._pendingEvents = [];

      for (const event of events) {
        this.emitter.emit(event.type, event.data);
      }

      // Also fire a batch:complete event for listeners that want to know
      this.emitter.emit('batch:complete', {
        eventCount: events.length,
        events: events
      });
    }
  }

  /**
   * Emit event, respecting batch mode
   * During batch mode, events are queued instead of fired immediately
   */
  private emitOrQueue(eventType: string, data?: any): void {
    const batching = this.isBatching();
    if (batching) {
      // Queue event for later
      this._pendingEvents.push({ type: eventType, data });
    } else {
      // Emit immediately
      this.emitter.emit(eventType, data);
    }
  }

  /**
   * Serialize to JSON
   */
  serialize(): SerializedDiagram {
    return {
      schemaVersion: DIAGRAM_SCHEMA_VERSION,
      id: this.id,
      uuid: this.uuid,
      type: 'diagram',
      version: this.version,
      metadata: Object.fromEntries(this.metadata),
      name: this.name,
      nodes: Array.from(this.nodes.values()).map((n) => n.serialize()),
      links: Array.from(this.links.values()).map((l) => l.serialize()),
      groups: Array.from(this.groups.values()).map((g) => g.serialize()), // Phase 1.6c
      viewport: { ...this.viewport },
    };
  }

  /**
   * Rebuild the derived port-connection registries from the diagram's links.
   *
   * `PortModel.currentConnections` is DERIVED state (which links touch this
   * port). It is never serialized; instead it is reconstructed
   * deterministically here so `canConnect()` / `maxConnections` enforcement
   * survive save/load. Runs inside fromJSON, and is safe to re-run at any
   * time — existing registries are reset first, so the result is always
   * exactly the current links.
   *
   * A self-loop (source === target port) registers once — the Set dedupes —
   * so it counts as ONE connection on that port.
   *
   * @returns endpoints that resolve to no known port (corrupt/dangling links),
   *          for callers that want to surface them.
   */
  reconcilePortConnections(): Array<{ linkId: string; portId: string; end: 'source' | 'target' }> {
    // Reset: the registry must be exactly what the links imply, not a merge
    // of stale + current.
    for (const { port } of this.portIndex.values()) {
      port.currentConnections.clear();
      // Wave 6: the DIRECTIONAL registry is derived state too — rebuilt here, or
      // `fromMaxLinks`/`toMaxLinks` would count stale roles after a reload.
      port.linkRoles.clear();
    }

    const dangling: Array<{ linkId: string; portId: string; end: 'source' | 'target' }> = [];
    for (const link of this.links.values()) {
      for (const [end, portId] of [
        ['source', link.sourcePortId],
        ['target', link.targetPortId],
      ] as const) {
        const entry = this.portIndex.get(portId);
        if (entry) {
          entry.port.restoreConnection(link.id, end);
        } else {
          dangling.push({ linkId: link.id, portId, end });
        }
      }
    }
    return dangling;
  }

  /**
   * Apply an incremental patch (see serialization/Incremental.ts) — the
   * receive side of toIncremental/apply. Added entities are installed through
   * the SAME unified restore path as document load (fully wired); modified
   * entities are updated IN PLACE so object identity is preserved for
   * renderers holding references; normal change events fire (an applied
   * patch IS a mutation, unlike a document load).
   */
  applyIncremental(patch: DiagramIncremental): void {
    this.assertNotDisposed();
    if (patch.format !== INCREMENTAL_FORMAT) {
      throw new Error(`Not an incremental patch (format '${(patch as any)?.format}')`);
    }
    if (patch.schemaVersion > DIAGRAM_SCHEMA_VERSION) {
      throw new Error(
        `Incremental patch has schemaVersion ${patch.schemaVersion}, newer than this ` +
          `runtime (${DIAGRAM_SCHEMA_VERSION}) — refusing to apply.`
      );
    }

    this.beginBatch();
    try {
      // Removals first — links before the nodes they reference.
      for (const id of patch.removed.links) this.removeLink(id);
      for (const id of patch.removed.nodes) this.removeNode(id);
      for (const id of patch.removed.groups) this.removeGroup(id);

      // Additions through the unified restore path (fully wired entities).
      for (const nodeData of patch.added.nodes) this.restoreNode(nodeData);
      for (const linkData of patch.added.links) this.restoreLink(linkData);
      for (const groupData of patch.added.groups) this.restoreGroup(groupData);

      // In-place modifications (a modified-but-locally-missing entity is
      // treated as an add — patches may arrive against divergent replicas).
      for (const nodeData of patch.modified.nodes) this.applySerializedNode(nodeData);
      for (const linkData of patch.modified.links) this.applySerializedLink(linkData);
      for (const groupData of patch.modified.groups) this.applySerializedGroup(groupData);

      if (patch.diagram) {
        if (patch.diagram.name !== undefined) this.name = patch.diagram.name;
        if (patch.diagram.viewport) this.viewport = { ...patch.diagram.viewport };
        if (patch.diagram.metadata) {
          this.metadata = new Map(Object.entries(patch.diagram.metadata));
        }
      }

      // Derived state follows the links.
      this.reconcilePortConnections();
    } finally {
      this.endBatch(); // queued events flush here — normal mutation semantics
    }

    // Converge the mutation counter to the SOURCE's — the replica must
    // serialize identically to the diagram the patch came from, and apply's
    // own internal trackChange bumps are implementation noise, not edits.
    if (typeof patch.targetVersion === 'number') {
      this.version = patch.targetVersion;
    }

    this.emitter.emit('diagram:incremental-applied', {
      added: patch.added.nodes.length + patch.added.links.length + patch.added.groups.length,
      removed:
        patch.removed.nodes.length + patch.removed.links.length + patch.removed.groups.length,
      modified:
        patch.modified.nodes.length + patch.modified.links.length + patch.modified.groups.length,
    });
  }

  /** In-place node update from serialized data (identity preserved). */
  private applySerializedNode(data: any): void {
    const node = this.nodes.get(data.id);
    if (!node) {
      this.restoreNode(data);
      return;
    }
    node.position = { ...data.position };
    node.size = { ...data.size };
    node.rotation = data.rotation;
    node.scale = data.scale;
    node.parentId = data.parentId;
    node.children = new Set(data.children);
    node.state = data.state;
    node.behavior = data.behavior;
    node.style = data.style;
    node.data = data.data;
    node.positionMode = data.positionMode || 'absolute';
    node.transformOrigin = data.transformOrigin || { x: 0.5, y: 0.5 };
    node.metadata = new Map(Object.entries(data.metadata ?? {}));

    // Replace ports, keeping the O(1) index exact WITHOUT re-running
    // indexNodePorts (which would stack another pair of port listeners).
    if (Array.isArray(data.ports)) {
      for (const port of node.getPorts()) {
        const entry = this.portIndex.get(port.id);
        if (entry?.node === node) this.portIndex.delete(port.id);
      }
      node.ports.clear();
      for (const portData of data.ports) {
        const port = PortModel.fromJSON(portData);
        node.ports.set(port.id, port);
        this.portIndex.set(port.id, { node, port });
      }
    }

    if (typeof data.version === 'number') node.version = data.version;
    this.nodeSpatialIndex.update(node);
    node.markDirty('incremental');
    this.emitOrQueue('node:changed', node);
    this.emitOrQueue('node:moved', { nodeId: node.id, position: node.position });
  }

  /** In-place link update from serialized data (identity preserved). */
  private applySerializedLink(data: any): void {
    const link = this.links.get(data.id);
    if (!link) {
      this.restoreLink(data);
      return;
    }
    link.sourcePortId = data.sourcePortId;
    link.targetPortId = data.targetPortId;
    link.sourceNodeId = data.sourceNodeId ?? this.getNodeByPortId(data.sourcePortId)?.id;
    link.targetNodeId = data.targetNodeId ?? this.getNodeByPortId(data.targetPortId)?.id;
    link.pathType = data.pathType;
    link.points = (data.points ?? []).map((point: any) => ({ ...point }));
    link.segments = (data.segments ?? []).map((segment: any) => ({ ...segment }));
    link.labels = (data.labels ?? []).map((label: any) => ({ ...label }));
    link.state = data.state;
    link.style = data.style;
    link.data = data.data;
    link.metadata = new Map(Object.entries(data.metadata ?? {}));
    if (typeof data.version === 'number') link.version = data.version;
    this.linkSpatialIndex.update(link);
    link.markDirty('incremental');
    this.emitOrQueue('link:changed', link);
  }

  /** In-place group update from serialized data (identity preserved). */
  private applySerializedGroup(data: any): void {
    const group = this.groups.get(data.id);
    if (!group) {
      this.restoreGroup(data);
      return;
    }
    group.name = data.name;
    group.members = new Set(data.members ?? []);
    group.isCollapsed = data.isCollapsed;
    group.bounds = data.bounds;
    if (data.layoutType) group.layoutType = data.layoutType;
    if (data.layoutConfig) group.layoutConfig = data.layoutConfig;
    if (data.position) group.position = { x: data.position.x, y: data.position.y };
    if (data.size) group.size = { ...data.size };
    group.parentGroupId = data.parentGroupId;
    // Wave-5 Card 3: keep the incremental in-place path lossless for the new
    // subflow geometry (absent keys reset to their defaults, matching fromJSON).
    group.padding = data.padding;
    group.headerHeight = typeof data.headerHeight === 'number' ? data.headerHeight : 0;
    group.zIndex = typeof data.zIndex === 'number' ? data.zIndex : 0;
    group.fitMode = data.fitMode ?? 'exact';
    group.constrainChildren = data.constrainChildren ?? false;
    // Wave-5 Card 4: collapsed-state payload (proxy wiring + saved layout).
    group.collapsedState = data.collapsedState;
    // Wave-5 Card 5: per-group compound-layout intent.
    group.subgraphLayout = data.subgraphLayout;
    // Wave-5 Card 6: swimlane/pool band config.
    group.laneConfig = data.laneConfig;
    // Wave-5 Card 7: declarative membership rule + capacity/WIP limit.
    group.membershipRule = data.membershipRule;
    group.capacity = data.capacity;
    // Replace metadata CONTENT but keep the runtime diagram back-ref wired.
    group.metadata = new Map(Object.entries(data.metadata ?? {}));
    group.metadata.set('diagram', this);
    if (typeof data.version === 'number') group.version = data.version;
    group.markDirty('incremental');
    this.emitOrQueue('group:changed', group);
  }

  /**
   * Deserialize from JSON — THE document load path.
   *
   * Contract: a loaded diagram behaves identically to an authored one.
   * Every entity is installed through the same install* wiring as
   * interactive creation (diagram back-refs, spatial indices, port index,
   * change-forwarding listeners), port registries are reconciled, and the
   * document is migrated to the current schema first. The load itself is
   * NOT a user mutation: per-entity events queued during the restore are
   * dropped, the change log ends empty, and `version` reports the SAVED
   * counter — then a single 'diagram:loaded' event fires.
   */
  static fromJSON(data: SerializedDiagram, options?: DiagramLoadOptions): DiagramModel {
    // 1) Upgrade older documents (throws on newer-than-runtime or a gap).
    const doc = runDiagramMigrations(data);

    // 2) Optional structural validation with caller-chosen policy.
    let report: DiagramValidationReport | undefined;
    const policy = options?.validate ?? 'off';
    if (policy !== 'off') {
      report = validateSerializedDiagram(doc);
      if (policy === 'strict' && !report.ok) {
        throw new DiagramValidationError(report);
      }
      if (policy === 'warn' && (report.errors.length || report.warnings.length)) {
        console.warn(
          `Diagram '${doc.name}' loaded with ${report.errors.length} integrity error(s) ` +
            `and ${report.warnings.length} warning(s)`,
          report
        );
      }
    }

    // 3) Reproduce the saved identity — a load must not mint a new diagram.
    const diagram = new DiagramModel(doc.name, { id: doc.id, uuid: doc.uuid });

    // Restore viewport with backward compatibility
    diagram.viewport = {
      x: doc.viewport.x,
      y: doc.viewport.y,
      width: doc.viewport.width || 1200,   // Default for old diagrams
      height: doc.viewport.height || 800,  // Default for old diagrams
      zoom: doc.viewport.zoom
    };

    // 4) Install every entity through the SAME wiring as interactive
    //    creation, inside a batch window so the restore doesn't fire an
    //    O(entities) event storm. Nodes go first so link node-id backfill
    //    and port resolution work; groups after links (members reference
    //    both).
    diagram.beginBatch();
    try {
      for (const nodeData of doc.nodes) {
        diagram.restoreNode(nodeData);
      }
      for (const linkData of doc.links) {
        diagram.restoreLink(linkData);
      }
      if (doc.groups) {
        for (const groupData of doc.groups) {
          diagram.restoreGroup(groupData);
        }
      }

      // Restore metadata
      for (const [key, value] of Object.entries(doc.metadata)) {
        diagram.metadata.set(key, value);
      }

      // 5) Rebuild derived state (port connection registries).
      diagram.reconcilePortConnections();
    } finally {
      // A load is not N user mutations: drop the queued per-entity events
      // (node:added × N, …) instead of firing them, then close the batch.
      diagram._pendingEvents = [];
      diagram.endBatch();
    }

    // 6) Version parity + clean change state: the loaded model reports the
    //    SAVED mutation counter and an empty change log, exactly like the
    //    diagram that was serialized. (Render-dirty state is untouched — a
    //    fresh load must still paint.)
    diagram.changeLog.length = 0;
    diagram.version = doc.version ?? 1;

    // 7) One document-level event replaces the storm.
    diagram.emitter.emit('diagram:loaded', {
      nodeCount: diagram.nodes.size,
      linkCount: diagram.links.size,
      groupCount: diagram.groups.size,
      schemaVersion: doc.schemaVersion ?? DIAGRAM_SCHEMA_VERSION,
      validation: report,
    });

    return diagram;
  }

  /**
   * Dispose diagram and all child entities (Phase 5.4)
   * Prevents memory leaks by:
   * - Disposing all nodes, links, and groups
   * - Breaking circular references
   * - Clearing spatial indices
   * - Calling parent dispose()
   */
  override dispose(): void {
    this.assertNotDisposed();

    // Dispose all child entities first (children before parent)
    // This ensures proper cleanup order and prevents orphaned listeners

    // Dispose all nodes
    for (const node of this.nodes.values()) {
      // Break circular reference before disposal
      node.diagram = undefined;
      node.dispose();
    }

    // Dispose all links
    for (const link of this.links.values()) {
      link.dispose();
    }

    // Dispose all groups
    for (const group of this.groups.values()) {
      group.dispose();
    }

    // Clear collections
    this.nodes.clear();
    this.links.clear();
    this.groups.clear();
    this.portIndex.clear();

    // Clear spatial indices (prevents memory leaks from indexed entities)
    this.nodeSpatialIndex.clear();
    this.linkSpatialIndex.clear();

    // Dispose layout manager
    this._layoutManager.dispose();

    // Call parent dispose (removes listeners, clears metadata, etc.)
    super.dispose();
  }
}
