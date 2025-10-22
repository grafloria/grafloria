# Feature Guides

Deep dives into specific engine features.

## Available Guides

1. **[Performance](performance.md)** - Viewport virtualization, LOD, caching, optimization techniques
2. **[Routing](routing.md)** - Path algorithms, obstacle detection, custom routers
3. **[Commands](commands.md)** - Command pattern, undo/redo, batching, custom commands
4. **[Events](events.md)** - Event system, subscriptions, patterns, best practices
5. **[Validation](validation.md)** - Type system, custom rules, ValidationEngine
6. **[Serialization](serialization.md)** - Save/load, versioning, migration
7. **[Plugins](plugins.md)** - Creating plugins, lifecycle, examples

## Quick Reference

### Performance Optimization
```typescript
// Viewport virtualization
const visible = diagram.getVisibleNodes(viewport);

// Level of Detail
const nodesWithLOD = diagram.getNodesWithLOD(viewport, zoom);

// Dirty marking
node.on('dirty', () => scheduleRender());
```

### Routing
```typescript
// Use routing engine
const path = engine.getRoutingEngine().routePath(start, end, 'orthogonal');
```

### Commands
```typescript
// Execute with undo/redo
engine.executeCommand(new MoveNodeCommand(node, { x: 100, y: 100 }));
engine.undo();
engine.redo();
```

### Events
```typescript
// Subscribe to changes
diagram.on('node:added', (node) => console.log('Added:', node.id));
```

### Validation
```typescript
// Register types
engine.getValidationEngine().registerTypes(ERDTypes);

// Validate diagram
const result = engine.getValidationEngine().validate(diagram);
```

### Serialization
```typescript
// Save
const json = engine.serialize();
localStorage.setItem('diagram', JSON.stringify(json));

// Load
engine.deserialize(JSON.parse(localStorage.getItem('diagram')));
```

### Plugins
```typescript
// Register plugin
engine.getPluginManager().register(new AutoSavePlugin());
```
