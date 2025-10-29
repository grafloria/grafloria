/**
 * Animation Priority System
 *
 * Phase 1.1: Resolves conflicts when multiple animations are applied to the same element
 * Provides a priority-based system to determine which animation should take precedence
 *
 * @example
 * ```typescript
 * // Resolve conflict between multiple node animations
 * const winner = resolveNodeAnimationConflict([
 *   { type: 'status', status: 'error', priority: AnimationPriority.STATUS_ERROR },
 *   { type: 'border', borderType: 'pulse', priority: AnimationPriority.BORDER_ANIMATION }
 * ]);
 * // Returns status animation (higher priority)
 * ```
 */

/**
 * Animation priority levels (higher number = higher priority)
 */
export enum AnimationPriority {
  // Lowest priority - decorative animations
  BORDER_GRADIENT = 10,
  BORDER_SHIMMER = 15,
  BORDER_BREATHE = 20,

  // Medium priority - interactive animations
  HOVER_STATE = 30,
  SELECTED_STATE = 35,
  BORDER_PULSE = 40,

  // High priority - edge flow animations
  EDGE_MARCHING_ANTS = 50,
  EDGE_FLOW = 55,
  EDGE_PULSE = 60,
  EDGE_DASH_FLOW = 65,

  // Very high priority - status animations
  STATUS_PENDING = 70,
  STATUS_RUNNING = 75,
  STATUS_WARNING = 80,
  STATUS_COMPLETED = 85,
  STATUS_ERROR = 90,

  // Highest priority - user interactions
  USER_INTERACTION = 95,
  CUSTOM_ANIMATION = 100,
}

/**
 * Animation types for priority resolution
 */
export type AnimationType =
  | 'border'
  | 'status'
  | 'edge'
  | 'hover'
  | 'selected'
  | 'custom';

/**
 * Animation descriptor for conflict resolution
 */
export interface AnimationDescriptor {
  type: AnimationType;
  priority?: number;

  // Border animation specific
  borderType?: 'gradient' | 'pulse' | 'breathe' | 'shimmer';

  // Status animation specific
  status?: 'idle' | 'pending' | 'running' | 'completed' | 'error' | 'warning';

  // Edge animation specific
  edgeType?: 'marching-ants' | 'flow' | 'pulse' | 'dash-flow';

  // Custom animation specific
  customName?: string;

  // Metadata
  metadata?: Record<string, any>;
}

/**
 * Get default priority for an animation descriptor
 */
export function getDefaultPriority(descriptor: AnimationDescriptor): number {
  // If explicit priority is set, use it
  if (descriptor.priority !== undefined) {
    return descriptor.priority;
  }

  // Status animations
  if (descriptor.type === 'status' && descriptor.status) {
    switch (descriptor.status) {
      case 'error': return AnimationPriority.STATUS_ERROR;
      case 'completed': return AnimationPriority.STATUS_COMPLETED;
      case 'warning': return AnimationPriority.STATUS_WARNING;
      case 'running': return AnimationPriority.STATUS_RUNNING;
      case 'pending': return AnimationPriority.STATUS_PENDING;
      case 'idle': return 0;
      default: return 0;
    }
  }

  // Border animations
  if (descriptor.type === 'border' && descriptor.borderType) {
    switch (descriptor.borderType) {
      case 'pulse': return AnimationPriority.BORDER_PULSE;
      case 'breathe': return AnimationPriority.BORDER_BREATHE;
      case 'shimmer': return AnimationPriority.BORDER_SHIMMER;
      case 'gradient': return AnimationPriority.BORDER_GRADIENT;
      default: return 0;
    }
  }

  // Edge animations
  if (descriptor.type === 'edge' && descriptor.edgeType) {
    switch (descriptor.edgeType) {
      case 'dash-flow': return AnimationPriority.EDGE_DASH_FLOW;
      case 'pulse': return AnimationPriority.EDGE_PULSE;
      case 'flow': return AnimationPriority.EDGE_FLOW;
      case 'marching-ants': return AnimationPriority.EDGE_MARCHING_ANTS;
      default: return 0;
    }
  }

  // Interactive states
  if (descriptor.type === 'selected') {
    return AnimationPriority.SELECTED_STATE;
  }
  if (descriptor.type === 'hover') {
    return AnimationPriority.HOVER_STATE;
  }

  // Custom animations
  if (descriptor.type === 'custom') {
    return AnimationPriority.CUSTOM_ANIMATION;
  }

  return 0;
}

/**
 * Resolve conflict between multiple animations
 * Returns the animation with the highest priority
 */
export function resolveAnimationConflict(
  animations: AnimationDescriptor[]
): AnimationDescriptor | null {
  if (animations.length === 0) {
    return null;
  }

  if (animations.length === 1) {
    return animations[0];
  }

  // Sort by priority (descending)
  const sorted = [...animations].sort((a, b) => {
    const priorityA = getDefaultPriority(a);
    const priorityB = getDefaultPriority(b);
    return priorityB - priorityA;
  });

  return sorted[0];
}

