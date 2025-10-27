import { Injectable } from '@angular/core';
import type { NodeTemplate } from '@grafloria/engine';

/**
 * Template Preset
 * Pre-built template with metadata for the library
 */
export interface TemplatePreset {
  id: string;
  name: string;
  category: string;
  description: string;
  tags: string[];
  template: NodeTemplate;
  htmlLayer?: string;
  cssLayer?: string;
  thumbnail?: string;
}

/**
 * Template Library Service
 *
 * Provides pre-built templates organized by category.
 * Includes templates for common use cases like ERD, workflows, dashboards, etc.
 *
 * Responsibilities:
 * - Provide preset templates
 * - Filter and search templates
 * - Export/Import templates
 *
 * ~180 lines
 */
@Injectable({
  providedIn: 'root'
})
export class TemplateLibraryService {

  private presets: TemplatePreset[] = [];

  constructor() {
    this.initializePresets();
  }

  /**
   * Get all presets
   */
  getAllPresets(): TemplatePreset[] {
    return this.presets;
  }

  /**
   * Get presets by category
   */
  getPresetsByCategory(category: string): TemplatePreset[] {
    return this.presets.filter(p => p.category === category);
  }

  /**
   * Get preset by ID
   */
  getPresetById(id: string): TemplatePreset | undefined {
    return this.presets.find(p => p.id === id);
  }

  /**
   * Search presets
   */
  searchPresets(query: string): TemplatePreset[] {
    const lowerQuery = query.toLowerCase();
    return this.presets.filter(p =>
      p.name.toLowerCase().includes(lowerQuery) ||
      p.description.toLowerCase().includes(lowerQuery) ||
      p.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
    );
  }

  /**
   * Get all categories
   */
  getCategories(): string[] {
    const categories = new Set(this.presets.map(p => p.category));
    return Array.from(categories).sort();
  }

  /**
   * Initialize preset templates
   */
  private initializePresets(): void {
    this.presets = [
      // Basic Shapes
      {
        id: 'basic-rectangle',
        name: 'Rectangle',
        category: 'basic',
        description: 'Simple rectangular node',
        tags: ['shape', 'basic', 'rectangle'],
        template: this.createBasicRectangle()
      },
      {
        id: 'basic-circle',
        name: 'Circle',
        category: 'basic',
        description: 'Simple circular node',
        tags: ['shape', 'basic', 'circle'],
        template: this.createBasicCircle()
      },
      {
        id: 'basic-diamond',
        name: 'Diamond',
        category: 'basic',
        description: 'Diamond-shaped node for decisions',
        tags: ['shape', 'basic', 'diamond', 'decision'],
        template: this.createBasicDiamond()
      },

      // ERD Templates
      {
        id: 'erd-table-option-b',
        name: 'ERD Table (SSMS Style)',
        category: 'database',
        description: 'Entity-Relationship Diagram table - SQL Server Management Studio style',
        tags: ['erd', 'database', 'table', 'ssms', 'option-b'],
        template: this.createERDTableOptionB(),
        htmlLayer: this.getERDTableOptionBHTML(),
        cssLayer: this.getERDTableOptionBCSS()
      },
      {
        id: 'erd-table-option-a',
        name: 'ERD Table (Classic)',
        category: 'database',
        description: 'Entity-Relationship Diagram table - Classic purple gradient style',
        tags: ['erd', 'database', 'table', 'classic', 'option-a'],
        template: this.createERDTableOptionA(),
        htmlLayer: this.getERDTableOptionAHTML(),
        cssLayer: this.getERDTableOptionACSS()
      },
      {
        id: 'erd-table-nested',
        name: 'ERD Table (Nested Header)',
        category: 'database',
        description: 'ERD table with nested header child defined in template - shows children array usage',
        tags: ['erd', 'database', 'table', 'nested', 'children', 'advanced'],
        template: this.createERDTableNested()
      },

      // Workflow Templates
      {
        id: 'workflow-task',
        name: 'Workflow Task',
        category: 'workflow',
        description: 'Task node for workflow diagrams',
        tags: ['workflow', 'task', 'process'],
        template: this.createWorkflowTask(),
        htmlLayer: this.getWorkflowTaskHTML(),
        cssLayer: this.getWorkflowTaskCSS()
      },

      // Dashboard Templates
      {
        id: 'dashboard-card',
        name: 'Dashboard Card',
        category: 'dashboard',
        description: 'Card widget for dashboards',
        tags: ['dashboard', 'card', 'widget'],
        template: this.createDashboardCard(),
        htmlLayer: this.getDashboardCardHTML(),
        cssLayer: this.getDashboardCardCSS()
      }
    ];
  }

