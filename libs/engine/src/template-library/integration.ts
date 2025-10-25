/**
 * Template Library Integration Helpers
 * Connects Phase 4 TemplateLibrary with Phase 2 TemplateRegistry
 */

import type { TemplateRegistry } from '../templates/TemplateRegistry';
import { TemplateLibrary } from './index';

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
  const templates = TemplateLibrary.getAll();

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
  category: 'common' | 'workflow' | 'data-viz' | 'diagram'
): number {
  const templates = TemplateLibrary.getByCategory(category);

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
    const template = TemplateLibrary.get(id);
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
  const libraryTemplates = TemplateLibrary.list();
  const unregistered: string[] = [];

  libraryTemplates.forEach((id) => {
    if (!registry.has(id)) {
      unregistered.push(id);
    }
  });

  return unregistered;
}
