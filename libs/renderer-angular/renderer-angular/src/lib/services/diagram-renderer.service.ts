import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { RendererStrategyManager } from '@grafloria/renderer';
import type {
  IRenderer,
  RendererConfig,
  RendererCapabilities,
} from '../../../../../renderer/src/core/renderer.interface';
import type { RendererChangeEvent } from '../../../../../renderer/src/core/renderer-strategy-manager';
import type { VNode } from '@grafloria/renderer';

/**
 * Criteria for renderer recommendation
 */
export interface RecommendationCriteria {
  /** Number of nodes in diagram */
  nodeCount?: number;

  /** Whether diagram requires foreignObject (HTML embedding) */
  requiresForeignObject?: boolean;

  /** Whether diagram has complex animations */
  hasAnimations?: boolean;

  /** Target frame rate (default: 60) */
  targetFps?: number;

  /** Whether export is frequently used */
  frequentExport?: boolean;

  /** Whether hit testing is critical */
  requiresHitTesting?: boolean;
}

/**
 * Renderer recommendation result
 */
export interface RendererRecommendation {
  /** Recommended renderer type */
  recommendedRenderer: string;

  /** Confidence level 0-1 */
  confidence: number;

  /** Human-readable reason for recommendation */
  reason: string;

  /** Alternative renderers with their scores */
  alternatives: Array<{
    renderer: string;
    score: number;
    pros: string[];
    cons: string[];
  }>;
}

/**
 * Performance benchmark result
 */
export interface PerformanceBenchmark {
  /** Renderer type that was benchmarked */
  rendererType: string;

  /** Number of iterations */
  iterations: number;

  /** Average render time in milliseconds */
  avgRenderTime: number;

  /** Minimum render time */
  minRenderTime: number;

  /** Maximum render time */
  maxRenderTime: number;

  /** Standard deviation */
  stdDeviation: number;

  /** Frames per second (if applicable) */
  fps?: number;

  /** Memory usage in bytes (if available) */
  memoryUsage?: number;
}

/**
 * Auto-switch configuration
 */
export interface AutoSwitchConfig {
  /** Node count threshold for switching */
  nodeSizeThreshold?: number;

  /** Check interval in milliseconds */
  checkInterval?: number;

  /** Minimum confidence level for auto-switch */
  minConfidence?: number;

  /** Enable performance-based switching */
  enablePerformanceSwitch?: boolean;
}

/**
 * DiagramRendererService
 *
 * High-level Angular service for managing diagram renderers.
 * Wraps RendererStrategyManager with Angular-specific features.
 *
 * Features:
 * - Simple API for renderer switching
 * - Renderer recommendation system
 * - Performance benchmarking
 * - Auto-switch based on criteria
 * - RxJS observables for state changes
 *
 * @example
 * ```typescript
 * constructor(private rendererService: DiagramRendererService) {}
 *
 * ngOnInit() {
 *   // Register renderers
 *   this.rendererService.registerRenderer('svg', svgRenderer);
 *   this.rendererService.registerRenderer('canvas', canvasRenderer);
 *
 *   // Get recommendation
 *   const rec = this.rendererService.getRecommendation({ nodeCount: 500 });
 *   console.log(`Recommended: ${rec.recommendedRenderer}`);
 *
 *   // Switch to recommended renderer
 *   await this.rendererService.switchRenderer(rec.recommendedRenderer, container);
 * }
 * ```
 */
@Injectable({ providedIn: 'root' })
export class DiagramRendererService implements OnDestroy {
  private strategyManager = new RendererStrategyManager();
  private rendererChangedSubject = new BehaviorSubject<RendererChangeEvent | null>(null);
  private autoSwitchEnabled = false;
  private autoSwitchInterval: any = null;
  private autoSwitchConfig: AutoSwitchConfig = {};
  private autoSwitchContainer: HTMLElement | null = null;

  /**
   * Observable of renderer change events.
   * Emits whenever the active renderer changes.
   */
  readonly rendererChanged$ = this.rendererChangedSubject.asObservable();

  constructor() {
    // Subscribe to strategy manager events
    this.strategyManager.onRendererChange(event => {
      this.rendererChangedSubject.next(event);
    });
  }

  ngOnDestroy(): void {
    this.destroy();
  }

  // ============================================================================
  // Renderer Management
  // ============================================================================

