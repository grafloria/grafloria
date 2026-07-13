// Wave 8 — Card 7: the adaptive quality governor.
//
// The tests that matter are the ones about NOT OSCILLATING. A governor that drops
// detail when a frame is slow and restores it when a frame is fast is worse than no
// governor at all: dropping detail makes the next frame fast, which restores the
// detail, which makes it slow again — and the user watches their diagram flicker
// between two levels of detail forever. That is more distracting than a consistently
// simpler picture, and it is the failure mode this file exists to rule out.

import { QualityGovernor } from './quality-governor';

const TIERS = ['high', 'medium', 'low'] as const;

/** Feed n frames of the same cost. */
function feed(g: QualityGovernor, ms: number, frames: number): void {
  for (let i = 0; i < frames; i++) g.record(ms);
}

describe('QualityGovernor (Wave 8, Card 7)', () => {
  it('holds full detail while the budget is met', () => {
    const g = new QualityGovernor({ budgetMs: 16.7, window: 12 });
    feed(g, 8, 60);
    expect(g.getBias()).toBe(0);
    expect(g.effectiveTier('high', TIERS)).toBe('high');
  });

  it('steps DOWN when the budget is blown', () => {
    const g = new QualityGovernor({ budgetMs: 16.7, window: 12 });
    feed(g, 40, 12); // one full window, comfortably over budget
    expect(g.getBias()).toBe(1);
    expect(g.effectiveTier('high', TIERS)).toBe('medium');
  });

  it('keeps stepping down while it keeps hurting, up to maxBias', () => {
    // 20ms: over the 16.7ms budget, but not the 4x that trips escalation. This is
    // the SLOW path — a scene that is merely missing 60fps, noticed a window at a
    // time. (A 90ms frame no longer reaches this code at all: it escalates in three.
    // That is deliberate, and it is why this test feeds 20 and not 90.)
    const g = new QualityGovernor({ budgetMs: 16.7, window: 12, maxBias: 2 });
    feed(g, 20, 12);
    expect(g.getBias()).toBe(1);
    feed(g, 20, 12);
    expect(g.getBias()).toBe(2);
    feed(g, 20, 36); // …and no further: the floor is the floor
    expect(g.getBias()).toBe(2);
    expect(g.effectiveTier('high', TIERS)).toBe('low');
  });

  describe('THE POINT OF THIS FILE: it must not oscillate', () => {
    it('does NOT step back up on the first fast window after stepping down', () => {
      const g = new QualityGovernor({ budgetMs: 16.7, window: 12, recoveryWindows: 3 });
      feed(g, 40, 12);
      expect(g.getBias()).toBe(1);

      feed(g, 5, 12); // one fast window — the naive governor restores here
      expect(g.getBias()).toBe(1);
      feed(g, 5, 12); // two
      expect(g.getBias()).toBe(1);
      feed(g, 5, 12); // three: recovery earned
      expect(g.getBias()).toBe(0);
    });

    it('THE DEAD BAND: a frame time just under budget does not trigger recovery', () => {
      // This is the mechanism that makes oscillation structurally impossible. After
      // stepping down, the cheaper tier renders at (say) 0.9x budget — fast enough to
      // satisfy a naive "under budget → restore detail" rule, which would put us
      // straight back over the budget. The step-UP threshold is far below the
      // step-DOWN threshold precisely so that cannot happen.
      const g = new QualityGovernor({ budgetMs: 16.7, window: 12, upFactor: 0.55 });
      feed(g, 40, 12);
      expect(g.getBias()).toBe(1);

      // 15ms is UNDER the 16.7ms budget — and it still must not restore detail.
      feed(g, 15, 120);
      expect(g.getBias()).toBe(1);
    });

    it('a sawtooth workload settles instead of flapping', () => {
      // Alternating slow/fast frames — the exact input that makes a naive governor
      // thrash. The median over the window is what it decides on, so it settles.
      const g = new QualityGovernor({ budgetMs: 16.7, window: 12 });
      const biases: number[] = [];
      for (let i = 0; i < 240; i++) {
        g.record(i % 2 === 0 ? 40 : 4);
        biases.push(g.getBias());
      }
      // it changed its mind a handful of times at most — not every other window
      const changes = biases.filter((b, i) => i > 0 && b !== biases[i - 1]).length;
      expect(changes).toBeLessThanOrEqual(2);
    });

    it('a single GC pause does not drop the whole scene a tier', () => {
      const g = new QualityGovernor({ budgetMs: 16.7, window: 12 });
      for (let i = 0; i < 11; i++) g.record(6);
      g.record(300); // one catastrophic frame
      // the MEDIAN is still 6ms: one pause is not a trend
      expect(g.getBias()).toBe(0);
    });
  });

  describe('escalation: a 300ms frame must not wait a full window to be noticed', () => {
    // The main window is the right instrument for "this is a bit slow". It is the
    // WRONG instrument for "this is catastrophically slow": at 300ms/frame, twelve
    // frames is nearly four seconds of a canvas that looks frozen. The escalation
    // path exists so the governor reacts in three frames instead of twelve — while
    // still being unable to confuse a GC pause for a structural problem.

    it('steps down after THREE catastrophic frames, not twelve', () => {
      const g = new QualityGovernor({ budgetMs: 16.7, window: 12, panicFactor: 4 });
      g.record(300);
      expect(g.getBias()).toBe(0); // one frame proves nothing
      g.record(300);
      expect(g.getBias()).toBe(0); // two could still be a hiccup
      g.record(300);
      expect(g.getBias()).toBe(1); // three is a trend
      expect(g.getState().lastDecision).toBe('escalated');
    });

    it('THE POINT: median-of-three still rejects a lone spike', () => {
      // This is the whole reason the escalation window is 3 and not 1. Reacting to a
      // single frame would make one GC pause indistinguishable from a scene the
      // machine genuinely cannot render — and would drop the user's detail for a
      // second every time the collector ran.
      const g = new QualityGovernor({ budgetMs: 16.7, window: 12, panicFactor: 4 });
      g.record(5);
      g.record(400); // a monstrous pause, surrounded by healthy frames
      g.record(5);
      expect(g.getBias()).toBe(0);
      expect(g.getState().lastDecision).not.toBe('escalated');
    });

    it('escalates repeatedly down to the floor, then stops', () => {
      const g = new QualityGovernor({ budgetMs: 16.7, window: 12, maxBias: 2 });
      feed(g, 300, 3);
      expect(g.getBias()).toBe(1);
      feed(g, 300, 3);
      expect(g.getBias()).toBe(2);
      feed(g, 300, 30); // the floor is the floor, however bad it gets
      expect(g.getBias()).toBe(2);
    });

    it('does not fire for a merely-over-budget frame — that is the main window\'s job', () => {
      // 25ms is over the 16.7ms budget but nowhere near 4x it. Escalating here would
      // make the governor hair-trigger and undo the anti-oscillation work above.
      const g = new QualityGovernor({ budgetMs: 16.7, window: 12, panicFactor: 4 });
      feed(g, 25, 3);
      expect(g.getBias()).toBe(0);
      feed(g, 25, 9); // …and the main window picks it up in its own time
      expect(g.getBias()).toBe(1);
      expect(g.getState().lastDecision).toBe('stepped-down');
    });

    it('recovery is still patient after an escalation — it does not bounce straight back', () => {
      const g = new QualityGovernor({ budgetMs: 16.7, window: 12, recoveryWindows: 3 });
      feed(g, 300, 3);
      expect(g.getBias()).toBe(1);
      feed(g, 5, 12);
      expect(g.getBias()).toBe(1); // one fast window is not enough, escalation or not
      feed(g, 5, 24);
      expect(g.getBias()).toBe(0);
    });
  });

  describe('effectiveTier', () => {
    it('can only ever make the picture SIMPLER than the zoom asked for', () => {
      const g = new QualityGovernor({ budgetMs: 16.7, window: 12 });
      feed(g, 90, 24); // bias 2
      // zoom already asked for the poorest tier — the governor cannot go below it
      expect(g.effectiveTier('low', TIERS)).toBe('low');
      // and it never upgrades: a governor with spare budget must not draw labels on
      // 4px nodes to fill it
      const idle = new QualityGovernor({ budgetMs: 16.7, window: 12 });
      feed(idle, 1, 60);
      expect(idle.effectiveTier('low', TIERS)).toBe('low');
    });

    it('leaves an unknown tier alone rather than silently retiering it', () => {
      const g = new QualityGovernor({ budgetMs: 16.7, window: 12 });
      feed(g, 90, 12);
      expect(g.effectiveTier('custom-tier', TIERS)).toBe('custom-tier');
    });
  });

  it('reports WHY it last changed its mind — an invisible governor is indistinguishable from a bug', () => {
    const g = new QualityGovernor({ budgetMs: 16.7, window: 12, recoveryWindows: 1 });
    feed(g, 40, 12);
    expect(g.getState()).toMatchObject({ bias: 1, lastDecision: 'stepped-down' });
    feed(g, 4, 12);
    expect(g.getState()).toMatchObject({ bias: 0, lastDecision: 'stepped-up' });
    feed(g, 10, 12); // dead band
    expect(g.getState().lastDecision).toBe('steady');
  });

  it('reset() forgets everything — past frames say nothing about a new diagram', () => {
    const g = new QualityGovernor({ budgetMs: 16.7, window: 12 });
    feed(g, 90, 24);
    expect(g.getBias()).toBe(2);
    g.reset();
    expect(g.getBias()).toBe(0);
    expect(g.getState().lastDecision).toBe('steady');
  });
});
