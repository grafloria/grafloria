/**
 * GridPackEngine — the acceptance suite.
 *
 * Every rule here traces to an EMPIRICAL source, not to reading code:
 *   E1/E2/E3/E4b/E4c — recorded from the real gridstackjs.com demos (web1 +
 *   web2 driven with Playwright, gs-x/gs-y read at every stage);
 *   S1/S2/S3 — the three user-review rounds on the interactive prototype
 *   (documentation/api-architecture/dashboard-grid-plan.html), each of which
 *   found a real defect the previous engine draft had.
 *
 * The board pictures below use the prototype's seed so a failure reads
 * against the exact scenario the user drove:
 *
 *   columns: 12
 *   t1(0,0 3×1) t2(3,0 3×1) t3(6,0 3×1) t4(9,0 3×1)
 *   t5(0,1 8×2) t6(8,1 4×2)
 *   pin(0,3 12×1, locked)
 */
import { GridPackEngine, GridPackItem } from './grid-pack-engine';

const SEED: GridPackItem[] = [
  { id: 't1', x: 0, y: 0, w: 3, h: 1 },
  { id: 't2', x: 3, y: 0, w: 3, h: 1 },
  { id: 't3', x: 6, y: 0, w: 3, h: 1 },
  { id: 't4', x: 9, y: 0, w: 3, h: 1 },
  { id: 't5', x: 0, y: 1, w: 8, h: 2 },
  { id: 't6', x: 8, y: 1, w: 4, h: 2 },
  { id: 'pin', x: 0, y: 3, w: 12, h: 1, locked: true },
];

const cells = (e: GridPackEngine, id: string): [number, number] => {
  const it = e.getItem(id)!;
  return [it.x, it.y];
};

function seeded(float = false): GridPackEngine {
  return new GridPackEngine(SEED, { columns: 12, float });
}

describe('GridPackEngine — placement and gravity', () => {
  it('seeds verbatim when the layout is already legal, zero overlaps', () => {
    const e = seeded();
    for (const s of SEED) expect(cells(e, s.id)).toEqual([s.x, s.y]);
    expect(e.hasOverlaps()).toBe(false);
    expect(e.rows()).toBe(4);
  });

  it('add() packs a new tile up into the first hole (gravity)', () => {
    const e = seeded();
    e.remove('t2'); // hole at (3,0)
    const added = e.add({ id: 'new', x: 0, y: 0, w: 3, h: 1, autoPosition: true })!;
    expect([added.x, added.y]).toEqual([3, 0]);
    expect(e.hasOverlaps()).toBe(false);
  });

  it('add() never materialises an overlap even when aimed at an occupied cell', () => {
    const e = seeded();
    e.add({ id: 'new', x: 0, y: 0, w: 3, h: 1 });
    expect(e.hasOverlaps()).toBe(false);
  });

  it('remove() closes the gap: survivors climb (gravity)', () => {
    const e = seeded();
    e.remove('t5');
    // t6 keeps its column but the pin cannot move; the row-1 hole is filled by
    // nothing 8-wide — t6 itself climbs to row... it is already at y1. The
    // load-bearing claim: no overlap and the pinned row did not move.
    expect(e.hasOverlaps()).toBe(false);
    expect(cells(e, 'pin')).toEqual([0, 3]);
  });

  it('float mode: gaps are legal — nothing packs', () => {
    const e = new GridPackEngine(
      [
        { id: 'a', x: 0, y: 3, w: 2, h: 1 }, // floating with empty rows above
      ],
      { float: true }
    );
    expect(cells(e, 'a')).toEqual([0, 3]);
  });
});

describe('E4b — a locked tile refuses the mover outright', () => {
  it('moveCheck onto the pinned row is refused; the board is untouched', () => {
    const e = seeded();
    e.beginGesture();
    const r = e.moveCheck('t2', 3, 3); // straight onto the pin
    expect(r.changed).toBe(false);
    for (const s of SEED) expect(cells(e, s.id)).toEqual([s.x, s.y]);
    e.endGesture();
  });

  it('the refusal is the LOCKED rule, not the coverage gate wearing its coat', () => {
    // t2 (3×1) covers only 25% of the 12-wide pin — the gate refuses that on
    // its own, so it cannot distinguish the two rules. t5 (8×2) at (0,2)
    // covers 66% of the pin: the gate PASSES, and only the locked refusal can
    // stop the move. Deleting the refusal turned this exact case into a
    // persistent overlap with the pinned row (mutation round 1 proved the
    // weaker spec missed it).
    const e = seeded();
    e.beginGesture();
    const r = e.moveCheck('t5', 0, 2);
    expect(r.changed).toBe(false);
    expect(cells(e, 't5')).toEqual([0, 1]);
    expect(e.hasOverlaps()).toBe(false);
    e.endGesture();
  });

  it('a locked tile itself cannot be move-checked', () => {
    const e = seeded();
    expect(e.moveCheck('pin', 0, 0).changed).toBe(false);
  });

  it('resize growth CLAMPS at a locked tile instead of covering it', () => {
    const e = seeded();
    e.beginGesture();
    // t5 is 8×2 ending at row 3 (the pinned row). Growing h to 4 would cover
    // the pin: clamp keeps h at 2 (no change at all → refused).
    expect(e.resizeCheck('t5', 8, 4).changed).toBe(false);
    expect(e.getItem('t5')!.h).toBe(2);
    e.endGesture();
  });
});

