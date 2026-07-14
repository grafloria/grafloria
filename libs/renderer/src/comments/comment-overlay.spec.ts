// Wave 9 — Card 6: the pins, and THE FRAME GATE.
//
// Wave 8's frame gate skips a frame outright when the model epoch and the viewport are
// unchanged. That is what makes an idle 10k-node frame cost 0.0ms — and it is what makes
// every overlay that lives outside the model quietly stop redrawing. Three branches were
// bitten by exactly this last wave.
//
// So the tests below do not merely check that the pins appear. They BREAK the mechanism —
// bypass the model's change funnel, skip the invalidation — and demand that the picture
// goes stale. A gate you cannot show failing is not a gate.

import { DiagramEngine, DiagramModel, NodeModel, PortModel, CommentStore } from '@grafloria/engine';
import { SVGRenderer } from '../svg/svg-renderer';
import { renderCommentPins, commentPinAccessibleName } from './comment-pins';
import { CommentOverlayController } from './comment-overlay';
import type { VNode } from '../types';

const VIEWPORT = { x: 0, y: 0, width: 800, height: 600 };

function scene() {
  const engine = new DiagramEngine();
  const diagram = engine.createDiagram('comments')!;
  const n = new NodeModel({
    type: 'process',
    position: { x: 100, y: 100 },
    size: { width: 120, height: 60 },
  });
  (n as unknown as { id: string }).id = 'n1';
  n.addPort(new PortModel({ id: 'n1-out', type: 'output', side: 'right' }));
  n.setMetadata('label', 'Payment gateway');
  diagram.addNode(n);

  const renderer = new SVGRenderer(engine, {});
  const store = new CommentStore(diagram, { viewer: 'ada' });
  return { engine, diagram, renderer, store, node: n };
}

/** Find the pin layer in a rendered root, if it is there at all. */
function pinLayer(root: VNode): VNode | undefined {
  return root.children?.find((c) => c.props?.className === 'grafloria-comments-layer');
}
function pins(root: VNode): VNode[] {
  return pinLayer(root)?.children ?? [];
}

// ===========================================================================

describe('comment pins — geometry', () => {
  it('are drawn in WORLD coordinates, so pan and zoom carry them with the diagram', () => {
    const { renderer, store } = scene();
    new CommentOverlayController(store, renderer);
    store.createThread({ kind: 'region', x: 640, y: 480 }, 'this area needs a rethink');

    const at0 = pins(renderer.render(VIEWPORT, 1))[0];
    expect(at0.props.transform).toContain('translate(640, 480)');

    // Pan a long way. The pin's WORLD position is unchanged — it is a fact about the
    // diagram, and the viewport is a fact about the reader. (The root svg's viewBox is what
    // moves; the pin does not have to know that the user scrolled.)
    const panned = pins(renderer.render({ ...VIEWPORT, x: 400, y: 300 }, 1))[0];
    expect(panned.props.transform).toContain('translate(640, 480)');
  });

  it('counter-scale with zoom: a pin is a UI affordance, not a feature of the drawing', () => {
    const { renderer, store } = scene();
    new CommentOverlayController(store, renderer);
    // At the centre of the viewport, so it stays on screen as the visible rect shrinks and
    // grows around it — zoom culls, and this test is about the SCALE, not the culling.
    store.createThread({ kind: 'region', x: 400, y: 300 }, 'x');

    // At 4x, the pin must be drawn a quarter as big in world units so it stays the same
    // size on screen. Otherwise it swallows the node it points at.
    const zoomed = pins(renderer.render(VIEWPORT, 4))[0];
    expect(zoomed.props.transform).toContain('scale(0.25)');
    const out = pins(renderer.render(VIEWPORT, 0.25))[0];
    expect(out.props.transform).toContain('scale(4)');
  });

  it('follow the node they are anchored to — with no comment op emitted', () => {
    const { renderer, store, node } = scene();
    new CommentOverlayController(store, renderer);
    store.createThread({ kind: 'node', id: 'n1' }, 'why here?');
    expect(pins(renderer.render(VIEWPORT, 1))[0].props.transform).toContain('translate(220, 100)');

    node.setPosition(300, 240);
    expect(pins(renderer.render(VIEWPORT, 1))[0].props.transform).toContain('translate(420, 240)');
  });

  it('a pin outside the viewport is not built — 4,000 comments cost what the visible ones cost', () => {
    const { renderer, store } = scene();
    new CommentOverlayController(store, renderer);
    store.createThread({ kind: 'region', x: 100, y: 100 }, 'on screen');
    store.createThread({ kind: 'region', x: 99999, y: 99999 }, 'far, far away');

    expect(pins(renderer.render(VIEWPORT, 1))).toHaveLength(1);
  });

  it('a canvas with NO comment source builds no layer at all', () => {
    const { renderer } = scene();
    const root = renderer.render(VIEWPORT, 1);
    expect(pinLayer(root)).toBeUndefined();
    // …and the positional contract other code reads is untouched.
    expect(root.children).toHaveLength(4);
  });
});

