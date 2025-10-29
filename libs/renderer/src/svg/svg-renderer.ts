import type { DiagramEngine, NodeModel, LinkModel, PortModel, InteractionConfig } from '@grafloria/engine';
import type { IRenderer, PerformanceMetrics, SVGRendererConfig, VNode, Theme, Rectangle } from '../types';
import { LIGHT_THEME } from '../themes';
import { createForeignObject, isForeignObject, getContainerId } from '../vnode/foreign-object';

// Import routing types
import type { RoutedPath, RoutingAlgorithm } from '@grafloria/engine';

// Phase 3.2: Shape-aware port positioning
import { getPortPositionForShape } from './port-positioning';

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

// LOD Level type (matches engine's LODLevel)
type LODLevel = 'high' | 'medium' | 'low';

/**
 * SVG Renderer
 * Renders diagram to VNode tree for framework-agnostic consumption
 * Integrates with engine's performance features (SpatialIndex, dirty marking, LOD)
 */
export class SVGRenderer implements IRenderer {
  readonly mode = 'svg' as const;

  private theme: Theme;
  private config: Required<SVGRendererConfig>;
  private vnodeCache = new Map<string, VNode>();
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
    };

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
      pathData = this.convertRoutedPathToSVG(routedPath, pathType);
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
        pathData = this.convertRoutedPathToSVG(fallbackPath, pathType);
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
    } else if (node.isDirty) {
      console.log(`[SVGRenderer] Re-rendering node ${node.id} (dirty)`);
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
        ...(lod !== 'low' ? [this.renderShadow(node, isHovered)] : []),
        // Node shape (Phase 3.1: Shape-based rendering)
        this.renderNodeShape(node, styles, isHovered),
        // Label (if LOD allows and label exists)
        ...(diagram.shouldRenderLabels(lod) && node.getMetadata('label')
          ? [
              {
                type: 'text',
                props: {
                  x: node.size.width / 2,
                  y: node.size.height / 2,
                  textContent: node.getMetadata('label'),
                  textAnchor: 'middle',
                  dominantBaseline: 'middle', // Option 2: Better text alignment
                  className: this.config.useCSSMode ? 'diagram-label' : undefined,
                  fontSize: this.config.useCSSMode ? undefined : this.theme.typography.fontSize.md,
                  fill: this.config.useCSSMode ? undefined : this.theme.colors.text.primary,
                  fontWeight: this.config.useCSSMode ? undefined : this.theme.typography.fontWeight.medium,
                  pointerEvents: 'none', // Option 2: Don't block mouse events
                },
              } as VNode,
            ]
          : []),
        // Option 3: Lock/pin indicator for locked nodes
        ...(node.state.locked && lod !== 'low'
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
      console.log(`[SVGRenderer] Caching node ${node.id} and marking clean`);
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
    // Skip port rendering in low LOD
    if (lod === 'low') {
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
      const effectiveVisibility = port.getEffectiveVisibility(node);
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

    console.log(`[SVGRenderer] renderNodeShape for ${node.id}:`, {
      baseStroke: styles.stroke,
      shapeConfigStroke: shapeConfig.stroke,
      finalStroke: shapeStyles.stroke,
      strokeWidth: shapeStyles.strokeWidth,
      hasActiveBorderAnimation,
      animatedBorder: node.style?.animatedBorder,
      borderAnimationType: node.style?.borderAnimationType
    });

    // Enhanced hover effect
    if (isHovered && !this.config.useCSSMode) {
      shapeStyles.strokeWidth = (shapeStyles.strokeWidth || 1) + 1;
      shapeStyles.filter = 'brightness(1.05)';
    }

    switch (shapeConfig.type) {
      case 'circle':
        return this.renderCircleShape(width, height, shapeStyles);

      case 'ellipse':
        return this.renderEllipseShape(width, height, shapeStyles);

      case 'diamond':
        return this.renderDiamondShape(width, height, shapeStyles);

      case 'hexagon':
        return this.renderHexagonShape(width, height, shapeStyles);

      case 'rect':
      default:
        return this.renderRectShape(width, height, shapeStyles, shapeConfig.cornerRadius);
    }
  }

  /**
   * Phase 3.1: Render rectangle shape
   */
  private renderRectShape(width: number, height: number, styles: any, cornerRadius?: number): VNode {
    // DEBUG: Log what classes are being applied to rect
    console.log(`[SVGRenderer] renderRectShape:`, {
      className: styles.className,
      stroke: styles.stroke,
      strokeWidth: styles.strokeWidth,
      fill: styles.fill
    });

    return {
      type: 'rect',
      props: {
        x: 0,
        y: 0,
        width,
        height,
        ...styles,
        ...(cornerRadius ? { rx: cornerRadius, ry: cornerRadius } : {}),
      },
    };
  }

  /**
   * Phase 3.1: Render circle shape
   */
  private renderCircleShape(width: number, height: number, styles: any): VNode {
    const radius = Math.min(width, height) / 2;
    const cx = width / 2;
    const cy = height / 2;

    return {
      type: 'circle',
      props: {
        cx,
        cy,
        r: radius,
        ...styles,
      },
    };
  }

  /**
   * Phase 3.1: Render ellipse shape
   */
  private renderEllipseShape(width: number, height: number, styles: any): VNode {
    const rx = width / 2;
    const ry = height / 2;
    const cx = width / 2;
    const cy = height / 2;

    return {
      type: 'ellipse',
      props: {
        cx,
        cy,
        rx,
        ry,
        ...styles,
      },
    };
  }

  /**
   * Phase 3.1: Render diamond shape (rotated square)
   */
  private renderDiamondShape(width: number, height: number, styles: any): VNode {
    const cx = width / 2;
    const cy = height / 2;

    // Diamond vertices: top, right, bottom, left
    const points = `${cx},0 ${width},${cy} ${cx},${height} 0,${cy}`;

    return {
      type: 'polygon',
      props: {
        points,
        ...styles,
      },
    };
  }

  /**
   * Phase 3.1: Render hexagon shape
   */
  private renderHexagonShape(width: number, height: number, styles: any): VNode {
    const cx = width / 2;
    const cy = height / 2;

    // Flat-top hexagon (6 vertices)
    const offset = width * 0.25; // 25% offset for flat sides

    const points = [
      `${offset},0`,           // top-left
      `${width - offset},0`,   // top-right
      `${width},${cy}`,        // right
      `${width - offset},${height}`, // bottom-right
      `${offset},${height}`,   // bottom-left
      `0,${cy}`,               // left
    ].join(' ');

    return {
      type: 'polygon',
      props: {
        points,
        ...styles,
      },
    };
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

    switch (shapeConfig.type) {
      case 'circle':
        const radius = Math.min(width, height) / 2;
        return {
          type: 'circle',
          props: {
            cx: width / 2,
            cy: height / 2,
            r: radius + padding,
            ...baseProps,
          },
        };

      case 'ellipse':
        return {
          type: 'ellipse',
          props: {
            cx: width / 2,
            cy: height / 2,
            rx: width / 2 + padding,
            ry: height / 2 + padding,
            ...baseProps,
          },
        };

      case 'diamond':
        const cx = width / 2;
        const cy = height / 2;
        const points = `${cx},${-padding} ${width + padding},${cy} ${cx},${height + padding} ${-padding},${cy}`;
        return {
          type: 'polygon',
          props: {
            points,
            ...baseProps,
          },
        };

      case 'hexagon':
        const offset = width * 0.25;
        const hexPoints = [
          `${offset - padding},${-padding}`,
          `${width - offset + padding},${-padding}`,
          `${width + padding},${height / 2}`,
          `${width - offset + padding},${height + padding}`,
          `${offset - padding},${height + padding}`,
          `${-padding},${height / 2}`,
        ].join(' ');
        return {
          type: 'polygon',
          props: {
            points: hexPoints,
            ...baseProps,
          },
        };

      case 'rect':
      default:
        return {
          type: 'rect',
          props: {
            x: -padding,
            y: -padding,
            width: width + (padding * 2),
            height: height + (padding * 2),
            rx: 6,
            ry: 6,
            ...baseProps,
          },
        };
    }
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

    switch (shapeConfig.type) {
      case 'circle':
        const radius = Math.min(width, height) / 2;
        return {
          type: 'circle',
          props: {
            cx: width / 2 + offset,
            cy: height / 2 + offset,
            r: radius,
            ...baseProps,
          },
        };

      case 'ellipse':
        return {
          type: 'ellipse',
          props: {
            cx: width / 2 + offset,
            cy: height / 2 + offset,
            rx: width / 2,
            ry: height / 2,
            ...baseProps,
          },
        };

      case 'diamond':
        const cx = width / 2;
        const cy = height / 2;
        const points = `${cx + offset},${offset} ${width + offset},${cy + offset} ${cx + offset},${height + offset} ${offset},${cy + offset}`;
        return {
          type: 'polygon',
          props: {
            points,
            ...baseProps,
          },
        };

      case 'hexagon':
        const hexOffset = width * 0.25;
        const hexPoints = [
          `${hexOffset + offset},${offset}`,
          `${width - hexOffset + offset},${offset}`,
          `${width + offset},${height / 2 + offset}`,
          `${width - hexOffset + offset},${height + offset}`,
          `${hexOffset + offset},${height + offset}`,
          `${offset},${height / 2 + offset}`,
        ].join(' ');
        return {
          type: 'polygon',
          props: {
            points: hexPoints,
            ...baseProps,
          },
        };

      case 'rect':
      default:
        return {
          type: 'rect',
          props: {
            x: offset,
            y: offset,
            width,
            height,
            rx: (node.style.borderRadius ?? 4) as number,
            ...baseProps,
          },
        };
    }
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
    const sourcePort = sourceNode.getPort(link.sourcePortId);
    const targetPort = targetNode.getPort(link.targetPortId);

    if (!sourcePort || !targetPort) return null;

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
   * Convert RoutedPath to SVG path string
   */
  private convertRoutedPathToSVG(routedPath: RoutedPath, pathType: string): string {
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

        const cp1x = points[0].x + controlDistance;
        const cp1y = points[0].y;
        const cp2x = points[1].x - controlDistance;
        const cp2y = points[1].y;

        path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${points[1].x} ${points[1].y}`;
      } else {
        // For multiple points, use straight lines between waypoints
        for (let i = 1; i < points.length; i++) {
          path += ` L ${points[i].x} ${points[i].y}`;
        }
      }

      return path;
    }

    // For straight/orthogonal, just connect the points
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
    // Check cache if enabled
    if (this.config.enableCaching && !link.isDirty) {
      const cached = this.vnodeCache.get(`link-${link.id}`);
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

    // FIXED: Check if link has manually edited waypoints
    // If link has more than 2 points, it means waypoints were added manually
    // Don't regenerate the route in this case - use the existing points
    const hasManualWaypoints = link.points && link.points.length > 2;

    if (endpoints && !hasManualWaypoints) {
      // Use RoutingEngine to calculate path
      const routingEngine = this.engine.getRoutingEngine();

      // ARCHITECTURE: pathType determines the base routing algorithm
      // - 'orthogonal' → orthogonal router (produces perpendicular paths)
      // - 'direct'/'smooth'/'bezier' → straight router (produces straight paths)
      // The routing algorithms (a-star, dijkstra, etc.) are for advanced obstacle avoidance
      // but they don't produce orthogonal paths, so we use pathType as the primary determinant
      const algorithm = this.mapPathTypeToAlgorithm(link.pathType);

      // OBSTACLE AVOIDANCE: Get obstacles from the diagram for routing
      // FIXED: Exclude source and target nodes so paths can start/end at their ports
      const diagram = this.engine.getDiagram();
      const obstacles: Array<{ id: string; x: number; y: number; width: number; height: number }> = [];

      if (diagram) {
        const sourceNode = diagram.getNodes().find(n => n.getPorts().some(p => p.id === link.sourcePortId));
        const targetNode = diagram.getNodes().find(n => n.getPorts().some(p => p.id === link.targetPortId));

        diagram.getNodes().forEach(node => {
          // CRITICAL FIX: Exclude source and target nodes from obstacles
          // Paths must be able to start/end at ports on these nodes
          if (node.id === sourceNode?.id || node.id === targetNode?.id) {
            return; // Skip this node
          }

          // CRITICAL FIX: Use getWorldPosition() for child nodes to get correct absolute coordinates
          const worldPos = node.getWorldPosition();
          obstacles.push({
            id: node.id,
            x: worldPos.x,
            y: worldPos.y,
            width: node.size.width,
            height: node.size.height,
          });
        });

        console.log(`🚧 Routing with ${obstacles.length} obstacles (excluded source: ${sourceNode?.id}, target: ${targetNode?.id})`);
      }

      // Use link's pathType-derived algorithm, fallback to routing engine's default
      const defaultAlgorithm = routingEngine.getDefaultAlgorithm();
      const finalAlgorithm = algorithm || defaultAlgorithm;
      const shouldAvoidObstacles = obstacles.length > 0 && finalAlgorithm !== 'straight';

      const routedPath = routingEngine.route({
        start: endpoints.start,
        end: endpoints.end,
        sourceDirection: endpoints.sourceDirection,
        targetDirection: endpoints.targetDirection,
        obstacles, // Pass obstacles for avoidance
        options: {
          algorithm: finalAlgorithm,
          avoidObstacles: shouldAvoidObstacles,
          obstacleMargin: 20,   // Add 20px margin around obstacles (consistent with link creation)
          gridSize: 10,         // Grid size for A* pathfinding
        }
      });

      if (routedPath) {
        points = routedPath.points;
        pathData = this.convertRoutedPathToSVG(routedPath, link.pathType);

        // CRITICAL FIX: Update link.points so interaction handler can use them for hit testing
        // Only update if points are empty/missing to avoid triggering infinite render loop
        // (setPoints emits 'link:changed' which triggers re-render)
        if (!link.points || link.points.length < 2) {
          // Directly update points array without emitting events to avoid render loop
          // Note: Segments are not needed for hit testing, only points
          link.points = points.map(p => ({ ...p }));
        }
      } else {
        // Phase 0.1: Fallback strategy to avoid crossing obstacles
        console.warn(`Primary routing failed for link ${link.id}, trying fallback with reduced constraints`);

        // Fallback Strategy 1: Try with reduced margin and coarser grid
        const fallbackPath = routingEngine.route({
          start: endpoints.start,
          end: endpoints.end,
          sourceDirection: endpoints.sourceDirection,
          targetDirection: endpoints.targetDirection,
          obstacles,
          options: {
            algorithm: 'orthogonal',  // Force orthogonal as safest fallback
            avoidObstacles: true,
            obstacleMargin: 5,         // Reduced from 20px
            gridSize: 20,              // Coarser grid (was 10)
            maxIterations: 1000        // Faster computation
          }
        });

        if (fallbackPath) {
          points = fallbackPath.points;
          pathData = this.convertRoutedPathToSVG(fallbackPath, link.pathType);

          // CRITICAL FIX: Update link.points for hit testing (same as above)
          if (!link.points || link.points.length < 2) {
            link.points = points.map(p => ({ ...p }));
          }

          console.log(`✅ Fallback routing succeeded for link ${link.id}`);
        } else {
          // Fallback Strategy 2: Hide invalid connection (don't render crossing line)
          console.warn(`All routing strategies failed for link ${link.id} - hiding invalid preview`);
          return {
            type: 'g',
            key: `link-${link.id}`,
            props: {},
            children: []
          };
        }
      }
    } else {
      // Fallback to existing link.points
      points = link.points;
      pathData = this.generatePathData(link.points, link.segments);
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

    // Calculate arrow position and angle using unified utility
    // The arrow polygon '0,-5 10,0 0,5' has its tip at x=10, base at x=0
    const arrowLength = 10;
    const arrowData = this.calculateArrowPositionAndAngle(link, points, true, arrowLength);
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
      lod !== 'low';

    // Phase 1.3: Apply jump points if enabled
    let linkPathVNode: VNode;
    if (link.style.jumpPoints?.enabled) {
      // Get all other links for intersection detection
      const diagram = this.engine.getDiagram();
      const allLinks = diagram ? diagram.getLinks() : [];
      const otherLinks = allLinks.filter(l => l.id !== link.id);

      // Detect intersections
      const intersections = this.jumpPointDetector.detectIntersections(
        { id: link.id, points: link.points },
        otherLinks.map(l => ({ id: l.id, points: l.points })),
        link.style.jumpPoints.detectMode,
        link.style.jumpPoints.threshold
      );

      // Render with jump points
      linkPathVNode = this.jumpPointRenderer.renderWithJumpPoints(
        pathData,
        intersections,
        link.style.jumpPoints,
        {
          fill: 'none',
          ...styles
        }
      );
    } else {
      // No jump points, render normal path
      linkPathVNode = {
        type: 'path',
        props: {
          d: pathData,
          fill: 'none',
          ...styles,
        },
      };
    }

    const vnode: VNode = {
      type: 'g',
      key: `link-${link.id}`,
      props: {
        className: 'link-group',
      },
      children: [
        // Link path (with or without jump points)
        linkPathVNode,
        // Phase 1.1: Arrow markers using ArrowRenderer
        ...(lod !== 'low'
          ? (() => {
              const arrows: VNode[] = [];

              // Get arrow styles from link (with defaults)
              const arrowHeadStyle = link.style.arrowHead || {
                type: 'arrow',
                size: 10,
                filled: true,
                color: styles.stroke || this.theme.colors.link.default
              };

              const arrowTailStyle = link.style.arrowTail;

              // Render arrow head (at target end)
              if (arrowHeadStyle && arrowHeadStyle.type !== 'none') {
                const transform = `translate(${arrowTipPosition.x}, ${arrowTipPosition.y}) rotate(${angle})`;
                const arrowHeadVNode = this.arrowRenderer.renderArrow(arrowHeadStyle, transform);
                if (arrowHeadVNode) {
                  arrows.push(arrowHeadVNode);
                }
              }

              // Render arrow tail (at source end) if specified
              if (arrowTailStyle && arrowTailStyle.type !== 'none') {
                // Calculate arrow tail position and angle (at source end)
                const tailArrowData = this.calculateArrowPositionAndAngle(link, points, false, arrowTailStyle.size || 10);
                const tailTransform = `translate(${tailArrowData.position.x}, ${tailArrowData.position.y}) rotate(${tailArrowData.angle})`;
                const arrowTailVNode = this.arrowRenderer.renderArrow(arrowTailStyle, tailTransform);
                if (arrowTailVNode) {
                  arrows.push(arrowTailVNode);
                }
              }

              return arrows;
            })()
          : []),
        // Phase 1.2: Multiple labels using LabelRenderer
        ...(lod === 'high'
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
        ...(config.enableWaypointEditing && config.showWaypointHandles && isSelected && lod !== 'low'
          ? this.waypointEditor.renderWaypointHandles(link.points, link.id)
          : []),
        // Phase 2.3b: Control point handles for bezier curve editing
        ...(config.enableControlPointEditing && config.showControlPointHandles && isSelected && lod !== 'low' && link.segments && link.segments.length > 0
          ? this.controlPointEditor.renderControlPointHandles(link.segments, link.id)
          : []),
      ],
    };

    // Cache if enabled
    if (this.config.enableCaching) {
      this.vnodeCache.set(`link-${link.id}`, vnode);
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

    // DEBUG: Log animation classes
    console.log(`[SVGRenderer] computeNodeStylesCSS for ${node.id}:`, {
      useSVGVariant,
      animationClasses,
      animatedBorder: node.style?.animatedBorder,
      borderAnimationType: node.style?.borderAnimationType,
      animateStatus: node.state?.animateStatus,
      status: node.state?.status,
      finalClassName
    });

    // CRITICAL: Don't apply strokeWidth as inline style if border animation is active
    // Inline styles override CSS animations, breaking animated stroke-width and stroke-dasharray
    const hasActiveBorderAnimation = node.style?.animatedBorder &&
                                     node.style?.borderAnimationType !== 'none';

    console.log(`[SVGRenderer] CSS mode final check for ${node.id}:`, {
      hasActiveBorderAnimation,
      willApplyStroke: !!node.style.stroke,
      willApplyStrokeWidth: node.style.strokeWidth !== undefined && !hasActiveBorderAnimation,
      finalClassName
    });

    return {
      className: finalClassName,
      // Entity-specific overrides (if any)
      ...(node.style.fill && { fill: node.style.fill }),
      // Always apply stroke color (it doesn't interfere with animations)
      ...(node.style.stroke && { stroke: node.style.stroke }),
      // Only apply strokeWidth if no border animation is active
      ...(node.style.strokeWidth !== undefined && !hasActiveBorderAnimation && { strokeWidth: node.style.strokeWidth }),
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

    return {
      className: classes.join(' '),
      ...(link.style.stroke && { stroke: link.style.stroke }),
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
  private generatePathData(points: Array<{ x: number; y: number }>, segments?: any[]): string {
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
   * Get node that owns a port
   */
  private getNodeForPort(portId: string): NodeModel | undefined {
    const diagram = this.engine.getDiagram();
    if (!diagram) return undefined;

    for (const node of diagram.getNodes()) {
      if (node.getPort(portId)) {
        return node;
      }
    }
    return undefined;
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
    algorithm: 'straight' | 'orthogonal' | 'a-star' | 'dijkstra' | 'visibility-graph' | 'custom',
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
    // Get the relevant port and its side
    const diagram = this.engine.getDiagram();
    let portSide: 'left' | 'right' | 'top' | 'bottom' | undefined;

    if (diagram) {
      if (isTarget && link.targetPortId) {
        const targetNode = diagram.getNode(link.targetNodeId!);
        if (targetNode) {
          const targetPort = targetNode.getPort(link.targetPortId);
          if (targetPort) {
            portSide = targetPort.alignment.side;
          }
        }
      } else if (!isTarget && link.sourcePortId) {
        const sourceNode = diagram.getNode(link.sourceNodeId!);
        if (sourceNode) {
          const sourcePort = sourceNode.getPort(link.sourcePortId);
          if (sourcePort) {
            portSide = sourcePort.alignment.side;
          }
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
}
