/**
 * The follow-presenter seam — Wave 9, Card 7.
 *
 * ## THIS IS THE INTERFACE TO WIRE TO THE REAL AWARENESS CHANNEL
 *
 * "Follow presenter" needs a transport, and this wave's collaboration substrate
 * (op log / CRDT / sync / awareness) is being built in parallel by other agents in
 * `libs/engine/src/collab/**`. Rather than invent a second transport, or import a
 * module that does not exist yet, presentation talks to exactly this two-method
 * interface and nothing else.
 *
 * To connect it to the real awareness channel, implement {@link ViewportChannel}
 * over it — broadcast on the presenter's awareness state, invoke the callback when
 * a remote presenter's state arrives — and hand that object to `presentTo()` /
 * `followPresenter()`. Nothing else in the presentation code needs to change, and
 * nothing here imports from `collab/`.
 *
 * ## What travels: CENTRE + ZOOM, not the camera rectangle
 *
 * A `ViewportController`'s rectangle is `{x, y, width, height}` where x/y are WORLD
 * coordinates but **width/height are the canvas's CSS-pixel size** — the viewer's
 * own screen, not a world span (see the coordinate contract on ViewportController).
 *
 * So broadcasting the raw rectangle and applying it verbatim on the follower would
 * overwrite the follower's canvas size with the presenter's. `clientToWorld()` would
 * then stop being the inverse of the rendered `viewBox`, and the follower's
 * hit-testing would silently desynchronise from its own picture — on a laptop
 * following a phone, every click would land in the wrong place.
 *
 * What "follow me" actually means is *show the same world region at the same
 * magnification*, so what travels is the presenter's world CENTRE and ZOOM. The
 * follower keeps its own canvas size and derives its rectangle from those. Two
 * viewers on differently-sized screens both end up looking at the same content,
 * each correctly framed — which is the only sane behaviour and, not coincidentally,
 * the only one that keeps hit-testing correct.
 */

// Reuse the renderer's existing Unsubscribe rather than declaring a second one:
// two identical types with the same name in one barrel is an ambiguous re-export
// and breaks every downstream package that does `export * from '@grafloria/renderer'`.
import type { Unsubscribe } from '../viewport/viewport-controller';

export type { Unsubscribe };

/** What a presenter broadcasts. Centre + zoom, deliberately NOT a camera rect. */
export interface PresenterViewport {
  /** World X of the centre of the presenter's view. */
  centerX: number;
  /** World Y of the centre of the presenter's view. */
  centerY: number;
  /** The presenter's magnification. */
  zoom: number;
  /** Who is presenting. Lets a follower ignore its own echo, and label the UI. */
  presenterId?: string;
}

/**
 * The transport seam. Two methods, no lifecycle, no assumptions about the wire.
 * Implement over WebSocket / WebRTC / Yjs awareness / BroadcastChannel / postMessage.
 */
export interface ViewportChannel {
  /** Publish the presenter's current view to every follower. */
  broadcastViewport(viewport: PresenterViewport): void;
  /** Subscribe to presenter broadcasts. Returns an unsubscribe function. */
  onViewportBroadcast(callback: (viewport: PresenterViewport) => void): Unsubscribe;
}

/**
 * A working, in-process implementation — the local/in-memory transport this card
 * ships so the feature is demonstrably complete end-to-end rather than an interface
 * with nothing behind it.
 *
 * Genuinely useful beyond tests: it drives two `createDiagram()` instances on the
 * same page (a presenter canvas and a follower/minimap canvas), which is a real
 * product surface. Swap it for the network implementation and nothing else moves.
 */
export class InMemoryViewportChannel implements ViewportChannel {
  private readonly subscribers = new Set<(viewport: PresenterViewport) => void>();
  private last: PresenterViewport | null = null;

  broadcastViewport(viewport: PresenterViewport): void {
    this.last = { ...viewport };
    // Copy the subscriber set before iterating: a follower is allowed to
    // unsubscribe from inside its own callback (stopFollowing() on the first
    // frame is a real pattern), and mutating a Set mid-iteration would skip a
    // subscriber.
    for (const subscriber of [...this.subscribers]) {
      subscriber({ ...viewport });
    }
  }

  onViewportBroadcast(callback: (viewport: PresenterViewport) => void): Unsubscribe {
    this.subscribers.add(callback);

    // Replay the latest state to a late joiner. Someone who opens the link after
    // the presenter has already moved must land where the presenter IS, not sit on
    // a default camera until the presenter happens to twitch.
    if (this.last) callback({ ...this.last });

    return () => {
      this.subscribers.delete(callback);
    };
  }

  /** The most recent broadcast, or null. */
  getLast(): PresenterViewport | null {
    return this.last ? { ...this.last } : null;
  }

  /** Drop all subscribers (teardown). */
  dispose(): void {
    this.subscribers.clear();
    this.last = null;
  }
}
