/**
 * S10 (docs review v4): undo history survived a document load on the canvas.
 *
 * The React quick start: Save → move a node, draw a link → Load saved
 * (`serializer.deserialize` + setNodes/setEdges/setGroups with its models) →
 * Ctrl+Z Ctrl+Z threw "Cannot undo command: Add Link". Every canvas load path is
 * covered: the instance's setNodes/setEdges with a loaded document's models,
 * `loadText`, and plain spec input that removes what a command added.
 */
import { MoveNodeCommand, Replica } from '@grafloria/engine';
import { createDiagram } from './create-diagram';
import type { DiagramInstance } from './create-diagram';

const made: Array<{ container: HTMLElement; instance: DiagramInstance }> = [];
function fresh(): DiagramInstance {
  const container = document.createElement('div');
  container.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  document.body.appendChild(container);
  const instance = createDiagram(container, {
    nodes: [
      { id: 'a', label: 'A', position: { x: 0, y: 0 } },
      { id: 'b', label: 'B', position: { x: 300, y: 0 } },
    ],
    edges: [{ id: 'e1', source: 'a', target: 'b' }],
  });
  made.push({ container, instance });
  return instance;
}

afterEach(() => {
  for (const { instance, container } of made.splice(0)) {
    instance.dispose();
    container.remove();
  }
});

/** Move `a` and draw a b→a link, both as commands — what the hand does on the canvas. */
async function edit(instance: DiagramInstance): Promise<void> {
  const engine = instance.getEngine();
  await engine.commandManager.execute(new MoveNodeCommand('a', { x: 40, y: 40 }));
  const b = instance.getModel().getNode('b')!;
  const a = instance.getModel().getNode('a')!;
  await engine.addLink({ sourcePortId: b.getPorts()[0].id, targetPortId: a.getPorts()[1].id });
  expect(instance.getModel().getLinks()).toHaveLength(2);
}

describe('S10: a load on the canvas clears undo history', () => {
  it('Save → edit → Load (the React quick start) → undo twice: no throw, nothing to undo', async () => {
    const instance = fresh();
    const engine = instance.getEngine();
    const saved = engine.serializer.serializeEnvelope(instance.getModel());
    await edit(instance);

    // The quick start's load(), verbatim.
    const model = engine.serializer.deserialize(saved);
    instance.setGroups([]);
    instance.setNodes(model.getNodes());
    instance.setEdges(model.getLinks());
    instance.setGroups(model.getGroups());

    expect(engine.canUndo()).toBe(false);
    await expect(engine.undo()).resolves.toBeUndefined();
    await expect(engine.undo()).resolves.toBeUndefined();
    expect(instance.getModel().getNode('a')!.position).toEqual({ x: 0, y: 0 });
    expect(instance.getModel().getLinks().map((l) => l.id)).toEqual(['e1']);
  });

  it('plain spec input that removes a commanded link: undo does not throw', async () => {
    const instance = fresh();
    await edit(instance);
    instance.setEdges([{ id: 'e1', source: 'a', target: 'b' }]);
    const engine = instance.getEngine();
    await expect(engine.undo()).resolves.toBeUndefined();
    await expect(engine.undo()).resolves.toBeUndefined();
  });

  it('loadText clears the history', async () => {
    const instance = fresh();
    await edit(instance);
    instance.loadText('flowchart LR\n  a[A] --> b[B]\n');
    const engine = instance.getEngine();
    expect(engine.canUndo()).toBe(false);
    await expect(engine.undo()).resolves.toBeUndefined();
  });

  it('under a replica owner, loadText is ONE undo step that takes the whole load back', async () => {
    const instance = fresh();
    const replica = new Replica(instance.getModel(), { actor: 'me' });
    const engine = instance.getEngine();
    instance.loadText('flowchart LR\n  x[X] --> y[Y]\n');
    expect(instance.getModel().getNodes().map((n) => n.id).sort()).toEqual(['x', 'y']);
    expect(engine.canUndo()).toBe(true);
    await expect(engine.undo()).resolves.toBeUndefined();
    expect(instance.getModel().getNodes().map((n) => n.id).sort()).toEqual(['a', 'b']);
    expect(engine.canUndo()).toBe(false);
    replica.dispose();
  });
});
