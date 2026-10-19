// Wave 8 — the seam between Card 4 (LOD routing gate) and Card 6 (route memo).
//
// These two changes were built by different hands, on different branches, against
// different trees, and each is correct on its own:
//
//   • Card 4 says: below zoom 0.5 do not run A*, draw a straight line — at that
//     tier the dodge around a node body is sub-pixel.
//   • Card 6 says: a route whose inputs have not changed does not need recomputing.
//
// Composed naively they produce a bug that NEITHER branch's tests could have
// caught, because neither branch had the other's code: the memo keys a route on
// its inputs — endpoints, router, path type, separation — and a link routed
// COARSE at zoom 0.3 has exactly the same inputs as the same link routed with A*
// at zoom 0.6. Same key. So zoom out, zoom back in, and the memo serves you the
// far-zoom straight line at full detail — permanently, silently, and only for
// users who happened to zoom out first.
//
// The fix is one field in the key. This file is the reason it can never be
// dropped again. (The differential suite in route-memo.spec.ts renders every
// scenario at zoom 1, so the whole class of tier-crossing staleness is invisible
// to it by construction — that is exactly how the bug survived to the merge.)

import { SVGRenderer } from './svg-renderer';
import { DiagramEngine, DiagramModel, NodeModel, LinkModel, PortModel } from '@grafloria/engine';
import type { Rectangle } from '../types';

const VIEWPORT: Rectangle = { x: -200, y: -200, width: 1600, height: 1200 };

/**
 * Zooms that straddle the routing tier.
 *
 * 0.15 is in 'low' (below 0.2) — a node is under 24px wide, an edge is a hairline,
 * and the detour around a node body is sub-pixel, so routes collapse to straight
 * lines. 1 is 'high' and routes properly.
 *
 * NOTE 0.3 IS DELIBERATELY NOT USED HERE. It is in 'sketch', which KEEPS routing —
 * text and chrome are unreadable at that zoom but the shape of the graph is not.
 * An earlier draft of this file used 0.3 and had to be moved, which is the tier
 * boundary doing its job: routes now survive the whole [0.2, 0.5) band that a
 * cost-driven breakpoint had been quietly flattening.
 */
const FAR = 0.15;
const NEAR = 1;

function addNode(diagram: DiagramModel, id: string, x: number, y: number): NodeModel {
  const node = new NodeModel({
    type: 'basic',
    position: { x, y },
    size: { width: 120, height: 60 },
  });
  (node as unknown as { id: string }).id = id;
  node.addPort(new PortModel({ id: `${id}-out`, type: 'output', side: 'right' }));
  node.addPort(new PortModel({ id: `${id}-in`, type: 'input', side: 'left' }));
  diagram.addNode(node);
  return node;
}

/**
 * A scene whose routed geometry CANNOT be a straight line: the link runs left to
 * right and a node sits squarely in the middle of the direct path, so A* must
 * bend around it. Without that obstacle the coarse route and the real route would
 * coincide, every assertion below would pass vacuously, and the test would be
 * theatre.
 */
function buildBlockedScene(diagram: DiagramModel): void {
  addNode(diagram, 'src', 0, 200);
  addNode(diagram, 'blocker', 300, 180); // dead centre of the src → dst path
  addNode(diagram, 'dst', 700, 200);

  const link = new LinkModel('src-out', 'dst-in', 'orthogonal');
  (link as unknown as { id: string }).id = 'l1';
  diagram.addLink(link);
}

/** The routed points the renderer left on the model. */
function geometry(diagram: DiagramModel): string {
  const link = diagram.getLinks()[0];
  return (link.points ?? []).map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(' ');
}

function render(zoom: number): { renderer: SVGRenderer; engine: DiagramEngine; diagram: DiagramModel } {
  const engine = new DiagramEngine();
  const diagram = engine.createDiagram('d')!;
  buildBlockedScene(diagram);
  const renderer = new SVGRenderer(engine, {});
  renderer.render(VIEWPORT, zoom);
  return { renderer, engine, diagram };
}

