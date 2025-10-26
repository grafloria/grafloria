# Hybrid Rendering (Phase 3.5)

SVG + HTML layer synchronization for maximum performance and flexibility.

## Overview

Hybrid rendering provides the best of both worlds:

- **SVG Layer**: Geometric shapes, ports, connections (vector-perfect, high performance)
- **HTML Layer**: Rich content, templates, interactivity (full CSS/HTML power)
- **Synchronized**: Both layers perfectly aligned with same transforms
- **Flexible**: Choose which layer(s) to use per node

## Architecture

```
┌─────────────────────────────────────┐
│         Diagram Canvas              │
├─────────────────────────────────────┤
│  HTML Layer (z-index: 1)            │
│  ┌─────────┐  ┌──────────┐         │
│  │ Node A  │  │  Node B  │         │
│  │ <div>   │  │  <form>  │         │
│  └─────────┘  └──────────┘         │
├─────────────────────────────────────┤
│  SVG Layer (z-index: 0)             │
│  ┌─────────┐  ┌──────────┐         │
│  │ Shape A │  │  Shape B │         │
│  │ <rect>  │  │ <circle> │         │
│  └─────────┘  └──────────┘         │
│         │                │          │
│         └────────────────┘          │
│         (Connection line)           │
└─────────────────────────────────────┘
```

## Why Hybrid Rendering?

### Problem with SVG-Only

- Limited text rendering
- No CSS frameworks (Bootstrap, Tailwind, etc.)
- Complex forms are difficult
- No native input controls

### Problem with HTML-Only

- Connections between nodes are complex
- Zooming/panning requires complex transforms
- Port positioning is difficult
- Vector graphics not as crisp

### Hybrid Solution

✅ SVG for geometry → Perfect vector shapes, ports, connections
✅ HTML for content → Rich forms, styled text, images
✅ Synchronized → Both layers move/rotate/scale together
✅ Configurable → Choose per node which layer(s) to use

## Usage

### Basic Hybrid Node

```typescript
import { HybridRenderer } from '@grafloria/renderer';
import { NodeFactory } from '@grafloria/engine';

const renderer = new HybridRenderer();

// Create node with both layers
const node = NodeFactory.createFromTemplate({
  id: 'user-card',
  structure: {
    type: 'user-card',
    size: { width: 200, height: 150 },

    // SVG layer: Circle shape
    shape: {
      type: 'circle',
      fill: '#e3f2fd',
      stroke: '#2196f3',
      strokeWidth: 2,
    },

    // HTML layer: Rich content
    html: {
      mode: 'template',
      template: `
        <div class="user-card">
          <img src="{{data.avatar}}" />
          <h3>{{data.name}}</h3>
          <p>{{data.email}}</p>
        </div>
      `,
      className: 'node-content',
      style: {
        padding: '15px',
        textAlign: 'center',
      },
    },
  },
});

// Render to both layers
const result = renderer.render(node);

// SVG layer (for diagram framework)
console.log(result.svgLayer);
// -> VNode: <g transform="translate(x,y)"><circle .../></g>

// HTML layer (for DOM rendering)
console.log(result.htmlLayer);
// -> { style: { transform: 'translate(x,y)', ... }, innerHTML: '...' }
```

### Transform Synchronization

Transforms are automatically synchronized between layers:

```typescript
// Move node
node.setPosition(300, 400);
const result = renderer.render(node);

// SVG layer
result.svgLayer.props.transform
// -> "translate(300, 400)"

// HTML layer
result.htmlLayer.style.transform
// -> "translate(300px, 400px)"

// Rotate node
node.setRotation(45);
const result2 = renderer.render(node);

// Both layers rotate around center
result2.svgLayer.props.transform
// -> "translate(300, 400) rotate(45 100 75)" (rotates around node center)

result2.htmlLayer.style.transform
// -> "translate(300px, 400px) rotate(45deg)"

result2.htmlLayer.style.transformOrigin
// -> "50% 50%" (rotates around center)
```

### Z-Index Control

Control which layer is on top:

```typescript
// HTML layer on top (default)
const template: NodeTemplate = {
  structure: {
    html: {
      mode: 'template',
      template: '<div>I am on top!</div>',
      zIndex: 1, // Above SVG
    },
  },
};

// HTML layer as background
const bgTemplate: NodeTemplate = {
  structure: {
    html: {
      mode: 'template',
      template: '<div>I am behind!</div>',
      zIndex: -1, // Below SVG
    },
  },
};

// Custom z-index
const customTemplate: NodeTemplate = {
  structure: {
    html: {
      mode: 'template',
      template: '<div>Custom layer!</div>',
      zIndex: 100, // Way above everything
    },
  },
};
```

