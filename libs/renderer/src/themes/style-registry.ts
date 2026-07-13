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

/** The raw definition, or undefined when the name was never defined. */
export function getStyle(name: string): NamedStyle | undefined {
  return registry.get(name);
}

export function hasStyle(name: string): boolean {
  return registry.has(name);
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
  return Array.from(registry.keys());
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
  if (names.length === 1) return (registry.get(names[0]) ?? {}) as Partial<T>;

  const merged: Record<string, unknown> = {};
  for (const name of names) {
    Object.assign(merged, registry.get(name) ?? {});
  }
  return merged as Partial<T>;
}
