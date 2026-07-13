// DiagramModel.nearestPort.spec.ts
//
// wave8/culling — Card 2: "the index also serves nearest-port hit-testing during
// link drag".
//
// The pre-existing answer was `PortModel.findNearestPort`, and it could only ever
// search ONE node — whichever node the pointer was already hovering — because
// searching more would have meant a linear walk of every node in the diagram, on
// every pointermove. That is not a hit-test, it is a hit-CONFIRM: you cannot snap
// to a port you are merely near.
//
// `DiagramModel.findNearestPort` asks the spatial index instead, so the search
// region is bounded by the snap radius rather than by the scene.

import { DiagramModel, DEFAULT_PORT_SNAP_RADIUS } from './DiagramModel';
import { NodeModel } from './NodeModel';
import { PortModel } from './PortModel';

/**
 * A node with EXACTLY the ports named — no others.
 *
 * `new NodeModel()` mints four default ports (top/right/bottom/left) that sit at
 * the same edge midpoints as any port you then add, so a fixture that leaves them
 * in place is asking "which of two ports at the identical point is nearest" and
 * getting an arbitrary answer. Strip them, and the fixture says what it means.
 */
function addNode(
  diagram: DiagramModel,
  id: string,
  x: number,
  y: number,
  ports: Array<{ id: string; side: 'left' | 'right' | 'top' | 'bottom'; type: 'input' | 'output' }>
): NodeModel {
  const node = new NodeModel({
    type: 'basic',
    position: { x, y },
    size: { width: 100, height: 50 },
  });
  (node as unknown as { id: string }).id = id;
  for (const existing of node.getPorts()) node.removePort(existing.id);
  for (const p of ports) {
    node.addPort(new PortModel({ id: p.id, type: p.type, side: p.side }));
  }
  diagram.addNode(node);
  return node;
}

describe('DiagramModel.findNearestPort (wave8/culling — Card 2)', () => {
  let diagram: DiagramModel;

  beforeEach(() => {
    diagram = new DiagramModel('nearest-port');
    // A: 100..200 x 100..150 — right port at (200, 125), left port at (100, 125)
    addNode(diagram, 'A', 100, 100, [
      { id: 'a-out', side: 'right', type: 'output' },
      { id: 'a-in', side: 'left', type: 'input' },
    ]);
    // B: 400..500 x 100..150 — left port at (400, 125)
    addNode(diagram, 'B', 400, 100, [{ id: 'b-in', side: 'left', type: 'input' }]);
  });

  it('finds the port nearest a point, with its node and distance', () => {
    const hit = diagram.findNearestPort({ x: 205, y: 125 });

    expect(hit).not.toBeNull();
    expect(hit!.port.id).toBe('a-out');
    expect(hit!.node.id).toBe('A');
    expect(hit!.distance).toBeCloseTo(5, 5);
  });

  it('picks the nearer of two ports on the same node', () => {
    // Just off A's LEFT edge — the left port must win over the right one.
    const hit = diagram.findNearestPort({ x: 96, y: 125 });
    expect(hit!.port.id).toBe('a-in');
  });

  // THE point of the card: a drag that lands NEAR a port — not on its node — snaps.
  // The old path returned null here, because there was no hovered node to search.
  it('snaps to a port the pointer is near but not over', () => {
    const hit = diagram.findNearestPort({ x: 385, y: 130 }, { radius: 30 });
    expect(hit!.port.id).toBe('b-in');
  });

  it('returns null when nothing is within the radius', () => {
    expect(diagram.findNearestPort({ x: 2000, y: 2000 })).toBeNull();
    // ...and the radius is a real bound, not a suggestion: b-in is 200 away.
    expect(diagram.findNearestPort({ x: 200, y: 125 }, { radius: 2 })!.port.id).toBe('a-out');
    expect(diagram.findNearestPort({ x: 300, y: 125 }, { radius: 20 })).toBeNull();
  });

  it('defaults to a fingertip-sized radius', () => {
    const justInside = diagram.findNearestPort({
      x: 200 + DEFAULT_PORT_SNAP_RADIUS - 1,
      y: 125,
    });
    const justOutside = diagram.findNearestPort({
      x: 200 + DEFAULT_PORT_SNAP_RADIUS + 1,
      y: 125,
    });

    expect(justInside!.port.id).toBe('a-out');
    expect(justOutside).toBeNull();
  });

  it('honours a port filter — a drag only snaps to ports it may legally land on', () => {
    // Standing right on A's output, but only INPUTS are legal targets.
    const hit = diagram.findNearestPort(
      { x: 200, y: 125 },
      { radius: 200, filter: (port) => port.type === 'input' }
    );

    expect(hit!.port.id).toBe('a-in');
  });

  it('skips invisible nodes', () => {
    diagram.getNode('B')!.state.visible = false;
    expect(diagram.findNearestPort({ x: 395, y: 125 })).toBeNull();
  });

  // THE LATENT BUG this API exists to make fixable. The engine cannot know where a
  // port is DRAWN — the shape registry lives in the renderer, and on any non-rect
  // silhouette, or any side with more than one port, the drawn position is not the
  // bounding-box edge midpoint. Wave 6 fixed exactly this divergence for the port
  // hit-test and the magnet; `PortModel.findNearestPort` still had it.
  //
  // So the resolver is injectable, and a renderer MUST pass its own.
  it('asks the caller where ports actually are (shape-aware hit-testing)', () => {
    const bboxAnswer = diagram.findNearestPort({ x: 260, y: 125 }, { radius: 70 });
    expect(bboxAnswer!.port.id).toBe('a-out'); // bbox midpoint: (200, 125), 60 away

    // A renderer whose shape puts a-out at (250, 125) instead — e.g. a port fanned
    // out along a circle's perimeter — must get a DIFFERENT distance back, because
    // the point of the query is the position the user can see.
    const shapeAware = diagram.findNearestPort(
      { x: 260, y: 125 },
      {
        radius: 70,
        portPosition: (port, node) =>
          port.id === 'a-out'
            ? { x: 250, y: 125 }
            : port.getAbsolutePosition(node.getBoundingBox()),
      }
    );

    expect(shapeAware!.port.id).toBe('a-out');
    expect(shapeAware!.distance).toBeCloseTo(10, 5);
    expect(bboxAnswer!.distance).toBeCloseTo(60, 5);
  });

  // The complexity claim, stated as a count rather than a stopwatch (a wall-clock
  // assertion under parallel-agent load is a coin toss). A drag query must touch a
  // bounded neighbourhood, NOT the scene.
  it('does not touch the whole scene: 10k nodes, a handful of ports considered', () => {
    const big = new DiagramModel('big');
    for (let i = 0; i < 10000; i++) {
      addNode(big, `n${i}`, (i % 100) * 220, Math.floor(i / 100) * 140, [
        { id: `n${i}-out`, side: 'right', type: 'output' },
      ]);
    }

    let portsConsidered = 0;
    const hit = big.findNearestPort(
      { x: 100, y: 25 },
      {
        radius: 30,
        portPosition: (port, node) => {
          portsConsidered++;
          return port.getAbsolutePosition(node.getBoundingBox());
        },
      }
    );

    expect(hit!.port.id).toBe('n0-out'); // n0 spans 0..100 x 0..50; right port (100, 25)
    // 10,000 nodes in the scene; the query is allowed to look at a neighbourhood.
    // The old linear answer would have been 10,000.
    expect(portsConsidered).toBeLessThan(50);
  });
});