describe('the anti-jitter coverage gate', () => {
  it('refuses a push at ≤50% coverage of the static tile', () => {
    const e = seeded();
    e.beginGesture();
    // t1(3 wide) moved right by 1: covers 2 of t2's 3 columns... that is >50%.
    // Moved right by exactly enough to cover 1 of 3 (33%) — build that case:
    // give t1 a 1-column overlap with t2 via x=1 → covers cols 3 only? t1 at
    // x1 spans 1..4, t2 spans 3..6 → overlap 1 col of 3 = 33% → refused.
    const r = e.moveCheck('t1', 1, 0);
    expect(r.changed).toBe(false);
    expect(cells(e, 't2')).toEqual([3, 0]);
    e.endGesture();
  });
});

describe('first-placement mode — moveCheck({ gate: false })', () => {
  // The dashboard kit's drag-in path (palette entry, drag-out re-entry):
  // gridstack's dragInNode takes the cursor cell on entry without the
  // anti-jitter gate — the tile has no meaningful previous cell to gate or
  // swap against. Mutation-proven (each mutant run and seen red):
  //   M1  `options.gate === false ? undefined : this.collide(...)` →
  //       `this.collide(...)` unconditionally — both accept-tests below fail
  //       (the 33% placement is refused; the same-size occupant swaps).
  //   M2  deleting the collideLocked refusal → the E4b test below fails.
  it('takes a 33%-covered cell the gate would refuse, and pushes the occupant', () => {
    const e = seeded();
    e.beginGesture();
    const gated = e.moveCheck('t1', 1, 0);
    expect(gated.changed).toBe(false); // the gate's own verdict, unchanged
    const r = e.moveCheck('t1', 1, 0, { gate: false });
    expect(r.changed).toBe(true);
    expect(cells(e, 't1')).toEqual([1, 0]);
    expect(e.getItem('t2')!.y).toBeGreaterThan(0); // pushed, not refused
    expect(e.hasOverlaps()).toBe(false);
    e.endGesture();
  });

  it('skips the swap heuristic: a same-size occupant is PUSHED, never exchanged', () => {
    const e = seeded();
    e.beginGesture();
    const r = e.moveCheck('t1', 3, 0, { gate: false }); // exactly onto t2 (same 3×1)
    expect(r.changed).toBe(true);
    expect(cells(e, 't1')).toEqual([3, 0]);
    expect(cells(e, 't2')).not.toEqual([0, 0]); // NOT swapped into t1's old cell
    expect(e.getItem('t2')!.y).toBeGreaterThan(0); // pushed below instead
    expect(e.hasOverlaps()).toBe(false);
    e.endGesture();
  });

  it('still refuses a locked tile outright (E4b holds without the gate)', () => {
    const e = seeded();
    e.beginGesture();
    const r = e.moveCheck('t1', 0, 3, { gate: false }); // onto the pinned row
    expect(r.changed).toBe(false);
    expect(cells(e, 't1')).toEqual([0, 0]);
    expect(cells(e, 'pin')).toEqual([0, 3]);
    e.endGesture();
  });
});

