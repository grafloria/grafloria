import type { DiagramEngine, NodeModel, LinkModel, PortModel, InteractionConfig, ReconnectionPreview, LODLevel, LODFeature } from '@grafloria/engine';
import type { IRenderer, PerformanceMetrics, SVGRendererConfig, VNode, Theme, Rectangle } from '../types';
import { LIGHT_THEME } from '../themes';
import { createForeignObject, isForeignObject, getContainerId } from '../vnode/foreign-object';
import { LruCache } from '../utils/lru-cache';

// Import routing types
import type { RoutedPath, RoutingAlgorithm } from '@grafloria/engine';

// Phase 3.2: Shape-aware port positioning
import { getPortPositionForShape } from './port-positioning';

// Nodes & shapes foundation: unified shape registry / geometry contract.
// The five shape switch sites below (renderNodeShape, renderSelectionHighlight,
// renderShadow, shapeEdgePoint) route through this instead of inline switches.
import {
  getShape,
  getInnerRect,
  buildShapeBody,
  buildShapeSelection,
  buildShapeShadow,
} from './shape-registry';

// Node label engine: shared, link-agnostic text-block core (wrap / multi-line /
// ellipsis / shape-fit) — the same code path link labels render through.
import { renderTextBlock } from './text-block';

// Phase 1.1: Arrow type rendering
import { ArrowRenderer } from './ArrowRenderer';

// Phase 1.2: Label rendering
import { LabelRenderer } from './LabelRenderer';

// Phase 1.3: Jump point rendering
import { JumpPointDetector } from './JumpPointDetector';
import { JumpPointRenderer } from './JumpPointRenderer';

// Phase 2.3a: Waypoint editing
import { WaypointEditor } from '../interaction/WaypointEditor';

// Phase 2.3b: Control point editing
import { ControlPointEditor } from '../interaction/ControlPointEditor';

// Phase 1: Animation support
import { AnimationService } from '../services/animation.service';

// LODLevel + LODFeature now come from the engine (@grafloria/engine). LODLevel is a
// `string` tier name (wave2/rendering), so custom tiers flow through unchanged.

/**
 * SVG Renderer
 * Renders diagram to VNode tree for framework-agnostic consumption
 * Integrates with engine's performance features (SpatialIndex, dirty marking, LOD)
 */
export class SVGRenderer implements IRenderer {
  readonly mode = 'svg' as const;

  private theme: Theme;
  private config: Required<SVGRendererConfig>;
  // Bounded LRU so the cache honors config.maxCacheSize instead of growing
  // unbounded between wholesale clears. Initialized in the constructor once
  // maxCacheSize is resolved.
  private vnodeCache: LruCache<string, VNode>;
  private styleElement?: HTMLStyleElement;
  private disposed = false;

  // foreignObject support
  private containerIds = new Map<string, string>(); // nodeId -> containerId mapping
  private foreignObjectNodes = new Set<string>(); // Track which nodes use foreignObject

  // Phase 1.1: Arrow type rendering
  private arrowRenderer: ArrowRenderer;

  // Phase 1.2: Label rendering
  private labelRenderer: LabelRenderer;

  // Phase 1.3: Jump point rendering
  private jumpPointDetector: JumpPointDetector;
  private jumpPointRenderer: JumpPointRenderer;

  // Phase 2.3a: Waypoint editing
  private waypointEditor: WaypointEditor;

  // Phase 2.3b: Control point editing
  private controlPointEditor: ControlPointEditor;

  // Phase 1: Animation service
  private animationService: AnimationService;

  // Per-frame auto-route cache: filled by the pre-pass in renderLinksLayer so
  // every link's points are current before any link renders (jump detection
  // reads other links' points).
  private frameRoutes = new Map<string, RoutedPath>();

  // Performance tracking
  private lastRenderTime = 0;
  private lastNodeCount = 0;
  private lastLinkCount = 0;
  private renderTimestamp = 0;
  private frameCount = 0;
  private fps = 0;

  constructor(
    private engine: DiagramEngine,
    config: SVGRendererConfig = {},
    theme?: Theme
  ) {
    // Apply defaults
    this.config = {
      enableCaching: config.enableCaching ?? true,
      maxCacheSize: config.maxCacheSize ?? 1000,
      useCSSMode: config.useCSSMode ?? true,
      linkHitAreaWidth: config.linkHitAreaWidth ?? 12,
      smartConnectionPoints: config.smartConnectionPoints ?? false,
    };

    // Bounded LRU vnode cache (evicts least-recently-used past maxCacheSize)
    this.vnodeCache = new LruCache<string, VNode>(Math.max(1, this.config.maxCacheSize));

    this.theme = theme || LIGHT_THEME;

    // Phase 1.1: Initialize arrow renderer
    this.arrowRenderer = new ArrowRenderer();

    // Phase 1.2: Initialize label renderer
    this.labelRenderer = new LabelRenderer();

    // Phase 1.3: Initialize jump point detector and renderer
    this.jumpPointDetector = new JumpPointDetector();
    this.jumpPointRenderer = new JumpPointRenderer();

    // Phase 2.3a: Initialize waypoint editor with default config
    const waypointConfig = engine.getInteractionConfig().waypointEditor || {
      snapToGrid: false,
      gridSize: 20,
      removeOnDoubleClick: true,
      handleRadius: 5,
      handleColor: '#3b82f6',
      handleStrokeColor: '#ffffff',
      minDistanceFromEndpoints: 30,
      clickDetectionRadius: 10,
    };
    this.waypointEditor = new WaypointEditor(waypointConfig);

    // Phase 2.3b: Initialize control point editor with default config
    const controlPointConfig = engine.getInteractionConfig().controlPointEditor || {
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
    };
    this.controlPointEditor = new ControlPointEditor(controlPointConfig);

    // Phase 1: Initialize animation service
    this.animationService = new AnimationService();

    // CRITICAL: Inject theme CSS FIRST if in CSS mode
    // Then inject animation CSS SECOND so it has higher specificity (last wins in CSS)
    if (this.config.useCSSMode) {
      this.injectThemeCSS();
    }

    // CRITICAL: Inject animation CSS AFTER theme CSS
    // This ensures animation styles override any duplicate definitions in theme CSS
    this.animationService.injectCSS();

    // Subscribe to engine events
    this.subscribeToEngineEvents();

    // Start FPS tracking
    this.startFPSTracking();
  }

  /**
   * Render diagram to VNode tree
   */
  render(viewport: Rectangle, zoom: number): VNode {
    const startTime = performance.now();

    const diagram = this.engine.getDiagram();
    if (!diagram) {
      return this.createEmptyDiagram(viewport);
    }

    // Get LOD level from engine
    const lod = diagram.getLODLevel(zoom);

    // Get visible nodes using engine's SpatialIndex (viewport virtualization)
    const visibleNodes = diagram.getVisibleNodes(viewport);

    // Get visible links (only render if both endpoints are visible)
    const visibleLinks = this.getVisibleLinks(diagram, viewport);

    // Track counts
    this.lastNodeCount = visibleNodes.length;
    this.lastLinkCount = visibleLinks.length;

    // Render layers
    const linksLayer = this.renderLinksLayer(visibleLinks, lod);
    const nodesLayer = this.renderNodesLayer(visibleNodes, lod);
    const connectionPreviewLayer = this.renderConnectionPreviewLayer();

    // Apply zoom to viewBox (zoom around center point)
    // The center point should remain constant regardless of zoom level
    const centerX = viewport.x + viewport.width / 2;
    const centerY = viewport.y + viewport.height / 2;

    const viewBoxWidth = viewport.width / zoom;
    const viewBoxHeight = viewport.height / zoom;
    const viewBoxX = centerX - viewBoxWidth / 2;
    const viewBoxY = centerY - viewBoxHeight / 2;

    // Create root SVG VNode
    // Note: width/height omitted - controlled by CSS (100%)
    const root: VNode = {
      type: 'svg',
      key: 'diagram-root',
      props: {
        viewBox: `${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}`,
        className: 'grafloria-diagram',
      },
      children: [linksLayer, nodesLayer, connectionPreviewLayer],
    };

    // Track render time
    this.lastRenderTime = performance.now() - startTime;
    this.frameCount++;

    return root;
  }

  /**
   * Get current theme
   */
  getTheme(): Theme {
    return this.theme;
  }

  /**
   * Set theme and update rendering
   */
  setTheme(theme: Theme): void {
    this.theme = theme;

    // Re-inject CSS if in CSS mode
    if (this.config.useCSSMode) {
      this.injectThemeCSS();
    }

    // Clear cache to force re-render with new theme
    this.vnodeCache.clear();

    // Mark all entities dirty
    const diagram = this.engine.getDiagram();
    if (diagram) {
      diagram.getNodes().forEach(node => node.markDirty('theme-changed'));
      diagram.getLinks().forEach(link => link.markDirty('theme-changed'));
    }

    // Emit theme changed event
    this.engine.eventBus.emit('renderer:theme-changed', theme);
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): PerformanceMetrics {
    return {
      mode: 'svg',
      nodeCount: this.lastNodeCount,
      linkCount: this.lastLinkCount,
      renderTime: this.lastRenderTime,
      fps: this.fps,
      memoryUsage: this.estimateMemoryUsage(),
    };
  }

  /**
   * Dispose renderer and clean up resources
   */
  dispose(): void {
    if (this.disposed) return;

    this.disposed = true;

    // Remove injected CSS
    if (this.styleElement) {
      this.styleElement.remove();
      this.styleElement = undefined;
    }

    // Clear cache
    this.vnodeCache.clear();

    // Clear foreignObject tracking
    this.containerIds.clear();
    this.foreignObjectNodes.clear();

    // Clear per-frame smart-connection state
    this.frameSmartSides.clear();

    // Unsubscribe from engine events
    // (EventBus will handle cleanup on engine destroy)
  }

  /**
   * Render links layer
   * FIXED: Sort links so selected/highlighted links render on top
   */
  private renderLinksLayer(links: LinkModel[], lod: LODLevel): VNode {
    // Sort links: default/hovered first, then selected/highlighted on top
    const sortedLinks = [...links].sort((a, b) => {
      const aOrder = (a.state === 'selected' || a.state === 'highlighted') ? 1 : 0;
      const bOrder = (b.state === 'selected' || b.state === 'highlighted') ? 1 : 0;
      return aOrder - bOrder;
    });

    // Pre-pass: route every auto-routed link and sync its points BEFORE any
    // link builds its VNode. Jump-point detection reads other links' points,
    // so without this the first frame has no jumps and later frames use stale
    // geometry after nodes move.
    this.frameRoutes.clear();
    // Drop smart-side entries for links that no longer exist (getLinkEndpoints
    // only ever touches the entry of the link it renders)
    if (this.frameSmartSides.size > 0) {
      const liveIds = new Set(links.map(l => l.id));
      for (const id of Array.from(this.frameSmartSides.keys())) {
        if (!liveIds.has(id)) this.frameSmartSides.delete(id);
      }
    }
    for (const link of sortedLinks) {
      if (this.linkHasManualWaypoints(link)) continue;
      const endpoints = this.getLinkEndpoints(link);
      if (!endpoints) continue;
      const routed = this.computeAutoRoute(link, endpoints);
      if (routed) {
        this.frameRoutes.set(link.id, routed);
        this.syncLinkPoints(link, routed.points);
      }
    }

    const children = sortedLinks.map(link => this.renderLink(link, lod));

    return {
      type: 'g',
      key: 'links-layer',
      props: {
        className: 'links-layer',
      },
      children,
    };
  }

  /**
   * Render nodes layer
   */
  private renderNodesLayer(nodes: NodeModel[], lod: LODLevel): VNode {
    const children = nodes.map(node => this.renderNode(node, lod));

    return {
      type: 'g',
      key: 'nodes-layer',
      props: {
        className: 'nodes-layer',
      },
      children,
    };
  }

  /**
   * Phase 2: Render connection preview layer
   */
  private renderConnectionPreviewLayer(): VNode {
    const connectionStateManager = this.engine.getConnectionStateManager();
    const dragState = connectionStateManager.getState();

    const children: VNode[] = [];

    // Render connection preview if active
    if (dragState.isConnecting && dragState.sourcePort && dragState.currentMousePosition) {
      const previewLine = this.renderConnectionPreview(dragState);
      if (previewLine) {
        children.push(previewLine);
      }

      // Render target port highlight if hovering over valid target
      if (dragState.targetPort && dragState.isOverValidTarget) {
        // The target port will already be highlighted by the port renderer
        // No additional rendering needed here
      }
    } else {
      // Wave 2 (Edges & links): endpoint-reconnection ghost preview.
      // Guarded by `!isConnecting` so this and the new-link preview above are
      // mutually exclusive — the two state sources never double-render.
      const reconnect = this.engine.getReconnectionPreview();
      if (reconnect) {
        const ghost = this.renderReconnectionPreview(reconnect);
        if (ghost) {
          children.push(ghost);
        }
      }
    }

    return {
      type: 'g',
      key: 'connection-preview-layer',
      props: {
        className: 'connection-preview-layer',
        pointerEvents: 'none', // Don't block mouse events
      },
      children,
    };
  }

