// performance.types.ts - Types for performance optimizations (Phase 5.3)

/**
 * Level of Detail tier name.
 *
 * Widened (wave2/rendering) from the fixed `'high' | 'medium' | 'low'` union to
 * `string` so apps can register their own tiers through {@link LODConfig}. The
 * three built-in tiers keep those exact names, so every historical
 * `lod === 'high'` / `lod !== 'low'` style check keeps working unchanged.
 */
export type LODLevel = string;

/**
 * A visual feature that a {@link LODTier} may gate on. Renderers ask
 * `diagram.shouldRender(feature, lod)` instead of hardcoding zoom breakpoints.
 *
 * wave8/culling — THE ECONOMIC FEATURES. Everything above the divider gates a
 * DECORATION: dropping it removes a few attributes or a child VNode at the very
 * end of the pipeline, and the work that produced them ran anyway. That made LOD
 * cosmetic, not economic: a 10k-node zoom-out frame took 63 SECONDS because the
 * renderer was still routing every edge around every obstacle to place lines
 * whose detours were sub-pixel on screen.
 *
 * The three below gate WORK, not paint. They are what makes a far-zoom frame
 * actually cheap, and they are the reason `LODFeature` is worth having at all.
 */
export type LODFeature =
  // --- decorations: gate what is PAINTED ---
  | 'labels'
  | 'icons'
  | 'borders'
  | 'shadows'
  | 'ports'
  | 'decorations'
  | 'handles'
  // --- economic: gate what is COMPUTED (wave8/culling) ---
  /**
   * Obstacle-aware edge routing and the diagram-wide edge passes that depend on
   * it (parallel-bundle lanes, corridor nudging). OFF ⇒ every auto-routed edge
   * is a direct port-to-port polyline, computed in O(1) instead of O(nodes).
   * This is the single most expensive thing the renderer does.
   */
  | 'routing'
  /**
   * Per-edge path FIDELITY: curve emission, jump-overs, label placement, the
   * full bend list. OFF ⇒ the drawn polyline is simplified (Douglas–Peucker at
   * ~1 screen pixel) and the diagram-wide edge optimizer does not run.
   */
  | 'link-detail'
  /**
   * Gradient / pattern paint servers. OFF ⇒ a gradient or pattern fill collapses
   * to a flat representative colour, which also lets the entity back into the
   * VNode cache (paint-server entities bypass it — see `nodeUsesPaintServer`).
   */
  | 'gradients';

/** Every feature, in a stable order. Handy for "render everything" tiers. */
export const ALL_LOD_FEATURES: readonly LODFeature[] = [
  'labels',
  'icons',
  'borders',
  'shadows',
  'ports',
  'decorations',
  'handles',
  'routing',
  'link-detail',
  'gradients',
];

/**
 * One rung of a Level-of-Detail policy.
 */
export interface LODTier {
  /** Tier name — returned by `getLODLevel()` and used as the render LOD key. */
  name: string;
  /**
   * Inclusive lower zoom bound. The active tier for a given zoom is the
   * highest-`minZoom` tier whose `minZoom <= zoom`.
   */
  minZoom: number;
  /** The set of features that render at this tier. */
  features: Set<LODFeature>;
}

/**
 * A declarative, per-diagram Level-of-Detail policy. Replaces the hardcoded
 * zoom breakpoints and per-tier feature gates that used to live inside
 * DiagramModel.
 */
export interface LODConfig {
  tiers: LODTier[];
}

/**
 * Build the default 3-tier LOD policy.
 *
 * ```
 *   zoom >= 1.0        -> 'high'   (everything)
 *   0.5 <= zoom < 1.0  -> 'medium' (labels, borders, ports, decorations, handles,
 *                                   + routing, link-detail, gradients)
 *   zoom <  0.5        -> 'low'    (nothing — plain rects and direct lines)
 * ```
 *
 * wave8/culling — THE MEDIUM/LOW BREAKPOINT MOVED, 0.2 → 0.5, and that is the
 * behaviour change in this wave.
 *
 * The old boundary made 'medium' span 0.2–1.0 with a near-full feature set, so a
 * diagram at 0.25 zoom — the zoom fit-to-content lands on for anything large —
 * still measured every label, drew every port, and routed every edge around every
 * obstacle. It was the far view that was expensive: 63 SECONDS for one 10k-node
 * frame, against 124ms for the near view. LOD had breakpoints but no economics.
 *
 * 0.5 is where the detail stops being legible rather than where it stops being
 * cheap: the theme's 12px label is 6px at 0.5 and 3px at 0.25, and a port glyph
 * is under a pixel. Zooms in [0.5, 1.0) render EXACTLY as they did — 'medium'
 * gained the three economic features precisely so that band is untouched. Only
 * [0.2, 0.5), which used to claim full detail it could not display, is now 'low'.
 *
 * Fresh `Set`s are created per call so no two diagrams share mutable state.
 */
export function createDefaultLODConfig(): LODConfig {
  return {
    tiers: [
      {
        name: 'high',
        minZoom: 1.0,
        features: new Set<LODFeature>(ALL_LOD_FEATURES),
      },
      {
        name: 'medium',
        minZoom: 0.5,
        features: new Set<LODFeature>([
          'labels',
          'borders',
          'ports',
          'decorations',
          'handles',
          // The economic features are ON here: everything from 0.5 up routes,
          // curves and gradients exactly as it always has.
          'routing',
          'link-detail',
          'gradients',
        ]),
      },
      {
        name: 'low',
        // Floor tier: every zoom is >= -Infinity, so this always matches last.
        features: new Set<LODFeature>(),
        minZoom: Number.NEGATIVE_INFINITY,
      },
    ],
  };
}

/**
 * Entity with Level of Detail information
 */
export interface EntityWithLOD<T> {
  entity: T;
  lod: LODLevel;
}
