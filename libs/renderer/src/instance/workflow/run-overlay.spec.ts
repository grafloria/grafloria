import { createDiagram } from '../create-diagram';
import type { DiagramInstance } from '../create-diagram';
import type { NodeSpec } from '../model-input';

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

describe('the run overlay: a run drawn on the flow, never part of the document', () => {
  let container: HTMLElement;
  let d: DiagramInstance | undefined;
  beforeEach(() => (container = makeContainer()));
  afterEach(() => {
    d?.dispose();
    d = undefined;
    container.remove();
  });
  const q = (sel: string) => container.querySelector(sel) as HTMLElement | null;
  const mount = () => {
    d = createDiagram(container, { nodes: NODES, edges: [{ id: 'e', source: 'a', target: 'b' }] });
    return d;
  };

  it('is absent until used: no overlay element on a diagram that never calls setOverlay', () => {
    mount();
    expect(q('.grafloria-run-overlay')).toBeNull();
    expect(d!.getOverlay()).toEqual({});
  });

  it('paints a status frame + badge per node and a label + moving dash per link, at their geometry', () => {
    mount().setOverlay({ nodes: { a: { status: 'completed', badge: '3 items' }, b: { status: 'running' } }, links: { e: { label: '3 items', animate: true } } });
    const frame = q('.grafloria-run-frame[data-node-id="a"]')!;
    expect(frame.getAttribute('data-status')).toBe('completed');
    expect(frame.style.left).toBe('97px'); // 3 px outside the card
    expect(frame.style.width).toBe('106px');
    expect(q('.grafloria-run-badge')!.textContent).toBe('3 items');
    expect(q('.grafloria-run-frame[data-node-id="b"]')!.getAttribute('data-status')).toBe('running');
    const label = q('.grafloria-run-label[data-link-id="e"]')!;
    expect(label.textContent).toBe('3 items');
    const pts = d!.getModel().getLink('e')!.points;
    const midX = (pts[0]!.x + pts[pts.length - 1]!.x) / 2;
    expect(Math.abs(parseFloat(label.style.left) - midX)).toBeLessThan(1); // a straight a→b: halfway
    expect(container.querySelector('path.grafloria-run-flow[data-link-id="e"]')!.getAttribute('d')).toMatch(/^M/);
  });

  it('never enters undo, serialization or the model\'s own status', () => {
    mount();
    const engine = d!.getEngine();
    const undoBefore = engine.commandManager.canUndo();
    const before = JSON.stringify(d!.getModel().serialize());
    d!.setOverlay({ nodes: { a: { status: 'error', badge: 'failed' } }, links: { e: { label: 'x' } } });
    expect(engine.commandManager.canUndo()).toBe(undoBefore);
    expect(JSON.stringify(d!.getModel().serialize())).toBe(before);
    expect(d!.getModel().getNode('a')!.state.status).toBeUndefined();
  });

  it('each call REPLACES the last; clearOverlay removes everything, the host attribute too', () => {
    mount().setOverlay({ nodes: { a: { status: 'running' }, b: { status: 'pending' } } });
    d!.setOverlay({ nodes: { b: { status: 'completed' } } });
    expect(q('.grafloria-run-frame[data-node-id="a"]')).toBeNull();
    expect(q('.grafloria-run-frame[data-node-id="b"]')!.getAttribute('data-status')).toBe('completed');
    d!.clearOverlay();
    expect(q('.grafloria-run-overlay')).toBeNull();
    expect(container.querySelector('[data-run-status]')).toBeNull();
  });

  it('an HTML card host carries data-run-status for the host\'s own CSS', () => {
    d = createDiagram(container, {
      nodes: [{ id: 'c', custom: true, position: { x: 50, y: 50 }, size: { width: 160, height: 70 } } as NodeSpec],
      renderCustomNode: (_n, el) => {
        el.textContent = 'card';
      },
    });
    const host = q('.grafloria-node-host[data-node-id="c"]')!;
    expect(host).not.toBeNull();
    d.setOverlay({ nodes: { c: { status: 'error' } } });
    expect(host.getAttribute('data-run-status')).toBe('error');
    d.setOverlay({ nodes: { c: { status: 'completed' } } });
    expect(host.getAttribute('data-run-status')).toBe('completed');
    d.clearOverlay();
    expect(host.hasAttribute('data-run-status')).toBe(false);
  });

  it('follows a node that moves', () => {
    mount().setOverlay({ nodes: { a: { status: 'running' } } });
    d!.getModel().getNode('a')!.setPosition(200, 150);
    d!.renderNow();
    expect(q('.grafloria-run-frame[data-node-id="a"]')!.style.left).toBe('197px');
  });

  it('is cheap to stream: 2,000 updates over 40 nodes stay under two seconds, even in jsdom', () => {
    const many: NodeSpec[] = Array.from({ length: 40 }, (_, i) => ({ id: `n${i}`, position: { x: (i % 8) * 120, y: Math.floor(i / 8) * 90 }, size: { width: 100, height: 60 } }));
    d = createDiagram(container, { nodes: many });
    const statuses = ['pending', 'running', 'completed'] as const;
    const t0 = performance.now();
    for (let k = 0; k < 2000; k++) {
      const nodes: Record<string, { status: (typeof statuses)[number]; badge: string }> = {};
      for (let i = 0; i < 40; i++) nodes[`n${i}`] = { status: statuses[(k + i) % 3]!, badge: `${k}` };
      d.setOverlay({ nodes });
    }
    expect(performance.now() - t0).toBeLessThan(2000); // jsdom; a browser is far faster (gated there)
    expect(container.querySelectorAll('.grafloria-run-frame')).toHaveLength(40);
  });
});