  // Template Factories

  private createBasicRectangle(): NodeTemplate {
    return {
      id: 'basic-rectangle',
      version: '1.0.0',
      meta: {
        name: 'Rectangle',
        category: 'basic',
        description: 'Simple rectangular node',
        tags: ['shape', 'basic']
      },
      structure: {
        type: 'custom',
        size: { width: 200, height: 100 },
        shape: { type: 'rect', cornerRadius: 8, fill: '#e3f2fd', stroke: '#2196f3', strokeWidth: 2 },
        behavior: { draggable: true, selectable: true }
      }
    };
  }

  private createBasicCircle(): NodeTemplate {
    return {
      id: 'basic-circle',
      version: '1.0.0',
      meta: {
        name: 'Circle',
        category: 'basic',
        description: 'Simple circular node',
        tags: ['shape', 'basic']
      },
      structure: {
        type: 'custom',
        size: { width: 120, height: 120 },
        shape: { type: 'circle', fill: '#fff3e0', stroke: '#ff9800', strokeWidth: 2 },
        behavior: { draggable: true, selectable: true }
      }
    };
  }

  private createBasicDiamond(): NodeTemplate {
    return {
      id: 'basic-diamond',
      version: '1.0.0',
      meta: {
        name: 'Diamond',
        category: 'basic',
        description: 'Diamond-shaped decision node',
        tags: ['shape', 'basic', 'decision']
      },
      structure: {
        type: 'custom',
        size: { width: 140, height: 140 },
        shape: { type: 'diamond', fill: '#f3e5f5', stroke: '#9c27b0', strokeWidth: 2 },
        behavior: { draggable: true, selectable: true }
      }
    };
  }

