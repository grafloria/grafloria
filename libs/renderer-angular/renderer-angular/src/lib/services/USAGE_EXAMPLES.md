# DiagramRendererService - Usage Examples

## Overview

The `DiagramRendererService` provides a high-level Angular service for managing multiple diagram renderers with automatic switching, performance benchmarking, and renderer recommendations.

## Basic Usage

### 1. Register and Switch Renderers

```typescript
import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { DiagramRendererService } from '@grafloria/renderer-angular';
import { RendererFactory } from '@grafloria/renderer';

@Component({
  selector: 'app-diagram',
  template: `<div #container class="diagram-container"></div>`
})
export class DiagramComponent implements OnInit {
  @ViewChild('container') containerRef!: ElementRef<HTMLElement>;

  constructor(private rendererService: DiagramRendererService) {}

  ngOnInit() {
    // Create renderer instances
    const svgRenderer = RendererFactory.createRenderer('svg', {
      width: 1920,
      height: 1080,
      enableCaching: true
    });

    const canvasRenderer = RendererFactory.createRenderer('canvas', {
      width: 1920,
      height: 1080,
      contextType: '2d'
    });

    // Register renderers
    this.rendererService.registerRenderer('svg', svgRenderer);
    this.rendererService.registerRenderer('canvas', canvasRenderer);

    // Switch to SVG renderer
    this.rendererService.switchRenderer('svg', this.containerRef.nativeElement);
  }
}
```

### 2. Listen to Renderer Changes

```typescript
ngOnInit() {
  // Subscribe to renderer change events
  this.rendererService.rendererChanged$.subscribe(event => {
    if (event) {
      console.log(`Switched from ${event.previousType} to ${event.newType}`);
    }
  });
}
```

### 3. Render Diagrams

```typescript
async renderDiagram() {
  const vnode: VNode = {
    type: 'g',
    props: {},
    children: [
      {
        type: 'rect',
        props: {
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          fill: '#007bff'
        }
      }
    ]
  };

  await this.rendererService.render(vnode);
}
```

## Advanced Usage

### 1. Renderer Recommendation System

```typescript
getRendererRecommendation() {
  const recommendation = this.rendererService.getRecommendation({
    nodeCount: 500,
    requiresForeignObject: true,
    hasAnimations: false,
    requiresHitTesting: true
  });

  console.log(`Recommended: ${recommendation.recommendedRenderer}`);
  console.log(`Confidence: ${(recommendation.confidence * 100).toFixed(0)}%`);
  console.log(`Reason: ${recommendation.reason}`);

  // Show alternatives
  recommendation.alternatives.forEach(alt => {
    console.log(`\nAlternative: ${alt.renderer} (score: ${alt.score})`);
    console.log('Pros:', alt.pros);
    console.log('Cons:', alt.cons);
  });

  // Switch to recommended renderer
  if (recommendation.confidence > 0.7) {
    this.rendererService.switchRenderer(
      recommendation.recommendedRenderer,
      this.containerRef.nativeElement
    );
  }
}
```

### 2. Performance Benchmarking

```typescript
async benchmarkRenderers() {
  const vnode: VNode = { /* complex diagram */ };

  // Benchmark current renderer
  const benchmark = await this.rendererService.benchmarkRenderer(vnode, {
    iterations: 100
  });

  console.log(`Renderer: ${benchmark.rendererType}`);
  console.log(`Average render time: ${benchmark.avgRenderTime.toFixed(2)}ms`);
  console.log(`FPS: ${benchmark.fps.toFixed(0)}`);
  console.log(`Min/Max: ${benchmark.minRenderTime}ms / ${benchmark.maxRenderTime}ms`);

  // Compare all renderers
  const comparison = await this.rendererService.compareRenderers(vnode, ['svg', 'canvas']);

  console.log('\nComparison Results:');
  comparison.forEach((result, index) => {
    console.log(`${index + 1}. ${result.rendererType}: ${result.avgRenderTime.toFixed(2)}ms`);
  });

  // Switch to fastest
  const fastest = comparison[0];
  await this.rendererService.switchRenderer(fastest.rendererType, this.containerRef.nativeElement);
}
```

### 3. Automatic Renderer Switching

```typescript
enableSmartSwitching() {
  // Enable auto-switch with configuration
  this.rendererService.enableAutoSwitch(this.containerRef.nativeElement, {
    nodeSizeThreshold: 500,  // Switch when diagram exceeds 500 nodes
    checkInterval: 2000,      // Check every 2 seconds
    minConfidence: 0.8,       // Require 80% confidence before switching
    enablePerformanceSwitch: true
  });

  console.log('Auto-switch enabled');
}

