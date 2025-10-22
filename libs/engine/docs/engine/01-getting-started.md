# Getting Started with @grafloria/diagram-engine

This guide will take you from zero to a working diagram application in **15 minutes**.

---

## Table of Contents

1. [Installation](#installation)
2. [Your First Diagram](#your-first-diagram)
3. [Adding Nodes](#adding-nodes)
4. [Connecting Nodes](#connecting-nodes)
5. [Listening to Events](#listening-to-events)
6. [Undo/Redo](#undoredo)
7. [Saving and Loading](#saving-and-loading)
8. [Next Steps](#next-steps)

---

## Installation

```bash
npm install @grafloria/diagram-engine
```

Or with yarn:

```bash
yarn add @grafloria/diagram-engine
```

---

## Your First Diagram

Let's create a simple diagram with two nodes connected by a link.

```typescript
import { DiagramEngine, NodeModel, LinkModel } from '@grafloria/diagram-engine';

// 1. Create the engine
const engine = new DiagramEngine();

// 2. Get the diagram model (the data container)
const diagram = engine.getModel();

console.log('Engine created!', engine);
```

**What's happening here?**

- `DiagramEngine` is the main orchestrator - it manages everything
- `DiagramModel` (accessed via `engine.getModel()`) is where nodes, links, and groups live
- The engine is **framework-agnostic** - pure TypeScript, no UI dependencies

---

## Adding Nodes

Nodes are the visual elements in your diagram (boxes, circles, etc.).

```typescript
// Create a node
const node1 = new NodeModel({
  type: 'basic',
  position: { x: 100, y: 100 },
  size: { width: 200, height: 100 }
});

// Add label
node1.label = 'My First Node';

// Add to diagram
diagram.addNode(node1);

console.log('Node added:', node1.id);
```

### Adding Ports (Connection Points)

Nodes need ports to connect to other nodes:

```typescript
// Add an output port on the right side
const outputPort = node1.addPort({
  id: 'output-1',
  type: 'output',
  position: 'right'
});

// Add an input port on the left side
const inputPort = node1.addPort({
  id: 'input-1',
  type: 'input',
  position: 'left'
});

console.log('Ports added:', node1.ports);
```

### Creating Multiple Nodes

```typescript
const node2 = new NodeModel({
  type: 'basic',
  position: { x: 400, y: 100 },
  size: { width: 200, height: 100 }
});

node2.label = 'My Second Node';
node2.addPort({ id: 'in-1', type: 'input', position: 'left' });

diagram.addNode(node2);
```

---

## Connecting Nodes

Links connect ports between nodes.

```typescript
// Create a link from node1's output to node2's input
const link = new LinkModel(
  node1.ports[0].id,  // Source port ID
  node2.ports[0].id   // Target port ID
);

// Choose routing algorithm
link.routingType = 'orthogonal'; // Options: 'straight', 'orthogonal', 'astar', 'dijkstra'

// Add to diagram
diagram.addLink(link);

console.log('Link created:', link.id);
```

### Routing Algorithms

The engine includes 4 routing algorithms:

1. **`straight`** - Direct line between ports
2. **`orthogonal`** - Right-angle connectors (clean, professional)
3. **`astar`** - Intelligent pathfinding avoiding obstacles
4. **`dijkstra`** - Shortest path algorithm

```typescript
// Change routing algorithm
link.routingType = 'astar';

// Routes are automatically cached for performance
// Calling routePath() multiple times with same coordinates = instant lookup
```

---

## Listening to Events

The engine uses an **event-driven architecture**. Subscribe to changes:

### Node Events

```typescript
// Listen for node position changes
node1.on('change:position', (node) => {
  console.log('Node moved to:', node.position);
});

// Listen for node size changes
node1.on('change:size', (node) => {
  console.log('Node resized to:', node.size);
});

// Listen for node selection
node1.on('change:selected', (node) => {
  console.log('Node selected:', node.selected);
});

// Listen for any node change
node1.on('change', (node) => {
  console.log('Node changed:', node);
});
```

### Diagram-Level Events

```typescript
// Listen for nodes being added
diagram.on('node:added', (node) => {
  console.log('Node added:', node.id);
});

// Listen for nodes being removed
diagram.on('node:removed', (node) => {
  console.log('Node removed:', node.id);
});

// Listen for links being added
diagram.on('link:added', (link) => {
  console.log('Link added:', link.id);
});

// Listen for any model update
diagram.on('model:updated', () => {
  console.log('Diagram changed - time to re-render!');
});
```

### Engine-Level Events

```typescript
// Listen for command execution
engine.on('command:executed', (command) => {
  console.log('Command executed:', command.name);
});

// Listen for undo
engine.on('command:undone', (command) => {
  console.log('Command undone:', command.name);
});

// Listen for redo
engine.on('command:redone', (command) => {
  console.log('Command redone:', command.name);
});
```

---

## Undo/Redo

The engine uses the **Command Pattern** for undo/redo.

### Using Built-in Commands

```typescript
import {
  MoveNodeCommand,
  ResizeNodeCommand,
  AddNodeCommand,
  DeleteNodeCommand
} from '@grafloria/diagram-engine';

// Move a node
engine.executeCommand(
  new MoveNodeCommand(node1, { x: 200, y: 200 })
);

// Undo the move
engine.undo();
console.log('Node position:', node1.position); // Back to { x: 100, y: 100 }

// Redo the move
engine.redo();
console.log('Node position:', node1.position); // { x: 200, y: 200 }

// Check undo/redo availability
console.log('Can undo?', engine.canUndo());
console.log('Can redo?', engine.canRedo());
```

### Batch Commands

Execute multiple commands as a single undo/redo operation:

```typescript
import { BatchCommand } from '@grafloria/diagram-engine';

const batch = new BatchCommand([
  new MoveNodeCommand(node1, { x: 150, y: 150 }),
  new MoveNodeCommand(node2, { x: 450, y: 150 }),
  new ResizeNodeCommand(node1, { width: 250, height: 120 })
]);

engine.executeCommand(batch);

// One undo reverts ALL three changes
engine.undo();
```

---

## Saving and Loading

Serialize your diagram to JSON and restore it later.

### Saving

```typescript
// Serialize diagram to JSON
const json = engine.serialize();

// Save to localStorage
localStorage.setItem('my-diagram', JSON.stringify(json));

// Or send to server
fetch('/api/diagrams', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(json)
});

console.log('Diagram saved!');
```

### Loading

```typescript
// Load from localStorage
const saved = localStorage.getItem('my-diagram');
if (saved) {
  const json = JSON.parse(saved);
  engine.deserialize(json);
  console.log('Diagram loaded!');
}

// Or load from server
fetch('/api/diagrams/123')
  .then(res => res.json())
  .then(json => {
    engine.deserialize(json);
    console.log('Diagram loaded from server!');
  });
```

### Schema Versioning

The serializer automatically handles schema migrations:

```typescript
// Load old version diagram
const oldDiagram = { version: '1.0.0', /* ... */ };

// Engine automatically migrates to current version
engine.deserialize(oldDiagram);

console.log('Diagram migrated to:', engine.serialize().version);
```

---

## Complete Example

Putting it all together:

```typescript
import {
  DiagramEngine,
  NodeModel,
  LinkModel,
  MoveNodeCommand
} from '@grafloria/diagram-engine';

// 1. Create engine
const engine = new DiagramEngine();
const diagram = engine.getModel();

// 2. Create nodes
const node1 = new NodeModel({
  type: 'basic',
  position: { x: 100, y: 100 },
  size: { width: 200, height: 100 }
});
node1.label = 'Start';
node1.addPort({ id: 'out', type: 'output', position: 'right' });

const node2 = new NodeModel({
  type: 'basic',
  position: { x: 400, y: 100 },
  size: { width: 200, height: 100 }
});
node2.label = 'End';
node2.addPort({ id: 'in', type: 'input', position: 'left' });

// 3. Add to diagram
diagram.addNode(node1);
diagram.addNode(node2);

// 4. Create connection
const link = new LinkModel(node1.ports[0].id, node2.ports[0].id);
link.routingType = 'orthogonal';
diagram.addLink(link);

// 5. Listen for changes
diagram.on('model:updated', () => {
  console.log('Diagram changed!');
  // In a real app: trigger re-render
});

// 6. Use commands for undo/redo
engine.executeCommand(
  new MoveNodeCommand(node1, { x: 150, y: 150 })
);

// 7. Save diagram
const json = engine.serialize();
localStorage.setItem('diagram', JSON.stringify(json));

console.log('✅ Diagram complete!');
```

---

## Performance Tips

The engine is optimized for large diagrams (10,000+ nodes). Here are key features:

### 1. Viewport Virtualization

Only query visible nodes:

```typescript
// Define viewport (visible area)
const viewport = {
  x: 0,
  y: 0,
  width: 1920,
  height: 1080
};

// Get only visible nodes (O(k) where k = visible nodes)
const visibleNodes = diagram.getVisibleNodes(viewport);
const visibleLinks = diagram.getVisibleLinks(viewport);

// Render only these - huge performance boost!
console.log(`Rendering ${visibleNodes.length} of ${diagram.getNodes().length} nodes`);
```

### 2. Level of Detail (LOD)

Adjust detail based on zoom:

```typescript
const zoom = 0.5; // 50% zoom

// Get nodes with LOD metadata
const nodesWithLOD = diagram.getNodesWithLOD(viewport, zoom);

nodesWithLOD.forEach(({ entity: node, lod }) => {
  // lod = 'high' | 'medium' | 'low'

  if (diagram.shouldRenderLabels(lod)) {
    // Render text labels
  }

  if (diagram.shouldRenderIcons(lod)) {
    // Render icons and ports
  }

  // At low zoom, skip expensive rendering
});
```

### 3. Dirty Marking

Only update changed entities:

```typescript
// Engine automatically tracks dirty entities
diagram.on('entity:dirty', (entity, reasons) => {
  console.log('Entity dirty:', entity.id, reasons);
  // Only re-render this specific entity
});

// Check if entity is dirty
if (node1.isDirty()) {
  console.log('Node needs re-render:', node1.getDirtyReasons());
}
```

---

## Next Steps

Now that you have the basics, explore:

### Deep Dives

- **[API Reference](02-api-reference.md)** - Complete API documentation
- **[Architecture](03-architecture.md)** - System design and patterns

### Feature Guides

- **[Performance Guide](guides/performance.md)** - Optimization techniques
- **[Routing Guide](guides/routing.md)** - Path algorithms in depth
- **[Commands Guide](guides/commands.md)** - Custom commands and batching
- **[Events Guide](guides/events.md)** - Event patterns and best practices
- **[Validation Guide](guides/validation.md)** - Type system and custom rules

### Examples

- **[ERD Builder](examples/01-erd-builder.md)** - Database design tool
- **[UML Diagram](examples/02-uml-diagram.md)** - Class diagrams
- **[Workflow Builder](examples/03-workflow-builder.md)** - BPMN workflows
- **[Page Builder](examples/04-page-builder.md)** - Visual page builder (Elementor-style)
- **[Large Diagrams](examples/05-large-diagram.md)** - Handling 10,000+ nodes

---

## Common Questions

### Q: How do I render the diagram?

A: The engine is **data-only**. Use a renderer package:

```bash
npm install @grafloria/diagram-renderer
npm install @grafloria/diagram-renderer-angular
```

See the [Renderer documentation](../../../renderer/) for details.

### Q: Can I use this with React/Vue?

A: Yes! The engine is framework-agnostic. Renderer wrappers available for:

- ✅ Angular (available now)
- 🚧 React (coming soon)
- 🚧 Vue (coming soon)

### Q: How do I validate connections?

A: Use the ValidationEngine:

```typescript
import { ValidationEngine } from '@grafloria/diagram-engine';

const validator = engine.getValidationEngine();

// Add validation rule
validator.addRule('no-self-loops', (link) => {
  return link.sourcePortId !== link.targetPortId;
});

// Check if diagram is valid
const result = validator.validate(diagram);
console.log('Valid?', result.valid);
console.log('Errors:', result.errors);
```

### Q: How do I create custom node types?

A: Use the TypeRegistry:

```typescript
import { TypeRegistry } from '@grafloria/diagram-engine';

const registry = engine.getValidationEngine().getTypeRegistry();

// Register custom type
registry.registerType({
  name: 'my-custom-node',
  category: 'custom',
  nodeTypes: ['my-custom-node'],
  validate: (node) => {
    // Custom validation
    return node.size.width >= 100;
  }
});
```

---

## Getting Help

- 📖 **Documentation**: [docs/engine/](.)
- 💬 **Discord**: [Join our community](https://discord.gg/grafloria)
- 🐛 **Issues**: [GitHub Issues](https://github.com/grafloria/grafloria/issues)
- 📧 **Email**: support@grafloria.dev

---

**Ready to build something amazing? Let's go! 🚀**