  /**
   * Register a renderer instance.
   *
   * @param type - Renderer type identifier (e.g., 'svg', 'canvas')
   * @param renderer - Renderer instance
   *
   * @example
   * ```typescript
   * const svgRenderer = RendererFactory.createRenderer('svg', config);
   * rendererService.registerRenderer('svg', svgRenderer);
   * ```
   */
  registerRenderer(type: string, renderer: IRenderer): void {
    this.strategyManager.registerRenderer(type, renderer);
  }

  /**
   * Switch to a different renderer.
   * Preserves diagram state during switch.
   *
   * @param type - Renderer type to switch to
   * @param container - DOM container element
   * @param config - Optional renderer configuration
   * @returns Promise that resolves when switch completes
   *
   * @example
   * ```typescript
   * await rendererService.switchRenderer('canvas', containerElement, {
   *   width: 1920,
   *   height: 1080
   * });
   * ```
   */
  async switchRenderer(
    type: string,
    container: HTMLElement,
    config?: RendererConfig
  ): Promise<void> {
    await this.strategyManager.switchRenderer(type, container, config);
  }

  /**
   * Get currently active renderer.
   *
   * @returns Active renderer or null
   */
  getActiveRenderer(): IRenderer | null {
    return this.strategyManager.getActiveRenderer();
  }

  /**
   * Get renderer by type.
   *
   * @param type - Renderer type
   * @returns Renderer instance or null
   */
  getRenderer(type: string): IRenderer | null {
    return this.strategyManager.getRenderer(type);
  }

  /**
   * Get list of registered renderer types.
   *
   * @returns Array of renderer type identifiers
   */
  getRegisteredRenderers(): string[] {
    return this.strategyManager.getRegisteredTypes();
  }

  /**
   * Render VNode tree with active renderer.
   *
   * @param vnode - Virtual node tree to render
   * @returns Promise that resolves when rendering completes
   * @throws Error if no active renderer
   */
  async render(vnode: VNode): Promise<void> {
    const renderer = this.getActiveRenderer();

    if (!renderer) {
      throw new Error('No active renderer. Call switchRenderer() first.');
    }

    await renderer.render(vnode);
    this.strategyManager.updateVNode(vnode);
  }

  // ============================================================================
  // Capabilities
  // ============================================================================

  /**
   * Get capabilities of active renderer.
   *
   * @returns Renderer capabilities or null
   */
  getCapabilities(): RendererCapabilities | null {
    const renderer = this.getActiveRenderer();
    return renderer ? renderer.capabilities : null;
  }

  /**
   * Check if active renderer supports a feature.
   *
   * @param feature - Feature to check
   * @returns True if supported, false otherwise
   *
   * @example
   * ```typescript
   * if (rendererService.supportsFeature('foreignObject')) {
   *   // Embed HTML components
   * }
   * ```
   */
  supportsFeature(feature: keyof RendererCapabilities): boolean {
    const capabilities = this.getCapabilities();
    return capabilities ? capabilities[feature] : false;
  }

  // ============================================================================
  // Recommendation System
  // ============================================================================

