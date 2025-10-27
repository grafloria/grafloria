import { Injectable } from '@angular/core';

/**
 * Snippet Definition
 */
export interface Snippet {
  id: string;
  name: string;
  description: string;
  category: 'json' | 'html' | 'css';
  subcategory: string;
  code: string;
  insertText?: string; // Monaco snippet format
  tags: string[];
  icon?: string;
}

/**
 * Snippet Category
 */
export interface SnippetCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
}

/**
 * Snippet Service
 *
 * Provides pre-built code snippets for common template patterns.
 * Supports JSON templates, HTML layers, and CSS styling.
 *
 * Features:
 * - 30+ snippets across categories
 * - Search and filter by category
 * - Monaco editor integration
 * - Copy-to-clipboard
 *
 * ~700 lines
 */
@Injectable({
  providedIn: 'root'
})
export class SnippetService {

  private snippets: Snippet[] = [];
  private categories: SnippetCategory[] = [];

  constructor() {
    this.initializeCategories();
    this.initializeSnippets();
  }

  /**
   * Get all snippets
   */
  getAllSnippets(): Snippet[] {
    return this.snippets;
  }

  /**
   * Get snippets by category
   */
  getSnippetsByCategory(category: 'json' | 'html' | 'css'): Snippet[] {
    return this.snippets.filter(s => s.category === category);
  }

  /**
   * Get snippets by subcategory
   */
  getSnippetsBySubcategory(subcategory: string): Snippet[] {
    return this.snippets.filter(s => s.subcategory === subcategory);
  }

  /**
   * Search snippets by query
   */
  searchSnippets(query: string): Snippet[] {
    const lowerQuery = query.toLowerCase();
    return this.snippets.filter(s =>
      s.name.toLowerCase().includes(lowerQuery) ||
      s.description.toLowerCase().includes(lowerQuery) ||
      s.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
    );
  }

  /**
   * Get snippet by ID
   */
  getSnippetById(id: string): Snippet | undefined {
    return this.snippets.find(s => s.id === id);
  }

  /**
   * Get all categories
   */
  getCategories(): SnippetCategory[] {
    return this.categories;
  }

  /**
   * Initialize categories
   */
  private initializeCategories(): void {
    this.categories = [
      {
        id: 'templates',
        name: 'Templates',
        description: 'Complete node template structures',
        icon: '📋'
      },
      {
        id: 'shapes',
        name: 'Shapes',
        description: 'Shape configurations',
        icon: '🔷'
      },
      {
        id: 'ports',
        name: 'Ports',
        description: 'Port configurations',
        icon: '🔌'
      },
      {
        id: 'html-elements',
        name: 'HTML Elements',
        description: 'Common HTML components',
        icon: '🏷️'
      },
      {
        id: 'css-layouts',
        name: 'CSS Layouts',
        description: 'Layout patterns',
        icon: '📐'
      },
      {
        id: 'css-effects',
        name: 'CSS Effects',
        description: 'Visual effects and animations',
        icon: '✨'
      }
    ];
  }

  /**
   * Initialize all snippets
   */
  private initializeSnippets(): void {
    // JSON Templates
    this.addJsonTemplateSnippets();
    this.addJsonShapeSnippets();
    this.addJsonPortSnippets();

    // HTML Snippets
    this.addHtmlElementSnippets();

    // CSS Snippets
    this.addCssLayoutSnippets();
    this.addCssEffectSnippets();
  }

