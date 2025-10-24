import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

/**
 * Execution state for workflow/process execution
 */
export enum ExecutionState {
  IDLE = 'idle',
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  ERROR = 'error',
}

/**
 * Execution step record
 */
export interface ExecutionStep {
  /** Step ID */
  id: string;

  /** Node ID being executed */
  nodeId: string;

  /** Node type */
  nodeType: string;

  /** Step start timestamp */
  startTime: number;

  /** Step end timestamp (null if still running) */
  endTime: number | null;

  /** Step duration in ms (null if still running) */
  duration: number | null;

  /** Step status */
  status: 'pending' | 'running' | 'completed' | 'error' | 'skipped';

  /** Input data */
  input?: any;

  /** Output data */
  output?: any;

  /** Error details (if status is error) */
  error?: {
    message: string;
    code?: string;
    stack?: string;
  };

  /** Step metadata */
  metadata?: Record<string, any>;
}

/**
 * Execution session record
 */
export interface ExecutionSession {
  /** Session ID */
  id: string;

  /** Session start timestamp */
  startTime: number;

  /** Session end timestamp (null if still running) */
  endTime: number | null;

  /** Session duration in ms (null if still running) */
  duration: number | null;

  /** Session state */
  state: ExecutionState;

  /** Execution steps */
  steps: ExecutionStep[];

  /** Current step index */
  currentStepIndex: number;

  /** Session metadata */
  metadata?: Record<string, any>;
}

/**
 * ExecutionTracker Service
 *
 * Tracks workflow/process execution with history.
 * Useful for debugging, replay, and analytics.
 *
 * Features:
 * - Execution session tracking
 * - Step-by-step execution history
 * - Current execution state
 * - Performance metrics
 * - Replay capability
 *
 * @example
 * ```typescript
 * constructor(private executionTracker: ExecutionTrackerService) {}
 *
 * startWorkflow() {
 *   const sessionId = this.executionTracker.startSession();
 *
 *   // Track each step
 *   const stepId = this.executionTracker.startStep(sessionId, 'node-1', 'task');
 *   // ... execute node logic ...
 *   this.executionTracker.completeStep(stepId, { result: 'success' });
 *
 *   // Complete session
 *   this.executionTracker.completeSession(sessionId);
 * }
 * ```
 */
@Injectable({ providedIn: 'root' })
export class ExecutionTrackerService {
  private sessions = new Map<string, ExecutionSession>();
  private currentSessionId: string | null = null;
  private stepIdCounter = 0;

  private currentSessionSubject = new BehaviorSubject<ExecutionSession | null>(null);
  private executionStateSubject = new BehaviorSubject<ExecutionState>(ExecutionState.IDLE);

  /**
   * Observable of current execution session.
   * Emits null when no session is active.
   */
  readonly currentSession$ = this.currentSessionSubject.asObservable();

  /**
   * Observable of current execution state.
   */
  readonly executionState$ = this.executionStateSubject.asObservable();

  // ============================================================================
  // Session Management
  // ============================================================================

  /**
   * Start new execution session.
   *
   * @param metadata - Optional session metadata
   * @returns Session ID
   */
  startSession(metadata?: Record<string, any>): string {
    const sessionId = this.generateSessionId();
    const session: ExecutionSession = {
      id: sessionId,
      startTime: Date.now(),
      endTime: null,
      duration: null,
      state: ExecutionState.RUNNING,
      steps: [],
      currentStepIndex: -1,
      metadata,
    };

    this.sessions.set(sessionId, session);
    this.currentSessionId = sessionId;
    this.currentSessionSubject.next(session);
    this.executionStateSubject.next(ExecutionState.RUNNING);

    return sessionId;
  }