  /**
   * Get renderer recommendation based on criteria.
   *
   * @param criteria - Diagram characteristics and requirements
   * @returns Recommendation with confidence and reasoning
   *
   * @example
   * ```typescript
   * const rec = rendererService.getRecommendation({
   *   nodeCount: 500,
   *   requiresForeignObject: true
   * });
   *
   * if (rec.confidence > 0.8) {
   *   await rendererService.switchRenderer(rec.recommendedRenderer, container);
   * }
   * ```
   */
  getRecommendation(criteria: RecommendationCriteria): RendererRecommendation {
    const {
      nodeCount = 0,
      requiresForeignObject = false,
      hasAnimations = false,
      targetFps = 60,
      frequentExport = false,
      requiresHitTesting = false,
    } = criteria;

    const registeredTypes = this.getRegisteredRenderers();
    const scores: Record<string, number> = {};
    const reasons: Record<string, { pros: string[]; cons: string[] }> = {};

    // Score each renderer
    for (const type of registeredTypes) {
      const renderer = this.getRenderer(type);
      if (!renderer) continue;

      let score = 0.5; // Base score
      const pros: string[] = [];
      const cons: string[] = [];

      // SVG scoring
      if (type === 'svg') {
        // SVG is best for small-medium diagrams
        if (nodeCount < 500) {
          score += 0.3;
          pros.push('Excellent for small to medium diagrams');
        } else if (nodeCount > 2000) {
          score -= 0.2;
          cons.push('May have performance issues with large diagrams');
        }

        // foreignObject support
        if (requiresForeignObject) {
          score += 0.4;
          pros.push('Supports HTML embedding via foreignObject');
        }

        // Export quality
        if (frequentExport) {
          score += 0.2;
          pros.push('Crisp vector export');
        }

        // Accessibility
        pros.push('Accessible to screen readers');

        // CSS styling
        pros.push('Can use CSS styling');
      }

      // Canvas scoring
      if (type === 'canvas') {
        // Canvas is best for large diagrams
        if (nodeCount > 1000) {
          score += 0.3;
          pros.push('Excellent performance for large diagrams');
        } else if (nodeCount < 200) {
          score -= 0.1;
          cons.push('Overkill for small diagrams');
        }

        // No foreignObject support
        if (requiresForeignObject) {
          score -= 0.5;
          cons.push('Cannot embed HTML content');
        }

        // Animations
        if (hasAnimations) {
          score += 0.2;
          pros.push('Smooth animations with Canvas API');
        }

        // Hit testing
        if (requiresHitTesting && renderer.capabilities.supportsHitTest) {
          score += 0.1;
          pros.push('Fast pixel-based hit testing');
        }

        // Export
        if (frequentExport && renderer.capabilities.supportsExport) {
          pros.push('Raster export (PNG, JPEG)');
        } else if (frequentExport) {
          cons.push('Export not yet implemented in Phase A');
        }
      }

      // Capabilities check
      if (requiresHitTesting && !renderer.capabilities.supportsHitTest) {
        score -= 0.2;
        cons.push('Hit testing not available');
      }

      scores[type] = Math.max(0, Math.min(1, score));
      reasons[type] = { pros, cons };
    }

    // Find best renderer
    let bestRenderer = registeredTypes[0] || 'svg';
    let bestScore = scores[bestRenderer] || 0;

    for (const type of registeredTypes) {
      if (scores[type] > bestScore) {
        bestScore = scores[type];
        bestRenderer = type;
      }
    }

    // Build alternatives list
    const alternatives = registeredTypes
      .filter(type => type !== bestRenderer)
      .map(type => ({
        renderer: type,
        score: scores[type] || 0,
        pros: reasons[type]?.pros || [],
        cons: reasons[type]?.cons || [],
      }))
      .sort((a, b) => b.score - a.score);

    // Build reason string
    const bestReasons = reasons[bestRenderer];
    let reason = `${bestRenderer.toUpperCase()} is recommended`;

    if (bestReasons && bestReasons.pros.length > 0) {
      reason += `: ${bestReasons.pros[0]}`;
    }

    return {
      recommendedRenderer: bestRenderer,
      confidence: bestScore,
      reason,
      alternatives,
    };
  }

  // ============================================================================
  // Performance Benchmarking
  // ============================================================================

  /**
   * Benchmark renderer performance.
   *
   * @param vnode - VNode to render for benchmarking
   * @param options - Benchmark options
   * @returns Performance metrics
   *
   * @example
   * ```typescript
   * const benchmark = await rendererService.benchmarkRenderer(vnode, {
   *   iterations: 100
   * });
   *
   * console.log(`Average render time: ${benchmark.avgRenderTime}ms`);
   * ```
   */
  async benchmarkRenderer(
    vnode: VNode,
    options: { iterations?: number } = {}
  ): Promise<PerformanceBenchmark> {
    const renderer = this.getActiveRenderer();

    if (!renderer) {
      throw new Error('No active renderer');
    }

    const iterations = options.iterations || 10;
    const times: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();

      try {
        await renderer.render(vnode);
      } catch (error) {
        // Ignore render errors in benchmark
        console.warn('Benchmark render error:', error);
      }

      const end = performance.now();
      times.push(end - start);
    }

    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const min = Math.min(...times);
    const max = Math.max(...times);

    // Calculate standard deviation
    const variance = times.reduce((sum, time) => sum + Math.pow(time - avg, 2), 0) / times.length;
    const stdDev = Math.sqrt(variance);

    // Calculate FPS (if render time is consistent)
    const fps = avg > 0 ? 1000 / avg : 0;