  /**
   * Add JSON template snippets
   */
  private addJsonTemplateSnippets(): void {
    this.snippets.push({
      id: 'basic-node',
      name: 'Basic Node',
      description: 'Minimal node template with rectangle shape',
      category: 'json',
      subcategory: 'templates',
      tags: ['template', 'basic', 'rectangle'],
      icon: '📄',
      code: `{
  "id": "basic-node",
  "version": "1.0.0",
  "meta": {
    "name": "Basic Node",
    "description": "A simple rectangular node",
    "category": "basic",
    "author": "Your Name"
  },
  "structure": {
    "type": "custom",
    "size": {
      "width": 200,
      "height": 100
    },
    "shape": {
      "type": "rect",
      "fill": "#e3f2fd",
      "stroke": "#1976d2",
      "strokeWidth": 2,
      "cornerRadius": 8
    },
    "ports": {
      "enabled": true,
      "defaultVisibility": "always"
    }
  },
  "defaultData": {
    "label": "Node"
  }
}`
    });

    this.snippets.push({
      id: 'erd-table',
      name: 'ERD Table',
      description: 'Database table template with fields',
      category: 'json',
      subcategory: 'templates',
      tags: ['erd', 'database', 'table'],
      icon: '🗄️',
      code: `{
  "id": "erd-table",
  "version": "1.0.0",
  "meta": {
    "name": "ERD Table",
    "description": "Database table with fields",
    "category": "erd"
  },
  "structure": {
    "type": "erd-table",
    "size": {
      "width": 220,
      "height": "auto"
    },
    "shape": {
      "type": "rect",
      "fill": "#ffffff",
      "stroke": "#667eea",
      "strokeWidth": 2,
      "cornerRadius": 8
    },
    "ports": {
      "enabled": true,
      "left": { "enabled": true, "type": "input" },
      "right": { "enabled": true, "type": "output" }
    }
  },
  "defaultData": {
    "tableName": "users",
    "fields": [
      { "name": "id", "type": "INT", "isPrimaryKey": true },
      { "name": "email", "type": "VARCHAR(255)" },
      { "name": "created_at", "type": "TIMESTAMP" }
    ]
  }
}`
    });

    this.snippets.push({
      id: 'process-node',
      name: 'Process Node',
      description: 'Workflow process step with icon',
      category: 'json',
      subcategory: 'templates',
      tags: ['process', 'workflow', 'flowchart'],
      icon: '⚙️',
      code: `{
  "id": "process-node",
  "version": "1.0.0",
  "meta": {
    "name": "Process Node",
    "description": "Workflow process step",
    "category": "workflow"
  },
  "structure": {
    "type": "process",
    "size": {
      "width": 180,
      "height": 80
    },
    "shape": {
      "type": "rect",
      "fill": "#f3f4f6",
      "stroke": "#6b7280",
      "strokeWidth": 2,
      "cornerRadius": 12
    },
    "ports": {
      "enabled": true,
      "top": { "enabled": true, "type": "input" },
      "bottom": { "enabled": true, "type": "output" }
    }
  },
  "defaultData": {
    "label": "Process Step",
    "icon": "⚙️"
  }
}`
    });
  }

