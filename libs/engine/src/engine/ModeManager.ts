// ModeManager.ts - Manages diagram mode state and transitions

import type { EventBus } from '../events/EventBus';
import { DiagramMode, isValidDiagramMode } from './DiagramMode';
import type {
  ModeGuardFunction,
  ModeGuardBlockedEvent,
  ModeViewportSettings,
  ViewportSettingsChangedEvent,
  ModeHistoryEntry,
  ModeAnalytics,
  ModeChangeHook,
  ModeChangeContext,
} from './DiagramModeTypes';

/**
 * ModeManager - Centralized mode management for diagram engine
 *
 * Responsibilities:
 * - Current mode state
 * - Mode transition guards
 * - Mode-specific viewport settings
 * - Mode history tracking and navigation
 * - Mode change hooks (before/after)
 * - Mode analytics
 */
export class ModeManager {
  // Current mode state
  private currentMode: DiagramMode;

  // Priority 2a: Mode Transition Guards
  private guards: Map<string, ModeGuardFunction> = new Map();

  // Priority 3a: Mode-Specific Viewport Settings
  private viewportSettings: Map<DiagramMode, ModeViewportSettings> = new Map();

  // Priority 3b: Mode History & Stack
  private history: ModeHistoryEntry[] = [];
  private stack: DiagramMode[] = []; // For push/pop operations
  private historyIndex: number = -1; // For previous/next navigation
  private modeStartTime: number = Date.now();

  // Priority 3c: Before/After Hooks
  private beforeHooks: ModeChangeHook[] = [];
  private afterHooks: ModeChangeHook[] = [];

  constructor(
    private eventBus: EventBus,
    private getContext: () => ModeChangeContext,
    initialMode: DiagramMode = DiagramMode.DESIGNER
  ) {
    this.currentMode = initialMode;
    // Record initial mode in history
    this.history.push({
      mode: initialMode,
      timestamp: this.modeStartTime,
      duration: null,
    });
  }

  // ============================================================================
  // Basic Mode Management
  // ============================================================================

  /**
   * Get current mode
   */
  getMode(): DiagramMode {
    return this.currentMode;
  }

  /**
   * Set diagram mode (with guards and hooks)
   */
  setMode(mode: DiagramMode): void {
    // Validate mode
    if (!isValidDiagramMode(mode)) {
      throw new Error(`Invalid diagram mode: ${mode}`);
    }

    // No change
    if (this.currentMode === mode) {
      return;
    }

    const previousMode = this.currentMode;

    // Run before hooks
    if (!this.runBeforeHooks(previousMode, mode)) {
      return; // Hook prevented change
    }

    // Check guards
    const guardResult = this.checkGuards(previousMode, mode);
    if (!guardResult.allowed) {
      // Emit guard blocked event
      this.eventBus.emit('mode-guard-blocked', {
        previousMode,
        requestedMode: mode,
        guard: guardResult.guardName!,
        reason: guardResult.reason,
      } as ModeGuardBlockedEvent);
      return;
    }

    // Update history (close current mode entry)
    this.updateHistory(mode);

    // Reset history navigation index
    this.historyIndex = this.history.length - 1;

    // Apply mode change
    this.currentMode = mode;
    this.modeStartTime = Date.now();

    // Emit mode changed event
    this.eventBus.emit('mode-changed', { previousMode, currentMode: mode });

    // Apply viewport settings for new mode
    this.applyViewportSettings(mode);

    // Run after hooks
    this.runAfterHooks(previousMode, mode);
  }

  /**
   * Check if in designer mode
   */
  isDesignerMode(): boolean {
    return this.currentMode === DiagramMode.DESIGNER;
  }

  /**
   * Check if in running mode
   */
  isRunningMode(): boolean {
    return this.currentMode === DiagramMode.RUNNING;
  }

  /**
   * Check if in view mode
   */
  isViewMode(): boolean {
    return this.currentMode === DiagramMode.VIEW;
  }

  /**
   * Check if in debug mode
   */
  isDebugMode(): boolean {
    return this.currentMode === DiagramMode.DEBUG;
  }

  /**
   * Check if in presentation mode
   */
  isPresentationMode(): boolean {
    return this.currentMode === DiagramMode.PRESENTATION;
  }

  /**
   * Check if in read-only mode (any mode except designer)
   */
  isReadOnlyMode(): boolean {
    return this.currentMode !== DiagramMode.DESIGNER;
  }

  // ============================================================================
  // Priority 2a: Mode Transition Guards
  // ============================================================================

  /**
   * Add mode transition guard
   */
  addModeGuard(name: string, guard: ModeGuardFunction): void {
    this.guards.set(name, guard);
  }

  /**
   * Remove mode transition guard
   */
  removeModeGuard(name: string): void {
    this.guards.delete(name);
  }

  /**
   * Clear all mode transition guards
   */
  clearModeGuards(): void {
    this.guards.clear();
  }

  /**
   * Check all guards for mode transition
   */
  private checkGuards(previousMode: DiagramMode, nextMode: DiagramMode): {
    allowed: boolean;
    guardName?: string;
    reason?: string;
  } {
    for (const [name, guard] of this.guards.entries()) {
      const result = guard(previousMode, nextMode);
      if (!result.allowed) {
        return { allowed: false, guardName: name, reason: result.reason };
      }
    }
    return { allowed: true };
  }

  // ============================================================================
  // Priority 3a: Mode-Specific Viewport Settings
  // ============================================================================

  /**
   * Configure viewport settings for specific mode
   */
  configureModeViewport(mode: DiagramMode, settings: ModeViewportSettings): void {
    this.viewportSettings.set(mode, settings);
  }

