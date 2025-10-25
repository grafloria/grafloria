// Hybrid Renderer (Phase 3.5)
// Coordinates SVG and HTML layer rendering with synchronized transforms

import type { NodeModel, HtmlConfig } from '@grafloria/engine';
import type { VNode } from '../types/vnode.types';

/**
 * HTML layer representation
 */
export interface HtmlLayer {
  /**
   * Node ID for identification
   */
  nodeId: string;

  /**
   * CSS class names
   */
  className?: string;

  /**
   * Inline styles
   */
  style?: Record<string, any>;

  /**
   * Inner HTML content
   */
  innerHTML?: string;

  /**
   * Event handlers
   */
  eventHandlers?: Record<string, (event: any) => void>;
}

/**
 * Hybrid render result
 */
export interface HybridRenderResult {
  /**
   * SVG layer VNode (geometric shape, ports, etc.)
   */
  svgLayer: VNode;

  /**
   * HTML layer element (rich content overlay)
   */
  htmlLayer: HtmlLayer;

  /**
   * Node ID
   */
  nodeId: string;

  /**
   * Whether layers are synchronized
   */
  synchronized: boolean;
}

/**
 * Render options
 */
export interface HybridRenderOptions {
  /**
   * HTML configuration (from template)
   */
  htmlConfig?: HtmlConfig;

  /**
   * Whether to skip SVG layer rendering
   */
  skipSvgLayer?: boolean;

  /**
   * Whether to skip HTML layer rendering
   */
  skipHtmlLayer?: boolean;

  /**
   * Custom SVG shape renderer
   */
  svgRenderer?: (node: NodeModel) => VNode;
}

/**
 * Hybrid Renderer
 * Phase 3.5: Coordinates SVG and HTML layer rendering with synchronized transforms
 *
 * Architecture:
 * - SVG Layer: Geometric shapes, ports, connections (performance)
 * - HTML Layer: Rich content, templates, interactivity (flexibility)
 * - Both layers synchronized in position, rotation, scale
 * - Z-index management for layering control
 * - Pointer events coordination
 */
export class HybridRenderer {
  private cache = new Map<string, HybridRenderResult>();
  private disposed = false;

