// Wave 8 (Performance & scale) — Card 6.
//
// The cache is only worth having if it is INVISIBLE. So the load-bearing test
// here is differential: drive a renderer WITH the route memo and a fresh
// renderer WITHOUT any cached state through the same mutations, and demand the
// same geometry out of both, to the point. If the memo ever serves a route the
// world has moved out from under, these tests fail — which is the only thing
// standing between "10x faster" and "10x faster and subtly wrong".
//
// And the mirror of that: a test that the cache actually HITS. A cache that has
// quietly stopped working passes every correctness test in the file and simply
// gets slow, saying nothing while it does it. Both directions, or neither.

import { SVGRenderer } from './svg-renderer';
import { RouteMemo, coalesce, inflate, type Rect } from './route-memo';
import { applyChannelNudges } from './channel-nudging';
import { DiagramEngine, DiagramModel, NodeModel, LinkModel, PortModel } from '@grafloria/engine';
import type { Rectangle } from '../types';

const VIEWPORT: Rectangle = { x: -500, y: -500, width: 3000, height: 2000 };

function addNode(diagram: DiagramModel, id: string, x: number, y: number, w = 120, h = 60): NodeModel {
  const node = new NodeModel({
    type: 'basic',
    position: { x, y },
    size: { width: w, height: h },
  });
  (node as unknown as { id: string }).id = id;
  node.addPort(new PortModel({ id: `${id}-out`, type: 'output', side: 'right' }));
  node.addPort(new PortModel({ id: `${id}-in`, type: 'input', side: 'left' }));
  diagram.addNode(node);
  return node;
}

function addLink(diagram: DiagramModel, id: string, from: string, to: string): LinkModel {
  const link = new LinkModel(`${from}-out`, `${to}-in`, 'orthogonal');
  (link as unknown as { id: string }).id = id;
  diagram.addLink(link);
  return link;
}

/** The routed geometry of every link, as the renderer left it on the model. */
function geometry(diagram: DiagramModel): Record<string, string> {
  const out: Record<string, string> = {};
  for (const link of diagram.getLinks()) {
    out[link.id] = (link.points ?? [])
      .map((p) => `${Math.round(p.x * 100)},${Math.round(p.y * 100)}`)
      .join(' ');
  }
  return out;
}

/**
 * Build the same scene twice: one engine driven through `mutate` step by step
 * (so its renderer's memo is warm and has every chance to serve something
 * stale), and one built fresh, mutated with no renderer attached, and rendered
 * ONCE from cold. Cold is the ground truth.
 */
function differential(
  build: (d: DiagramModel) => void,
  steps: Array<(d: DiagramModel) => void>
): void {
  const warmEngine = new DiagramEngine();
  const warm = warmEngine.createDiagram('warm')!;
  build(warm);
  const warmRenderer = new SVGRenderer(warmEngine, {});
  warmRenderer.render(VIEWPORT, 1); // frame 0 — populates the memo

  const coldEngine = new DiagramEngine();
  const cold = coldEngine.createDiagram('cold')!;
  build(cold);

  const before = geometry(warm);
  const seen: string[] = [];

  try {
    for (let i = 0; i < steps.length; i++) {
      steps[i](warm);
      warmRenderer.render(VIEWPORT, 1);

      // the cold twin replays every step so far, then renders from scratch
      steps[i](cold);
      const coldRenderer = new SVGRenderer(coldEngine, {});
      coldRenderer.render(VIEWPORT, 1);
      const truth = geometry(cold);
      coldRenderer.dispose();

      expect({ step: i, geometry: geometry(warm) }).toEqual({ step: i, geometry: truth });
      seen.push(JSON.stringify(truth));
    }
  } finally {
    warmRenderer.dispose();
    warmEngine.destroy();
    coldEngine.destroy();
  }

  // GUARD AGAINST A VACUOUS PASS. If these mutations never actually moved a
  // route, then "the cached renderer agrees with the cold one" is a statement
  // about nothing, and a completely broken cache would sail through it. Demand
  // that the scenario changed the geometry at least once.
  expect(seen.some((g) => g !== JSON.stringify(before))).toBe(true);
}

