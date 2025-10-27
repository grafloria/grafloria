import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { PerformanceMetrics } from '../../services/performance-monitor.service';

/**
 * Performance Panel Component
 *
 * Displays performance metrics and optimization suggestions.
 *
 * Features:
 * - Performance score visualization
 * - Render time metrics
 * - DOM node count
 * - Warnings and recommendations
 *
 * ~120 lines
 */
@Component({
  standalone: true,
  imports: [CommonModule],
  selector: 'app-performance-panel',
  templateUrl: './performance-panel.component.html',
  styleUrl: './performance-panel.component.css'
})
export class PerformancePanelComponent {

  @Input() metrics: PerformanceMetrics | null = null;

  /**
   * Get score color based on value
   */
  getScoreColor(score: number): string {
    if (score >= 80) return '#10b981'; // Green
    if (score >= 60) return '#f59e0b'; // Orange
    return '#ef4444'; // Red
  }

  /**
   * Get score label
   */
  getScoreLabel(score: number): string {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Fair';
    return 'Poor';
  }

  /**
   * Get render time status
   */
  getRenderTimeStatus(renderTime: number): 'good' | 'warning' | 'error' {
    if (renderTime < 12) return 'good';
    if (renderTime < 16) return 'warning';
    return 'error';
  }
}
