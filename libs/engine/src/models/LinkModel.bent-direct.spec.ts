/**
 * A 'direct' line the router BENT is not a chord any more.
 *
 * A straight line between two boxes is a `direct` link with two points. When a
 * box moves behind another one, the router detours it — the link keeps its
 * type and gains bends. `getPointAtPosition` and `getTangentAt` still answered
 * from the chord between the first and last point, so a label at 0.5 landed in
 * open space between the two ends ("sends the payment link" 90 px off its line
 * in the AI-style demo, after "Our API" was dragged out of its zone).
 */
import { LinkModel } from './LinkModel';

describe("a bent 'direct' line answers from its points, not the chord", () => {
  // 370,438 → 190,438 → 190,288 → 170,288 — the demo's route after the drag
  const bent = () => {
    const link = new LinkModel('a', 'b', 'direct');
    link.setPoints([
      { x: 370, y: 438 },
      { x: 190, y: 438 },
      { x: 190, y: 288 },
      { x: 170, y: 288 },
    ]);
    return link;
  };

  it('the point at 0.5 is ON the line, half way along it', () => {
    // total 180 + 150 + 20 = 350 → 175 along: the first run, 5 px before its corner
    const p = bent().getPointAtPosition(0.5)!;
    expect(p.x).toBeCloseTo(195, 5);
    expect(p.y).toBeCloseTo(438, 5);
  });

  it('the tangent at 0.5 is the direction of the run the point is on', () => {
    const t = bent().getTangentAt(0.5)!;
    expect(t.x).toBeCloseTo(-1, 5);
    expect(t.y).toBeCloseTo(0, 5);
    const up = bent().getTangentAt(0.7)!; // 245 along: the vertical run
    expect(up.x).toBeCloseTo(0, 5);
    expect(up.y).toBeCloseTo(-1, 5);
  });

  it('a two-point direct line is still its chord', () => {
    const link = new LinkModel('a', 'b', 'direct');
    link.setPoints([{ x: 0, y: 0 }, { x: 100, y: 50 }]);
    expect(link.getPointAtPosition(0.5)).toEqual({ x: 50, y: 25 });
    const t = link.getTangentAt(0.5)!;
    expect(t.x).toBeCloseTo(100 / Math.hypot(100, 50), 5);
  });
});

/**
 * The renderer writes a line's painted points straight onto `link.points` (no
 * setPoints, so no change event per frame) and leaves `segments` describing the
 * line as it was. A label asked the stale segments where half way was, and
 * stayed behind when a box moved — found by the lines-follow gate on the draw.io
 * import demo ("yes" 86 px off its line after "check" was dragged).
 */
describe('a line whose points moved under its segments answers from the points', () => {
  const moved = () => {
    const link = new LinkModel('a', 'b', 'orthogonal');
    link.setPoints([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]); // segments built from these
    link.points = [{ x: 0, y: 200 }, { x: 0, y: 500 }]; // the renderer's direct write: now it runs DOWN
    return link;
  };

  it('the point half way along is on the NEW line', () => {
    expect(moved().getPointAtPosition(0.5)).toEqual({ x: 0, y: 350 }); // the old segments say (100, 0)
  });

  it('and so is the direction there', () => {
    const t = moved().getTangentAt(0.5)!;
    expect(t.x).toBeCloseTo(0, 5); // the old segments say level, (1, 0)
    expect(t.y).toBeCloseTo(1, 5);
  });

  it('segments that still trace the points are used as before (a curve keeps its curve)', () => {
    const link = new LinkModel('a', 'b', 'orthogonal');
    link.setPoints([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]);
    expect(link.getPointAtPosition(0.5)).toEqual({ x: 100, y: 0 });
  });
});