describe('RouteMemo (unit)', () => {
  const rect = (x: number, y: number, w = 10, h = 10): Rect => ({ x, y, width: w, height: h });

  it('reports nothing dirty when no rect moved', () => {
    const memo = new RouteMemo();
    const rects = new Map([['a', rect(0, 0)]]);
    memo.beginFrame(rects, '');
    expect(memo.beginFrame(new Map([['a', rect(0, 0)]]), '')).toEqual([]);
  });

  it('reports BOTH the vacated and the occupied rect when a node moves', () => {
    // Only reporting where the node landed would leave links that detoured
    // around where it USED to be stuck on their detour, forever.
    const memo = new RouteMemo();
    memo.beginFrame(new Map([['a', rect(0, 0)]]), '');
    const dirty = memo.beginFrame(new Map([['a', rect(500, 500)]]), '');
    expect(dirty).toHaveLength(2);
    expect(dirty).toContainEqual(rect(0, 0));
    expect(dirty).toContainEqual(rect(500, 500));
  });

  it('reports appearances and disappearances', () => {
    const memo = new RouteMemo();
    memo.beginFrame(new Map([['a', rect(0, 0)]]), '');
    expect(memo.beginFrame(new Map([['a', rect(0, 0)], ['b', rect(9, 9)]]), '')).toEqual([rect(9, 9)]);
    expect(memo.beginFrame(new Map([['a', rect(0, 0)]]), '')).toEqual([rect(9, 9)]);
  });

  it('drops everything when the obstacle epoch changes (a group collapsed)', () => {
    const memo = new RouteMemo();
    memo.beginFrame(new Map([['a', rect(0, 0)]]), '');
    memo.store('l1', 'k', { points: [], totalLength: 0, bendCount: 0, cost: 0 } as never);
    expect(memo.lookup('l1', 'k')).toBeDefined();

    memo.beginFrame(new Map([['a', rect(0, 0)]]), 'g1:collapsed');
    expect(memo.lookup('l1', 'k')).toBeUndefined();
  });

  it('a changed key is a miss (this is how an endpoint move is caught)', () => {
    const memo = new RouteMemo();
    memo.store('l1', 'key-A', { points: [], totalLength: 0, bendCount: 0, cost: 0 } as never);
    expect(memo.lookup('l1', 'key-A')).toBeDefined();
    expect(memo.lookup('l1', 'key-B')).toBeUndefined();
  });

  it('coalesce merges overlapping regions and never shrinks the covered area', () => {
    const merged = coalesce([rect(0, 0, 100, 100), rect(50, 50, 100, 100), rect(900, 900, 10, 10)]);
    expect(merged).toHaveLength(2);
    expect(merged).toContainEqual({ x: 0, y: 0, width: 150, height: 150 });
  });

  it('coalesce collapses to ONE box past the cap (a layout moving every node)', () => {
    const many: Rect[] = [];
    for (let i = 0; i < 200; i++) many.push(rect(i * 1000, 0, 10, 10));
    const merged = coalesce(many, 16);
    expect(merged).toHaveLength(1);
    expect(merged[0].width).toBeGreaterThanOrEqual(199 * 1000);
  });

  it('inflate grows on every side', () => {
    expect(inflate(rect(10, 10, 20, 20), 5)).toEqual({ x: 5, y: 5, width: 30, height: 30 });
  });
});

describe('the invariant the route memo rests on: nothing downstream mutates a cached route', () => {
  // Before this card, every route was thrown away and recomputed each frame, so
  // it did not matter whether the passes that run AFTER routing — channel
  // nudging, parallel fan-out, the edge optimizer — adjusted the route in place
  // or on a copy. It matters now: a cached route that gets nudged IN PLACE is
  // re-nudged from its own output on the next frame, and every frame after, so
  // the link slides a few pixels sideways forever while `routed: 0` is reported
  // the entire time. Nothing else in this suite would see it — the route is
  // "unchanged" by every measure except the picture.
  //
  // So the contract is pinned here, at the seam, rather than left as a property
  // that happens to hold.
  it('applyChannelNudges returns a new array and leaves its input alone', () => {
    const input = Object.freeze([
      Object.freeze({ x: 0, y: 0 }),
      Object.freeze({ x: 100, y: 0 }),
      Object.freeze({ x: 100, y: 100 }),
    ]) as ReadonlyArray<{ x: number; y: number }>;

    const out = applyChannelNudges(input as never, new Map([[0, 12]]));

    expect(out).not.toBe(input); // a copy, not the same array
    expect(out[0]).not.toBe(input[0]); // …and copies of the POINTS, not aliases
    expect(input[0]).toEqual({ x: 0, y: 0 }); // (frozen: an in-place write would have thrown)
    expect(out[0].y).toBe(12); // and it really did apply the nudge
  });
});

