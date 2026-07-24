# Interaction Modes - Integration Guide

Complete guide for integrating the three interaction modes system into your Angular application.

## Table of Contents
- [Overview](#overview)
- [Quick Start](#quick-start)
- [Three Interaction Modes](#three-interaction-modes)
- [Components](#components)
- [Configuration](#configuration)
- [Performance](#performance)
- [Troubleshooting](#troubleshooting)

## Overview

The interaction modes system provides three different ways for users to interact with diagram nodes and connections:

1. **Direct Mode**: Fast, intuitive workflow
2. **Deliberate Mode**: Safe, explicit workflow
3. **Smart Mode**: Visio-style with intelligent auto-connect

## Quick Start

### 1. Install Dependencies

```bash
npm install @grafloria/engine @grafloria/renderer @grafloria/angular
```

### 2. Import Components

```typescript
import { Component } from '@angular/core';
import { DiagramEngine } from '@grafloria/engine';
import { LIGHT_THEME } from '@grafloria/renderer';
import {
  DiagramCanvasComponent,
  InteractionConfigPanelComponent
} from '@grafloria/angular';

@Component({
  selector: 'app-diagram',
  standalone: true,
  imports: [DiagramCanvasComponent, InteractionConfigPanelComponent],
  template: `
    <div class="diagram-container">
      <!-- Configuration Panel -->
      <grafloria-interaction-config-panel
        [engine]="engine"
        [expanded]="true"
        (configChanged)="onConfigChange($event)">
      </grafloria-interaction-config-panel>

      <!-- Diagram Canvas -->
      <grafloria-diagram-canvas
        [engine]="engine"
        [viewport]="viewport"
        [zoom]="zoom"
        [theme]="theme">
      </grafloria-diagram-canvas>
    </div>
  `,
  styles: [`
    .diagram-container {
      display: flex;
      height: 100vh;
    }
    grafloria-interaction-config-panel {
      width: 300px;
      flex-shrink: 0;
    }
    grafloria-diagram-canvas {
      flex: 1;
    }
  `]
})
export class DiagramComponent {
  engine: DiagramEngine;
  viewport = { x: 0, y: 0, width: 1000, height: 800 };
  zoom = 1.0;
  theme = LIGHT_THEME;

  constructor() {
    // Create engine with default interaction config
    this.engine = new DiagramEngine({
      interaction: {
        mode: 'smart', // or 'direct' or 'deliberate'
        portVisibility: 'on-hover',
        enableSmartAutoConnect: true,
      }
    });

    // Create your diagram
    this.createDiagram();
  }

  createDiagram() {
    const diagram = this.engine.createDiagram();

    // Add nodes with ports
    const node1 = diagram.addNode({
      id: 'node1',
      position: { x: 100, y: 100 },
      size: { width: 150, height: 100 },
    });

    node1.addPort({
      id: 'port1',
      type: 'output',
      position: { x: 150, y: 50 },
      alignment: { side: 'right', offset: 0.5 }
    });

    // ... add more nodes and ports
  }

  onConfigChange(config: any) {
    console.log('Config changed:', config);
    // Handle configuration changes if needed
  }
}
```

## Three Interaction Modes

### 1. Direct Mode

**Best for**: Power users, fast workflows

**Behavior**:
- Click and drag node body → Move node immediately
- Click and drag port → Start connection
- No need to select first

**Configuration**:
```typescript
engine.setInteractionConfig({
  mode: 'direct',
  portVisibility: 'always', // Ports always visible
});
```

**Use cases**:
- Technical diagrams where speed is important
- Users familiar with diagram tools
- Workflows with many quick edits

### 2. Deliberate Mode

**Best for**: Beginners, safety-critical workflows

**Behavior**:
- Click node → Select it first
- Click and drag selected node → Move node
- Click port → Start connection
- Prevents accidental moves

**Configuration**:
```typescript
engine.setInteractionConfig({
  mode: 'deliberate',
  portVisibility: 'always',
});
```

**Use cases**:
- New users learning the interface
- Workflows where accidental changes are costly
- Touch-screen interfaces

### 3. Smart Mode (Visio-style)

**Best for**: Clean UI, intelligent workflows

**Behavior**:
- Ports hidden by default, appear on node hover
- Ports at edge midpoints (top, right, bottom, left)
- Port scales up on hover (6px → 10px)
- Drop on node body → Auto-connect to nearest port
- Drop on specific port → Connect to that exact port
- Visual feedback during drag

**Configuration**:
```typescript
engine.setInteractionConfig({
  mode: 'smart',
  portVisibility: 'on-hover',
  portHoverScaleFactor: 1.5,
  enableSmartAutoConnect: true,
  snapToPortRadius: 30, // Proximity for auto-connect
});
```

**Use cases**:
- Clean, modern UI
- Microsoft Visio users
- Workflows with many connections

## Components

### DiagramCanvasComponent

Main component for rendering and interaction.

**Inputs**:
- `engine`: DiagramEngine instance (required)
- `viewport`: Rectangle for view area
- `zoom`: Zoom level (default: 1.0)
- `theme`: Theme object (default: LIGHT_THEME)
- `enableMouseWheelZoom`: Enable zoom with mouse wheel (default: true)
- `enablePan`: Enable panning (default: true)

**Outputs**:
- `viewportChanged`: Emits when viewport changes
- `zoomChanged`: Emits when zoom changes

**Example**:
```html
<grafloria-diagram-canvas
  [engine]="engine"
  [viewport]="viewport"
  [zoom]="zoom"
  [theme]="LIGHT_THEME"
  [enableMouseWheelZoom]="true"
  [enablePan]="true"
  (viewportChanged)="onViewportChange($event)"
  (zoomChanged)="onZoomChange($event)">
</grafloria-diagram-canvas>
```

### InteractionConfigPanelComponent

Configuration UI for interaction settings.

**Inputs**:
- `engine`: DiagramEngine instance (required)
- `expanded`: Panel expanded by default (default: false)
- `title`: Panel title (default: 'Interaction Settings')
- `showAdvanced`: Show advanced settings (default: true)

**Outputs**:
- `configChanged`: Emits when config changes

**Example**:
```html
<grafloria-interaction-config-panel
  [engine]="engine"
  [expanded]="false"
  [title]="'Settings'"
  [showAdvanced]="true"
  (configChanged)="onConfigChange($event)">
</grafloria-interaction-config-panel>
```

## Configuration

### InteractionConfig Interface

```typescript
interface InteractionConfig {
  // Interaction mode
  mode: 'direct' | 'deliberate' | 'smart';

  // Port visibility
  portVisibility: 'always' | 'on-hover' | 'hidden';

  // Port appearance
  portDefaultRadius: number; // Default: 6px
  portHoverScaleFactor: number; // Default: 1.5x

  // Connection behavior
  showConnectionPreview: boolean; // Default: true
  connectionLineStyle: 'bezier' | 'straight'; // Default: 'bezier'
  animateConnectionPreview: boolean; // Default: true

  // Smart mode settings
  enableSmartAutoConnect: boolean; // Default: true
  snapToPortRadius: number; // Default: 30px

  // Link reconnection
  enableLinkReconnection: boolean; // Default: true
  showLinkEndpointHandles: boolean; // Default: true

  // Visual feedback
  highlightValidTargets: boolean; // Default: true
}
```

### Programmatic Configuration

```typescript
// Get current config
const config = engine.getInteractionConfig();

// Update config
engine.setInteractionConfig({
  mode: 'smart',
  portVisibility: 'on-hover',
  portDefaultRadius: 8,
});

// Listen to config changes
engine.eventBus.on('config:interaction-changed', (event) => {
  console.log('Config changed:', event.newConfig);
});
```

## Performance

### Performance Metrics

The InteractionHandlerService tracks performance metrics:

```typescript
import { InteractionHandlerService } from '@grafloria/angular';

@Component({ ... })
export class DiagramComponent {
  constructor(private interactionHandler: InteractionHandlerService) {
    // Get performance metrics
    setInterval(() => {
      const metrics = this.interactionHandler.getPerformanceMetrics();
      console.log('Hover detection:', metrics.hoverDetectionTime, 'ms');
      console.log('Connection update:', metrics.connectionUpdateTime, 'ms');
      console.log('Port hit test:', metrics.portHitTestTime, 'ms');
    }, 1000);
  }
}
```

### Optimization Tips

1. **Port Visibility**: Use `'on-hover'` instead of `'always'` for better performance with many nodes
2. **Cache Invalidation**: Call `invalidatePortHitCache()` when nodes move
3. **Debouncing**: Hover detection is automatically debounced to ~60fps
4. **Cleanup**: Call `dispose()` on InteractionHandlerService when destroying component

### Memory Management

```typescript
@Component({ ... })
export class DiagramComponent implements OnDestroy {
  constructor(private interactionHandler: InteractionHandlerService) {}

  ngOnDestroy() {
    // Clean up resources
    this.interactionHandler.dispose();
  }
}
```

## Keyboard Shortcuts

Global keyboard shortcuts work automatically:

- **Delete/Backspace**: Delete selected nodes or links
- **Escape**: Cancel connection or clear selection
- **Ctrl+A**: Select all nodes
- **Space**: Pan mode (hold and drag)

## Troubleshooting

### Ports not showing in Smart Mode

**Problem**: Ports don't appear when hovering over nodes.

**Solution**: Check port visibility configuration:
```typescript
engine.setInteractionConfig({
  portVisibility: 'on-hover', // Not 'hidden'
});
```

### Connections not working

**Problem**: Can't create connections between ports.

**Solution**: Ensure ports have correct types:
```typescript
node1.addPort({ id: 'out1', type: 'output' });
node2.addPort({ id: 'in1', type: 'input' });
// Connections work between output→input or bi-directional
```

### Performance issues with many nodes

**Problem**: Slow hover detection with 100+ nodes.

**Solution**:
1. Use `portVisibility: 'on-hover'`
2. Reduce `portDefaultRadius` to 4-5px
3. Disable animation: `animateConnectionPreview: false`

### Dark mode not working

**Problem**: Config panel doesn't switch to dark mode.

**Solution**: Dark mode uses `prefers-color-scheme`. Set it in your OS or override CSS:
```css
.config-panel {
  color-scheme: dark;
}
```

## Advanced Usage

### Custom Validation

Add custom connection validation:

```typescript
import { ConnectionStateManager } from '@grafloria/engine';

// In your component
const connectionManager = engine.getConnectionStateManager();

// Add custom validator
engine.eventBus.on('connection:start', (event) => {
  // Custom validation logic
  if (!isValidSource(event.sourcePort)) {
    connectionManager.cancelConnection();
  }
});
```

### Event Handling

Listen to connection events:

```typescript
engine.eventBus.on('connection:start', (event) => {
  console.log('Connection started:', event.sourcePort);
});

engine.eventBus.on('connection:complete', (event) => {
  console.log('Connection completed:', event.link);
});

engine.eventBus.on('connection:cancelled', () => {
  console.log('Connection cancelled');
});

engine.eventBus.on('link:reconnected', (event) => {
  console.log('Link reconnected:', event.endpoint);
});
```

### Custom Cursor

Override cursor behavior:

```typescript
import { InteractionHandlerService } from '@grafloria/angular';

@Component({ ... })
export class DiagramComponent {
  constructor(private interactionHandler: InteractionHandlerService) {}

  @HostListener('mousemove')
  onMouseMove() {
    const cursor = this.interactionHandler.getCursor(this.engine);
    // Apply custom logic
    document.body.style.cursor = cursor;
  }
}
```

## API Reference

See full API documentation at:
- Engine: `@grafloria/engine` README
- Renderer: `@grafloria/renderer` README
- Angular: `@grafloria/angular` README

## Support

For issues and questions:
- GitHub Issues: [repository-url]
- Documentation: [docs-url]
- Examples: [examples-url]
