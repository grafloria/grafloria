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
import { EventBus } from '../events/EventBus';

describe('Template Library Integration', () => {
  let registry: TemplateRegistry;
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
    registry = new TemplateRegistry(eventBus);
  });

  describe('registerTemplateLibrary', () => {
    it('should register all 20 templates', () => {
      registerTemplateLibrary(registry);

      // Check that all templates are registered
      expect(registry.has('user-avatar')).toBe(true);
      expect(registry.has('process-step')).toBe(true);
      expect(registry.has('metric-card')).toBe(true);

      // Should have all 20 templates
      const all = registry.getAll();
      expect(all.length).toBe(20);
    });

    it('should not duplicate registrations', () => {
      registerTemplateLibrary(registry);
      registerTemplateLibrary(registry); // Register again

      const all = registry.getAll();
      expect(all.length).toBe(20); // Still 20, not 40
    });
  });

  describe('registerTemplatesByCategory', () => {
    it('should register only common templates', () => {
      registerTemplatesByCategory(registry, 'common');

      expect(registry.has('user-avatar')).toBe(true);
      expect(registry.has('card-node')).toBe(true);
      expect(registry.has('process-step')).toBe(false); // workflow
      expect(registry.has('metric-card')).toBe(false); // data-viz

      const all = registry.getAll();
      expect(all.length).toBe(6);
    });

    it('should register only workflow templates', () => {
      registerTemplatesByCategory(registry, 'workflow');

      expect(registry.has('process-step')).toBe(true);
      expect(registry.has('decision-node')).toBe(true);
      expect(registry.has('user-avatar')).toBe(false); // common

      const all = registry.getAll();
      expect(all.length).toBe(7);
    });

    it('should register only data-viz templates', () => {
      registerTemplatesByCategory(registry, 'data-viz');

      expect(registry.has('metric-card')).toBe(true);
      expect(registry.has('gauge')).toBe(true);
      expect(registry.has('user-avatar')).toBe(false); // common

      const all = registry.getAll();
      expect(all.length).toBe(7);
    });
  });

  describe('registerTemplatesById', () => {
    it('should register specific templates', () => {
      registerTemplatesById(registry, [
        'user-avatar',
        'process-step',
        'metric-card'
      ]);

      expect(registry.has('user-avatar')).toBe(true);
      expect(registry.has('process-step')).toBe(true);
      expect(registry.has('metric-card')).toBe(true);
      expect(registry.has('card-node')).toBe(false);

      const all = registry.getAll();
      expect(all.length).toBe(3);
    });

    it('should handle non-existent template IDs gracefully', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      registerTemplatesById(registry, [
        'user-avatar',
        'non-existent-template',
        'metric-card'
      ]);

      expect(registry.has('user-avatar')).toBe(true);
      expect(registry.has('metric-card')).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith('Template not found: non-existent-template');

      const all = registry.getAll();
      expect(all.length).toBe(2);

      consoleSpy.mockRestore();
    });

    it('should handle empty array', () => {
      registerTemplatesById(registry, []);

      const all = registry.getAll();
      expect(all.length).toBe(0);
    });
  });

  describe('getUnregisteredTemplates', () => {
    it('should return all template IDs when none registered', () => {
      const unregistered = getUnregisteredTemplates(registry);
      expect(unregistered.length).toBe(20);
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
      expect(unregistered.length).toBe(18);
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