describe('E3/S1 — same-size swap', () => {
  it('swaps cleanly and exchanges CELLS exactly', () => {
    const e = seeded();
    e.beginGesture();
    const r = e.moveCheck('t1', 2, 0); // t1 covers 2 of t2's 3 cols (66%)
    expect(r.changed).toBe(true);
    expect(cells(e, 't1')).toEqual([3, 0]); // c's cell, NOT the probe cell 2
    expect(cells(e, 't2')).toEqual([0, 0]);
    expect(e.hasOverlaps()).toBe(false);
    e.endGesture();
  });

  it('S1 wiggle: swap forward, retreat, swap again — never an overlap', () => {
    const e = seeded();
    e.beginGesture();
    e.moveCheck('t1', 2, 0); // swap with t2
    e.moveCheck('t1', 0, 0); // retreat home (t2 restores via memory)
    e.moveCheck('t1', 4, 0); // forward again onto t2's home region
    e.moveCheck('t1', 5, 0); // straddle t3's edge — the probe-cell bug's trigger
    expect(e.hasOverlaps()).toBe(false);
    e.endGesture();
    expect(e.hasOverlaps()).toBe(false);
  });
});

describe('S3 — the other two swap shapes + the min-area gate', () => {
  it('row swap: 8-wide t5 dragged onto 4-wide t6 exchanges horizontal order', () => {
    const e = seeded();
    e.beginGesture();
    // move t5 right so it covers most of t6 (same row y=1, same h=2)
    const r = e.moveCheck('t5', 4, 1);
    expect(r.changed).toBe(true);
    expect(cells(e, 't6')).toEqual([0, 1]); // t6 took the left edge
    expect(cells(e, 't5')).toEqual([4, 1]); // t5 sits after t6 — union span kept
    expect(e.hasOverlaps()).toBe(false);
    e.endGesture();
  });

  it('min-area gate: the 4-wide can displace the 8-wide too (small onto big)', () => {
    const e = seeded();
    e.beginGesture();
    // t6 (4×2) moved left onto t5 (8×2): covers 4×2=8 cells of t5's 16 = 50%
    // of the BIG tile, but 100% of its own area → must trigger the row swap.
    const r = e.moveCheck('t6', 4, 1);
    expect(r.changed).toBe(true);
    expect(cells(e, 't6')).toEqual([0, 1]);
    expect(cells(e, 't5')).toEqual([4, 1]);
    expect(e.hasOverlaps()).toBe(false);
    e.endGesture();
  });

  it('column swap: stacked same-width tiles exchange vertical order', () => {
    const e = new GridPackEngine(
      [
        { id: 'top', x: 0, y: 0, w: 4, h: 1 },
        { id: 'bot', x: 0, y: 1, w: 4, h: 2 },
      ],
      { columns: 12 }
    );
    e.beginGesture();
    const r = e.moveCheck('bot', 0, 0);
    expect(r.changed).toBe(true);
    expect(cells(e, 'bot')).toEqual([0, 0]);
    expect(cells(e, 'top')).toEqual([0, 2]); // below bot's 2 rows
    expect(e.hasOverlaps()).toBe(false);
    e.endGesture();
  });
});

describe('S4 — swap hysteresis (no ping-pong on unequal pairs)', () => {
  // Found by driving the real demo board with a REAL mouse: a slow sweep of
  // the 4-wide across the 8-wide swapped on EVERY cell crossing (the row swap
  // drops the mover at the row edge, far from the cursor, so the next
  // crossing still covers the partner and instantly swaps back). An accepted
  // swap locks the pair for the gesture; re-swap needs a deliberate return —
  // the probe centre reaching the partner's centre. Mutation-proven:
  //   M3  never setting `swapLock` (or short-circuiting the lock check) →
  //       'a slow sweep…swaps once and HOLDS' fails at the first re-probe.
  it('a slow sweep across an unequal partner swaps once and HOLDS', () => {
    const e = seeded();
    e.beginGesture();
    expect(e.moveCheck('t6', 4, 1).changed).toBe(true); // recorded S3 acceptance
    expect(cells(e, 't6')).toEqual([0, 1]);
    expect(cells(e, 't5')).toEqual([4, 1]);
    // The cursor keeps sweeping through the partner's area: every one of
    // these crossings used to swap back. Now the pair is locked.
    for (const x of [5, 4, 3, 2]) {
      expect(e.moveCheck('t6', x, 1).changed).toBe(false);
      expect(cells(e, 't6')).toEqual([0, 1]);
      expect(cells(e, 't5')).toEqual([4, 1]);
    }
    e.endGesture();
  });

  it('a DELIBERATE return — probe centre past the partner centre — swaps back', () => {
    const e = seeded();
    e.beginGesture();
    e.moveCheck('t6', 4, 1); // t6 -> 0, t5 -> 4..12 (centre 8)
    // probe x6 puts t6's centre at 8 = t5's centre: the return is deliberate.
    expect(e.moveCheck('t6', 6, 1).changed).toBe(true);
    expect(cells(e, 't6')).toEqual([8, 1]);
    expect(cells(e, 't5')).toEqual([0, 1]);
    expect(e.hasOverlaps()).toBe(false);
    e.endGesture();
  });

  it('the lock dies with the gesture (E2 scope): a fresh gesture swaps freely', () => {
    const e = seeded();
    e.beginGesture();
    e.moveCheck('t6', 4, 1);
    expect(e.moveCheck('t6', 5, 1).changed).toBe(false); // locked
    e.endGesture();
    e.beginGesture();
    expect(e.moveCheck('t6', 5, 1).changed).toBe(true); // fresh gesture, normal gate
    expect(e.hasOverlaps()).toBe(false);
    e.endGesture();
  });
});

