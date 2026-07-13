// Wave 8 — Card 3: deferred / lazy view instantiation.
//
// The renderer already CULLS: it asks the spatial index which entities intersect
// the viewport and builds VNodes only for those. What it did not have was a say in
// the matter — culling is recomputed from geometry every frame, and every entity it
// admits pays the full price of a view (route + style + VNode) on the very first
// frame, all of it before anything reaches the screen.
//
// A `MountGate` is that say. It sits between "the spatial index says this is on
// screen" and "build its view", and it is what lets a huge graph reach first paint
// without routing every link first.

/** The two things that have views. */
export type EntityKind = 'node' | 'link';

/**
 * The gate the renderer consults before instantiating an entity's VIEW.
 *
 * A gate can only ever SUBTRACT from what culling already admitted — it never adds
 * an off-screen entity back in. That asymmetry is deliberate: a gate bug can make
 * something arrive late, never wrong.
 */
export interface MountGate {
  /** May the renderer build (or refresh) this entity's view on this frame? */
  admits(kind: EntityKind, id: string): boolean;

  /**
   * True while a progressive mount is running — the renderer's cue that the scene
   * is being brought up in slices and is not yet whole.
   */
  isDeferring?(): boolean;
}

/** What one `mount()` actually did — the numbers the claim lives on. */
export interface MountStats {
  /** ms from `mount()` to the first frame that reached the screen. */
  firstPaintMs: number;
  /** ms from `mount()` to the last entity mounted. */
  completeMs: number;
  /** rAF slices used (1 = it all fitted in the first frame). */
  slices: number;
  /** Entities whose views were built. */
  nodesMounted: number;
  linksMounted: number;
  /** The worst single slice — the jank a user would actually feel. */
  worstSliceMs: number;
  /** True if the mount was cancelled or pre-empted by a model change. */
  aborted: boolean;
}
