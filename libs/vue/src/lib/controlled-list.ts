/**
 * Follows a controlled array prop (`nodes`, `edges`, `groups`) the way Vue users
 * expect: replacing the array AND changing it in place (`push`, `splice`,
 * `nodes[0].label = 'X'`) both reach the canvas.
 *
 * The watch source is a per-item VALUE key read through the reactive proxy, so it
 * tracks every field of every item and fires only when content really changed —
 * never on an unrelated parent render. What gets applied depends on what changed:
 *
 * - a NEW array is applied whole, as before (the array is the truth) — unless it is
 *   the very array the canvas just emitted through `update:*` and the parent wrote
 *   back (`v-model`): that one already matches the canvas, and applying it again
 *   would only redo the work;
 * - the SAME array changed in place: only the items whose content changed (or that
 *   are new) are applied. Every untouched item is handed to the reconciler as the
 *   canvas's own live model, which it passes through as-is — so a node the user
 *   dragged keeps its place when an unrelated node is pushed, even with one-way
 *   `:nodes` that never heard of the drag.
 *
 * Plain arrays (not reactive) cost nothing extra: there is nothing in them to track.
 */
import { isProxy, toRaw, watch } from 'vue';
import { specKey } from './spec-key';

export interface ControlledListOptions<T> {
  /** The prop's current value. */
  source: () => readonly T[] | undefined;
  /** The id the reconciler gives the item at `index` (its `id`, else a positional default). */
  idOf: (item: T, index: number) => string;
  /** The canvas's live model for an id, which the reconciler leaves untouched — or undefined. */
  live: (id: string) => unknown;
  /**
   * Apply a list to the canvas. Before the canvas exists this does nothing: the
   * canvas is created from the prop's value at mount, which is what gets recorded.
   */
  apply: (items: unknown[]) => void;
  /** True for the array the canvas itself last emitted. */
  isOwnEcho?: (array: readonly T[]) => boolean;
}

const identities = new WeakMap<object, number>();
let nextIdentity = 0;

/**
 * A value key for one item. Plain data is keyed by content, read THROUGH the proxy so
 * every field it reaches is tracked; a class instance (a live NodeModel, GroupModel…)
 * is keyed by identity — its insides are the canvas's business, not a value to diff.
 */
function itemKey(item: unknown): string {
  const raw = toRaw(item);
  if (raw !== null && typeof raw === 'object') {
    const proto = Object.getPrototypeOf(raw);
    if (proto !== Object.prototype && proto !== null && !Array.isArray(raw)) {
      let id = identities.get(raw);
      if (id === undefined) identities.set(raw, (id = ++nextIdentity));
      return `#${id}`;
    }
  }
  return specKey(item, null);
}

interface Snapshot<T> {
  array: readonly T[] | undefined;
  /** Per-item keys, or null for a plain (untracked) array. */
  keys: string[] | null;
}

export function watchControlledList<T>(options: ControlledListOptions<T>): () => void {
  const { source, idOf, live, apply, isOwnEcho } = options;
  /** id → the key of the content last applied (or matched) for it. */
  let applied = new Map<string, string>();

  const record = (snap: Snapshot<T>): void => {
    applied = new Map();
    if (!snap.array || !snap.keys) return;
    snap.array.forEach((item, i) => applied.set(idOf(item, i), snap.keys![i]));
  };

  return watch(
    (): Snapshot<T> => {
      const list = source();
      if (!list) return { array: undefined, keys: null };
      return { array: toRaw(list), keys: isProxy(list) ? list.map(itemKey) : null };
    },
    (next, prev) => {
      const array = next.array;
      // An unset prop leaves the canvas as it is.
      if (!array) return record(next);
      const sameArray = prev !== undefined && array === prev.array;
      if (!sameArray) {
        if (!isOwnEcho?.(array)) apply([...array]);
        return record(next);
      }
      const keys = next.keys;
      if (!keys) {
        apply([...array]);
        return record(next);
      }
      const prevKeys = prev.keys;
      if (prevKeys && prevKeys.length === keys.length && prevKeys.every((k, i) => k === keys[i])) return;
      const items = array.map((item, i) => {
        const id = idOf(item, i);
        return (applied.get(id) === keys[i] && live(id)) || item;
      });
      apply(items);
      record(next);
    },
    { immediate: true }
  );
}
