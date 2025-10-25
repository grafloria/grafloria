/**
 * TemplateRegistry - Central registry for node templates
 *
 * Manages:
 * - Template registration and lookup
 * - Category and tag-based search
 * - Connection validator registry
 * - Event notifications
 */

import { NodeTemplate, ConnectionValidator } from './NodeTemplate';
import { EventBus } from '../events/EventBus';

export class TemplateRegistry {
  private templates = new Map<string, NodeTemplate>();
  private validators = new Map<string, ConnectionValidator>();

  constructor(private eventBus: EventBus) {}

  /**
   * Register a template
   */
  register(template: NodeTemplate): void {
    this.templates.set(template.id, template);
    this.eventBus.emit('template:registered', { template });
  }

  /**
   * Register multiple templates
   */
  registerMany(templates: NodeTemplate[]): void {
    templates.forEach(t => this.register(t));
  }

  /**
   * Unregister a template
   * @returns true if template was removed, false if it didn't exist
   */
  unregister(templateId: string): boolean {
    const template = this.templates.get(templateId);
    if (template) {
      this.templates.delete(templateId);
      this.eventBus.emit('template:unregistered', { template });
      return true;
    }
    return false;
  }

  /**
   * Get template by ID
   */
  get(id: string): NodeTemplate | undefined {
    return this.templates.get(id);
  }

  /**
   * Get all registered templates
   */
  getAll(): NodeTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * Get templates by category
   */
  getByCategory(category: string): NodeTemplate[] {
    return this.getAll().filter(t => t.meta.category === category);
  }

  /**
   * Search templates by name, description, or tags
   */
  search(query: string): NodeTemplate[] {
    const lowerQuery = query.toLowerCase();
    return this.getAll().filter(t => {
      // Search in name
      if (t.meta.name.toLowerCase().includes(lowerQuery)) {
        return true;
      }

      // Search in description
      if (t.meta.description?.toLowerCase().includes(lowerQuery)) {
        return true;
      }

      // Search in tags
      if (t.meta.tags?.some(tag => tag.toLowerCase().includes(lowerQuery))) {
        return true;
      }

      return false;
    });
  }

  /**
   * Get all unique categories (sorted)
   */
  getCategories(): string[] {
    const categories = new Set<string>();
    this.getAll().forEach(t => categories.add(t.meta.category));
    return Array.from(categories).sort();
  }

  /**
   * Check if template exists
   */
  has(templateId: string): boolean {
    return this.templates.has(templateId);
  }

  /**
   * Get template count
   */
  count(): number {
    return this.templates.size;
  }

  /**
   * Clear all templates
   */
  clear(): void {
    this.templates.clear();
    this.eventBus.emit('templates:cleared', {
      timestamp: Date.now(),
    });
  }

  /**
   * Register custom connection validator
   */
  registerValidator(id: string, validator: ConnectionValidator): void {
    this.validators.set(id, validator);
  }

  /**
   * Get connection validator
   */
  getValidator(id: string): ConnectionValidator | undefined {
    return this.validators.get(id);
  }
}