/**
 * Resolve conflict between multiple node animations
 * Returns the animation that should be displayed
 */
export function resolveNodeAnimationConflict(
  animations: AnimationDescriptor[]
): AnimationDescriptor | null {
  // Filter only node-relevant animations
  const nodeAnimations = animations.filter(
    a => a.type === 'border' || a.type === 'status' || a.type === 'hover' || a.type === 'selected' || a.type === 'custom'
  );

  return resolveAnimationConflict(nodeAnimations);
}

/**
 * Resolve conflict between multiple edge animations
 * Returns the animation that should be displayed
 */
export function resolveEdgeAnimationConflict(
  animations: AnimationDescriptor[]
): AnimationDescriptor | null {
  // Filter only edge-relevant animations
  const edgeAnimations = animations.filter(
    a => a.type === 'edge' || a.type === 'custom'
  );

  return resolveAnimationConflict(edgeAnimations);
}

/**
 * Check if two animations can coexist
 * Some animations can run simultaneously (e.g., border + status)
 */
export function canCoexist(a: AnimationDescriptor, b: AnimationDescriptor): boolean {
  // Border and status animations can coexist
  if ((a.type === 'border' && b.type === 'status') ||
      (a.type === 'status' && b.type === 'border')) {
    return true;
  }

  // Hover/selected states can coexist with other animations
  if (a.type === 'hover' || a.type === 'selected' ||
      b.type === 'hover' || b.type === 'selected') {
    return true;
  }

  // Custom animations can coexist if explicitly allowed
  if (a.type === 'custom' && b.type === 'custom') {
    return a.metadata?.['allowCoexistence'] || b.metadata?.['allowCoexistence'] || false;
  }

  // Same type animations cannot coexist
  return false;
}

/**
 * Get all animations that can coexist together
 * Returns a set of compatible animations
 */
export function getCoexistingAnimations(
  animations: AnimationDescriptor[]
): AnimationDescriptor[] {
  if (animations.length === 0) {
    return [];
  }

  if (animations.length === 1) {
    return animations;
  }

  // Start with highest priority animation
  const sorted = [...animations].sort((a, b) => {
    return getDefaultPriority(b) - getDefaultPriority(a);
  });

  const result: AnimationDescriptor[] = [sorted[0]];

  // Add compatible animations
  for (let i = 1; i < sorted.length; i++) {
    const candidate = sorted[i];
    const compatible = result.every(existing => canCoexist(existing, candidate));

    if (compatible) {
      result.push(candidate);
    }
  }

  return result;
}

/**
 * Priority resolver configuration
 */
export interface PriorityResolverConfig {
  /** Allow multiple animations to coexist */
  allowCoexistence: boolean;

  /** Custom priority overrides */
  priorityOverrides?: Record<string, number>;

  /** Strict mode: throw error on conflicts instead of resolving */
  strictMode?: boolean;
}

/**
 * Animation priority resolver
 * Advanced resolver with configuration support
 */
export class AnimationPriorityResolver {
  private config: PriorityResolverConfig;

  constructor(config: Partial<PriorityResolverConfig> = {}) {
    this.config = {
      allowCoexistence: false,
      strictMode: false,
      ...config
    };
  }

  /**
   * Resolve animations based on configuration
   */
  resolve(animations: AnimationDescriptor[]): AnimationDescriptor[] {
    if (animations.length === 0) {
      return [];
    }

    if (animations.length === 1) {
      return animations;
    }

    // Apply custom priority overrides
    const withPriorities = animations.map(anim => {
      if (this.config.priorityOverrides && anim.customName) {
        const override = this.config.priorityOverrides[anim.customName];
        if (override !== undefined) {
          return { ...anim, priority: override };
        }
      }
      return anim;
    });

    // Strict mode: check for conflicts
    if (this.config.strictMode) {
      const hasConflict = withPriorities.some((a, i) =>
        withPriorities.slice(i + 1).some(b => !canCoexist(a, b))
      );

      if (hasConflict) {
        throw new Error('Animation conflict detected in strict mode');
      }
    }

    // Resolve based on mode
    if (this.config.allowCoexistence) {
      return getCoexistingAnimations(withPriorities);
    } else {
      const winner = resolveAnimationConflict(withPriorities);
      return winner ? [winner] : [];
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<PriorityResolverConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<PriorityResolverConfig> {
    return { ...this.config };
  }
}

/**
 * Create a priority resolver with default configuration
 */
export function createPriorityResolver(
  config?: Partial<PriorityResolverConfig>
): AnimationPriorityResolver {
  return new AnimationPriorityResolver(config);
}
