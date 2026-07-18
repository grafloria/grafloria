// Motion-stable routing — edges must not FLIP SHAPE mid-animation.
//
// THE JANK THIS KILLS, measured on demos/nodes/node-position-animation.html:
// while eight nodes tween between layouts at a healthy 60fps, the straight-router
// links snapped between three different shape classes — direct cubic (`M…C`),
// multi-bend detour spline (`M C C C C C`) and rounded-orthogonal (`M L Q L Q`) —
// 17 class flips and 22 discontinuity events in one 900ms tween, the worst a
// 327px path jump in a frame whose nodes moved 21px. Every flip came from
// `computeAutoRoute`'s crossing-detour (and own-node penetration retry) re-deciding
// from scratch each frame while node bodies swept through link chords.
//
// THE CONTRACT. A node observed moving in two consecutive painted frames is IN
// MOTION (a tween or a drag — a one-off programmatic `setPosition` is not).
// While a link's endpoints are in motion, and while only in-motion THIRD-PARTY
// nodes cross its chord, the straight router keeps the plain chord — exactly the
// React Flow behaviour every per-frame animation is written against. The proper
// obstacle-dodging route comes back on the SETTLE frame after motion stops, and
// the renderer bumps its invalidation epoch (microtask) so the host's idle-skip
// cannot drop that settle repaint — the same seam the async route solver uses.
//
// Routes computed under suppression are VOLATILE: never stored in the route memo.
// Caching one would let the settle frame serve the suppressed chord straight back
// (same endpoints ⇒ same key) and the final detour would never appear.

import { DiagramEngine, DiagramModel, NodeModel, LinkModel, PortModel } from '@grafloria/engine';
import { SVGRenderer } from './svg-renderer';
import { MotionTracker } from './motion-tracker';
import { createDiagram } from '../instance/create-diagram';
import type { VNode } from '../types';

const VIEWPORT = { x: 0, y: 0, width: 900, height: 700 };

interface Scene {
  engine: DiagramEngine;
  diagram: DiagramModel;
  renderer: SVGRenderer;
  a: NodeModel;
  b: NodeModel;
  c: NodeModel;
}

/** A → B smooth link (straight router + curve post-processing), C a free blocker. */
function scene(cPos: { x: number; y: number }): Scene {
  const engine = new DiagramEngine();
  const diagram = engine.createDiagram('motion-stable')!;

  const mk = (id: string, x: number, y: number, w = 60, h = 40): NodeModel => {
    const node = new NodeModel({ type: 'basic', position: { x, y }, size: { width: w, height: h } });
    (node as unknown as { id: string }).id = id;
    node.addPort(new PortModel({ id: `${id}-out`, type: 'output', side: 'right' }));
    node.addPort(new PortModel({ id: `${id}-in`, type: 'input', side: 'left' }));
    diagram.addNode(node);
    return node;
  };

  const a = mk('a', 0, 50);
  const b = mk('b', 300, 50);
  const c = mk('c', cPos.x, cPos.y, 120, 140);

  const link = new LinkModel('a-out', 'b-in', 'smooth');
  (link as unknown as { id: string }).id = 'ab';
  diagram.addLink(link);

  return { engine, diagram, renderer: new SVGRenderer(engine, {}), a, b, c };
}

/** The `d` of link `ab` in a freshly rendered frame. */
function linkD(renderer: SVGRenderer): string {
  const root = renderer.render(VIEWPORT, 1) as VNode;
  const find = (v: VNode | null): VNode | null => {
    if (!v) return null;
    if (v.key === 'link-ab') return v;
    for (const child of v.children ?? []) {
      const hit = find(child as VNode);
      if (hit) return hit;
    }
    return null;
  };
  const group = find(root);
  const path = (group?.children ?? []).find(
    (ch) => (ch as VNode).type === 'path' && String((ch as VNode).props?.className ?? '').includes('diagram-link')
  ) as VNode | undefined;
  return String(path?.props?.d ?? '');
}

