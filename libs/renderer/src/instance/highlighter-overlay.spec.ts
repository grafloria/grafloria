/**
 * The OUTLINE LAYER on the shared instance — `highlighterConfig`.
 *
 * Angular's canvas has always drawn it: an outline around the hovered node, the
 * selected node, nodes with a validation issue, and valid targets while a
 * connection is drawn. React, Vue and plain JavaScript mount through
 * `createDiagram()`, which never drew it. Pull request #4 let Angular turn the
 * layer off; this brings it to everything else, OFF unless asked for so no
 * existing app changes, with the same setting and the same controller — so it
 * looks and behaves exactly as Angular's does.
 */
import { createDiagram } from './create-diagram';
import type { DiagramInstance } from './create-diagram';
import { NodeModel } from '@grafloria/engine';

const WIDTH = 800;
const HEIGHT = 600;
function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: WIDTH, height: HEIGHT, right: WIDTH, bottom: HEIGHT }) as DOMRect;
  document.body.appendChild(el);
  return el;
}
const tick = () => jest.advanceTimersByTime(32);
/**
 * A type nothing knows — no TypeRegistry entry and no renderer shape — so the
 * engine's "not registered" warning is real. (These specs used `rect`, the
 * default type, until built-in shapes stopped being flagged: a type the renderer
 * draws is not an unknown type.)
 */
const UNKNOWN_TYPE = 'no-such-node-type';

describe('the outline layer (highlighterConfig) on createDiagram', () => {
  let container: HTMLElement;
  let diagram: DiagramInstance;
  const outlines = (kind?: string) => Array.from(container.querySelectorAll(kind ? `.grafloria-highlighter-${kind}` : '.grafloria-highlighter'));
  const mount = (extra: Record<string, unknown> = {}) => {
    diagram = createDiagram(container, {
      nodes: [
        { id: 'a', type: UNKNOWN_TYPE, position: { x: 100, y: 100 }, size: { width: 120, height: 60 }, label: 'A' },
        { id: 'b', type: UNKNOWN_TYPE, position: { x: 400, y: 100 }, size: { width: 120, height: 60 }, label: 'B' },
      ],
      edges: [{ source: 'a', target: 'b' }],
      ...extra,
    } as never);
    tick();
  };
  const selectAAndHoverB = () => {
    const m = diagram.getModel();
    m.selectNode(m.getNode('a')!);
    m.getNode('b')!.setState({ hovered: true });
    tick();
  };

  beforeEach(() => {
    jest.useFakeTimers();
    container = makeContainer();
  });
  afterEach(() => {
    diagram?.dispose();
    container.remove();
    jest.useRealTimers();
  });

  it('is OFF unless asked for: a selected and a hovered node draw no outline, and there is no layer at all', () => {
    mount();
    selectAAndHoverB();
    expect(outlines()).toHaveLength(0);
    expect(container.querySelector('.grafloria-highlighter-overlay')).toBeNull();
  });

  it("true: the selected node, the hovered node and the validation warnings are outlined as Angular outlines them", () => {
    mount({ highlighterConfig: true });
    selectAAndHoverB();
    const sel = outlines('selection');
    expect(sel).toHaveLength(1);
    // the selected box, padded by 4 — the controller's default, in world units
    expect(['x', 'y', 'width', 'height'].map((k) => Number(sel[0]!.getAttribute(k)))).toEqual([96, 96, 128, 68]);
    const hov = outlines('hover');
    expect(hov).toHaveLength(1);
    expect(Number(hov[0]!.getAttribute('x'))).toBe(398); // B, padded by 2
    // nodes of an unregistered type carry the engine's warning, as on Angular's canvas
    expect(outlines('validation').length).toBe(2);
    expect(outlines('validation').every((r) => r.classList.contains('grafloria-highlighter-warning'))).toBe(true);
  });

  it('the layer moves with the camera (it lives in the HTML layer) and keeps a constant on-screen stroke', () => {
    mount({ highlighterConfig: true });
    selectAAndHoverB();
    const host = container.querySelector('.grafloria-highlighter-overlay')!;
    expect(host.closest('.grafloria-html-layer')).not.toBeNull();
    expect(outlines('selection')[0]!.getAttribute('vector-effect')).toBe('non-scaling-stroke');
    expect(getComputedStyle(host as HTMLElement).pointerEvents).toBe('none');
  });

  it('setHighlighterConfig switches it live: false removes every outline, an object keeps the kinds it leaves on', () => {
    mount({ highlighterConfig: true });
    selectAAndHoverB();
    expect(outlines().length).toBeGreaterThan(0);
    diagram.setHighlighterConfig(false);
    tick();
    expect(outlines()).toHaveLength(0);
    diagram.setHighlighterConfig({ showValidation: false });
    tick();
    expect(outlines('selection')).toHaveLength(1);
    expect(outlines('hover')).toHaveLength(1);
    expect(outlines('validation')).toHaveLength(0);
  });

  it('turned on later, it starts with fresh validation; a node added afterwards is checked too', () => {
    mount();
    diagram.setHighlighterConfig(true);
    tick();
    expect(outlines('validation')).toHaveLength(2);
    diagram.getModel().addNode(new NodeModel({ id: 'c', type: UNKNOWN_TYPE, position: { x: 100, y: 300 }, size: { width: 120, height: 60, depth: 0 } }));
    tick();
    expect(outlines('validation')).toHaveLength(3);
    diagram.getModel().removeNode('c');
    tick();
    expect(outlines('validation')).toHaveLength(2);
  });
});

