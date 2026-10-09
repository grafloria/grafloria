import { createDiagram } from '../create-diagram';
import type { CreateDiagramOptions, DiagramInstance } from '../create-diagram';
import type { NodeSpec } from '../model-input';

function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 600, right: 1000, bottom: 600 }) as DOMRect;
  document.body.appendChild(el);
  return el;
}
const step = (id: string, x: number, outs: string[]): NodeSpec => ({
  id,
  position: { x, y: 100 },
  size: { width: 120, height: 60 },
  ports: [{ id: `${id}:in`, side: 'left', type: 'input' }, ...outs.map((o, i) => ({ id: `${id}:${o}`, side: 'right' as const, type: 'output' as const, index: i }))],
});

describe('affordances: "+" where the next step can go — they only ask', () => {
  let container: HTMLElement;
  let d: DiagramInstance | undefined;
  beforeEach(() => (container = makeContainer()));
  afterEach(() => {
    d?.dispose();
    d = undefined;
    container.remove();
  });
  const mount = (extra: Partial<CreateDiagramOptions> = {}) => {
    d = createDiagram(container, {
      nodes: [step('if', 0, ['true', 'false']), step('x', 400, ['out'])],
      edges: [{ id: 'e', source: 'if', sourceHandle: 'if:true', target: 'x', targetHandle: 'x:in' }],
      affordances: { portAdd: true, linkAdd: true, linkDelete: true },
      ...extra,
    });
    return d;
  };
  const plusFor = (portId: string) => container.querySelector(`.grafloria-port-add[data-port-id="${portId}"]`) as HTMLButtonElement | null;

  it('a "+" on every unconnected OUTPUT port — not on a wired one, not on an input', () => {
    mount();
    expect(plusFor('if:false')).not.toBeNull();
    expect(plusFor('x:out')).not.toBeNull();
    expect(plusFor('if:true')).toBeNull(); // wired
    expect(plusFor('x:in')).toBeNull(); // an input
    expect(plusFor('if:false')!.getAttribute('data-side')).toBe('right');
  });

  it('pressing it only EMITS port:add-request; the canvas does not select or pan under it', () => {
    mount();
    const asked: unknown[] = [];
    d!.on('port:add-request', (p) => asked.push(p));
    const b = plusFor('if:false')!;
    b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 150, clientY: 140 }));
    b.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 150, clientY: 140 }));
    expect(asked).toEqual([{ nodeId: 'if', portId: 'if:false', clientPoint: { x: 150, y: 140 } }]);
    expect(d!.getModel().getNodes()).toHaveLength(2); // nothing was added by the library
    expect(d!.getModel().getSelectedNodes()).toHaveLength(0);
  });

  it('a hovered link shows "+" and delete at its midpoint; each only emits', () => {
    mount();
    const link = d!.getModel().getLink('e')!;
    link.setState('hovered');
    d!.renderNow();
    const add = container.querySelector('.grafloria-link-add') as HTMLButtonElement;
    const del = container.querySelector('.grafloria-link-delete') as HTMLButtonElement;
    expect(add).not.toBeNull();
    expect(del).not.toBeNull();
    const events: string[] = [];
    d!.on('link:add-request', ({ linkId }) => events.push(`add ${linkId}`));
    d!.on('link:delete-request', ({ linkId }) => events.push(`delete ${linkId}`));
    add.click();
    del.click();
    expect(events).toEqual(['add e', 'delete e']);
    expect(d!.getModel().getLink('e')).toBeDefined(); // the host decides
    // un-hovered → gone…
    link.setState('normal' as never);
    d!.renderNow();
    expect(container.querySelector('.grafloria-link-add')).toBeNull();
  });

  it('…but they stay while the pointer is ON them (leaving the line for the button)', () => {
    mount();
    const link = d!.getModel().getLink('e')!;
    link.setState('hovered');
    d!.renderNow();
    container.querySelector('.grafloria-link-add')!.dispatchEvent(new Event('pointerenter'));
    link.setState('normal' as never);
    d!.renderNow();
    expect(container.querySelector('.grafloria-link-add')).not.toBeNull();
  });

  it('never shows read-only; back when editable again', () => {
    mount({ readonly: true });
    expect(container.querySelectorAll('.grafloria-port-add')).toHaveLength(0);
    d!.setReadonly(false);
    d!.renderNow();
    expect(container.querySelectorAll('.grafloria-port-add').length).toBeGreaterThan(0);
    d!.setReadonly(true);
    d!.renderNow();
    expect(container.querySelectorAll('.grafloria-port-add')).toHaveLength(0);
  });

  it('wiring the port removes its "+"', () => {
    mount();
    d!.setEdges([
      { id: 'e', source: 'if', sourceHandle: 'if:true', target: 'x', targetHandle: 'x:in' },
      { id: 'f', source: 'if', sourceHandle: 'if:false', target: 'x', targetHandle: 'x:in' },
    ]);
    d!.renderNow();
    expect(plusFor('if:false')).toBeNull();
  });

  it('off by default: no affordance element at all', () => {
    d = createDiagram(container, { nodes: [step('if', 0, ['true', 'false'])] });
    expect(container.querySelector('.grafloria-affordances')).toBeNull();
  });
});
