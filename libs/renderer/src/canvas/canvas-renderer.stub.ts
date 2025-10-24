import type {
  IRenderer,
  RendererCapabilities,
  RendererConfig,
  CanvasRendererConfig,
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
 * Canvas renderer stub for Phase A.
 * This is a placeholder implementation that throws errors.
 * Full implementation comes in Phase B.
 */
export class CanvasRenderer implements IRenderer {
  readonly type = 'canvas';
  readonly capabilities: RendererCapabilities = {
    supportsHitTest: false, // Phase B
    supportsBatching: true,
    supportsExport: false, // Phase B
    supportsMeasurement: false, // Phase B
    supportsForeignObject: false, // Canvas doesn't support this
    supportsFilters: false, // Phase B
    supportsOffscreen: true,
  };

  constructor(private config: CanvasRendererConfig) {}

  initialize(container: HTMLElement, config: RendererConfig): void {
    throw new Error('CanvasRenderer is not implemented in Phase A. Coming in Phase B.');
  }

  async render(vnode: VNode, options?: RenderOptions): Promise<void> {
    throw new Error('CanvasRenderer is not implemented in Phase A. Coming in Phase B.');
  }

  async update(updates: NodeUpdate[]): Promise<void> {
    throw new Error('CanvasRenderer is not implemented in Phase A. Coming in Phase B.');
  }

  clear(): void {
    throw new Error('CanvasRenderer is not implemented in Phase A. Coming in Phase B.');
  }

  measureText(text: string, style: TextStyle): TextMetrics {
    throw new Error('CanvasRenderer is not implemented in Phase A. Coming in Phase B.');
  }

  measureElement(vnode: VNode): BoundingBox {
    throw new Error('CanvasRenderer is not implemented in Phase A. Coming in Phase B.');
  }

  hitTest(x: number, y: number): VNode | null {
    throw new Error('CanvasRenderer is not implemented in Phase A. Coming in Phase B.');
  }

  async export(format: ExportFormat, options?: ExportOptions): Promise<string> {
    throw new Error('CanvasRenderer is not implemented in Phase A. Coming in Phase B.');
  }

  destroy(): void {
    // No-op in stub - nothing to clean up
  }
}