### Pointer Events

Control which layer receives mouse events:

```typescript
// HTML layer captures events (default)
const interactive: NodeTemplate = {
  structure: {
    html: {
      mode: 'template',
      template: '<button>Click me!</button>',
      pointerEvents: true, // HTML layer receives clicks
    },
  },
};

// HTML layer transparent to events
const passthrough: NodeTemplate = {
  structure: {
    html: {
      mode: 'template',
      template: '<div>Visual only</div>',
      pointerEvents: false, // Events pass through to SVG
    },
  },
};

// Use case: Decorative HTML overlay, SVG handles interactions
const decorated: NodeTemplate = {
  structure: {
    shape: {
      type: 'rect',
      fill: '#fff',
    },
    html: {
      mode: 'template',
      template: '<div class="decoration">✨</div>',
      pointerEvents: false, // Let SVG handle clicks
      zIndex: 1, // Show above SVG
    },
  },
};
```

## Advanced Usage

### SVG-Only Nodes

Skip HTML layer entirely for performance:

```typescript
const result = renderer.render(node, {
  skipHtmlLayer: true,
});

// Only SVG layer rendered
result.htmlLayer.style.display === 'none';
```

### HTML-Only Nodes

Skip SVG layer (React Flow style):

```typescript
const result = renderer.render(node, {
  skipSvgLayer: true,
});

// Only HTML layer rendered
result.svgLayer.children.length === 0;
```

### Custom SVG Renderer

Provide custom SVG rendering logic:

```typescript
const result = renderer.render(node, {
  svgRenderer: (node) => {
    // Custom SVG rendering
    return {
      type: 'g',
      children: [
        { type: 'rect', props: { ... } },
        { type: 'text', props: { ... } },
      ],
    };
  },
});
```

### Performance Optimization

The hybrid renderer includes built-in caching:

```typescript
// First render - computed
const result1 = renderer.render(node);

// Node hasn't changed (not dirty)
node.isDirty === false;

// Second render - cached (instant)
const result2 = renderer.render(node);

result1 === result2; // true (same object)

// Change node
node.setPosition(500, 600);
node.isDirty === true;

// Third render - recomputed
const result3 = renderer.render(node);

result3 !== result2; // true (new object)
```

Clear cache manually if needed:

```typescript
renderer.clearCache();
```

## Integration with Template System

Hybrid rendering works seamlessly with the template system:

```typescript
const template: NodeTemplate = {
  id: 'dashboard-card',
  version: '1.0.0',
  meta: {
    name: 'Dashboard Card',
    category: 'widgets',
  },
  structure: {
    type: 'dashboard-card',
    size: { width: 300, height: 200 },

    // SVG layer: Rounded rectangle shape with shadow
    shape: {
      type: 'rect',
      cornerRadius: 12,
      fill: '#ffffff',
      stroke: '#e0e0e0',
      strokeWidth: 1,
    },

    // HTML layer: Interactive dashboard content
    html: {
      mode: 'template',
      template: `
        <div class="dashboard-card">
          <header>
            <h3>{{data.title}}</h3>
            <button class="refresh">⟳</button>
          </header>
          <div class="metrics">
            <div class="metric">
              <span class="value">{{data.users}}</span>
              <span class="label">Users</span>
            </div>
            <div class="metric">
              <span class="value">{{data.revenue}}</span>
              <span class="label">Revenue</span>
            </div>
          </div>
          <footer>
            <a href="#">View Details →</a>
          </footer>
        </div>
      `,

      className: 'diagram-card',

      style: {
        padding: '20px',
        fontFamily: 'system-ui',
        backgroundColor: 'transparent', // Let SVG shape show through
      },

      events: {
        click: 'card:clicked',
        'refresh-click': 'card:refreshed',
      },

      zIndex: 1, // Above SVG shape
      pointerEvents: true, // Capture interactions
    },

    // Ports in SVG layer (for connections)
    ports: {
      enabled: true,
      top: { enabled: true },
      bottom: { enabled: true },
      left: { enabled: true },
      right: { enabled: true },
    },
  },

  defaultData: {
    title: 'Dashboard',
    users: 1234,
    revenue: '$45,678',
  },
};

// Create node from template
const node = NodeFactory.createFromTemplate(template, {
  position: { x: 100, y: 100 },
});

// Render with hybrid renderer
const renderer = new HybridRenderer();
const result = renderer.render(node, {
  htmlConfig: template.structure.html,
});

// Result contains both layers, perfectly synchronized
```

