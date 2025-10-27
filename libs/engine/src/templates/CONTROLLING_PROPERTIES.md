# Controlling Node Properties in Dynamic Children

## Overview

This guide explains how to control node properties (background color, border, ports, behavior) in dynamically generated child nodes using the repeater configuration.

## Three Approaches

### Approach 1: HTML Template with Conditional Styling ✅

**Best for**: Visual properties (colors, borders, text styles)

**How it works**: Use Mustache conditionals in HTML templates

```typescript
const ERDTableWithHTMLStyling: NodeTemplate = {
  id: 'erd-with-html-styling',
  structure: {
    repeater: {
      dataSource: 'columns',
      itemTemplate: {
        type: 'erd-field',
        size: { width: 250, height: 24 },

        // Transparent SVG shape
        shape: {
          type: 'rect',
          fill: 'transparent',
          stroke: 'none',
        },

        // ALL styling in HTML template
        html: {
          mode: 'template',
          template: `
            <div class="field" style="
              width: 100%;
              height: 100%;

              /* Conditional background based on isPrimaryKey */
              background: {{#data.isPrimaryKey}}#e3f2fd{{/data.isPrimaryKey}}{{^data.isPrimaryKey}}#ffffff{{/data.isPrimaryKey}};

              /* Conditional border based on isForeignKey */
              border-left: {{#data.isForeignKey}}4px solid #4caf50{{/data.isForeignKey}}{{^data.isForeignKey}}none{{/data.isForeignKey}};

              /* Conditional font-weight */
              font-weight: {{#data.isPrimaryKey}}600{{/data.isPrimaryKey}}{{^data.isPrimaryKey}}400{{/data.isPrimaryKey}};

              padding: 4px 8px;
              display: flex;
              align-items: center;
              gap: 6px;
            ">
              <span class="icon">
                {{#data.isPrimaryKey}}🔑{{/data.isPrimaryKey}}
                {{#data.isForeignKey}}{{^data.isPrimaryKey}}🔗{{/data.isPrimaryKey}}{{/data.isForeignKey}}
              </span>
              <span style="flex: 1;">{{data.name}}</span>
              <span style="color: #666;">{{data.dataType}}</span>
            </div>
          `
        },

        ports: {
          enabled: true,
          left: { enabled: true },
          right: { enabled: true }
        }
      }
    }
  }
};
```

**Usage**:
```typescript
const table = nodeFactory.createFromTemplate('erd-with-html-styling', {
  tableName: 'users',
  columns: [
    { name: 'id', dataType: 'INT', isPrimaryKey: true },      // Blue background
    { name: 'user_id', dataType: 'INT', isForeignKey: true }, // Green left border
    { name: 'email', dataType: 'VARCHAR(255)' },              // White background
  ]
});
```

**Pros**:
- ✅ Fully declarative
- ✅ Works today
- ✅ Any number of conditions
- ✅ Complex conditional logic

**Cons**:
- ⚠️ HTML-only (no SVG shape properties)
- ⚠️ Verbose template syntax

---

### Approach 2: Property Bindings (NEW - Implemented!) ✅

**Best for**: SVG shape properties (fill, stroke, strokeWidth)

**How it works**: Use `propertyBindings` to map data values to properties

```typescript
const ERDTableWithPropertyBindings: NodeTemplate = {
  id: 'erd-with-property-bindings',
  structure: {
    repeater: {
      dataSource: 'columns',
      itemTemplate: {
        type: 'erd-field',
        size: { width: 250, height: 24 },

        // Base shape (will be overridden by propertyBindings)
        shape: {
          type: 'rect',
          fill: '#ffffff',
          stroke: '#e0e0e0',
          strokeWidth: 1,
        },

        // DATA-DRIVEN PROPERTIES ✨
        propertyBindings: {
          shape: {
            // Conditional fill: Primary key → Blue, Regular → White
            fill: {
              source: 'data.isPrimaryKey',
              map: {
                'true': '#e3f2fd',
                'false': '#ffffff',
              },
              default: '#ffffff',
            },

            // Conditional stroke: Foreign key → Green, Regular → Gray
            stroke: {
              source: 'data.isForeignKey',
              map: {
                'true': '#4caf50',
                'false': '#e0e0e0',
              },
              default: '#e0e0e0',
            },

            // Conditional strokeWidth
            strokeWidth: {
              source: 'data.isPrimaryKey',
              map: {
                'true': 2,
                'false': 1,
              },
              default: 1,
            },
          },

          // You can also bind behavior properties
          behavior: {
            selectable: {
              source: 'data.isEditable',
              map: {
                'true': true,
                'false': false,
              },
              default: false,
            }
          }
        },

        html: {
          mode: 'template',
          template: `
            <div class="field">
              <span>{{#data.isPrimaryKey}}🔑{{/data.isPrimaryKey}}</span>
              <span>{{data.name}}</span>
              <span>{{data.dataType}}</span>
            </div>
          `
        },

        ports: {
          enabled: true,
          left: { enabled: true },
          right: { enabled: true }
        }
      }
    }
  }
};
```

**Usage**:
```typescript
const table = nodeFactory.createFromTemplate('erd-with-property-bindings', {
  tableName: 'users',
  columns: [
    { name: 'id', dataType: 'INT', isPrimaryKey: true },
    // → shape.fill = '#e3f2fd', shape.strokeWidth = 2

    { name: 'user_id', dataType: 'INT', isForeignKey: true },
    // → shape.stroke = '#4caf50'

    { name: 'email', dataType: 'VARCHAR(255)' },
    // → shape.fill = '#ffffff', shape.stroke = '#e0e0e0'
  ]
});
```

**Pros**:
- ✅ Controls SVG shape properties
- ✅ Declarative
- ✅ Clean syntax
- ✅ Works with any property

**Cons**:
- ⚠️ Limited to mapped values (not expressions)
- ⚠️ Cannot bind port configurations (yet)

---

### Approach 3: Multi-Value Property Bindings

**Best for**: Complex conditional logic with many states

```typescript
const ERDTableMultiState: NodeTemplate = {
  id: 'erd-multi-state',
  structure: {
    repeater: {
      dataSource: 'columns',
      itemTemplate: {
        type: 'erd-field',

        shape: {
          type: 'rect',
          fill: '#ffffff',
          stroke: '#e0e0e0',
        },

        propertyBindings: {
          shape: {
            // Use computed field type for complex logic
            fill: {
              source: 'data.fieldType', // 'pk' | 'fk' | 'nullable' | 'regular'
              map: {
                'pk': '#e3f2fd',           // Primary key: Blue
                'fk': '#c8e6c9',           // Foreign key: Green
                'nullable': '#f5f5f5',     // Nullable: Light gray
                'regular': '#ffffff',      // Regular: White
                'unique': '#fff3cd',       // Unique: Yellow
                'indexed': '#e1bee7',      // Indexed: Purple
              },
              default: '#ffffff',
            },

            stroke: {
              source: 'data.fieldType',
              map: {
                'pk': '#2196f3',
                'fk': '#4caf50',
                'nullable': '#9e9e9e',
                'regular': '#e0e0e0',
                'unique': '#ffc107',
                'indexed': '#9c27b0',
              },
              default: '#e0e0e0',
            },
          }
        },

        html: {
          mode: 'template',
          template: `<div>{{data.name}}</div>`
        }
      }
    }
  }
};
```

**Usage**:
```typescript
const table = nodeFactory.createFromTemplate('erd-multi-state', {
  tableName: 'users',
  columns: [
    { name: 'id', dataType: 'INT', fieldType: 'pk' },        // Blue
    { name: 'user_id', dataType: 'INT', fieldType: 'fk' },   // Green
    { name: 'email', dataType: 'VARCHAR', fieldType: 'unique' }, // Yellow
    { name: 'bio', dataType: 'TEXT', fieldType: 'nullable' },    // Light gray
  ]
});
```

---

## Property Binding Configuration

### Syntax

```typescript
propertyBindings: {
  shape: {
    [propertyName]: {
      source: 'data.fieldName',  // Path to data field
      map: {                     // Value mapping
        [sourceValue]: targetValue
      },
      default: defaultValue      // Fallback value
    }
  }
}
```

### Supported Properties

#### Shape Properties
```typescript
propertyBindings: {
  shape: {
    fill: { source: 'data.isPrimaryKey', map: {...} },
    stroke: { source: 'data.isForeignKey', map: {...} },
    strokeWidth: { source: 'data.isImportant', map: {...} },
    opacity: { source: 'data.isVisible', map: {...} },
    cornerRadius: { source: 'data.style', map: {...} },
  }
}
```

#### Behavior Properties
```typescript
propertyBindings: {
  behavior: {
    draggable: { source: 'data.isLocked', map: { 'true': false, 'false': true } },
    selectable: { source: 'data.isSelectable', map: {...} },
    connectable: { source: 'data.canConnect', map: {...} },
  }
}
```

### Data Source Paths

Supports nested paths:
```typescript
propertyBindings: {
  shape: {
    fill: {
      source: 'data.meta.style.color',  // Nested path
      map: {...}
    }
  }
}
```

---

## Complete Example: ERD Table with All Features

```typescript
const ComprehensiveERDTable: NodeTemplate = {
  id: 'comprehensive-erd-table',
  version: '1.0.0',
  meta: {
    name: 'Comprehensive ERD Table',
    description: 'Full-featured ERD with conditional properties',
    category: 'erd',
  },
  structure: {
    type: 'erd-container',
    size: { width: 300, height: 400 },

    shape: {
      fill: '#ffffff',
      stroke: '#6b7280',
      strokeWidth: 2,
      cornerRadius: 4,
    },

    ports: { enabled: false },

    layout: {
      direction: 'column',
      gap: 0,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    },

    // Static header
    children: [
      {
        type: 'erd-header',
        size: { width: 300, height: 36 },
        shape: {
          fill: '#f3f4f6',
          stroke: 'none',
        },
        html: {
          mode: 'template',
          template: `
            <div class="header" style="
              width: 100%;
              height: 100%;
              padding: 8px;
              font-weight: 600;
              font-size: 14px;
              display: flex;
              align-items: center;
              gap: 6px;
              border-bottom: 1px solid #d1d5db;
            ">
              <span>🔑</span>
              <span>{{data.tableName}}</span>
            </div>
          `
        },
        ports: { enabled: false },
      }
    ],

    // Dynamic fields with conditional properties
    repeater: {
      dataSource: 'columns',
      keyField: 'name',
      itemTemplate: {
        type: 'erd-field',
        size: { width: 300, height: 28 },

        shape: {
          type: 'rect',
          fill: '#ffffff',
          stroke: '#e0e0e0',
        },

        // CONDITIONAL PROPERTIES
        propertyBindings: {
          shape: {
            fill: {
              source: 'data.isPrimaryKey',
              map: {
                'true': '#e3f2fd',
                'false': '#ffffff',
              },
            },
            stroke: {
              source: 'data.isForeignKey',
              map: {
                'true': '#4caf50',
                'false': '#e0e0e0',
              },
            },
            strokeWidth: {
              source: 'data.isPrimaryKey',
              map: {
                'true': 2,
                'false': 1,
              },
            },
          },
        },

        html: {
          mode: 'template',
          template: `
            <div class="field" style="
              width: 100%;
              height: 100%;
              padding: 6px 12px;
              display: flex;
              align-items: center;
              gap: 8px;
              font-size: 13px;
            ">
              <span style="width: 16px;">
                {{#data.isPrimaryKey}}🔑{{/data.isPrimaryKey}}
                {{#data.isForeignKey}}{{^data.isPrimaryKey}}🔗{{/data.isPrimaryKey}}{{/data.isForeignKey}}
              </span>
              <span style="flex: 1; font-weight: {{#data.isPrimaryKey}}600{{/data.isPrimaryKey}}{{^data.isPrimaryKey}}400{{/data.isPrimaryKey}};">
                {{data.name}}
              </span>
              <span style="color: #71717a; font-size: 11px; font-family: monospace;">
                {{data.dataType}}
              </span>
              {{#data.isNullable}}<span style="color: #9e9e9e; font-size: 10px;">NULL</span>{{/data.isNullable}}
            </div>
          `
        },

        behavior: {
          draggable: false,
          selectable: false,
        },

        ports: {
          enabled: true,
          left: { enabled: true, type: 'input' },
          right: { enabled: true, type: 'output' },
        },
      }
    }
  },

  defaultData: {
    tableName: 'Table',
    columns: [],
  }
};

// USAGE
const usersTable = nodeFactory.createFromTemplate('comprehensive-erd-table', {
  tableName: 'users',
  columns: [
    {
      name: 'id',
      dataType: 'INT',
      isPrimaryKey: true,
      isForeignKey: false,
      isNullable: false
    },
    // → Blue background (#e3f2fd), 2px border

    {
      name: 'role_id',
      dataType: 'INT',
      isPrimaryKey: false,
      isForeignKey: true,
      isNullable: false
    },
    // → Green border (#4caf50)

    {
      name: 'email',
      dataType: 'VARCHAR(255)',
      isPrimaryKey: false,
      isForeignKey: false,
      isNullable: false
    },
    // → White background, gray border

    {
      name: 'bio',
      dataType: 'TEXT',
      isPrimaryKey: false,
      isForeignKey: false,
      isNullable: true
    },
    // → White background, shows "NULL" badge
  ]
}, { x: 100, y: 100 });
```

---

## Summary

| Approach | Use For | Pros | Cons |
|----------|---------|------|------|
| **HTML Conditionals** | Visual styling | Fully declarative, works today | HTML-only |
| **Property Bindings** | SVG properties | Clean, controls shape/behavior | Limited to mapping |
| **Post-Processing** | Complex logic | Full control | Imperative, not declarative |

**Recommendation**: Use **HTML conditionals** for most cases, add **Property Bindings** when you need SVG shape control.
