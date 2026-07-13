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
 * Each breakpoint is now set where the DETAIL STOPS BEING LEGIBLE, not where it
 * stops being cheap — the theme's 12px label is 6px at 0.5 zoom and 3px at 0.25,
 * and a port glyph is under a pixel. Zooms in [0.5, 1.0) render exactly as they
 * always have. [0.2, 0.5) is 'sketch': text and chrome go (they are unreadable),
 * the graph's SHAPE stays (it is not). Below 0.2, everything goes.
 *
 * Cost is deliberately NOT a factor in these numbers, because it cannot be: the
 * same zoom is cheap for 30 nodes and ruinous for 10,000, and a constant chosen
 * here would either tax the small diagram or fail to save the large one. That is
 * the quality governor's job — it measures the frame and steps the tier down on
 * the scenes and machines that need it. Perception picks the tier; measurement
 * decides whether you can afford it.
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
        // ---------------------------------------------------------------------
        // 'sketch' — [0.2, 0.5). THE TIER THAT SEPARATES PERCEPTION FROM COST.
        // ---------------------------------------------------------------------
        // At zoom 0.3 a 120x60 node is 36x18 CSS px. A 12px label on it renders at
        // 3.6px and is not text, it is a grey smear — so labels, ports, handles and
        // decorations genuinely have nothing to say here, and dropping them costs
        // the viewer nothing.
        //
        // But the LINKS are still perfectly legible at that size, and an orthogonal
        // route is plainly distinguishable from a straight diagonal. Collapsing
        // routes here — as this band briefly did, when 'low' started at 0.5 — makes
        // every diagram visibly snap its edge shapes as you cross a zoom threshold,
        // and it charges that to a 30-node flowchart that renders in 3ms and has no
        // performance problem whatsoever.
        //
        // That was a COST problem (10k scenes) being solved with a PERCEPTUAL lever
        // (what the zoom can display), and the two do not line up. Cost is what the
        // quality governor is for: it measures the frame and biases the tier down on
        // the machines and scenes that actually need it, so a big scene at 0.3 zoom
        // still lands in 'low' within three frames while a small one keeps its
        // routes. Perception decides the tier; measurement decides whether you can
        // afford it.
        name: 'sketch',
        minZoom: 0.2,
        features: new Set<LODFeature>([
          'borders',
          // The shape of the graph IS the content at this zoom. Keep it.
          'routing',
          'link-detail',
        ]),
      },
      {
        name: 'low',
        // Floor tier: every zoom is >= -Infinity, so this always matches last. Below
        // 0.2 a node is under 24px wide and an edge is a hairline — the routing
        // detour around a node body is now genuinely sub-pixel, and this is where
        // dropping it is free. It is also where the governor parks a scene too big
        // to draw at any zoom.
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
