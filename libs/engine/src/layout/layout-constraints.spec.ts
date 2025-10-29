/**
 * Unit tests for Layout Constraints
 */

import {
  ConstraintManager,
  LayoutConstraints,
  NodeConstraint,
  Position,
  Boundary,
} from './layout-constraints.interface';

describe('ConstraintManager', () => {
  describe('Basic functionality', () => {
    it('should create empty manager', () => {
      const manager = new ConstraintManager();
      expect(manager.getConstrainedNodeCount()).toBe(0);
      expect(manager.getConstrainedNodeIds()).toEqual([]);
    });

    it('should create manager with constraints', () => {
      const constraints: LayoutConstraints = {
        constraints: [
          {
            nodeId: 'node1',
            type: 'pin',
            position: { x: 100, y: 200 },
          },
        ],
      };

      const manager = new ConstraintManager(constraints);
      expect(manager.getConstrainedNodeCount()).toBe(1);
      expect(manager.hasConstraints('node1')).toBe(true);
      expect(manager.hasConstraints('node2')).toBe(false);
    });

    it('should add constraints', () => {
      const manager = new ConstraintManager();
      manager.addConstraints({
        constraints: [
          {
            nodeId: 'node1',
            type: 'pin',
            position: { x: 100, y: 200 },
          },
          {
            nodeId: 'node2',
            type: 'fix-x',
            value: 50,
          },
        ],
      });

      expect(manager.getConstrainedNodeCount()).toBe(2);
      expect(manager.getConstrainedNodeIds()).toContain('node1');
      expect(manager.getConstrainedNodeIds()).toContain('node2');
    });

    it('should get constraints for node', () => {
      const manager = new ConstraintManager();
      manager.addConstraints({
        constraints: [
          {
            nodeId: 'node1',
            type: 'pin',
            position: { x: 100, y: 200 },
          },
          {
            nodeId: 'node1',
            type: 'boundary',
            boundary: { minX: 0, maxX: 500 },
          },
        ],
      });

      const constraints = manager.getConstraints('node1');
      expect(constraints.length).toBe(2);
      expect(constraints[0].type).toBe('pin');
      expect(constraints[1].type).toBe('boundary');
    });

    it('should remove constraints for node', () => {
      const manager = new ConstraintManager();
      manager.addConstraints({
        constraints: [
          {
            nodeId: 'node1',
            type: 'pin',
            position: { x: 100, y: 200 },
          },
        ],
      });

      expect(manager.hasConstraints('node1')).toBe(true);
      manager.removeConstraints('node1');
      expect(manager.hasConstraints('node1')).toBe(false);
    });

    it('should clear all constraints', () => {
      const manager = new ConstraintManager();
      manager.addConstraints({
        constraints: [
          { nodeId: 'node1', type: 'pin', position: { x: 100, y: 200 } },
          { nodeId: 'node2', type: 'fix-x', value: 50 },
        ],
      });

      expect(manager.getConstrainedNodeCount()).toBe(2);
      manager.clear();
      expect(manager.getConstrainedNodeCount()).toBe(0);
    });
  });

  describe('Pin constraint', () => {
    it('should pin node to exact position', () => {
      const manager = new ConstraintManager();
      manager.addConstraints({
        constraints: [
          {
            nodeId: 'node1',
            type: 'pin',
            position: { x: 100, y: 200 },
          },
        ],
      });

      const result = manager.applyConstraints('node1', { x: 0, y: 0 });
      expect(result).toEqual({ x: 100, y: 200 });
    });

    it('should return original position for unconstrained node', () => {
      const manager = new ConstraintManager();
      const result = manager.applyConstraints('node1', { x: 50, y: 75 });
      expect(result).toEqual({ x: 50, y: 75 });
    });
  });

  describe('Fix-X constraint', () => {
    it('should fix X coordinate and allow Y to vary', () => {
      const manager = new ConstraintManager();
      manager.addConstraints({
        constraints: [
          {
            nodeId: 'node1',
            type: 'fix-x',
            value: 100,
          },
        ],
      });

      const result = manager.applyConstraints('node1', { x: 50, y: 75 });
      expect(result).toEqual({ x: 100, y: 75 });
    });
  });

  describe('Fix-Y constraint', () => {
    it('should fix Y coordinate and allow X to vary', () => {
      const manager = new ConstraintManager();
      manager.addConstraints({
        constraints: [
          {
            nodeId: 'node1',
            type: 'fix-y',
            value: 200,
          },
        ],
      });

      const result = manager.applyConstraints('node1', { x: 50, y: 75 });
      expect(result).toEqual({ x: 50, y: 200 });
    });
  });

  describe('Boundary constraint', () => {
    it('should clamp position within boundaries', () => {
      const manager = new ConstraintManager();
      manager.addConstraints({
        constraints: [
          {
            nodeId: 'node1',
            type: 'boundary',
            boundary: { minX: 0, maxX: 500, minY: 0, maxY: 300 },
          },
        ],
      });

      // Test clamping to minimum
      expect(manager.applyConstraints('node1', { x: -50, y: -25 })).toEqual({ x: 0, y: 0 });

      // Test clamping to maximum
      expect(manager.applyConstraints('node1', { x: 600, y: 400 })).toEqual({ x: 500, y: 300 });

      // Test no clamping needed
      expect(manager.applyConstraints('node1', { x: 250, y: 150 })).toEqual({ x: 250, y: 150 });
    });

    it('should handle partial boundaries', () => {
      const manager = new ConstraintManager();
      manager.addConstraints({
        constraints: [
          {
            nodeId: 'node1',
            type: 'boundary',
            boundary: { minX: 100, maxY: 200 }, // Only min X and max Y
          },
        ],
      });

      expect(manager.applyConstraints('node1', { x: 50, y: 250 })).toEqual({ x: 100, y: 200 });
      expect(manager.applyConstraints('node1', { x: 200, y: 100 })).toEqual({ x: 200, y: 100 });
    });
  });

  describe('Multiple constraints', () => {
    it('should apply multiple constraints with priority resolution', () => {
      const manager = new ConstraintManager();
      manager.addConstraints({
        constraints: [
          {
            nodeId: 'node1',
            type: 'fix-x',
            value: 100,
            priority: 1,
          },
          {
            nodeId: 'node1',
            type: 'fix-y',
            value: 200,
            priority: 2,
          },
        ],
        conflictResolution: 'priority',
      });

      const result = manager.applyConstraints('node1', { x: 0, y: 0 }, 'priority');
      expect(result).toEqual({ x: 100, y: 200 });
    });

    it('should apply pin constraint over other constraints with higher priority', () => {
      const manager = new ConstraintManager();
      manager.addConstraints({
        constraints: [
          {
            nodeId: 'node1',
            type: 'fix-x',
            value: 100,
            priority: 1,
          },
          {
            nodeId: 'node1',
            type: 'pin',
            position: { x: 50, y: 75 },
            priority: 10, // Higher priority
          },
        ],
        conflictResolution: 'priority',
      });

      const result = manager.applyConstraints('node1', { x: 0, y: 0 }, 'priority');
      expect(result).toEqual({ x: 50, y: 75 });
    });

    it('should handle first conflict resolution', () => {
      const manager = new ConstraintManager();
      manager.addConstraints({
        constraints: [
          {
            nodeId: 'node1',
            type: 'fix-x',
            value: 100,
          },
          {
            nodeId: 'node1',
            type: 'fix-x',
            value: 200,
          },
        ],
      });

      const result = manager.applyConstraints('node1', { x: 0, y: 0 }, 'first');
      expect(result.x).toBe(100); // First constraint wins
    });

    it('should handle last conflict resolution', () => {
      const manager = new ConstraintManager();
      manager.addConstraints({
        constraints: [
          {
            nodeId: 'node1',
            type: 'fix-x',
            value: 100,
          },
          {
            nodeId: 'node1',
            type: 'fix-x',
            value: 200,
          },
        ],
      });

      const result = manager.applyConstraints('node1', { x: 0, y: 0 }, 'last');
      expect(result.x).toBe(200); // Last constraint wins
    });

    it('should combine fix-x, fix-y, and boundary constraints', () => {
      const manager = new ConstraintManager();
      manager.addConstraints({
        constraints: [
          {
            nodeId: 'node1',
            type: 'fix-x',
            value: 600, // Outside boundary
            priority: 1,
          },
          {
            nodeId: 'node1',
            type: 'boundary',
            boundary: { minX: 0, maxX: 500 },
            priority: 2, // Higher priority - should clamp
          },
        ],
      });

      const result = manager.applyConstraints('node1', { x: 0, y: 100 }, 'priority');
      // fix-x sets to 600, then boundary clamps to 500
      expect(result.x).toBe(500);
      expect(result.y).toBe(100);
    });
  });

  describe('Complex scenarios', () => {
    it('should handle hierarchical layout with pinned parent', () => {
      const manager = new ConstraintManager();
      manager.addConstraints({
        constraints: [
          {
            nodeId: 'parent',
            type: 'pin',
            position: { x: 0, y: 0 },
          },
          {
            nodeId: 'child1',
            type: 'fix-y',
            value: 100,
          },
          {
            nodeId: 'child2',
            type: 'fix-y',
            value: 200,
          },
        ],
      });

      expect(manager.applyConstraints('parent', { x: 100, y: 100 })).toEqual({ x: 0, y: 0 });
      expect(manager.applyConstraints('child1', { x: 50, y: 50 })).toEqual({ x: 50, y: 100 });
      expect(manager.applyConstraints('child2', { x: 50, y: 50 })).toEqual({ x: 50, y: 200 });
    });

    it('should handle grid layout with row constraints', () => {
      const manager = new ConstraintManager();

      // Fix nodes to specific rows (Y positions)
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          const nodeId = `node-${row}-${col}`;
          manager.addConstraints({
            constraints: [
              {
                nodeId,
                type: 'fix-y',
                value: row * 100,
              },
            ],
          });
        }
      }

      // Test that nodes in the same row have the same Y
      expect(manager.applyConstraints('node-0-0', { x: 0, y: 999 }).y).toBe(0);
      expect(manager.applyConstraints('node-0-1', { x: 100, y: 999 }).y).toBe(0);
      expect(manager.applyConstraints('node-1-0', { x: 0, y: 999 }).y).toBe(100);
      expect(manager.applyConstraints('node-2-2', { x: 200, y: 999 }).y).toBe(200);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty constraints array', () => {
      const manager = new ConstraintManager({ constraints: [] });
      expect(manager.getConstrainedNodeCount()).toBe(0);
    });

    it('should handle constraint with missing position', () => {
      const manager = new ConstraintManager();
      manager.addConstraints({
        constraints: [
          {
            nodeId: 'node1',
            type: 'pin',
            // Missing position field
          } as NodeConstraint,
        ],
      });

      // Should not crash, just not apply the constraint
      const result = manager.applyConstraints('node1', { x: 50, y: 75 });
      expect(result).toEqual({ x: 50, y: 75 });
    });

    it('should handle constraint with missing value', () => {
      const manager = new ConstraintManager();
      manager.addConstraints({
        constraints: [
          {
            nodeId: 'node1',
            type: 'fix-x',
            // Missing value field
          } as NodeConstraint,
        ],
      });

      // Should not crash, just not apply the constraint
      const result = manager.applyConstraints('node1', { x: 50, y: 75 });
      expect(result).toEqual({ x: 50, y: 75 });
    });

    it('should handle constraint with missing boundary', () => {
      const manager = new ConstraintManager();
      manager.addConstraints({
        constraints: [
          {
            nodeId: 'node1',
            type: 'boundary',
            // Missing boundary field
          } as NodeConstraint,
        ],
      });

      // Should not crash, just not apply the constraint
      const result = manager.applyConstraints('node1', { x: 50, y: 75 });
      expect(result).toEqual({ x: 50, y: 75 });
    });
  });
});
