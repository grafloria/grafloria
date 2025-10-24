import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { DiagramMode } from '@grafloria/engine';

/**
 * Mode change event
 */
export interface ModeChangeEvent {
  previousMode: DiagramMode;
  currentMode: DiagramMode;
}

/**
 * Mode guard function result
 */
export interface ModeGuardResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Mode transition guard function
 */
export type ModeGuardFunction = (
  previousMode: DiagramMode,
  nextMode: DiagramMode
) => ModeGuardResult;

/**
 * Viewport settings for a specific mode
 */
export interface ModeViewportSettings {
  allowZoom?: boolean;
  allowPan?: boolean;
  minZoom?: number;
  maxZoom?: number;
  centerOnLoad?: boolean;
  fitToScreen?: boolean;
  followNode?: string;
  autoCenter?: boolean;
  resetOnEnter?: boolean;
}

/**
 * Mode history entry
 */
export interface ModeHistoryEntry {
  mode: DiagramMode;
  timestamp: number;
  duration: number | null;
}

/**
 * Mode analytics data
 */
export interface ModeAnalytics {
  [mode: string]: {
    count: number;
    totalTime: number;
    avgTime: number;
  };
}

/**
 * Mode change hook function
 */
export type ModeChangeHook = (
  previousMode: DiagramMode,
  nextMode: DiagramMode,
  context?: any
) => void | false;

/**
 * Angular service wrapper for engine ModeManager.
 * Provides reactive API using RxJS observables.
 *
 * Features:
 * - Reactive mode state (BehaviorSubject)
 * - Mode transition guards
 * - Mode history tracking
 * - Mode-specific viewport settings
 * - Before/after hooks
 * - Mode analytics
 *
 * @example
 * ```typescript
 * constructor(private modeManager: ModeManagerService) {}
 *
 * ngOnInit() {
 *   // Subscribe to mode changes
 *   this.modeManager.mode$.subscribe(mode => {
 *     console.log('Current mode:', mode);
 *   });
 *
 *   // Switch to running mode
 *   this.modeManager.setMode(DiagramMode.RUNNING);
 * }
 * ```
 */
@Injectable({ providedIn: 'root' })
export class ModeManagerService implements OnDestroy {
  private engineModeManager: any = null; // Will be set by DiagramEngine
  private modeSubject = new BehaviorSubject<DiagramMode>(DiagramMode.DESIGNER);
  private modeChangedSubject = new Subject<ModeChangeEvent>();
  private unsubscribeFunctions: Array<() => void> = [];

  /**
   * Observable of current diagram mode.
   * Emits whenever mode changes.
   */
  readonly mode$ = this.modeSubject.asObservable();

  /**
   * Observable of mode change events.
   * Emits { previousMode, currentMode } on every mode change.
   */
  readonly modeChanged$ = this.modeChangedSubject.asObservable();

  ngOnDestroy(): void {
    // Clean up all subscriptions
    this.unsubscribeFunctions.forEach(unsub => unsub());
    this.unsubscribeFunctions = [];
  }

  /**
   * Initialize with engine's ModeManager instance.
   * Called internally by DiagramEngine or AngularRenderer.
   *
   * @internal
   */
  setEngineModeManager(modeManager: any): void {
    this.engineModeManager = modeManager;

    // Sync initial state
    this.modeSubject.next(modeManager.getMode());

    // Listen to mode changes from engine
    const eventBus = (modeManager as any).eventBus;
    if (eventBus) {
      const unsubscribe = eventBus.on('mode-changed', (event: ModeChangeEvent) => {
        this.modeSubject.next(event.currentMode);
        this.modeChangedSubject.next(event);
      });
      this.unsubscribeFunctions.push(unsubscribe);
    }
  }

  // ============================================================================
  // Basic Mode Management
  // ============================================================================

  /**
   * Get current diagram mode.
   *
   * @returns Current mode
   */
  getMode(): DiagramMode {
    if (this.engineModeManager) {
      return this.engineModeManager.getMode();
    }
    return this.modeSubject.value;
  }

  /**
   * Set diagram mode.
   * Mode change may be blocked by guards.
   *
   * @param mode - Target mode
   *
   * @example
   * ```typescript
   * // Switch to debug mode
   * modeManager.setMode(DiagramMode.DEBUG);
   * ```
   */
  setMode(mode: DiagramMode): void {
    if (!this.engineModeManager) {
      console.warn('ModeManager not initialized with engine instance');
      return;
    }
    this.engineModeManager.setMode(mode);
  }

  /**
   * Check if in designer mode.
   */
  isDesignerMode(): boolean {
    return this.getMode() === DiagramMode.DESIGNER;
  }

  /**
   * Check if in running mode.
   */
  isRunningMode(): boolean {
    return this.getMode() === DiagramMode.RUNNING;
  }

  /**
   * Check if in view mode.
   */
  isViewMode(): boolean {
    return this.getMode() === DiagramMode.VIEW;
  }

  /**
   * Check if in debug mode.
   */
  isDebugMode(): boolean {
    return this.getMode() === DiagramMode.DEBUG;
  }

  /**
   * Check if in presentation mode.
   */
  isPresentationMode(): boolean {
    return this.getMode() === DiagramMode.PRESENTATION;
  }

  /**
   * Check if in read-only mode (any mode except designer).
   */
  isReadOnlyMode(): boolean {
    return this.getMode() !== DiagramMode.DESIGNER;
  }

  // ============================================================================
  // Mode Transition Guards
  // ============================================================================

