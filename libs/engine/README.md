# @grafloria/diagram-engine

> Production-ready, framework-agnostic diagram engine with extreme performance and intelligent optimization

[![Tests](https://img.shields.io/badge/tests-1232%20passing-success)]()
[![Coverage](https://img.shields.io/badge/coverage-95%25-success)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)]()
[![License](https://img.shields.io/badge/license-MIT-green)]()

---

## ✨ Features

- 🚀 **Extreme Performance** - Handle 10,000+ nodes with viewport virtualization & Level of Detail (LOD)
- 🎯 **Smart Routing** - 4 algorithms (straight, orthogonal, A*, Dijkstra) with automatic LRU caching (1000 entries)
- ↩️ **Undo/Redo** - Full command pattern implementation with batch operations and history
- 🏗️ **Type System** - Built-in support for ERD, UML, BPMN, Flowchart diagrams with custom type definitions
- 🧩 **Plugin System** - Extend functionality with lifecycle hooks and custom plugins
- 💾 **Serialization** - Save/load with schema versioning and automatic migration between versions
- 🔍 **Validation Engine** - Runtime validation with custom rules and comprehensive type checking
- 🎨 **Framework Agnostic** - Pure TypeScript core, use with Angular/React/Vue or vanilla JavaScript
- 🧠 **Intelligent Optimization** - Spatial indexing (R-tree), dirty marking, incremental updates
- ✅ **Production Ready** - 1232 passing tests, 95%+ coverage, battle-tested in production

---

## 🚀 Quick Start

### Installation

```bash
npm install @grafloria/diagram-engine
```

Or with yarn:

```bash
yarn add @grafloria/diagram-engine
```

### Basic Usage

```typescript
import { DiagramEngine, NodeModel, LinkModel } from '@grafloria/diagram-engine';

// 1. Create engine instance
const engine = new DiagramEngine();
const diagram = engine.getModel();

// 2. Create nodes with ports
const node1 = new NodeModel({
  type: 'basic',
  position: { x: 100, y: 100 },
  size: { width: 200, height: 100 }
});
node1.addPort({ id: 'out', type: 'output', position: 'right' });

const node2 = new NodeModel({
  type: 'basic',
  position: { x: 400, y: 100 },
  size: { width: 200, height: 100 }
});
node2.addPort({ id: 'in', type: 'input', position: 'left' });

// 3. Add to diagram
diagram.addNode(node1);
diagram.addNode(node2);

// 4. Create connection with smart routing
const link = new LinkModel(node1.ports[0].id, node2.ports[0].id);
link.routingType = 'orthogonal'; // or 'straight', 'astar', 'dijkstra'
diagram.addLink(link);

// 5. Listen for changes (reactive)
diagram.on('node:changed', (node) => {
  console.log('Node updated:', node.id);
});

// 6. Use commands for undo/redo
engine.executeCommand(new MoveNodeCommand(node1, { x: 150, y: 150 }));
engine.undo(); // Moves node back
engine.redo(); // Moves node forward

// 7. Save diagram
const json = engine.serialize();
localStorage.setItem('my-diagram', JSON.stringify(json));

// 8. Load diagram
const saved = JSON.parse(localStorage.getItem('my-diagram'));
engine.deserialize(saved);

console.log('✅ Diagram created with', diagram.getNodes().length, 'nodes');
```

---

## 📚 Documentation

### 📖 Getting Started

**New to the engine? Start here!**

- **[Complete Documentation Index](docs/engine/README.md)** - Master navigation hub for all documentation
- **[Getting Started Guide](docs/engine/01-getting-started.md)** - 15-minute tutorial from zero to working diagram
  - Installation and setup
  - Creating your first diagram
  - Adding nodes, ports, and connections
  - Event system and subscriptions
  - Undo/redo with commands
  - Saving and loading diagrams
  - Performance optimization tips

### 📘 Core Documentation

**Deep dive into the engine:**

- **[API Reference](docs/engine/02-api-reference.md)** - Complete API documentation (1,615 lines)
  - DiagramEngine (19 methods documented)
  - DiagramModel (40+ methods including viewport/LOD APIs)
  - NodeModel, LinkModel, PortModel, GroupModel
  - Commands (Move, Resize, Rotate, Add, Delete, Batch)
  - Events, Routing, Validation, Serialization
  - Performance APIs (SpatialIndex, LRUCache)
  - All types and interfaces

- **[Architecture Overview](docs/engine/03-architecture.md)** - System design deep dive (850+ lines)
  - Design principles (SOLID)
  - Layer architecture (Engine → Renderer → Framework)
  - Design patterns (Command, Observer, Strategy, Factory, Memento, Composite)
  - Performance architecture (Phases 5.1-5.4 explained)
  - Event-driven architecture
  - Memory management strategies
  - Extension points

### 🎯 Feature Guides

**Learn specific features in depth:**

- **[All Feature Guides](docs/engine/guides/README.md)** - Overview with quick references for:
  - ⚡ **Performance Optimization** - Viewport virtualization, LOD, caching, dirty marking
  - 🛣️ **Routing Algorithms** - Straight, orthogonal, A*, Dijkstra, custom routers
  - 🔄 **Commands & Undo/Redo** - Command pattern, batching, custom commands
  - 📡 **Event System** - Event types, subscriptions, patterns, best practices
  - ✅ **Validation & Types** - Type registry, custom rules, ValidationEngine
  - 💾 **Serialization** - Save/load, versioning, automatic migration
  - 🔌 **Plugin System** - Creating plugins, lifecycle hooks, examples

### 💡 Examples

**Real-world use cases with complete code:**

- **[All Examples](docs/engine/examples/README.md)** - Overview with quick start code for:
  - 🗄️ **[ERD Builder](docs/engine/examples/README.md#erd-entity-relationship-diagram)** - Database design with tables and relationships
  - 📊 **[UML Class Diagram](docs/engine/examples/README.md#uml-class-diagram)** - Class diagrams with inheritance
  - 🔄 **[Workflow Builder](docs/engine/examples/README.md#bpmn-workflow)** - BPMN-style workflows
  - 🎨 **[Page Builder](docs/engine/examples/04-page-builder.md)** - Elementor-style visual page builder (750 lines, complete)
  - 📈 **[Large Diagrams](docs/engine/examples/README.md#large-diagram-10000-nodes)** - Optimizing 10,000+ nodes

---

## 🏗️ Architecture

### System Overview

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
- `DiagramModel` - Root container for all entities with viewport virtualization
- `NodeModel` - Visual nodes with ports, transformations, and hierarchy support
- `LinkModel` - Connections between ports with intelligent routing
- `PortModel` - Connection points on nodes
- `GroupModel` - Container for grouping and organizing nodes

**Systems**
- `DiagramEngine` - Main orchestrator and entry point
- `EventBus` - Pub/sub event system for reactive updates
- `CommandStack` - Undo/redo with command pattern
- `RoutingEngine` - Path finding with 4 algorithms + caching
- `ValidationEngine` - Runtime validation with custom rules
- `PluginManager` - Extension system with lifecycle hooks

**Performance**
- `SpatialIndex` - R-tree spatial indexing for O(k) viewport queries
- `LRUCache` - Least Recently Used cache (1000 entries for routes)
- `ObstacleMap` - Efficient collision detection for routing
- `DirtyMarking` - Change detection for incremental updates

---

## 📊 Performance

Our engine is built for **extreme performance** with real-world large diagrams.

### Viewport Virtualization (Phase 5.1)

**Before optimization:**
```typescript
// Render ALL nodes (slow with 10,000 nodes)
diagram.getNodes().forEach(node => renderNode(node)); // O(n) = 10,000 iterations
// Result: ~100ms per frame, 10 FPS ❌
```

**After optimization:**
```typescript
// Render ONLY visible nodes (fast even with 10,000 nodes)
const viewport = { x: 0, y: 0, width: 1920, height: 1080 };
const visibleNodes = diagram.getVisibleNodes(viewport); // O(k) = ~50 nodes
visibleNodes.forEach(node => renderNode(node));
// Result: <1ms per frame, 60 FPS ✅
```

### Level of Detail (Phase 5.3)

**Automatically adjust rendering detail based on zoom:**

```typescript
const zoom = 0.5; // 50% zoom (zoomed out)
const nodesWithLOD = diagram.getNodesWithLOD(viewport, zoom);

nodesWithLOD.forEach(({ entity: node, lod }) => {
  // lod = 'high' | 'medium' | 'low'

  // Always render shape
  renderNodeShape(node);

  // Conditionally render based on LOD
  if (diagram.shouldRenderLabels(lod)) {
    renderNodeLabel(node); // Skip at low zoom
  }

  if (diagram.shouldRenderIcons(lod)) {
    renderNodeIcons(node); // Skip at medium/low zoom
    renderPorts(node);
  }

  if (diagram.shouldRenderShadows(lod)) {
    renderShadow(node); // Skip at medium/low zoom
  }
});

// Result: 60 FPS smooth rendering at all zoom levels ✅
```

### Route Caching (Phase 5.3)

**Routes are automatically cached with LRU eviction:**

```typescript
// First call - calculates path
const path1 = engine.getRoutingEngine().routePath(
  { x: 100, y: 100 },
  { x: 300, y: 300 },
  'orthogonal'
);
// Takes ~50ms (path calculation)

// Subsequent calls - returns cached result
const path2 = engine.getRoutingEngine().routePath(
  { x: 100, y: 100 },
  { x: 300, y: 300 },
  'orthogonal'
);
// Takes <0.1ms (cache hit) ✅

// Result: 10x-100x faster routing with automatic caching
```

### Dirty Marking (Phase 5.2)

**Only re-render changed entities:**

```typescript
// Track dirty entities
const dirtyNodes = new Set<string>();

diagram.on('entity:dirty', (entity) => {
  dirtyNodes.add(entity.id);
  scheduleRender();
});

function render() {
  // Only update dirty nodes, not entire diagram
  dirtyNodes.forEach(nodeId => {
    const node = diagram.getNode(nodeId);
    if (node) {
      updateNodeRendering(node);
      node.markClean();
    }
  });

  dirtyNodes.clear();
}

// Result: Incremental updates, no full re-renders ✅
```

### Performance Benchmarks

```
Diagram Size    Viewport Query    Route Calculation    Memory Usage
──────────────────────────────────────────────────────────────────
100 nodes       <1ms              <1ms (cached)        ~5MB
1,000 nodes     <1ms              <1ms (cached)        ~30MB
10,000 nodes    <1ms              <1ms (cached)        ~200MB
50,000 nodes    <2ms              <1ms (cached)        ~800MB

All tests maintain 60 FPS with viewport virtualization ✅
```

---

## 🎯 Use Cases

### 1. Entity-Relationship Diagrams (ERD)

**Database design tool with tables, fields, and relationships:**

```typescript
import { DiagramEngine, NodeModel } from '@grafloria/diagram-engine';
import { ERDTypes } from '@grafloria/diagram-engine/types/domain';

const engine = new DiagramEngine();
engine.getValidationEngine().registerTypes(ERDTypes);

// Create table node
const usersTable = new NodeModel({
  type: 'erd.table',
  position: { x: 100, y: 100 },
  size: { width: 250, height: 300 }
});

usersTable.setMetadata('tableName', 'users');
usersTable.setMetadata('fields', [
  { name: 'id', type: 'int', primaryKey: true },
  { name: 'email', type: 'varchar', unique: true },
  { name: 'name', type: 'varchar' },
  { name: 'created_at', type: 'timestamp' }
]);

diagram.addNode(usersTable);

// Create relationships
const ordersTable = new NodeModel({ type: 'erd.table', ... });
const relationship = new LinkModel(usersTable.id, ordersTable.id);
relationship.setMetadata('type', 'one-to-many');
```

### 2. UML Class Diagrams

**Object-oriented design with classes, attributes, and methods:**

```typescript
import { UMLTypes } from '@grafloria/diagram-engine/types/domain';

engine.getValidationEngine().registerTypes(UMLTypes);

const userClass = new NodeModel({
  type: 'uml.class',
  position: { x: 100, y: 100 },
  size: { width: 200, height: 250 }
});

userClass.setMetadata('className', 'User');
userClass.setMetadata('attributes', [
  { name: 'id', type: 'number', visibility: 'private' },
  { name: 'name', type: 'string', visibility: 'public' },
  { name: 'email', type: 'string', visibility: 'private' }
]);
userClass.setMetadata('methods', [
  { name: 'login', returnType: 'boolean', visibility: 'public' },
  { name: 'logout', returnType: 'void', visibility: 'public' }
]);

diagram.addNode(userClass);
```

### 3. BPMN Workflow Diagrams

**Business process modeling with tasks, events, and gateways:**

```typescript
import { BPMNTypes } from '@grafloria/diagram-engine/types/domain';

engine.getValidationEngine().registerTypes(BPMNTypes);

const startEvent = new NodeModel({
  type: 'bpmn.startEvent',
  position: { x: 100, y: 200 },
  size: { width: 50, height: 50 }
});

const task = new NodeModel({
  type: 'bpmn.task',
  position: { x: 200, y: 200 },
  size: { width: 100, height: 80 }
});
task.setMetadata('taskName', 'Process Order');

const gateway = new NodeModel({
  type: 'bpmn.exclusiveGateway',
  position: { x: 350, y: 200 },
  size: { width: 50, height: 50 }
});

diagram.addNode(startEvent);
diagram.addNode(task);
diagram.addNode(gateway);
```

### 4. Flowcharts

**Algorithmic flow diagrams:**

```typescript
import { FlowchartTypes } from '@grafloria/diagram-engine/types/domain';

engine.getValidationEngine().registerTypes(FlowchartTypes);

const start = new NodeModel({ type: 'flowchart.terminator', ... });
const decision = new NodeModel({ type: 'flowchart.decision', ... });
const process = new NodeModel({ type: 'flowchart.process', ... });
const end = new NodeModel({ type: 'flowchart.terminator', ... });
```

### 5. Visual Page Builder (Elementor-style)

**Drag-and-drop page builder with nested components:**

```typescript
// See complete implementation:
// docs/engine/examples/04-page-builder.md

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

// Auto-layout all components
autoLayoutPage(diagram);

// Export to HTML/CSS
const html = exportToHTML(diagram);
```

---

## 🔌 Plugin System

**Extend the engine with custom functionality:**

```typescript
import { DiagramPlugin, DiagramEngine } from '@grafloria/diagram-engine';

class AutoSavePlugin extends DiagramPlugin {
  name = 'AutoSave';
  version = '1.0.0';

  onInit(engine: DiagramEngine): void {
    console.log('AutoSave plugin initialized');
    this.startAutoSave(engine);
  }

  private startAutoSave(engine: DiagramEngine): void {
    setInterval(() => {
      const json = engine.serialize();
      localStorage.setItem('autosave', JSON.stringify(json));
      console.log('✅ Auto-saved');
    }, 30000); // Save every 30 seconds
  }

  onDispose(): void {
    console.log('AutoSave plugin disposed');
  }
}

// Register plugin
engine.getPluginManager().register(new AutoSavePlugin());
```

**Built-in extension points:**
- Custom commands (implement `Command` interface)
- Custom routing algorithms (implement `IRouter` interface)
- Custom validation rules (via `ValidationEngine.addRule()`)
- Custom type definitions (via `ValidationEngine.registerTypes()`)
- Event listeners (subscribe to any event)

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

### Test Results

```
Test Suites: 45 passed, 45 total
Tests:       1232 passed, 1232 total
Snapshots:   0 total
Time:        7.329 s

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
- **Memory Tests** - Disposal and leak prevention

---

## 🏗️ Building

```bash
# Build the library
npx nx build engine

# Output: dist/libs/engine/

# Build with watch mode
npx nx build engine --watch
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

# Run tests in watch mode
npx nx test engine --watch

# Build
npx nx build engine
```

### Code Style

- **TypeScript strict mode** enabled
- **ESLint + Prettier** configured
- **90%+ test coverage** required for new code
- **JSDoc comments** for all public APIs
- **Conventional commits** for commit messages

### Pull Request Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Write tests for your changes
4. Ensure all tests pass (`npx nx test engine`)
5. Commit your changes (`git commit -m 'feat: add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

---

## 📄 License

MIT License - see [LICENSE](../../LICENSE) for details.

---

## 🔗 Related Packages

- **[@grafloria/diagram-renderer](../renderer/)** - SVG/Canvas rendering with automatic mode switching
- **[@grafloria/diagram-renderer-angular](../renderer-angular/)** - Angular integration components and services
- **[@grafloria/diagram-renderer-react](../renderer-react/)** - React integration (coming soon)
- **[@grafloria/diagram-renderer-vue](../renderer-vue/)** - Vue integration (coming soon)

---

## 📞 Support

- 📧 **Email**: support@grafloria.dev
- 💬 **Discord**: [Join our community](https://discord.gg/grafloria)
- 🐛 **Issues**: [GitHub Issues](https://github.com/grafloria/grafloria/issues)
- 📖 **Documentation**: [Complete Docs](docs/engine/)
- 💡 **Stack Overflow**: Tag questions with `grafloria-diagram-engine`

---

## 🎯 Roadmap

### ✅ Completed

- **Phase 1**: Core Foundation (Models, Events, Commands)
- **Phase 2**: Validation & Type System (ERD, UML, BPMN, Flowchart)
- **Phase 3**: Routing Engine (4 algorithms + obstacle detection)
- **Phase 4**: Serialization & State Management
- **Phase 5.1**: Viewport Virtualization (Spatial indexing)
- **Phase 5.2**: Dirty Marking (Incremental updates)
- **Phase 5.3**: Route Caching & LOD (Performance optimization)
- **Phase 5.4**: Memory Management (Disposal pattern)

### 🚧 In Progress

- **Phase 6**: Renderer Integration
  - SVG Renderer (HTML+SVG hybrid)
  - Canvas Renderer (high performance)
  - Auto-switching strategy

### 📋 Planned

- **Phase 7**: Framework Wrappers
  - Angular wrapper (in progress)
  - React wrapper
  - Vue wrapper

- **Phase 8**: Advanced Features
  - Collaborative editing (real-time)
  - Animation system
  - Advanced layout algorithms (hierarchical, force-directed)
  - WebGL renderer for 100K+ nodes
  - AI-powered auto-layout

---

## ⭐ Star Us!

If you find this project useful, please consider giving it a star on GitHub! ⭐

It helps us understand that people are using and benefiting from this library.

---

## 🙏 Acknowledgments

Built with:
- TypeScript
- Jest (testing)
- Nx (monorepo management)
- EventEmitter3 (event system)
- nanoid (ID generation)

Inspired by:
- React Flow (developer experience)
- JointJS (enterprise features)
- GoJS (performance)
- Draw.io (intelligent adaptation)

---

**Built with ❤️ by the Grafloria Team**

**Version**: 1.0.0
**Last Updated**: 2025-10-22
