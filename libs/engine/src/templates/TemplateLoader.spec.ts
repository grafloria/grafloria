/**
 * TemplateLoader Tests - TDD Approach
 */

import { TemplateLoader } from './TemplateLoader';
import { NodeTemplate } from './NodeTemplate';

describe('TemplateLoader', () => {
  describe('fromJSON', () => {
    it('should load valid template from JSON string', () => {
      const json = JSON.stringify({
        id: 'test-template',
        version: '1.0.0',
        meta: {
          name: 'Test Template',
          category: 'test',
        },
        structure: {
          type: 'container',
        },
      });

      const template = TemplateLoader.fromJSON(json);

      expect(template).toBeDefined();
      expect(template.id).toBe('test-template');
      expect(template.version).toBe('1.0.0');
      expect(template.meta.name).toBe('Test Template');
      expect(template.structure.type).toBe('container');
    });

    it('should throw error for invalid JSON', () => {
      const invalidJson = '{ invalid json }';

      expect(() => TemplateLoader.fromJSON(invalidJson)).toThrow();
    });

    it('should throw error for template without id', () => {
      const json = JSON.stringify({
        version: '1.0.0',
        meta: { name: 'Test', category: 'test' },
        structure: { type: 'container' },
      });

      expect(() => TemplateLoader.fromJSON(json)).toThrow('Template must have an id');
    });

    it('should throw error for template without version', () => {
      const json = JSON.stringify({
        id: 'test',
        meta: { name: 'Test', category: 'test' },
        structure: { type: 'container' },
      });

      expect(() => TemplateLoader.fromJSON(json)).toThrow('Template must have a version');
    });

    it('should throw error for template without meta', () => {
      const json = JSON.stringify({
        id: 'test',
        version: '1.0.0',
        structure: { type: 'container' },
      });

      expect(() => TemplateLoader.fromJSON(json)).toThrow('Template must have meta information');
    });

    it('should throw error for template without structure', () => {
      const json = JSON.stringify({
        id: 'test',
        version: '1.0.0',
        meta: { name: 'Test', category: 'test' },
      });

      expect(() => TemplateLoader.fromJSON(json)).toThrow('Template must have a structure definition');
    });
  });

  describe('fromObject', () => {
    it('should load valid template from object', () => {
      const obj = {
        id: 'test-template',
        version: '1.0.0',
        meta: {
          name: 'Test Template',
          category: 'test',
        },
        structure: {
          type: 'container',
        },
      };

      const template = TemplateLoader.fromObject(obj);

      expect(template).toBeDefined();
      expect(template.id).toBe('test-template');
      expect(template.version).toBe('1.0.0');
    });

    it('should validate required fields', () => {
      const invalidObj = {
        id: 'test',
        // Missing version
        meta: { name: 'Test', category: 'test' },
        structure: { type: 'container' },
      };

      expect(() => TemplateLoader.fromObject(invalidObj)).toThrow();
    });
  });

  describe('fromJSONArray', () => {
    it('should load multiple templates from JSON array', () => {
      const json = JSON.stringify([
        {
          id: 'template-1',
          version: '1.0.0',
          meta: { name: 'Template 1', category: 'test' },
          structure: { type: 'container' },
        },
        {
          id: 'template-2',
          version: '1.0.0',
          meta: { name: 'Template 2', category: 'test' },
          structure: { type: 'node' },
        },
      ]);

      const templates = TemplateLoader.fromJSONArray(json);

      expect(templates).toHaveLength(2);
      expect(templates[0].id).toBe('template-1');
      expect(templates[1].id).toBe('template-2');
    });

    it('should throw error for non-array JSON', () => {
      const json = JSON.stringify({ id: 'test' });

      expect(() => TemplateLoader.fromJSONArray(json)).toThrow('Expected array of templates');
    });
  });

  describe('toJSON', () => {
    it('should export template to JSON string', () => {
      const template: NodeTemplate = {
        id: 'test-template',
        version: '1.0.0',
        meta: {
          name: 'Test Template',
          category: 'test',
        },
        structure: {
          type: 'container',
        },
      };

      const json = TemplateLoader.toJSON(template);

      expect(json).toBeDefined();
      expect(typeof json).toBe('string');

      const parsed = JSON.parse(json);
      expect(parsed.id).toBe('test-template');
    });

    it('should export pretty JSON by default', () => {
      const template: NodeTemplate = {
        id: 'test',
        version: '1.0.0',
        meta: { name: 'Test', category: 'test' },
        structure: { type: 'container' },
      };

      const json = TemplateLoader.toJSON(template);

      expect(json).toContain('\n'); // Has newlines (pretty)
      expect(json).toContain('  '); // Has indentation
    });

    it('should export compact JSON when pretty=false', () => {
      const template: NodeTemplate = {
        id: 'test',
        version: '1.0.0',
        meta: { name: 'Test', category: 'test' },
        structure: { type: 'container' },
      };

      const json = TemplateLoader.toJSON(template, false);

      expect(json).not.toContain('\n  '); // No indentation
    });
  });

  describe('toJSONArray', () => {
    it('should export multiple templates to JSON array', () => {
      const templates: NodeTemplate[] = [
        {
          id: 'template-1',
          version: '1.0.0',
          meta: { name: 'Template 1', category: 'test' },
          structure: { type: 'container' },
        },
        {
          id: 'template-2',
          version: '1.0.0',
          meta: { name: 'Template 2', category: 'test' },
          structure: { type: 'node' },
        },
      ];

      const json = TemplateLoader.toJSONArray(templates);

      expect(json).toBeDefined();
      expect(typeof json).toBe('string');

      const parsed = JSON.parse(json);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(2);
    });
  });

  describe('Round-trip conversion', () => {
    it('should preserve template data through JSON round-trip', () => {
      const original: NodeTemplate = {
        id: 'test-template',
        version: '1.0.0',
        meta: {
          name: 'Test Template',
          description: 'A test template',
          category: 'test',
          icon: '🧪',
          tags: ['test', 'example'],
        },
        structure: {
          type: 'container',
          size: { width: 200, height: 100 },
          ports: {
            enabled: true,
            top: { enabled: true, type: 'input' },
            bottom: { enabled: true, type: 'output' },
          },
        },
        defaultData: {
          label: 'Default Label',
        },
      };

      const json = TemplateLoader.toJSON(original);
      const restored = TemplateLoader.fromJSON(json);

      expect(restored).toEqual(original);
    });
  });
});
