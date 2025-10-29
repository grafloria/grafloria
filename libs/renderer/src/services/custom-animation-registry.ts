/**
 * Custom Animation Registry
 *
 * Phase 1.1: Allows users to register custom keyframe animations
 * Provides a registry for custom animations that can be applied to nodes and edges
 *
 * @example
 * ```typescript
 * const registry = new CustomAnimationRegistry();
 *
 * // Register a custom animation
 * registry.register({
 *   name: 'my-bounce',
 *   keyframes: `
 *     0%, 100% { transform: translateY(0); }
 *     50% { transform: translateY(-10px); }
 *   `,
 *   duration: '1s',
 *   timingFunction: 'ease-in-out',
 *   iterationCount: 'infinite'
 * });
 *
 * // Apply to a node
 * registry.applyToElement(nodeElement, 'my-bounce');
 * ```
 */

/**
 * Custom animation definition
 */
export interface CustomAnimationDefinition {
  /** Unique name for the animation */
  name: string;

  /** CSS keyframes definition */
  keyframes: string;

  /** Animation duration (e.g., '1s', '500ms') */
  duration?: string;

  /** Timing function (e.g., 'ease', 'linear', 'ease-in-out') */
  timingFunction?: string;

  /** Iteration count (e.g., 'infinite', '3', '1') */
  iterationCount?: string;

  /** Animation direction (e.g., 'normal', 'reverse', 'alternate') */
  direction?: string;

  /** Fill mode (e.g., 'none', 'forwards', 'backwards', 'both') */
  fillMode?: string;

  /** Delay before animation starts (e.g., '0s', '200ms') */
  delay?: string;

  /** Play state (e.g., 'running', 'paused') */
  playState?: string;

  /** CSS properties that will change (for will-change hint) */
  willChange?: string[];

  /** Description of the animation (for documentation) */
  description?: string;

  /** Tags for categorization */
  tags?: string[];

  /** Target type: 'node', 'edge', or 'both' */
  targetType?: 'node' | 'edge' | 'both';
}

/**
 * Applied animation instance
 */
export interface AppliedAnimation {
  name: string;
  element: HTMLElement;
  startTime: number;
  definition: CustomAnimationDefinition;
}

/**
 * Custom Animation Registry
 *
 * Manages custom animations and applies them to elements
 */
export class CustomAnimationRegistry {
  private animations: Map<string, CustomAnimationDefinition> = new Map();
  private styleElement: HTMLStyleElement | null = null;
  private appliedAnimations: Map<HTMLElement, Set<string>> = new Map();
  private animationListeners: Map<string, Set<(element: HTMLElement) => void>> = new Map();

  constructor() {
    this.initializeStyleElement();
  }

  /**
   * Initialize style element for injecting custom animations
   */
  private initializeStyleElement(): void {
    if (typeof document === 'undefined') {
      return;
    }

    this.styleElement = document.createElement('style');
    this.styleElement.id = 'custom-animations';
    document.head.appendChild(this.styleElement);
  }

  /**
   * Register a custom animation
   */
  register(definition: CustomAnimationDefinition): void {
    // Validate definition
    if (!definition.name || !definition.keyframes) {
      throw new Error('Animation must have a name and keyframes');
    }

    // Check for name conflicts
    if (this.animations.has(definition.name)) {
      console.warn(`Animation "${definition.name}" already exists and will be replaced`);
    }

    // Store definition
    this.animations.set(definition.name, definition);

    // Update CSS
    this.updateCSS();
  }

  /**
   * Unregister a custom animation
   */
  unregister(name: string): boolean {
    const existed = this.animations.delete(name);

    if (existed) {
      this.updateCSS();
      this.removeFromAllElements(name);
    }

    return existed;
  }

  /**
   * Get animation definition
   */
  get(name: string): CustomAnimationDefinition | undefined {
    return this.animations.get(name);
  }

  /**
   * Check if animation exists
   */
  has(name: string): boolean {
    return this.animations.has(name);
  }

  /**
   * Get all registered animations
   */
  getAll(): CustomAnimationDefinition[] {
    return Array.from(this.animations.values());
  }

  /**
   * Get animations by tag
   */
  getByTag(tag: string): CustomAnimationDefinition[] {
    return this.getAll().filter(anim =>
      anim.tags && anim.tags.includes(tag)
    );
  }

  /**
   * Get animations by target type
   */
  getByTargetType(type: 'node' | 'edge' | 'both'): CustomAnimationDefinition[] {
    return this.getAll().filter(anim =>
      !anim.targetType || anim.targetType === type || anim.targetType === 'both'
    );
  }

  /**
   * Apply animation to an element
   */
  applyToElement(element: HTMLElement, animationName: string): boolean {
    const definition = this.animations.get(animationName);

    if (!definition) {
      console.error(`Animation "${animationName}" not found`);
      return false;
    }

    // Track applied animation
    if (!this.appliedAnimations.has(element)) {
      this.appliedAnimations.set(element, new Set());
    }

    this.appliedAnimations.get(element)!.add(animationName);

    // Apply animation CSS
    const animationCSS = this.buildAnimationCSS(definition);
    element.style.animation = animationCSS;

    // Apply will-change hint if specified
    if (definition.willChange && definition.willChange.length > 0) {
      element.style.willChange = definition.willChange.join(', ');
    }

    // Notify listeners
    this.notifyListeners(animationName, element);

    return true;
  }

