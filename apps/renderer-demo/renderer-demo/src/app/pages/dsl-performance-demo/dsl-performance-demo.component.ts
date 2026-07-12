import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DSL, DiagramEngine } from '@grafloria/engine';
import { DiagramCanvasComponent } from '@grafloria/renderer-angular';
import { LIGHT_THEME, type Theme, type Rectangle } from '@grafloria/renderer';

interface PerformanceMetrics {
  parseTime: number;
  nodeCount: number;
  linkCount: number;
  memoryUsed?: number;
  workerUsed: boolean;
}

@Component({
    imports: [CommonModule, FormsModule, DiagramCanvasComponent],
    selector: 'app-dsl-performance-demo',
    templateUrl: './dsl-performance-demo.component.html',
    styleUrl: './dsl-performance-demo.component.css'
})
export class DslPerformanceDemoComponent implements OnInit {
  dsl!: DSL;
  engine!: DiagramEngine;
  viewport: Rectangle = { x: 0, y: 0, width: 1200, height: 800 };
  zoom = 1.0;
  theme: Theme = LIGHT_THEME;

  // Performance settings
  diagramSize: 'small' | 'medium' | 'large' | 'huge' = 'small';
  useWorkers = false;
  preserveFormat = true;

  // Results
  currentDSL = '';
  metrics: PerformanceMetrics | null = null;
  isProcessing = false;
  progressPercent = 0;

  // Size presets
  readonly sizes: ReadonlyArray<'small' | 'medium' | 'large' | 'huge'> = ['small', 'medium', 'large', 'huge'];

  sizePresets: Record<'small' | 'medium' | 'large' | 'huge', { nodes: number; label: string }> = {
    small: { nodes: 10, label: 'Small (10 nodes)' },
    medium: { nodes: 50, label: 'Medium (50 nodes)' },
    large: { nodes: 200, label: 'Large (200 nodes)' },
    huge: { nodes: 1000, label: 'Huge (1000 nodes)' }
  };

  ngOnInit() {
    this.engine = new DiagramEngine();

    this.dsl = new DSL({
      debug: true,
      autoLayout: true
    });

    this.generateDiagram();
  }

  generateDiagram() {
    const nodeCount = this.sizePresets[this.diagramSize].nodes;
    this.currentDSL = this.generateLargeDiagram(nodeCount);
  }

  generateLargeDiagram(nodeCount: number): string {
    const lines: string[] = ['flowchart TD'];

    // Add comment if format preservation is enabled
    if (this.preserveFormat) {
      lines.push(`  // Auto-generated diagram with ${nodeCount} nodes`);
      lines.push(`  // Created for performance testing`);
    }

    // Generate nodes and connections
    for (let i = 0; i < nodeCount; i++) {
      const nodeId = `N${i}`;
      const label = `Node ${i}`;

      if (i === 0) {
        lines.push(`  ${nodeId}[${label}]`);
      } else {
        const prevId = `N${i - 1}`;
        const connectionType = i % 3 === 0 ? '{Decision}' : `[${label}]`;
        lines.push(`  ${prevId} --> ${nodeId}${connectionType}`);

        // Add some branches
        if (i % 10 === 0 && i < nodeCount - 1) {
          const branchId = `N${i + 1}`;
          lines.push(`  ${nodeId} -.-> ${branchId}[Branch ${i}]`);
        }
      }

      // Add comments for some nodes
      if (this.preserveFormat && i % 25 === 0 && i > 0) {
        lines.push(`  // Checkpoint ${i}`);
      }
    }

    return lines.join('\n');
  }

  async parseDiagram() {
    this.isProcessing = true;
    this.progressPercent = 0;
    this.metrics = null;

    try {
      const startTime = performance.now();
      const startMemory = (performance as any).memory?.usedJSHeapSize;

      // Simulate progress
      const progressInterval = setInterval(() => {
        if (this.progressPercent < 90) {
          this.progressPercent += 10;
        }
      }, 100);

      // Parse with options
      const result = this.dsl.parseDetailed(this.currentDSL);

      const endTime = performance.now();
      const endMemory = (performance as any).memory?.usedJSHeapSize;

      clearInterval(progressInterval);
      this.progressPercent = 100;

      // Calculate metrics
      this.metrics = {
        parseTime: Math.round(endTime - startTime),
        nodeCount: result.stats.nodeCount,
        linkCount: result.stats.linkCount,
        memoryUsed: endMemory && startMemory ? Math.round((endMemory - startMemory) / 1024) : undefined,
        workerUsed: this.useWorkers
      };

      // Set diagram to engine for visual rendering
      if (result.diagram) {
        this.engine.setDiagram(result.diagram);
      }

      // Simulate worker delay for demo purposes
      if (this.useWorkers) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }

    } catch (error: any) {
      console.error('Parse error:', error);
      this.metrics = null;
    } finally {
      this.isProcessing = false;
    }
  }

  async testPerformance() {
    // Test all sizes
    const results: any[] = [];

    for (const size of ['small', 'medium', 'large'] as const) {
      this.diagramSize = size;
      this.generateDiagram();
      await this.parseDiagram();

      if (this.metrics) {
        results.push({
          size,
          ...this.metrics,
          expectedNodeCount: this.sizePresets[size].nodes
        });
      }

      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.table(results);
  }

  copyDiagram() {
    navigator.clipboard.writeText(this.currentDSL);
  }

  resetDemo() {
    this.diagramSize = 'small';
    this.useWorkers = false;
    this.preserveFormat = true;
    this.metrics = null;
    this.generateDiagram();
  }
}