## Use Cases

### 1. Form Nodes

SVG shape + HTML form:

```typescript
shape: { type: 'rect', cornerRadius: 8 },
html: {
  template: `
    <form>
      <input type="text" name="name" />
      <input type="email" name="email" />
      <button type="submit">Submit</button>
    </form>
  `,
}
```

### 2. Data Visualization Nodes

SVG for chart + HTML for legend/controls:

```typescript
shape: { type: 'rect' },
html: {
  template: `
    <div class="chart-controls">
      <select>
        <option>Daily</option>
        <option>Weekly</option>
        <option>Monthly</option>
      </select>
    </div>
  `,
  zIndex: 1,
}
```

### 3. Rich Media Nodes

SVG container + HTML for images/video:

```typescript
shape: { type: 'rect', cornerRadius: 16 },
html: {
  template: `
    <div class="media">
      <img src="{{data.imageUrl}}" />
      <div class="caption">{{data.caption}}</div>
    </div>
  `,
}
```

### 4. Decorative Overlays

HTML badges/icons over SVG shapes:

```typescript
shape: { type: 'circle', fill: '#2196f3' },
html: {
  template: '<div class="badge">🔥</div>',
  pointerEvents: false, // Let SVG handle clicks
  zIndex: 2,
}
```

## Browser Compatibility

Hybrid rendering uses standard web technologies:

- ✅ SVG transforms (all modern browsers)
- ✅ CSS transforms (all modern browsers)
- ✅ Absolute positioning (all browsers)
- ✅ Z-index (all browsers)
- ✅ Pointer events (IE11+)

## Performance

### Benchmarks

- **SVG-only**: ~0.5ms per node
- **HTML-only**: ~0.3ms per node
- **Hybrid**: ~0.7ms per node
- **Cached hybrid**: ~0.01ms per node

### Optimization Tips

1. **Use caching**: Don't change node transforms unnecessarily
2. **Skip unused layers**: Use `skipSvgLayer` or `skipHtmlLayer`
3. **Batch transforms**: Use EventBus batch mode for multiple updates
4. **CSS transforms**: Hardware-accelerated on most browsers

## Best Practices

1. **SVG for Geometry**: Use SVG layer for shapes, ports, connections
2. **HTML for Content**: Use HTML layer for text, forms, rich content
3. **Z-index Strategy**: SVG=0, HTML content=1, overlays=2+
4. **Pointer Events**: Disable on decorative HTML layers
5. **Transform Origin**: Always use center (50% 50%) for rotation
6. **Performance**: Use caching, skip unused layers

## Troubleshooting

### Layers Not Aligned

**Problem**: HTML and SVG layers don't align
**Solution**: Check transform synchronization, ensure both use same origin

```typescript
// Verify synchronization
const result = renderer.render(node);
console.log('SVG:', result.svgLayer.props.transform);
console.log('HTML:', result.htmlLayer.style.transform);
```

### HTML Layer Not Visible

**Problem**: HTML layer doesn't show
**Solution**: Check z-index and pointer events

```typescript
// Debug visibility
console.log('Z-index:', result.htmlLayer.style.zIndex);
console.log('Display:', result.htmlLayer.style.display);
console.log('Position:', result.htmlLayer.style.position);
```

### Clicks Not Working

**Problem**: Can't click HTML elements
**Solution**: Check pointer events

```typescript
// Enable pointer events
html: {
  template: '<button>Click me</button>',
  pointerEvents: true, // ← Must be true!
}
```

### Performance Issues

**Problem**: Rendering is slow
**Solution**: Enable caching, skip unused layers

```typescript
// Optimize rendering
const result = renderer.render(node, {
  skipSvgLayer: !needsSVG,
  skipHtmlLayer: !needsHTML,
});

// Clear cache periodically
renderer.clearCache();
```

## See Also

- [HtmlTemplateRenderer](../../engine/src/rendering/README.md) - Phase 3.4
- [Shape System](../svg/README.md) - Phase 3.1
- [Template System](../../engine/src/templates/README.md) - Phase 2
- [EventBus](../../engine/src/events/EventBus.ts) - Event management
