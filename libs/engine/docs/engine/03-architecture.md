# Architecture Overview

Deep dive into the design and architecture of @grafloria/diagram-engine.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Design Principles](#design-principles)
3. [Layer Architecture](#layer-architecture)
4. [Design Patterns](#design-patterns)
5. [Performance Architecture](#performance-architecture)
6. [Event-Driven Architecture](#event-driven-architecture)
7. [Extension Points](#extension-points)
8. [Data Flow](#data-flow)
9. [Memory Management](#memory-management)
10. [Future Architecture](#future-architecture)

---

## System Overview

@grafloria/diagram-engine is a **framework-agnostic, high-performance diagram engine** built with TypeScript.

### Core Philosophy

```
┌───────────────────────────────────────────────────────┐
│  SEPARATION OF CONCERNS                               │
├───────────────────────────────────────────────────────┤
│                                                       │
│  Engine = Data + Logic + Performance                  │
│  (No UI, No Rendering, No Framework Dependencies)    │
│                                                       │
│  Renderer = Visualization                            │
│  (Separate package, framework-specific)              │
│                                                       │
│  ✅ Engine can be used with ANY renderer            │
│  ✅ Engine can be used in Node.js (server-side)     │
│  ✅ Engine is testable without DOM                   │
└───────────────────────────────────────────────────────┘
```

### Key Characteristics

- **Zero UI Dependencies** - Pure data model and business logic
- **Event-Driven** - Reactive architecture with pub/sub
- **Command Pattern** - Full undo/redo support
- **Performance-First** - Spatial indexing, caching, LOD
- **Type-Safe** - 100% TypeScript with strict mode
- **Extensible** - Plugin system, validation rules, custom types
- **Framework-Agnostic** - Use with Angular, React, Vue, or vanilla JS

---

## Design Principles

### 1. Single Responsibility Principle

Each class has **one reason to change**:

```typescript
// ✅ GOOD: Each class has single responsibility
class DiagramModel {
  // Responsibility: Manage diagram entities
  addNode(node: NodeModel): void { }
  removeNode(id: string): void { }
}

class RoutingEngine {
  // Responsibility: Calculate paths
  routePath(start: Point, end: Point): RoutedPath { }
}

class ValidationEngine {
  // Responsibility: Validate diagram
  validate(diagram: DiagramModel): ValidationResult { }
}

// ❌ BAD: God object with multiple responsibilities
class Diagram {
  addNode() { }
  routePath() { }  // Should be in RoutingEngine
  validate() { }    // Should be in ValidationEngine
  render() { }      // Should be in Renderer (separate package!)
}
```

### 2. Open/Closed Principle

**Open for extension, closed for modification**:

```typescript
// Extension via plugins (no modification needed)
class DiagramEngine {
  private plugins: DiagramPlugin[] = [];

  registerPlugin(plugin: DiagramPlugin): void {
    this.plugins.push(plugin);
    plugin.onInit(this);
  }
}

// Extension via custom routing algorithms
class RoutingEngine {
  private routers = new Map<string, IRouter>();

  registerRouter(name: string, router: IRouter): void {
    this.routers.set(name, router);
  }
}

// Extension via validation rules
class ValidationEngine {
  private rules: ValidationRule[] = [];

  addRule(name: string, rule: ValidationRule): void {
    this.rules.push({ name, rule });
  }
}
```

### 3. Dependency Inversion

**Depend on abstractions, not concretions**:

```typescript
// ✅ GOOD: Depend on interface
interface IRouter {
  route(start: Point, end: Point, obstacles: Obstacle[]): RoutedPath;
}

class RoutingEngine {
  private routers: Map<string, IRouter> = new Map();
  // Can accept ANY router implementing IRouter
}

class CustomRouter implements IRouter {
  route(start, end, obstacles) {
    // Custom implementation
  }
}
```

### 4. Composition Over Inheritance

**Favor composition**:

```typescript
// ✅ GOOD: Composition
class DiagramEngine {
  private model: DiagramModel;
  private commandStack: CommandStack;
  private routingEngine: RoutingEngine;
  private validationEngine: ValidationEngine;
  private pluginManager: PluginManager;

  // Each system is independent and replaceable
}

// ❌ BAD: Deep inheritance hierarchy
class DiagramEngine extends EventEmitter
  extends Serializable
  extends Validatable
  extends Routable {
  // Tightly coupled, hard to change
}
```

---

## Layer Architecture

### Three-Layer Separation

```
┌─────────────────────────────────────────────────────────┐
│  LAYER 3: Framework Wrappers                            │
│  (@grafloria/diagram-renderer-angular, react, vue)         │
│                                                         │
│  • Angular/React/Vue components                        │
│  • Framework-specific services                         │
│  • Template/JSX rendering                              │
│  • Framework lifecycle integration                     │
└────────────────────┬────────────────────────────────────┘
                     │ uses
                     ▼
┌─────────────────────────────────────────────────────────┐
│  LAYER 2: Renderer                                      │
│  (@grafloria/diagram-renderer)                             │
│                                                         │
│  • SVG renderer (HTML+SVG hybrid)                      │
│  • Canvas renderer (high performance)                  │
│  • Renderer strategy (auto-switching)                 │
│  • VNode abstraction                                   │
│  • NO framework dependencies                           │
└────────────────────┬────────────────────────────────────┘
                     │ uses
                     ▼
┌─────────────────────────────────────────────────────────┐
│  LAYER 1: Engine (THIS PACKAGE)                        │
│  (@grafloria/diagram-engine)                               │
│                                                         │
│  • Data models (DiagramModel, NodeModel, etc.)         │
│  • Business logic (commands, validation)               │
│  • Performance systems (spatial index, LOD, caching)   │
│  • Event system (pub/sub)                              │
│  • NO UI code                                          │
│  • NO framework dependencies                           │
│  • Can run in Node.js                                  │
└─────────────────────────────────────────────────────────┘
```

### Benefits

1. **Testability** - Engine can be tested without DOM
2. **Reusability** - Engine works with any renderer
3. **Performance** - Engine optimizations benefit all frameworks
4. **Maintainability** - Changes isolated to correct layer
5. **Scalability** - Add new frameworks easily

---

## Design Patterns

### 1. Command Pattern (Undo/Redo)

**Problem:** Need undo/redo for user actions

**Solution:** Encapsulate actions as command objects

```typescript
interface Command {
  name: string;
  execute(): void;
  undo(): void;
  redo(): void;
}

class MoveNodeCommand implements Command {
  private oldPosition: Point;
  private newPosition: Point;

  constructor(private node: NodeModel, newPos: Point) {
    this.oldPosition = { ...node.position };
    this.newPosition = newPos;
  }

  execute(): void {
    this.node.position = this.newPosition;
  }

  undo(): void {
    this.node.position = this.oldPosition;
  }

  redo(): void {
    this.execute();
  }
}

// Usage
engine.executeCommand(new MoveNodeCommand(node, { x: 100, y: 100 }));
engine.undo(); // Reverts position
engine.redo(); // Re-applies position
```

**Benefits:**
- ✅ Full undo/redo history
- ✅ Command composition (BatchCommand)
- ✅ Replay capability
- ✅ Macro recording

### 2. Observer Pattern (Events)

**Problem:** Need to notify subscribers about changes

**Solution:** Pub/sub event system

```typescript
class EventBus {
  private listeners = new Map<string, Set<Function>>();

  on(event: string, handler: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
  }

  off(event: string, handler?: Function): void {
    // Remove handler or all handlers for event
  }

  emit(event: string, ...args: any[]): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.forEach(handler => handler(...args));
    }
  }
}

// Usage
diagram.on('node:added', (node) => {
  console.log('Node added:', node.id);
});

diagram.addNode(node); // Emits 'node:added'
```

**Benefits:**
- ✅ Loose coupling
- ✅ Multiple listeners
- ✅ Easy to add/remove listeners
- ✅ Event replay for debugging

### 3. Strategy Pattern (Routing Algorithms)

**Problem:** Need multiple routing algorithms, selectable at runtime

**Solution:** Strategy pattern with algorithm interface

```typescript
interface IRouter {
  route(start: Point, end: Point, obstacles: Obstacle[]): RoutedPath;
}

class StraightRouter implements IRouter {
  route(start, end, obstacles) {
    return { points: [start, end], distance: calculateDistance(start, end) };
  }
}

class OrthogonalRouter implements IRouter {
  route(start, end, obstacles) {
    // Complex orthogonal routing logic
    return { points: [...], distance: ... };
  }
}

class RoutingEngine {
  private routers = new Map<string, IRouter>();
  private defaultAlgorithm = 'straight';

  registerRouter(name: string, router: IRouter) {
    this.routers.set(name, router);
  }

  routePath(start, end, algorithm?) {
    const alg = algorithm || this.defaultAlgorithm;
    const router = this.routers.get(alg);
    return router.route(start, end, this.getObstacles());
  }
}
```

**Benefits:**
- ✅ Easy to add new algorithms
- ✅ Runtime algorithm selection
- ✅ Each algorithm isolated
- ✅ Testable independently

### 4. Factory Pattern (Model Creation)

**Problem:** Complex object creation with defaults

**Solution:** Factory methods and constructors with sensible defaults

```typescript
class NodeModel {
  static create(type: string): NodeModel {
    // Factory method with defaults based on type
    switch (type) {
      case 'basic':
        return new NodeModel({
          type: 'basic',
          position: { x: 0, y: 0 },
          size: { width: 200, height: 100 }
        });

      case 'circle':
        return new NodeModel({
          type: 'circle',
          position: { x: 0, y: 0 },
          size: { width: 100, height: 100 }
        });

      default:
        throw new Error(`Unknown type: ${type}`);
    }
  }
}

// Usage
const node = NodeModel.create('basic');
```

### 5. Memento Pattern (Serialization)

**Problem:** Need to save/restore diagram state

**Solution:** Memento (snapshot) pattern

```typescript
class DiagramModel {
  // Create memento (snapshot)
  toJSON(): SerializedDiagram {
    return {
      version: '1.0.0',
      name: this.name,
      nodes: this.nodes.map(n => n.toJSON()),
      links: this.links.map(l => l.toJSON()),
      viewport: { ...this.viewport }
    };
  }

  // Restore from memento
  static fromJSON(data: SerializedDiagram): DiagramModel {
    const diagram = new DiagramModel(data.name);
    data.nodes.forEach(nodeData => {
      diagram.addNode(NodeModel.fromJSON(nodeData));
    });
    // ... restore links, viewport, etc.
    return diagram;
  }
}

// Usage
const snapshot = diagram.toJSON();
localStorage.setItem('diagram', JSON.stringify(snapshot));

// Later...
const restored = DiagramModel.fromJSON(JSON.parse(localStorage.getItem('diagram')));
```

### 6. Composite Pattern (Node Hierarchy)

**Problem:** Nodes can contain other nodes (hierarchy)

**Solution:** Composite pattern

```typescript
class NodeModel {
  private children: NodeModel[] = [];
  private parent?: NodeModel;

  addChild(child: NodeModel): void {
    this.children.push(child);
    child.parent = this;
  }

  getChildren(): NodeModel[] {
    return [...this.children];
  }

  // Recursive operations
  getAllDescendants(): NodeModel[] {
    const descendants: NodeModel[] = [];

    for (const child of this.children) {
      descendants.push(child);
      descendants.push(...child.getAllDescendants());
    }

    return descendants;
  }

  // Transform propagation
  getWorldPosition(): Point {
    if (!this.parent) {
      return this.position;
    }

    const parentWorld = this.parent.getWorldPosition();
    return {
      x: parentWorld.x + this.position.x,
      y: parentWorld.y + this.position.y
    };
  }
}
```

---

## Performance Architecture

### Phase 5.1: Viewport Virtualization

**Problem:** Rendering 10,000 nodes is slow

**Solution:** Spatial indexing + viewport queries

```
Without Virtualization:
┌─────────────────────────────────────┐
│  foreach node in diagram (10,000):  │
│    if inViewport(node):             │ ← O(n) = 10,000 checks
│      render(node)                   │
│  Result: ~100ms per frame ❌        │
└─────────────────────────────────────┘

With Spatial Index:
┌─────────────────────────────────────┐
│  visibleNodes =                     │
│    spatialIndex.query(viewport)     │ ← O(k) = 50 nodes
│                                     │
│  foreach node in visibleNodes:      │
│    render(node)                     │
│  Result: <1ms per frame ✅          │
└─────────────────────────────────────┘
```

**Implementation:**

```typescript
class SpatialIndex<T> {
  private cells: Map<string, Set<T>> = new Map();
  private cellSize: number;

  // R-tree-like cell-based indexing
  private getCellKey(point: Point): string {
    const cellX = Math.floor(point.x / this.cellSize);
    const cellY = Math.floor(point.y / this.cellSize);
    return `${cellX},${cellY}`;
  }

  add(entity: T): void {
    const bounds = this.getBounds(entity);
    const cells = this.getCellsForBounds(bounds);

    cells.forEach(key => {
      if (!this.cells.has(key)) {
        this.cells.set(key, new Set());
      }
      this.cells.get(key)!.add(entity);
    });
  }

  query(region: Rectangle): T[] {
    const cells = this.getCellsForBounds(region);
    const results = new Set<T>();

    cells.forEach(key => {
      const cell = this.cells.get(key);
      if (cell) {
        cell.forEach(entity => {
          if (this.intersects(entity, region)) {
            results.add(entity);
          }
        });
      }
    });

    return Array.from(results);
  }
}
```

### Phase 5.2: Dirty Marking

**Problem:** Full re-render on every change is wasteful

**Solution:** Track which entities changed

```
Without Dirty Marking:
┌─────────────────────────────────────┐
│  node.position = newPos             │
│  → Re-render ENTIRE diagram ❌      │
│  → 10,000 nodes re-rendered         │
│  → 100ms wasted                     │
└─────────────────────────────────────┘

With Dirty Marking:
┌─────────────────────────────────────┐
│  node.position = newPos             │
│  → node.markDirty('position')       │
│  → Re-render ONLY dirty nodes ✅    │
│  → 1 node re-rendered               │
│  → <1ms                             │
└─────────────────────────────────────┘
```

**Implementation:**

```typescript
class DiagramEntity {
  private _dirty = false;
  private _dirtyReasons = new Set<string>();
  private _dirtyTimestamp: number | null = null;

  markDirty(reason?: string): void {
    if (!this._dirty) {
      this._dirty = true;
      this._dirtyTimestamp = Date.now();
      this.emitter.emit('dirty', this, this._dirtyReasons);
    }

    if (reason) {
      this._dirtyReasons.add(reason);
    }
  }

  markClean(): void {
    this._dirty = false;
    this._dirtyReasons.clear();
    this._dirtyTimestamp = null;
    this.emitter.emit('clean', this);
  }
}

// Usage in renderer
diagram.on('entity:dirty', (entity) => {
  dirtyEntities.add(entity.id);
  scheduleRender();
});

function render() {
  dirtyEntities.forEach(id => {
    const entity = diagram.getNode(id);
    if (entity) {
      updateEntityRendering(entity);
      entity.markClean();
    }
  });

  dirtyEntities.clear();
}
```

### Phase 5.3: Route Caching + LOD

**Problem:** Path calculation is expensive, repeated calls waste CPU

**Solution:** LRU cache + Level of Detail

```
Without Caching:
┌─────────────────────────────────────┐
│  routePath(start, end, 'orthogonal')│
│  → Calculate path: ~50ms ❌         │
│  → Called 100 times per frame       │
│  → 5000ms total = 0.2 FPS           │
└─────────────────────────────────────┘

With LRU Cache:
┌─────────────────────────────────────┐
│  routePath(start, end, 'orthogonal')│
│  → First call: ~50ms (cache miss)   │
│  → Subsequent: <0.1ms (cache hit) ✅│
│  → 100 calls: 50ms + 99*0.1ms       │
│  → ~60ms total = 16 FPS             │
└─────────────────────────────────────┘
```

**Implementation:**

```typescript
class LRUCache<K, V> {
  private capacity: number;
  private cache = new Map<K, LRUNode<K, V>>();
  private head: LRUNode<K, V> | null = null; // Most recent
  private tail: LRUNode<K, V> | null = null; // Least recent

  get(key: K): V | undefined {
    const node = this.cache.get(key);
    if (!node) return undefined;

    // Move to head (mark as recently used)
    this.moveToHead(node);
    return node.value;
  }

  set(key: K, value: V): void {
    const existing = this.cache.get(key);

    if (existing) {
      existing.value = value;
      this.moveToHead(existing);
    } else {
      const newNode = new LRUNode(key, value);
      this.cache.set(key, newNode);
      this.addToHead(newNode);

      // Evict least recently used if over capacity
      if (this.cache.size > this.capacity) {
        this.evictLRU();
      }
    }
  }
}
```

**LOD System:**

```typescript
class DiagramModel {
  getLODLevel(zoom: number): LODLevel {
    if (zoom > 1.0) return 'high';
    else if (zoom > 0.5) return 'medium';
    else return 'low';
  }

  shouldRenderLabels(lod: LODLevel): boolean {
    return lod === 'high' || lod === 'medium';
  }

  shouldRenderIcons(lod: LODLevel): boolean {
    return lod === 'high';
  }

  shouldRenderShadows(lod: LODLevel): boolean {
    return lod === 'high';
  }
}

// Usage in renderer
const lod = diagram.getLODLevel(zoom);

if (diagram.shouldRenderLabels(lod)) {
  renderNodeLabel(node);
}

if (diagram.shouldRenderIcons(lod)) {
  renderNodeIcon(node);
  renderPorts(node);
}

if (diagram.shouldRenderShadows(lod)) {
  renderShadow(node);
}
```

### Phase 5.4: Memory Management

**Problem:** Event listeners cause memory leaks

**Solution:** Disposal pattern

```typescript
class DiagramEntity {
  dispose(): void {
    if (this._disposed) return; // Idempotent

    // Emit disposed event BEFORE cleanup
    this.emitter.emit('disposed');

    // Remove ALL event listeners (prevents leaks!)
    this.emitter.removeAllListeners();

    // Clear change log
    this.changeLog = [];

    // Clear metadata
    this.metadata.clear();

    // Mark as disposed
    this._disposed = true;
  }
}

class DiagramModel {
  override dispose(): void {
    // Dispose children first
    for (const node of this.nodes.values()) {
      node.diagram = undefined; // Break circular ref
      node.dispose();
    }

    for (const link of this.links.values()) {
      link.dispose();
    }

    // Clear collections
    this.nodes.clear();
    this.links.clear();

    // Clear spatial indices
    this.nodeSpatialIndex.clear();
    this.linkSpatialIndex.clear();

    // Call parent dispose
    super.dispose();
  }
}
```

---

## Event-Driven Architecture

### Event Flow

```
User Action
    │
    ▼
Angular Component (handles user input)
    │
    ▼
Execute Command (MoveNodeCommand)
    │
    ▼
Command modifies NodeModel
    │
    ▼
NodeModel.position = newPos
    │
    ├──→ markDirty('position')
    │    └──→ emit('dirty', node, reasons)
    │
    ├──→ emit('change:position', node)
    │
    └──→ update SpatialIndex
         └──→ spatialIndex.update(node)

Listeners:
├─ Renderer: re-render node
├─ History: log change
├─ Analytics: track user action
└─ AutoSave: schedule save
```

### Event Categories

**Entity-Level Events:**
```typescript
node.on('change:position', (node) => { });
node.on('change:size', (node) => { });
node.on('dirty', (node, reasons) => { });
```

**Model-Level Events:**
```typescript
diagram.on('node:added', (node) => { });
diagram.on('node:removed', (node) => { });
diagram.on('model:updated', () => { });
```

**Engine-Level Events:**
```typescript
engine.on('command:executed', (command) => { });
engine.on('command:undone', (command) => { });
```

---

## Extension Points

### 1. Custom Commands

```typescript
class CustomCommand implements Command {
  name = 'CustomCommand';

  execute() { /* do something */ }
  undo() { /* undo it */ }
  redo() { /* redo it */ }
}
```

### 2. Custom Routing Algorithms

```typescript
class CustomRouter implements IRouter {
  route(start, end, obstacles) {
    // Custom algorithm
    return { points: [...], distance: ... };
  }
}

engine.getRoutingEngine().registerRouter('custom', new CustomRouter());
```

### 3. Custom Validation Rules

```typescript
engine.getValidationEngine().addRule('custom-rule', (entity) => {
  // Custom validation logic
  return entity.someProperty === expectedValue;
});
```

### 4. Plugins

```typescript
class CustomPlugin extends DiagramPlugin {
  name = 'CustomPlugin';

  onInit(engine: DiagramEngine) {
    // Initialize plugin
  }

  onDispose() {
    // Cleanup
  }
}

engine.getPluginManager().register(new CustomPlugin());
```

---

## Data Flow

```
┌─────────────────────────────────────────────────┐
│  USER ACTION                                     │
│  (Drag node, add connection, etc.)              │
└──────────────────┬──────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────┐
│  COMMAND                                         │
│  new MoveNodeCommand(node, newPosition)         │
└──────────────────┬──────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────┐
│  ENGINE                                          │
│  engine.executeCommand(command)                  │
│  • Add to undo stack                            │
│  • Execute command                              │
│  • Emit 'command:executed'                      │
└──────────────────┬──────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────┐
│  MODEL                                           │
│  node.position = newPosition                     │
│  • Update property                              │
│  • Mark dirty                                   │
│  • Update spatial index                         │
│  • Emit 'change:position'                       │
└──────────────────┬──────────────────────────────┘
                   │
        ┌──────────┼──────────┐
        │          │          │
        ▼          ▼          ▼
   ┌────────┐ ┌────────┐ ┌────────┐
   │Renderer│ │History │ │Analytics│
   │        │ │        │ │         │
   │Re-render│ │Log     │ │Track   │
   │dirty   │ │change  │ │action  │
   └────────┘ └────────┘ └────────┘
```

---

## Memory Management

### Circular Reference Handling

```
Problem: Circular references prevent garbage collection

┌──────────┐
│ Diagram  │
│          │ owns
│  nodes ──┼────┐
└──────────┘    │
                │
                ▼
         ┌──────────┐
         │ NodeModel│
         │          │ references back
         │ diagram ─┼─────┐
         └──────────┘     │
                          │
                          │ CIRCULAR!
                          │
                          └──────────┘

Solution: Break circular references on disposal

diagram.dispose() {
  for (node of nodes) {
    node.diagram = undefined; // ✅ Break circle
    node.dispose();
  }
  nodes.clear();
}
```

### Event Listener Cleanup

```
Problem: Event listeners prevent garbage collection

┌──────────┐
│ Diagram  │ listeners
│          ├──────────┐
└──────────┘          │
                      │
                      ▼
               ┌──────────┐
               │ Renderer │  ← Can't be GC'd!
               │          │
               └──────────┘

Solution: Remove all listeners on disposal

dispose() {
  this.emitter.removeAllListeners(); // ✅ Clear all
}
```

---

## Future Architecture

### Planned Enhancements

1. **Collaborative Editing**
   - Operational Transform (OT) or CRDT
   - Real-time synchronization
   - Conflict resolution

2. **Versioning**
   - Diagram versioning system
   - Branch/merge support
   - Diff visualization

3. **Advanced Performance**
   - WebGL renderer for 100K+ nodes
   - Web Workers for background processing
   - Virtual scrolling

4. **AI Integration**
   - Auto-layout algorithms
   - Intelligent routing
   - Component suggestions

---

**This architecture provides a solid foundation for building any type of diagram application while maintaining high performance and extensibility.**
