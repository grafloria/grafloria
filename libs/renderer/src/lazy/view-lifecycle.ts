// Wave 8 — Card 3: freeze / unfreeze / autoFreeze, and the admission set a
// progressive mount admits into.
//
// FREEZE is the explicit form of "this entity has a model, and a place in the
// spatial index, and NO view". A frozen entity is not routed, not styled, not
// turned into a VNode, and holds no cache entry. It still exists: it still has a
// position, it still answers a spatial query, it still serialises. It simply is not
// drawn, and costs nothing per frame.
//
// AUTOFREEZE applies that automatically to everything outside the viewport. On its
// face that is what culling already does — but culling is a per-frame geometric
// decision that leaves the entity's CACHED VNODE behind. Pan a 10k-node graph from
// end to end with autoFreeze off and the renderer accumulates cached views for
// every entity it ever passed over (bounded only by `maxCacheSize`, which is a
// backstop, not a policy). With autoFreeze on, a view is dropped the moment its
// entity leaves the viewport, and the retained set stays O(on screen) instead of
// O(everything ever seen). That is the difference between a cache and a leak.

import type { EntityKind, MountGate } from './types';

export interface ViewLifecycleOptions {
  /**
   * Drop the view of any entity that leaves the viewport. Default false — the
   * historical behaviour (views linger in the LRU until evicted by pressure).
   */
  autoFreeze?: boolean;
}

/** `node:n12` / `link:l7` — one keyspace, so a node and a link can share an id. */
const keyOf = (kind: EntityKind, id: string): string => `${kind}:${id}`;

export class ViewLifecycle implements MountGate {
  /** Explicitly frozen by the host. Survives everything until unfrozen. */
  private readonly frozen = new Set<string>();

  /** Frozen by autoFreeze because they left the viewport. Thawed on return. */
  private readonly autoFrozen = new Set<string>();

  /** What the last frame could see — the set autoFreeze diffs against. */
  private retained = new Set<string>();

  private autoFreeze: boolean;

  // --- progressive mount ----------------------------------------------------

  /** While true, NOTHING is admitted except what `admit()` has let through. */
  private deferring = false;

  /** Admitted so far by the mount in progress (cumulative across slices). */
  private readonly admitted = new Set<string>();

  /** Kinds admitted wholesale — nodes are cheap, so slice 0 takes all of them. */
  private readonly openKinds = new Set<EntityKind>();

  /**
   * Called when an entity's view is dropped, so the renderer can evict its cache
   * entry. Set by `SVGRenderer.setViewLifecycle`.
   */
  private evictHook: ((kind: EntityKind, id: string) => void) | null = null;

  /**
   * Called whenever THIS OBJECT changes what the renderer would draw — a freeze, an
   * unfreeze, a progressive-mount admission, an autoFreeze toggle.
   *
   * This hook exists because of a bug the wave-8 merge produced and neither branch
   * could have caught alone. The frame gate (Card 0) skips a frame whose MODEL and
   * VIEWPORT are unchanged — and freezing a node changes neither. Nor does admitting
   * the next mount slice. So the gate correctly concluded "you have already drawn
   * this frame" and handed back the previous picture, and freeze/lazy-mount silently
   * did nothing: five tests that passed on both branches in isolation failed the
   * moment they were composed.
   *
   * The lesson generalises, and it is the same one three times over in this wave:
   * ask what can change the PICTURE without changing the MODEL. The answer is always
   * longer than it looks — the route solver's refined answer, the quality governor's
   * tier bias, and now this.
   */
  private changeHook: (() => void) | null = null;

  constructor(options: ViewLifecycleOptions = {}) {
    this.autoFreeze = options.autoFreeze ?? false;
  }

  // =========================================================================
  // Freeze
  // =========================================================================

  /**
   * Give up this entity's view. It keeps its model and its spatial-index entry;
   * it stops being drawn and stops costing anything per frame.
   */
  freeze(kind: EntityKind, id: string): void {
    const key = keyOf(kind, id);
    if (this.frozen.has(key)) return;
    this.frozen.add(key);
    this.evictHook?.(kind, id);
    this.changeHook?.();
  }

  /** Give it a view again. It is rebuilt on the next frame that can see it. */
  unfreeze(kind: EntityKind, id: string): void {
    if (!this.frozen.delete(keyOf(kind, id))) return;
    this.changeHook?.();
  }