  /**
   * Add JSON shape snippets
   */
  private addJsonShapeSnippets(): void {
    this.snippets.push({
      id: 'shape-rectangle',
      name: 'Rectangle Shape',
      description: 'Rectangle with corner radius',
      category: 'json',
      subcategory: 'shapes',
      tags: ['shape', 'rectangle', 'rect'],
      icon: '▭',
      code: `"shape": {
  "type": "rect",
  "fill": "#e3f2fd",
  "stroke": "#1976d2",
  "strokeWidth": 2,
  "cornerRadius": 8
}`
    });

    this.snippets.push({
      id: 'shape-circle',
      name: 'Circle Shape',
      description: 'Perfect circle',
      category: 'json',
      subcategory: 'shapes',
      tags: ['shape', 'circle'],
      icon: '●',
      code: `"shape": {
  "type": "circle",
  "fill": "#fef3c7",
  "stroke": "#f59e0b",
  "strokeWidth": 2
}`
    });

    this.snippets.push({
      id: 'shape-diamond',
      name: 'Diamond Shape',
      description: 'Decision node diamond',
      category: 'json',
      subcategory: 'shapes',
      tags: ['shape', 'diamond', 'decision'],
      icon: '◆',
      code: `"shape": {
  "type": "diamond",
  "fill": "#fce7f3",
  "stroke": "#ec4899",
  "strokeWidth": 2
}`
    });

    this.snippets.push({
      id: 'shape-gradient',
      name: 'Gradient Fill',
      description: 'Linear gradient fill',
      category: 'json',
      subcategory: 'shapes',
      tags: ['shape', 'gradient', 'fill'],
      icon: '🎨',
      code: `"shape": {
  "type": "rect",
  "fill": "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  "stroke": "#667eea",
  "strokeWidth": 2,
  "cornerRadius": 12
}`
    });

    this.snippets.push({
      id: 'shape-ellipse',
      name: 'Ellipse Shape',
      description: 'Oval/ellipse shape',
      category: 'json',
      subcategory: 'shapes',
      tags: ['shape', 'ellipse', 'oval'],
      icon: '⬭',
      code: `"shape": {
  "type": "ellipse",
  "fill": "#fff3e0",
  "stroke": "#ff9800",
  "strokeWidth": 2
}`
    });

    this.snippets.push({
      id: 'shape-hexagon',
      name: 'Hexagon Shape',
      description: 'Six-sided hexagon',
      category: 'json',
      subcategory: 'shapes',
      tags: ['shape', 'hexagon', 'polygon'],
      icon: '⬡',
      code: `"shape": {
  "type": "hexagon",
  "fill": "#e8f5e9",
  "stroke": "#4caf50",
  "strokeWidth": 2
}`
    });

    this.snippets.push({
      id: 'shape-radial-gradient',
      name: 'Radial Gradient',
      description: 'Radial gradient from center',
      category: 'json',
      subcategory: 'shapes',
      tags: ['shape', 'gradient', 'radial', 'fill'],
      icon: '⭕',
      code: `"shape": {
  "type": "circle",
  "fill": "radial-gradient(circle, #667eea 0%, #764ba2 100%)",
  "stroke": "#667eea",
  "strokeWidth": 2
}`
    });

    this.snippets.push({
      id: 'shape-multi-stop-gradient',
      name: 'Multi-Stop Gradient',
      description: 'Gradient with multiple color stops',
      category: 'json',
      subcategory: 'shapes',
      tags: ['shape', 'gradient', 'multi-stop', 'colorful'],
      icon: '🌈',
      code: `"shape": {
  "type": "rect",
  "fill": "linear-gradient(135deg, #667eea 0%, #764ba2 33%, #f093fb 66%, #4facfe 100%)",
  "stroke": "#667eea",
  "strokeWidth": 2,
  "cornerRadius": 16
}`
    });

    this.snippets.push({
      id: 'shape-image-fill',
      name: 'Image Background',
      description: 'Base64 image as background',
      category: 'json',
      subcategory: 'shapes',
      tags: ['shape', 'image', 'background', 'base64'],
      icon: '🖼️',
      code: `"shape": {
  "type": "rect",
  "fill": "url(data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMTAiIGN5PSIxMCIgcj0iMyIgZmlsbD0iI2NjYyIvPjwvc3ZnPg==)",
  "stroke": "#999",
  "strokeWidth": 1,
  "cornerRadius": 8
}`
    });

    this.snippets.push({
      id: 'shape-pattern-dots',
      name: 'Dot Pattern Fill',
      description: 'SVG pattern with dots',
      category: 'json',
      subcategory: 'shapes',
      tags: ['shape', 'pattern', 'dots', 'background'],
      icon: '⬝',
      code: `"shape": {
  "type": "rect",
  "fill": "url(data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMTAiIGN5PSIxMCIgcj0iMiIgZmlsbD0iIzY2N2VlYSIgb3BhY2l0eT0iMC4zIi8+PC9zdmc+)",
  "stroke": "#667eea",
  "strokeWidth": 2,
  "cornerRadius": 8
}`
    });

    this.snippets.push({
      id: 'shape-pattern-grid',
      name: 'Grid Pattern Fill',
      description: 'SVG pattern with grid lines',
      category: 'json',
      subcategory: 'shapes',
      tags: ['shape', 'pattern', 'grid', 'lines'],
      icon: '⊞',
      code: `"shape": {
  "type": "rect",
  "fill": "url(data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZD0iTSAyMCAwIEwgMCAwIDAgMjAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2NjYyIgc3Ryb2tlLXdpZHRoPSIxIiBvcGFjaXR5PSIwLjMiLz48L3N2Zz4=)",
  "stroke": "#999",
  "strokeWidth": 1,
  "cornerRadius": 0
}`
    });

    this.snippets.push({
      id: 'shape-opacity',
      name: 'Semi-Transparent Shape',
      description: 'Shape with opacity',
      category: 'json',
      subcategory: 'shapes',
      tags: ['shape', 'opacity', 'transparent', 'alpha'],
      icon: '◯',
      code: `"shape": {
  "type": "rect",
  "fill": "#667eea",
  "stroke": "#5568d3",
  "strokeWidth": 2,
  "cornerRadius": 8,
  "opacity": 0.7
}`
    });

    this.snippets.push({
      id: 'shape-dashed-border',
      name: 'Dashed Border',
      description: 'Shape with dashed stroke',
      category: 'json',
      subcategory: 'shapes',
      tags: ['shape', 'border', 'dashed', 'stroke'],
      icon: '⟐',
      code: `"shape": {
  "type": "rect",
  "fill": "#f9fafb",
  "stroke": "#6b7280",
  "strokeWidth": 2,
  "strokeDasharray": "5,5",
  "cornerRadius": 8
}`
    });
  }

