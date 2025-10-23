import type { DiagramEngine, NodeModel, LinkModel } from '@grafloria/engine';
import type { IRenderer, PerformanceMetrics, SVGRendererConfig, VNode, Theme, Rectangle } from '../types';
import { LIGHT_THEME } from '../themes';

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
      children: [linksLayer, nodesLayer],
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

    // Generate path from points
    const pathData = this.generatePathData(link.points);

    // Option 2: Calculate arrow position (at the end of the link)
    const points = link.points;
    const lastPoint = points[points.length - 1];
    const secondLastPoint = points[points.length - 2] || points[0];

    // Calculate arrow angle
    const dx = lastPoint.x - secondLastPoint.x;
    const dy = lastPoint.y - secondLastPoint.y;
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);

    // Option 2: Calculate label position (middle of the link)
    const midIndex = Math.floor(points.length / 2);
    const labelPoint = points[midIndex];
    const label = link.getMetadata('label');

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
                  transform: `translate(${lastPoint.x}, ${lastPoint.y}) rotate(${angle})`,
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
   * Generate SVG path data from points
   */
  private generatePathData(points: Array<{ x: number; y: number }>): string {
    if (points.length === 0) return '';
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

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
}
