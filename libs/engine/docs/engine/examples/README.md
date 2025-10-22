# Examples

Complete working examples for common use cases.

## Available Examples

1. **[ERD Builder](01-erd-builder.md)** - Database design tool with tables, fields, and relationships
2. **[UML Class Diagram](02-uml-diagram.md)** - Class diagrams with inheritance and associations
3. **[Workflow Builder](03-workflow-builder.md)** - BPMN-style workflow diagrams with tasks and gateways
4. **[Page Builder](04-page-builder.md)** - Elementor-style visual page builder ✅ Complete
5. **[Large Diagram Performance](05-large-diagram.md)** - Handling 10,000+ nodes with optimization

## Quick Start Examples

### ERD (Entity-Relationship Diagram)
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
  { name: 'created_at', type: 'timestamp' }
]);

diagram.addNode(usersTable);
```

### UML Class Diagram
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
  { name: 'name', type: 'string', visibility: 'public' }
]);
userClass.setMetadata('methods', [
  { name: 'login', returnType: 'boolean', visibility: 'public' }
]);

diagram.addNode(userClass);
```

### BPMN Workflow
```typescript
import { BPMNTypes } from '@grafloria/diagram-engine/types/domain';

engine.getValidationEngine().registerTypes(BPMNTypes);

const startEvent = new NodeModel({ type: 'bpmn.startEvent', position: { x: 100, y: 200 }, size: { width: 50, height: 50 } });
const task = new NodeModel({ type: 'bpmn.task', position: { x: 200, y: 200 }, size: { width: 100, height: 80 } });
const gateway = new NodeModel({ type: 'bpmn.exclusiveGateway', position: { x: 350, y: 200 }, size: { width: 50, height: 50 } });

diagram.addNode(startEvent);
diagram.addNode(task);
diagram.addNode(gateway);
```

### Large Diagram (10,000+ nodes)
```typescript
// Generate large diagram
for (let i = 0; i < 10000; i++) {
  const node = new NodeModel({
    type: 'basic',
    position: { x: (i % 100) * 150, y: Math.floor(i / 100) * 150 },
    size: { width: 100, height: 50 }
  });
  diagram.addNode(node);
}

// Use viewport virtualization
const viewport = { x: scrollX, y: scrollY, width: 1920, height: 1080 };
const visibleNodes = diagram.getVisibleNodes(viewport); // O(k) - only ~50 nodes

// Render only visible
visibleNodes.forEach(node => renderNode(node));

// Result: 60 FPS even with 10K nodes! ✅
```

## See Also

- [Getting Started Guide](../01-getting-started.md) - Basic usage tutorial
- [Performance Guide](../guides/performance.md) - Optimization techniques
- [API Reference](../02-api-reference.md) - Complete API documentation
