/**
 * Template Library (Phase 4)
 * Comprehensive collection of pre-built node templates
 *
 * This library provides 20+ ready-to-use templates organized by category:
 * - Common: User avatars, cards, buttons, inputs, badges
 * - Workflow: Process steps, decisions, gateways, activities
 * - Data Visualization: Metrics, gauges, charts, tables
 *
 * Usage:
 * ```typescript
 * import { TemplateLibrary, NodeFactory } from '@grafloria/engine';
 *
 * // Get a template from the library
 * const template = TemplateLibrary.get('user-avatar');
 *
 * // Create a node from the template
 * const node = NodeFactory.createFromTemplate(template, {
 *   position: { x: 100, y: 100 },
 *   data: { name: 'John Doe', status: 'online' }
 * });
 * ```
 */

import type { NodeTemplate } from '../templates/NodeTemplate';
import { CommonTemplates } from './common-templates';
import { WorkflowTemplates } from './workflow-templates';
import { DataVizTemplates } from './data-viz-templates';

/**
 * Template categories for organization
 */
export type TemplateCategory = 'common' | 'workflow' | 'data-viz' | 'diagram';

/**
 * Template metadata for discovery
 */
export interface TemplateInfo {
  template: NodeTemplate;
  category: TemplateCategory;
  tags: string[];
}

/**
 * Template Library Registry
 * Central registry for all available templates
 */
class TemplateRegistry {
  private templates: Map<string, TemplateInfo> = new Map();

  /**
   * Register a template in the library
   * Accepts any template-like object and casts to NodeTemplate
   */
  register(template: any, category: TemplateCategory, tags: string[] = []): void {
    this.templates.set(template.id, {
      template: template as NodeTemplate,
      category,
      tags,
    });
  }

  /**
   * Get a template by ID
   */
  get(id: string): NodeTemplate | undefined {
    return this.templates.get(id)?.template;
  }

  /**
   * Check if a template exists
   */
  has(id: string): boolean {
    return this.templates.has(id);
  }

  /**
   * Get all templates
   */
  getAll(): NodeTemplate[] {
    return Array.from(this.templates.values()).map((info) => info.template);
  }

  /**
   * Get templates by category
   */
  getByCategory(category: TemplateCategory): NodeTemplate[] {
    return Array.from(this.templates.values())
      .filter((info) => info.category === category)
      .map((info) => info.template);
  }

  /**
   * Search templates by tag
   */
  findByTag(tag: string): NodeTemplate[] {
    return Array.from(this.templates.values())
      .filter((info) => info.tags.includes(tag))
      .map((info) => info.template);
  }

  /**
   * Search templates by name or description
   */
  search(query: string): NodeTemplate[] {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.templates.values())
      .filter((info) => {
        const template = info.template as any; // Use any to access convenience properties
        return (
          template.id.toLowerCase().includes(lowerQuery) ||
          (template.name && template.name.toLowerCase().includes(lowerQuery)) ||
          (template.description && template.description.toLowerCase().includes(lowerQuery))
        );
      })
      .map((info) => info.template);
  }

  /**
   * Get template metadata
   */
  getInfo(id: string): TemplateInfo | undefined {
    return this.templates.get(id);
  }

  /**
   * List all template IDs
   */
  list(): string[] {
    return Array.from(this.templates.keys());
  }

  /**
   * Get count of registered templates
   */
  count(): number {
    return this.templates.size;
  }

  /**
   * Clear all templates (useful for testing)
   */
  clear(): void {
    this.templates.clear();
  }
}

/**
 * Global template library instance
 */
export const TemplateLibrary = new TemplateRegistry();

/**
 * Initialize the template library with all built-in templates
 */
