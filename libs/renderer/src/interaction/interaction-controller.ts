import type {
  DiagramEngine,
  NodeModel,
  LinkModel,
  Point,
  ArrowStyle,
} from '@grafloria/engine';
import {
  PortModel,
  isConnectionAllowedByGroup,
  SetLinkPointsCommand,
  ReconnectLinkCommand,
} from '@grafloria/engine';
// Wave 6: THE port-position function — hit-test and magnet where you DRAW.
import { portWorldPosition } from '../svg/port-positioning';
import { WaypointEditor } from './WaypointEditor';
import { ControlPointEditor } from './ControlPointEditor';
import { ArrowRenderer } from '../svg/ArrowRenderer';
import { DEFAULT_LINK_HIT_TOLERANCE, hitTestLink } from '../svg/link-hit-test';
import type { LinkHitTestOptions, LinkPart } from '../svg/link-hit-test';
// wave10/gallery: the HOST's connection-veto registry. See
// installHostConnectionValidatorBridge() — the drag path never asked it.
import { isValidConnection } from '../ext/tools';

/**
 * Part-aware link hit result: a link plus WHICH sub-part of it was hit
 * (body / label / endpoint / arrow) and local info (label index, or the 0-1
 * position `t` along the path for body hits). Downstream edge features
 * (inline label editing, endpoint reconnection, edge toolbar) key off `part`.
 */
export interface LinkPartHit {
  link: LinkModel;
  part: LinkPart;
  labelIndex?: number;
  t?: number;
}

/**
 * InteractionController — the framework-agnostic interaction brain.
 *
 * Owns all pointer/keyboard-driven interaction LOGIC for a diagram: hover
 * detection, port connection dragging, link endpoint reconnection, inline label
 * repositioning, and waypoint / control-point editing.
 *
 * ## Framework contract
 *
 * This class answers **"WHAT changed?"** — never **"who should re-render?"**.
 * Every handler returns a boolean (or a value) telling the host whether a
 * re-render is warranted; the host framework decides how to act on that:
 *
 * - Angular  → `cdr.markForCheck()`   (see `InteractionHandlerService`)
 * - React    → `setState` / `useSyncExternalStore`
 * - Vue      → touch a `ref`
 * - Vanilla  → call your own `render()`
 *
 * It therefore has **zero framework imports** (no Angular, no DOM beyond the
 * ambient `performance.now()` clock) and is instantiated with a plain `new`.
 * It takes WORLD coordinates only: converting client/screen pixels into world
 * space is the job of {@link ViewportController}, so this class never touches
 * an event, an element, or a bounding rect.
 *
 * Supports three interaction modes (driven by the engine's interaction config):
 * - DIRECT: Drag node body to move, drag port to connect
 * - DELIBERATE: Select node first, then drag to move
 * - SMART: Visio-style with hover-based port visibility
 *
 * The Angular `InteractionHandlerService` is a thin `@Injectable` subclass of
 * this class and adds no behaviour of its own.
 */
export class InteractionController {
  /**
   * Shared arrow renderer used only for canonical arrow tip-offset geometry
   * when computing arrowhead hit anchors (see {@link buildLinkHitOptions}).
   */
  protected readonly arrowRenderer = new ArrowRenderer();

  /**
   * Wave 9 — Card 2. Extra hit radius in WORLD units, granted while a TOUCH
   * pointer owns the gesture (the binder sets it on touch down and clears it on
   * up). A 5px port is not hittable with a fingertip; this is what makes ports,
   * waypoints and control-point handles touch-sized without changing how any of
   * them RENDER — the visual stays crisp, only the catchment grows.
   *
   * World, not screen: every hit test here is world-space, so a screen-px slop
   * would shrink to nothing exactly when you are zoomed out and the targets are
   * already smallest.
   */
  private hitSlop = 0;

  /**
   * Wave 9 — Card 7. Is the document locked?
   *
   * The InteractionController is the LAST place a read-only bypass could hide,
   * because it is the one layer that mutates the model DIRECTLY — it never touches
   * the CommandManager. Most of its writes now hit the model-level guards anyway,
   * but `moveControlPoint` writes `link.segments` as a RAW PUBLIC FIELD, which no
   * model guard can see. So the refusal has to be here as well.
   */
  private isReadonlyEngine(engine?: DiagramEngine | null): boolean {
    return engine?.getDiagram()?.isReadonly() === true;
  }

  /** Read-only probe for the methods that are handed a link but no engine. */
  private isReadonlyLink(link?: LinkModel | null): boolean {
    return (link as unknown as { diagram?: { isReadonly(): boolean } })?.diagram?.isReadonly() === true;
  }

  /** Grow every hit target by `world` units (0 = mouse-precision, the default). */
  setHitSlop(world: number): void {
    this.hitSlop = Math.max(0, world);
  }

  getHitSlop(): number {
    return this.hitSlop;
  }

  /**
   * Current hover state
   */
  protected hoveredNode: NodeModel | null = null;
  protected hoveredPort: PortModel | null = null;
  protected hoveredLink: LinkModel | null = null;

  /**
   * Connection drag state
   */
  protected isConnecting = false;
  protected connectionSourcePort: PortModel | null = null;

  /**
   * Link reconnection state
   */
  protected isReconnectingLink = false;
  protected reconnectingLink: LinkModel | null = null;
  protected reconnectingEndpoint: 'source' | 'target' | null = null;
  /** Wave 2: current cursor position while dragging a reconnecting endpoint. */
  protected reconnectingMousePoint: Point | null = null;

  /**
   * Wave 2 (Edges & links): inline label drag-reposition state. While active,
   * mouse moves remap the cursor to a (position 0-1, offset) pair on the model
   * so the label survives re-routing. See {@link computeLabelDragUpdate}.
   */
  protected isDraggingLabel = false;
  protected editingLabelLink: LinkModel | null = null;
  protected editingLabelIndex: number | null = null;

  /**
   * Phase 2.3a: Waypoint editing state
   */
  protected isDraggingWaypoint = false;
  protected editingLink: LinkModel | null = null;
  protected editingWaypointIndex: number | null = null;
  /**
   * wave12: the link's points when a waypoint drag STARTED, so endWaypointDrag can commit
   * the whole gesture as one undoable SetLinkPointsCommand (FROM→TO). Absent between drags.
   */
  protected waypointDragStartPoints: Point[] | null = null;
  protected waypointEditor: WaypointEditor | null = null;
  protected hoveredWaypointIndex: number | null = null;
  protected hoveredWaypointLink: LinkModel | null = null;

  /**
   * Phase 2.3b: Control point editing state
   */
  protected isDraggingControlPoint = false;
  protected editingControlPointLink: LinkModel | null = null;
  protected editingControlPointSegmentIndex: number | null = null;
  protected editingControlPointType: 'control1' | 'control2' | null = null;
  protected controlPointEditor: ControlPointEditor | null = null;
  protected hoveredControlPointSegmentIndex: number | null = null;
  protected hoveredControlPointType: 'control1' | 'control2' | null = null;
  protected hoveredControlPointLink: LinkModel | null = null;

  /**
   * Phase 5: Performance optimization - debounce hover detection
   */
  protected hoverDebounceTimer: any = null;
  protected readonly HOVER_DEBOUNCE_MS = 16; // ~60fps

  /**
   * Phase 5: Performance monitoring
   */
  protected performanceMetrics = {
    hoverDetectionTime: 0,
    connectionUpdateTime: 0,
    portHitTestTime: 0,
  };

  /**
   * Phase 5: Port hit test cache for performance
   */
  protected portHitCache = new Map<string, { x: number; y: number; radius: number }>();
  protected portHitCacheInvalidated = false;

  constructor() {
    // Phase 2.3a: Initialize waypoint editor with default config
    this.waypointEditor = new WaypointEditor({
      snapToGrid: false,
      gridSize: 20,
      removeOnDoubleClick: true,
      handleRadius: 5,
      handleColor: '#3b82f6',
      handleStrokeColor: '#ffffff',
      minDistanceFromEndpoints: 30,
      clickDetectionRadius: 10,
    });

    // Phase 2.3b: Initialize control point editor with default config
    this.controlPointEditor = new ControlPointEditor({
      snapToGrid: false,
      gridSize: 20,
      handleRadius: 6,
      handleColor: '#10b981',
      handleStrokeColor: '#ffffff',
      controlLineColor: '#6b7280',
      controlLineWidth: 1,
      controlLineDash: [5, 5],
      clickDetectionRadius: 10,
      showControlLines: true,
      symmetricControls: false,
    });
  }