describe('incremental routing is invisible (differential vs a cold renderer)', () => {
  // The scene: A —— B with a clear corridor between them, and a loose node C
  // parked well out of the way, which we will later drive INTO the corridor.
  const scene = (d: DiagramModel) => {
    addNode(d, 'A', 0, 0);
    addNode(d, 'B', 600, 0);
    addNode(d, 'C', 250, 600); // far below the A→B corridor
    addNode(d, 'D', 0, 900);
    addLink(d, 'AB', 'A', 'B');
    addLink(d, 'AD', 'A', 'D');
  };

  it('serves identical geometry when an ENDPOINT node moves', () => {
    differential(scene, [
      (d) => d.getNode('B')!.setPosition(600, 200),
      (d) => d.getNode('A')!.setPosition(-50, 40),
      (d) => d.getNode('B')!.setPosition(700, 0),
    ]);
  });

  it('serves identical geometry when a THIRD node moves INTO the corridor', () => {
    // THE case a cache keyed on "did my endpoints move?" gets wrong. Nothing
    // about link AB changes here — not its nodes, not its style, not its ports.
    // Only the world it routes through does.
    differential(scene, [
      (d) => d.getNode('C')!.setPosition(280, 10), // straight across A→B
      (d) => d.getNode('C')!.setPosition(300, -5),
      (d) => d.getNode('C')!.setPosition(250, 600), // ...and back out again
    ]);
  });

  it('serves identical geometry when a third node RESIZES into the corridor', () => {
    // A pure GROWTH: C never moves. It is parked above the A→B corridor and then
    // gets taller until its bottom edge crosses it. Nothing has a new position;
    // the obstacle set still changed.
    differential(scene, [
      (d) => {
        d.getNode('C')!.setPosition(280, -400);
        d.getNode('C')!.setSize(120, 300); // bottom edge at -100: still clear of y≈30
      },
      (d) => d.getNode('C')!.setSize(120, 600), // bottom edge now at 200: across the corridor
      (d) => d.getNode('C')!.setSize(120, 300), // and back out
    ]);
  });

  it('serves identical geometry when a node is ADDED into the corridor, then removed', () => {
    differential(scene, [
      (d) => addNode(d, 'X', 280, 5),
      (d) => d.getNode('X')!.setPosition(300, 20),
      (d) => d.removeNode('X'),
    ]);
  });

  it('serves identical geometry when a LINK is added and removed (bundle lanes shift)', () => {
    differential(scene, [
      (d) => addLink(d, 'AB2', 'A', 'B'), // AB is now a parallel bundle: both links get lanes
      (d) => d.removeLink('AB2'),
    ]);
  });
});

describe('the cache actually caches (a silently-dead cache is just a slow one)', () => {
  let engine: DiagramEngine;
  let diagram: DiagramModel;
  let renderer: SVGRenderer;

  beforeEach(() => {
    engine = new DiagramEngine();
    diagram = engine.createDiagram('perf')!;
    for (let i = 0; i < 20; i++) addNode(diagram, `n${i}`, (i % 5) * 300, Math.floor(i / 5) * 300);
    for (let i = 0; i + 1 < 20; i++) addLink(diagram, `l${i}`, `n${i}`, `n${i + 1}`);
    renderer = new SVGRenderer(engine, {});
  });

  afterEach(() => {
    renderer.dispose();
    engine.destroy();
  });

  it('routes everything on the first frame, and NOTHING on an idle frame', () => {
    renderer.render(VIEWPORT, 1);
    expect(renderer.getRoutingStats().routed).toBeGreaterThan(0);

    renderer.render(VIEWPORT, 1);
    const idle = renderer.getRoutingStats();
    expect(idle.routed).toBe(0);
    expect(idle.reused).toBe(19);
  });

  it('a pan re-routes nothing — the world did not move, the camera did', () => {
    renderer.render(VIEWPORT, 1);
    renderer.render({ ...VIEWPORT, x: VIEWPORT.x + 120 }, 1);
    expect(renderer.getRoutingStats().routed).toBe(0);
  });

  it('an idle frame is IDEMPOTENT — a cached route must never be re-nudged into drift', () => {
    // The hazard: the passes that run AFTER routing (channel nudging, parallel
    // fan-out, the edge optimizer) take the frame's routes and adjust them. They
    // copy before they mutate — today. If one of them ever adjusts a cached route
    // IN PLACE, it would re-apply its own offset to its own output on every
    // subsequent frame, and the links would slide a few pixels further sideways
    // forever, with `routed: 0` reported the whole time. Nothing else in the suite
    // would notice: the routes are "unchanged" by every measure except the picture.
    renderer.render(VIEWPORT, 1);
    const first = geometry(diagram);

    for (let i = 0; i < 6; i++) {
      renderer.render(VIEWPORT, 1);
      expect(geometry(diagram)).toEqual(first);
    }
    expect(renderer.getRoutingStats().routed).toBe(0);
  });

  it('moving ONE node re-routes its own links, not the whole diagram', () => {
    renderer.render(VIEWPORT, 1);
    diagram.getNode('n0')!.setPosition(5, 7);
    renderer.render(VIEWPORT, 1);

    const stats = renderer.getRoutingStats();
    // n0 carries exactly one link (l0). Its neighbourhood may pull in a couple
    // more through the corridor test — that is the POINT of the corridor test —
    // but it must be a handful, not the diagram.
    expect(stats.routed).toBeGreaterThanOrEqual(1);
    expect(stats.routed).toBeLessThan(8);
    expect(stats.reused).toBeGreaterThan(10);
  });
});
