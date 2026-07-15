// LabelRenderer.spec.ts
// TDD tests for link label rendering (Phase 1.2)

import { LabelRenderer } from './LabelRenderer';
import type { LinkLabel, LabelStyle, LinkModel } from '@grafloria/engine';
import type { VNode } from '../types/vnode.types';

describe('LabelRenderer (Phase 1.2)', () => {
  let renderer: LabelRenderer;

  beforeEach(() => {
    renderer = new LabelRenderer();
  });

  describe('RED PHASE: Basic Label Rendering', () => {
    it('should create LabelRenderer instance', () => {
      expect(renderer).toBeDefined();
      expect(renderer).toBeInstanceOf(LabelRenderer);
    });

    it('should render basic label at position 0.5', () => {
      const label: LinkLabel = {
        id: 'label-1',
        text: 'Test Label',
        position: 0.5,
        offset: { x: 0, y: -10 }
      };

      const mockLink = createMockLink([
        { x: 0, y: 0 },
        { x: 100, y: 0 }
      ]);

      const vnode = renderer.renderLabel(label, mockLink);

      expect(vnode).not.toBeNull();
      expect(vnode!.type).toBe('g'); // Group container
      expect(vnode!.children).toBeDefined();
      expect(vnode!.children!.length).toBeGreaterThan(0);
    });

    // The audit's strike-through: a bare label rides ON the stroke, so without a
    // chip the line cuts straight through the text. The chip defaults to the
    // theme surface; 'none' opts out; no theme (this legacy no-theme call path)
    // keeps the old naked-text behavior.
    it('defaults a background chip from the theme surface', () => {
      const label: LinkLabel = { id: 'l', text: 'depends on', position: 0.5, offset: { x: 0, y: 0 } };
      const mockLink = createMockLink([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
      const theme = { colors: { background: { surface: '#f8fafc' } } } as never;

      const vnode = renderer.renderLabel(label, mockLink, { theme });
      const bgRect = vnode!.children?.find((child) => child.type === 'rect');
      expect(bgRect).toBeDefined();
      expect(bgRect!.props.fill).toBe('#f8fafc');
    });

    it("background: 'none' opts out of the default chip", () => {
      const label: LinkLabel = {
        id: 'l', text: 'depends on', position: 0.5, offset: { x: 0, y: 0 },
        style: { background: 'none' },
      };
      const mockLink = createMockLink([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
      const theme = { colors: { background: { surface: '#f8fafc' } } } as never;

      const vnode = renderer.renderLabel(label, mockLink, { theme });
      expect(vnode!.children?.find((child) => child.type === 'rect')).toBeUndefined();
    });

    it('should render label with background', () => {
      const label: LinkLabel = {
        id: 'label-1',
        text: 'Label',
        position: 0.5,
        offset: { x: 0, y: 0 },
        style: {
          background: '#ffffff'
        }
      };

      const mockLink = createMockLink([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
      const vnode = renderer.renderLabel(label, mockLink);

      expect(vnode).not.toBeNull();
      // Should contain background rect
      const bgRect = vnode!.children?.find(child => child.type === 'rect');
      expect(bgRect).toBeDefined();
      expect(bgRect!.props.fill).toBe('#ffffff');
    });

    it('should render label text element', () => {
      const label: LinkLabel = {
        id: 'label-1',
        text: 'Text',
        position: 0.5,
        offset: { x: 0, y: 0 }
      };

      const mockLink = createMockLink([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
      const vnode = renderer.renderLabel(label, mockLink);

      expect(vnode).not.toBeNull();
      const textNode = vnode!.children?.find(child => child.type === 'text');
      expect(textNode).toBeDefined();
      expect(textNode!.props.textContent).toContain('Text');
    });
  });

  describe('RED PHASE: Label Positioning', () => {
    it('should position label at start (position 0)', () => {
      const label: LinkLabel = {
        id: 'label-1',
        text: 'Start',
        position: 0,
        offset: { x: 0, y: 0 }
      };

      const mockLink = createMockLink([
        { x: 0, y: 0 },
        { x: 100, y: 0 }
      ]);

      const vnode = renderer.renderLabel(label, mockLink);

      expect(vnode).not.toBeNull();
      // Transform should be near start point (0, 0)
      expect(vnode!.props.transform).toContain('translate(0');
    });

    it('should position label at end (position 1)', () => {
      const label: LinkLabel = {
        id: 'label-1',
        text: 'End',
        position: 1,
        offset: { x: 0, y: 0 }
      };

      const mockLink = createMockLink([
        { x: 0, y: 0 },
        { x: 100, y: 0 }
      ]);

      const vnode = renderer.renderLabel(label, mockLink);

      expect(vnode).not.toBeNull();
      // Transform should be near end point (100, 0)
      expect(vnode!.props.transform).toContain('translate(100');
    });

    it('should position label at middle (position 0.5)', () => {
      const label: LinkLabel = {
        id: 'label-1',
        text: 'Middle',
        position: 0.5,
        offset: { x: 0, y: 0 }
      };

      const mockLink = createMockLink([
        { x: 0, y: 0 },
        { x: 100, y: 0 }
      ]);

      const vnode = renderer.renderLabel(label, mockLink);

      expect(vnode).not.toBeNull();
      // Transform should be at middle point (50, 0)
      expect(vnode!.props.transform).toContain('translate(50');
    });

    it('should apply offset to label position', () => {
      const label: LinkLabel = {
        id: 'label-1',
        text: 'Offset',
        position: 0.5,
        offset: { x: 10, y: 20 }
      };

      const mockLink = createMockLink([
        { x: 0, y: 0 },
        { x: 100, y: 0 }
      ]);

      const vnode = renderer.renderLabel(label, mockLink);

      expect(vnode).not.toBeNull();
      // Position should be 50 + 10 = 60, 0 + 20 = 20
      const transform = vnode!.props.transform;
      expect(transform).toContain('60');
      expect(transform).toContain('20');
    });

    it('should clamp position to 0-1 range', () => {
      const label1: LinkLabel = {
        id: 'label-1',
        text: 'Negative',
        position: -0.5,
        offset: { x: 0, y: 0 }
      };

      const label2: LinkLabel = {
        id: 'label-2',
        text: 'Over',
        position: 1.5,
        offset: { x: 0, y: 0 }
      };

      const mockLink = createMockLink([{ x: 0, y: 0 }, { x: 100, y: 0 }]);

      const vnode1 = renderer.renderLabel(label1, mockLink);
      const vnode2 = renderer.renderLabel(label2, mockLink);

      expect(vnode1).not.toBeNull();
      expect(vnode2).not.toBeNull();
      // Should clamp to start and end
      expect(vnode1!.props.transform).toContain('translate(0');
      expect(vnode2!.props.transform).toContain('translate(100');
    });
  });

  describe('RED PHASE: Label Rotation', () => {
    it('should not rotate label when rotation is undefined', () => {
      const label: LinkLabel = {
        id: 'label-1',
        text: 'No Rotation',
        position: 0.5,
        offset: { x: 0, y: 0 }
      };

      const mockLink = createMockLink([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
      const vnode = renderer.renderLabel(label, mockLink);

      expect(vnode).not.toBeNull();
      // Should not have rotation in transform
      const transform = vnode!.props.transform;
      expect(transform).not.toContain('rotate');
    });

    it('should auto-rotate label with path', () => {
      const label: LinkLabel = {
        id: 'label-1',
        text: 'Auto Rotate',
        position: 0.5,
        offset: { x: 0, y: 0 },
        rotation: 'auto'
      };

      const mockLink = createMockLink([
        { x: 0, y: 0 },
        { x: 100, y: 100 }
      ]); // 45 degree diagonal

      const vnode = renderer.renderLabel(label, mockLink);

      expect(vnode).not.toBeNull();
      // Should have rotation in transform (approximately 45 degrees)
      const transform = vnode!.props.transform;
      expect(transform).toContain('rotate');
      expect(transform).toContain('45');
    });

    it('should apply fixed rotation angle', () => {
      const label: LinkLabel = {
        id: 'label-1',
        text: 'Fixed Rotation',
        position: 0.5,
        offset: { x: 0, y: 0 },
        rotation: 30
      };

      const mockLink = createMockLink([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
      const vnode = renderer.renderLabel(label, mockLink);

      expect(vnode).not.toBeNull();
      const transform = vnode!.props.transform;
      expect(transform).toContain('rotate(30');
    });

    it('should apply rotation offset to auto rotation', () => {
      const label: LinkLabel = {
        id: 'label-1',
        text: 'Offset Rotation',
        position: 0.5,
        offset: { x: 0, y: 0 },
        rotation: 'auto',
        rotationOffset: 15
      };

      const mockLink = createMockLink([{ x: 0, y: 0 }, { x: 100, y: 0 }]); // 0 degrees
      const vnode = renderer.renderLabel(label, mockLink);

      expect(vnode).not.toBeNull();
      const transform = vnode!.props.transform;
      // Should be 0 + 15 = 15 degrees
      expect(transform).toContain('rotate(15');
    });

    it('should keep label upright when keepUpright is true', () => {
      const label: LinkLabel = {
        id: 'label-1',
        text: 'Upright',
        position: 0.5,
        offset: { x: 0, y: 0 },
        rotation: 'auto',
        keepUpright: true
      };

      // Upside-down path (180 degrees)
      const mockLink = createMockLink([
        { x: 100, y: 0 },
        { x: 0, y: 0 }
      ]);

      const vnode = renderer.renderLabel(label, mockLink);

      expect(vnode).not.toBeNull();
      const transform = vnode!.props.transform;
      // Should flip to keep upright (add or subtract 180)
      expect(transform).toContain('rotate');
      const rotation = parseFloat(transform!.match(/rotate\(([-\d.]+)/)?.[1] || '0');
      expect(Math.abs(rotation)).toBeLessThan(90); // Should be upright
    });
  });

  describe('RED PHASE: Text Wrapping', () => {
    it('should wrap text when textWrap is true and exceeds maxWidth', () => {
      const label: LinkLabel = {
        id: 'label-1',
        text: 'This is a very long label text that should wrap',
        position: 0.5,
        offset: { x: 0, y: 0 },
        textWrap: true,
        maxWidth: 100
      };

      const mockLink = createMockLink([{ x: 0, y: 0 }, { x: 200, y: 0 }]);
      const vnode = renderer.renderLabel(label, mockLink);

      expect(vnode).not.toBeNull();
      // Should have multiple tspan elements for wrapped lines
      const textNode = vnode!.children?.find(child => child.type === 'text');
      expect(textNode).toBeDefined();
      expect(textNode!.children).toBeDefined();
      expect(textNode!.children!.length).toBeGreaterThan(1); // Multiple lines
    });

    it('should not wrap text when textWrap is false', () => {
      const label: LinkLabel = {
        id: 'label-1',
        text: 'This is a long label',
        position: 0.5,
        offset: { x: 0, y: 0 },
        textWrap: false,
        maxWidth: 50
      };

      const mockLink = createMockLink([{ x: 0, y: 0 }, { x: 200, y: 0 }]);
      const vnode = renderer.renderLabel(label, mockLink);

      expect(vnode).not.toBeNull();
      const textNode = vnode!.children?.find(child => child.type === 'text');
      expect(textNode).toBeDefined();
      // Should be single text content, no children
      expect(textNode!.props.textContent).toBe('This is a long label');
    });

    it('should calculate correct line height for wrapped text', () => {
      const label: LinkLabel = {
        id: 'label-1',
        text: 'Line one\\nLine two\\nLine three',
        position: 0.5,
        offset: { x: 0, y: 0 },
        textWrap: true,
        maxWidth: 100,
        style: {
          fontSize: 14
        }
      };

      const mockLink = createMockLink([{ x: 0, y: 0 }, { x: 200, y: 0 }]);
      const vnode = renderer.renderLabel(label, mockLink);

      expect(vnode).not.toBeNull();
      const textNode = vnode!.children?.find(child => child.type === 'text');
      const tspans = textNode!.children;
      expect(tspans).toBeDefined();
      // Each tspan should have dy for line spacing
      if (tspans && tspans.length > 1) {
        expect(tspans[1]!.props['dy']).toBeDefined();
      }
    });
  });

  describe('RED PHASE: Label Styling', () => {
    it('should apply font size', () => {
      const label: LinkLabel = {
        id: 'label-1',
        text: 'Styled',
        position: 0.5,
        offset: { x: 0, y: 0 },
        style: {
          fontSize: 18
        }
      };

      const mockLink = createMockLink([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
      const vnode = renderer.renderLabel(label, mockLink);

      expect(vnode).not.toBeNull();
      const textNode = vnode!.children?.find(child => child.type === 'text');
      expect(textNode!.props.fontSize).toBe(18);
    });

    it('should apply font family', () => {
      const label: LinkLabel = {
        id: 'label-1',
        text: 'Font',
        position: 0.5,
        offset: { x: 0, y: 0 },
        style: {
          fontFamily: 'Arial'
        }
      };

      const mockLink = createMockLink([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
      const vnode = renderer.renderLabel(label, mockLink);

      expect(vnode).not.toBeNull();
      const textNode = vnode!.children?.find(child => child.type === 'text');
      expect(textNode!.props.fontFamily).toBe('Arial');
    });

    it('should apply text color', () => {
      const label: LinkLabel = {
        id: 'label-1',
        text: 'Colored',
        position: 0.5,
        offset: { x: 0, y: 0 },
        style: {
          color: '#ff0000'
        }
      };

      const mockLink = createMockLink([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
      const vnode = renderer.renderLabel(label, mockLink);

      expect(vnode).not.toBeNull();
      const textNode = vnode!.children?.find(child => child.type === 'text');
      expect(textNode!.props.fill).toBe('#ff0000');
    });

    it('should apply background with padding and border radius', () => {
      const label: LinkLabel = {
        id: 'label-1',
        text: 'BG',
        position: 0.5,
        offset: { x: 0, y: 0 },
        style: {
          background: '#ffffff',
          padding: 5,
          borderRadius: 3
        }
      };

      const mockLink = createMockLink([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
      const vnode = renderer.renderLabel(label, mockLink);

      expect(vnode).not.toBeNull();
      const bgRect = vnode!.children?.find(child => child.type === 'rect');
      expect(bgRect).toBeDefined();
      expect(bgRect!.props.fill).toBe('#ffffff');
      expect(bgRect!.props.rx).toBe(3);
    });
  });

  describe('RED PHASE: Text Anchor and Alignment', () => {
    it('should apply text anchor start', () => {
      const label: LinkLabel = {
        id: 'label-1',
        text: 'Left',
        position: 0.5,
        offset: { x: 0, y: 0 },
        textAnchor: 'start'
      };

      const mockLink = createMockLink([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
      const vnode = renderer.renderLabel(label, mockLink);

      expect(vnode).not.toBeNull();
      const textNode = vnode!.children?.find(child => child.type === 'text');
      expect(textNode!.props.textAnchor).toBe('start');
    });

    it('should apply text anchor middle', () => {
      const label: LinkLabel = {
        id: 'label-1',
        text: 'Center',
        position: 0.5,
        offset: { x: 0, y: 0 },
        textAnchor: 'middle'
      };

      const mockLink = createMockLink([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
      const vnode = renderer.renderLabel(label, mockLink);

      expect(vnode).not.toBeNull();
      const textNode = vnode!.children?.find(child => child.type === 'text');
      expect(textNode!.props.textAnchor).toBe('middle');
    });

    it('should apply text anchor end', () => {
      const label: LinkLabel = {
        id: 'label-1',
        text: 'Right',
        position: 0.5,
        offset: { x: 0, y: 0 },
        textAnchor: 'end'
      };

      const mockLink = createMockLink([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
      const vnode = renderer.renderLabel(label, mockLink);

      expect(vnode).not.toBeNull();
      const textNode = vnode!.children?.find(child => child.type === 'text');
      expect(textNode!.props.textAnchor).toBe('end');
    });
  });

  describe('RED PHASE: Multiple Labels', () => {
    it('should render multiple labels on same link', () => {
      const labels: LinkLabel[] = [
        {
          id: 'label-1',
          text: 'Start',
          position: 0.2,
          offset: { x: 0, y: -10 }
        },
        {
          id: 'label-2',
          text: 'Middle',
          position: 0.5,
          offset: { x: 0, y: -10 }
        },
        {
          id: 'label-3',
          text: 'End',
          position: 0.8,
          offset: { x: 0, y: -10 }
        }
      ];

      const mockLink = createMockLink([{ x: 0, y: 0 }, { x: 100, y: 0 }]);

      const vnodes = labels.map(label => renderer.renderLabel(label, mockLink));

      expect(vnodes).toHaveLength(3);
      vnodes.forEach(vnode => {
        expect(vnode).not.toBeNull();
      });
    });

    it('should render labels with different styles', () => {
      const labels: LinkLabel[] = [
        {
          id: 'label-1',
          text: 'Red',
          position: 0.3,
          offset: { x: 0, y: 0 },
          style: { color: '#ff0000' }
        },
        {
          id: 'label-2',
          text: 'Blue',
          position: 0.7,
          offset: { x: 0, y: 0 },
          style: { color: '#0000ff' }
        }
      ];

      const mockLink = createMockLink([{ x: 0, y: 0 }, { x: 100, y: 0 }]);

      const vnodes = labels.map(label => renderer.renderLabel(label, mockLink));

      expect(vnodes[0]!.children?.find(c => c.type === 'text')!.props.fill).toBe('#ff0000');
      expect(vnodes[1]!.children?.find(c => c.type === 'text')!.props.fill).toBe('#0000ff');
    });
  });

  describe('RED PHASE: Edge Cases', () => {
    it('should handle empty text', () => {
      const label: LinkLabel = {
        id: 'label-1',
        text: '',
        position: 0.5,
        offset: { x: 0, y: 0 }
      };

      const mockLink = createMockLink([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
      const vnode = renderer.renderLabel(label, mockLink);

      // Should still render but might be empty or minimal
      expect(vnode).not.toBeNull();
    });

    it('should handle link with no points', () => {
      const label: LinkLabel = {
        id: 'label-1',
        text: 'Label',
        position: 0.5,
        offset: { x: 0, y: 0 }
      };

      const mockLink = createMockLink([]);
      const vnode = renderer.renderLabel(label, mockLink);

      // Should return null or handle gracefully
      expect(vnode === null || vnode !== undefined).toBe(true);
    });

    it('should handle very long text without wrapping', () => {
      const label: LinkLabel = {
        id: 'label-1',
        text: 'A'.repeat(1000),
        position: 0.5,
        offset: { x: 0, y: 0 },
        textWrap: false
      };

      const mockLink = createMockLink([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
      const vnode = renderer.renderLabel(label, mockLink);

      expect(vnode).not.toBeNull();
    });

    it('should handle negative offset values', () => {
      const label: LinkLabel = {
        id: 'label-1',
        text: 'Negative',
        position: 0.5,
        offset: { x: -20, y: -30 }
      };

      const mockLink = createMockLink([{ x: 100, y: 100 }, { x: 200, y: 100 }]);
      const vnode = renderer.renderLabel(label, mockLink);

      expect(vnode).not.toBeNull();
      // Should apply negative offset: 150 - 20 = 130, 100 - 30 = 70
      const transform = vnode!.props.transform;
      expect(transform).toContain('130');
      expect(transform).toContain('70');
    });
  });

  describe('RED PHASE: Performance', () => {
    it('should render 100 labels quickly', () => {
      const labels: LinkLabel[] = [];
      for (let i = 0; i < 100; i++) {
        labels.push({
          id: `label-${i}`,
          text: `Label ${i}`,
          position: i / 100,
          offset: { x: 0, y: 0 }
        });
      }

      const mockLink = createMockLink([{ x: 0, y: 0 }, { x: 1000, y: 0 }]);

      const start = performance.now();
      labels.forEach(label => renderer.renderLabel(label, mockLink));
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(100); // Should render in < 100ms
    });
  });

  describe('RED PHASE: VNode Structure', () => {
    it('should return valid VNode structure', () => {
      const label: LinkLabel = {
        id: 'label-1',
        text: 'Test',
        position: 0.5,
        offset: { x: 0, y: 0 }
      };

      const mockLink = createMockLink([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
      const vnode = renderer.renderLabel(label, mockLink);

      expect(vnode).not.toBeNull();
      expect(vnode!.type).toBeDefined();
      expect(vnode!.props).toBeDefined();
      expect(typeof vnode!.type).toBe('string');
      expect(typeof vnode!.props).toBe('object');
    });

    it('should include key for React/Angular diffing', () => {
      const label: LinkLabel = {
        id: 'label-123',
        text: 'Keyed',
        position: 0.5,
        offset: { x: 0, y: 0 }
      };

      const mockLink = createMockLink([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
      const vnode = renderer.renderLabel(label, mockLink);

      expect(vnode).not.toBeNull();
      expect(vnode!.key).toBe('link-label-label-123');
    });
  });
});

// Helper function to create mock link
function createMockLink(points: Array<{ x: number; y: number }>): LinkModel {
  return {
    id: 'link-1',
    points,
    getPointAtPosition: (t: number) => {
      if (points.length === 0) return null;
      if (points.length === 1) return points[0]!;

      t = Math.max(0, Math.min(1, t));
      const from = points[0]!;
      const to = points[points.length - 1]!;
      return {
        x: from.x + (to.x - from.x) * t,
        y: from.y + (to.y - from.y) * t
      };
    },
    getAngleAt: (t: number) => {
      if (points.length < 2) return 0;

      const from = points[0]!;
      const to = points[points.length - 1]!;
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      return (Math.atan2(dy, dx) * 180) / Math.PI;
    }
  } as any;
}