  /**
   * Phase 5: Dispose and cleanup resources
   */
  dispose(): void {
    if (this.hoverDebounceTimer) {
      clearTimeout(this.hoverDebounceTimer);
      this.hoverDebounceTimer = null;
    }
    this.portHitCache.clear();
    this.hoveredNode = null;
    this.hoveredPort = null;
    this.hoveredLink = null;
    // BUGFIX (wave 3): `isConnecting` was never cleared here, so a disposed
    // controller reported `isInteracting() === true` forever — surfaced by the
    // first framework-free dispose test. Cleared alongside its source port.
    this.isConnecting = false;
    this.connectionSourcePort = null;
    this.reconnectingLink = null;
    this.reconnectingEndpoint = null;
    this.reconnectingMousePoint = null;
    this.isReconnectingLink = false;
    // Wave 2: Clean up label drag state
    this.isDraggingLabel = false;
    this.editingLabelLink = null;
    this.editingLabelIndex = null;
    // Phase 2.3a: Clean up waypoint editing state
    this.editingLink = null;
    this.editingWaypointIndex = null;
    this.isDraggingWaypoint = false;
    this.hoveredWaypointIndex = null;
    this.hoveredWaypointLink = null;
    // Phase 2.3b: Clean up control point editing state
    this.editingControlPointLink = null;
    this.editingControlPointSegmentIndex = null;
    this.editingControlPointType = null;
    this.isDraggingControlPoint = false;
    this.hoveredControlPointSegmentIndex = null;
    this.hoveredControlPointType = null;
    this.hoveredControlPointLink = null;
  }

  /**
   * Phase 5: Get performance metrics
   */
  getPerformanceMetrics() {
    return { ...this.performanceMetrics };
  }

  /**
   * Phase 5: Invalidate port hit cache (call when nodes move or ports change)
   */
  invalidatePortHitCache(): void {
    this.portHitCacheInvalidated = true;
  }

  /**
   * Phase 3: Handle mouse move for hover detection
   * Phase 5: Enhanced with performance monitoring and validation
   * Updates hover states for nodes, ports, and links
   * CRITICAL FIX: Added comprehensive debugging
   */
  handleMouseMove(
    worldX: number,
    worldY: number,
    engine: DiagramEngine
  ): boolean {
    // Phase 5: Validate inputs
    if (!engine || !isFinite(worldX) || !isFinite(worldY)) {
      return false;
    }

    const diagram = engine.getDiagram();
    if (!diagram) return false;

    // Phase 5: Performance monitoring
    const startTime = performance.now();

    const config = engine.getInteractionConfig();
    let needsRender = false;

    // Find what's under the cursor
    const nodeAtPosition = diagram.getNodeAtPosition(worldX, worldY);
    const portAtPosition = this.findPortAtPosition(worldX, worldY, diagram, engine);
    const linkAtPosition = this.findLinkAtPosition(worldX, worldY, diagram);

    // CRITICAL FIX: Debug logging for port detection
    const debugPortDetection = false; // Disabled - working correctly now
    if (debugPortDetection && (portAtPosition || nodeAtPosition)) {
      console.log('🔍 Hover detection:', {
        worldPos: { x: worldX.toFixed(1), y: worldY.toFixed(1) },
        node: nodeAtPosition?.getMetadata('label') || 'none',
        port: portAtPosition ? `${portAtPosition.side} (${portAtPosition.id})` : 'none',
        portVisibility: config.portVisibility,
      });
    }

    // Update node hover state. Hovering a node's CHROME (a drag-handle child)
    // is hovering the node: without the propagation, a window whose title bar
    // covers its top strip never reads as hovered there — so its hover-visible
    // ports never surfaced ("the port on the title" report, second half).
    const chromeParent =
      nodeAtPosition?.behavior?.dragHandler?.isDragHandler === true && nodeAtPosition.parentId
        ? diagram.getNode(nodeAtPosition.parentId)
        : null;
    const allNodes = diagram.getNodes();
    allNodes.forEach((node) => {
      const wasHovered = node.state.hovered;
      const isHovered = node === nodeAtPosition || node === chromeParent;

      if (wasHovered !== isHovered) {
        node.setState({ hovered: isHovered });
        needsRender = true;
        if (debugPortDetection) {
          console.log(`  Node ${node.getMetadata('label')} hover: ${wasHovered} → ${isHovered}`);
        }
      }
    });

    // Update port hover state
    allNodes.forEach((node) => {
      node.getPorts().forEach((port) => {
        const wasHovered = port.isHovered;
        const isHovered = port === portAtPosition;

        if (wasHovered !== isHovered) {
          port.isHovered = isHovered;
          needsRender = true;
          // CRITICAL FIX: Mark node as dirty when port hover state changes
          // This forces the renderer to regenerate the port VNodes with updated styles
          node.markDirty('port-hover-changed');
          // TEMPORARY DEBUG: Always log port hover changes to see what's happening
          console.log(`🔘 Port ${port.side} hover: ${wasHovered} → ${isHovered}`, { nodeLabel: node.getMetadata('label') });
        }
      });
    });

    // Update link hover state
    const allLinks = diagram.getLinks();
    allLinks.forEach((link) => {
      const currentState = link.state;
      const isHovered = link === linkAtPosition;

      // Don't override selected/highlighted states with hover
      // Selected and highlighted links keep their state even when hovered
      if (currentState === 'selected' || currentState === 'highlighted') {
        return; // Keep current state, don't change to hovered
      }

      const wasHovered = currentState === 'hovered';

      if (wasHovered !== isHovered) {
        link.setState(isHovered ? 'hovered' : 'default');
        needsRender = true;
      }
    });

    // Store current hover state
    this.hoveredNode = nodeAtPosition || null;
    this.hoveredPort = portAtPosition;
    this.hoveredLink = linkAtPosition;

    // Phase 5: Track performance
    this.performanceMetrics.hoverDetectionTime = performance.now() - startTime;

    return needsRender;
  }

  /**
   * Phase 3: Handle connection drag update
   * Phase 5: Enhanced with performance monitoring and validation
   * Updates connection preview during drag
   */
  handleConnectionDrag(
    worldX: number,
    worldY: number,
    engine: DiagramEngine
  ): boolean {
    // Phase 5: Validate state and inputs
    if (!this.isConnecting || !this.connectionSourcePort) {
      return false;
    }

    if (!engine || !isFinite(worldX) || !isFinite(worldY)) {
      return false;
    }

    // Phase 5: Performance monitoring
    const startTime = performance.now();

    try {
      const connectionStateManager = engine.getConnectionStateManager();

      // Wave 6 (Card 6): MAGNET SNAP. Fall back from "the port under the cursor"
      // to "the nearest VALID port within the magnet radius", so a drag latches
      // on before the pointer is precisely over a 6px circle. The radius is the
      // engine's `snapToPortRadius`, and the candidate set is the SAME
      // valid-target set the highlight paints — the thing you can snap to is
      // exactly the thing lit up as snappable, which is the whole contract.
      const hoveredPort = this.hoveredPort ?? this.findMagnetPort(worldX, worldY, engine);

      // Update connection state with current mouse position and hovered port
      connectionStateManager.updateConnection(
        { x: worldX, y: worldY },
        hoveredPort || undefined
      );

      // Update port highlight states
      this.updatePortHighlights(engine);

      // Phase 5: Track performance
      this.performanceMetrics.connectionUpdateTime = performance.now() - startTime;

      return true;
    } catch (error) {
      // Phase 5: Error handling
      console.error('Error during connection drag:', error);
      this.cancelConnection(engine);
      return false;
    }
  }

