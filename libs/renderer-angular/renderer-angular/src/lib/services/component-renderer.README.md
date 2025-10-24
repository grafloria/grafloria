# ComponentRendererService

Angular service for rendering components inside SVG foreignObject elements.

## Overview

The `ComponentRendererService` manages the complete lifecycle of Angular components embedded within diagram nodes. It provides:

- **Component Registration**: Map node types to Angular components
- **Dynamic Instantiation**: Create component instances on demand
- **Lifecycle Management**: Handle ngOnInit, ngOnChanges, ngOnDestroy
- **Input/Output Binding**: Bidirectional data flow
- **Container Management**: foreignObject creation and ID management
- **Memory Management**: Proper cleanup to prevent leaks
- **Batch Operations**: Efficient bulk updates

## Installation

The service is provided at root level and automatically available via dependency injection:

```typescript
import { ComponentRendererService } from '@grafloria/renderer-angular';

@Component({
  // ...
})
export class MyComponent {
  constructor(private componentRenderer: ComponentRendererService) {}
}
```

## Quick Start

### 1. Register a Component

```typescript
@Component({
  selector: 'app-table-node',
  template: `
    <div class="table-node">
      <h3>{{ tableName }}</h3>
      <ul>
        <li *ngFor="let column of columns">{{ column }}</li>
      </ul>
      <button (click)="onAddColumn()">Add Column</button>
    </div>
  `
})
export class TableNodeComponent {
  @Input() tableName: string = '';
  @Input() columns: string[] = [];
  @Output() columnAdded = new EventEmitter<string>();

  onAddColumn() {
    this.columnAdded.emit('New Column');
  }
}

// Register the component for a node type
componentRenderer.registerComponent('ERD.TABLE', TableNodeComponent);
```

### 2. Render a Component

```typescript
const node: DiagramNode = {
  id: 'table-1',
  type: 'ERD.TABLE',
  // ...
};

const componentRef = componentRenderer.renderComponent(
  node,
  this.viewContainerRef,
  {
    inputs: {
      tableName: 'users',
      columns: ['id', 'name', 'email']
    },
    outputHandlers: {
      columnAdded: (columnName: string) => {
        console.log('Column added:', columnName);
        // Update diagram state...
      }
    }
  }
);
```

### 3. Update Component

```typescript
// Update inputs without recreating component
componentRenderer.updateComponent('table-1', {
  tableName: 'products',
  columns: ['id', 'name', 'price', 'stock']
});
```

### 4. Destroy Component

```typescript
// Clean up when node is removed
componentRenderer.destroyComponent('table-1');
```

## API Reference

### Registration Methods

#### `registerComponent(nodeType: string, component: Type<any>): void`

Register an Angular component for a node type.

**Parameters:**
- `nodeType`: Unique identifier (e.g., 'ERD.TABLE', 'BPMN.TASK')
- `component`: Angular component class

**Throws:** Error if type already registered

**Example:**
```typescript
componentRenderer.registerComponent('BPMN.TASK', TaskComponent);
```

#### `hasComponent(nodeType: string): boolean`

Check if a component is registered for a node type.

**Returns:** `true` if registered, `false` otherwise

#### `getRegisteredComponent(nodeType: string): Type<any> | null`

Get the registered component class for a node type.

**Returns:** Component class or `null` if not registered

### Rendering Methods

#### `renderComponent(node: DiagramNode, viewContainerRef: ViewContainerRef, options?: RenderComponentOptions): ComponentRef<any>`

Create and render a component instance.

**Parameters:**
- `node`: Diagram node object with `id` and `type`
- `viewContainerRef`: Angular ViewContainerRef to render into
- `options`: Optional rendering configuration
  - `inputs`: Initial input values
  - `outputHandlers`: Event handler map

**Returns:** ComponentRef for programmatic access

**Throws:** Error if component not registered or instantiation fails

