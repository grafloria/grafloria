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

    console.log(`✅ Loaded ${this.documentation.size} documentation entries`);
  }

  /**
   * Helper to add documentation entry
   */
  private addDoc(entry: DocEntry): void {
    this.documentation.set(entry.path, entry);
  }
}