  /**
   * Render node to both SVG and HTML layers
   * @param node - Node to render
   * @param options - Rendering options
   * @returns Hybrid render result with synchronized layers
   */
  render(node: NodeModel, options: HybridRenderOptions = {}): HybridRenderResult {
    this.assertNotDisposed();

    // Check cache
    const cacheKey = this.getCacheKey(node);
    if (!node.isDirty && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    // Render both layers
    const svgLayer = options.skipSvgLayer
      ? this.createEmptySvgLayer(node)
      : this.renderSvgLayer(node, options);

    const htmlLayer = options.skipHtmlLayer
      ? this.createEmptyHtmlLayer(node)
      : this.renderHtmlLayer(node, options);

    // Synchronize transforms
    this.synchronizeTransforms(svgLayer, htmlLayer, node);

    const result: HybridRenderResult = {
      svgLayer,
      htmlLayer,
      nodeId: node.id,
      synchronized: true,
    };

    // Cache result
    this.cache.set(cacheKey, result);

    return result;
  }

  /**
   * Render SVG layer (geometric shape, ports)
   */
  private renderSvgLayer(node: NodeModel, options: HybridRenderOptions): VNode {
    // Use custom renderer if provided
    if (options.svgRenderer) {
      return options.svgRenderer(node);
    }

    // Get shape config
    const shapeConfig = node.getMetadata('shape') || { type: 'rect' };

    // Create SVG group with transform
    const vnode: VNode = {
      type: 'g',
      key: `node-${node.id}-svg-layer`,
      props: {
        id: `svg-layer-${node.id}`,
        'data-node-id': node.id,
        transform: this.buildSvgTransform(node),
        'transform-origin': 'center center',
        width: node.size.width,
        height: node.size.height,
      },
      children: [
        // Shape element (rect, circle, etc.)
        this.createShapeVNode(node, shapeConfig),
      ],
    };

    return vnode;
  }

  /**
   * Render HTML layer (rich content)
   */
  private renderHtmlLayer(node: NodeModel, options: HybridRenderOptions): HtmlLayer {
    const { htmlConfig } = options;

    // Base HTML layer with synchronized positioning
    const layer: HtmlLayer = {
      nodeId: node.id,
      className: this.buildHtmlClassName(htmlConfig),
      style: {
        ...this.buildHtmlStyles(node, htmlConfig),
        ...this.buildTransformStyles(node),
      },
    };

    // Add content if template provided
    if (htmlConfig?.mode === 'template' && htmlConfig.template) {
      // Simple template rendering (would use HtmlTemplateRenderer in production)
      layer.innerHTML = this.renderTemplate(htmlConfig.template, node);
    }

    return layer;
  }

  /**
   * Synchronize transforms between SVG and HTML layers
   */
  private synchronizeTransforms(svgLayer: VNode, htmlLayer: HtmlLayer, node: NodeModel): void {
    // SVG transform is already set in renderSvgLayer
    // Ensure HTML layer has matching transform
    if (!htmlLayer.style) {
      htmlLayer.style = {};
    }

    // Add transform styles
    Object.assign(htmlLayer.style, this.buildTransformStyles(node));
  }

  /**
   * Build SVG transform string
   */
  private buildSvgTransform(node: NodeModel): string {
    const transforms: string[] = [];

    // Translate
    transforms.push(`translate(${node.position.x}, ${node.position.y})`);

    // Rotate (around center)
    if (node.rotation !== 0) {
      const cx = node.size.width / 2;
      const cy = node.size.height / 2;
      transforms.push(`rotate(${node.rotation} ${cx} ${cy})`);
    }

    // Scale
    if (node.scale.x !== 1 || node.scale.y !== 1) {
      transforms.push(`scale(${node.scale.x}, ${node.scale.y})`);
    }

    return transforms.join(' ');
  }

  /**
   * Build HTML transform styles (CSS)
   */
  private buildTransformStyles(node: NodeModel): Record<string, any> {
    const transforms: string[] = [];

    // Translate
    transforms.push(`translate(${node.position.x}px, ${node.position.y}px)`);

    // Rotate
    if (node.rotation !== 0) {
      transforms.push(`rotate(${node.rotation}deg)`);
    }

    // Scale
    if (node.scale.x !== 1 || node.scale.y !== 1) {
      transforms.push(`scale(${node.scale.x}, ${node.scale.y})`);
    }

    return {
      transform: transforms.join(' '),
      transformOrigin: '50% 50%', // Rotate around center
      position: 'absolute',
      left: `${node.position.x}px`,
      top: `${node.position.y}px`,
      width: `${node.size.width}px`,
      height: `${node.size.height}px`,
    };
  }

  /**
   * Build HTML layer styles
   */
  private buildHtmlStyles(node: NodeModel, htmlConfig?: HtmlConfig): Record<string, any> {
    const styles: Record<string, any> = {
      position: 'absolute',
      left: `${node.position.x}px`,
      top: `${node.position.y}px`,
      width: `${node.size.width}px`,
      height: `${node.size.height}px`,
    };

    // Z-index
    if (htmlConfig?.zIndex !== undefined) {
      styles.zIndex = htmlConfig.zIndex;
    } else {
      styles.zIndex = 1; // Default above SVG
    }

    // Pointer events
    if (htmlConfig?.pointerEvents === false) {
      styles.pointerEvents = 'none';
    }

    // Custom styles from config
    if (htmlConfig?.style) {
      Object.assign(styles, htmlConfig.style);
    }

    return styles;
  }

  /**
   * Build HTML className
   */
  private buildHtmlClassName(htmlConfig?: HtmlConfig): string {
    const classes: string[] = ['hybrid-html-layer'];

    if (htmlConfig?.className) {
      if (Array.isArray(htmlConfig.className)) {
        classes.push(...htmlConfig.className);
      } else {
        classes.push(htmlConfig.className);
      }
    }

    return classes.join(' ');
  }

  /**
   * Create shape VNode based on shape config
   */
  private createShapeVNode(node: NodeModel, shapeConfig: any): VNode {
    const { width, height } = node.size;

    switch (shapeConfig.type) {
      case 'circle': {
        const radius = Math.min(width, height) / 2;
        return {
          type: 'circle',
          props: {
            cx: width / 2,
            cy: height / 2,
            r: radius,
            fill: shapeConfig.fill || '#fff',
            stroke: shapeConfig.stroke || '#333',
            strokeWidth: shapeConfig.strokeWidth || 1,
          },
        };
      }

      case 'ellipse': {
        return {
          type: 'ellipse',
          props: {
            cx: width / 2,
            cy: height / 2,
            rx: width / 2,
            ry: height / 2,
            fill: shapeConfig.fill || '#fff',
            stroke: shapeConfig.stroke || '#333',
            strokeWidth: shapeConfig.strokeWidth || 1,
          },
        };
      }

      case 'diamond': {
        const cx = width / 2;
        const cy = height / 2;
        const points = `${cx},0 ${width},${cy} ${cx},${height} 0,${cy}`;
        return {
          type: 'polygon',
          props: {
            points,
            fill: shapeConfig.fill || '#fff',
            stroke: shapeConfig.stroke || '#333',
            strokeWidth: shapeConfig.strokeWidth || 1,
          },
        };
      }

      case 'hexagon': {
        const w = width;
        const h = height;
        const points = [
          `${w * 0.5},0`,
          `${w},${h * 0.25}`,
          `${w},${h * 0.75}`,
          `${w * 0.5},${h}`,
          `0,${h * 0.75}`,
          `0,${h * 0.25}`,
        ].join(' ');

        return {
          type: 'polygon',
          props: {
            points,
            fill: shapeConfig.fill || '#fff',
            stroke: shapeConfig.stroke || '#333',
            strokeWidth: shapeConfig.strokeWidth || 1,
          },
        };
      }

      case 'rect':
      default: {
        return {
          type: 'rect',
          props: {
            x: 0,
            y: 0,
            width,
            height,
            rx: shapeConfig.cornerRadius || 0,
            fill: shapeConfig.fill || '#fff',
            stroke: shapeConfig.stroke || '#333',
            strokeWidth: shapeConfig.strokeWidth || 1,
          },
        };
      }
    }
  }

  /**
   * Simple template rendering (placeholder)
   * In production, would use HtmlTemplateRenderer from Phase 3.4
   */
  private renderTemplate(template: string, node: NodeModel): string {
    let html = template;

    // Simple {{variable}} replacement
    html = html.replace(/\{\{([^}]+)\}\}/g, (match, expression) => {
      const value = this.getValueByPath(node, expression.trim());
      return value != null ? String(value) : '';
    });

    return html;
  }

