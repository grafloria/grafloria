// edge-optimizer.spec.ts — Wave 4 (Edges & links), Card 7
//
// The diagram-wide, INCREMENTAL edge pass. Two things have to be true at once:
//
//  1. EXACTNESS — the crossings it finds are the same set the old per-link
//     detector found. The grid is a broad phase, not an approximation. If this
//     drifts, every jump arc in every diagram moves.
//  2. INCREMENTALITY — it runs in the render loop, so a frame in which nothing
//     moved must cost NOTHING, and moving one node must not re-test the far side
//     of the diagram. The tests below assert that in work COUNTERS, not in
//     wall-clock (which would be flaky).

import { EdgeOptimizer, overlapArea, segmentIntersectsRect, type OptimizerFrame } from './edge-optimizer';
import { JumpPointDetector } from './JumpPointDetector';

const line = (x1: number, y1: number, x2: number, y2: number) => [
  { x: x1, y: y1 },
  { x: x2, y: y2 },
];

/** A horizontal link crossed by a vertical one, plus a far-away pair. */
function twoClusters(): OptimizerFrame {
  return {
    nodes: [],
    links: [
      { id: 'l-h', points: line(0, 100, 200, 100), jumps: { mode: 'all', threshold: 45 }, labels: [] },
      { id: 'l-v', points: line(100, 0, 100, 200), labels: [] },
      { id: 'r-h', points: line(1000, 100, 1200, 100), jumps: { mode: 'all', threshold: 45 }, labels: [] },
      { id: 'r-v', points: line(1100, 0, 1100, 200), labels: [] },
    ],
  };
}

describe('EdgeOptimizer — jump-over detection', () => {
  it('finds the crossing between two links', () => {
    const optimizer = new EdgeOptimizer();
    optimizer.update({
      nodes: [],
      links: [
        { id: 'a', points: line(0, 50, 100, 50), jumps: { mode: 'all', threshold: 45 }, labels: [] },
        { id: 'b', points: line(50, 0, 50, 100), labels: [] },
      ],
    });

    const jumps = optimizer.getJumps('a');
    expect(jumps).toHaveLength(1);
    expect(jumps[0].point.x).toBeCloseTo(50);
    expect(jumps[0].point.y).toBeCloseTo(50);
    expect(jumps[0].linkId).toBe('b');
    expect(jumps[0].segmentIndex).toBe(0);
  });

  it('agrees EXACTLY with the per-link JumpPointDetector it replaces', () => {
    // The regression that would silently move every jump arc in every diagram.
    const links = [
      { id: 'a', points: [{ x: 0, y: 50 }, { x: 120, y: 50 }, { x: 120, y: 200 }] },
      { id: 'b', points: line(40, 0, 40, 100) },
      { id: 'c', points: line(80, 0, 80, 100) },
      { id: 'd', points: line(60, 150, 200, 150) },
    ];

    const optimizer = new EdgeOptimizer();
    optimizer.update({
      nodes: [],
      links: links.map(l => ({
        ...l,
        jumps: l.id === 'a' ? ({ mode: 'all', threshold: 45 } as const) : undefined,
        labels: [],
      })),
    });

    const detector = new JumpPointDetector();
    const expected = detector.detectIntersections(
      links[0],
      links.slice(1),
      'all',
      45
    );

    const actual = optimizer.getJumps('a');
    const key = (i: { segmentIndex?: number; t1: number; linkId?: string }) =>
      `${i.segmentIndex}:${i.t1.toFixed(6)}:${i.linkId}`;

    expect(actual.map(key).sort()).toEqual(expected.map(key).sort());
    expect(actual.length).toBeGreaterThan(0);
  });

  it('honours the link\'s own detect mode ("perpendicular" = a fixed 75° cutoff)', () => {
    const optimizer = new EdgeOptimizer();
    optimizer.update({
      nodes: [],
      links: [
        // A shallow crossing: ~27°, well under the perpendicular cutoff.
        { id: 'a', points: line(0, 0, 200, 100), jumps: { mode: 'perpendicular', threshold: 45 }, labels: [] },
        { id: 'b', points: line(0, 20, 200, 120), labels: [] },
        { id: 'c', points: line(100, 0, 100, 200), labels: [] },
      ],
    });

    // Only the near-perpendicular crossing with `c` survives the filter.
    expect(optimizer.getJumps('a').every(j => j.linkId === 'c')).toBe(true);
  });

  it('does not draw a jump where two links merely MEET at a shared endpoint', () => {
    const optimizer = new EdgeOptimizer();
    optimizer.update({
      nodes: [],
      links: [
        { id: 'a', points: line(0, 0, 100, 0), jumps: { mode: 'all', threshold: 45 }, labels: [] },
        { id: 'b', points: line(100, 0, 100, 100), labels: [] }, // touches a's end
      ],
    });

    expect(optimizer.getJumps('a')).toHaveLength(0);
  });

  it('returns nothing for a link that draws no jumps', () => {
    const optimizer = new EdgeOptimizer();
    optimizer.update({
      nodes: [],
      links: [
        { id: 'a', points: line(0, 50, 100, 50), labels: [] },
        { id: 'b', points: line(50, 0, 50, 100), labels: [] },
      ],
    });

    expect(optimizer.getJumps('a')).toEqual([]);
  });

  it('is deterministic: the same frame twice gives byte-identical jumps', () => {
    const a = new EdgeOptimizer();
    const b = new EdgeOptimizer();
    a.update(twoClusters());
    b.update(twoClusters());

    expect(JSON.stringify(a.getJumps('l-h'))).toBe(JSON.stringify(b.getJumps('l-h')));
  });
});

