// ObstacleMapBuilder.spec.ts - Tests for ObstacleMapBuilder (Phase 1.6b)

import { DiagramModel } from '../models/DiagramModel';
import { NodeModel } from '../models/NodeModel';
import { ObstacleMapBuilder } from './ObstacleMapBuilder';

describe('ObstacleMapBuilder (Phase 1.6b)', () => {
  let diagram: DiagramModel;

  beforeEach(() => {
    diagram = new DiagramModel();
  });

  describe('fromDiagram', () => {
    it('should create empty obstacle map from empty diagram', () => {
      const map = ObstacleMapBuilder.fromDiagram(diagram);

      expect(map.getObstacles()).toHaveLength(0);
    });

    it('should create obstacle from single node', () => {
      const node = new NodeModel({
        type: 'test',
        position: { x: 100, y: 100 },
        size: { width: 50, height: 30 }
      });
      diagram.addNode(node);

      const map = ObstacleMapBuilder.fromDiagram(diagram);
      const obstacles = map.getObstacles();

      expect(obstacles).toHaveLength(1);
      expect(obstacles[0]).toEqual({
        id: node.id,
        x: 100,
        y: 100,
        width: 50,
        height: 30
      });
    });

    it('should create obstacles from multiple nodes', () => {
      const node1 = new NodeModel({
        type: 'test1',
        position: { x: 0, y: 0 },
        size: { width: 100, height: 100 }
      });
      const node2 = new NodeModel({
        type: 'test2',
        position: { x: 200, y: 200 },
        size: { width: 50, height: 50 }
      });

      diagram.addNode(node1);
      diagram.addNode(node2);

      const map = ObstacleMapBuilder.fromDiagram(diagram);
      const obstacles = map.getObstacles();

      expect(obstacles).toHaveLength(2);
      expect(obstacles.map(o => o.id)).toContain(node1.id);
      expect(obstacles.map(o => o.id)).toContain(node2.id);
    });

    it('should apply margin to obstacles', () => {
      const node = new NodeModel({
        type: 'test',
        position: { x: 100, y: 100 },
        size: { width: 50, height: 30 }
      });
      diagram.addNode(node);

      const map = ObstacleMapBuilder.fromDiagram(diagram, { margin: 5 });
      const obstacles = map.getObstacles();

      expect(obstacles[0]).toEqual({
        id: node.id,
        x: 95,  // 100 - 5
        y: 95,  // 100 - 5
        width: 60,  // 50 + (5 * 2)
        height: 40  // 30 + (5 * 2)
      });
    });

    it('should skip nodes marked as non-obstacles', () => {
      const node1 = new NodeModel({
        type: 'obstacle',
        position: { x: 0, y: 0 },
        size: { width: 100, height: 100 }
      });
      const node2 = new NodeModel({
        type: 'non-obstacle',
        position: { x: 200, y: 200 },
        size: { width: 50, height: 50 }
      });

      // Mark node2 as non-obstacle
      node2.setData('isObstacle', false);

      diagram.addNode(node1);
      diagram.addNode(node2);

      const map = ObstacleMapBuilder.fromDiagram(diagram);
      const obstacles = map.getObstacles();

      expect(obstacles).toHaveLength(1);
      expect(obstacles[0].id).toBe(node1.id);
    });

    it('should use global bounds for transformed nodes', () => {
      const node = new NodeModel({
        type: 'test',
        position: { x: 100, y: 100 },
        size: { width: 50, height: 30 }
      });
      node.setRotation(90);

      diagram.addNode(node);

      const map = ObstacleMapBuilder.fromDiagram(diagram);
      const obstacles = map.getObstacles();

      expect(obstacles).toHaveLength(1);
      // After 90° rotation, bounds should account for rotation
      // Width and height may be swapped due to rotation
      expect(obstacles[0].width).toBeCloseTo(30, 1);
      expect(obstacles[0].height).toBeCloseTo(50, 1);
    });

    it('should use global bounds for scaled nodes', () => {
      const node = new NodeModel({
        type: 'test',
        position: { x: 100, y: 100 },
        size: { width: 50, height: 30 }
      });
      node.setScale(2, 2);

      diagram.addNode(node);

      const map = ObstacleMapBuilder.fromDiagram(diagram);
      const obstacles = map.getObstacles();

      expect(obstacles).toHaveLength(1);
      expect(obstacles[0].width).toBeCloseTo(100, 1); // 50 * 2
      expect(obstacles[0].height).toBeCloseTo(60, 1); // 30 * 2
    });

    it('should use global bounds for nodes in hierarchy', () => {
      const parent = new NodeModel({
        type: 'parent',
        position: { x: 100, y: 100 },
        size: { width: 200, height: 200 }
      });
      const child = new NodeModel({
        type: 'child',
        position: { x: 20, y: 20 },
        size: { width: 50, height: 30 }
      });

      diagram.addNode(parent);
      diagram.addNode(child);

      child.setParent(parent.id);
      parent.addChild(child.id);
      child.positionMode = 'relative';

      const map = ObstacleMapBuilder.fromDiagram(diagram);
      const obstacles = map.getObstacles();

      expect(obstacles).toHaveLength(2);

      const childObstacle = obstacles.find(o => o.id === child.id);
      expect(childObstacle).toBeDefined();
      // Child's global position should be parent's position + child's local position
      expect(childObstacle!.x).toBeCloseTo(120, 1); // 100 + 20
      expect(childObstacle!.y).toBeCloseTo(120, 1); // 100 + 20
    });
  });

  describe('fromDiagramExcluding', () => {
    it('should exclude specified nodes', () => {
      const node1 = new NodeModel({
        type: 'node1',
        position: { x: 0, y: 0 },
        size: { width: 100, height: 100 }
      });
      const node2 = new NodeModel({
        type: 'node2',
        position: { x: 200, y: 200 },
        size: { width: 50, height: 50 }
      });
      const node3 = new NodeModel({
        type: 'node3',
        position: { x: 400, y: 400 },
        size: { width: 75, height: 75 }
      });

      diagram.addNode(node1);
      diagram.addNode(node2);
      diagram.addNode(node3);

      const map = ObstacleMapBuilder.fromDiagramExcluding(diagram, [node2.id]);
      const obstacles = map.getObstacles();

      expect(obstacles).toHaveLength(2);
      expect(obstacles.map(o => o.id)).toContain(node1.id);
      expect(obstacles.map(o => o.id)).toContain(node3.id);
      expect(obstacles.map(o => o.id)).not.toContain(node2.id);
    });

    it('should exclude multiple nodes', () => {
      const nodes = [];
      for (let i = 0; i < 5; i++) {
        const node = new NodeModel({
          type: `node${i}`,
          position: { x: i * 100, y: i * 100 },
          size: { width: 50, height: 50 }
        });
        diagram.addNode(node);
        nodes.push(node);
      }

      const excludeIds = [nodes[1].id, nodes[3].id];
      const map = ObstacleMapBuilder.fromDiagramExcluding(diagram, excludeIds);
      const obstacles = map.getObstacles();

      expect(obstacles).toHaveLength(3);
      expect(obstacles.map(o => o.id)).toContain(nodes[0].id);
      expect(obstacles.map(o => o.id)).toContain(nodes[2].id);
      expect(obstacles.map(o => o.id)).toContain(nodes[4].id);
      expect(obstacles.map(o => o.id)).not.toContain(nodes[1].id);
      expect(obstacles.map(o => o.id)).not.toContain(nodes[3].id);
    });

    it('should apply margin to excluded obstacles', () => {
      const node1 = new NodeModel({
        type: 'node1',
        position: { x: 0, y: 0 },
        size: { width: 100, height: 100 }
      });
      const node2 = new NodeModel({
        type: 'node2',
        position: { x: 200, y: 200 },
        size: { width: 50, height: 50 }
      });

      diagram.addNode(node1);
      diagram.addNode(node2);

      const map = ObstacleMapBuilder.fromDiagramExcluding(diagram, [node2.id], { margin: 10 });
      const obstacles = map.getObstacles();

      expect(obstacles).toHaveLength(1);
      expect(obstacles[0]).toEqual({
        id: node1.id,
        x: -10,
        y: -10,
        width: 120,
        height: 120
      });
    });

    it('should respect isObstacle flag even with exclusions', () => {
      const node1 = new NodeModel({
        type: 'node1',
        position: { x: 0, y: 0 },
        size: { width: 100, height: 100 }
      });
      const node2 = new NodeModel({
        type: 'node2',
        position: { x: 200, y: 200 },
        size: { width: 50, height: 50 }
      });
      const node3 = new NodeModel({
        type: 'node3',
        position: { x: 400, y: 400 },
        size: { width: 75, height: 75 }
      });

      node2.setData('isObstacle', false);

      diagram.addNode(node1);
      diagram.addNode(node2);
      diagram.addNode(node3);

      // Exclude node3 but include node2 (which is flagged as non-obstacle)
      const map = ObstacleMapBuilder.fromDiagramExcluding(diagram, [node3.id]);
      const obstacles = map.getObstacles();

      expect(obstacles).toHaveLength(1);
      expect(obstacles[0].id).toBe(node1.id);
    });
  });
});
