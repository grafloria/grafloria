import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

/**
 * Animation callback function
 */
export type AnimationCallback = (deltaTime: number, elapsedTime: number) => void;

/**
 * Simulation state
 */
export enum SimulationState {
  IDLE = 'idle',
  RUNNING = 'running',
  PAUSED = 'paused',
}

/**
 * Animation configuration
 */
export interface AnimationConfig {
  /** Target FPS (default: 60) */
  fps?: number;

  /** Max delta time cap in ms (prevents spiral of death) */
  maxDeltaTime?: number;

  /** Whether to auto-start (default: false) */
  autoStart?: boolean;
}

/**
 * Animation frame stats
 */
export interface AnimationStats {
  /** Current FPS */
  fps: number;

  /** Average FPS */
  avgFps: number;

  /** Frame count */
  frameCount: number;

  /** Total elapsed time in ms */
  elapsedTime: number;

  /** Last frame delta time in ms */
  deltaTime: number;
}

/**
 * SimulationEngine Service
 *
 * High-performance animation engine for diagram simulations.
 * Runs at 60 FPS using requestAnimationFrame.
 *
 * Features:
 * - 60 FPS animation loop
 * - Frame rate monitoring
 * - Delta time tracking
 * - Multiple animation callbacks
 * - Pause/resume support
 * - Performance stats
 *
 * @example
 * ```typescript
 * constructor(
 *   private simulationEngine: SimulationEngineService
 * ) {}
 *
 * ngOnInit() {
 *   // Register animation callback
 *   const unsubscribe = this.simulationEngine.registerAnimation((deltaTime, elapsedTime) => {
 *     // Update node positions, animations, etc.
 *     this.updateNodePositions(deltaTime);
 *   });
 *
 *   // Start simulation
 *   this.simulationEngine.start();
 * }
 *
 * ngOnDestroy() {
 *   this.simulationEngine.stop();
 * }
 * ```
 */
@Injectable({ providedIn: 'root' })
export class SimulationEngineService implements OnDestroy {
  private animationId: number | null = null;
  private callbacks: Array<{ id: string; callback: AnimationCallback }> = [];
  private callbackIdCounter = 0;

  private config: Required<AnimationConfig> = {
    fps: 60,
    maxDeltaTime: 100,
    autoStart: false,
  };

  // Timing
  private lastTime = 0;
  private elapsedTime = 0;
  private frameCount = 0;

  // FPS tracking
  private fpsHistory: number[] = [];
  private readonly FPS_HISTORY_SIZE = 60;
  private lastFpsUpdate = 0;
  private fpsFrameCount = 0;

  // State
  private stateSubject = new BehaviorSubject<SimulationState>(SimulationState.IDLE);
  private statsSubject = new BehaviorSubject<AnimationStats>({
    fps: 0,
    avgFps: 0,
    frameCount: 0,
    elapsedTime: 0,
    deltaTime: 0,
  });

  /**
   * Observable of simulation state.
   */
  readonly state$ = this.stateSubject.asObservable();

  /**
   * Observable of animation stats (updated every second).
   */
  readonly stats$ = this.statsSubject.asObservable();

  constructor(private ngZone: NgZone) {}

  ngOnDestroy(): void {
    this.stop();
  }

  // ============================================================================
  // Configuration
  // ============================================================================

  /**
   * Configure simulation engine.
   *
   * @param config - Configuration options
   *
   * @example
   * ```typescript
   * simulationEngine.configure({
   *   fps: 30, // Lower FPS for better performance
   *   maxDeltaTime: 50
   * });
   * ```
   */
  configure(config: AnimationConfig): void {
    this.config = { ...this.config, ...config };

    if (config.autoStart && this.stateSubject.value === SimulationState.IDLE) {
      this.start();
    }
  }

  // ============================================================================
  // Simulation Control
  // ============================================================================

  /**
   * Start simulation.
   */
  start(): void {
    if (this.stateSubject.value === SimulationState.RUNNING) {
      return;
    }

    this.stateSubject.next(SimulationState.RUNNING);
    this.lastTime = performance.now();
    this.lastFpsUpdate = this.lastTime;

    // Run animation loop outside Angular zone for better performance
    this.ngZone.runOutsideAngular(() => {
      this.animate();
    });
  }

  /**
   * Stop simulation.
   */
  stop(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    this.stateSubject.next(SimulationState.IDLE);
    this.reset();
  }

