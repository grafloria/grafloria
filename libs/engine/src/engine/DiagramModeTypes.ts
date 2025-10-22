// DiagramModeTypes.ts - Type definitions for Diagram Mode features

import type { DiagramMode } from './DiagramMode';
import type { DiagramEngine } from './DiagramEngine';
import type { DiagramModel } from '../models/DiagramModel';

/**
 * Mode transition guard function
 */
export type ModeGuardFunction = (
  previousMode: DiagramMode,
  nextMode: DiagramMode
) => ModeGuardResult;

/**
 * Result from mode guard
 */
export interface ModeGuardResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Mode guard blocked event
 */
export interface ModeGuardBlockedEvent {
  previousMode: DiagramMode;
  requestedMode: DiagramMode;
  guard: string;
  reason?: string;
}

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
  followNode?: string; // Node ID to follow
  autoCenter?: boolean;
  resetOnEnter?: boolean;
}

/**
 * Viewport settings changed event
 */
export interface ViewportSettingsChangedEvent {
  mode: DiagramMode;
  settings: ModeViewportSettings;
}

/**
 * Mode history entry
 */
export interface ModeHistoryEntry {
  mode: DiagramMode;
  timestamp: number;
  duration: number | null; // null for current mode
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
 * Before/After mode change hook function
 */
export type ModeChangeHook = (
  previousMode: DiagramMode,
  nextMode: DiagramMode,
  context?: ModeChangeContext
) => void | false; // Return false to prevent mode change

/**
 * Context passed to mode change hooks
 */
export interface ModeChangeContext {
  engine: DiagramEngine;
  diagram: DiagramModel | null;
}