  /**
   * Add JSON port snippets
   */
  private addJsonPortSnippets(): void {
    this.snippets.push({
      id: 'ports-all',
      name: 'All Ports Enabled',
      description: 'Enable all four ports',
      category: 'json',
      subcategory: 'ports',
      tags: ['ports', 'all', 'enabled'],
      icon: '🔌',
      code: `"ports": {
  "enabled": true,
  "defaultVisibility": "always",
  "left": { "enabled": true, "type": "input" },
  "right": { "enabled": true, "type": "output" },
  "top": { "enabled": true, "type": "both" },
  "bottom": { "enabled": true, "type": "both" }
}`
    });

    this.snippets.push({
      id: 'ports-left-right',
      name: 'Left-Right Ports',
      description: 'Input on left, output on right',
      category: 'json',
      subcategory: 'ports',
      tags: ['ports', 'horizontal', 'flow'],
      icon: '↔️',
      code: `"ports": {
  "enabled": true,
  "defaultVisibility": "always",
  "left": { "enabled": true, "type": "input" },
  "right": { "enabled": true, "type": "output" }
}`
    });

    this.snippets.push({
      id: 'ports-hover',
      name: 'Hover-Only Ports',
      description: 'Ports visible on hover',
      category: 'json',
      subcategory: 'ports',
      tags: ['ports', 'hover', 'visibility'],
      icon: '👁️',
      code: `"ports": {
  "enabled": true,
  "defaultVisibility": "hover",
  "left": { "enabled": true, "type": "input" },
  "right": { "enabled": true, "type": "output" }
}`
    });
  }

  /**
   * Add HTML element snippets
   */
  private addHtmlElementSnippets(): void {
    this.snippets.push({
      id: 'html-button',
      name: 'Action Button',
      description: 'Clickable button element',
      category: 'html',
      subcategory: 'html-elements',
      tags: ['html', 'button', 'action'],
      icon: '🔘',
      code: `<button class="action-btn" style="position: absolute; left: 160px; top: 80px;">
  <span class="icon">+</span>
</button>`
    });

    this.snippets.push({
      id: 'html-badge',
      name: 'Status Badge',
      description: 'Status indicator badge',
      category: 'html',
      subcategory: 'html-elements',
      tags: ['html', 'badge', 'status'],
      icon: '🏷️',
      code: `<div class="badge" style="position: absolute; top: 8px; right: 8px;">
  <span class="badge-text">{{data.status}}</span>
</div>`
    });

    this.snippets.push({
      id: 'html-icon',
      name: 'Icon Element',
      description: 'Centered icon',
      category: 'html',
      subcategory: 'html-elements',
      tags: ['html', 'icon', 'emoji'],
      icon: '🎨',
      code: `<div class="icon-container" style="position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);">
  <span class="icon">{{data.icon}}</span>
</div>`
    });

    this.snippets.push({
      id: 'html-header',
      name: 'Header Section',
      description: 'Node header with title',
      category: 'html',
      subcategory: 'html-elements',
      tags: ['html', 'header', 'title'],
      icon: '📌',
      code: `<div class="header" style="position: absolute; top: 0; left: 0; width: 100%; padding: 8px 12px;">
  <h4 class="title">{{data.title}}</h4>
</div>`
    });

    this.snippets.push({
      id: 'html-list',
      name: 'Item List',
      description: 'Vertical list of items',
      category: 'html',
      subcategory: 'html-elements',
      tags: ['html', 'list', 'items'],
      icon: '📝',
      code: `<div class="list-container" style="position: absolute; top: 40px; left: 12px; right: 12px;">
  {{#each data.items}}
  <div class="list-item">
    <span class="item-name">{{this.name}}</span>
    <span class="item-value">{{this.value}}</span>
  </div>
  {{/each}}
</div>`
    });
  }