describe('push + skipDown', () => {
  it('a push cascade never buries the pinned row — pushed tiles jump below it', () => {
    const e = seeded();
    e.beginGesture();
    // Drop t1 (3×1) onto t5's area with >50% of... t5 is 8×2: t1 covers at
    // most 3 cells of 16 — gate refuses. Grow t1 first so it can push t5:
    e.resizeCheck('t1', 8, 1); // t1 widens over t2+t3 → they push/settle
    expect(e.hasOverlaps()).toBe(false);
    e.moveCheck('t1', 0, 1);   // now same-width row?? t5 is 8×2 at (0,1): colSwap shape (same w, same x)
    expect(e.hasOverlaps()).toBe(false);
    // pinned row untouched through every cascade above
    expect(cells(e, 'pin')).toEqual([0, 3]);
    e.endGesture();
  });

  it('pushDown recursion resolves multi-tile chains without overlap', () => {
    const e = seeded();
    e.beginGesture();
    // Grow t5 one row taller is refused (pin). Push sideways instead: move t6
    // left to overlap t5 at 50% of itself → row swap; then drag t2 down onto
    // the row-1 region to force pushes.
    e.moveCheck('t6', 4, 1);
    e.moveCheck('t2', 4, 1); // t2 (3×1) onto t5's new area (4..12): covers 3 of 16 — refused (gate)
    expect(e.hasOverlaps()).toBe(false);
    e.endGesture();
  });
});

describe('E1/E4c/S2 — displaced tiles return', () => {
  it('E1: resize grow → shrink in one gesture restores the pushed neighbours', () => {
    const e = seeded();
    e.beginGesture();
    e.resizeCheck('t1', 6, 1); // covers t2 wholly — t2 pushed
    expect(cells(e, 't2')).not.toEqual([3, 0]);
    expect(e.hasOverlaps()).toBe(false);
    e.resizeCheck('t1', 3, 1); // shrink back
    expect(cells(e, 't2')).toEqual([3, 0]); // returned
    expect(e.hasOverlaps()).toBe(false);
    e.endGesture();
  });

  it('S2: pushed below the pinned row and TELEPORTS back when the space frees', () => {
    const e = seeded();
    e.beginGesture();
    // Grow t5 wider: 8 → 12 covers t6 (4×2 = 100% of t6). t6 pushed down —
    // below t5 puts it on the pinned row → skipDown lands it BELOW the pin.
    e.resizeCheck('t5', 12, 2);
    const pushed = cells(e, 't6');
    expect(pushed[1]).toBeGreaterThan(3); // below the pinned row
    expect(e.hasOverlaps()).toBe(false);
    // Shrink back: gravity cannot climb t6 through the 12-wide pinned row —
    // the TELEPORT memory must bring it home anyway.
    e.resizeCheck('t5', 8, 2);
    expect(cells(e, 't6')).toEqual([8, 1]);
    expect(e.hasOverlaps()).toBe(false);
    expect(cells(e, 'pin')).toEqual([0, 3]); // pin never moved
    e.endGesture();
  });

  it('E2: memory does NOT outlive the gesture', () => {
    const e = seeded();
    e.beginGesture();
    e.resizeCheck('t5', 12, 2); // t6 displaced below the pin
    e.endGesture();             // commit — memory cleared
    const parked = cells(e, 't6');
    e.beginGesture();
    e.resizeCheck('t5', 8, 2);  // NEW gesture shrinks t5
    // t6 may climb by gravity only as far as geometry allows — but it must
    // NOT teleport to (8,1) from a previous gesture's memory.
    expect(cells(e, 't6')).toEqual(parked);
    e.endGesture();
  });

  it('E2: tiles below climb into vacated space during the gesture (gravity live)', () => {
    const e = new GridPackEngine(
      [
        { id: 'a', x: 0, y: 0, w: 3, h: 1 },
        { id: 'b', x: 0, y: 1, w: 3, h: 1 },
      ],
      { columns: 12 }
    );
    e.beginGesture();
    e.moveCheck('a', 6, 0); // a vacates (0,0)
    expect(cells(e, 'b')).toEqual([0, 0]); // b climbed immediately
    e.endGesture();
  });
});

