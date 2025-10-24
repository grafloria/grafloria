import type {
  IRenderer,
  RendererCapabilities,
  RendererConfig,
  SVGRendererConfig,
  RenderOptions,
  NodeUpdate,
  TextStyle,
  TextMetrics,
  BoundingBox,
  ExportFormat,
  ExportOptions,
} from '../core/renderer.interface';
import type { VNode } from '../types/vnode.types';

/**
 * SVG Renderer implementing IRenderer interface
 * Renders VNode trees to SVG elements with full lifecycle support
 */
export class SVGRendererV2 implements IRenderer {
  readonly type = 'svg';
  readonly capabilities: RendererCapabilities = {
    supportsHitTest: true,
    supportsBatching: false,
    supportsExport: true,
    supportsMeasurement: true,
    supportsForeignObject: true,
    supportsFilters: true,
    supportsOffscreen: false,
  };

  private svgElement: SVGSVGElement | null = null;
  private container: HTMLElement | null = null;
  private currentVNode: VNode | null = null;
  private measurementCache = new Map<string, TextMetrics>();
  private elementCache = new Map<string, SVGElement>();
  private initialized = false;

  constructor(private config: SVGRendererConfig) {}

  initialize(container: HTMLElement, config: RendererConfig): void {
    if (this.initialized) {
      throw new Error('Renderer already initialized. Call destroy() first.');
    }

    if (!container) {
      throw new Error('Container element is required');
    }

    this.container = container;

    // Create SVG element
    this.svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svgElement.setAttribute('width', config.width.toString());
    this.svgElement.setAttribute('height', config.height.toString());

    // Apply SVG-specific config
    const svgConfig = this.config;
    if (svgConfig.preserveAspectRatio) {
      this.svgElement.setAttribute('preserveAspectRatio', svgConfig.preserveAspectRatio);
    }

    if (svgConfig.cssNamespace) {
      this.svgElement.setAttribute('class', `${svgConfig.cssNamespace}-diagram`);
    }

    // Apply pixel ratio for high-DPI displays
    if (config.pixelRatio && config.pixelRatio !== 1) {
      const ratio = config.pixelRatio;
      this.svgElement.setAttribute('width', (config.width * ratio).toString());
      this.svgElement.setAttribute('height', (config.height * ratio).toString());
      this.svgElement.style.width = `${config.width}px`;
      this.svgElement.style.height = `${config.height}px`;
    }

    container.appendChild(this.svgElement);
    this.initialized = true;

    if (config.debug) {
      console.log('[SVGRenderer] Initialized', { width: config.width, height: config.height });
    }
  }

  async render(vnode: VNode, options?: RenderOptions): Promise<void> {
    if (!this.initialized || !this.svgElement) {
      throw new Error('Renderer not initialized. Call initialize() first.');
    }

    const skipUnchanged = options?.skipUnchanged ?? true;

    // Skip if VNode unchanged and caching enabled
    if (skipUnchanged && this.currentVNode === vnode && this.config.enableCaching) {
      return;
    }

    this.onBeforeRender?.(vnode);

    // Clear and render
    this.clear();

    const svgNode = this.vnodeToSVG(vnode);
    if (svgNode) {
      this.svgElement.appendChild(svgNode);
    }

    this.currentVNode = vnode;

    this.onAfterRender?.(vnode);
  }

  async update(updates: NodeUpdate[]): Promise<void> {
    if (!this.initialized || !this.svgElement) {
      throw new Error('Renderer not initialized. Call initialize() first.');
    }

    for (const update of updates) {
      const node = this.findNodeByPath(this.currentVNode, update.path);
      if (node) {
        // Update the node in place
        Object.assign(node, update.vnode);
      }
    }

    // Re-render with updated VNode tree
    if (this.currentVNode) {
      await this.render(this.currentVNode, { skipUnchanged: false });
    }
  }

