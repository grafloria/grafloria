// Wave 8 — Card 5: the tier handoff policy.
//
// The perf thresholds are the easy half. The half that matters is the guards: canvas is
// a STRICTLY LESSER surface (no a11y semantics, no focusable DOM, cannot paint HTML
// nodes), so every guard must be able to hold us on SVG, and none of them may ever push
// us towards canvas.

import { DEFAULT_TIER_POLICY, decideTier, resolveTierPolicy, type TierInput } from './tier-policy';

const base = (over: Partial<TierInput> = {}): TierInput => ({
  current: 'svg',
  elements: 100,
  zoom: 1,
  a11yEngaged: false,
  focusInside: false,
  hasForeignObject: false,
  pinned: null,
  policy: DEFAULT_TIER_POLICY,
  ...over,
});

describe('decideTier — thresholds', () => {
  it('stays on SVG for a small, near-zoom scene', () => {
    const d = decideTier(base());
    expect(d.mode).toBe('svg');
    expect(d.changed).toBe(false);
  });

  it('steps down to canvas once the element count crosses the line', () => {
    const d = decideTier(base({ elements: 2000 }));
    expect(d.mode).toBe('canvas');
    expect(d.reason).toBe('element-count');
    expect(d.changed).toBe(true);
  });

  it('steps down to canvas when zoomed out past the interactive tier', () => {
    const d = decideTier(base({ zoom: 0.3 }));
    expect(d.mode).toBe('canvas');
    expect(d.reason).toBe('zoom');
  });

  it('comes back up to SVG only when BOTH signals are inside the interactive tier', () => {
    // Few elements, but still zoomed out: stay on canvas.
    expect(decideTier(base({ current: 'canvas', elements: 10, zoom: 0.3 })).mode).toBe('canvas');
    // Zoomed in, but still huge: stay on canvas.
    expect(decideTier(base({ current: 'canvas', elements: 9000, zoom: 1 })).mode).toBe('canvas');
    // Both back inside: step up.
    const up = decideTier(base({ current: 'canvas', elements: 10, zoom: 1 }));
    expect(up.mode).toBe('svg');
    expect(up.reason).toBe('interactive');
  });

  it('has a hysteresis band, so a scene parked on the boundary cannot thrash', () => {
    // 1800 elements: past the "come back to svg" line (1500) but short of the "go to
    // canvas" line (2000). Whichever tier we are in, we stay in it.
    expect(decideTier(base({ current: 'svg', elements: 1800 })).mode).toBe('svg');
    expect(decideTier(base({ current: 'canvas', elements: 1800, zoom: 1 })).mode).toBe('canvas');
  });

  it('refuses a policy whose hysteresis band is inverted', () => {
    expect(() => resolveTierPolicy({ canvasAboveElements: 100, svgBelowElements: 200 })).toThrow(
      /thrash/
    );
    expect(() => resolveTierPolicy({ canvasBelowZoom: 0.8, svgAboveZoom: 0.2 })).toThrow(/thrash/);
  });
});

describe('decideTier — the guards (canvas is a lesser surface)', () => {
  it('NEVER hands an assistive-technology user a canvas, however big the scene', () => {
    const d = decideTier(base({ elements: 100000, zoom: 0.01, a11yEngaged: true }));
    expect(d.mode).toBe('svg');
    expect(d.reason).toBe('a11y-pinned');
  });

  it('drags an AT user back UP to SVG if they were somehow on canvas', () => {
    const d = decideTier(base({ current: 'canvas', elements: 100000, a11yEngaged: true }));
    expect(d.mode).toBe('svg');
    expect(d.reason).toBe('a11y-pinned');
    expect(d.changed).toBe(true);
  });

  it('honours respectAccessibility: false — but only when a host asks for it explicitly', () => {
    const policy = { ...DEFAULT_TIER_POLICY, respectAccessibility: false };
    const d = decideTier(base({ elements: 5000, a11yEngaged: true, policy }));
    expect(d.mode).toBe('canvas');
  });

  it('will not swap the element out from under a focused keyboard user', () => {
    const d = decideTier(base({ elements: 100000, focusInside: true }));
    expect(d.mode).toBe('svg');
    expect(d.reason).toBe('focus-inside');
  });

  it('but focus never BLOCKS the safe direction — canvas → svg is always allowed', () => {
    const d = decideTier(base({ current: 'canvas', elements: 10, zoom: 1, focusInside: true }));
    expect(d.mode).toBe('svg');
  });

  it('will not step down while an HTML node is on screen — canvas cannot paint it', () => {
    const d = decideTier(base({ elements: 100000, hasForeignObject: true }));
    expect(d.mode).toBe('svg');
    expect(d.reason).toBe('foreign-object');
  });

  it('a pinned tier outranks everything, including the guards', () => {
    const d = decideTier(base({ pinned: 'canvas', a11yEngaged: true, hasForeignObject: true }));
    expect(d.mode).toBe('canvas');
    expect(d.reason).toBe('pinned');
  });

  it('EVERY guard pushes towards svg and none towards canvas', () => {
    // The safety invariant, stated as a test: for a scene that would otherwise step down,
    // turning ON any single guard must keep it on SVG.
    const wouldStepDown = base({ elements: 5000 });
    expect(decideTier(wouldStepDown).mode).toBe('canvas');

    for (const guard of ['a11yEngaged', 'focusInside', 'hasForeignObject'] as const) {
      expect(decideTier({ ...wouldStepDown, [guard]: true }).mode).toBe('svg');
    }
  });
});
