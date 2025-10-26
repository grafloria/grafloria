/**
 * TemplateRegistry Tests - TDD Approach
 */

import { TemplateRegistry } from './TemplateRegistry';
import { NodeTemplate, ConnectionValidator } from './NodeTemplate';
import { EventBus } from '../events/EventBus';

describe('TemplateRegistry', () => {
  let registry: TemplateRegistry;
  let eventBus: EventBus;

  const mockTemplate: NodeTemplate = {
    id: 'test-template',
    version: '1.0.0',
    meta: {
      name: 'Test Template',
      category: 'test',
      tags: ['test', 'mock'],
    },
    structure: {
      type: 'container',
    },
  };

  const mockTemplate2: NodeTemplate = {
    id: 'test-template-2',
    version: '1.0.0',
    meta: {
      name: 'Test Template 2',
      category: 'test2',
    },
    structure: {
      type: 'node',
    },
  };

  beforeEach(() => {
    eventBus = new EventBus();
    registry = new TemplateRegistry(eventBus);
  });

  describe('register', () => {
    it('should register a template', () => {
      registry.register(mockTemplate);

      const retrieved = registry.get('test-template');
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('test-template');
    });

    it('should emit template:registered event', () => {
      const spy = jest.fn();
      eventBus.on('template:registered', spy);

      registry.register(mockTemplate);

      expect(spy).toHaveBeenCalledWith({
        template: mockTemplate,
      });
    });

    it('should allow overwriting existing template', () => {
      registry.register(mockTemplate);

      const updated = { ...mockTemplate, version: '2.0.0' };
      registry.register(updated);

      const retrieved = registry.get('test-template');
      expect(retrieved?.version).toBe('2.0.0');
    });
  });

  describe('registerMany', () => {
    it('should register multiple templates', () => {
      registry.registerMany([mockTemplate, mockTemplate2]);

      expect(registry.get('test-template')).toBeDefined();
      expect(registry.get('test-template-2')).toBeDefined();
    });

    it('should emit events for each template', () => {
      const spy = jest.fn();
      eventBus.on('template:registered', spy);

      registry.registerMany([mockTemplate, mockTemplate2]);

      expect(spy).toHaveBeenCalledTimes(2);
    });
  });

  describe('unregister', () => {
    it('should unregister a template', () => {
      registry.register(mockTemplate);

      const result = registry.unregister('test-template');

      expect(result).toBe(true);
      expect(registry.get('test-template')).toBeUndefined();
    });

    it('should emit template:unregistered event', () => {
      registry.register(mockTemplate);

      const spy = jest.fn();
      eventBus.on('template:unregistered', spy);

      registry.unregister('test-template');

      expect(spy).toHaveBeenCalledWith({
        template: mockTemplate,
      });
    });

    it('should return false if template does not exist', () => {
      const result = registry.unregister('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('get', () => {
    it('should retrieve registered template', () => {
      registry.register(mockTemplate);

      const retrieved = registry.get('test-template');

      expect(retrieved).toBeDefined();
      expect(retrieved).toEqual(mockTemplate);
    });

    it('should return undefined for non-existent template', () => {
      const retrieved = registry.get('non-existent');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('getAll', () => {
    it('should return all registered templates', () => {
      registry.registerMany([mockTemplate, mockTemplate2]);

      const all = registry.getAll();

      expect(all).toHaveLength(2);
      expect(all).toContainEqual(mockTemplate);
      expect(all).toContainEqual(mockTemplate2);
    });

    it('should return empty array when no templates registered', () => {
      const all = registry.getAll();
      expect(all).toEqual([]);
    });
  });

  describe('getByCategory', () => {
    it('should return templates matching category', () => {
      registry.registerMany([mockTemplate, mockTemplate2]);

      const testCategory = registry.getByCategory('test');

      expect(testCategory).toHaveLength(1);
      expect(testCategory[0].id).toBe('test-template');
    });

    it('should return empty array for non-existent category', () => {
      registry.register(mockTemplate);

      const result = registry.getByCategory('non-existent');
      expect(result).toEqual([]);
    });
  });

  describe('search', () => {
    it('should find templates by name', () => {
      registry.register(mockTemplate);

      const results = registry.search('Test Template');

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('test-template');
    });

    it('should find templates by name case-insensitive', () => {
      registry.register(mockTemplate);

      const results = registry.search('test template');

      expect(results).toHaveLength(1);
    });

    it('should find templates by tag', () => {
      registry.register(mockTemplate);

      const results = registry.search('mock');

      expect(results).toHaveLength(1);
    });

    it('should return empty array when no matches', () => {
      registry.register(mockTemplate);

      const results = registry.search('nonexistent');

      expect(results).toEqual([]);
    });
  });

  describe('getCategories', () => {
    it('should return all unique categories', () => {
      registry.registerMany([mockTemplate, mockTemplate2]);

      const categories = registry.getCategories();

      expect(categories).toHaveLength(2);
      expect(categories).toContain('test');
      expect(categories).toContain('test2');
    });

    it('should return sorted categories', () => {
      const template3 = {
        ...mockTemplate,
        id: 'template-3',
        meta: { ...mockTemplate.meta, category: 'aaa' },
      };
      registry.registerMany([mockTemplate2, template3]);

      const categories = registry.getCategories();

      expect(categories).toEqual(['aaa', 'test2']);
    });
  });

  describe('has', () => {
    it('should return true for registered template', () => {
      registry.register(mockTemplate);

      expect(registry.has('test-template')).toBe(true);
    });

    it('should return false for non-registered template', () => {
      expect(registry.has('non-existent')).toBe(false);
    });
  });

  describe('count', () => {
    it('should return number of registered templates', () => {
      registry.registerMany([mockTemplate, mockTemplate2]);

      expect(registry.count()).toBe(2);
    });

    it('should return 0 when no templates registered', () => {
      expect(registry.count()).toBe(0);
    });
  });

  describe('clear', () => {
    it('should remove all templates', () => {
      registry.registerMany([mockTemplate, mockTemplate2]);

      registry.clear();

      expect(registry.count()).toBe(0);
      expect(registry.getAll()).toEqual([]);
    });

    it('should emit templates:cleared event', () => {
      const spy = jest.fn();
      eventBus.on('templates:cleared', spy);

      registry.clear();

      expect(spy).toHaveBeenCalled();
    });
  });

  describe('registerValidator', () => {
    it('should register connection validator', () => {
      const validator: ConnectionValidator = (source, target) => true;

      registry.registerValidator('test-validator', validator);

      const retrieved = registry.getValidator('test-validator');
      expect(retrieved).toBe(validator);
    });

    it('should retrieve registered validator', () => {
      const validator: ConnectionValidator = (source, target) => {
        return source.id !== target.id;
      };

      registry.registerValidator('no-self-connect', validator);

      const retrieved = registry.getValidator('no-self-connect');
      expect(retrieved).toBeDefined();

      // Test validator works
      const result = retrieved!({ id: 'a' }, { id: 'b' });
      expect(result).toBe(true);
    });
  });

  describe('getValidator', () => {
    it('should return undefined for non-existent validator', () => {
      const validator = registry.getValidator('non-existent');
      expect(validator).toBeUndefined();
    });
  });
});
