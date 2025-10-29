/**
 * Animation Lifecycle Hooks
 *
 * Phase 1.1: Provides callbacks for animation lifecycle events
 * Uses native AnimationEvent API to track when animations start, end, iterate, or cancel
 *
 * @example
 * ```typescript
 * const lifecycle = new AnimationLifecycleManager();
 *
 * // Listen to specific animation events
 * lifecycle.on('start', 'my-animation', (event) => {
 *   console.log('Animation started!', event);
 * });
 *
 * lifecycle.on('end', 'my-animation', (event) => {
 *   console.log('Animation ended!', event);
 * });
 *
 * // Track all animations on an element
 * lifecycle.trackElement(myElement);
 * ```
 */

/**
 * Animation lifecycle event types
 */
export type AnimationLifecycleEvent = 'start' | 'end' | 'iteration' | 'cancel';

/**
 * Animation event data
 */
export interface AnimationEventData {
  /** Animation name */
  animationName: string;

  /** Element the animation is applied to */
  element: HTMLElement;

  /** Event type */
  type: AnimationLifecycleEvent;

  /** Elapsed time when event occurred */
  elapsedTime: number;

  /** Pseudo-element (if applicable) */
  pseudoElement?: string;

  /** Original AnimationEvent */
  originalEvent: AnimationEvent;

  /** Timestamp */
  timestamp: number;
}

/**
 * Lifecycle callback function
 */
export type LifecycleCallback = (data: AnimationEventData) => void;

/**
 * Animation Lifecycle Manager
 *
 * Manages lifecycle event listeners for CSS animations
 */
export class AnimationLifecycleManager {
  private trackedElements: Set<HTMLElement> = new Set();

  // Event listeners organized by: eventType -> animationName -> callbacks
  private listeners: Map<AnimationLifecycleEvent, Map<string, Set<LifecycleCallback>>> = new Map();

  // Global listeners (all animations, all elements)
  private globalListeners: Map<AnimationLifecycleEvent, Set<LifecycleCallback>> = new Map();

  // Element-specific listeners
  private elementListeners: Map<HTMLElement, Map<AnimationLifecycleEvent, Set<LifecycleCallback>>> = new Map();

  constructor() {
    this.initializeListenerMaps();
  }

  /**
   * Initialize listener maps
   */
  private initializeListenerMaps(): void {
    const eventTypes: AnimationLifecycleEvent[] = ['start', 'end', 'iteration', 'cancel'];

    eventTypes.forEach(type => {
      this.listeners.set(type, new Map());
      this.globalListeners.set(type, new Set());
    });
  }

  /**
   * Track an element for animation events
   */
  trackElement(element: HTMLElement): void {
    if (this.trackedElements.has(element)) {
      return;
    }

    this.trackedElements.add(element);

    // Add native event listeners
    element.addEventListener('animationstart', this.handleAnimationStart);
    element.addEventListener('animationend', this.handleAnimationEnd);
    element.addEventListener('animationiteration', this.handleAnimationIteration);
    element.addEventListener('animationcancel', this.handleAnimationCancel);
  }

  /**
   * Untrack an element
   */
  untrackElement(element: HTMLElement): void {
    if (!this.trackedElements.has(element)) {
      return;
    }

    this.trackedElements.delete(element);
    this.elementListeners.delete(element);

    // Remove native event listeners
    element.removeEventListener('animationstart', this.handleAnimationStart);
    element.removeEventListener('animationend', this.handleAnimationEnd);
    element.removeEventListener('animationiteration', this.handleAnimationIteration);
    element.removeEventListener('animationcancel', this.handleAnimationCancel);
  }

  /**
   * Listen to a specific animation lifecycle event
   *
   * @param eventType - Type of event ('start', 'end', 'iteration', 'cancel')
   * @param animationName - Name of the animation to listen for
   * @param callback - Callback function
   * @returns Unsubscribe function
   */
  on(eventType: AnimationLifecycleEvent, animationName: string, callback: LifecycleCallback): () => void {
    const eventMap = this.listeners.get(eventType);

    if (!eventMap) {
      throw new Error(`Invalid event type: ${eventType}`);
    }

    if (!eventMap.has(animationName)) {
      eventMap.set(animationName, new Set());
    }

    eventMap.get(animationName)!.add(callback);

    // Return unsubscribe function
    return () => {
      const callbacks = eventMap.get(animationName);
      if (callbacks) {
        callbacks.delete(callback);
      }
    };
  }

  /**
   * Listen to all animations for a specific event type
   *
   * @param eventType - Type of event
   * @param callback - Callback function
   * @returns Unsubscribe function
   */
  onAll(eventType: AnimationLifecycleEvent, callback: LifecycleCallback): () => void {
    const callbacks = this.globalListeners.get(eventType);

    if (!callbacks) {
      throw new Error(`Invalid event type: ${eventType}`);
    }

    callbacks.add(callback);

    return () => {
      callbacks.delete(callback);
    };
  }