// ===========================================================================

describe('comment pins — THE FRAME GATE (wave 8) stays honest', () => {
  it('an idle frame is still SKIPPED with comments on screen — the gate is not disarmed', () => {
    const { renderer, store } = scene();
    new CommentOverlayController(store, renderer);
    store.createThread({ kind: 'node', id: 'n1' }, 'x');

    renderer.render(VIEWPORT, 1);
    renderer.render(VIEWPORT, 1);
    const before = renderer.getFrameStats();
    const a = renderer.render(VIEWPORT, 1);
    const b = renderer.render(VIEWPORT, 1);
    const after = renderer.getFrameStats();

    expect(a).toBe(b); // the SAME object — the patcher's identity-skip does zero DOM work
    expect(after.built).toBe(before.built);
    expect(after.skipped).toBe(before.skipped + 2);
  });

  it("a REMOTE comment redraws, because the model's change funnel sees it", () => {
    const { renderer, diagram, store } = scene();
    new CommentOverlayController(store, renderer);
    renderer.render(VIEWPORT, 1);
    renderer.render(VIEWPORT, 1); // gate armed: the next idle frame would be skipped

    // What `applyOp` does when a peer's comment op arrives: a raw whole-tree assignment.
    // It lands on the model's ACCESSOR, which fires trackChange → markDirty → the global
    // mutation epoch moves → the gate opens.
    diagram.comments = {
      t1: {
        head: { id: 't1', author: 'ben', createdAt: 1 },
        anchor: { kind: 'node', id: 'n1', fallback: { x: 220, y: 100 } },
        messages: { m1: { id: 'm1', author: 'ben', body: 'is this right?', createdAt: 1 } },
      },
    };

    const root = renderer.render(VIEWPORT, 1);
    expect(pins(root)).toHaveLength(1); // ← the teammate's comment is ON SCREEN
    expect(pins(root)[0].props['aria-label']).toContain('Comment thread on Payment gateway');
  });

  it('MUTATION CONTROL: bypass the accessor and the comment lands in the model but is NEVER DRAWN', () => {
    // This is the bug the accessor pair exists to prevent, made visible. If
    // `DiagramModel.comments` were a plain FIELD — the obvious way to write it — then
    // applyOp's raw `holder['comments'] = next` would mutate the model with no trackChange,
    // no version bump and no epoch move. The frame gate would then correctly conclude that
    // nothing had changed and serve back the previous frame. Forever.
    const { renderer, diagram, store } = scene();
    new CommentOverlayController(store, renderer);
    renderer.render(VIEWPORT, 1);
    const armed = renderer.render(VIEWPORT, 1);

    // Write STRAIGHT to the private field — i.e. simulate a plain-field implementation.
    (diagram as unknown as { _comments: unknown })._comments = {
      t1: {
        head: { id: 't1', author: 'ben', createdAt: 1 },
        anchor: { kind: 'node', id: 'n1', fallback: { x: 220, y: 100 } },
        messages: { m1: { id: 'm1', author: 'ben', body: 'invisible', createdAt: 1 } },
      },
    };

    // The data IS in the model…
    expect(store.threads()).toHaveLength(1);
    // …and the renderer hands back the SAME frame it drew before. The comment does not
    // exist as far as any human is concerned.
    const stale = renderer.render(VIEWPORT, 1);
    expect(stale).toBe(armed);
    expect(pins(stale)).toHaveLength(0);

    // The escape hatch that exists for exactly this. (The controller calls it for every
    // change the model cannot see; here we call it by hand to prove it is what does the work.)
    renderer.invalidateFrame();
    expect(pins(renderer.render(VIEWPORT, 1))).toHaveLength(1);
  });

  it('READ STATE is not in the model — so marking a thread read must invalidate, and does', () => {
    const { renderer, diagram, store } = scene();
    const overlay = new CommentOverlayController(store, renderer);

    // A comment from someone else: unread, so the pin wears the red dot.
    diagram.comments = {
      t1: {
        head: { id: 't1', author: 'ben', createdAt: 1 },
        anchor: { kind: 'node', id: 'n1', fallback: { x: 220, y: 100 } },
        messages: { m1: { id: 'm1', author: 'ben', body: 'look at this', createdAt: 1 } },
      },
    };
    expect(pins(renderer.render(VIEWPORT, 1))[0].props['data-comment-unread']).toBe('1');
    renderer.render(VIEWPORT, 1); // gate armed

    // Reading it changes NOTHING in the model — by design, because it is a fact about Ada
    // and not about the document. So the epoch does not move, and without the explicit
    // invalidation the red dot would stay on screen until something else happened to
    // redraw. THIS is the trap.
    overlay.select('t1');

    const after = renderer.render(VIEWPORT, 1);
    expect(pins(after)[0].props['data-comment-unread']).toBe('0');
    expect(pins(after)[0].props['aria-label']).not.toContain('unread');
  });

  it('MUTATION CONTROL: skip the invalidation on a read, and the unread dot never goes away', () => {
    const { renderer, diagram, store } = scene();
    // A source with NO controller — i.e. nobody calling invalidateFrame() for view state.
    renderer.setCommentSource({
      getThreads: () => store.threads(),
      getPinOptions: () => ({}),
    });

    diagram.comments = {
      t1: {
        head: { id: 't1', author: 'ben', createdAt: 1 },
        anchor: { kind: 'node', id: 'n1', fallback: { x: 220, y: 100 } },
        messages: { m1: { id: 'm1', author: 'ben', body: 'look at this', createdAt: 1 } },
      },
    };
    renderer.render(VIEWPORT, 1);
    const armed = renderer.render(VIEWPORT, 1);
    expect(pins(armed)[0].props['data-comment-unread']).toBe('1');

    store.markRead('t1'); // pure view state — the model does not move

    const stale = renderer.render(VIEWPORT, 1);
    expect(stale).toBe(armed); // the gate skipped it, correctly, given what it can see…
    expect(pins(stale)[0].props['data-comment-unread']).toBe('1'); // …and the badge lies.
  });

  it('attaching and detaching the source both invalidate — a pin appearing IS a change', () => {
    const { renderer, store } = scene();
    store.createThread({ kind: 'node', id: 'n1' }, 'x');
    renderer.render(VIEWPORT, 1);
    renderer.render(VIEWPORT, 1); // armed, with no pins in it

    const overlay = new CommentOverlayController(store, renderer);
    expect(pins(renderer.render(VIEWPORT, 1))).toHaveLength(1);
    renderer.render(VIEWPORT, 1);

    overlay.dispose();
    expect(pinLayer(renderer.render(VIEWPORT, 1))).toBeUndefined();
  });
});

