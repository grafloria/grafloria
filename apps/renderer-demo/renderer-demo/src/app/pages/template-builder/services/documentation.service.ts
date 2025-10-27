import { Injectable } from '@angular/core';

/**
 * Documentation Entry
 * Represents a single property's documentation
 */
export interface DocEntry {
  property: string;
  path: string;
  description: string;
  type: string;
  required: boolean;
  defaultValue?: any;
  examples: string[];
  relatedProperties: string[];
  enumValues?: string[];
  pattern?: string;
  minimum?: number;
  maximum?: number;
}

/**
 * Documentation Service
 *
 * Provides comprehensive documentation for all NodeTemplate properties.
 * Used by the documentation sidebar to show context-aware help.
 *
 * ~300 lines
 */
@Injectable({
  providedIn: 'root'
})
export class DocumentationService {

  private documentation: Map<string, DocEntry> = new Map();

  constructor() {
    this.initializeDocumentation();
  }

  /**
   * Get documentation for a property path
   */
  getDocumentation(path: string): DocEntry | null {
    return this.documentation.get(path) || null;
  }

  /**
   * Search documentation
   */
  search(query: string): DocEntry[] {
    const lowerQuery = query.toLowerCase();
    const results: DocEntry[] = [];

    this.documentation.forEach(entry => {
      if (
        entry.property.toLowerCase().includes(lowerQuery) ||
        entry.description.toLowerCase().includes(lowerQuery) ||
        entry.path.toLowerCase().includes(lowerQuery)
      ) {
        results.push(entry);
      }
    });

    return results;
  }

  /**
   * Get all documentation entries
   */
  getAllEntries(): DocEntry[] {
    return Array.from(this.documentation.values());
  }

  /**
   * Get entries by category
   */
  getEntriesByCategory(category: 'root' | 'meta' | 'structure' | 'shape' | 'html' | 'behavior' | 'layout' | 'ports'): DocEntry[] {
    return this.getAllEntries().filter(entry => entry.path.startsWith(category));
  }