  /**
   * Complete execution session.
   *
   * @param sessionId - Session ID
   */
  completeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.warn(`Session ${sessionId} not found`);
      return;
    }

    const now = Date.now();
    session.endTime = now;
    session.duration = now - session.startTime;
    session.state = ExecutionState.COMPLETED;

    this.updateSessionState(session);

    if (this.currentSessionId === sessionId) {
      this.currentSessionId = null;
      this.currentSessionSubject.next(null);
      this.executionStateSubject.next(ExecutionState.IDLE);
    }
  }

  /**
   * Pause execution session.
   *
   * @param sessionId - Session ID
   */
  pauseSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    session.state = ExecutionState.PAUSED;
    this.updateSessionState(session);
    this.executionStateSubject.next(ExecutionState.PAUSED);
  }

  /**
   * Resume execution session.
   *
   * @param sessionId - Session ID
   */
  resumeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    session.state = ExecutionState.RUNNING;
    this.updateSessionState(session);
    this.executionStateSubject.next(ExecutionState.RUNNING);
  }

  /**
   * Fail execution session with error.
   *
   * @param sessionId - Session ID
   * @param error - Error details
   */
  failSession(sessionId: string, error: { message: string; code?: string; stack?: string }): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    const now = Date.now();
    session.endTime = now;
    session.duration = now - session.startTime;
    session.state = ExecutionState.ERROR;
    session.metadata = { ...session.metadata, error };

    this.updateSessionState(session);
    this.executionStateSubject.next(ExecutionState.ERROR);
  }

  /**
   * Get execution session by ID.
   *
   * @param sessionId - Session ID
   * @returns Session or null
   */
  getSession(sessionId: string): ExecutionSession | null {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Get current execution session.
   *
   * @returns Current session or null
   */
  getCurrentSession(): ExecutionSession | null {
    if (!this.currentSessionId) {
      return null;
    }
    return this.sessions.get(this.currentSessionId) || null;
  }

  /**
   * Get all execution sessions.
   *
   * @returns Array of sessions
   */
  getAllSessions(): ExecutionSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Clear all execution sessions.
   */
  clearSessions(): void {
    this.sessions.clear();
    this.currentSessionId = null;
    this.currentSessionSubject.next(null);
    this.executionStateSubject.next(ExecutionState.IDLE);
  }

  // ============================================================================
  // Step Tracking
  // ============================================================================

  /**
   * Start execution step.
   *
   * @param sessionId - Session ID
   * @param nodeId - Node ID
   * @param nodeType - Node type
   * @param input - Optional input data
   * @returns Step ID
   */
  startStep(sessionId: string, nodeId: string, nodeType: string, input?: any): string {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const stepId = this.generateStepId();
    const step: ExecutionStep = {
      id: stepId,
      nodeId,
      nodeType,
      startTime: Date.now(),
      endTime: null,
      duration: null,
      status: 'running',
      input,
    };

    session.steps.push(step);
    session.currentStepIndex = session.steps.length - 1;

    this.updateSessionState(session);

    return stepId;
  }

  /**
   * Complete execution step.
   *
   * @param stepId - Step ID
   * @param output - Optional output data
   */
  completeStep(stepId: string, output?: any): void {
    const { session, step } = this.findStep(stepId);
    if (!session || !step) {
      console.warn(`Step ${stepId} not found`);
      return;
    }

    const now = Date.now();
    step.endTime = now;
    step.duration = now - step.startTime;
    step.status = 'completed';
    step.output = output;

    this.updateSessionState(session);
  }

  /**
   * Fail execution step with error.
   *
   * @param stepId - Step ID
   * @param error - Error details
   */
  failStep(stepId: string, error: { message: string; code?: string; stack?: string }): void {
    const { session, step } = this.findStep(stepId);
    if (!session || !step) {
      return;
    }

    const now = Date.now();
    step.endTime = now;
    step.duration = now - step.startTime;
    step.status = 'error';
    step.error = error;

    this.updateSessionState(session);
  }

  /**
   * Skip execution step.
   *
   * @param stepId - Step ID
   */
  skipStep(stepId: string): void {
    const { session, step } = this.findStep(stepId);
    if (!session || !step) {
      return;
    }

    const now = Date.now();
    step.endTime = now;
    step.duration = now - step.startTime;
    step.status = 'skipped';

    this.updateSessionState(session);
  }

  /**
   * Get execution step by ID.
   *
   * @param stepId - Step ID
   * @returns Step or null
   */
  getStep(stepId: string): ExecutionStep | null {
    const { step } = this.findStep(stepId);
    return step || null;
  }

  /**
   * Get all steps for session.
   *
   * @param sessionId - Session ID
   * @returns Array of steps
   */
  getSteps(sessionId: string): ExecutionStep[] {
    const session = this.sessions.get(sessionId);
    return session ? session.steps : [];
  }

  // ============================================================================
  // Analytics
  // ============================================================================

  /**
   * Get execution statistics for session.
   *
   * @param sessionId - Session ID
   * @returns Statistics
   */
  getSessionStats(sessionId: string): {
    totalSteps: number;
    completedSteps: number;
    errorSteps: number;
    skippedSteps: number;
    avgStepDuration: number;
    totalDuration: number;
  } | null {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    const totalSteps = session.steps.length;
    const completedSteps = session.steps.filter(s => s.status === 'completed').length;
    const errorSteps = session.steps.filter(s => s.status === 'error').length;
    const skippedSteps = session.steps.filter(s => s.status === 'skipped').length;

    const completedDurations = session.steps
      .filter(s => s.duration !== null)
      .map(s => s.duration!);

    const avgStepDuration = completedDurations.length > 0
      ? completedDurations.reduce((a, b) => a + b, 0) / completedDurations.length
      : 0;

    return {
      totalSteps,
      completedSteps,
      errorSteps,
      skippedSteps,
      avgStepDuration,
      totalDuration: session.duration || (Date.now() - session.startTime),
    };
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateStepId(): string {
    return `step-${++this.stepIdCounter}`;
  }

  private findStep(stepId: string): { session: ExecutionSession | null; step: ExecutionStep | null } {
    for (const session of this.sessions.values()) {
      const step = session.steps.find(s => s.id === stepId);
      if (step) {
        return { session, step };
      }
    }
    return { session: null, step: null };
  }

  private updateSessionState(session: ExecutionSession): void {
    if (this.currentSessionId === session.id) {
      this.currentSessionSubject.next({ ...session });
    }
  }
}