  private createERDTableOptionB(): NodeTemplate {
    return {
      id: 'erd-table-option-b',
      version: '1.0.0',
      meta: {
        name: 'ERD Table (SSMS Style)',
        category: 'database',
        description: 'SQL Server Management Studio style table with gray header',
        tags: ['erd', 'database', 'table', 'ssms']
      },
      structure: {
        type: 'erd-table-b',
        size: { width: 250, height: 200 },
        shape: { type: 'rect', cornerRadius: 0, fill: '#ffffff', stroke: '#a1a1aa', strokeWidth: 1 },
        behavior: { draggable: true, selectable: true }
      },
      dataSchema: {
        type: 'object',
        properties: {
          tableName: { type: 'string' },
          fields: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                type: { type: 'string' },
                isPrimaryKey: { type: 'boolean' },
                isForeignKey: { type: 'boolean' }
              }
            }
          }
        },
        required: ['tableName']
      },
      defaultData: {
        tableName: 'Products',
        fields: [
          { name: 'id', type: 'INT', isPrimaryKey: true, isForeignKey: false },
          { name: 'name', type: 'VARCHAR(255)', isPrimaryKey: false, isForeignKey: false },
          { name: 'price', type: 'DECIMAL(10,2)', isPrimaryKey: false, isForeignKey: false },
          { name: 'stock', type: 'INT', isPrimaryKey: false, isForeignKey: false }
        ]
      }
    };
  }

  private createERDTableOptionA(): NodeTemplate {
    return {
      id: 'erd-table-option-a',
      version: '1.0.0',
      meta: {
        name: 'ERD Table (Classic)',
        category: 'database',
        description: 'Classic purple gradient style ERD table',
        tags: ['erd', 'database', 'table', 'classic']
      },
      structure: {
        type: 'erd-table-a',
        size: { width: 250, height: 200 },
        shape: { type: 'rect', cornerRadius: 8, fill: '#ffffff', stroke: '#667eea', strokeWidth: 2 },
        behavior: { draggable: true, selectable: true }
      },
      dataSchema: {
        type: 'object',
        properties: {
          tableName: { type: 'string' },
          fields: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                type: { type: 'string' },
                isPrimaryKey: { type: 'boolean' },
                isForeignKey: { type: 'boolean' }
              }
            }
          }
        },
        required: ['tableName']
      },
      defaultData: {
        tableName: 'Users',
        fields: [
          { name: 'id', type: 'INT', isPrimaryKey: true, isForeignKey: false },
          { name: 'email', type: 'VARCHAR(255)', isPrimaryKey: false, isForeignKey: false },
          { name: 'name', type: 'VARCHAR(100)', isPrimaryKey: false, isForeignKey: false },
          { name: 'created_at', type: 'TIMESTAMP', isPrimaryKey: false, isForeignKey: false }
        ]
      }
    };
  }

  private createERDTableNested(): NodeTemplate {
    return {
      id: 'erd-table-nested',
      version: '1.0.0',
      meta: {
        name: 'ERD Table (Nested Header)',
        category: 'database',
        description: 'ERD table with nested header child - demonstrates children array in template',
        tags: ['erd', 'database', 'nested', 'children', 'advanced']
      },
      structure: {
        type: 'erd-table-container-nested',
        role: 'container',
        size: { width: 250, height: 200 },
        shape: {
          type: 'rect',
          fill: '#ffffff',
          stroke: '#667eea',
          strokeWidth: 2,
          cornerRadius: 8,
        },
        html: {
          mode: 'template',
          template: `
            <div class="erd-table-background" style="
              width: 100%;
              height: 100%;
              background: white;
              border: 2px solid #667eea;
              border-radius: 8px;
              box-shadow: 0 2px 8px rgba(102, 126, 234, 0.15);
              overflow: hidden;
            "></div>
          `,
          className: 'node-erd-table-container',
          zIndex: 0,
        },
        behavior: {
          draggable: true,
          selectable: true,
          connectable: false,
        },
        layout: {
          direction: 'column',
          wrap: 'nowrap',
          justifyContent: 'start',
          alignItems: 'stretch',
          alignContent: 'start',
          gap: 0,
          padding: { top: 0, right: 0, bottom: 0, left: 0 },
        },
        ports: {
          enabled: false,
        },
        // THIS IS THE KEY: Children array defines nested nodes in template
        children: [
          {
            type: 'erd-table-header-nested',
            role: 'drag-handler',
            size: { width: 250, height: 45 },
            shape: {
              type: 'rect',
              fill: 'transparent',
              stroke: 'none',
            },
            html: {
              mode: 'template',
              template: `
                <div class="erd-table-header" style="
                  width: 100%;
                  height: 45px;
                  padding: 12px;
                  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                  color: white;
                  font-weight: 600;
                  font-size: 14px;
                  display: flex;
                  align-items: center;
                  gap: 8px;
                  cursor: move;
                  user-select: none;
                ">
                  <span style="font-size: 16px;">📊</span>
                  <span>{{data.tableName}}</span>
                </div>
              `,
              className: 'node-erd-header',
              zIndex: 2,
            },
            behavior: {
              draggable: true,
              dragHandler: {
                isDragHandler: true,
                dragChildren: true,
              },
              selectable: false,
            },
            ports: {
              enabled: false,
            },
          },
        ],
      },
      defaultData: {
        tableName: 'Orders',
      },
    };
  }

  private createWorkflowTask(): NodeTemplate {
    return {
      id: 'workflow-task',
      version: '1.0.0',
      meta: {
        name: 'Workflow Task',
        category: 'workflow',
        description: 'Task node for workflow diagrams',
        tags: ['workflow', 'task']
      },
      structure: {
        type: 'workflow-task',
        size: { width: 180, height: 100 },
        shape: { type: 'rect', cornerRadius: 12, fill: '#fce4ec', stroke: '#e91e63', strokeWidth: 2 },
        behavior: { draggable: true, selectable: true }
      },
      dataSchema: {
        type: 'object',
        properties: {
          taskName: { type: 'string' },
          status: { type: 'string', enum: ['pending', 'running', 'completed', 'failed'] }
        }
      },
      defaultData: {
        taskName: 'Task',
        status: 'pending'
      }
    };
  }

  private createDashboardCard(): NodeTemplate {
    return {
      id: 'dashboard-card',
      version: '1.0.0',
      meta: {
        name: 'Dashboard Card',
        category: 'dashboard',
        description: 'Card widget for dashboards',
        tags: ['dashboard', 'card', 'widget']
      },
      structure: {
        type: 'dashboard-card',
        size: { width: 300, height: 200 },
        shape: { type: 'rect', cornerRadius: 16, fill: '#fff9c4', stroke: '#fbc02d', strokeWidth: 2 },
        behavior: { draggable: true, selectable: true }
      },
      dataSchema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          value: { type: 'number' },
          unit: { type: 'string' }
        }
      },
      defaultData: {
        title: 'Metric',
        value: 0,
        unit: ''
      }
    };
  }

  // HTML/CSS Layers

  private getERDTableOptionBHTML(): string {
    return `<div class="erd-table-container-b">
  <div class="erd-table-header-b">
    <span class="header-icon">🔑</span>
    <span class="header-text">{{data.tableName}}</span>
  </div>
  <div class="erd-table-fields-b">
    {{#data.fields}}
    <div class="erd-field-row-b {{#isPrimaryKey}}primary-key{{/isPrimaryKey}}">
      <span class="field-icon">
        {{#isPrimaryKey}}🔑{{/isPrimaryKey}}
        {{#isForeignKey}}🔗{{/isForeignKey}}
      </span>
      <span class="field-name">{{name}}</span>
      <span class="field-type">{{type}}</span>
    </div>
    {{/data.fields}}
  </div>
</div>`;
  }

  private getERDTableOptionBCSS(): string {
    return `.erd-table-container-b {
  width: 100%;
  height: 100%;
  background: white;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

.erd-table-header-b {
  padding: 6px 8px;
  background: #f5f5f5;
  border-bottom: 1px solid #d4d4d8;
  color: #18181b;
  font-weight: 600;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.header-icon {
  font-size: 14px;
}

.erd-table-fields-b {
  background: white;
}

.erd-field-row-b {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  font-size: 12px;
  border-bottom: 1px solid #e5e5e5;
  min-height: 24px;
}

.erd-field-row-b:last-child {
  border-bottom: none;
}

.field-icon {
  width: 14px;
  min-width: 14px;
  text-align: center;
  font-size: 11px;
}

.field-name {
  flex: 1;
  color: #18181b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.field-name.primary-key {
  font-weight: 600;
  color: #0066cc;
}

.field-type {
  color: #71717a;
  font-size: 11px;
  font-family: 'Consolas', 'Courier New', monospace;
  white-space: nowrap;
}

.primary-key .field-name {
  font-weight: 600;
  color: #0066cc;
}`;
  }

  private getERDTableOptionAHTML(): string {
    return `<div class="erd-table-container-a">
  <div class="erd-table-header-a">
    <span class="header-icon">📊</span>
    <span class="header-text">{{data.tableName}}</span>
  </div>
  <div class="erd-table-fields-a">
    {{#data.fields}}
    <div class="erd-field-row-a {{#isPrimaryKey}}primary-key{{/isPrimaryKey}}">
      <span class="field-icon">
        {{#isPrimaryKey}}🔑{{/isPrimaryKey}}
        {{#isForeignKey}}🔗{{/isForeignKey}}
      </span>
      <span class="field-name">{{name}}</span>
      <span class="field-type">{{type}}</span>
    </div>
    {{/data.fields}}
  </div>
</div>`;
  }

  private getERDTableOptionACSS(): string {
    return `.erd-table-container-a {
  width: 100%;
  height: 100%;
  background: white;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.15);
}

.erd-table-header-a {
  padding: 12px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  font-weight: 600;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-icon {
  font-size: 16px;
}

.erd-table-fields-a {
  background: white;
}

.erd-field-row-a {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  font-size: 12px;
  border-bottom: 1px solid #e0e0e0;
  min-height: 30px;
}

.erd-field-row-a:last-child {
  border-bottom: none;
}

.field-icon {
  width: 16px;
  text-align: center;
  font-size: 14px;
}

.field-name {
  flex: 1;
  color: #2c3e50;
}

.primary-key .field-name {
  font-weight: 600;
  color: #667eea;
}

.field-type {
  color: #7f8c8d;
  font-size: 11px;
  font-family: 'Courier New', monospace;
}`;
  }

  private getWorkflowTaskHTML(): string {
    return `<div class="workflow-task">
  <div class="task-name">{{data.taskName}}</div>
  <div class="task-status status-{{data.status}}">{{data.status}}</div>
</div>`;
  }

  private getWorkflowTaskCSS(): string {
    return `.workflow-task {
  padding: 16px;
  text-align: center;
}

.task-name {
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 8px;
}

.task-status {
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 4px;
  display: inline-block;
}

.status-pending { background: #fbbf24; color: #000; }
.status-running { background: #3b82f6; color: #fff; }
.status-completed { background: #10b981; color: #fff; }
.status-failed { background: #ef4444; color: #fff; }`;
  }

  private getDashboardCardHTML(): string {
    return `<div class="dashboard-card">
  <div class="card-title">{{data.title}}</div>
  <div class="card-value">{{data.value}}<span class="card-unit">{{data.unit}}</span></div>
</div>`;
  }

  private getDashboardCardCSS(): string {
    return `.dashboard-card {
  padding: 24px;
  background: white;
  border-radius: 16px;
  box-shadow: 0 4px 6px rgba(0,0,0,0.1);
}

.card-title {
  font-size: 14px;
  color: #6b7280;
  margin-bottom: 12px;
}

.card-value {
  font-size: 32px;
  font-weight: bold;
  color: #111827;
}

.card-unit {
  font-size: 16px;
  color: #6b7280;
  margin-left: 4px;
}`;
  }
}
