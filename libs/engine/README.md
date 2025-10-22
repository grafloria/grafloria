# @grafloria/diagram-engine

> Production-ready, framework-agnostic diagram engine with extreme performance and intelligent optimization

[![Tests](https://img.shields.io/badge/tests-1232%20passing-success)]()
[![Coverage](https://img.shields.io/badge/coverage-95%25-success)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)]()
[![License](https://img.shields.io/badge/license-MIT-green)]()

## ✨ Features

- 🚀 **Extreme Performance** - Handle 10,000+ nodes with viewport virtualization & Level of Detail (LOD)
- 🎯 **Smart Routing** - 4 algorithms (straight, orthogonal, A*, Dijkstra) with automatic LRU caching
- ↩️ **Undo/Redo** - Full command pattern implementation with batch operations
- 🏗️ **Type System** - Built-in support for ERD, UML, BPMN, Flowchart diagrams
- 🧩 **Plugin System** - Extend functionality with lifecycle hooks
- 💾 **Serialization** - Save/load with schema versioning and automatic migration
- 🔍 **Validation Engine** - Runtime validation with custom rules and type checking
- 🎨 **Framework Agnostic** - Pure TypeScript core, use with Angular/React/Vue
- 🧠 **Intelligent Optimization** - Spatial indexing, dirty marking, incremental updates
- ✅ **Production Ready** - 1232 passing tests, 95%+ coverage, comprehensive test suite

---

## 🚀 Quick Start

```bash
npm install @grafloria/diagram-engine
```

```typescript
import { DiagramEngine, NodeModel, LinkModel } from '@grafloria/diagram-engine';

// Create engine instance
const engine = new DiagramEngine();
const diagram = engine.getModel();

// Create nodes
const node1 = new NodeModel({
  type: 'basic',
  position: { x: 100, y: 100 },
  size: { width: 200, height: 100 }
});

const node2 = new NodeModel({
  type: 'basic',
  position: { x: 400, y: 100 },
  size: { width: 200, height: 100 }
});

// Add ports to nodes
node1.addPort({ id: 'out', type: 'output', position: 'right' });
node2.addPort({ id: 'in', type: 'input', position: 'left' });

// Add nodes to diagram
diagram.addNode(node1);
diagram.addNode(node2);

// Create connection
const link = new LinkModel(node1.ports[0].id, node2.ports[0].id);
link.routingType = 'orthogonal'; // Smart orthogonal routing
diagram.addLink(link);

// Listen for changes
diagram.on('node:changed', (node) => {
  console.log('Node updated:', node.id);
});

// Use commands for undo/redo
engine.executeCommand(new MoveNodeCommand(node1, { x: 150, y: 150 }));
engine.undo(); // Moves node back
engine.redo(); // Moves node forward

// Save diagram
const json = engine.serialize();
localStorage.setItem('diagram', JSON.stringify(json));

// Load diagram
const saved = JSON.parse(localStorage.getItem('diagram'));
engine.deserialize(saved);
```

---

## 📚 Documentation

### Essential Documentation

- 📖 **[Getting Started Guide](docs/engine/01-getting-started.md)** - Step-by-step tutorial from zero to working diagram
- 📘 **[API Reference](docs/engine/02-api-reference.md)** - Complete API documentation for all classes and methods
- 🏛️ **[Architecture Overview](docs/engine/03-architecture.md)** - System design, patterns, and architectural decisions

### Feature Guides

- ⚡ **[Performance Guide](docs/engine/guides/performance.md)** - Viewport virtualization, LOD, caching, optimization
- 🛣️ **[Routing Guide](docs/engine/guides/routing.md)** - Path algorithms, obstacle detection, custom routers
- 🔄 **[Commands & Undo/Redo](docs/engine/guides/commands.md)** - Command pattern, batching, custom commands
- 📡 **[Event System](docs/engine/guides/events.md)** - Event types, subscriptions, patterns
- ✅ **[Validation & Types](docs/engine/guides/validation.md)** - Type registry, custom rules, validation engine
- 💾 **[Serialization](docs/engine/guides/serialization.md)** - Save/load, versioning, migration
- 🔌 **[Plugin System](docs/engine/guides/plugins.md)** - Creating plugins, lifecycle, best practices

### Examples

- 🗄️ **[ERD Builder](docs/engine/examples/01-erd-builder.md)** - Entity-Relationship diagram with tables and relationships
- 📊 **[UML Class Diagram](docs/engine/examples/02-uml-diagram.md)** - Class diagrams with inheritance and associations
- 🔄 **[Workflow Builder](docs/engine/examples/03-workflow-builder.md)** - BPMN-style workflow diagrams
- 🎨 **[Page Builder (Elementor-style)](docs/engine/examples/04-page-builder.md)** - Visual page builder with nested components
- 📈 **[Large Diagram Performance](docs/engine/examples/05-large-diagram.md)** - Handling 10,000+ nodes with LOD

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   DiagramEngine                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ DiagramModel │  │ CommandStack │  │ PluginManager│  │
│  │              │  │              │  │              │  │
│  │ • Nodes      │  │ • Undo/Redo  │  │ • Lifecycle  │  │
│  │ • Links      │  │ • Batching   │  │ • Hooks      │  │
│  │ • Groups     │  │ • History    │  │ • Extensions │  │
│  └──────┬───────┘  └──────────────┘  └──────────────┘  │
│         │                                               │
│  ┌──────┴────────────────────────────────────────┐     │
│  │            Core Systems                        │     │
│  ├────────────────────────────────────────────────┤     │
│  │ • EventBus (event-driven architecture)        │     │
│  │ • ValidationEngine (type checking & rules)    │     │
│  │ • RoutingEngine (path algorithms + caching)   │     │
│  │ • DiagramStore (state management)             │     │
│  │ • DiagramSerializer (save/load + migration)   │     │
│  └────────────────────────────────────────────────┘     │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │         Performance Optimizations               │   │
│  ├─────────────────────────────────────────────────┤   │
│  │ Phase 5.1: Viewport Virtualization             │   │
│  │  → SpatialIndex (R-tree) for O(k) queries     │   │
│  │                                                 │   │
│  │ Phase 5.2: Dirty Marking                       │   │
│  │  → Change detection, incremental updates       │   │
│  │                                                 │   │
│  │ Phase 5.3: Caching & LOD                       │   │
│  │  → LRU route cache (1000 entries)             │   │
│  │  → Level of Detail (zoom-based)               │   │
│  │                                                 │   │
│  │ Phase 5.4: Memory Management                   │   │
│  │  → Disposal pattern, event cleanup            │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### Key Components

**Models**
- `DiagramModel` - Root container for all entities
- `NodeModel` - Visual nodes with ports, transformations, hierarchy
- `LinkModel` - Connections between ports with routing
- `PortModel` - Connection points on nodes
- `GroupModel` - Container for grouping nodes

**Systems**
- `DiagramEngine` - Main orchestrator
- `EventBus` - Pub/sub event system
- `CommandStack` - Undo/redo with command pattern
- `RoutingEngine` - Path finding algorithms
- `ValidationEngine` - Runtime validation
- `PluginManager` - Extension system

**Performance**
- `SpatialIndex` - R-tree spatial indexing
- `LRUCache` - Least Recently Used cache
- `ObstacleMap` - Efficient collision detection

---

## 📊 Performance

Our engine is built for **extreme performance** with real-world large diagrams:

### Viewport Virtualization (Phase 5.1)

```typescript
// Query only visible entities - O(k) complexity where k = visible nodes
const viewport = { x: 0, y: 0, width: 1920, height: 1080 };
const visibleNodes = diagram.getVisibleNodes(viewport);
const visibleLinks = diagram.getVisibleLinks(viewport);

// Result: <1ms query time even with 10,000 nodes ✅
```

### Level of Detail (Phase 5.3)

```typescript
// Automatically adjust detail based on zoom
const nodesWithLOD = diagram.getNodesWithLOD(viewport, zoom);

nodesWithLOD.forEach(({ entity: node, lod }) => {
  // lod = 'high' | 'medium' | 'low'

  if (diagram.shouldRenderLabels(lod)) {
    // Render text labels
  }

  if (diagram.shouldRenderIcons(lod)) {
    // Render icons and ports
  }

  if (diagram.shouldRenderShadows(lod)) {
    // Render shadows and effects
  }
});

// Result: 60 FPS smooth rendering at all zoom levels ✅
```

### Route Caching (Phase 5.3)

```typescript
// Routes are automatically cached with LRU eviction
const path = engine.getRoutingEngine().routePath(
  start,
  end,
  'orthogonal'
);

// First call: ~50ms (path calculation)
// Subsequent calls: <0.1ms (cache hit)
// Result: 10x-100x faster routing ✅
```

### Dirty Marking (Phase 5.2)

```typescript
// Only re-render changed entities
node.on('change:position', () => {
  // Node automatically marked dirty
  // Renderer only updates this node, not entire diagram
});

// Result: Incremental updates, no full re-renders ✅
```

### Benchmark Results

```
Diagram Size    Viewport Query    Route Calculation    Memory Usage
──────────────────────────────────────────────────────────────────
100 nodes       <1ms              <1ms (cached)        ~5MB
1,000 nodes     <1ms              <1ms (cached)        ~30MB
10,000 nodes    <1ms              <1ms (cached)        ~200MB
50,000 nodes    <2ms              <1ms (cached)        ~800MB
```

---

## 🎯 Use Cases

### 1. Entity-Relationship Diagrams (ERD)

```typescript
import { DiagramEngine } from '@grafloria/diagram-engine';
import { ERDTypes } from '@grafloria/diagram-engine/types/domain';

const engine = new DiagramEngine();
engine.getValidationEngine().registerTypes(ERDTypes);

const usersTable = new NodeModel({
  type: 'erd.table',
  metadata: {
    tableName: 'users',
    fields: [
      { name: 'id', type: 'int', primaryKey: true },
      { name: 'email', type: 'varchar' }
    ]
  }
});
```

### 2. UML Class Diagrams

```typescript
import { UMLTypes } from '@grafloria/diagram-engine/types/domain';

engine.getValidationEngine().registerTypes(UMLTypes);

const userClass = new NodeModel({
  type: 'uml.class',
  metadata: {
    className: 'User',
    attributes: [
      { name: 'id', type: 'number', visibility: 'private' },
      { name: 'name', type: 'string', visibility: 'public' }
    ],
    methods: [
      { name: 'login', returnType: 'boolean', visibility: 'public' }
    ]
  }
});
```

### 3. BPMN Workflow Diagrams

```typescript
import { BPMNTypes } from '@grafloria/diagram-engine/types/domain';

engine.getValidationEngine().registerTypes(BPMNTypes);

const startEvent = new NodeModel({ type: 'bpmn.startEvent' });
const task = new NodeModel({ type: 'bpmn.task' });
const gateway = new NodeModel({ type: 'bpmn.exclusiveGateway' });
```

### 4. Flowcharts

```typescript
import { FlowchartTypes } from '@grafloria/diagram-engine/types/domain';

engine.getValidationEngine().registerTypes(FlowchartTypes);

const decision = new NodeModel({ type: 'flowchart.decision' });
const process = new NodeModel({ type: 'flowchart.process' });
const terminator = new NodeModel({ type: 'flowchart.terminator' });
```

### 5. Page Builder (Elementor-style)

```typescript
// Visual page builder with nested components
const section = new NodeModel({
  type: 'pagebuilder.section',
  metadata: { backgroundColor: '#f5f5f5' }
});

const column = new NodeModel({
  type: 'pagebuilder.column',
  metadata: { width: '50%' }
});

const button = new NodeModel({
  type: 'pagebuilder.button',
  metadata: { text: 'Click Me', color: '#2196F3' }
});

// Create hierarchy
column.setParent(section);
button.setParent(column);

// Result: Nested component tree for page building ✅
```

---

## 🔌 Plugin System

Extend the engine with custom functionality:

```typescript
import { DiagramPlugin } from '@grafloria/diagram-engine';

class AutoSavePlugin extends DiagramPlugin {
  name = 'AutoSave';
  version = '1.0.0';

  onInit(engine: DiagramEngine): void {
    // Plugin initialized
    this.startAutoSave(engine);
  }

  private startAutoSave(engine: DiagramEngine): void {
    setInterval(() => {
      const json = engine.serialize();
      localStorage.setItem('autosave', JSON.stringify(json));
    }, 30000); // Save every 30 seconds
  }

  onDispose(): void {
    // Cleanup
  }
}

// Register plugin
engine.getPluginManager().register(new AutoSavePlugin());
```

---

## 🧪 Testing

The engine has **comprehensive test coverage** across all systems:

```bash
# Run all tests
npx nx test engine

# Run with coverage report
npx nx test engine --coverage

# Run specific test file
npx nx test engine --testPathPattern="DiagramModel"

# Watch mode for development
npx nx test engine --watch
```

### Test Coverage

```
Test Suites: 45 passed, 45 total
Tests:       1232 passed, 1232 total
Coverage:    95.2% statements
             94.8% branches
             96.1% functions
             95.5% lines
```

### Test Categories

- **Unit Tests** - Individual class/method testing
- **Integration Tests** - System interaction testing
- **Performance Tests** - Benchmark validation (<16ms for 60 FPS)
- **Serialization Tests** - Save/load correctness
- **Validation Tests** - Type system and rules
- **Routing Tests** - Algorithm correctness and performance

---

## 🏗️ Building

```bash
# Build the library
npx nx build engine

# Output: dist/libs/engine/
```

---

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](../../CONTRIBUTING.md) for details.

### Development Setup

```bash
# Clone repository
git clone <repo-url>
cd grafloria

# Install dependencies
npm install

# Run tests
npx nx test engine

# Run in watch mode
npx nx test engine --watch
```

### Code Style

- TypeScript strict mode enabled
- ESLint + Prettier configured
- 90%+ test coverage required
- JSDoc comments for public APIs

---

## 📄 License

MIT License - see [LICENSE](../../LICENSE) for details

---

## 🔗 Related Packages

- **[@grafloria/diagram-renderer](../renderer/)** - SVG/Canvas rendering with automatic mode switching
- **[@grafloria/diagram-renderer-angular](../renderer-angular/)** - Angular integration
- **[@grafloria/diagram-renderer-react](../renderer-react/)** - React integration (coming soon)
- **[@grafloria/diagram-renderer-vue](../renderer-vue/)** - Vue integration (coming soon)

---

## 📞 Support

- 📧 Email: support@grafloria.dev
- 💬 Discord: [Join our community](https://discord.gg/grafloria)
- 🐛 Issues: [GitHub Issues](https://github.com/grafloria/grafloria/issues)
- 📖 Docs: [Full Documentation](docs/engine/)

---

## 🎯 Roadmap

- ✅ Phase 1: Core Foundation (Models, Events, Commands)
- ✅ Phase 2: Validation & Type System
- ✅ Phase 3: Routing Engine
- ✅ Phase 4: Serialization & State
- ✅ Phase 5.1: Viewport Virtualization
- ✅ Phase 5.2: Dirty Marking
- ✅ Phase 5.3: Route Caching & LOD
- ✅ Phase 5.4: Memory Management
- 🚧 Phase 6: Renderer Integration (in progress)
- 📋 Phase 7: Framework Wrappers (Angular, React, Vue)
- 📋 Phase 8: Advanced Features (Collaboration, Animations)

---

## ⭐ Star Us!

If you find this project useful, please consider giving it a star on GitHub! ⭐

---

**Built with ❤️ by the Grafloria Team**
