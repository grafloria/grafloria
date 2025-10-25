# Template Library (Phase 4)

A comprehensive collection of 20+ pre-built node templates for rapid diagram development.

## Overview

The Template Library provides ready-to-use node templates organized into three categories:

- **Common** (6 templates): User avatars, cards, buttons, inputs, badges, icons
- **Workflow** (7 templates): Process steps, decisions, gateways, activities, events
- **Data Visualization** (7 templates): Metrics, gauges, charts, tables, progress bars

## Quick Start

```typescript
import { TemplateLibrary, CommonTemplates } from '@grafloria/engine';

// Get a template by ID
const template = TemplateLibrary.get('user-avatar');

// Or use direct imports
const cardTemplate = CommonTemplates.CardNode;
```

## Template Registry

The central `TemplateLibrary` provides powerful discovery and search:

```typescript
// List all templates
const allTemplates = TemplateLibrary.getAll(); // 20 templates

// Get by category
const workflowTemplates = TemplateLibrary.getByCategory('workflow'); // 7 templates

// Search by text
const processTemplates = TemplateLibrary.search('process'); // ['process-step', ...]

// Find by tags
const bpmnTemplates = TemplateLibrary.findByTag('bpmn'); // BPMN-compatible templates

// Check existence
if (TemplateLibrary.has('metric-card')) {
  const template = TemplateLibrary.get('metric-card');
}
```

## Common Templates

### User Avatar

Circular node for displaying user information with status indicator.

```typescript
import { CommonTemplates } from '@grafloria/engine';

const template = CommonTemplates.UserAvatar;
// Template properties:
// - id: 'user-avatar'
// - Shape: Circle (100x100)
// - Events: click, mouseenter, mouseleave
// - Data: name, avatarUrl, status (online/offline/away/busy)
```

### Card Node

Flexible card layout for content and actions.

```typescript
const template = CommonTemplates.CardNode;
// Template properties:
// - id: 'card-node'
// - Shape: Rectangle with rounded corners (250x150)
// - Events: click, dblclick
// - Data: title, description, meta
```

### Button Node

Clickable button with icon and label.

```typescript
const template = CommonTemplates.ButtonNode;
// Template properties:
// - id: 'button-node'
// - Shape: Small rectangle (120x40)
// - Events: click, mouseenter, mouseleave
// - Data: label, icon, variant
```

### Input Field

Text input field with label.

```typescript
const template = CommonTemplates.InputField;
// Template properties:
// - id: 'input-field'
// - Shape: Rectangle (200x60)
// - Events: input, focus, blur
// - Data: label, placeholder, value, type
```

### Badge Label

Small status badge or label.

```typescript
const template = CommonTemplates.BadgeLabel;
// Template properties:
// - id: 'badge-label'
// - Shape: Rounded rectangle (80x30)
// - Events: click
// - Data: text, variant (success/warning/error/info)
```

### Icon Node

Icon-based node with tooltip.

```typescript
const template = CommonTemplates.IconNode;
// Template properties:
// - id: 'icon-node'
// - Shape: Circle (60x60)
// - Events: click, mouseenter
// - Data: icon, tooltip
```

## Workflow Templates

### Process Step

Standard process box for flowcharts.

```typescript
import { WorkflowTemplates } from '@grafloria/engine';

const template = WorkflowTemplates.ProcessStep;
// Template properties:
// - id: 'process-step'
// - Shape: Rectangle (180x80)
// - Events: click, dblclick
// - Data: title, description, duration, owner
// - Ports: All 4 sides enabled
```

### Decision Node

Diamond-shaped decision point for branching logic.

```typescript
const template = WorkflowTemplates.DecisionNode;
// Template properties:
// - id: 'decision-node'
// - Shape: Diamond (120x120)
// - Events: click, dblclick
// - Data: question, type (boolean/multi-choice)
// - Ports: All 4 vertices
```

### Start Event

Circle node marking the start of a workflow.

```typescript
const template = WorkflowTemplates.StartEvent;
// Template properties:
// - id: 'start-event'
// - Shape: Circle (60x60)
// - Events: click
// - Data: label, trigger (manual/scheduled/event)
// - Ports: Right and bottom
```

