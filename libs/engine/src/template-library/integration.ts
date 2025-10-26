/**
 * Template Library Integration Helpers
 * Connects Phase 4 TemplateLibrary with Phase 2 TemplateRegistry
 */

import type { TemplateRegistry } from '../templates/TemplateRegistry';
import { CommonTemplates } from './common-templates';
import { WorkflowTemplates } from './workflow-templates';
import { DataVizTemplates } from './data-viz-templates';
// Temporarily commented out to test build
// import { ERDTemplates } from './erd-templates';
import type { NodeTemplate } from '../templates/NodeTemplate';

// Collect all templates without importing from index
function getAllLibraryTemplates(): NodeTemplate[] {
  return [
    ...Object.values(CommonTemplates),
    ...Object.values(WorkflowTemplates),
    ...Object.values(DataVizTemplates),
    // ...Object.values(ERDTemplates),
  ];
}

// Get template by ID
function getLibraryTemplateById(id: string): NodeTemplate | undefined {
  const all = getAllLibraryTemplates();
  return all.find(t => t.id === id);
}

// Get all template IDs
function getLibraryTemplateIds(): string[] {
  return getAllLibraryTemplates().map(t => t.id);
}

// Get templates by category
function getLibraryTemplatesByCategory(category: string): NodeTemplate[] {
  const all = getAllLibraryTemplates();
  return all.filter(t => t.meta.category === category);
}

/**
 * Register all Phase 4 templates into a TemplateRegistry instance
 *
 * Use this to make the template library available to NodeFactory:
 *
 * @example
 * ```typescript
 * import { registerTemplateLibrary } from '@grafloria/engine';
 *
 * // In your engine setup
 * const count = registerTemplateLibrary(engine.templateRegistry);
 * // count = 20 (number of templates registered)
 *
 * // Now you can use templates with NodeFactory
 * const node = engine.nodeFactory.createFromTemplate(
 *   'user-avatar',
 *   { name: 'John', status: 'online' },
 *   { x: 100, y: 100 }
 * );
 * ```
 * @returns Number of templates registered
 */
export function registerTemplateLibrary(registry: TemplateRegistry): number {
  const templates = getAllLibraryTemplates();

  // Register all templates from the library
  templates.forEach((template) => {
    registry.register(template);
  });

  return templates.length;
}

/**
 * Register templates from a specific category
 *
 * @example
 * ```typescript
 * // Only register workflow templates
 * const count = registerTemplatesByCategory(engine.templateRegistry, 'workflow');
 * // count = 7 (number of workflow templates)
 * ```
 * @returns Number of templates registered
 */
export function registerTemplatesByCategory(
  registry: TemplateRegistry,
  category: 'common' | 'workflow' | 'data-viz' | 'diagram' | 'erd'
): number {
  const templates = getLibraryTemplatesByCategory(category);

  templates.forEach((template) => {
    registry.register(template);
  });

  return templates.length;
}

/**
 * Registration result for template by ID
 */
export interface TemplateRegistrationResult {
  /** Number of templates successfully registered */
  registered: number;
  /** IDs of templates that were not found */
  notFound: string[];
  /** Total number of template IDs requested */
  total: number;
}

/**
 * Register specific templates by ID
 *
 * @example
 * ```typescript
 * // Only register specific templates
 * const result = registerTemplatesById(engine.templateRegistry, [
 *   'user-avatar',
 *   'card-node',
 *   'process-step'
 * ]);
 * // result = { registered: 3, notFound: [], total: 3 }
 * ```
 * @returns Registration result with counts and missing template IDs
 */
export function registerTemplatesById(
  registry: TemplateRegistry,
  templateIds: string[]
): TemplateRegistrationResult {
  const result: TemplateRegistrationResult = {
    registered: 0,
    notFound: [],
    total: templateIds.length,
  };

  templateIds.forEach((id) => {
    const template = getLibraryTemplateById(id);
    if (template) {
      registry.register(template);
      result.registered++;
    } else {
      result.notFound.push(id);
    }
  });

  return result;
}

/**
 * Check if templates are registered in a TemplateRegistry
 *
 * @example
 * ```typescript
 * const missing = getUnregisteredTemplates(engine.templateRegistry);
 * if (missing.length > 0) {
 *   console.log('Missing templates:', missing);
 *   registerTemplateLibrary(engine.templateRegistry);
 * }
 * ```
 */
export function getUnregisteredTemplates(registry: TemplateRegistry): string[] {
  const libraryTemplates = getLibraryTemplateIds();
  const unregistered: string[] = [];

  libraryTemplates.forEach((id) => {
    if (!registry.has(id)) {
      unregistered.push(id);
    }
  });

  return unregistered;
}
