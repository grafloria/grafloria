/**
 * THE BOARD IS FREE AGAIN — how a board (grid or split) and the dashboard
 * handle tell `onIdle`, in ONE place: a microtask after whatever may have
 * ended, so a release that sends its commit later in the same handler is
 * seen as still saving, never as idle; and only when `idle()` holds then.
 * Calls in the same tick share one microtask.
 */
export function idleTeller(idle: () => boolean, tell: (() => void) | undefined): () => void {
  let queued = false;
  return (): void => {
    if (queued || !tell) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      if (idle()) tell();
    });
  };
}
