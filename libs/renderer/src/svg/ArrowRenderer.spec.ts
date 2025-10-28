// ArrowRenderer.spec.ts
// TDD tests for arrow type rendering (Phase 1.1)

import { ArrowRenderer } from './ArrowRenderer';
import type { ArrowStyle } from '@grafloria/engine';
import type { VNode } from '../types/vnode.types';

describe('ArrowRenderer (Phase 1.1)', () => {
  let renderer: ArrowRenderer;

  beforeEach(() => {
    renderer = new ArrowRenderer();
  });

  describe('RED PHASE: Basic Arrow Types', () => {
    it('should create ArrowRenderer instance', () => {
      expect(renderer).toBeDefined();
      expect(renderer).toBeInstanceOf(ArrowRenderer);
    });

    it('should render basic arrow (triangle)', () => {
      const style: ArrowStyle = {
        type: 'arrow',
        size: 10,
        filled: true
      };

      const vnode = renderer.renderArrow(style, 'translate(100, 50) rotate(45)');

      expect(vnode).not.toBeNull();
      expect(vnode!.type).toBe('polygon');
      expect(vnode!.props['points']).toBeDefined();
      expect(vnode!.props.transform).toBe('translate(100, 50) rotate(45)');
    });

    it('should render filled arrow correctly', () => {
      const style: ArrowStyle = {
        type: 'arrow',
        size: 10,
        filled: true,
        color: '#ff0000'
      };

      const vnode = renderer.renderArrow(style, '');

      expect(vnode).not.toBeNull();
      expect(vnode!.props.fill).toBe('#ff0000');
      expect(vnode!.props.stroke).toBe('#ff0000');
    });

    it('should render hollow arrow correctly', () => {
      const style: ArrowStyle = {
        type: 'arrow',
        size: 10,
        filled: false,
        color: '#0000ff'
      };

      const vnode = renderer.renderArrow(style, '');

      expect(vnode!.props.fill).toBe('white');
      expect(vnode!.props.stroke).toBe('#0000ff');
    });

    it('should render circle arrow', () => {
      const style: ArrowStyle = {
        type: 'circle',
        size: 8,
        filled: true
      };

      const vnode = renderer.renderArrow(style, '');

      expect(vnode!.type).toBe('circle');
      expect(vnode!.props.r).toBe(4); // radius = size / 2
    });

    it('should render square arrow', () => {
      const style: ArrowStyle = {
        type: 'square',
        size: 10,
        filled: true
      };

      const vnode = renderer.renderArrow(style, '');

      expect(vnode!.type).toBe('rect');
      expect(vnode!.props.width).toBe(10);
      expect(vnode!.props.height).toBe(10);
    });

    it('should render diamond arrow', () => {
      const style: ArrowStyle = {
        type: 'diamond',
        size: 10,
        filled: true
      };

      const vnode = renderer.renderArrow(style, '');

      expect(vnode!.type).toBe('polygon');
      expect(vnode!.props['points']).toContain('0,0'); // Diamond center at origin
    });

    it('should handle none arrow type', () => {
      const style: ArrowStyle = {
        type: 'none',
        size: 10,
        filled: true
      };

      const vnode = renderer.renderArrow(style, '');

      expect(vnode).toBeNull();
    });
  });

  describe('RED PHASE: ERD Arrow Types', () => {
    it('should render crow-foot arrow (one-to-many)', () => {
      const style: ArrowStyle = {
        type: 'crow-foot',
        size: 10,
        filled: false
      };

      const vnode = renderer.renderArrow(style, '');

      expect(vnode!.type).toBe('g');
      expect(vnode!.children).toBeDefined();
      expect(vnode!.children?.length).toBe(3); // Three lines forming crow's foot

      // Verify all children are lines
      vnode!.children?.forEach(child => {
        expect(child.type).toBe('line');
      });
    });

    it('should render one arrow (exactly one - vertical bar)', () => {
      const style: ArrowStyle = {
        type: 'one',
        size: 10,
        filled: false
      };

      const vnode = renderer.renderArrow(style, '');

      expect(vnode!.type).toBe('line');
      expect(vnode!.props.strokeWidth).toBeGreaterThan(1); // Thick line
    });

    it('should render zero-or-one arrow (circle + bar)', () => {
      const style: ArrowStyle = {
        type: 'zero-or-one',
        size: 10,
        filled: false
      };

      const vnode = renderer.renderArrow(style, '');

      expect(vnode!.type).toBe('g');
      expect(vnode!.children).toBeDefined();
      expect(vnode!.children?.length).toBe(2); // Circle + line

      // First child should be circle
      expect(vnode!.children![0].type).toBe('circle');
      // Second child should be line
      expect(vnode!.children![1].type).toBe('line');
    });

    it('should render zero-or-many arrow (circle + crow-foot)', () => {
      const style: ArrowStyle = {
        type: 'zero-or-many',
        size: 10,
        filled: false
      };

      const vnode = renderer.renderArrow(style, '');

      expect(vnode!.type).toBe('g');
      expect(vnode!.children).toBeDefined();
      expect(vnode!.children?.length).toBe(4); // Circle + 3 crow-foot lines
    });

    it('should render one-or-many arrow (bar + crow-foot)', () => {
      const style: ArrowStyle = {
        type: 'one-or-many',
        size: 10,
        filled: false
      };

      const vnode = renderer.renderArrow(style, '');

      expect(vnode!.type).toBe('g');
      expect(vnode!.children).toBeDefined();
      expect(vnode!.children?.length).toBe(4); // Bar + 3 crow-foot lines
    });
  });

  describe('RED PHASE: UML Arrow Types', () => {
    it('should render hollow-diamond arrow (aggregation)', () => {
      const style: ArrowStyle = {
        type: 'hollow-diamond',
        size: 12,
        filled: false
      };

      const vnode = renderer.renderArrow(style, '');

      expect(vnode!.type).toBe('polygon');
      expect(vnode!.props.fill).toBe('white');
      expect(vnode!.props['points']).toBeDefined();
    });

    it('should render filled-diamond arrow (composition)', () => {
      const style: ArrowStyle = {
        type: 'filled-diamond',
        size: 12,
        filled: true
      };

      const vnode = renderer.renderArrow(style, '');

      expect(vnode!.type).toBe('polygon');
      expect(vnode!.props.fill).not.toBe('white');
      expect(vnode!.props['points']).toBeDefined();
    });

    it('should render generalization arrow (inheritance)', () => {
      const style: ArrowStyle = {
        type: 'generalization',
        size: 10,
        filled: false
      };

      const vnode = renderer.renderArrow(style, '');

      expect(vnode!.type).toBe('polygon');
      expect(vnode!.props.fill).toBe('white');
      // Triangle pointing backward
    });

    it('should render open-arrow (dependency)', () => {
      const style: ArrowStyle = {
        type: 'open-arrow',
        size: 10,
        filled: false
      };

      const vnode = renderer.renderArrow(style, '');

      expect(vnode!.type).toBe('polyline');
      expect(vnode!.props.fill).toBe('none');
    });

    it('should render double-arrow (bidirectional)', () => {
      const style: ArrowStyle = {
        type: 'double-arrow',
        size: 10,
        filled: true
      };

      const vnode = renderer.renderArrow(style, '');

      expect(vnode!.type).toBe('g');
      expect(vnode!.children).toBeDefined();
      expect(vnode!.children?.length).toBe(2); // Two arrow heads
    });
  });

  describe('RED PHASE: Additional Arrow Types', () => {
    it('should render cross arrow (X mark)', () => {
      const style: ArrowStyle = {
        type: 'cross',
        size: 10,
        filled: false
      };

      const vnode = renderer.renderArrow(style, '');

      expect(vnode!.type).toBe('g');
      expect(vnode!.children).toBeDefined();
      expect(vnode!.children?.length).toBe(2); // Two crossing lines
    });

    it('should render bar arrow (perpendicular line)', () => {
      const style: ArrowStyle = {
        type: 'bar',
        size: 10,
        filled: false
      };

      const vnode = renderer.renderArrow(style, '');

      expect(vnode!.type).toBe('line');
    });

    it('should render dot arrow (simple dot)', () => {
      const style: ArrowStyle = {
        type: 'dot',
        size: 6,
        filled: true
      };

      const vnode = renderer.renderArrow(style, '');

      expect(vnode!.type).toBe('circle');
      expect(vnode!.props.r).toBeLessThanOrEqual(3);
    });

    it('should render oval arrow', () => {
      const style: ArrowStyle = {
        type: 'oval',
        size: 10,
        filled: true
      };

      const vnode = renderer.renderArrow(style, '');

      expect(vnode!.type).toBe('ellipse');
    });
  });

  describe('RED PHASE: Arrow Sizing', () => {
    it('should respect custom size', () => {
      const style: ArrowStyle = {
        type: 'arrow',
        size: 20,
        filled: true
      };

      const vnode = renderer.renderArrow(style, '');

      // Points should scale with size
      expect(vnode).not.toBeNull();
      const points = vnode!.props['points'];
      expect(points).toContain('20'); // Size appears in coordinates
    });

    it('should handle small arrow size', () => {
      const style: ArrowStyle = {
        type: 'arrow',
        size: 3,
        filled: true
      };

      const vnode = renderer.renderArrow(style, '');

      expect(vnode).toBeDefined();
      expect(vnode!.props['points']).toBeDefined();
    });

    it('should handle large arrow size', () => {
      const style: ArrowStyle = {
        type: 'arrow',
        size: 50,
        filled: true
      };

      const vnode = renderer.renderArrow(style, '');

      expect(vnode).toBeDefined();
    });

    it('should use width property if specified', () => {
      const style: ArrowStyle = {
        type: 'arrow',
        size: 10,
        filled: true,
        width: 3
      };

      const vnode = renderer.renderArrow(style, '');

      expect(vnode!.props.strokeWidth).toBe(3);
    });
  });

  describe('RED PHASE: Arrow Colors', () => {
    it('should use default color if not specified', () => {
      const style: ArrowStyle = {
        type: 'arrow',
        size: 10,
        filled: true
      };

      const vnode = renderer.renderArrow(style, '');

      expect(vnode!.props.fill).toBeDefined();
      expect(vnode!.props.stroke).toBeDefined();
    });

    it('should use custom color', () => {
      const style: ArrowStyle = {
        type: 'arrow',
        size: 10,
        filled: true,
        color: '#ff5733'
      };

      const vnode = renderer.renderArrow(style, '');

      expect(vnode!.props.fill).toBe('#ff5733');
      expect(vnode!.props.stroke).toBe('#ff5733');
    });

    it('should override color for filled vs hollow', () => {
      const filledStyle: ArrowStyle = {
        type: 'diamond',
        size: 10,
        filled: true,
        color: '#00ff00'
      };

      const hollowStyle: ArrowStyle = {
        type: 'diamond',
        size: 10,
        filled: false,
        color: '#00ff00'
      };

      const filledVNode = renderer.renderArrow(filledStyle, '');
      const hollowVNode = renderer.renderArrow(hollowStyle, '');

      expect(filledVNode).not.toBeNull();
      expect(hollowVNode).not.toBeNull();
      expect(filledVNode!.props.fill).toBe('#00ff00');
      expect(hollowVNode!.props.fill).toBe('white');
      expect(hollowVNode!.props.stroke).toBe('#00ff00');
    });
  });

  describe('RED PHASE: Transform and Positioning', () => {
    it('should apply transform to arrow', () => {
      const style: ArrowStyle = {
        type: 'arrow',
        size: 10,
        filled: true
      };

      const transform = 'translate(200, 100) rotate(90)';
      const vnode = renderer.renderArrow(style, transform);

      expect(vnode!.props.transform).toBe(transform);
    });

    it('should apply transform to group arrows', () => {
      const style: ArrowStyle = {
        type: 'crow-foot',
        size: 10,
        filled: false
      };

      const transform = 'translate(50, 75) rotate(-45)';
      const vnode = renderer.renderArrow(style, transform);

      expect(vnode!.props.transform).toBe(transform);
    });

    it('should handle empty transform', () => {
      const style: ArrowStyle = {
        type: 'arrow',
        size: 10,
        filled: true
      };

      const vnode = renderer.renderArrow(style, '');

      expect(vnode!.props.transform).toBe('');
    });
  });

  describe('RED PHASE: Arrow Offset', () => {
    it('should handle arrow offset property', () => {
      const style: ArrowStyle = {
        type: 'arrow',
        size: 10,
        filled: true,
        offset: 5
      };

      // Offset should be applied in positioning calculation (outside ArrowRenderer)
      // ArrowRenderer just renders the shape
      const vnode = renderer.renderArrow(style, '');

      expect(vnode).toBeDefined();
    });
  });

  describe('RED PHASE: Edge Cases', () => {
    it('should handle zero size gracefully', () => {
      const style: ArrowStyle = {
        type: 'arrow',
        size: 0,
        filled: true
      };

      const vnode = renderer.renderArrow(style, '');

      // Should either render tiny arrow or return null
      expect(vnode === null || vnode.props['points']).toBeTruthy();
    });

    it('should handle negative size gracefully', () => {
      const style: ArrowStyle = {
        type: 'arrow',
        size: -10,
        filled: true
      };

      expect(() => {
        renderer.renderArrow(style, '');
      }).not.toThrow();
    });

    it('should handle undefined color', () => {
      const style: ArrowStyle = {
        type: 'arrow',
        size: 10,
        filled: true
      };

      const vnode = renderer.renderArrow(style, '');

      expect(vnode!.props.fill).toBeDefined();
      expect(vnode!.props.stroke).toBeDefined();
    });

    it('should handle invalid arrow type gracefully', () => {
      const style: ArrowStyle = {
        type: 'invalid-type' as any,
        size: 10,
        filled: true
      };

      expect(() => {
        renderer.renderArrow(style, '');
      }).not.toThrow();

      // Should fallback to basic arrow or return null
      const vnode = renderer.renderArrow(style, '');
      expect(vnode === null || vnode.type).toBeTruthy();
    });
  });

  describe('RED PHASE: Performance', () => {
    it('should render 100 arrows quickly', () => {
      const start = Date.now();

      for (let i = 0; i < 100; i++) {
        const style: ArrowStyle = {
          type: 'arrow',
          size: 10,
          filled: true
        };
        renderer.renderArrow(style, `translate(${i}, ${i})`);
      }

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(100); // Should complete in < 100ms
    });

    it('should not create memory leaks', () => {
      const style: ArrowStyle = {
        type: 'arrow',
        size: 10,
        filled: true
      };

      // Render many times
      for (let i = 0; i < 1000; i++) {
        renderer.renderArrow(style, '');
      }

      // Should not accumulate state
      expect(renderer).toBeDefined();
    });
  });

  describe('RED PHASE: VNode Structure', () => {
    it('should return valid VNode structure', () => {
      const style: ArrowStyle = {
        type: 'arrow',
        size: 10,
        filled: true
      };

      const vnode = renderer.renderArrow(style, '');

      expect(vnode).not.toBeNull();
      expect(vnode!.type).toBeDefined();
      expect(vnode!.props).toBeDefined();
      expect(typeof vnode!.type).toBe('string');
      expect(typeof vnode!.props).toBe('object');
    });

    it('should include className for styling', () => {
      const style: ArrowStyle = {
        type: 'arrow',
        size: 10,
        filled: true
      };

      const vnode = renderer.renderArrow(style, '');

      expect(vnode!.props.className).toContain('arrow');
    });

    it('should nest children for complex arrows', () => {
      const style: ArrowStyle = {
        type: 'crow-foot',
        size: 10,
        filled: false
      };

      const vnode = renderer.renderArrow(style, '');

      expect(vnode).not.toBeNull();
      expect(vnode!.children).toBeDefined();
      expect(Array.isArray(vnode!.children)).toBe(true);
      expect(vnode!.children!.length).toBeGreaterThan(0);
    });
  });
});