/** Count the drawn curve/line commands after the initial M. */
function segments(d: string): number {
  return (d.match(/[CLQ]/g) ?? []).length;
}

/** A plain chord drawn smooth is exactly ONE cubic. */
function isChord(d: string): boolean {
  return segments(d) === 1 && d.includes('C');
}

const flushMicrotasks = (): Promise<void> => Promise.resolve();

describe('MotionTracker — two-consecutive-frames motion detection', () => {
  const rect = (x: number, y: number) => ({ x, y, width: 10, height: 10 });

  it('a single move is NOT motion; two consecutive moves are; stopping clears it', () => {
    const t = new MotionTracker();
    t.beginFrame(new Map([['n', rect(0, 0)]]));
    expect(t.isInMotion('n')).toBe(false);

    t.beginFrame(new Map([['n', rect(5, 0)]])); // moved once
    expect(t.isInMotion('n')).toBe(false);

    t.beginFrame(new Map([['n', rect(10, 0)]])); // moved twice in a row
    expect(t.isInMotion('n')).toBe(true);
    expect(t.hasMotion).toBe(true);

    t.beginFrame(new Map([['n', rect(10, 0)]])); // held still
    expect(t.isInMotion('n')).toBe(false);
    expect(t.hasMotion).toBe(false);
  });

  it('appearing and vanishing nodes are not motion', () => {
    const t = new MotionTracker();
    t.beginFrame(new Map());
    t.beginFrame(new Map([['n', rect(0, 0)]])); // appeared
    expect(t.isInMotion('n')).toBe(false);
    t.beginFrame(new Map()); // vanished
    expect(t.hasMotion).toBe(false);
  });
});

describe('SVGRenderer — motion-stable straight routes', () => {
  it('BASELINE: a blocker sitting on the chord of a SETTLED link still forces a detour', () => {
    // C squarely on the A→B chord (y≈70), nothing moving: classic behaviour holds.
    const s = scene({ x: 120, y: 0 });
    linkD(s.renderer); // warm frame
    const d = linkD(s.renderer);
    expect(segments(d)).toBeGreaterThan(1);
    s.renderer.dispose();
  });

  it('BASELINE: a one-frame programmatic jump onto a blocker still detours immediately', () => {
    // C below the chord; A and B jump down ONCE so the chord crosses C. A single
    // jump is not "motion" — the detour must appear in that very frame.
    const s = scene({ x: 120, y: 200 });
    linkD(s.renderer);
    expect(isChord(linkD(s.renderer))).toBe(true);

    s.a.setPosition(0, 250);
    s.b.setPosition(300, 250);
    const d = linkD(s.renderer);
    expect(segments(d)).toBeGreaterThan(1);
    s.renderer.dispose();
  });

  it('endpoints IN MOTION keep the plain chord even while it crosses a blocker', () => {
    const s = scene({ x: 120, y: 200 });
    linkD(s.renderer); // settle the tracker on the start layout
    // frame 1 of the tween: small move, no crossing yet (streak = 1)
    s.a.setPosition(0, 150);
    s.b.setPosition(300, 150);
    expect(isChord(linkD(s.renderer))).toBe(true);
    // frame 2: still moving (streak = 2 → IN MOTION), chord now crosses C
    s.a.setPosition(0, 250);
    s.b.setPosition(300, 250);
    const mid = linkD(s.renderer);
    expect(isChord(mid)).toBe(true); // ← the fix: no shape flip mid-motion
    s.renderer.dispose();
  });

  it('the SETTLE frame after motion stops restores the proper detour and bumps the invalidation epoch', async () => {
    const s = scene({ x: 120, y: 200 });
    linkD(s.renderer);
    s.a.setPosition(0, 150);
    s.b.setPosition(300, 150);
    linkD(s.renderer);
    s.a.setPosition(0, 250);
    s.b.setPosition(300, 250);
    const epochBefore = s.renderer.getInvalidationEpoch();
    expect(isChord(linkD(s.renderer))).toBe(true); // suppressed mid-motion

    // The renderer must tell the HOST a settle repaint is owed — via the same
    // invalidation-epoch seam the async solver uses — on a microtask, i.e. after
    // the paint that stamped the host's lastRendererEpoch.
    await flushMicrotasks();
    expect(s.renderer.getInvalidationEpoch()).toBeGreaterThan(epochBefore);

    // No movement this frame → motion cleared → the real route comes back.
    const settled = linkD(s.renderer);
    expect(segments(settled)).toBeGreaterThan(1);
    s.renderer.dispose();
  });

  it('a THIRD-PARTY node tweening across a static link does not flip it, and the settle detour is not served from a stale cache', async () => {
    const s = scene({ x: 120, y: 400 }); // C far below, chord clear
    linkD(s.renderer);
    expect(isChord(linkD(s.renderer))).toBe(true);

    // Tween C upward across the chord (y≈70) over consecutive frames.
    s.c.setPosition(120, 250);
    linkD(s.renderer); // streak 1
    s.c.setPosition(120, 100);
    expect(isChord(linkD(s.renderer))).toBe(true); // in motion, overlapping — no flip
    s.c.setPosition(120, 10);
    expect(isChord(linkD(s.renderer))).toBe(true); // still crossing, still no flip

    // C STOPS on the chord. The suppressed chord must not have been cached under
    // the link's (unchanged) route key — the settle frame must recompute and detour.
    await flushMicrotasks();
    const settled = linkD(s.renderer);
    expect(segments(settled)).toBeGreaterThan(1);
    s.renderer.dispose();
  });
});

