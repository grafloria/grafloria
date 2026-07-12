// Clipboard Commands Tests (Phase 1.8)

import { DiagramModel } from '../../models/DiagramModel';
import { NodeModel } from '../../models/NodeModel';
import { LinkModel } from '../../models/LinkModel';
import { GroupModel } from '../../models/GroupModel';
import { PortModel } from '../../models/PortModel';
import { ClipboardManager } from '../../clipboard/ClipboardManager';
import { CopyCommand } from './CopyCommand';
import { PasteCommand } from './PasteCommand';
import { DuplicateCommand } from './DuplicateCommand';
import { DeleteSelectionCommand } from './DeleteSelectionCommand';
import { CommandContext } from '../Command';

describe('Clipboard Commands (Phase 1.8)', () => {
  let diagram: DiagramModel;
  let context: CommandContext;
  let clipboard: ClipboardManager;

  beforeEach(() => {
    diagram = new DiagramModel();
    clipboard = new ClipboardManager();
    context = {
      diagram,
      eventBus: { emit: jest.fn() },
      store: new Map(),
    };

    // Initialize store with empty selections
    context.store!.set('selectedNodes', new Set<string>());
    context.store!.set('selectedLinks', new Set<string>());
  });

  describe('ClipboardManager', () => {
    it('should initialize with empty clipboard', () => {
      expect(clipboard.hasData()).toBe(false);
      expect(clipboard.get()).toBeNull();
    });

    it('should copy data to clipboard', () => {
      const node = new NodeModel({ type: 'rect', position: { x: 0, y: 0 } });
      diagram.addNode(node);

      clipboard.copy({
        nodes: [node],
        links: [],
        groups: [],
        sourceDiagramId: diagram.id,
      });

      expect(clipboard.hasData()).toBe(true);
      const data = clipboard.get();
      expect(data?.nodes.length).toBe(1);
      expect(data?.nodes[0].id).toBe(node.id);
    });

    it('should get clipboard statistics', () => {
      const node1 = new NodeModel({ type: 'rect', position: { x: 0, y: 0 } });
      const node2 = new NodeModel({ type: 'rect', position: { x: 100, y: 100 } });
      diagram.addNode(node1);
      diagram.addNode(node2);

      clipboard.copy({
        nodes: [node1, node2],
        links: [],
        groups: [],
      });

      const stats = clipboard.getStats();
      expect(stats.nodeCount).toBe(2);
      expect(stats.linkCount).toBe(0);
      expect(stats.groupCount).toBe(0);
      expect(stats.timestamp).toBeGreaterThan(0);
    });

    it('should maintain clipboard history', () => {
      const node1 = new NodeModel({ type: 'rect', position: { x: 0, y: 0 } });
      const node2 = new NodeModel({ type: 'rect', position: { x: 100, y: 100 } });
      diagram.addNode(node1);
      diagram.addNode(node2);

      clipboard.copy({ nodes: [node1], links: [], groups: [] });
      clipboard.copy({ nodes: [node2], links: [], groups: [] });

      const history = clipboard.getHistory();
      expect(history.length).toBe(2);
      expect(history[0].nodes.length).toBe(1); // Most recent
      expect(history[1].nodes.length).toBe(1);
    });

    it('should clear clipboard', () => {
      const node = new NodeModel({ type: 'rect', position: { x: 0, y: 0 } });
      diagram.addNode(node);

      clipboard.copy({ nodes: [node], links: [], groups: [] });
      expect(clipboard.hasData()).toBe(true);

      clipboard.clear();
      expect(clipboard.hasData()).toBe(false);
      expect(clipboard.get()).toBeNull();
    });
  });

  describe('CopyCommand', () => {
    it('should copy selected nodes to clipboard', () => {
      const node = new NodeModel({ type: 'rect', position: { x: 0, y: 0 } });
      diagram.addNode(node);
      context.store!.set('selectedNodes', new Set([node.id]));

      const command = new CopyCommand(clipboard);
      command.execute(context);

      expect(clipboard.hasData()).toBe(true);
      const data = clipboard.get();
      expect(data?.nodes.length).toBe(1);
      expect(data?.nodes[0].id).toBe(node.id);
    });

    it('should copy multiple selected nodes', () => {
      const node1 = new NodeModel({ type: 'rect', position: { x: 0, y: 0 } });
      const node2 = new NodeModel({ type: 'rect', position: { x: 100, y: 100 } });
      diagram.addNode(node1);
      diagram.addNode(node2);
      context.store!.set('selectedNodes', new Set([node1.id, node2.id]));

      const command = new CopyCommand(clipboard);
      command.execute(context);

      const data = clipboard.get();
      expect(data?.nodes.length).toBe(2);
    });

    it('should copy links between selected nodes', () => {
      const node1 = new NodeModel({ type: 'rect', position: { x: 0, y: 0 } });
      const node2 = new NodeModel({ type: 'rect', position: { x: 100, y: 100 } });
      const port1 = new PortModel({ type: 'output' });
      const port2 = new PortModel({ type: 'input' });
      node1.addPort(port1);
      node2.addPort(port2);
      diagram.addNode(node1);
      diagram.addNode(node2);

      const link = new LinkModel(`${node1.id}:${port1.id}`, `${node2.id}:${port2.id}`);
      diagram.addLink(link);

      context.store!.set('selectedNodes', new Set([node1.id, node2.id]));

      const command = new CopyCommand(clipboard, { includeLinks: true });
      command.execute(context);

      const data = clipboard.get();
      expect(data?.nodes.length).toBe(2);
      expect(data?.links.length).toBe(1);
    });

    it('should not copy links if only one node selected', () => {
      const node1 = new NodeModel({ type: 'rect', position: { x: 0, y: 0 } });
      const node2 = new NodeModel({ type: 'rect', position: { x: 100, y: 100 } });
      const port1 = new PortModel({ type: 'output' });
      const port2 = new PortModel({ type: 'input' });
      node1.addPort(port1);
      node2.addPort(port2);
      diagram.addNode(node1);
      diagram.addNode(node2);

      const link = new LinkModel(`${node1.id}:${port1.id}`, `${node2.id}:${port2.id}`);
      diagram.addLink(link);

      context.store!.set('selectedNodes', new Set([node1.id]));

      const command = new CopyCommand(clipboard, { includeLinks: true });
      command.execute(context);

      const data = clipboard.get();
      expect(data?.nodes.length).toBe(1);
      expect(data?.links.length).toBe(0); // Link not included
    });

    it('should throw error if no nodes selected', () => {
      const command = new CopyCommand(clipboard);
      expect(() => command.execute(context)).toThrow('No nodes selected');
    });

    it('should validate canExecute', () => {
      const command = new CopyCommand(clipboard);
      expect(command.canExecute(context)).toBe(false);

      const node = new NodeModel({ type: 'rect', position: { x: 0, y: 0 } });
      diagram.addNode(node);
      context.store!.set('selectedNodes', new Set([node.id]));
      expect(command.canExecute(context)).toBe(true);
    });

    it('should return false for canUndo (copy is non-destructive)', () => {
      const node = new NodeModel({ type: 'rect', position: { x: 0, y: 0 } });
      diagram.addNode(node);
      context.store!.set('selectedNodes', new Set([node.id]));

      const command = new CopyCommand(clipboard);
      command.execute(context);

      expect(command.canUndo(context)).toBe(false);
    });
  });

  describe('PasteCommand', () => {
    it('should paste nodes from clipboard', () => {
      const node = new NodeModel({ type: 'rect', position: { x: 0, y: 0 } });
      diagram.addNode(node);

      clipboard.copy({ nodes: [node], links: [], groups: [] });

      const command = new PasteCommand(clipboard);
      command.execute(context);

      expect(diagram.getNodes().length).toBe(2); // Original + pasted
    });

    it('should generate new IDs for pasted nodes', () => {
      const node = new NodeModel({ type: 'rect', position: { x: 0, y: 0 } });
      diagram.addNode(node);

      clipboard.copy({ nodes: [node], links: [], groups: [] });

      const command = new PasteCommand(clipboard);
      command.execute(context);

      const nodes = diagram.getNodes();
      expect(nodes.length).toBe(2);
      expect(nodes[0].id).not.toBe(nodes[1].id);
    });

    it('should apply position offset to pasted nodes', () => {
      const node = new NodeModel({ type: 'rect', position: { x: 100, y: 100 } });
      diagram.addNode(node);

      clipboard.copy({ nodes: [node], links: [], groups: [] });

      const command = new PasteCommand(clipboard, { offset: { x: 20, y: 20 } });
      command.execute(context);

      const pastedNode = diagram.getNodes().find((n) => n.id !== node.id);
      expect(pastedNode?.position.x).toBe(120);
      expect(pastedNode?.position.y).toBe(120);
    });

    it('should paste links with valid remapped port IDs (production connect format)', () => {
      const node1 = new NodeModel({ type: 'rect', position: { x: 0, y: 0 } });
      const node2 = new NodeModel({ type: 'rect', position: { x: 200, y: 0 } });
      diagram.addNode(node1);
      diagram.addNode(node2);

      // Production format: engine-created nanoid port ids + cached node ids,
      // NOT hand-built "nodeId:portName" strings.
      expect(diagram.connectNodes(node1, node2)).toBe(true);
      const originalLink = diagram.getLinks()[0];

      clipboard.copy({ nodes: [node1, node2], links: [originalLink], groups: [] });

      const command = new PasteCommand(clipboard);
      command.execute(context);

      expect(diagram.getNodes().length).toBe(4); // 2 original + 2 pasted
      expect(diagram.getLinks().length).toBe(2); // 1 original + 1 pasted

      // The pasted link's endpoints must resolve to REAL ports on the PASTED
      // nodes — this is the regression the old colon-string remap broke.
      const pastedNodes = diagram
        .getNodes()
        .filter((n) => n.id !== node1.id && n.id !== node2.id);
      const pastedNodeIds = new Set(pastedNodes.map((n) => n.id));
      const pastedPortIds = new Set(pastedNodes.flatMap((n) => n.getPorts().map((p) => p.id)));

      const pastedLink = diagram.getLinks().find((l) => l.id !== originalLink.id)!;
      expect(pastedPortIds.has(pastedLink.sourcePortId)).toBe(true);
      expect(pastedPortIds.has(pastedLink.targetPortId)).toBe(true);

      // Cached owning-node ids must be remapped to the pasted nodes too.
      expect(pastedNodeIds.has(pastedLink.sourceNodeId!)).toBe(true);
      expect(pastedNodeIds.has(pastedLink.targetNodeId!)).toBe(true);

      // And must NOT still point at the original ports/nodes.
      const originalPortIds = new Set(
        [...node1.getPorts(), ...node2.getPorts()].map((p) => p.id),
      );
      expect(originalPortIds.has(pastedLink.sourcePortId)).toBe(false);
      expect(originalPortIds.has(pastedLink.targetPortId)).toBe(false);
    });

    it('should preserve hierarchy when pasting', () => {
      const parent = new NodeModel({ type: 'rect', position: { x: 0, y: 0 } });
      const child = new NodeModel({ type: 'rect', position: { x: 50, y: 50 } });
      diagram.addNode(parent);
      diagram.addNode(child);
      child.setParent(parent.id);

      clipboard.copy({ nodes: [parent, child], links: [], groups: [] });

      const command = new PasteCommand(clipboard);
      command.execute(context);

      const pastedNodes = diagram.getNodes().filter(
        (n) => n.id !== parent.id && n.id !== child.id
      );
      expect(pastedNodes.length).toBe(2);

      const pastedChild = pastedNodes.find((n) => n.parentId);
      expect(pastedChild).toBeDefined();
      expect(pastedChild!.parentId).toBeTruthy();
    });

    it('should remove parent relationship if parent not pasted', () => {
      const parent = new NodeModel({ type: 'rect', position: { x: 0, y: 0 } });
      const child = new NodeModel({ type: 'rect', position: { x: 50, y: 50 } });
      diagram.addNode(parent);
      diagram.addNode(child);
      child.setParent(parent.id);

      // Copy only child (not parent)
      clipboard.copy({ nodes: [child], links: [], groups: [] });

      const command = new PasteCommand(clipboard);
      command.execute(context);

      const pastedChild = diagram.getNodes().find((n) => n.id !== parent.id && n.id !== child.id);
      expect(pastedChild).toBeDefined();
      expect(pastedChild!.parentId).toBeUndefined();
    });

    it('should select pasted entities by default', () => {
      const node = new NodeModel({ type: 'rect', position: { x: 0, y: 0 } });
      diagram.addNode(node);

      clipboard.copy({ nodes: [node], links: [], groups: [] });

      const command = new PasteCommand(clipboard);
      command.execute(context);

      const selectedNodes = context.store!.get('selectedNodes') as Set<string>;
      expect(selectedNodes.size).toBe(1);
    });

    it('should support undo', () => {
      const node = new NodeModel({ type: 'rect', position: { x: 0, y: 0 } });
      diagram.addNode(node);

      clipboard.copy({ nodes: [node], links: [], groups: [] });

      const command = new PasteCommand(clipboard);
      command.execute(context);

      expect(diagram.getNodes().length).toBe(2);

      command.undo(context);

      expect(diagram.getNodes().length).toBe(1);
    });

    it('should throw error if clipboard empty', () => {
      const command = new PasteCommand(clipboard);
      expect(() => command.execute(context)).toThrow('Clipboard is empty');
    });
  });

  describe('DuplicateCommand', () => {
    it('should duplicate selected nodes', () => {
      const node = new NodeModel({ type: 'rect', position: { x: 0, y: 0 } });
      diagram.addNode(node);
      context.store!.set('selectedNodes', new Set([node.id]));

      const command = new DuplicateCommand();
      command.execute(context);

      expect(diagram.getNodes().length).toBe(2);
    });

    it('should generate new IDs for duplicated nodes', () => {
      const node = new NodeModel({ type: 'rect', position: { x: 0, y: 0 } });
      diagram.addNode(node);
      context.store!.set('selectedNodes', new Set([node.id]));

      const command = new DuplicateCommand();
      command.execute(context);

      const nodes = diagram.getNodes();
      expect(nodes[0].id).not.toBe(nodes[1].id);
    });

    it('should apply position offset to duplicated nodes', () => {
      const node = new NodeModel({ type: 'rect', position: { x: 100, y: 100 } });
      diagram.addNode(node);
      context.store!.set('selectedNodes', new Set([node.id]));

      const command = new DuplicateCommand({ offset: { x: 30, y: 30 } });
      command.execute(context);

      const duplicatedNode = diagram.getNodes().find((n) => n.id !== node.id);
      expect(duplicatedNode?.position.x).toBe(130);
      expect(duplicatedNode?.position.y).toBe(130);
    });

    it('should duplicate links between selected nodes with valid remapped ports (production connect format)', () => {
      const node1 = new NodeModel({ type: 'rect', position: { x: 0, y: 0 } });
      const node2 = new NodeModel({ type: 'rect', position: { x: 200, y: 0 } });
      diagram.addNode(node1);
      diagram.addNode(node2);

      // Production format: engine-created nanoid port ids, NOT colon strings.
      expect(diagram.connectNodes(node1, node2)).toBe(true);
      const originalLink = diagram.getLinks()[0];

      context.store!.set('selectedNodes', new Set([node1.id, node2.id]));

      const command = new DuplicateCommand();
      command.execute(context);

      expect(diagram.getNodes().length).toBe(4);
      expect(diagram.getLinks().length).toBe(2);

      // Duplicated link endpoints must resolve to REAL ports on the duplicated nodes.
      const dupNodes = diagram
        .getNodes()
        .filter((n) => n.id !== node1.id && n.id !== node2.id);
      const dupNodeIds = new Set(dupNodes.map((n) => n.id));
      const dupPortIds = new Set(dupNodes.flatMap((n) => n.getPorts().map((p) => p.id)));

      const dupLink = diagram.getLinks().find((l) => l.id !== originalLink.id)!;
      expect(dupPortIds.has(dupLink.sourcePortId)).toBe(true);
      expect(dupPortIds.has(dupLink.targetPortId)).toBe(true);
      expect(dupNodeIds.has(dupLink.sourceNodeId!)).toBe(true);
      expect(dupNodeIds.has(dupLink.targetNodeId!)).toBe(true);

      const originalPortIds = new Set(
        [...node1.getPorts(), ...node2.getPorts()].map((p) => p.id),
      );
      expect(originalPortIds.has(dupLink.sourcePortId)).toBe(false);
      expect(originalPortIds.has(dupLink.targetPortId)).toBe(false);
    });

    it('should select duplicated entities by default', () => {
      const node = new NodeModel({ type: 'rect', position: { x: 0, y: 0 } });
      diagram.addNode(node);
      context.store!.set('selectedNodes', new Set([node.id]));

      const command = new DuplicateCommand();
      command.execute(context);

      const selectedNodes = context.store!.get('selectedNodes') as Set<string>;
      expect(selectedNodes.size).toBe(1);
      expect(Array.from(selectedNodes)[0]).not.toBe(node.id); // Selected node is the duplicate
    });

    it('should support undo', () => {
      const node = new NodeModel({ type: 'rect', position: { x: 0, y: 0 } });
      diagram.addNode(node);
      context.store!.set('selectedNodes', new Set([node.id]));

      const command = new DuplicateCommand();
      command.execute(context);

      expect(diagram.getNodes().length).toBe(2);

      command.undo(context);

      expect(diagram.getNodes().length).toBe(1);
    });

    it('should throw error if no nodes selected', () => {
      const command = new DuplicateCommand();
      expect(() => command.execute(context)).toThrow('No nodes selected');
    });
  });

  describe('DeleteSelectionCommand', () => {
    it('should delete selected nodes', () => {
      const node = new NodeModel({ type: 'rect', position: { x: 0, y: 0 } });
      diagram.addNode(node);
      context.store!.set('selectedNodes', new Set([node.id]));

      const command = new DeleteSelectionCommand();
      command.execute(context);

      expect(diagram.getNodes().length).toBe(0);
    });

    it('should delete multiple selected nodes', () => {
      const node1 = new NodeModel({ type: 'rect', position: { x: 0, y: 0 } });
      const node2 = new NodeModel({ type: 'rect', position: { x: 100, y: 100 } });
      diagram.addNode(node1);
      diagram.addNode(node2);
      context.store!.set('selectedNodes', new Set([node1.id, node2.id]));

      const command = new DeleteSelectionCommand();
      command.execute(context);

      expect(diagram.getNodes().length).toBe(0);
    });

    it('should delete child nodes recursively by default', () => {
      const parent = new NodeModel({ type: 'rect', position: { x: 0, y: 0 } });
      const child = new NodeModel({ type: 'rect', position: { x: 50, y: 50 } });
      diagram.addNode(parent);
      diagram.addNode(child);

      // Properly set parent-child relationship
      parent.addChild(child.id);
      child.setParent(parent.id);

      context.store!.set('selectedNodes', new Set([parent.id]));

      const command = new DeleteSelectionCommand();
      command.execute(context);

      expect(diagram.getNodes().length).toBe(0); // Both parent and child deleted
    });

    it('should delete connected links by default', () => {
      const node1 = new NodeModel({ type: 'rect', position: { x: 0, y: 0 } });
      const node2 = new NodeModel({ type: 'rect', position: { x: 100, y: 100 } });
      const port1 = new PortModel({ type: 'output' });
      const port2 = new PortModel({ type: 'input' });
      node1.addPort(port1);
      node2.addPort(port2);
      diagram.addNode(node1);
      diagram.addNode(node2);

      const link = new LinkModel(`${node1.id}:${port1.id}`, `${node2.id}:${port2.id}`);
      diagram.addLink(link);

      context.store!.set('selectedNodes', new Set([node1.id]));

      const command = new DeleteSelectionCommand();
      command.execute(context);

      expect(diagram.getLinks().length).toBe(0);
    });

    it('should delete selected links', () => {
      const node1 = new NodeModel({ type: 'rect', position: { x: 0, y: 0 } });
      const node2 = new NodeModel({ type: 'rect', position: { x: 100, y: 100 } });
      const port1 = new PortModel({ type: 'output' });
      const port2 = new PortModel({ type: 'input' });
      node1.addPort(port1);
      node2.addPort(port2);
      diagram.addNode(node1);
      diagram.addNode(node2);

      const link = new LinkModel(`${node1.id}:${port1.id}`, `${node2.id}:${port2.id}`);
      diagram.addLink(link);

      context.store!.set('selectedLinks', new Set([link.id]));

      const command = new DeleteSelectionCommand();
      command.execute(context);

      expect(diagram.getLinks().length).toBe(0);
      expect(diagram.getNodes().length).toBe(2); // Nodes not deleted
    });

    it('should remove nodes from groups when deleted', () => {
      const node = new NodeModel({ type: 'rect', position: { x: 0, y: 0 } });
      const group = new GroupModel({ name: 'Group' });
      diagram.addNode(node);
      diagram.addGroup(group);
      group.addMember(node.id);

      context.store!.set('selectedNodes', new Set([node.id]));

      const command = new DeleteSelectionCommand();
      command.execute(context);

      expect(diagram.getNodes().length).toBe(0);
      expect(group.members.size).toBe(0);
    });

    it('should delete empty groups', () => {
      const node = new NodeModel({ type: 'rect', position: { x: 0, y: 0 } });
      const group = new GroupModel({ name: 'Group' });
      diagram.addNode(node);
      diagram.addGroup(group);
      group.addMember(node.id);

      context.store!.set('selectedNodes', new Set([node.id]));

      const command = new DeleteSelectionCommand();
      command.execute(context);

      expect(diagram.getGroups().length).toBe(0); // Group deleted because empty
    });

    it('should clear selection after delete', () => {
      const node = new NodeModel({ type: 'rect', position: { x: 0, y: 0 } });
      diagram.addNode(node);
      context.store!.set('selectedNodes', new Set([node.id]));

      const command = new DeleteSelectionCommand();
      command.execute(context);

      const selectedNodes = context.store!.get('selectedNodes') as Set<string>;
      expect(selectedNodes.size).toBe(0);
    });

    it('should support undo', () => {
      const node = new NodeModel({ type: 'rect', position: { x: 0, y: 0 } });
      diagram.addNode(node);
      context.store!.set('selectedNodes', new Set([node.id]));

      const command = new DeleteSelectionCommand();
      command.execute(context);

      expect(diagram.getNodes().length).toBe(0);

      command.undo(context);

      expect(diagram.getNodes().length).toBe(1);
    });

    it('should throw error if no entities selected', () => {
      const command = new DeleteSelectionCommand();
      expect(() => command.execute(context)).toThrow('No entities selected');
    });
  });
});
