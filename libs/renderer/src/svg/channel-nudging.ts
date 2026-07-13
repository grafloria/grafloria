// Wave 5 (Edge routing) — Card 4: parallel-edge nudging / channel routing.
//
// Wave 4's fan-out separates links of the SAME node pair. This pass separates
// the other kind of stack: edges of DIFFERENT pairs whose orthogonal segments
// share a corridor — coincident (or near-coincident) collinear runs that today
// draw on top of each other and read as one line.
//
// Scope is deliberately tight, because this runs inside the render loop:
//
//   • Only segments closer than `trigger` px cluster (default 4): the pass
//     separates what is VISUALLY ON TOP of each other, and leaves deliberate
//     16px-apart parallel runs (e.g. wave-4 fanned bundles) alone.
//   • Only INTERIOR orthogonal segments move. Port stubs never move — the
//     Card 1 jetty guarantee outranks lane separation.
//   • A member whose slide would shrink or REVERSE an adjacent segment is
//     PINNED (its lane is wherever it already is) and the ladder shifts to
//     accommodate it; two conflicting pinned members abort the cluster.
//
// Card 5 preview — lane ORDER inside a corridor is chosen by each member's
// EXIT barycentre (where its route continues on the perpendicular axis), so
// members leave the corridor on the side they entered it for: corridor-mates
// stop crossing each other at the corridor mouth. Deterministic tie-break by
// link id.

/** Structural point — same shape link-fanout uses; no cross-lib import needed. */
export interface NudgePoint {
  x: number;
  y: number;
}

export interface ChannelNudgeOptions {
  /** Segments closer than this cluster into one corridor. */
  trigger: number;
  /** Distance between adjacent lanes after separation. */
  spacing: number;
}

export interface ChannelNudgeResult {
  /** linkId → (segment start index → ordinate delta) */
  deltas: Map<string, Map<number, number>>;
  /** corridors that produced lane assignments */
  clustersNudged: number;
  /** corridors skipped because two pinned members conflicted */
  clustersSkipped: number;
}

interface Member {
  linkId: string;
  segIndex: number;
  axis: 'h' | 'v';
  /** y for horizontal runs, x for vertical runs */
  ord: number;
  lo: number;
  hi: number;
  /** where the route continues on the ordinate axis — the lane-order key */
  exitKey: number;
  /** stubs and slide-unsafe segments cannot move */
  pinned: boolean;
  /** how far this member may move in each direction before an adjacent
   * segment reverses (Infinity when free) */
  slack: { minus: number; plus: number };
}

const EPS = 1e-6;

/**
 * Compute lane deltas for every corridor in the frame.
 *
 * `routes` are the frame's routed polylines (post same-pair fan-out); only
 * links present in the map participate. The caller applies the deltas by
 * sliding each segment along its normal — both endpoints move, the
 * perpendicular neighbours stretch, orthogonality is preserved.
 */
