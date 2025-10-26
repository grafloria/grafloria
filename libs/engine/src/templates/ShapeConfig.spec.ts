// ShapeConfig Tests (Phase 3.1 - TDD)

import { NodeTemplate, ShapeConfig, NodeStructureDefinition } from './NodeTemplate';
import { TemplateLoader } from './TemplateLoader';

describe('ShapeConfig (Phase 3.1)', () => {
  describe('Shape Type Definitions', () => {
    it('should accept all valid shape types', () => {
      const shapes: ShapeConfig[] = [
        { type: 'rect' },
        { type: 'circle' },
        { type: 'ellipse' },
        { type: 'diamond' },
        { type: 'hexagon' },
      ];

      // TypeScript compilation validates these are valid
      expect(shapes.length).toBe(5);
    });

    it('should support shape with fill and stroke', () => {
      const shape: ShapeConfig = {
        type: 'circle',
        fill: '#ff0000',
        stroke: '#000000',
        strokeWidth: 2,
      };

      expect(shape.fill).toBe('#ff0000');
      expect(shape.stroke).toBe('#000000');
      expect(shape.strokeWidth).toBe(2);
    });

    it('should support corner radius for rectangles', () => {
      const shape: ShapeConfig = {
        type: 'rect',
        cornerRadius: 8,
      };

      expect(shape.cornerRadius).toBe(8);
    });

    it('should support opacity', () => {
      const shape: ShapeConfig = {
        type: 'circle',
        opacity: 0.5,
      };

      expect(shape.opacity).toBe(0.5);
    });
  });

  describe('NodeStructureDefinition with Shape', () => {
    it('should include shape in structure definition', () => {
      const structure: NodeStructureDefinition = {
        type: 'test-node',
        shape: {
          type: 'circle',
          fill: '#e3f2fd',
          stroke: '#1976d2',
          strokeWidth: 2,
        },
        size: { width: 100, height: 100 },
      };

      expect(structure.shape).toBeDefined();
      expect(structure.shape?.type).toBe('circle');
      expect(structure.shape?.fill).toBe('#e3f2fd');
    });

    it('should allow structure without shape (backward compatibility)', () => {
      const structure: NodeStructureDefinition = {
        type: 'test-node',
        size: { width: 100, height: 100 },
      };

      expect(structure.shape).toBeUndefined();
    });
  });

  describe('Template Serialization with Shapes', () => {
    it('should serialize and deserialize template with shape config', () => {
      const template: NodeTemplate = {
        id: 'circle-node',
        version: '1.0.0',
        meta: {
          name: 'Circle Node',
          category: 'basic',
        },
        structure: {
          type: 'circle',
          shape: {
            type: 'circle',
            fill: '#ffffff',
            stroke: '#333333',
            strokeWidth: 2,
            opacity: 1.0,
          },
          size: { width: 100, height: 100 },
        },
      };

      // Serialize to JSON
      const json = TemplateLoader.toJSON(template, false);
      expect(json).toContain('"type":"circle"');
      expect(json).toContain('#ffffff');

      // Deserialize back
      const loaded = TemplateLoader.fromJSON(json);
      expect(loaded.structure.shape).toBeDefined();
      expect(loaded.structure.shape?.type).toBe('circle');
      expect(loaded.structure.shape?.fill).toBe('#ffffff');
      expect(loaded.structure.shape?.stroke).toBe('#333333');
    });

    it('should handle template with rectangle and corner radius', () => {
      const template: NodeTemplate = {
        id: 'rounded-rect',
        version: '1.0.0',
        meta: {
          name: 'Rounded Rectangle',
          category: 'basic',
        },
        structure: {
          type: 'rect',
          shape: {
            type: 'rect',
            cornerRadius: 12,
            fill: '#f5f5f5',
          },
          size: { width: 150, height: 80 },
        },
      };

      const json = TemplateLoader.toJSON(template, false);
      const loaded = TemplateLoader.fromJSON(json);

      expect(loaded.structure.shape?.cornerRadius).toBe(12);
    });

    it('should handle template with diamond shape', () => {
      const template: NodeTemplate = {
        id: 'decision-node',
        version: '1.0.0',
        meta: {
          name: 'Decision Diamond',
          category: 'flowchart',
        },
        structure: {
          type: 'decision',
          shape: {
            type: 'diamond',
            fill: '#fff9c4',
            stroke: '#f57f17',
            strokeWidth: 2,
          },
          size: { width: 120, height: 120 },
        },
      };

      const json = TemplateLoader.toJSON(template, false);
      const loaded = TemplateLoader.fromJSON(json);

      expect(loaded.structure.shape?.type).toBe('diamond');
    });
  });

  describe('Multiple Shapes in Template', () => {
    it('should support different shapes for parent and children', () => {
      const template: NodeTemplate = {
        id: 'flowchart-node',
        version: '1.0.0',
        meta: {
          name: 'Flowchart with Decision',
          category: 'flowchart',
        },
        structure: {
          type: 'process',
          shape: {
            type: 'rect',
            cornerRadius: 4,
          },
          children: [
            {
              type: 'decision',
              shape: {
                type: 'diamond',
              },
            },
          ],
        },
      };

      expect(template.structure.shape?.type).toBe('rect');
      expect(template.structure.children?.[0].shape?.type).toBe('diamond');
    });
  });
});