  /**
   * Phase 2: Render connection preview line
   */
  private renderConnectionPreview(dragState: any): VNode | null {
    if (!dragState.sourcePort || !dragState.currentMousePosition) {
      return null;
    }

    const config = this.engine.getInteractionConfig();
    if (!config.showConnectionPreview) {
      return null;
    }

    // Get source port world position
    const diagram = this.engine.getDiagram();
    if (!diagram) return null;

    // Find source node
    let sourceNode: NodeModel | undefined;
    for (const node of diagram.getNodes()) {
      if (node.getPort(dragState.sourcePort.id)) {
        sourceNode = node;
        break;
      }
    }

    if (!sourceNode) return null;

    // CRITICAL FIX: Use getPortPositionForShape() for consistent positioning
    // This ensures the preview line starts from the same position where the port is rendered
    const sourceLocalPos = getPortPositionForShape(dragState.sourcePort, sourceNode);
    // CRITICAL FIX: Use getWorldPosition() for child nodes to get correct absolute coordinates
    const sourceWorldPos = sourceNode.getWorldPosition();
    const sourcePos = {
      x: sourceWorldPos.x + sourceLocalPos.x,
      y: sourceWorldPos.y + sourceLocalPos.y,
    };

    const targetPos = dragState.currentMousePosition;

    // CRITICAL FIX: Determine pathType for preview from most recent link or default
    // This ensures preview matches the actual routing algorithm that will be used
    let pathType: 'direct' | 'orthogonal' | 'smooth' | 'bezier' = 'smooth'; // Default
    const links = diagram.getLinks();
    if (links.length > 0) {
      // Use pathType from the most recent link
      pathType = links[links.length - 1].pathType;
    }

    // Get source port direction for orthogonal routing
    const sourceDirection = dragState.sourcePort.alignment.side;

    // Get target port direction if hovering over a valid target port
    let targetDirection: 'left' | 'right' | 'top' | 'bottom' | undefined;
    if (dragState.targetPort) {
      targetDirection = dragState.targetPort.alignment.side;
    }

    // Use RoutingEngine to calculate preview path (same as link rendering)
    const routingEngine = this.engine.getRoutingEngine();

    // ARCHITECTURE: Use pathType to determine routing algorithm for preview
    const algorithm = this.mapPathTypeToAlgorithm(pathType);

    // OBSTACLE AVOIDANCE: Get obstacles from the diagram for preview routing
    const obstacles: Array<{ id: string; x: number; y: number; width: number; height: number }> = [];

    // Include ALL nodes as obstacles for preview
    // The routing algorithm uses gap offset to ensure paths start/end outside node boundaries
    // CRITICAL FIX: Use getWorldPosition() for child nodes to get correct absolute coordinates
    diagram.getNodes().forEach(node => {
      const worldPos = node.getWorldPosition();
      obstacles.push({
        id: node.id,
        x: worldPos.x,
        y: worldPos.y,
        width: node.size.width,
        height: node.size.height,
      });
    });

    // Use link's pathType-derived algorithm, fallback to routing engine's default
    const defaultAlgorithm = routingEngine.getDefaultAlgorithm();
    const finalAlgorithm = algorithm || defaultAlgorithm;
    const shouldAvoidObstacles = obstacles.length > 0 && finalAlgorithm !== 'straight';

    const routedPath = routingEngine.route({
      start: sourcePos,
      end: targetPos,
      sourceDirection,
      targetDirection,
      obstacles, // Pass obstacles for avoidance
      options: {
        algorithm: finalAlgorithm,
        avoidObstacles: shouldAvoidObstacles,
        obstacleMargin: 20,   // Add 20px margin around obstacles (matches final link routing)
        gridSize: 10,         // Grid size for A* pathfinding
      }
    });

    // Generate SVG path data
    let pathData: string;
    if (routedPath) {
      // ✅ CRITICAL FIX: Pass source/target directions for correct bezier curve calculation
      // Without these, the bezier control points won't extend in the proper direction
      pathData = this.convertRoutedPathToSVG(routedPath, pathType, sourceDirection, targetDirection);
    } else {
      // Phase 0.1: Fallback strategy for connection preview
      console.warn('Primary routing failed for connection preview, trying fallback');

      // Fallback Strategy 1: Try with reduced constraints
      const fallbackPath = routingEngine.route({
        start: sourcePos,
        end: targetPos,
        sourceDirection,
        targetDirection,
        obstacles,
        options: {
          algorithm: 'orthogonal',  // Force orthogonal as safest fallback
          avoidObstacles: true,
          obstacleMargin: 5,         // Reduced from 20px
          gridSize: 20,              // Coarser grid
          maxIterations: 1000        // Faster computation
        }
      });

      if (fallbackPath) {
        // ✅ CRITICAL FIX: Also pass directions for fallback path
        pathData = this.convertRoutedPathToSVG(fallbackPath, pathType, sourceDirection, targetDirection);
        console.log('✅ Fallback routing succeeded for connection preview');
      } else {
        // Fallback Strategy 2: Hide invalid preview (don't show crossing line)
        console.warn('All routing strategies failed for connection preview - hiding invalid preview');
        return null;
      }
    }

    // Determine line color based on validity
    const isValid = dragState.isOverValidTarget;
    const strokeColor = isValid
      ? this.theme.colors.success
      : this.theme.colors.link.default;

    return {
      type: 'path',
      key: 'connection-preview',
      props: {
        d: pathData,
        stroke: strokeColor,
        strokeWidth: 2,
        strokeDasharray: '5,5',
        fill: 'none',
        opacity: 0.7,
        className: 'connection-preview-line',
        style: config.animateConnectionPreview
          ? { animation: 'dash 0.5s linear infinite' }
          : undefined,
      },
    };
  }

  /**
   * Wave 2 (Edges & links): render the endpoint-reconnection ghost link.
   *
   * Draws a dashed preview from the STATIONARY endpoint of the link (the one
   * not being dragged) to the cursor, using the same RoutingEngine the real
   * connection preview uses so the ghost matches the link's routing algorithm.
   * Colour reflects drop validity (success vs default link colour).
   */
  private renderReconnectionPreview(preview: ReconnectionPreview): VNode | null {
    const config = this.engine.getInteractionConfig();
    if (!config.showConnectionPreview) {
      return null;
    }

    const diagram = this.engine.getDiagram();
    if (!diagram) return null;

    const link = diagram.getLinks().find(l => l.id === preview.linkId);
    if (!link || !link.points || link.points.length < 2) return null;

    // Dragging the source endpoint keeps the TARGET end fixed, and vice versa.
    const fixedEnd = preview.endpoint === 'source'
      ? link.points[link.points.length - 1]
      : link.points[0];
    const start = { x: fixedEnd.x, y: fixedEnd.y };
    const end = preview.mousePoint;

    const pathType = link.pathType;
    const routingEngine = this.engine.getRoutingEngine();
    const algorithm = this.mapPathTypeToAlgorithm(pathType) || routingEngine.getDefaultAlgorithm();

    // Best-effort routing direction from the fixed port.
    const fixedPortId = preview.endpoint === 'source' ? link.targetPortId : link.sourcePortId;
    const fixedPort = diagram.getPortById(fixedPortId);
    const startDirection = fixedPort?.alignment?.side;

    const routed = routingEngine.route({
      start,
      end,
      sourceDirection: startDirection,
      obstacles: [],
      options: { algorithm, avoidObstacles: false, gridSize: 10 },
    });

    const pathData = routed
      ? this.convertRoutedPathToSVG(routed, pathType, startDirection, undefined)
      : `M ${start.x} ${start.y} L ${end.x} ${end.y}`;

    const strokeColor = preview.isValid
      ? this.theme.colors.success
      : this.theme.colors.link.default;

    return {
      type: 'path',
      key: 'reconnection-preview',
      props: {
        d: pathData,
        stroke: strokeColor,
        strokeWidth: 2,
        strokeDasharray: '5,5',
        fill: 'none',
        opacity: 0.7,
        className: 'reconnection-preview-line',
        style: config.animateConnectionPreview
          ? { animation: 'dash 0.5s linear infinite' }
          : undefined,
      },
    };
  }

  /**
   * Phase 2: Generate connection preview path
   * Supports straight, bezier, step (orthogonal) routing
   */
  private generateConnectionPreviewPath(
    from: { x: number; y: number },
    to: { x: number; y: number },
    style: string
  ): string {
    if (style === 'straight') {
      return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
    }

    if (style === 'step' || style === 'orthogonal') {
      // Simple orthogonal routing for preview: horizontal then vertical, or vertical then horizontal
      // Choose the path with fewer total turns based on alignment
      const dx = Math.abs(to.x - from.x);
      const dy = Math.abs(to.y - from.y);

      // If mostly horizontal, route horizontally first
      if (dx > dy) {
        const midX = from.x + (to.x - from.x) / 2;
        return `M ${from.x} ${from.y} L ${midX} ${from.y} L ${midX} ${to.y} L ${to.x} ${to.y}`;
      } else {
        // Route vertically first
        const midY = from.y + (to.y - from.y) / 2;
        return `M ${from.x} ${from.y} L ${from.x} ${midY} L ${to.x} ${midY} L ${to.x} ${to.y}`;
      }
    }

    // Bezier curve (default)
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Control points for smooth bezier curve
    const curvature = Math.min(distance / 2, 100);
    const control1 = { x: from.x + curvature, y: from.y };
    const control2 = { x: to.x - curvature, y: to.y };

    return `M ${from.x} ${from.y} C ${control1.x} ${control1.y}, ${control2.x} ${control2.y}, ${to.x} ${to.y}`;
  }

  /**
   * Render single node
   */
  /**
   * wave2/rendering: single LOD feature gate. Reads the active diagram's
   * declarative LODConfig (`diagram.shouldRender`) instead of hardcoding
   * `lod === 'high'` / `lod !== 'low'` here, so custom tiers Just Work.
   * Returns false when there is no diagram (nothing to render anyway).
   */
  private lodAllows(feature: LODFeature, lod: LODLevel): boolean {
    return this.engine.getDiagram()?.shouldRender(feature, lod) ?? false;
  }

  private renderNode(node: NodeModel, lod: LODLevel): VNode {
    // PHASE 3: Skip HTML layer nodes entirely (React Flow style)
    // These nodes are rendered as HTML divs with handles in the HTML layer
    // NO SVG rendering at all - edges will query handle positions via DOM
    if (node.getMetadata('useHTMLLayer') === true) {
      return {
        type: 'g',
        key: `node-${node.id}-html-layer`,
        props: {},
        children: [],
      };
    }

    // Check if node should use foreignObject rendering
    if (this.shouldUseForeignObject(node)) {
      return this.renderNodeWithForeignObject(node, lod);
    }

    // Check cache if enabled (include LOD in cache key since rendering varies by LOD)
    const cacheKey = `node-${node.id}-${lod}`;
    if (this.config.enableCaching && !node.isDirty) {
      const cached = this.vnodeCache.get(cacheKey);
      if (cached) {
        // Removed overwhelming cache log - use only for debugging if needed
        // console.log(`[SVGRenderer] Using cached node ${node.id} (not dirty)`);
        return cached;
      }
    }

    const diagram = this.engine.getDiagram()!;

    // Compute styles based on mode
    const styles = this.config.useCSSMode
      ? this.computeNodeStylesCSS(node)
      : this.computeNodeStylesProgrammatic(node);

    // Option 2: Enhanced visual effects
    const isHovered = node.state.hovered;
    const isSelected = node.isSelected();

    // Phase 2: Check if node is a valid connection target
    const connectionState = this.engine.getConnectionStateManager().getState();
    const isConnectionTarget =
      connectionState.isConnecting &&
      connectionState.validTargetNodes.has(node.id);

    const vnode: VNode = {
      type: 'g',
      key: `node-${node.id}`,
      props: {
        transform: `translate(${node.position.x}, ${node.position.y})`,
        className: 'node-group',
        // Option 2: Add subtle transition effect
        style: isHovered ? { transition: 'all 0.2s ease' } : undefined,
      },
      children: [
        // Selection highlight (Phase 3.1: Shape-aware)
        ...(isSelected ? [this.renderSelectionHighlight(node)] : []),
        // Phase 2: Connection target highlight (rendered behind the node)
        ...(isConnectionTarget
          ? [
              {
                type: 'rect',
                props: {
                  x: -2,
                  y: -2,
                  width: node.size.width + 4,
                  height: node.size.height + 4,
                  fill: 'none',
                  stroke: this.theme.colors.success,
                  strokeWidth: 2,
                  rx: 5,
                  ry: 5,
                  className: 'connection-target-highlight',
                  opacity: 0.8,
                },
              } as VNode,
            ]
          : []),
        // Drop shadow (Phase 3.1: Shape-aware)
        ...(this.lodAllows('shadows', lod) ? [this.renderShadow(node, isHovered)] : []),
        // Node shape (Phase 3.1: Shape-based rendering)
        this.renderNodeShape(node, styles, isHovered),
        // Label (if LOD allows and label exists) — shape-fit wrap + ellipsis,
        // clipped to the shape's inner rect (see renderNodeLabel).
        ...(diagram.shouldRenderLabels(lod) && node.getMetadata('label')
          ? this.renderNodeLabel(node)
          : []),
        // Option 3: Lock/pin indicator for locked nodes
        ...(node.state.locked && this.lodAllows('decorations', lod)
          ? [
              // Pin icon background circle
              {
                type: 'circle',
                props: {
                  cx: node.size.width - 10,
                  cy: 10,
                  r: 8,
                  fill: this.theme.colors.warning || '#f59e0b',
                  opacity: 0.9,
                  className: 'lock-indicator-bg',
                },
              } as VNode,
              // Pin icon (simple pushpin shape using text)
              {
                type: 'text',
                props: {
                  x: node.size.width - 10,
                  y: 10,
                  textContent: '📌',
                  textAnchor: 'middle',
                  dominantBaseline: 'middle',
                  fontSize: 12,
                  pointerEvents: 'none',
                  className: 'lock-indicator',
                },
              } as VNode,
            ]
          : []),
        // Phase 2: Render ports
        ...this.renderPorts(node, lod),
      ],
    };

    // Cache if enabled (use LOD-specific cache key)
    if (this.config.enableCaching) {
      this.vnodeCache.set(cacheKey, vnode);
      node.markClean();
    }

    return vnode;
  }

  /**
   * Check if a node should use foreignObject rendering
   * Nodes can indicate they want foreignObject by setting metadata.useForeignObject = true
   */
  private shouldUseForeignObject(node: NodeModel): boolean {
    return node.getMetadata('useForeignObject') === true;
  }

  /**
   * Render a node using foreignObject for component embedding
   */
  private renderNodeWithForeignObject(node: NodeModel, lod: LODLevel): VNode {
    const diagram = this.engine.getDiagram()!;
    const isSelected = node.isSelected();
    const isHovered = node.state.hovered;

    // Phase 2: Check if node is a valid connection target
    const connectionState = this.engine.getConnectionStateManager().getState();
    const isConnectionTarget =
      connectionState.isConnecting &&
      connectionState.validTargetNodes.has(node.id);

    // Track this node uses foreignObject
    this.foreignObjectNodes.add(node.id);

    // Create foreignObject VNode for component rendering
    const foreignObject = createForeignObject({
      nodeId: node.id,
      x: 0,
      y: 0,
      width: node.size.width,
      height: node.size.height,
      key: `fo-${node.id}`,
    });

    // Store container ID for external access
    const containerId = getContainerId(foreignObject);
    if (containerId) {
      this.containerIds.set(node.id, containerId);
    }

    // Build node group with foreignObject and overlays
    const vnode: VNode = {
      type: 'g',
      key: `node-${node.id}`,
      props: {
        transform: `translate(${node.position.x}, ${node.position.y})`,
        className: 'node-group node-with-component',
        style: isHovered ? { transition: 'all 0.2s ease' } : undefined,
      },
      children: [
        // Selection highlight (rendered behind foreignObject)
        ...(isSelected
          ? [
              {
                type: 'rect',
                props: {
                  x: -3,
                  y: -3,
                  width: node.size.width + 6,
                  height: node.size.height + 6,
                  fill: 'none',
                  stroke: this.theme.colors.primary,
                  strokeWidth: 3,
                  strokeDasharray: '5,5',
                  rx: 6,
                  ry: 6,
                  className: 'selection-highlight',
                },
              } as VNode,
            ]
          : []),
        // Connection target highlight
        ...(isConnectionTarget
          ? [
              {
                type: 'rect',
                props: {
                  x: -2,
                  y: -2,
                  width: node.size.width + 4,
                  height: node.size.height + 4,
                  fill: 'none',
                  stroke: this.theme.colors.success,
                  strokeWidth: 2,
                  rx: 5,
                  ry: 5,
                  className: 'connection-target-highlight',
                  opacity: 0.8,
                },
              } as VNode,
            ]
          : []),
        // foreignObject for component embedding
        foreignObject,
        // Ports (rendered on top of foreignObject)
        ...this.renderPorts(node, lod),
      ],
    };

    return vnode;
  }

  /**
   * Get container ID for a node (if it uses foreignObject)
   */
  getContainerId(nodeId: string): string | undefined {
    return this.containerIds.get(nodeId);
  }

  /**
   * Check if a node uses foreignObject rendering
   */
  isUsingForeignObject(nodeId: string): boolean {
    return this.foreignObjectNodes.has(nodeId);
  }

  /**
   * Phase 2: Render ports for a node
   */
  private renderPorts(node: NodeModel, lod: LODLevel): VNode[] {
    // Skip port rendering when this LOD tier doesn't render ports
    if (!this.lodAllows('ports', lod)) {
      return [];
    }

    const interactionConfig = this.engine.getInteractionConfig();
    const ports = Array.from(node.getPorts().values());

    return ports
      .map(port => this.renderPort(port, node, interactionConfig, lod))
      .filter(Boolean) as VNode[];
  }

