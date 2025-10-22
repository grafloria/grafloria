// PerformanceMonitor - Tracks operation performance and generates reports

export interface PerformanceConfig {
  enableMonitoring?: boolean;
  enableProfiling?: boolean;
  warnThreshold?: number;
}

export interface PerformanceReport {
  metrics: Record<string, PerformanceMetric>;
  summary: {
    totalOperations: number;
    averageTime: number;
    slowestOperation: string;
    fastestOperation: string;
  };
}

export interface PerformanceMetric {
  count: number;
  totalTime: number;
  averageTime: number;
  minTime: number;
  maxTime: number;
}

export class PerformanceMonitor {
  private config: PerformanceConfig;
  private metrics: Map<string, PerformanceMetric> = new Map();
  private warnThreshold: number;

  constructor(config: PerformanceConfig = {}) {
    this.config = {
      enableMonitoring: config.enableMonitoring ?? false,
      enableProfiling: config.enableProfiling ?? false,
      warnThreshold: config.warnThreshold ?? 100,
    };
    this.warnThreshold = this.config.warnThreshold ?? 100;
  }

  /**
   * Measure operation performance
   */
  measure<T>(name: string, fn: () => T | Promise<T>): T | Promise<T> {
    if (!this.config.enableMonitoring) {
      return fn();
    }

    const startTime = performance.now();
    const result = fn();

    // Handle async functions
    if (result instanceof Promise) {
      return result.then((value) => {
        const endTime = performance.now();
        const duration = endTime - startTime;
        this.recordMetric(name, duration);

        if (duration > this.warnThreshold) {
          console.warn(`Performance warning: ${name} took ${duration.toFixed(2)}ms`);
        }

        return value;
      }) as T | Promise<T>;
    }

    // Handle sync functions
    const endTime = performance.now();
    const duration = endTime - startTime;
    this.recordMetric(name, duration);

    if (duration > this.warnThreshold) {
      console.warn(`Performance warning: ${name} took ${duration.toFixed(2)}ms`);
    }

    return result;
  }

  /**
   * Set warning threshold
   */
  setWarnThreshold(threshold: number): void {
    this.warnThreshold = threshold;
  }

  /**
   * Get performance report
   */
  getReport(): PerformanceReport {
    const metricsObj: Record<string, PerformanceMetric> = {};
    let totalOps = 0;
    let totalTime = 0;
    let slowest = { name: '', time: 0 };
    let fastest = { name: '', time: Infinity };

    for (const [name, metric] of this.metrics.entries()) {
      metricsObj[name] = metric;
      totalOps += metric.count;
      totalTime += metric.totalTime;

      if (metric.maxTime > slowest.time) {
        slowest = { name, time: metric.maxTime };
      }
      if (metric.minTime < fastest.time) {
        fastest = { name, time: metric.minTime };
      }
    }

    return {
      metrics: metricsObj,
      summary: {
        totalOperations: totalOps,
        averageTime: totalOps > 0 ? totalTime / totalOps : 0,
        slowestOperation: slowest.name,
        fastestOperation: fastest.time !== Infinity ? fastest.name : '',
      },
    };
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics.clear();
  }

  /**
   * Record metric
   */
  private recordMetric(name: string, duration: number): void {
    const existing = this.metrics.get(name);

    if (existing) {
      existing.count++;
      existing.totalTime += duration;
      existing.averageTime = existing.totalTime / existing.count;
      existing.minTime = Math.min(existing.minTime, duration);
      existing.maxTime = Math.max(existing.maxTime, duration);
    } else {
      this.metrics.set(name, {
        count: 1,
        totalTime: duration,
        averageTime: duration,
        minTime: duration,
        maxTime: duration,
      });
    }
  }
}
