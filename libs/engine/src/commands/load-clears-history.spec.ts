/**
 * S10 (docs review v4): undo history survived a document load.
 *
 * The React quick start saved, edited (moved a node, drew a link), loaded the
 * saved document back, and pressed Ctrl+Z twice: the second press threw
 * "Cannot undo command: Add Link", because the link that command added was no
 * longer in the document.
 *
 * Two rules, both covered here:
 *   1. Loading a document (setDiagram with another diagram, deserialize,
 *      loadFromJSON, or any loader that calls `DiagramModel.markDocumentReplaced()`)
 *      clears the engine's own command history.
 *   2. Undo NEVER throws on a stale command. A command whose target is gone is
 *      dropped together with everything older (those steps were made on a document
 *      that no longer exists), and `command:history-stale` says so.
 *
 * And the decision for a collaborative history owner (a sync Replica): a load
 * INTO the replica's diagram is a shared edit every peer receives, so its
 * per-actor stack is kept; undo there is supersession-aware and never throws.
 * A load that SWAPS the diagram leaves the replica with the old diagram, and the
 * engine's own (cleared) stack takes over.
 */
import { DiagramEngine } from '../engine/DiagramEngine';
import { DiagramModel } from '../models/DiagramModel';
import { NodeModel } from '../models/NodeModel';
import { PortModel } from '../models/PortModel';
import { Replica } from '../collab/replica';
import { MoveNodeCommand } from './basic/MoveNodeCommand';

const move = (engine: DiagramEngine, id: string, to: { x: number; y: number }) =>
  engine.commandManager.execute(new MoveNodeCommand(id, to));

async function seeded(engine: DiagramEngine) {
  const diagram = engine.createDiagram('d');
  const a = new NodeModel({ id: 'a', type: 'basic', position: { x: 0, y: 0 } });
  const b = new NodeModel({ id: 'b', type: 'basic', position: { x: 300, y: 0 } });
  a.addPort(new PortModel({ id: 'a-out', type: 'output' }));
  b.addPort(new PortModel({ id: 'b-in', type: 'input' }));
  diagram.addNode(a);
  diagram.addNode(b);
  return diagram;
}

describe('S10: a document load clears or rebases undo history', () => {
  let engine: DiagramEngine;
  beforeEach(() => {
    engine = new DiagramEngine();
  });
  afterEach(() => engine.destroy());

  it('undo of a command whose target is gone does not throw, and drops the stale steps', async () => {
    const diagram = await seeded(engine);
    await move(engine, 'a', { x: 40, y: 40 });
    const link = await engine.addLink({ sourcePortId: 'a-out', targetPortId: 'b-in' });
    expect(engine.canUndo()).toBe(true);

    // The document changes under the history, outside any command (a host's
    // setEdges reconcile, a peer, a plugin): the link is gone.
    diagram.removeLink(link.id);

    const stale: unknown[] = [];
    engine.eventBus.on('command:history-stale', (e: unknown) => stale.push(e));
    await expect(engine.undo()).resolves.toBeUndefined();
    expect(stale).toHaveLength(1);
    // The move before the link was made on a document that no longer exists.
    expect(engine.canUndo()).toBe(false);
    await expect(engine.undo()).resolves.toBeUndefined();
    expect(diagram.getNode('a')!.position).toEqual({ x: 40, y: 40 });
  });

  it('a stale redo does not throw either', async () => {
    const diagram = await seeded(engine);
    await engine.addNode(new NodeModel({ id: 'c', type: 'basic', position: { x: 0, y: 200 } }));
    await engine.undo();
    // Something else put a node under that id: the redo cannot apply.
    const other = new NodeModel({ id: 'c', type: 'basic', position: { x: 500, y: 500 } });
    diagram.addNode(other);
    const stale: unknown[] = [];
    engine.eventBus.on('command:history-stale', (e: unknown) => stale.push(e));
    await expect(engine.redo()).resolves.toBeUndefined();
    expect(stale).toHaveLength(1);
    expect(engine.canRedo()).toBe(false);
    expect(diagram.getNode('c')).toBe(other);
  });

  it('loadFromJSON clears the history', async () => {
    await seeded(engine);
    const saved = engine.saveToJSON()!;
    await move(engine, 'a', { x: 40, y: 40 });
    await engine.addLink({ sourcePortId: 'a-out', targetPortId: 'b-in' });
    expect(engine.canUndo()).toBe(true);

    engine.loadFromJSON(saved);
    expect(engine.canUndo()).toBe(false);
    expect(engine.canRedo()).toBe(false);
    await expect(engine.undo()).resolves.toBeUndefined();
  });

  it('deserialize and setDiagram clear the history; re-attaching the same diagram does not', async () => {
    const diagram = await seeded(engine);
    await move(engine, 'a', { x: 40, y: 40 });
    engine.setDiagram(diagram);
    expect(engine.canUndo()).toBe(true);

    engine.setDiagram(new DiagramModel('other'));
    expect(engine.canUndo()).toBe(false);

    engine.setDiagram(diagram);
    await move(engine, 'a', { x: 80, y: 80 });
    engine.deserialize(diagram.serialize());
    expect(engine.canUndo()).toBe(false);
  });

  it('markDocumentReplaced() on the attached diagram clears the history', async () => {
    const diagram = await seeded(engine);
    await move(engine, 'a', { x: 40, y: 40 });
    diagram.markDocumentReplaced();
    expect(engine.canUndo()).toBe(false);
  });

  it('a replica owner keeps its stack across a load into its diagram, and undo never throws', async () => {
    const diagram = await seeded(engine);
    const replica = new Replica(diagram, { actor: 'me', onLocalOp: () => undefined });
    await move(engine, 'a', { x: 40, y: 40 });
    expect(engine.canUndo()).toBe(true);

    // A load into the shared document: the ops are this actor's edit.
    diagram.removeNode('b');
    diagram.markDocumentReplaced();
    expect(engine.canUndo()).toBe(true); // routed to the replica
    await expect(engine.undo()).resolves.toBeUndefined();
    await expect(engine.undo()).resolves.toBeUndefined();
    expect(diagram.getNode('a')!.position).toEqual({ x: 0, y: 0 });

    // Swapping the diagram leaves the replica behind: the engine's own stack,
    // cleared by the swap, is the one that answers.
    engine.setDiagram(new DiagramModel('fresh'));
    expect(engine.canUndo()).toBe(false);
    replica.dispose();
  });
});
