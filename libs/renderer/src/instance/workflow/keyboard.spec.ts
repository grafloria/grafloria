import type { ClipboardData } from '@grafloria/engine';
import { createDiagram } from '../create-diagram';
import type { CreateDiagramOptions, DiagramInstance } from '../create-diagram';
import type { NodeSpec } from '../model-input';
import type { KeyAction } from '../dom-event-binder';

function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 }) as DOMRect;
  document.body.appendChild(el);
  return el;
}
const NODES: NodeSpec[] = [
  { id: 'a', position: { x: 100, y: 100 }, size: { width: 100, height: 60 }, label: 'A' },
  { id: 'b', position: { x: 400, y: 100 }, size: { width: 100, height: 60 }, label: 'B' },
];
const key = (k: string, init: KeyboardEventInit = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...init }));
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('the host owns the keyboard when it wants to', () => {
  const made: Array<{ d: DiagramInstance; el: HTMLElement }> = [];
  const mount = (options: CreateDiagramOptions = {}) => {
    const el = makeContainer();
    const d = createDiagram(el, { nodes: NODES, ...options });
    made.push({ d, el });
    return d;
  };
  afterEach(() => {
    for (const { d, el } of made.splice(0)) {
      d.dispose();
      el.remove();
    }
  });
  const select = (d: DiagramInstance, id: string) => d.getModel().selectNode(d.getModel().getNode(id)!);

  it('keyboard: false — no built-in key acts (Delete leaves the selection)', async () => {
    const d = mount({ keyboard: false });
    select(d, 'a');
    key('Delete');
    await flush();
    expect(d.getModel().getNode('a')).toBeDefined();
  });

  it('beforeKey is asked with the action, and false cancels exactly that action', async () => {
    const asked: KeyAction[] = [];
    const d = mount({ keyboard: { beforeKey: (_e, action) => (asked.push(action), action === 'delete' ? false : undefined) } });
    select(d, 'a');
    key('Delete');
    key('a', { ctrlKey: true });
    await flush();
    expect(asked).toEqual(['delete', 'selectAll']);
    expect(d.getModel().getNode('a')).toBeDefined(); // delete cancelled
    expect(d.getModel().getSelectedNodes().length).toBe(2); // select-all ran
  });

  it('by default Delete still deletes and Ctrl+X does nothing (unchanged behaviour)', async () => {
    const d = mount();
    select(d, 'a');
    key('x', { ctrlKey: true });
    await flush();
    expect(d.getModel().getNode('a')).toBeDefined();
    key('Delete');
    await flush();
    expect(d.getModel().getNode('a')).toBeUndefined();
  });

  it('an owned keyboard adds Ctrl+X: cut is ONE undo step', async () => {
    const copied: Array<[ClipboardData, string]> = [];
    const d = mount({ keyboard: {}, clipboard: { onCopy: (data, kind) => copied.push([data, kind]) } });
    select(d, 'a');
    key('x', { ctrlKey: true });
    await flush();
    await flush();
    expect(d.getModel().getNode('a')).toBeUndefined();
    expect(copied.map(([data, kind]) => [data.nodes.map((n) => n.id), kind])).toEqual([[['a'], 'cut']]);
    await d.getEngine().undo();
    expect(d.getModel().getNode('a')).toBeDefined();
  });

  it('copy() hands the payload to onCopy; paste(data) pastes a host-kept payload into ANOTHER diagram', async () => {
    let kept: ClipboardData | null = null;
    const src = mount({ clipboard: { onCopy: (data) => (kept = JSON.parse(JSON.stringify(data))) } });
    select(src, 'a');
    const data = await src.copy();
    expect(data?.nodes.map((n) => n.id)).toEqual(['a']);
    expect(kept).not.toBeNull();
    const dst = mount({ nodes: [] });
    expect(await dst.paste(kept!)).toBe(true);
    expect(dst.getModel().getNodes()).toHaveLength(1);
  });

  it('Ctrl+V asks onPaste first', async () => {
    const src = mount();
    select(src, 'b');
    const payload = (await src.copy())!;
    const dst = mount({ nodes: [], clipboard: { onPaste: () => payload } });
    key('v', { ctrlKey: true });
    await flush();
    await flush();
    // both diagrams listen on window: src pastes its own copy, dst pastes what onPaste gave
    expect(dst.getModel().getNodes()).toHaveLength(1);
  });

  it('read-only refuses cut and paste', async () => {
    const d = mount({ readonly: true });
    select(d, 'a');
    expect(await d.cut()).toBeNull();
    expect(await d.paste()).toBe(false);
    expect(d.getModel().getNode('a')).toBeDefined();
  });
});