describe('EdgeOptimizer — incrementality (the whole point of Card 7)', () => {
  it('does REAL work on a cold frame', () => {
    const optimizer = new EdgeOptimizer();
    optimizer.update(twoClusters());

    expect(optimizer.stats.dirtyLinks).toBe(4);
    expect(optimizer.stats.jumpsRecomputed).toBe(2);
    expect(optimizer.stats.segmentTests).toBeGreaterThan(0);
  });

  it('does ZERO work on an identical frame — the old per-link scan re-tested everything, every frame', () => {
    const optimizer = new EdgeOptimizer();
    optimizer.update(twoClusters());
    optimizer.update(twoClusters());

    expect(optimizer.stats.dirtyLinks).toBe(0);
    expect(optimizer.stats.segmentTests).toBe(0);
    expect(optimizer.stats.jumpsRecomputed).toBe(0);
    expect(optimizer.stats.jumpsReused).toBe(2);
  });

  it('still serves the right answer from cache on a quiet frame', () => {
    const optimizer = new EdgeOptimizer();
    optimizer.update(twoClusters());
    const first = JSON.stringify(optimizer.getJumps('l-h'));

    optimizer.update(twoClusters());
    expect(JSON.stringify(optimizer.getJumps('l-h'))).toBe(first);
    expect(optimizer.getJumps('l-h')).toHaveLength(1);
  });

  it('moving ONE link does not re-test the cluster on the other side of the diagram', () => {
    const optimizer = new EdgeOptimizer();
    optimizer.update(twoClusters());

    const moved = twoClusters();
    moved.links[1].points = line(120, 0, 120, 200); // the LEFT cluster's vertical link
    optimizer.update(moved);

    expect(optimizer.stats.dirtyLinks).toBe(1);
    // The right cluster's jump set is reused; only the left one is re-tested.
    expect(optimizer.stats.jumpsRecomputed).toBe(1);
    expect(optimizer.stats.jumpsReused).toBe(1);
  });

  it('re-tests a link that did NOT move but is crossed by one that DID', () => {
    // The subtle half of incrementality: a stationary link's crossings can appear
    // and vanish because something else moved. Skipping it would leave a stale
    // jump arc hanging in mid-air.
    const optimizer = new EdgeOptimizer();
    optimizer.update({
      nodes: [],
      links: [
        { id: 'still', points: line(0, 50, 200, 50), jumps: { mode: 'all', threshold: 45 }, labels: [] },
        { id: 'mover', points: line(500, 0, 500, 100), labels: [] }, // far away: no crossing
      ],
    });
    expect(optimizer.getJumps('still')).toHaveLength(0);

    optimizer.update({
      nodes: [],
      links: [
        { id: 'still', points: line(0, 50, 200, 50), jumps: { mode: 'all', threshold: 45 }, labels: [] },
        { id: 'mover', points: line(100, 0, 100, 100), labels: [] }, // now it crosses
      ],
    });

    expect(optimizer.getJumps('still')).toHaveLength(1);
    expect(optimizer.stats.jumpsRecomputed).toBe(1);
  });

  it('evicts a deleted link from the grid, so it stops causing phantom jumps', () => {
    const optimizer = new EdgeOptimizer();
    optimizer.update({
      nodes: [],
      links: [
        { id: 'a', points: line(0, 50, 100, 50), jumps: { mode: 'all', threshold: 45 }, labels: [] },
        { id: 'b', points: line(50, 0, 50, 100), labels: [] },
      ],
    });
    expect(optimizer.getJumps('a')).toHaveLength(1);

    optimizer.update({
      nodes: [],
      links: [
        { id: 'a', points: line(0, 50, 100, 50), jumps: { mode: 'all', threshold: 45 }, labels: [] },
      ],
    });

    expect(optimizer.getJumps('a')).toHaveLength(0);
  });

  it('reset() drops every cache', () => {
    const optimizer = new EdgeOptimizer();
    optimizer.update(twoClusters());
    optimizer.reset();

    expect(optimizer.getJumps('l-h')).toEqual([]);
    expect(optimizer.stats.jumpsReused).toBe(0);
  });
});