  /**
   * Listen to animations on a specific element
   *
   * @param element - Element to listen to
   * @param eventType - Type of event
   * @param callback - Callback function
   * @returns Unsubscribe function
   */
  onElement(element: HTMLElement, eventType: AnimationLifecycleEvent, callback: LifecycleCallback): () => void {
    // Ensure element is tracked
    this.trackElement(element);

    // Get or create element listener map
    if (!this.elementListeners.has(element)) {
      this.elementListeners.set(element, new Map());
    }

    const elementMap = this.elementListeners.get(element)!;

    if (!elementMap.has(eventType)) {
      elementMap.set(eventType, new Set());
    }

    elementMap.get(eventType)!.add(callback);

    return () => {
      const callbacks = elementMap.get(eventType);
      if (callbacks) {
        callbacks.delete(callback);
      }
    };
  }

  /**
   * Remove all listeners for a specific animation
   */
  off(eventType: AnimationLifecycleEvent, animationName: string): void {
    const eventMap = this.listeners.get(eventType);

    if (eventMap) {
      eventMap.delete(animationName);
    }
  }

  /**
   * Handle animation start event
   */
  private handleAnimationStart = (event: AnimationEvent): void => {
    this.dispatchEvent('start', event);
  };

  /**
   * Handle animation end event
   */
  private handleAnimationEnd = (event: AnimationEvent): void => {
    this.dispatchEvent('end', event);
  };

  /**
   * Handle animation iteration event
   */
  private handleAnimationIteration = (event: AnimationEvent): void => {
    this.dispatchEvent('iteration', event);
  };

  /**
   * Handle animation cancel event
   */
  private handleAnimationCancel = (event: AnimationEvent): void => {
    this.dispatchEvent('cancel', event);
  };

  /**
   * Dispatch event to all relevant listeners
   */
  private dispatchEvent(type: AnimationLifecycleEvent, originalEvent: AnimationEvent): void {
    const eventData: AnimationEventData = {
      animationName: originalEvent.animationName,
      element: originalEvent.target as HTMLElement,
      type,
      elapsedTime: originalEvent.elapsedTime,
      pseudoElement: originalEvent.pseudoElement || undefined,
      originalEvent,
      timestamp: Date.now(),
    };

    // Call global listeners
    const globalCallbacks = this.globalListeners.get(type);
    if (globalCallbacks) {
      globalCallbacks.forEach(callback => {
        try {
          callback(eventData);
        } catch (error) {
          console.error('Error in global animation lifecycle callback:', error);
        }
      });
    }

    // Call animation-specific listeners
    const eventMap = this.listeners.get(type);
    if (eventMap) {
      const callbacks = eventMap.get(eventData.animationName);
      if (callbacks) {
        callbacks.forEach(callback => {
          try {
            callback(eventData);
          } catch (error) {
            console.error('Error in animation lifecycle callback:', error);
          }
        });
      }
    }

    // Call element-specific listeners
    const elementMap = this.elementListeners.get(eventData.element);
    if (elementMap) {
      const callbacks = elementMap.get(type);
      if (callbacks) {
        callbacks.forEach(callback => {
          try {
            callback(eventData);
          } catch (error) {
            console.error('Error in element animation lifecycle callback:', error);
          }
        });
      }
    }
  }

  /**
   * Wait for an animation to end
   * Returns a promise that resolves when the animation ends
   */
  waitFor(animationName: string, element?: HTMLElement): Promise<AnimationEventData> {
    return new Promise((resolve) => {
      if (element) {
        this.trackElement(element);

        const unsubscribe = this.onElement(element, 'end', (data) => {
          if (data.animationName === animationName) {
            unsubscribe();
            resolve(data);
          }
        });
      } else {
        const unsubscribe = this.on('end', animationName, (data) => {
          unsubscribe();
          resolve(data);
        });
      }
    });
  }

  /**
   * Wait for any animation to complete on an element
   */
  waitForElement(element: HTMLElement): Promise<AnimationEventData> {
    this.trackElement(element);

    return new Promise((resolve) => {
      const unsubscribe = this.onElement(element, 'end', (data) => {
        unsubscribe();
        resolve(data);
      });
    });
  }

  /**
   * Get all tracked elements
   */
  getTrackedElements(): HTMLElement[] {
    return Array.from(this.trackedElements);
  }

  /**
   * Check if element is being tracked
   */
  isTracking(element: HTMLElement): boolean {
    return this.trackedElements.has(element);
  }

  /**
   * Cleanup: Remove all listeners and untrack all elements
   */
  destroy(): void {
    // Untrack all elements
    const elements = Array.from(this.trackedElements);
    elements.forEach(element => this.untrackElement(element));

    // Clear all listeners
    this.listeners.clear();
    this.globalListeners.clear();
    this.elementListeners.clear();
    this.trackedElements.clear();
  }
}

/**
 * Global animation lifecycle manager instance
 */
let globalLifecycleManager: AnimationLifecycleManager | null = null;

/**
 * Get the global animation lifecycle manager
 */
export function getGlobalAnimationLifecycleManager(): AnimationLifecycleManager {
  if (!globalLifecycleManager) {
    globalLifecycleManager = new AnimationLifecycleManager();
  }
  return globalLifecycleManager;
}

/**
 * Reset the global lifecycle manager (useful for testing)
 */
export function resetGlobalAnimationLifecycleManager(): void {
  if (globalLifecycleManager) {
    globalLifecycleManager.destroy();
  }
  globalLifecycleManager = null;
}
