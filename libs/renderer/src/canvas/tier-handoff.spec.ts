// Wave 8 — Card 5: the AUTOMATIC tier handoff, on a live backend.
//
// `tier-policy.spec.ts` argues with the policy. This drives the real thing: does the
// backend actually step down, does it step back up, and — the only questions that could
// make this feature a net harm — does the picture survive the switch with its
// hit-testing, its selection and its accessibility intact?

import { DiagramRenderBackend } from './render-backend';
import { VIEWPORT, buildScene, portOn } from './test-scene';
import { NodeModel } from '@grafloria/engine';

/**
 * Thresholds a host has explicitly measured and opted into.
 *
 * The SHIPPED default never steps down to canvas — `tier-run.mjs` measures the canvas
 * consumer at 8.9x SLOWER than the DOM patcher, so shipping a step-down default would
 * hand every host a regression. These specs drive the MECHANISM, so they supply the
 * numbers a host would.
 */
const TUNED = { canvasAboveElements: 2000, svgBelowElements: 1500, canvasBelowZoom: 0.35, svgAboveZoom: 0.5 };

/** A scene with enough elements to trip the element-count threshold. */
function bigScene(count: number) {
  const scene = buildScene([{ name: 'a', x: 10, y: 10 }], false);
  for (let i = 0; i < count; i++) {
    const node = new NodeModel({
      type: 'basic',
      position: { x: (i % 20) * 30, y: Math.floor(i / 20) * 20 },
      size: { width: 20, height: 12 },
    });
    scene.diagram!.addNode(node);
  }
  return scene;
}

