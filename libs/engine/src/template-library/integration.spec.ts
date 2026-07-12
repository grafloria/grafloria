/**
 * Template Library Integration Tests
 * Tests integration between TemplateLibrary and TemplateRegistry
 */

import {
  registerTemplateLibrary,
  registerTemplatesByCategory,
  registerTemplatesById,
  getUnregisteredTemplates,
} from './integration';
import { TemplateRegistry } from '../templates/TemplateRegistry';
import { getAllTemplates } from './index';
import { EventBus } from '../events/EventBus';

// The library grows over time — count against the source of truth instead of
// hardcoding a number that goes stale with every new template
const LIBRARY_SIZE = getAllTemplates().length;

describe('Template Library Integration', () => {
  let registry: TemplateRegistry;
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
    registry = new TemplateRegistry(eventBus);
  });

  describe('registerTemplateLibrary', () => {
    it('should register every library template', () => {
      const count = registerTemplateLibrary(registry);

      expect(count).toBe(LIBRARY_SIZE);

      // Check that all templates are registered
      expect(registry.has('user-avatar')).toBe(true);
      expect(registry.has('process-step')).toBe(true);
      expect(registry.has('metric-card')).toBe(true);

      const all = registry.getAll();
      expect(all.length).toBe(LIBRARY_SIZE);
    });

    it('should not duplicate registrations', () => {
      const count1 = registerTemplateLibrary(registry);
      const count2 = registerTemplateLibrary(registry); // Register again

      expect(count1).toBe(LIBRARY_SIZE);
      expect(count2).toBe(LIBRARY_SIZE);

      const all = registry.getAll();
      expect(all.length).toBe(LIBRARY_SIZE); // no duplicates on re-register
    });
  });

  describe('registerTemplatesByCategory', () => {
    it('should register only common templates', () => {
      const count = registerTemplatesByCategory(registry, 'common');

      expect(count).toBe(6);
      expect(registry.has('user-avatar')).toBe(true);
      expect(registry.has('card-node')).toBe(true);
      expect(registry.has('process-step')).toBe(false); // workflow
      expect(registry.has('metric-card')).toBe(false); // data-viz

      const all = registry.getAll();
      expect(all.length).toBe(6);
    });

    it('should register only workflow templates', () => {
      const count = registerTemplatesByCategory(registry, 'workflow');

      expect(count).toBe(7);
      expect(registry.has('process-step')).toBe(true);
      expect(registry.has('decision-node')).toBe(true);
      expect(registry.has('user-avatar')).toBe(false); // common

      const all = registry.getAll();
      expect(all.length).toBe(7);
    });

    it('should register only data-viz templates', () => {
      const count = registerTemplatesByCategory(registry, 'data-viz');

      expect(count).toBe(7);
      expect(registry.has('metric-card')).toBe(true);
      expect(registry.has('gauge')).toBe(true);
      expect(registry.has('user-avatar')).toBe(false); // common

      const all = registry.getAll();
      expect(all.length).toBe(7);
    });
  });

  describe('registerTemplatesById', () => {
    it('should register specific templates', () => {
      const result = registerTemplatesById(registry, [
        'user-avatar',
        'process-step',
        'metric-card'
      ]);

      expect(result.registered).toBe(3);
      expect(result.notFound).toEqual([]);
      expect(result.total).toBe(3);

      expect(registry.has('user-avatar')).toBe(true);
      expect(registry.has('process-step')).toBe(true);
      expect(registry.has('metric-card')).toBe(true);
      expect(registry.has('card-node')).toBe(false);

      const all = registry.getAll();
      expect(all.length).toBe(3);
    });

    it('should handle non-existent template IDs gracefully', () => {
      const result = registerTemplatesById(registry, [
        'user-avatar',
        'non-existent-template',
        'metric-card'
      ]);

      expect(result.registered).toBe(2);
      expect(result.notFound).toEqual(['non-existent-template']);
      expect(result.total).toBe(3);

      expect(registry.has('user-avatar')).toBe(true);
      expect(registry.has('metric-card')).toBe(true);

      const all = registry.getAll();
      expect(all.length).toBe(2);
    });

    it('should handle empty array', () => {
      const result = registerTemplatesById(registry, []);

      expect(result.registered).toBe(0);
      expect(result.notFound).toEqual([]);
      expect(result.total).toBe(0);

      const all = registry.getAll();
      expect(all.length).toBe(0);
    });
  });

  describe('getUnregisteredTemplates', () => {
    it('should return all template IDs when none registered', () => {
      const unregistered = getUnregisteredTemplates(registry);
      expect(unregistered.length).toBe(LIBRARY_SIZE);
      expect(unregistered).toContain('user-avatar');
      expect(unregistered).toContain('process-step');
    });

    it('should return empty array when all registered', () => {
      registerTemplateLibrary(registry);
      const unregistered = getUnregisteredTemplates(registry);
      expect(unregistered.length).toBe(0);
    });

    it('should return only unregistered templates', () => {
      registerTemplatesById(registry, ['user-avatar', 'card-node']);

      const unregistered = getUnregisteredTemplates(registry);
      expect(unregistered.length).toBe(LIBRARY_SIZE - 2);
      expect(unregistered).not.toContain('user-avatar');
      expect(unregistered).not.toContain('card-node');
      expect(unregistered).toContain('process-step');
      expect(unregistered).toContain('metric-card');
    });
  });

  describe('Integration with NodeFactory', () => {
    it('should make templates available to NodeFactory', () => {
      registerTemplateLibrary(registry);

      // Verify template can be retrieved by ID (as NodeFactory does)
      const template = registry.get('user-avatar');
      expect(template).toBeDefined();
      expect(template?.id).toBe('user-avatar');
    });

    it('should preserve template structure', () => {
      registerTemplateLibrary(registry);

      const template = registry.get('process-step');
      expect(template?.structure).toBeDefined();
      expect(template?.structure.shape).toBeDefined();
      expect(template?.structure.html).toBeDefined();
    });

    it('should preserve default data', () => {
      registerTemplateLibrary(registry);

      const template = registry.get('user-avatar');
      expect(template?.defaultData).toBeDefined();
    });
  });
});
