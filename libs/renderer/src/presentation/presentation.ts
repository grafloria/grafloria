import type { DiagramEngine, SerializedDiagram } from '@grafloria/engine';
import { DiagramMode, DiagramModel } from '@grafloria/engine';
import type { ViewportController } from '../viewport/viewport-controller';
import type { PresenterViewport, Unsubscribe, ViewportChannel } from './viewport-channel';

/**
 * Presentation & read-only share mode — Wave 9, Card 7.
 *
 * Three things, and they are independent on purpose (you can lock a document
 * without presenting it, and present without locking — a presenter is usually the
 * one person who still MAY edit):
 *
 *   1. {@link lockDocument}      — the document becomes read-only, for real.
 *   2. {@link presentTo}         — broadcast my camera to whoever is following.
 *   3. {@link followPresenter}   — put my camera where the presenter's is.
 *
 * The read-only half is NOT implemented here. It is enforced in the engine, at the
 * model and the CommandManager (`libs/engine/src/models/readonly-lock.ts`), because
 * that is where mutation actually happens. A "read-only mode" implemented in a
 * presentation module would be a mode that only the presentation module respects —
 * which is precisely the failure this wave set out to fix.
 */

/** The minimum a host must expose to be presented from / followed. `DiagramInstance` satisfies it. */
export interface PresentationHost {
  readonly viewport: ViewportController;
  /** Queue a repaint. */
  render(): void;
}

export interface PresentOptions {
  /** Identifies this presenter on the wire; echoed back in the payload. */
  presenterId?: string;
  /**
   * Coalesce broadcasts to at most one per N ms. Default 50 (≈20/s).
   *
   * A pan emits a viewport change on EVERY pointermove — 120/s on a high-rate
   * trackpad. Publishing each one would flood the transport with frames the
   * follower cannot even display. The trailing edge is always sent, so followers
   * still land exactly where the presenter stopped rather than one frame short.
   */
  throttleMs?: number;
}

/**
 * Broadcast this host's camera to `channel` for as long as the returned handle is
 * alive. Returns a `stop()` that unsubscribes and cancels any pending trailing send.
 */
export function presentTo(
  host: PresentationHost,
  channel: ViewportChannel,
  options: PresentOptions = {}
): { stop: Unsubscribe } {
  const presenterId = options.presenterId;
  const throttleMs = options.throttleMs ?? 50;

  let lastSentAt = 0;
  let pending: ReturnType<typeof setTimeout> | null = null;

  const payload = (): PresenterViewport => {
    const vp = host.viewport.getViewport();
    const zoom = host.viewport.getZoom();
    // Centre, not origin: see viewport-channel.ts. viewport.width/height are the
    // PRESENTER's canvas size and must never reach the follower.
    return {
      centerX: vp.x + vp.width / 2,
      centerY: vp.y + vp.height / 2,
      zoom,
      presenterId,
    };
  };

  const send = (): void => {
    lastSentAt = Date.now();
    channel.broadcastViewport(payload());
  };

  const onViewportChange = (): void => {
    const since = Date.now() - lastSentAt;
    if (since >= throttleMs) {
      if (pending) {
        clearTimeout(pending);
        pending = null;
      }
      send();
      return;
    }
    // Trailing edge: guarantee the FINAL position is published even if the
    // presenter stops moving mid-throttle-window. Without it a follower ends a
    // pan up to `throttleMs` of movement behind, permanently.
    if (!pending) {
      pending = setTimeout(() => {
        pending = null;
        send();
      }, throttleMs - since);
    }
  };

  const unsubscribe = host.viewport.onChange(onViewportChange);

  // Publish immediately, so a follower who joins later gets the presenter's real
  // position from the channel's replay rather than waiting for the next movement.
  send();

  return {
    stop: () => {
      unsubscribe();
      if (pending) {
        clearTimeout(pending);
        pending = null;
      }
    },
  };
}

