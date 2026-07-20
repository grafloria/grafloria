// Named style classes — the `classDef` / `linkStyle` equivalent.
//
// Styling & theming — Card "Named style classes".
//
//   defineStyle('critical', { stroke: '#ef4444', strokeWidth: 3 });
//   node.setStyle({ styleClass: 'critical' });      // reference it
//   link.updateStyle({ styleClass: 'critical' });   // …from links too
//
// A named style is just a bag of NodeStyle/LinkStyle properties held in a Map.
// It is resolved to VALUES by `style-cascade.ts` (see that file for the ordered
// cascade and for why we resolve inline rather than emitting CSS classes).
//
// `styleClass` accepts a space-separated LIST (`'critical dashed'`); later names
// win, exactly like a CSS class list read left-to-right.
//
// Renderers subscribe via `onStyleRegistryChange` so that redefining a style
// after nodes are already cached invalidates those cached VNodes.

import type { NodeStyle, LinkStyle } from '@grafloria/engine';
import { STYLES, scopedTable } from '../ext/registry-scope';

/** A named style may carry node properties, link properties, or the ones they share. */
export type NamedStyle = Partial<NodeStyle> | Partial<LinkStyle>;

const registry = new Map<string, NamedStyle>();
const listeners = new Set<() => void>();
let version = 0;

function bump(): void {
  version++;
  listeners.forEach(listener => listener());
}

/**
 * Define (or redefine) a named style. Definitions are copied, so later mutation
 * of the caller's object has no effect.
 */
export function defineStyle(name: string, style: NamedStyle): void {
  registry.set(name, { ...style });
  bump();
}

/** Define several named styles at once. */
export function defineStyles(styles: Record<string, NamedStyle>): void {
  for (const [name, style] of Object.entries(styles)) {
    registry.set(name, { ...style });
  }
  bump();
}

/**
 * The raw definition, or undefined when the name was never defined.
 *
 * DIAGRAM-FIRST, then process-global — see `ext/registry-scope.ts`. A diagram
 * that defined its own `critical` sees its own; one that did not still sees the
 * app-wide definition.
 */
export function getStyle(name: string): NamedStyle | undefined {
  return scopedTable<NamedStyle>(STYLES)?.get(name) ?? registry.get(name);
}

export function hasStyle(name: string): boolean {
  return scopedTable<NamedStyle>(STYLES)?.has(name) === true || registry.has(name);
}

export function removeStyle(name: string): boolean {
  const existed = registry.delete(name);
  if (existed) bump();
  return existed;
}

/** Drop every named style (tests, and hosts tearing a document down). */
export function clearStyles(): void {
  if (registry.size === 0) return;
  registry.clear();
  bump();
}

export function listStyles(): string[] {
  const scoped = scopedTable<NamedStyle>(STYLES);
  if (!scoped || scoped.size === 0) return Array.from(registry.keys());
  return [...new Set([...registry.keys(), ...scoped.keys()])];
}


/**
 * Internal: let a PER-DIAGRAM registry participate in the version/notify
 * protocol. A scoped registration must invalidate cached VNodes for exactly the
 * reason a global one must — the definition is baked into the cache. Notifying
 * every renderer (not just the contributing one) is deliberate: over-invalidation
 * costs a repaint, under-invalidation shows a stale picture.
 */
export function notifyStyleRegistryChanged(): void {
  bump();
}

/** Bumped on every mutation — renderers key cache invalidation off this. */
export function getStyleRegistryVersion(): number {
  return version;
}

/** Subscribe to registry mutations. Returns the unsubscribe function. */
export function onStyleRegistryChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Merge a `styleClass` list into ONE partial style. Names are applied
 * left-to-right (later names win); unknown names are ignored.
 */
export function resolveStyleClasses<T extends NamedStyle>(styleClass: string | undefined): Partial<T> {
  if (!styleClass) return {};
  const names = styleClass.trim().split(/\s+/).filter(Boolean);
  if (names.length === 0) return {};

  // THE RENDER-PATH READ. `getStyle` — not `registry.get` — because this is the
  // one lookup that decides what a node is actually painted with, and it must
  // resolve against the diagram being painted rather than the process.
  if (names.length === 1) return (getStyle(names[0]) ?? {}) as Partial<T>;

  const merged: Record<string, unknown> = {};
  for (const name of names) {
    Object.assign(merged, getStyle(name) ?? {});
  }
  return merged as Partial<T>;
}