  /**
   * Phase 3: Render single port
   * Updated to support template system port rendering configuration
   * CRITICAL FIX: Added pointer-events and proper z-index to ensure ports are clickable
   */
  private renderPort(
    port: PortModel,
    node: NodeModel,
    config: InteractionConfig,
    lod: LODLevel
  ): VNode | null {
    // Determine if port should be visible based on visibility strategy
    const shouldRender = this.shouldRenderPort(port, node, config);
    if (!shouldRender) {
      return null;
    }

    // CRITICAL FIX: Calculate port position RELATIVE to node's local coordinate system
    // NOT absolute world coordinates, since ports are rendered inside a transformed group
    // The node group already has: transform="translate(node.position.x, node.position.y)"
    const portPos = this.getPortRelativePosition(port, node);

    // Calculate port radius with hover scaling
    const baseRadius = config.portDefaultRadius;
    const radius = port.isHovered
      ? baseRadius * config.portHoverScaleFactor
      : baseRadius;

    // Get port color based on type
    const portColor = this.getPortColor(port);

    // Determine if port is highlighted (valid target during connection)
    const isHighlighted = port.isHighlighted || port.isValidTarget;

    return {
      type: 'circle',
      key: `port-${port.id}`,
      props: {
        cx: portPos.x,
        cy: portPos.y,
        r: radius,
        fill: isHighlighted ? portColor : this.theme.colors.background.surface,
        stroke: portColor,
        strokeWidth: isHighlighted ? 3 : this.theme.ports.strokeWidth,
        className: this.config.useCSSMode
          ? `port port-${port.type}${port.isHovered ? ' port-hovered' : ''}${isHighlighted ? ' port-highlighted' : ''}`
          : undefined,
        // CRITICAL FIX: Ensure ports capture pointer events and have proper cursor
        // pointer-events: all ensures the port intercepts mouse events even when overlapping the node
        style: {
          transition: 'all 0.2s ease',
          cursor: port.isHovered || isHighlighted ? 'pointer' : 'crosshair',
          pointerEvents: 'all'
        },
        opacity: isHighlighted ? 1 : 0.9,
        // CRITICAL FIX: Add data attribute for debugging
        'data-port-id': port.id,
        'data-port-type': port.type,
        'data-port-side': port.side,
      },
    };
  }

  /**
   * Get port position relative to node's local coordinate system
   * Used for rendering ports inside node groups that are already transformed
   */
  // Phase 3.2: Shape-aware port positioning
  private getPortRelativePosition(port: PortModel, node: NodeModel): { x: number; y: number } {
    // Use shape-aware positioning utility
    return getPortPositionForShape(port, node);
  }

  /**
   * Phase 3: Determine if port should be rendered based on visibility strategy
   * Updated to support template system configuration
   * CRITICAL FIX: Added comprehensive debugging and proper string comparison
   */
  private shouldRenderPort(
    port: PortModel,
    node: NodeModel,
    config: InteractionConfig
  ): boolean {
    // Phase 3: Check port rendering mode first
    // If port is configured for HTML rendering, skip SVG rendering
    const renderingConfig = port.getRenderingConfig?.();
    if (renderingConfig) {
      const mode = renderingConfig.mode || 'svg';

      // Skip HTML mode ports in SVGRenderer
      if (mode === 'html') {
        return false;
      }

      // Auto mode: detect based on node's HTML layer flag
      if (mode === 'auto') {
        const usesHTMLLayer = node.getMetadata?.('useHTMLLayer');
        if (usesHTMLLayer === true) {
          return false; // Skip - will be rendered in HTML layer
        }
      }
    }

    // Phase 3: Use effective visibility (port > node > global config)
    // Try to get effective visibility from port
    let visibilityStr: string;
    if (port.getEffectiveVisibility && typeof port.getEffectiveVisibility === 'function') {
      const effectiveVisibility = port.getEffectiveVisibility(
        node,
        String(config.portVisibility).toLowerCase() as any
      );
      visibilityStr = String(effectiveVisibility).toLowerCase();
    } else {
      // Fallback to global config if port doesn't have getEffectiveVisibility
      visibilityStr = String(config.portVisibility).toLowerCase();
    }

    // DEBUG: Enable this to see port visibility decisions
    const debugPortVisibility = false; // Disabled - working correctly now

    if (debugPortVisibility && visibilityStr === 'on-hover') {
      console.log(`🔍 Port visibility check:`, {
        port: `${port.side}`,
        nodeHovered: node.state.hovered,
        portHovered: port.isHovered,
        highlighted: port.isHighlighted,
        validTarget: port.isValidTarget,
        nodeLabel: node.getMetadata('label'),
        effectiveVisibility: visibilityStr,
        shouldShow: node.state.hovered || port.isHovered || port.isHighlighted || port.isValidTarget
      });
    }

    switch (visibilityStr) {
      case 'always':
        return true;
      case 'on-hover':
        // CRITICAL FIX: Show ports when node is hovered, OR during connection (highlighted/validTarget)
        // Do NOT show just because port.isHovered - that creates the "sticky port" bug
        // where the port you exit through stays visible
        const shouldShow = node.state.hovered || port.isHighlighted || port.isValidTarget;
        return shouldShow;
      case 'never':
      case 'hidden':
        // Only show if actively involved in connection
        return port.isHighlighted || port.isValidTarget;
      default:
        // Fallback to always visible
        console.warn(`Unknown port visibility strategy: ${visibilityStr}, defaulting to 'always'`);
        return true;
    }
  }

  /**
   * Phase 2: Get port color based on type
   */
  private getPortColor(port: PortModel): string {
    switch (port.type) {
      case 'input':
        return this.theme.colors.port.input;
      case 'output':
        return this.theme.colors.port.output;
      case 'bi':
        return this.theme.colors.port.bi;
      default:
        return this.theme.colors.port.bi;
    }
  }

  /**
   * Phase 3.1: Render node shape based on shape configuration
   * Supports: rect, circle, ellipse, diamond, hexagon
   */
  /**
   * Node label engine: render the node's label as a shape-fitted text block.
   *
   * - maxWidth  = the shape's inner-rect width (getInnerRect); the diamond /
   *   ellipse / triangle … inset it so text stays inside the silhouette.
   * - maxLines  = floor(innerHeight / lineHeight); overflow collapses to '…'.
   * - a per-node <clipPath> sized to the exact inner rect is the hard backstop
   *   that guarantees glyphs never escape the shape even if the width estimate
   *   is off (it uses the naive length*fontSize*0.6 heuristic — see text-block).
   *
   * Returns [clipPath, text]; both are children of the node's translated <g>,
   * so the clip rect and the text share the node-local coordinate space.
   */
  private renderNodeLabel(node: NodeModel): VNode[] {
    const shapeConfig = node.getMetadata('shape') || { type: 'rect' };
    const { width, height } = node.size;
    const inner = getInnerRect(getShape(shapeConfig.type), width, height);

    const fontSize = this.theme.typography.fontSize.md as number;
    const lineHeight = fontSize * 1.2;
    const maxLines = Math.max(1, Math.floor(inner.h / lineHeight));
    const clipId = `node-clip-${node.id}`;

    const clip: VNode = {
      type: 'clipPath',
      key: `${clipId}-def`,
      props: { id: clipId },
      children: [
        {
          type: 'rect',
          props: { x: inner.x, y: inner.y, width: inner.w, height: inner.h },
        } as VNode,
      ],
    };

    const text = renderTextBlock({
      text: String(node.getMetadata('label')),
      x: inner.x + inner.w / 2,
      y: inner.y + inner.h / 2,
      maxWidth: inner.w,
      align: 'middle',
      valign: 'middle',
      fontSize,
      lineHeight: 1.2,
      maxLines,
      clipId,
      nonInteractive: true,
      // CSS mode lets `.diagram-label` drive font/fill; programmatic mode emits them.
      className: this.config.useCSSMode ? 'diagram-label' : undefined,
      emitFontSize: !this.config.useCSSMode,
      color: this.config.useCSSMode ? undefined : (this.theme.colors.text.primary as string),
      fontWeight: this.config.useCSSMode ? undefined : (this.theme.typography.fontWeight.medium as number),
    });

    return [clip, text];
  }

  private renderNodeShape(node: NodeModel, styles: any, isHovered: boolean): VNode {
    const shapeConfig = node.getMetadata('shape') || { type: 'rect' };
    const { width, height } = node.size;

    // CRITICAL: Remove strokeWidth from styles if border animation is active
    // Inline strokeWidth overrides CSS animation strokeWidth
    const hasActiveBorderAnimation = node.style?.animatedBorder &&
                                     node.style?.borderAnimationType !== 'none';

    if (hasActiveBorderAnimation && styles.strokeWidth !== undefined) {
      console.log(`[SVGRenderer] Removing inline strokeWidth for ${node.id} due to active border animation`);
      const { strokeWidth, ...stylesWithoutStrokeWidth } = styles;
      styles = stylesWithoutStrokeWidth;
    }

    // Apply shape-specific fill/stroke if provided
    const shapeStyles = {
      ...styles,
      ...(shapeConfig.fill ? { fill: shapeConfig.fill } : {}),
      ...(shapeConfig.stroke ? { stroke: shapeConfig.stroke } : {}),
      ...(shapeConfig.strokeWidth !== undefined && !hasActiveBorderAnimation ? { strokeWidth: shapeConfig.strokeWidth } : {}),
      ...(shapeConfig.opacity !== undefined ? { opacity: shapeConfig.opacity } : {}),
    };

    // Enhanced hover effect
    if (isHovered && !this.config.useCSSMode) {
      shapeStyles.strokeWidth = (shapeStyles.strokeWidth || 1) + 1;
      shapeStyles.filter = 'brightness(1.05)';
    }

    // Route through the shape registry (see shape-registry.ts). buildShapeBody
    // reproduces the historical per-shape style composition exactly.
    return buildShapeBody(
      getShape(shapeConfig.type),
      width,
      height,
      shapeConfig.cornerRadius,
      shapeStyles
    );
  }

  /**
   * Phase 3.1: Render selection highlight matching node shape
   */
  private renderSelectionHighlight(node: NodeModel): VNode {
    const shapeConfig = node.getMetadata('shape') || { type: 'rect' };
    const { width, height } = node.size;
    const padding = 3;

    const baseProps = {
      fill: 'none',
      stroke: this.theme.colors.primary,
      strokeWidth: 3,
      strokeDasharray: '5,5',
      className: 'selection-highlight',
    };

    // Selection highlight = the shape outline grown by `padding` (registry).
    return buildShapeSelection(getShape(shapeConfig.type), width, height, padding, baseProps);
  }

  /**
   * Phase 3.1: Render shadow matching node shape
   */
  private renderShadow(node: NodeModel, isHovered: boolean): VNode {
    const shapeConfig = node.getMetadata('shape') || { type: 'rect' };
    const { width, height } = node.size;
    const offset = isHovered ? 2 : 3;

    const baseProps = {
      fill: '#000',
      opacity: isHovered ? 0.15 : 0.1,
      filter: 'blur(4px)',
      className: 'node-shadow',
    };

    // Drop shadow = the shape outline offset by (offset, offset) (registry).
    return buildShapeShadow(
      getShape(shapeConfig.type),
      width,
      height,
      offset,
      (node.style.borderRadius ?? 4) as number,
      baseProps
    );
  }

  /**
   * Get link endpoints (source and target port positions in world coordinates)
   * CRITICAL FIX: Use the same getPortPositionForShape() as port rendering to ensure alignment
   */
  private getLinkEndpoints(link: LinkModel): {
    start: { x: number; y: number };
    end: { x: number; y: number };
    sourceDirection?: 'left' | 'right' | 'top' | 'bottom';
    targetDirection?: 'left' | 'right' | 'top' | 'bottom';
  } | null {
    const diagram = this.engine.getDiagram();
    if (!diagram) return null;

    // Get source and target nodes
    // Try to get by node ID first, if not set, find the node that owns the port
    let sourceNode = link.sourceNodeId ? diagram.getNode(link.sourceNodeId) : null;
    let targetNode = link.targetNodeId ? diagram.getNode(link.targetNodeId) : null;

    // If node IDs not set, find nodes by searching for ports
    if (!sourceNode) {
      sourceNode = diagram.getNodes().find(n => n.getPorts().some(p => p.id === link.sourcePortId)) || null;
    }
    if (!targetNode) {
      targetNode = diagram.getNodes().find(n => n.getPorts().some(p => p.id === link.targetPortId)) || null;
    }

    if (!sourceNode || !targetNode) return null;

    // Get source and target ports
    let sourcePort = sourceNode.getPort(link.sourcePortId);
    let targetPort = targetNode.getPort(link.targetPortId);

    if (!sourcePort || !targetPort) return null;

    // Smart connection points (optional): FLOATING attachment, draw.io-style.
    // The side is picked from the nodes' relative positions, and the exact
    // attachment point SLIDES along that edge to line up with the other node —
    // aligned nodes get a dead-straight line instead of a stair-step jog.
    // Purely visual: the link's assigned ports are untouched and win again
    // the moment the option is turned off.
    if (this.config.smartConnectionPoints) {
      const srcPos = sourceNode.getWorldPosition();
      const tgtPos = targetNode.getWorldPosition();
      const s = { x: srcPos.x, y: srcPos.y, w: sourceNode.size.width, h: sourceNode.size.height };
      const t = { x: tgtPos.x, y: tgtPos.y, w: targetNode.size.width, h: targetNode.size.height };
      const sc = { x: s.x + s.w / 2, y: s.y + s.h / 2 };
      const tc = { x: t.x + t.w / 2, y: t.y + t.h / 2 };
      const dx = tc.x - sc.x;
      const dy = tc.y - sc.y;
      const horizontal = Math.abs(dx) >= Math.abs(dy);
      const srcSide: 'left' | 'right' | 'top' | 'bottom' = horizontal ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'bottom' : 'top');
      const tgtSide: 'left' | 'right' | 'top' | 'bottom' = horizontal ? (dx >= 0 ? 'left' : 'right') : (dy >= 0 ? 'top' : 'bottom');

      const PAD = 10; // keep the attachment off the node corners
      const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

      // Cross-axis coordinate for each end. When the two nodes' spans overlap
      // on that axis, BOTH ends share one coordinate inside the overlap — that
      // is what makes near-aligned nodes connect with a dead-straight line.
      let srcCross: number;
      let tgtCross: number;
      if (horizontal) {
        const lo = Math.max(s.y, t.y) + PAD;
        const hi = Math.min(s.y + s.h, t.y + t.h) - PAD;
        if (lo <= hi) {
          srcCross = tgtCross = clamp((sc.y + tc.y) / 2, lo, hi);
        } else {
          srcCross = clamp(tc.y, s.y + PAD, s.y + s.h - PAD);
          tgtCross = clamp(sc.y, t.y + PAD, t.y + t.h - PAD);
        }
      } else {
        const lo = Math.max(s.x, t.x) + PAD;
        const hi = Math.min(s.x + s.w, t.x + t.w) - PAD;
        if (lo <= hi) {
          srcCross = tgtCross = clamp((sc.x + tc.x) / 2, lo, hi);
        } else {
          srcCross = clamp(tc.x, s.x + PAD, s.x + s.w - PAD);
          tgtCross = clamp(sc.x, t.x + PAD, t.x + t.w - PAD);
        }
      }

      let start = this.shapeEdgePoint(sourceNode, s, srcSide, srcCross);
      let end = this.shapeEdgePoint(targetNode, t, tgtSide, tgtCross);

      // VISIBLE ports are the contract: when the node shows ports on the
      // chosen side, snap to the closest one instead of floating freely.
      // Floating attachment only applies while ports are hidden.
      const srcSnap = this.nearestVisiblePort(sourceNode, srcSide, start);
      const tgtSnap = this.nearestVisiblePort(targetNode, tgtSide, end);
      if (srcSnap) start = srcSnap;
      if (tgtSnap) end = tgtSnap;
      // If only one end snapped, re-aim the floating end at the snapped point
      // so aligned layouts still get a straight line
      if (srcSnap && !tgtSnap) {
        end = this.shapeEdgePoint(targetNode, t, tgtSide, horizontal
          ? clamp(start.y, t.y + PAD, t.y + t.h - PAD)
          : clamp(start.x, t.x + PAD, t.x + t.w - PAD));
      } else if (tgtSnap && !srcSnap) {
        start = this.shapeEdgePoint(sourceNode, s, srcSide, horizontal
          ? clamp(end.y, s.y + PAD, s.y + s.h - PAD)
          : clamp(end.x, s.x + PAD, s.x + s.w - PAD));
      }

      this.frameSmartSides.set(link.id, { source: srcSide, target: tgtSide });
      return {
        start,
        end,
        sourceDirection: srcSide,
        targetDirection: tgtSide,
      };
    } else {
      this.frameSmartSides.delete(link.id);
    }

