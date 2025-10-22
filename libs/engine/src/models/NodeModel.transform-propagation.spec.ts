// NodeModel.transform-propagation.spec.ts - Tests for Transform Propagation (Phase 1.6a Part 4)

import { NodeModel } from './NodeModel';
import { DiagramModel } from './DiagramModel';

describe('NodeModel - Transform Propagation (Phase 1.6a Part 4)', () => {
  let diagram: DiagramModel;

  beforeEach(() => {
    diagram = new DiagramModel();
  });

  describe('getAffectedByTransform', () => {
    it('should return only self if no children', () => {
      const node = new NodeModel({ type: 'test', position: { x: 0, y: 0 } });
      diagram.addNode(node);

      const affected = node.getAffectedByTransform();

      expect(affected).toHaveLength(1);
      expect(affected[0].id).toBe(node.id);
    });

    it('should return self and direct children in relative mode', () => {
      const parent = new NodeModel({ type: 'parent', position: { x: 0, y: 0 } });
      const child1 = new NodeModel({ type: 'child1', position: { x: 10, y: 10 } });
      const child2 = new NodeModel({ type: 'child2', position: { x: 20, y: 20 } });

      diagram.addNode(parent);
      diagram.addNode(child1);
      diagram.addNode(child2);

      child1.setParent(parent.id);
      child1.positionMode = 'relative';
      parent.addChild(child1.id);

      child2.setParent(parent.id);
      child2.positionMode = 'relative';
      parent.addChild(child2.id);

      const affected = parent.getAffectedByTransform();

      expect(affected).toHaveLength(3);
      expect(affected.map(n => n.type)).toContain('parent');
      expect(affected.map(n => n.type)).toContain('child1');
      expect(affected.map(n => n.type)).toContain('child2');
    });

    it('should not include children in absolute mode', () => {
      const parent = new NodeModel({ type: 'parent', position: { x: 0, y: 0 } });
      const child = new NodeModel({ type: 'child', position: { x: 10, y: 10 } });

      diagram.addNode(parent);
      diagram.addNode(child);

      child.setParent(parent.id);
      child.positionMode = 'absolute'; // Absolute mode - not affected by parent transform
      parent.addChild(child.id);

      const affected = parent.getAffectedByTransform();

      expect(affected).toHaveLength(1);
      expect(affected[0].id).toBe(parent.id);
    });

    it('should include all descendants in relative mode recursively', () => {
      const root = new NodeModel({ type: 'root', position: { x: 0, y: 0 } });
      const child = new NodeModel({ type: 'child', position: { x: 10, y: 10 } });
      const grandchild = new NodeModel({ type: 'grandchild', position: { x: 20, y: 20 } });

      diagram.addNode(root);
      diagram.addNode(child);
      diagram.addNode(grandchild);

      child.setParent(root.id);
      child.positionMode = 'relative';
      root.addChild(child.id);

      grandchild.setParent(child.id);
      grandchild.positionMode = 'relative';
      child.addChild(grandchild.id);

      const affected = root.getAffectedByTransform();

      expect(affected).toHaveLength(3);
      expect(affected.map(n => n.type)).toContain('root');
      expect(affected.map(n => n.type)).toContain('child');
      expect(affected.map(n => n.type)).toContain('grandchild');
    });

    it('should handle mixed absolute and relative children', () => {
      const parent = new NodeModel({ type: 'parent', position: { x: 0, y: 0 } });
      const relativeChild = new NodeModel({ type: 'relative', position: { x: 10, y: 10 } });
      const absoluteChild = new NodeModel({ type: 'absolute', position: { x: 20, y: 20 } });

      diagram.addNode(parent);
      diagram.addNode(relativeChild);
      diagram.addNode(absoluteChild);

      relativeChild.setParent(parent.id);
      relativeChild.positionMode = 'relative';
      parent.addChild(relativeChild.id);

      absoluteChild.setParent(parent.id);
      absoluteChild.positionMode = 'absolute';
      parent.addChild(absoluteChild.id);

      const affected = parent.getAffectedByTransform();

      expect(affected).toHaveLength(2);
      expect(affected.map(n => n.type)).toContain('parent');
      expect(affected.map(n => n.type)).toContain('relative');
      expect(affected.map(n => n.type)).not.toContain('absolute');
    });
  });

  describe('Transform propagation events', () => {
    it('should emit transform-propagated event on setPosition', () => {
      const parent = new NodeModel({ type: 'parent', position: { x: 0, y: 0 } });
      const child = new NodeModel({ type: 'child', position: { x: 10, y: 10 } });

      diagram.addNode(parent);
      diagram.addNode(child);

      child.setParent(parent.id);
      child.positionMode = 'relative';
      parent.addChild(child.id);

      const events: any[] = [];
      parent.on('transform-propagated', (data: any) => {
        events.push(data);
      });

      parent.setPosition(50, 50);

      expect(events).toHaveLength(1);
      expect(events[0].affectedNodes).toHaveLength(2);
    });

    it('should emit transform-propagated event on setRotation', () => {
      const parent = new NodeModel({ type: 'parent', position: { x: 0, y: 0 } });
      const child = new NodeModel({ type: 'child', position: { x: 10, y: 10 } });

      diagram.addNode(parent);
      diagram.addNode(child);

      child.setParent(parent.id);
      child.positionMode = 'relative';
      parent.addChild(child.id);

      const events: any[] = [];
      parent.on('transform-propagated', (data: any) => {
        events.push(data);
      });

      parent.setRotation(45);

      expect(events).toHaveLength(1);
      expect(events[0].affectedNodes).toHaveLength(2);
    });

    it('should emit transform-propagated event on setScale', () => {
      const parent = new NodeModel({ type: 'parent', position: { x: 0, y: 0 } });
      const child = new NodeModel({ type: 'child', position: { x: 10, y: 10 } });

      diagram.addNode(parent);
      diagram.addNode(child);

      child.setParent(parent.id);
      child.positionMode = 'relative';
      parent.addChild(child.id);

      const events: any[] = [];
      parent.on('transform-propagated', (data: any) => {
        events.push(data);
      });

      parent.setScale(2, 2);

      expect(events).toHaveLength(1);
      expect(events[0].affectedNodes).toHaveLength(2);
    });

    it('should not emit if no children are affected', () => {
      const node = new NodeModel({ type: 'test', position: { x: 0, y: 0 } });
      diagram.addNode(node);

      const events: any[] = [];
      node.on('transform-propagated', (data: any) => {
        events.push(data);
      });

      node.setPosition(50, 50);

      expect(events).toHaveLength(0);
    });

    it('should not emit if only absolute children', () => {
      const parent = new NodeModel({ type: 'parent', position: { x: 0, y: 0 } });
      const child = new NodeModel({ type: 'child', position: { x: 10, y: 10 } });

      diagram.addNode(parent);
      diagram.addNode(child);

      child.setParent(parent.id);
      child.positionMode = 'absolute';
      parent.addChild(child.id);

      const events: any[] = [];
      parent.on('transform-propagated', (data: any) => {
        events.push(data);
      });

      parent.setPosition(50, 50);

      expect(events).toHaveLength(0);
    });

    it('should include transform type in event data', () => {
      const parent = new NodeModel({ type: 'parent', position: { x: 0, y: 0 } });
      const child = new NodeModel({ type: 'child', position: { x: 10, y: 10 } });

      diagram.addNode(parent);
      diagram.addNode(child);

      child.setParent(parent.id);
      child.positionMode = 'relative';
      parent.addChild(child.id);

      let eventData: any = null;
      parent.on('transform-propagated', (data: any) => {
        eventData = data;
      });

      parent.setRotation(45);

      expect(eventData).not.toBeNull();
      expect(eventData.type).toBe('rotation');
      expect(eventData.value).toBe(45);
    });

    it('should include affected node IDs in event data', () => {
      const parent = new NodeModel({ type: 'parent', position: { x: 0, y: 0 } });
      const child1 = new NodeModel({ type: 'child1', position: { x: 10, y: 10 } });
      const child2 = new NodeModel({ type: 'child2', position: { x: 20, y: 20 } });

      diagram.addNode(parent);
      diagram.addNode(child1);
      diagram.addNode(child2);

      child1.setParent(parent.id);
      child1.positionMode = 'relative';
      parent.addChild(child1.id);

      child2.setParent(parent.id);
      child2.positionMode = 'relative';
      parent.addChild(child2.id);

      let eventData: any = null;
      parent.on('transform-propagated', (data: any) => {
        eventData = data;
      });

      parent.setPosition(100, 100);

      expect(eventData.affectedNodes).toHaveLength(3);
      expect(eventData.affectedNodes.map((n: NodeModel) => n.id)).toContain(parent.id);
      expect(eventData.affectedNodes.map((n: NodeModel) => n.id)).toContain(child1.id);
      expect(eventData.affectedNodes.map((n: NodeModel) => n.id)).toContain(child2.id);
    });
  });

  describe('Transform propagation with setTransformOrigin', () => {
    it('should emit transform-propagated event when changing transform origin', () => {
      const parent = new NodeModel({ type: 'parent', position: { x: 0, y: 0 } });
      const child = new NodeModel({ type: 'child', position: { x: 10, y: 10 } });

      diagram.addNode(parent);
      diagram.addNode(child);

      child.setParent(parent.id);
      child.positionMode = 'relative';
      parent.addChild(child.id);

      const events: any[] = [];
      parent.on('transform-propagated', (data: any) => {
        events.push(data);
      });

      parent.setTransformOrigin(0, 0); // Change to top-left

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('transformOrigin');
    });
  });
});
