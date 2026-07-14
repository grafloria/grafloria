/**
 * The read-only lock — Wave 9, Card 7.
 *
 * ## Why this exists
 *
 * `DiagramMode.VIEW` / `DiagramMode.PRESENTATION` and `ModeManager.isReadOnlyMode()`
 * have existed in this engine since long before this wave. They were documented as
 * "All editing disabled" / "No structural changes allowed".
 *
 * **They gated nothing.** Not one command, not one model mutator, not the DOM event
 * binder. `isReadOnlyMode()` was advisory — a boolean nobody asked. A "read-only"
 * diagram would happily accept a node drag, a Delete key, a paste, or a
 * `node.setPosition()` from any caller. That is not a feature, it is a
 * security-shaped lie: it *looks* locked and is not.
 *
 * This module is the enforcement primitive those modes now hang off.
 *
 * ## The distinction that makes it safe: DOCUMENT writes vs SYSTEM writes
 *
 * A naive lock ("refuse every `setSize`") breaks the renderer, because the engine
 * writes model fields at render time for reasons that have nothing to do with a
 * user editing the document:
 *
 *   - `svg/auto-size.ts`      measures text and writes `node.setSize()`
 *   - `ext/node-component.ts` measures a custom component and writes `node.setSize()`
 *   - `ext/portal.ts`         positions a portal via `setPosition()`
 *   - `instance/model-input.ts` writes geometry while LOADING the document
 *
 * Block those and a read-only diagram renders at the wrong size — the lock would
 * have "worked" in a unit test and destroyed the actual product. So writes come in
 * two kinds:
 *
 *   - **Document writes** — user/API intent that changes what the document MEANS.
 *     Refused while locked. (drag, delete, paste, connect, waypoint edit, command.)
 *   - **System writes** — derived/measured values the engine recomputes to render
 *     what the document ALREADY means. Always allowed, via {@link ReadonlyLock.runSystemWrite}.
 *
 * A system write must never be reachable from user input. The three call sites above
 * are the entire allowlist, and each is wrapped explicitly at the call site so the
 * bypass is greppable rather than ambient.
 *
 * ## Refusal semantics
 *
 * Guarded mutators **no-op** (and return a neutral value) rather than throw. A throw
 * from deep inside a model setter would take down a render pass or a host's event
 * handler; a locked document should be inert, not explosive. Callers that need to
 * know can ask {@link ReadonlyLock.isReadonly} up front — which is exactly what the
 * UI layers do to avoid arming a gesture they cannot finish.
 */

/** Something that owns a read-only lock (a `DiagramModel`). */
export interface ReadonlyLockOwner {
  /** True when a *document* mutation must be refused right now. */
  blocksDocumentWrite(): boolean;
}

/**
 * The lock itself. Held by `DiagramModel`; consulted by `NodeModel` / `LinkModel`
 * through their `diagram` back-reference, and by `CommandManager` through its context.
 */
export class ReadonlyLock {
  private locked = false;

  /**
   * Re-entrant depth of in-flight system writes. A counter, not a boolean, because
   * auto-size can run inside a render that is itself inside a system write.
   */
  private systemWriteDepth = 0;

  isReadonly(): boolean {
    return this.locked;
  }

  setReadonly(value: boolean): void {
    this.locked = value;
  }

  /** True when a document mutation must be refused: locked AND not a system write. */
  blocksDocumentWrite(): boolean {
    return this.locked && this.systemWriteDepth === 0;
  }

  /**
   * Run `fn` as a SYSTEM write — a derived/measured value the engine needs in order
   * to render the document as it already is. Permitted even while locked.
   *
   * Exception-safe: the depth is restored in `finally`, so a throwing measurement
   * cannot leave the lock permanently open (which would silently un-lock the
   * document — the worst possible failure mode for this class).
   */
  runSystemWrite<T>(fn: () => T): T {
    this.systemWriteDepth++;
    try {
      return fn();
    } finally {
      this.systemWriteDepth--;
    }
  }
}

/**
 * True when `owner` is locked against document writes.
 *
 * Tolerates `undefined` because a model can legitimately be detached: a `NodeModel`
 * built with `new NodeModel()` and not yet added to a diagram has no back-reference,
 * and must stay freely mutable — you have to be able to BUILD a node before you can
 * add it to a locked document (and `addNode` itself is what refuses).
 */
export function writeBlocked(owner?: Partial<ReadonlyLockOwner>): boolean {
  return owner?.blocksDocumentWrite?.() === true;
}
