// The runtime backend switch, on a LIVE diagram.
//
// The property that matters is not "canvas draws something" — it is that the two
// backends are two views of ONE scene. So: the same producer, the same VNode
// tree, the same hit answers, across a switch, with no re-layout and no rebuilt
// model.

import { DiagramRenderBackend } from './render-backend';
import { VIEWPORT, buildScene } from './test-scene';

describe('DiagramRenderBackend — SVG ⇄ Canvas on a live diagram', () => {
  let host: HTMLElement;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(() => host.remove());

  it('mounts an <svg> in SVG mode and a <canvas> in Canvas mode', () => {
    const scene = buildScene([{ name: 'a', x: 100, y: 100 }], false);
    const backend = new DiagramRenderBackend(scene.engine, host, { mode: 'svg' });

    backend.render(VIEWPORT, 1);
    expect(host.querySelector('svg')).not.toBeNull();
    expect(host.querySelector('canvas')).toBeNull();
    // the SVG tree really was reconciled into the DOM
    expect(host.querySelectorAll('svg .node-group').length).toBe(1);

    backend.setMode('canvas');
    expect(host.querySelector('svg')).toBeNull();
    expect(host.querySelector('canvas')).not.toBeNull();

    backend.setMode('svg');
    expect(host.querySelector('svg')).not.toBeNull();
    expect(host.querySelector('canvas')).toBeNull();

    backend.dispose();
  });

  it('SHARES one VNode producer across the switch — no second scene, no re-layout', () => {
    const scene = buildScene([{ name: 'a', x: 100, y: 100 }], false);
    const backend = new DiagramRenderBackend(scene.engine, host, { mode: 'svg' });

    const producer = backend.getProducer();
    backend.render(VIEWPORT, 1);

    backend.setMode('canvas');

    // The very same producer object drives the canvas backend.
    expect(backend.getProducer()).toBe(producer);
    expect((backend.getRenderer() as { getProducer?: () => unknown }).getProducer?.()).toBe(
      producer
    );

    backend.dispose();
  });

  it('renders the SAME VNode tree in both modes', () => {
    const scene = buildScene([
      { name: 'a', x: 100, y: 100, label: 'Alpha' },
      { name: 'b', x: 400, y: 300, shape: 'diamond' },
    ]);

    const backend = new DiagramRenderBackend(scene.engine, host, { mode: 'svg' });
    const svgTree = backend.render(VIEWPORT, 1);

    backend.setMode('canvas');
    const canvasTree = backend.render(VIEWPORT, 1);

    // Structurally identical: same layers, same entity keys, same shapes. The
    // canvas backend does not get a private "canvas-friendly" tree — if it did,
    // parity would be a hope rather than a property.
    expect(summarise(canvasTree)).toEqual(summarise(svgTree));

    backend.dispose();
  });

  it('gives the same hit answer in both modes, at the same world point', () => {
    const scene = buildScene([
      { name: 'a', x: 100, y: 100, width: 160, height: 100, shape: 'diamond' },
      { name: 'b', x: 450, y: 320, width: 160, height: 100 },
    ]);

    const backend = new DiagramRenderBackend(scene.engine, host, { mode: 'svg' });
    backend.render(VIEWPORT, 1);

    const probes: Array<[number, number]> = [
      [180, 150], // inside the diamond
      [110, 110], // inside the diamond's BBOX but outside the shape
      [530, 370], // inside node b
      [700, 550], // empty space
      [300, 250], // near the link
    ];

    const svgPicks = probes.map(([x, y]) => backend.hitTest(x, y));

    backend.setMode('canvas');
    backend.render(VIEWPORT, 1);
    const canvasPicks = probes.map(([x, y]) => backend.hitTest(x, y));

    expect(canvasPicks.map(idOf)).toEqual(svgPicks.map(idOf));
    // ...and the sweep is meaningful: it really did hit and miss things.
    expect(svgPicks.filter(Boolean).length).toBeGreaterThan(1);
    expect(svgPicks.filter((p) => p === null).length).toBeGreaterThan(0);

    backend.dispose();
  });

  it('switching mid-flight repaints immediately (no blank canvas until the next pan)', () => {
    const scene = buildScene([{ name: 'a', x: 100, y: 100 }], false);
    const backend = new DiagramRenderBackend(scene.engine, host, { mode: 'svg' });
    backend.render(VIEWPORT, 1);

    backend.setMode('canvas');

    // The canvas has already been sized and painted by setMode itself.
    const canvas = host.querySelector('canvas') as HTMLCanvasElement;
    expect(canvas.width).toBeGreaterThan(0);
    expect(backend.hitTest(150, 130)).toMatchObject({ kind: 'node' });

    backend.dispose();
  });

  it('a theme swap survives the switch', () => {
    const scene = buildScene([{ name: 'a', x: 100, y: 100 }], false);
    const backend = new DiagramRenderBackend(scene.engine, host, { mode: 'canvas' });
    backend.render(VIEWPORT, 1);

    expect(() => {
      backend.setTheme({ ...backend.getProducer().getTheme(), name: 'custom' });
      backend.render(VIEWPORT, 1);
      backend.setMode('svg');
      backend.render(VIEWPORT, 1);
    }).not.toThrow();

    backend.dispose();
  });

  it('setMode to the current mode is a no-op', () => {
    const scene = buildScene([{ name: 'a', x: 0, y: 0 }], false);
    const backend = new DiagramRenderBackend(scene.engine, host, { mode: 'svg' });
    const svg = host.querySelector('svg');

    backend.setMode('svg');
    expect(host.querySelector('svg')).toBe(svg); // same element, not remounted

    backend.dispose();
  });

  it('disposes cleanly from either mode', () => {
    const scene = buildScene([{ name: 'a', x: 0, y: 0 }], false);
    const backend = new DiagramRenderBackend(scene.engine, host, { mode: 'canvas' });
    backend.render(VIEWPORT, 1);

    backend.dispose();
    backend.dispose();

    expect(host.children).toHaveLength(0);
  });
});

/** Structure of a tree, ignoring object identity: types + keys, depth-first. */
function summarise(vnode: { type: string; key?: string; children?: any[] }): unknown {
  return {
    type: vnode.type,
    key: vnode.key,
    children: (vnode.children ?? []).map(summarise),
  };
}

function idOf(pick: { kind: string; id: string } | null): string {
  return pick ? `${pick.kind}:${pick.id}` : 'none';
}
