// Wave 9 — Card 5: IS ANY OF THIS ACTUALLY WIRED UP?
//
// =============================================================================
// THE ONLY TEST IN THIS CARD THAT CANNOT BE FAKED
// =============================================================================
//
// This codebase's signature bug, found in ALL EIGHT previous waves, is machinery wired to
// nothing. A `setLayoutService()` nobody called. Seventeen LOD presets that were all
// no-ops. A worker stack whose every test forced `useWorker:false`. A quality governor
// wired to nothing. A `Command.serialize()` on every command with no deserializer anywhere
// in the tree — write-only, green, and useless.
//
// Every unit test in this card could pass with the SyncAdapter connected to nothing at all.
// `Replica.onLocalOp` is a callback; forget to pass it and every op vanishes silently, the
// log stays perfect, the fuzz still converges (both peers are editing nothing), and the
// product does not sync. So:
//
//   TWO REAL `createDiagram()` INSTANCES, in real DOM.
//   A REAL DomEventBinder, driven with REAL pointer events.
//   A REAL SyncAdapter over a REAL transport.
//   Assert the bytes come out of the OTHER pane's MODEL — and the other pane's DOM.
//
// Nothing here is stubbed except the browser's rAF, and only so the test is not a race.
//
// This is also the "two panes in one page" demo that the in-memory transport exists for:
// split view, a linked preview, a second monitor. It is a product feature, and it is the
// strongest possible reachability proof, which is a pleasant coincidence.

import { DiagramModel, NodeModel, createSyncSession, MemoryHub, type SyncAdapter } from '@grafloria/engine';
import { createDiagram, type DiagramInstance } from '../instance/create-diagram';
import { bindPresence, type PresenceBinding } from './bind-presence';
import { PRESENCE_LAYER_CLASS } from './presence-overlay';

// ---------------------------------------------------------------------------
// TWO jsdom GAPS, PATCHED HERE AND REPORTED RATHER THAN SWEPT UP.
//
// 1. `structuredClone` — jsdom does not expose it, and Card 0's `applyOp` calls it on every
//    metadata/state/style/points write. So ANY renderer-side test that applies a remote op
//    throws `ReferenceError`, and — more to the point — so would a real browser without it
//    (Safari < 15.4). Every current browser has it, so this is not a shipping bug today, but
//    it IS an undeclared platform requirement in a library that otherwise guards every
//    platform touch through `../platform`. Flagged in the wave report; not fixed here,
//    because `collab/**` belongs to wave9/crdt.
//
//    The polyfill is EXACT for this use: `applyOp` only ever clones an `OpValue`, which is
//    JSON-safe by definition (ops have to survive a network hop and a disk round-trip).
//
// 2. `PointerEvent` — jsdom does not implement it either. A `MouseEvent` with type
//    'pointermove' fires the same listener and carries the same clientX/clientY, so the
//    events below are real DOM events reaching the real handlers; only the constructor name
//    differs.
// ---------------------------------------------------------------------------
const g = globalThis as { structuredClone?: <T>(v: T) => T };
g.structuredClone ??= <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** A pointer event jsdom will actually construct. Same type, same coords, same listener. */
function pointerMove(x: number, y: number): MouseEvent {
  return new MouseEvent('pointermove', { clientX: x, clientY: y, bubbles: true });
}

/** rAF → run now. The overlay's interpolation loop would otherwise never tick in jsdom. */
const immediateFrames = {
  requestFrame: (cb: () => void) => {
    cb();
    return 1;
  },
  cancelFrame: () => undefined,
};

interface Pane {
  el: HTMLElement;
  instance: DiagramInstance;
  session: SyncAdapter;
  presence: PresenceBinding;
}

function pane(hub: MemoryHub, actor: string, model: DiagramModel, name: string): Pane {
  const el = document.createElement('div');
  el.style.width = '800px';
  el.style.height = '600px';
  document.body.appendChild(el);
  // jsdom gives every element a zero-sized rect; the camera needs a real one or every
  // screen↔world conversion collapses to the origin.
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0 }) as DOMRect;

  // The REAL renderer, the REAL event binder, the REAL patcher — attached to this model.
  const instance = createDiagram(el, { engine: undefined, nodes: [], edges: [] });
  // …but driving the model the sync session owns. `createDiagram` makes its own engine, so
  // we hand its model to the session — which is exactly what a host does.
  const session = createSyncSession(instance.getModel(), hub.connect(actor), {
    actor,
    batch: { intervalMs: 1_000_000 }, // flushed by hand, so nothing races a timer
    awarenessThrottleMs: 0,
  });
  session.join();

  const presence = bindPresence(instance, session, { name, ...immediateFrames });
  void model;
  return { el, instance, session, presence };
}

