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
    this.addJsonEventSnippets();
    this.addJsonDataBindingSnippets();
    this.addJsonAdvancedSnippets();

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

    this.snippets.push({
      id: 'nested-flex-column',
      name: 'Nested Flex Column',
      description: 'Parent node with children stacked vertically',
      category: 'json',
      subcategory: 'templates',
      tags: ['nested', 'children', 'flex', 'column', 'vertical'],
      icon: '⬇️',
      code: `{
  "id": "flex-column-container",
  "version": "1.0.0",
  "meta": {
    "name": "Flex Column Container",
    "description": "Container with vertically stacked children",
    "category": "layout"
  },
  "structure": {
    "type": "flex-column-container",
    "size": {
      "width": 200,
      "height": "auto"
    },
    "shape": {
      "type": "rect",
      "fill": "#f9fafb",
      "stroke": "#667eea",
      "strokeWidth": 2,
      "cornerRadius": 8
    },
    "layout": {
      "type": "flexbox",
      "direction": "column",
      "gap": 8,
      "padding": 12
    },
    "children": [
      {
        "type": "flex-item",
        "size": { "width": "100%", "height": 40 },
        "shape": {
          "type": "rect",
          "fill": "#e3f2fd",
          "stroke": "#2196f3",
          "strokeWidth": 1,
          "cornerRadius": 4
        },
        "html": {
          "mode": "template",
          "template": "<div style='padding: 8px;'>Item 1</div>"
        }
      },
      {
        "type": "flex-item",
        "size": { "width": "100%", "height": 40 },
        "shape": {
          "type": "rect",
          "fill": "#e8f5e9",
          "stroke": "#4caf50",
          "strokeWidth": 1,
          "cornerRadius": 4
        },
        "html": {
          "mode": "template",
          "template": "<div style='padding: 8px;'>Item 2</div>"
        }
      }
    ],
    "ports": {
      "enabled": true,
      "left": { "enabled": true, "type": "input" },
      "right": { "enabled": true, "type": "output" }
    }
  },
  "defaultData": {
    "title": "Column Container"
  }
}`
    });

    this.snippets.push({
      id: 'nested-flex-row',
      name: 'Nested Flex Row',
      description: 'Parent node with children arranged horizontally',
      category: 'json',
      subcategory: 'templates',
      tags: ['nested', 'children', 'flex', 'row', 'horizontal'],
      icon: '➡️',
      code: `{
  "id": "flex-row-container",
  "version": "1.0.0",
  "meta": {
    "name": "Flex Row Container",
    "description": "Container with horizontally arranged children",
    "category": "layout"
  },
  "structure": {
    "type": "flex-row-container",
    "size": {
      "width": "auto",
      "height": 100
    },
    "shape": {
      "type": "rect",
      "fill": "#fff3e0",
      "stroke": "#ff9800",
      "strokeWidth": 2,
      "cornerRadius": 8
    },
    "layout": {
      "type": "flexbox",
      "direction": "row",
      "gap": 8,
      "padding": 12
    },
    "children": [
      {
        "type": "flex-item",
        "size": { "width": 80, "height": "100%" },
        "shape": {
          "type": "rect",
          "fill": "#e3f2fd",
          "stroke": "#2196f3",
          "strokeWidth": 1,
          "cornerRadius": 4
        },
        "html": {
          "mode": "template",
          "template": "<div style='padding: 8px; text-align: center;'>1</div>"
        }
      },
      {
        "type": "flex-item",
        "size": { "width": 80, "height": "100%" },
        "shape": {
          "type": "rect",
          "fill": "#e8f5e9",
          "stroke": "#4caf50",
          "strokeWidth": 1,
          "cornerRadius": 4
        },
        "html": {
          "mode": "template",
          "template": "<div style='padding: 8px; text-align: center;'>2</div>"
        }
      }
    ],
    "ports": {
      "enabled": true,
      "top": { "enabled": true, "type": "input" },
      "bottom": { "enabled": true, "type": "output" }
    }
  },
  "defaultData": {
    "title": "Row Container"
  }
}`
    });

    this.snippets.push({
      id: 'nested-grid',
      name: 'Nested Grid Layout',
      description: 'Parent node with children in grid layout',
      category: 'json',
      subcategory: 'templates',
      tags: ['nested', 'children', 'grid', 'layout', '2d'],
      icon: '⊞',
      code: `{
  "id": "grid-container",
  "version": "1.0.0",
  "meta": {
    "name": "Grid Container",
    "description": "Container with children in 2D grid",
    "category": "layout"
  },
  "structure": {
    "type": "grid-container",
    "size": {
      "width": 240,
      "height": 240
    },
    "shape": {
      "type": "rect",
      "fill": "#fce7f3",
      "stroke": "#ec4899",
      "strokeWidth": 2,
      "cornerRadius": 8
    },
    "layout": {
      "type": "grid",
      "columns": 2,
      "rows": 2,
      "gap": 8,
      "padding": 12
    },
    "children": [
      {
        "type": "grid-item",
        "shape": {
          "type": "rect",
          "fill": "#e3f2fd",
          "stroke": "#2196f3",
          "strokeWidth": 1,
          "cornerRadius": 4
        },
        "html": {
          "mode": "template",
          "template": "<div style='padding: 8px; text-align: center;'>1</div>"
        }
      },
      {
        "type": "grid-item",
        "shape": {
          "type": "rect",
          "fill": "#e8f5e9",
          "stroke": "#4caf50",
          "strokeWidth": 1,
          "cornerRadius": 4
        },
        "html": {
          "mode": "template",
          "template": "<div style='padding: 8px; text-align: center;'>2</div>"
        }
      },
      {
        "type": "grid-item",
        "shape": {
          "type": "rect",
          "fill": "#fff3e0",
          "stroke": "#ff9800",
          "strokeWidth": 1,
          "cornerRadius": 4
        },
        "html": {
          "mode": "template",
          "template": "<div style='padding: 8px; text-align: center;'>3</div>"
        }
      },
      {
        "type": "grid-item",
        "shape": {
          "type": "rect",
          "fill": "#f3e5f5",
          "stroke": "#9c27b0",
          "strokeWidth": 1,
          "cornerRadius": 4
        },
        "html": {
          "mode": "template",
          "template": "<div style='padding: 8px; text-align: center;'>4</div>"
        }
      }
    ],
    "ports": {
      "enabled": true,
      "defaultVisibility": "hover"
    }
  },
  "defaultData": {
    "title": "Grid Container"
  }
}`
    });

    this.snippets.push({
      id: 'nested-absolute',
      name: 'Nested Absolute Positioning',
      description: 'Parent with absolutely positioned children',
      category: 'json',
      subcategory: 'templates',
      tags: ['nested', 'children', 'absolute', 'unstacked', 'free'],
      icon: '🎯',
      code: `{
  "id": "absolute-container",
  "version": "1.0.0",
  "meta": {
    "name": "Absolute Container",
    "description": "Container with freely positioned children",
    "category": "layout"
  },
  "structure": {
    "type": "absolute-container",
    "size": {
      "width": 300,
      "height": 200
    },
    "shape": {
      "type": "rect",
      "fill": "#e8eaf6",
      "stroke": "#5c6bc0",
      "strokeWidth": 2,
      "cornerRadius": 8
    },
    "layout": {
      "type": "absolute"
    },
    "children": [
      {
        "type": "absolute-item",
        "position": { "x": 20, "y": 20 },
        "size": { "width": 60, "height": 60 },
        "shape": {
          "type": "circle",
          "fill": "#ffcdd2",
          "stroke": "#f44336",
          "strokeWidth": 2
        },
        "html": {
          "mode": "template",
          "template": "<div style='text-align: center; padding-top: 20px;'>A</div>"
        }
      },
      {
        "type": "absolute-item",
        "position": { "x": 120, "y": 60 },
        "size": { "width": 80, "height": 40 },
        "shape": {
          "type": "rect",
          "fill": "#c8e6c9",
          "stroke": "#4caf50",
          "strokeWidth": 2,
          "cornerRadius": 4
        },
        "html": {
          "mode": "template",
          "template": "<div style='padding: 8px; text-align: center;'>B</div>"
        }
      },
      {
        "type": "absolute-item",
        "position": { "x": 220, "y": 120 },
        "size": { "width": 60, "height": 60 },
        "shape": {
          "type": "diamond",
          "fill": "#fff9c4",
          "stroke": "#fbc02d",
          "strokeWidth": 2
        },
        "html": {
          "mode": "template",
          "template": "<div style='text-align: center; padding-top: 16px;'>C</div>"
        }
      }
    ],
    "ports": {
      "enabled": true,
      "defaultVisibility": "hover"
    }
  },
  "defaultData": {
    "title": "Free Layout"
  }
}`
    });

    this.snippets.push({
      id: 'simple-card-complete',
      name: 'Simple Card (Complete)',
      description: 'Production-ready card with header, body, footer',
      category: 'json',
      subcategory: 'templates',
      tags: ['card', 'complete', 'production', 'example'],
      icon: '🃏',
      code: `{
  "id": "simple-card",
  "version": "1.0.0",
  "meta": {
    "name": "Simple Card",
    "description": "A basic card with title and description",
    "category": "common",
    "tags": ["card", "basic"]
  },
  "structure": {
    "type": "simple-card",
    "size": {
      "width": 250,
      "height": 150
    },
    "shape": {
      "type": "rect",
      "cornerRadius": 12,
      "fill": "#ffffff",
      "stroke": "#e5e7eb",
      "strokeWidth": 1
    },
    "html": {
      "mode": "template",
      "template": "<div class='card-header'><h3>{{data.title}}</h3></div><div class='card-body'><p>{{data.description}}</p></div><div class='card-footer'><small>{{data.timestamp}}</small></div>",
      "className": "simple-card-content",
      "style": {
        "display": "flex",
        "flexDirection": "column",
        "height": "100%",
        "padding": "0"
      },
      "events": {
        "click": "card:clicked",
        "dblclick": "card:edit"
      }
    },
    "ports": {
      "enabled": true,
      "defaultVisibility": "hover",
      "top": { "enabled": false },
      "right": { "enabled": true, "type": "output" },
      "bottom": { "enabled": false },
      "left": { "enabled": true, "type": "input" }
    }
  },
  "defaultData": {
    "title": "Card Title",
    "description": "Card description goes here",
    "timestamp": "2025-10-27"
  }
}`
    });

    this.snippets.push({
      id: 'user-form-complete',
      name: 'User Form (Complete)',
      description: 'Interactive form node with inputs and validation',
      category: 'json',
      subcategory: 'templates',
      tags: ['form', 'input', 'interactive', 'complete'],
      icon: '📋',
      code: `{
  "id": "user-form",
  "version": "1.0.0",
  "meta": {
    "name": "User Form",
    "description": "An interactive form for user input",
    "category": "forms",
    "tags": ["form", "input", "user"]
  },
  "structure": {
    "type": "user-form",
    "size": {
      "width": 300,
      "height": 250
    },
    "shape": {
      "type": "rect",
      "cornerRadius": 8,
      "fill": "#f9fafb",
      "stroke": "#6366f1",
      "strokeWidth": 2
    },
    "html": {
      "mode": "template",
      "template": "<form class='user-form'><div class='form-header'><h3>User Information</h3></div><div class='form-group'><label>Name:</label><input type='text' name='name' value='{{data.name}}' placeholder='Enter name' /></div><div class='form-group'><label>Email:</label><input type='email' name='email' value='{{data.email}}' placeholder='Enter email' /></div><div class='form-group'><label>Role:</label><select name='role'><option value='admin'>Admin</option><option value='user'>User</option><option value='guest'>Guest</option></select></div><div class='form-actions'><button type='submit' class='btn-primary'>Save</button><button type='button' class='btn-secondary'>Cancel</button></div></form>",
      "className": "user-form-node",
      "style": {
        "padding": "20px",
        "fontFamily": "system-ui"
      },
      "events": {
        "submit": "form:submitted",
        "input": "form:value-changed",
        "click": "form:clicked"
      }
    },
    "ports": {
      "enabled": true,
      "defaultVisibility": "hover",
      "top": { "enabled": true, "type": "input" },
      "bottom": { "enabled": true, "type": "output" }
    }
  },
  "defaultData": {
    "name": "",
    "email": "",
    "role": "user"
  },
  "dataSchema": {
    "type": "object",
    "properties": {
      "name": { "type": "string", "minLength": 1 },
      "email": { "type": "string", "format": "email" },
      "role": { "type": "string", "enum": ["admin", "user", "guest"] }
    },
    "required": ["name", "email"]
  }
}`
    });

    this.snippets.push({
      id: 'metric-card-complete',
      name: 'Metric Dashboard Card (Complete)',
      description: 'KPI card with icon, value, and trend indicator',
      category: 'json',
      subcategory: 'templates',
      tags: ['metric', 'dashboard', 'kpi', 'analytics', 'complete'],
      icon: '📊',
      code: `{
  "id": "metric-dashboard-card",
  "version": "1.0.0",
  "meta": {
    "name": "Metric Dashboard Card",
    "description": "A card showing key metrics with trends",
    "category": "data-viz",
    "tags": ["metric", "dashboard", "analytics"]
  },
  "structure": {
    "type": "metric-card",
    "size": {
      "width": 220,
      "height": 140
    },
    "shape": {
      "type": "rect",
      "cornerRadius": 12,
      "fill": "#ffffff",
      "stroke": "#e5e7eb",
      "strokeWidth": 1
    },
    "html": {
      "mode": "template",
      "template": "<div class='metric-card'><div class='metric-header'><span class='metric-icon'>{{data.icon}}</span><span class='metric-label'>{{data.label}}</span></div><div class='metric-value'>{{data.value}}</div><div class='metric-trend'><span class='trend-icon'>{{data.trendDirection}}</span><span class='trend-value'>{{data.trendPercentage}}%</span><span class='trend-label'>vs. last period</span></div></div>",
      "className": "metric-card-content",
      "style": {
        "display": "flex",
        "flexDirection": "column",
        "gap": "10px",
        "padding": "16px",
        "fontFamily": "system-ui"
      },
      "bindings": {
        "trendDirection": "data.trend"
      },
      "events": {
        "click": "metric:clicked",
        "mouseenter": "metric:hover"
      }
    },
    "ports": {
      "enabled": false
    }
  },
  "defaultData": {
    "icon": "📊",
    "label": "Total Users",
    "value": "12,543",
    "trend": "↑",
    "trendPercentage": "+12.5"
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

    this.snippets.push({
      id: 'ports-max-connections',
      name: 'Ports with Connection Limits',
      description: 'Limit number of connections per port',
      category: 'json',
      subcategory: 'ports',
      tags: ['ports', 'max', 'connections', 'limit'],
      icon: '🔢',
      code: `"ports": {
  "enabled": true,
  "defaultVisibility": "always",
  "left": {
    "enabled": true,
    "type": "input",
    "maxConnections": 1
  },
  "right": {
    "enabled": true,
    "type": "output",
    "maxConnections": 5
  }
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

  /**
   * Add JSON event handling snippets (Phase 10)
   */
  private addJsonEventSnippets(): void {
    this.snippets.push({
      id: 'events-basic',
      name: 'Basic Event Handlers',
      description: 'Map DOM events to EventBus',
      category: 'json',
      subcategory: 'templates',
      tags: ['events', 'click', 'eventbus', 'handlers'],
      icon: '⚡',
      code: `"html": {
  "mode": "template",
  "template": "<div class='node-content'>{{data.title}}</div>",
  "events": {
    "click": "node:clicked",
    "dblclick": "node:edit",
    "mouseenter": "node:hover-start",
    "mouseleave": "node:hover-end"
  }
}`
    });

    this.snippets.push({
      id: 'events-form-input',
      name: 'Form Input Events',
      description: 'Handle input and form events',
      category: 'json',
      subcategory: 'templates',
      tags: ['events', 'form', 'input', 'submit'],
      icon: '📝',
      code: `"html": {
  "mode": "template",
  "template": "<form><input type='text' name='value' value='{{data.value}}' /></form>",
  "events": {
    "input": "node:value-changed",
    "change": "node:field-updated",
    "submit": "form:submitted",
    "focus": "field:focused",
    "blur": "field:blurred"
  }
}`
    });

    this.snippets.push({
      id: 'events-interactive-button',
      name: 'Interactive Button Node',
      description: 'Clickable node with button',
      category: 'json',
      subcategory: 'templates',
      tags: ['events', 'button', 'interactive', 'action'],
      icon: '🎯',
      code: `{
  "id": "action-node",
  "structure": {
    "type": "custom",
    "size": { "width": 180, "height": 80 },
    "shape": {
      "type": "rect",
      "fill": "#667eea",
      "cornerRadius": 8
    }
  },
  "html": {
    "mode": "template",
    "template": "<div class='content'><button class='action-btn'>{{data.label}}</button></div>",
    "events": {
      "click": "action:triggered",
      "mouseenter": "action:hover"
    },
    "style": {
      "color": "white",
      "textAlign": "center",
      "padding": "20px"
    }
  },
  "defaultData": {
    "label": "Execute"
  }
}`
    });

    this.snippets.push({
      id: 'events-custom-eventbus',
      name: 'Custom EventBus Listener',
      description: 'Listen to custom events',
      category: 'json',
      subcategory: 'templates',
      tags: ['events', 'eventbus', 'custom', 'listener'],
      icon: '📡',
      code: `"html": {
  "mode": "template",
  "template": "<div class='status'>{{data.status}}</div>",
  "events": {
    "click": "status:toggle",
    "dblclick": "status:reset"
  },
  "bindings": {
    "statusClass": "data.status"
  }
}

// EventBus listener example (in your app):
// eventBus.on('status:toggle', (event) => {
//   const node = event.target;
//   node.updateData({ status: !node.data.status });
// });`
    });

    this.snippets.push({
      id: 'events-delegation',
      name: 'Event Delegation Pattern',
      description: 'Handle events from child elements',
      category: 'json',
      subcategory: 'templates',
      tags: ['events', 'delegation', 'children', 'bubbling'],
      icon: '🎪',
      code: `"html": {
  "mode": "template",
  "template": \`
    <div class='container'>
      <button data-action='add'>Add</button>
      <button data-action='remove'>Remove</button>
      <button data-action='edit'>Edit</button>
    </div>
  \`,
  "events": {
    "click": "container:action"
  }
}

// Handle in app:
// eventBus.on('container:action', (event) => {
//   const action = event.originalEvent.target.dataset.action;
//   // Handle add, remove, edit
// });`
    });
  }

  /**
   * Add JSON data binding snippets (Phase 11)
   */
  private addJsonDataBindingSnippets(): void {
    this.snippets.push({
      id: 'data-schema-basic',
      name: 'Basic Data Schema',
      description: 'JSON Schema validation',
      category: 'json',
      subcategory: 'templates',
      tags: ['data', 'schema', 'validation', 'required'],
      icon: '✅',
      code: `"dataSchema": {
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100
    },
    "email": {
      "type": "string",
      "format": "email"
    },
    "age": {
      "type": "number",
      "minimum": 0,
      "maximum": 150
    }
  },
  "required": ["name", "email"]
}`
    });

    this.snippets.push({
      id: 'data-schema-advanced',
      name: 'Advanced Data Schema',
      description: 'Complex validation with nested objects',
      category: 'json',
      subcategory: 'templates',
      tags: ['data', 'schema', 'nested', 'validation'],
      icon: '🔒',
      code: `"dataSchema": {
  "type": "object",
  "properties": {
    "user": {
      "type": "object",
      "properties": {
        "firstName": { "type": "string", "minLength": 1 },
        "lastName": { "type": "string", "minLength": 1 },
        "role": {
          "type": "string",
          "enum": ["admin", "user", "guest"]
        }
      },
      "required": ["firstName", "lastName"]
    },
    "settings": {
      "type": "object",
      "properties": {
        "theme": { "type": "string", "enum": ["light", "dark"] },
        "notifications": { "type": "boolean" }
      }
    }
  },
  "required": ["user"]
}`
    });

    this.snippets.push({
      id: 'bindings-custom',
      name: 'Custom Data Bindings',
      description: 'Map template variables to data paths',
      category: 'json',
      subcategory: 'templates',
      tags: ['bindings', 'data', 'mapping', 'variables'],
      icon: '🔗',
      code: `"html": {
  "mode": "template",
  "template": \`
    <div class='user-card'>
      <h3>{{fullName}}</h3>
      <p>{{roleLabel}}</p>
      <span class='status {{statusClass}}'>{{statusText}}</span>
    </div>
  \`,
  "bindings": {
    "fullName": "data.user.firstName + ' ' + data.user.lastName",
    "roleLabel": "data.user.role.toUpperCase()",
    "statusClass": "data.active ? 'active' : 'inactive'",
    "statusText": "data.active ? 'Online' : 'Offline'"
  }
}`
    });

    this.snippets.push({
      id: 'bindings-computed',
      name: 'Computed Properties',
      description: 'Derived values from data',
      category: 'json',
      subcategory: 'templates',
      tags: ['bindings', 'computed', 'derived', 'calculation'],
      icon: '🧮',
      code: `"html": {
  "mode": "template",
  "template": \`
    <div class='metric-card'>
      <h2>{{totalValue}}</h2>
      <p>{{percentageChange}}%</p>
      <span class='trend {{trendDirection}}'>{{trendIcon}}</span>
    </div>
  \`,
  "bindings": {
    "totalValue": "data.values.reduce((sum, v) => sum + v, 0)",
    "percentageChange": "((data.current - data.previous) / data.previous * 100).toFixed(2)",
    "trendDirection": "data.current > data.previous ? 'up' : 'down'",
    "trendIcon": "data.current > data.previous ? '📈' : '📉'"
  }
}`
    });

    this.snippets.push({
      id: 'data-validation-example',
      name: 'Complete Validation Example',
      description: 'Full template with schema and validation',
      category: 'json',
      subcategory: 'templates',
      tags: ['data', 'validation', 'schema', 'complete'],
      icon: '📋',
      code: `{
  "id": "validated-form",
  "structure": {
    "type": "custom",
    "size": { "width": 300, "height": 250 }
  },
  "html": {
    "mode": "template",
    "template": \`
      <form class='validated-form'>
        <input type='text' name='name' value='{{data.name}}' required />
        <input type='email' name='email' value='{{data.email}}' required />
        <input type='number' name='age' value='{{data.age}}' min='0' max='150' />
        <button type='submit'>Submit</button>
      </form>
    \`,
    "events": {
      "submit": "form:validated-submit",
      "input": "form:field-changed"
    }
  },
  "dataSchema": {
    "type": "object",
    "properties": {
      "name": { "type": "string", "minLength": 1 },
      "email": { "type": "string", "format": "email" },
      "age": { "type": "number", "minimum": 0, "maximum": 150 }
    },
    "required": ["name", "email"]
  },
  "defaultData": {
    "name": "",
    "email": "",
    "age": null
  }
}`
    });
  }

  /**
   * Add JSON advanced feature snippets (Phase 12)
   */
  private addJsonAdvancedSnippets(): void {
    this.snippets.push({
      id: 'html-zindex-layers',
      name: 'Z-Index Layering',
      description: 'Layer HTML elements with zIndex',
      category: 'json',
      subcategory: 'templates',
      tags: ['html', 'zindex', 'layers', 'stacking'],
      icon: '📚',
      code: `"html": {
  "mode": "template",
  "template": \`
    <div class='background-layer' style='z-index: 1;'>Background</div>
    <div class='content-layer' style='z-index: 2;'>Content</div>
    <div class='overlay-layer' style='z-index: 3;'>Overlay</div>
  \`,
  "zIndex": 10,
  "style": {
    "position": "relative"
  }
}`
    });

    this.snippets.push({
      id: 'html-pointer-events',
      name: 'Pointer Events Control',
      description: 'Control click-through behavior',
      category: 'json',
      subcategory: 'templates',
      tags: ['html', 'pointer', 'events', 'click'],
      icon: '👆',
      code: `"html": {
  "mode": "template",
  "template": \`
    <div class='background' style='pointer-events: none;'>
      <!-- Allows clicks to pass through -->
    </div>
    <button class='interactive' style='pointer-events: auto;'>
      Click Me
    </button>
  \`,
  "pointerEvents": true,
  "style": {
    "pointerEvents": "all"
  }
}`
    });

    this.snippets.push({
      id: 'ports-field-level',
      name: 'Field-Level Ports (ERD)',
      description: 'Individual ports for table fields',
      category: 'json',
      subcategory: 'templates',
      tags: ['ports', 'fields', 'erd', 'database'],
      icon: '🗃️',
      code: `{
  "id": "erd-table",
  "structure": {
    "type": "custom",
    "size": { "width": 200, "height": "auto" },
    "layout": {
      "type": "flexbox",
      "direction": "column",
      "gap": 0
    },
    "children": [
      {
        "type": "flex-item",
        "size": { "width": "100%", "height": 40 },
        "shape": { "type": "rect", "fill": "#1e3a8a" },
        "html": {
          "template": "<div class='table-header'>Users</div>"
        }
      },
      {
        "type": "flex-item",
        "size": { "width": "100%", "height": 30 },
        "ports": {
          "enabled": true,
          "left": { "enabled": true, "type": "input" },
          "right": { "enabled": true, "type": "output" }
        },
        "html": {
          "template": "<div class='field'>id: INT</div>"
        }
      },
      {
        "type": "flex-item",
        "size": { "width": "100%", "height": 30 },
        "ports": {
          "enabled": true,
          "left": { "enabled": true, "type": "input" },
          "right": { "enabled": true, "type": "output" }
        },
        "html": {
          "template": "<div class='field'>name: VARCHAR</div>"
        }
      }
    ]
  }
}`
    });

    this.snippets.push({
      id: 'advanced-combo',
      name: 'Advanced Features Combo',
      description: 'Combines zIndex, events, bindings, validation',
      category: 'json',
      subcategory: 'templates',
      tags: ['advanced', 'complete', 'combo', 'full-featured'],
      icon: '🚀',
      code: `{
  "id": "advanced-node",
  "structure": {
    "type": "custom",
    "size": { "width": 280, "height": 180 },
    "shape": {
      "type": "rect",
      "fill": "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
      "cornerRadius": 12,
      "stroke": "#667eea",
      "strokeWidth": 2
    },
    "ports": {
      "enabled": true,
      "defaultVisibility": "hover",
      "left": { "enabled": true, "type": "input", "maxConnections": 3 },
      "right": { "enabled": true, "type": "output", "maxConnections": 5 }
    }
  },
  "html": {
    "mode": "template",
    "template": \`
      <div class='node-container'>
        <div class='header' style='z-index: 2;'>
          <h3>{{title}}</h3>
          <span class='badge {{statusClass}}'>{{status}}</span>
        </div>
        <div class='content' style='z-index: 1;'>
          <p>{{description}}</p>
          <div class='metric'>Value: {{formattedValue}}</div>
        </div>
        <button class='action-btn' style='z-index: 3; pointer-events: auto;'>
          {{actionLabel}}
        </button>
      </div>
    \`,
    "events": {
      "click": "node:clicked",
      "dblclick": "node:edit",
      ".action-btn click": "action:execute"
    },
    "bindings": {
      "title": "data.name.toUpperCase()",
      "statusClass": "data.active ? 'status-active' : 'status-inactive'",
      "formattedValue": "data.value.toLocaleString()",
      "actionLabel": "data.actionType === 'edit' ? 'Edit' : 'View'"
    },
    "zIndex": 10,
    "pointerEvents": true,
    "style": {
      "color": "white",
      "padding": "16px"
    }
  },
  "dataSchema": {
    "type": "object",
    "properties": {
      "name": { "type": "string", "minLength": 1 },
      "description": { "type": "string" },
      "value": { "type": "number", "minimum": 0 },
      "active": { "type": "boolean" },
      "status": { "type": "string", "enum": ["active", "pending", "inactive"] },
      "actionType": { "type": "string", "enum": ["edit", "view"] }
    },
    "required": ["name", "value"]
  },
  "defaultData": {
    "name": "Advanced Node",
    "description": "Feature-rich node template",
    "value": 1000,
    "active": true,
    "status": "active",
    "actionType": "edit"
  }
}`
    });

    this.snippets.push({
      id: 'component-mode-example',
      name: 'Component Mode Template',
      description: 'Use Angular/React component instead of template',
      category: 'json',
      subcategory: 'templates',
      tags: ['html', 'component', 'mode', 'framework'],
      icon: '🧩',
      code: `"html": {
  "mode": "component",
  "component": "CustomNodeComponent",
  "props": {
    "title": "{{data.title}}",
    "value": "{{data.value}}",
    "onAction": "node:action-triggered"
  },
  "style": {
    "width": "100%",
    "height": "100%"
  }
}

// Register component:
// templateRegistry.registerComponent('CustomNodeComponent', MyComponent);`
    });

    this.snippets.push({
      id: 'opacity-layers',
      name: 'Opacity and Transparency',
      description: 'Control shape and HTML opacity',
      category: 'json',
      subcategory: 'shapes',
      tags: ['opacity', 'transparency', 'alpha', 'fade'],
      icon: '👻',
      code: `{
  "structure": {
    "shape": {
      "type": "rect",
      "fill": "#667eea",
      "stroke": "#764ba2",
      "strokeWidth": 2,
      "opacity": 0.7,
      "cornerRadius": 8
    }
  },
  "html": {
    "template": "<div class='content'>Semi-transparent</div>",
    "style": {
      "opacity": "0.9",
      "background": "rgba(255, 255, 255, 0.5)"
    }
  }
}`
    });
  }
}
