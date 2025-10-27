# Dynamic Data Rendering Guide

This guide explains the two complementary approaches for rendering dynamic lists of data in your diagram templates.

## Table of Contents

1. [Quick Decision Guide](#quick-decision-guide)
2. [Approach 1: HTML Templates with `:loop`](#approach-1-html-templates-with-loop)
3. [Approach 2: NodeModel Repeater](#approach-2-nodemodel-repeater)
4. [Comparison Matrix](#comparison-matrix)
5. [Real-World Examples](#real-world-examples)
6. [Hybrid Approach](#hybrid-approach)
7. [Best Practices](#best-practices)

---

## Quick Decision Guide

### Use HTML `:loop` when:
- ✅ Pure visualization (dashboards, logs, reports)
- ✅ No item-level interaction needed
- ✅ Performance is critical (100+ items)
- ✅ Data updates frequently
- ✅ Simple read-only display

### Use NodeModel `repeater` when:
- ✅ Items need ports for connections
- ✅ Items should be draggable/selectable
- ✅ Items need complex behavior
- ✅ Items store metadata
- ✅ Field-to-field connections (ERD, class diagrams)

---

## Approach 1: HTML Templates with `:loop`

### Overview

HTML templates with the `:loop` attribute render arrays as HTML elements. This is lightweight, fast, and perfect for display-only content.

### Syntax

```typescript
html: {
  mode: 'template',
  template: `
    <div :loop="\${this.data.items}">
      <div class="item">
        <span>{{self.name}}</span>
        <span>{{self.value}}</span>
      </div>
    </div>
  `
}
```

### How It Works

1. The `:loop` attribute references an array in `node.data`
2. The element's inner HTML is used as a template
3. The template is rendered once for each item
4. Inside `:loop`, use `{{self.property}}` to access item data
5. You can still access parent data with `{{data.property}}`

### Complete Example

```typescript
const dashboardMetrics: NodeTemplate = {
  id: 'dashboard-metrics',
  version: '1.0.0',
  meta: {
    name: 'Dashboard Metrics',
    category: 'dashboard',
  },
  structure: {
    type: 'dashboard-card',
    size: { width: 400, height: 300 },

    html: {
      mode: 'template',
      template: `
        <div class="dashboard">
          <h3>{{data.title}}</h3>

          <!-- Loop through metrics array -->
          <div class="metrics" :loop="\${this.data.metrics}">
            <div class="metric-card">
              <div class="metric-label">{{self.label}}</div>
              <div class="metric-value">{{self.value}}</div>

              <!-- Conditional rendering within loop -->
              <div class="trend {{#self.isPositive}}up{{/self.isPositive}}{{^self.isPositive}}down{{/self.isPositive}}">
                {{self.change}}
              </div>
            </div>
          </div>
        </div>
      `
    },

    // Container-level port (not per-item)
    ports: {
      enabled: true,
      right: { enabled: true }
    }
  },
  defaultData: {
    title: 'Sales Overview',
    metrics: [
      { label: 'Revenue', value: '$1.2M', change: '+12%', isPositive: true },
      { label: 'Orders', value: '3,456', change: '+8%', isPositive: true },
      { label: 'Avg Order', value: '$347', change: '-2%', isPositive: false },
    ]
  }
};
```

### Usage

```typescript
const node = nodeFactory.createFromTemplate('dashboard-metrics', {
  title: 'Q4 Sales',
  metrics: [
    { label: 'Revenue', value: '$1.5M', change: '+20%', isPositive: true },
    { label: 'Orders', value: '4,200', change: '+15%', isPositive: true },
  ]
}, { x: 100, y: 100 });
```

### Pros

- ✅ **Lightweight**: No NodeModel overhead per item
- ✅ **Fast**: Excellent performance with 100+ items
- ✅ **Simple**: Just HTML and data binding
- ✅ **Reactive**: Data updates automatically reflect (with LemonadeJS)

### Cons

- ❌ **No item ports**: Cannot connect to individual items
- ❌ **No item interaction**: Items aren't draggable/selectable individually
- ❌ **Display-only**: Suitable for visualization, not complex interactions

---

## Approach 2: NodeModel Repeater

### Overview

The `repeater` configuration creates actual `NodeModel` instances for each item in an array. Each item becomes a full diagram node with ports, behavior, and metadata.

### Syntax

```typescript
structure: {
  type: 'container',
  repeater: {
    dataSource: 'items',      // Path to array in node.data
    keyField: 'id',            // Optional: field for unique keys
    itemTemplate: {
      type: 'item-node',
      size: { width: 100, height: 50 },
      ports: {
        enabled: true,
        left: { enabled: true, type: 'input' },
        right: { enabled: true, type: 'output' }
      }
    }
  }
}
```

### How It Works

1. NodeFactory reads the `repeater` configuration
2. Gets the array from `node.data[dataSource]`
3. For each item, creates a NodeModel using `itemTemplate`
4. Merges parent data + item data for each child
5. Adds helper properties (`_index`, `_isFirst`, `_isLast`, `_total`, `_key`)
6. Applies layout to position children

### Complete Example

```typescript
const erdTable: NodeTemplate = {
  id: 'erd-table-dynamic',
  version: '1.0.0',
  meta: {
    name: 'ERD Table',
    category: 'erd',
  },
  structure: {
    type: 'erd-container',
    size: { width: 250, height: 200 },

    ports: { enabled: false }, // No ports on container

    layout: {
      direction: 'column',
      gap: 0,
      padding: { top: 0, right: 0, bottom: 0, left: 0 }
    },

    // Static header child
    children: [
      {
        type: 'erd-header',
        size: { width: 250, height: 32 },
        html: {
          mode: 'template',
          template: `
            <div class="erd-header">
              <span>🔑</span>
              <span>{{data.tableName}}</span>
            </div>
          `
        },
        ports: { enabled: false }
      }
    ],

    // Dynamic field children
    repeater: {
      dataSource: 'columns',
      keyField: 'name',
      itemTemplate: {
        type: 'erd-field',
        size: { width: 250, height: 24 },

        html: {
          mode: 'template',
          template: `
            <div class="erd-field">
              <span>{{#data.isPrimaryKey}}🔑{{/data.isPrimaryKey}}</span>
              <span>{{data.name}}</span>
              <span>{{data.dataType}}</span>
            </div>
          `
        },

        behavior: {
          draggable: false,
          selectable: false,
        },

        // CRITICAL: Each field has its own ports
        ports: {
          enabled: true,
          left: { enabled: true, type: 'input' },
          right: { enabled: true, type: 'output' }
        }
      }
    }
  },
  defaultData: {
    tableName: 'users',
    columns: []
  }
};
```

### Usage

```typescript
const table = nodeFactory.createFromTemplate('erd-table-dynamic', {
  tableName: 'users',
  columns: [
    { name: 'id', dataType: 'INT', isPrimaryKey: true },
    { name: 'email', dataType: 'VARCHAR(255)' },
    { name: 'name', dataType: 'VARCHAR(100)' }
  ]
}, { x: 100, y: 100 });

// Result: 1 container + 1 header + 3 field nodes (each with ports)
console.log(table.children.size); // 4

// You can now connect fields to other fields
const userIdField = diagram.getNode(table.children[1]);
const orderUserIdField = diagram.getNode(ordersTable.children[2]);

// Create link between fields
const link = new LinkModel({
  sourcePortId: userIdField.getPorts()[1].id, // right port
  targetPortId: orderUserIdField.getPorts()[0].id, // left port
});
diagram.addLink(link);
```

### Helper Metadata

Each repeater item automatically receives:

```typescript
{
  ...itemData,         // All item properties
  _index: 0,           // Index in array (0-based)
  _isFirst: true,      // true for first item
  _isLast: false,      // true for last item
  _total: 5,           // Total number of items
  _key: 'unique-id',   // Value from keyField or index
}
```

### Pros

- ✅ **Full NodeModel**: Each item is a real diagram node
- ✅ **Item ports**: Can connect to/from individual items
- ✅ **Interactive**: Items can be selected, dragged (if configured)
- ✅ **Metadata**: Each item stores its own data and metadata
- ✅ **Proper ERD semantics**: Field-to-field connections

### Cons

- ⚠️ **Performance overhead**: Creates NodeModel instance per item
- ⚠️ **Complexity**: More moving parts than HTML :loop

---

## Comparison Matrix

| Feature | HTML `:loop` | NodeModel `repeater` |
|---------|-------------|---------------------|
| **Display list of data** | ✅ Best choice | ✅ Works but overhead |
| **Connect to specific items** | ❌ No | ✅ Yes (ports per item) |
| **Drag individual items** | ❌ No | ✅ Yes |
| **Select individual items** | ❌ No | ✅ Yes |
| **Item-level metadata** | ⚠️ Limited | ✅ Full NodeModel |
| **Performance (100+ items)** | ✅ Excellent | ⚠️ May impact |
| **Declarative definition** | ✅ Yes | ✅ Yes |
| **Real-time data updates** | ✅ Reactive | ✅ Node.setData() |
| **Item-level events** | ⚠️ Event delegation | ✅ Per-node events |
| **Memory footprint** | ✅ Small | ⚠️ NodeModel per item |

---

## Real-World Examples

### Example 1: Dashboard (HTML `:loop`)

**Use Case**: Display sales metrics - no interaction needed

```typescript
const salesDashboard = nodeFactory.createFromTemplate('dashboard-metrics-html', {
  title: 'Sales Overview',
  metrics: [
    { label: 'Revenue', value: '$1.2M', trend: '+12%' },
    { label: 'Orders', value: '3,456', trend: '+8%' },
    { label: 'Customers', value: '2,103', trend: '+15%' },
  ]
});
```

**Why HTML `:loop`?**
- Display-only (no clicks, drags, or connections)
- Many items (could be 50+ metrics)
- Frequent updates (real-time dashboard)
- Lightweight and fast

### Example 2: ERD Table (NodeModel `repeater`)

**Use Case**: Database design tool - connect fields between tables

```typescript
const usersTable = nodeFactory.createFromTemplate('erd-table-dynamic', {
  tableName: 'users',
  columns: [
    { name: 'id', dataType: 'INT', isPrimaryKey: true },
    { name: 'email', dataType: 'VARCHAR(255)' },
  ]
});

const ordersTable = nodeFactory.createFromTemplate('erd-table-dynamic', {
  tableName: 'orders',
  columns: [
    { name: 'id', dataType: 'INT', isPrimaryKey: true },
    { name: 'user_id', dataType: 'INT', isForeignKey: true },
  ]
});

// Connect users.id → orders.user_id
// This requires each field to be a NodeModel with ports!
```

**Why NodeModel `repeater`?**
- Need field-to-field connections
- Each field must have ports
- ERD semantics require NodeModel structure
- Interactive (selecting fields, showing relationships)

### Example 3: Activity Log (HTML `:loop`)

**Use Case**: System event log - just display

```typescript
const log = nodeFactory.createFromTemplate('activity-log-html', {
  activities: [
    { time: '10:45', user: 'John', action: 'deployed' },
    { time: '10:32', user: 'Sarah', action: 'merged PR' },
    { time: '10:15', user: 'Mike', action: 'failed build' },
    // ... 100+ entries
  ]
});
```

**Why HTML `:loop`?**
- Many items (could be 1000+ log entries)
- Scrollable list
- No interaction needed
- Performance critical

### Example 4: Process Flow (NodeModel `repeater`)

**Use Case**: Workflow with steps that connect to each other

```typescript
const workflow = nodeFactory.createFromTemplate('process-flow-dynamic', {
  processName: 'Order Fulfillment',
  steps: [
    { id: 'step1', title: 'Receive Order' },
    { id: 'step2', title: 'Process Payment' },
    { id: 'step3', title: 'Ship Order' },
  ]
});

// Connect steps: step1 → step2 → step3
// Requires each step to have ports
```

**Why NodeModel `repeater`?**
- Steps connect to each other
- Each step needs top/bottom ports
- Interactive (selecting steps, showing flow)
- Step-level metadata and events

---

## Hybrid Approach

Sometimes you need **both**: a container with ports + a visual list inside.

### Example: Department Org Chart

```typescript
const department: NodeTemplate = {
  id: 'department-hybrid',
  structure: {
    type: 'department',

    html: {
      mode: 'template',
      template: `
        <div class="department">
          <h3>{{data.departmentName}}</h3>
          <p>Manager: {{data.managerName}}</p>

          <!-- Employee list using :loop -->
          <div class="employees" :loop="\${this.data.employees}">
            <div class="employee">
              <span>{{self.name}}</span>
              <span>{{self.role}}</span>
            </div>
          </div>
        </div>
      `
    },

    // Department-level ports for org hierarchy
    ports: {
      enabled: true,
      top: { enabled: true },     // Reports to
      bottom: { enabled: true }   // Manages
    }
  }
};
```

**Use Case**: Organization chart where departments connect, but employees are just listed.

**Why hybrid?**
- Departments connect to each other (need ports on container)
- Employees are just displayed (HTML :loop is perfect)
- Best of both worlds

---

## Best Practices

### 1. Choose the Right Tool

Ask yourself:
- Do items need to connect to other items? → **NodeModel `repeater`**
- Is it just a visual list? → **HTML `:loop`**
- Many items (100+)? → **HTML `:loop`**
- Complex item behavior? → **NodeModel `repeater`**

### 2. Optimize Performance

**For HTML `:loop`:**
- Great for large lists (100-1000+ items)
- Use for dashboards, logs, reports
- No performance degradation

**For NodeModel `repeater`:**
- Consider impact with 50+ items
- Each item creates a NodeModel instance
- Good for 5-30 interactive items
- For larger lists, consider pagination or virtualization

### 3. Use Helper Metadata

Repeater items have useful helpers:

```typescript
template: `
  <div class="item">
    <!-- Show item number -->
    Item {{data._index + 1}} of {{data._total}}

    <!-- Different styling for first/last -->
    <div class="
      {{#data._isFirst}}first-item{{/data._isFirst}}
      {{#data._isLast}}last-item{{/data._isLast}}
    ">
      {{data.name}}
    </div>
  </div>
`
```

### 4. Nested Paths

Both approaches support nested data paths:

```typescript
// HTML :loop
template: `<div :loop="\${this.data.schema.tables}">...</div>`

// NodeModel repeater
repeater: {
  dataSource: 'schema.tables'
}
```

### 5. Combine Static and Dynamic

You can have both static children and repeater:

```typescript
structure: {
  children: [
    { type: 'header' },  // Static
    { type: 'footer' }   // Static
  ],
  repeater: {
    dataSource: 'items'  // Dynamic items in between
  }
}
```

### 6. Empty Arrays

Both approaches handle empty arrays gracefully:

```typescript
// HTML :loop - renders nothing
<div :loop="\${this.data.items}">...</div>

// NodeModel repeater - creates no children
repeater: { dataSource: 'items' }
```

---

## Migration Guide

### From Imperative to HTML `:loop`

**Before:**
```typescript
component.ts:
this.data.items.forEach(item => {
  const html = `<div>${item.name}</div>`;
  // Append to DOM...
});
```

**After:**
```typescript
template: `
  <div :loop="\${this.data.items}">
    <div>{{self.name}}</div>
  </div>
`
```

### From Imperative to NodeModel `repeater`

**Before:**
```typescript
component.ts:
table.columns.forEach(column => {
  const field = nodeFactory.createFromTemplate('erd-field', column);
  field.setParent(table.id);
  table.addChild(field.id);
});
```

**After:**
```typescript
template:
{
  repeater: {
    dataSource: 'columns',
    itemTemplate: { type: 'erd-field', ... }
  }
}
```

---

## Summary

| Scenario | Recommended Approach |
|----------|---------------------|
| Dashboard with metrics | HTML `:loop` |
| ERD table with fields | NodeModel `repeater` |
| Activity log (100+ entries) | HTML `:loop` |
| Process flow (5-10 steps) | NodeModel `repeater` |
| Org chart departments | NodeModel `repeater` |
| Org chart employees within dept | HTML `:loop` (hybrid) |
| Product catalog display | HTML `:loop` |
| Class diagram with methods | NodeModel `repeater` |

**Golden Rule**: If you need to **connect to individual items**, use NodeModel `repeater`. Otherwise, use HTML `:loop` for better performance.

---

## Further Reading

- [NodeTemplate API Documentation](./NodeTemplate.ts)
- [Template Library Examples](../template-library/dynamic-rendering-examples.ts)
- [LemonadeJS Documentation](https://lemonadejs.com)
- [ERD Template Examples](../template-library/erd-templates.ts)