function node(id: string, x: number, y: number): NodeModel {
  const n = new NodeModel({ type: 'basic', position: { x, y }, size: { width: 120, height: 60 } });
  (n as unknown as { id: string }).id = id;
  return n;
}

describe('REACHABILITY — two live panes, real events, real transport', () => {
  let hub: MemoryHub;
  let left: Pane;
  let right: Pane;

  beforeEach(() => {
    hub = new MemoryHub();
    left = pane(hub, 'ana', new DiagramModel('shared'), 'Ana');
    right = pane(hub, 'bo', new DiagramModel('shared'), 'Bo');
  });

  afterEach(() => {
    for (const p of [left, right]) {
      p.presence.dispose();
      p.session.dispose();
      p.instance.dispose();
      p.el.remove();
    }
  });

  it('a node added in one LIVE pane appears in the other LIVE pane’s MODEL', () => {
    left.instance.getModel().addNode(node('shared-node', 40, 40));
    left.session.flush();

    const there = right.instance.getModel().getNode('shared-node');
    expect(there).toBeDefined();
    expect(there!.position).toMatchObject({ x: 40, y: 40 });
  });

  it('…and in the other pane’s DOM — the renderer really did repaint', () => {
    // A model that syncs but never repaints is a different bug wearing the same coat.
    left.instance.getModel().addNode(node('painted', 40, 40));
    left.session.flush();
    right.instance.renderNow();

    expect(right.el.querySelector('[data-node-id="painted"], [data-id="painted"]')).toBeTruthy();
  });

  it('A REAL DRAG: pointer events on one pane move the node in the other', () => {
    // ---------------------------------------------------------------------------
    // THE TEST. Not `model.setPosition()` — a real pointerdown/pointermove/pointerup
    // through the real `DomEventBinder`, exactly as a user's hand would produce, driving the
    // real interaction stack, the real command layer, the real model, the real OpCapture,
    // the real batcher, the real transport, and the real remote Replica.
    //
    // If `onLocalOp` were not wired, every layer above would still be green and this line
    // would fail. That is the entire point of it.
    // ---------------------------------------------------------------------------
    const model = left.instance.getModel();
    model.addNode(node('draggable', 100, 100));
    left.session.flush();
    left.instance.renderNow();

    expect(right.instance.getModel().getNode('draggable')!.position).toMatchObject({ x: 100, y: 100 });

    // A real drag: press ON THE NODE, move 150px right and 75px down, release.
    //
    // The binder hit-tests by walking up from `event.target` looking for `data-node-id`, and
    // listens for mousemove/mouseup ON THE CONTAINER (not on window) — so the events have to
    // be dispatched exactly where a real mouse would put them. Dispatching the moves on
    // `window` instead reaches nothing and the node sits still, which is how I learned this.
    const target = left.el.querySelector('[data-node-id="draggable"]');
    expect(target).toBeTruthy(); // the node really is in the DOM to be grabbed

    target!.dispatchEvent(
      new MouseEvent('mousedown', { clientX: 160, clientY: 130, bubbles: true, button: 0 })
    );
    for (let i = 1; i <= 5; i++) {
      left.el.dispatchEvent(
        new MouseEvent('mousemove', {
          clientX: 160 + i * 30,
          clientY: 130 + i * 15,
          bubbles: true,
        })
      );
    }
    left.el.dispatchEvent(new MouseEvent('mouseup', { clientX: 310, clientY: 205, bubbles: true }));

    left.session.flush();

    // The node moved locally…
    const here = model.getNode('draggable')!;
    expect(here.position.x).toBeGreaterThan(100);

    // …and the SAME position is now in the other pane's model. Through the whole stack.
    const there = right.instance.getModel().getNode('draggable')!;
    expect(there.position).toEqual(here.position);
  });

  it('BATCHING is real: a 5-move drag puts ONE op on the wire, not five', () => {
    // The drag above emits an op per mousemove. Coalescing must collapse them to the LAST
    // write on the position register — and the remote node must land on the FINAL position,
    // not the first one (which is what a keep-the-first coalescer would do, silently).
    const model = left.instance.getModel();
    model.addNode(node('dragged', 100, 100));
    left.session.flush();

    const opsBefore = left.session.stats.opsSent;

    const n = model.getNode('dragged')!;
    for (let i = 1; i <= 20; i++) n.setPosition(100 + i * 5, 100); // 20 pointermove frames
    left.session.flush();

    const sent = left.session.stats.opsSent - opsBefore;
    expect(sent).toBe(1); // …twenty writes, one op on the wire

    expect(right.instance.getModel().getNode('dragged')!.position).toMatchObject({ x: 200, y: 100 });
    //                                                                                  ^^^
    // The LAST position, not the first. A keep-the-first coalescer would put 105 here, and
    // the two peers would agree — on the wrong answer.
  });

  it('A REAL MOUSE MOVE puts a REAL CURSOR in the other pane’s DOM', () => {
    // Presence, end to end: a pointermove on Ana's canvas → world coords → awareness → the
    // memory bus → Bo's Awareness store → Bo's overlay → an actual <div> in Bo's DOM.
    left.el.dispatchEvent(pointerMove(300, 200));

    const layer = right.el.querySelector(`.${PRESENCE_LAYER_CLASS}`)!;
    const cursor = layer.querySelector('.grafloria-presence-cursor[data-actor="ana"]') as HTMLElement;

    expect(cursor).toBeTruthy();
    expect(cursor.style.display).toBe('block');
    expect(cursor.style.transform).toBe('translate(300px, 200px)'); // world coords
    expect(layer.querySelector('.grafloria-presence-label')!.textContent).toBe('Ana');
  });

  it('the cursor does NOT enter the op log — presence stays out of the document forever', () => {
    for (let i = 0; i < 200; i++) {
      left.el.dispatchEvent(pointerMove(100 + i, 100));
    }
    expect(left.session.replica.history()).toHaveLength(0);
    expect(right.session.replica.history()).toHaveLength(0);
  });

  it('MOVING A CURSOR DOES NOT REPAINT THE DIAGRAM — the frame gate stays shut', () => {
    // ---------------------------------------------------------------------------
    // THE PERF TRAP, ASSERTED. A remote cursor changes the PICTURE without changing the
    // MODEL or the VIEWPORT. Had the cursors been VNodes, the honest fix would be to call
    // `invalidateFrame()` — and then 4 peers × 60Hz would re-derive and re-reconcile a
    // 10,000-node diagram 240 times a second to move a 12-pixel arrow.
    //
    // They are not VNodes. So: `painted` must not move. Not once.
    // ---------------------------------------------------------------------------
    right.instance.renderNow(); // settle
    const paintedBefore = right.instance.scheduler.stats.painted;

    for (let i = 0; i < 100; i++) {
      left.el.dispatchEvent(pointerMove(100 + i, 150));
    }

    // A hundred remote cursor updates landed and were drawn…
    const cursor = right.el.querySelector('.grafloria-presence-cursor[data-actor="ana"]') as HTMLElement;
    expect(cursor.style.transform).toBe('translate(199px, 150px)');

    // …and the diagram did not repaint. Not once.
    expect(right.instance.scheduler.stats.painted).toBe(paintedBefore);
  });

  it('a REAL selection travels as awareness and outlines the node in the other pane', () => {
    const model = left.instance.getModel();
    model.addNode(node('selectme', 200, 150));
    left.session.flush();

    // The REAL selection API — which is what emits `selection:changed`, which is what
    // `bindPresence` listens to. Not a hand-fired event.
    model.selectNode(model.getNode('selectme')!);

    const box = right.el.querySelector(
      '.grafloria-presence-selection[data-entity="selectme"]'
    ) as HTMLElement;
    expect(box).toBeTruthy();
    expect(box.style.left).toBe('200px');
  });
});