disableSmartSwitching() {
  this.rendererService.disableAutoSwitch();
  console.log('Auto-switch disabled');
}
```

### 4. Capabilities Check

```typescript
checkCapabilities() {
  // Check if current renderer supports a feature
  if (this.rendererService.supportsFeature('supportsForeignObject')) {
    // Embed HTML components
    this.renderHTMLComponents();
  } else {
    // Use SVG/Canvas primitives only
    this.renderSVGPrimitives();
  }

  // Get all capabilities
  const capabilities = this.rendererService.getCapabilities();
  if (capabilities) {
    console.log('Supports hit testing:', capabilities.supportsHitTest);
    console.log('Supports export:', capabilities.supportsExport);
    console.log('Supports measurement:', capabilities.supportsMeasurement);
  }
}
```

## Complete Example: Smart Diagram Component

```typescript
import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { DiagramRendererService } from '@grafloria/renderer-angular';
import { RendererFactory } from '@grafloria/renderer';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-smart-diagram',
  template: `
    <div class="diagram-controls">
      <button (click)="switchToSVG()">SVG</button>
      <button (click)="switchToCanvas()">Canvas</button>
      <button (click)="useRecommended()">Auto</button>
      <button (click)="toggleAutoSwitch()">
        {{ autoSwitchEnabled ? 'Disable' : 'Enable' }} Auto-Switch
      </button>
      <button (click)="benchmark()">Benchmark</button>
    </div>

    <div class="diagram-info">
      <p>Active Renderer: {{ activeRenderer }}</p>
      <p *ngIf="lastBenchmark">
        Performance: {{ lastBenchmark.avgRenderTime.toFixed(2) }}ms
        ({{ lastBenchmark.fps.toFixed(0) }} FPS)
      </p>
    </div>

    <div #container class="diagram-container"></div>
  `,
  styles: [`
    .diagram-container {
      width: 100%;
      height: 600px;
      border: 1px solid #ccc;
    }
    .diagram-controls {
      padding: 10px;
      display: flex;
      gap: 10px;
    }
    .diagram-info {
      padding: 10px;
      background: #f5f5f5;
    }
  `]
})
export class SmartDiagramComponent implements OnInit, OnDestroy {
  @ViewChild('container') containerRef!: ElementRef<HTMLElement>;

  activeRenderer = '';
  autoSwitchEnabled = false;
  lastBenchmark: any = null;

  private destroy$ = new Subject<void>();
  private currentVNode: VNode | null = null;

  constructor(private rendererService: DiagramRendererService) {}

  ngOnInit() {
    this.setupRenderers();
    this.subscribeToChanges();
    this.renderSampleDiagram();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    this.rendererService.destroy();
  }

  private setupRenderers() {
    // Create and register renderers
    const svgRenderer = RendererFactory.createRenderer('svg', {
      width: 1920,
      height: 1080,
      enableCaching: true
    });

    const canvasRenderer = RendererFactory.createRenderer('canvas', {
      width: 1920,
      height: 1080,
      contextType: '2d'
    });

    this.rendererService.registerRenderer('svg', svgRenderer);
    this.rendererService.registerRenderer('canvas', canvasRenderer);

    // Get recommendation and switch
    const recommendation = this.rendererService.getRecommendation({
      nodeCount: 100,
      requiresForeignObject: false
    });

    this.rendererService.switchRenderer(
      recommendation.recommendedRenderer,
      this.containerRef.nativeElement
    );
  }

  private subscribeToChanges() {
    this.rendererService.rendererChanged$
      .pipe(takeUntil(this.destroy$))
      .subscribe(event => {
        if (event) {
          this.activeRenderer = event.newType;
          console.log(`Switched to ${event.newType}`);
        }
      });
  }

