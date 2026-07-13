// CutCommand + gesture-command tests (wave3/interaction)
//
// Covers the command half of "interactive edits are undoable":
//  - CutCommand = copy + delete as ONE undoable step (and the two inherited
//    behaviours it has to override to be undoable/redoable at all),
//  - MoveNodeCommand's opt-out of merging, so ONE drag gesture = ONE undo step,
//  - a MacroCommand of MoveNodeCommands = ONE undo step for a multi-node drag.

import { DiagramModel } from '../../models/DiagramModel';
import { NodeModel } from '../../models/NodeModel';
import { ClipboardManager } from '../../clipboard/ClipboardManager';
import { CommandContext } from '../Command';
import { CommandManager } from '../CommandManager';
import { MacroCommand } from '../composite/MacroCommand';
import { CutCommand } from './CutCommand';
import { PasteCommand } from './PasteCommand';
import { MoveNodeCommand } from './MoveNodeCommand';
import { DeleteSelectionCommand } from './DeleteSelectionCommand';

describe('CutCommand (wave3/interaction)', () => {
  let diagram: DiagramModel;
  let context: CommandContext;
  let clipboard: ClipboardManager;
  let manager: CommandManager;

  beforeEach(() => {
    diagram = new DiagramModel();
    clipboard = new ClipboardManager();
    context = {
      diagram,
      eventBus: { emit: jest.fn() },
      store: new Map(),
    };
    context.store!.set('selectedNodes', new Set<string>());
    context.store!.set('selectedLinks', new Set<string>());
    manager = new CommandManager(context, context.eventBus);
  });

  const select = (...nodes: NodeModel[]) => {
    context.store!.set('selectedNodes', new Set(nodes.map((n) => n.id)));
  };

  it('copies the selection to the clipboard AND removes it from the diagram', async () => {
    const node = new NodeModel({ type: 'rect', position: { x: 10, y: 20 } });
    diagram.addNode(node);
    select(node);

    await manager.execute(new CutCommand(clipboard));

    // Removed from the diagram...
    expect(diagram.getNodes().length).toBe(0);
    // ...and held on the clipboard.
    expect(clipboard.hasData()).toBe(true);
    expect(clipboard.get()!.nodes.length).toBe(1);
    expect(clipboard.get()!.nodes[0].id).toBe(node.id);
    expect(clipboard.get()!.nodes[0].position).toEqual(
      expect.objectContaining({ x: 10, y: 20 })
    );
  });

  it('is ONE undo step: a single undo restores everything the cut removed', async () => {
    const node1 = new NodeModel({ type: 'rect', position: { x: 0, y: 0 } });
    const node2 = new NodeModel({ type: 'rect', position: { x: 200, y: 0 } });
    diagram.addNode(node1);
    diagram.addNode(node2);
    expect(diagram.connectNodes(node1, node2)).toBe(true);
    select(node1, node2);

    await manager.execute(new CutCommand(clipboard));
    expect(diagram.getNodes().length).toBe(0);
    expect(diagram.getLinks().length).toBe(0);
    expect(manager.getHistory().length).toBe(1); // one gesture, one entry

    await manager.undo();

    expect(diagram.getNodes().length).toBe(2);
    expect(diagram.getLinks().length).toBe(1);
    expect(diagram.getNode(node1.id)).toBeDefined();
    expect(diagram.getNode(node2.id)).toBeDefined();
  });

  it('reports canUndo=true even though its CopyCommand step is non-undoable', async () => {
    // REGRESSION GUARD: MacroCommand.canUndo() ANDs its steps and
    // CopyCommand.canUndo() is false by design, so the inherited implementation
    // made CommandManager.undo() throw "Cannot undo command: Cut".
    const node = new NodeModel({ type: 'rect', position: { x: 0, y: 0 } });
    diagram.addNode(node);
    select(node);

    const cut = new CutCommand(clipboard);
    await manager.execute(cut);

    expect(cut.canUndo(context)).toBe(true);
    await expect(manager.undo()).resolves.toBeUndefined();
    expect(diagram.getNodes().length).toBe(1);
  });

  it('redo re-applies the cut (does not re-run the copy against an empty selection)', async () => {
    // REGRESSION GUARD: the default redo re-executes, and the copy step reads
    // the LIVE selection — which undo() does not restore — so redo threw
    // "No nodes selected".
    const node = new NodeModel({ type: 'rect', position: { x: 0, y: 0 } });
    diagram.addNode(node);
    select(node);

    await manager.execute(new CutCommand(clipboard));
    await manager.undo();
    expect(diagram.getNodes().length).toBe(1);

    await manager.redo();
    expect(diagram.getNodes().length).toBe(0);

    // ...and it is still undoable afterwards (undo → redo → undo).
    await manager.undo();
    expect(diagram.getNodes().length).toBe(1);
  });

  it('cut → paste re-creates the nodes with VALID link endpoints (port-id remap holds)', async () => {
    const node1 = new NodeModel({ type: 'rect', position: { x: 0, y: 0 } });
    const node2 = new NodeModel({ type: 'rect', position: { x: 200, y: 0 } });
    diagram.addNode(node1);
    diagram.addNode(node2);
    expect(diagram.connectNodes(node1, node2)).toBe(true);
    select(node1, node2);

    await manager.execute(new CutCommand(clipboard));
    expect(diagram.getNodes().length).toBe(0);
    expect(diagram.getLinks().length).toBe(0);

    await manager.execute(new PasteCommand(clipboard, { offset: { x: 40, y: 40 } }));

    const nodes = diagram.getNodes();
    const links = diagram.getLinks();
    expect(nodes.length).toBe(2);
    expect(links.length).toBe(1);

    // The pasted link's endpoints must resolve to REAL ports on the pasted nodes.
    const portIds = new Set(nodes.flatMap((n) => n.getPorts().map((p) => p.id)));
    const nodeIds = new Set(nodes.map((n) => n.id));
    expect(portIds.has(links[0].sourcePortId)).toBe(true);
    expect(portIds.has(links[0].targetPortId)).toBe(true);
    expect(nodeIds.has(links[0].sourceNodeId!)).toBe(true);
    expect(nodeIds.has(links[0].targetNodeId!)).toBe(true);

    // Offset applied.
    const pasted1 = nodes.find((n) => n.position.x === 40);
    expect(pasted1).toBeDefined();
  });

  it('cannot execute with an empty selection', () => {
    const cut = new CutCommand(clipboard);
    expect(cut.canExecute(context)).toBe(false);
  });

  it('describes itself as a cut', async () => {
    const node = new NodeModel({ type: 'rect', position: { x: 0, y: 0 } });
    diagram.addNode(node);
    select(node);

    const cut = new CutCommand(clipboard);
    await manager.execute(cut);

    expect(cut.getDescription()).toContain('Cut');
  });
});

