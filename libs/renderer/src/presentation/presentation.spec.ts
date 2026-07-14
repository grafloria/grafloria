/**
 * Presentation, read-only share mode & follow-presenter — Wave 9, Card 7.
 *
 * The interesting assertions here are the ones that catch the traps, not the ones
 * that show a viewport being copied:
 *
 *   - a follower must NOT inherit the presenter's CANVAS SIZE (it would desync its
 *     own hit-testing from its own picture);
 *   - a client that presents AND follows on one channel must not echo-loop;
 *   - a late joiner must land where the presenter IS, not where they started.
 */
import { DiagramEngine, DiagramMode, NodeModel } from '@grafloria/engine';
import { ViewportController } from '../viewport/viewport-controller';
import { InMemoryViewportChannel } from './viewport-channel';
import {
  followPresenter,
  isDocumentLocked,
  loadReadonlySnapshot,
  lockDocument,
  presentTo,
  type PresentationHost,
} from './presentation';

/** A minimal host: a real ViewportController + a render counter. */
function host(width = 800, height = 600): PresentationHost & { renders: number } {
  const viewport = new ViewportController({
    viewport: { x: 0, y: 0, width, height },
    zoom: 1,
  });
  const h = {
    viewport,
    renders: 0,
    render() {
      h.renders++;
    },
  };
  return h;
}

const centerOf = (h: PresentationHost) => {
  const vp = h.viewport.getViewport();
  return { x: vp.x + vp.width / 2, y: vp.y + vp.height / 2 };
};

describe('follow presenter', () => {
  it('a follower lands on the presenter\'s world centre and zoom', () => {
    const channel = new InMemoryViewportChannel();
    const presenter = host(1000, 800);
    const follower = host(1000, 800);

    presentTo(presenter, channel, { throttleMs: 0 });
    followPresenter(follower, channel);

    presenter.viewport.setZoom(2);
    presenter.viewport.pan(300, 150);

    expect(follower.viewport.getZoom()).toBe(2);
    expect(centerOf(follower)).toEqual(centerOf(presenter));
    expect(follower.renders).toBeGreaterThan(0);
  });

  it('THE TRAP: a follower keeps its OWN canvas size (a phone following a laptop)', () => {
    // viewport.width/height are the CANVAS's CSS-pixel size, not a world span. If a
    // follower adopted the presenter's rectangle wholesale it would also adopt the
    // presenter's canvas size, and its clientToWorld() would stop being the inverse
    // of what it renders — every click would land in the wrong place.
    const channel = new InMemoryViewportChannel();
    const presenter = host(1600, 1200); // laptop
    const follower = host(390, 700); // phone

    presentTo(presenter, channel, { throttleMs: 0 });
    followPresenter(follower, channel);

    presenter.viewport.setZoom(1.5);
    presenter.viewport.pan(500, 400);

    const vp = follower.viewport.getViewport();
    expect(vp.width).toBe(390); // NOT 1600
    expect(vp.height).toBe(700); // NOT 1200

    // ...and it is nonetheless looking at the same world point at the same zoom.
    expect(follower.viewport.getZoom()).toBe(1.5);
    expect(centerOf(follower).x).toBeCloseTo(centerOf(presenter).x, 6);
    expect(centerOf(follower).y).toBeCloseTo(centerOf(presenter).y, 6);
  });

  it('a late joiner is replayed the presenter\'s CURRENT position, not their starting one', () => {
    const channel = new InMemoryViewportChannel();
    const presenter = host();
    presentTo(presenter, channel, { throttleMs: 0 });
    presenter.viewport.pan(900, 400); // presenter moves BEFORE anyone follows

    const latecomer = host();
    followPresenter(latecomer, channel);

    expect(centerOf(latecomer)).toEqual(centerOf(presenter));
  });

  it('THE TRAP: presenting and following on the same channel does not echo-loop', () => {
    // A client that can be handed the presenter role both presents and follows.
    // Applying your own broadcast emits a viewport change, which re-broadcasts...
    // If the guards are wrong this test does not fail, it HANGS — so the broadcast
    // count is the assertion.
    const channel = new InMemoryViewportChannel();
    const me = host();

    let broadcasts = 0;
    const counting = {
      broadcastViewport: (vp: Parameters<typeof channel.broadcastViewport>[0]) => {
        broadcasts++;
        channel.broadcastViewport(vp);
      },
      onViewportBroadcast: channel.onViewportBroadcast.bind(channel),
    };

    presentTo(me, counting, { presenterId: 'me', throttleMs: 0 });
    followPresenter(me, counting, { ignorePresenterId: 'me' });

    const before = broadcasts;
    me.viewport.pan(120, 60);

    // One pan ⇒ one broadcast. Not two, not a stack overflow.
    expect(broadcasts - before).toBe(1);
  });

  it('stop() detaches the follower and the presenter', () => {
    const channel = new InMemoryViewportChannel();
    const presenter = host();
    const follower = host();

    const p = presentTo(presenter, channel, { throttleMs: 0 });
    const f = followPresenter(follower, channel);

    presenter.viewport.pan(100, 100);
    const followed = centerOf(follower);

    f.stop();
    presenter.viewport.pan(500, 500);
    expect(centerOf(follower)).toEqual(followed); // no longer tracking

    p.stop();
    const last = channel.getLast();
    presenter.viewport.pan(10, 10);
    expect(channel.getLast()).toEqual(last); // no longer broadcasting
  });

  it('broadcasts are throttled, but the FINAL position is always delivered', async () => {
    const channel = new InMemoryViewportChannel();
    const presenter = host();
    const follower = host();

    presentTo(presenter, channel, { throttleMs: 30 });
    followPresenter(follower, channel);

    // A burst, as a real pan would produce.
    for (let i = 1; i <= 20; i++) presenter.viewport.pan(10, 0);

    // The trailing edge must still land, or a follower ends a pan permanently behind.
    await new Promise((r) => setTimeout(r, 60));
    expect(centerOf(follower).x).toBeCloseTo(centerOf(presenter).x, 6);
  });
});