  /**
   * Phase 3: Start connection from port
   * Phase 5: Enhanced with validation and error handling
   * CRITICAL FIX: Added detailed logging
   */
  startConnection(port: PortModel, worldX: number, worldY: number, engine: DiagramEngine): void {
    if (this.isReadonlyEngine(engine)) return;
    // Phase 5: Validate inputs
    if (!port || !engine || !isFinite(worldX) || !isFinite(worldY)) {
      console.warn('❌ Invalid inputs for startConnection:', { port: !!port, engine: !!engine, worldX, worldY });
      return;
    }

    try {
      this.isConnecting = true;
      this.connectionSourcePort = port;

      const connectionStateManager = engine.getConnectionStateManager();
      connectionStateManager.startConnection(port, { x: worldX, y: worldY });

      console.log('🔌 Connection started:', {
        portId: port.id,
        portType: port.type,
        portSide: port.side,
        position: { x: worldX.toFixed(1), y: worldY.toFixed(1) }
      });
    } catch (error) {
      // Phase 5: Error recovery
      console.error('❌ Error starting connection:', error);
      this.isConnecting = false;
      this.connectionSourcePort = null;
    }
  }

  /**
   * wave12/connect-ergonomics (gap 3) — Easy Connect: start a connection from a
   * node BODY, not a port glyph. Picks the source port nearest the press point
   * (so a drag off the right side starts from the right port) and begins the
   * normal connection drag from it. Returns false when the node has no port to
   * start from. The whole gesture then flows through the existing connection
   * pipeline (preview on move, {@link completeConnection} on drop).
   */
  startNodeBodyConnection(
    node: NodeModel,
    worldX: number,
    worldY: number,
    engine: DiagramEngine
  ): boolean {
    if (this.isReadonlyEngine(engine)) return false;
    const port = this.nearestPortOnNode(node, worldX, worldY);
    if (!port) return false;
    this.startConnection(port, worldX, worldY, engine);
    return true;
  }

  /** The node's port whose drawn position is nearest `(worldX, worldY)`, or null. */
  private nearestPortOnNode(node: NodeModel, worldX: number, worldY: number): PortModel | null {
    let best: PortModel | null = null;
    let bestDistance = Infinity;
    for (const port of node.getPorts().values()) {
      const p = portWorldPosition(port, node);
      const distance = Math.hypot(worldX - p.x, worldY - p.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = port;
      }
    }
    return best;
  }

  /**
   * Phase 3: Complete connection to target port
   * Phase 5: Enhanced with validation and error handling
   */
  completeConnection(engine: DiagramEngine): boolean {
    if (this.isReadonlyEngine(engine)) return false;
    // Phase 5: Validate state
    if (!this.isConnecting || !this.connectionSourcePort) {
      return false;
    }

    if (!engine) {
      console.warn('Invalid engine in completeConnection');
      this.cancelConnection(engine);
      return false;
    }

    try {
      const config = engine.getInteractionConfig();
      const connectionStateManager = engine.getConnectionStateManager();
      let targetPort = this.hoveredPort;

    // Smart mode: Auto-connect to nearest port if dropping on (or near) a node.
    //
    // wave8/culling — Card 2. This used to call `PortModel.findNearestPort`, and
    // it had TWO defects, both of which the spatial index fixes:
    //
    //  1. It searched exactly ONE node — `this.hoveredNode` — because searching
    //     more meant walking every node in the diagram. So a drop that landed
    //     NEAR a node instead of ON it connected to nothing. `findNearestPort`
    //     asks the index, so the search is bounded by the snap radius rather than
    //     by the scene, and a near miss now snaps.
    //
    //  2. It measured to the BOUNDING-BOX EDGE MIDPOINT (`getEdgePosition`) while
    //     the renderer draws ports shape-aware. On any non-rect silhouette, or any
    //     side carrying more than one port, it was snapping to a point several
    //     pixels away from the circle the user could see. Wave 6 fixed exactly
    //     this divergence for the port hit-test and the magnet — this path was
    //     missed. Passing `portWorldPosition` is that fix: hit-test where we draw.
    // wave12 (gap 3): Easy Connect makes the whole TARGET node a handle too. A
    // release ANYWHERE over a node body — not just within the ~24px port-snap
    // radius smart mode uses — resolves the node under the cursor and picks its
    // nearest port. That is the difference from smart auto-connect: smart snaps
    // to a port near the drop; easy-connect accepts the node's whole silhouette.
    const smartAutoConnect = config.mode === 'smart' && config.enableSmartAutoConnect;
    if (!targetPort && (smartAutoConnect || config.enableEasyConnect)) {
      const diagram = engine.getDiagram();
      const dragState = connectionStateManager.getState();
      const pos = dragState.currentMousePosition;

      if (diagram && pos) {
        if (config.enableEasyConnect) {
          const sourceNode = this.connectionSourcePort
            ? diagram.getNodeByPortId(this.connectionSourcePort.id)
            : null;
          const overNode = diagram.getNodeAtPosition(pos.x, pos.y);
          if (overNode && overNode.id !== sourceNode?.id) {
            targetPort = this.nearestPortOnNode(overNode, pos.x, pos.y);
          }
        }
        // Smart-mode port snap (also the fallback when easy-connect found no node).
        if (!targetPort && smartAutoConnect) {
          const hit = diagram.findNearestPort(pos, {
            portPosition: (port, node) => portWorldPosition(port, node),
          });
          targetPort = hit?.port ?? null;
        }
      }
    }

    // Complete connection if we have a valid target port
    let success = false;
    if (targetPort) {
      const result = connectionStateManager.completeConnection(targetPort);
      success = result.success;

      if (success) {
        console.log('✅ Connection completed:', this.connectionSourcePort.id, '->', targetPort.id);
      } else {
        console.log('❌ Connection failed: Invalid connection');
      }
    }

      // Cleanup
      this.cancelConnection(engine);

      return success;
    } catch (error) {
      // Phase 5: Error recovery
      console.error('Error completing connection:', error);
      this.cancelConnection(engine);
      return false;
    }
  }

  /**
   * Phase 3: Cancel connection
   */
  cancelConnection(engine: DiagramEngine): void {
    if (!this.isConnecting) {
      return;
    }

    const connectionStateManager = engine.getConnectionStateManager();
    connectionStateManager.cancelConnection();

    this.isConnecting = false;
    this.connectionSourcePort = null;

    // Clear port highlights
    this.clearPortHighlights(engine);

    console.log('🚫 Connection cancelled');
  }

  /**
   * Phase 3 / Wave 2: Start link reconnection.
   *
   * Enters endpoint-drag mode: the dragged endpoint follows the cursor while
   * the OTHER endpoint stays put. Seeds the engine's {@link ReconnectionPreview}
   * so the renderer can draw a ghost link, and primes port validity highlights.
   */
  startLinkReconnection(
    link: LinkModel,
    endpoint: 'source' | 'target',
    worldX: number,
    worldY: number,
    engine: DiagramEngine
  ): void {
    this.isReconnectingLink = true;
    this.reconnectingLink = link;
    this.reconnectingEndpoint = endpoint;
    this.reconnectingMousePoint = { x: worldX, y: worldY };

    // Select the endpoint on the link
    if (endpoint === 'source') {
      link.selectSourceEndpoint();
    } else {
      link.selectTargetEndpoint();
    }

    // Seed the live preview + validity highlights.
    engine.setReconnectionPreview({
      linkId: link.id,
      endpoint,
      mousePoint: { x: worldX, y: worldY },
      isValid: false,
    });
    this.updateReconnectPortHighlights(engine);

    console.log(`🔗 Link reconnection started: ${endpoint} endpoint of link ${link.id}`);
  }

  /**
   * Wave 2: Update the in-progress endpoint reconnection as the cursor moves.
   *
   * Refreshes the ghost-preview endpoint, recomputes which ports are valid drop
   * targets (highlighting them), and reflects whether the currently hovered
   * port would be accepted. Returns true when a re-render is warranted.
   */
  updateLinkReconnection(worldX: number, worldY: number, engine: DiagramEngine): boolean {
    if (!this.isReconnectingLink || !this.reconnectingLink || !this.reconnectingEndpoint) {
      return false;
    }
    if (!isFinite(worldX) || !isFinite(worldY)) {
      return false;
    }

    this.reconnectingMousePoint = { x: worldX, y: worldY };

    // Is the port under the cursor (if any) a legal drop target?
    const isValid = !!(
      this.hoveredPort &&
      this.isValidReconnectionTarget(
        this.reconnectingLink,
        this.reconnectingEndpoint,
        this.hoveredPort,
        engine
      )
    );

    engine.setReconnectionPreview({
      linkId: this.reconnectingLink.id,
      endpoint: this.reconnectingEndpoint,
      mousePoint: { x: worldX, y: worldY },
      isValid,
    });

    this.updateReconnectPortHighlights(engine);
    return true;
  }