    // CRITICAL FIX: Use getPortPositionForShape() for consistent positioning
    // This ensures links connect to the same positions where ports are rendered
    const sourceLocalPos = getPortPositionForShape(sourcePort, sourceNode);
    const targetLocalPos = getPortPositionForShape(targetPort, targetNode);

    // Convert from local (node-relative) to world coordinates
    // CRITICAL FIX: Use getWorldPosition() for child nodes to get correct absolute coordinates
    const sourceWorldPos = sourceNode.getWorldPosition();
    const targetWorldPos = targetNode.getWorldPosition();

    const start = {
      x: sourceWorldPos.x + sourceLocalPos.x,
      y: sourceWorldPos.y + sourceLocalPos.y,
    };
    const end = {
      x: targetWorldPos.x + targetLocalPos.x,
      y: targetWorldPos.y + targetLocalPos.y,
    };

    // Get port directions (for orthogonal routing)
    const sourceDirection = sourcePort.alignment.side;
    const targetDirection = targetPort.alignment.side;

    return { start, end, sourceDirection, targetDirection };
  }

  /**
   * Map LinkModel pathType to RoutingAlgorithm
   */
  private mapPathTypeToAlgorithm(pathType: string): RoutingAlgorithm {
    switch (pathType) {
      case 'direct':
        return 'straight';
      case 'orthogonal':
        return 'orthogonal';
      case 'smooth':
      case 'bezier':
      default:
        return 'straight'; // Use straight for smooth/bezier, will add curve post-processing
    }
  }

  /**
   * Calculate distance between two points
   */
  private distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Generate SVG path segment with rounded bend
   * Based on React Flow's getBend function from smoothstep-edge.ts
   */
  private getBend(
    a: { x: number; y: number },
    b: { x: number; y: number },
    c: { x: number; y: number },
    size: number
  ): string {
    const bendSize = Math.min(
      this.distance(a, b) / 2,
      this.distance(b, c) / 2,
      size
    );
    const { x, y } = b;

    // No bend needed if points are collinear (straight line)
    if ((a.x === x && x === c.x) || (a.y === y && y === c.y)) {
      return `L${x} ${y}`;
    }

    // First segment is horizontal
    if (a.y === y) {
      const xDir = a.x < c.x ? -1 : 1;
      const yDir = a.y < c.y ? 1 : -1;
      return `L ${x + bendSize * xDir},${y}Q ${x},${y} ${x},${y + bendSize * yDir}`;
    }

    // First segment is vertical
    const xDir = a.x < c.x ? 1 : -1;
    const yDir = a.y < c.y ? -1 : 1;
    return `L ${x},${y + bendSize * yDir}Q ${x},${y} ${x + bendSize * xDir},${y}`;
  }

  /**
   * Convert orthogonal path to SVG with rounded corners
   * Implements React Flow's smoothstep edge rendering
   */
  private convertOrthogonalPathWithBends(
    points: Array<{ x: number; y: number }>,
    borderRadius: number = 5
  ): string {
    if (points.length === 0) return '';
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
    if (points.length === 2) {
      return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
    }

    // Start path at first point
    let path = `M ${points[0].x} ${points[0].y}`;

    // For each intermediate point, add a bend
    for (let i = 1; i < points.length - 1; i++) {
      path += this.getBend(points[i - 1], points[i], points[i + 1], borderRadius);
    }

    // Add final point
    path += ` L ${points[points.length - 1].x} ${points[points.length - 1].y}`;

    return path;
  }

  /**
   * Convert RoutedPath to SVG path string
   */
  private convertRoutedPathToSVG(
    routedPath: RoutedPath,
    pathType: string,
    sourceDirection?: string,
    targetDirection?: string,
    avoidNodes?: NodeModel[]
  ): string {
    if (!routedPath || routedPath.points.length === 0) return '';

    const points = routedPath.points;

    // For smooth/bezier types, add curve control points
    if (pathType === 'smooth' || pathType === 'bezier') {
      if (points.length < 2) return `M ${points[0].x} ${points[0].y}`;

      let path = `M ${points[0].x} ${points[0].y}`;

      // Simple bezier curve for 2 points
      if (points.length === 2) {
        const dx = points[1].x - points[0].x;
        const dy = points[1].y - points[0].y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const controlDistance = Math.min(distance / 2, 100);

        // ENHANCED: Direction-aware control points (ReactFlow style)
        // Control points extend from the port in the direction it faces
        let cp1x = points[0].x;
        let cp1y = points[0].y;
        let cp2x = points[1].x;
        let cp2y = points[1].y;

        if (sourceDirection && targetDirection) {
          // Calculate control point 1 based on source port direction
          switch (sourceDirection) {
            case 'right':
              cp1x = points[0].x + controlDistance;
              cp1y = points[0].y;
              break;
            case 'left':
              cp1x = points[0].x - controlDistance;
              cp1y = points[0].y;
              break;
            case 'bottom':
              cp1x = points[0].x;
              cp1y = points[0].y + controlDistance;
              break;
            case 'top':
              cp1x = points[0].x;
              cp1y = points[0].y - controlDistance;
              break;
          }

          // Calculate control point 2 based on target port direction
          switch (targetDirection) {
            case 'right':
              cp2x = points[1].x + controlDistance;
              cp2y = points[1].y;
              break;
            case 'left':
              cp2x = points[1].x - controlDistance;
              cp2y = points[1].y;
              break;
            case 'bottom':
              cp2x = points[1].x;
              cp2y = points[1].y + controlDistance;
              break;
            case 'top':
              cp2x = points[1].x;
              cp2y = points[1].y - controlDistance;
              break;
          }
        } else {
          // Fallback to old horizontal-only behavior
          cp1x = points[0].x + controlDistance;
          cp1y = points[0].y;
          cp2x = points[1].x - controlDistance;
          cp2y = points[1].y;
        }

        path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${points[1].x} ${points[1].y}`;
      } else {
        // Multi-point route (e.g. a detour around a node): a smooth link must
        // KEEP ITS CURVED IDENTITY — fit a spline through the route points.
        // Guard: if the spline's corner overshoot would dip into the link's
        // own nodes, fall back to tight rounded corners instead.
        const spline = this.catmullRomPath(points);
        const avoid = avoidNodes ?? [];
        if (avoid.length === 0 ||
            this.penetrationLength(this.sampleCatmullRom(points, 8), avoid) <= 2) {
          return spline;
        }
        return this.convertOrthogonalPathWithBends(points, 12);
      }

      return path;
    }

    // For straight, just connect the points
    if (pathType === 'straight') {
      let path = `M ${points[0].x} ${points[0].y}`;
      for (let i = 1; i < points.length; i++) {
        path += ` L ${points[i].x} ${points[i].y}`;
      }
      return path;
    }

    // For orthogonal with rounded corners (React Flow smoothstep style)
    if (pathType === 'orthogonal') {
      return this.convertOrthogonalPathWithBends(points, 5); // Default borderRadius = 5 (React Flow default)
    }

    // Fallback
    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      path += ` L ${points[i].x} ${points[i].y}`;
    }
    return path;
  }

  /**
   * Render single link (Option 2: Enhanced with arrows and labels)
   */
  private renderLink(link: LinkModel, lod: LODLevel): VNode {
    // Check cache if enabled (include LOD in cache key since rendering varies
    // by LOD — arrows/labels/handles differ per tier, exactly like nodes).
    // A clean link crossing an LOD threshold on zoom must NOT serve a
    // wrong-LOD VNode. NOTE: this is the cache lookup key only; the VNode's
    // `key` prop stays `link-${link.id}` for stable VDOM reconciliation.
    const cacheKey = `link-${link.id}-${lod}`;
    if (this.config.enableCaching && !link.isDirty) {
      const cached = this.vnodeCache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    // Compute styles
    const styles = this.config.useCSSMode
      ? this.computeLinkStylesCSS(link)
      : this.computeLinkStylesProgrammatic(link);

    // Get link endpoints from ports
    const endpoints = this.getLinkEndpoints(link);

    // Fallback to existing points if endpoints can't be calculated
    let pathData: string;
    let points: Array<{ x: number; y: number }>;

    // Waypoints only count as manual when the waypoint editor marked them so.
    // Auto-routed orthogonal paths also have >2 points; treating those as
    // manual froze links in place (they never re-routed after a node moved).
    const hasManualWaypoints = this.linkHasManualWaypoints(link);

    if (endpoints && !hasManualWaypoints) {
      // Routes are pre-computed for the whole frame in renderLinksLayer so that
      // jump-point detection sees every link's CURRENT geometry (not last frame's).
      const routedPath = this.frameRoutes.get(link.id) ?? this.computeAutoRoute(link, endpoints);

      if (routedPath) {
        points = routedPath.points;
        pathData = this.convertRoutedPathToSVG(
          routedPath,
          link.pathType,
          endpoints.sourceDirection,
          endpoints.targetDirection,
          this.linkOwnNodes(link)
        );
        this.syncLinkPoints(link, points);
      } else {
        // All routing strategies failed: hide invalid connection
        console.warn(`All routing strategies failed for link ${link.id} - hiding invalid preview`);
        return {
          type: 'g',
          key: `link-${link.id}`,
          props: {},
          children: []
        };
      }
    } else {
      // Has manual waypoints — keep the user's interior waypoints but refresh
      // both endpoints from the CURRENT port positions, otherwise the link
      // stays anchored to wherever the nodes were when the waypoint was added.
      points = link.points;
      if (endpoints && points.length >= 2) {
        points = [
          { ...endpoints.start },
          ...points.slice(1, -1).map(p => ({ ...p })),
          { ...endpoints.end },
        ];
        this.syncLinkPoints(link, points);
      }

      // ✅ HIGH-PERFORMANCE: For orthogonal paths with manual waypoints
      // Use fast direct orthogonal calculation for waypoint segments
      // Only use routing engine for port connections (first/last segments)
      if (link.pathType === 'orthogonal' && hasManualWaypoints) {
        const routingEngine = this.engine.getRoutingEngine();
        const allRoutedPoints: Array<{ x: number; y: number }> = [];

        // Get port directions for first and last segments
        const sourceDirection = endpoints?.sourceDirection;
        const targetDirection = endpoints?.targetDirection;

        // Collect obstacles for segment routing (same as primary routing)
        const currentDiagram = this.engine.getDiagram();
        let segmentObstacles: Array<{id: string; x: number; y: number; width: number; height: number}> = [];

        if (currentDiagram) {
          const sourceNodeId = (link as any).sourceNodeId || (link as any).source;
          const targetNodeId = (link as any).targetNodeId || (link as any).target;

          segmentObstacles = currentDiagram.getNodes()
            .filter((node: NodeModel) =>
              node.id !== sourceNodeId && node.id !== targetNodeId
            )
            .map((node: NodeModel) => ({
              id: node.id,
              x: node.position.x,
              y: node.position.y,
              width: node.size.width,
              height: node.size.height,
            }));
        }

        for (let i = 0; i < points.length - 1; i++) {
          const start = points[i];
          const end = points[i + 1];
          const isFirstSegment = i === 0;
          const isLastSegment = i === points.length - 2;

          if (isFirstSegment || isLastSegment) {
            // Use routing engine for port connections (perpendicular to ports)
            // FIXED: Enable obstacle avoidance to prevent penetrating nodes during drag
            const segmentSourceDir = isFirstSegment ? sourceDirection : undefined;
            const segmentTargetDir = isLastSegment ? targetDirection : undefined;

            const segmentRoute = routingEngine.route({
              start,
              end,
              sourceDirection: segmentSourceDir,
              targetDirection: segmentTargetDir,
              obstacles: segmentObstacles,  // FIXED: Pass obstacles
              options: {
                algorithm: 'orthogonal',
                avoidObstacles: true,  // FIXED: Enable A* pathfinding
                gridSize: 10
              }
            });

            if (segmentRoute && segmentRoute.points.length > 0) {
              const segPts = this.rectifyOrthogonalRoute(segmentRoute.points);
              if (i === 0) {
                allRoutedPoints.push(...segPts);
              } else {
                allRoutedPoints.push(...segPts.slice(1));
              }
            } else {
              if (i === 0) allRoutedPoints.push(start);
              allRoutedPoints.push(end);
            }
          } else {
            // FAST PATH: Direct orthogonal segment calculation for waypoint-to-waypoint
            // Create simple 3-point orthogonal path: start -> midpoint -> end
            const orthogonalSegment = this.createOrthogonalSegment(start, end);

            // Skip first point (already added from previous segment)
            if (orthogonalSegment.length > 1) {
              allRoutedPoints.push(...orthogonalSegment.slice(1));
            }
          }
        }

        points = allRoutedPoints;
        pathData = this.generatePathData(allRoutedPoints, link.segments, link.pathType);
      } else {
        // For non-orthogonal paths or no waypoints, use the (endpoint-refreshed)
        // points as-is
        pathData = this.generatePathData(points, link.segments, link.pathType);
      }
    }

    // Safety check: if points is still empty/undefined, skip rendering
    if (!points || points.length === 0) {
      console.warn(`Cannot render link ${link.id}: no valid points available`);
      return {
        type: 'g',
        key: `link-${link.id}`,
        props: {},
        children: []
      };
    }

    // CRITICAL FIX: Get arrow styles FIRST to use actual arrow size for position calculation
    // Get arrow styles from link (with defaults)
    const arrowHeadStyle = link.style.arrowHead || {
      type: 'arrow',
      size: 10,
      filled: true,
      color: styles.stroke || this.theme.colors.link.default
    };

    const arrowTailStyle = link.style.arrowTail;

    // Calculate arrow position and angle using unified utility.
    // Each marker shape has its own tip offset (triangle tip at +size, circles
    // centered, diamonds tip at origin) — using the raw size floated every
    // non-triangle marker off the node.
    const arrowData = this.calculateArrowPositionAndAngle(
      link, points, true, this.arrowRenderer.getTipOffset(arrowHeadStyle));
    const arrowTipPosition = arrowData.position;
    const angle = arrowData.angle;

    // Calculate label position (middle of the link)
    const midIndex = Math.floor(points.length / 2);
    const labelPoint = points[midIndex];
    const label = link.getMetadata('label');

    // Store last point for endpoint handle rendering
    const lastPoint = points[points.length - 1];

    // Phase 2: Check if link is selected and reconnection handles should be shown
    const config = this.engine.getInteractionConfig();
    const isSelected = link.state === 'selected';
    const showHandles =
      config.enableLinkReconnection &&
      config.showLinkEndpointHandles &&
      isSelected &&
      this.lodAllows('handles', lod);

    // Phase 1.3: Apply jump points if enabled.
    // Jumps are built from the SAME polyline the detector indexed — never by
    // re-parsing the rendered path string (rounded corners would shift segment
    // indices). Curved 2-point links keep their curve: chord-based jumps would
    // both misplace the jump and destroy the bezier.
    let linkPathVNode: VNode;
    const jumpConfig = link.style.jumpPoints;
    const isTwoPointCurve =
      (link.pathType === 'smooth' || link.pathType === 'bezier') && points.length === 2;
    let jumpPathData: string | null = null;

    if (jumpConfig?.enabled && (jumpConfig.size ?? 10) > 0 && !isTwoPointCurve && points.length >= 2) {
      const diagram = this.engine.getDiagram();
      const allLinks = diagram ? diagram.getLinks() : [];
      const otherLinks = allLinks.filter(l => l.id !== link.id);

      const intersections = this.jumpPointDetector.detectIntersections(
        { id: link.id, points },
        otherLinks.map(l => ({ id: l.id, points: l.points })),
        jumpConfig.detectMode,
        jumpConfig.threshold
      );

      if (intersections.length > 0) {
        // Keep jumps clear of the arrow markers: reserve the marker's tip
        // extent at each end so an arc never renders underneath an arrowhead
        const headReserve = arrowHeadStyle && arrowHeadStyle.type !== 'none'
          ? this.arrowRenderer.getTipOffset(arrowHeadStyle) + 2 : 0;
        const tailReserve = arrowTailStyle && arrowTailStyle.type !== 'none'
          ? this.arrowRenderer.getTipOffset(arrowTailStyle) + 2 : 0;
        jumpPathData = this.buildPathWithJumps(points, intersections, jumpConfig, link.pathType, tailReserve, headReserve);
      }
    }

    linkPathVNode = {
      type: 'path',
      props: {
        d: jumpPathData ?? pathData,
        fill: 'none',
        ...styles,
      },
    };

    // Invisible wide stroke under the link so thin lines are easy to click
    // and hover (classic diagram-tool "interaction stroke")
    const hitAreaWidth = Math.max(
      this.config.linkHitAreaWidth,
      Number(styles.strokeWidth ?? 2) + 8
    );
    const hitAreaVNode: VNode | null = this.config.linkHitAreaWidth > 0
      ? {
          type: 'path',
          props: {
            d: jumpPathData ?? pathData,
            fill: 'none',
            stroke: 'transparent',
            strokeWidth: hitAreaWidth,
            pointerEvents: 'stroke',
            className: 'link-hit-area',
          },
        }
      : null;

    const vnode: VNode = {
      type: 'g',
      key: `link-${link.id}`,
      props: {
        className: 'link-group',
      },
      children: [
        ...(hitAreaVNode ? [hitAreaVNode] : []),
        // Link path (with or without jump points)
        linkPathVNode,
        // Phase 1.1: Arrow markers using ArrowRenderer
        ...(this.lodAllows('decorations', lod)
          ? (() => {
              const arrows: VNode[] = [];

              // Render arrow head (at target end)
              if (arrowHeadStyle && arrowHeadStyle.type !== 'none') {
                const transform = `translate(${arrowTipPosition.x}, ${arrowTipPosition.y}) rotate(${angle})`;
                const arrowHeadVNode = this.arrowRenderer.renderArrow(arrowHeadStyle, transform, this.theme.colors.background.default);
                if (arrowHeadVNode) {
                  arrows.push(arrowHeadVNode);
                }
              }

              // Render arrow tail (at source end) if specified
              if (arrowTailStyle && arrowTailStyle.type !== 'none') {
                // Calculate arrow tail position and angle (at source end)
                const tailArrowData = this.calculateArrowPositionAndAngle(link, points, false, this.arrowRenderer.getTipOffset(arrowTailStyle));
                const tailTransform = `translate(${tailArrowData.position.x}, ${tailArrowData.position.y}) rotate(${tailArrowData.angle})`;
                const arrowTailVNode = this.arrowRenderer.renderArrow(arrowTailStyle, tailTransform, this.theme.colors.background.default);
                if (arrowTailVNode) {
                  arrows.push(arrowTailVNode);
                }
              }

              return arrows;
            })()
          : []),
        // Phase 1.2: Multiple labels using LabelRenderer
        ...(this.lodAllows('labels', lod)
          ? (() => {
              const labelVNodes: VNode[] = [];

              // Render labels from link.labels array
              if (link.labels && link.labels.length > 0) {
                link.labels.forEach(label => {
                  const labelVNode = this.labelRenderer.renderLabel(label, link);
                  if (labelVNode) {
                    labelVNodes.push(labelVNode);
                  }
                });
              }
              // Backward compatibility: support old metadata label
              else if (label) {
                // Convert old label format to new LinkLabel format
                const legacyLabel = {
                  id: 'legacy-label',
                  text: label,
                  position: 0.5,
                  offset: { x: 0, y: -10 },
                  style: {
                    fontSize: this.theme.typography.fontSize.sm,
                    color: this.theme.colors.text.primary,
                    background: this.theme.colors.background.surface
                  }
                };
                const labelVNode = this.labelRenderer.renderLabel(legacyLabel, link);
                if (labelVNode) {
                  labelVNodes.push(labelVNode);
                }
              }

              return labelVNodes;
            })()
          : []),
        // Phase 2: Link endpoint handles for reconnection
        ...(showHandles
          ? [
              // Source endpoint handle
              {
                type: 'circle',
                key: `link-${link.id}-source-handle`,
                props: {
                  cx: points[0].x,
                  cy: points[0].y,
                  r: 6,
                  fill: link.isSourceEndpointSelected
                    ? this.theme.colors.primary
                    : this.theme.colors.background.surface,
                  stroke: this.theme.colors.primary,
                  strokeWidth: 2,
                  className: 'link-endpoint-handle link-source-handle',
                  style: { cursor: 'move', transition: 'all 0.2s ease' },
                },
              } as VNode,
              // Target endpoint handle
              {
                type: 'circle',
                key: `link-${link.id}-target-handle`,
                props: {
                  cx: lastPoint.x,
                  cy: lastPoint.y,
                  r: 6,
                  fill: link.isTargetEndpointSelected
                    ? this.theme.colors.primary
                    : this.theme.colors.background.surface,
                  stroke: this.theme.colors.primary,
                  strokeWidth: 2,
                  className: 'link-endpoint-handle link-target-handle',
                  style: { cursor: 'move', transition: 'all 0.2s ease' },
                },
              } as VNode,
            ]
          : []),
        // Phase 2.3a: Waypoint handles for interactive editing
        ...(config.enableWaypointEditing && config.showWaypointHandles && isSelected && this.lodAllows('handles', lod)
          ? this.waypointEditor.renderWaypointHandles(link.points, link.id)
          : []),
        // Phase 2.3b: Control point handles for bezier curve editing
        ...(config.enableControlPointEditing && config.showControlPointHandles && isSelected && this.lodAllows('handles', lod) && link.segments && link.segments.length > 0
          ? this.controlPointEditor.renderControlPointHandles(link.segments, link.id)
          : []),
      ],
    };

    // Cache if enabled (use LOD-specific cache key to match the lookup above)
    if (this.config.enableCaching) {
      this.vnodeCache.set(cacheKey, vnode);
      link.markClean();
    }

    return vnode;
  }

  /**
   * Compute node styles for CSS mode
   */
  private computeNodeStylesCSS(node: NodeModel): any {
    const classes = ['diagram-node'];

    if (node.state.selected) classes.push('selected');
    if (node.state.hovered) classes.push('hovered');
    if (!node.state.enabled) classes.push('disabled');
    if (node.state.error) classes.push('error');

    // Phase 1: Add animation classes
    // Use SVG-specific animations if node doesn't use foreignObject
    const useSVGVariant = !this.foreignObjectNodes.has(node.id);
    const animationClasses = this.animationService.getNodeAnimationClass(node, useSVGVariant);
    if (animationClasses) {
      classes.push(animationClasses);
    }

    const finalClassName = classes.join(' ');

    // CRITICAL: Don't apply strokeWidth as inline style if border animation is active
    // Inline styles override CSS animations, breaking animated stroke-width and stroke-dasharray
    const hasActiveBorderAnimation = node.style?.animatedBorder &&
                                     node.style?.borderAnimationType !== 'none';

    return {
      className: finalClassName,
      // Entity-specific overrides (if any)
      ...(node.style.fill && { fill: node.style.fill }),
      // Always apply stroke color (it doesn't interfere with animations)
      ...(node.style.stroke && { stroke: node.style.stroke }),
      // Only apply strokeWidth if no border animation is active
      ...(node.style.strokeWidth !== undefined && !hasActiveBorderAnimation && { strokeWidth: node.style.strokeWidth }),
      // Per-element opacity + corner radius survive in CSS mode too (previously
      // dropped, so translucent/rounded nodes fell back to theme defaults). No
      // `.diagram-node` stylesheet rule sets rx/opacity for normal nodes, so a
      // presentation attribute is enough; emit only when explicitly set so unset
      // props still fall back to theme defaults.
      ...(node.style.opacity !== undefined && { opacity: node.style.opacity }),
      ...(node.style.borderRadius !== undefined && { rx: node.style.borderRadius }),
    };
  }

  /**
   * Compute node styles for programmatic mode
   */
  private computeNodeStylesProgrammatic(node: NodeModel): any {
    // Get state-based colors from theme
    let stateColors = this.theme.colors.node.default;
    if (node.state.selected) {
      stateColors = this.theme.colors.node.selected;
    } else if (node.state.hovered) {
      stateColors = this.theme.colors.node.hovered;
    } else if (!node.state.enabled) {
      stateColors = this.theme.colors.node.disabled;
    } else if (node.state.error) {
      stateColors = this.theme.colors.node.error;
    }

    const themeDefaults = this.theme.nodes.default;

    return {
      fill: node.style.fill || stateColors.fill || themeDefaults.fill,
      stroke: node.style.stroke || stateColors.stroke || themeDefaults.stroke,
      strokeWidth: node.style.strokeWidth ?? themeDefaults.strokeWidth,
      rx: node.style.borderRadius ?? themeDefaults.borderRadius,
      opacity: node.style.opacity ?? (node.state.enabled ? themeDefaults.opacity : this.theme.effects.opacity.disabled),
    };
  }

  /**
   * Compute link styles for CSS mode
   */
  private computeLinkStylesCSS(link: LinkModel): any {
    const classes = ['diagram-link'];

    if (link.state === 'selected') classes.push('selected');
    if (link.state === 'hovered') classes.push('hovered');

    // Phase 1: Add animation classes
    const animationClasses = this.animationService.getEdgeAnimationClass(link);
    if (animationClasses) {
      classes.push(animationClasses);
    }

    // Per-element inline overrides must WIN over the injected `.diagram-link`
    // stylesheet rule (e.g. `.diagram-link { stroke-width }`). A presentation
    // attribute like stroke-width="3" loses to a stylesheet rule, but an inline
    // `style` attribute beats stylesheet rules — so emit per-link strokeWidth,
    // strokeDasharray and opacity inline. Only when explicitly set, so unset
    // props still fall back to the theme CSS defaults.
    const inlineStyle = [
      link.style.strokeWidth !== undefined ? `stroke-width: ${link.style.strokeWidth}` : '',
      link.style.strokeDasharray !== undefined ? `stroke-dasharray: ${link.style.strokeDasharray}` : '',
      link.style.opacity !== undefined ? `opacity: ${link.style.opacity}` : '',
    ].filter(Boolean).join('; ');

    return {
      className: classes.join(' '),
      ...(link.style.stroke && { stroke: link.style.stroke }),
      ...(inlineStyle ? { style: inlineStyle } : {}),
    };
  }

  /**
   * Compute link styles for programmatic mode
   */
  private computeLinkStylesProgrammatic(link: LinkModel): any {
    let stateColor = this.theme.colors.link.default;
    if (link.state === 'selected') {
      stateColor = this.theme.colors.link.selected;
    } else if (link.state === 'hovered') {
      stateColor = this.theme.colors.link.hovered;
    }

    const themeDefaults = this.theme.links.default;

    return {
      stroke: link.style.stroke || stateColor || themeDefaults.stroke,
      strokeWidth: link.style.strokeWidth ?? themeDefaults.strokeWidth,
      strokeDasharray: link.style.strokeDasharray ?? themeDefaults.strokeDasharray,
      opacity: link.style.opacity ?? themeDefaults.opacity,
    };
  }

  /**
   * Generate SVG path data from points and segments
   * Supports both straight lines and bezier curves
   */
  private generatePathData(points: Array<{ x: number; y: number }>, segments?: any[], pathType?: string): string {
    if (points.length === 0) return '';
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

    // If segments exist and contain curve information, use them
    if (segments && segments.length > 0 && segments[0].type === 'curve') {
      const segment = segments[0];
      let path = `M ${segment.from.x} ${segment.from.y}`;

      // Use cubic bezier curve (C command)
      if (segment.control1 && segment.control2) {
        path += ` C ${segment.control1.x} ${segment.control1.y}, ${segment.control2.x} ${segment.control2.y}, ${segment.to.x} ${segment.to.y}`;
      } else {
        // Fallback to line if no control points
        path += ` L ${segment.to.x} ${segment.to.y}`;
      }

      return path;
    }

    // For orthogonal paths, use rounded corners (React Flow smoothstep style)
    if (pathType === 'orthogonal') {
      return this.convertOrthogonalPathWithBends(points, 5);
    }

    // Smooth/bezier with manual waypoints: keep the curved identity
    if ((pathType === 'smooth' || pathType === 'bezier') && points.length > 2) {
      return this.catmullRomPath(points);
    }

    // Default: straight lines between points
    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      path += ` L ${points[i].x} ${points[i].y}`;
    }
    return path;
  }

  /**
   * Get visible links (only if both endpoints are visible)
   */
  private getVisibleLinks(diagram: any, viewport: Rectangle): LinkModel[] {
    const visibleNodes = new Set(diagram.getVisibleNodes(viewport).map((n: NodeModel) => n.id));
    const allLinks = diagram.getLinks();

    return allLinks.filter((link: LinkModel) => {
      // Check if both source and target nodes are visible
      const sourceNode = this.getNodeForPort(link.sourcePortId);
      const targetNode = this.getNodeForPort(link.targetPortId);

      return (
        sourceNode &&
        targetNode &&
        visibleNodes.has(sourceNode.id) &&
        visibleNodes.has(targetNode.id)
      );
    });
  }

  /**
   * Get node that owns a port.
   * Uses the diagram's O(1) portIndex instead of an O(nodes×ports) scan —
   * this runs once per link per frame inside getVisibleLinks().
   */
  private getNodeForPort(portId: string): NodeModel | undefined {
    const diagram = this.engine.getDiagram();
    if (!diagram) return undefined;
    return diagram.getNodeByPortId(portId);
  }

  /**
   * Create empty diagram VNode
   */
  private createEmptyDiagram(viewport: Rectangle): VNode {
    return {
      type: 'svg',
      key: 'diagram-root',
      props: {
        width: viewport.width,
        height: viewport.height,
        className: 'grafloria-diagram',
      },
      children: [
        {
          type: 'g',
          key: 'links-layer',
          props: { className: 'links-layer' },
          children: [],
        },
        {
          type: 'g',
          key: 'nodes-layer',
          props: { className: 'nodes-layer' },
          children: [],
        },
      ],
    };
  }

  /**
   * Inject theme CSS into document
   */
  private injectThemeCSS(): void {
    const styleId = `grafloria-renderer-theme-${this.theme.name}`;

    // Remove old style element (from this instance)
    if (this.styleElement) {
      this.styleElement.remove();
      this.styleElement = undefined;
    }

    // Remove any existing style element with the same ID from DOM
    const existingStyle = document.getElementById(styleId);
    if (existingStyle) {
      existingStyle.remove();
    }

    // Create new style element
    this.styleElement = document.createElement('style');
    this.styleElement.id = styleId;

    // Generate CSS content (including animations)
    this.styleElement.textContent = this.generateThemeCSS() + '\n\n' + this.generateAnimationCSS();

    // Append to document
    document.head.appendChild(this.styleElement);
  }

  /**
   * Generate theme CSS
   */
  private generateThemeCSS(): string {
    const t = this.theme;
    return `
/* Grafloria Renderer Theme: ${t.name} */

/* Node Styles */
.diagram-node {
  fill: ${t.colors.node.default.fill};
  stroke: ${t.colors.node.default.stroke};
  stroke-width: ${t.nodes.default.strokeWidth}px;
}

.diagram-node.selected {
  fill: ${t.colors.node.selected.fill};
  stroke: ${t.colors.node.selected.stroke};
  stroke-width: 2px;
}

.diagram-node.hovered {
  fill: ${t.colors.node.hovered.fill};
  stroke: ${t.colors.node.hovered.stroke};
}

.diagram-node.disabled {
  fill: ${t.colors.node.disabled.fill};
  stroke: ${t.colors.node.disabled.stroke};
  opacity: ${t.effects.opacity.disabled};
}

.diagram-node.error {
  fill: ${t.colors.node.error.fill};
  stroke: ${t.colors.node.error.stroke};
}

/* Link Styles */
.diagram-link {
  stroke: ${t.colors.link.default};
  stroke-width: ${t.links.default.strokeWidth}px;
  fill: none;
}

.diagram-link.selected {
  stroke: ${t.colors.link.selected};
  stroke-width: 3px;
}

.diagram-link.hovered {
  stroke: ${t.colors.link.hovered};
}

/* Label Styles */
.diagram-label {
  font-family: ${t.typography.fontFamily.default};
  font-size: ${t.typography.fontSize.md}px;
  fill: ${t.colors.text.primary};
}

/* Link Path - Disable transitions for performance and visual correctness */
.link-group path {
  transition: none !important;
}

/* Phase 2: Port Styles */
.port {
  transition: all 0.2s ease;
  cursor: crosshair;
}

.port-input {
  fill: ${t.colors.background.surface};
  stroke: ${t.colors.port.input};
  stroke-width: ${t.ports.strokeWidth}px;
}

.port-output {
  fill: ${t.colors.background.surface};
  stroke: ${t.colors.port.output};
  stroke-width: ${t.ports.strokeWidth}px;
}

.port-bi {
  fill: ${t.colors.background.surface};
  stroke: ${t.colors.port.bi};
  stroke-width: ${t.ports.strokeWidth}px;
}

.port-hovered {
  stroke-width: 3px;
  cursor: pointer;
}

.port-highlighted {
  stroke-width: 3px;
  opacity: 1;
}

.port-input.port-highlighted {
  fill: ${t.colors.port.input};
}

.port-output.port-highlighted {
  fill: ${t.colors.port.output};
}

.port-bi.port-highlighted {
  fill: ${t.colors.port.bi};
}

/* Phase 2: Connection Preview Styles */
.connection-preview-line {
  pointer-events: none;
  transition: stroke 0.2s ease;
}

@keyframes dash {
  to {
    stroke-dashoffset: -10;
  }
}

/* Phase 2: Connection Target Highlight */
.connection-target-highlight {
  transition: all 0.2s ease;
  pointer-events: none;
}

/* Phase 2: Link Endpoint Handles */
.link-endpoint-handle {
  cursor: move;
  transition: all 0.2s ease;
}

.link-endpoint-handle:hover {
  r: 8;
  stroke-width: 3px;
}

/* Phase 2.3a: Waypoint Handles */
.waypoint-handle {
  cursor: move;
  transition: all 0.2s ease;
  pointer-events: all;
}

.waypoint-handle:hover {
  r: 7;
  stroke-width: 3px;
}

/* Phase 2.3b: Control Point Handles */
.control-point-handle {
  cursor: move;
  transition: all 0.2s ease;
  pointer-events: all;
}

.control-point-handle:hover {
  r: 8;
  stroke-width: 3px;
}

.control-line {
  pointer-events: none;
  transition: opacity 0.2s ease;
}
    `.trim();
  }

  /**
   * Generate animation CSS
   * Phase 1: Includes edge animations, node border animations, and status animations
   */
  private generateAnimationCSS(): string {
    return `
/* Phase 1: Diagram Animations */

/* Edge Animations - Marching Ants */
@keyframes marching-ants {
  to { stroke-dashoffset: -20; }
}

.link-animated-marching-ants {
  stroke-dasharray: 5, 5;
  animation: marching-ants 1s linear infinite;
  will-change: stroke-dashoffset;
}

.link-animated-marching-ants.link-speed-slow {
  animation-duration: 2s;
}

.link-animated-marching-ants.link-speed-fast {
  animation-duration: 0.5s;
}

.link-animated-marching-ants.link-direction-reverse {
  animation-direction: reverse;
}

/* Edge Animations - Flow Dots */
@keyframes flow-dots {
  to { stroke-dashoffset: 10; }
}

.link-animated-flow {
  stroke-dasharray: 1, 9;
  animation: flow-dots 1s linear infinite;
  will-change: stroke-dashoffset;
}

.link-animated-flow.link-speed-slow {
  animation-duration: 2s;
}

.link-animated-flow.link-speed-fast {
  animation-duration: 0.5s;
}

.link-animated-flow.link-direction-reverse {
  animation-direction: reverse;
}

/* Edge Animations - Pulse */
@keyframes link-pulse {
  0%, 100% {
    opacity: 1;
    stroke-width: inherit;
  }
  50% {
    opacity: 0.6;
    stroke-width: calc(var(--link-stroke-width, 2px) * 1.5);
  }
}

.link-animated-pulse {
  animation: link-pulse 2s ease-in-out infinite;
  will-change: opacity, stroke-width;
}

.link-animated-pulse.link-speed-slow {
  animation-duration: 3s;
}

.link-animated-pulse.link-speed-fast {
  animation-duration: 1s;
}

/* Node Border Animations - Gradient */
@keyframes gradient-border {
  0% { background-position: 0% center; }
  100% { background-position: 200% center; }
}

.node-border-gradient {
  position: relative;
  background: white;
}

.node-border-gradient::before {
  content: '';
  position: absolute;
  inset: -2px;
  border-radius: inherit;
  background: linear-gradient(90deg, #667eea 0%, #764ba2 25%, #667eea 50%, #764ba2 75%, #667eea 100%);
  background-size: 200% 100%;
  animation: gradient-border 3s linear infinite;
  z-index: -1;
  will-change: background-position;
}

/* Node Border Animations - Pulse Glow */
@keyframes pulse-glow {
  0%, 100% { box-shadow: 0 0 0 0 rgba(102, 126, 234, 0.7); }
  50% { box-shadow: 0 0 0 10px rgba(102, 126, 234, 0); }
}

.node-border-pulse {
  animation: pulse-glow 2s ease-in-out infinite;
  will-change: box-shadow;
}

/* Node Border Animations - Breathe */
@keyframes breathe {
  0%, 100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.05);
    opacity: 0.9;
  }
}

.node-border-breathe {
  animation: breathe 3s ease-in-out infinite;
  transform-origin: center center;
  will-change: transform, opacity;
}

/* Node Border Animations - Shimmer */
@keyframes shimmer {
  0% { background-position: -100% 0; }
  100% { background-position: 200% 0; }
}

.node-border-shimmer::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.5) 50%, transparent 100%);
  background-size: 50% 100%;
  animation: shimmer 2s infinite;
  pointer-events: none;
  will-change: background-position;
}