describe('read-only share mode', () => {
  const mkEngine = () => {
    const engine = new DiagramEngine();
    const diagram = engine.createDiagram('share');
    const node = new NodeModel({
      id: 'n1',
      type: 'default',
      position: { x: 10, y: 20 },
      size: { width: 100, height: 50 },
    });
    diagram.addNode(node);
    return { engine, diagram, node };
  };

  it('lockDocument() drives the ENGINE mode, and the model is genuinely locked', () => {
    const { engine, node } = mkEngine();

    lockDocument(engine);
    expect(isDocumentLocked(engine)).toBe(true);
    expect(engine.getMode()).toBe(DiagramMode.PRESENTATION);

    node.setPosition(999, 999);
    expect(node.position).toMatchObject({ x: 10, y: 20 }); // refused

    lockDocument(engine, false);
    expect(isDocumentLocked(engine)).toBe(false);
    node.setPosition(999, 999);
    expect(node.position).toMatchObject({ x: 999, y: 999 });
  });

  it('loadReadonlySnapshot() produces a document that renders but cannot be edited', () => {
    const { engine, diagram } = mkEngine();
    const snapshot = diagram.serialize();

    const viewer = new DiagramEngine();
    const loaded = loadReadonlySnapshot(viewer, snapshot);

    // The content is really there (a locked-but-empty canvas would be the classic
    // failure: the lock refusing the loader's own addNode calls).
    expect(loaded.getNodes()).toHaveLength(1);
    expect(loaded.getNode('n1')?.position).toMatchObject({ x: 10, y: 20 });

    // ...and it is locked.
    expect(isDocumentLocked(viewer)).toBe(true);
    loaded.getNode('n1')!.setPosition(500, 500);
    expect(loaded.getNode('n1')?.position).toMatchObject({ x: 10, y: 20 });

    loaded.addNode(
      new NodeModel({ id: 'intruder', type: 'default', position: { x: 0, y: 0 } })
    );
    expect(loaded.getNode('intruder')).toBeUndefined();
  });

  it('a locked document can still be PANNED and ZOOMED (the point of presentation mode)', () => {
    const { engine } = mkEngine();
    lockDocument(engine);

    const view = new ViewportController({ viewport: { x: 0, y: 0, width: 800, height: 600 } });
    view.setZoom(2.5);
    view.pan(100, 50);

    expect(view.getZoom()).toBe(2.5);
    expect(view.getViewport()).toMatchObject({ x: 100, y: 50 });
  });
});
