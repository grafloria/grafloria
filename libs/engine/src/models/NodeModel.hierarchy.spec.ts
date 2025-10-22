// NodeModel.hierarchy.spec.ts - Tests for Hierarchy Query System (Phase 1.6a Part 3)

import { NodeModel } from './NodeModel';
import { DiagramModel } from './DiagramModel';

describe('NodeModel - Hierarchy Query System (Phase 1.6a Part 3)', () => {
  let diagram: DiagramModel;

  beforeEach(() => {
    diagram = new DiagramModel();
  });

  describe('getChildren', () => {
    it('should return empty array for node with no children', () => {
      const node = new NodeModel({ type: 'test', position: { x: 0, y: 0 } });
      diagram.addNode(node);

      const children = node.getChildren();

      expect(children).toEqual([]);
    });

    it('should return direct children nodes', () => {
      const parent = new NodeModel({ type: 'parent', position: { x: 0, y: 0 } });
      const child1 = new NodeModel({ type: 'child1', position: { x: 10, y: 10 } });
      const child2 = new NodeModel({ type: 'child2', position: { x: 20, y: 20 } });

      diagram.addNode(parent);
      diagram.addNode(child1);
      diagram.addNode(child2);

      child1.setParent(parent.id);
      child2.setParent(parent.id);
      parent.addChild(child1.id);
      parent.addChild(child2.id);

      const children = parent.getChildren();

      expect(children).toHaveLength(2);
      expect(children.map(c => c.id)).toContain(child1.id);
      expect(children.map(c => c.id)).toContain(child2.id);
    });

    it('should return empty array if diagram not set', () => {
      const node = new NodeModel({ type: 'test', position: { x: 0, y: 0 } });
      node.addChild('child-id'); // Add child ID without diagram

      const children = node.getChildren();

      expect(children).toEqual([]);
    });
  });

  describe('getParent', () => {
    it('should return undefined for root node', () => {
      const node = new NodeModel({ type: 'test', position: { x: 0, y: 0 } });
      diagram.addNode(node);

      const parent = node.getParent();

      expect(parent).toBeUndefined();
    });

    it('should return parent node', () => {
      const parent = new NodeModel({ type: 'parent', position: { x: 0, y: 0 } });
      const child = new NodeModel({ type: 'child', position: { x: 10, y: 10 } });

      diagram.addNode(parent);
      diagram.addNode(child);

      child.setParent(parent.id);
      parent.addChild(child.id);

      const result = child.getParent();

      expect(result).toBeDefined();
      expect(result?.id).toBe(parent.id);
    });

    it('should return undefined if diagram not set', () => {
      const node = new NodeModel({ type: 'test', position: { x: 0, y: 0 } });
      node.setParent('parent-id'); // Set parent ID without diagram

      const parent = node.getParent();

      expect(parent).toBeUndefined();
    });
  });

  describe('getAncestors', () => {
    it('should return empty array for root node', () => {
      const node = new NodeModel({ type: 'test', position: { x: 0, y: 0 } });
      diagram.addNode(node);

      const ancestors = node.getAncestors();

      expect(ancestors).toEqual([]);
    });

    it('should return all ancestors up to root', () => {
      const grandparent = new NodeModel({ type: 'grandparent', position: { x: 0, y: 0 } });
      const parent = new NodeModel({ type: 'parent', position: { x: 10, y: 10 } });
      const child = new NodeModel({ type: 'child', position: { x: 20, y: 20 } });

      diagram.addNode(grandparent);
      diagram.addNode(parent);
      diagram.addNode(child);

      parent.setParent(grandparent.id);
      grandparent.addChild(parent.id);

      child.setParent(parent.id);
      parent.addChild(child.id);

      const ancestors = child.getAncestors();

      expect(ancestors).toHaveLength(2);
      expect(ancestors[0].id).toBe(parent.id); // Direct parent first
      expect(ancestors[1].id).toBe(grandparent.id); // Then grandparent
    });

    it('should handle deep hierarchies', () => {
      const nodes: NodeModel[] = [];

      // Create chain: root -> n1 -> n2 -> n3 -> n4
      for (let i = 0; i < 5; i++) {
        const node = new NodeModel({ type: `node${i}`, position: { x: i * 10, y: 0 } });
        diagram.addNode(node);
        nodes.push(node);

        if (i > 0) {
          node.setParent(nodes[i - 1].id);
          nodes[i - 1].addChild(node.id);
        }
      }

      const ancestors = nodes[4].getAncestors();

      expect(ancestors).toHaveLength(4);
      expect(ancestors.map(n => n.type)).toEqual(['node3', 'node2', 'node1', 'node0']);
    });
  });

  describe('getDescendants', () => {
    it('should return empty array for leaf node', () => {
      const node = new NodeModel({ type: 'test', position: { x: 0, y: 0 } });
      diagram.addNode(node);

      const descendants = node.getDescendants();

      expect(descendants).toEqual([]);
    });

    it('should return all descendants recursively', () => {
      const root = new NodeModel({ type: 'root', position: { x: 0, y: 0 } });
      const child1 = new NodeModel({ type: 'child1', position: { x: 10, y: 10 } });
      const child2 = new NodeModel({ type: 'child2', position: { x: 20, y: 20 } });
      const grandchild = new NodeModel({ type: 'grandchild', position: { x: 30, y: 30 } });

      diagram.addNode(root);
      diagram.addNode(child1);
      diagram.addNode(child2);
      diagram.addNode(grandchild);

      child1.setParent(root.id);
      child2.setParent(root.id);
      root.addChild(child1.id);
      root.addChild(child2.id);

      grandchild.setParent(child1.id);
      child1.addChild(grandchild.id);

      const descendants = root.getDescendants();

      expect(descendants).toHaveLength(3);
      expect(descendants.map(n => n.type)).toContain('child1');
      expect(descendants.map(n => n.type)).toContain('child2');
      expect(descendants.map(n => n.type)).toContain('grandchild');
    });
  });

  describe('getRoot', () => {
    it('should return self for root node', () => {
      const node = new NodeModel({ type: 'test', position: { x: 0, y: 0 } });
      diagram.addNode(node);

      const root = node.getRoot();

      expect(root.id).toBe(node.id);
    });

    it('should return root ancestor', () => {
      const root = new NodeModel({ type: 'root', position: { x: 0, y: 0 } });
      const parent = new NodeModel({ type: 'parent', position: { x: 10, y: 10 } });
      const child = new NodeModel({ type: 'child', position: { x: 20, y: 20 } });

      diagram.addNode(root);
      diagram.addNode(parent);
      diagram.addNode(child);

      parent.setParent(root.id);
      root.addChild(parent.id);

      child.setParent(parent.id);
      parent.addChild(child.id);

      const result = child.getRoot();

      expect(result.id).toBe(root.id);
    });
  });

  describe('getSiblings', () => {
    it('should return empty array for root node', () => {
      const node = new NodeModel({ type: 'test', position: { x: 0, y: 0 } });
      diagram.addNode(node);

      const siblings = node.getSiblings();

      expect(siblings).toEqual([]);
    });

    it('should return empty array for only child', () => {
      const parent = new NodeModel({ type: 'parent', position: { x: 0, y: 0 } });
      const child = new NodeModel({ type: 'child', position: { x: 10, y: 10 } });

      diagram.addNode(parent);
      diagram.addNode(child);

      child.setParent(parent.id);
      parent.addChild(child.id);

      const siblings = child.getSiblings();

      expect(siblings).toEqual([]);
    });

    it('should return sibling nodes (excluding self)', () => {
      const parent = new NodeModel({ type: 'parent', position: { x: 0, y: 0 } });
      const child1 = new NodeModel({ type: 'child1', position: { x: 10, y: 10 } });
      const child2 = new NodeModel({ type: 'child2', position: { x: 20, y: 20 } });
      const child3 = new NodeModel({ type: 'child3', position: { x: 30, y: 30 } });

      diagram.addNode(parent);
      diagram.addNode(child1);
      diagram.addNode(child2);
      diagram.addNode(child3);

      child1.setParent(parent.id);
      child2.setParent(parent.id);
      child3.setParent(parent.id);
      parent.addChild(child1.id);
      parent.addChild(child2.id);
      parent.addChild(child3.id);

      const siblings = child2.getSiblings();

      expect(siblings).toHaveLength(2);
      expect(siblings.map(s => s.id)).toContain(child1.id);
      expect(siblings.map(s => s.id)).toContain(child3.id);
      expect(siblings.map(s => s.id)).not.toContain(child2.id);
    });
  });

  describe('isAncestorOf', () => {
    it('should return false for unrelated nodes', () => {
      const node1 = new NodeModel({ type: 'node1', position: { x: 0, y: 0 } });
      const node2 = new NodeModel({ type: 'node2', position: { x: 10, y: 10 } });

      diagram.addNode(node1);
      diagram.addNode(node2);

      expect(node1.isAncestorOf(node2.id)).toBe(false);
    });

    it('should return true for direct parent', () => {
      const parent = new NodeModel({ type: 'parent', position: { x: 0, y: 0 } });
      const child = new NodeModel({ type: 'child', position: { x: 10, y: 10 } });

      diagram.addNode(parent);
      diagram.addNode(child);

      child.setParent(parent.id);
      parent.addChild(child.id);

      expect(parent.isAncestorOf(child.id)).toBe(true);
    });

    it('should return true for indirect ancestor', () => {
      const grandparent = new NodeModel({ type: 'grandparent', position: { x: 0, y: 0 } });
      const parent = new NodeModel({ type: 'parent', position: { x: 10, y: 10 } });
      const child = new NodeModel({ type: 'child', position: { x: 20, y: 20 } });

      diagram.addNode(grandparent);
      diagram.addNode(parent);
      diagram.addNode(child);

      parent.setParent(grandparent.id);
      grandparent.addChild(parent.id);

      child.setParent(parent.id);
      parent.addChild(child.id);

      expect(grandparent.isAncestorOf(child.id)).toBe(true);
    });

    it('should return false for self', () => {
      const node = new NodeModel({ type: 'test', position: { x: 0, y: 0 } });
      diagram.addNode(node);

      expect(node.isAncestorOf(node.id)).toBe(false);
    });
  });

  describe('getDepth', () => {
    it('should return 0 for root node', () => {
      const node = new NodeModel({ type: 'test', position: { x: 0, y: 0 } });
      diagram.addNode(node);

      expect(node.getDepth()).toBe(0);
    });

    it('should return correct depth for child', () => {
      const parent = new NodeModel({ type: 'parent', position: { x: 0, y: 0 } });
      const child = new NodeModel({ type: 'child', position: { x: 10, y: 10 } });

      diagram.addNode(parent);
      diagram.addNode(child);

      child.setParent(parent.id);
      parent.addChild(child.id);

      expect(child.getDepth()).toBe(1);
    });

    it('should return correct depth for nested hierarchy', () => {
      const nodes: NodeModel[] = [];

      // Create chain: root -> n1 -> n2 -> n3
      for (let i = 0; i < 4; i++) {
        const node = new NodeModel({ type: `node${i}`, position: { x: i * 10, y: 0 } });
        diagram.addNode(node);
        nodes.push(node);

        if (i > 0) {
          node.setParent(nodes[i - 1].id);
          nodes[i - 1].addChild(node.id);
        }
      }

      expect(nodes[0].getDepth()).toBe(0);
      expect(nodes[1].getDepth()).toBe(1);
      expect(nodes[2].getDepth()).toBe(2);
      expect(nodes[3].getDepth()).toBe(3);
    });
  });

  describe('validateHierarchy', () => {
    it('should return true for valid hierarchy', () => {
      const parent = new NodeModel({ type: 'parent', position: { x: 0, y: 0 } });
      const child = new NodeModel({ type: 'child', position: { x: 10, y: 10 } });

      diagram.addNode(parent);
      diagram.addNode(child);

      child.setParent(parent.id);
      parent.addChild(child.id);

      expect(parent.validateHierarchy()).toBe(true);
      expect(child.validateHierarchy()).toBe(true);
    });

    it('should detect circular reference (direct)', () => {
      const node1 = new NodeModel({ type: 'node1', position: { x: 0, y: 0 } });
      const node2 = new NodeModel({ type: 'node2', position: { x: 10, y: 10 } });

      diagram.addNode(node1);
      diagram.addNode(node2);

      // Create circular reference: node1 -> node2 -> node1
      node2.setParent(node1.id);
      node1.addChild(node2.id);
      node1.setParent(node2.id);
      node2.addChild(node1.id);

      expect(node1.validateHierarchy()).toBe(false);
    });

    it('should detect circular reference (indirect)', () => {
      const node1 = new NodeModel({ type: 'node1', position: { x: 0, y: 0 } });
      const node2 = new NodeModel({ type: 'node2', position: { x: 10, y: 10 } });
      const node3 = new NodeModel({ type: 'node3', position: { x: 20, y: 20 } });

      diagram.addNode(node1);
      diagram.addNode(node2);
      diagram.addNode(node3);

      // Create circular reference: node1 -> node2 -> node3 -> node1
      node2.setParent(node1.id);
      node1.addChild(node2.id);
      node3.setParent(node2.id);
      node2.addChild(node3.id);
      node1.setParent(node3.id);
      node3.addChild(node1.id);

      expect(node1.validateHierarchy()).toBe(false);
    });
  });

  describe('updateHierarchyDepth', () => {
    it('should update depth for all descendants', () => {
      const root = new NodeModel({ type: 'root', position: { x: 0, y: 0 } });
      const child1 = new NodeModel({ type: 'child1', position: { x: 10, y: 10 } });
      const child2 = new NodeModel({ type: 'child2', position: { x: 20, y: 20 } });
      const grandchild = new NodeModel({ type: 'grandchild', position: { x: 30, y: 30 } });

      diagram.addNode(root);
      diagram.addNode(child1);
      diagram.addNode(child2);
      diagram.addNode(grandchild);

      child1.setParent(root.id);
      child2.setParent(root.id);
      root.addChild(child1.id);
      root.addChild(child2.id);

      grandchild.setParent(child1.id);
      child1.addChild(grandchild.id);

      // Manually set wrong depths
      child1.depth = 99;
      child2.depth = 99;
      grandchild.depth = 99;

      // Update from root
      root.updateHierarchyDepth();

      expect(root.depth).toBe(0);
      expect(child1.depth).toBe(1);
      expect(child2.depth).toBe(1);
      expect(grandchild.depth).toBe(2);
    });

    it('should recalculate depth when called on child node', () => {
      const root = new NodeModel({ type: 'root', position: { x: 0, y: 0 } });
      const parent = new NodeModel({ type: 'parent', position: { x: 10, y: 10 } });
      const child = new NodeModel({ type: 'child', position: { x: 20, y: 20 } });

      diagram.addNode(root);
      diagram.addNode(parent);
      diagram.addNode(child);

      parent.setParent(root.id);
      root.addChild(parent.id);

      child.setParent(parent.id);
      parent.addChild(child.id);

      // Set wrong depth
      child.depth = 99;

      // Update from child (should recalculate based on ancestors)
      child.updateHierarchyDepth();

      expect(child.depth).toBe(2);
    });
  });
});
