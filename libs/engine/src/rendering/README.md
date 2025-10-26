# HTML Template Rendering (Phase 3.4)

Framework-agnostic HTML template rendering with EventBus integration for the diagram engine.

## Overview

The HTML Template Renderer provides:

- **LemonadeJS Templates**: Framework-independent HTML templates with two-way data binding
- **EventBus Integration**: DOM events automatically connected to the engine's sophisticated event system
- **Data Binding**: Automatic binding of node data to template variables
- **Component Mode**: Pass-through support for framework-specific components (Angular, React, etc.)

## Architecture

### Two Rendering Modes

1. **Template Mode** (Phase 3.4): LemonadeJS templates - framework-agnostic
2. **Component Mode**: Framework-specific component references (existing behavior)

### Event Flow

```
DOM Event → HtmlTemplateRenderer → EventBus → Application Handlers
```

All HTML template events are emitted through the engine's EventBus, ensuring:
- Centralized event management
- Event recording/replay support
- Filtering, debouncing, throttling capabilities
- Namespace-based event organization

## Usage

### Basic Template

```typescript
import { NodeTemplate } from '@grafloria/engine';

const userCardTemplate: NodeTemplate = {
  id: 'user-card',
  version: '1.0.0',
  meta: {
    name: 'User Card',
    category: 'people',
  },
  structure: {
    type: 'user-card',
    size: { width: 200, height: 100 },

    // LemonadeJS template mode
    html: {
      mode: 'template',
      template: `
        <div class="user-card">
          <h3>{{data.name}}</h3>
          <p>{{data.email}}</p>
          <button>Contact</button>
        </div>
      `,
      className: 'custom-user-card',
      style: {
        padding: '10px',
        borderRadius: '8px',
        backgroundColor: '#f5f5f5',
      },
    },
  },
  defaultData: {
    name: 'John Doe',
    email: 'john@example.com',
  },
};
```

### Event Integration

Connect DOM events to the EventBus:

```typescript
const interactiveTemplate: NodeTemplate = {
  id: 'interactive-node',
  version: '1.0.0',
  meta: {
    name: 'Interactive Node',
    category: 'controls',
  },
  structure: {
    type: 'interactive',
    html: {
      mode: 'template',
      template: `
        <div class="interactive-node">
          <input type="text" value="{{data.value}}" />
          <button class="submit">Submit</button>
          <button class="cancel">Cancel</button>
        </div>
      `,

      // Map DOM events to engine events
      events: {
        'click': 'node:clicked',
        'input': 'node:valueChanged',
        'mouseenter': 'node:hovered',
        'mouseleave': 'node:unhovered',
      },
    },
  },
};
```

### Listening to Template Events

```typescript
import { DiagramEngine } from '@grafloria/engine';

const engine = new DiagramEngine();

// Listen to events from HTML templates
engine.eventBus.on('node:clicked', (data) => {
  console.log('Node clicked:', data.nodeId);
  console.log('Node data:', data.nodeData);
  console.log('DOM event:', data.event);
});

engine.eventBus.on('node:valueChanged', (data) => {
  console.log('Value changed in node:', data.nodeId);
  console.log('New value:', data.event.target.value);

  // Update node data
  const node = engine.diagram.getNode(data.nodeId);
  node?.setData('value', data.event.target.value);
});

// Filtered event handling
engine.eventBus.onFiltered(
  'node:clicked',
  (data) => data.nodeData.type === 'user-card',
  (data) => {
    console.log('User card clicked:', data.nodeData.name);
  }
);

// Debounced event handling (prevent too frequent updates)
engine.eventBus.onDebounced('node:valueChanged', 300, (data) => {
  // Save to server after 300ms of no changes
  saveToServer(data.nodeId, data.nodeData);
});
```

### Event Payload Structure

All HTML template events emit with this payload:

```typescript
{
  nodeId: string;         // Node ID
  nodeUuid: string;       // Node UUID
  nodeData: any;          // Node's data object
  event: Event;           // Original DOM event
  domEventType: string;   // DOM event name ('click', 'input', etc.)
}
```

### Custom Data Bindings

Map template variables to node data paths:

```typescript
const template: NodeTemplate = {
  // ...
  structure: {
    type: 'user-profile',
    html: {
      mode: 'template',
      template: `
        <div>
          <h1>{{fullName}}</h1>
          <p>{{itemCount}} items</p>
          <span>{{status}}</span>
        </div>
      `,

      // Custom bindings
      bindings: {
        fullName: 'data.user.firstName',    // Deep path
        itemCount: 'data.items.length',     // Computed value
        status: 'data.status',              // Direct value
      },
    },
  },
};
```

### Advanced: Namespaced Events

Use event namespaces for better organization:

```typescript
const template: NodeTemplate = {
  // ...
  structure: {
    type: 'form-node',
    html: {
      mode: 'template',
      template: `
        <div>
          <input class="name-input" />
          <button class="submit-btn">Submit</button>
          <button class="cancel-btn">Cancel</button>
        </div>
      `,

      // Use namespaces for event organization
      events: {
        'click': 'form:submitted',      // Namespace: form
        'input': 'form:valueChanged',   // Namespace: form
      },
    },
  },
};

// Subscribe to all events in 'form' namespace
engine.eventBus.on('form:*', ({ action, data }) => {
  console.log(`Form event: ${action}`, data);
});

// Subscribe to specific action
engine.eventBus.on('form:submitted', (data) => {
  validateForm(data.nodeId);
});
```

