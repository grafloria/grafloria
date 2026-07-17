/**
 * ============================================================================
 * AnimationService — the status/animation class emission matrix. (Teeth.)
 * ============================================================================
 *
 * Found in the execute-flow deep audit, locked here:
 *
 * 1. Classes must emit even when animations are suppressed (reduced motion,
 *    battery saver, enabled:false): they carry STATIC affordances — a
 *    completed node's green stroke, an animated edge's dash pattern — and the
 *    early-return withheld all of it from exactly the users the statics exist
 *    for. Motion suppression is CSS's job (body.reduced-motion /
 *    body.battery-saving / .animations-disabled rules).
 *
 * 2. `status` paints whenever set; `animateStatus: false` opts out of MOTION
 *    only (via .node-status-still) — it used to gate the entire affordance.
 *
 * 3. The 'running' keyframes must never be named `running`: in the animation
 *    shorthand that identifier parses as the reserved play-state keyword and
 *    the pulse silently never animated anywhere.
 */

import { AnimationService } from './animation.service';
import { NodeModel, LinkModel } from '@grafloria/engine';

const nodeWith = (state: Record<string, unknown>): NodeModel => {
  const n = new NodeModel({ type: 'basic', position: { x: 0, y: 0 }, size: { width: 100, height: 60 } });
  n.setState(state as never);
  return n;
};

const linkWithAnimation = (animation: Record<string, unknown> | undefined): LinkModel => {
  const l = new LinkModel('a', 'b');
  if (animation) l.updateStyle({ animation } as never);
  return l;
};

describe('AnimationService — status class emission', () => {
  let service: AnimationService;
  beforeEach(() => {
    service = new AnimationService({ respectBatteryStatus: false });
  });

  test('a set status emits its class — with NO animateStatus flag at all', () => {
    const cls = service.getNodeAnimationClass(nodeWith({ status: 'running' }), true);
    expect(cls).toContain('node-status-running-svg');
    expect(cls).not.toContain('node-status-still');
  });

  test('animateStatus: false keeps the status class and adds the motion opt-out', () => {
    const cls = service.getNodeAnimationClass(nodeWith({ status: 'completed', animateStatus: false }), true);
    expect(cls).toContain('node-status-completed-svg');
    expect(cls).toContain('node-status-still');
  });

  test("idle (and unset) status emits nothing", () => {
    expect(service.getNodeAnimationClass(nodeWith({ status: 'idle' }), true)).toBe('');
    expect(service.getNodeAnimationClass(nodeWith({}), true)).toBe('');
  });

  test.each([
    ['reducedMotion', { reducedMotion: true }],
    ['batterySavingMode', { batterySavingMode: true }],
    ['enabled:false', { enabled: false }],
  ])('classes STILL emit under %s — static affordances must survive', (_name, patch) => {
    service.updateConfig(patch as never);
    const cls = service.getNodeAnimationClass(nodeWith({ status: 'error', animateStatus: true }), true);
    expect(cls).toContain('node-status-error-svg');
  });

  test('the html variant drops the -svg suffix', () => {
    const cls = service.getNodeAnimationClass(nodeWith({ status: 'warning', animateStatus: true }), false);
    expect(cls).toContain('node-status-warning');
    expect(cls).not.toContain('-svg');
  });
});

describe('AnimationService — edge class emission', () => {
  let service: AnimationService;
  beforeEach(() => {
    service = new AnimationService({ respectBatteryStatus: false });
  });

  test('style.animation emits the class (the {animated} boolean shape is consumed by nothing)', () => {
    const cls = service.getEdgeAnimationClass(linkWithAnimation({ type: 'marching-ants', speed: 'fast' }));
    expect(cls).toContain('link-animated-marching-ants');
    expect(cls).toContain('link-speed-fast');
  });

  test('classes still emit under battery saving — the dash pattern is static paint', () => {
    service.updateConfig({ batterySavingMode: true });
    const cls = service.getEdgeAnimationClass(linkWithAnimation({ type: 'dash-flow' }));
    expect(cls).toContain('link-animated-dash-flow');
  });

  test('no animation (or type none) emits nothing', () => {
    expect(service.getEdgeAnimationClass(linkWithAnimation(undefined))).toBe('');
    expect(service.getEdgeAnimationClass(linkWithAnimation({ type: 'none' }))).toBe('');
  });
});

describe('AnimationService — injected CSS contract', () => {
  test('the running keyframes are NOT named with the reserved word "running"', () => {
    const service = new AnimationService({ respectBatteryStatus: false });
    service.injectCSS();
    const css = document.getElementById('grafloria-animations')?.textContent ?? '';
    expect(css).toContain('@keyframes status-node-running');
    // The shorthand form that silently parsed as play-state:
    expect(css).not.toMatch(/animation:\s*running\s/);
    // The statics exist for every status, both variants.
    for (const status of ['running', 'completed', 'error', 'warning', 'pending']) {
      expect(css).toContain(`.node-status-${status}, .node-status-${status}-svg`);
    }
    expect(css).toContain('.node-status-still');
  });
});