describe('gesture cancel (Escape)', () => {
  it('restores EVERY tile to its gesture-start cell', () => {
    const e = seeded();
    e.beginGesture();
    e.resizeCheck('t5', 12, 2);
    e.moveCheck('t1', 2, 0);
    e.cancelGesture();
    // Positions restore for all (sizes are the binder's concern to restore —
    // the engine restores cells; the spec pins exactly that contract).
    for (const s of SEED) expect(cells(e, s.id)).toEqual([s.x, s.y]);
  });
});

describe('maxRows — a bounded board refuses what cannot fit (nested-strip design)', () => {
  // The KPI section is a ONE-ROW strip nested inside the tab board. Without a
  // bound, growing a KPI's height (or pushing a sibling to row 2) exploded
  // rows() and fit-mode collapsed the strip's row height — "resize an item
  // from the first row, design is destroyed" (live report). A board with
  // maxRows ROLLS BACK any op whose settled result exceeds the bound.
  const STRIP: GridPackItem[] = [
    { id: 'k1', x: 0, y: 0, w: 1, h: 1 },
    { id: 'k2', x: 1, y: 0, w: 1, h: 1 },
    { id: 'k3', x: 2, y: 0, w: 1, h: 1 },
    { id: 'k4', x: 3, y: 0, w: 1, h: 1 },
  ];
  const strip = () => new GridPackEngine(STRIP, { columns: 4, maxRows: 1 });

  it('refuses a height resize past the bound; cells untouched', () => {
    const e = strip();
    e.beginGesture();
    expect(e.resizeCheck('k1', 1, 2).changed).toBe(false);
    expect(e.getItem('k1')!.h).toBe(1);
    expect(e.rows()).toBe(1);
    e.endGesture();
  });

  it('refuses a width resize whose PUSH would spill a sibling past the bound', () => {
    const e = strip(); // full row: growing k1 to w2 must shove k2 to row 2 — refuse
    e.beginGesture();
    expect(e.resizeCheck('k1', 2, 1).changed).toBe(false);
    for (const s of STRIP) expect(cells(e, s.id)).toEqual([s.x, s.y]);
    e.endGesture();
  });

  it('allows a width resize when a sibling was removed (room exists)', () => {
    const e = strip();
    e.remove('k4');
    e.beginGesture();
    expect(e.resizeCheck('k1', 2, 1).changed).toBe(true);
    expect(e.rows()).toBe(1);
    expect(e.hasOverlaps()).toBe(false);
    e.endGesture();
  });

  it('refuses a move that would displace a sibling out of bounds, allows in-row swaps', () => {
    const e = strip();
    e.beginGesture();
    // Same-size swap stays in-row — allowed.
    expect(e.moveCheck('k1', 1, 0).changed).toBe(true);
    expect(cells(e, 'k1')).toEqual([1, 0]);
    expect(cells(e, 'k2')).toEqual([0, 0]);
    expect(e.rows()).toBe(1);
    e.endGesture();
  });

  it('add() refuses (returns null) when nothing can fit inside the bound', () => {
    const e = strip(); // full 4×1 strip
    const r = e.add({ id: 'k5', x: 0, y: 0, w: 1, h: 1, autoPosition: true });
    expect(r).toBeNull();
    expect(e.getItems().length).toBe(4);
    expect(e.rows()).toBe(1);
  });
});

describe('the standing invariant', () => {
  it('a scripted 40-step gesture storm never produces an overlap', () => {
    const e = seeded();
    // Deterministic pseudo-random walk (no Math.random — goldens discipline).
    let s = 0x5eed;
    const rnd = (m: number) => ((s = (s * 1103515245 + 12345) & 0x7fffffff), s % m);
    const ids = ['t1', 't2', 't3', 't4', 't5', 't6'];
    e.beginGesture();
    for (let i = 0; i < 40; i++) {
      const id = ids[rnd(ids.length)];
      if (rnd(3) === 0) {
        e.resizeCheck(id, 1 + rnd(12), 1 + rnd(3));
      } else {
        e.moveCheck(id, rnd(12), rnd(6));
      }
      expect(e.hasOverlaps()).toBe(false);
      expect(cells(e, 'pin')).toEqual([0, 3]);
    }
    e.endGesture();
    expect(e.hasOverlaps()).toBe(false);
  });
});