  isFrozen(kind: EntityKind, id: string): boolean {
    const key = keyOf(kind, id);
    return this.frozen.has(key) || this.autoFrozen.has(key);
  }

  /** Explicitly frozen only — NOT the ones autoFreeze is holding off-screen. */
  isExplicitlyFrozen(kind: EntityKind, id: string): boolean {
    return this.frozen.has(keyOf(kind, id));
  }

  unfreezeAll(): void {
    if (this.frozen.size === 0) return;
    this.frozen.clear();
    this.changeHook?.();
  }

  setAutoFreeze(on: boolean): void {
    if (this.autoFreeze === on) return;
    this.autoFreeze = on;
    if (!on) {
      // Everything autoFreeze was holding gets its view back on the next frame.
      this.autoFrozen.clear();
    }
    this.changeHook?.();
  }

  isAutoFreeze(): boolean {
    return this.autoFreeze;
  }

  /**
   * The views currently retained — i.e. what the renderer is paying for.
   *
   * This is the number autoFreeze exists to bound, so it is measurable rather
   * than asserted.
   */
  retainedCount(): number {
    return this.retained.size;
  }

  frozenCount(): number {
    return this.frozen.size + this.autoFrozen.size;
  }

  /**
   * Called by the renderer each frame with what culling admitted, BEFORE the gate
   * is applied. Anything that was on screen and no longer is gets its view dropped.
   *
   * Not called at all when autoFreeze is off — the whole feature is one Set diff
   * per frame, and a host that has not asked for it pays nothing.
   */
  retainVisible(visible: ReadonlyArray<readonly [EntityKind, string]>): void {
    if (!this.autoFreeze) return;

    const next = new Set<string>();
    for (const [kind, id] of visible) {
      const key = keyOf(kind, id);
      next.add(key);
      // Back on screen: thaw it, so the next frame builds its view again.
      this.autoFrozen.delete(key);
    }

    for (const key of this.retained) {
      if (next.has(key)) continue;
      // Left the viewport. Drop the view; keep the model.
      this.autoFrozen.add(key);
      const sep = key.indexOf(':');
      this.evictHook?.(key.slice(0, sep) as EntityKind, key.slice(sep + 1));
    }

    this.retained = next;
  }

  // =========================================================================
  // Progressive mount (the admission set)
  // =========================================================================

  /** Defer EVERYTHING. Nothing has a view until `admit()` says so. */
  beginDeferred(): void {
    this.deferring = true;
    this.admitted.clear();
    this.openKinds.clear();
    this.changeHook?.();
  }

  /** Let this entity's view be built from now on. */
  admit(kind: EntityKind, id: string): void {
    this.admitted.add(keyOf(kind, id));
    this.changeHook?.();
  }

  /**
   * Admit a whole KIND without naming its members. Slice 0 uses this for nodes: a
   * node's view is cheap (no routing), and enumerating 10k ids to admit them one
   * at a time would cost more than building the ~56 views culling actually keeps.
   */
  admitAll(kind: EntityKind): void {
    this.openKinds.add(kind);
    this.changeHook?.();
  }

  /** The mount is over (finished, cancelled, or pre-empted). Gate opens fully. */
  endDeferred(): void {
    this.deferring = false;
    this.admitted.clear();
    this.openKinds.clear();
    this.changeHook?.();
  }

  // =========================================================================
  // MountGate
  // =========================================================================

  admits(kind: EntityKind, id: string): boolean {
    const key = keyOf(kind, id);
    // An explicit freeze outranks a mount admission: a host that froze something
    // did so on purpose, and a mount is no reason to overrule it.
    if (this.frozen.has(key) || this.autoFrozen.has(key)) return false;
    if (this.deferring) return this.openKinds.has(kind) || this.admitted.has(key);
    return true;
  }

  isDeferring(): boolean {
    return this.deferring;
  }

  // =========================================================================

  /** @internal — wired by SVGRenderer.setViewLifecycle. */
  setEvictHook(hook: ((kind: EntityKind, id: string) => void) | null): void {
    this.evictHook = hook;
  }

  /**
   * Tell the renderer that what it would draw has changed, even though the model
   * has not. Set by `SVGRenderer.setViewLifecycle`; see `changeHook`.
   */
  setChangeHook(hook: (() => void) | null): void {
    this.changeHook = hook;
  }
}