  clear(): void {
    if (this.svgElement) {
      // Remove all children
      while (this.svgElement.firstChild) {
        this.svgElement.removeChild(this.svgElement.firstChild);
      }
    }
    this.elementCache.clear();
  }

  measureText(text: string, style: TextStyle): TextMetrics {
    const cacheKey = JSON.stringify({ text, style });

    if (this.config.enableCaching !== false && this.measurementCache.has(cacheKey)) {
      return this.measurementCache.get(cacheKey)!;
    }

    if (!this.svgElement) {
      throw new Error('Renderer not initialized. Call initialize() first.');
    }

    // Create temporary text element for measurement
    const textElement = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    textElement.textContent = text;

    if (style.fontFamily) textElement.style.fontFamily = style.fontFamily;
    if (style.fontSize) textElement.style.fontSize = `${style.fontSize}px`;
    if (style.fontWeight) textElement.style.fontWeight = style.fontWeight.toString();
    if (style.fontStyle) textElement.style.fontStyle = style.fontStyle;
    if (style.letterSpacing) textElement.style.letterSpacing = `${style.letterSpacing}px`;

    this.svgElement.appendChild(textElement);
    const bbox = textElement.getBBox();
    this.svgElement.removeChild(textElement);

    const metrics: TextMetrics = {
      width: bbox.width,
      height: bbox.height,
      baseline: bbox.height * 0.8, // Approximation
    };

    if (this.config.enableCaching !== false) {
      this.measurementCache.set(cacheKey, metrics);

      // Limit cache size
      const maxSize = this.config.maxCacheSize ?? 1000;
      if (this.measurementCache.size > maxSize) {
        // Remove oldest entry
        const firstKey = this.measurementCache.keys().next().value;
        this.measurementCache.delete(firstKey);
      }
    }

    return metrics;
  }

  measureElement(vnode: VNode): BoundingBox {
    if (!this.svgElement) {
      throw new Error('Renderer not initialized. Call initialize() first.');
    }

    // Create temporary element for measurement
    const element = this.vnodeToSVG(vnode);
    if (!element) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    this.svgElement.appendChild(element);
    const bbox = element.getBBox();
    this.svgElement.removeChild(element);

    return {
      x: bbox.x,
      y: bbox.y,
      width: bbox.width,
      height: bbox.height,
    };
  }

  hitTest(x: number, y: number): VNode | null {
    if (!this.svgElement) {
      return null;
    }

    const point = this.svgElement.createSVGPoint();
    point.x = x;
    point.y = y;

    const element = document.elementFromPoint(x, y);
    if (!element || !this.svgElement.contains(element as Node)) {
      return null;
    }

    // Find VNode by traversing element and checking data attributes
    const key = element.getAttribute('data-vnode-key');
    if (key && this.currentVNode) {
      return this.findVNodeByKey(this.currentVNode, key);
    }

    return null;
  }

  async export(format: ExportFormat, options?: ExportOptions): Promise<string> {
    if (!this.svgElement) {
      throw new Error('Renderer not initialized. Call initialize() first.');
    }

    if (format === 'svg') {
      return new XMLSerializer().serializeToString(this.svgElement);
    }

    if (format === 'png' || format === 'jpeg' || format === 'webp') {
      return this.svgToImage(format, options);
    }

    throw new Error(`Unsupported export format: ${format}`);
  }

  destroy(): void {
    if (this.svgElement && this.container) {
      this.container.removeChild(this.svgElement);
    }

    this.svgElement = null;
    this.container = null;
    this.currentVNode = null;
    this.measurementCache.clear();
    this.elementCache.clear();
    this.initialized = false;
  }