  /**
   * Wave 2: Is `candidatePort` a legal target for reconnecting `endpoint` of
   * `link`? The OTHER endpoint's port stays fixed; the candidate must differ
   * from it, live on a different node, be type-compatible (input↔output, or a
   * bidirectional port), and satisfy the connection-group rules. Pure w.r.t.
   * the passed models — the core of the reconnect-validation tests.
   */
  isValidReconnectionTarget(
    link: LinkModel,
    endpoint: 'source' | 'target',
    candidatePort: PortModel,
    engine: DiagramEngine
  ): boolean {
    const diagram = engine.getDiagram();
    if (!diagram) return false;

    // The stationary endpoint's port is the one that must stay connected.
    const fixedPortId = endpoint === 'source' ? link.targetPortId : link.sourcePortId;
    const fixedPort = diagram.getPortById(fixedPortId);
    if (!fixedPort) return false;

    // Can't drop back onto the fixed port, or onto its own node.
    if (candidatePort.id === fixedPortId) return false;
    const candidateNode = diagram.getNodeByPortId(candidatePort.id);
    const fixedNode = diagram.getNodeByPortId(fixedPortId);
    if (!candidateNode || !fixedNode) return false;
    if (candidateNode.id === fixedNode.id) return false;

    // Type compatibility: directional ports can't share a direction; a
    // bidirectional ('bi') port on either side lifts the restriction.
    const isBi = (p: PortModel) => p.type === 'bi';
    if (!isBi(fixedPort) && !isBi(candidatePort) && fixedPort.type === candidatePort.type) {
      return false;
    }

    // Connection-group restriction (same seam the new-link flow validates on).
    return isConnectionAllowedByGroup(fixedPort, candidatePort, engine);
  }

  /**
   * Wave 2: Highlight ports as valid/invalid drop targets during an endpoint
   * reconnection. Mirrors {@link updatePortHighlights} but uses the reconnect
   * validity rule instead of the {@link ConnectionStateManager} valid-target set
   * (which is empty during reconnection).
   */
  protected updateReconnectPortHighlights(engine: DiagramEngine): void {
    const diagram = engine.getDiagram();
    if (!diagram || !this.reconnectingLink || !this.reconnectingEndpoint) return;

    diagram.getNodes().forEach((node: NodeModel) => {
      node.getPorts().forEach((port: PortModel) => {
        const valid = this.isValidReconnectionTarget(
          this.reconnectingLink!,
          this.reconnectingEndpoint!,
          port,
          engine
        );
        port.isValidTarget = valid;
        port.isHighlighted = valid && port === this.hoveredPort;
      });
    });
  }

  /**
   * Phase 3 / Wave 2: Complete link reconnection.
   *
   * Drops the dragged endpoint on the hovered port. Rejects (and restores the
   * original connection) when there is no port under the cursor or the port
   * fails {@link isValidReconnectionTarget}.
   */
  completeLinkReconnection(engine: DiagramEngine): boolean {
    if (this.isReadonlyEngine(engine)) return false;
    if (!this.isReconnectingLink || !this.reconnectingLink || !this.reconnectingEndpoint) {
      return false;
    }

    const targetPort = this.hoveredPort;

    // Reject: no drop target, or an invalid one → restore original connection.
    if (!targetPort ||
        !this.isValidReconnectionTarget(this.reconnectingLink, this.reconnectingEndpoint, targetPort, engine)) {
      console.log('🚫 Link reconnection rejected: no valid target port');
      this.cancelLinkReconnection(engine);
      return false;
    }

    // Reconnect to new port
    const diagram = engine.getDiagram();
    if (!diagram) {
      this.cancelLinkReconnection(engine);
      return false;
    }

    // Find the node that owns the target port
    let targetNode: NodeModel | undefined;
    for (const node of diagram.getNodes()) {
      if (node.getPort(targetPort.id)) {
        targetNode = node;
        break;
      }
    }

    if (!targetNode) {
      console.log('❌ Link reconnection failed: Target node not found');
      this.cancelLinkReconnection(engine);
      return false;
    }

    // wave12: capture the OLD endpoint before mutating, so the reconnect is undoable. The
    // link still holds its original endpoint here — the reconnect call is on the next line.
    const endpoint = this.reconnectingEndpoint;
    const oldPortId =
      endpoint === 'source'
        ? this.reconnectingLink.sourcePortId
        : this.reconnectingLink.targetPortId;
    const oldNodeId =
      endpoint === 'source'
        ? this.reconnectingLink.sourceNodeId
        : this.reconnectingLink.targetNodeId;

    // Reconnect the link (live).
    if (endpoint === 'source') {
      this.reconnectingLink.reconnectSource(targetPort.id, targetNode.id);
    } else {
      this.reconnectingLink.reconnectTarget(targetPort.id, targetNode.id);
    }

    // …and record it as one undoable step. execute() re-applies the already-current new
    // endpoint (a no-op); undo restores the old. Only when the endpoint actually changed.
    if (oldPortId !== targetPort.id) {
      void engine.commandManager.execute(
        new ReconnectLinkCommand(
          this.reconnectingLink.id,
          endpoint,
          targetPort.id,
          targetNode.id,
          oldPortId,
          oldNodeId
        )
      );
    }

    // Recalculate link path
    const reconnectedSourceNode = this.findNodeForPort(this.reconnectingLink.sourcePortId, diagram);
    const reconnectedTargetNode = this.findNodeForPort(this.reconnectingLink.targetPortId, diagram);

    if (reconnectedSourceNode && reconnectedTargetNode) {
      const sourcePort = reconnectedSourceNode.getPort(this.reconnectingLink.sourcePortId);
      const reconnectedTargetPort = reconnectedTargetNode.getPort(this.reconnectingLink.targetPortId);

      if (sourcePort && reconnectedTargetPort) {
        const sourceBounds = reconnectedSourceNode.getBoundingBox();
        const targetBounds = reconnectedTargetNode.getBoundingBox();
        const sourcePoint = sourcePort.getAbsolutePosition(sourceBounds);
        const targetPoint = reconnectedTargetPort.getAbsolutePosition(targetBounds);

        // Get port directions for orthogonal routing
        const sourceDirection = sourcePort.alignment?.side;
        const targetDirection = reconnectedTargetPort.alignment?.side;

        this.reconnectingLink.generatePath(sourcePoint, targetPoint, sourceDirection, targetDirection);
      }
    }

    console.log(`✅ Link reconnected: ${this.reconnectingEndpoint} endpoint to port ${targetPort.id}`);

    // Cleanup (clears preview + highlights + state)
    this.resetReconnectionState(engine);

    return true;
  }

  /**
   * Wave 2: Cancel an in-progress endpoint reconnection, restoring the link to
   * its original connection. Safe to call when not reconnecting.
   */
  cancelLinkReconnection(engine: DiagramEngine): void {
    if (!this.isReconnectingLink) return;
    this.resetReconnectionState(engine);
    console.log('🚫 Link reconnection cancelled');
  }

  /**
   * Wave 2: Tear down all reconnection state — deselect the link's endpoints,
   * clear the engine preview, and clear port highlights.
   */
  protected resetReconnectionState(engine: DiagramEngine): void {
    this.reconnectingLink?.deselectEndpoints();
    this.isReconnectingLink = false;
    this.reconnectingLink = null;
    this.reconnectingEndpoint = null;
    this.reconnectingMousePoint = null;
    engine.setReconnectionPreview(null);
    this.clearPortHighlights(engine);
  }

  // ============================================================================
  // Wave 2 (Edges & links): inline label drag-reposition
  // ============================================================================

