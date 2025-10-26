# EventBus Events Reference

This document lists all standard events emitted through the EventBus system.

## Overview

The EventBus provides a centralized event system for the diagram engine. Events are used for:
- Inter-component communication
- Error and warning reporting
- Lifecycle notifications
- User interaction tracking

## Event Naming Convention

Events follow the pattern: `category:action`

Examples:
- `renderer:error` - Renderer category, error action
- `node:clicked` - Node category, clicked action
- `template:registered` - Template category, registered action

---

## Renderer Events

Events emitted by rendering components.

### `renderer:error`

Emitted when a renderer encounters an error during template processing.

**Source**: LemonadeJSRenderer

**Payload**:
```typescript
{
  nodeId: string;          // ID of the node being rendered
  nodeUuid: string;        // UUID of the node
  error: Error;            // The error object
  message: string;         // Human-readable error message
  phase: string;           // Which phase failed (e.g., 'template-rendering')
}
```

**Example**:
```typescript
eventBus.on('renderer:error', (data) => {
  console.error(`Rendering failed for node ${data.nodeId}:`, data.message);
  // Handle error (show UI notification, log to server, etc.)
});
```

**When Emitted**:
- LemonadeJS template compilation fails
- Invalid template syntax
- Missing required template properties

---

### `renderer:warning`

Emitted when a renderer encounters a non-fatal issue.

**Source**: LemonadeJSRenderer, HtmlTemplateRenderer

**Payload**:
```typescript
{
  message: string;         // Warning message
  expression?: string;     // Expression that failed (for evaluation errors)
  error?: Error;           // Optional error object
  phase: string;           // Which phase triggered warning
  renderer?: string;       // Which renderer emitted (e.g., 'HtmlTemplateRenderer')
}
```

**Example**:
```typescript
eventBus.on('renderer:warning', (data) => {
  console.warn(`Renderer warning in ${data.phase}:`, data.message);
  if (data.expression) {
    console.warn(`Failed expression: ${data.expression}`);
  }
});
```

**When Emitted**:
- Expression evaluation fails (e.g., accessing undefined property)
- Invalid binding path
- Fallback rendering triggered

---

## Node Events

Events related to node interactions (from templates).

### `node:clicked`

Emitted when a node is clicked.

**Source**: Node templates with click event handlers

**Payload**:
```typescript
{
  nodeId: string;          // Node ID
  nodeUuid: string;        // Node UUID
  nodeData: any;           // Node data object
  event: MouseEvent;       // Original DOM event
  domEventType: string;    // 'click'
}
```

**Example**:
```typescript
eventBus.on('node:clicked', (data) => {
  console.log(`Node ${data.nodeId} was clicked`);
  // Open node details panel, etc.
});
```

---

### `node:hovered` / `node:unhovered`

Emitted when mouse enters/leaves a node.

**Source**: Node templates with mouseenter/mouseleave handlers

**Payload**: Same as `node:clicked` (with appropriate event type)

---

## Template Events

Events from template library operations.

### Template-specific Events

Templates can define custom events like:
- `user:clicked` - User avatar clicked
- `card:edited` - Card double-clicked for editing
- `button:clicked` - Button activated
- `input:changed` - Input value changed

**Payload**: Standard node event payload (see `node:clicked`)

---

## Subscribing to Events

### Basic Subscription

```typescript
import { eventBus } from './your-engine';

eventBus.on('renderer:error', (data) => {
  // Handle error
});
```

### Debounced Events

For events that fire frequently:

```typescript
eventBus.onDebounced('input:changed', 300, (data) => {
  // Fires at most once per 300ms
  saveToServer(data.nodeData.value);
});
```

### Filtered Events

Only receive events matching a condition:

```typescript
eventBus.onFiltered(
  'node:clicked',
  (data) => data.nodeData.type === 'important',
  (data) => {
    // Only called for "important" nodes
    highlightNode(data.nodeId);
  }
);
```

### One-time Events