  private async renderSampleDiagram() {
    this.currentVNode = {
      type: 'g',
      props: {},
      children: Array.from({ length: 100 }, (_, i) => ({
        type: 'circle',
        props: {
          cx: (i % 10) * 100 + 50,
          cy: Math.floor(i / 10) * 100 + 50,
          r: 30,
          fill: `hsl(${i * 3.6}, 70%, 60%)`
        }
      }))
    };

    await this.rendererService.render(this.currentVNode);
  }

  async switchToSVG() {
    await this.rendererService.switchRenderer('svg', this.containerRef.nativeElement);
  }

  async switchToCanvas() {
    await this.rendererService.switchRenderer('canvas', this.containerRef.nativeElement);
  }

  async useRecommended() {
    const nodeCount = this.countNodes(this.currentVNode);
    const recommendation = this.rendererService.getRecommendation({ nodeCount });

    alert(`Recommended: ${recommendation.recommendedRenderer}\n${recommendation.reason}`);

    await this.rendererService.switchRenderer(
      recommendation.recommendedRenderer,
      this.containerRef.nativeElement
    );
  }

  toggleAutoSwitch() {
    if (this.autoSwitchEnabled) {
      this.rendererService.disableAutoSwitch();
      this.autoSwitchEnabled = false;
    } else {
      this.rendererService.enableAutoSwitch(this.containerRef.nativeElement, {
        nodeSizeThreshold: 200,
        checkInterval: 3000,
        minConfidence: 0.7
      });
      this.autoSwitchEnabled = true;
    }
  }

  async benchmark() {
    if (!this.currentVNode) return;

    this.lastBenchmark = await this.rendererService.benchmarkRenderer(this.currentVNode, {
      iterations: 50
    });

    alert(
      `Benchmark Results:\n` +
      `Renderer: ${this.lastBenchmark.rendererType}\n` +
      `Avg Time: ${this.lastBenchmark.avgRenderTime.toFixed(2)}ms\n` +
      `FPS: ${this.lastBenchmark.fps.toFixed(0)}\n` +
      `Min/Max: ${this.lastBenchmark.minRenderTime}/${this.lastBenchmark.maxRenderTime}ms`
    );
  }

  private countNodes(vnode: VNode | null): number {
    if (!vnode) return 0;
    let count = 1;
    if (vnode.children && Array.isArray(vnode.children)) {
      vnode.children.forEach(child => {
        if (typeof child === 'object') {
          count += this.countNodes(child);
        }
      });
    }
    return count;
  }
}
```

## Best Practices

### 1. Choose the Right Renderer

- **SVG** is best for:
  - Small to medium diagrams (<500 nodes)
  - When you need HTML embedding (foreignObject)
  - When crisp vector export is important
  - When accessibility is required

- **Canvas** is best for:
  - Large diagrams (>1000 nodes)
  - When smooth animations are critical
  - When you don't need HTML embedding
  - When raw performance is the priority

### 2. Use Recommendations

Always get a recommendation before manually switching:

```typescript
const rec = this.rendererService.getRecommendation({
  nodeCount: myDiagram.getNodeCount(),
  requiresForeignObject: myDiagram.hasHTMLComponents()
});

if (rec.confidence > 0.8) {
  await this.rendererService.switchRenderer(rec.recommendedRenderer, container);
}
```

### 3. Enable Auto-Switch for Dynamic Content

```typescript
// For dashboards with varying data sizes
this.rendererService.enableAutoSwitch(container, {
  nodeSizeThreshold: 500,
  checkInterval: 5000
});
```

### 4. Benchmark Before Production

```typescript
async optimizeForProduction() {
  const comparison = await this.rendererService.compareRenderers(
    productionVNode,
    ['svg', 'canvas']
  );

  const fastest = comparison[0];
  console.log(`Production renderer: ${fastest.rendererType}`);

  // Use fastest renderer for production
  await this.rendererService.switchRenderer(fastest.rendererType, container);
}
```

### 5. Cleanup Resources

```typescript
ngOnDestroy() {
  this.rendererService.destroy();
}
```

## API Reference

See `diagram-renderer.service.ts` for complete API documentation.
