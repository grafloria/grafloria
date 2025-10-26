import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

/**
 * Performance Metrics
 */
export interface PerformanceMetrics {
  renderTime: number;        // ms
  nodeCount: number;          // DOM nodes
  score: number;              // 0-100
  warnings: string[];
  recommendations: string[];
}

/**
 * Performance Monitor Service
 *
 * Tracks rendering performance and provides optimization suggestions.
 *
 * Responsibilities:
 * - Measure render times
 * - Count DOM nodes
 * - Calculate performance score
 * - Provide recommendations
 *
 * ~150 lines
 */
@Injectable({
  providedIn: 'root'
})
export class PerformanceMonitorService {

  private readonly BUDGET_RENDER_TIME = 16; // ms (60 FPS)
  private readonly WARNING_RENDER_TIME = 12; // ms

  private metricsSubject = new BehaviorSubject<PerformanceMetrics>({
    renderTime: 0,
    nodeCount: 0,
    score: 100,
    warnings: [],
    recommendations: []
  });

  public metrics$: Observable<PerformanceMetrics> = this.metricsSubject.asObservable();

  /**
   * Start measuring render time
   */
  startMeasure(name: string): void {
    performance.mark(`${name}-start`);
  }

  /**
   * End measurement and update metrics
   */
  endMeasure(name: string, container?: HTMLElement): void {
    performance.mark(`${name}-end`);
    performance.measure(name, `${name}-start`, `${name}-end`);

    const measure = performance.getEntriesByName(name)[0] as PerformanceEntry;
    const renderTime = measure.duration;

    // Count DOM nodes if container provided
    let nodeCount = 0;
    if (container) {
      nodeCount = this.countDOMNodes(container);
    }

    // Calculate metrics
    const metrics = this.calculateMetrics(renderTime, nodeCount);
    this.metricsSubject.next(metrics);

    // Cleanup
    performance.clearMarks(`${name}-start`);
    performance.clearMarks(`${name}-end`);
    performance.clearMeasures(name);
  }

  /**
   * Calculate performance metrics
   */
  private calculateMetrics(renderTime: number, nodeCount: number): PerformanceMetrics {
    const warnings: string[] = [];
    const recommendations: string[] = [];

    // Check render time
    if (renderTime >= this.BUDGET_RENDER_TIME) {
      warnings.push(`Render time (${renderTime.toFixed(1)}ms) exceeds budget (${this.BUDGET_RENDER_TIME}ms)`);
      recommendations.push('Simplify node structure to reduce render time');
    } else if (renderTime >= this.WARNING_RENDER_TIME) {
      warnings.push(`Render time (${renderTime.toFixed(1)}ms) approaching budget`);
    }

    // Check node count
    if (nodeCount > 100) {
      warnings.push(`DOM node count (${nodeCount}) is high`);
      recommendations.push('Reduce HTML complexity. Target: < 100 nodes');
    }

    // Calculate score (0-100)
    let score = 100;

    // Penalize based on render time
    if (renderTime > this.BUDGET_RENDER_TIME) {
      const overtime = renderTime - this.BUDGET_RENDER_TIME;
      score -= Math.min(50, overtime * 2); // Max -50 points
    }

    // Penalize based on node count
    if (nodeCount > 100) {
      const excessNodes = nodeCount - 100;
      score -= Math.min(30, excessNodes / 5); // Max -30 points
    }

    score = Math.max(0, Math.round(score));

    return {
      renderTime,
      nodeCount,
      score,
      warnings,
      recommendations
    };
  }

  /**
   * Count DOM nodes recursively
   */
  private countDOMNodes(element: HTMLElement): number {
    let count = 1; // Count the element itself

    for (let i = 0; i < element.children.length; i++) {
      count += this.countDOMNodes(element.children[i] as HTMLElement);
    }

    return count;
  }

  /**
   * Get current metrics
   */
  getMetrics(): PerformanceMetrics {
    return this.metricsSubject.getValue();
  }

  /**
   * Reset metrics
   */
  reset(): void {
    this.metricsSubject.next({
      renderTime: 0,
      nodeCount: 0,
      score: 100,
      warnings: [],
      recommendations: []
    });
  }
}