    return {
      rendererType: renderer.type,
      iterations,
      avgRenderTime: avg,
      minRenderTime: min,
      maxRenderTime: max,
      stdDeviation: stdDev,
      fps,
    };
  }

  /**
   * Compare performance of multiple renderers.
   *
   * @param vnode - VNode to render for comparison
   * @param rendererTypes - Renderer types to compare
   * @returns Array of benchmarks sorted by performance
   *
   * @example
   * ```typescript
   * const comparison = await rendererService.compareRenderers(vnode, ['svg', 'canvas']);
   * const fastest = comparison[0];
   * console.log(`Fastest: ${fastest.rendererType}`);
   * ```
   */
  async compareRenderers(
    vnode: VNode,
    rendererTypes: string[]
  ): Promise<PerformanceBenchmark[]> {
    const container = this.autoSwitchContainer || document.createElement('div');
    const originalRenderer = this.getActiveRenderer();
    const results: PerformanceBenchmark[] = [];

    for (const type of rendererTypes) {
      try {
        await this.switchRenderer(type, container);
        const benchmark = await this.benchmarkRenderer(vnode);
        results.push(benchmark);
      } catch (error) {
        console.error(`Failed to benchmark ${type}:`, error);
      }
    }

    // Restore original renderer
    if (originalRenderer) {
      await this.switchRenderer(originalRenderer.type, container);
    }

    // Sort by average render time (ascending)
    return results.sort((a, b) => a.avgRenderTime - b.avgRenderTime);
  }

  // ============================================================================
  // Auto-Switch
  // ============================================================================

  /**
   * Enable automatic renderer switching based on criteria.
   *
   * @param container - DOM container for renderers
   * @param config - Auto-switch configuration
   *
   * @example
   * ```typescript
   * rendererService.enableAutoSwitch(container, {
   *   nodeSizeThreshold: 1000,
   *   checkInterval: 1000,
   *   minConfidence: 0.7
   * });
   * ```
   */
  enableAutoSwitch(container: HTMLElement, config: AutoSwitchConfig = {}): void {
    this.autoSwitchEnabled = true;
    this.autoSwitchContainer = container;
    this.autoSwitchConfig = {
      nodeSizeThreshold: config.nodeSizeThreshold || 500,
      checkInterval: config.checkInterval || 5000,
      minConfidence: config.minConfidence || 0.7,
      enablePerformanceSwitch: config.enablePerformanceSwitch !== false,
    };

    // Start checking periodically
    this.autoSwitchInterval = setInterval(() => {
      this.checkAutoSwitch();
    }, this.autoSwitchConfig.checkInterval);
  }

  /**
   * Disable automatic renderer switching.
   */
  disableAutoSwitch(): void {
    this.autoSwitchEnabled = false;

    if (this.autoSwitchInterval) {
      clearInterval(this.autoSwitchInterval);
      this.autoSwitchInterval = null;
    }
  }

  /**
   * Check if auto-switch is enabled.
   */
  isAutoSwitchEnabled(): boolean {
    return this.autoSwitchEnabled;
  }

  /**
   * Manually trigger auto-switch check.
   * Evaluates current diagram and switches if needed.
   * @internal - Exposed for testing
   */
  async checkAutoSwitch(): Promise<void> {
    if (!this.autoSwitchEnabled || !this.autoSwitchContainer) {
      return;
    }

    const currentVNode = this.strategyManager.getCurrentVNode();
    if (!currentVNode) {
      return;
    }

    // Count nodes
    const nodeCount = this.countNodes(currentVNode);

    // Get recommendation
    const recommendation = this.getRecommendation({ nodeCount });

    // Check if should switch
    const activeRenderer = this.getActiveRenderer();
    const shouldSwitch =
      recommendation.confidence >= (this.autoSwitchConfig.minConfidence || 0.7) &&
      activeRenderer?.type !== recommendation.recommendedRenderer;

    if (shouldSwitch) {
      console.log(
        `Auto-switching to ${recommendation.recommendedRenderer}: ${recommendation.reason}`
      );

      try {
        await this.switchRenderer(recommendation.recommendedRenderer, this.autoSwitchContainer);
      } catch (error) {
        console.error('Auto-switch failed:', error);
      }
    }
  }

  /**
   * Count nodes in VNode tree.
   */
  private countNodes(vnode: VNode): number {
    let count = 1;

    if (vnode.children && Array.isArray(vnode.children)) {
      for (const child of vnode.children) {
        if (typeof child === 'object' && child !== null) {
          count += this.countNodes(child);
        }
      }
    }

    return count;
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  /**
   * Cleanup all resources.
   * Destroys all renderers and clears state.
   */
  destroy(): void {
    this.disableAutoSwitch();
    this.strategyManager.destroy();
    this.rendererChangedSubject.complete();
  }
}