**Example:**
```typescript
const ref = componentRenderer.renderComponent(node, viewContainer, {
  inputs: { title: 'My Node' },
  outputHandlers: {
    clicked: (event) => console.log('Clicked!', event)
  }
});
```

#### `updateComponent(nodeId: string, inputs: Record<string, any>): void`

Update component inputs without recreating the component (efficient).

**Parameters:**
- `nodeId`: Node identifier
- `inputs`: New input values (partial updates supported)

**Throws:** Error if component not rendered

**Example:**
```typescript
componentRenderer.updateComponent('node-1', {
  title: 'Updated Title',
  count: 42
});
```

#### `destroyComponent(nodeId: string): void`

Destroy a component and clean up all resources.

**Parameters:**
- `nodeId`: Node identifier

**Example:**
```typescript
componentRenderer.destroyComponent('node-1');
```

#### `destroyAll(): void`

Destroy all active components. Typically called when diagram is cleared.

**Example:**
```typescript
componentRenderer.destroyAll();
```

### Batch Operations

#### `batchUpdate(updates: ComponentUpdate[]): void`

Update multiple components efficiently with optimized change detection.

**Parameters:**
- `updates`: Array of `{ nodeId, inputs }` objects

**Example:**
```typescript
componentRenderer.batchUpdate([
  { nodeId: 'node-1', inputs: { title: 'First' } },
  { nodeId: 'node-2', inputs: { title: 'Second' } },
  { nodeId: 'node-3', inputs: { title: 'Third' } }
]);
```

### Query Methods

#### `getComponent<T>(nodeId: string): ComponentRef<T> | null`

Get component reference for programmatic access.

**Parameters:**
- `nodeId`: Node identifier

**Returns:** ComponentRef or `null` if not found

**Example:**
```typescript
const ref = componentRenderer.getComponent<TableNodeComponent>('table-1');
if (ref) {
  ref.instance.refreshData();
}
```

#### `getActiveCount(): number`

Get count of active component instances (useful for debugging).

**Returns:** Number of active components

#### `getContainerId(nodeId: string): string | null`

Get foreignObject container ID for a node.

**Parameters:**
- `nodeId`: Node identifier

**Returns:** Container ID or `null`

### ForeignObject Methods

#### `createForeignObjectVNode(node: DiagramNode, bounds: ComponentBounds): VNode`

Create a foreignObject VNode for rendering pipeline.

**Parameters:**
- `node`: Diagram node
- `bounds`: Position and size `{ x, y, width, height }`

**Returns:** VNode for foreignObject

**Example:**
```typescript
const vnode = componentRenderer.createForeignObjectVNode(node, {
  x: 100,
  y: 100,
  width: 300,
  height: 200
});
```

## Advanced Usage

### Accessing Component Instance

```typescript
const ref = componentRenderer.getComponent<MyComponent>('node-1');
if (ref) {
  // Call methods
  ref.instance.refreshData();

  // Read properties
  console.log(ref.instance.title);

  // Write properties
  ref.instance.isActive = true;

  // Trigger change detection
  ref.changeDetectorRef.detectChanges();
}
```

### Handling Multiple Outputs

```typescript
componentRenderer.renderComponent(node, viewContainer, {
  inputs: { /* ... */ },
  outputHandlers: {
    itemSelected: (item) => {
      console.log('Selected:', item);
      this.store.dispatch(selectItem(item));
    },
    itemDeleted: (id) => {
      console.log('Deleted:', id);
      this.store.dispatch(deleteItem(id));
    },
    dataChanged: (data) => {
      console.log('Data changed:', data);
      this.saveDiagram();
    }
  }
});
```

### Performance Optimization

```typescript
// Use batch updates for multiple simultaneous changes
const updates = nodes.map(node => ({
  nodeId: node.id,
  inputs: this.calculateInputs(node)
}));

componentRenderer.batchUpdate(updates);
```