function initializeLibrary(): void {
  // Common Templates
  TemplateLibrary.register(CommonTemplates.UserAvatar, 'common', ['user', 'avatar', 'profile']);
  TemplateLibrary.register(CommonTemplates.CardNode, 'common', ['card', 'content', 'panel']);
  TemplateLibrary.register(CommonTemplates.ButtonNode, 'common', ['button', 'action', 'interactive']);
  TemplateLibrary.register(CommonTemplates.InputField, 'common', ['input', 'form', 'field']);
  TemplateLibrary.register(CommonTemplates.BadgeLabel, 'common', ['badge', 'label', 'tag', 'status']);
  TemplateLibrary.register(CommonTemplates.IconNode, 'common', ['icon', 'symbol']);

  // Workflow Templates
  TemplateLibrary.register(WorkflowTemplates.ProcessStep, 'workflow', ['process', 'step', 'flowchart', 'bpmn']);
  TemplateLibrary.register(WorkflowTemplates.DecisionNode, 'workflow', ['decision', 'branch', 'condition', 'flowchart']);
  TemplateLibrary.register(WorkflowTemplates.StartEvent, 'workflow', ['start', 'begin', 'trigger', 'bpmn']);
  TemplateLibrary.register(WorkflowTemplates.EndEvent, 'workflow', ['end', 'finish', 'terminate', 'bpmn']);
  TemplateLibrary.register(WorkflowTemplates.Subprocess, 'workflow', ['subprocess', 'group', 'bpmn']);
  TemplateLibrary.register(WorkflowTemplates.Gateway, 'workflow', ['gateway', 'split', 'join', 'bpmn']);
  TemplateLibrary.register(WorkflowTemplates.Activity, 'workflow', ['activity', 'task', 'action', 'bpmn']);

  // Data Visualization Templates
  TemplateLibrary.register(DataVizTemplates.MetricCard, 'data-viz', ['metric', 'kpi', 'dashboard']);
  TemplateLibrary.register(DataVizTemplates.Gauge, 'data-viz', ['gauge', 'dial', 'percentage', 'dashboard']);
  TemplateLibrary.register(DataVizTemplates.BarChart, 'data-viz', ['chart', 'bar', 'graph', 'dashboard']);
  TemplateLibrary.register(DataVizTemplates.DataTable, 'data-viz', ['table', 'grid', 'data', 'dashboard']);
  TemplateLibrary.register(DataVizTemplates.PieChart, 'data-viz', ['pie', 'chart', 'proportion', 'dashboard']);
  TemplateLibrary.register(DataVizTemplates.StatCounter, 'data-viz', ['stat', 'counter', 'number', 'dashboard']);
  TemplateLibrary.register(DataVizTemplates.ProgressBar, 'data-viz', ['progress', 'bar', 'indicator', 'dashboard']);
}

// Initialize the library on module load
initializeLibrary();

/**
 * Export all templates for direct access
 */
export { CommonTemplates } from './common-templates';
export { WorkflowTemplates } from './workflow-templates';
export { DataVizTemplates } from './data-viz-templates';

/**
 * Export individual templates for convenience
 */
export const {
  UserAvatar,
  CardNode,
  ButtonNode,
  InputField,
  BadgeLabel,
  IconNode,
} = CommonTemplates;

export const {
  ProcessStep,
  DecisionNode,
  StartEvent,
  EndEvent,
  Subprocess,
  Gateway,
  Activity,
} = WorkflowTemplates;

export const {
  MetricCard,
  Gauge,
  BarChart,
  DataTable,
  PieChart,
  StatCounter,
  ProgressBar,
} = DataVizTemplates;

/**
 * Helper functions
 */

/**
 * Get all templates as an array
 */
export function getAllTemplates(): NodeTemplate[] {
  return TemplateLibrary.getAll();
}

/**
 * Get templates grouped by category
 */
export function getTemplatesByCategory(): Record<TemplateCategory, NodeTemplate[]> {
  return {
    common: TemplateLibrary.getByCategory('common'),
    workflow: TemplateLibrary.getByCategory('workflow'),
    'data-viz': TemplateLibrary.getByCategory('data-viz'),
    diagram: TemplateLibrary.getByCategory('diagram'),
  };
}

/**
 * Create a custom template and register it
 */
export function registerCustomTemplate(
  template: NodeTemplate,
  category: TemplateCategory,
  tags: string[] = []
): void {
  TemplateLibrary.register(template, category, tags);
}

/**
 * Integration helpers for connecting to TemplateRegistry (Phase 2)
 */
export {
  registerTemplateLibrary,
  registerTemplatesByCategory,
  registerTemplatesById,
  getUnregisteredTemplates,
} from './integration';
