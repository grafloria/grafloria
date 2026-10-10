// `readonly: true` locks the DOCUMENT, not only the gestures. Before, the tools were blocked
// but `commandManager.execute(AddNodeCommand)` still edited the diagram and entered history.
// The instance's own input (setNodes/setEdges/loadText) still applies, as a system write:
// it is how every binding feeds a read-only viewer its data.
import { AddNodeCommand, MoveNodeCommand, NodeModel } from '@grafloria/engine';
import { createDiagram } from './create-diagram';
import type { DiagramInstance } from './create-diagram';

function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

describe('readonly: true locks the model too', () => {
  const made: Array<{ d: DiagramInstance; el: HTMLElement }> = [];
  afterEach(() => {
    for (const { d, el } of made.splice(0)) { d.dispose(); el.remove(); }
  });
  const mount = (readonly: boolean) => {
    const el = makeContainer();
    const d = createDiagram(el, {
      nodes: [{ id: 'n', position: { x: 50, y: 50 }, size: { width: 80, height: 40 } }],
      readonly,
    });
    made.push({ d, el });
    return d;
  };
  const addCmd = () => new AddNodeCommand(new NodeModel({ id: 'added', type: 'default', position: { x: 300, y: 50 }, size: { width: 80, height: 40 } }));

  it('a command executed through the engine is refused and enters no history', async () => {
    const d = mount(true);
    await d.getEngine().commandManager.execute(addCmd());
    expect(d.getModel().getNode('added')).toBeUndefined();
    expect(d.getEngine().canUndo()).toBe(false);
  });

  it('a direct model edit is refused', () => {
    const d = mount(true);
    d.getModel().getNode('n')!.setPosition(400, 400);
    expect(d.getModel().getNode('n')!.position.x).toBe(50);
  });

  it("the instance's own input still applies: a read-only viewer follows its data", () => {
    const d = mount(true);
    d.setNodes([
      { id: 'n', position: { x: 120, y: 50 }, size: { width: 80, height: 40 } },
      { id: 'm', position: { x: 300, y: 50 }, size: { width: 80, height: 40 } },
    ]);
    d.setEdges([{ id: 'e', source: 'n', target: 'm' }]);
    expect(d.getModel().getNode('n')!.position.x).toBe(120);
    expect(d.getModel().getNode('m')).toBeDefined();
    expect(d.getModel().getLinks()).toHaveLength(1);
  });

  it('setReadonly(false) unlocks it; setReadonly(true) locks a live one', async () => {
    const d = mount(true);
    d.setReadonly(false);
    await d.getEngine().commandManager.execute(addCmd());
    expect(d.getModel().getNode('added')).toBeDefined();

    d.setReadonly(true);
    await d.getEngine().commandManager.execute(
      new MoveNodeCommand('n', { x: 500, y: 50 }, { x: 50, y: 50 }, { mergeable: false })
    );
    expect(d.getModel().getNode('n')!.position.x).toBe(50);
  });

  it('a diagram that is not read-only is unchanged', async () => {
    const d = mount(false);
    await d.getEngine().commandManager.execute(addCmd());
    expect(d.getModel().getNode('added')).toBeDefined();
    expect(d.getModel().isReadonly()).toBe(false);
  });
});