### Event Recording & Replay

The EventBus integration enables event recording/replay:

```typescript
// Start recording
engine.eventBus.startRecording();

// User interacts with HTML templates...

// Stop and get event log
const events = engine.eventBus.stopRecording();

// Replay events later
engine.eventBus.replay(events);
```

### Batch Event Processing

```typescript
// Batch multiple events for performance
engine.eventBus.batch(() => {
  // Multiple template interactions...
  // Events are queued and emitted together
});

// Listen for batch completion
engine.eventBus.on('batch:complete', (events) => {
  console.log('Processed batch:', events.length);
});
```

## Component Mode (Backward Compatible)

Existing framework-specific components still work:

```typescript
const angularComponentTemplate: NodeTemplate = {
  // ...
  structure: {
    type: 'angular-node',
    html: {
      mode: 'component',  // Framework-specific
      component: 'UserAvatarComponent',
      className: 'custom-class',
      style: { width: '100px' },
    },
  },
};
```

## Styling

### CSS Classes

```typescript
html: {
  mode: 'template',
  template: '<div>Content</div>',

  // Single class
  className: 'my-custom-class',

  // Multiple classes
  className: ['class1', 'class2', 'class3'],

  // Or space-separated
  className: 'class1 class2 class3',
}
```

### Inline Styles

```typescript
html: {
  mode: 'template',
  template: '<div>Content</div>',
  style: {
    padding: '10px',
    backgroundColor: '#fff',
    borderRadius: '4px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
}
```

### Z-Index & Pointer Events

```typescript
html: {
  mode: 'template',
  template: '<div>Content</div>',
  zIndex: 100,              // HTML layer z-index
  pointerEvents: true,       // Enable mouse events
}
```

## Integration with Event System Features

### Filtered Events

```typescript
// Only handle clicks on specific node types
engine.eventBus.onFiltered(
  'node:clicked',
  (data) => data.nodeData.category === 'user',
  handleUserNodeClick
);
```

### Throttled Events

```typescript
// Handle mousemove events at most once per 100ms
engine.eventBus.onThrottled('node:hovered', 100, (data) => {
  updateHoverPreview(data.nodeId);
});
```

### Debounced Events

```typescript
// Save changes after 500ms of no input
engine.eventBus.onDebounced('node:valueChanged', 500, (data) => {
  saveToDatabase(data.nodeId, data.nodeData);
});
```

### Mapped Events

```typescript
// Transform event data before handling
engine.eventBus.onMapped(
  'node:valueChanged',
  (data) => ({ id: data.nodeId, value: data.event.target.value }),
  (transformed) => {
    console.log('Transformed:', transformed);
  }
);
```

## Best Practices

1. **Use Namespaces**: Organize events with namespaces (`form:submit`, `user:clicked`)
2. **Debounce Input**: Use `onDebounced` for text input to avoid excessive updates
3. **Filter Events**: Use `onFiltered` to handle specific node types efficiently
4. **Record Important Flows**: Use event recording for debugging complex interactions
5. **Batch Updates**: Use `eventBus.batch()` when making multiple changes

## Examples

### Complete Interactive Form Node

```typescript
const formTemplate: NodeTemplate = {
  id: 'user-form',
  version: '1.0.0',
  meta: {
    name: 'User Form',
    category: 'forms',
  },
  structure: {
    type: 'user-form',
    size: { width: 300, height: 200 },

    html: {
      mode: 'template',
      template: `
        <form class="user-form">
          <input
            type="text"
            name="firstName"
            value="{{data.firstName}}"
            placeholder="First Name"
          />
          <input
            type="text"
            name="lastName"
            value="{{data.lastName}}"
            placeholder="Last Name"
          />
          <input
            type="email"
            name="email"
            value="{{data.email}}"
            placeholder="Email"
          />
          <button type="submit">Save</button>
          <button type="button" class="cancel">Cancel</button>
        </form>
      `,

      className: 'diagram-form-node',

      style: {
        padding: '15px',
        backgroundColor: 'white',
        borderRadius: '8px',
        boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
      },

      events: {
        'submit': 'form:submitted',
        'input': 'form:fieldChanged',
        'click': 'form:buttonClicked',
      },
    },
  },

  defaultData: {
    firstName: '',
    lastName: '',
    email: '',
  },
};

// Event handlers
engine.eventBus.on('form:submitted', (data) => {
  data.event.preventDefault();
  console.log('Form submitted:', data.nodeData);
  validateAndSaveForm(data.nodeId, data.nodeData);
});

engine.eventBus.onDebounced('form:fieldChanged', 300, (data) => {
  const fieldName = data.event.target.name;
  const fieldValue = data.event.target.value;

  const node = engine.diagram.getNode(data.nodeId);
  node?.setData(fieldName, fieldValue);
});

engine.eventBus.onFiltered(
  'form:buttonClicked',
  (data) => data.event.target.classList.contains('cancel'),
  (data) => {
    console.log('Form cancelled');
    resetForm(data.nodeId);
  }
);
```

## Future Enhancements

- Full LemonadeJS runtime integration (when package is available)
- Two-way data binding with automatic updates
- Template directives (loops, conditionals)
- Custom event modifiers
- Virtual DOM optimizations

## See Also

- [EventBus Documentation](../events/EventBus.ts)
- [NodeTemplate Types](../templates/NodeTemplate.ts)
- [Template System Overview](../templates/README.md)