  /**
   * Get value from node by path
   */
  private getValueByPath(node: NodeModel, path: string): any {
    const parts = path.split('.');
    let value: any = node;

    for (const part of parts) {
      if (value == null) {
        return undefined;
      }
      value = value[part];
    }

    return value;
  }

  /**
   * Create empty SVG layer
   */
  private createEmptySvgLayer(node: NodeModel): VNode {
    return {
      type: 'g',
      key: `node-${node.id}-svg-layer-empty`,
      props: {
        id: `svg-layer-${node.id}`,
      },
      children: [],
    };
  }

  /**
   * Create empty HTML layer
   */
  private createEmptyHtmlLayer(node: NodeModel): HtmlLayer {
    return {
      nodeId: node.id,
      style: {
        display: 'none',
      },
    };
  }

  /**
   * Get cache key for node
   */
  private getCacheKey(node: NodeModel): string {
    return `hybrid-${node.id}-${node.position.x}-${node.position.y}-${node.rotation}-${node.scale.x}-${node.scale.y}`;
  }

  /**
   * Assert renderer is not disposed
   */
  private assertNotDisposed(): void {
    if (this.disposed) {
      throw new Error('HybridRenderer has been disposed and cannot be used');
    }
  }

  /**
   * Dispose renderer and cleanup resources
   */
  dispose(): void {
    this.cache.clear();
    this.disposed = true;
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}