  /**
   * Initialize documentation database
   */
  private initializeDocumentation(): void {
    // Root level properties
    this.addDoc({
      property: 'id',
      path: 'id',
      description: 'Unique template identifier. Use kebab-case naming convention.',
      type: 'string',
      required: true,
      pattern: '^[a-z0-9-]+$',
      examples: [
        '"id": "basic-rectangle"',
        '"id": "erd-table"',
        '"id": "workflow-task"'
      ],
      relatedProperties: ['version', 'meta.name']
    });

    this.addDoc({
      property: 'version',
      path: 'version',
      description: 'Semantic version number for the template.',
      type: 'string',
      required: true,
      pattern: '^\\d+\\.\\d+\\.\\d+$',
      examples: [
        '"version": "1.0.0"',
        '"version": "2.1.3"'
      ],
      relatedProperties: ['id']
    });

    // Meta properties
    this.addDoc({
      property: 'meta',
      path: 'meta',
      description: 'Template metadata for categorization and discovery.',
      type: 'object',
      required: true,
      examples: [
        '{\n  "name": "Basic Rectangle",\n  "category": "basic",\n  "description": "A simple rectangular node"\n}'
      ],
      relatedProperties: ['meta.name', 'meta.category', 'meta.description', 'meta.tags']
    });

    this.addDoc({
      property: 'name',
      path: 'meta.name',
      description: 'Human-readable display name for the template.',
      type: 'string',
      required: true,
      examples: [
        '"name": "Basic Rectangle"',
        '"name": "ERD Table"',
        '"name": "Workflow Task"'
      ],
      relatedProperties: ['meta.description', 'id']
    });

    this.addDoc({
      property: 'category',
      path: 'meta.category',
      description: 'Template category for organization in the library.',
      type: 'enum',
      required: true,
      enumValues: ['basic', 'database', 'workflow', 'dashboard', 'custom'],
      examples: [
        '"category": "basic"',
        '"category": "database"',
        '"category": "workflow"'
      ],
      relatedProperties: ['meta.tags']
    });

    this.addDoc({
      property: 'description',
      path: 'meta.description',
      description: 'Detailed description of the template purpose and usage.',
      type: 'string',
      required: false,
      examples: [
        '"description": "A simple rectangular node for general use"',
        '"description": "Database table for ERD diagrams with field rows"'
      ],
      relatedProperties: ['meta.name', 'meta.tags']
    });

    this.addDoc({
      property: 'tags',
      path: 'meta.tags',
      description: 'Searchable tags for template discovery.',
      type: 'array',
      required: false,
      examples: [
        '"tags": ["shape", "basic"]',
        '"tags": ["database", "table", "erd"]'
      ],
      relatedProperties: ['meta.category']
    });

    // Structure properties
    this.addDoc({
      property: 'structure',
      path: 'structure',
      description: 'Node structure and appearance configuration.',
      type: 'object',
      required: true,
      examples: [
        '{\n  "type": "custom",\n  "size": { "width": 200, "height": 100 },\n  "shape": { ... }\n}'
      ],
      relatedProperties: ['structure.type', 'structure.size', 'structure.shape']
    });

    this.addDoc({
      property: 'type',
      path: 'structure.type',
      description: 'Node type identifier for the diagram engine.',
      type: 'string',
      required: true,
      examples: [
        '"type": "custom"',
        '"type": "erd-table"',
        '"type": "workflow-task"'
      ],
      relatedProperties: ['id', 'structure.role']
    });

    this.addDoc({
      property: 'role',
      path: 'structure.role',
      description: 'Node role in parent-child hierarchy.',
      type: 'enum',
      required: false,
      enumValues: ['container', 'content', 'drag-handler'],
      examples: [
        '"role": "container"  // Parent node that contains children',
        '"role": "content"    // Child node with content',
        '"role": "drag-handler"  // Child that acts as drag handle'
      ],
      relatedProperties: ['structure.children', 'structure.layout', 'behavior.dragHandler']
    });

    // Size properties
    this.addDoc({
      property: 'size',
      path: 'structure.size',
      description: 'Node dimensions in pixels.',
      type: 'object',
      required: true,
      examples: [
        '"size": { "width": 200, "height": 100 }',
        '"size": { "width": 250, "height": 150 }'
      ],
      relatedProperties: ['structure.size.width', 'structure.size.height']
    });

    this.addDoc({
      property: 'width',
      path: 'structure.size.width',
      description: 'Width in pixels.',
      type: 'number',
      required: true,
      minimum: 10,
      maximum: 2000,
      examples: [
        '"width": 200',
        '"width": 250',
        '"width": 300'
      ],
      relatedProperties: ['structure.size.height']
    });

    this.addDoc({
      property: 'height',
      path: 'structure.size.height',
      description: 'Height in pixels.',
      type: 'number',
      required: true,
      minimum: 10,
      maximum: 2000,
      examples: [
        '"height": 100',
        '"height": 150',
        '"height": 200'
      ],
      relatedProperties: ['structure.size.width']
    });

    // Shape properties
    this.addDoc({
      property: 'shape',
      path: 'structure.shape',
      description: 'SVG shape configuration for the node background.',
      type: 'object',
      required: false,
      examples: [
        '{\n  "type": "rect",\n  "fill": "#e3f2fd",\n  "stroke": "#2196f3",\n  "strokeWidth": 2,\n  "cornerRadius": 8\n}'
      ],
      relatedProperties: ['structure.shape.type', 'structure.shape.fill', 'structure.shape.stroke']
    });

    this.addDoc({
      property: 'type',
      path: 'structure.shape.type',
      description: 'Shape type. Determines the SVG element rendered.',
      type: 'enum',
      required: true,
      enumValues: ['rect', 'circle', 'ellipse', 'diamond', 'hexagon'],
      examples: [
        '"type": "rect"     // Rectangle with optional rounded corners',
        '"type": "circle"   // Perfect circle (width must equal height)',
        '"type": "ellipse"  // Oval shape',
        '"type": "diamond"  // Rotated square (rhombus)',
        '"type": "hexagon"  // Six-sided polygon'
      ],
      relatedProperties: ['structure.shape.cornerRadius', 'structure.size']
    });

    this.addDoc({
      property: 'fill',
      path: 'structure.shape.fill',
      description: 'Fill color as a CSS color value.',
      type: 'string',
      required: false,
      pattern: '^(#[0-9a-fA-F]{3,8}|rgb|rgba|hsl|hsla|transparent).*$',
      examples: [
        '"fill": "#e3f2fd"',
        '"fill": "rgba(255, 0, 0, 0.5)"',
        '"fill": "transparent"'
      ],
      relatedProperties: ['structure.shape.stroke', 'structure.shape.strokeWidth']
    });

    this.addDoc({
      property: 'stroke',
      path: 'structure.shape.stroke',
      description: 'Stroke/border color as a CSS color value.',
      type: 'string',
      required: false,
      examples: [
        '"stroke": "#2196f3"',
        '"stroke": "#666"',
        '"stroke": "rgba(0, 0, 0, 0.2)"'
      ],
      relatedProperties: ['structure.shape.fill', 'structure.shape.strokeWidth']
    });

    this.addDoc({
      property: 'strokeWidth',
      path: 'structure.shape.strokeWidth',
      description: 'Stroke width in pixels.',
      type: 'number',
      required: false,
      minimum: 0,
      maximum: 20,
      examples: [
        '"strokeWidth": 1',
        '"strokeWidth": 2',
        '"strokeWidth": 3'
      ],
      relatedProperties: ['structure.shape.stroke']
    });

    this.addDoc({
      property: 'cornerRadius',
      path: 'structure.shape.cornerRadius',
      description: 'Corner radius for rectangles only. Creates rounded corners.',
      type: 'number',
      required: false,
      minimum: 0,
      maximum: 100,
      examples: [
        '"cornerRadius": 0   // Sharp corners',
        '"cornerRadius": 8   // Slightly rounded',
        '"cornerRadius": 16  // More rounded'
      ],
      relatedProperties: ['structure.shape.type']
    });

    // Ports properties
    this.addDoc({
      property: 'ports',
      path: 'structure.ports',
      description: 'Connection port configuration for linking nodes together.',
      type: 'object',
      required: false,
      examples: [
        '{\n  "enabled": true,\n  "defaultVisibility": "always",\n  "left": { "enabled": true, "type": "input" },\n  "right": { "enabled": true, "type": "output" }\n}'
      ],
      relatedProperties: ['structure.ports.enabled', 'structure.ports.left', 'structure.ports.right']
    });

    this.addDoc({
      property: 'enabled',
      path: 'structure.ports.enabled',
      description: 'Enable ports on this node.',
      type: 'boolean',
      required: false,
      defaultValue: true,
      examples: [
        '"enabled": true   // Ports are enabled',
        '"enabled": false  // No ports'
      ],
      relatedProperties: ['structure.ports.left', 'structure.ports.right', 'structure.ports.top', 'structure.ports.bottom']
    });

    this.addDoc({
      property: 'defaultVisibility',
      path: 'structure.ports.defaultVisibility',
      description: 'Port visibility mode.',
      type: 'enum',
      required: false,
      enumValues: ['always', 'hover', 'never'],
      examples: [
        '"defaultVisibility": "always"  // Ports always visible',
        '"defaultVisibility": "hover"   // Visible on mouse hover',
        '"defaultVisibility": "never"   // Hidden (connections still work)'
      ],
      relatedProperties: ['structure.ports.enabled']
    });

    this.addDoc({
      property: 'children',
      path: 'structure.children',
      description: 'Static child nodes defined in template. Useful for composite nodes.',
      type: 'array',
      required: false,
      examples: [
        '[\n  {\n    "type": "header",\n    "role": "drag-handler",\n    "size": { "width": 250, "height": 45 },\n    "html": { ... }\n  }\n]'
      ],
      relatedProperties: ['structure.layout', 'structure.role']
    });

    // Layout properties
    this.addDoc({
      property: 'layout',
      path: 'structure.layout',
      description: 'Flexbox layout for positioning child nodes automatically.',
      type: 'object',
      required: false,
      examples: [
        '{\n  "direction": "column",\n  "gap": 8,\n  "alignItems": "stretch"\n}'
      ],
      relatedProperties: ['structure.children', 'structure.layout.direction']
    });

    this.addDoc({
      property: 'direction',
      path: 'structure.layout.direction',
      description: 'Flex direction for child layout.',
      type: 'enum',
      required: false,
      enumValues: ['row', 'column', 'row-reverse', 'column-reverse'],
      examples: [
        '"direction": "row"      // Horizontal (left to right)',
        '"direction": "column"   // Vertical (top to bottom)'
      ],
      relatedProperties: ['structure.layout.gap', 'structure.layout.alignItems']
    });

    this.addDoc({
      property: 'gap',
      path: 'structure.layout.gap',
      description: 'Gap between children in pixels.',
      type: 'number',
      required: false,
      minimum: 0,
      maximum: 100,
      examples: [
        '"gap": 0    // No gap',
        '"gap": 8    // Small gap',
        '"gap": 16   // Medium gap'
      ],
      relatedProperties: ['structure.layout.direction', 'structure.layout.padding']
    });

    this.addDoc({
      property: 'padding',
      path: 'structure.layout.padding',
      description: 'Padding around children in pixels.',
      type: 'number',
      required: false,
      minimum: 0,
      maximum: 100,
      examples: [
        '"padding": 0    // No padding',
        '"padding": 12   // Small padding',
        '"padding": 16   // Medium padding'
      ],
      relatedProperties: ['structure.layout.gap']
    });

    this.addDoc({
      property: 'type',
      path: 'structure.layout.type',
      description: 'Layout type for positioning children.',
      type: 'enum',
      required: false,
      enumValues: ['flexbox', 'grid', 'absolute'],
      examples: [
        '"type": "flexbox"   // Flexible box layout (row/column)',
        '"type": "grid"      // CSS Grid layout (2D)',
        '"type": "absolute"  // Free positioning with x/y coordinates'
      ],
      relatedProperties: ['structure.layout.direction', 'structure.layout.columns', 'structure.layout.rows']
    });

    this.addDoc({
      property: 'columns',
      path: 'structure.layout.columns',
      description: 'Number of columns for grid layout.',
      type: 'number',
      required: false,
      minimum: 1,
      maximum: 12,
      examples: [
        '"columns": 2    // 2 column grid',
        '"columns": 3    // 3 column grid',
        '"columns": 4    // 4 column grid'
      ],
      relatedProperties: ['structure.layout.rows', 'structure.layout.gap']
    });

    this.addDoc({
      property: 'rows',
      path: 'structure.layout.rows',
      description: 'Number of rows for grid layout.',
      type: 'number',
      required: false,
      minimum: 1,
      maximum: 12,
      examples: [
        '"rows": 2    // 2 row grid',
        '"rows": 3    // 3 row grid',
        '"rows": 4    // 4 row grid'
      ],
      relatedProperties: ['structure.layout.columns', 'structure.layout.gap']
    });

    // HTML properties
    this.addDoc({
      property: 'html',
      path: 'html',
      description: 'HTML layer configuration for rendering custom UI over the SVG shape.',
      type: 'object',
      required: false,
      examples: [
        '{\n  "mode": "template",\n  "template": "<div>{{data.title}}</div>",\n  "style": { "padding": "16px" }\n}'
      ],
      relatedProperties: ['html.mode', 'html.template', 'html.style', 'html.events']
    });

    this.addDoc({
      property: 'mode',
      path: 'html.mode',
      description: 'HTML rendering mode.',
      type: 'enum',
      required: false,
      enumValues: ['template', 'component'],
      examples: [
        '"mode": "template"    // Mustache template string',
        '"mode": "component"   // Angular/React component'
      ],
      relatedProperties: ['html.template', 'html.component']
    });

    this.addDoc({
      property: 'template',
      path: 'html.template',
      description: 'Mustache template string with {{data.field}} placeholders.',
      type: 'string',
      required: false,
      examples: [
        '"template": "<div>{{data.title}}</div>"',
        '"template": "<h3>{{data.name}}</h3><p>{{data.description}}</p>"'
      ],
      relatedProperties: ['html.mode', 'html.bindings', 'defaultData']
    });

    this.addDoc({
      property: 'style',
      path: 'html.style',
      description: 'Inline CSS styles as JavaScript object (camelCase properties).',
      type: 'object',
      required: false,
      examples: [
        '"style": { "padding": "16px", "color": "white" }',
        '"style": { "display": "flex", "flexDirection": "column", "gap": "8px" }'
      ],
      relatedProperties: ['html.className']
    });

    this.addDoc({
      property: 'className',
      path: 'html.className',
      description: 'CSS class name(s) to apply to the HTML element.',
      type: 'string',
      required: false,
      examples: [
        '"className": "card-content"',
        '"className": "widget primary-widget"'
      ],
      relatedProperties: ['html.style']
    });

    this.addDoc({
      property: 'events',
      path: 'html.events',
      description: 'Map DOM events to EventBus event names.',
      type: 'object',
      required: false,
      examples: [
        '"events": { "click": "node:clicked", "dblclick": "node:edit" }',
        '"events": { "mouseenter": "node:hover", "mouseleave": "node:blur" }'
      ],
      relatedProperties: ['html.template']
    });

    this.addDoc({
      property: 'bindings',
      path: 'html.bindings',
      description: 'Custom data bindings for computed values in templates.',
      type: 'object',
      required: false,
      examples: [
        '"bindings": { "fullName": "data.firstName + \' \' + data.lastName" }',
        '"bindings": { "percentage": "(data.value / data.total * 100).toFixed(2)" }'
      ],
      relatedProperties: ['html.template', 'defaultData']
    });

    this.addDoc({
      property: 'zIndex',
      path: 'html.zIndex',
      description: 'Z-index for layering HTML elements.',
      type: 'number',
      required: false,
      minimum: 0,
      maximum: 9999,
      examples: [
        '"zIndex": 1     // Background layer',
        '"zIndex": 10    // Default layer',
        '"zIndex": 100   // Top layer'
      ],
      relatedProperties: ['html.pointerEvents']
    });

    this.addDoc({
      property: 'pointerEvents',
      path: 'html.pointerEvents',
      description: 'Enable/disable pointer events (click-through behavior).',
      type: 'boolean',
      required: false,
      defaultValue: true,
      examples: [
        '"pointerEvents": true    // HTML can receive clicks',
        '"pointerEvents": false   // Clicks pass through to SVG'
      ],
      relatedProperties: ['html.events']
    });

    this.addDoc({
      property: 'component',
      path: 'html.component',
      description: 'Component name when using component mode.',
      type: 'string',
      required: false,
      examples: [
        '"component": "CustomNodeComponent"',
        '"component": "UserFormWidget"'
      ],
      relatedProperties: ['html.mode', 'html.props']
    });

    this.addDoc({
      property: 'props',
      path: 'html.props',
      description: 'Properties to pass to component when using component mode.',
      type: 'object',
      required: false,
      examples: [
        '"props": { "title": "{{data.title}}", "value": "{{data.value}}" }',
        '"props": { "onAction": "node:action-triggered" }'
      ],
      relatedProperties: ['html.component']
    });

    // Data schema properties
    this.addDoc({
      property: 'dataSchema',
      path: 'dataSchema',
      description: 'JSON Schema for validating node data. Ensures data integrity.',
      type: 'object',
      required: false,
      examples: [
        '{\n  "type": "object",\n  "properties": {\n    "name": { "type": "string", "minLength": 1 },\n    "email": { "type": "string", "format": "email" }\n  },\n  "required": ["name"]\n}'
      ],
      relatedProperties: ['defaultData']
    });

    this.addDoc({
      property: 'defaultData',
      path: 'defaultData',
      description: 'Default data object for the node. Used in templates via {{data.field}}.',
      type: 'object',
      required: false,
      examples: [
        '"defaultData": { "title": "My Node", "status": "active" }',
        '"defaultData": { "name": "User", "email": "user@example.com", "age": 25 }'
      ],
      relatedProperties: ['html.template', 'html.bindings', 'dataSchema']
    });

    // Port advanced properties
    this.addDoc({
      property: 'maxConnections',
      path: 'structure.ports.left.maxConnections',
      description: 'Maximum number of connections allowed on this port. Unlimited if not set.',
      type: 'number',
      required: false,
      minimum: 1,
      examples: [
        '"maxConnections": 1     // Only one connection',
        '"maxConnections": 3     // Up to 3 connections',
        '"maxConnections": 999   // Virtually unlimited'
      ],
      relatedProperties: ['structure.ports.enabled', 'structure.ports.type']
    });

    this.addDoc({
      property: 'type',
      path: 'structure.ports.left.type',
      description: 'Port connection type/direction.',
      type: 'enum',
      required: false,
      enumValues: ['input', 'output', 'both'],
      examples: [
        '"type": "input"    // Only accepts incoming connections',
        '"type": "output"   // Only allows outgoing connections',
        '"type": "both"     // Bidirectional connections'
      ],
      relatedProperties: ['structure.ports.enabled']
    });

    this.addDoc({
      property: 'enabled',
      path: 'structure.ports.left.enabled',
      description: 'Enable this specific port position.',
      type: 'boolean',
      required: false,
      defaultValue: true,
      examples: [
        '"enabled": true   // Port is active',
        '"enabled": false  // Port is disabled'
      ],
      relatedProperties: ['structure.ports.enabled']
    });

    // Shape advanced properties
    this.addDoc({
      property: 'opacity',
      path: 'structure.shape.opacity',
      description: 'Shape opacity/transparency (0 = fully transparent, 1 = fully opaque).',
      type: 'number',
      required: false,
      minimum: 0,
      maximum: 1,
      defaultValue: 1,
      examples: [
        '"opacity": 1.0    // Fully opaque',
        '"opacity": 0.7    // Semi-transparent',
        '"opacity": 0.3    // Very transparent'
      ],
      relatedProperties: ['structure.shape.fill']
    });

    // Behavior properties
    this.addDoc({
      property: 'behavior',
      path: 'behavior',
      description: 'Node behavior configuration for interactions and features.',
      type: 'object',
      required: false,
      examples: [
        '{\n  "draggable": true,\n  "selectable": true,\n  "resizable": false\n}'
      ],
      relatedProperties: ['behavior.draggable', 'behavior.selectable', 'behavior.resizable']
    });

    this.addDoc({
      property: 'draggable',
      path: 'behavior.draggable',
      description: 'Enable node dragging.',
      type: 'boolean',
      required: false,
      defaultValue: true,
      examples: [
        '"draggable": true    // Node can be dragged',
        '"draggable": false   // Node is fixed'
      ],
      relatedProperties: ['behavior.dragHandler']
    });

    this.addDoc({
      property: 'selectable',
      path: 'behavior.selectable',
      description: 'Enable node selection.',
      type: 'boolean',
      required: false,
      defaultValue: true,
      examples: [
        '"selectable": true    // Node can be selected',
        '"selectable": false   // Node cannot be selected'
      ],
      relatedProperties: ['behavior.draggable']
    });

    this.addDoc({
      property: 'resizable',
      path: 'behavior.resizable',
      description: 'Enable node resizing.',
      type: 'boolean',
      required: false,
      defaultValue: false,
      examples: [
        '"resizable": true    // Node can be resized',
        '"resizable": false   // Node has fixed size'
      ],
      relatedProperties: ['structure.size']
    });

    this.addDoc({
      property: 'dragHandler',
      path: 'behavior.dragHandler',
      description: 'Specify which child node acts as the drag handle.',
      type: 'string',
      required: false,
      examples: [
        '"dragHandler": "header"    // Header child is drag handle',
        '"dragHandler": "title-bar" // Title bar acts as handle'
      ],
      relatedProperties: ['structure.children', 'structure.role', 'behavior.draggable']
    });

    // Child node properties
    this.addDoc({
      property: 'position',
      path: 'structure.children[].position',
      description: 'Absolute position for child nodes (only with absolute layout).',
      type: 'object',
      required: false,
      examples: [
        '"position": { "x": 20, "y": 20 }',
        '"position": { "x": 100, "y": 50 }'
      ],
      relatedProperties: ['structure.layout.type']
    });

    console.log(`✅ Loaded ${this.documentation.size} documentation entries`);
  }

  /**
   * Helper to add documentation entry
   */
  private addDoc(entry: DocEntry): void {
    this.documentation.set(entry.path, entry);
  }
}
