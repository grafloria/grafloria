// Wave 8 — Card 6. The index replaces a linear scan inside the routers, so the
// ONLY thing that matters about it is that it answers exactly what the linear
// scan answered. These tests are mostly a differential fuzz against the
// brute-force predicate: if they ever disagree, a route moves, and the
// 225-assertion line harness is what would find out. Better to find out here.

import { ObstacleIndex, mergeObstacles } from './ObstacleIndex';
import type { Obstacle } from './types';

/** The predicate OrthogonalRouter.collidesWithObstacles used to run, verbatim. */
function bruteCollides(obstacles: Obstacle[], px: number, py: number, margin: number): boolean {
  for (const o of obstacles) {
    if (
      px >= o.x - margin &&
      px <= o.x + o.width + margin &&
      py >= o.y - margin &&
      py <= o.y + o.height + margin
    ) {
      return true;
    }
  }
  return false;
}

/** Deterministic PRNG — a flaky fuzz test is a disabled fuzz test. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

describe('ObstacleIndex', () => {
  it('is empty-safe', () => {
    const idx = new ObstacleIndex([]);
    expect(idx.size).toBe(0);
    expect(idx.collides(0, 0, 20)).toBe(false);
    expect(idx.queryBox(-100, -100, 100, 100)).toEqual([]);
  });

  it('finds a hit inside, on the boundary, and inside the margin ring', () => {
    const o: Obstacle = { id: 'a', x: 100, y: 100, width: 50, height: 40 };
    const idx = new ObstacleIndex([o]);

    expect(idx.collides(120, 120, 0)).toBe(true); // inside
    expect(idx.collides(100, 100, 0)).toBe(true); // exactly on the corner — inclusive bounds
    expect(idx.collides(150, 140, 0)).toBe(true); // far corner, inclusive
    expect(idx.collides(151, 120, 0)).toBe(false); // 1px clear
    expect(idx.collides(151, 120, 1)).toBe(true); // ...until the margin reaches it
    expect(idx.collides(170, 120, 20)).toBe(true); // margin ring
    expect(idx.collides(171, 120, 20)).toBe(false); // just outside the ring
  });

  it('handles negative coordinates (the grid key must not fold them together)', () => {
    const a: Obstacle = { id: 'a', x: -500, y: -500, width: 40, height: 40 };
    const b: Obstacle = { id: 'b', x: 500, y: 500, width: 40, height: 40 };
    const idx = new ObstacleIndex([a, b]);

    expect(idx.collides(-480, -480, 0)).toBe(true);
    expect(idx.collides(520, 520, 0)).toBe(true);
    expect(idx.collides(-480, 520, 0)).toBe(false); // the cross terms must NOT hit
    expect(idx.collides(520, -480, 0)).toBe(false);
  });

  it('an obstacle far larger than a cell still blocks every point inside it', () => {
    // A collapsed group block can be diagram-sized. It goes to the oversized
    // list; every query must still see it.
    const huge: Obstacle = { id: 'group', x: 0, y: 0, width: 500_000, height: 500_000 };
    const idx = new ObstacleIndex([huge]);
    expect(idx.collides(250_000, 250_000, 0)).toBe(true);
    expect(idx.collides(499_999, 1, 0)).toBe(true);
    expect(idx.collides(-1, -1, 0)).toBe(false);
    expect(idx.collides(-1, -1, 2)).toBe(true);
    expect(idx.queryBox(100, 100, 200, 200)).toHaveLength(1);
  });

  it('agrees with the brute-force scan on 20k random point queries', () => {
    const rand = rng(20250714);
    const obstacles: Obstacle[] = [];
    for (let i = 0; i < 400; i++) {
      obstacles.push({
        id: `o${i}`,
        x: Math.round((rand() - 0.5) * 4000),
        y: Math.round((rand() - 0.5) * 4000),
        width: 10 + Math.round(rand() * 300),
        height: 10 + Math.round(rand() * 300),
      });
    }
    const idx = new ObstacleIndex(obstacles);

    let disagreements = 0;
    let hits = 0;
    for (let q = 0; q < 20000; q++) {
      const px = Math.round((rand() - 0.5) * 4400);
      const py = Math.round((rand() - 0.5) * 4400);
      const margin = [0, 1, 10, 20, 50][Math.floor(rand() * 5)];
      const expected = bruteCollides(obstacles, px, py, margin);
      if (idx.collides(px, py, margin) !== expected) disagreements++;
      if (expected) hits++;
    }

    expect(disagreements).toBe(0);
    // guard against a vacuous test: the queries must actually hit sometimes
    expect(hits).toBeGreaterThan(1000);
    expect(hits).toBeLessThan(19000);
  });

  it('queryBox returns a superset of the truly-overlapping obstacles, deduplicated', () => {
    const rand = rng(7);
    const obstacles: Obstacle[] = [];
    for (let i = 0; i < 200; i++) {
      obstacles.push({
        id: `o${i}`,
        x: Math.round((rand() - 0.5) * 2000),
        y: Math.round((rand() - 0.5) * 2000),
        width: 20 + Math.round(rand() * 400), // deliberately spans several cells
        height: 20 + Math.round(rand() * 400),
      });
    }
    const idx = new ObstacleIndex(obstacles);

    for (let q = 0; q < 500; q++) {
      const x1 = Math.round((rand() - 0.5) * 2000);
      const y1 = Math.round((rand() - 0.5) * 2000);
      const x2 = x1 + Math.round(rand() * 300);
      const y2 = y1 + Math.round(rand() * 300);

      const got = idx.queryBox(x1, y1, x2, y2);
      expect(new Set(got).size).toBe(got.length); // no duplicates, even for multi-cell rects

      const truth = obstacles.filter(
        (o) => o.x <= x2 && o.x + o.width >= x1 && o.y <= y2 && o.y + o.height >= y1
      );
      for (const t of truth) expect(got).toContain(t); // superset: nothing real is missed
    }
  });
});

describe('mergeObstacles', () => {
  it('collapses the SAME obstacle described twice (the global/request double-count)', () => {
    const a: Obstacle[] = [{ id: 'n1', x: 0, y: 0, width: 10, height: 10 }];
    const b: Obstacle[] = [{ id: 'n1', x: 0, y: 0, width: 10, height: 10 }];
    expect(mergeObstacles(a, b)).toHaveLength(1);
  });

  it('keeps two entries that share an id but DISAGREE about geometry', () => {
    // Collapsing these would shrink the blocked region — the merge must be
    // conservative, not clever.
    const a: Obstacle[] = [{ id: 'n1', x: 0, y: 0, width: 10, height: 10 }];
    const b: Obstacle[] = [{ id: 'n1', x: 500, y: 500, width: 10, height: 10 }];
    const merged = mergeObstacles(a, b);
    expect(merged).toHaveLength(2);

    const idx = new ObstacleIndex(merged);
    expect(idx.collides(5, 5, 0)).toBe(true);
    expect(idx.collides(505, 505, 0)).toBe(true);
  });

  it('short-circuits when either side is empty (no copy, no churn)', () => {
    const a: Obstacle[] = [{ id: 'n1', x: 0, y: 0, width: 10, height: 10 }];
    expect(mergeObstacles(a, [])).toBe(a);
    expect(mergeObstacles([], a)).toBe(a);
  });
});
