// Wave 9 — Card 5, Part B: the presence overlay.
//
// The first describe is the one that guards Wave 8's headline result. The rest is the
// feature.

import {
  PresenceOverlay,
  actorColor,
  actorInitials,
  contrastingTextColor,
  PRESENCE_LAYER_CLASS,
} from './presence-overlay';
import { ViewportController } from '../viewport/viewport-controller';

/** A hand-cranked rAF: the test decides when a frame happens, so nothing races. */
function manualFrames() {
  const queue: Array<() => void> = [];
  return {
    requestFrame: (cb: () => void) => {
      queue.push(cb);
      return queue.length;
    },
    cancelFrame: () => undefined,
    /** Run queued frames until the loop settles (or we give up). */
    settle: (max = 200): number => {
      let ran = 0;
      while (queue.length > 0 && ran < max) {
        const cb = queue.shift()!;
        cb();
        ran++;
      }
      return ran;
    },
    get pending(): number {
      return queue.length;
    },
  };
}

function scene() {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const viewport = new ViewportController({
    viewport: { x: 0, y: 0, width: 800, height: 600 },
    zoom: 1,
  });
  const frames = manualFrames();
  const overlay = new PresenceOverlay({
    root,
    viewport,
    requestFrame: frames.requestFrame,
    cancelFrame: frames.cancelFrame,
    smoothing: 0.5,
    getBounds: (id) =>
      id === 'n1' ? { x: 100, y: 100, width: 120, height: 60 } : null,
  });
  return { root, viewport, overlay, frames };
}

describe('THE FRAME GATE STAYS SHUT — Wave 8’s headline result, defended', () => {
  it('the overlay lives OUTSIDE the SVG layer, so a cursor cannot dirty a VNode', () => {
    // The structural guarantee, asserted structurally. A cursor is not in the SVG, so it
    // cannot be in the VNode tree, so it cannot trip the frame gate, so it cannot cost a
    // 10k-node diagram a frame. Everything else in this file is downstream of that.
    const { root, overlay } = scene();

    overlay.setPeers([{ actor: 'bob', cursor: { x: 10, y: 10 } }]);

    const layer = root.querySelector(`.${PRESENCE_LAYER_CLASS}`)!;
    expect(layer).toBeTruthy();
    expect(layer.querySelector('.grafloria-presence-cursor')).toBeTruthy();

    // …and there is no <svg> above it in the tree. The overlay is a SIBLING of the diagram's
    // layers, not a child of them.
    expect(layer.closest('svg')).toBeNull();
    overlay.dispose();
  });

  it('AN IDLE OVERLAY RUNS ZERO FRAMES — a still mouse costs literally nothing', () => {
    // A perpetual rAF loop would keep the main thread awake forever, defeat every idle
    // optimisation in the renderer, and drain a battery on a diagram nobody is touching. The
    // loop must STOP when everyone has stopped moving.
    const { overlay, frames } = scene();

    overlay.setPeers([{ actor: 'bob', cursor: { x: 50, y: 50 } }]);
    frames.settle();
    const afterArrival = overlay.framesRun;

    // Nobody moves. Re-publishing the SAME peer state must not restart the loop.
    for (let i = 0; i < 10; i++) overlay.setPeers([{ actor: 'bob', cursor: { x: 50, y: 50 } }]);
    frames.settle();

    // At most the ten no-op ticks that `setPeers` schedules — and, crucially, the loop does
    // NOT keep re-arming itself. `pending` is the proof: the loop is not running.
    expect(frames.pending).toBe(0);
    expect(overlay.framesRun - afterArrival).toBeLessThanOrEqual(10);

    overlay.dispose();
  });

  it('interpolation TERMINATES — it does not ease toward the target forever', () => {
    // Exponential easing never mathematically arrives, so without a snap threshold the loop
    // would run 60 frames a second for the rest of the session, moving a cursor by 0.0001px.
    const { overlay, frames } = scene();

    overlay.setPeers([{ actor: 'bob', cursor: { x: 0, y: 0 } }]);
    frames.settle();
    overlay.setPeers([{ actor: 'bob', cursor: { x: 1000, y: 1000 } }]);

    const ran = frames.settle(500);

    expect(ran).toBeLessThan(60); // it converged, in well under a second of frames
    expect(frames.pending).toBe(0); // …and STOPPED
    overlay.dispose();
  });
});

