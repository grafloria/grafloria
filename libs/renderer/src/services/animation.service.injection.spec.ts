/**
 * Regression: the animation stylesheet is a document-global resource guarded,
 * until this spec's fix, by an INSTANCE flag — so concurrent renderers each
 * injected a duplicate `#grafloria-animations` (invalid HTML, breaks
 * getElementById for the host) and sequential mount/dispose cycles
 * accumulated a ~9 KB live-keyframe sheet per visit, forever in the
 * style-recalculation set. Found by a consumer audit against the published
 * 0.4.2 build.
 *
 * The fix refcounts ON the element (a data attribute), because two bundled
 * copies of this renderer share the document but not module scope — the DOM
 * is the only ledger both can read. These tests pin both halves of the
 * reporter's contract plus the partial-dispose case that makes a refcount a
 * refcount.
 */
import { AnimationService } from './animation.service';

const sheets = () => document.querySelectorAll('#grafloria-animations');

describe('AnimationService stylesheet injection', () => {
  afterEach(() => {
    document.querySelectorAll('#grafloria-animations').forEach((el) => el.remove());
  });

  it('two concurrent services share ONE stylesheet element', () => {
    const a = new AnimationService();
    const b = new AnimationService();
    a.injectCSS();
    b.injectCSS();
    expect(sheets().length).toBe(1);
    a.destroy();
    b.destroy();
  });

  it('mount → dispose leaves zero stylesheets', () => {
    const svc = new AnimationService();
    svc.injectCSS();
    expect(sheets().length).toBe(1);
    svc.destroy();
    expect(sheets().length).toBe(0);
  });

  it('disposing one of two keeps the sheet; disposing the last removes it', () => {
    const a = new AnimationService();
    const b = new AnimationService();
    a.injectCSS();
    b.injectCSS();
    a.destroy();
    expect(sheets().length).toBe(1);
    b.destroy();
    expect(sheets().length).toBe(0);
  });

  it('sequential mount/dispose cycles do not accumulate', () => {
    for (let i = 0; i < 5; i++) {
      const svc = new AnimationService();
      svc.injectCSS();
      expect(sheets().length).toBe(1);
      svc.destroy();
    }
    expect(sheets().length).toBe(0);
  });

  it('double injectCSS on one instance counts once', () => {
    const svc = new AnimationService();
    svc.injectCSS();
    svc.injectCSS();
    expect(sheets().length).toBe(1);
    svc.destroy();
    expect(sheets().length).toBe(0);
  });

  it('destroy removes the motion listener it registered, not a fresh arrow', () => {
    const removed: unknown[] = [];
    const added: unknown[] = [];
    const mql = {
      matches: false,
      addEventListener: (_: string, fn: unknown) => added.push(fn),
      removeEventListener: (_: string, fn: unknown) => removed.push(fn),
    };
    const original = window.matchMedia;
    window.matchMedia = (() => mql) as never;
    try {
      const svc = new AnimationService();
      svc.destroy();
      expect(added.length).toBe(1);
      expect(removed).toEqual(added);
    } finally {
      window.matchMedia = original;
    }
  });
});
