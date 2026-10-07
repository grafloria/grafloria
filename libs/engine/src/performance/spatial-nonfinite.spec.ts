// Non-finite and enormous geometry must not take the page with it.
//
// Both grid indexes walked `Math.floor(x / cell)` to `Math.floor((x + width) /
// cell)` with no bound, so a node whose width came out `Infinity` — dividing by
// an empty array's length is enough, and no hostile input is required — pushed
// grid keys until `cells.push` threw `RangeError: Invalid array length`, twelve
// seconds of frozen main thread later. `position: {x: Infinity}` was worse: it
// never returned at all, and the tab had to be killed. It arrived through the
// documented front door (`render({nodes: [...]})`) and through `loadText()` on a
// document with `"width": 1e999`.
//
// `ObstacleIndex` already had this guard. These two did not — which is why the
// tests below assert the same property of both, rather than of the one that
// happened to be reported.
//
// NaN was never the problem and is not tested as a hazard: `NaN <= NaN` is false,
// so the loop simply never runs.

import { SpatialIndex } from './SpatialIndex';
import { ObstacleMap } from '../routing/ObstacleMap';
import type { Obstacle } from '../routing/types';

interface Box {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

const makeIndex = () =>
  new SpatialIndex<Box>({
    cellSize: 100,
    getBounds: (b) => ({ x: b.x, y: b.y, width: b.width, height: b.height }),
  });

/** Fails the test rather than hanging the runner if a guard is missing. */
function withinBudget<T>(label: string, budgetMs: number, fn: () => T): T {
  const started = Date.now();
  const out = fn();
  const took = Date.now() - started;
  if (took > budgetMs) {
    throw new Error(`${label} took ${took}ms, budget ${budgetMs}ms — the guard is not holding`);
  }
  return out;
}

describe('spatial indexes — non-finite and enormous geometry', () => {
  describe('SpatialIndex', () => {
    it.each([
      ['infinite width', { id: 'a', x: 0, y: 0, width: Infinity, height: 60 }],
      ['infinite position', { id: 'a', x: Infinity, y: -Infinity, width: 100, height: 60 }],
      ['enormous extent', { id: 'a', x: 0, y: 0, width: 1e9, height: 1e9 }],
    ] as Array<[string, Box]>)('survives adding a node with %s', (_label, box) => {
      const index = makeIndex();
      withinBudget('add', 1000, () => index.add(box));
      expect(index.size()).toBe(1);
    });

    it('an unindexable node is still FOUND — unindexed must not mean invisible', () => {
      const index = makeIndex();
      const huge: Box = { id: 'huge', x: 0, y: 0, width: Infinity, height: Infinity };
      const normal: Box = { id: 'normal', x: 50, y: 50, width: 40, height: 40 };
      index.add(huge);
      index.add(normal);

      const found = withinBudget('queryRegion', 1000, () =>
        index.queryRegion({ x: 40, y: 40, width: 80, height: 80 })
      );

      expect(found.map((b) => b.id).sort()).toEqual(['huge', 'normal']);
    });

    it('removing an unindexable node drops it from results', () => {
      const index = makeIndex();
      index.add({ id: 'huge', x: 0, y: 0, width: Infinity, height: 60 });
      index.remove('huge');
      expect(index.queryRegion({ x: 0, y: 0, width: 100, height: 100 })).toEqual([]);
      expect(index.size()).toBe(0);
    });

    it('a non-finite QUERY region does not hang either', () => {
      const index = makeIndex();
      index.add({ id: 'a', x: 10, y: 10, width: 20, height: 20 });
      const found = withinBudget('infinite query', 1000, () =>
        index.queryRegion({ x: -Infinity, y: -Infinity, width: Infinity, height: Infinity })
      );
      expect(found.map((b) => b.id)).toEqual(['a']);
    });

    it('clear() forgets unindexable entities too', () => {
      const index = makeIndex();
      index.add({ id: 'huge', x: 0, y: 0, width: Infinity, height: 60 });
      index.clear();
      expect(index.queryRegion({ x: 0, y: 0, width: 100, height: 100 })).toEqual([]);
    });
  });

  describe('ObstacleMap', () => {
    const obstacle = (o: Partial<Obstacle> & { id: string }): Obstacle =>
      ({ x: 0, y: 0, width: 100, height: 100, ...o }) as Obstacle;

    it.each([
      ['infinite width', obstacle({ id: 'o', width: Infinity })],
      ['infinite position', obstacle({ id: 'o', x: Infinity, y: -Infinity })],
      ['enormous extent', obstacle({ id: 'o', width: 1e9, height: 1e9 })],
    ])('survives adding an obstacle with %s', (_label, o) => {
      const map = new ObstacleMap();
      withinBudget('add', 1000, () => map.add(o));
      expect(map.size()).toBe(1);
    });

    it('an unindexable obstacle is still returned by an overlapping query', () => {
      const map = new ObstacleMap();
      map.add(obstacle({ id: 'huge', width: Infinity, height: Infinity }));
      map.add(obstacle({ id: 'normal', x: 50, y: 50, width: 40, height: 40 }));

      const found = withinBudget('queryRegion', 1000, () =>
        map.queryRegion({ x: 40, y: 40, width: 80, height: 80 })
      );

      expect(found.map((o) => o.id).sort()).toEqual(['huge', 'normal']);
    });

    it('removing an unindexable obstacle drops it', () => {
      const map = new ObstacleMap();
      map.add(obstacle({ id: 'huge', width: Infinity }));
      expect(map.remove('huge')).toBe(true);
      expect(map.queryRegion({ x: 0, y: 0, width: 100, height: 100 })).toEqual([]);
    });

    it('clear() forgets unindexable obstacles too', () => {
      const map = new ObstacleMap();
      map.add(obstacle({ id: 'huge', width: Infinity }));
      map.clear();
      expect(map.queryRegion({ x: 0, y: 0, width: 100, height: 100 })).toEqual([]);
    });
  });
});
