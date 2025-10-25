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
 * registerTemplateLibrary(engine.templateRegistry);
 *
 * // Now you can use templates with NodeFactory
 * const node = engine.nodeFactory.createFromTemplate(
 *   'user-avatar',
 *   { name: 'John', status: 'online' },
 *   { x: 100, y: 100 }
 * );
 * ```
 */
export function registerTemplateLibrary(registry: TemplateRegistry): void {
  const templates = TemplateLibrary.getAll();

  // Register all templates from the library
  templates.forEach((template) => {
    // Cast to any to handle the FlexibleTemplate vs NodeTemplate difference
    registry.register(template as any);
  });

  console.log(`Registered ${templates.length} templates from TemplateLibrary`);
}

/**
 * Register templates from a specific category
 *
 * @example
 * ```typescript
 * // Only register workflow templates
 * registerTemplatesByCategory(engine.templateRegistry, 'workflow');
 * ```
 */
export function registerTemplatesByCategory(
  registry: TemplateRegistry,
  category: 'common' | 'workflow' | 'data-viz' | 'diagram'
): void {
  const templates = TemplateLibrary.getByCategory(category);

  templates.forEach((template) => {
    registry.register(template as any);
  });

  console.log(`Registered ${templates.length} ${category} templates`);
}

/**
 * Register specific templates by ID
 *
 * @example
 * ```typescript
 * // Only register specific templates
 * registerTemplatesById(engine.templateRegistry, [
 *   'user-avatar',
 *   'card-node',
 *   'process-step'
 * ]);
 * ```
 */
export function registerTemplatesById(
  registry: TemplateRegistry,
  templateIds: string[]
): void {
  let registered = 0;

  templateIds.forEach((id) => {
    const template = TemplateLibrary.get(id);
    if (template) {
      registry.register(template as any);
      registered++;
    } else {
      console.warn(`Template not found: ${id}`);
    }
  });

  console.log(`Registered ${registered}/${templateIds.length} templates`);
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
