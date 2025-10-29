/**
 * Animation Sequencer
 *
 * Phase 1.1: Chains multiple animations together
 * Allows creating sequences of animations with delays, callbacks, and parallel execution
 *
 * @example
 * ```typescript
 * const sequencer = new AnimationSequencer();
 *
 * // Create a sequence
 * sequencer
 *   .add(element1, 'fade-in', { duration: '500ms' })
 *   .delay(200)
 *   .add(element2, 'slide-in', { duration: '300ms' })
 *   .parallel([
 *     { element: element3, animation: 'rotate', options: { duration: '1s' } },
 *     { element: element4, animation: 'scale', options: { duration: '1s' } }
 *   ])
 *   .onComplete(() => console.log('Sequence complete!'))
 *   .play();
 * ```
 */

import { CustomAnimationRegistry } from './custom-animation-registry';
import { AnimationLifecycleManager } from './animation-lifecycle';

/**
 * Animation step options
 */
export interface AnimationStepOptions {
  /** Animation duration */
  duration?: string;

  /** Timing function */
  timingFunction?: string;

  /** Delay before starting */
  delay?: string;

  /** Iteration count */
  iterationCount?: string;

  /** Direction */
  direction?: string;

  /** Fill mode */
  fillMode?: string;
}

/**
 * Animation step types
 */
export type AnimationStepType = 'single' | 'parallel' | 'delay' | 'callback';

/**
 * Single animation step
 */
export interface SingleAnimationStep {
  type: 'single';
  element: HTMLElement;
  animationName: string;
  options?: AnimationStepOptions;
}

/**
 * Parallel animation step
 */
export interface ParallelAnimationStep {
  type: 'parallel';
  animations: Array<{
    element: HTMLElement;
    animationName: string;
    options?: AnimationStepOptions;
  }>;
}

/**
 * Delay step
 */
export interface DelayStep {
  type: 'delay';
  duration: number; // milliseconds
}

/**
 * Callback step
 */
export interface CallbackStep {
  type: 'callback';
  callback: () => void | Promise<void>;
}

/**
 * Animation step union type
 */
export type AnimationStep = SingleAnimationStep | ParallelAnimationStep | DelayStep | CallbackStep;

/**
 * Sequence playback state
 */
export type SequenceState = 'idle' | 'playing' | 'paused' | 'completed' | 'cancelled';

/**
 * Animation Sequencer
 *
 * Manages sequences of animations
 */
export class AnimationSequencer {
  private steps: AnimationStep[] = [];
  private currentStepIndex: number = 0;
  private state: SequenceState = 'idle';
  private completionCallbacks: Array<() => void> = [];
  private animationRegistry?: CustomAnimationRegistry;
  private lifecycleManager?: AnimationLifecycleManager;

  constructor(
    animationRegistry?: CustomAnimationRegistry,
    lifecycleManager?: AnimationLifecycleManager
  ) {
    this.animationRegistry = animationRegistry;
    this.lifecycleManager = lifecycleManager;
  }

  /**
   * Add a single animation step
   */
  add(element: HTMLElement, animationName: string, options?: AnimationStepOptions): this {
    this.steps.push({
      type: 'single',
      element,
      animationName,
      options,
    });

    return this;
  }

  /**
   * Add multiple animations to run in parallel
   */
  parallel(animations: Array<{
    element: HTMLElement;
    animationName: string;
    options?: AnimationStepOptions;
  }>): this {
    this.steps.push({
      type: 'parallel',
      animations,
    });

    return this;
  }

  /**
   * Add a delay
   */
  delay(duration: number): this {
    this.steps.push({
      type: 'delay',
      duration,
    });

    return this;
  }

  /**
   * Add a callback step
   */
  then(callback: () => void | Promise<void>): this {
    this.steps.push({
      type: 'callback',
      callback,
    });

    return this;
  }

  /**
   * Add completion callback
   */
  onComplete(callback: () => void): this {
    this.completionCallbacks.push(callback);
    return this;
  }

  /**
   * Play the sequence
   */
  async play(): Promise<void> {
    if (this.state === 'playing') {
      console.warn('Sequence is already playing');
      return;
    }

    this.state = 'playing';
    this.currentStepIndex = 0;

    try {
      await this.executeSteps();
      this.state = 'completed';
      this.notifyCompletion();
    } catch (error) {
      console.error('Error playing animation sequence:', error);
      this.state = 'cancelled';
      throw error;
    }
  }

  /**
   * Execute all steps in the sequence
   */
  private async executeSteps(): Promise<void> {
    for (let i = 0; i < this.steps.length; i++) {
      if (this.state !== 'playing') {
        break;
      }

      this.currentStepIndex = i;
      await this.executeStep(this.steps[i]);
    }
  }

  /**
   * Execute a single step
   */
  private async executeStep(step: AnimationStep): Promise<void> {
    switch (step.type) {
      case 'single':
        await this.executeSingleAnimation(step);
        break;

      case 'parallel':
        await this.executeParallelAnimations(step);
        break;

      case 'delay':
        await this.executeDelay(step);
        break;

      case 'callback':
        await this.executeCallback(step);
        break;
    }
  }

  /**
   * Execute a single animation
   */
  private async executeSingleAnimation(step: SingleAnimationStep): Promise<void> {
    const { element, animationName, options } = step;

    // Apply animation
    this.applyAnimation(element, animationName, options);

    // Wait for animation to complete
    if (this.lifecycleManager) {
      await this.lifecycleManager.waitFor(animationName, element);
    } else {
      // Fallback: estimate duration
      const duration = this.parseDuration(options?.duration || '1s');
      await this.sleep(duration);
    }
  }

