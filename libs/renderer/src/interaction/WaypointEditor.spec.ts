// WaypointEditor.spec.ts - Phase 2.3a: Waypoint editing tests
// TDD RED Phase: Write failing tests first

import { WaypointEditor, Waypoint, WaypointHandle } from './WaypointEditor';
import type { WaypointEditorConfig } from '../../../engine/src/config/InteractionConfig';

describe('WaypointEditor - Phase 2.3a', () => {
  let editor: WaypointEditor;
  let defaultConfig: WaypointEditorConfig;

  beforeEach(() => {
    defaultConfig = {
      snapToGrid: false,
      gridSize: 20,
      removeOnDoubleClick: true,
      handleRadius: 5,
      handleColor: '#3b82f6',
      handleStrokeColor: '#ffffff',
      minDistanceFromEndpoints: 30,
      clickDetectionRadius: 10,
    };
    editor = new WaypointEditor(defaultConfig);
  });

  describe('RED PHASE: Waypoint Detection', () => {
    it('should detect waypoint at specific index', () => {
      const linkPoints = [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 100, y: 0 },
      ];

      const waypoint = editor.getWaypointAt(1, linkPoints);

      expect(waypoint).toBeDefined();
      expect(waypoint?.index).toBe(1);
      expect(waypoint?.point).toEqual({ x: 50, y: 0 });
    });

    it('should return null for invalid waypoint index', () => {
      const linkPoints = [{ x: 0, y: 0 }, { x: 100, y: 100 }];

      const waypoint = editor.getWaypointAt(5, linkPoints);

      expect(waypoint).toBeNull();
    });

    it('should not detect endpoints as waypoints', () => {
      const linkPoints = [
        { x: 0, y: 0 },    // endpoint
        { x: 50, y: 50 },  // waypoint
        { x: 100, y: 100 },// endpoint
      ];

      // First and last points are endpoints, not waypoints
      expect(editor.isWaypoint(0, linkPoints)).toBe(false);
      expect(editor.isWaypoint(1, linkPoints)).toBe(true);
      expect(editor.isWaypoint(2, linkPoints)).toBe(false);
    });

    it('should get all waypoints excluding endpoints', () => {
      const linkPoints = [
        { x: 0, y: 0 },
        { x: 25, y: 25 },
        { x: 50, y: 50 },
        { x: 75, y: 75 },
        { x: 100, y: 100 },
      ];

      const waypoints = editor.getWaypoints(linkPoints);

      expect(waypoints).toHaveLength(3);
      expect(waypoints[0].index).toBe(1);
      expect(waypoints[1].index).toBe(2);
      expect(waypoints[2].index).toBe(3);
    });
  });

  describe('RED PHASE: Hit Testing', () => {
    it('should detect click on waypoint handle', () => {
      const linkPoints = [
        { x: 0, y: 0 },
        { x: 50, y: 50 },
        { x: 100, y: 100 },
      ];
      const mouseX = 52;
      const mouseY = 52;

      const hit = editor.hitTestWaypoint(mouseX, mouseY, linkPoints);

      expect(hit).toBeDefined();
      expect(hit?.waypointIndex).toBe(1);
    });

    it('should not detect click far from waypoint', () => {
      const linkPoints = [
        { x: 0, y: 0 },
        { x: 50, y: 50 },
        { x: 100, y: 100 },
      ];
      const mouseX = 80;
      const mouseY = 20;

      const hit = editor.hitTestWaypoint(mouseX, mouseY, linkPoints);

      expect(hit).toBeNull();
    });

    it('should use handle radius for hit detection', () => {
      const config = { ...defaultConfig, handleRadius: 10 };
      const customEditor = new WaypointEditor(config);

      const linkPoints = [
        { x: 0, y: 0 },
        { x: 50, y: 50 },
        { x: 100, y: 100 },
      ];

      // Within 10px should hit
      expect(customEditor.hitTestWaypoint(58, 58, linkPoints)).toBeDefined();
      // Beyond 10px should miss
      expect(customEditor.hitTestWaypoint(65, 65, linkPoints)).toBeNull();
    });

    it('should not hit test endpoints', () => {
      const linkPoints = [
        { x: 0, y: 0 },
        { x: 50, y: 50 },
        { x: 100, y: 100 },
      ];

      // Click on first point (endpoint)
      const hit1 = editor.hitTestWaypoint(2, 2, linkPoints);
      expect(hit1).toBeNull();

      // Click on last point (endpoint)
      const hit2 = editor.hitTestWaypoint(98, 98, linkPoints);
      expect(hit2).toBeNull();
    });
  });

  describe('RED PHASE: Path Hit Testing', () => {
    it('should detect click on link path segment', () => {
      const linkPoints = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ];
      const mouseX = 50;
      const mouseY = 2; // Close to the line

      const hit = editor.hitTestPath(mouseX, mouseY, linkPoints);

      expect(hit).toBeDefined();
      expect(hit?.segmentIndex).toBe(0);
      expect(hit?.insertPosition).toBeDefined();
    });

    it('should not detect click far from path', () => {
      const linkPoints = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ];
      const mouseX = 50;
      const mouseY = 50; // Too far

      const hit = editor.hitTestPath(mouseX, mouseY, linkPoints);

      expect(hit).toBeNull();
    });

    it('should use clickDetectionRadius for path hit testing', () => {
      const config = { ...defaultConfig, clickDetectionRadius: 15 };
      const customEditor = new WaypointEditor(config);

      const linkPoints = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ];

      // Within 15px should hit
      expect(customEditor.hitTestPath(50, 12, linkPoints)).toBeDefined();
      // Beyond 15px should miss
      expect(customEditor.hitTestPath(50, 20, linkPoints)).toBeNull();
    });

    it('should calculate correct insertion point on path', () => {
      const linkPoints = [
        { x: 0, y: 0 },
        { x: 100, y: 100 },
      ];
      const mouseX = 50;
      const mouseY = 50; // On the line

      const hit = editor.hitTestPath(mouseX, mouseY, linkPoints);

      expect(hit?.insertPosition).toBeDefined();
      expect(hit?.insertPosition.x).toBeCloseTo(50, 5);
      expect(hit?.insertPosition.y).toBeCloseTo(50, 5);
    });
  });

  describe('RED PHASE: Waypoint Addition', () => {
    it('should add waypoint at click position on path', () => {
      const linkPoints = [
        { x: 0, y: 0 },
        { x: 100, y: 100 },
      ];
      const clickX = 50;
      const clickY = 50;

      const result = editor.addWaypointAtPosition(clickX, clickY, linkPoints);

      expect(result).toBeDefined();
      expect(result?.newPoints).toHaveLength(3);
      expect(result?.waypointIndex).toBe(1);
      expect(result?.newPoints[1]).toEqual({ x: 50, y: 50 });
    });

    it('should not add waypoint if too close to endpoints', () => {
      const config = { ...defaultConfig, minDistanceFromEndpoints: 50 };
      const customEditor = new WaypointEditor(config);

      const linkPoints = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ];

      // Too close to start
      const result1 = customEditor.addWaypointAtPosition(20, 0, linkPoints);
      expect(result1).toBeNull();

      // Too close to end
      const result2 = customEditor.addWaypointAtPosition(90, 0, linkPoints);
      expect(result2).toBeNull();

      // Far enough from both
      const result3 = customEditor.addWaypointAtPosition(50, 0, linkPoints);
      expect(result3).toBeDefined();
    });

    it('should insert waypoint at correct segment index', () => {
      // Use config with smaller minDistanceFromEndpoints for this test
      const config = { ...defaultConfig, minDistanceFromEndpoints: 15 };
      const customEditor = new WaypointEditor(config);

      const linkPoints = [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 100, y: 0 },
      ];

      // Click on first segment (25px from start, but > 15px min distance)
      const result1 = customEditor.addWaypointAtPosition(25, 0, linkPoints);
      expect(result1?.segmentIndex).toBe(0);
      expect(result1?.waypointIndex).toBe(1);

      // Click on second segment (75px from start, 25px from end)
      const result2 = customEditor.addWaypointAtPosition(75, 0, linkPoints);
      expect(result2?.segmentIndex).toBe(1);
      expect(result2?.waypointIndex).toBe(2);
    });
  });

  describe('RED PHASE: Waypoint Movement', () => {
    it('should move waypoint to new position', () => {
      const linkPoints = [
        { x: 0, y: 0 },
        { x: 50, y: 50 },
        { x: 100, y: 100 },
      ];

      const result = editor.moveWaypoint(1, { x: 60, y: 40 }, linkPoints);

      expect(result).toHaveLength(3);
      expect(result![1]).toEqual({ x: 60, y: 40 });
    });

    it('should not move endpoint indices', () => {
      const linkPoints = [
        { x: 0, y: 0 },
        { x: 50, y: 50 },
        { x: 100, y: 100 },
      ];

      // Try to move first point (endpoint)
      const result1 = editor.moveWaypoint(0, { x: 10, y: 10 }, linkPoints);
      expect(result1).toBeNull();

      // Try to move last point (endpoint)
      const result2 = editor.moveWaypoint(2, { x: 110, y: 110 }, linkPoints);
      expect(result2).toBeNull();
    });

    it('should snap to grid when enabled', () => {
      const config = { ...defaultConfig, snapToGrid: true, gridSize: 20 };
      const customEditor = new WaypointEditor(config);

      const linkPoints = [
        { x: 0, y: 0 },
        { x: 50, y: 50 },
        { x: 100, y: 100 },
      ];

      const result = customEditor.moveWaypoint(1, { x: 47, y: 53 }, linkPoints);

      expect(result![1]).toEqual({ x: 40, y: 60 }); // Snapped to 20px grid
    });

    it('should not snap to grid when disabled', () => {
      const config = { ...defaultConfig, snapToGrid: false };
      const customEditor = new WaypointEditor(config);

      const linkPoints = [
        { x: 0, y: 0 },
        { x: 50, y: 50 },
        { x: 100, y: 100 },
      ];

      const result = customEditor.moveWaypoint(1, { x: 47, y: 53 }, linkPoints);

      expect(result![1]).toEqual({ x: 47, y: 53 }); // Not snapped
    });
  });

  describe('RED PHASE: Waypoint Removal', () => {
    it('should remove waypoint at index', () => {
      const linkPoints = [
        { x: 0, y: 0 },
        { x: 50, y: 50 },
        { x: 75, y: 75 },
        { x: 100, y: 100 },
      ];

      const result = editor.removeWaypoint(1, linkPoints);

      expect(result).toHaveLength(3);
      expect(result![1]).toEqual({ x: 75, y: 75 });
    });

    it('should not remove endpoint indices', () => {
      const linkPoints = [
        { x: 0, y: 0 },
        { x: 50, y: 50 },
        { x: 100, y: 100 },
      ];

      // Try to remove first point (endpoint)
      const result1 = editor.removeWaypoint(0, linkPoints);
      expect(result1).toBeNull();

      // Try to remove last point (endpoint)
      const result2 = editor.removeWaypoint(2, linkPoints);
      expect(result2).toBeNull();
    });

    it('should return null when removing from link with only endpoints', () => {
      const linkPoints = [
        { x: 0, y: 0 },
        { x: 100, y: 100 },
      ];

      const result = editor.removeWaypoint(1, linkPoints);
      expect(result).toBeNull();
    });
  });

  describe('RED PHASE: Grid Snapping', () => {
    it('should snap point to nearest grid intersection', () => {
      const config = { ...defaultConfig, gridSize: 20 };
      const customEditor = new WaypointEditor(config);

      const snapped1 = customEditor.snapToGrid({ x: 47, y: 53 });
      expect(snapped1).toEqual({ x: 40, y: 60 });

      const snapped2 = customEditor.snapToGrid({ x: 11, y: 9 });
      expect(snapped2).toEqual({ x: 20, y: 0 });
    });

    it('should handle negative coordinates', () => {
      const config = { ...defaultConfig, gridSize: 10 };
      const customEditor = new WaypointEditor(config);

      const snapped = customEditor.snapToGrid({ x: -17, y: -23 });
      expect(snapped).toEqual({ x: -20, y: -20 });
    });

    it('should use configured grid size', () => {
      const config1 = { ...defaultConfig, gridSize: 10 };
      const editor1 = new WaypointEditor(config1);
      expect(editor1.snapToGrid({ x: 25, y: 0 })).toEqual({ x: 30, y: 0 });

      const config2 = { ...defaultConfig, gridSize: 50 };
      const editor2 = new WaypointEditor(config2);
      // 25 is exactly between 0 and 50, rounds up to 50
      expect(editor2.snapToGrid({ x: 25, y: 0 })).toEqual({ x: 50, y: 0 });
    });
  });

  describe('RED PHASE: Distance Calculations', () => {
    it('should calculate distance from point to line segment', () => {
      const p1 = { x: 0, y: 0 };
      const p2 = { x: 100, y: 0 };
      const point = { x: 50, y: 10 };

      const distance = editor.distanceToSegment(point, p1, p2);

      expect(distance).toBeCloseTo(10, 1);
    });

    it('should handle point beyond segment endpoints', () => {
      const p1 = { x: 0, y: 0 };
      const p2 = { x: 100, y: 0 };

      // Point before start
      const point1 = { x: -10, y: 10 };
      const distance1 = editor.distanceToSegment(point1, p1, p2);
      expect(distance1).toBeCloseTo(14.14, 1); // sqrt(10^2 + 10^2)

      // Point after end
      const point2 = { x: 110, y: 10 };
      const distance2 = editor.distanceToSegment(point2, p1, p2);
      expect(distance2).toBeCloseTo(14.14, 1);
    });

    it('should calculate distance between two points', () => {
      const p1 = { x: 0, y: 0 };
      const p2 = { x: 3, y: 4 };

      const distance = editor.distance(p1, p2);

      expect(distance).toBe(5); // 3-4-5 triangle
    });
  });

  describe('RED PHASE: Configuration', () => {
    it('should use provided configuration', () => {
      const customConfig: WaypointEditorConfig = {
        snapToGrid: true,
        gridSize: 25,
        removeOnDoubleClick: false,
        handleRadius: 8,
        handleColor: '#ff0000',
        handleStrokeColor: '#000000',
        minDistanceFromEndpoints: 40,
        clickDetectionRadius: 15,
      };

      const customEditor = new WaypointEditor(customConfig);

      expect(customEditor.getConfig()).toEqual(customConfig);
    });

    it('should allow configuration updates', () => {
      const updates: Partial<WaypointEditorConfig> = {
        snapToGrid: true,
        gridSize: 30,
      };

      editor.updateConfig(updates);

      const config = editor.getConfig();
      expect(config.snapToGrid).toBe(true);
      expect(config.gridSize).toBe(30);
    });
  });

  describe('RED PHASE: VNode Rendering', () => {
    it('should generate VNode for waypoint handle', () => {
      const waypoint: Waypoint = {
        index: 1,
        point: { x: 50, y: 50 },
      };

      const vnode = editor.renderWaypointHandle(waypoint, 'link-123');

      expect(vnode.type).toBe('circle');
      expect(vnode.props.cx).toBe(50);
      expect(vnode.props.cy).toBe(50);
      expect(vnode.props.r).toBe(defaultConfig.handleRadius);
      expect(vnode.props.fill).toBe(defaultConfig.handleColor);
      expect(vnode.props.stroke).toBe(defaultConfig.handleStrokeColor);
    });

    it('should include key for React/Angular diffing', () => {
      const waypoint: Waypoint = {
        index: 2,
        point: { x: 75, y: 75 },
      };

      const vnode = editor.renderWaypointHandle(waypoint, 'link-456');

      expect(vnode.key).toBe('waypoint-link-456-2');
    });

    it('should include className for styling', () => {
      const waypoint: Waypoint = {
        index: 1,
        point: { x: 50, y: 50 },
      };

      const vnode = editor.renderWaypointHandle(waypoint, 'link-123');

      expect(vnode.props.className).toContain('waypoint-handle');
    });
  });

  describe('RED PHASE: Multiple Waypoints', () => {
    it('should handle link with many waypoints', () => {
      const linkPoints = [
        { x: 0, y: 0 },
        { x: 20, y: 20 },
        { x: 40, y: 20 },
        { x: 60, y: 40 },
        { x: 80, y: 40 },
        { x: 100, y: 60 },
      ];

      const waypoints = editor.getWaypoints(linkPoints);

      expect(waypoints).toHaveLength(4);
      expect(waypoints[0].index).toBe(1);
      expect(waypoints[1].index).toBe(2);
      expect(waypoints[2].index).toBe(3);
      expect(waypoints[3].index).toBe(4);
    });

    it('should add waypoint preserving existing waypoints', () => {
      // Use config with smaller minDistanceFromEndpoints
      const config = { ...defaultConfig, minDistanceFromEndpoints: 20 };
      const customEditor = new WaypointEditor(config);

      const linkPoints = [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 100, y: 0 },
      ];

      const result = customEditor.addWaypointAtPosition(25, 0, linkPoints);

      expect(result?.newPoints).toHaveLength(4);
      expect(result?.newPoints[1].x).toBe(25);
      expect(result?.newPoints[2].x).toBe(50); // Original waypoint preserved
    });

    it('should remove waypoint preserving other waypoints', () => {
      const linkPoints = [
        { x: 0, y: 0 },
        { x: 25, y: 25 },
        { x: 50, y: 50 },
        { x: 75, y: 75 },
        { x: 100, y: 100 },
      ];

      const result = editor.removeWaypoint(2, linkPoints);

      expect(result).toHaveLength(4);
      expect(result![1]).toEqual({ x: 25, y: 25 });
      expect(result![2]).toEqual({ x: 75, y: 75 });
    });
  });

  describe('RED PHASE: Edge Cases', () => {
    it('should handle empty points array', () => {
      const waypoints = editor.getWaypoints([]);
      expect(waypoints).toHaveLength(0);
    });

    it('should handle single point', () => {
      const waypoints = editor.getWaypoints([{ x: 0, y: 0 }]);
      expect(waypoints).toHaveLength(0);
    });

    it('should handle two points (no waypoints)', () => {
      const linkPoints = [
        { x: 0, y: 0 },
        { x: 100, y: 100 },
      ];

      const waypoints = editor.getWaypoints(linkPoints);
      expect(waypoints).toHaveLength(0);
    });

    it('should handle very close points', () => {
      const linkPoints = [
        { x: 0, y: 0 },
        { x: 0.1, y: 0.1 },
        { x: 100, y: 100 },
      ];

      const waypoints = editor.getWaypoints(linkPoints);
      expect(waypoints).toHaveLength(1);
    });

    it('should handle coincident points', () => {
      const linkPoints = [
        { x: 0, y: 0 },
        { x: 50, y: 50 },
        { x: 50, y: 50 }, // Duplicate
        { x: 100, y: 100 },
      ];

      const waypoints = editor.getWaypoints(linkPoints);
      expect(waypoints).toHaveLength(2);
    });
  });
});
