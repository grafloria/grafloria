// HierarchyCommands.spec.ts - Tests for Hierarchy Command Support (Phase 1.6a Part 5)

import { DiagramModel } from '../../models/DiagramModel';
import { NodeModel } from '../../models/NodeModel';
import { AddNodeCommand } from './AddNodeCommand';
import { RemoveNodeCommand } from './RemoveNodeCommand';
import { SetParentCommand } from './SetParentCommand';

describe('Hierarchy Command Support (Phase 1.6a Part 5)', () => {
  let diagram: DiagramModel;
  let context: any;

  beforeEach(() => {
    diagram = new DiagramModel();
    context = {
      diagram,
      eventBus: { emit: jest.fn() }
    };
  });

  describe('AddNodeCommand with parent', () => {
    it('should add node and set up hierarchy when parentId provided', () => {
      const parent = new NodeModel({ type: 'parent', position: { x: 0, y: 0 } });
      const child = new NodeModel({ type: 'child', position: { x: 10, y: 10 } });

      diagram.addNode(parent);

      // Add child with parent
      child.setParent(parent.id);
      const command = new AddNodeCommand(child);
      command.execute(context);

      // Get the child from diagram (it's been restored from JSON)
      const restoredChild = diagram.getNode(child.id)!;
      const restoredParent = diagram.getNode(parent.id)!;

      expect(restoredChild).toBeDefined();
      expect(restoredChild.getParent()?.id).toBe(parent.id);
      expect(restoredParent.getChildren().map(c => c.id)).toContain(child.id);
    });

    it('should undo adding node and clean up hierarchy', () => {
      const parent = new NodeModel({ type: 'parent', position: { x: 0, y: 0 } });
      const child = new NodeModel({ type: 'child', position: { x: 10, y: 10 } });

      diagram.addNode(parent);

      child.setParent(parent.id);
      const command = new AddNodeCommand(child);
      command.execute(context);
      command.undo(context);

      expect(diagram.getNode(child.id)).toBeUndefined();
      expect(parent.getChildren()).toHaveLength(0);
    });
  });

  describe('RemoveNodeCommand with hierarchy', () => {
    it('should remove node and clean up hierarchy', () => {
      const parent = new NodeModel({ type: 'parent', position: { x: 0, y: 0 } });
      const child = new NodeModel({ type: 'child', position: { x: 10, y: 10 } });

      diagram.addNode(parent);
      diagram.addNode(child);

      child.setParent(parent.id);
      parent.addChild(child.id);

      const command = new RemoveNodeCommand(child.id);
      command.execute(context);

      expect(diagram.getNode(child.id)).toBeUndefined();
      expect(parent.getChildren()).toHaveLength(0);
    });

    it('should restore node and hierarchy on undo', () => {
      const parent = new NodeModel({ type: 'parent', position: { x: 0, y: 0 } });
      const child = new NodeModel({ type: 'child', position: { x: 10, y: 10 } });

      diagram.addNode(parent);
      diagram.addNode(child);

      child.setParent(parent.id);
      parent.addChild(child.id);

      const command = new RemoveNodeCommand(child.id);
      command.execute(context);
      command.undo(context);

      expect(diagram.getNode(child.id)).toBeDefined();
      expect(child.getParent()?.id).toBe(parent.id);
      expect(parent.getChildren().map(c => c.id)).toContain(child.id);
    });

    it('should remove node and all its descendants', () => {
      const root = new NodeModel({ type: 'root', position: { x: 0, y: 0 } });
      const child = new NodeModel({ type: 'child', position: { x: 10, y: 10 } });
      const grandchild = new NodeModel({ type: 'grandchild', position: { x: 20, y: 20 } });

      diagram.addNode(root);
      diagram.addNode(child);
      diagram.addNode(grandchild);

      child.setParent(root.id);
      root.addChild(child.id);

      grandchild.setParent(child.id);
      child.addChild(grandchild.id);

      const command = new RemoveNodeCommand(root.id);
      command.execute(context);

      expect(diagram.getNode(root.id)).toBeUndefined();
      expect(diagram.getNode(child.id)).toBeUndefined();
      expect(diagram.getNode(grandchild.id)).toBeUndefined();
    });

    it('should restore entire hierarchy on undo', () => {
      const root = new NodeModel({ type: 'root', position: { x: 0, y: 0 } });
      const child = new NodeModel({ type: 'child', position: { x: 10, y: 10 } });
      const grandchild = new NodeModel({ type: 'grandchild', position: { x: 20, y: 20 } });

      diagram.addNode(root);
      diagram.addNode(child);
      diagram.addNode(grandchild);

      child.setParent(root.id);
      root.addChild(child.id);

      grandchild.setParent(child.id);
      child.addChild(grandchild.id);

      const command = new RemoveNodeCommand(root.id);
      command.execute(context);
      command.undo(context);

      expect(diagram.getNode(root.id)).toBeDefined();
      expect(diagram.getNode(child.id)).toBeDefined();
      expect(diagram.getNode(grandchild.id)).toBeDefined();

      const restoredRoot = diagram.getNode(root.id)!;
      const restoredChild = diagram.getNode(child.id)!;
      const restoredGrandchild = diagram.getNode(grandchild.id)!;

      expect(restoredChild.getParent()?.id).toBe(restoredRoot.id);
      expect(restoredGrandchild.getParent()?.id).toBe(restoredChild.id);
    });
  });

  describe('SetParentCommand', () => {
    it('should change node parent', () => {
      const parent1 = new NodeModel({ type: 'parent1', position: { x: 0, y: 0 } });
      const parent2 = new NodeModel({ type: 'parent2', position: { x: 100, y: 100 } });
      const child = new NodeModel({ type: 'child', position: { x: 10, y: 10 } });

      diagram.addNode(parent1);
      diagram.addNode(parent2);
      diagram.addNode(child);

      child.setParent(parent1.id);
      parent1.addChild(child.id);

      const command = new SetParentCommand(child.id, parent2.id);
      command.execute(context);

      expect(child.getParent()?.id).toBe(parent2.id);
      expect(parent1.getChildren()).toHaveLength(0);
      expect(parent2.getChildren().map(c => c.id)).toContain(child.id);
    });

    it('should undo parent change', () => {
      const parent1 = new NodeModel({ type: 'parent1', position: { x: 0, y: 0 } });
      const parent2 = new NodeModel({ type: 'parent2', position: { x: 100, y: 100 } });
      const child = new NodeModel({ type: 'child', position: { x: 10, y: 10 } });

      diagram.addNode(parent1);
      diagram.addNode(parent2);
      diagram.addNode(child);

      child.setParent(parent1.id);
      parent1.addChild(child.id);

      const command = new SetParentCommand(child.id, parent2.id);
      command.execute(context);
      command.undo(context);

      expect(child.getParent()?.id).toBe(parent1.id);
      expect(parent1.getChildren().map(c => c.id)).toContain(child.id);
      expect(parent2.getChildren()).toHaveLength(0);
    });

    it('should set parent to undefined (detach from parent)', () => {
      const parent = new NodeModel({ type: 'parent', position: { x: 0, y: 0 } });
      const child = new NodeModel({ type: 'child', position: { x: 10, y: 10 } });

      diagram.addNode(parent);
      diagram.addNode(child);

      child.setParent(parent.id);
      parent.addChild(child.id);

      const command = new SetParentCommand(child.id, undefined);
      command.execute(context);

      expect(child.parentId).toBeUndefined();
      expect(parent.getChildren()).toHaveLength(0);
    });

    it('should undo detaching from parent', () => {
      const parent = new NodeModel({ type: 'parent', position: { x: 0, y: 0 } });
      const child = new NodeModel({ type: 'child', position: { x: 10, y: 10 } });

      diagram.addNode(parent);
      diagram.addNode(child);

      child.setParent(parent.id);
      parent.addChild(child.id);

      const command = new SetParentCommand(child.id, undefined);
      command.execute(context);
      command.undo(context);

      expect(child.getParent()?.id).toBe(parent.id);
      expect(parent.getChildren().map(c => c.id)).toContain(child.id);
    });

    it('should update hierarchy depth after parent change', () => {
      const root = new NodeModel({ type: 'root', position: { x: 0, y: 0 } });
      const newParent = new NodeModel({ type: 'newParent', position: { x: 100, y: 100 } });
      const child = new NodeModel({ type: 'child', position: { x: 10, y: 10 } });

      diagram.addNode(root);
      diagram.addNode(newParent);
      diagram.addNode(child);

      // Initially: root -> newParent (depth 1)
      newParent.setParent(root.id);
      root.addChild(newParent.id);

      // Initially: child has no parent (depth 0)
      child.depth = 0;

      // Move child under newParent (should become depth 2)
      const command = new SetParentCommand(child.id, newParent.id);
      command.execute(context);

      expect(child.getDepth()).toBe(2);
    });

    it('should reject circular parent assignment', () => {
      const parent = new NodeModel({ type: 'parent', position: { x: 0, y: 0 } });
      const child = new NodeModel({ type: 'child', position: { x: 10, y: 10 } });

      diagram.addNode(parent);
      diagram.addNode(child);

      child.setParent(parent.id);
      parent.addChild(child.id);

      // Try to set parent as child of its own child (circular)
      const command = new SetParentCommand(parent.id, child.id);

      expect(() => command.execute(context)).toThrow();
    });
  });
});