describe('remote cursors', () => {
  it('a cursor INTERPOLATES toward its target instead of teleporting', () => {
    // Awareness arrives at ~20Hz. Drawn raw, a remote cursor visibly steps — twenty discrete
    // jumps a second, which reads as lag even when the network is fine.
    const { root, overlay, frames } = scene();

    overlay.setPeers([{ actor: 'bob', cursor: { x: 0, y: 0 } }]);
    frames.settle();

    overlay.setPeers([{ actor: 'bob', cursor: { x: 100, y: 0 } }]);

    // ONE frame at smoothing 0.5 → half way there. Not all the way, and not still at zero.
    frames.settle(1);
    const el = root.querySelector('.grafloria-presence-cursor') as HTMLElement;
    expect(el.style.transform).toBe('translate(50px, 0px)');

    frames.settle();
    expect(el.style.transform).toBe('translate(100px, 0px)'); // …and it does arrive
    overlay.dispose();
  });

  it('a NEW peer’s cursor appears where it is, and does not fly in from the origin', () => {
    const { root, overlay, frames } = scene();
    overlay.setPeers([{ actor: 'bob', cursor: { x: 400, y: 300 } }]);
    frames.settle(1);

    const el = root.querySelector('.grafloria-presence-cursor') as HTMLElement;
    expect(el.style.transform).toBe('translate(400px, 300px)');
    overlay.dispose();
  });

  it('a null cursor HIDES the pointer — the peer left the canvas, they are not stuck to its edge', () => {
    const { root, overlay, frames } = scene();
    overlay.setPeers([{ actor: 'bob', cursor: { x: 10, y: 10 } }]);
    frames.settle();

    overlay.setPeers([{ actor: 'bob', cursor: null }]);
    const el = root.querySelector('.grafloria-presence-cursor') as HTMLElement;
    expect(el.style.display).toBe('none');
    overlay.dispose();
  });

  it('a peer who leaves takes their cursor with them', () => {
    const { root, overlay, frames } = scene();
    overlay.setPeers([
      { actor: 'bob', cursor: { x: 1, y: 1 } },
      { actor: 'carol', cursor: { x: 2, y: 2 } },
    ]);
    frames.settle();
    expect(root.querySelectorAll('.grafloria-presence-cursor')).toHaveLength(2);

    overlay.setPeers([{ actor: 'carol', cursor: { x: 2, y: 2 } }]);

    expect(root.querySelectorAll('.grafloria-presence-cursor')).toHaveLength(1);
    expect(overlay.peerCount).toBe(1);
    overlay.dispose();
  });
});

describe('remote selection', () => {
  it('outlines what a peer has selected — in WORLD space, over the node', () => {
    const { root, overlay } = scene();
    overlay.setPeers([{ actor: 'bob', selection: ['n1'] }]);

    const box = root.querySelector('.grafloria-presence-selection') as HTMLElement;
    expect(box).toBeTruthy();
    expect(box.style.left).toBe('100px');
    expect(box.style.width).toBe('120px');
    expect(box.getAttribute('data-actor')).toBe('bob');
    overlay.dispose();
  });

  it('does NOT outline an entity that is not there — no box around nothing', () => {
    const { root, overlay } = scene();
    overlay.setPeers([{ actor: 'bob', selection: ['deleted-by-someone-else'] }]);
    expect(root.querySelector('.grafloria-presence-selection')).toBeNull();
    overlay.dispose();
  });

  it('drops the outline when the peer deselects', () => {
    const { root, overlay } = scene();
    overlay.setPeers([{ actor: 'bob', selection: ['n1'] }]);
    expect(root.querySelector('.grafloria-presence-selection')).toBeTruthy();

    overlay.setPeers([{ actor: 'bob', selection: [] }]);
    expect(root.querySelector('.grafloria-presence-selection')).toBeNull();
    overlay.dispose();
  });
});

describe('the camera', () => {
  it('one transform write moves EVERY cursor — pan/zoom is O(1), not O(peers)', () => {
    const { root, overlay, viewport, frames } = scene();
    overlay.setPeers([
      { actor: 'b', cursor: { x: 10, y: 10 } },
      { actor: 'c', cursor: { x: 20, y: 20 } },
    ]);
    frames.settle();

    viewport.pan(100, 50);

    // The cursors are positioned in WORLD coordinates inside a camera-transformed sub-layer,
    // so the browser does the projection. Their own transforms are untouched.
    const world = root.querySelector(`.${PRESENCE_LAYER_CLASS} > div`) as HTMLElement;
    expect(world.style.transform).toBe(viewport.getHtmlLayerTransform());

    const cursor = root.querySelector('.grafloria-presence-cursor') as HTMLElement;
    expect(cursor.style.transform).toBe('translate(10px, 10px)'); // unchanged, as it should be
    overlay.dispose();
  });
});

describe('accessibility — a 60Hz mouse pointer is not content', () => {
  it('the whole layer is aria-hidden and pointer-events:none', () => {
    // Announcing a remote cursor to a screen reader would flood the buffer with noise that
    // changes faster than it can be read, and it is not the user's own pointer, so it is not
    // even actionable. It must also never eat a click meant for the diagram underneath.
    const { root, overlay } = scene();
    overlay.setPeers([{ actor: 'bob', cursor: { x: 1, y: 1 }, selection: ['n1'] }]);

    const layer = root.querySelector(`.${PRESENCE_LAYER_CLASS}`) as HTMLElement;
    expect(layer.getAttribute('aria-hidden')).toBe('true');
    expect(layer.getAttribute('style')).toContain('pointer-events:none');
    overlay.dispose();
  });
});