  /**
   * Pause simulation.
   */
  pause(): void {
    if (this.stateSubject.value !== SimulationState.RUNNING) {
      return;
    }

    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    this.stateSubject.next(SimulationState.PAUSED);
  }

  /**
   * Resume simulation.
   */
  resume(): void {
    if (this.stateSubject.value !== SimulationState.PAUSED) {
      return;
    }

    this.stateSubject.next(SimulationState.RUNNING);
    this.lastTime = performance.now();
    this.lastFpsUpdate = this.lastTime;

    this.ngZone.runOutsideAngular(() => {
      this.animate();
    });
  }

  /**
   * Check if simulation is running.
   */
  isRunning(): boolean {
    return this.stateSubject.value === SimulationState.RUNNING;
  }

  /**
   * Check if simulation is paused.
   */
  isPaused(): boolean {
    return this.stateSubject.value === SimulationState.PAUSED;
  }

  /**
   * Reset simulation timing.
   */
  reset(): void {
    this.elapsedTime = 0;
    this.frameCount = 0;
    this.fpsHistory = [];
    this.fpsFrameCount = 0;
    this.statsSubject.next({
      fps: 0,
      avgFps: 0,
      frameCount: 0,
      elapsedTime: 0,
      deltaTime: 0,
    });
  }

  // ============================================================================
  // Animation Callbacks
  // ============================================================================

  /**
   * Register animation callback.
   * Callback is called every frame with delta time.
   *
   * @param callback - Animation callback function
   * @returns Unsubscribe function
   *
   * @example
   * ```typescript
   * const unsubscribe = simulationEngine.registerAnimation((deltaTime) => {
   *   // Animate nodes
   *   nodes.forEach(node => {
   *     node.x += node.velocity * deltaTime;
   *   });
   * });
   *
   * // Later: unsubscribe()
   * ```
   */
  registerAnimation(callback: AnimationCallback): () => void {
    const id = `anim-${++this.callbackIdCounter}`;
    this.callbacks.push({ id, callback });

    return () => {
      const index = this.callbacks.findIndex(c => c.id === id);
      if (index > -1) {
        this.callbacks.splice(index, 1);
      }
    };
  }

  /**
   * Clear all animation callbacks.
   */
  clearAnimations(): void {
    this.callbacks = [];
  }

  /**
   * Get number of registered animations.
   */
  getAnimationCount(): number {
    return this.callbacks.length;
  }

  // ============================================================================
  // Stats
  // ============================================================================

  /**
   * Get current animation stats.
   */
  getStats(): AnimationStats {
    return this.statsSubject.value;
  }

  // ============================================================================
  // Animation Loop
  // ============================================================================

  private animate(): void {
    if (this.stateSubject.value !== SimulationState.RUNNING) {
      return;
    }

    const currentTime = performance.now();
    let deltaTime = currentTime - this.lastTime;

    // Cap delta time to prevent spiral of death
    if (deltaTime > this.config.maxDeltaTime) {
      deltaTime = this.config.maxDeltaTime;
    }

    // Update timing
    this.lastTime = currentTime;
    this.elapsedTime += deltaTime;
    this.frameCount++;
    this.fpsFrameCount++;

    // Update FPS (every second)
    if (currentTime - this.lastFpsUpdate >= 1000) {
      const fps = this.fpsFrameCount / ((currentTime - this.lastFpsUpdate) / 1000);

      // Add to history
      this.fpsHistory.push(fps);
      if (this.fpsHistory.length > this.FPS_HISTORY_SIZE) {
        this.fpsHistory.shift();
      }

      // Calculate average FPS
      const avgFps = this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length;

      // Update stats
      this.ngZone.run(() => {
        this.statsSubject.next({
          fps: Math.round(fps),
          avgFps: Math.round(avgFps),
          frameCount: this.frameCount,
          elapsedTime: Math.round(this.elapsedTime),
          deltaTime: Math.round(deltaTime * 100) / 100,
        });
      });

      this.lastFpsUpdate = currentTime;
      this.fpsFrameCount = 0;
    }

    // Call animation callbacks
    const deltaTimeInSeconds = deltaTime / 1000;
    const elapsedTimeInSeconds = this.elapsedTime / 1000;

    for (const { callback } of this.callbacks) {
      try {
        callback(deltaTimeInSeconds, elapsedTimeInSeconds);
      } catch (error) {
        console.error('Animation callback error:', error);
      }
    }

    // Schedule next frame
    this.animationId = requestAnimationFrame(() => this.animate());
  }
}
