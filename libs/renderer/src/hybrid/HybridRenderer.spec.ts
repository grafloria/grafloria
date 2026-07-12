// Hybrid Rendering Tests (Phase 3.5)
// Tests for SVG + HTML layer synchronization

import { HybridRenderer } from './HybridRenderer';
import type { NodeModel } from '@grafloria/engine';
import type { VNode } from '../types/vnode.types';

describe('HybridRenderer (Phase 3.5)', () => {
  let renderer: HybridRenderer;
  let mockNode: Partial<NodeModel>;

  beforeEach(() => {
    renderer = new HybridRenderer();

    mockNode = {
      id: 'test-node-1',
      uuid: 'uuid-1',
      position: { x: 100, y: 200 },
      size: { width: 150, height: 80 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      data: {
        name: 'Test Node',
        description: 'Test description',
      },
      getMetadata: jest.fn((key: string) => {
        if (key === 'shape') return { type: 'rect', fill: '#fff' };
        if (key === 'label') return 'Test Label';
        return undefined;
      }),
    } as any;
  });

  describe('Layer Synchronization', () => {
    it('should generate both SVG and HTML layers', () => {
      const result = renderer.render(mockNode as NodeModel);

      expect(result.svgLayer).toBeDefined();
      expect(result.htmlLayer).toBeDefined();
    });

    it('should synchronize transforms between layers', () => {
      const result = renderer.render(mockNode as NodeModel);

      // SVG layer uses transform attribute
      const svgTransform = result.svgLayer.props?.['transform'];
      expect(svgTransform).toContain('translate(100, 200)');

      // HTML layer uses CSS transform
      const htmlStyle = result.htmlLayer.style;
      expect(htmlStyle?.['transform']).toContain('translate(100px, 200px)');
    });

    it('should synchronize position changes', () => {
      mockNode['position'] = { x: 300, y: 400 };
      const result = renderer.render(mockNode as NodeModel);

      expect(result.svgLayer.props?.['transform']).toContain('translate(300, 400)');
      expect(result.htmlLayer.style?.['transform']).toContain('translate(300px, 400px)');
    });

    it('should synchronize rotation', () => {
      mockNode.rotation = 45;
      const result = renderer.render(mockNode as NodeModel);

      expect(result.svgLayer.props?.['transform']).toContain('rotate(45 ');
      expect(result.htmlLayer.style?.['transform']).toContain('rotate(45deg)');
    });

    it('should synchronize scale', () => {
      mockNode.scale = { x: 1.5, y: 1.5 };
      const result = renderer.render(mockNode as NodeModel);

      expect(result.svgLayer.props?.['transform']).toContain('scale(1.5, 1.5)');
      expect(result.htmlLayer.style?.['transform']).toContain('scale(1.5, 1.5)');
    });

    it('should synchronize combined transforms', () => {
      mockNode['position'] = { x: 200, y: 300 };
      mockNode.rotation = 30;
      mockNode.scale = { x: 2, y: 2 };

      const result = renderer.render(mockNode as NodeModel);

      // SVG: translate rotate scale order
      expect(result.svgLayer.props?.['transform']).toContain('translate(200, 300)');
      expect(result.svgLayer.props?.['transform']).toContain('rotate(30 ');
      expect(result.svgLayer.props?.['transform']).toContain('scale(2, 2)');

      // HTML: same order
      const htmlTransform = result.htmlLayer.style?.['transform'];
      expect(htmlTransform).toContain('translate(200px, 300px)');
      expect(htmlTransform).toContain('rotate(30deg)');
      expect(htmlTransform).toContain('scale(2, 2)');
    });

    it('should synchronize size', () => {
      const result = renderer.render(mockNode as NodeModel);

      expect(result.svgLayer.props?.['width']).toBe(150);
      expect(result.svgLayer.props?.['height']).toBe(80);

      expect(result.htmlLayer.style?.['width']).toBe('150px');
      expect(result.htmlLayer.style?.['height']).toBe('80px');
    });
  });

  describe('Z-Index Management', () => {
    it('should apply default z-index to HTML layer', () => {
      const result = renderer.render(mockNode as NodeModel);

      // HTML layer should be above SVG by default
      expect(result.htmlLayer.style?.['zIndex']).toBeDefined();
    });

    it('should use custom z-index from config', () => {
      const htmlConfig = {
        mode: 'template' as const,
        template: '<div>Content</div>',
        zIndex: 100,
      };

      const result = renderer.render(mockNode as NodeModel, { htmlConfig });

      expect(result.htmlLayer.style?.['zIndex']).toBe(100);
    });

    it('should allow HTML layer below SVG', () => {
      const htmlConfig = {
        mode: 'template' as const,
        template: '<div>Background</div>',
        zIndex: -1,
      };

      const result = renderer.render(mockNode as NodeModel, { htmlConfig });

      expect(result.htmlLayer.style?.['zIndex']).toBe(-1);
    });
  });

  describe('Pointer Events Coordination', () => {
    it('should enable pointer events on HTML layer by default', () => {
      const result = renderer.render(mockNode as NodeModel);

      expect(result.htmlLayer.style?.['pointerEvents']).not.toBe('none');
    });

    it('should disable pointer events when configured', () => {
      const htmlConfig = {
        mode: 'template' as const,
        template: '<div>Non-interactive</div>',
        pointerEvents: false,
      };

      const result = renderer.render(mockNode as NodeModel, { htmlConfig });

      expect(result.htmlLayer.style?.['pointerEvents']).toBe('none');
    });

    it('should pass events through to SVG when HTML pointer events disabled', () => {
      const htmlConfig = {
        mode: 'template' as const,
        template: '<div>Transparent</div>',
        pointerEvents: false,
      };

      const result = renderer.render(mockNode as NodeModel, { htmlConfig });

      // HTML layer doesn't capture events
      expect(result.htmlLayer.style?.['pointerEvents']).toBe('none');

      // SVG layer can receive events
      expect(result.svgLayer.props?.['pointerEvents']).not.toBe('none');
    });
  });

  describe('SVG Layer Rendering', () => {
    it('should render SVG shape based on config', () => {
      const result = renderer.render(mockNode as NodeModel);

      expect(result.svgLayer).toBeDefined();
      expect(result.svgLayer.type).toBe('g');
      expect(result.svgLayer.children).toBeDefined();
    });

    it('should include ports in SVG layer', () => {
      // Add mock ports
      (mockNode as any).ports = new Map([
        ['port-1', { id: 'port-1', side: 'left', alignment: { side: 'left' }, offset: { x: 0, y: 0 } }],
        ['port-2', { id: 'port-2', side: 'right', alignment: { side: 'right' }, offset: { x: 0, y: 0 } }],
      ]);

      const result = renderer.render(mockNode as NodeModel);

      // Ports should be in SVG layer (for connections)
      expect(result.svgLayer.children?.length).toBeGreaterThan(0);
    });

    it('should render different shapes correctly', () => {
      const shapes = ['rect', 'circle', 'diamond', 'ellipse', 'hexagon'];

      shapes.forEach((shapeType) => {
        (mockNode.getMetadata as jest.Mock).mockImplementation((key: string) => {
          if (key === 'shape') return { type: shapeType };
          return undefined;
        });

        const result = renderer.render(mockNode as NodeModel);
        expect(result.svgLayer).toBeDefined();
      });
    });
  });

  describe('HTML Layer Rendering', () => {
    it('should render HTML template when provided', () => {
      const htmlConfig = {
        mode: 'template' as const,
        template: '<div class="custom">{{data.name}}</div>',
      };

      const result = renderer.render(mockNode as NodeModel, { htmlConfig });

      expect(result.htmlLayer).toBeDefined();
      expect(result.htmlLayer.innerHTML).toContain('Test Node');
    });

    it('should apply className to HTML layer', () => {
      const htmlConfig = {
        mode: 'template' as const,
        template: '<div>Content</div>',
        className: 'custom-class another-class',
      };

      const result = renderer.render(mockNode as NodeModel, { htmlConfig });

      expect(result.htmlLayer.className).toContain('custom-class');
      expect(result.htmlLayer.className).toContain('another-class');
    });

    it('should apply styles to HTML layer', () => {
      const htmlConfig = {
        mode: 'template' as const,
        template: '<div>Content</div>',
        style: {
          backgroundColor: '#fff',
          padding: '10px',
          borderRadius: '8px',
        },
      };

      const result = renderer.render(mockNode as NodeModel, { htmlConfig });

      expect(result.htmlLayer.style?.['backgroundColor']).toBe('#fff');
      expect(result.htmlLayer.style?.['padding']).toBe('10px');
      expect(result.htmlLayer.style?.['borderRadius']).toBe('8px');
    });

    it('should skip HTML layer when no config provided', () => {
      const result = renderer.render(mockNode as NodeModel);

      // HTML layer exists but is empty
      expect(result.htmlLayer.innerHTML).toBeFalsy();
    });
  });

  describe('Transform Origin', () => {
    it('should set correct transform origin for rotation', () => {
      mockNode.rotation = 45;
      const result = renderer.render(mockNode as NodeModel);

      // Transform origin should be at center of node
      const expectedOrigin = '50% 50%';
      expect(result.htmlLayer.style?.['transformOrigin']).toBe(expectedOrigin);
    });

    it('should synchronize transform origin between layers', () => {
      mockNode.rotation = 90;
      const result = renderer.render(mockNode as NodeModel);

      // Both layers should rotate around same point (center)
      expect(result.htmlLayer.style?.['transformOrigin']).toBe('50% 50%');
      // SVG uses transform-origin via props or inline style
      expect(result.svgLayer.props?.['transform-origin']).toBeDefined();
    });
  });

  describe('Viewport Aware Positioning', () => {
    it('should use absolute positioning for HTML layer', () => {
      const result = renderer.render(mockNode as NodeModel);

      expect(result.htmlLayer.style?.['position']).toBe('absolute');
    });

    it('should calculate correct absolute position', () => {
      mockNode['position'] = { x: 500, y: 600 };
      const result = renderer.render(mockNode as NodeModel);

      // HTML layer uses left/top for positioning
      expect(result.htmlLayer.style?.['left']).toBe('500px');
      expect(result.htmlLayer.style?.['top']).toBe('600px');
    });
  });

  describe('Performance & Caching', () => {
    it('should cache layer results when node is not dirty', () => {
      (mockNode as any).isDirty = false;

      const result1 = renderer.render(mockNode as NodeModel);
      const result2 = renderer.render(mockNode as NodeModel);

      // Should return same cached result
      expect(result1).toBe(result2);
    });

    it('should invalidate cache when node is dirty', () => {
      (mockNode as any).isDirty = false;
      const result1 = renderer.render(mockNode as NodeModel);

      (mockNode as any).isDirty = true;
      const result2 = renderer.render(mockNode as NodeModel);

      // Should create new result
      expect(result1).not.toBe(result2);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero-size nodes', () => {
      mockNode.size = { width: 0, height: 0 };

      expect(() => {
        renderer.render(mockNode as NodeModel);
      }).not.toThrow();
    });

    it('should handle negative positions', () => {
      mockNode['position'] = { x: -100, y: -50 };

      const result = renderer.render(mockNode as NodeModel);

      expect(result.svgLayer.props?.['transform']).toContain('translate(-100, -50)');
      expect(result.htmlLayer.style?.['left']).toBe('-100px');
      expect(result.htmlLayer.style?.['top']).toBe('-50px');
    });

    it('should handle extreme rotation values', () => {
      mockNode.rotation = 720; // Two full rotations

      const result = renderer.render(mockNode as NodeModel);

      expect(result.svgLayer.props?.['transform']).toContain('rotate(720 ');
      expect(result.htmlLayer.style?.['transform']).toContain('rotate(720deg)');
    });

    it('should handle non-uniform scale', () => {
      mockNode.scale = { x: 2, y: 0.5 };

      const result = renderer.render(mockNode as NodeModel);

      expect(result.svgLayer.props?.['transform']).toContain('scale(2, 0.5)');
      expect(result.htmlLayer.style?.['transform']).toContain('scale(2, 0.5)');
    });
  });

  describe('Cleanup', () => {
    it('should cleanup resources on dispose', () => {
      renderer.dispose();

      expect(() => {
        renderer.render(mockNode as NodeModel);
      }).toThrow();
    });
  });
});
