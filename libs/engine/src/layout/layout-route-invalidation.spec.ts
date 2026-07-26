// Layout must not leave stale link routes behind.
//
// THE BUG: `engine.layout(...)` committed new NODE positions and returned; each
// link kept the polyline it was routed on BEFORE the layout. The renderer
// treats a non-empty `link.points` as painted geometry and places edge labels
// by walking it (`link.getPointAtPosition`), so after a layout the labels sat
// at PRE-layout midpoints — observed live: "yes"/"no" stranded off-canvas at
// world y=140 while their nodes moved to y~600. The docs page worked around it
// with a manual `for (const l of d.getLinks()) l.setPoints([])`; this spec
// locks the fix that makes the workaround unnecessary.
//
// The contract: after a layout that MOVED a link's endpoint node, that link's
// routed points are invalidated (emptied — the canonical "re-route on next
// paint" state), never the pre-layout polyline. Links whose endpoints did not
// move keep their still-valid routes.

import { DiagramEngine } from '../engine/DiagramEngine';
import { DiagramModel } from '../models/DiagramModel';
import { NodeModel } from '../models/NodeModel';
import { LinkModel } from '../models/LinkModel';
import { PortModel } from '../models/PortModel';
import type { Point } from '../types';

function makeNode(id: string, x: number, y: number): NodeModel {
  const node = new NodeModel({
    type: 'basic',
    position: { x, y },
    size: { width: 100, height: 50 },
  });
  (node as unknown as { id: string }).id = id;
  node.addPort(new PortModel({ id: `${id}-out`, type: 'output', side: 'right' }));
  node.addPort(new PortModel({ id: `${id}-in`, type: 'input', side: 'left' }));
  return node;
}

function makeLink(source: string, target: string): LinkModel {
  const link = new LinkModel(`${source}-out`, `${target}-in`, 'orthogonal');
  (link as unknown as { id: string }).id = `${source}->${target}`;
  link.sourceNodeId = source;
  link.targetNodeId = target;
  return link;
}

/** A chain a…d with every link carrying a marker polyline to be invalidated. */
function buildChain(engine: DiagramEngine): {
  diagram: DiagramModel;
  stale: Map<string, Point[]>;
} {
  const diagram = engine.createDiagram('chain')!;
  const ids = ['a', 'b', 'c', 'd'];
  ids.forEach((id, i) => diagram.addNode(makeNode(id, 100 + i * 10, 100 + i * 10)));
  const stale = new Map<string, Point[]>();
  for (let i = 0; i < ids.length - 1; i++) {
    const link = makeLink(ids[i], ids[i + 1]);
    diagram.addLink(link);
    // The pre-layout route, as the renderer would have synced it.
    const marker: Point[] = [
      { x: 100 + i * 10, y: 140 },
      { x: 160 + i * 10, y: 140 },
    ];
    link.setPoints(marker);
    stale.set(link.id, marker);
  }
  return { diagram, stale };
}

describe('layout invalidates stale link routes (the off-canvas-labels bug)', () => {
  it('engine.layout() empties the routed points of links whose endpoints moved', async () => {
    const engine = new DiagramEngine();
    const { diagram, stale } = buildChain(engine);

    const before = new Map(diagram.getNodes().map((n) => [n.id, { ...n.position }]));
    await engine.layout('layered');

    // The layout genuinely moved nodes (otherwise the test asserts nothing).
    const movedCount = diagram
      .getNodes()
      .filter((n) => n.position.x !== before.get(n.id)!.x || n.position.y !== before.get(n.id)!.y)
      .length;
    expect(movedCount).toBeGreaterThan(0);

    for (const link of diagram.getLinks()) {
      // Invalidated — NOT the pre-layout polyline. Empty is the canonical
      // "re-route on next paint" state the renderer honours.
      expect(link.points).not.toEqual(stale.get(link.id));
      expect(link.points).toEqual([]);
    }
    engine.destroy();
  });

  it('engine.layout() clears the manual-waypoint flag with the stale route', async () => {
    const engine = new DiagramEngine();
    const { diagram } = buildChain(engine);
    const link = diagram.getLinks()[0];
    link.setMetadata('hasManualWaypoints', true);

    await engine.layout('layered');

    // An empty polyline with the manual flag still set would send the renderer
    // down its keep-the-interior-waypoints branch with nothing to keep.
    expect(link.points).toEqual([]);
    expect(link.getMetadata('hasManualWaypoints')).toBe(false);
  });

  it('reLayout() (LayoutManager, immediate path) invalidates moved links but spares unmoved ones', async () => {
    const engine = new DiagramEngine();
    const { diagram, stale } = buildChain(engine);

    // Lock a and b: reLayout preserves locked nodes, so the a->b link's
    // endpoints do NOT move and its (still valid) route must survive.
    for (const id of ['a', 'b']) {
      const node = diagram.getNode(id)!;
      (node as unknown as { state: { locked: boolean } }).state.locked = true;
    }

    await diagram.reLayout();

    const kept = diagram.getLinks().find((l) => l.id === 'a->b')!;
    expect(kept.points).toEqual(stale.get('a->b'));

    const invalidated = diagram
      .getLinks()
      .filter((l) => l.id !== 'a->b')
      .filter((l) => {
        const src = diagram.getNode(l.sourceNodeId!)!;
        const tgt = diagram.getNode(l.targetNodeId!)!;
        return !src.state.locked || !tgt.state.locked;
      });
    expect(invalidated.length).toBeGreaterThan(0);
    for (const link of invalidated) {
      expect(link.points).not.toEqual(stale.get(link.id));
      expect(link.points).toEqual([]);
    }
    engine.destroy();
  });

  it('reLayout() animated path invalidates after the animation settles', async () => {
    const globals = globalThis as unknown as {
      requestAnimationFrame?: (cb: (t: number) => void) => number;
    };
    const hadRaf = typeof globals.requestAnimationFrame === 'function';
    if (!hadRaf) {
      globals.requestAnimationFrame = (cb) =>
        setTimeout(() => cb(performance.now()), 0) as unknown as number;
    }
    try {
      const engine = new DiagramEngine();
      const { diagram, stale } = buildChain(engine);

      await diagram.reLayout({ animate: true, animationDuration: 5 });

      for (const link of diagram.getLinks()) {
        expect(link.points).not.toEqual(stale.get(link.id));
        expect(link.points).toEqual([]);
      }
      engine.destroy();
    } finally {
      if (!hadRaf) delete globals.requestAnimationFrame;
    }
  });
});