export interface FollowOptions {
  /**
   * Ignore broadcasts carrying this presenterId — i.e. my own.
   *
   * Matters because a client may present AND follow on the same channel (a
   * presenter who can be handed over to). Without it, applying my own broadcast
   * would set my viewport, which emits a change, which re-broadcasts: an infinite
   * feedback loop that pins the CPU. The `applying` re-entrancy guard below closes
   * the same hole from the other side.
   */
  ignorePresenterId?: string;
  /** Called whenever a presenter's viewport is applied (for a "following X" badge). */
  onFollow?: (viewport: PresenterViewport) => void;
}

/**
 * Slave this host's camera to the presenter's, for as long as the handle is alive.
 *
 * The follower keeps its OWN canvas size and reconstructs the camera rectangle from
 * the presenter's centre + zoom, so a follower on a different screen size sees the
 * same content correctly framed — and, critically, its `clientToWorld()` stays the
 * exact inverse of what it renders. Copying the presenter's rectangle wholesale
 * would break that (see viewport-channel.ts).
 */
export function followPresenter(
  host: PresentationHost,
  channel: ViewportChannel,
  options: FollowOptions = {}
): { stop: Unsubscribe } {
  // Re-entrancy guard: applying a remote viewport emits a local viewport change,
  // and if this host is ALSO presenting, that would immediately re-broadcast what
  // we just received — an echo loop between two clients that never settles.
  let applying = false;

  const unsubscribe = channel.onViewportBroadcast((incoming) => {
    if (applying) return;
    if (options.ignorePresenterId && incoming.presenterId === options.ignorePresenterId) {
      return;
    }

    applying = true;
    try {
      const current = host.viewport.getViewport();
      const width = current.width; // MY canvas, not the presenter's.
      const height = current.height;

      host.viewport.setZoom(incoming.zoom);
      host.viewport.setViewport({
        x: incoming.centerX - width / 2,
        y: incoming.centerY - height / 2,
        width,
        height,
      });
    } finally {
      applying = false;
    }

    // The viewport IS part of the renderer's frame signature, so this repaint is
    // not swallowed by the wave-8 frame gate — a follow that moves the camera
    // always redraws. (A presenter CURSOR overlay would be a different story: it
    // changes the picture without changing model or viewport, and would need
    // renderer.invalidateFrame(). No cursor is drawn here, deliberately.)
    host.render();
    options.onFollow?.(incoming);
  });

  return { stop: unsubscribe };
}

// ===========================================================================
// Read-only / share mode
// ===========================================================================

/**
 * Lock (or unlock) the document through the engine's own mode.
 *
 * Thin on purpose: it drives `DiagramMode`, which this wave finally wired to real
 * enforcement in the model and the CommandManager. There is no second read-only
 * flag here, because a second flag is how you end up with two read-only modes that
 * disagree.
 */
export function lockDocument(engine: DiagramEngine, locked = true): void {
  engine.setMode(locked ? DiagramMode.PRESENTATION : DiagramMode.DESIGNER);
}

/** Is this engine's document locked against edits? */
export function isDocumentLocked(engine: DiagramEngine): boolean {
  return engine.getDiagram()?.isReadonly() === true;
}

/**
 * Build a READ-ONLY document from a snapshot — the "share a link to a frozen copy"
 * case.
 *
 * The load runs as a SYSTEM write, so it works even against an engine that is
 * already in presentation mode. Otherwise the order of two host calls would decide
 * whether the share link renders a diagram or an empty canvas: lock-then-load would
 * have the lock (correctly!) refuse every node the loader tried to add.
 */
export function loadReadonlySnapshot(
  engine: DiagramEngine,
  snapshot: SerializedDiagram
): DiagramModel {
  // Deserialize into a FRESH model. It is detached and therefore unlocked, so
  // fromJSON populates it normally — no system-write escape needed for the load
  // itself, which keeps the escape hatch narrow.
  const model = DiagramModel.fromJSON(snapshot);

  // Attach with the engine in a writable mode, THEN lock. `setDiagram` syncs the
  // engine's mode onto the document, so attaching while already in PRESENTATION
  // would be fine too — but doing it in this order means the lock is applied once,
  // explicitly, and the snapshot is never racing a locked model.
  engine.setMode(DiagramMode.DESIGNER);
  engine.setDiagram(model);
  engine.setMode(DiagramMode.PRESENTATION);

  return model;
}