// ===========================================================================

describe('comment pins — ACCESSIBILITY', () => {
  it('a pin is a NAMED button, not an anonymous circle', () => {
    const { renderer, store } = scene();
    new CommentOverlayController(store, renderer);
    const tid = store.createThread({ kind: 'node', id: 'n1' }, 'is this the retry path?');
    store.reply(tid, 'no, the fallback');

    const pin = pins(renderer.render(VIEWPORT, 1))[0];
    expect(pin.props['role']).toBe('button');
    expect(pin.props['aria-label']).toBe('Comment thread on Payment gateway, 1 reply');
    expect(pin.props['aria-expanded']).toBe('false');

    // The graphics say nothing — the NAME says everything. Otherwise an AT announces an
    // unlabelled circle and then a stray "2".
    for (const child of pin.children ?? []) {
      expect(child.props['aria-hidden']).toBe('true');
    }
  });

  it('the name says DETACHED, RESOLVED and UNREAD in words — not in a colour (WCAG 1.4.1)', () => {
    const { renderer, diagram, store } = scene();
    new CommentOverlayController(store, renderer);
    const tid = store.createThread({ kind: 'node', id: 'n1' }, 'we cut this in March');
    diagram.removeNode('n1');

    const pin = pins(renderer.render(VIEWPORT, 1))[0];
    expect(pin.props['aria-label']).toBe(
      'Comment thread on a deleted node, Payment gateway, 0 replies, detached'
    );
    // …and a non-colour VISUAL cue too: a broken ring, which survives forced-colors mode
    // and colour blindness alike.
    expect(pin.children?.some((c) => c.key === 'detached-ring')).toBe(true);
    expect(pin.props['data-comment-attached']).toBe('false');

    store.resolve(tid);
    const resolved = renderCommentPins(store.threads(), { showResolved: true }).children![0];
    expect(resolved.props['aria-label']).toContain('resolved');
  });

  it('joins the ROVING TABINDEX — 40 pins are not 40 tab stops', () => {
    const { renderer, store } = scene();
    new CommentOverlayController(store, renderer);
    const t1 = store.createThread({ kind: 'region', x: 10, y: 10 }, 'a');
    store.createThread({ kind: 'region', x: 40, y: 40 }, 'b');

    // Nothing focused: every pin is -1 and the CANVAS is the single tab stop.
    const idle = renderer.render(VIEWPORT, 1);
    expect(pins(idle).map((p) => p.props['tabindex'])).toEqual(['-1', '-1']);
    expect(idle.props['tabindex']).toBe('0');

    // Focus a pin: it takes the 0, and the root yields — exactly as a node does.
    renderer.setAccessibleFocus({ type: 'comment', id: t1 });
    const focused = renderer.render(VIEWPORT, 1);
    expect(focused.props['tabindex']).toBe('-1');
    const stops = pins(focused).filter((p) => p.props['tabindex'] === '0');
    expect(stops).toHaveLength(1);
    expect(stops[0].props['data-comment-thread-id']).toBe(t1);

    // And the gate opened for it without anyone asking: focus is in the frame signature.
    expect(renderer.getAccessibleFocus()).toEqual({ type: 'comment', id: t1 });
  });

  it('the accessible name is built from the thread, and says what the reader needs', () => {
    const { store, diagram } = scene();
    const tid = store.createThread({ kind: 'node', id: 'n1' }, 'one');
    store.reply(tid, 'two');
    store.reply(tid, 'three');
    // Simulate the messages arriving from someone else, so they are unread.
    const t = store.thread(tid)!;
    for (const m of t.messages) (m as { author: string }).author = 'ben';
    diagram.comments = {
      ...diagram.comments,
      [tid]: {
        ...diagram.comments[tid],
        messages: Object.fromEntries(t.messages.map((m) => [m.id, { ...m, author: 'ben' }])),
      },
    };

    expect(commentPinAccessibleName(store.thread(tid)!)).toBe(
      'Comment thread on Payment gateway, 2 replies, 3 unread'
    );
  });

  it('resolved threads are hidden by default and shown on request', () => {
    const { renderer, store } = scene();
    const overlay = new CommentOverlayController(store, renderer);
    const tid = store.createThread({ kind: 'node', id: 'n1' }, 'x');
    store.resolve(tid);

    expect(pins(renderer.render(VIEWPORT, 1))).toHaveLength(0);
    overlay.setShowResolved(true);
    expect(pins(renderer.render(VIEWPORT, 1))).toHaveLength(1);
  });
});