export function computeChannelNudges(
  routes: ReadonlyMap<string, readonly NudgePoint[]>,
  options: ChannelNudgeOptions
): ChannelNudgeResult {
  const members: Member[] = [];

  for (const [linkId, pts] of routes) {
    if (pts.length < 2) continue;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const horizontal = Math.abs(a.y - b.y) < EPS && Math.abs(a.x - b.x) > EPS;
      const vertical = Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) > EPS;
      if (!horizontal && !vertical) continue; // diagonal: not corridor material

      const axis: 'h' | 'v' = horizontal ? 'h' : 'v';
      const ord = horizontal ? a.y : a.x;
      const lo = horizontal ? Math.min(a.x, b.x) : Math.min(a.y, b.y);
      const hi = horizontal ? Math.max(a.x, b.x) : Math.max(a.y, b.y);

      // Port stubs (first/last segment) never move: the jetty guarantee wins.
      const isStub = i === 0 || i === pts.length - 2;

      // Slide slack: an adjacent perpendicular segment of length L tolerates a
      // slide of up to L−1 toward its own far end before it reverses.
      const slack = { minus: Infinity, plus: Infinity };
      const clampBy = (fixedOrd: number) => {
        // neighbour runs from `ord` to `fixedOrd` on the ordinate axis
        const len = fixedOrd - ord;
        if (len > EPS) {
          // neighbour extends toward +: sliding + shrinks it
          slack.plus = Math.min(slack.plus, len - 1);
        } else if (len < -EPS) {
          slack.minus = Math.min(slack.minus, -len - 1);
        } else {
          // zero-length neighbour: any slide reverses it
          slack.plus = Math.min(slack.plus, 0);
          slack.minus = Math.min(slack.minus, 0);
        }
      };
      if (i > 0) {
        const prev = pts[i - 1];
        clampBy(horizontal ? prev.y : prev.x);
      }
      if (i + 2 < pts.length) {
        const next = pts[i + 2];
        clampBy(horizontal ? next.y : next.x);
      }

      // Exit barycentre: where this link's route sits on the ordinate axis just
      // outside the corridor — the crossing-minimizing lane-order key.
      const exits: number[] = [];
      if (i > 0) exits.push(horizontal ? pts[i - 1].y : pts[i - 1].x);
      if (i + 2 < pts.length) exits.push(horizontal ? pts[i + 2].y : pts[i + 2].x);
      const exitKey = exits.length ? exits.reduce((s, v) => s + v, 0) / exits.length : ord;

      members.push({
        linkId,
        segIndex: i,
        axis,
        ord,
        lo,
        hi,
        exitKey,
        pinned: isStub,
        slack,
      });
    }
  }

  // ---- cluster: same axis, ords within trigger, spans overlapping ----------
  const result: ChannelNudgeResult = {
    deltas: new Map(),
    clustersNudged: 0,
    clustersSkipped: 0,
  };

  for (const axis of ['h', 'v'] as const) {
    const pool = members.filter((m) => m.axis === axis).sort((a, b) => a.ord - b.ord || (a.linkId < b.linkId ? -1 : 1));
    const used = new Array(pool.length).fill(false);

    for (let i = 0; i < pool.length; i++) {
      if (used[i]) continue;
      const cluster = [pool[i]];
      used[i] = true;
      // grow while the next ord is within trigger of ANY member and spans overlap
      let grown = true;
      while (grown) {
        grown = false;
        for (let j = 0; j < pool.length; j++) {
          if (used[j]) continue;
          const c = pool[j];
          const near = cluster.some(
            (m) => Math.abs(m.ord - c.ord) <= options.trigger && Math.min(m.hi, c.hi) - Math.max(m.lo, c.lo) > EPS
          );
          if (near) {
            cluster.push(c);
            used[j] = true;
            grown = true;
          }
        }
      }

      // one link's own segments never nudge against themselves; a corridor is
      // only a corridor with ≥2 DISTINCT links
      const distinct = new Set(cluster.map((m) => m.linkId));
      if (cluster.length < 2 || distinct.size < 2) continue;

      // ---- lane order: exit barycentre, tie-broken by link id ---------------
      cluster.sort((a, b) => a.exitKey - b.exitKey || (a.linkId < b.linkId ? -1 : 1) || a.segIndex - b.segIndex);

      const n = cluster.length;
      const centre = cluster.reduce((s, m) => s + m.ord, 0) / n;
      // target ordinates: centre + (idx − (n−1)/2)·spacing, then shifted so any
      // pinned member lands exactly where it already is
      const base = (idx: number) => centre + (idx - (n - 1) / 2) * options.spacing;

      const pinnedMembers = cluster
        .map((m, idx) => ({ m, idx }))
        .filter(({ m }) => m.pinned);

      let shift = 0;
      if (pinnedMembers.length === 1) {
        const { m, idx } = pinnedMembers[0];
        shift = m.ord - base(idx);
      } else if (pinnedMembers.length > 1) {
        // Two immovable members: satisfiable only if the ladder already fits
        // both — check the first two; anything else aborts the corridor.
        const [p0, p1] = pinnedMembers;
        const s0 = p0.m.ord - base(p0.idx);
        const s1 = p1.m.ord - base(p1.idx);
        if (Math.abs(s0 - s1) > EPS) {
          result.clustersSkipped++;
          continue;
        }
        shift = s0;
      }

      // ---- slack check: every movable member must tolerate its delta ---------
      const plan: Array<{ m: Member; delta: number }> = [];
      let feasible = true;
      cluster.forEach((m, idx) => {
        const delta = base(idx) + shift - m.ord;
        if (Math.abs(delta) < EPS) return;
        if (m.pinned) {
          feasible = false; // a pinned member was asked to move
          return;
        }
        if (delta > 0 && delta > m.slack.plus) feasible = false;
        if (delta < 0 && -delta > m.slack.minus) feasible = false;
        plan.push({ m, delta });
      });
      if (!feasible) {
        result.clustersSkipped++;
        continue;
      }
      if (plan.length === 0) continue;

      for (const { m, delta } of plan) {
        let perLink = result.deltas.get(m.linkId);
        if (!perLink) {
          perLink = new Map();
          result.deltas.set(m.linkId, perLink);
        }
        perLink.set(m.segIndex, delta);
      }
      result.clustersNudged++;
    }
  }

  return result;
}

/**
 * Apply a link's segment deltas to its polyline: each nudged segment's BOTH
 * endpoints move along the ordinate axis, the perpendicular neighbours stretch.
 * Returns a new array; the input is not mutated.
 */
export function applyChannelNudges(
  points: readonly NudgePoint[],
  deltas: ReadonlyMap<number, number> | undefined
): NudgePoint[] {
  const out = points.map((p) => ({ ...p }));
  if (!deltas || deltas.size === 0) return out;
  for (const [segIndex, delta] of deltas) {
    const a = out[segIndex];
    const b = out[segIndex + 1];
    if (!a || !b) continue;
    if (Math.abs(a.y - b.y) < EPS) {
      a.y += delta;
      b.y += delta;
    } else if (Math.abs(a.x - b.x) < EPS) {
      a.x += delta;
      b.x += delta;
    }
  }
  return out;
}
