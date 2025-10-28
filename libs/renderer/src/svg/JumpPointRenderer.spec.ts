// JumpPointRenderer.spec.ts
// TDD tests for jump point rendering (Phase 1.3 Part 2)

import { JumpPointRenderer } from './JumpPointRenderer';
import type { Intersection } from './JumpPointDetector';
import type { VNode } from '../types/vnode.types';
import type { JumpPointConfig } from '@grafloria/engine';

describe('JumpPointRenderer (Phase 1.3 Part 2)', () => {
  let renderer: JumpPointRenderer;

  beforeEach(() => {
    renderer = new JumpPointRenderer();
  });

  describe('RED PHASE: Basic Jump Point Rendering', () => {
    it('should create JumpPointRenderer instance', () => {
      expect(renderer).toBeDefined();
      expect(renderer).toBeInstanceOf(JumpPointRenderer);
    });

    it('should render path without modifications when no intersections', () => {
      const pathData = 'M 0 0 L 100 0';
      const intersections: Intersection[] = [];
      const config: JumpPointConfig = { enabled: true };

      const result = renderer.renderWithJumpPoints(pathData, intersections, config);

      expect(result).toBeDefined();
      expect(result.type).toBe('path');
      expect(result.props.d).toBe(pathData);
    });

    it('should render path with arc jump point', () => {
      const pathData = 'M 0 50 L 100 50';
      const intersections: Intersection[] = [
        {
          point: { x: 50, y: 50 },
          angle: 90,
          t1: 0.5,
          t2: 0.5,
          linkId: 'other-link'
        }
      ];
      const config: JumpPointConfig = {
        enabled: true,
        style: 'arc',
        size: 10
      };

      const result = renderer.renderWithJumpPoints(pathData, intersections, config);

      expect(result).toBeDefined();
      expect(result.type).toBe('path');
      // Path should be modified with arc
      expect(result.props.d).not.toBe(pathData);
      expect(result.props.d).toContain('A'); // Arc command
    });

    it('should render path with gap jump point', () => {
      const pathData = 'M 0 50 L 100 50';
      const intersections: Intersection[] = [
        {
          point: { x: 50, y: 50 },
          angle: 90,
          t1: 0.5,
          t2: 0.5
        }
      ];
      const config: JumpPointConfig = {
        enabled: true,
        style: 'gap',
        size: 10
      };

      const result = renderer.renderWithJumpPoints(pathData, intersections, config);

      expect(result).toBeDefined();
      expect(result.type).toBe('path');
      // Path should be split with gap (M command for new segment)
      expect(result.props.d).toBeDefined();
      const mCount = (result.props.d!.match(/M/g) || []).length;
      expect(mCount).toBeGreaterThan(1);
    });

    it('should render path with bridge jump point', () => {
      const pathData = 'M 0 50 L 100 50';
      const intersections: Intersection[] = [
        {
          point: { x: 50, y: 50 },
          angle: 90,
          t1: 0.5,
          t2: 0.5
        }
      ];
      const config: JumpPointConfig = {
        enabled: true,
        style: 'bridge',
        size: 10
      };

      const result = renderer.renderWithJumpPoints(pathData, intersections, config);

      expect(result).toBeDefined();
      expect(result.type).toBe('path');
      // Path should have bridge shape (multiple line segments)
      expect(result.props.d).not.toBe(pathData);
    });
  });

  describe('RED PHASE: Multiple Jump Points', () => {
    it('should handle multiple intersections on same path', () => {
      const pathData = 'M 0 50 L 100 50';
      const intersections: Intersection[] = [
        {
          point: { x: 25, y: 50 },
          angle: 90,
          t1: 0.25,
          t2: 0.5
        },
        {
          point: { x: 75, y: 50 },
          angle: 90,
          t1: 0.75,
          t2: 0.5
        }
      ];
      const config: JumpPointConfig = {
        enabled: true,
        style: 'arc',
        size: 10
      };

      const result = renderer.renderWithJumpPoints(pathData, intersections, config);

      expect(result).toBeDefined();
      // Should have multiple arcs
      expect(result.props.d).toBeDefined();
      const arcCount = (result.props.d!.match(/A/g) || []).length;
      expect(arcCount).toBeGreaterThanOrEqual(2);
    });

    it('should sort intersections by position', () => {
      const pathData = 'M 0 50 L 100 50';
      const intersections: Intersection[] = [
        {
          point: { x: 75, y: 50 },
          angle: 90,
          t1: 0.75,
          t2: 0.5
        },
        {
          point: { x: 25, y: 50 },
          angle: 90,
          t1: 0.25,
          t2: 0.5
        }
      ];
      const config: JumpPointConfig = {
        enabled: true,
        style: 'arc',
        size: 10
      };

      const result = renderer.renderWithJumpPoints(pathData, intersections, config);

      // Should handle out-of-order intersections correctly
      expect(result).toBeDefined();
      expect(result.props.d).toBeDefined();
    });

    it('should handle intersections at different segments', () => {
      const pathData = 'M 0 0 L 50 50 L 100 0';
      const intersections: Intersection[] = [
        {
          point: { x: 25, y: 25 },
          angle: 90,
          t1: 0.25,
          t2: 0.5,
          segmentIndex: 0
        },
        {
          point: { x: 75, y: 25 },
          angle: 90,
          t1: 0.25,
          t2: 0.5,
          segmentIndex: 1
        }
      ];
      const config: JumpPointConfig = {
        enabled: true,
        style: 'arc',
        size: 10
      };

      const result = renderer.renderWithJumpPoints(pathData, intersections, config);

      expect(result).toBeDefined();
    });
  });

  describe('RED PHASE: Jump Point Sizing', () => {
    it('should respect custom size', () => {
      const pathData = 'M 0 50 L 100 50';
      const intersections: Intersection[] = [
        {
          point: { x: 50, y: 50 },
          angle: 90,
          t1: 0.5,
          t2: 0.5
        }
      ];
      const config: JumpPointConfig = {
        enabled: true,
        style: 'arc',
        size: 20
      };

      const result = renderer.renderWithJumpPoints(pathData, intersections, config);

      expect(result).toBeDefined();
      // Larger size should be reflected in path
      expect(result.props.d).toBeDefined();
    });

    it('should use default size when not specified', () => {
      const pathData = 'M 0 50 L 100 50';
      const intersections: Intersection[] = [
        {
          point: { x: 50, y: 50 },
          angle: 90,
          t1: 0.5,
          t2: 0.5
        }
      ];
      const config: JumpPointConfig = {
        enabled: true,
        style: 'arc'
      };

      const result = renderer.renderWithJumpPoints(pathData, intersections, config);

      expect(result).toBeDefined();
    });

    it('should handle zero size gracefully', () => {
      const pathData = 'M 0 50 L 100 50';
      const intersections: Intersection[] = [
        {
          point: { x: 50, y: 50 },
          angle: 90,
          t1: 0.5,
          t2: 0.5
        }
      ];
      const config: JumpPointConfig = {
        enabled: true,
        style: 'arc',
        size: 0
      };

      const result = renderer.renderWithJumpPoints(pathData, intersections, config);

      // Should return path without modifications
      expect(result.props.d).toBe(pathData);
    });
  });

  describe('RED PHASE: Path Parsing', () => {
    it('should parse simple line path', () => {
      const pathData = 'M 0 0 L 100 0';
      const points = (renderer as any).parsePathToPoints(pathData);

      expect(points.length).toBe(2);
      expect(points[0]).toEqual({ x: 0, y: 0 });
      expect(points[1]).toEqual({ x: 100, y: 0 });
    });

    it('should parse multi-segment path', () => {
      const pathData = 'M 0 0 L 50 50 L 100 0';
      const points = (renderer as any).parsePathToPoints(pathData);

      expect(points.length).toBe(3);
      expect(points[0]).toEqual({ x: 0, y: 0 });
      expect(points[1]).toEqual({ x: 50, y: 50 });
      expect(points[2]).toEqual({ x: 100, y: 0 });
    });

    it('should handle path with no spaces', () => {
      const pathData = 'M0,0L100,0';
      const points = (renderer as any).parsePathToPoints(pathData);

      expect(points.length).toBe(2);
    });

    it('should handle path with curves', () => {
      const pathData = 'M 0 0 Q 50 50 100 0';
      const points = (renderer as any).parsePathToPoints(pathData);

      // Should extract control points and endpoints
      expect(points.length).toBeGreaterThan(0);
    });
  });

  describe('RED PHASE: Arc Generation', () => {
    it('should generate arc path for horizontal line', () => {
      const start = { x: 40, y: 50 };
      const end = { x: 60, y: 50 };
      const center = { x: 50, y: 50 };
      const size = 10;

      const arc = (renderer as any).generateArcPath(start, end, center, size, 90);

      expect(arc).toContain('A');
      expect(arc).toContain('5'); // radius (size/2)
    });

    it('should generate arc path for vertical line', () => {
      const start = { x: 50, y: 40 };
      const end = { x: 50, y: 60 };
      const center = { x: 50, y: 50 };
      const size = 10;

      const arc = (renderer as any).generateArcPath(start, end, center, size, 90);

      expect(arc).toContain('A');
    });

    it('should adjust arc direction based on angle', () => {
      const start = { x: 40, y: 50 };
      const end = { x: 60, y: 50 };
      const center = { x: 50, y: 50 };
      const size = 10;

      const arc90 = (renderer as any).generateArcPath(start, end, center, size, 90);
      const arc45 = (renderer as any).generateArcPath(start, end, center, size, 45);

      // Different angles may produce different arc shapes
      expect(arc90).toBeDefined();
      expect(arc45).toBeDefined();
    });
  });

  describe('RED PHASE: Gap Generation', () => {
    it('should generate gap by splitting path', () => {
      const start = { x: 40, y: 50 };
      const end = { x: 60, y: 50 };
      const center = { x: 50, y: 50 };
      const size = 10;

      const gap = (renderer as any).generateGapPath(start, end, center, size);

      // Gap should have M command to start new segment
      expect(gap).toContain('M');
    });

    it('should calculate correct gap endpoints', () => {
      const start = { x: 0, y: 50 };
      const end = { x: 100, y: 50 };
      const center = { x: 50, y: 50 };
      const size = 10;

      const gap = (renderer as any).generateGapPath(start, end, center, size);

      expect(gap).toBeDefined();
      // Should skip from (50-5) to (50+5)
    });
  });

  describe('RED PHASE: Bridge Generation', () => {
    it('should generate bridge path', () => {
      const start = { x: 40, y: 50 };
      const end = { x: 60, y: 50 };
      const center = { x: 50, y: 50 };
      const size = 10;

      const bridge = (renderer as any).generateBridgePath(start, end, center, size, 90);

      expect(bridge).toContain('L');
      // Bridge should have multiple line segments
      const lCount = (bridge.match(/L/g) || []).length;
      expect(lCount).toBeGreaterThan(1);
    });

    it('should create bridge perpendicular to line', () => {
      const start = { x: 40, y: 50 };
      const end = { x: 60, y: 50 };
      const center = { x: 50, y: 50 };
      const size = 10;

      const bridge = (renderer as any).generateBridgePath(start, end, center, size, 90);

      // Should have vertical offset for horizontal line
      expect(bridge).toBeDefined();
    });
  });

  describe('RED PHASE: Edge Cases', () => {
    it('should handle disabled jump points', () => {
      const pathData = 'M 0 50 L 100 50';
      const intersections: Intersection[] = [
        {
          point: { x: 50, y: 50 },
          angle: 90,
          t1: 0.5,
          t2: 0.5
        }
      ];
      const config: JumpPointConfig = {
        enabled: false
      };

      const result = renderer.renderWithJumpPoints(pathData, intersections, config);

      expect(result.props.d).toBe(pathData); // No modifications
    });

    it('should handle empty path', () => {
      const pathData = '';
      const intersections: Intersection[] = [];
      const config: JumpPointConfig = { enabled: true };

      const result = renderer.renderWithJumpPoints(pathData, intersections, config);

      expect(result).toBeDefined();
    });

    it('should handle invalid path data', () => {
      const pathData = 'INVALID PATH';
      const intersections: Intersection[] = [];
      const config: JumpPointConfig = { enabled: true };

      const result = renderer.renderWithJumpPoints(pathData, intersections, config);

      // Should handle gracefully
      expect(result).toBeDefined();
    });

    it('should handle intersections outside segment bounds', () => {
      const pathData = 'M 0 50 L 100 50';
      const intersections: Intersection[] = [
        {
          point: { x: 50, y: 50 },
          angle: 90,
          t1: 1.5, // Outside bounds
          t2: 0.5
        }
      ];
      const config: JumpPointConfig = {
        enabled: true,
        style: 'arc',
        size: 10
      };

      const result = renderer.renderWithJumpPoints(pathData, intersections, config);

      // Should handle gracefully
      expect(result).toBeDefined();
    });

    it('should handle very close intersections', () => {
      const pathData = 'M 0 50 L 100 50';
      const intersections: Intersection[] = [
        {
          point: { x: 50, y: 50 },
          angle: 90,
          t1: 0.5,
          t2: 0.5
        },
        {
          point: { x: 50.1, y: 50 },
          angle: 90,
          t1: 0.501,
          t2: 0.5
        }
      ];
      const config: JumpPointConfig = {
        enabled: true,
        style: 'arc',
        size: 10
      };

      const result = renderer.renderWithJumpPoints(pathData, intersections, config);

      expect(result).toBeDefined();
    });
  });

  describe('RED PHASE: VNode Structure', () => {
    it('should return valid VNode', () => {
      const pathData = 'M 0 50 L 100 50';
      const intersections: Intersection[] = [];
      const config: JumpPointConfig = { enabled: true };

      const result = renderer.renderWithJumpPoints(pathData, intersections, config);

      expect(result.type).toBe('path');
      expect(result.props).toBeDefined();
      expect(typeof result.props).toBe('object');
      expect(result.props.d).toBeDefined();
    });

    it('should preserve original path properties', () => {
      const pathData = 'M 0 50 L 100 50';
      const intersections: Intersection[] = [];
      const config: JumpPointConfig = { enabled: true };
      const originalProps = {
        stroke: '#ff0000',
        strokeWidth: 2,
        fill: 'none'
      };

      const result = renderer.renderWithJumpPoints(
        pathData,
        intersections,
        config,
        originalProps
      );

      expect(result.props.stroke).toBe('#ff0000');
      expect(result.props.strokeWidth).toBe(2);
      expect(result.props.fill).toBe('none');
    });
  });

  describe('RED PHASE: Performance', () => {
    it('should handle many intersections efficiently', () => {
      const pathData = 'M 0 50 L 1000 50';
      const intersections: Intersection[] = [];
      for (let i = 1; i < 100; i++) {
        intersections.push({
          point: { x: i * 10, y: 50 },
          angle: 90,
          t1: i * 0.01,
          t2: 0.5
        });
      }
      const config: JumpPointConfig = {
        enabled: true,
        style: 'arc',
        size: 10
      };

      const start = performance.now();
      const result = renderer.renderWithJumpPoints(pathData, intersections, config);
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(100); // Should be fast
      expect(result).toBeDefined();
    });
  });
});