describe('EdgeOptimizer — label placement (the autoOffset that was dead config)', () => {
  const label = (over: Partial<Parameters<typeof makeLabel>[0]> = {}) => makeLabel(over);

  function makeLabel(over: any = {}) {
    return {
      id: 'lbl',
      anchor: { x: 100, y: 100 },
      offset: { x: 0, y: 0 },
      width: 60,
      height: 20,
      autoOffset: true,
      normal: { x: 0, y: 1 },
      ...over,
    };
  }

  it('LEAVES a label alone when it did not opt in — this is why no existing diagram moves', () => {
    const optimizer = new EdgeOptimizer();
    optimizer.update({
      // A node sitting right on top of the label's anchor.
      nodes: [{ id: 'n', rect: { x: 60, y: 80, width: 90, height: 50 } }],
      links: [
        {
          id: 'a',
          points: line(0, 100, 200, 100),
          labels: [makeLabel({ autoOffset: false })],
        },
      ],
    });

    expect(optimizer.getLabelOffset('a', 'lbl', { x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
    expect(optimizer.stats.labelsPlaced).toBe(0);
  });

  it('MOVES an autoOffset label off a node it would otherwise land on', () => {
    const optimizer = new EdgeOptimizer();
    optimizer.update({
      nodes: [{ id: 'n', rect: { x: 60, y: 80, width: 90, height: 50 } }],
      links: [{ id: 'a', points: line(0, 100, 200, 100), labels: [label()] }],
    });

    const placed = optimizer.getLabelOffset('a', 'lbl', { x: 0, y: 0 });
    expect(placed).not.toEqual({ x: 0, y: 0 });
    expect(optimizer.stats.labelsPlaced).toBe(1);

    // …and where it lands is actually clear of the node.
    const box = {
      x: 100 + placed.x - 30,
      y: 100 + placed.y - 10,
      width: 60,
      height: 20,
    };
    expect(overlapArea(box, { x: 60, y: 80, width: 90, height: 50 })).toBe(0);
  });

  it('does NOT move an autoOffset label that is already sitting somewhere clear', () => {
    // The author's offset is candidate zero and wins every tie: opting in must
    // not shove a label that was fine where it was.
    const optimizer = new EdgeOptimizer();
    optimizer.update({
      nodes: [{ id: 'n', rect: { x: 400, y: 400, width: 50, height: 50 } }],
      links: [{ id: 'a', points: line(0, 100, 200, 100), labels: [label({ offset: { x: 0, y: -14 } })] }],
    });

    expect(optimizer.getLabelOffset('a', 'lbl', { x: 0, y: 0 })).toEqual({ x: 0, y: -14 });
  });

  it('keeps two labels on top of each other apart', () => {
    const optimizer = new EdgeOptimizer();
    optimizer.update({
      nodes: [],
      links: [
        { id: 'a', points: line(0, 100, 200, 100), labels: [makeLabel({ id: 'x' })] },
        { id: 'b', points: line(0, 100, 200, 100), labels: [makeLabel({ id: 'y' })] },
      ],
    });

    const ax = optimizer.getLabelOffset('a', 'x', { x: 0, y: 0 });
    const by = optimizer.getLabelOffset('b', 'y', { x: 0, y: 0 });
    expect(ax).not.toEqual(by);
  });

  it('reuses a placement when nothing near the label changed', () => {
    const optimizer = new EdgeOptimizer();
    const frame = (): OptimizerFrame => ({
      nodes: [{ id: 'n', rect: { x: 60, y: 80, width: 90, height: 50 } }],
      links: [{ id: 'a', points: line(0, 100, 200, 100), labels: [label()] }],
    });

    optimizer.update(frame());
    const first = optimizer.getLabelOffset('a', 'lbl', { x: 0, y: 0 });

    optimizer.update(frame());
    expect(optimizer.stats.labelsPlaced).toBe(0);
    expect(optimizer.stats.labelsReused).toBe(1);
    expect(optimizer.getLabelOffset('a', 'lbl', { x: 0, y: 0 })).toEqual(first);
  });

  it('re-places a label when the node it was dodging moves away', () => {
    const optimizer = new EdgeOptimizer();
    optimizer.update({
      nodes: [{ id: 'n', rect: { x: 60, y: 80, width: 90, height: 50 } }],
      links: [{ id: 'a', points: line(0, 100, 200, 100), labels: [label()] }],
    });
    const dodged = optimizer.getLabelOffset('a', 'lbl', { x: 0, y: 0 });
    expect(dodged).not.toEqual({ x: 0, y: 0 });

    optimizer.update({
      nodes: [{ id: 'n', rect: { x: 600, y: 800, width: 90, height: 50 } }],
      links: [{ id: 'a', points: line(0, 100, 200, 100), labels: [label()] }],
    });

    // Nothing left to avoid ⇒ back to where the author asked for it.
    expect(optimizer.getLabelOffset('a', 'lbl', { x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });

  it('falls back to the caller\'s offset for a label it has never seen', () => {
    const optimizer = new EdgeOptimizer();
    expect(optimizer.getLabelOffset('nope', 'nope', { x: 3, y: 4 })).toEqual({ x: 3, y: 4 });
  });
});

describe('EdgeOptimizer — geometry helpers', () => {
  it('overlapArea is 0 for disjoint rects and the intersection area otherwise', () => {
    expect(overlapArea({ x: 0, y: 0, width: 10, height: 10 }, { x: 20, y: 20, width: 10, height: 10 })).toBe(0);
    expect(overlapArea({ x: 0, y: 0, width: 10, height: 10 }, { x: 5, y: 5, width: 10, height: 10 })).toBe(25);
  });

  it('segmentIntersectsRect detects a segment cutting through a rect', () => {
    expect(segmentIntersectsRect({ x: -10, y: 5 }, { x: 20, y: 5 }, { x: 0, y: 0, width: 10, height: 10 })).toBe(true);
    expect(segmentIntersectsRect({ x: -10, y: 50 }, { x: 20, y: 50 }, { x: 0, y: 0, width: 10, height: 10 })).toBe(false);
  });
});
