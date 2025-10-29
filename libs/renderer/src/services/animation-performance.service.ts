/**
 * Animation Performance Service
 *
 * Phase 1.1: Performance monitoring and metrics for animations
 * Tracks FPS, animated element count, memory usage, and provides performance insights
 *
 * @example
 * ```typescript
 * const perfService = new AnimationPerformanceService();
 *
 * // Start monitoring
 * perfService.startMonitoring();
 *
 * // Get current metrics
 * const metrics = perfService.getMetrics();
 * console.log(`FPS: ${metrics.fps}, Animated elements: ${metrics.animatedElementCount}`);
 *
 * // Subscribe to metrics updates
 * perfService.onMetricsUpdate(metrics => {
 *   if (metrics.fps < 30) {
 *     console.warn('Low FPS detected!');
 *   }
 * });
 * ```
 */

/**
 * Performance metrics snapshot
 */
export interface AnimationMetrics {
  /** Current frames per second */
  fps: number;

  /** Average FPS over monitoring period */
  averageFps: number;

  /** Minimum FPS recorded */
  minFps: number;

  /** Maximum FPS recorded */
  maxFps: number;

  /** Number of currently animated elements */
  animatedElementCount: number;

  /** Number of animated nodes */
  animatedNodeCount: number;

  /** Number of animated edges */
  animatedEdgeCount: number;

  /** Total frame drops detected */
  frameDrops: number;

  /** Memory usage (if available) */
  memoryUsage?: number;

  /** CPU usage estimate (0-100) */
  cpuUsage?: number;

  /** Timestamp of metrics */
  timestamp: number;

  /** Monitoring duration in seconds */
  monitoringDuration: number;
}

/**
 * Performance warning types
 */
export enum PerformanceWarning {
  LOW_FPS = 'LOW_FPS',                    // FPS below threshold
  HIGH_ELEMENT_COUNT = 'HIGH_ELEMENT_COUNT', // Too many animated elements
  FRAME_DROPS = 'FRAME_DROPS',            // Frequent frame drops
  HIGH_MEMORY = 'HIGH_MEMORY',            // High memory usage
  LONG_FRAMES = 'LONG_FRAMES',            // Frames taking too long
}

/**
 * Performance warning event
 */
export interface PerformanceWarningEvent {
  type: PerformanceWarning;
  message: string;
  metrics: AnimationMetrics;
  timestamp: number;
}

/**
 * Performance threshold configuration
 */
export interface PerformanceThresholds {
  /** Minimum acceptable FPS (default: 30) */
  minFps: number;

  /** Maximum animated elements before warning (default: 100) */
  maxAnimatedElements: number;

  /** Maximum frame drops before warning (default: 10) */
  maxFrameDrops: number;

  /** Maximum memory usage in MB (default: 100) */
  maxMemoryMB: number;

  /** Maximum frame time in ms (default: 50) */
  maxFrameTime: number;
}

/**
 * Animation Performance Service
 *
 * Monitors animation performance and provides metrics
 */
export class AnimationPerformanceService {
  private monitoring: boolean = false;
  private metrics: AnimationMetrics;
  private fpsHistory: number[] = [];
  private frameTimestamps: number[] = [];
  private lastFrameTime: number = 0;
  private frameCount: number = 0;
  private startTime: number = 0;
  private rafId: number | null = null;

  private thresholds: PerformanceThresholds = {
    minFps: 30,
    maxAnimatedElements: 100,
    maxFrameDrops: 10,
    maxMemoryMB: 100,
    maxFrameTime: 50,
  };

  private metricsListeners: Set<(metrics: AnimationMetrics) => void> = new Set();
  private warningListeners: Set<(warning: PerformanceWarningEvent) => void> = new Set();

  constructor(thresholds?: Partial<PerformanceThresholds>) {
    if (thresholds) {
      this.thresholds = { ...this.thresholds, ...thresholds };
    }

    this.metrics = this.createEmptyMetrics();
  }

  /**
   * Start performance monitoring
   */
  startMonitoring(): void {
    if (this.monitoring) {
      return;
    }

    this.monitoring = true;
    this.startTime = performance.now();
    this.frameCount = 0;
    this.fpsHistory = [];
    this.frameTimestamps = [];
    this.lastFrameTime = performance.now();

    this.measureFrame();
  }

