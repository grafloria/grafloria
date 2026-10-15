/**
 * THE TEARDOWN ORDER RULE, and its one home.
 *
 * A host can have two listeners for its leaving: the kit's own hook and the
 * caller's. `render()` has a kit spec's `removeCustomNode` (dashboard()
 * releases a widget's host there) and the caller's `removeCustomNode` option;
 * a framework dashboard wrapper has its own `unmountWidget` (it destroys the
 * card's component) and the caller's `options.unmountWidget`.
 *
 * Painting chooses one painter per host (in `render()` the caller's outranks
 * the kit's). Teardown never chooses. The kit's hook runs first, then the
 * caller's, and both run, so the caller hears of a host after the kit has let
 * it go. A kit hook that throws does not cost the caller its turn; the error is
 * rethrown once the caller's hook has run.
 *
 * Either hook may be absent: the other is returned as it is, and with neither
 * there is nothing to call.
 */
export function teardownInOrder<A extends unknown[]>(
  kit: (...args: A) => void,
  caller: ((...args: A) => void) | undefined
): (...args: A) => void;
export function teardownInOrder<A extends unknown[]>(
  kit: ((...args: A) => void) | undefined,
  caller: ((...args: A) => void) | undefined
): ((...args: A) => void) | undefined;
export function teardownInOrder<A extends unknown[]>(
  kit: ((...args: A) => void) | undefined,
  caller: ((...args: A) => void) | undefined
): ((...args: A) => void) | undefined {
  if (!kit || !caller) return kit ?? caller;
  return (...args: A) => {
    try {
      kit(...args);
    } finally {
      caller(...args);
    }
  };
}
