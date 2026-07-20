/**
 * ============================================================================
 * The per-diagram REGISTRY PARTITION
 * ============================================================================
 *
 * The renderer's contribution registries — shapes, named styles, link/label
 * templates, markers, and the link pipeline — were module-scope `Map`s. One
 * process, one vocabulary. Two diagrams on one page therefore could not disagree
 * about what `badge` looks like, and worse, unloading one diagram's extension
 * RESTORED the registry to its pre-registration state and silently stripped the
 * shape out from under the diagram beside it.
 *
 * This module is the partition. It stores nothing about diagrams and knows
 * nothing about shapes: it is a bag of named tables plus one ambient pointer at
 * "whose tables are we reading right now".
 *
 * ---------------------------------------------------------------------------
 * WHY AMBIENT (dynamic) SCOPE RATHER THAN A THREADED PARAMETER
 * ---------------------------------------------------------------------------
 * The obvious fix — pass the scope down to every read — does not survive contact
 * with the read sites. Two of them are nowhere near an instance:
 *
 *   port-layout.ts  `shapeStrategy(input, args)` — the DEFAULT port layout, run
 *                   per port per frame, three call frames below the last place
 *                   instance identity existed (`SVGRenderer` → getPortPosition-
 *                   ForShape → runPortLayout → shapeStrategy). It takes geometry
 *                   and nothing else.
 *   style-cascade.ts `resolveNodeStyle(node, theme, options)` — a free function
 *                   whose only ambient argument is the theme.
 *
 * Threading a context through those means changing three layers of free-function
 * signatures that exist precisely because they are pure geometry. Ambient scope
 * costs one wrapper at the renderer's entry points and reaches all of them.
 *
 * THE SAFETY PROPERTY THAT MAKES THIS SOUND. A read that happens outside any
 * activation falls back to the process-global registry — which is exactly what
 * it did before this module existed. So the failure mode of a missed wrap point
 * is "behaves like it always did", never "reads another diagram's table". The
 * mechanism can only ever add isolation, never subtract correctness.
 *
 * IT IS SAFE AGAINST INTERLEAVING because activation spans a SYNCHRONOUS render
 * pass on a single-threaded runtime, and it restores the previous scope in a
 * `finally`. Nothing else can run in the middle of a frame. Deliberately, no
 * WRITE path is ambient: an extension may register from a click handler or after
 * an `await`, long outside any activation, so writes bind their scope EXPLICITLY
 * at capability-construction time (see `diagram-registry.ts`).
 */

/** Table names. Constants rather than string literals so a typo cannot silently
 * create a second, empty table that reads as "nothing registered". */
export const SHAPES = 'shapes';
export const STYLES = 'styles';
export const LINK_TEMPLATES = 'linkTemplates';
export const LABEL_TEMPLATES = 'labelTemplates';
export const MARKERS = 'markers';
export const ANCHORS = 'anchors';
export const CONNECTION_POINTS = 'connectionPoints';
export const CONNECTORS = 'connectors';

/**
 * One diagram's private overlay over the process-global registries.
 *
 * An entry here SHADOWS the global one of the same name for reads taken inside
 * this scope; a name absent here falls through. That layering is what lets a
 * diagram override a built-in (or an app-wide `registerShape()` at import time)
 * for itself alone, without mutating what anybody else sees.
 */
export class RegistryScope {
  private readonly tables = new Map<string, Map<string, unknown>>();

  /** The named table, created on demand. Use for WRITES. */
  table<V>(name: string): Map<string, V> {
    let table = this.tables.get(name);
    if (!table) {
      table = new Map<string, unknown>();
      this.tables.set(name, table);
    }
    return table as Map<string, V>;
  }

  /** The named table if it exists, WITHOUT creating it. Use for READS. */
  peek<V>(name: string): Map<string, V> | undefined {
    return this.tables.get(name) as Map<string, V> | undefined;
  }

  /** True when this diagram has contributed nothing — i.e. it is pure fall-through. */
  isEmpty(): boolean {
    for (const table of this.tables.values()) {
      if (table.size > 0) return false;
    }
    return true;
  }

  /** Drop every contribution (instance teardown). */
  clear(): void {
    this.tables.clear();
  }
}

/**
 * The scope reads resolve against right now. `null` means "the process-global
 * registries", which is both the default and the pre-existing behaviour.
 */
let active: RegistryScope | null = null;

/** The active scope, or null. Hosts should not need this; the registries do. */
export function activeRegistryScope(): RegistryScope | null {
  return active;
}

/**
 * The active scope's table for `name`, or undefined when there is no scope or it
 * has no such table. THE READ HELPER every registry uses — deliberately one
 * function so all of them shadow identically.
 */
export function scopedTable<V>(name: string): Map<string, V> | undefined {
  return active === null ? undefined : active.peek<V>(name);
}

/**
 * Run `fn` with `scope` active, restoring whatever was active before.
 *
 * An EMPTY scope is treated as no scope at all. That is not merely an
 * optimisation: it keeps the hot read path for a diagram that contributed
 * nothing — which is every existing embedder and all 104 demos — at exactly its
 * previous cost, one null check with no Map lookup behind it.
 */
export function runInRegistryScope<T>(scope: RegistryScope | null | undefined, fn: () => T): T {
  const next = scope && !scope.isEmpty() ? scope : null;
  // Re-entrancy (export → render) is common and must not pay for a try/finally.
  if (next === active) return fn();
  const previous = active;
  active = next;
  try {
    return fn();
  } finally {
    active = previous;
  }
}