### Memory Leak Prevention

The service automatically:
- Calls `ngOnDestroy()` on component destruction
- Unsubscribes from all output events
- Removes DOM elements
- Clears internal references

For additional safety, always call `destroyComponent()` or `destroyAll()` when nodes are removed:

```typescript
ngOnDestroy() {
  // Clean up when parent component is destroyed
  this.componentRenderer.destroyAll();
}
```

### Error Handling

```typescript
try {
  componentRenderer.renderComponent(node, viewContainer, options);
} catch (error) {
  console.error('Failed to render component:', error);
  // Show error placeholder or fallback UI
  this.showErrorState(node.id);
}
```

## Testing

### Unit Testing Components

```typescript
describe('MyDiagramComponent', () => {
  let componentRenderer: ComponentRendererService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ComponentRendererService]
    });

    componentRenderer = TestBed.inject(ComponentRendererService);
  });

  afterEach(() => {
    componentRenderer.destroyAll();
  });

  it('should render table component', () => {
    componentRenderer.registerComponent('TABLE', TableComponent);

    const node = { id: 'table-1', type: 'TABLE' };
    const ref = componentRenderer.renderComponent(node, viewContainer, {
      inputs: { tableName: 'users' }
    });

    expect(ref.instance.tableName).toBe('users');
  });
});
```

## Performance Characteristics

- **Component Creation**: ~20ms per component
- **Component Update**: ~5ms per component
- **Batch Update (100 components)**: ~50ms total
- **Memory**: ~2MB per 100 components
- **Memory Leak Test**: Stable over 1000+ create/destroy cycles

## Common Patterns

### Pattern 1: Dynamic Node Types

```typescript
// Register multiple component types
const nodeComponentMap = {
  'ERD.TABLE': TableComponent,
  'ERD.RELATIONSHIP': RelationshipComponent,
  'BPMN.TASK': TaskComponent,
  'BPMN.GATEWAY': GatewayComponent
};

for (const [type, component] of Object.entries(nodeComponentMap)) {
  componentRenderer.registerComponent(type, component);
}
```

### Pattern 2: Conditional Rendering

```typescript
renderNode(node: DiagramNode) {
  if (componentRenderer.hasComponent(node.type)) {
    // Render as component
    return componentRenderer.createForeignObjectVNode(node, bounds);
  } else {
    // Fallback to SVG rendering
    return this.createSVGVNode(node);
  }
}
```

### Pattern 3: Component State Sync

```typescript
// Sync component state with store
componentRenderer.renderComponent(node, viewContainer, {
  inputs: this.mapNodeToInputs(node),
  outputHandlers: {
    stateChanged: (state) => {
      this.store.dispatch(updateNode({
        id: node.id,
        changes: state
      }));
    }
  }
});
```

## Troubleshooting

### Component not rendering

- ✅ Check component is registered: `componentRenderer.hasComponent(nodeType)`
- ✅ Verify ViewContainerRef is valid
- ✅ Check console for errors

### Memory leaks

- ✅ Always call `destroyComponent()` when node removed
- ✅ Call `destroyAll()` in parent's `ngOnDestroy()`
- ✅ Verify output subscriptions are cleaned up

### Performance issues

- ✅ Use `batchUpdate()` for multiple simultaneous changes
- ✅ Avoid creating/destroying components unnecessarily
- ✅ Use `updateComponent()` instead of destroy+render

### Change detection not working

- ✅ Call `componentRef.changeDetectorRef.detectChanges()` manually if needed
- ✅ Ensure inputs actually changed (checked by reference equality)
- ✅ Verify component implements `ngOnChanges()` if needed

## Related

- [VNode foreignObject Documentation](../../../renderer/src/vnode/README.md)
- [SVGRenderer Integration](../../../renderer/src/svg/README.md)
- [Angular Component Lifecycle](https://angular.dev/guide/components/lifecycle)

## License

MIT