### End Event

Circle node marking the end of a workflow.

```typescript
const template = WorkflowTemplates.EndEvent;
// Template properties:
// - id: 'end-event'
// - Shape: Circle (60x60)
// - Events: click
// - Data: label, result (success/failure/cancel)
// - Ports: Top and left
```

### Subprocess

Subprocess or grouped activity.

```typescript
const template = WorkflowTemplates.Subprocess;
// Template properties:
// - id: 'subprocess'
// - Shape: Rounded rectangle (200x100)
// - Events: click, dblclick (for expanding)
// - Data: title, stepCount, collapsed
// - Ports: All 4 sides
```

### Gateway

Gateway for splitting/joining workflow paths.

```typescript
const template = WorkflowTemplates.Gateway;
// Template properties:
// - id: 'gateway'
// - Shape: Diamond (80x80)
// - Events: click
// - Data: type (parallel/exclusive/inclusive), icon
// - Ports: All 4 vertices
```

### Activity

Activity or task in a workflow.

```typescript
const template = WorkflowTemplates.Activity;
// Template properties:
// - id: 'activity'
// - Shape: Rectangle (160x70)
// - Events: click, dblclick
// - Data: name, icon, type (user/service/script), assignee
// - Ports: All 4 sides
```

## Data Visualization Templates

### Metric Card

Display key metrics with trends.

```typescript
import { DataVizTemplates } from '@grafloria/engine';

const template = DataVizTemplates.MetricCard;
// Template properties:
// - id: 'metric-card'
// - Shape: Rectangle (220x120)
// - Events: click, mouseenter
// - Data: label, value, change, trendDirection, trendIcon
```

### Gauge

Circular gauge for displaying percentage values.

```typescript
const template = DataVizTemplates.Gauge;
// Template properties:
// - id: 'gauge'
// - Shape: Circle (150x150)
// - Events: click
// - Data: label, value, percentage, min, max, color
// - Ports: None
```

### Bar Chart

Simple bar chart for comparing values.

```typescript
const template = DataVizTemplates.BarChart;
// Template properties:
// - id: 'bar-chart'
// - Shape: Rectangle (280x180)
// - Events: click
// - Data: title, bar1-3, label1-3
```

### Data Table

Tabular data display with headers.

```typescript
const template = DataVizTemplates.DataTable;
// Template properties:
// - id: 'data-table'
// - Shape: Rectangle (300x200)
// - Events: click
// - Data: title, col1-3Header, rows
```

### Pie Chart

Circular pie chart for proportions.

```typescript
const template = DataVizTemplates.PieChart;
// Template properties:
// - id: 'pie-chart'
// - Shape: Circle (180x180)
// - Events: click, mouseenter
// - Data: title, segments, total
```

### Stat Counter

Large statistic counter with icon.

```typescript
const template = DataVizTemplates.StatCounter;
// Template properties:
// - id: 'stat-counter'
// - Shape: Rectangle (160x100)
// - Events: click
// - Data: label, value, icon, color
```

### Progress Bar

Horizontal progress indicator.

```typescript
const template = DataVizTemplates.ProgressBar;
// Template properties:
// - id: 'progress-bar'
// - Shape: Rectangle (250x60)
// - Events: click
// - Data: label, percentage, status
```

## Advanced Usage

### Custom Template Registration

Register your own templates:

```typescript
import { registerCustomTemplate } from '@grafloria/engine';

const myTemplate = {
  id: 'my-custom-template',
  structure: {
    type: 'custom',
    size: { width: 200, height: 100 },
    shape: { type: 'rect', cornerRadius: 8 },
    html: {
      mode: 'template',
      template: '<div>{{data.content}}</div>',
      events: { click: 'custom:clicked' },
    },
  },
  defaultData: { content: 'Hello' },
};

registerCustomTemplate(myTemplate, 'common', ['custom']);
```

### Grouping by Category

