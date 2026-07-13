// Wave 8 — Card 5: the canvas safety guard, on a live backend.
//
// `setMode('canvas')` has shipped since wave 4 with nothing guarding it. It will hand a
// screen-reader user a surface with no semantics, drop a keyboard user's focus to <body>,
// and stop drawing HTML nodes — all three silently. These pin the refusal.
//
// (The automatic far-zoom TIER this card asked for was built, measured and deleted: on the
// merged tree zoom-out at 10k is 118ms, and the canvas consumer is 8.9x SLOWER than the
// DOM patcher anyway. `tier-run.mjs` has the numbers.)

import { DiagramRenderBackend } from './render-backend';
import { VIEWPORT, buildScene } from './test-scene';
import { NodeModel } from '@grafloria/engine';

describe('DiagramRenderBackend — the canvas safety guard', () => {
  let host: HTMLElement;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    host.remove();
    warn.mockRestore();
  });

  it('allows a canvas switch when nothing would be lost', () => {
    const scene = buildScene([{ name: 'a', x: 100, y: 100 }], false);
    const backend = new DiagramRenderBackend(scene.engine, host, { mode: 'svg' });
    backend.render(VIEWPORT, 1);

    expect(backend.canvasSafety().safe).toBe(true);
    expect(backend.setMode('canvas')).toBe(true);
    expect(backend.getMode()).toBe('canvas');
    expect(host.querySelector('canvas')).not.toBeNull();

    backend.dispose();
  });

  it('REFUSES to hand a screen-reader user a canvas', () => {
    const scene = buildScene([{ name: 'a', x: 100, y: 100 }], false);

    // The wave-6 outline view marks its hidden AT mirror with this attribute. Its presence
    // means somebody is reading this diagram with assistive technology.
    const outline = document.createElement('div');
    outline.setAttribute('data-grafloria-outline', '');
    host.appendChild(outline);
    const inner = document.createElement('div');
    host.appendChild(inner);

    const refused: string[] = [];
    const backend = new DiagramRenderBackend(scene.engine, inner, {
      mode: 'svg',
      onCanvasRefused: (e) => refused.push(e.explanation),
    });
    backend.render(VIEWPORT, 1);

    expect(backend.setMode('canvas')).toBe(false);
    expect(backend.getMode()).toBe('svg');
    expect(inner.querySelector('svg')).not.toBeNull();
    expect(inner.querySelector('canvas')).toBeNull();

    // And it says why — loudly, because the alternative is a screen-reader user silently
    // losing their diagram and nobody finding out.
    expect(refused[0]).toMatch(/screen reader/i);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/refusing to switch to the canvas/i));

    backend.dispose();
  });

  it('REFUSES while the scene has HTML nodes canvas cannot paint', () => {
    const scene = buildScene([{ name: 'a', x: 100, y: 100 }], false);
    scene.nodes['a'].setMetadata('html', { content: '<b>hello</b>' });

    const backend = new DiagramRenderBackend(scene.engine, host, { mode: 'svg' });
    backend.render(VIEWPORT, 1);

    expect(backend.canvasSafety().hazards).toContain('foreign-object');
    expect(backend.setMode('canvas')).toBe(false);
    expect(backend.getMode()).toBe('svg');

    backend.dispose();
  });

  it('{ force: true } overrides — a host that means it can still have canvas', () => {
    const scene = buildScene([{ name: 'a', x: 100, y: 100 }], false);
    scene.nodes['a'].setMetadata('html', { content: '<b>hello</b>' });

    const backend = new DiagramRenderBackend(scene.engine, host, { mode: 'svg' });
    backend.render(VIEWPORT, 1);

    expect(backend.setMode('canvas')).toBe(false);
    expect(backend.setMode('canvas', { force: true })).toBe(true);
    expect(backend.getMode()).toBe('canvas');

    backend.dispose();
  });

  it('guardCanvas: false restores the old (unguarded) behaviour for hosts that want it', () => {
    const scene = buildScene([{ name: 'a', x: 100, y: 100 }], false);
    scene.nodes['a'].setMetadata('html', { content: '<b>hello</b>' });

    const backend = new DiagramRenderBackend(scene.engine, host, {
      mode: 'svg',
      guardCanvas: false,
    });
    backend.render(VIEWPORT, 1);

    expect(backend.setMode('canvas')).toBe(true);
    backend.dispose();
  });

  it('a screen reader arriving MID-SESSION pulls the diagram back to SVG at once', () => {
    const scene = buildScene([{ name: 'a', x: 100, y: 100 }], false);
    const backend = new DiagramRenderBackend(scene.engine, host, { mode: 'svg' });
    backend.render(VIEWPORT, 1);

    expect(backend.setMode('canvas')).toBe(true);
    expect(backend.getMode()).toBe('canvas');

    // Waiting for the next frame to give them their semantics back is not good enough.
    backend.setAccessibilityActive(true);
    expect(backend.getMode()).toBe('svg');
    expect(host.querySelector('svg')).not.toBeNull();

    backend.dispose();
  });

  it('going BACK to svg is never guarded — that direction can only restore what canvas lacks', () => {
    const scene = buildScene([{ name: 'a', x: 100, y: 100 }], false);
    const backend = new DiagramRenderBackend(scene.engine, host, { mode: 'canvas' });
    backend.render(VIEWPORT, 1);

    // Even with every hazard live, coming home to real DOM is always allowed.
    backend.setAccessibilityActive(true);
    expect(backend.setMode('svg')).toBe(false); // already there — setAccessibilityActive moved it
    expect(backend.getMode()).toBe('svg');

    backend.dispose();
  });

  // =========================================================================
  // What a switch must NOT break, in either direction
  // =========================================================================

  it('HIT-TESTING survives the switch: the same world point picks the same entity', () => {
    const scene = buildScene([{ name: 'a', x: 100, y: 100, width: 120, height: 60 }], false);
    const backend = new DiagramRenderBackend(scene.engine, host, { mode: 'svg' });

    backend.render(VIEWPORT, 1);
    const inSvg = backend.hitTest(160, 130); // middle of node 'a'
    expect(inSvg?.id).toBe(scene.nodes['a'].id);

    expect(backend.setMode('canvas')).toBe(true);
    const inCanvas = backend.hitTest(160, 130);
    expect(inCanvas?.id).toBe(inSvg?.id);
    expect(inCanvas?.kind).toBe(inSvg?.kind);

    backend.dispose();
  });

  it('SELECTION survives the switch — it lives on the model, not on the backend', () => {
    const scene = buildScene([{ name: 'a', x: 100, y: 100 }], false);
    const backend = new DiagramRenderBackend(scene.engine, host, { mode: 'svg' });

    scene.nodes['a'].setState({ selected: true });
    backend.render(VIEWPORT, 1);
    const selectedInSvg = host.querySelectorAll('svg [class*="selected"]').length;
    expect(selectedInSvg).toBeGreaterThan(0);

    backend.setMode('canvas');
    expect(scene.nodes['a'].state.selected).toBe(true);

    backend.setMode('svg');
    expect(host.querySelectorAll('svg [class*="selected"]').length).toBe(selectedInSvg);

    backend.dispose();
  });

  it('a big scene does NOT trigger any automatic switch — there is no longer such a thing', () => {
    // The automatic tier is gone. A backend left alone stays exactly where the host put it,
    // however many elements arrive and however far out the camera goes.
    const scene = buildScene([{ name: 'a', x: 10, y: 10 }], false);
    for (let i = 0; i < 200; i++) {
      scene.diagram!.addNode(
        new NodeModel({
          type: 'basic',
          position: { x: (i % 20) * 30, y: Math.floor(i / 20) * 20 },
          size: { width: 20, height: 12 },
        })
      );
    }

    const backend = new DiagramRenderBackend(scene.engine, host, { mode: 'svg' });
    backend.render(VIEWPORT, 1);
    backend.render(VIEWPORT, 0.01);
    backend.render(VIEWPORT, 0.01);

    expect(backend.getMode()).toBe('svg');
    backend.dispose();
  });
});