/**
 * v4 review S7: the "Node type 'X' is not registered" warning is about a type
 * NOTHING can draw. Built-in shapes were exempted first; this is the whole
 * class — every way the canvas draws a node exempts its type, in every binding
 * (React/Vue/Qwik/the element/plain JS all mount through createDiagram()).
 */
describe('the unregistered-type warning skips every type the canvas draws', () => {
  let container: HTMLElement;
  let diagram: DiagramInstance;
  /** The warning text of every validation outline (its <title>). */
  const flagged = () =>
    Array.from(container.querySelectorAll('.grafloria-highlighter-validation')).map((r) => r.textContent ?? '');
  const at = (i: number) => ({ position: { x: 40 + 160 * (i % 4), y: 40 + 120 * Math.floor(i / 4) }, size: { width: 120, height: 60 } });

  beforeEach(() => {
    jest.useFakeTimers();
    container = makeContainer();
  });
  afterEach(() => {
    diagram?.dispose();
    container.remove();
    jest.useRealTimers();
  });

  it('custom nodes, templates, foreignObject nodes, named silhouettes and host-registered types are not flagged; an unknown type still is', () => {
    diagram = createDiagram(container, {
      nodes: [
        { id: 'shape', type: 'diamond', ...at(0) },
        { id: 'custom', type: 'job', custom: true, ...at(1) },
        { id: 'template', type: 'card', data: { title: 'T' }, ...at(2) },
        { id: 'fo', type: 'widget', metadata: { useForeignObject: true }, ...at(3) },
        { id: 'silhouette', type: 'basic', metadata: { shape: { type: 'ellipse' } }, ...at(4) },
        { id: 'hosted', type: 'host-drawn', ...at(5) },
        { id: 'typo', type: UNKNOWN_TYPE, ...at(6) },
      ],
      nodeTemplates: { card: (data: Record<string, unknown>) => ({ html: `<b>${String(data['title'])}</b>` }) },
      renderCustomNode: (_node: unknown, el: HTMLElement) => { el.textContent = 'job'; },
      canDrawNode: (node: { type: string }) => node.type === 'host-drawn',
      highlighterConfig: true,
    } as never);
    tick();
    expect(flagged()).toEqual([`Node type '${UNKNOWN_TYPE}' is not registered`]);
  });

  it('a whiteboard-style node (type "basic", style.shape) is drawn, so it is not flagged', () => {
    diagram = createDiagram(container, { nodes: [], highlighterConfig: true } as never);
    const node = new NodeModel({ id: 'wb', type: 'basic', position: { x: 50, y: 50 }, size: { width: 100, height: 60, depth: 0 } });
    node.setStyle({ shape: 'rectangle' } as never);
    diagram.getModel().addNode(node);
    tick();
    expect(flagged()).toEqual([]);
  });
});
