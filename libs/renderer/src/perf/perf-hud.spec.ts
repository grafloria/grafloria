// Wave 8 — Card 7: the perf HUD.
//
// The counts are the point, not the FPS. FPS says THAT the frame was slow; the counts
// say WHY — and in this engine the "why" has been the story every single time.

import { PerfHud, formatSnapshot, EMPTY_SNAPSHOT, type PerfSnapshot } from './perf-hud';

const snapshot = (patch: Partial<PerfSnapshot> = {}): PerfSnapshot => ({
  ...EMPTY_SNAPSHOT,
  ...patch,
});

describe('perf HUD (Wave 8, Card 7)', () => {
  it('makes the bug legible: "culled 0" is impossible to miss', () => {
    // The wave-8 baseline found zoom-out costing 63 SECONDS at 10k nodes. A HUD
    // showing "nodes 10000/10000 visible (culled 0)" states the cause in one line,
    // without a profiler.
    const lines = formatSnapshot(
      snapshot({ nodes: 10000, links: 9999, visibleNodes: 10000, visibleLinks: 9999 })
    );
    expect(lines.join('\n')).toContain('nodes  10000/10000 visible   (culled 0)');
  });

  it('shows routed-links-per-frame, which is the 5.5-second drag in one number', () => {
    // Moving ONE node re-routed every visible link. "routed 9998 links this frame"
    // on a frame where one node moved is the whole bug, visible at a glance.
    const lines = formatSnapshot(snapshot({ routedLinks: 9998, dirtyNodes: 1 }));
    expect(lines.join('\n')).toContain('routed 9998 links this frame');
    expect(lines.join('\n')).toContain('dirty  1 nodes');
  });

  it('surfaces the governor\'s reasoning — an invisible governor is indistinguishable from a bug', () => {
    const lines = formatSnapshot(
      snapshot({
        tier: 'low',
        governor: {
          bias: 2,
          medianMs: 41.3,
          samples: 0,
          recoveryStreak: 0,
          lastDecision: 'stepped-down',
        },
      })
    );
    expect(lines.join('\n')).toContain('gov    bias 2 · median 41.3ms · stepped-down');
  });

  describe('the DOM overlay', () => {
    let host: HTMLElement;

    beforeEach(() => {
      host = document.createElement('div');
      document.body.appendChild(host);
    });

    afterEach(() => host.remove());

    it('never eats input, and is hidden from assistive tech', () => {
      // A debug overlay that intercepts clicks is a bug generator of its own — and
      // one that a screen reader announces is worse: it is developer instrumentation,
      // not content. (Wave 6 made a11y an enforced contract; this must not violate it.)
      const hud = new PerfHud(host);
      hud.show();
      const el = host.querySelector('[data-grafloria-perf-hud]') as HTMLElement;
      expect(el).toBeTruthy();
      expect(el.style.pointerEvents).toBe('none');
      expect(el.getAttribute('aria-hidden')).toBe('true');
    });

    it('show is idempotent; hide removes it', () => {
      const hud = new PerfHud(host);
      hud.show();
      hud.show();
      expect(host.querySelectorAll('[data-grafloria-perf-hud]')).toHaveLength(1);
      hud.hide();
      expect(host.querySelectorAll('[data-grafloria-perf-hud]')).toHaveLength(0);
    });

    it('update before show is a no-op rather than a crash', () => {
      const hud = new PerfHud(host);
      expect(() => hud.update(snapshot({ fps: 60 }))).not.toThrow();
    });

    it('renders the snapshot', () => {
      const hud = new PerfHud(host);
      hud.show();
      hud.update(snapshot({ fps: 58.6, frameMs: 17.1, nodes: 3, visibleNodes: 2 }));
      const el = host.querySelector('[data-grafloria-perf-hud]') as HTMLElement;
      expect(el.textContent).toContain('59 fps');
      expect(el.textContent).toContain('17.1 ms/frame');
      expect(el.textContent).toContain('nodes  2/3 visible   (culled 1)');
    });
  });
});
