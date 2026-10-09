import { LinkModel } from '@grafloria/engine';
import { createDiagram } from '../create-diagram';
import type { DiagramInstance } from '../create-diagram';
import type { NodeSpec } from '../model-input';
import { buildNode } from '../model-input';

function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1200, height: 800, right: 1200, bottom: 800 }) as DOMRect;
  document.body.appendChild(el);
  return el;
}
const step = (id: string, x: number, y: number, outs: string[] = ['out']): NodeSpec => ({
  id,
  position: { x, y },
  size: { width: 120, height: 60 },
  ports: [{ id: `${id}:in`, side: 'left', type: 'input' }, ...outs.map((o, i) => ({ id: `${id}:${o}`, side: 'right' as const, type: 'output' as const, index: i }))],
});
const edge = (id: string, from: string, port: string, to: string) => ({ id, source: from, sourceHandle: `${from}:${port}`, target: to, targetHandle: `${to}:in` });

describe('tidy() / placeNodes(): the flow layout from the live model, one undo step', () => {
  let container: HTMLElement;
  let d: DiagramInstance | undefined;
  beforeEach(() => (container = makeContainer()));
  afterEach(() => {
    d?.dispose();
    d = undefined;
    container.remove();
  });
  const pos = (id: string) => ({ x: d!.getModel().getNode(id)!.position.x, y: d!.getModel().getNode(id)!.position.y });

  it('tidy keeps an If\'s true branch above its false branch — the PORTS decide, not the link order', async () => {
    d = createDiagram(container, {
      nodes: [
        step('trigger', 0, 0),
        step('if', 50, 400, ['true', 'false']),
        step('no', 300, 0), // the false target starts ABOVE the true target
        step('yes', 600, 500),
        { id: 'note', position: { x: 160, y: -10 }, size: { width: 160, height: 80 }, label: 'a sticky note' },
      ],
      edges: [edge('t', 'trigger', 'out', 'if'), edge('f', 'if', 'false', 'no'), edge('tr', 'if', 'true', 'yes')],
    });
    const noteBefore = pos('note');
    const moved = await d.tidy({ animate: false });
    expect(moved.sort()).toEqual(['if', 'no', 'trigger', 'yes']);
    expect(pos('yes').y).toBeLessThan(pos('no').y);
    expect(pos('yes').x).toBe(pos('no').x);
    expect(pos('if').x).toBeGreaterThan(pos('trigger').x);
    expect(pos('note')).toEqual(noteBefore); // a node with no links is never moved
  });

  it('a node plugged into a slot UNDERNEATH a step is an attachment: it follows its step, at its offset', async () => {
    d = createDiagram(container, {
      nodes: [
        step('trigger', 500, 500),
        { id: 'agent', position: { x: 50, y: 50 }, size: { width: 200, height: 80 }, ports: [{ id: 'agent:in', side: 'left', type: 'input' }, { id: 'agent:model', side: 'bottom', type: 'input' }] },
        { id: 'model', position: { x: 60, y: 230 }, size: { width: 160, height: 50 }, ports: [{ id: 'model:out', side: 'top', type: 'output' }] },
      ],
      edges: [edge('t', 'trigger', 'out', 'agent'), { id: 'm', source: 'model', sourceHandle: 'model:out', target: 'agent', targetHandle: 'agent:model' }],
    });
    await d.tidy({ animate: false });
    const a = pos('agent');
    const m = pos('model');
    expect([m.x - a.x, m.y - a.y]).toEqual([10, 180]); // the same offset under its step
    expect(a.x).toBeGreaterThan(pos('trigger').x); // and the step is still after the trigger
  });

  it('one undo puts every node back where it was', async () => {
    d = createDiagram(container, {
      nodes: [step('a', 0, 300), step('b', 37, 11), step('c', 500, 600)],
      edges: [edge('ab', 'a', 'out', 'b'), edge('bc', 'b', 'out', 'c')],
    });
    const before = ['a', 'b', 'c'].map(pos);
    await d.tidy({ animate: false });
    expect(['a', 'b', 'c'].map(pos)).not.toEqual(before);
    await d.getEngine().undo();
    expect(['a', 'b', 'c'].map(pos)).toEqual(before);
  });

  it('placeNodes moves only the new node: beside its parent, in its port\'s slot, clear of the sibling', async () => {
    d = createDiagram(container, {
      nodes: [step('if', 0, 200, ['true', 'false']), step('yes', 220, 150)],
      edges: [edge('tr', 'if', 'true', 'yes')],
    });
    // A host adds the false branch somewhere arbitrary, then asks the library to place it.
    const model = d.getModel();
    model.addNode(buildNode({ ...step('no', 900, 900) }, 0));
    model.addLink(new LinkModel('if:false', 'no:in'));
    const yesBefore = pos('yes');
    const moved = await d.placeNodes(['no'], { animate: false });
    expect(moved).toEqual(['no']);
    expect(pos('yes')).toEqual(yesBefore);
    expect(pos('no').x).toBe(200); // one step right of the If: 0 + 120 wide + an 80 gap
    expect(pos('no').y).toBeGreaterThan(yesBefore.y + 60); // below the true branch
    await d.getEngine().undo();
    expect(pos('no')).toEqual({ x: 900, y: 900 });
  });
});
