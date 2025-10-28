// ControlPointEditor.spec.ts - TDD tests for bezier control point editing
// Phase 2.3b: Control point editor for bezier curves

import { ControlPointEditor } from './ControlPointEditor';
import type { Point, PathSegment } from '@grafloria/engine';
import type { ControlPointEditorConfig } from '@grafloria/engine';

describe('ControlPointEditor', () => {
  let editor: ControlPointEditor;
  let config: ControlPointEditorConfig;

  beforeEach(() => {
    config = {
      snapToGrid: false,
      gridSize: 20,
      handleRadius: 6,
      handleColor: '#10b981',
      handleStrokeColor: '#ffffff',
      controlLineColor: '#6b7280',
      controlLineWidth: 1,
      controlLineDash: [5, 5],
      clickDetectionRadius: 10,
      showControlLines: true,
      symmetricControls: false,
    };
    editor = new ControlPointEditor(config);
  });

  describe('Control Point Detection', () => {
    it('should detect control points from bezier curve segments', () => {
      const segments: PathSegment[] = [
        {
          type: 'curve',
          from: { x: 0, y: 0 },
          to: { x: 100, y: 100 },
          control1: { x: 25, y: 50 },
          control2: { x: 75, y: 50 },
        },
      ];

      const controlPoints = editor.getControlPoints(segments);

      expect(controlPoints).toHaveLength(2);
      expect(controlPoints[0]).toEqual({
        point: { x: 25, y: 50 },
        segmentIndex: 0,
        type: 'control1',
        anchor: { x: 0, y: 0 },
      });
      expect(controlPoints[1]).toEqual({
        point: { x: 75, y: 50 },
        segmentIndex: 0,
        type: 'control2',
        anchor: { x: 100, y: 100 },
      });
    });

    it('should return empty array for straight line segments', () => {
      const segments: PathSegment[] = [
        {
          type: 'line',
          from: { x: 0, y: 0 },
          to: { x: 100, y: 100 },
        },
      ];

      const controlPoints = editor.getControlPoints(segments);

      expect(controlPoints).toHaveLength(0);
    });

    it('should detect control points from multiple curve segments', () => {
      const segments: PathSegment[] = [
        {
          type: 'curve',
          from: { x: 0, y: 0 },
          to: { x: 100, y: 0 },
          control1: { x: 25, y: -25 },
          control2: { x: 75, y: -25 },
        },
        {
          type: 'curve',
          from: { x: 100, y: 0 },
          to: { x: 200, y: 0 },
          control1: { x: 125, y: 25 },
          control2: { x: 175, y: 25 },
        },
      ];

      const controlPoints = editor.getControlPoints(segments);

      expect(controlPoints).toHaveLength(4);
      expect(controlPoints[0].segmentIndex).toBe(0);
      expect(controlPoints[1].segmentIndex).toBe(0);
      expect(controlPoints[2].segmentIndex).toBe(1);
      expect(controlPoints[3].segmentIndex).toBe(1);
    });

    it('should skip segments without control points', () => {
      const segments: PathSegment[] = [
        {
          type: 'line',
          from: { x: 0, y: 0 },
          to: { x: 50, y: 0 },
        },
        {
          type: 'curve',
          from: { x: 50, y: 0 },
          to: { x: 100, y: 0 },
          control1: { x: 60, y: -20 },
          control2: { x: 90, y: -20 },
        },
        {
          type: 'line',
          from: { x: 100, y: 0 },
          to: { x: 150, y: 0 },
        },
      ];

      const controlPoints = editor.getControlPoints(segments);

      expect(controlPoints).toHaveLength(2);
      expect(controlPoints[0].segmentIndex).toBe(1);
      expect(controlPoints[1].segmentIndex).toBe(1);
    });
  });

  describe('Hit Testing', () => {
    it('should detect click on control point handle', () => {
      const segments: PathSegment[] = [
        {
          type: 'curve',
          from: { x: 0, y: 0 },
          to: { x: 100, y: 100 },
          control1: { x: 25, y: 50 },
          control2: { x: 75, y: 50 },
        },
      ];

      // Click near first control point
      const result = editor.hitTestControlPoint(26, 51, segments);

      expect(result).not.toBeNull();
      expect(result!.segmentIndex).toBe(0);
      expect(result!.controlType).toBe('control1');
      expect(result!.point).toEqual({ x: 25, y: 50 });
    });

    it('should detect click on second control point', () => {
      const segments: PathSegment[] = [
        {
          type: 'curve',
          from: { x: 0, y: 0 },
          to: { x: 100, y: 100 },
          control1: { x: 25, y: 50 },
          control2: { x: 75, y: 50 },
        },
      ];

      // Click near second control point
      const result = editor.hitTestControlPoint(76, 49, segments);

      expect(result).not.toBeNull();
      expect(result!.segmentIndex).toBe(0);
      expect(result!.controlType).toBe('control2');
      expect(result!.point).toEqual({ x: 75, y: 50 });
    });

    it('should return null if click is too far from any control point', () => {
      const segments: PathSegment[] = [
        {
          type: 'curve',
          from: { x: 0, y: 0 },
          to: { x: 100, y: 100 },
          control1: { x: 25, y: 50 },
          control2: { x: 75, y: 50 },
        },
      ];

      // Click far from control points (> clickDetectionRadius)
      const result = editor.hitTestControlPoint(50, 100, segments);

      expect(result).toBeNull();
    });

    it('should return closest control point when multiple are nearby', () => {
      const segments: PathSegment[] = [
        {
          type: 'curve',
          from: { x: 0, y: 0 },
          to: { x: 100, y: 0 },
          control1: { x: 25, y: 25 },
          control2: { x: 30, y: 30 },  // Very close to control1
        },
      ];

      // Click at 27, 27 - closer to control1
      const result = editor.hitTestControlPoint(27, 27, segments);

      expect(result).not.toBeNull();
      expect(result!.controlType).toBe('control1');
    });

    it('should respect clickDetectionRadius config', () => {
      const smallRadiusConfig = { ...config, clickDetectionRadius: 3 };
      const smallRadiusEditor = new ControlPointEditor(smallRadiusConfig);

      const segments: PathSegment[] = [
        {
          type: 'curve',
          from: { x: 0, y: 0 },
          to: { x: 100, y: 100 },
          control1: { x: 25, y: 50 },
          control2: { x: 75, y: 50 },
        },
      ];

      // 5 pixels away - within default radius (10), but outside small radius (3)
      const result = smallRadiusEditor.hitTestControlPoint(30, 50, segments);

      expect(result).toBeNull();
    });

    it('should handle empty segments array', () => {
      const result = editor.hitTestControlPoint(50, 50, []);

      expect(result).toBeNull();
    });

    it('should handle segments with no control points', () => {
      const segments: PathSegment[] = [
        {
          type: 'line',
          from: { x: 0, y: 0 },
          to: { x: 100, y: 100 },
        },
      ];

      const result = editor.hitTestControlPoint(50, 50, segments);

      expect(result).toBeNull();
    });
  });

  describe('Moving Control Points', () => {
    it('should move control1 point to new position', () => {
      const segments: PathSegment[] = [
        {
          type: 'curve',
          from: { x: 0, y: 0 },
          to: { x: 100, y: 100 },
          control1: { x: 25, y: 50 },
          control2: { x: 75, y: 50 },
        },
      ];

      const newSegments = editor.moveControlPoint(
        0,
        'control1',
        { x: 30, y: 60 },
        segments
      );

      expect(newSegments).not.toBeNull();
      expect(newSegments![0].control1).toEqual({ x: 30, y: 60 });
      expect(newSegments![0].control2).toEqual({ x: 75, y: 50 });  // Unchanged
    });

    it('should move control2 point to new position', () => {
      const segments: PathSegment[] = [
        {
          type: 'curve',
          from: { x: 0, y: 0 },
          to: { x: 100, y: 100 },
          control1: { x: 25, y: 50 },
          control2: { x: 75, y: 50 },
        },
      ];

      const newSegments = editor.moveControlPoint(
        0,
        'control2',
        { x: 80, y: 60 },
        segments
      );

      expect(newSegments).not.toBeNull();
      expect(newSegments![0].control1).toEqual({ x: 25, y: 50 });  // Unchanged
      expect(newSegments![0].control2).toEqual({ x: 80, y: 60 });
    });

    it('should apply grid snapping when enabled', () => {
      const snapConfig = { ...config, snapToGrid: true, gridSize: 20 };
      const snapEditor = new ControlPointEditor(snapConfig);

      const segments: PathSegment[] = [
        {
          type: 'curve',
          from: { x: 0, y: 0 },
          to: { x: 100, y: 100 },
          control1: { x: 25, y: 50 },
          control2: { x: 75, y: 50 },
        },
      ];

      // Move to 33, 47 - should snap to 40, 40
      const newSegments = snapEditor.moveControlPoint(
        0,
        'control1',
        { x: 33, y: 47 },
        segments
      );

      expect(newSegments![0].control1).toEqual({ x: 40, y: 40 });
    });

    it('should return null for invalid segment index', () => {
      const segments: PathSegment[] = [
        {
          type: 'curve',
          from: { x: 0, y: 0 },
          to: { x: 100, y: 100 },
          control1: { x: 25, y: 50 },
          control2: { x: 75, y: 50 },
        },
      ];

      const newSegments = editor.moveControlPoint(
        5,  // Invalid index
        'control1',
        { x: 30, y: 60 },
        segments
      );

      expect(newSegments).toBeNull();
    });

    it('should return null for line segments without control points', () => {
      const segments: PathSegment[] = [
        {
          type: 'line',
          from: { x: 0, y: 0 },
          to: { x: 100, y: 100 },
        },
      ];

      const newSegments = editor.moveControlPoint(
        0,
        'control1',
        { x: 30, y: 60 },
        segments
      );

      expect(newSegments).toBeNull();
    });

    it('should update symmetric control point when symmetricControls is enabled', () => {
      const symConfig = { ...config, symmetricControls: true };
      const symEditor = new ControlPointEditor(symConfig);

      const segments: PathSegment[] = [
        {
          type: 'curve',
          from: { x: 0, y: 0 },
          to: { x: 100, y: 0 },
          control1: { x: 25, y: -25 },
          control2: { x: 75, y: 25 },
        },
        {
          type: 'curve',
          from: { x: 100, y: 0 },
          to: { x: 200, y: 0 },
          control1: { x: 125, y: -25 },  // Should mirror with previous control2
          control2: { x: 175, y: 25 },
        },
      ];

      // Move control2 of first segment
      const newSegments = symEditor.moveControlPoint(
        0,
        'control2',
        { x: 75, y: 30 },
        segments
      );

      expect(newSegments![0].control2).toEqual({ x: 75, y: 30 });
      // control1 of next segment should mirror
      expect(newSegments![1].control1).toEqual({ x: 125, y: -30 });
    });
  });

  describe('Auto-generating Control Points', () => {
    it('should auto-generate control points for smooth curve from straight points', () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
      ];

      const segments = editor.generateBezierSegments(points);

      expect(segments).toHaveLength(2);
      expect(segments[0].type).toBe('curve');
      expect(segments[0].control1).toBeDefined();
      expect(segments[0].control2).toBeDefined();
      expect(segments[1].type).toBe('curve');
      expect(segments[1].control1).toBeDefined();
      expect(segments[1].control2).toBeDefined();
    });

    it('should generate control points with reasonable distances', () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ];

      const segments = editor.generateBezierSegments(points);

      const segment = segments[0];
      expect(segment.control1).toBeDefined();
      expect(segment.control2).toBeDefined();

      // Control points should be roughly 1/3 distance from endpoints
      expect(segment.control1!.x).toBeGreaterThan(0);
      expect(segment.control1!.x).toBeLessThan(50);
      expect(segment.control2!.x).toBeGreaterThan(50);
      expect(segment.control2!.x).toBeLessThan(100);
    });

    it('should handle two-point path (single segment)', () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 100, y: 100 },
      ];

      const segments = editor.generateBezierSegments(points);

      expect(segments).toHaveLength(1);
      expect(segments[0].type).toBe('curve');
      expect(segments[0].from).toEqual({ x: 0, y: 0 });
      expect(segments[0].to).toEqual({ x: 100, y: 100 });
      expect(segments[0].control1).toBeDefined();
      expect(segments[0].control2).toBeDefined();
    });

    it('should return empty array for single point', () => {
      const points: Point[] = [{ x: 0, y: 0 }];

      const segments = editor.generateBezierSegments(points);

      expect(segments).toHaveLength(0);
    });

    it('should return empty array for empty points', () => {
      const points: Point[] = [];

      const segments = editor.generateBezierSegments(points);

      expect(segments).toHaveLength(0);
    });
  });

  describe('Grid Snapping', () => {
    it('should snap point to grid', () => {
      const snapConfig = { ...config, snapToGrid: true, gridSize: 20 };
      const snapEditor = new ControlPointEditor(snapConfig);

      const snapped = snapEditor.snapToGrid({ x: 33, y: 47 });

      expect(snapped).toEqual({ x: 40, y: 40 });
    });

    it('should snap negative coordinates correctly', () => {
      const snapConfig = { ...config, snapToGrid: true, gridSize: 20 };
      const snapEditor = new ControlPointEditor(snapConfig);

      const snapped = snapEditor.snapToGrid({ x: -33, y: -47 });

      expect(snapped).toEqual({ x: -40, y: -40 });
    });

    it('should handle zero point', () => {
      const snapConfig = { ...config, snapToGrid: true, gridSize: 20 };
      const snapEditor = new ControlPointEditor(snapConfig);

      const snapped = snapEditor.snapToGrid({ x: 0, y: 0 });

      expect(snapped).toEqual({ x: 0, y: 0 });
    });
  });

  describe('Distance Calculations', () => {
    it('should calculate distance between two points', () => {
      const p1 = { x: 0, y: 0 };
      const p2 = { x: 3, y: 4 };

      const distance = editor.calculateDistance(p1, p2);

      expect(distance).toBe(5);  // 3-4-5 triangle
    });

    it('should return zero for same point', () => {
      const p = { x: 10, y: 20 };

      const distance = editor.calculateDistance(p, p);

      expect(distance).toBe(0);
    });

    it('should handle negative coordinates', () => {
      const p1 = { x: -3, y: -4 };
      const p2 = { x: 0, y: 0 };

      const distance = editor.calculateDistance(p1, p2);

      expect(distance).toBe(5);
    });
  });

  describe('VNode Rendering', () => {
    it('should render control point handle as VNode', () => {
      const controlPoint = {
        point: { x: 50, y: 50 },
        segmentIndex: 0,
        type: 'control1' as const,
        anchor: { x: 0, y: 0 },
      };

      const vnode = editor.renderControlPointHandle(controlPoint, 'link-123');

      expect(vnode.type).toBe('circle');
      expect(vnode.props.cx).toBe(50);
      expect(vnode.props.cy).toBe(50);
      expect(vnode.props.r).toBe(config.handleRadius);
      expect(vnode.props.fill).toBe(config.handleColor);
      expect(vnode.props.stroke).toBe(config.handleStrokeColor);
      expect(vnode.props.className).toContain('control-point-handle');
    });

    it('should render control line as VNode when showControlLines is true', () => {
      const controlPoint = {
        point: { x: 50, y: 50 },
        segmentIndex: 0,
        type: 'control1' as const,
        anchor: { x: 0, y: 0 },
      };

      const vnode = editor.renderControlLine(controlPoint, 'link-123');

      expect(vnode.type).toBe('line');
      expect(vnode.props.x1).toBe(0);
      expect(vnode.props.y1).toBe(0);
      expect(vnode.props.x2).toBe(50);
      expect(vnode.props.y2).toBe(50);
      expect(vnode.props.stroke).toBe(config.controlLineColor);
      expect(vnode.props.strokeWidth).toBe(config.controlLineWidth);
      expect(vnode.props.strokeDasharray).toBe('5,5');
    });

    it('should render all control point handles for a link', () => {
      const segments: PathSegment[] = [
        {
          type: 'curve',
          from: { x: 0, y: 0 },
          to: { x: 100, y: 100 },
          control1: { x: 25, y: 50 },
          control2: { x: 75, y: 50 },
        },
      ];

      const vnodes = editor.renderControlPointHandles(segments, 'link-123');

      // Should render 2 control lines + 2 control point handles = 4 vnodes
      expect(vnodes).toHaveLength(4);
      expect(vnodes[0].type).toBe('line');  // Control line 1
      expect(vnodes[1].type).toBe('circle'); // Control point 1
      expect(vnodes[2].type).toBe('line');  // Control line 2
      expect(vnodes[3].type).toBe('circle'); // Control point 2
    });

    it('should not render control lines when showControlLines is false', () => {
      const noLinesConfig = { ...config, showControlLines: false };
      const noLinesEditor = new ControlPointEditor(noLinesConfig);

      const segments: PathSegment[] = [
        {
          type: 'curve',
          from: { x: 0, y: 0 },
          to: { x: 100, y: 100 },
          control1: { x: 25, y: 50 },
          control2: { x: 75, y: 50 },
        },
      ];

      const vnodes = noLinesEditor.renderControlPointHandles(segments, 'link-123');

      // Should render only 2 control point handles (no lines)
      expect(vnodes).toHaveLength(2);
      expect(vnodes[0].type).toBe('circle');
      expect(vnodes[1].type).toBe('circle');
    });

    it('should return empty array for non-curve segments', () => {
      const segments: PathSegment[] = [
        {
          type: 'line',
          from: { x: 0, y: 0 },
          to: { x: 100, y: 100 },
        },
      ];

      const vnodes = editor.renderControlPointHandles(segments, 'link-123');

      expect(vnodes).toHaveLength(0);
    });
  });

  describe('Configuration', () => {
    it('should use custom configuration values', () => {
      const customConfig: ControlPointEditorConfig = {
        snapToGrid: true,
        gridSize: 50,
        handleRadius: 10,
        handleColor: '#ff0000',
        handleStrokeColor: '#000000',
        controlLineColor: '#00ff00',
        controlLineWidth: 3,
        controlLineDash: [10, 5],
        clickDetectionRadius: 20,
        showControlLines: false,
        symmetricControls: true,
      };
      const customEditor = new ControlPointEditor(customConfig);

      const controlPoint = {
        point: { x: 50, y: 50 },
        segmentIndex: 0,
        type: 'control1' as const,
        anchor: { x: 0, y: 0 },
      };

      const vnode = customEditor.renderControlPointHandle(controlPoint, 'link-123');

      expect(vnode.props.r).toBe(10);
      expect(vnode.props.fill).toBe('#ff0000');
      expect(vnode.props.stroke).toBe('#000000');
    });

    it('should allow updating configuration', () => {
      editor.updateConfig({ handleRadius: 8, handleColor: '#ff00ff' });

      const controlPoint = {
        point: { x: 50, y: 50 },
        segmentIndex: 0,
        type: 'control1' as const,
        anchor: { x: 0, y: 0 },
      };

      const vnode = editor.renderControlPointHandle(controlPoint, 'link-123');

      expect(vnode.props.r).toBe(8);
      expect(vnode.props.fill).toBe('#ff00ff');
    });
  });

  describe('Edge Cases', () => {
    it('should handle very small distances', () => {
      const p1 = { x: 0, y: 0 };
      const p2 = { x: 0.001, y: 0.001 };

      const distance = editor.calculateDistance(p1, p2);

      expect(distance).toBeCloseTo(0.001414, 5);
    });

    it('should handle very large coordinates', () => {
      const p1 = { x: 0, y: 0 };
      const p2 = { x: 10000, y: 10000 };

      const distance = editor.calculateDistance(p1, p2);

      expect(distance).toBeCloseTo(14142.135, 2);
    });

    it('should handle segments with only control1 defined', () => {
      const segments: PathSegment[] = [
        {
          type: 'curve',
          from: { x: 0, y: 0 },
          to: { x: 100, y: 100 },
          control1: { x: 25, y: 50 },
          // control2 is undefined
        },
      ];

      const controlPoints = editor.getControlPoints(segments);

      expect(controlPoints).toHaveLength(1);
      expect(controlPoints[0].type).toBe('control1');
    });

    it('should handle segments with only control2 defined', () => {
      const segments: PathSegment[] = [
        {
          type: 'curve',
          from: { x: 0, y: 0 },
          to: { x: 100, y: 100 },
          // control1 is undefined
          control2: { x: 75, y: 50 },
        },
      ];

      const controlPoints = editor.getControlPoints(segments);

      expect(controlPoints).toHaveLength(1);
      expect(controlPoints[0].type).toBe('control2');
    });

    it('should handle NaN coordinates gracefully', () => {
      const segments: PathSegment[] = [
        {
          type: 'curve',
          from: { x: 0, y: 0 },
          to: { x: 100, y: 100 },
          control1: { x: NaN, y: 50 },
          control2: { x: 75, y: NaN },
        },
      ];

      // Should not throw error
      expect(() => editor.getControlPoints(segments)).not.toThrow();
    });

    it('should handle clicking at exact control point position', () => {
      const segments: PathSegment[] = [
        {
          type: 'curve',
          from: { x: 0, y: 0 },
          to: { x: 100, y: 100 },
          control1: { x: 25, y: 50 },
          control2: { x: 75, y: 50 },
        },
      ];

      // Click exactly on control point
      const result = editor.hitTestControlPoint(25, 50, segments);

      expect(result).not.toBeNull();
      expect(result!.controlType).toBe('control1');
    });
  });
});
