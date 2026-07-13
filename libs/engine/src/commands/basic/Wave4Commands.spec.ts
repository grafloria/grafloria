/**
 * Wave 4 — the four commands the interaction layer needed and the engine did not
 * have. Each one exists because a direct-manipulation edit was NOT undoable:
 *
 *   RotateNodeCommand    — the rotate handle (Card 5)
 *   SetNodeLabelCommand  — in-place node text editing (Card 5)
 *   SetLinkPointsCommand — add / move / remove a vertex (Card 5); waypoint edits
 *                          used to mutate link.points directly
 *   SetLinkLabelCommand  — in-place EDGE text editing; wave-2's inline editor
 *                          wrote straight to updateLabel()
 */
import { DiagramEngine } from '../../engine/DiagramEngine';
import { DiagramModel } from '../../models/DiagramModel';
import { NodeModel } from '../../models/NodeModel';
import { LinkModel } from '../../models/LinkModel';
import { RotateNodeCommand } from './RotateNodeCommand';
import { SetNodeLabelCommand } from './SetNodeLabelCommand';
import { SetLinkPointsCommand } from './SetLinkPointsCommand';
import { SetLinkLabelCommand } from './SetLinkLabelCommand';

describe('wave4/interaction commands', () => {
  let engine: DiagramEngine;
  let diagram: DiagramModel;
  let node: NodeModel;

  beforeEach(() => {
    engine = new DiagramEngine();
    diagram = engine.createDiagram('wave4-commands');
    node = new NodeModel({
      type: 'test',
      position: { x: 0, y: 0 },
      size: { width: 100, height: 50, depth: 0 },
    });
    diagram.addNode(node);
  });

  afterEach(() => engine.destroy());

  function addLink(): LinkModel {
    const other = new NodeModel({
      type: 'test',
      position: { x: 300, y: 0 },
      size: { width: 100, height: 50, depth: 0 },
    });
    diagram.addNode(other);

    const link = new LinkModel(
      node.getPortBySide('right')!.id,
      other.getPortBySide('left')!.id
    );
    link.setPoints([
      { x: 100, y: 25 },
      { x: 300, y: 25 },
    ]);
    diagram.addLink(link);
    return link;
  }

  describe('RotateNodeCommand', () => {
    test('rotates and undoes back to the previous angle', async () => {
      node.setRotation(30);

      await engine.commandManager.execute(new RotateNodeCommand(node.id, 90, 30));
      expect(node.rotation).toBe(90);

      await engine.undo();
      expect(node.rotation).toBe(30);

      await engine.redo();
      expect(node.rotation).toBe(90);
    });

    test('captures the old angle on first execute when not supplied', async () => {
      node.setRotation(15);
      await engine.commandManager.execute(new RotateNodeCommand(node.id, 45));
      await engine.undo();
      expect(node.rotation).toBe(15);
    });

    test('does NOT merge by default — two gestures stay two undo steps', () => {
      const first = new RotateNodeCommand(node.id, 10);
      const second = new RotateNodeCommand(node.id, 20);
      expect(first.canMergeWith(second)).toBe(false);

      const mergeableA = new RotateNodeCommand(node.id, 10, 0, { mergeable: true });
      const mergeableB = new RotateNodeCommand(node.id, 20, 10, { mergeable: true });
      expect(mergeableA.canMergeWith(mergeableB)).toBe(true);
    });
  });

  describe('SetNodeLabelCommand', () => {
    test('sets, undoes and redoes the label, marking the node dirty', async () => {
      node.setMetadata('label', 'Before');
      node.markClean();

      await engine.commandManager.execute(new SetNodeLabelCommand(node.id, 'After'));
      expect(node.getMetadata('label')).toBe('After');
      expect(node.isDirty).toBe(true);

      await engine.undo();
      expect(node.getMetadata('label')).toBe('Before');
    });

    test('an unlabelled node undoes back to empty, not undefined', async () => {
      await engine.commandManager.execute(new SetNodeLabelCommand(node.id, 'New'));
      await engine.undo();
      expect(node.getMetadata('label')).toBe('');
    });

    test('never merges: one editor session = one undo step', () => {
      expect(new SetNodeLabelCommand(node.id, 'a').canMergeWith()).toBe(false);
    });
  });

  describe('SetLinkPointsCommand', () => {
    test('replaces the route and restores it (with hasManualWaypoints)', async () => {
      const link = addLink();
      expect(link.getMetadata('hasManualWaypoints')).toBeFalsy();

      await engine.commandManager.execute(
        new SetLinkPointsCommand(link.id, [
          { x: 100, y: 25 },
          { x: 200, y: 120 },
          { x: 300, y: 25 },
        ])
      );
      expect(link.points).toHaveLength(3);
      expect(link.getMetadata('hasManualWaypoints')).toBe(true);

      await engine.undo();
      expect(link.points).toHaveLength(2);
      // The flag is part of the state: leaving it true would resurrect the vertex
      // on the next re-route.
      expect(link.getMetadata('hasManualWaypoints')).toBe(false);
    });

    test('stores copies, not references to the caller-s arrays', async () => {
      const link = addLink();
      const points = [
        { x: 0, y: 0 },
        { x: 5, y: 5 },
        { x: 10, y: 10 },
      ];
      const command = new SetLinkPointsCommand(link.id, points);
      points[1]!.x = 999; // mutate after construction

      await engine.commandManager.execute(command);
      expect(link.points[1]).toEqual({ x: 5, y: 5 });
    });
  });

  describe('SetLinkLabelCommand', () => {
    test('edits an edge label and undoes it (previously not undoable at all)', async () => {
      const link = addLink();
      link.labels = [{ id: 'l1', text: 'old', position: 0.5, offset: { x: 0, y: 0 } } as any];

      await engine.commandManager.execute(new SetLinkLabelCommand(link.id, 0, 'new'));
      expect(link.labels[0]!.text).toBe('new');

      await engine.undo();
      expect(link.labels[0]!.text).toBe('old');
    });

    test('canExecute is false for a label index that does not exist', () => {
      const link = addLink();
      link.labels = [];
      const command = new SetLinkLabelCommand(link.id, 3, 'x');
      expect(command.canExecute({ diagram, eventBus: null } as any)).toBe(false);
    });
  });
});