  /**
   * Wave 2: Map a dragged world point to a model-space label placement.
   *
   * Returns the `{ position, offset }` to store on the label such that the
   * renderer draws it exactly under the cursor now AND it sticks to the same
   * fraction of the path after re-routing:
   *   - `position` (0-1) = closest point on the path to the cursor;
   *   - `offset`         = cursor − on-path anchor at `position`.
   *
   * The offset is measured against the SAME anchor the renderer uses
   * ({@link LinkModel.getPointAtPosition}), so `getPointAtPosition(position) +
   * offset` reproduces the cursor by construction. Falls back to a direct
   * polyline projection over `link.points` when the model has no segments
   * (renderers sync `points` but leave `segments` stale). Returns null when the
   * link has no drawable path.
   */
  computeLabelDragUpdate(
    link: LinkModel,
    worldPoint: Point
  ): { position: number; offset: Point } | null {
    const points = link.points;
    if (!points || points.length < 2) return null;

    // Preferred: model's own segment-based projection.
    let t: number | null = link.getClosestPoint(worldPoint)?.t ?? null;

    // Fallback: project onto the raw points polyline (mirrors the polyline
    // fallback in getPointAtPosition, so anchors stay consistent).
    if (t === null) {
      t = this.closestPositionOnPolyline(points, worldPoint);
    }
    if (t === null) return null;

    const anchor = link.getPointAtPosition(t);
    if (!anchor) return null;

    return {
      position: t,
      offset: { x: worldPoint.x - anchor.x, y: worldPoint.y - anchor.y },
    };
  }

  /**
   * Arc-length position (0-1) of the closest point on a polyline to `query`.
   * Returns null for < 2 points. Matches the parametrization used by
   * {@link LinkModel.getPointAtPosition}'s polyline fallback and the
   * hit-test primitive.
   */
  protected closestPositionOnPolyline(points: Point[], query: Point): number | null {
    if (points.length < 2) return null;

    const segLengths: number[] = [];
    let total = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const len = Math.hypot(points[i + 1]!.x - points[i]!.x, points[i + 1]!.y - points[i]!.y);
      segLengths.push(len);
      total += len;
    }
    if (total <= 0) return 0;

