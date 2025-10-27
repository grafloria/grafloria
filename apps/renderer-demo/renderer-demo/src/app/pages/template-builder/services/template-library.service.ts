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
        id: 'erd-table',
        name: 'ERD Table',
        category: 'database',
        description: 'Entity-Relationship Diagram table',
        tags: ['erd', 'database', 'table'],
        template: this.createERDTable(),
        htmlLayer: this.getERDTableHTML(),
        cssLayer: this.getERDTableCSS()
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
        shape: { type: 'rect', cornerRadius: 8 },
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
        shape: { type: 'circle' },
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
        shape: { type: 'diamond' },
        behavior: { draggable: true, selectable: true }
      }
    };
  }

  private createERDTable(): NodeTemplate {
    return {
      id: 'erd-table',
      version: '1.0.0',
      meta: {
        name: 'ERD Table',
        category: 'database',
        description: 'Entity-Relationship Diagram table',
        tags: ['erd', 'database', 'table']
      },
      structure: {
        type: 'erd-table',
        size: { width: 250, height: 45 },
        shape: { type: 'rect', cornerRadius: 8 },
        behavior: { draggable: true, selectable: true }
      },
      dataSchema: {
        type: 'object',
        properties: {
          tableName: { type: 'string' }
        },
        required: ['tableName']
      },
      defaultData: {
        tableName: 'TableName'
      }
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
        shape: { type: 'rect', cornerRadius: 12 },
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
        shape: { type: 'rect', cornerRadius: 16 },
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

  private getERDTableHTML(): string {
    return `<div class="erd-table-header">
  <div class="table-name">{{data.tableName}}</div>
</div>`;
  }

  private getERDTableCSS(): string {
    return `.erd-table-header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 12px;
  font-weight: bold;
  border-radius: 8px 8px 0 0;
}

.table-name {
  font-size: 14px;
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
