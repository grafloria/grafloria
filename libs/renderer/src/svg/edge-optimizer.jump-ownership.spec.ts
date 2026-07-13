// Wave 5 (Edge routing) — Card 5: consistent jumpovers.
//
// Under jumpOwnership: 'single', a crossing between two jump-DRAWING links is
// bridged by exactly ONE deterministic owner — the link whose crossing segment
// is horizontal (the drafting convention: an arc on a horizontal line reads as
// "jumps over"; on a vertical it reads as a kink). Neither-or-both horizontal
// ties break on the smaller link id. Default stays 'both' (the legacy double
// bridge), because wave-4's regression contract pins the optimizer's crossings
// byte-identical to the legacy detector.

import { EdgeOptimizer, type OptimizerFrame } from './edge-optimizer';

const JUMPS = { mode: 'all' as const, threshold: 45 };

/** A horizontal link h (y=100) crossing a vertical link v (x=100). */
function crossFrame(): OptimizerFrame {
  return {
    nodes: [],
    links: [
      { id: 'h', points: [{ x: 0, y: 100 }, { x: 200, y: 100 }], jumps: JUMPS, labels: [] },
      { id: 'v', points: [{ x: 100, y: 0 }, { x: 100, y: 200 }], jumps: JUMPS, labels: [] },
    ],
  };
}

describe('edge optimizer — jump ownership (Wave 5, Card 5)', () => {
  it("default ('both') keeps the legacy double bridge: each link records the crossing", () => {
    const optimizer = new EdgeOptimizer();
    optimizer.update(crossFrame());
    expect(optimizer.getJumps('h')).toHaveLength(1);
    expect(optimizer.getJumps('v')).toHaveLength(1);
  });

  it("'single': the HORIZONTAL segment owns the crossing; the vertical stays clean", () => {
    const optimizer = new EdgeOptimizer({ jumpOwnership: 'single' });
    optimizer.update(crossFrame());
    expect(optimizer.getJumps('h')).toHaveLength(1);
    expect(optimizer.getJumps('v')).toHaveLength(0);
  });

  it("'single': two diagonals tie-break on the smaller link id — exactly one owner", () => {
    const optimizer = new EdgeOptimizer({ jumpOwnership: 'single' });
    optimizer.update({
      nodes: [],
      links: [
        { id: 'a', points: [{ x: 0, y: 0 }, { x: 200, y: 200 }], jumps: JUMPS, labels: [] },
        { id: 'b', points: [{ x: 0, y: 200 }, { x: 200, y: 0 }], jumps: JUMPS, labels: [] },
      ],
    });
    expect(optimizer.getJumps('a')).toHaveLength(1); // 'a' < 'b'
    expect(optimizer.getJumps('b')).toHaveLength(0);
  });

  it("'single': a crossing with a NON-jumping link is always kept — someone must bridge it", () => {
    const optimizer = new EdgeOptimizer({ jumpOwnership: 'single' });
    optimizer.update({
      nodes: [],
      links: [
        // vertical, jumps enabled; crosses a horizontal that draws NO jumps.
        { id: 'v', points: [{ x: 100, y: 0 }, { x: 100, y: 200 }], jumps: JUMPS, labels: [] },
        { id: 'plain', points: [{ x: 0, y: 100 }, { x: 200, y: 100 }], labels: [] },
      ],
    });
    // Even though 'v' is vertical (the non-preferred orientation), it keeps the
    // jump: the horizontal link doesn't draw jumps, so there is nobody else.
    expect(optimizer.getJumps('v')).toHaveLength(1);
  });

  it("'single' ownership is stable across incremental updates (cache + dirty path agree)", () => {
    const optimizer = new EdgeOptimizer({ jumpOwnership: 'single' });
    optimizer.update(crossFrame());
    // second identical frame: everything served from cache
    optimizer.update(crossFrame());
    expect(optimizer.getJumps('h')).toHaveLength(1);
    expect(optimizer.getJumps('v')).toHaveLength(0);

    // move the vertical: both re-enter the dirty path; ownership must not flip
    const moved = crossFrame();
    moved.links[1].points = [{ x: 120, y: 0 }, { x: 120, y: 200 }];
    optimizer.update(moved);
    expect(optimizer.getJumps('h')).toHaveLength(1);
    expect(optimizer.getJumps('v')).toHaveLength(0);
  });
});