    let bestDist = Infinity;
    let bestArc = 0;
    let cumulative = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i]!;
      const b = points[i + 1]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lenSq = dx * dx + dy * dy;
      let s = lenSq === 0 ? 0 : ((query.x - a.x) * dx + (query.y - a.y) * dy) / lenSq;
      s = Math.max(0, Math.min(1, s));
      const cx = a.x + s * dx;
      const cy = a.y + s * dy;
      const dist = Math.hypot(query.x - cx, query.y - cy);
      if (dist < bestDist) {
        bestDist = dist;
        bestArc = cumulative + s * segLengths[i]!;
      }
      cumulative += segLengths[i]!;
    }
    return bestArc / total;
  }

  /**
   * Wave 2: Begin dragging label `labelIndex` of `link`.
   */
  startLabelDrag(link: LinkModel, labelIndex: number): void {
    this.isDraggingLabel = true;
    this.editingLabelLink = link;
    this.editingLabelIndex = labelIndex;
    console.log(`🏷️ Started dragging label ${labelIndex} on link ${link.id}`);
  }

  /**
   * Wave 2: Move the dragging label to follow the cursor. Writes the remapped
   * `{ position, offset }` back onto the model so the label survives re-routing.
   * Returns true when a re-render is warranted.
   */
  moveLabelDrag(worldX: number, worldY: number): boolean {
    if (this.isReadonlyLink(this.editingLabelLink)) return false;
    if (!this.isDraggingLabel || !this.editingLabelLink || this.editingLabelIndex === null) {
      return false;
    }
    if (!isFinite(worldX) || !isFinite(worldY)) {
      return false;
    }

    const update = this.computeLabelDragUpdate(this.editingLabelLink, { x: worldX, y: worldY });
    if (!update) return false;

    this.editingLabelLink.updateLabel(this.editingLabelIndex, update);
    this.editingLabelLink.markDirty('label-dragged');
    return true;
  }

  /**
   * Wave 2: End the label drag.
   */
  endLabelDrag(): void {
    if (this.isDraggingLabel) {
      console.log(`🏷️ Ended dragging label ${this.editingLabelIndex} on link ${this.editingLabelLink?.id}`);
    }
    this.isDraggingLabel = false;
    this.editingLabelLink = null;
    this.editingLabelIndex = null;
  }

  /**
   * Phase 3: Handle link selection
   * FIXED: Support multi-select with Ctrl key, deselect other links otherwise
   */
  selectLink(link: LinkModel, engine: DiagramEngine, multiSelect: boolean = false): void {
    const diagram = engine.getDiagram();
    if (!diagram) return;

    if (!multiSelect) {
      // Clear node selections
      diagram.clearSelection();

      // Deselect all other links
      diagram.getLinks().forEach((l: LinkModel) => {
        if (l.id !== link.id && l.state === 'selected') {
          l.setState('default');
        }
      });
    }

    // Toggle or select this link
    if (multiSelect && link.state === 'selected') {
      link.setState('default');
      console.log('🔗 Link deselected:', link.id);
    } else {
      link.setState('selected');
      console.log('🔗 Link selected:', link.id);
    }
  }

  /**
   * Phase 3: Delete selected link
   */
  deleteSelectedLink(engine: DiagramEngine): boolean {
    if (this.isReadonlyEngine(engine)) return false;
    const diagram = engine.getDiagram();
    if (!diagram) return false;

    // Find selected link
    const selectedLink = diagram.getLinks().find((link: LinkModel) => link.state === 'selected');
    if (!selectedLink) return false;

    // Remove the link
    diagram.removeLink(selectedLink.id);

    console.log('🗑️ Link deleted:', selectedLink.id);
    return true;
  }

  /**
   * Find link at world position (public wrapper for hit testing)
   * Used for direct link selection without requiring hover state
   */
  getLinkAtPosition(worldX: number, worldY: number, engine: DiagramEngine): LinkModel | null {
    const diagram = engine.getDiagram();
    if (!diagram) return null;

    return this.findLinkAtPosition(worldX, worldY, diagram);
  }

  /**
   * Part-aware public wrapper: like {@link getLinkAtPosition} but also reports
   * WHICH sub-part of the link was hit (body / label / endpoint / arrow) plus
   * local info. Foundation for later edge cards (label editing, endpoint
   * reconnection, edge toolbar placement).
   */
  getLinkHitAtPosition(
    worldX: number,
    worldY: number,
    engine: DiagramEngine
  ): LinkPartHit | null {
    const diagram = engine.getDiagram();
    if (!diagram) return null;

    return this.findLinkHitAtPosition(worldX, worldY, diagram);
  }

  /**
   * Phase 3: Get current interaction state
   */
  getState() {
    return {
      isConnecting: this.isConnecting,
      isReconnectingLink: this.isReconnectingLink,
      reconnectingEndpoint: this.reconnectingEndpoint,
      reconnectingLink: this.reconnectingLink,
      hoveredNode: this.hoveredNode,
      hoveredPort: this.hoveredPort,
      hoveredLink: this.hoveredLink,
      // Wave 2: Label drag-reposition state
      isDraggingLabel: this.isDraggingLabel,
      editingLabelLink: this.editingLabelLink,
      editingLabelIndex: this.editingLabelIndex,
      // Phase 2.3a: Waypoint editing state
      isDraggingWaypoint: this.isDraggingWaypoint,
      editingLink: this.editingLink,
      editingWaypointIndex: this.editingWaypointIndex,
      hoveredWaypointIndex: this.hoveredWaypointIndex,
      hoveredWaypointLink: this.hoveredWaypointLink,
      // Phase 2.3b: Control point editing state
      isDraggingControlPoint: this.isDraggingControlPoint,
      editingControlPointLink: this.editingControlPointLink,
      editingControlPointSegmentIndex: this.editingControlPointSegmentIndex,
      editingControlPointType: this.editingControlPointType,
      hoveredControlPointSegmentIndex: this.hoveredControlPointSegmentIndex,
      hoveredControlPointType: this.hoveredControlPointType,
      hoveredControlPointLink: this.hoveredControlPointLink,
    };
  }

  /**
   * Phase 3: Check if currently interacting
   */
  isInteracting(): boolean {
    return this.isConnecting || this.isReconnectingLink || this.isDraggingWaypoint || this.isDraggingControlPoint || this.isDraggingLabel;
  }

  /**
   * Phase 3: Get appropriate cursor for current state
   */
  getCursor(engine: DiagramEngine): string {
    if (this.isConnecting) {
      return 'crosshair';
    }

    if (this.isReconnectingLink) {
      return 'move';
    }

    if (this.hoveredPort) {
      return 'crosshair';
    }

    if (this.hoveredLink) {
      const config = engine.getInteractionConfig();
      if (config.enableLinkReconnection && this.hoveredLink.state === 'selected') {
        return 'pointer';
      }
      return 'pointer';
    }

    if (this.hoveredNode) {
      const config = engine.getInteractionConfig();
      if (config.mode === 'deliberate') {
        // In deliberate mode, only show move cursor if node is selected
        return this.hoveredNode.isSelected() ? 'move' : 'pointer';
      }
      return this.hoveredNode.isDraggable() ? 'pointer' : 'default';
    }

    return 'default';
  }

  // Private helper methods

  /**
   * Find port at world position
   * Phase 5: Optimized with performance monitoring and early exit
   * CRITICAL FIX: Accept engine parameter instead of calling diagram.getEngine()
   */
  protected findPortAtPosition(
    worldX: number,
    worldY: number,
    diagram: any,
    engine: DiagramEngine
  ): PortModel | null {
    // Phase 5: Performance monitoring
    const startTime = performance.now();

    try {
      const config = engine.getInteractionConfig();
      const portRadius = config.portDefaultRadius * config.portHoverScaleFactor;
      // + hitSlop: touch-sized targets (Wave 9 Card 2). 0 for a mouse.
      const hitRadius = portRadius + 2 + this.hitSlop; // Add 2px tolerance

      // Phase 5: Optimization - early exit if no nodes
      const nodes = diagram.getNodes();
      if (!nodes || nodes.length === 0) {
        return null;
      }

      for (const node of nodes) {
        // A drag-handle node is chrome: its ports are not hoverable, so a wire
        // can never START there (the rules also refuse it as a TARGET).
        if (node.behavior?.dragHandler?.isDragHandler === true) continue;
        // CRITICAL FIX: Always check for port hits regardless of visibility mode
        // Visibility affects RENDERING, not HIT DETECTION
        // This fixes the chicken-and-egg problem where ports couldn't be hovered
        // because the node wasn't hovered yet

        // Phase 5: Optimization - rough node bounds check first
        const nodeBounds = node.getBoundingBox();
        const nodeExpandedBounds = {
          left: nodeBounds.left - hitRadius,
          right: nodeBounds.right + hitRadius,
          top: nodeBounds.top - hitRadius,
          bottom: nodeBounds.bottom + hitRadius,
        };

        // Skip node if mouse is not even near it
        if (
          worldX < nodeExpandedBounds.left ||
          worldX > nodeExpandedBounds.right ||
          worldY < nodeExpandedBounds.top ||
          worldY > nodeExpandedBounds.bottom
        ) {
          continue;
        }

        const portsMap = node.getPorts();
        const ports: PortModel[] = Array.from((portsMap as Map<string, PortModel>).values());

        for (const port of ports) {
          // Wave 6 BUG FIX: this used `port.getAbsolutePosition(nodeBounds)`,
          // which walks the BOUNDING BOX and lands on an edge midpoint — while
          // the renderer draws the port with `getPortPositionForShape`. On any
          // non-rect shape, and on any side with more than one port, the hit
          // circle sat several pixels away from the glyph: you clicked the port
          // you could see and hit nothing. Hit-test where you DRAW.
          const portPos = portWorldPosition(port, node);

          // Check if mouse is within port radius
          const dx = worldX - portPos.x;
          const dy = worldY - portPos.y;
          const distanceSquared = dx * dx + dy * dy;

          // Phase 5: Optimization - compare squared distances to avoid sqrt
          if (distanceSquared <= hitRadius * hitRadius) {
            return port;
          }
        }
      }

      return null;
    } finally {
      // Phase 5: Track performance
      this.performanceMetrics.portHitTestTime = performance.now() - startTime;
    }
  }

  /**
   * Find link at world position.
   *
   * Backward-compatible thin wrapper over {@link findLinkHitAtPosition}:
   * existing callers that only ask "which link (if any) is under the cursor?"
   * keep getting a `LinkModel | null`. Use `findLinkHitAtPosition` /
   * `getLinkHitAtPosition` when you need to know WHICH sub-part was hit.
   */
  protected findLinkAtPosition(
    worldX: number,
    worldY: number,
    diagram: any
  ): LinkModel | null {
    return this.findLinkHitAtPosition(worldX, worldY, diagram)?.link ?? null;
  }

  /**
   * Part-aware link hit-test.
   *
   * Reports the link under the cursor AND which sub-part of it was hit
   * (body / label / source|target-endpoint / source|target-arrow) plus local
   * info: the label index for label hits, or the 0-1 position `t` along the
   * path for body hits. Delegates the geometry to the pure `hitTestLink`
   * primitive in `@grafloria/renderer` so the same logic backs both hit paths.
   */
  findLinkHitAtPosition(
    worldX: number,
    worldY: number,
    diagram: any
  ): LinkPartHit | null {
    // The cross-backend link grab distance. Canvas mode strokes each link's
    // colour-key pick region with exactly 2x this, so both backends resolve the
    // same link at the same world point.
    const hitThreshold = DEFAULT_LINK_HIT_TOLERANCE + this.hitSlop;
    const query: Point = { x: worldX, y: worldY };

    for (const link of diagram.getLinks()) {
      const points = link.points;
      if (!points || points.length < 2) continue;

      const hit = hitTestLink(this.buildLinkHitOptions(link), query, hitThreshold);
      if (hit) {
        return { link, ...hit };
      }
    }

    return null;
  }

  /**
   * Translate a link model into the framework-agnostic geometry the pure
   * `hitTestLink` primitive expects (routed points, label placements and
   * endpoint / arrowhead anchors). Endpoints default to the path ends inside
   * the primitive; arrowhead anchors are inset from those ends by the arrow's
   * canonical tip offset so they line up with the rendered markers.
   */
  protected buildLinkHitOptions(link: LinkModel): LinkHitTestOptions {
    const points: Point[] = link.points;
    const style = link.style ?? {};

    return {
      points,
      labels: (link.labels ?? []).map((label) => ({
        position: label.position,
        offset: label.offset,
      })),
      // arrowHead renders at the target end, arrowTail at the source end.
      sourceArrow: this.arrowAnchor(points, false, style.arrowTail),
      targetArrow: this.arrowAnchor(points, true, style.arrowHead),
    };
  }

  /**
   * Anchor point for an arrowhead hit region: the terminal point moved inward
   * along the last (or first) segment by the arrow's tip offset, matching where
   * the marker actually sits. Returns null when there is no visible arrow.
   */
  protected arrowAnchor(
    points: Point[],
    atTarget: boolean,
    style: ArrowStyle | undefined
  ): Point | null {
    if (!style || style.type === 'none' || points.length < 2) return null;

    const offset = this.arrowRenderer.getTipOffset(style);
    const tip = atTarget ? points[points.length - 1]! : points[0]!;
    const adjacent = atTarget ? points[points.length - 2]! : points[1]!;

    const dx = adjacent.x - tip.x;
    const dy = adjacent.y - tip.y;
    const len = Math.hypot(dx, dy) || 1;

    return { x: tip.x + (dx / len) * offset, y: tip.y + (dy / len) * offset };
  }

  /**
   * Wave 6 (Card 6): the nearest VALID target port within the magnet radius.
   *
   * "Valid" means the connection manager's valid-target set — the same set the
   * highlight paints — so the magnet can never latch onto a port the drop would
   * then reject. Returns null when nothing is in reach, leaving the drag free.
   */
  protected findMagnetPort(
    worldX: number,
    worldY: number,
    engine: DiagramEngine
  ): PortModel | null {
    const diagram = engine.getDiagram();
    if (!diagram) return null;

    const config = engine.getInteractionConfig();
    const radius = config.snapToPortRadius;
    if (!radius || radius <= 0) return null;

    const dragState = engine.getConnectionStateManager().getState();
    if (!dragState.isConnecting || dragState.validTargetPorts.size === 0) return null;

    let best: PortModel | null = null;
    let bestDistance = Infinity;

    for (const node of diagram.getNodes()) {
      if (node.state?.visible === false) continue;
      for (const port of node.getPorts()) {
        if (!dragState.validTargetPorts.has(port.id)) continue;

        const position = portWorldPosition(port, node);
        const distance = Math.hypot(worldX - position.x, worldY - position.y);
        if (distance <= radius && distance < bestDistance) {
          bestDistance = distance;
          best = port;
        }
      }
    }

    return best;
  }

  /**
   * Update port highlight states during connection.
   *
   * Wave 6 (Card 6): this method was already correct — and already dead. It
   * loops over `dragState.validTargetPorts`, a set that NOTHING ever filled:
   * `ConnectionStateManager.calculateValidTargets()` was a comment-only stub and
   * `setValidTargets()` had no production caller. So the loop ran zero times,
   * every frame, and only the hovered port ever lit up. The manager now computes
   * the set for real, which is what finally brings this to life — plus the
   * `highlightValidTargets` config flag, itself dead config until now (declared,
   * defaulted true, written by the config panel, read by nobody).
   */
  protected updatePortHighlights(engine: DiagramEngine): void {
    const diagram = engine.getDiagram();
    if (!diagram) return;

    const config = engine.getInteractionConfig();
    const dragState = engine.getConnectionStateManager().getState();

    // Clear all highlights first
    diagram.getNodes().forEach((node: NodeModel) => {
      node.getPorts().forEach((port: PortModel) => {
        port.isHighlighted = false;
        port.isValidTarget = false;
      });
    });

    // Highlight valid target ports
    if (config.highlightValidTargets !== false) {
      dragState.validTargetPorts.forEach((portId) => {
        const port = this.findPortById(portId, diagram);
        if (port) {
          port.isValidTarget = true;
          // A hidden port that is a live target must SURFACE — that is what the
          // 'on-hover' / 'never' visibility modes key off, and it is the whole
          // point of highlighting: you cannot drop on a port you cannot see.
          const owner = diagram.getNodeByPortId?.(portId);
          owner?.markDirty?.('port-highlight');
        }
      });
    }

    // Highlight currently hovered port
    if (this.hoveredPort && dragState.isOverValidTarget) {
      this.hoveredPort.isHighlighted = true;
    }
  }

  /**
   * Clear all port highlights
   */
  protected clearPortHighlights(engine: DiagramEngine): void {
    const diagram = engine.getDiagram();
    if (!diagram) return;

    diagram.getNodes().forEach((node: NodeModel) => {
      node.getPorts().forEach((port: PortModel) => {
        port.isHighlighted = false;
        port.isValidTarget = false;
      });
    });
  }

  /**
   * Find port by ID
   */
  protected findPortById(portId: string, diagram: any): PortModel | null {
    for (const node of diagram.getNodes()) {
      const port = node.getPort(portId);
      if (port) {
        return port;
      }
    }
    return null;
  }

  /**
   * Find node that owns a port
   */
  protected findNodeForPort(portId: string, diagram: any): NodeModel | undefined {
    for (const node of diagram.getNodes()) {
      if (node.getPort(portId)) {
        return node;
      }
    }
    return undefined;
  }

  // ============================================================================
  // Phase 2.3a: Waypoint Editing Methods
  // ============================================================================

  /**
   * Hit test for waypoint handle at mouse position
   * Returns the waypoint index if hit, null otherwise
   */
  hitTestWaypoint(mouseX: number, mouseY: number, link: LinkModel): number | null {
    if (!this.waypointEditor || !link.points || link.points.length < 3) {
      return null;
    }

    const hit = this.waypointEditor.hitTestWaypoint(mouseX, mouseY, link.points, this.hitSlop);
    return hit ? hit.waypointIndex : null;
  }

  /**
   * Hit test for clicking on link path (to add waypoint)
   */
  hitTestPath(mouseX: number, mouseY: number, link: LinkModel): boolean {
    if (!this.waypointEditor || !link.points || link.points.length < 2) {
      return false;
    }

    const hit = this.waypointEditor.hitTestPath(mouseX, mouseY, link.points, this.hitSlop);
    return hit !== null;
  }

  /**
   * Start dragging a waypoint
   */
  startWaypointDrag(waypointIndex: number, link: LinkModel): void {
    this.isDraggingWaypoint = true;
    this.editingLink = link;
    this.editingWaypointIndex = waypointIndex;
    // wave12: snapshot the path BEFORE the drag so end can commit one undoable FROM→TO step.
    this.waypointDragStartPoints = link.points.map((p) => ({ ...p }));
    console.log(`🔵 Started dragging waypoint ${waypointIndex} on link ${link.id}`);
  }

  /**
   * Move waypoint during drag
   * The waypoint is just moved, orthogonal routing happens during rendering
   */
  moveWaypoint(worldX: number, worldY: number, engine: DiagramEngine): boolean {
    if (this.isReadonlyEngine(engine)) return false;
    if (!this.isDraggingWaypoint || !this.editingLink || this.editingWaypointIndex === null || !this.waypointEditor) {
      return false;
    }

    const newPosition = { x: worldX, y: worldY };

    const newPoints = this.waypointEditor.moveWaypoint(
      this.editingWaypointIndex,
      newPosition,
      this.editingLink.points,
      this.editingLink.pathType
    );

    if (newPoints) {
      this.editingLink.setPoints(newPoints);
      this.editingLink.setMetadata('hasManualWaypoints', true);
      console.log(`🔵 Moved waypoint ${this.editingWaypointIndex} to (${worldX.toFixed(1)}, ${worldY.toFixed(1)})`);
      return true;
    }

    return false;
  }

  /**
   * End waypoint drag
   */
  endWaypointDrag(engine?: DiagramEngine): void {
    if (this.isDraggingWaypoint) {
      console.log(`🔵 Ended dragging waypoint ${this.editingWaypointIndex} on link ${this.editingLink?.id}`);

      // wave12: commit the finished gesture as ONE undoable step. The live moveWaypoint
      // already applied the final points, so SetLinkPointsCommand's execute() re-sets the
      // already-current `to` (a no-op) and records one history entry; undo restores `from`.
      // Same FROM→TO snapshot pattern as node-drag and group-drag. Only commit when the
      // path actually changed — a click-with-no-drag must not litter the undo stack.
      const link = this.editingLink;
      const from = this.waypointDragStartPoints;
      if (engine && link && from) {
        const to = link.points.map((p) => ({ ...p }));
        const changed =
          to.length !== from.length ||
          to.some((p, i) => p.x !== from[i].x || p.y !== from[i].y);
        if (changed) {
          void engine.commandManager.execute(new SetLinkPointsCommand(link.id, to, from));
        }
      }
    }
    this.isDraggingWaypoint = false;
    this.editingLink = null;
    this.editingWaypointIndex = null;
    this.waypointDragStartPoints = null;
  }

  /**
   * Add waypoint at click position on path
   */
  addWaypoint(clickX: number, clickY: number, link: LinkModel): boolean {
    if (this.isReadonlyLink(link)) return false;
    if (!this.waypointEditor) {
      return false;
    }

    const result = this.waypointEditor.addWaypointAtPosition(clickX, clickY, link.points);

    if (result) {
      link.setPoints(result.newPoints);
      link.setMetadata('hasManualWaypoints', true);
      console.log(`🟢 Added waypoint at index ${result.waypointIndex} on link ${link.id}`);
      return true;
    }

    return false;
  }

  /**
   * Remove waypoint at index
   */
  removeWaypoint(waypointIndex: number, link: LinkModel): boolean {
    if (this.isReadonlyLink(link)) return false;
    if (!this.waypointEditor) {
      return false;
    }

    const newPoints = this.waypointEditor.removeWaypoint(waypointIndex, link.points);

    if (newPoints) {
      link.setPoints(newPoints);
      if (newPoints.length <= 2) {
        link.setMetadata('hasManualWaypoints', false);
      }
      console.log(`🔴 Removed waypoint at index ${waypointIndex} from link ${link.id}`);
      return true;
    }

    return false;
  }

  /**
   * Update waypoint editor configuration
   */
  updateWaypointEditorConfig(config: Partial<any>): void {
    if (this.waypointEditor) {
      this.waypointEditor.updateConfig(config);
    }
  }

  /**
   * Synchronize editor configs with engine interaction config
   * ADDED: Call this when engine config changes to update editor visuals
   */
  syncWithEngineConfig(engine: DiagramEngine): void {
    const config = engine.getInteractionConfig();

    if (config.waypointEditor) {
      this.updateWaypointEditorConfig(config.waypointEditor);
    }

    if (config.controlPointEditor) {
      this.updateControlPointEditorConfig(config.controlPointEditor);
    }

    this.installHostConnectionValidatorBridge(engine);
  }

  /**
   * ==========================================================================
   * wave10/gallery BUG FIX — `registerConnectionValidator` did not veto a DRAG.
   * ==========================================================================
   *
   * `ext/tools.ts` documents its registry as: "Validators registered here are
   * consulted wherever the renderer offers a connection", and its whole reason
   * for existing is that "a HOST had no way to inject 'an Order may not connect
   * to an Invoice'".
   *
   * It was consulted in exactly ONE place: `canConnectPorts()` in snapping.ts —
   * i.e. proximity-connect and keyboard-connect. The MOUSE DRAG, which is how
   * essentially every connection in every diagram ever made actually gets made,
   * never asked. You could register a validator that rejected every connection
   * in the graph, drag from a port to a port, and get the link.
   *
   * The engine has its own validator list on `ConnectionStateManager` — which
   * the drag DOES consult, and which also feeds `calculateValidTargets()`, so a
   * veto registered there also dims the invalid ports during the drag. So the
   * fix is a bridge, not a second enforcement point: forward the host registry
   * into the engine's list, once per engine. With no validators registered
   * `isValidConnection()` returns `{ valid: true }`, so the bridge costs a
   * function call on a path that is already doing a hit-test.
   */
  private validatorBridgedEngines = new WeakSet<DiagramEngine>();

  private installHostConnectionValidatorBridge(engine: DiagramEngine): void {
    if (this.validatorBridgedEngines.has(engine)) return;

    const manager = engine.getConnectionStateManager?.();
    if (!manager?.addValidator) return;

    this.validatorBridgedEngines.add(engine);

    manager.addValidator((source: PortModel, target: PortModel) => {
      const diagram = engine.getDiagram();
      const sourceNode = diagram?.getNodeByPortId(source.id);
      const targetNode = diagram?.getNodeByPortId(target.id);
      if (!sourceNode || !targetNode) return true;

      return isValidConnection({
        sourceNode,
        sourcePort: source,
        targetNode,
        targetPort: target,
      }).valid;
    });
  }

  /**
   * Update hovered waypoint (for Delete key support)
   * Call this from mousemove to track which waypoint is under cursor
   */
  updateHoveredWaypoint(worldX: number, worldY: number, link: LinkModel | null): void {
    if (!link || !this.waypointEditor) {
      this.hoveredWaypointIndex = null;
      this.hoveredWaypointLink = null;
      return;
    }

    const waypointIndex = this.hitTestWaypoint(worldX, worldY, link);
    this.hoveredWaypointIndex = waypointIndex;
    this.hoveredWaypointLink = waypointIndex !== null ? link : null;
  }

  /**
   * Delete currently hovered waypoint (for Delete key)
   */
  deleteHoveredWaypoint(): boolean {
    if (this.isReadonlyLink(this.hoveredLink)) return false;
    if (this.hoveredWaypointIndex !== null && this.hoveredWaypointLink) {
      const removed = this.removeWaypoint(this.hoveredWaypointIndex, this.hoveredWaypointLink);
      if (removed) {
        this.hoveredWaypointIndex = null;
        this.hoveredWaypointLink = null;
        return true;
      }
    }
    return false;
  }

  // ============================================================================
  // Phase 2.3b: Control Point Editing Methods
  // ============================================================================

  /**
   * Hit test for control point handle at mouse position
   * Returns the control point info if hit, null otherwise
   */
  hitTestControlPoint(
    mouseX: number,
    mouseY: number,
    link: LinkModel
  ): { segmentIndex: number; controlType: 'control1' | 'control2' } | null {
    if (!this.controlPointEditor || !link.segments || link.segments.length === 0) {
      return null;
    }

    const hit = this.controlPointEditor.hitTestControlPoint(mouseX, mouseY, link.segments, this.hitSlop);
    if (hit) {
      return {
        segmentIndex: hit.segmentIndex,
        controlType: hit.controlType,
      };
    }
    return null;
  }

  /**
   * Start dragging a control point
   */
  startControlPointDrag(
    segmentIndex: number,
    controlType: 'control1' | 'control2',
    link: LinkModel
  ): void {
    this.isDraggingControlPoint = true;
    this.editingControlPointLink = link;
    this.editingControlPointSegmentIndex = segmentIndex;
    this.editingControlPointType = controlType;
    console.log(`🟢 Started dragging ${controlType} of segment ${segmentIndex} on link ${link.id}`);
  }

  /**
   * Move control point during drag
   */
  moveControlPoint(worldX: number, worldY: number, engine: DiagramEngine): boolean {
    if (this.isReadonlyEngine(engine)) return false; // RAW segments write below — no model guard can see it
    if (
      !this.isDraggingControlPoint ||
      !this.editingControlPointLink ||
      this.editingControlPointSegmentIndex === null ||
      !this.editingControlPointType ||
      !this.controlPointEditor
    ) {
      return false;
    }

    const newPosition = { x: worldX, y: worldY };
    const newSegments = this.controlPointEditor.moveControlPoint(
      this.editingControlPointSegmentIndex,
      this.editingControlPointType,
      newPosition,
      this.editingControlPointLink.segments
    );

    if (newSegments) {
      this.editingControlPointLink.segments = newSegments;
      // Mark link as dirty to trigger re-render with updated segments
      this.editingControlPointLink.markDirty();
      console.log(
        `🟢 Moved ${this.editingControlPointType} of segment ${this.editingControlPointSegmentIndex} to (${worldX.toFixed(1)}, ${worldY.toFixed(1)})`
      );
      return true;
    }

    return false;
  }

  /**
   * End control point drag
   */
  endControlPointDrag(): void {
    if (this.isDraggingControlPoint) {
      console.log(
        `🟢 Ended dragging ${this.editingControlPointType} of segment ${this.editingControlPointSegmentIndex} on link ${this.editingControlPointLink?.id}`
      );
    }
    this.isDraggingControlPoint = false;
    this.editingControlPointLink = null;
    this.editingControlPointSegmentIndex = null;
    this.editingControlPointType = null;
  }

  /**
   * Update control point editor configuration
   */
  updateControlPointEditorConfig(config: Partial<any>): void {
    if (this.controlPointEditor) {
      this.controlPointEditor.updateConfig(config);
    }
  }

  /**
   * Update hovered control point (for Delete key support)
   * Call this from mousemove to track which control point is under cursor
   */
  updateHoveredControlPoint(worldX: number, worldY: number, link: LinkModel | null): void {
    if (!link || !this.controlPointEditor) {
      this.hoveredControlPointSegmentIndex = null;
      this.hoveredControlPointType = null;
      this.hoveredControlPointLink = null;
      return;
    }

    const hit = this.hitTestControlPoint(worldX, worldY, link);
    if (hit) {
      this.hoveredControlPointSegmentIndex = hit.segmentIndex;
      this.hoveredControlPointType = hit.controlType;
      this.hoveredControlPointLink = link;
    } else {
      this.hoveredControlPointSegmentIndex = null;
      this.hoveredControlPointType = null;
      this.hoveredControlPointLink = null;
    }
  }

  /**
   * Reset control point to auto-generated position (for Delete key)
   * This removes custom control point adjustment, reverting to default bezier
   */
  resetHoveredControlPoint(): boolean {
    if (
      this.hoveredControlPointSegmentIndex !== null &&
      this.hoveredControlPointType &&
      this.hoveredControlPointLink
    ) {
      // For now, we don't support "deleting" control points
      // Control points are intrinsic to bezier curves
      // User would need to change pathType instead
      console.log('⚠️ Control points cannot be deleted, only moved');
      return false;
    }
    return false;
  }
}
