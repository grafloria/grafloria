// DeleteSelectionCommand — the deleteLinks option's undo contract (wave14)
//
// Since wave 10, `DiagramModel.removeNode()` CASCADES the node's links (a link
// to nowhere is not a link), so `deleteLinks: false` cannot keep a deleted
// node's links alive — but it MUST NOT lose them from the undo record either.
// Before this wave, Step 1 skipped recording connected links with the option
// off, Step 4's removeNode() cascaded them away regardless, and undo silently
// restored a diagram with fewer links than it deleted.

import { DiagramModel } from '../../models/DiagramModel';
import { NodeModel } from '../../models/NodeModel';
import { CommandContext } from '../Command';
import { CommandManager } from '../CommandManager';
import { DeleteSelectionCommand } from './DeleteSelectionCommand';

describe('DeleteSelectionCommand — deleteLinks undo contract (wave14)', () => {
  let diagram: DiagramModel;
  let context: CommandContext;
  let manager: CommandManager;
  let node1: NodeModel;
  let node2: NodeModel;

  beforeEach(() => {
    diagram = new DiagramModel();
    context = {
      diagram,
      eventBus: { emit: jest.fn() },
      store: new Map(),
    };
    manager = new CommandManager(context, context.eventBus);

    node1 = new NodeModel({ type: 'rect', position: { x: 0, y: 0 } });
    node2 = new NodeModel({ type: 'rect', position: { x: 200, y: 0 } });
    diagram.addNode(node1);
    diagram.addNode(node2);
    expect(diagram.connectNodes(node1, node2)).toBe(true);
    expect(diagram.getLinks().length).toBe(1);
  });

  const select = (...nodes: NodeModel[]) => {
    context.store!.set('selectedNodes', new Set(nodes.map((n) => n.id)));
    context.store!.set('selectedLinks', new Set<string>());
  };

  describe.each([
    ['deleteLinks: true (default)', { deleteLinks: true }],
    ['deleteLinks: false', { deleteLinks: false }],
  ])('%s', (_label, options) => {
    it('undo restores the cascaded link along with the node', async () => {
      select(node1);

      await manager.execute(new DeleteSelectionCommand(options));

      // The node is gone and — model invariant — so is its link.
      expect(diagram.getNode(node1.id)).toBeUndefined();
      expect(diagram.getLinks().length).toBe(0);

      await manager.undo();

      expect(diagram.getNode(node1.id)).toBeDefined();
      expect(diagram.getNode(node2.id)).toBeDefined();
      expect(diagram.getLinks().length).toBe(1); // the link came back too

      // ...with live endpoints: the restored link resolves both its nodes.
      const link = diagram.getLinks()[0]!;
      const sourceNode = diagram.getNodeByPortId(link.sourcePortId);
      const targetNode = diagram.getNodeByPortId(link.targetPortId);
      expect(new Set([sourceNode?.id, targetNode?.id])).toEqual(
        new Set([node1.id, node2.id])
      );
    });

    it('survives the full undo → redo → undo cycle', async () => {
      select(node1);

      await manager.execute(new DeleteSelectionCommand(options));
      await manager.undo();
      expect(diagram.getLinks().length).toBe(1);

      await manager.redo();
      expect(diagram.getNode(node1.id)).toBeUndefined();
      expect(diagram.getLinks().length).toBe(0);

      await manager.undo();
      expect(diagram.getNode(node1.id)).toBeDefined();
      expect(diagram.getLinks().length).toBe(1);
    });
  });

  it('records each cascaded link ONCE even when both endpoints are deleted', async () => {
    select(node1, node2);

    const command = new DeleteSelectionCommand({ deleteLinks: false });
    await manager.execute(command);
    expect(diagram.getLinks().length).toBe(0);

    await manager.undo();
    expect(diagram.getLinks().length).toBe(1); // once, not twice
  });
});