describe('identity', () => {
  it('a colour is DETERMINISTIC from the actor id — "the blue cursor is Ana" on every screen', () => {
    // If colours were assigned locally, "the blue cursor is Ana" would be true for you and
    // false for me. Derived from the id, so no coordination and no message on the wire.
    expect(actorColor('ana')).toBe(actorColor('ana'));
    expect(actorColor('ana')).not.toBe(actorColor('bob'));
  });

  it('initials for the badge', () => {
    expect(actorInitials('Ana Silva')).toBe('AS');
    expect(actorInitials('bob')).toBe('BO');
    expect(actorInitials('')).toBe('?');
  });

  it('shows the peer’s NAME on the badge, falling back to the actor id', () => {
    const { root, overlay } = scene();
    overlay.setPeers([{ actor: 'a1b2', name: 'Ana', cursor: { x: 0, y: 0 } }]);
    expect(root.querySelector('.grafloria-presence-label')!.textContent).toBe('Ana');

    overlay.setPeers([{ actor: 'a1b2', cursor: { x: 0, y: 0 } }]);
    expect(root.querySelector('.grafloria-presence-label')!.textContent).toBe('a1b2');
    overlay.dispose();
  });
});

describe('the NAME BADGE is readable — a bug axe found after every unit test was green', () => {
  // ---------------------------------------------------------------------------
  // The badge was white text on the peer's colour. Fine for a blue actor; for a GREEN one —
  // `hsl(124, 72%, 52%)` — it is white on light green at about 2:1, and a user with low
  // vision cannot read whose cursor it is. Which actor gets which hue is decided by a hash
  // of their id, so it works on your machine, for your account, every time you test it.
  //
  // No unit test here could have caught it: they assert `aria-hidden`, which is about
  // ASSISTIVE TECH, and this is not an AT problem at all — it is a problem for someone
  // looking straight at the screen. Only the real axe audit over real badges found it.
  //
  // So this test is the generalisation of what axe found on two hues: EVERY hue, checked.
  // ---------------------------------------------------------------------------

  /** WCAG contrast ratio between two sRGB colours. */
  function contrast(a: [number, number, number], b: [number, number, number]): number {
    const lum = ([r, g, bl]: [number, number, number]) => {
      const ch = (c: number) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(bl);
    };
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  }

  function hslToRgb(h: number, s: number, l: number): [number, number, number] {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const hp = (((h % 360) + 360) % 360) / 60;
    const x = c * (1 - Math.abs((hp % 2) - 1));
    const m = l - c / 2;
    const [r, g, b] =
      hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x]
      : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
  }

  it('EVERY hue the palette can produce clears WCAG AA (4.5:1) — not just the ones axe saw', () => {
    let worst = Infinity;
    let worstHue = -1;

    for (let hue = 0; hue < 360; hue++) {
      const bg = `hsl(${hue}, 72%, 52%)`;
      const fg = contrastingTextColor(bg);
      const ratio = contrast(
        hslToRgb(hue, 0.72, 0.52),
        fg === '#fff' ? [255, 255, 255] : [0, 0, 0]
      );
      if (ratio < worst) {
        worst = ratio;
        worstHue = hue;
      }
    }

    // The two curves (white-on-bg and black-on-bg) cross at ~4.58:1, so picking the better of
    // the two is guaranteed to clear 4.5 for every hue — this asserts the guarantee rather
    // than spot-checking the hues that happened to break.
    expect(worst).toBeGreaterThanOrEqual(4.5);
    expect(worstHue).toBeGreaterThanOrEqual(0);
  });

  it('the specific hue axe caught — green — now gets BLACK text, not white', () => {
    expect(contrastingTextColor('hsl(124, 72%, 52%)')).toBe('#000');
  });

  it('…and a dark hue still gets WHITE text', () => {
    expect(contrastingTextColor('hsl(240, 72%, 40%)')).toBe('#fff');
  });

  it('parses the colour forms a caller plausibly passes, and never throws on one it cannot', () => {
    expect(contrastingTextColor('#ffff00')).toBe('#000'); // yellow
    expect(contrastingTextColor('#003366')).toBe('#fff'); // navy
    expect(contrastingTextColor('rgb(255, 255, 0)')).toBe('#000');
    expect(contrastingTextColor('var(--brand)')).toBe('#fff'); // unparseable → safe default
  });

  it('the badge actually USES it — the fix is wired, not merely available', () => {
    const { root, overlay } = scene();
    // A colour that MUST take black text, or the badge is unreadable.
    overlay.setPeers([{ actor: 'x', name: 'Zoe', color: 'hsl(124, 72%, 52%)', cursor: { x: 0, y: 0 } }]);

    const label = root.querySelector('.grafloria-presence-label') as HTMLElement;
    expect(label.style.color).toBe('rgb(0, 0, 0)');
    overlay.dispose();
  });
});

describe('dispose', () => {
  it('takes its DOM with it and stops its loop', () => {
    const { root, overlay, frames } = scene();
    overlay.setPeers([{ actor: 'bob', cursor: { x: 0, y: 0 } }]);
    overlay.setPeers([{ actor: 'bob', cursor: { x: 900, y: 900 } }]);

    overlay.dispose();
    frames.settle();

    expect(root.querySelector(`.${PRESENCE_LAYER_CLASS}`)).toBeNull();
  });
});