describe('the sketch tier: perception picks the tier, measurement decides the cost', () => {
  it('a small diagram at zoom 0.3 KEEPS its real routes', () => {
    // The regression this tier exists to prevent. When routing was gated at zoom
    // 0.5 to rescue a 63-second 10k frame, every diagram paid for it: a 3-node
    // flowchart that renders in 3ms had its edges snap from an orthogonal path to
    // a straight diagonal the moment you zoomed past 0.5. That is a fidelity tax
    // charged to scenes with no performance problem, to solve a cost problem that
    // belongs to the governor.
    const { renderer, engine, diagram } = render(0.3);
    const points = diagram.getLinks()[0].points ?? [];

    expect(points.length).toBeGreaterThan(2); // still bent around the blocker
    expect(geometry(diagram)).toEqual(
      (() => {
        const near = render(NEAR);
        const truth = geometry(near.diagram);
        near.renderer.dispose();
        near.engine.destroy();
        return truth;
      })()
    );

    renderer.dispose();
    engine.destroy();
  });

  it('…but the unreadable chrome is gone, which is what the tier is FOR', () => {
    // If 'sketch' kept everything, it would just be 'medium' with extra steps. The
    // point is that it drops what a 3.6px label can't say while keeping what a
    // 36px-wide node's edges plainly can.
    const engine = new DiagramEngine();
    const diagram = engine.createDiagram('d')!;
    buildBlockedScene(diagram);

    const config = diagram.getLODConfig();
    const sketch = config.tiers.find((t) => t.name === 'sketch')!;

    expect(sketch.features.has('routing')).toBe(true);
    expect(sketch.features.has('link-detail')).toBe(true);
    expect(sketch.features.has('labels')).toBe(false);
    expect(sketch.features.has('ports')).toBe(false);
    expect(sketch.features.has('handles')).toBe(false);

    engine.destroy();
  });
});

describe('LOD routing gate × route memo (the wave-8 merge seam)', () => {
  it('THE PREMISE: the two tiers genuinely disagree about this link', () => {
    // If they agreed, everything below would be vacuous. Assert the premise
    // rather than assuming it: the far tier must draw a straight 2-point line,
    // and the near tier must bend around the blocker.
    const far = render(FAR);
    const near = render(NEAR);

    const farPoints = far.diagram.getLinks()[0].points ?? [];
    const nearPoints = near.diagram.getLinks()[0].points ?? [];

    expect(farPoints).toHaveLength(2); // straight: start, end
    expect(nearPoints.length).toBeGreaterThan(2); // bent around the blocker
    expect(geometry(far.diagram)).not.toEqual(geometry(near.diagram));

    far.renderer.dispose();
    far.engine.destroy();
    near.renderer.dispose();
    near.engine.destroy();
  });

  it('zooming back IN restores the real route — the memo must not serve the far-zoom line', () => {
    // The bug, in three lines. Nothing about the link changes between these two
    // renders except the zoom, so every input the memo keys on is identical.
    const { renderer, engine, diagram } = render(FAR);
    const coarse = geometry(diagram);

    renderer.render(VIEWPORT, NEAR);
    const restored = geometry(diagram);

    // ground truth: the same scene rendered at NEAR from cold, memo never warmed
    const cold = render(NEAR);
    const truth = geometry(cold.diagram);
    cold.renderer.dispose();
    cold.engine.destroy();

    expect(restored).not.toEqual(coarse); // …it did not stay straight
    expect(restored).toEqual(truth); // …and it is the route a cold renderer draws

    renderer.dispose();
    engine.destroy();
  });

  it('and zooming back OUT drops to the coarse line again — the gate is not one-way', () => {
    // The mirror. A memo keyed correctly serves BOTH tiers from cache; a memo
    // that only ever hardened at the near tier would keep paying for A* forever
    // at far zoom, which is the 63-second frame this wave exists to kill.
    const { renderer, engine, diagram } = render(NEAR);
    const routed = geometry(diagram);

    renderer.render(VIEWPORT, FAR);
    expect(diagram.getLinks()[0].points).toHaveLength(2);
    expect(geometry(diagram)).not.toEqual(routed);

    // …and back in once more, to pin that the two answers do not contaminate
    // each other across repeated crossings.
    renderer.render(VIEWPORT, NEAR);
    expect(geometry(diagram)).toEqual(routed);

    renderer.dispose();
    engine.destroy();
  });
});