```typescript
eventBus.once('renderer:error', (data) => {
  // Fires only once, then automatically unsubscribes
});
```

### Unsubscribing

```typescript
const unsubscribe = eventBus.on('node:clicked', handler);

// Later...
unsubscribe(); // Stop receiving events
```

---

## Best Practices

### 1. Use Specific Event Names

✅ Good:
```typescript
eventBus.emit('user:avatar:clicked', data);
eventBus.emit('form:validation:failed', data);
```

❌ Avoid:
```typescript
eventBus.emit('click', data);        // Too generic
eventBus.emit('thing-happened', data); // Not descriptive
```

### 2. Include Context in Payload

Always include enough context for handlers to act:
```typescript
eventBus.emit('renderer:error', {
  nodeId,
  nodeUuid,
  error,
  message,
  phase,  // What was happening when error occurred
});
```

### 3. Document Custom Events

When creating custom template events, document them:
```typescript
/**
 * Custom Template Events:
 * - 'dashboard:widget:resized' - Widget was resized
 * - 'dashboard:widget:moved' - Widget was repositioned
 */
```

### 4. Handle Errors in Subscribers

```typescript
eventBus.on('node:clicked', (data) => {
  try {
    // Your logic
  } catch (error) {
    console.error('Error handling node click:', error);
  }
});
```

### 5. Clean Up Subscriptions

```typescript
class MyComponent {
  private unsubscribers: Array<() => void> = [];

  constructor(eventBus: EventBus) {
    this.unsubscribers.push(
      eventBus.on('node:clicked', this.handleClick)
    );
  }

  dispose() {
    this.unsubscribers.forEach(unsub => unsub());
  }
}
```

---

## Testing Events

### Listening for Events in Tests

```typescript
it('should emit renderer:error on failure', (done) => {
  eventBus.on('renderer:error', (data) => {
    expect(data.message).toContain('rendering');
    done();
  });

  renderer.render(invalidConfig, node);
});
```

### Verifying Event Payload

```typescript
it('should include node context in events', (done) => {
  eventBus.on('node:clicked', (data) => {
    expect(data.nodeId).toBe('test-node');
    expect(data.nodeUuid).toBeDefined();
    expect(data.event).toBeDefined();
    done();
  });

  simulateClick(node);
});
```

---

## Migration from console.log/warn/error

### Before (console logging)
```typescript
console.error('Rendering failed:', error);
console.warn('Invalid expression:', expression);
```

### After (EventBus)
```typescript
eventBus.emit('renderer:error', {
  message: 'Rendering failed',
  error,
  phase: 'template-rendering',
});

eventBus.emit('renderer:warning', {
  message: 'Invalid expression',
  expression,
  phase: 'expression-evaluation',
});
```

### Benefits
- ✅ Testable (can assert events were emitted)
- ✅ Structured data (consistent payload format)
- ✅ Filterable (subscribe only to specific events)
- ✅ Production-safe (no console pollution)
- ✅ Actionable (can respond programmatically)

---

## Performance Considerations

### Event Frequency

High-frequency events can impact performance:
```typescript
// ❌ Avoid emitting on every mousemove
eventBus.emit('mouse:moved', { x, y }); // 60+ times per second!

// ✅ Use debounced subscriptions
eventBus.onDebounced('mouse:moved', 100, handler);
```

### Event Payload Size

Keep payloads lightweight:
```typescript
// ❌ Don't include entire objects
eventBus.emit('node:changed', { entireNodeGraph });

// ✅ Include only necessary data
eventBus.emit('node:changed', { nodeId, changedFields });
```

---

## Related Documentation

- [EventBus API](./EventBus.ts)
- [Template Events](../template-library/README.md#eventbus-integration)
- [Renderer Events](../rendering/README.md)

---

## Contributing

When adding new events:

1. Choose a descriptive name following `category:action` pattern
2. Document the event in this file
3. Include TypeScript payload interface
4. Provide usage examples
5. Add tests verifying the event is emitted

---

**Last Updated**: Phase 3.4 - Renderer Architecture Improvements
