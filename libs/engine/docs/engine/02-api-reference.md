# API Reference

Complete API documentation for @grafloria/diagram-engine.

---

## Table of Contents

1. [DiagramEngine](#diagramengine)
2. [DiagramModel](#diagrammodel)
3. [NodeModel](#nodemodel)
4. [LinkModel](#linkmodel)
5. [PortModel](#portmodel)
6. [GroupModel](#groupmodel)
7. [DiagramEntity](#diagramentity)
8. [Commands](#commands)
9. [Events](#events)
10. [RoutingEngine](#routingengine)
11. [ValidationEngine](#validationengine)
12. [DiagramSerializer](#diagramserializer)
13. [PluginManager](#pluginmanager)
14. [Performance APIs](#performance-apis)
15. [Types](#types)

---

## DiagramEngine

Main orchestrator for the diagram system.

### Constructor

```typescript
constructor()
```

Creates a new diagram engine instance.

### Methods

#### Core Methods

##### `getModel(): DiagramModel`

Returns the root diagram model.

```typescript
const diagram = engine.getModel();
```

##### `serialize(): SerializedDiagram`

Serializes the entire diagram to JSON.

```typescript
const json = engine.serialize();
localStorage.setItem('diagram', JSON.stringify(json));
```

##### `deserialize(data: SerializedDiagram): void`

Deserializes a diagram from JSON.

```typescript
const json = JSON.parse(localStorage.getItem('diagram'));
engine.deserialize(json);
```

#### Command Methods

##### `executeCommand(command: Command): void`

Executes a command (with undo/redo support).

```typescript
engine.executeCommand(new MoveNodeCommand(node, { x: 100, y: 100 }));
```

##### `undo(): void`

Undoes the last command.

```typescript
engine.undo();
```

##### `redo(): void`

Redoes the previously undone command.

```typescript
engine.redo();
```

##### `canUndo(): boolean`

Checks if undo is available.

```typescript
if (engine.canUndo()) {
  engine.undo();
}
```

##### `canRedo(): boolean`

Checks if redo is available.

```typescript
if (engine.canRedo()) {
  engine.redo();
}
```

##### `getUndoStack(): Command[]`

Returns the undo stack.

```typescript
const undoStack = engine.getUndoStack();
console.log('Undo stack size:', undoStack.length);
```

##### `getRedoStack(): Command[]`

Returns the redo stack.

```typescript
const redoStack = engine.getRedoStack();
console.log('Redo stack size:', redoStack.length);
```

#### System Access Methods

##### `getRoutingEngine(): RoutingEngine`

Returns the routing engine instance.

```typescript
const routing = engine.getRoutingEngine();
routing.setDefaultAlgorithm('orthogonal');
```

##### `getValidationEngine(): ValidationEngine`

Returns the validation engine instance.

```typescript
const validator = engine.getValidationEngine();
validator.registerTypes(ERDTypes);
```

##### `getPluginManager(): PluginManager`

Returns the plugin manager instance.

```typescript
const plugins = engine.getPluginManager();
plugins.register(new AutoSavePlugin());
```

#### Event Methods

##### `on(event: string, handler: Function): void`

Subscribes to an engine event.

```typescript
engine.on('command:executed', (command) => {
  console.log('Command executed:', command.name);
});
```

##### `off(event: string, handler?: Function): void`

Unsubscribes from an engine event.

```typescript
engine.off('command:executed', handler);
```

##### `emit(event: string, ...args: any[]): void`

Emits an engine event.

```typescript
engine.emit('custom:event', { data: 'value' });
```

### Events

- `command:executed` - Command was executed
- `command:undone` - Command was undone
- `command:redone` - Command was redone
- `model:serialized` - Model was serialized
- `model:deserialized` - Model was deserialized

---

## DiagramModel

Root container for all diagram entities.

### Constructor

```typescript
constructor(name?: string)
```

Creates a new diagram model.

```typescript
const diagram = new DiagramModel('My Diagram');
```

### Properties

##### `name: string`

The diagram name.

```typescript
diagram.name = 'Updated Diagram';
```

##### `nodes: Map<string, NodeModel>`

Map of all nodes by ID.

```typescript
const allNodes = Array.from(diagram.nodes.values());
```

##### `links: Map<string, LinkModel>`

Map of all links by ID.

```typescript
const allLinks = Array.from(diagram.links.values());
```

##### `groups: Map<string, GroupModel>`

Map of all groups by ID.

```typescript
const allGroups = Array.from(diagram.groups.values());
```

##### `viewport: { x: number; y: number; zoom: number }`

Current viewport state.

```typescript
diagram.viewport = { x: 100, y: 100, zoom: 1.5 };
```

### Methods

#### Node Management

##### `addNode(node: NodeModel): void`

Adds a node to the diagram.

```typescript
diagram.addNode(node);
```

**Throws:** Error if node with same ID already exists

##### `removeNode(nodeId: string): NodeModel | undefined`

Removes a node by ID.

```typescript
const removed = diagram.removeNode('node-123');
```

##### `getNode(nodeId: string): NodeModel | undefined`

Gets a node by ID.

```typescript
const node = diagram.getNode('node-123');
```

##### `getNodes(): NodeModel[]`

Gets all nodes.

```typescript
const nodes = diagram.getNodes();
```

##### `clearNodes(): void`

Removes all nodes.

```typescript
diagram.clearNodes();
```

#### Link Management

##### `addLink(link: LinkModel): void`

Adds a link to the diagram.

```typescript
diagram.addLink(link);
```

**Throws:** Error if link with same ID already exists

##### `removeLink(linkId: string): LinkModel | undefined`

Removes a link by ID.

```typescript
const removed = diagram.removeLink('link-123');
```

##### `getLink(linkId: string): LinkModel | undefined`

Gets a link by ID.

```typescript
const link = diagram.getLink('link-123');
```

##### `getLinks(): LinkModel[]`

Gets all links.

```typescript
const links = diagram.getLinks();
```

##### `clearLinks(): void`

Removes all links.

```typescript
diagram.clearLinks();
```

#### Group Management

##### `addGroup(group: GroupModel): void`

Adds a group to the diagram.

```typescript
diagram.addGroup(group);
```

##### `removeGroup(groupId: string): GroupModel | undefined`

Removes a group by ID.

```typescript
const removed = diagram.removeGroup('group-123');
```

##### `getGroup(groupId: string): GroupModel | undefined`

Gets a group by ID.

```typescript
const group = diagram.getGroup('group-123');
```

##### `getGroups(): GroupModel[]`

Gets all groups.

```typescript
const groups = diagram.getGroups();
```

#### Viewport Virtualization (Phase 5.1)

##### `getVisibleNodes(viewport: Rectangle): NodeModel[]`

Gets nodes visible in viewport using spatial indexing.

```typescript
const viewport = { x: 0, y: 0, width: 1920, height: 1080 };
const visibleNodes = diagram.getVisibleNodes(viewport);
// O(k) complexity where k = visible nodes
```

##### `getVisibleLinks(viewport: Rectangle): LinkModel[]`

Gets links visible in viewport.

```typescript
const visibleLinks = diagram.getVisibleLinks(viewport);
```

#### Level of Detail (Phase 5.3)

##### `getLODLevel(zoom: number): LODLevel`

Calculates LOD level based on zoom.

```typescript
const lod = diagram.getLODLevel(0.5); // 'low'
const lod = diagram.getLODLevel(1.0); // 'medium'
const lod = diagram.getLODLevel(1.5); // 'high'
```

Returns: `'high' | 'medium' | 'low'`

##### `getNodesWithLOD(viewport: Rectangle, zoom: number): EntityWithLOD<NodeModel>[]`

Gets visible nodes with LOD metadata.

```typescript
const entities = diagram.getNodesWithLOD(viewport, zoom);

entities.forEach(({ entity: node, lod }) => {
  console.log(`Node ${node.id} should render at ${lod} detail`);
});
```

##### `getLinksWithLOD(viewport: Rectangle, zoom: number): EntityWithLOD<LinkModel>[]`

Gets visible links with LOD metadata.

```typescript
const entities = diagram.getLinksWithLOD(viewport, zoom);
```

##### `shouldRenderLabels(lod: LODLevel): boolean`

Check if labels should be rendered at this LOD.

```typescript
if (diagram.shouldRenderLabels(lod)) {
  // Render text labels
}
```

##### `shouldRenderIcons(lod: LODLevel): boolean`

Check if icons should be rendered at this LOD.

```typescript
if (diagram.shouldRenderIcons(lod)) {
  // Render icons and ports
}
```

##### `shouldRenderBorders(lod: LODLevel): boolean`

Check if borders should be rendered at this LOD.

```typescript
if (diagram.shouldRenderBorders(lod)) {
  // Render borders
}
```

##### `shouldRenderShadows(lod: LODLevel): boolean`

Check if shadows should be rendered at this LOD.

```typescript
if (diagram.shouldRenderShadows(lod)) {
  // Render shadows
}
```

#### Serialization

##### `toJSON(): SerializedDiagram`

Serializes the diagram to JSON.

```typescript
const json = diagram.toJSON();
```

##### `static fromJSON(data: SerializedDiagram): DiagramModel`

Creates diagram from JSON.

```typescript
const diagram = DiagramModel.fromJSON(json);
```

#### Memory Management (Phase 5.4)

##### `dispose(): void`

Disposes the diagram and all child entities.

```typescript
diagram.dispose();
// All nodes, links, groups disposed
// All event listeners removed
// Spatial indices cleared
```

##### `isDisposed(): boolean`

Checks if diagram is disposed.

```typescript
if (!diagram.isDisposed()) {
  diagram.addNode(node);
}
```

### Events

- `node:added` - Node was added
- `node:removed` - Node was removed
- `link:added` - Link was added
- `link:removed` - Link was removed
- `group:added` - Group was added
- `group:removed` - Group was removed
- `model:updated` - Model changed (any change)
- `entity:dirty` - Entity marked dirty
- `disposed` - Diagram disposed

---

## NodeModel

Represents a visual node in the diagram.

### Constructor

```typescript
constructor(config: {
  type: string;
  position: Point;
  size: Size;
  label?: string;
})
```

Creates a new node.

```typescript
const node = new NodeModel({
  type: 'basic',
  position: { x: 100, y: 100 },
  size: { width: 200, height: 100 },
  label: 'My Node'
});
```

### Properties

##### `id: string`

Unique node identifier (read-only).

```typescript
console.log('Node ID:', node.id);
```

##### `type: string`

Node type.

```typescript
node.type = 'custom-type';
```

##### `label: string`

Node label.

```typescript
node.label = 'Updated Label';
```

##### `position: Point`

Node position ({ x, y }).

```typescript
node.position = { x: 150, y: 150 };
```

##### `size: Size`

Node size ({ width, height }).

```typescript
node.size = { width: 250, height: 150 };
```

##### `selected: boolean`

Selection state.

```typescript
node.selected = true;
```

##### `rotation: number`

Rotation angle in degrees.

```typescript
node.rotation = 45;
```

##### `scale: Point`

Scale factors ({ x, y }).

```typescript
node.scale = { x: 1.5, y: 1.5 };
```

##### `ports: PortModel[]`

Array of ports.

```typescript
const ports = node.ports;
```

##### `parent?: NodeModel`

Parent node (for hierarchy).

```typescript
const parent = node.parent;
```

##### `diagram?: DiagramModel`

Owning diagram.

```typescript
const diagram = node.diagram;
```

### Methods

#### Port Management

##### `addPort(config: Partial<PortModel>): PortModel`

Adds a port to the node.

```typescript
const port = node.addPort({
  id: 'output-1',
  type: 'output',
  position: 'right'
});
```

##### `removePort(portId: string): PortModel | undefined`

Removes a port.

```typescript
const removed = node.removePort('output-1');
```

##### `getPort(portId: string): PortModel | undefined`

Gets a port by ID.

```typescript
const port = node.getPort('output-1');
```

##### `getPortPosition(portId: string): Point | undefined`

Gets absolute port position (accounting for node transform).

```typescript
const portPos = node.getPortPosition('output-1');
// { x: 300, y: 150 }
```

#### Hierarchy

##### `setParent(parent: NodeModel | undefined): void`

Sets the parent node.

```typescript
child.setParent(parent);
```

##### `addChild(child: NodeModel): void`

Adds a child node.

```typescript
parent.addChild(child);
```

##### `removeChild(childId: string): void`

Removes a child node.

```typescript
parent.removeChild(child.id);
```

##### `getChildren(): NodeModel[]`

Gets all child nodes.

```typescript
const children = node.getChildren();
```

#### Transformation

##### `getBoundingBox(): BoundingBox`

Gets the bounding box (accounting for rotation and scale).

```typescript
const bbox = node.getBoundingBox();
// { left, top, right, bottom, width, height }
```

##### `getTransformMatrix(): Matrix`

Gets the transformation matrix.

```typescript
const matrix = node.getTransformMatrix();
```

##### `localToWorld(point: Point): Point`

Converts local coordinates to world coordinates.

```typescript
const worldPos = node.localToWorld({ x: 10, y: 10 });
```

##### `worldToLocal(point: Point): Point`

Converts world coordinates to local coordinates.

```typescript
const localPos = node.worldToLocal({ x: 150, y: 150 });
```

#### Metadata

##### `setMetadata(key: string, value: any): void`

Sets metadata value.

```typescript
node.setMetadata('color', '#FF0000');
node.setMetadata('icon', 'user');
```

##### `getMetadata(key: string): any`

Gets metadata value.

```typescript
const color = node.getMetadata('color'); // '#FF0000'
```

##### `hasMetadata(key: string): boolean`

Checks if metadata exists.

```typescript
if (node.hasMetadata('color')) {
  const color = node.getMetadata('color');
}
```

##### `deleteMetadata(key: string): void`

Deletes metadata.

```typescript
node.deleteMetadata('color');
```

#### Dirty Marking (Phase 5.2)

##### `isDirty(): boolean`

Checks if node is dirty.

```typescript
if (node.isDirty()) {
  // Re-render node
}
```

##### `getDirtyReasons(): Set<string>`

Gets reasons why node is dirty.

```typescript
const reasons = node.getDirtyReasons();
// Set { 'position', 'size' }
```

##### `markDirty(reason?: string): void`

Marks node as dirty.

```typescript
node.markDirty('custom-change');
```

##### `markClean(): void`

Marks node as clean.

```typescript
node.markClean();
```

##### `getDirtyTimestamp(): number | null`

Gets timestamp when node became dirty.

```typescript
const timestamp = node.getDirtyTimestamp();
```

#### Serialization

##### `toJSON(): SerializedNode`

Serializes node to JSON.

```typescript
const json = node.toJSON();
```

##### `static fromJSON(data: SerializedNode): NodeModel`

Creates node from JSON.

```typescript
const node = NodeModel.fromJSON(json);
```

#### Memory Management (Phase 5.4)

##### `dispose(): void`

Disposes the node.

```typescript
node.dispose();
```

##### `isDisposed(): boolean`

Checks if node is disposed.

```typescript
if (!node.isDisposed()) {
  node.position = { x: 200, y: 200 };
}
```

### Events

- `change` - Any property changed
- `change:position` - Position changed
- `change:size` - Size changed
- `change:rotation` - Rotation changed
- `change:scale` - Scale changed
- `change:selected` - Selection changed
- `change:label` - Label changed
- `port:added` - Port added
- `port:removed` - Port removed
- `dirty` - Node marked dirty
- `clean` - Node marked clean
- `disposed` - Node disposed

---

## LinkModel

Represents a connection between two ports.

### Constructor

```typescript
constructor(sourcePortId: string, targetPortId: string)
```

Creates a new link.

```typescript
const link = new LinkModel('port-1', 'port-2');
```

### Properties

##### `id: string`

Unique link identifier (read-only).

##### `sourcePortId: string`

Source port ID.

```typescript
link.sourcePortId = 'new-port-1';
```

##### `targetPortId: string`

Target port ID.

```typescript
link.targetPortId = 'new-port-2';
```

##### `routingType: RoutingAlgorithm`

Routing algorithm ('straight' | 'orthogonal' | 'astar' | 'dijkstra').

```typescript
link.routingType = 'orthogonal';
```

##### `points: Point[]`

Path points.

```typescript
link.points = [
  { x: 100, y: 100 },
  { x: 200, y: 100 },
  { x: 200, y: 200 }
];
```

##### `color: string`

Link color.

```typescript
link.color = '#2196F3';
```

##### `width: number`

Link width.

```typescript
link.width = 3;
```

##### `label: string`

Link label.

```typescript
link.label = 'Connection';
```

##### `selected: boolean`

Selection state.

```typescript
link.selected = true;
```

### Methods

#### Serialization

##### `toJSON(): SerializedLink`

Serializes link to JSON.

```typescript
const json = link.toJSON();
```

##### `static fromJSON(data: SerializedLink): LinkModel`

Creates link from JSON.

```typescript
const link = LinkModel.fromJSON(json);
```

#### Memory Management

##### `dispose(): void`

Disposes the link.

```typescript
link.dispose();
```

### Events

- `change` - Any property changed
- `change:points` - Points changed
- `change:routingType` - Routing type changed
- `change:selected` - Selection changed
- `dirty` - Link marked dirty
- `disposed` - Link disposed

---

## PortModel

Represents a connection point on a node.

### Properties

##### `id: string`

Unique port identifier.

##### `type: string`

Port type ('input' | 'output' | 'bidirectional').

```typescript
port.type = 'output';
```

##### `position: PortPosition`

Port position ('left' | 'right' | 'top' | 'bottom' | Point).

```typescript
port.position = 'right';
// Or custom position
port.position = { x: 50, y: 50 };
```

##### `label: string`

Port label.

```typescript
port.label = 'Output 1';
```

---

## GroupModel

Container for grouping nodes.

### Constructor

```typescript
constructor(config: { name?: string })
```

Creates a new group.

```typescript
const group = new GroupModel({ name: 'My Group' });
```

### Properties

##### `name: string`

Group name.

```typescript
group.name = 'Updated Group';
```

##### `nodeIds: string[]`

IDs of nodes in the group.

```typescript
const nodes = group.nodeIds;
```

### Methods

##### `addNode(nodeId: string): void`

Adds a node to the group.

```typescript
group.addNode(node.id);
```

##### `removeNode(nodeId: string): void`

Removes a node from the group.

```typescript
group.removeNode(node.id);
```

##### `containsNode(nodeId: string): boolean`

Checks if group contains node.

```typescript
if (group.containsNode(node.id)) {
  // ...
}
```

---

## Commands

All commands implement the `Command` interface.

### Built-in Commands

#### MoveNodeCommand

Moves a node to a new position.

```typescript
import { MoveNodeCommand } from '@grafloria/diagram-engine';

engine.executeCommand(
  new MoveNodeCommand(node, { x: 200, y: 200 })
);
```

#### ResizeNodeCommand

Resizes a node.

```typescript
import { ResizeNodeCommand } from '@grafloria/diagram-engine';

engine.executeCommand(
  new ResizeNodeCommand(node, { width: 300, height: 150 })
);
```

#### RotateNodeCommand

Rotates a node.

```typescript
import { RotateNodeCommand } from '@grafloria/diagram-engine';

engine.executeCommand(
  new RotateNodeCommand(node, 45)
);
```

#### AddNodeCommand

Adds a node to diagram.

```typescript
import { AddNodeCommand } from '@grafloria/diagram-engine';

engine.executeCommand(
  new AddNodeCommand(diagram, node)
);
```

#### DeleteNodeCommand

Deletes a node from diagram.

```typescript
import { DeleteNodeCommand } from '@grafloria/diagram-engine';

engine.executeCommand(
  new DeleteNodeCommand(diagram, nodeId)
);
```

#### AddLinkCommand

Adds a link to diagram.

```typescript
import { AddLinkCommand } from '@grafloria/diagram-engine';

engine.executeCommand(
  new AddLinkCommand(diagram, link)
);
```

#### DeleteLinkCommand

Deletes a link from diagram.

```typescript
import { DeleteLinkCommand } from '@grafloria/diagram-engine';

engine.executeCommand(
  new DeleteLinkCommand(diagram, linkId)
);
```

#### BatchCommand

Executes multiple commands as one.

```typescript
import { BatchCommand } from '@grafloria/diagram-engine';

const batch = new BatchCommand([
  new MoveNodeCommand(node1, { x: 100, y: 100 }),
  new MoveNodeCommand(node2, { x: 300, y: 300 }),
  new ResizeNodeCommand(node1, { width: 250, height: 150 })
]);

engine.executeCommand(batch);
// One undo reverts all three changes
```

### Creating Custom Commands

```typescript
import { Command } from '@grafloria/diagram-engine';

class CustomCommand implements Command {
  name = 'CustomCommand';

  execute(): void {
    // Do something
  }

  undo(): void {
    // Undo it
  }

  redo(): void {
    // Redo it (usually same as execute)
  }
}

engine.executeCommand(new CustomCommand());
```

---

## RoutingEngine

Calculates paths between ports.

### Methods

##### `routePath(start: Point, end: Point, algorithm?: RoutingAlgorithm): RoutedPath | null`

Calculates a path between two points.

```typescript
const path = engine.getRoutingEngine().routePath(
  { x: 100, y: 100 },
  { x: 300, y: 300 },
  'orthogonal'
);

console.log('Path points:', path.points);
// Routes are automatically cached (LRU, 1000 entries)
```

##### `setDefaultAlgorithm(algorithm: RoutingAlgorithm): void`

Sets the default routing algorithm.

```typescript
engine.getRoutingEngine().setDefaultAlgorithm('orthogonal');
```

##### `registerRouter(name: string, router: IRouter): void`

Registers a custom routing algorithm.

```typescript
engine.getRoutingEngine().registerRouter('custom', new CustomRouter());
```

##### `getAvailableAlgorithms(): string[]`

Gets list of available algorithms.

```typescript
const algorithms = engine.getRoutingEngine().getAvailableAlgorithms();
// ['straight', 'orthogonal', 'astar', 'dijkstra']
```

##### `getStats(): { cacheSize: number }`

Gets routing statistics.

```typescript
const stats = engine.getRoutingEngine().getStats();
console.log('Cache size:', stats.cacheSize);
```

---

## ValidationEngine

Validates diagram structure and rules.

### Methods

##### `registerTypes(types: TypeDefinition): void`

Registers type definitions.

```typescript
import { ERDTypes } from '@grafloria/diagram-engine/types/domain';

engine.getValidationEngine().registerTypes(ERDTypes);
```

##### `validate(diagram: DiagramModel): ValidationResult`

Validates the diagram.

```typescript
const result = engine.getValidationEngine().validate(diagram);

if (!result.valid) {
  console.log('Errors:', result.errors);
}
```

##### `addRule(name: string, rule: ValidationRule): void`

Adds a validation rule.

```typescript
engine.getValidationEngine().addRule('no-self-loops', (link) => {
  return link.sourcePortId !== link.targetPortId;
});
```

---

## DiagramSerializer

Handles serialization and deserialization.

### Methods

##### `serialize(diagram: DiagramModel): SerializedDiagram`

Serializes diagram to JSON.

```typescript
const serializer = new DiagramSerializer();
const json = serializer.serialize(diagram);
```

##### `deserialize(data: SerializedDiagram): DiagramModel`

Deserializes diagram from JSON.

```typescript
const diagram = serializer.deserialize(json);
```

##### `migrate(data: SerializedDiagram): SerializedDiagram`

Migrates old schema to current version.

```typescript
const migrated = serializer.migrate(oldData);
```

---

## PluginManager

Manages engine plugins.

### Methods

##### `register(plugin: DiagramPlugin): void`

Registers a plugin.

```typescript
engine.getPluginManager().register(new MyPlugin());
```

##### `unregister(pluginName: string): void`

Unregisters a plugin.

```typescript
engine.getPluginManager().unregister('MyPlugin');
```

##### `get(pluginName: string): DiagramPlugin | undefined`

Gets a plugin by name.

```typescript
const plugin = engine.getPluginManager().get('MyPlugin');
```

##### `getAll(): DiagramPlugin[]`

Gets all plugins.

```typescript
const plugins = engine.getPluginManager().getAll();
```

---

## Performance APIs

APIs for optimizing large diagrams.

### SpatialIndex

##### `add(entity: T): void`

Adds entity to spatial index.

##### `remove(id: string): void`

Removes entity from spatial index.

##### `query(region: Rectangle): T[]`

Queries entities in region (O(k) where k = results).

##### `update(entity: T): void`

Updates entity position in index.

##### `clear(): void`

Clears all entities from index.

### LRUCache

##### `get(key: K): V | undefined`

Gets value from cache.

##### `set(key: K, value: V): void`

Sets value in cache (with automatic eviction).

##### `has(key: K): boolean`

Checks if key exists in cache.

##### `delete(key: K): boolean`

Deletes key from cache.

##### `clear(): void`

Clears entire cache.

##### `size(): number`

Returns cache size.

---

## Types

### Core Types

```typescript
interface Point {
  x: number;
  y: number;
}

interface Size {
  width: number;
  height: number;
}

interface Rectangle extends Point, Size {}

interface BoundingBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}
```

### Performance Types

```typescript
type LODLevel = 'high' | 'medium' | 'low';

interface EntityWithLOD<T> {
  entity: T;
  lod: LODLevel;
}
```

### Routing Types

```typescript
type RoutingAlgorithm = 'straight' | 'orthogonal' | 'astar' | 'dijkstra';

interface RoutedPath {
  points: Point[];
  distance: number;
}
```

### Validation Types

```typescript
interface TypeDefinition {
  name: string;
  category: string;
  nodeTypes: string[];
  linkTypes: string[];
  rules: ValidationRule[];
}

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}
```

---

## Usage Patterns

### Pattern 1: Viewport Rendering

```typescript
// Get visible entities with LOD
const viewport = { x: scrollX, y: scrollY, width: 1920, height: 1080 };
const zoom = 1.0;

const nodesWithLOD = diagram.getNodesWithLOD(viewport, zoom);
const linksWithLOD = diagram.getLinksWithLOD(viewport, zoom);

// Render only visible entities
nodesWithLOD.forEach(({ entity: node, lod }) => {
  renderNode(node, lod);
});

linksWithLOD.forEach(({ entity: link, lod }) => {
  renderLink(link, lod);
});
```

### Pattern 2: Incremental Updates

```typescript
// Track dirty entities
const dirtyNodes = new Set<string>();

diagram.on('entity:dirty', (entity) => {
  if (entity instanceof NodeModel) {
    dirtyNodes.add(entity.id);
    scheduleRender();
  }
});

function render() {
  // Only re-render dirty nodes
  dirtyNodes.forEach(nodeId => {
    const node = diagram.getNode(nodeId);
    if (node) {
      updateNodeRendering(node);
    }
  });

  dirtyNodes.clear();
}
```

### Pattern 3: Command Batching

```typescript
// Batch multiple operations
const commands = selectedNodes.map(node =>
  new MoveNodeCommand(node, { x: node.position.x + 10, y: node.position.y })
);

engine.executeCommand(new BatchCommand(commands));

// One undo moves all nodes back
```

---

**For more examples, see the [Examples](examples/) directory.**
