// performance.types.ts - Types for performance optimizations (Phase 5.3)

/**
 * Level of Detail for rendering
 * - high: Full detail (zoomed in > 1.0x)
 * - medium: Medium detail (0.5x - 1.0x)
 * - low: Minimal detail (< 0.5x)
 */
export type LODLevel = 'high' | 'medium' | 'low';

/**
 * Entity with Level of Detail information
 */
export interface EntityWithLOD<T> {
  entity: T;
  lod: LODLevel;
}
