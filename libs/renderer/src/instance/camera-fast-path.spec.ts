// Camera fast path — the INSTANCE's half.
//
// The contract under test: a frame in which ONLY the camera moved, and whose
// new viewBox stays inside the last frame's coverage, repaints by rewriting the
// `viewBox` attribute and the HTML layer transform — renderer.render() is NOT
// called. And every escalation out of the fast path — camera leaving coverage,
// a model mutation in the same tick, a zoom change, renderNow() — falls back to
// the full paint. The fallbacks matter more than the fast path: their failure
// mode is a stale or holed picture, the classic sin of every camera shortcut.

import { createDiagram } from './create-diagram';
import type { DiagramInstance } from './create-diagram';
import { SVGRenderer } from '../svg/svg-renderer';
import type { NodeSpec } from './model-input';

const WIDTH = 800;
const HEIGHT = 600;

function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: WIDTH, height: HEIGHT, right: WIDTH, bottom: HEIGHT }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

/** Both admitted at the mount viewport, no optional layers ⇒ coverage is TOTAL. */
const NEAR_NODES: NodeSpec[] = [
  { id: 'a', position: { x: 100, y: 100 }, size: { width: 120, height: 60 }, label: 'A' },
  { id: 'b', position: { x: 400, y: 100 }, size: { width: 120, height: 60 }, label: 'B' },
];

/** The far node is culled at the mount viewport ⇒ coverage is NOT total. */
const SPARSE_NODES: NodeSpec[] = [
  { id: 'a', position: { x: 100, y: 100 }, size: { width: 120, height: 60 }, label: 'A' },
  { id: 'far', position: { x: 50000, y: 50000 }, size: { width: 120, height: 60 }, label: 'F' },
];

/** Await one scheduler frame (rAF where jsdom has it, its setTimeout shim otherwise). */
function frame(): Promise<void> {
  return new Promise((resolve) => {
    const raf =
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame
        : (cb: FrameRequestCallback) => setTimeout(() => cb(0), 16) as unknown as number;
    raf(() => resolve());
  });
}

describe('createDiagram — camera fast path', () => {
  let container: HTMLElement;
  let diagram: DiagramInstance | undefined;
  let renderSpy: jest.SpyInstance;

  beforeEach(() => {
    container = makeContainer();
    renderSpy = jest.spyOn(SVGRenderer.prototype, 'render');
  });

  afterEach(() => {
    renderSpy.mockRestore();
    diagram?.dispose();
    diagram = undefined;
    container.remove();
  });

  const svg = (): SVGElement => container.querySelector('svg')!;

  it('pans inside the overscan margin WITHOUT calling render()', async () => {
    diagram = createDiagram(container, { nodes: SPARSE_NODES });
    const paints = renderSpy.mock.calls.length;

    // 100 world units right — well inside the 25%-per-side overscan (200 units).
    diagram.viewport.pan(100, 0);
    await frame();
    await frame();

    expect(renderSpy.mock.calls.length).toBe(paints);
    expect(svg().getAttribute('viewBox')).toBe('100 0 800 600');
  });

  it('keeps the HTML layer registered with the SVG on a fast-path frame', async () => {
    diagram = createDiagram(container, { nodes: SPARSE_NODES });

    diagram.viewport.pan(150, 50);
    await frame();
    await frame();

    const html = container.querySelector('.grafloria-html-layer')!;
    expect(html.getAttribute('style')).toContain('translate(-150px, -50px) scale(1)');
  });

  it('falls back to a FULL render when the camera exits coverage', async () => {
    diagram = createDiagram(container, { nodes: SPARSE_NODES });
    const paints = renderSpy.mock.calls.length;

    // 2000 units — far beyond the 200-unit margin. Must re-render, not reveal a hole.
    diagram.viewport.pan(2000, 0);
    await frame();
    await frame();

    expect(renderSpy.mock.calls.length).toBeGreaterThan(paints);
    expect(svg().getAttribute('viewBox')).toBe('2000 0 800 600');
  });

  it('TOTAL coverage pans any distance for free — the whole scene is already drawn', async () => {
    diagram = createDiagram(container, { nodes: NEAR_NODES });
    const paints = renderSpy.mock.calls.length;

    diagram.viewport.pan(5000, 3000);
    await frame();
    await frame();

    expect(renderSpy.mock.calls.length).toBe(paints);
    expect(svg().getAttribute('viewBox')).toBe('5000 3000 800 600');
    // The picture is intact — nothing was unmounted to pay for the pan.
    expect(svg().querySelector('[data-vnode-key="node-a"]')).toBeTruthy();
    expect(svg().querySelector('[data-vnode-key="node-b"]')).toBeTruthy();
  });

  it('a model mutation in the same tick escalates to a full render', async () => {
    diagram = createDiagram(container, { nodes: SPARSE_NODES });
    const paints = renderSpy.mock.calls.length;

    diagram.viewport.pan(50, 0);
    diagram.getModel().getNodes()[0].setPosition(140, 140);
    await frame();
    await frame();

    expect(renderSpy.mock.calls.length).toBeGreaterThan(paints);
  });

  it('a zoom change escalates to a full render — LOD tiers are chosen per zoom', async () => {
    diagram = createDiagram(container, { nodes: SPARSE_NODES });
    const paints = renderSpy.mock.calls.length;

    diagram.viewport.setZoom(2);
    await frame();
    await frame();

    expect(renderSpy.mock.calls.length).toBeGreaterThan(paints);
  });

  it('renderNow() always reconciles for real — the measure-now escape hatch survives', async () => {
    diagram = createDiagram(container, { nodes: SPARSE_NODES });

    diagram.viewport.pan(10, 0);
    const paints = renderSpy.mock.calls.length;
    diagram.renderNow();

    expect(renderSpy.mock.calls.length).toBeGreaterThan(paints);
    expect(svg().getAttribute('viewBox')).toBe('10 0 800 600');
  });

  it('a full render after fast-path frames paints the arrived-at viewport correctly', async () => {
    diagram = createDiagram(container, { nodes: SPARSE_NODES });

    // Ride the fast path to the edge of coverage, then force a real frame there.
    diagram.viewport.pan(150, 0);
    await frame();
    await frame();
    diagram.renderNow();

    expect(svg().getAttribute('viewBox')).toBe('150 0 800 600');
    expect(svg().querySelector('[data-vnode-key="node-a"]')).toBeTruthy();
  });
});