  /**
   * Remove animation from an element
   */
  removeFromElement(element: HTMLElement, animationName: string): void {
    const applied = this.appliedAnimations.get(element);

    if (applied) {
      applied.delete(animationName);

      if (applied.size === 0) {
        element.style.animation = '';
        element.style.willChange = '';
        this.appliedAnimations.delete(element);
      } else {
        // Reapply remaining animations
        this.reapplyAnimations(element);
      }
    }
  }

  /**
   * Remove animation from all elements
   */
  private removeFromAllElements(animationName: string): void {
    this.appliedAnimations.forEach((animations, element) => {
      if (animations.has(animationName)) {
        this.removeFromElement(element, animationName);
      }
    });
  }

  /**
   * Reapply all animations to an element
   */
  private reapplyAnimations(element: HTMLElement): void {
    const applied = this.appliedAnimations.get(element);

    if (!applied || applied.size === 0) {
      return;
    }

    const cssValues: string[] = [];
    const willChangeValues: string[] = [];

    applied.forEach(animationName => {
      const definition = this.animations.get(animationName);

      if (definition) {
        cssValues.push(this.buildAnimationCSS(definition));

        if (definition.willChange) {
          willChangeValues.push(...definition.willChange);
        }
      }
    });

    element.style.animation = cssValues.join(', ');

    if (willChangeValues.length > 0) {
      element.style.willChange = [...new Set(willChangeValues)].join(', ');
    }
  }

  /**
   * Build CSS animation value from definition
   */
  private buildAnimationCSS(definition: CustomAnimationDefinition): string {
    const parts: string[] = [definition.name];

    if (definition.duration) parts.push(definition.duration);
    if (definition.timingFunction) parts.push(definition.timingFunction);
    if (definition.delay) parts.push(definition.delay);
    if (definition.iterationCount) parts.push(definition.iterationCount);
    if (definition.direction) parts.push(definition.direction);
    if (definition.fillMode) parts.push(definition.fillMode);
    if (definition.playState) parts.push(definition.playState);

    return parts.join(' ');
  }

  /**
   * Update CSS with all registered animations
   */
  private updateCSS(): void {
    if (!this.styleElement) {
      return;
    }

    const css = Array.from(this.animations.values())
      .map(anim => `
@keyframes ${anim.name} {
${anim.keyframes}
}
      `.trim())
      .join('\n\n');

    this.styleElement.textContent = css;
  }

  /**
   * Subscribe to animation applications
   */
  onAnimationApplied(animationName: string, listener: (element: HTMLElement) => void): () => void {
    if (!this.animationListeners.has(animationName)) {
      this.animationListeners.set(animationName, new Set());
    }

    this.animationListeners.get(animationName)!.add(listener);

    return () => {
      const listeners = this.animationListeners.get(animationName);
      if (listeners) {
        listeners.delete(listener);
      }
    };
  }

  /**
   * Notify listeners when animation is applied
   */
  private notifyListeners(animationName: string, element: HTMLElement): void {
    const listeners = this.animationListeners.get(animationName);

    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(element);
        } catch (error) {
          console.error('Error in animation listener:', error);
        }
      });
    }
  }

  /**
   * Get all elements with a specific animation applied
   */
  getElementsWithAnimation(animationName: string): HTMLElement[] {
    const elements: HTMLElement[] = [];

    this.appliedAnimations.forEach((animations, element) => {
      if (animations.has(animationName)) {
        elements.push(element);
      }
    });

    return elements;
  }

  /**
   * Get all animations applied to an element
   */
  getElementAnimations(element: HTMLElement): string[] {
    const applied = this.appliedAnimations.get(element);
    return applied ? Array.from(applied) : [];
  }

  /**
   * Clear all animations from an element
   */
  clearElement(element: HTMLElement): void {
    this.appliedAnimations.delete(element);
    element.style.animation = '';
    element.style.willChange = '';
  }

  /**
   * Clear all animations
   */
  clearAll(): void {
    this.appliedAnimations.forEach((_, element) => {
      element.style.animation = '';
      element.style.willChange = '';
    });

    this.appliedAnimations.clear();
  }

  /**
   * Batch register multiple animations
   */
  registerBatch(definitions: CustomAnimationDefinition[]): void {
    definitions.forEach(def => this.register(def));
  }

  /**
   * Export all animations as JSON
   */
  exportToJSON(): string {
    const animations = this.getAll();
    return JSON.stringify(animations, null, 2);
  }

  /**
   * Import animations from JSON
   */
  importFromJSON(json: string): void {
    try {
      const animations = JSON.parse(json) as CustomAnimationDefinition[];

      if (!Array.isArray(animations)) {
        throw new Error('JSON must contain an array of animations');
      }

      this.registerBatch(animations);
    } catch (error) {
      console.error('Failed to import animations:', error);
      throw error;
    }
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.clearAll();
    this.animations.clear();
    this.animationListeners.clear();

    if (this.styleElement && this.styleElement.parentNode) {
      this.styleElement.parentNode.removeChild(this.styleElement);
    }

    this.styleElement = null;
  }
}

/**
 * Create a global custom animation registry instance
 */
let globalRegistry: CustomAnimationRegistry | null = null;

/**
 * Get the global custom animation registry
 */
export function getGlobalCustomAnimationRegistry(): CustomAnimationRegistry {
  if (!globalRegistry) {
    globalRegistry = new CustomAnimationRegistry();
  }
  return globalRegistry;
}

/**
 * Reset the global registry (useful for testing)
 */
export function resetGlobalCustomAnimationRegistry(): void {
  if (globalRegistry) {
    globalRegistry.destroy();
  }
  globalRegistry = null;
}