  /**
   * Stop performance monitoring
   */
  stopMonitoring(): void {
    if (!this.monitoring) {
      return;
    }

    this.monitoring = false;

    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  /**
   * Measure a single frame
   */
  private measureFrame = (): void => {
    if (!this.monitoring) {
      return;
    }

    const now = performance.now();
    const deltaTime = now - this.lastFrameTime;

    // Calculate FPS
    const fps = deltaTime > 0 ? 1000 / deltaTime : 0;

    // Track frame timing
    this.fpsHistory.push(fps);
    this.frameTimestamps.push(now);
    this.frameCount++;

    // Keep only last 60 frames (1 second at 60fps)
    if (this.fpsHistory.length > 60) {
      this.fpsHistory.shift();
      this.frameTimestamps.shift();
    }

    // Update metrics
    this.updateMetrics(fps, deltaTime);

    // Check for warnings
    this.checkPerformanceWarnings();

    this.lastFrameTime = now;

    // Schedule next frame
    this.rafId = requestAnimationFrame(this.measureFrame);
  };

  /**
   * Update metrics
   */
  private updateMetrics(currentFps: number, frameTime: number): void {
    const monitoringDuration = (performance.now() - this.startTime) / 1000;

    // Calculate statistics
    const averageFps = this.fpsHistory.length > 0
      ? this.fpsHistory.reduce((sum, fps) => sum + fps, 0) / this.fpsHistory.length
      : 0;

    const minFps = this.fpsHistory.length > 0
      ? Math.min(...this.fpsHistory)
      : 0;

    const maxFps = this.fpsHistory.length > 0
      ? Math.max(...this.fpsHistory)
      : 0;

    // Count frame drops (fps < threshold)
    const frameDrops = this.fpsHistory.filter(fps => fps < this.thresholds.minFps).length;

    // Count animated elements
    const animatedElements = this.countAnimatedElements();

    this.metrics = {
      fps: currentFps,
      averageFps,
      minFps,
      maxFps,
      animatedElementCount: animatedElements.total,
      animatedNodeCount: animatedElements.nodes,
      animatedEdgeCount: animatedElements.edges,
      frameDrops,
      memoryUsage: this.getMemoryUsage(),
      cpuUsage: this.estimateCPUUsage(frameTime),
      timestamp: Date.now(),
      monitoringDuration,
    };

    // Notify listeners
    this.notifyMetricsListeners();
  }

  /**
   * Count animated elements in the DOM
   */
  private countAnimatedElements(): { total: number; nodes: number; edges: number } {
    if (typeof document === 'undefined') {
      return { total: 0, nodes: 0, edges: 0 };
    }

    // Count elements with animation classes
    const animatedNodes = document.querySelectorAll('[class*="node-border-"], [class*="node-status-"]').length;
    const animatedEdges = document.querySelectorAll('[class*="link-animated-"]').length;

    return {
      total: animatedNodes + animatedEdges,
      nodes: animatedNodes,
      edges: animatedEdges,
    };
  }

  /**
   * Get memory usage (if Performance.memory is available)
   */
  private getMemoryUsage(): number | undefined {
    if (typeof performance === 'undefined' || !(performance as any).memory) {
      return undefined;
    }

    try {
      const memory = (performance as any).memory;
      // Return used JS heap size in MB
      return memory.usedJSHeapSize / (1024 * 1024);
    } catch {
      return undefined;
    }
  }

  /**
   * Estimate CPU usage based on frame time
   */
  private estimateCPUUsage(frameTime: number): number {
    // Rough estimate: frame time vs target (16.67ms for 60fps)
    const targetFrameTime = 1000 / 60;
    const usage = (frameTime / targetFrameTime) * 100;
    return Math.min(100, Math.max(0, usage));
  }

  /**
   * Check for performance warnings
   */
  private checkPerformanceWarnings(): void {
    // Low FPS warning
    if (this.metrics.fps < this.thresholds.minFps && this.metrics.fps > 0) {
      this.emitWarning({
        type: PerformanceWarning.LOW_FPS,
        message: `Low FPS detected: ${this.metrics.fps.toFixed(1)} fps (threshold: ${this.thresholds.minFps})`,
        metrics: { ...this.metrics },
        timestamp: Date.now(),
      });
    }

    // Too many animated elements
    if (this.metrics.animatedElementCount > this.thresholds.maxAnimatedElements) {
      this.emitWarning({
        type: PerformanceWarning.HIGH_ELEMENT_COUNT,
        message: `Too many animated elements: ${this.metrics.animatedElementCount} (threshold: ${this.thresholds.maxAnimatedElements})`,
        metrics: { ...this.metrics },
        timestamp: Date.now(),
      });
    }

    // Frame drops
    if (this.metrics.frameDrops > this.thresholds.maxFrameDrops) {
      this.emitWarning({
        type: PerformanceWarning.FRAME_DROPS,
        message: `Frequent frame drops detected: ${this.metrics.frameDrops} drops`,
        metrics: { ...this.metrics },
        timestamp: Date.now(),
      });
    }

    // High memory usage
    if (this.metrics.memoryUsage && this.metrics.memoryUsage > this.thresholds.maxMemoryMB) {
      this.emitWarning({
        type: PerformanceWarning.HIGH_MEMORY,
        message: `High memory usage: ${this.metrics.memoryUsage.toFixed(1)} MB (threshold: ${this.thresholds.maxMemoryMB} MB)`,
        metrics: { ...this.metrics },
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(): Readonly<AnimationMetrics> {
    return { ...this.metrics };
  }

  /**
   * Get FPS history
   */
  getFPSHistory(): number[] {
    return [...this.fpsHistory];
  }

  /**
   * Update performance thresholds
   */
  updateThresholds(thresholds: Partial<PerformanceThresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds };
  }

  /**
   * Get current thresholds
   */
  getThresholds(): Readonly<PerformanceThresholds> {
    return { ...this.thresholds };
  }

  /**
   * Subscribe to metrics updates
   */
  onMetricsUpdate(listener: (metrics: AnimationMetrics) => void): () => void {
    this.metricsListeners.add(listener);

    return () => {
      this.metricsListeners.delete(listener);
    };
  }

  /**
   * Subscribe to performance warnings
   */
  onPerformanceWarning(listener: (warning: PerformanceWarningEvent) => void): () => void {
    this.warningListeners.add(listener);

    return () => {
      this.warningListeners.delete(listener);
    };
  }

  /**
   * Notify metrics listeners
   */
  private notifyMetricsListeners(): void {
    const metrics = { ...this.metrics };
    this.metricsListeners.forEach(listener => {
      try {
        listener(metrics);
      } catch (error) {
        console.error('Error in metrics listener:', error);
      }
    });
  }

  /**
   * Emit performance warning
   */
  private emitWarning(warning: PerformanceWarningEvent): void {
    this.warningListeners.forEach(listener => {
      try {
        listener(warning);
      } catch (error) {
        console.error('Error in warning listener:', error);
      }
    });
  }

  /**
   * Reset metrics
   */
  reset(): void {
    this.metrics = this.createEmptyMetrics();
    this.fpsHistory = [];
    this.frameTimestamps = [];
    this.frameCount = 0;
    this.startTime = performance.now();
  }

  /**
   * Create empty metrics object
   */
  private createEmptyMetrics(): AnimationMetrics {
    return {
      fps: 0,
      averageFps: 0,
      minFps: 0,
      maxFps: 0,
      animatedElementCount: 0,
      animatedNodeCount: 0,
      animatedEdgeCount: 0,
      frameDrops: 0,
      memoryUsage: undefined,
      cpuUsage: undefined,
      timestamp: Date.now(),
      monitoringDuration: 0,
    };
  }

  /**
   * Check if monitoring is active
   */
  isMonitoring(): boolean {
    return this.monitoring;
  }

  /**
   * Get performance summary
   */
  getSummary(): string {
    const m = this.metrics;
    return `
Animation Performance Summary:
- FPS: ${m.fps.toFixed(1)} (avg: ${m.averageFps.toFixed(1)}, min: ${m.minFps.toFixed(1)}, max: ${m.maxFps.toFixed(1)})
- Animated Elements: ${m.animatedElementCount} (${m.animatedNodeCount} nodes, ${m.animatedEdgeCount} edges)
- Frame Drops: ${m.frameDrops}
- Memory: ${m.memoryUsage ? m.memoryUsage.toFixed(1) + ' MB' : 'N/A'}
- CPU Usage: ${m.cpuUsage !== undefined ? m.cpuUsage.toFixed(1) + '%' : 'N/A'}
- Monitoring Duration: ${m.monitoringDuration.toFixed(1)}s
`.trim();
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.stopMonitoring();
    this.metricsListeners.clear();
    this.warningListeners.clear();
  }
}
