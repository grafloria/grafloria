import { useMemo } from 'react';

/**
 * The `data` a portal-mounted card receives — a flow's custom node, a board's
 * widget: a new object each time its source or one of `changes` does, and the
 * same object otherwise. A `React.memo` card therefore follows every change,
 * one made in place included, and a card nothing changed keeps its props when
 * its parent renders again.
 */
export function useCardData(
  data: Record<string, unknown> | undefined,
  ...changes: unknown[]
): Record<string, unknown> {
  return useMemo(
    () => ({ ...(data ?? {}) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, ...changes]
  );
}