// ===========================================================================
// THE EPHEMERAL-STATE LEAK — a REAL BUG, found by driving a real mouse in a real browser.
// NOT FIXED HERE, because the fix is three lines in a file this card does not own.
//
// `OpCapture` (collab/capture.ts, Card 0 — wave9/crdt's) emits a `set … path='state'` op for
// EVERY change to an entity's state object. And `state` holds BOTH:
//
//     durable:   visible · locked · expanded · enabled     ← document. MUST sync.
//     ephemeral: hovered · selected · focused              ← per-VIEWER. MUST NOT sync.
//
// So merely MOVING THE MOUSE ACROSS A NODE writes to the document. Two ops, per node, per
// hover, forever, into an append-only, persisted, replayable log — and the peer applies them,
// so a node lights up on MY screen because YOUR mouse is over it. Selection is the same bug
// with worse consequences: your click deselects my node.
//
// HOW I FOUND IT, AND WHY NOTHING ELSE COULD HAVE. The cross-tab e2e asserted "40 remote
// cursor moves add nothing to the op log" and it FAILED — the log grew by 5. jsdom does not
// hover, the engine tests never move a mouse, and every unit test in this card passes. It
// took a real browser.
//
// AND THE TEST BELOW USED TO BE A FALSE GREEN, which is the part worth admitting: it asserted
// `state.selected === false` on the remote peer and PASSED — not because selection does not
// sync, but because the batcher was never flushed, so the op never left. A green assertion,
// for entirely the wrong reason, guarding exactly the bug it was written to prevent.
//
// THE FIX (for wave9/crdt, in capture.ts, next to the `DERIVED` set that already exists for
// exactly this reason): an EPHEMERAL set, and emit `state` ops only for the durable keys.
// The precedent is already there — `points` is excluded because it is derived. `hovered` and
// `selected` should be excluded because they are per-viewer. Presence already carries them,
// correctly, on the awareness channel, which is where they belong.
// ===========================================================================
describe('THE EPHEMERAL-STATE LEAK (known defect, reported not fixed)', () => {
  let hub: MemoryHub;
  let left: Pane;
  let right: Pane;

  beforeEach(() => {
    hub = new MemoryHub();
    left = pane(hub, 'ana', new DiagramModel('shared'), 'Ana');
    right = pane(hub, 'bo', new DiagramModel('shared'), 'Bo');
  });

  afterEach(() => {
    for (const p of [left, right]) {
      p.presence.dispose();
      p.session.dispose();
      p.instance.dispose();
      p.el.remove();
    }
  });

  it('HOVERING a node writes to the document — and lights it up on the other user’s screen', () => {
    const model = left.instance.getModel();
    model.addNode(node('hovered-node', 10, 10));
    left.session.flush();

    const logBefore = left.session.replica.history().length;

    // Exactly what `DomEventBinder` does when the pointer crosses a node. No click. No drag.
    model.getNode('hovered-node')!.setState({ hovered: true });
    left.session.flush();

    // A permanent entry in an append-only document history, for a mouse passing over.
    expect(left.session.replica.history().length).toBeGreaterThan(logBefore);

    // …and Bo's node is now HOVERED, because ANA's mouse is over it.
    expect(right.instance.getModel().getNode('hovered-node')!.state.hovered).toBe(true);
  });

  it('SELECTING a node selects it for the other user too — their click moves your selection', () => {
    const model = left.instance.getModel();
    model.addNode(node('selectme', 200, 150));
    left.session.flush();

    model.selectNode(model.getNode('selectme')!);
    left.session.flush(); // ← THE LINE THAT WAS MISSING, and that made the old test a false green

    // Selection is per-VIEWER. `state.selected` is a single shared register. So Ana's click
    // selects Bo's node — and when Bo clicks something else, he deselects Ana's.
    expect(right.instance.getModel().getNode('selectme')!.state.selected).toBe(true);
  });

  it('the awareness channel ALREADY carries selection correctly — the op is pure damage', () => {
    // The remedy needs no new mechanism. Presence already publishes selection on the
    // ephemeral channel, per viewer, expiring on disconnect — which is exactly right. The
    // `state` op is not doing a job that would otherwise go undone; it is doing damage.
    const model = left.instance.getModel();
    model.addNode(node('sel', 300, 300));
    left.session.flush();
    model.selectNode(model.getNode('sel')!);

    expect(right.session.awareness.getPeer('ana')!.state['selection']).toEqual(['sel']);
    expect(
      right.el.querySelector('.grafloria-presence-selection[data-entity="sel"]')
    ).toBeTruthy();
  });
});