  /**
   * Convert VNode to SVG element
   */
  private vnodeToSVG(vnode: VNode): SVGElement | null {
    if (!vnode || !vnode.type) {
      return null;
    }

    // Check cache if enabled
    if (this.config.enableCaching !== false && vnode.key) {
      const cached = this.elementCache.get(vnode.key);
      if (cached) {
        return cached.cloneNode(true) as SVGElement;
      }
    }

    const element = document.createElementNS('http://www.w3.org/2000/svg', vnode.type);

    // Apply props as attributes
    if (vnode.props) {
      Object.entries(vnode.props).forEach(([key, value]) => {
        if (key === 'textContent') {
          element.textContent = value as string;
        } else if (key === 'className') {
          element.setAttribute('class', value as string);
        } else if (key === 'style' && typeof value === 'object') {
          Object.entries(value).forEach(([styleKey, styleValue]) => {
            (element.style as any)[styleKey] = styleValue;
          });
        } else if (key.startsWith('on')) {
          // Skip event handlers in VNode-to-DOM conversion
          // These should be handled by the framework layer
        } else if (typeof value !== 'function' && value !== undefined && value !== null) {
          // Convert camelCase to kebab-case for SVG attributes
          const attrName = key.replace(/([A-Z])/g, '-$1').toLowerCase();
          element.setAttribute(attrName, value.toString());
        }
      });
    }

    // Add data attribute for hit testing
    if (vnode.key) {
      element.setAttribute('data-vnode-key', vnode.key);
    }

    // Render children
    if (vnode.children && vnode.children.length > 0) {
      vnode.children.forEach(child => {
        const childElement = this.vnodeToSVG(child);
        if (childElement) {
          element.appendChild(childElement);
        }
      });
    }

    // Cache if enabled
    if (this.config.enableCaching !== false && vnode.key) {
      this.elementCache.set(vnode.key, element.cloneNode(true) as SVGElement);

      // Limit cache size
      const maxSize = this.config.maxCacheSize ?? 1000;
      if (this.elementCache.size > maxSize) {
        const firstKey = this.elementCache.keys().next().value;
        this.elementCache.delete(firstKey);
      }
    }

    return element;
  }

  /**
   * Convert SVG to image data URL
   */
  private async svgToImage(format: ExportFormat, options?: ExportOptions): Promise<string> {
    if (!this.svgElement) {
      throw new Error('SVG element not available');
    }

    const scale = options?.scale ?? 1;
    const quality = options?.quality ?? 0.92;
    const backgroundColor = options?.backgroundColor ?? 'transparent';

    // Serialize SVG
    const svgData = new XMLSerializer().serializeToString(this.svgElement);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    return new Promise((resolve, reject) => {
      const img = new Image();

      img.onload = () => {
        const canvas = document.createElement('canvas');
        const width = this.svgElement!.clientWidth || parseInt(this.svgElement!.getAttribute('width') || '800');
        const height = this.svgElement!.clientHeight || parseInt(this.svgElement!.getAttribute('height') || '600');

        canvas.width = width * scale;
        canvas.height = height * scale;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        // Apply background color if not transparent
        if (backgroundColor !== 'transparent') {
          ctx.fillStyle = backgroundColor;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0);

        URL.revokeObjectURL(url);

        let mimeType = 'image/png';
        if (format === 'jpeg') mimeType = 'image/jpeg';
        if (format === 'webp') mimeType = 'image/webp';

        resolve(canvas.toDataURL(mimeType, quality));
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load SVG image'));
      };

      img.src = url;
    });
  }

  /**
   * Find VNode by path (e.g., 'children.0.children.2')
   */
  private findNodeByPath(vnode: VNode | null, path: string): VNode | null {
    if (!vnode) return null;

    const parts = path.split('.');
    let current: any = vnode;

    for (const part of parts) {
      if (current[part] === undefined) {
        return null;
      }
      current = current[part];
    }

    return current as VNode;
  }

  /**
   * Find VNode by key recursively
   */
  private findVNodeByKey(vnode: VNode, key: string): VNode | null {
    if (vnode.key === key) {
      return vnode;
    }

    if (vnode.children) {
      for (const child of vnode.children) {
        const found = this.findVNodeByKey(child, key);
        if (found) {
          return found;
        }
      }
    }

    return null;
  }
}
