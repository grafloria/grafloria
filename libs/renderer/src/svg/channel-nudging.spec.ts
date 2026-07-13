// Wave 5 (Edge routing) — Card 4: channel nudging.
//
// The contract under test: coincident interior segments of DIFFERENT links
// separate onto lanes spaced by `spacing`, symmetric about the corridor centre;
// lane ORDER follows each member's exit side (corridor-mates stop crossing at
// the mouth); port stubs never move; unsafe slides pin or abort; and anything
// farther apart than `trigger` — including wave-4 fanned bundles — is untouched.

import { computeChannelNudges, applyChannelNudges, NudgePoint } from './channel-nudging';

const OPTS = { trigger: 4, spacing: 16 };

/** An orthogonal route through the given points. */
const route = (...pts: Array<[number, number]>): NudgePoint[] => pts.map(([x, y]) => ({ x, y }));

function nudgedOrd(
  routes: Map<string, NudgePoint[]>,
  linkId: string,
  segIndex: number,
  axis: 'h' | 'v'
): number {
  const { deltas } = computeChannelNudges(routes, OPTS);
  const pts = applyChannelNudges(routes.get(linkId)!, deltas.get(linkId));
  return axis === 'h' ? pts[segIndex].y : pts[segIndex].x;
}

describe('channel nudging (Wave 5, Card 4)', () => {
  it('separates two coincident interior horizontal runs to one spacing apart, symmetric about the corridor', () => {
    // Both links run a long horizontal interior segment on y=100.
    const routes = new Map<string, NudgePoint[]>([
      ['a', route([0, 40], [30, 40], [30, 100], [300, 100], [300, 160], [330, 160])],
      ['b', route([0, 220], [30, 220], [30, 100], [300, 100], [300, 40], [330, 40])],
    ]);
    const { deltas, clustersNudged } = computeChannelNudges(routes, OPTS);
    expect(clustersNudged).toBeGreaterThanOrEqual(1);

    const aPts = applyChannelNudges(routes.get('a')!, deltas.get('a'));
    const bPts = applyChannelNudges(routes.get('b')!, deltas.get('b'));
    const aY = aPts[2].y; // corridor segment of a: index 2→3
    const bY = bPts[2].y;
    expect(Math.abs(aY - bY)).toBeCloseTo(OPTS.spacing, 6);
    // symmetric about the shared original ordinate
    expect((aY + bY) / 2).toBeCloseTo(100, 6);
    // orthogonality survives the slide
    for (const pts of [aPts, bPts]) {
      for (let i = 1; i < pts.length; i++) {
        expect(pts[i - 1].x === pts[i].x || pts[i - 1].y === pts[i].y).toBe(true);
      }
    }
  });

  it('lane ORDER follows the exits: the link continuing upward takes the upper lane (no crossing at the mouth)', () => {
    // a enters from y=40 and leaves to y=40 (upward exits); b enters/leaves at 220.
    const routes = new Map<string, NudgePoint[]>([
      ['a', route([0, 40], [30, 40], [30, 100], [300, 100], [300, 40], [330, 40])],
      ['b', route([0, 220], [30, 220], [30, 100], [300, 100], [300, 220], [330, 220])],
    ]);
    const { deltas } = computeChannelNudges(routes, OPTS);
    const aY = applyChannelNudges(routes.get('a')!, deltas.get('a'))[2].y;
    const bY = applyChannelNudges(routes.get('b')!, deltas.get('b'))[2].y;
    // a's exits are ABOVE b's exits → a must take the upper lane
    expect(aY).toBeLessThan(bY);
  });

  it('port stubs never move: a corridor formed with a first/last segment pins to the stub', () => {
    // b's COINCIDENT segment is its first (stub) segment — it must stay at
    // y=100 and a must take the whole separation.
    const routes = new Map<string, NudgePoint[]>([
      ['a', route([0, 40], [30, 40], [30, 100], [300, 100], [300, 160], [330, 160])],
      ['b', route([0, 100], [300, 100], [300, 260])],
    ]);
    const { deltas } = computeChannelNudges(routes, OPTS);
    // b segment 0 is a stub: no delta may exist for it
    expect(deltas.get('b')?.get(0)).toBeUndefined();
    const bPts = applyChannelNudges(routes.get('b')!, deltas.get('b'));
    expect(bPts[0].y).toBe(100);
    expect(bPts[1].y).toBe(100);
    // a moved off the corridor by the full spacing
    const aY = applyChannelNudges(routes.get('a')!, deltas.get('a'))[2].y;
    expect(Math.abs(aY - 100)).toBeCloseTo(OPTS.spacing, 6);
  });

  it('two pinned members that disagree abort the corridor instead of half-moving it', () => {
    // BOTH coincident segments are stubs → nothing can move; corridor skipped.
    const routes = new Map<string, NudgePoint[]>([
      ['a', route([0, 100], [300, 100], [300, 200])],
      ['b', route([20, 100], [320, 100], [320, 260])],
    ]);
    const { deltas, clustersSkipped } = computeChannelNudges(routes, OPTS);
    expect(clustersSkipped).toBeGreaterThanOrEqual(1);
    expect(deltas.size).toBe(0);
  });

  it('deliberate 16px-apart parallel runs (a fanned bundle) are NOT grabbed by the trigger', () => {
    // NOTE the verticals are kept apart too (x=300 vs x=340) — an earlier
    // version of this fixture accidentally made them coincide, and the module
    // CORRECTLY separated them, failing the test for the right reason.
    const routes = new Map<string, NudgePoint[]>([
      ['a', route([0, 40], [30, 40], [30, 92], [300, 92], [300, 160], [330, 160])],
      ['b', route([0, 220], [60, 220], [60, 108], [340, 108], [340, 40], [370, 40])],
    ]);
    const { deltas, clustersNudged } = computeChannelNudges(routes, OPTS);
    expect(clustersNudged).toBe(0);
    expect(deltas.size).toBe(0);
  });

  it('same-ordinate segments with NON-overlapping spans are different corridors, not one', () => {
    const routes = new Map<string, NudgePoint[]>([
      ['a', route([0, 40], [30, 40], [30, 100], [120, 100], [120, 160], [150, 160])],
      ['b', route([200, 40], [230, 40], [230, 100], [320, 100], [320, 160], [350, 160])],
    ]);
    const { deltas } = computeChannelNudges(routes, OPTS);
    expect(deltas.size).toBe(0);
  });

  it("one link's own segments never form a corridor against themselves", () => {
    // a U-shaped single link with two overlapping horizontal runs 2px apart
    const routes = new Map<string, NudgePoint[]>([
      ['only', route([0, 0], [200, 0], [200, 2], [0, 2])],
    ]);
    const { deltas, clustersNudged } = computeChannelNudges(routes, OPTS);
    expect(clustersNudged).toBe(0);
    expect(deltas.size).toBe(0);
  });

  it('three-link corridors ladder deterministically: repeat runs give identical deltas', () => {
    const routes = new Map<string, NudgePoint[]>([
      ['a', route([0, 20], [30, 20], [30, 100], [300, 100], [300, 20], [330, 20])],
      ['b', route([0, 120], [30, 120], [30, 100], [300, 100], [300, 120], [330, 120])],
      ['c', route([0, 240], [30, 240], [30, 100], [300, 100], [300, 240], [330, 240])],
    ]);
    const r1 = computeChannelNudges(routes, OPTS);
    const r2 = computeChannelNudges(routes, OPTS);
    const flat = (r: typeof r1) =>
      JSON.stringify([...r.deltas].map(([id, m]) => [id, [...m]]).sort());
    expect(flat(r1)).toBe(flat(r2));
    // and the ladder is centred: mean displacement ≈ 0
    const all = [...r1.deltas.values()].flatMap((m) => [...m.values()]);
    const mean = all.reduce((s, v) => s + v, 0) / all.length;
    expect(Math.abs(mean)).toBeLessThan(1e-6);
  });
});
