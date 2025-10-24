import type { IRenderer, RendererCapabilities } from '../../../../../renderer/src/core/renderer.interface';
import type { VNode } from '@grafloria/renderer';

/**
 * MockRenderer
 *
 * Configurable mock renderer for integration tests.
 * Tracks render calls and provides customizable behavior.
 */
export class MockRenderer implements IRenderer {
  type: string;
  capabilities: RendererCapabilities;

  // Tracking
  renderCount = 0;
  updateCount = 0;
  clearCount = 0;
  lastVNode: VNode | null = null;
  renderTimes: number[] = [];

  // Configuration
  private renderDelay = 0;
  private shouldThrowOnRender = false;
  private customRenderBehavior?: (vnode: VNode) => void | Promise<void>;

  constructor(
    type: string,
    capabilities?: Partial<RendererCapabilities>
  ) {
    this.type = type;
    this.capabilities = {
      supportsHitTest: true,
      supportsBatching: true,
      supportsExport: true,
      supportsMeasurement: true,
      supportsForeignObject: type === 'svg',
      supportsFilters: true,
      supportsOffscreen: true,
      ...capabilities,
    };
  }

  initialize(): void {
    // Mock initialization
  }

  async render(vnode: VNode): Promise<void> {
    const start = performance.now();

    if (this.shouldThrowOnRender) {
      throw new Error('Mock render error');
    }

    this.renderCount++;
    this.lastVNode = vnode;

    if (this.renderDelay > 0) {
      await this.delay(this.renderDelay);
    }

    if (this.customRenderBehavior) {
      await this.customRenderBehavior(vnode);
    }

    const elapsed = performance.now() - start;
    this.renderTimes.push(elapsed);
  }

  async update(vnode: VNode): Promise<void> {
    this.updateCount++;
    this.lastVNode = vnode;

    if (this.renderDelay > 0) {
      await this.delay(this.renderDelay);
    }
  }

  clear(): void {
    this.clearCount++;
    this.lastVNode = null;
  }

  measureText(text: string, style?: any): any {
    return {
      width: text.length * 8,
      height: 16,
      baseline: 12,
    };
  }

  measureElement(vnode: VNode): any {
    return {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    };
  }

  hitTest(x: number, y: number): VNode | null {
    return null;
  }

  async export(format?: string): Promise<string> {
    return `data:image/${format || 'png'};base64,mockdata`;
  }

  destroy(): void {
    this.reset();
  }

  // Test utilities

  /**
   * Set render delay (simulates slow rendering).
   */
  setRenderDelay(ms: number): this {
    this.renderDelay = ms;
    return this;
  }

  /**
   * Make render() throw an error.
   */
  setShouldThrowOnRender(shouldThrow: boolean): this {
    this.shouldThrowOnRender = shouldThrow;
    return this;
  }

  /**
   * Set custom render behavior.
   */
  setCustomRenderBehavior(fn: (vnode: VNode) => void | Promise<void>): this {
    this.customRenderBehavior = fn;
    return this;
  }

  /**
   * Get average render time.
   */
  getAverageRenderTime(): number {
    if (this.renderTimes.length === 0) return 0;
    return this.renderTimes.reduce((a, b) => a + b, 0) / this.renderTimes.length;
  }

  /**
   * Reset all counters and state.
   */
  reset(): this {
    this.renderCount = 0;
    this.updateCount = 0;
    this.clearCount = 0;
    this.lastVNode = null;
    this.renderTimes = [];
    return this;
  }

  /**
   * Assert that render was called.
   */
  assertRenderCalled(times?: number): void {
    if (times !== undefined && this.renderCount !== times) {
      throw new Error(`Expected render to be called ${times} times, but was called ${this.renderCount} times`);
    }
    if (times === undefined && this.renderCount === 0) {
      throw new Error('Expected render to be called but it was not');
    }
  }

  /**
   * Assert that a specific VNode was rendered.
   */
  assertVNodeRendered(vnode: VNode): void {
    if (this.lastVNode !== vnode) {
      throw new Error('Expected VNode was not rendered');
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Create a mock SVG renderer.
 */
export function createMockSVGRenderer(): MockRenderer {
  return new MockRenderer('svg', {
    supportsForeignObject: true,
    supportsFilters: true,
  });
}

/**
 * Create a mock Canvas renderer.
 */
export function createMockCanvasRenderer(): MockRenderer {
  return new MockRenderer('canvas', {
    supportsForeignObject: false,
    supportsOffscreen: true,
  });
}

/**
 * Create a mock WebGL renderer.
 */
export function createMockWebGLRenderer(): MockRenderer {
  return new MockRenderer('webgl', {
    supportsForeignObject: false,
    supportsOffscreen: true,
    supportsFilters: false,
  });
}
