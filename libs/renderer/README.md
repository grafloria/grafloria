# Renderer Library

Flexible, framework-agnostic rendering system supporting multiple rendering strategies (SVG, Canvas, WebGL) with a unified API.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [API Reference](#api-reference)
- [Usage Examples](#usage-examples)
- [Phase A vs Phase B](#phase-a-vs-phase-b)
- [Testing](#testing)

## Overview

The Renderer Library uses the **Strategy Pattern** to enable switching between different rendering backends without changing your application code. This provides:

- **Future-proof architecture**: Switch from SVG to Canvas without code changes
- **Performance flexibility**: Choose the optimal renderer for your use case
- **Extensibility**: Implement custom renderers (server-side, PDF, etc.)

## Features

### Core Components

- **IRenderer Interface**: Unified API for all renderers
- **RendererFactory**: Factory pattern for creating renderer instances
- **RendererStrategyManager**: Runtime renderer switching with state preservation
- **SVGRendererV2**: Full-featured SVG implementation
- **CanvasRenderer**: Stub for Phase B (coming soon)

### Capabilities

✅ **SVG Renderer** (Phase A - Available Now)
- Hit testing
- Text and element measurement
- Export to SVG/PNG/JPEG/WebP
- Caching for performance
- Lifecycle hooks
- High-DPI support

⏳ **Canvas Renderer** (Phase B - Coming Soon)
- GPU-accelerated rendering
- Batched operations
- Offscreen rendering

## Installation

```bash
npm install @grafloria/renderer
```

## Quick Start

### Basic Usage

```typescript
import { RendererFactory, SVGRendererV2 } from '@grafloria/renderer';
import type { VNode } from '@grafloria/renderer';

// Register renderer
RendererFactory.registerRenderer('svg', SVGRendererV2);

// Create renderer instance
const renderer = RendererFactory.createRenderer('svg', {
  width: 1920,
  height: 1080,
  preserveAspectRatio: 'xMidYMid meet',
  enableCaching: true,
});

// Initialize with container
const container = document.getElementById('diagram-container')!;
renderer.initialize(container, { width: 1920, height: 1080 });

// Render VNode tree
const vnode: VNode = {
  type: 'rect',
  props: {
    x: 10,
    y: 10,
    width: 200,
    height: 100,
    fill: 'blue',
  },
};

await renderer.render(vnode);

// Clean up
renderer.destroy();
```

### Switching Renderers at Runtime

```typescript
import { RendererFactory, RendererStrategyManager } from '@grafloria/renderer';

// Create manager
const manager = new RendererStrategyManager();

// Register multiple renderers
const svgRenderer = RendererFactory.createRenderer('svg', {
  width: 800,
  height: 600,
});

manager.registerRenderer('svg', svgRenderer);

// Listen for changes
manager.onRendererChange((event) => {
  console.log(`Switched from ${event.previousType} to ${event.newType}`);
});

// Switch to SVG
await manager.switchRenderer('svg', container);
```

## API Reference

### IRenderer Interface

```typescript
interface IRenderer {
  readonly type: string;
  readonly capabilities: RendererCapabilities;

  initialize(container: HTMLElement, config: RendererConfig): void;
  render(vnode: VNode, options?: RenderOptions): Promise<void>;
  update(updates: NodeUpdate[]): Promise<void>;
  clear(): void;
  measureText(text: string, style: TextStyle): TextMetrics;
  measureElement(vnode: VNode): BoundingBox;
  hitTest(x: number, y: number): VNode | null;
  export(format: ExportFormat, options?: ExportOptions): Promise<string>;
  destroy(): void;

  onBeforeRender?(vnode: VNode): void;
  onAfterRender?(vnode: VNode): void;
}
```

### RendererFactory

Static methods for managing renderer registration:

```typescript
class RendererFactory {
  static registerRenderer(type: string, constructor: RendererConstructor): void;
  static createRenderer(type: string, config: RendererConfig): IRenderer;
  static getAvailableRenderers(): string[];
  static hasRenderer(type: string): boolean;
  static unregisterRenderer(type: string): void;
  static clearRegistry(): void;
}
```

### RendererStrategyManager

Service for managing multiple renderers:

```typescript
class RendererStrategyManager {
  registerRenderer(type: string, renderer: IRenderer): void;
  switchRenderer(type: string, container: HTMLElement, config?: RendererConfig): Promise<void>;
  getActiveRenderer(): IRenderer | null;
  getRenderer(type: string): IRenderer | null;
  getRegisteredTypes(): string[];
  updateVNode(vnode: VNode): void;
  getCurrentVNode(): VNode | null;
  onRendererChange(callback: RendererChangeCallback): () => void;
  destroy(): void;
}
```

## Usage Examples

### Example 1: Simple Diagram

```typescript
import { RendererFactory, SVGRendererV2 } from '@grafloria/renderer';

RendererFactory.registerRenderer('svg', SVGRendererV2);

const renderer = RendererFactory.createRenderer('svg', {
  width: 800,
  height: 600,
});

const container = document.getElementById('app')!;
renderer.initialize(container, { width: 800, height: 600 });

const diagram: VNode = {
  type: 'g',
  children: [
    {
      type: 'rect',
      key: 'node1',
      props: { x: 50, y: 50, width: 100, height: 60, fill: '#4CAF50' },
    },
    {
      type: 'rect',
      key: 'node2',
      props: { x: 250, y: 50, width: 100, height: 60, fill: '#2196F3' },
    },
    {
      type: 'path',
      key: 'link',
      props: {
        d: 'M 150 80 L 250 80',
        stroke: '#000',
        strokeWidth: 2,
        fill: 'none',
      },
    },
  ],
};

await renderer.render(diagram);
```

### Example 2: Export Diagram

```typescript
// Export as SVG
const svgString = await renderer.export('svg');
console.log(svgString);

// Export as PNG with high quality
const pngDataUrl = await renderer.export('png', {
  scale: 2, // 2x resolution
  quality: 0.95,
  backgroundColor: 'white',
});

// Use the data URL
const img = document.createElement('img');
img.src = pngDataUrl;
document.body.appendChild(img);
```

### Example 3: Text Measurement

```typescript
const metrics = renderer.measureText('Hello World', {
  fontFamily: 'Arial',
  fontSize: 16,
  fontWeight: 'bold',
});

console.log(`Width: ${metrics.width}px`);
console.log(`Height: ${metrics.height}px`);
```

## Phase A vs Phase B

### Phase A (Current - Available Now)

✅ **Complete**:
- `IRenderer` interface with full specification
- `RendererFactory` with registration system
- `SVGRendererV2` with full implementation
- `RendererStrategyManager` for runtime switching
- `CanvasRenderer` stub (throws errors)
- Comprehensive test suite
- Full documentation

### Phase B (Coming Soon)

🚧 **Planned**:
- Full `CanvasRenderer` implementation
- GPU-accelerated rendering
- Batched operations
- Advanced hit detection
- WebGLRenderer (optional)

### Migration Path

The architecture is designed to support Phase B features without breaking changes:

```typescript
// Phase A code
const renderer = RendererFactory.createRenderer('svg', config);

// Phase B code (same API!)
const renderer = RendererFactory.createRenderer('canvas', config);
```

## Testing

Run tests:

```bash
# Run all renderer tests
nx test renderer

# Run with coverage
nx test renderer --coverage
```

### Test Coverage

- **RendererFactory**: 100%
- **SVGRendererV2**: 95%+
- **CanvasRenderer stub**: 100%
- **RendererStrategyManager**: 98%+

## Building

Build the library:

```bash
nx build renderer
```

---

**Part of the Grafloria Diagram Engine**