  /**
   * Add CSS layout snippets
   */
  private addCssLayoutSnippets(): void {
    this.snippets.push({
      id: 'css-flexbox-center',
      name: 'Flexbox Center',
      description: 'Center content with flexbox',
      category: 'css',
      subcategory: 'css-layouts',
      tags: ['css', 'flexbox', 'center', 'layout'],
      icon: '📐',
      code: `.container {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}`
    });

    this.snippets.push({
      id: 'css-grid-header-body',
      name: 'Header-Body Layout',
      description: 'Fixed header with scrollable body',
      category: 'css',
      subcategory: 'css-layouts',
      tags: ['css', 'grid', 'layout', 'header'],
      icon: '🗂️',
      code: `.node-container {
  display: grid;
  grid-template-rows: auto 1fr;
  height: 100%;
}

.header {
  background: #f3f4f6;
  padding: 8px 12px;
  border-bottom: 1px solid #e5e7eb;
}

.body {
  padding: 12px;
  overflow-y: auto;
}`
    });

    this.snippets.push({
      id: 'css-absolute-positioning',
      name: 'Absolute Positioning',
      description: 'Position element at specific coordinates',
      category: 'css',
      subcategory: 'css-layouts',
      tags: ['css', 'position', 'absolute'],
      icon: '📍',
      code: `.element {
  position: absolute;
  top: 10px;
  left: 10px;
  width: 40px;
  height: 40px;
}`
    });
  }

  /**
   * Add CSS effect snippets
   */
  private addCssEffectSnippets(): void {
    this.snippets.push({
      id: 'css-shadow',
      name: 'Box Shadow',
      description: 'Elevated card shadow',
      category: 'css',
      subcategory: 'css-effects',
      tags: ['css', 'shadow', 'effect'],
      icon: '🌑',
      code: `.element {
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}`
    });

    this.snippets.push({
      id: 'css-hover-scale',
      name: 'Hover Scale',
      description: 'Scale up on hover',
      category: 'css',
      subcategory: 'css-effects',
      tags: ['css', 'hover', 'scale', 'animation'],
      icon: '🔍',
      code: `.element {
  transition: transform 0.2s ease;
}

.element:hover {
  transform: scale(1.05);
}`
    });

    this.snippets.push({
      id: 'css-gradient-border',
      name: 'Gradient Border',
      description: 'Colorful gradient border',
      category: 'css',
      subcategory: 'css-effects',
      tags: ['css', 'border', 'gradient'],
      icon: '🌈',
      code: `.element {
  border: 2px solid transparent;
  background: linear-gradient(white, white) padding-box,
              linear-gradient(135deg, #667eea 0%, #764ba2 100%) border-box;
  border-radius: 8px;
}`
    });

    this.snippets.push({
      id: 'css-pulse-animation',
      name: 'Pulse Animation',
      description: 'Pulsing indicator animation',
      category: 'css',
      subcategory: 'css-effects',
      tags: ['css', 'animation', 'pulse', 'keyframes'],
      icon: '💫',
      code: `.element {
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.7;
    transform: scale(1.05);
  }
}`
    });

    this.snippets.push({
      id: 'css-fade-in',
      name: 'Fade In Animation',
      description: 'Smooth fade in effect',
      category: 'css',
      subcategory: 'css-effects',
      tags: ['css', 'animation', 'fade', 'opacity'],
      icon: '✨',
      code: `.element {
  animation: fadeIn 0.3s ease-in;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}`
    });
  }
}