  /**
   * Add mode transition guard.
   * Guards can prevent mode changes based on custom logic.
   *
   * @param name - Guard identifier
   * @param guard - Guard function
   *
   * @example
   * ```typescript
   * modeManager.addModeGuard('unsaved-changes', (prev, next) => {
   *   if (prev === DiagramMode.DESIGNER && hasUnsavedChanges()) {
   *     return { allowed: false, reason: 'Save changes before switching modes' };
   *   }
   *   return { allowed: true };
   * });
   * ```
   */
  addModeGuard(name: string, guard: ModeGuardFunction): void {
    if (!this.engineModeManager) {
      console.warn('ModeManager not initialized');
      return;
    }
    this.engineModeManager.addModeGuard(name, guard);
  }

  /**
   * Remove mode transition guard.
   *
   * @param name - Guard identifier
   */
  removeModeGuard(name: string): void {
    if (!this.engineModeManager) {
      return;
    }
    this.engineModeManager.removeModeGuard(name);
  }

  /**
   * Clear all mode transition guards.
   */
  clearModeGuards(): void {
    if (!this.engineModeManager) {
      return;
    }
    this.engineModeManager.clearModeGuards();
  }

  // ============================================================================
  // Mode-Specific Viewport Settings
  // ============================================================================

  /**
   * Configure viewport settings for specific mode.
   *
   * @param mode - Target mode
   * @param settings - Viewport settings
   *
   * @example
   * ```typescript
   * // Disable pan/zoom in presentation mode
   * modeManager.configureModeViewport(DiagramMode.PRESENTATION, {
   *   allowZoom: false,
   *   allowPan: false,
   *   fitToScreen: true
   * });
   * ```
   */
  configureModeViewport(mode: DiagramMode, settings: ModeViewportSettings): void {
    if (!this.engineModeManager) {
      console.warn('ModeManager not initialized');
      return;
    }
    this.engineModeManager.configureModeViewport(mode, settings);
  }

  /**
   * Get viewport settings for specific mode.
   *
   * @param mode - Target mode
   * @returns Viewport settings
   */
  getModeViewportSettings(mode: DiagramMode): ModeViewportSettings {
    if (!this.engineModeManager) {
      return { allowZoom: true, allowPan: true };
    }
    return this.engineModeManager.getModeViewportSettings(mode);
  }

  // ============================================================================
  // Mode History & Navigation
  // ============================================================================

  /**
   * Get mode history.
   * Returns array of mode entries with timestamps and durations.
   *
   * @returns Mode history
   */
  getModeHistory(): ModeHistoryEntry[] {
    if (!this.engineModeManager) {
      return [];
    }
    return this.engineModeManager.getModeHistory();
  }

  /**
   * Clear mode history (keeps current mode only).
   */
  clearModeHistory(): void {
    if (!this.engineModeManager) {
      return;
    }
    this.engineModeManager.clearModeHistory();
  }

  /**
   * Navigate to previous mode in history.
   */
  previousMode(): void {
    if (!this.engineModeManager) {
      return;
    }
    this.engineModeManager.previousMode();
  }

  /**
   * Navigate to next mode in history.
   */
  nextMode(): void {
    if (!this.engineModeManager) {
      return;
    }
    this.engineModeManager.nextMode();
  }

  /**
   * Push current mode onto stack and switch to new mode.
   * Useful for temporary mode switches.
   *
   * @param mode - Target mode
   *
   * @example
   * ```typescript
   * // Temporarily switch to presentation mode
   * modeManager.pushMode(DiagramMode.PRESENTATION);
   * // ... do presentation ...
   * // Return to previous mode
   * modeManager.popMode();
   * ```
   */
  pushMode(mode: DiagramMode): void {
    if (!this.engineModeManager) {
      return;
    }
    this.engineModeManager.pushMode(mode);
  }

  /**
   * Pop mode from stack and return to previous mode.
   */
  popMode(): void {
    if (!this.engineModeManager) {
      return;
    }
    this.engineModeManager.popMode();
  }

  /**
   * Get mode analytics (time spent in each mode).
   *
   * @returns Mode analytics
   */
  getModeAnalytics(): ModeAnalytics {
    if (!this.engineModeManager) {
      return {};
    }
    return this.engineModeManager.getModeAnalytics();
  }

  // ============================================================================
  // Before/After Hooks
  // ============================================================================

  /**
   * Register before mode change hook.
   * Hook can prevent mode change by returning false.
   *
   * @param hook - Hook function
   * @returns Unsubscribe function
   *
   * @example
   * ```typescript
   * const unsubscribe = modeManager.beforeModeChange((prev, next, context) => {
   *   console.log(`Switching from ${prev} to ${next}`);
   *   return true; // Allow change
   * });
   *
   * // Later: unsubscribe()
   * ```
   */
  beforeModeChange(hook: ModeChangeHook): () => void {
    if (!this.engineModeManager) {
      return () => {};
    }
    const unsub = this.engineModeManager.beforeModeChange(hook);
    this.unsubscribeFunctions.push(unsub);
    return unsub;
  }

  /**
   * Register after mode change hook.
   *
   * @param hook - Hook function
   * @returns Unsubscribe function
   */
  afterModeChange(hook: ModeChangeHook): () => void {
    if (!this.engineModeManager) {
      return () => {};
    }
    const unsub = this.engineModeManager.afterModeChange(hook);
    this.unsubscribeFunctions.push(unsub);
    return unsub;
  }
}