describe('Production-format link endpoints (wave3/interaction)', () => {
  // REGRESSION GUARD: CopyCommand/DeleteSelectionCommand used to derive a node id
  // with `portId.split(':')[0]`, but engine port ids are nanoids — so links made
  // by connectNodes() were invisible to both commands.
  let diagram: DiagramModel;
  let context: CommandContext;
  let clipboard: ClipboardManager;
  let node1: NodeModel;
  let node2: NodeModel;

  beforeEach(() => {
    diagram = new DiagramModel();
    clipboard = new ClipboardManager();
    context = { diagram, eventBus: { emit: jest.fn() }, store: new Map() };
    node1 = new NodeModel({ type: 'rect', position: { x: 0, y: 0 } });
    node2 = new NodeModel({ type: 'rect', position: { x: 200, y: 0 } });
    diagram.addNode(node1);
    diagram.addNode(node2);
    expect(diagram.connectNodes(node1, node2)).toBe(true);
    context.store!.set('selectedNodes', new Set([node1.id, node2.id]));
    context.store!.set('selectedLinks', new Set<string>());
  });

  it('CopyCommand copies links created by connectNodes()', async () => {
    const { CopyCommand } = await import('./CopyCommand');
    new CopyCommand(clipboard).execute(context);

    expect(clipboard.get()!.links.length).toBe(1);
  });

  it('DeleteSelectionCommand takes connected links with the nodes (no orphan links)', () => {
    new DeleteSelectionCommand().execute(context);

    expect(diagram.getNodes().length).toBe(0);
    expect(diagram.getLinks().length).toBe(0); // removeNode() does NOT cascade
  });

  it('undo restores both the nodes and the link', () => {
    const command = new DeleteSelectionCommand();
    command.execute(context);
    command.undo(context);

    expect(diagram.getNodes().length).toBe(2);
    expect(diagram.getLinks().length).toBe(1);
    const link = diagram.getLinks()[0];
    expect(diagram.getNodeByPortId(link.sourcePortId)).toBeDefined();
    expect(diagram.getNodeByPortId(link.targetPortId)).toBeDefined();
  });
});

