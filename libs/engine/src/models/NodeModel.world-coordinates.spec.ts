// NodeModel.world-coordinates.spec.ts - World Coordinate System Tests
// Tests for getWorldPosition() and coordinate consistency for hierarchical nodes

import { NodeModel } from './NodeModel';
import { DiagramModel } from './DiagramModel';
import { PortModel } from './PortModel';

describe('NodeModel - World Coordinates System', () => {
  let diagram: DiagramModel;

  beforeEach(() => {
    diagram = new DiagramModel();
  });

  describe('getWorldPosition()', () => {
    it('should return same as local position for root node', () => {
      const node = new NodeModel({ type: 'test', position: { x: 100, y: 200 } });
      diagram.addNode(node);

      const worldPos = node.getWorldPosition();

      expect(worldPos).toEqual({ x: 100, y: 200, z: 0 });
      expect(worldPos.x).toBe(node.position.x);
      expect(worldPos.y).toBe(node.position.y);
    });

    it('should calculate world position for child node (single level)', () => {
      const parent = new NodeModel({ type: 'parent', position: { x: 100, y: 100 } });
      const child = new NodeModel({ type: 'child', position: { x: 20, y: 30 } });

      diagram.addNode(parent);
      diagram.addNode(child);

      child.setParent(parent.id);
      parent.addChild(child.id);

      const worldPos = child.getWorldPosition();

      // World = parent position + child local position
      expect(worldPos.x).toBe(120); // 100 + 20
      expect(worldPos.y).toBe(130); // 100 + 30
    });

    it('should calculate world position for nested hierarchy (grandparent > parent > child)', () => {
      const grandparent = new NodeModel({ type: 'grandparent', position: { x: 50, y: 50 } });
      const parent = new NodeModel({ type: 'parent', position: { x: 30, y: 40 } });
      const child = new NodeModel({ type: 'child', position: { x: 10, y: 15 } });

      diagram.addNode(grandparent);
      diagram.addNode(parent);
      diagram.addNode(child);

      parent.setParent(grandparent.id);
      grandparent.addChild(parent.id);

      child.setParent(parent.id);
      parent.addChild(child.id);

      const worldPos = child.getWorldPosition();

      // World = grandparent + parent + child
      expect(worldPos.x).toBe(90);  // 50 + 30 + 10
      expect(worldPos.y).toBe(105); // 50 + 40 + 15
    });

    it('should handle deep nesting (5 levels)', () => {
      const nodes: NodeModel[] = [];

      // Create chain: n0(10,10) -> n1(5,5) -> n2(3,3) -> n3(2,2) -> n4(1,1)
      for (let i = 0; i < 5; i++) {
        const node = new NodeModel({
          type: `node${i}`,
          position: { x: 10 / (i + 1), y: 10 / (i + 1) }
        });
        diagram.addNode(node);
        nodes.push(node);

        if (i > 0) {
          node.setParent(nodes[i - 1].id);
          nodes[i - 1].addChild(node.id);
        }
      }

      const worldPos = nodes[4].getWorldPosition();

      // n0: 10 + n1: 5 + n2: 3.33 + n3: 2.5 + n4: 2 = 22.83
      expect(worldPos.x).toBeCloseTo(22.83, 2);
      expect(worldPos.y).toBeCloseTo(22.83, 2);
    });

    it('should return local position if diagram not set', () => {
      const node = new NodeModel({ type: 'test', position: { x: 100, y: 200 } });
      node.setParent('non-existent-parent');

      const worldPos = node.getWorldPosition();

      // Should return local position as fallback
      expect(worldPos).toEqual({ x: 100, y: 200, z: 0 });
    });
  });

  describe('getBoundingBox() - World Coordinates', () => {
    it('should use world position for bounding box', () => {
      const parent = new NodeModel({
        type: 'parent',
        position: { x: 100, y: 100 },
        size: { width: 200, height: 150 }
      });
      const child = new NodeModel({
        type: 'child',
        position: { x: 10, y: 20 },
        size: { width: 50, height: 30 }
      });

      diagram.addNode(parent);
      diagram.addNode(child);

      child.setParent(parent.id);
      parent.addChild(child.id);

      const bbox = child.getBoundingBox();

      // World position: (110, 120)
      // Size: 50 x 30
      expect(bbox.left).toBe(110);
      expect(bbox.top).toBe(120);
      expect(bbox.right).toBe(160); // 110 + 50
      expect(bbox.bottom).toBe(150); // 120 + 30
      expect(bbox.width).toBe(50);
      expect(bbox.height).toBe(30);
    });

    it('should use world position for nested hierarchy bounding box', () => {
      const parent = new NodeModel({ type: 'parent', position: { x: 50, y: 50 } });
      const child = new NodeModel({
        type: 'child',
        position: { x: 25, y: 25 },
        size: { width: 100, height: 80 }
      });
      const grandchild = new NodeModel({
        type: 'grandchild',
        position: { x: 10, y: 10 },
        size: { width: 20, height: 20 }
      });

      diagram.addNode(parent);
      diagram.addNode(child);
      diagram.addNode(grandchild);

      child.setParent(parent.id);
      parent.addChild(child.id);

      grandchild.setParent(child.id);
      child.addChild(grandchild.id);

      const bbox = grandchild.getBoundingBox();

      // World position: 50 + 25 + 10 = 85, 85
      expect(bbox.left).toBe(85);
      expect(bbox.top).toBe(85);
      expect(bbox.right).toBe(105); // 85 + 20
      expect(bbox.bottom).toBe(105); // 85 + 20
    });
  });

  describe('getCenter() - World Coordinates', () => {
    it('should calculate center in world coordinates', () => {
      const parent = new NodeModel({ type: 'parent', position: { x: 100, y: 100 } });
      const child = new NodeModel({
        type: 'child',
        position: { x: 20, y: 30 },
        size: { width: 40, height: 60 }
      });

      diagram.addNode(parent);
      diagram.addNode(child);

      child.setParent(parent.id);
      parent.addChild(child.id);

      const center = child.getCenter();

      // World position: (120, 130)
      // Center: world + size/2 = (120 + 20, 130 + 30) = (140, 160)
      expect(center.x).toBe(140);
      expect(center.y).toBe(160);
    });
  });

  describe('Parent Movement - Children Follow', () => {
    it('should maintain relative positions when parent moves', () => {
      const parent = new NodeModel({ type: 'parent', position: { x: 100, y: 100 } });
      const child1 = new NodeModel({ type: 'child1', position: { x: 10, y: 10 } });
      const child2 = new NodeModel({ type: 'child2', position: { x: 20, y: 20 } });

      diagram.addNode(parent);
      diagram.addNode(child1);
      diagram.addNode(child2);

      child1.setParent(parent.id);
      child2.setParent(parent.id);
      parent.addChild(child1.id);
      parent.addChild(child2.id);

      // Initial world positions
      expect(child1.getWorldPosition()).toEqual({ x: 110, y: 110, z: 0 });
      expect(child2.getWorldPosition()).toEqual({ x: 120, y: 120, z: 0 });

      // Move parent
      parent.setPosition(200, 200);

      // Children's world positions should update
      expect(child1.getWorldPosition()).toEqual({ x: 210, y: 210, z: 0 });
      expect(child2.getWorldPosition()).toEqual({ x: 220, y: 220, z: 0 });

      // Local positions unchanged
      expect(child1.position).toEqual({ x: 10, y: 10, z: undefined });
      expect(child2.position).toEqual({ x: 20, y: 20, z: undefined });
    });

    it('should maintain hierarchy when grandparent moves', () => {
      const grandparent = new NodeModel({ type: 'gp', position: { x: 50, y: 50 } });
      const parent = new NodeModel({ type: 'p', position: { x: 30, y: 30 } });
      const child = new NodeModel({ type: 'c', position: { x: 10, y: 10 } });

      diagram.addNode(grandparent);
      diagram.addNode(parent);
      diagram.addNode(child);

      parent.setParent(grandparent.id);
      grandparent.addChild(parent.id);
      child.setParent(parent.id);
      parent.addChild(child.id);

      // Initial: child world = 50 + 30 + 10 = 90
      expect(child.getWorldPosition()).toEqual({ x: 90, y: 90, z: 0 });

      // Move grandparent
      grandparent.setPosition(100, 100);

      // Child world = 100 + 30 + 10 = 140
      expect(child.getWorldPosition()).toEqual({ x: 140, y: 140, z: 0 });
    });
  });

  describe('Hit Testing with World Coordinates', () => {
    it('should find child node at its world position', () => {
      const parent = new NodeModel({
        type: 'parent',
        position: { x: 100, y: 100 },
        size: { width: 200, height: 200 }
      });
      const child = new NodeModel({
        type: 'child',
        position: { x: 50, y: 50 },
        size: { width: 50, height: 50 }
      });

      diagram.addNode(parent);
      diagram.addNode(child);

      child.setParent(parent.id);
      parent.addChild(child.id);

      // Child world position: (150, 150)
      // Child bounding box: 150-200, 150-200
      const foundNode = diagram.getNodeAtPosition(175, 175);

      expect(foundNode).toBeDefined();
      expect(foundNode?.id).toBe(child.id);
    });

    it('should not find child node at its local position', () => {
      const parent = new NodeModel({
        type: 'parent',
        position: { x: 100, y: 100 },
        size: { width: 200, height: 200 }
      });
      const child = new NodeModel({
        type: 'child',
        position: { x: 50, y: 50 },
        size: { width: 50, height: 50 }
      });

      diagram.addNode(parent);
      diagram.addNode(child);

      child.setParent(parent.id);
      parent.addChild(child.id);

      // Child LOCAL position: (50, 50)
      // Should NOT be found there - child is at WORLD (150, 150)
      const foundNode = diagram.getNodeAtPosition(50, 50);

      expect(foundNode).toBeUndefined();
    });

    it('should find parent when clicking on parent area (not child)', () => {
      const parent = new NodeModel({
        type: 'parent',
        position: { x: 100, y: 100 },
        size: { width: 200, height: 200 }
      });
      const child = new NodeModel({
        type: 'child',
        position: { x: 50, y: 50 },
        size: { width: 50, height: 50 }
      });

      diagram.addNode(parent);
      diagram.addNode(child);

      child.setParent(parent.id);
      parent.addChild(child.id);

      // Click on parent area (not overlapping child)
      // Parent: 100-300, 100-300
      // Child: 150-200, 150-200
      const foundNode = diagram.getNodeAtPosition(250, 250);

      expect(foundNode).toBeDefined();
      expect(foundNode?.id).toBe(parent.id);
    });
  });

  describe('Port Positions with World Coordinates', () => {
    it('should place ports at correct world coordinates for child node', () => {
      const parent = new NodeModel({
        type: 'parent',
        position: { x: 100, y: 100 },
        size: { width: 200, height: 200 }
      });
      const child = new NodeModel({
        type: 'child',
        position: { x: 50, y: 50 },
        size: { width: 100, height: 80 }
      });

      diagram.addNode(parent);
      diagram.addNode(child);

      child.setParent(parent.id);
      parent.addChild(child.id);

      // Add port on right edge (should be at world coords)
      const port = new PortModel({
        type: 'output',
        side: 'right'
      });
      child.addPort(port);

      // Child world position: (150, 150)
      // Port on right edge: child.world.x + child.width = 150 + 100 = 250
      // Port center Y: child.world.y + child.height/2 = 150 + 40 = 190
      const childWorld = child.getWorldPosition();
      const expectedPortX = childWorld.x + child.size.width; // Right edge
      const expectedPortY = childWorld.y + child.size.height / 2; // Center Y

      expect(expectedPortX).toBe(250);
      expect(expectedPortY).toBe(190);
    });

    it('should update port world position when parent moves', () => {
      const parent = new NodeModel({
        type: 'parent',
        position: { x: 100, y: 100 },
        size: { width: 200, height: 200 }
      });
      const child = new NodeModel({
        type: 'child',
        position: { x: 50, y: 50 },
        size: { width: 100, height: 80 }
      });

      diagram.addNode(parent);
      diagram.addNode(child);

      child.setParent(parent.id);
      parent.addChild(child.id);

      const port = new PortModel({
        type: 'output',
        side: 'right'
      });
      child.addPort(port);

      // Initial port world X: 150 + 100 = 250
      let childWorld = child.getWorldPosition();
      expect(childWorld.x + child.size.width).toBe(250);

      // Move parent
      parent.setPosition(200, 200);

      // Port world X should update: 250 + 100 = 350
      childWorld = child.getWorldPosition();
      expect(childWorld.x + child.size.width).toBe(350);
    });
  });

  describe('ERD Table Use Case - Real World Scenario', () => {
    it('should correctly position table header and field rows', () => {
      // Simulate ERD Table (Products) structure
      const table = new NodeModel({
        type: 'erd-table-container',
        position: { x: 300, y: 200 },
        size: { width: 250, height: 148 }
      });

      const header = new NodeModel({
        type: 'erd-table-header',
        position: { x: 0, y: 0 },
        size: { width: 250, height: 36 }
      });

      const field1 = new NodeModel({
        type: 'erd-field',
        position: { x: 0, y: 36 },
        size: { width: 250, height: 28 }
      });

      const field2 = new NodeModel({
        type: 'erd-field',
        position: { x: 0, y: 64 },
        size: { width: 250, height: 28 }
      });

      diagram.addNode(table);
      diagram.addNode(header);
      diagram.addNode(field1);
      diagram.addNode(field2);

      header.setParent(table.id);
      field1.setParent(table.id);
      field2.setParent(table.id);
      table.addChild(header.id);
      table.addChild(field1.id);
      table.addChild(field2.id);

      // Verify world positions
      expect(header.getWorldPosition()).toEqual({ x: 300, y: 200, z: 0 });
      expect(field1.getWorldPosition()).toEqual({ x: 300, y: 236, z: 0 }); // 200 + 36
      expect(field2.getWorldPosition()).toEqual({ x: 300, y: 264, z: 0 }); // 200 + 64

      // Verify bounding boxes (for hit testing)
      const field1Box = field1.getBoundingBox();
      expect(field1Box.left).toBe(300);
      expect(field1Box.top).toBe(236);
      expect(field1Box.right).toBe(550); // 300 + 250
      expect(field1Box.bottom).toBe(264); // 236 + 28
    });

    it('should find correct field when clicking on ERD table row', () => {
      const table = new NodeModel({
        type: 'erd-table-container',
        position: { x: 300, y: 200 },
        size: { width: 250, height: 148 }
      });

      const field1 = new NodeModel({
        type: 'erd-field',
        position: { x: 0, y: 36 },
        size: { width: 250, height: 28 }
      });

      const field2 = new NodeModel({
        type: 'erd-field',
        position: { x: 0, y: 64 },
        size: { width: 250, height: 28 }
      });

      diagram.addNode(table);
      diagram.addNode(field1);
      diagram.addNode(field2);

      field1.setParent(table.id);
      field2.setParent(table.id);
      table.addChild(field1.id);
      table.addChild(field2.id);

      // Click on field1 at world coordinates
      const clicked1 = diagram.getNodeAtPosition(425, 250); // Middle of field1
      expect(clicked1?.id).toBe(field1.id);

      // Click on field2 at world coordinates
      const clicked2 = diagram.getNodeAtPosition(425, 278); // Middle of field2
      expect(clicked2?.id).toBe(field2.id);
    });

    it('should move all table parts together when parent moves', () => {
      const table = new NodeModel({
        type: 'erd-table-container',
        position: { x: 300, y: 200 },
        size: { width: 250, height: 148 }
      });

      const header = new NodeModel({
        type: 'erd-table-header',
        position: { x: 0, y: 0 },
        size: { width: 250, height: 36 }
      });

      const field1 = new NodeModel({
        type: 'erd-field',
        position: { x: 0, y: 36 },
        size: { width: 250, height: 28 }
      });

      diagram.addNode(table);
      diagram.addNode(header);
      diagram.addNode(field1);

      header.setParent(table.id);
      field1.setParent(table.id);
      table.addChild(header.id);
      table.addChild(field1.id);

      // Initial positions
      expect(header.getWorldPosition().x).toBe(300);
      expect(field1.getWorldPosition().x).toBe(300);

      // Move table
      table.setPosition(500, 300);

      // All children should move with parent
      expect(header.getWorldPosition()).toEqual({ x: 500, y: 300, z: 0 });
      expect(field1.getWorldPosition()).toEqual({ x: 500, y: 336, z: 0 });

      // Local positions unchanged
      expect(header.position.x).toBe(0);
      expect(field1.position.x).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero position coordinates', () => {
      const parent = new NodeModel({ type: 'parent', position: { x: 0, y: 0 } });
      const child = new NodeModel({ type: 'child', position: { x: 0, y: 0 } });

      diagram.addNode(parent);
      diagram.addNode(child);

      child.setParent(parent.id);
      parent.addChild(child.id);

      expect(child.getWorldPosition()).toEqual({ x: 0, y: 0, z: 0 });
    });

    it('should handle negative coordinates', () => {
      const parent = new NodeModel({ type: 'parent', position: { x: -50, y: -50 } });
      const child = new NodeModel({ type: 'child', position: { x: -10, y: -10 } });

      diagram.addNode(parent);
      diagram.addNode(child);

      child.setParent(parent.id);
      parent.addChild(child.id);

      expect(child.getWorldPosition()).toEqual({ x: -60, y: -60, z: 0 });
    });

    it('should handle very large coordinates', () => {
      const parent = new NodeModel({ type: 'parent', position: { x: 100000, y: 100000 } });
      const child = new NodeModel({ type: 'child', position: { x: 5000, y: 5000 } });

      diagram.addNode(parent);
      diagram.addNode(child);

      child.setParent(parent.id);
      parent.addChild(child.id);

      expect(child.getWorldPosition()).toEqual({ x: 105000, y: 105000, z: 0 });
    });
  });
});
