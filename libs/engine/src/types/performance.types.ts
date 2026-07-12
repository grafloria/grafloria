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
 */
export type LODFeature =
  | 'labels'
  | 'icons'
  | 'borders'
  | 'shadows'
  | 'ports'
  | 'decorations'
  | 'handles';

/** Every feature, in a stable order. Handy for "render everything" tiers. */
export const ALL_LOD_FEATURES: readonly LODFeature[] = [
  'labels',
  'icons',
  'borders',
  'shadows',
  'ports',
  'decorations',
  'handles',
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
 * Reproduces the historical hardcoded breakpoints and feature gates EXACTLY:
 * ```
 *   zoom >= 1.0        -> 'high'   (all features)
 *   0.2 < zoom < 1.0   -> 'medium' (labels, borders, ports, decorations, handles)
 *   zoom <= 0.2        -> 'low'    (nothing)
 * ```
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
        // The historical boundary was `zoom > 0.2` (exclusive). Encoded here as
        // an inclusive threshold a hair above 0.2 so getLODLevel(0.2) still
        // resolves to 'low', preserving the original partition exactly.
        minZoom: 0.2 + Number.EPSILON,
        features: new Set<LODFeature>([
          'labels',
          'borders',
          'ports',
          'decorations',
          'handles',
        ]),
      },
      {
        name: 'low',
        // Floor tier: every zoom is >= -Infinity, so this always matches last.
        minZoom: Number.NEGATIVE_INFINITY,
        features: new Set<LODFeature>(),
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
