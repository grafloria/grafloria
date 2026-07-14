// Wave 9 — Card 6: the overlay controller, and KEEPING THE FRAME GATE HONEST.
//
// ===========================================================================
// THE PERF TRAP, WRITTEN OUT IN FULL
// ===========================================================================
// Wave 8 gave the renderer a FRAME GATE: `render()` skips a frame entirely — handing the
// patcher back the SAME VNode object — when the model's mutation epoch and the viewport
// signature are both unchanged. That is what makes an idle 10k-node frame cost 0.0ms, and
// it is the single most valuable thing in the renderer.
//
// It is also a loaded gun pointed at every feature that draws something the model does not
// know about. Three branches have already been shot by it. The rule it enforces is simple
// and merciless:
//
//     IF IT CAN CHANGE THE PICTURE, IT MUST MOVE ONE OF THE GATE'S INPUTS.
//
// Comment state splits cleanly into two halves, and they are handled in two different ways
// ON PURPOSE:
//
//   1. COMMENT DATA (a new thread, a reply, a resolve — local or arriving from a peer).
//      This lives IN THE MODEL, in the `comments` register namespace, so it moves the
//      mutation epoch through the model's own change funnel. Nothing here has to do
//      anything, and — importantly — nothing here CAN FORGET to. (That is why
//      `DiagramModel.comments` is an accessor pair rather than a plain field: applyOp's
//      remote write is a raw assignment, and a raw assignment to a plain field would have
//      been invisible to the epoch. A colleague's comment would have landed in the model
//      and never been drawn. There is a mutation test that bypasses the accessor and
//      watches exactly that happen.)
//
//   2. VIEW STATE (which thread is open, which pin has keyboard focus, whether resolved
//      threads are shown, and WHAT THIS VIEWER HAS READ). None of it is in the model —
//      correctly so: "Ada has read this thread" is a fact about Ada, not about the
//      document, and syncing it would clear everyone else's unread badge. So none of it
//      moves the epoch, and the gate would happily skip the frame in which the unread dot
//      is supposed to disappear.
//
//      Every one of those transitions goes through `invalidate()` below, which calls
//      `renderer.invalidateFrame()` — the escape hatch that exists for precisely this. It
//      is cheap (one rebuilt frame) and idempotent, so the cost of calling it when you did
//      not need to is nothing, and the cost of NOT calling it when you did is a stale
//      picture. There is exactly one funnel, so there is exactly one thing to get right.
//
// And when there is no comment source at all, the renderer builds no layer and asks no
// questions — an idle 10k-node frame is untouched, at 0.0ms.

import type { CommentStore, CommentThreadView } from '@grafloria/engine';
import type { CommentPinsOptions } from './comment-pins';

/**
 * What the renderer needs from a comment source. Deliberately tiny — the renderer must not
 * know what a thread IS, only where the pins go and what they are called.
 */
export interface CommentSource {
  /** The threads to draw. Called once per BUILT frame (never on a skipped one). */
  getThreads(): readonly CommentThreadView[];
  /**
   * Local view state — selection and the resolved filter.
   *
   * NOT keyboard focus. That is the RENDERER's `a11yFocus`, which already owns the roving
   * tabindex for nodes and edges, and a comment pin is just a third kind of thing in the
   * same one-tab-stop widget. Two authorities for "what is focused" is how you get two
   * elements with `tabindex=0`, which is the exact bug the roving tabindex exists to
   * prevent — so there is one, and it is the one that already existed.
   */
  getPinOptions(): Pick<CommentPinsOptions, 'selectedThreadId' | 'showResolved' | 'radius'>;
}

/** The slice of the renderer this controller drives. Structural, so it is trivial to fake. */
export interface CommentRendererHost {
  setCommentSource(source: CommentSource | null): void;
  invalidateFrame(): void;
}

export interface CommentOverlayOptions {
  showResolved?: boolean;
  /** Notified when the open thread changes (a host pans to it, opens the panel, …). */
  onSelectionChange?: (threadId: string | null) => void;
}

export class CommentOverlayController implements CommentSource {
  private selectedThreadId: string | null = null;
  private showResolved: boolean;
  private unsubscribe: (() => void) | null = null;
  private invalidations = 0;

  constructor(
    private readonly store: CommentStore,
    private readonly renderer: CommentRendererHost,
    private readonly options: CommentOverlayOptions = {}
  ) {
    this.showResolved = options.showResolved ?? false;

    // The store fires for comment DATA (which already moved the epoch — belt) and for
    // READ STATE (which did not — braces). Routing both through one invalidate() means the
    // read-state case cannot be the one somebody forgets.
    this.unsubscribe = this.store.onChange(() => this.invalidate());

    this.renderer.setCommentSource(this);
    // Installing a source CHANGES THE PICTURE and moves nothing the gate watches. If the
    // renderer has already drawn a frame, that frame has no pins in it and the gate would
    // serve it back forever.
    this.invalidate();
  }

  // --- CommentSource --------------------------------------------------------

  getThreads(): readonly CommentThreadView[] {
    return this.store.threads({ includeResolved: this.showResolved });
  }

  getPinOptions(): Pick<CommentPinsOptions, 'selectedThreadId' | 'showResolved' | 'radius'> {
    return {
      selectedThreadId: this.selectedThreadId,
      showResolved: this.showResolved,
    };
  }

  // --- view state: every setter goes through invalidate() --------------------

  /** Open a thread. Opening it is READING it, which is what "unread" means. */
  select(threadId: string | null): void {
    if (this.selectedThreadId === threadId) return;
    this.selectedThreadId = threadId;
    if (threadId) this.store.markRead(threadId); // fires onChange → invalidate
    else this.invalidate();
    this.options.onSelectionChange?.(threadId);
  }

  getSelected(): string | null {
    return this.selectedThreadId;
  }

  setShowResolved(show: boolean): void {
    if (this.showResolved === show) return;
    this.showResolved = show;
    this.invalidate();
  }

  /** Mark a thread read WITHOUT opening it (the "mark all read" affordance). */
  markRead(threadId: string): void {
    this.store.markRead(threadId); // fires onChange → invalidate
  }

  /** How many times the picture has been declared stale. A test asserts this moves. */
  getInvalidationCount(): number {
    return this.invalidations;
  }

  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.renderer.setCommentSource(null);
    // Removing the pins is as much a change to the picture as adding them was.
    this.renderer.invalidateFrame();
  }

  // -------------------------------------------------------------------------

  /**
   * THE ONE FUNNEL. Everything that can change what a pin looks like — and that the model
   * cannot see — passes through here. See the header.
   */
  private invalidate(): void {
    this.invalidations++;
    this.renderer.invalidateFrame();
  }
}
