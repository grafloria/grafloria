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
import { WorkflowTemplates} from './workflow-templates';
import { DataVizTemplates } from './data-viz-templates';
import { ERDTemplates } from './erd-templates';

/**
 * Template categories for organization
 */
export type TemplateCategory = 'common' | 'workflow' | 'data-viz' | 'diagram' | 'erd';

/**
 * Template metadata for discovery
 */
export interface TemplateInfo {
  template: NodeTemplate;
  category: TemplateCategory;
  tags: string[];
}

/**
 * Template Library Manager
 * Simple registry for template library with category and tag support
 *
 * Note: This is separate from the Phase 2 TemplateRegistry which requires EventBus.
 * Use integration.ts functions to connect this library to a Phase 2 TemplateRegistry.
 */
class TemplateLibraryManager {
  private templates: Map<string, TemplateInfo> = new Map();

  /**
   * Register a template in the library
   */
  register(template: NodeTemplate, category: TemplateCategory, tags: string[] = []): void {
    this.templates.set(template.id, {
      template,
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
        const template = info.template;
        return (
          template.id.toLowerCase().includes(lowerQuery) ||
          (template.meta?.name && template.meta.name.toLowerCase().includes(lowerQuery)) ||
          (template.meta?.description && template.meta.description.toLowerCase().includes(lowerQuery))
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
 * Initialize a template library with all built-in templates
 * @param manager - Library manager to populate (optional, creates new if not provided)
 * @returns Populated template library manager
 */
export function initializeTemplateLibrary(manager?: TemplateLibraryManager): TemplateLibraryManager {
  const lib = manager || new TemplateLibraryManager();

  // Common Templates
  lib.register(CommonTemplates.UserAvatar, 'common', ['user', 'avatar', 'profile']);
  lib.register(CommonTemplates.CardNode, 'common', ['card', 'content', 'panel']);
  lib.register(CommonTemplates.ButtonNode, 'common', ['button', 'action', 'interactive']);
  lib.register(CommonTemplates.InputField, 'common', ['input', 'form', 'field']);
  lib.register(CommonTemplates.BadgeLabel, 'common', ['badge', 'label', 'tag', 'status']);
  lib.register(CommonTemplates.IconNode, 'common', ['icon', 'symbol']);

  // Workflow Templates
  lib.register(WorkflowTemplates.ProcessStep, 'workflow', ['process', 'step', 'flowchart', 'bpmn']);
  lib.register(WorkflowTemplates.DecisionNode, 'workflow', ['decision', 'branch', 'condition', 'flowchart']);
  lib.register(WorkflowTemplates.StartEvent, 'workflow', ['start', 'begin', 'trigger', 'bpmn']);
  lib.register(WorkflowTemplates.EndEvent, 'workflow', ['end', 'finish', 'terminate', 'bpmn']);
  lib.register(WorkflowTemplates.Subprocess, 'workflow', ['subprocess', 'group', 'bpmn']);
  lib.register(WorkflowTemplates.Gateway, 'workflow', ['gateway', 'split', 'join', 'bpmn']);
  lib.register(WorkflowTemplates.Activity, 'workflow', ['activity', 'task', 'action', 'bpmn']);

  // Data Visualization Templates
  lib.register(DataVizTemplates.MetricCard, 'data-viz', ['metric', 'kpi', 'dashboard']);
  lib.register(DataVizTemplates.Gauge, 'data-viz', ['gauge', 'dial', 'percentage', 'dashboard']);
  lib.register(DataVizTemplates.BarChart, 'data-viz', ['chart', 'bar', 'graph', 'dashboard']);
  lib.register(DataVizTemplates.DataTable, 'data-viz', ['table', 'grid', 'data', 'dashboard']);
  lib.register(DataVizTemplates.PieChart, 'data-viz', ['pie', 'chart', 'proportion', 'dashboard']);
  lib.register(DataVizTemplates.StatCounter, 'data-viz', ['stat', 'counter', 'number', 'dashboard']);
  lib.register(DataVizTemplates.ProgressBar, 'data-viz', ['progress', 'bar', 'indicator', 'dashboard']);

  // ERD Templates
  lib.register(ERDTemplates.ERDTable, 'erd', ['database', 'table', 'schema', 'erd']);
  lib.register(ERDTemplates.ERDField, 'erd', ['database', 'field', 'column', 'erd']);
  lib.register(ERDTemplates.ERDRelationship, 'erd', ['database', 'relationship', 'erd', 'many-to-many']);

  return lib;
}

/**
 * Create a new template library instance
 * Factory function for creating template library managers
 * @param includeBuiltIn - Whether to include built-in templates (default: true)
 * @returns New template library manager instance
 */
export function createTemplateLibrary(includeBuiltIn = true): TemplateLibraryManager {
  if (includeBuiltIn) {
    return initializeTemplateLibrary();
  }
  return new TemplateLibraryManager();
}

/**
 * Default template library instance (lazy initialized)
 * For backward compatibility and convenience
 */
let defaultInstance: TemplateLibraryManager | null = null;

/**
 * Get the default template library instance
 * Lazy initialization - only created when first accessed
 */
function getDefaultInstance(): TemplateLibraryManager {
  if (!defaultInstance) {
    defaultInstance = initializeTemplateLibrary();
  }
  return defaultInstance;
}

/**
 * Global template library instance (backward compatible)
 * Uses lazy initialization via getter
 */
export const TemplateLibrary = new Proxy({} as TemplateLibraryManager, {
  get(_target, prop) {
    const instance = getDefaultInstance();
    const value = instance[prop as keyof TemplateLibraryManager];

    // Bind methods to the instance
    if (typeof value === 'function') {
      return value.bind(instance);
    }
    return value;
  },
});

/**
 * Export all templates for direct access
 */
export { CommonTemplates } from './common-templates';
export { WorkflowTemplates } from './workflow-templates';
export { DataVizTemplates } from './data-viz-templates';
export { ERDTemplates } from './erd-templates';

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

export const {
  ERDTable,
  ERDField,
  ERDRelationship,
} = ERDTemplates;

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
    erd: TemplateLibrary.getByCategory('erd'),
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