```typescript
import { getTemplatesByCategory } from '@grafloria/engine';

const grouped = getTemplatesByCategory();
// Returns:
// {
//   common: [UserAvatar, CardNode, ButtonNode, ...],
//   workflow: [ProcessStep, DecisionNode, ...],
//   'data-viz': [MetricCard, Gauge, ...],
//   diagram: []
// }
```

### Template Search

```typescript
// Search by name or description
const results = TemplateLibrary.search('card');
// Returns templates with 'card' in their ID, name, or description

// Search by tag
const dashboardWidgets = TemplateLibrary.findByTag('dashboard');
// Returns all dashboard-related templates

// Get template info
const info = TemplateLibrary.getInfo('user-avatar');
// Returns: { template, category: 'common', tags: ['user', 'avatar', 'profile'] }
```

## Template Properties

All templates include:

- **id**: Unique identifier
- **structure**: Node structure definition
  - **type**: Node type identifier
  - **size**: Default dimensions
  - **shape**: SVG shape configuration (rect/circle/diamond/ellipse/hexagon)
  - **html**: HTML template with LemonadeJS binding
  - **ports**: Port configuration
- **defaultData**: Default data values

## EventBus Integration

All templates with HTML use the EventBus system:

```typescript
import { engine } from './your-engine';

// Subscribe to template events
engine.eventBus.on('user:clicked', (data) => {
  console.log('User clicked:', data.nodeData.name);
});

engine.eventBus.on('card:edited', (data) => {
  console.log('Card double-clicked:', data.nodeId);
});

// Advanced: Debounced events
engine.eventBus.onDebounced('input:changed', 300, (data) => {
  saveToServer(data.nodeData.value);
});

// Advanced: Filtered events
engine.eventBus.onFiltered(
  'button:clicked',
  (data) => data.nodeData.variant === 'primary',
  handlePrimaryButton
);
```

## Shape-Aware Features

Templates leverage the shape-aware system (Phases 3.1-3.5):

1. **Shape Configuration** (Phase 3.1): Geometries defined (rect/circle/diamond/etc.)
2. **Port Positioning** (Phase 3.2): Ports automatically positioned on shape boundaries
3. **Hit Detection** (Phase 3.3): Click detection respects actual shape geometry
4. **HTML Templates** (Phase 3.4): Rich content with LemonadeJS reactivity
5. **Hybrid Rendering** (Phase 3.5): Combined SVG (geometry) + HTML (content)

## Performance

- **Registry**: O(1) lookup by ID
- **Search**: O(n) text search with early exit
- **Tag search**: O(n) with tag indexing
- **Memory**: ~100KB for 20 templates

## Best Practices

1. **Reuse templates**: Don't create custom templates unless necessary
2. **Extend via data**: Use `defaultData` for customization
3. **Event naming**: Follow pattern `entity:action` (e.g., 'user:clicked')
4. **Tag organization**: Use consistent tags for discoverability
5. **Documentation**: Document custom templates if registering them

## Statistics

- **Total Templates**: 20
- **Common**: 6 (User Avatar, Card, Button, Input, Badge, Icon)
- **Workflow**: 7 (Process, Decision, Start, End, Subprocess, Gateway, Activity)
- **Data Viz**: 7 (Metric, Gauge, Bar Chart, Table, Pie Chart, Stat, Progress)
- **Lines of Code**: ~1,500
- **Test Coverage**: 22 tests, 100% passing

## Migration from Custom Nodes

Before (custom nodes):
```typescript
const node = new NodeModel({
  size: { width: 100, height: 80 },
  data: { name: 'User' },
});
```

After (template library):
```typescript
const template = TemplateLibrary.get('user-avatar');
const node = NodeFactory.createFromTemplate(template, {
  data: { name: 'User', status: 'online' },
});
```

Benefits:
- Consistent styling
- Built-in EventBus integration
- Shape-aware features
- Standardized data structure
- Less code to maintain

## See Also

- [Shape System Migration Guide](../../../SHAPE_SYSTEM_MIGRATION_GUIDE.md)
- [LemonadeJS Renderer](../rendering/README.md)
- [EventBus Documentation](../events/README.md)
- [Node Template System](../templates/README.md)
