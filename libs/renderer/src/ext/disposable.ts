/**
 * Disposables — the one rule every extension seam in Wave 6 obeys.
 *
 * NON-NEGOTIABLE (learned from a real bug): every `register()` returns a
 * disposer, and disposing an extension must leave the registries byte-identical
 * to what they were before it loaded. The past failure was subscriptions that
 * were never unsubscribed, so swapping the engine left handlers live on the old
 * one. A registry that can only ADD is structurally incapable of honouring that,
 * which is why Wave 6 added `unregisterShape` / `unregisterLinkTemplate` / … as
 * additive removal paths on the existing registries.
 *
 * RESTORE-ON-DISPOSE. A disposer does not merely delete the key it wrote — it
 * restores whatever was there BEFORE. An extension that overrides the built-in
 * `rect` shape and is then disposed must give `rect` back, not leave a hole that
 * silently falls through to the default. `snapshotRestore()` is that helper.
 */

/** The universal teardown handle. Idempotent by contract. */
export type Disposer = () => void;

/** Something that can be torn down. */
export interface Disposable {
  dispose(): void;
}

/** Wrap a function so it can only ever run once. */
export function once(fn: Disposer): Disposer {
  let done = false;
  return () => {
    if (done) return;
    done = true;
    fn();
  };
}

/**
 * Build a disposer that puts a registry key back the way it was.
 *
 * @param previous the value read out of the registry BEFORE the write (or
 *                 `undefined` when the key did not exist)
 * @param restore  re-register the previous value
 * @param remove   delete the key (used when there was no previous value)
 */
export function snapshotRestore<T>(
  previous: T | undefined,
  restore: (value: T) => void,
  remove: () => void
): Disposer {
  return once(() => {
    if (previous === undefined) remove();
    else restore(previous);
  });
}

/**
 * A bag of disposers with a single `dispose()`. Extensions accumulate their
 * registrations here so the host can tear the whole extension down atomically.
 *
 * Disposal runs in REVERSE registration order (like a stack unwind) and is
 * failure-tolerant: one throwing disposer must not strand the rest, or a single
 * bad extension would leak every registry behind it.
 */
export class DisposableStore implements Disposable {
  private readonly disposers: Disposer[] = [];
  private disposed = false;

  /** Track a disposer. If the store is ALREADY disposed, run it immediately. */
  add(disposer: Disposer): Disposer {
    if (this.disposed) {
      disposer();
      return () => undefined;
    }
    const wrapped = once(disposer);
    this.disposers.push(wrapped);
    return wrapped;
  }

  /** How many live registrations this store holds (tests assert on this). */
  get size(): number {
    return this.disposers.length;
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const errors: unknown[] = [];
    // Reverse order: the last registration is the first undone.
    for (let i = this.disposers.length - 1; i >= 0; i--) {
      try {
        this.disposers[i]();
      } catch (error) {
        errors.push(error);
      }
    }
    this.disposers.length = 0;
    if (errors.length > 0) {
      // Surface the failures, but only AFTER every other disposer has run.
      // (Not `AggregateError` — this library's TS lib target predates it.)
      const error = new Error(
        `${errors.length} disposer(s) threw during dispose(): ` +
          errors.map((e) => (e instanceof Error ? e.message : String(e))).join('; ')
      );
      (error as Error & { errors: unknown[] }).errors = errors;
      throw error;
    }
  }
}
