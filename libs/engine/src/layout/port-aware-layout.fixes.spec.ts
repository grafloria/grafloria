// Wave 7 — Card 7. Latent bugs in the port-aware layout module, found while
// auditing it.
//
// The module was never CONSUMED by production code (nothing built the PortInfo[]
// it needs — see port-label-bridge.ts), which is exactly why these survived: the
// unit tests exercised each function in isolation with hand-made inputs that
// happened not to trip them, and no integration ever ran the whole thing.

import { PortAwareLayoutManager, PortInfo, PortSide, PortAwareLayoutOptions } from './port-aware-layout.interface';
import { LayoutQualityMetrics } from './layout-quality-metrics';
import { NodeModel } from '../models/NodeModel';

describe('BUG: crossing count ignored node positions', () => {
  it('counts crossings in ABSOLUTE space, not in each node\'s local frame', () => {
    // `countEdgeCrossings` took `nodePositions` and never read it: it compared
    // port coordinates that are RELATIVE to their own node. Every node's ports
    // therefore sat around the same origin, so two edges on opposite sides of a
    // large canvas could be "crossing". The source even admitted it —
    // "In real implementation, this should be absolute".
    //
    // Here: two edges 500px apart vertically. They plainly do not cross. In the
    // old relative frame they appeared to.
    const ports: PortInfo[] = [
      { id: 'p1', nodeId: 'n1', preferredSide: 'right' },
      { id: 'p2', nodeId: 'n2', preferredSide: 'left' },
      { id: 'p3', nodeId: 'n3', preferredSide: 'right' },
      { id: 'p4', nodeId: 'n4', preferredSide: 'left' },
    ];

    const portPositions = new Map<string, { x: number; y: number; side: PortSide }>([
      ['p1', { x: 50, y: 0, side: 'right' }],
      ['p2', { x: -50, y: 0, side: 'left' }],
      // These two are offset within their own nodes so that, in the LOCAL frame,
      // the p3->p4 segment slices straight through the p1->p2 segment.
      ['p3', { x: 50, y: -20, side: 'right' }],
      ['p4', { x: -50, y: 20, side: 'left' }],
    ]);

    const nodePositions = new Map([
      ['n1', { x: 0, y: 0 }],
      ['n2', { x: 200, y: 0 }],
      ['n3', { x: 0, y: 500 }], // 500px below — nowhere near the first edge
      ['n4', { x: 200, y: 500 }],
    ]);

    const links = [
      { sourcePortId: 'p1', targetPortId: 'p2' },
      { sourcePortId: 'p3', targetPortId: 'p4' },
    ];

    const crossings = PortAwareLayoutManager.countEdgeCrossings(
      portPositions,
      nodePositions,
      links,
      ports
    );

    expect(crossings).toBe(0);
  });
});

describe('BUG: crossing-minimising port order did nothing', () => {
  it('orders ports by the barycentre of the nodes they connect to', () => {
    // `orderByMinimizingCrossings` looked the connected port up in the list of
    // ports it was ALREADY iterating — the ports on one side of ONE node. The
    // ports it was connected to live on OTHER nodes, so the lookup always missed,
    // every barycentre came out 0, and the sort was a no-op. "minimize-crossings"
    // ordering had never once reordered anything.
    const ports: PortInfo[] = [
      // Two ports on node1's left side, declared in this order:
      { id: 'pA', nodeId: 'node1', preferredSide: 'left' },
      { id: 'pB', nodeId: 'node1', preferredSide: 'left' },
      // ...connected to nodes at very different heights.
      { id: 'far', nodeId: 'nodeFar', preferredSide: 'right' },
      { id: 'near', nodeId: 'nodeNear', preferredSide: 'right' },
    ];

    const portAssignments = new Map<string, PortSide>([
      ['pA', 'left'],
      ['pB', 'left'],
      ['far', 'right'],
      ['near', 'right'],
    ]);

    const nodePositions = new Map([
      ['node1', { x: 500, y: 100 }],
      ['nodeFar', { x: 0, y: 900 }], // pA's partner is far DOWN
      ['nodeNear', { x: 0, y: 0 }], // pB's partner is UP
    ]);

    const links = [
      { sourcePortId: 'far', targetPortId: 'pA' },
      { sourcePortId: 'near', targetPortId: 'pB' },
    ];

    const options: PortAwareLayoutOptions = {
      enabled: true,
      autoOrderPorts: true,
      orderingStrategy: 'minimize-crossings',
    };

    const ordering = PortAwareLayoutManager.orderPorts(
      ports,
      portAssignments,
      nodePositions,
      links,
      options
    );

    // pB connects upward (y=0), pA connects downward (y=900). Ordered top-to-bottom
    // down node1's left side, pB must come FIRST — otherwise the two edges cross.
    // The buggy version returned the declaration order [pA, pB].
    expect(ordering.get('node1')).toEqual(['pB', 'pA']);
  });
});

describe('BUG: quality metrics', () => {
  function node(id: string, x: number, y: number, w = 100, h = 50): NodeModel {
    const n = new NodeModel({ id, type: 'default', position: { x, y } });
    n.setSize(w, h);
    n.setPosition(x, y);
    return n;
  }

  it('does not report exactly-adjacent nodes as OVERLAPPING', () => {
    // `nodesOverlap` used `<` where it needed `<=`: two nodes whose edges exactly
    // touch (node1 ends at x=100, node2 starts at x=100) share no area, but were
    // counted as an overlap. A tightly-packed grid layout would be marked
    // unusable for being tidy.
    const nodes = [node('a', 0, 0, 100, 50), node('b', 100, 0, 100, 50)];

    const result = LayoutQualityMetrics.assess(nodes, []);

    expect(result.metrics.nodeOverlap.score).toBe(100);
  });

  it('still reports genuinely overlapping nodes', () => {
    const nodes = [node('a', 0, 0, 100, 50), node('b', 99, 0, 100, 50)];

    expect(LayoutQualityMetrics.assess(nodes, []).metrics.nodeOverlap.score).toBeLessThan(100);
  });
});