describe('DiagramRenderBackend — automatic tier handoff', () => {
  let host: HTMLElement;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
  });
  afterEach(() => host.remove());

  it('does nothing at all unless the host asks for it (off by default)', () => {
    const scene = bigScene(60);
    const backend = new DiagramRenderBackend(scene.engine, host, { mode: 'svg' });

    backend.render(VIEWPORT, 1);
    backend.render(VIEWPORT, 0.01); // absurdly far out; would trip any threshold

    expect(backend.getMode()).toBe('svg');
    expect(backend.getTierState().auto).toBe(false);
    backend.dispose();
  });

  it('steps DOWN to canvas when the scene gets big, and back UP when it does not', () => {
    const scene = bigScene(60);
    const changes: string[] = [];
    const backend = new DiagramRenderBackend(scene.engine, host, {
      mode: 'svg',
      autoTier: { canvasAboveElements: 40, svgBelowElements: 20 },
      onTierChange: (e) => changes.push(`${e.from}->${e.to}:${e.reason}`),
    });

    // Frame 1 establishes the element count (the decision runs before the producer, so it
    // uses the previous frame's count — on the very first frame there isn't one).
    backend.render(VIEWPORT, 1);
    expect(host.querySelector('svg')).not.toBeNull();

    // Frame 2 sees 61 elements >= 40 and hands off.
    backend.render(VIEWPORT, 1);
    expect(backend.getMode()).toBe('canvas');
    expect(host.querySelector('canvas')).not.toBeNull();
    expect(host.querySelector('svg')).toBeNull();
    expect(changes).toContain('svg->canvas:element-count');

    // Shrink the scene below the lower band and it comes back up to real DOM.
    for (const node of scene.diagram!.getNodes().slice(5)) {
      scene.diagram!.removeNode(node.id);
    }
    backend.render(VIEWPORT, 1);
    backend.render(VIEWPORT, 1);
    expect(backend.getMode()).toBe('svg');
    expect(host.querySelector('svg')).not.toBeNull();

    backend.dispose();
  });

  it('steps down on ZOOM — the far tier is what canvas is for', () => {
    const scene = buildScene([{ name: 'a', x: 100, y: 100 }], false);
    const backend = new DiagramRenderBackend(scene.engine, host, {
      mode: 'svg',
      autoTier: TUNED,
    });

    backend.render(VIEWPORT, 1);
    expect(backend.getMode()).toBe('svg');

    backend.render(VIEWPORT, 0.2); // below canvasBelowZoom (0.35)
    expect(backend.getMode()).toBe('canvas');
    expect(backend.getTierState().reason).toBe('zoom');

    backend.render(VIEWPORT, 1); // back into the interactive tier
    expect(backend.getMode()).toBe('svg');

    backend.dispose();
  });

  // =========================================================================
  // The things that would make this feature a net harm
  // =========================================================================

  it('HIT-TESTING survives the handoff: the same world point picks the same entity', () => {
    const scene = buildScene([{ name: 'a', x: 100, y: 100, width: 120, height: 60 }], false);
    const backend = new DiagramRenderBackend(scene.engine, host, {
      mode: 'svg',
      autoTier: TUNED,
    });

    backend.render(VIEWPORT, 1);
    const inSvg = backend.hitTest(160, 130); // middle of node 'a'
    expect(inSvg?.id).toBe(scene.nodes['a'].id);

    backend.render(VIEWPORT, 0.2); // hand off to canvas
    expect(backend.getMode()).toBe('canvas');

    const inCanvas = backend.hitTest(160, 130);
    expect(inCanvas?.id).toBe(inSvg?.id);
    expect(inCanvas?.kind).toBe(inSvg?.kind);

    backend.dispose();
  });

  it('SELECTION survives the handoff — it lives on the model, not on the backend', () => {
    const scene = buildScene([{ name: 'a', x: 100, y: 100 }], false);
    const backend = new DiagramRenderBackend(scene.engine, host, {
      mode: 'svg',
      autoTier: TUNED,
    });

    scene.nodes['a'].setState({ selected: true });
    backend.render(VIEWPORT, 1);
    const selectedInSvg = host.querySelectorAll('svg [class*="selected"]').length;
    expect(selectedInSvg).toBeGreaterThan(0);

    backend.render(VIEWPORT, 0.2);
    expect(backend.getMode()).toBe('canvas');

    // The model still owns it, and the VNode tree canvas paints still carries it — so
    // coming back up restores the selected picture without the host re-selecting anything.
    expect(scene.nodes['a'].state.selected).toBe(true);
    backend.render(VIEWPORT, 1);
    expect(backend.getMode()).toBe('svg');
    expect(host.querySelectorAll('svg [class*="selected"]').length).toBe(selectedInSvg);

    backend.dispose();
  });

  it('REFUSES to hand a screen-reader user a canvas, however big the scene gets', () => {
    const scene = bigScene(60);

    // The wave-6 outline view marks its hidden AT mirror with this attribute. Its mere
    // presence means somebody is reading this diagram with assistive technology.
    const outline = document.createElement('div');
    outline.setAttribute('data-grafloria-outline', '');
    host.appendChild(outline);

    const inner = document.createElement('div');
    host.appendChild(inner);

    const backend = new DiagramRenderBackend(scene.engine, inner, {
      mode: 'svg',
      autoTier: { canvasAboveElements: 10, svgBelowElements: 5 },
    });

    backend.render(VIEWPORT, 1);
    backend.render(VIEWPORT, 0.01); // every perf signal screaming "canvas"

    expect(backend.getMode()).toBe('svg');
    expect(backend.getTierState().reason).toBe('a11y-pinned');
    expect(inner.querySelector('svg')).not.toBeNull();

    backend.dispose();
  });

  it('setAccessibilityActive() pulls a diagram back to SVG immediately, not next frame', () => {
    const scene = bigScene(60);
    const backend = new DiagramRenderBackend(scene.engine, host, {
      mode: 'svg',
      autoTier: { canvasAboveElements: 10, svgBelowElements: 5 },
    });

    backend.render(VIEWPORT, 1);
    backend.render(VIEWPORT, 1);
    expect(backend.getMode()).toBe('canvas');

    // A screen reader arrives mid-session. Waiting for the next frame to give them their
    // semantics back is not good enough.
    backend.setAccessibilityActive(true);
    expect(backend.getMode()).toBe('svg');
    expect(backend.getTierState().reason).toBe('a11y-pinned');

    backend.dispose();
  });

  it('will not step down while an HTML node is on screen (canvas cannot paint one)', () => {
    const scene = bigScene(60);
    // An HTML/foreignObject node. Canvas cannot rasterise DOM: stepping down would make
    // this node silently stop existing.
    scene.nodes['a'].setMetadata('html', { content: '<b>hello</b>' });

    const backend = new DiagramRenderBackend(scene.engine, host, {
      mode: 'svg',
      autoTier: { canvasAboveElements: 10, svgBelowElements: 5 },
    });

    backend.render(VIEWPORT, 1);
    backend.render(VIEWPORT, 0.01);

    expect(backend.getMode()).toBe('svg');
    expect(backend.getTierState().reason).toBe('foreign-object');

    backend.dispose();
  });

  it('pinMode() overrides the policy in both directions', () => {
    const scene = buildScene([{ name: 'a', x: 100, y: 100 }], false);
    const backend = new DiagramRenderBackend(scene.engine, host, {
      mode: 'svg',
      autoTier: TUNED,
    });

    backend.pinMode('canvas');
    expect(backend.getMode()).toBe('canvas');

    backend.render(VIEWPORT, 1); // would otherwise be firmly in the SVG tier
    expect(backend.getMode()).toBe('canvas');
    expect(backend.getTierState().reason).toBe('pinned');

    backend.pinMode(null); // hand control back to the policy
    backend.render(VIEWPORT, 1);
    expect(backend.getMode()).toBe('svg');

    backend.dispose();
  });
});