  /**
   * Execute parallel animations
   */
  private async executeParallelAnimations(step: ParallelAnimationStep): Promise<void> {
    const promises = step.animations.map(async (anim) => {
      this.applyAnimation(anim.element, anim.animationName, anim.options);

      if (this.lifecycleManager) {
        await this.lifecycleManager.waitFor(anim.animationName, anim.element);
      } else {
        const duration = this.parseDuration(anim.options?.duration || '1s');
        await this.sleep(duration);
      }
    });

    await Promise.all(promises);
  }

  /**
   * Execute delay
   */
  private async executeDelay(step: DelayStep): Promise<void> {
    await this.sleep(step.duration);
  }

  /**
   * Execute callback
   */
  private async executeCallback(step: CallbackStep): Promise<void> {
    const result = step.callback();

    // If callback returns a promise, await it
    if (result && typeof result.then === 'function') {
      await result;
    }
  }

  /**
   * Apply animation to an element
   */
  private applyAnimation(element: HTMLElement, animationName: string, options?: AnimationStepOptions): void {
    const parts: string[] = [animationName];

    if (options?.duration) parts.push(options.duration);
    if (options?.timingFunction) parts.push(options.timingFunction);
    if (options?.delay) parts.push(options.delay);
    if (options?.iterationCount) parts.push(options.iterationCount);
    if (options?.direction) parts.push(options.direction);
    if (options?.fillMode) parts.push(options.fillMode);

    element.style.animation = parts.join(' ');

    // Track element if lifecycle manager is available
    if (this.lifecycleManager) {
      this.lifecycleManager.trackElement(element);
    }
  }

  /**
   * Parse duration string to milliseconds
   */
  private parseDuration(duration: string): number {
    const match = duration.match(/^([\d.]+)(ms|s)$/);

    if (!match) {
      console.warn(`Invalid duration: ${duration}, defaulting to 1s`);
      return 1000;
    }

    const value = parseFloat(match[1]);
    const unit = match[2];

    return unit === 's' ? value * 1000 : value;
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Pause the sequence
   */
  pause(): void {
    if (this.state === 'playing') {
      this.state = 'paused';
    }
  }

  /**
   * Resume the sequence
   */
  resume(): void {
    if (this.state === 'paused') {
      this.state = 'playing';
    }
  }

  /**
   * Cancel the sequence
   */
  cancel(): void {
    this.state = 'cancelled';
  }

  /**
   * Reset the sequence
   */
  reset(): void {
    this.state = 'idle';
    this.currentStepIndex = 0;
  }

  /**
   * Get current state
   */
  getState(): SequenceState {
    return this.state;
  }

  /**
   * Get current step index
   */
  getCurrentStepIndex(): number {
    return this.currentStepIndex;
  }

  /**
   * Get total number of steps
   */
  getTotalSteps(): number {
    return this.steps.length;
  }

  /**
   * Get all steps
   */
  getSteps(): AnimationStep[] {
    return [...this.steps];
  }

  /**
   * Clear all steps
   */
  clear(): void {
    this.steps = [];
    this.reset();
  }

  /**
   * Notify completion callbacks
   */
  private notifyCompletion(): void {
    this.completionCallbacks.forEach(callback => {
      try {
        callback();
      } catch (error) {
        console.error('Error in completion callback:', error);
      }
    });
  }

  /**
   * Clone this sequencer (creates a new instance with the same steps)
   */
  clone(): AnimationSequencer {
    const clone = new AnimationSequencer(this.animationRegistry, this.lifecycleManager);
    clone.steps = [...this.steps];
    clone.completionCallbacks = [...this.completionCallbacks];
    return clone;
  }

  /**
   * Export sequence as JSON
   */
  exportToJSON(): string {
    // Note: Cannot serialize element references and callbacks
    // This is mainly for debugging/visualization
    return JSON.stringify({
      totalSteps: this.steps.length,
      steps: this.steps.map((step, index) => ({
        index,
        type: step.type,
        ...(step.type === 'delay' && { duration: step.duration }),
      })),
    }, null, 2);
  }
}

/**
 * Create a new animation sequencer
 */
export function createSequencer(
  animationRegistry?: CustomAnimationRegistry,
  lifecycleManager?: AnimationLifecycleManager
): AnimationSequencer {
  return new AnimationSequencer(animationRegistry, lifecycleManager);
}

/**
 * Helper: Create a simple fade in sequence
 */
export function fadeInSequence(elements: HTMLElement[], delay: number = 100): AnimationSequencer {
  const sequencer = new AnimationSequencer();

  elements.forEach((element, index) => {
    if (index > 0) {
      sequencer.delay(delay);
    }
    sequencer.add(element, 'fade-in', { duration: '300ms', fillMode: 'forwards' });
  });

  return sequencer;
}

/**
 * Helper: Create a stagger animation sequence
 */
export function staggerSequence(
  elements: HTMLElement[],
  animationName: string,
  staggerDelay: number = 100,
  options?: AnimationStepOptions
): AnimationSequencer {
  const sequencer = new AnimationSequencer();

  elements.forEach((element, index) => {
    if (index > 0) {
      sequencer.delay(staggerDelay);
    }
    sequencer.add(element, animationName, options);
  });

  return sequencer;
}
