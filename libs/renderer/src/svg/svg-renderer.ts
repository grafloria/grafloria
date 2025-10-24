import type { DiagramEngine, NodeModel, LinkModel, PortModel, InteractionConfig } from '@grafloria/engine';
import type { IRenderer, PerformanceMetrics, SVGRendererConfig, VNode, Theme, Rectangle } from '../types';
import { LIGHT_THEME } from '../themes';

// Import routing types
import type { RoutedPath, RoutingAlgorithm } from '@grafloria/engine';

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

    // Inject theme CSS if in CSS mode
    if (this.config.useCSSMode) {
      this.injectThemeCSS();
    }

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

    // Unsubscribe from engine events
    // (EventBus will handle cleanup on engine destroy)
  }

  /**
   * Render links layer
   */
  private renderLinksLayer(links: LinkModel[], lod: LODLevel): VNode {
    const children = links.map(link => this.renderLink(link, lod));

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

    // CRITICAL FIX: Calculate source position using getAbsolutePosition() like links do
    // This ensures the line starts from the port center, not the node's top-left corner
    const sourceBounds = sourceNode.getBoundingBox();
    const sourcePos = dragState.sourcePort.getAbsolutePosition(sourceBounds);

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
    const algorithm = this.mapPathTypeToAlgorithm(pathType);

    const routedPath = routingEngine.route({
      start: sourcePos,
      end: targetPos,
      sourceDirection,
      targetDirection,
      options: { algorithm }
    });

    // Generate SVG path data
    let pathData: string;
    if (routedPath) {
      pathData = this.convertRoutedPathToSVG(routedPath, pathType);
    } else {
      // Fallback to simple straight line
      pathData = `M ${sourcePos.x} ${sourcePos.y} L ${targetPos.x} ${targetPos.y}`;
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
          ? 'animation: dash 0.5s linear infinite'
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
    // Check cache if enabled (include LOD in cache key since rendering varies by LOD)
    const cacheKey = `node-${node.id}-${lod}`;
    if (this.config.enableCaching && !node.isDirty) {
      const cached = this.vnodeCache.get(cacheKey);
      if (cached) {
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
        style: isHovered ? 'transition: all 0.2s ease' : undefined,
      },
      children: [
        // Selection highlight (rendered behind the node)
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
        // Drop shadow (Option 2: Visual Enhancement)
        ...(lod !== 'low'
          ? [
              {
                type: 'rect',
                props: {
                  x: isHovered ? 2 : 3,
                  y: isHovered ? 2 : 3,
                  width: node.size.width,
                  height: node.size.height,
                  fill: '#000',
                  opacity: isHovered ? 0.15 : 0.1,
                  rx: (node.style.borderRadius ?? 4) as number,
                  filter: 'blur(4px)',
                  className: 'node-shadow',
                },
              } as VNode,
            ]
          : []),
        // Node shape
        {
          type: 'rect',
          props: {
            x: 0,
            y: 0,
            width: node.size.width,
            height: node.size.height,
            ...styles,
            // Option 2: Enhanced hover effect
            ...(isHovered && !this.config.useCSSMode
              ? {
                  strokeWidth: (styles.strokeWidth || 1) + 1,
                  filter: 'brightness(1.05)',
                }
              : {}),
          },
        },
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
      node.markClean();
    }

    return vnode;
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
   * Phase 2: Render single port
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
        style: `transition: all 0.2s ease; cursor: ${port.isHovered || isHighlighted ? 'pointer' : 'crosshair'}; pointer-events: all;`,
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
  private getPortRelativePosition(port: PortModel, node: NodeModel): { x: number; y: number } {
    const { side } = port.alignment;
    const nodeWidth = node.size.width;
    const nodeHeight = node.size.height;
    let x = 0;
    let y = 0;

    switch (side) {
      case 'left':
        x = 0 - port.alignment.offset;
        y = nodeHeight * port.position.y;
        break;
      case 'right':
        x = nodeWidth + port.alignment.offset;
        y = nodeHeight * port.position.y;
        break;
      case 'top':
        x = nodeWidth * port.position.x;
        y = 0 - port.alignment.offset;
        break;
      case 'bottom':
        x = nodeWidth * port.position.x;
        y = nodeHeight + port.alignment.offset;
        break;
    }

    return {
      x: x + port.offset.x,
      y: y + port.offset.y,
    };
  }

  /**
   * Phase 2: Determine if port should be rendered based on visibility strategy
   * CRITICAL FIX: Added comprehensive debugging and proper string comparison
   */
  private shouldRenderPort(
    port: PortModel,
    node: NodeModel,
    config: InteractionConfig
  ): boolean {
    const { portVisibility } = config;

    // CRITICAL FIX: portVisibility is a string, not an enum
    // It could be 'always', 'on-hover', or 'hidden'
    const visibilityStr = String(portVisibility).toLowerCase();

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
      case 'hidden':
        // Only show if actively involved in connection
        return port.isHighlighted || port.isValidTarget;
      default:
        // Fallback to always visible
        console.warn(`Unknown port visibility strategy: ${portVisibility}, defaulting to 'always'`);
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
   * Get link endpoints (source and target port positions in world coordinates)
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
    const sourceNode = link.sourceNodeId ? diagram.getNode(link.sourceNodeId) : null;
    const targetNode = link.targetNodeId ? diagram.getNode(link.targetNodeId) : null;

    if (!sourceNode || !targetNode) return null;

    // Get source and target ports
    const sourcePort = sourceNode.getPort(link.sourcePortId);
    const targetPort = targetNode.getPort(link.targetPortId);

    if (!sourcePort || !targetPort) return null;

    // Calculate absolute positions
    const sourceBounds = sourceNode.getBoundingBox();
    const targetBounds = targetNode.getBoundingBox();
    const start = sourcePort.getAbsolutePosition(sourceBounds);
    const end = targetPort.getAbsolutePosition(targetBounds);

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

    if (endpoints) {
      // Use RoutingEngine to calculate path
      const routingEngine = this.engine.getRoutingEngine();
      const algorithm = this.mapPathTypeToAlgorithm(link.pathType);

      const routedPath = routingEngine.route({
        start: endpoints.start,
        end: endpoints.end,
        sourceDirection: endpoints.sourceDirection,
        targetDirection: endpoints.targetDirection,
        options: { algorithm }
      });

      if (routedPath) {
        points = routedPath.points;
        pathData = this.convertRoutedPathToSVG(routedPath, link.pathType);
      } else {
        // Fallback to simple straight line
        points = [endpoints.start, endpoints.end];
        pathData = `M ${endpoints.start.x} ${endpoints.start.y} L ${endpoints.end.x} ${endpoints.end.y}`;
      }
    } else {
      // Fallback to existing link.points
      points = link.points;
      pathData = this.generatePathData(link.points, link.segments);
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

    const vnode: VNode = {
      type: 'g',
      key: `link-${link.id}`,
      props: {
        className: 'link-group',
      },
      children: [
        // Link path
        {
          type: 'path',
          props: {
            d: pathData,
            fill: 'none',
            ...styles,
          },
        },
        // Arrow marker (Option 2: Visual Enhancement)
        ...(lod !== 'low'
          ? [
              {
                type: 'polygon',
                props: {
                  points: '0,-5 10,0 0,5',
                  fill: styles.stroke || this.theme.colors.link.default,
                  transform: `translate(${arrowTipPosition.x}, ${arrowTipPosition.y}) rotate(${angle})`,
                  className: 'link-arrow',
                },
              } as VNode,
            ]
          : []),
        // Link label (Option 2: Visual Enhancement)
        ...(lod === 'high' && label
          ? [
              // Label background
              {
                type: 'rect',
                props: {
                  x: labelPoint.x - 20,
                  y: labelPoint.y - 10,
                  width: 40,
                  height: 20,
                  fill: this.theme.colors.background.surface,
                  stroke: styles.stroke || this.theme.colors.link.default,
                  strokeWidth: 1,
                  rx: 3,
                  className: 'link-label-bg',
                },
              } as VNode,
              // Label text
              {
                type: 'text',
                props: {
                  x: labelPoint.x,
                  y: labelPoint.y,
                  textContent: label,
                  textAnchor: 'middle',
                  dominantBaseline: 'middle',
                  fontSize: this.theme.typography.fontSize.sm,
                  fill: this.theme.colors.text.primary,
                  fontWeight: this.theme.typography.fontWeight.medium,
                  className: 'link-label',
                  pointerEvents: 'none',
                },
              } as VNode,
            ]
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
                  style: 'cursor: move; transition: all 0.2s ease',
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
                  style: 'cursor: move; transition: all 0.2s ease',
                },
              } as VNode,
            ]
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

    return {
      className: classes.join(' '),
      // Entity-specific overrides (if any)
      ...(node.style.fill && { fill: node.style.fill }),
      ...(node.style.stroke && { stroke: node.style.stroke }),
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

    // Generate CSS content
    this.styleElement.textContent = this.generateThemeCSS();

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
   * Get target port position for arrow positioning
   * Returns the port's absolute position, which is typically at the node boundary
   *
   * @param link Link model
   * @returns Port position or null if not found
   */
  private getTargetPortPosition(link: LinkModel): { x: number; y: number } | null {
    const diagram = this.engine.getDiagram();
    if (!diagram || !link.targetPortId) return null;

    const targetNode = diagram.getNode(link.targetNodeId!);
    if (!targetNode) return null;

    const targetPort = targetNode.getPort(link.targetPortId);
    if (!targetPort) return null;

    // Get port's absolute position using the same method as getLinkEndpoints
    const targetBounds = targetNode.getBoundingBox();
    return targetPort.getAbsolutePosition(targetBounds);
  }

  /**
   * Get source port position for arrow positioning
   * Returns the port's absolute position, which is typically at the node boundary
   *
   * @param link Link model
   * @returns Port position or null if not found
   */
  private getSourcePortPosition(link: LinkModel): { x: number; y: number } | null {
    const diagram = this.engine.getDiagram();
    if (!diagram || !link.sourcePortId) return null;

    const sourceNode = diagram.getNode(link.sourceNodeId!);
    if (!sourceNode) return null;

    const sourcePort = sourceNode.getPort(link.sourcePortId);
    if (!sourcePort) return null;

    // Get port's absolute position using the same method as getLinkEndpoints
    const sourceBounds = sourceNode.getBoundingBox();
    return sourcePort.getAbsolutePosition(sourceBounds);
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
        // Calculate control point cp2 (same logic as convertRoutedPathToSVG at line 819-828)
        const dx = points[1].x - points[0].x;
        const dy = points[1].y - points[0].y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const controlDistance = Math.min(distance / 2, 100);

        // cp2 is controlDistance pixels to the left of the endpoint (horizontal approach)
        const cp2x = points[1].x - controlDistance;
        const cp2y = points[1].y;

        // Calculate tangent from cp2 to endpoint
        const tangentDx = points[1].x - cp2x;  // Always positive (pointing right)
        const tangentDy = points[1].y - cp2y;  // Always zero (horizontal)
        return Math.atan2(tangentDy, tangentDx) * (180 / Math.PI);  // Always 0° (horizontal right)
      } else if (points.length > 2) {
        // Multiple points: use last segment
        const lastPoint = points[points.length - 1];
        const secondLastPoint = points[points.length - 2];
        const dx = lastPoint.x - secondLastPoint.x;
        const dy = lastPoint.y - secondLastPoint.y;
        return Math.atan2(dy, dx) * (180 / Math.PI);
      }
    }

    // Orthogonal routing MUST use port side for perpendicular arrows
    if (algorithm === 'orthogonal' && portSide) {
      return this.getPerpendicularAngleFromPortSide(portSide);
    }

    // For all other algorithms (straight, a-star, dijkstra, visibility-graph, custom):
    // Use last segment direction
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
    let portPosition: { x: number; y: number } | null = null;

    if (diagram) {
      if (isTarget && link.targetPortId) {
        const targetNode = diagram.getNode(link.targetNodeId!);
        if (targetNode) {
          const targetPort = targetNode.getPort(link.targetPortId);
          if (targetPort) {
            portSide = targetPort.alignment.side;
            portPosition = this.getTargetPortPosition(link);
          }
        }
      } else if (!isTarget && link.sourcePortId) {
        const sourceNode = diagram.getNode(link.sourceNodeId!);
        if (sourceNode) {
          const sourcePort = sourceNode.getPort(link.sourcePortId);
          if (sourcePort) {
            portSide = sourcePort.alignment.side;
            portPosition = this.getSourcePortPosition(link);
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
