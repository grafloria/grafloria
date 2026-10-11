/**
 * S1 (docs review v4): a link's label stopped following its wire after a
 * reconnect was undone.
 *
 * The reconnect generated `segments` for the route to the new target; the undo
 * put the target back, and the renderer synced the painted `points` straight
 * onto the link (it never rewrites `segments`). `getPointAtPosition` already
 * answers from `points` when the two disagree, but `getClosestPoint` still
 * walked the STALE segments: a label dragged along the wire got its fraction
 * from the old route (0.3) and an offset that made up the difference (92 px),
 * so the next node drag carried it off the line.
 *
 * Rule: `getClosestPoint` uses the same parametrization as
 * `getPointAtPosition`, so `getPointAtPosition(getClosestPoint(p).t)` is the
 * on-line point nearest p — whatever `segments` say.
 */
import { LinkModel } from './LinkModel';

function reconnectedThenUndone(pathType: 'direct' | 'orthogonal' | 'smooth'): LinkModel {
  const link = new LinkModel('a', 'b', pathType);
  // The reconnect's route, to C.
  link.generatePath({ x: 140, y: 110 }, { x: 560, y: 270 }, 'right', 'left');
  // The undo: the renderer paints A→B again and syncs points only.
  link.points = [
    { x: 140, y: 110 },
    { x: 300, y: 110 },
  ];
  return link;
}

describe('getClosestPoint answers from the line, not from stale segments', () => {
  for (const pathType of ['direct', 'orthogonal', 'smooth'] as const) {
    it(`${pathType}: a point on the painted line maps back onto itself`, () => {
      const link = reconnectedThenUndone(pathType);
      const onLine = { x: 280, y: 110 };
      const hit = link.getClosestPoint(onLine)!;
      expect(hit).not.toBeNull();
      expect(hit.t).toBeCloseTo(0.875, 2);
      const anchor = link.getPointAtPosition(hit.t)!;
      expect(anchor.x).toBeCloseTo(280, 0);
      expect(anchor.y).toBeCloseTo(110, 0);
      expect(hit.distance).toBeCloseTo(0, 1);
    });
  }

  it('fresh segments are still used (a curve keeps its curve)', () => {
    const link = new LinkModel('a', 'b', 'smooth');
    link.generatePath({ x: 0, y: 0 }, { x: 200, y: 100 });
    const mid = link.getPointAtPosition(0.5)!;
    const hit = link.getClosestPoint(mid)!;
    expect(hit.distance).toBeLessThan(1);
    expect(hit.t).toBeCloseTo(0.5, 1);
  });

  it('a link with points but no segments still answers', () => {
    const link = new LinkModel('a', 'b', 'direct');
    link.points = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    expect(link.getClosestPoint({ x: 25, y: 10 })!.t).toBeCloseTo(0.25, 5);
  });
});