  /**
   * Get viewport settings for specific mode
   */
  getModeViewportSettings(mode: DiagramMode): ModeViewportSettings {
    return this.viewportSettings.get(mode) || this.getDefaultViewportSettings();
  }

  /**
   * Get default viewport settings
   */
  private getDefaultViewportSettings(): ModeViewportSettings {
    return {
      allowZoom: true,
      allowPan: true,
    };
  }

  /**
   * Apply viewport settings when mode changes
   */
  private applyViewportSettings(mode: DiagramMode): void {
    const settings = this.getModeViewportSettings(mode);

    // Emit event for renderer to handle
    this.eventBus.emit('viewport-settings-changed', {
      mode,
      settings,
    } as ViewportSettingsChangedEvent);
  }

  // ============================================================================
  // Priority 3b: Mode History & Stack
  // ============================================================================

  /**
   * Get mode history
   */
  getModeHistory(): ModeHistoryEntry[] {
    return [...this.history];
  }

  /**
   * Clear mode history (keeps current mode only)
   */
  clearModeHistory(): void {
    const currentEntry = this.history[this.history.length - 1];
    this.history = [currentEntry];
    this.historyIndex = 0;
  }

  /**
   * Update history when mode changes
   */
  private updateHistory(newMode: DiagramMode): void {
    const now = Date.now();
    const duration = now - this.modeStartTime;

    // Update duration for current (previous) mode
    if (this.history.length > 0) {
      const lastEntry = this.history[this.history.length - 1];
      if (lastEntry.duration === null) {
        lastEntry.duration = duration;
      }
    }

    // Add new mode entry
    this.history.push({
      mode: newMode,
      timestamp: now,
      duration: null, // Will be set when mode changes again
    });
  }

  /**
   * Navigate to previous mode
   */
  previousMode(): void {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      const targetMode = this.history[this.historyIndex].mode;
      this.setModeInternal(targetMode); // Skip guards and history updates
    }
  }

  /**
   * Navigate to next mode
   */
  nextMode(): void {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      const targetMode = this.history[this.historyIndex].mode;
      this.setModeInternal(targetMode); // Skip guards and history updates
    }
  }

  /**
   * Push mode onto stack (save current, switch to new)
   */
  pushMode(mode: DiagramMode): void {
    this.stack.push(this.currentMode);
    this.setMode(mode);
  }

  /**
   * Pop mode from stack (return to previous)
   */
  popMode(): void {
    if (this.stack.length > 0) {
      const previousMode = this.stack.pop()!;
      this.setMode(previousMode);
    }
  }

  /**
   * Set mode internally (for navigation, skips guards and history)
   */
  private setModeInternal(mode: DiagramMode): void {
    const previousMode = this.currentMode;
    this.currentMode = mode;
    this.eventBus.emit('mode-changed', { previousMode, currentMode: mode });
    this.applyViewportSettings(mode);
  }

  /**
   * Get mode analytics
   */
  getModeAnalytics(): ModeAnalytics {
    const analytics: ModeAnalytics = {};

    // Initialize all modes
    for (const mode of Object.values(DiagramMode)) {
      analytics[mode] = {
        count: 0,
        totalTime: 0,
        avgTime: 0,
      };
    }

    // Calculate from history
    for (const entry of this.history) {
      if (entry.duration !== null) {
        analytics[entry.mode].count++;
        analytics[entry.mode].totalTime += entry.duration;
      }
    }

    // Calculate averages
    for (const mode of Object.values(DiagramMode)) {
      const stats = analytics[mode];
      if (stats.count > 0) {
        stats.avgTime = stats.totalTime / stats.count;
      }
    }

    return analytics;
  }

  // ============================================================================
  // Priority 3c: Before/After Mode Change Hooks
  // ============================================================================

  /**
   * Register before mode change hook
   * @returns Unsubscribe function
   */
  beforeModeChange(hook: ModeChangeHook): () => void {
    this.beforeHooks.push(hook);

    // Return unsubscribe function
    return () => {
      const index = this.beforeHooks.indexOf(hook);
      if (index > -1) {
        this.beforeHooks.splice(index, 1);
      }
    };
  }

  /**
   * Register after mode change hook
   * @returns Unsubscribe function
   */
  afterModeChange(hook: ModeChangeHook): () => void {
    this.afterHooks.push(hook);

    // Return unsubscribe function
    return () => {
      const index = this.afterHooks.indexOf(hook);
      if (index > -1) {
        this.afterHooks.splice(index, 1);
      }
    };
  }

  /**
   * Run before mode change hooks
   * @returns true if change allowed, false if prevented
   */
  private runBeforeHooks(previousMode: DiagramMode, nextMode: DiagramMode): boolean {
    const context = this.getContext();

    for (const hook of this.beforeHooks) {
      const result = hook(previousMode, nextMode, context);
      if (result === false) {
        return false; // Hook prevented change
      }
    }

    return true;
  }

  /**
   * Run after mode change hooks
   */
  private runAfterHooks(previousMode: DiagramMode, nextMode: DiagramMode): void {
    const context = this.getContext();

    for (const hook of this.afterHooks) {
      hook(previousMode, nextMode, context);
    }
  }

  // ============================================================================
  // Serialization
  // ============================================================================

  /**
   * Serialize current mode for persistence
   */
  serialize(): DiagramMode {
    return this.currentMode;
  }

  /**
   * Restore mode from serialized data
   */
  restore(mode: DiagramMode | undefined): void {
    if (mode && isValidDiagramMode(mode)) {
      this.currentMode = mode;
      this.modeStartTime = Date.now();
      this.history = [{
        mode,
        timestamp: this.modeStartTime,
        duration: null,
      }];
    }
  }
}