describe('DeleteSelectionCommand redo (wave3/interaction)', () => {
  it('replays the recorded deletion after an undo', async () => {
    const diagram = new DiagramModel();
    const context: CommandContext = {
      diagram,
      eventBus: { emit: jest.fn() },
      store: new Map(),
    };
    const node = new NodeModel({ type: 'rect', position: { x: 5, y: 5 } });
    diagram.addNode(node);
    context.store!.set('selectedNodes', new Set([node.id]));
    context.store!.set('selectedLinks', new Set<string>());

    const manager = new CommandManager(context, context.eventBus);
    await manager.execute(new DeleteSelectionCommand());
    expect(diagram.getNodes().length).toBe(0);

    await manager.undo();
    expect(diagram.getNodes().length).toBe(1);
    // undo() does NOT restore the selection — which is exactly why redo cannot
    // just re-run execute().
    expect((context.store!.get('selectedNodes') as Set<string>).size).toBe(0);

    await manager.redo();
    expect(diagram.getNodes().length).toBe(0);
  });
});

describe('Gesture → command: MoveNodeCommand / MacroCommand (wave3/interaction)', () => {
  let diagram: DiagramModel;
  let context: CommandContext;
  let manager: CommandManager;

  beforeEach(() => {
    diagram = new DiagramModel();
    context = {
      diagram,
      eventBus: { emit: jest.fn() },
      store: new Map(),
    };
    manager = new CommandManager(context, context.eventBus);
  });

  it('a completed drag is ONE undo step that restores the original position', async () => {
    const node = new NodeModel({ type: 'rect', position: { x: 100, y: 100 } });
    diagram.addNode(node);

    // What the canvas commits at pointer-UP: start → end, captured at drag start.
    node.setPosition(260, 180); // the live drag already moved it
    await manager.execute(
      new MoveNodeCommand(
        node.id,
        { x: 260, y: 180 },
        { x: 100, y: 100 },
        { mergeable: false }
      )
    );

    expect(manager.getHistory().length).toBe(1);
    expect(node.position.x).toBe(260);
    expect(node.position.y).toBe(180);

    await manager.undo();
    expect(node.position.x).toBe(100);
    expect(node.position.y).toBe(100);

    await manager.redo();
    expect(node.position.x).toBe(260);
    expect(node.position.y).toBe(180);
  });

  it('two successive drags of the SAME node stay two undo steps (no merge)', async () => {
    // CommandManager merges same-node MoveNodeCommands inside a 500ms window.
    // A gesture-committed move opts out, otherwise one Ctrl+Z would rewind both.
    const node = new NodeModel({ type: 'rect', position: { x: 0, y: 0 } });
    diagram.addNode(node);

    await manager.execute(
      new MoveNodeCommand(node.id, { x: 50, y: 0 }, { x: 0, y: 0 }, { mergeable: false })
    );
    await manager.execute(
      new MoveNodeCommand(node.id, { x: 90, y: 0 }, { x: 50, y: 0 }, { mergeable: false })
    );

    expect(manager.getHistory().length).toBe(2);

    await manager.undo();
    expect(node.position.x).toBe(50); // back to the end of the FIRST gesture
  });

  it('still merges by default (streamed moves keep the historic behaviour)', async () => {
    const node = new NodeModel({ type: 'rect', position: { x: 0, y: 0 } });
    diagram.addNode(node);

    await manager.execute(new MoveNodeCommand(node.id, { x: 10, y: 0 }, { x: 0, y: 0 }));
    await manager.execute(new MoveNodeCommand(node.id, { x: 20, y: 0 }, { x: 10, y: 0 }));

    expect(manager.getHistory().length).toBe(1);
  });

  it('a multi-node drag undoes as ONE MacroCommand', async () => {
    const node1 = new NodeModel({ type: 'rect', position: { x: 0, y: 0 } });
    const node2 = new NodeModel({ type: 'rect', position: { x: 100, y: 100 } });
    diagram.addNode(node1);
    diagram.addNode(node2);

    // Live drag moved both by (+30, +40).
    node1.setPosition(30, 40);
    node2.setPosition(130, 140);

    const macro = new MacroCommand('Move 2 Nodes');
    macro.addStep(
      new MoveNodeCommand(node1.id, { x: 30, y: 40 }, { x: 0, y: 0 }, { mergeable: false })
    );
    macro.addStep(
      new MoveNodeCommand(node2.id, { x: 130, y: 140 }, { x: 100, y: 100 }, { mergeable: false })
    );
    await manager.execute(macro);

    expect(manager.getHistory().length).toBe(1);

    await manager.undo();
    expect(node1.position).toEqual(expect.objectContaining({ x: 0, y: 0 }));
    expect(node2.position).toEqual(expect.objectContaining({ x: 100, y: 100 }));

    await manager.redo();
    expect(node1.position).toEqual(expect.objectContaining({ x: 30, y: 40 }));
    expect(node2.position).toEqual(expect.objectContaining({ x: 130, y: 140 }));
  });
});