/* Status Animations - Running */
@keyframes status-running {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(52, 152, 219, 0.7);
    border-color: #3498db;
  }
  50% {
    box-shadow: 0 0 0 10px rgba(52, 152, 219, 0);
    border-color: #5dade2;
  }
}

.node-status-running {
  animation: status-running 1.5s ease-in-out infinite;
  will-change: box-shadow, border-color;
}

/* Status Animations - Error (Shake) */
@keyframes status-error {
  0%, 100% { transform: translateX(0); }
  10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
  20%, 40%, 60%, 80% { transform: translateX(5px); }
}

.node-status-error {
  animation: status-error 0.5s ease-in-out;
  border-color: #e74c3c;
  box-shadow: 0 0 10px rgba(231, 76, 60, 0.5);
  will-change: transform;
}

/* Status Animations - Completed */
@keyframes status-completed {
  from {
    opacity: 0;
    transform: scale(0.8);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.node-status-completed {
  animation: status-completed 0.5s ease-out;
  border-color: #27ae60;
  opacity: 0.8;
  will-change: transform, opacity;
}

/* Status Animations - Warning (Flash) */
@keyframes status-warning {
  0%, 100% { background-color: transparent; }
  50% { background-color: rgba(243, 156, 18, 0.2); }
}

.node-status-warning {
  animation: status-warning 1s ease-in-out 3;
  border-color: #f39c12;
  will-change: background-color;
}

/* Status Animations - Pending (Pulse) */
@keyframes status-pending {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

.node-status-pending {
  animation: status-pending 2s ease-in-out infinite;
  will-change: opacity;
}

/* Reduced Motion Support */
@media (prefers-reduced-motion: reduce) {
  .link-animated-marching-ants,
  .link-animated-flow,
  .link-animated-pulse,
  .node-border-gradient,
  .node-border-pulse,
  .node-border-breathe,
  .node-border-shimmer,
  .node-status-running,
  .node-status-error,
  .node-status-completed,
  .node-status-warning,
  .node-status-pending {
    animation: none !important;
  }
}

/* Animations Disabled */
.animations-disabled,
.animations-disabled * {
  animation: none !important;
  transition: none !important;
}

/* Performance Optimizations */
.link-animated-marching-ants,
.link-animated-flow,
.link-animated-pulse,
.node-border-gradient,
.node-border-pulse,
.node-border-breathe,
.node-border-shimmer {
  -webkit-backface-visibility: hidden;
  backface-visibility: hidden;
  -webkit-perspective: 1000px;
  perspective: 1000px;
}
    `.trim();
  }

  /**
   * Subscribe to engine events
   */
  private subscribeToEngineEvents(): void {
    const diagram = this.engine.getDiagram();
    if (!diagram) return;

    // Listen for entity changes to invalidate cache
    diagram.on('node:added', () => this.vnodeCache.clear());
    diagram.on('node:removed', () => this.vnodeCache.clear());
    diagram.on('link:added', () => this.vnodeCache.clear());
    diagram.on('link:removed', () => this.vnodeCache.clear());

    // Listen for interaction config changes (port visibility, etc.)
    this.engine.eventBus.on('config:interaction-changed', () => {
      this.vnodeCache.clear();
      // Mark all nodes dirty to ensure re-render with new config
      if (diagram) {
        diagram.getNodes().forEach(node => node.markDirty('config-changed'));
      }
    });
  }

  /**
   * Start FPS tracking
   */
  private startFPSTracking(): void {
    this.renderTimestamp = performance.now();
    setInterval(() => {
      const now = performance.now();
      const elapsed = (now - this.renderTimestamp) / 1000;
      this.fps = Math.round(this.frameCount / elapsed);
      this.frameCount = 0;
      this.renderTimestamp = now;
    }, 1000);
  }

  /**
   * Estimate memory usage
   */
  private estimateMemoryUsage(): number {
    // Rough estimate: cache size * average VNode size
    const avgVNodeSize = 1024; // bytes
    return this.vnodeCache.size * avgVNodeSize;
  }

  /**
   * Calculate intersection point between a line segment and a rectangle
   * Used to position arrows at node boundaries instead of port centers
   */
  private calculateLineRectIntersection(
    lineStart: { x: number; y: number },
    lineEnd: { x: number; y: number },
    rect: { left: number; top: number; right: number; bottom: number; width: number; height: number }
  ): { x: number; y: number } | null {
    // Line direction vector
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;

    // Rectangle boundaries (BoundingBox uses left/top/right/bottom)
    const rectLeft = rect.left;
    const rectRight = rect.right;
    const rectTop = rect.top;
    const rectBottom = rect.bottom;

    // Check intersection with each edge of the rectangle
    const intersections: Array<{ x: number; y: number; distance: number }> = [];

    // Helper to check if point is on line segment
    const isOnSegment = (px: number, py: number): boolean => {
      const minX = Math.min(lineStart.x, lineEnd.x);
      const maxX = Math.max(lineStart.x, lineEnd.x);
      const minY = Math.min(lineStart.y, lineEnd.y);
      const maxY = Math.max(lineStart.y, lineEnd.y);
      return px >= minX && px <= maxX && py >= minY && py <= maxY;
    };

    // Check left edge (x = rectLeft)
    if (dx !== 0) {
      const t = (rectLeft - lineStart.x) / dx;
      const y = lineStart.y + t * dy;
      if (t >= 0 && t <= 1 && y >= rectTop && y <= rectBottom) {
        const dist = Math.sqrt((rectLeft - lineEnd.x) ** 2 + (y - lineEnd.y) ** 2);
        intersections.push({ x: rectLeft, y, distance: dist });
      }
    }

    // Check right edge (x = rectRight)
    if (dx !== 0) {
      const t = (rectRight - lineStart.x) / dx;
      const y = lineStart.y + t * dy;
      if (t >= 0 && t <= 1 && y >= rectTop && y <= rectBottom) {
        const dist = Math.sqrt((rectRight - lineEnd.x) ** 2 + (y - lineEnd.y) ** 2);
        intersections.push({ x: rectRight, y, distance: dist });
      }
    }

    // Check top edge (y = rectTop)
    if (dy !== 0) {
      const t = (rectTop - lineStart.y) / dy;
      const x = lineStart.x + t * dx;
      if (t >= 0 && t <= 1 && x >= rectLeft && x <= rectRight) {
        const dist = Math.sqrt((x - lineEnd.x) ** 2 + (rectTop - lineEnd.y) ** 2);
        intersections.push({ x, y: rectTop, distance: dist });
      }
    }

    // Check bottom edge (y = rectBottom)
    if (dy !== 0) {
      const t = (rectBottom - lineStart.y) / dy;
      const x = lineStart.x + t * dx;
      if (t >= 0 && t <= 1 && x >= rectLeft && x <= rectRight) {
        const dist = Math.sqrt((x - lineEnd.x) ** 2 + (rectBottom - lineEnd.y) ** 2);
        intersections.push({ x, y: rectBottom, distance: dist });
      }
    }

    // Return the intersection closest to lineEnd (the target point)
    if (intersections.length > 0) {
      intersections.sort((a, b) => a.distance - b.distance);
      return { x: intersections[0].x, y: intersections[0].y };
    }

    return null;
  }

  /**
   * Calculate the tangent angle at the end of a bezier curve
   * For a cubic bezier curve, the tangent at t=1 (endpoint) is determined by
   * the direction from the second control point (cp2) to the endpoint
   *
   * @param cp2 Second control point of the bezier curve
   * @param endpoint End point of the bezier curve
   * @returns Angle in degrees
   */
  private calculateBezierEndTangent(
    cp2: { x: number; y: number },
    endpoint: { x: number; y: number }
  ): number {
    const dx = endpoint.x - cp2.x;
    const dy = endpoint.y - cp2.y;
    return Math.atan2(dy, dx) * (180 / Math.PI);
  }

  /**
   * Get perpendicular angle from port side
   * Used for orthogonal routing to ensure arrows are perpendicular to node edges
   *
   * @param portSide Port side ('left' | 'right' | 'top' | 'bottom')
   * @returns Angle in degrees pointing away from the node
   */
  private getPerpendicularAngleFromPortSide(portSide: 'left' | 'right' | 'top' | 'bottom'): number {
    switch (portSide) {
      case 'left':
        return 180; // Arrow points left
      case 'right':
        return 0;   // Arrow points right
      case 'top':
        return -90; // Arrow points up
      case 'bottom':
        return 90;  // Arrow points down
    }
  }

  /**
   * Calculate arrow direction based on routing algorithm and path geometry
   * Implements research-based best practices for each algorithm type
   *
   * @param algorithm Routing algorithm used
   * @param pathType Path type (bezier, smooth, straight, etc.)
   * @param points Path points
   * @param portSide Port side for orthogonal routing (optional)
   * @returns Angle in degrees
   */
  private calculateArrowDirection(
    algorithm: 'straight' | 'orthogonal' | 'elk' | 'a-star' | 'dijkstra' | 'visibility-graph' | 'custom',
    pathType: string,
    points: Array<{ x: number; y: number }>,
    portSide?: 'left' | 'right' | 'top' | 'bottom'
  ): number {
    // Handle bezier/smooth paths - calculate tangent from bezier control point
    // For 2-point bezier, the control point cp2 determines the tangent at the endpoint
    if (pathType === 'bezier' || pathType === 'smooth') {
      if (points.length === 2) {
        // For 2-point bezier/smooth, use port side to determine arrow direction
        // This ensures the arrow points in the correct direction based on the port's orientation
        if (portSide) {
          // getPerpendicularAngleFromPortSide returns angle pointing OUT from port
          // But arrows need to point INTO the port, so reverse by adding 180°
          const outwardAngle = this.getPerpendicularAngleFromPortSide(portSide);
          return (outwardAngle + 180) % 360;
        }

        // Fallback: Calculate control point cp2 (same logic as convertRoutedPathToSVG at line 819-828)
        const dx = points[1].x - points[0].x;
        const dy = points[1].y - points[0].y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const controlDistance = Math.min(distance / 2, 100);

        // cp2 is controlDistance pixels to the left of the endpoint (horizontal approach)
        const cp2x = points[1].x - controlDistance;
        const cp2y = points[1].y;

        // Calculate tangent from cp2 to endpoint
        const tangentDx = points[1].x - cp2x;
        const tangentDy = points[1].y - cp2y;
        return Math.atan2(tangentDy, tangentDx) * (180 / Math.PI);
      } else if (points.length > 2) {
        // Multiple points: use last segment
        const lastPoint = points[points.length - 1];
        const secondLastPoint = points[points.length - 2];
        const dx = lastPoint.x - secondLastPoint.x;
        const dy = lastPoint.y - secondLastPoint.y;
        return Math.atan2(dy, dx) * (180 / Math.PI);
      }
    }

    // For orthogonal and all other algorithms (straight, a-star, dijkstra, visibility-graph, custom):
    // Use last segment direction for accurate arrow pointing
    // CRITICAL FIX: Orthogonal arrows must follow the actual path direction, not the port side
    // This ensures arrows point in the direction the path is traveling when it reaches the port
    if (points.length >= 2) {
      const lastPoint = points[points.length - 1];
      const secondLastPoint = points[points.length - 2];
      const dx = lastPoint.x - secondLastPoint.x;
      const dy = lastPoint.y - secondLastPoint.y;
      return Math.atan2(dy, dx) * (180 / Math.PI);
    }

    // Fallback: pointing right
    return 0;
  }

  /**
   * Calculate arrow position and angle for a link endpoint
   * Handles both source and target ends with algorithm-aware direction calculation
   *
   * @param link Link model
   * @param points Path points
   * @param isTarget True for target end, false for source end
   * @param arrowLength Length of arrow in pixels
   * @returns Object with position and angle
   */
  private calculateArrowPositionAndAngle(
    link: LinkModel,
    points: Array<{ x: number; y: number }>,
    isTarget: boolean,
    arrowLength: number
  ): { position: { x: number; y: number }; angle: number } {
    // Get the relevant port and its side. Resolve the node by cached id when
    // available, otherwise by searching for the port's owner — links built via
    // `new LinkModel()` may not carry node ids, and without the side the
    // bezier arrow falls into a horizontal-only fallback (arrows on top/bottom
    // ports rendered sideways).
    const diagram = this.engine.getDiagram();
    let portSide: 'left' | 'right' | 'top' | 'bottom' | undefined;

    // Smart connection points override the assigned port for this frame
    const smart = this.frameSmartSides.get(link.id);
    if (smart) {
      portSide = isTarget ? smart.target : smart.source;
    } else if (diagram) {
      const portId = isTarget ? link.targetPortId : link.sourcePortId;
      const nodeId = isTarget ? link.targetNodeId : link.sourceNodeId;
      if (portId) {
        let node = nodeId ? diagram.getNode(nodeId) : null;
        if (!node) {
          node = diagram.getNodes().find((n: NodeModel) => !!n.getPort(portId)) || null;
        }
        const port = node?.getPort(portId);
        if (port) {
          portSide = port.alignment.side;
        }
      }
    }

    // Map path type to algorithm
    const algorithm = this.mapPathTypeToAlgorithm(link.pathType);

    // Calculate arrow direction based on algorithm
    let pointsToUse = points;
    if (!isTarget) {
      // For source end, reverse the points to get the correct direction
      pointsToUse = [...points].reverse();
    }

    const angle = this.calculateArrowDirection(
      algorithm,
      link.pathType,
      pointsToUse,
      portSide
    );

    // Calculate arrow position
    // Arrow polygon: '0,-5 10,0 0,5' (tip at x=10, base at x=0)
    // We want the tip to show at the port center
    //
    // Key insight: The arrow should extend OUTWARD from the node
    // - For smooth/bezier/straight: position arrow base outside node boundary
    // - For orthogonal: path endpoint is already offset, use it directly

    // Safety check: ensure points array is valid
    if (!points || points.length === 0) {
      console.warn(`Cannot calculate arrow position: points array is empty for link ${link.id}`);
      return { position: { x: 0, y: 0 }, angle: 0 };
    }

    const pathEndpoint = isTarget ? points[points.length - 1] : points[0];
    const angleRad = angle * (Math.PI / 180);

    // Strategy: Position the arrow TIP at the port center
    // The arrow base will be arrowLength away in the opposite direction
    // This means the base is at: port - arrowLength * direction
    // Since the arrow points in 'angle' direction, base is at angle + 180°

    const position = {
      x: pathEndpoint.x + arrowLength * Math.cos(angleRad + Math.PI),
      y: pathEndpoint.y + arrowLength * Math.sin(angleRad + Math.PI)
    };

    return { position, angle };
  }

  /**
   * HIGH-PERFORMANCE: Create simple orthogonal segment between two points
   * Uses 3-point path: start -> corner -> end
   * Much faster than calling routing engine
   */
  private createOrthogonalSegment(
    start: { x: number; y: number },
    end: { x: number; y: number }
  ): Array<{ x: number; y: number }> {
    const dx = Math.abs(end.x - start.x);
    const dy = Math.abs(end.y - start.y);

    // If points are already aligned horizontally or vertically, use direct path
    if (dx === 0 || dy === 0) {
      return [start, end];
    }

    // Create L-shape: start -> corner -> end
    // Choose corner based on which direction is dominant
    if (dx > dy) {
      // Horizontal-first: go horizontal then vertical
      return [
        start,
        { x: end.x, y: start.y },  // Corner: horizontal from start
        end
      ];
    } else {
      // Vertical-first: go vertical then horizontal
      return [
        start,
        { x: start.x, y: end.y },  // Corner: vertical from start
        end
      ];
    }
  }

  /**
   * Build the link path from its polyline with jump geometry inserted.
   *
   * Works on the SAME point array the detector indexed (never re-parses the
   * rendered path string, whose rounded corners would shift segment indices).
   * Cuts ±size/2 around each crossing so the rendered jump is exactly `size`
   * wide, merges overlapping cuts, keeps cuts clear of corner bends, and uses
   * a constant sweep so every arc on a link bulges to the same side of travel.
   */
  private buildPathWithJumps(
    points: Array<{ x: number; y: number }>,
    intersections: Array<{ t1: number; segmentIndex?: number }>,
    config: { size?: number; style?: 'arc' | 'gap' | 'bridge' },
    pathType: string,
    startReserve = 0,
    endReserve = 0
  ): string {
    const size = config.size ?? 10;
    const style = config.style ?? 'arc';
    const half = size / 2;
    const useBends = pathType === 'orthogonal' || pathType === 'smooth' || pathType === 'bezier';
    const cornerRadius = pathType === 'orthogonal' ? 5 : 12;
    const n = points.length;
    const fmt = (v: number) => +v.toFixed(3);
    let d = `M ${fmt(points[0].x)} ${fmt(points[0].y)}`;

    for (let i = 0; i < n - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const segLen = Math.hypot(b.x - a.x, b.y - a.y);
      if (segLen < 1e-6) continue;
      const ux = (b.x - a.x) / segLen;
      const uy = (b.y - a.y) / segLen;

      // Rounded bends consume the ends of interior segments
      let bendPrev = 0;
      let bendNext = 0;
      if (useBends) {
        if (i > 0) bendPrev = Math.min(this.distance(points[i - 1], a) / 2, segLen / 2, cornerRadius);
        if (i < n - 2) bendNext = Math.min(segLen / 2, this.distance(b, points[i + 2]) / 2, cornerRadius);
      }

      // Legal cut window on this segment: clear of the corner bends, and of
      // the arrow markers on the terminal segments
      const lo = bendPrev + 1 + (i === 0 ? startReserve : 0);
      const hi = segLen - bendNext - 1 - (i === n - 2 ? endReserve : 0);
      const merged: Array<{ s: number; e: number }> = [];
      const cuts = intersections
        .filter(it => (it.segmentIndex ?? 0) === i && it.t1 > 0 && it.t1 < 1)
        .map(it => ({ s: it.t1 * segLen - half, e: it.t1 * segLen + half }))
        .sort((p, q) => p.s - q.s);
      for (const c of cuts) {
        // Shift the cut into the legal window instead of dropping it — a
        // crossing right next to a bend or an arrowhead still gets its jump,
        // just nudged along the segment
        if (hi - lo < 3) continue; // genuinely no room on this segment
        const width = Math.min(c.e - c.s, hi - lo);
        const s = Math.max(lo, Math.min(c.s, hi - width));
        const e = s + width;
        const last = merged[merged.length - 1];
        if (last && s <= last.e) {
          last.e = Math.max(last.e, e);
        } else {
          merged.push({ s, e });
        }
      }

      const at = (dist: number) => ({ x: fmt(a.x + ux * dist), y: fmt(a.y + uy * dist) });

      for (const c of merged) {
        const p1 = at(c.s);
        const p2 = at(c.e);
        d += ` L ${p1.x} ${p1.y}`;
        if (style === 'gap') {
          d += ` M ${p2.x} ${p2.y}`;
        } else if (style === 'bridge') {
          // Rise perpendicular to the left of travel (screen-up when moving right)
          const px = uy;
          const py = -ux;
          const h = size / 2;
          d += ` L ${fmt(p1.x + px * h)} ${fmt(p1.y + py * h)}`;
          d += ` L ${fmt(p2.x + px * h)} ${fmt(p2.y + py * h)}`;
          d += ` L ${p2.x} ${p2.y}`;
        } else {
          const r = fmt((c.e - c.s) / 2);
          d += ` A ${r} ${r} 0 0 1 ${p2.x} ${p2.y}`;
        }
      }

      if (i < n - 2 && useBends && bendNext > 0) {
        const before = at(segLen - bendNext);
        const next = points[i + 2];
        const outLen = Math.hypot(next.x - b.x, next.y - b.y) || 1;
        const after = {
          x: fmt(b.x + ((next.x - b.x) / outLen) * bendNext),
          y: fmt(b.y + ((next.y - b.y) / outLen) * bendNext),
        };
        d += ` L ${before.x} ${before.y} Q ${fmt(b.x)} ${fmt(b.y)} ${after.x} ${after.y}`;
      } else {
        d += ` L ${fmt(b.x)} ${fmt(b.y)}`;
      }
    }

    return d;
  }

  /**
   * Manual waypoints are an explicit editor action (flagged via metadata by the
   * interaction layer), never inferred from point count — auto-routed
   * orthogonal paths also have >2 points.
   */
  private linkHasManualWaypoints(link: LinkModel): boolean {
    return link.getMetadata('hasManualWaypoints') === true &&
      !!link.points && link.points.length > 2;
  }

  /**
   * Keep link.points in sync with the rendered route on every frame so hit
   * testing and jump-point detection see current geometry. Direct assignment
   * (no setPoints) to avoid emitting link:changed and re-render loops.
   */
  private syncLinkPoints(link: LinkModel, points: Array<{ x: number; y: number }>): void {
    link.points = points.map(p => ({ ...p }));
  }

  /**
   * Compute the auto route for a link.
   *
   * pathType determines the base routing algorithm ('orthogonal' → orthogonal
   * router; direct/smooth/bezier → straight router). If a straight route would
   * cross the link's own nodes (inverted geometry) or any obstacle, it falls
   * back to the orthogonal router, which respects port directions and A*
   * obstacle avoidance — links must never run through node bodies.
   */
  private computeAutoRoute(
    link: LinkModel,
    endpoints: NonNullable<ReturnType<SVGRenderer['getLinkEndpoints']>>
  ): RoutedPath | null {
    const routingEngine = this.engine.getRoutingEngine();
    const algorithm = this.mapPathTypeToAlgorithm(link.pathType) || routingEngine.getDefaultAlgorithm();

    // Collect obstacle rects (all nodes except source and target)
    const currentDiagram = this.engine.getDiagram();
    const sourceNodeId = (link as any).sourceNodeId || (link as any).source;
    const targetNodeId = (link as any).targetNodeId || (link as any).target;
    const allNodes: NodeModel[] = currentDiagram ? currentDiagram.getNodes() : [];
    const obstacles = allNodes
      .filter((node: NodeModel) => node.id !== sourceNodeId && node.id !== targetNodeId)
      .map((node: NodeModel) => ({
        id: node.id,
        x: node.position.x,
        y: node.position.y,
        width: node.size.width,
        height: node.size.height,
      }));

    let usedOrthogonal = algorithm === 'orthogonal';
    const routeWith = (algo: RoutingAlgorithm, avoid: boolean): RoutedPath | null =>
      routingEngine.route({
        start: endpoints.start,
        end: endpoints.end,
        sourceDirection: endpoints.sourceDirection,
        targetDirection: endpoints.targetDirection,
        obstacles,
        options: { algorithm: algo, avoidObstacles: avoid, gridSize: 10 },
      });

    let routedPath = routeWith(algorithm, true);

    // The straight router ignores obstacles AND the link's own nodes. If its
    // path cuts through any node body, reroute orthogonally instead.
    if (routedPath && algorithm === 'straight' && this.routeCrossesNodes(routedPath.points, link, allNodes)) {
      const detour = routeWith('orthogonal', true) || routeWith('orthogonal', false);
      if (detour) {
        routedPath = detour;
        usedOrthogonal = true;
      }
    }

    // Fallback: simple orthogonal routing
    if (!routedPath) {
      routedPath = routeWith('orthogonal', false);
      usedOrthogonal = !!routedPath;
    }

    // The engine's router can emit slanted port stubs (grid-snapped elbows vs
    // off-grid ports), diagonal middle segments and out-and-back retraces —
    // rectify so an orthogonal route is actually orthogonal.
    if (routedPath && usedOrthogonal) {
      routedPath = { ...routedPath, points: this.rectifyOrthogonalRoute(routedPath.points) };
    }

    // Last line of defence: a link must never run through its OWN nodes. If
    // the chosen route still does (routers exclude the endpoints' nodes from
    // their obstacle sets), retry with those nodes INCLUDED as obstacles and
    // keep whichever route penetrates less. When the two node bodies overlap
    // each other, some penetration is geometrically unavoidable — this keeps
    // it minimal instead of slashing straight through.
    const ownNodes = allNodes.filter(
      (n: NodeModel) => n.id === sourceNodeId || n.id === targetNodeId
    );
    if (routedPath && ownNodes.length > 0) {
      let bestPen = this.penetrationLength(routedPath.points, ownNodes);
      if (bestPen > 0) {
        const allObstacles = allNodes.map((n: NodeModel) => ({
          id: n.id, x: n.position.x, y: n.position.y, width: n.size.width, height: n.size.height,
        }));

        const consider = (candidate: RoutedPath | null) => {
          if (!candidate) return;
          const rectified = { ...candidate, points: this.rectifyOrthogonalRoute(candidate.points) };
          const pen = this.penetrationLength(rectified.points, ownNodes);
          if (pen < bestPen) {
            bestPen = pen;
            routedPath = rectified;
          }
        };

        // Candidate 1: same ports, but the own nodes count as obstacles too
        consider(routingEngine.route({
          start: endpoints.start,
          end: endpoints.end,
          sourceDirection: endpoints.sourceDirection,
          targetDirection: endpoints.targetDirection,
          obstacles: allObstacles,
          options: { algorithm: 'orthogonal', avoidObstacles: true, gridSize: 10 },
        }));

        // Candidate 2 (overlapping bodies): escape each buried port by the
        // SHORTEST way out of whatever body covers it — often perpendicular
        // to the port side — then route between the escape points
        if (bestPen > 0) {
          const exitS = this.shortestEscape(endpoints.start, ownNodes);
          const exitT = this.shortestEscape(endpoints.end, ownNodes);
          const mid = routingEngine.route({
            start: exitS,
            end: exitT,
            obstacles: allObstacles,
            options: { algorithm: 'orthogonal', avoidObstacles: true, gridSize: 10 },
          });
          const midPts = mid?.points?.length ? mid.points : [exitS, exitT];
          consider({
            ...(mid ?? routedPath!),
            points: [endpoints.start, exitS, ...midPts, exitT, endpoints.end],
          });
        }
      }
    }

    return routedPath;
  }

  /**
   * Shortest way OUT of whatever node bodies cover the point (used when a
   * port is buried inside the peer node because the two bodies overlap).
   * Marches the four axis rays and returns the nearest point that is outside
   * every covering body, with a small clearance.
   */
  private shortestEscape(
    point: { x: number; y: number },
    nodes: NodeModel[]
  ): { x: number; y: number } {
    const inset = 1;
    const rects = nodes.map(n => ({
      minX: n.position.x + inset, minY: n.position.y + inset,
      maxX: n.position.x + n.size.width - inset, maxY: n.position.y + n.size.height - inset,
    }));
    const covered = (p: { x: number; y: number }) =>
      rects.some(r => p.x > r.minX && p.x < r.maxX && p.y > r.minY && p.y < r.maxY);
    if (!covered(point)) return { ...point };

    const CLEAR = 4;
    let best: { x: number; y: number } | null = null;
    let bestDist = Infinity;
    for (const [ux, uy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      for (let d = 2; d <= 600; d += 2) {
        const p = { x: point.x + ux * d, y: point.y + uy * d };
        if (!covered(p)) {
          const dist = d + CLEAR;
          if (dist < bestDist) {
            bestDist = dist;
            best = { x: point.x + ux * dist, y: point.y + uy * dist };
          }
          break;
        }
      }
    }
    return best ?? { ...point };
  }

  // Smart-connection side overrides for the current frame (visual only)
  private frameSmartSides = new Map<string, { source: 'left' | 'right' | 'top' | 'bottom'; target: 'left' | 'right' | 'top' | 'bottom' }>();

  /**
   * Point on the node's VISIBLE outline for a floating smart attachment:
   * the given side at the given cross-axis coordinate (world). Rects use the
   * bounding-box edge; ellipse/circle project analytically and hexagon/diamond
   * intersect the outline polygon, so the line never hovers off the drawn shape.
   */
  private shapeEdgePoint(
    node: NodeModel,
    rect: { x: number; y: number; w: number; h: number },
    side: 'left' | 'right' | 'top' | 'bottom',
    cross: number
  ): { x: number; y: number } {
    const type = (node.getMetadata('shape') || { type: 'rect' }).type;

    // Ask the shape registry for the outline point (ellipse/circle project
    // analytically; hexagon/diamond intersect the outline polygon). A null
    // result — rect, unknown shapes, or a degenerate vertex tangent — falls
    // through to the bounding-box edge.
    const pt = getShape(type).boundaryPoint(rect, side, cross);
    if (pt) return pt;

    return side === 'left' ? { x: rect.x, y: cross }
      : side === 'right' ? { x: rect.x + rect.w, y: cross }
      : side === 'top' ? { x: cross, y: rect.y }
      : { x: cross, y: rect.y + rect.h };
  }

  /**
   * The VISIBLE port on the given side closest to the ideal attachment point,
   * or null when the node shows no ports there (visibility resolves through
   * port config → node metadata → the global interaction strategy; only
   * 'always' counts — hover-revealed ports must not flip attachment mid-drag).
   */
  private nearestVisiblePort(
    node: NodeModel,
    side: 'left' | 'right' | 'top' | 'bottom',
    ideal: { x: number; y: number }
  ): { x: number; y: number } | null {
    const globalDefault = String(this.engine.getInteractionConfig().portVisibility).toLowerCase() as any;
    const world = node.getWorldPosition();
    let best: { x: number; y: number } | null = null;
    let bestDist = Infinity;
    for (const port of node.getPorts()) {
      if (port.alignment?.side !== side) continue;
      const vis = typeof (port as any).getEffectiveVisibility === 'function'
        ? String((port as any).getEffectiveVisibility(node, globalDefault)).toLowerCase()
        : globalDefault;
      if (vis !== 'always') continue;
      const local = getPortPositionForShape(port, node);
      const pos = { x: world.x + local.x, y: world.y + local.y };
      const dist = Math.hypot(pos.x - ideal.x, pos.y - ideal.y);
      if (dist < bestDist) {
        bestDist = dist;
        best = pos;
      }
    }
    return best;
  }

  /**
   * The link's own endpoint nodes (resolved via cached ids or port search).
   */
  private linkOwnNodes(link: LinkModel): NodeModel[] {
    const diagram = this.engine.getDiagram();
    if (!diagram) return [];
    const nodes: NodeModel[] = [];
    for (const [nodeId, portId] of [
      [link.sourceNodeId, link.sourcePortId],
      [link.targetNodeId, link.targetPortId],
    ] as const) {
      let node = nodeId ? diagram.getNode(nodeId) : null;
      if (!node && portId) {
        node = diagram.getNodes().find((n: NodeModel) => !!n.getPort(portId)) || null;
      }
      if (node) nodes.push(node);
    }
    return nodes;
  }

  /**
   * Smooth cubic spline (Catmull-Rom) through every route point — used so a
   * smooth/bezier link keeps its curved identity on multi-point detours
   * instead of visually turning into an orthogonal link.
   */
  private catmullRomPath(points: Array<{ x: number; y: number }>): string {
    const n = points.length;
    if (n === 0) return '';
    if (n === 1) return `M ${points[0].x} ${points[0].y}`;
    const fmt = (v: number) => +v.toFixed(2);
    let d = `M ${fmt(points[0].x)} ${fmt(points[0].y)}`;
    for (let i = 0; i < n - 1; i++) {
      const p0 = points[i - 1] ?? points[0];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2] ?? points[n - 1];
      const c1x = p1.x + (p2.x - p0.x) / 6;
      const c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6;
      const c2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C ${fmt(c1x)} ${fmt(c1y)}, ${fmt(c2x)} ${fmt(c2y)}, ${fmt(p2.x)} ${fmt(p2.y)}`;
    }
    return d;
  }

  /**
   * Sample the Catmull-Rom spline into a polyline (for penetration checks —
   * the spline can overshoot corners beyond the route's own points).
   */
  private sampleCatmullRom(
    points: Array<{ x: number; y: number }>,
    stepsPerSegment = 8
  ): Array<{ x: number; y: number }> {
    const n = points.length;
    if (n < 3) return points;
    const out: Array<{ x: number; y: number }> = [points[0]];
    for (let i = 0; i < n - 1; i++) {
      const p0 = points[i - 1] ?? points[0];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2] ?? points[n - 1];
      const c1x = p1.x + (p2.x - p0.x) / 6;
      const c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6;
      const c2y = p2.y - (p3.y - p1.y) / 6;
      for (let s = 1; s <= stepsPerSegment; s++) {
        const t = s / stepsPerSegment;
        const mt = 1 - t;
        out.push({
          x: mt * mt * mt * p1.x + 3 * mt * mt * t * c1x + 3 * mt * t * t * c2x + t * t * t * p2.x,
          y: mt * mt * mt * p1.y + 3 * mt * mt * t * c1y + 3 * mt * t * t * c2y + t * t * t * p2.y,
        });
      }
    }
    return out;
  }

  /**
   * Total length of the polyline that lies inside the given node bodies
   * (rects inset by 1px so port-touch on the border doesn't count).
   */
  private penetrationLength(
    points: Array<{ x: number; y: number }>,
    nodes: NodeModel[]
  ): number {
    if (!points || points.length < 2) return 0;
    const inset = 1;
    let total = 0;
    for (const node of nodes) {
      const rect = {
        minX: node.position.x + inset,
        minY: node.position.y + inset,
        maxX: node.position.x + node.size.width - inset,
        maxY: node.position.y + node.size.height - inset,
      };
      for (let i = 0; i < points.length - 1; i++) {
        const clip = this.segmentRectClip(points[i], points[i + 1], rect);
        if (clip) {
          const segLen = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
          total += (clip.t1 - clip.t0) * segLen;
        }
      }
    }
    return total;
  }

  /**
   * Make an "orthogonal" route strictly orthogonal:
   * 1. absorb near-miss elbows into the exact endpoint axes (grid-snapped
   *    elbows sit up to gridSize/2 off the port, producing slanted stubs),
   * 2. split any remaining diagonal segment with a corner point,
   * 3. merge collinear runs, which also removes out-and-back retraces.
   */
  private rectifyOrthogonalRoute(
    points: Array<{ x: number; y: number }>
  ): Array<{ x: number; y: number }> {
    const EPS = 0.01;
    const SNAP = 6; // below the routing gridSize of 10
    if (!points || points.length < 2) return points;

    // 0) copy + drop consecutive duplicates
    let pts = points.map(p => ({ x: p.x, y: p.y }));
    pts = pts.filter((p, i) => i === 0 || Math.abs(p.x - pts[i - 1].x) > EPS || Math.abs(p.y - pts[i - 1].y) > EPS);
    if (pts.length < 2) return pts;

    // 1) endpoint absorption: shift the run of elbows adjacent to each
    //    endpoint onto the endpoint's own axis line
    const absorb = (idx: number, dir: 1 | -1) => {
      const anchor = pts[idx];
      const first = pts[idx + dir];
      if (!first) return;
      const dx = Math.abs(first.x - anchor.x);
      const dy = Math.abs(first.y - anchor.y);
      if (dy > EPS && dy <= SNAP && dx > dy) {
        // meant to be horizontal: lift the whole co-linear run onto anchor.y
        const oldY = first.y;
        for (let i = idx + dir; i >= 0 && i < pts.length; i += dir) {
          if (Math.abs(pts[i].y - oldY) > EPS) break;
          pts[i].y = anchor.y;
        }
      } else if (dx > EPS && dx <= SNAP && dy > dx) {
        const oldX = first.x;
        for (let i = idx + dir; i >= 0 && i < pts.length; i += dir) {
          if (Math.abs(pts[i].x - oldX) > EPS) break;
          pts[i].x = anchor.x;
        }
      }
    };
    absorb(0, 1);
    absorb(pts.length - 1, -1);

    // 2) orthogonalize: insert a corner for any remaining diagonal segment,
    //    continuing the previous segment's axis where one exists
    const ortho: Array<{ x: number; y: number }> = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const prev = ortho[ortho.length - 1];
      const q = pts[i];
      const dx = Math.abs(q.x - prev.x);
      const dy = Math.abs(q.y - prev.y);
      if (dx > EPS && dy > EPS) {
        const before = ortho.length >= 2 ? ortho[ortho.length - 2] : null;
        const prevHorizontal = before ? Math.abs(prev.y - before.y) <= EPS : dx >= dy;
        ortho.push(prevHorizontal ? { x: q.x, y: prev.y } : { x: prev.x, y: q.y });
      }
      ortho.push({ x: q.x, y: q.y });
    }

    // 3) merge collinear runs (same axis, any direction) — keeps only the run
    //    endpoints, which removes backtracking stubs
    const merged: Array<{ x: number; y: number }> = [ortho[0]];
    for (let i = 1; i < ortho.length; i++) {
      const q = ortho[i];
      while (merged.length >= 2) {
        const a = merged[merged.length - 2];
        const b = merged[merged.length - 1];
        const sameH = Math.abs(b.y - a.y) <= EPS && Math.abs(q.y - b.y) <= EPS;
        const sameV = Math.abs(b.x - a.x) <= EPS && Math.abs(q.x - b.x) <= EPS;
        if (sameH || sameV) merged.pop(); else break;
      }
      if (Math.abs(q.x - merged[merged.length - 1].x) > EPS || Math.abs(q.y - merged[merged.length - 1].y) > EPS) {
        merged.push(q);
      }
    }
    return merged;
  }

  /**
   * True if any polyline segment passes through a node body. Node rects are
   * inset by 1px so a path legitimately touching the border at a port doesn't
   * count as a crossing.
   */
  private routeCrossesNodes(
    points: Array<{ x: number; y: number }>,
    link: LinkModel,
    nodes: NodeModel[]
  ): boolean {
    if (!points || points.length < 2) return false;
    const inset = 1;
    for (const node of nodes) {
      const rect = {
        minX: node.position.x + inset,
        minY: node.position.y + inset,
        maxX: node.position.x + node.size.width - inset,
        maxY: node.position.y + node.size.height - inset,
      };
      for (let i = 0; i < points.length - 1; i++) {
        if (this.segmentIntersectsRect(points[i], points[i + 1], rect)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Segment/rect intersection via Liang-Barsky clipping.
   */
  private segmentIntersectsRect(
    a: { x: number; y: number },
    b: { x: number; y: number },
    rect: { minX: number; minY: number; maxX: number; maxY: number }
  ): boolean {
    return this.segmentRectClip(a, b, rect) !== null;
  }

  /**
   * Liang-Barsky segment/rect clip — returns the parametric interval of the
   * segment that lies inside the rect, or null if it misses entirely.
   */
  private segmentRectClip(
    a: { x: number; y: number },
    b: { x: number; y: number },
    rect: { minX: number; minY: number; maxX: number; maxY: number }
  ): { t0: number; t1: number } | null {
    let t0 = 0, t1 = 1;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const clip = (p: number, q: number): boolean => {
      if (p === 0) return q >= 0;
      const r = q / p;
      if (p < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
      return true;
    };
    const hit =
      clip(-dx, a.x - rect.minX) &&
      clip(dx, rect.maxX - a.x) &&
      clip(-dy, a.y - rect.minY) &&
      clip(dy, rect.maxY - a.y) &&
      t0 < t1;
    return hit ? { t0, t1 } : null;
  }
}
