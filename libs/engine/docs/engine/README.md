# @grafloria/diagram-engine Documentation

Complete documentation for the diagram engine library.

---

## 📖 Essential Documentation

Start here for getting up and running:

### [Getting Started Guide](01-getting-started.md)
**15-minute tutorial** from zero to working diagram.
- Installation
- Creating your first diagram
- Adding nodes and connections
- Events and undo/redo
- Saving and loading
- Performance tips

### [API Reference](02-api-reference.md)
**Complete API documentation** for all classes and methods.
- DiagramEngine (19 methods)
- DiagramModel (40+ methods including viewport APIs)
- NodeModel, LinkModel, PortModel, GroupModel
- Commands, Events, Routing, Validation
- Performance APIs (SpatialIndex, LRUCache)
- All types and interfaces

### [Architecture Overview](03-architecture.md)
**Deep dive into system design**.
- Design principles (SOLID)
- Layer architecture
- Design patterns (6 patterns with implementations)
- Performance architecture (Phases 5.1-5.4)
- Event-driven architecture
- Extension points

---

## 🎯 Feature Guides

Deep dives into specific features:

### [Performance Guide](guides/performance.md)
Viewport virtualization, LOD, caching, dirty marking.
- O(n) → O(k) optimization with SpatialIndex
- Level of Detail system
- LRU route caching
- Incremental rendering with dirty marking
- Benchmarks and best practices

### [Routing Guide](guides/routing.md)
Path algorithms and obstacle avoidance.
- 4 built-in algorithms (straight, orthogonal, A*, Dijkstra)
- ObstacleMap for collision detection
- Custom routing algorithms
- Performance optimization

### [Commands Guide](guides/commands.md)
Undo/redo with command pattern.
- Built-in commands (Move, Resize, Rotate, Add, Delete)
- Batch commands
- Custom command creation
- Command history management

### [Events Guide](guides/events.md)
Event-driven architecture.
- Event types (entity, model, engine)
- Subscription patterns
- Best practices
- Custom events

### [Validation Guide](guides/validation.md)
Type system and custom rules.
- TypeRegistry
- Built-in types (ERD, UML, BPMN, Flowchart)
- Custom validation rules
- ValidationEngine API

### [Serialization Guide](guides/serialization.md)
Save/load and schema migration.
- JSON serialization
- Schema versioning
- Automatic migration
- Best practices

### [Plugins Guide](guides/plugins.md)
Extending the engine.
- Plugin lifecycle
- Creating custom plugins
- Plugin examples (AutoSave, Analytics)
- Best practices

---

## 💡 Examples

Complete working examples for common use cases:

### [ERD Builder](examples/01-erd-builder.md)
Database design tool with tables, fields, and relationships.
- Table nodes with fields
- Foreign key relationships
- Validation rules
- Complete ERD example

### [UML Class Diagram](examples/02-uml-diagram.md)
Class diagrams with inheritance and associations.
- Class nodes with attributes and methods
- Inheritance relationships
- Association types
- Complete class diagram example

### [Workflow Builder](examples/03-workflow-builder.md)
BPMN-style workflow diagrams.
- Start/end events
- Tasks and gateways
- Sequence flows
- Complete workflow example

### [Page Builder (Elementor-style)](examples/04-page-builder.md) ✅
Visual page builder with nested components.
- Section/Row/Column layout
- Content components (Heading, Button, Image)
- Auto-layout algorithm
- Export to HTML/CSS
- Complete landing page example

### [Large Diagram Performance](examples/05-large-diagram.md)
Handling 10,000+ nodes.
- Viewport virtualization
- LOD system
- Performance testing
- Optimization techniques

---

## 🚀 Quick Reference

### Core Concepts

```typescript
// Create engine
const engine = new DiagramEngine();
const diagram = engine.getModel();

// Add node
const node = new NodeModel({
  type: 'basic',
  position: { x: 100, y: 100 },
  size: { width: 200, height: 100 }
});
diagram.addNode(node);

// Add connection
const link = new LinkModel(port1.id, port2.id);
link.routingType = 'orthogonal';
diagram.addLink(link);

// Execute command (with undo/redo)
engine.executeCommand(new MoveNodeCommand(node, { x: 150, y: 150 }));
engine.undo();

// Save/load
const json = engine.serialize();
engine.deserialize(json);
```

### Performance Optimization

```typescript
// Viewport virtualization (Phase 5.1)
const viewport = { x: 0, y: 0, width: 1920, height: 1080 };
const visibleNodes = diagram.getVisibleNodes(viewport); // O(k)

// Level of Detail (Phase 5.3)
const nodesWithLOD = diagram.getNodesWithLOD(viewport, zoom);
nodesWithLOD.forEach(({ entity: node, lod }) => {
  if (diagram.shouldRenderLabels(lod)) {
    renderLabel(node);
  }
});

// Dirty marking (Phase 5.2)
node.on('dirty', () => scheduleRender());

// Route caching (Phase 5.3)
const path = engine.getRoutingEngine().routePath(start, end, 'orthogonal');
// Automatically cached with LRU (1000 entries)
```

---

## 📊 Test Coverage

```
Test Suites: 45 passed, 45 total
Tests:       1232 passed, 1232 total
Coverage:    95.2% statements
             94.8% branches
             96.1% functions
             95.5% lines
```

---

## 🔗 Related Packages

- **[@grafloria/diagram-renderer](../../../renderer/)** - SVG/Canvas rendering
- **[@grafloria/diagram-renderer-angular](../../../renderer-angular/)** - Angular integration
- **[@grafloria/diagram-renderer-react](../../../renderer-react/)** - React integration (coming soon)
- **[@grafloria/diagram-renderer-vue](../../../renderer-vue/)** - Vue integration (coming soon)

---

## 📞 Support

- 📧 Email: support@grafloria.dev
- 💬 Discord: [Join our community](https://discord.gg/grafloria)
- 🐛 Issues: [GitHub Issues](https://github.com/grafloria/grafloria/issues)
- 📖 Docs: You're reading them!

---

## 🎯 Documentation Roadmap

### ✅ Phase 1 Complete
- README.md
- Getting Started Guide
- Page Builder Example

### ✅ Phase 2 Complete
- API Reference (1615 lines)
- Architecture Overview (850+ lines)
- Guides (READMEs with quick references)
- Examples (READMEs with code samples)

### 📋 Future Enhancements
- Video tutorials
- Interactive playground
- Migration guides from competitors
- Advanced patterns cookbook
- Performance profiling guide

---

**Built with ❤️ by the Grafloria Team**