describe('createDiagram — the settle repaint reaches the HOST scheduler', () => {
  // The unit tests above call render() by hand, so they cannot catch the wiring
  // failure the live probe caught: after a tween's LAST renderNow() nothing is
  // queued (flush cancels the pending frame; syncLinkPoints emits no event), so
  // a suppressed route stayed suppressed ON SCREEN forever. The settle path must
  // therefore both bump the invalidation epoch (so canSkipFrame lets the frame
  // through) AND request a frame — via `onRoutesRefined`, the same host channel
  // the async route solver's refinements use. This test drives the REAL instance
  // and asserts the painted DOM heals itself with no further host writes.
  it('a suppressed detour paints ITSELF once motion stops — no further host writes', async () => {
    const container = document.createElement('div');
    container.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 900, height: 700, right: 900, bottom: 700, x: 0, y: 0, toJSON() { return {}; } }) as DOMRect;
    document.body.appendChild(container);

    const inst = createDiagram(container, {
      nodes: [
        { id: 'a', position: { x: 0, y: 50 }, size: { width: 60, height: 40 } },
        { id: 'b', position: { x: 300, y: 50 }, size: { width: 60, height: 40 } },
        { id: 'c', position: { x: 120, y: 400 }, size: { width: 120, height: 140 } },
      ],
      edges: [{ id: 'ab', source: 'a', target: 'b', type: 'smooth' }],
    });

    const dOf = (): string =>
      container.querySelector('[data-link-id="ab"] path.diagram-link')?.getAttribute('d') ?? '';

    expect(segments(dOf())).toBe(1); // plain chord at rest

    // A tween: consecutive painted frames marching C onto the chord (y≈70),
    // exactly as the node-position-animation demo drives its layout morph.
    for (const y of [300, 150, 60, 10]) {
      inst.batchUpdate((m) => m.getNode('c')!.setPosition(120, y));
      inst.renderNow();
    }
    expect(segments(dOf())).toBe(1); // C is IN MOTION → no shape flip painted

    // Stop writing entirely. The settle repaint must arrive by itself.
    await new Promise((r) => setTimeout(r, 120));
    expect(segments(dOf())).toBeGreaterThan(1);

    inst.dispose();
    container.remove();
  });
});
