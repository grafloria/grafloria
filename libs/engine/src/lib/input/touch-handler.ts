export interface TouchGestureEvent {
  type: 'tap' | 'long-press' | 'drag' | 'pinch' | 'rotate' | 'swipe';
  touches: TouchPoint[];
  scale?: number; // For pinch gestures
  rotation?: number; // For rotation gestures
  deltaX?: number; // For drag/swipe
  deltaY?: number;
  target?: any;
  originalEvent: TouchEvent;
}

export interface TouchPoint {
  id: number;
  x: number;
  y: number;
  clientX: number;
  clientY: number;
}

export class TouchHandler {
  private element: HTMLElement;
  private listeners: Map<string, Array<(event: TouchGestureEvent) => void>> = new Map();

  // Touch state
  private touches: Map<number, TouchPoint> = new Map();
  private touchStartTime: number = 0;
  private touchStartDistance: number = 0;
  private initialScale: number = 1;
  private lastScale: number = 1;
  private lastPanX: number = 0;
  private lastPanY: number = 0;
  private longPressTimer?: number;

  // Configuration
  private longPressDuration = 500; // ms
  private tapMaxDuration = 300; // ms
  private tapMaxMovement = 10; // px
  private pinchThreshold = 10; // px

  constructor(element: HTMLElement) {
    this.element = element;
    this.attachListeners();
  }

  /**
   * Attach touch event listeners to element
   */
  private attachListeners() {
    this.element.addEventListener('touchstart', this.handleTouchStart.bind(this), {
      passive: false,
    });
    this.element.addEventListener('touchmove', this.handleTouchMove.bind(this), {
      passive: false,
    });
    this.element.addEventListener('touchend', this.handleTouchEnd.bind(this), {
      passive: false,
    });
    this.element.addEventListener('touchcancel', this.handleTouchCancel.bind(this), {
      passive: false,
    });
  }

  /**
   * Handle touch start
   */
  private handleTouchStart(event: TouchEvent) {
    event.preventDefault(); // Prevent browser default behaviors

    this.touchStartTime = Date.now();

    // Store touch points
    for (let i = 0; i < event.changedTouches.length; i++) {
      const touch = event.changedTouches[i];
      this.touches.set(touch.identifier, {
        id: touch.identifier,
        x: touch.pageX,
        y: touch.pageY,
        clientX: touch.clientX,
        clientY: touch.clientY,
      });
    }

    const touchArray = Array.from(this.touches.values());

    // Single touch: could be tap or long-press
    if (this.touches.size === 1) {
      // Start long-press timer
      this.longPressTimer = window.setTimeout(() => {
        this.emit({
          type: 'long-press',
          touches: touchArray,
          originalEvent: event,
        });
      }, this.longPressDuration);
    }

    // Two touches: could be pinch or pan
    if (this.touches.size === 2) {
      this.clearLongPressTimer();
      this.touchStartDistance = this.getDistance(touchArray[0], touchArray[1]);
      this.lastPanX = (touchArray[0].x + touchArray[1].x) / 2;
      this.lastPanY = (touchArray[0].y + touchArray[1].y) / 2;
    }
  }

  /**
   * Handle touch move
   */
  private handleTouchMove(event: TouchEvent) {
    event.preventDefault();

    // Update touch points
    for (let i = 0; i < event.changedTouches.length; i++) {
      const touch = event.changedTouches[i];
      const existing = this.touches.get(touch.identifier);
      if (existing) {
        // Check if moved beyond tap threshold
        const moved = this.getDistance(existing, {
          x: touch.pageX,
          y: touch.pageY,
        } as any);

        if (moved > this.tapMaxMovement) {
          this.clearLongPressTimer();
        }

        this.touches.set(touch.identifier, {
          id: touch.identifier,
          x: touch.pageX,
          y: touch.pageY,
          clientX: touch.clientX,
          clientY: touch.clientY,
        });
      }
    }

    const touchArray = Array.from(this.touches.values());

    // Single touch: drag
    if (this.touches.size === 1) {
      const touch = touchArray[0];
      this.emit({
        type: 'drag',
        touches: touchArray,
        originalEvent: event,
      });
    }

    // Two touches: pinch or two-finger pan
    if (this.touches.size === 2) {
      const distance = this.getDistance(touchArray[0], touchArray[1]);
      const centerX = (touchArray[0].x + touchArray[1].x) / 2;
      const centerY = (touchArray[0].y + touchArray[1].y) / 2;

      // Detect pinch
      if (Math.abs(distance - this.touchStartDistance) > this.pinchThreshold) {
        const scale = distance / this.touchStartDistance;

        this.emit({
          type: 'pinch',
          touches: touchArray,
          scale: scale / this.lastScale,
          originalEvent: event,
        });

        this.lastScale = scale;
      }

      // Two-finger pan
      const deltaX = centerX - this.lastPanX;
      const deltaY = centerY - this.lastPanY;

      if (Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1) {
        this.emit({
          type: 'drag',
          touches: touchArray,
          deltaX,
          deltaY,
          originalEvent: event,
        });

        this.lastPanX = centerX;
        this.lastPanY = centerY;
      }
    }
  }

  /**
   * Handle touch end
   */
  private handleTouchEnd(event: TouchEvent) {
    event.preventDefault();

    const duration = Date.now() - this.touchStartTime;

    // Remove ended touches
    for (let i = 0; i < event.changedTouches.length; i++) {
      const touch = event.changedTouches[i];
      this.touches.delete(touch.identifier);
    }

    // If all touches ended and it was quick and didn't move much: tap
    if (this.touches.size === 0 && duration < this.tapMaxDuration) {
      this.emit({
        type: 'tap',
        touches: [],
        originalEvent: event,
      });
    }

    this.clearLongPressTimer();

    // Reset state when all touches end
    if (this.touches.size === 0) {
      this.lastScale = 1;
    }
  }

  /**
   * Handle touch cancel
   */
  private handleTouchCancel(event: TouchEvent) {
    this.touches.clear();
    this.clearLongPressTimer();
  }

  /**
   * Calculate distance between two touch points
   */
  private getDistance(p1: TouchPoint | { x: number; y: number }, p2: TouchPoint | { x: number; y: number }): number {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Clear long-press timer
   */
  private clearLongPressTimer() {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = undefined;
    }
  }

  /**
   * Register event listener
   */
  on(eventType: string, callback: (event: TouchGestureEvent) => void) {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, []);
    }
    this.listeners.get(eventType)!.push(callback);
  }

  /**
   * Remove event listener
   */
  off(eventType: string, callback: (event: TouchGestureEvent) => void) {
    const callbacks = this.listeners.get(eventType);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  /**
   * Emit event to listeners
   */
  private emit(event: TouchGestureEvent) {
    const callbacks = this.listeners.get(event.type);
    if (callbacks) {
      callbacks.forEach(cb => cb(event));
    }

    // Also emit to wildcard listeners
    const wildcardCallbacks = this.listeners.get('*');
    if (wildcardCallbacks) {
      wildcardCallbacks.forEach(cb => cb(event));
    }
  }

  /**
   * Destroy handler and remove listeners
   */
  destroy() {
    this.element.removeEventListener('touchstart', this.handleTouchStart.bind(this));
    this.element.removeEventListener('touchmove', this.handleTouchMove.bind(this));
    this.element.removeEventListener('touchend', this.handleTouchEnd.bind(this));
    this.element.removeEventListener('touchcancel', this.handleTouchCancel.bind(this));
    this.listeners.clear();
    this.clearLongPressTimer();
  }
}
