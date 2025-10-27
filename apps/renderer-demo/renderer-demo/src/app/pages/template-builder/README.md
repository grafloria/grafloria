# Template Builder

An advanced node template editor for creating and editing Grafloria diagram templates with live preview and validation.

## Features

### Core Functionality
- **JSON Template Editor**: Edit node templates with syntax highlighting
- **Live Preview**: See changes in real-time with interactive diagram preview
- **Template Library**: 6+ pre-built templates organized by category
- **Performance Monitoring**: Real-time metrics and optimization suggestions
- **Undo/Redo**: Full history with 100 entry limit
- **Auto-Save**: Automatic save to localStorage every 30 seconds
- **Import/Export**: Save and load templates as JSON files

### UI Components

#### Left Sidebar - Template Library
- Browse pre-built templates
- Filter by category (Basic, Database, Workflow, Dashboard)
- Search by name, description, or tags
- One-click template loading

#### Center Panel - JSON Editor
- Dark theme code editor
- Format JSON button
- Tab key for indentation
- Real-time validation

#### Right Panel - Live Preview
- Interactive diagram canvas
- Zoom controls (in, out, reset, fit to view)
- Pan and navigate preview
- Error display when JSON is invalid

#### Bottom Panel - Performance Metrics
- Performance score (0-100)
- Render time measurement
- DOM node count
- Warnings and recommendations

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Z` | Undo last change |
| `Ctrl+Y` | Redo last undone change |
| `Ctrl+S` | Save template |
| `Ctrl+L` | Toggle library sidebar |
| `Ctrl+Shift+P` | Toggle performance panel |

## Getting Started

### 1. Access the Template Builder
Navigate to `/template-builder` in your browser.

### 2. Select a Template
Click any template in the sidebar to load it, or start with the default template.

### 3. Edit the Template
Modify the JSON in the center panel. The preview updates automatically.

### 4. Monitor Performance
Check the bottom panel for performance metrics and optimization suggestions.

### 5. Save Your Work
Use `Ctrl+S` to save, or use the Export button to download as JSON.

## Template Structure

A basic NodeTemplate has the following structure:

```json
{
  "id": "my-template",
  "version": "1.0.0",
  "meta": {
    "name": "My Template",
    "category": "custom",
    "description": "A custom node template",
    "tags": ["custom"]
  },
  "structure": {
    "type": "custom",
    "size": { "width": 200, "height": 100 },
    "shape": { "type": "rect", "borderRadius": 8 },
    "behavior": {
      "draggable": true,
      "selectable": true
    }
  },
  "dataSchema": {
    "type": "object",
    "properties": {
      "label": { "type": "string" }
    }
  },
  "defaultData": {
    "label": "New Node"
  }
}
```

## Available Templates

### Basic Shapes
- **Rectangle**: Simple rectangular node
- **Circle**: Circular node
- **Diamond**: Diamond-shaped decision node

### Database (ERD)
- **ERD Table**: Database table with header styling

### Workflow
- **Workflow Task**: Task node with status indicator

### Dashboard
- **Dashboard Card**: Dashboard widget with metrics display

## Performance Guidelines

### Target Metrics
- **Render Time**: < 16ms (60 FPS)
- **DOM Nodes**: < 100 nodes
- **Performance Score**: > 80

### Optimization Tips
1. Keep HTML structure simple
2. Minimize CSS complexity
3. Avoid excessive nesting
4. Use CSS containment when possible
5. Limit the number of ports

## Architecture

```
template-builder/
├── template-builder.component.ts    # Main orchestrator
├── services/
│   ├── template-editor.service.ts   # State management
│   ├── template-library.service.ts  # Template presets
│   ├── undo-redo.service.ts         # History management
│   └── performance-monitor.service.ts # Performance tracking
└── components/
    ├── json-editor/                 # JSON editing
    ├── preview-panel/               # Live preview
    ├── template-library/            # Template sidebar
    └── performance-panel/           # Metrics display
```

## Future Enhancements

### Phase 2 (Planned)
- Monaco Editor integration for advanced editing
- HTML layer editor
- CSS layer editor
- Real-time validation with inline errors
- JSON Schema autocomplete

### Phase 3 (Future)
- Smart defaults engine
- AI-powered template generation
- Template marketplace
- Collaborative editing
- Visual template builder

## Troubleshooting

### Preview not updating?
- Check if JSON is valid (look for red validation dot in header)
- Click the refresh button in the preview panel
- Try reformatting the JSON

### Performance warnings?
- Reduce DOM complexity in HTML layer
- Simplify CSS rules
- Check node count (target: < 100)

### Lost your work?
- Check auto-save: Work is saved every 30 seconds
- Reload the page to restore from auto-save
- Auto-save persists for 24 hours

## API Reference

### Services

#### TemplateEditorService
- `getState()`: Get current editor state
- `updateJson(json)`: Update JSON content
- `loadTemplate(template)`: Load a template
- `save()`: Save template
- `reset()`: Reset to default

#### TemplateLibraryService
- `getAllPresets()`: Get all templates
- `getPresetsByCategory(category)`: Filter by category
- `searchPresets(query)`: Search templates

#### UndoRedoService
- `undo()`: Undo last change
- `redo()`: Redo last undone change
- `pushState(...)`: Add to history
- `jumpTo(index)`: Jump to specific state

#### PerformanceMonitorService
- `startMeasure(name)`: Start performance measurement
- `endMeasure(name, container)`: End measurement
- `getMetrics()`: Get current metrics

## Contributing

To add a new template preset:

1. Open `services/template-library.service.ts`
2. Add a new entry to the `presets` array
3. Create the template factory method
4. Optionally add HTML/CSS layers

Example:
```typescript
{
  id: 'my-preset',
  name: 'My Preset',
  category: 'custom',
  description: 'My custom template',
  tags: ['custom'],
  template: this.createMyTemplate()
}
```

## License

Part of the Grafloria project.
