import { TestBed } from '@angular/core/testing';
import { ModeManagerService, type ModeChangeEvent } from '../../lib/services/mode-manager.service';
import { SimulationEngineService } from '../../lib/services/simulation-engine.service';
import { ExecutionTrackerService, ExecutionState } from '../../lib/services/execution-tracker.service';
import { BreakpointManagerService, BreakpointType } from '../../lib/services/breakpoint-manager.service';
import { DiagramEngine, DiagramMode } from '@grafloria/engine';

/**
 * Mode-Aware Integration Tests
 *
 * Mode transitions and mode-specific behaviour, driven through the REAL stack:
 * a live `DiagramEngine` whose `ModeManager` is wired into the Angular
 * `ModeManagerService` wrapper (exactly how `DiagramCanvasComponent` wires it),
 * alongside the debug/simulation services that accompany each mode:
 * - Mode switching (Designer ↔ Debug ↔ Running) and reactive events
 * - Mode transition guards and blocked-transition events
 * - Mode-specific features (execution tracking, simulation engine, breakpoints)
 * - State preservation across modes, and cleanup via after-change hooks
 * - Mode analytics and history
 *
 * This suite was originally written against a planned API that never shipped
 * (`DiagramMode.DESIGN`/`SIMULATION`, `getCurrentMode()`, `addGuard()`,
 * `reset()`, a boolean-returning `setMode`) — it never compiled. It has been
 * retargeted at the real contract: `DiagramMode.DESIGNER`/`RUNNING`,
 * `getMode()`, named guards via `addModeGuard(name, fn)`, history/analytics
 * via `getModeHistory()`/`getModeAnalytics()`, and `beforeModeChange`/
 * `afterModeChange` hooks. The old spec also assumed the mode manager
 * implicitly stops execution tracking on mode exit; the real design keeps the
 * services decoupled and applications wire cleanup through hooks — which is
 * what Scenario 3 now proves.
 */

describe('Mode-Aware Integration Tests', () => {
  let engine: DiagramEngine;
  let modeManager: ModeManagerService;
  let simulationEngine: SimulationEngineService;
  let executionTracker: ExecutionTrackerService;
  let breakpointManager: BreakpointManagerService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ModeManagerService,
        SimulationEngineService,
        ExecutionTrackerService,
        BreakpointManagerService,
      ],
    });

    modeManager = TestBed.inject(ModeManagerService);
    simulationEngine = TestBed.inject(SimulationEngineService);
    executionTracker = TestBed.inject(ExecutionTrackerService);
    breakpointManager = TestBed.inject(BreakpointManagerService);

    // Wire the Angular wrapper to a real engine ModeManager
    engine = new DiagramEngine();
    modeManager.setEngineModeManager(engine.modeManager);
  });

  afterEach(() => {
    simulationEngine.stop();
    executionTracker.clearSessions();
    breakpointManager.clearBreakpoints();
    engine.destroy();
  });

  describe('Scenario 1: Basic Mode Transitions', () => {
    it('should transition between modes', () => {
      expect(modeManager.getMode()).toBe(DiagramMode.DESIGNER);
      expect(modeManager.isDesignerMode()).toBe(true);

      // Transition to DEBUG
      modeManager.setMode(DiagramMode.DEBUG);
      expect(modeManager.getMode()).toBe(DiagramMode.DEBUG);
      expect(modeManager.isDebugMode()).toBe(true);
      expect(modeManager.isReadOnlyMode()).toBe(true);

      // Transition to RUNNING
      modeManager.setMode(DiagramMode.RUNNING);
      expect(modeManager.getMode()).toBe(DiagramMode.RUNNING);
      expect(modeManager.isRunningMode()).toBe(true);

      // Back to DESIGNER
      modeManager.setMode(DiagramMode.DESIGNER);
      expect(modeManager.getMode()).toBe(DiagramMode.DESIGNER);
      expect(modeManager.isReadOnlyMode()).toBe(false);
    });

    it('should emit mode change events', () => {
      const events: ModeChangeEvent[] = [];
      modeManager.modeChanged$.subscribe(event => {
        if (event) events.push(event);
      });

      modeManager.setMode(DiagramMode.DEBUG);
      modeManager.setMode(DiagramMode.RUNNING);

      expect(events.length).toBe(2);
      expect(events[0].previousMode).toBe(DiagramMode.DESIGNER);
      expect(events[0].currentMode).toBe(DiagramMode.DEBUG);
      expect(events[1].previousMode).toBe(DiagramMode.DEBUG);
      expect(events[1].currentMode).toBe(DiagramMode.RUNNING);
    });

    it('should keep the reactive mode$ stream in sync with the engine', () => {
      const seen: DiagramMode[] = [];
      modeManager.mode$.subscribe(mode => seen.push(mode));

      // Drive the change through the ENGINE, not the wrapper
      engine.modeManager.setMode(DiagramMode.VIEW);

      expect(seen).toContain(DiagramMode.VIEW);
      expect(modeManager.getMode()).toBe(DiagramMode.VIEW);
      expect(modeManager.isViewMode()).toBe(true);
    });

    it('should track mode history', () => {
      modeManager.setMode(DiagramMode.DEBUG);
      modeManager.setMode(DiagramMode.RUNNING);
      modeManager.setMode(DiagramMode.DESIGNER);

      const history = modeManager.getModeHistory();
      // initial DESIGNER + 3 transitions
      expect(history.length).toBeGreaterThanOrEqual(4);
      expect(history.map(h => h.mode)).toContain(DiagramMode.DEBUG);
      expect(history.map(h => h.mode)).toContain(DiagramMode.RUNNING);
      // Every closed entry carries a duration; the current one is still open
      expect(history[history.length - 1].duration).toBeNull();
      expect(history[0].duration).not.toBeNull();
    });
  });

  describe('Scenario 2: Mode Guards and Validation', () => {
    it('should enforce mode transition guards', () => {
      modeManager.addModeGuard('no-debug', (prev, next) => {
        if (next === DiagramMode.DEBUG) {
          return { allowed: false, reason: 'Debug mode disabled' };
        }
        return { allowed: true };
      });

      const blockedEvents: any[] = [];
      engine.on('mode-guard-blocked', (event: any) => blockedEvents.push(event));

      modeManager.setMode(DiagramMode.DEBUG);

      // Transition blocked: mode unchanged, blocked event carries the reason
      expect(modeManager.getMode()).toBe(DiagramMode.DESIGNER);
      expect(blockedEvents.length).toBe(1);
      expect(blockedEvents[0].guard).toBe('no-debug');
      expect(blockedEvents[0].reason).toBe('Debug mode disabled');

      // Other transitions still allowed
      modeManager.setMode(DiagramMode.VIEW);
      expect(modeManager.getMode()).toBe(DiagramMode.VIEW);
    });

    it('should allow mode transition when guards pass', () => {
      modeManager.addModeGuard('allow-all', () => ({ allowed: true }));

      modeManager.setMode(DiagramMode.DEBUG);
      expect(modeManager.getMode()).toBe(DiagramMode.DEBUG);
    });

    it('should support conditional guards', () => {
      let allowDebug = false;

      modeManager.addModeGuard('debug-readiness', (prev, next) => {
        if (next === DiagramMode.DEBUG && !allowDebug) {
          return { allowed: false, reason: 'Debug not ready' };
        }
        return { allowed: true };
      });

      // Initially blocked
      modeManager.setMode(DiagramMode.DEBUG);
      expect(modeManager.getMode()).toBe(DiagramMode.DESIGNER);

      // Enable debug
      allowDebug = true;
      modeManager.setMode(DiagramMode.DEBUG);
      expect(modeManager.getMode()).toBe(DiagramMode.DEBUG);
    });

    it('should stop enforcing a guard after it is removed', () => {
      modeManager.addModeGuard('no-debug', (prev, next) =>
        next === DiagramMode.DEBUG ? { allowed: false, reason: 'nope' } : { allowed: true }
      );

      modeManager.setMode(DiagramMode.DEBUG);
      expect(modeManager.getMode()).toBe(DiagramMode.DESIGNER);

      modeManager.removeModeGuard('no-debug');
      modeManager.setMode(DiagramMode.DEBUG);
      expect(modeManager.getMode()).toBe(DiagramMode.DEBUG);
    });
  });

  describe('Scenario 3: Mode-Specific Features', () => {
    it('should track execution while in DEBUG mode', () => {
      modeManager.setMode(DiagramMode.DEBUG);
      expect(modeManager.isDebugMode()).toBe(true);

      // Not tracking yet
      expect(executionTracker.getCurrentSession()).toBeNull();

      const states: ExecutionState[] = [];
      executionTracker.executionState$.subscribe(s => states.push(s));

      // Start tracking a debug run
      const sessionId = executionTracker.startSession({ mode: DiagramMode.DEBUG });
      expect(executionTracker.getCurrentSession()?.id).toBe(sessionId);
      expect(states[states.length - 1]).toBe(ExecutionState.RUNNING);

      const stepId = executionTracker.startStep(sessionId, 'node1', 'task');
      executionTracker.completeStep(stepId, { result: 'ok' });
      executionTracker.completeSession(sessionId);

      expect(states[states.length - 1]).toBe(ExecutionState.IDLE);
      expect(executionTracker.getSessionStats(sessionId)?.completedSteps).toBe(1);
    });

    it('should run the simulation engine in RUNNING mode', () => {
      modeManager.setMode(DiagramMode.RUNNING);

      expect(modeManager.isRunningMode()).toBe(true);
      expect(simulationEngine.isRunning()).toBe(false);

      simulationEngine.start();
      expect(simulationEngine.isRunning()).toBe(true);

      simulationEngine.stop();
      expect(simulationEngine.isRunning()).toBe(false);
    });

    it('should let applications wire mode-exit cleanup through afterModeChange hooks', () => {
      // The mode manager and the trackers are deliberately decoupled;
      // cleanup on mode exit is wired through hooks.
      modeManager.afterModeChange((prev, next) => {
        if (prev === DiagramMode.DEBUG && next !== DiagramMode.DEBUG) {
          executionTracker.clearSessions();
        }
      });

      modeManager.setMode(DiagramMode.DEBUG);
      executionTracker.startSession();
      expect(executionTracker.getAllSessions().length).toBe(1);

      // Leaving debug mode triggers the cleanup hook
      modeManager.setMode(DiagramMode.DESIGNER);
      expect(executionTracker.getAllSessions().length).toBe(0);
      expect(executionTracker.getCurrentSession()).toBeNull();
    });
  });

  describe('Scenario 4: State Preservation Across Modes', () => {
    it('should preserve breakpoints across mode changes', () => {
      breakpointManager.addBreakpoint('node1', BreakpointType.BEFORE);
      breakpointManager.addBreakpoint('node2', BreakpointType.AFTER);
      expect(breakpointManager.getAllBreakpoints().length).toBe(2);

      modeManager.setMode(DiagramMode.DEBUG);
      expect(breakpointManager.getAllBreakpoints().length).toBe(2);

      modeManager.setMode(DiagramMode.DESIGNER);
      expect(breakpointManager.getAllBreakpoints().length).toBe(2);
      expect(breakpointManager.hasBreakpoint('node1', BreakpointType.BEFORE)).toBe(true);
    });

    it('should preserve simulation state when pausing', () => {
      modeManager.setMode(DiagramMode.RUNNING);
      simulationEngine.start();
      expect(simulationEngine.isRunning()).toBe(true);

      simulationEngine.pause();
      expect(simulationEngine.isPaused()).toBe(true);
      expect(simulationEngine.isRunning()).toBe(false);

      simulationEngine.resume();
      expect(simulationEngine.isPaused()).toBe(false);
      expect(simulationEngine.isRunning()).toBe(true);
    });

    it('should keep execution history until explicitly cleared', () => {
      modeManager.setMode(DiagramMode.DEBUG);
      const sessionId = executionTracker.startSession();
      const stepId = executionTracker.startStep(sessionId, 'node1', 'task');
      executionTracker.completeStep(stepId, { duration: 100 });
      executionTracker.completeSession(sessionId);

      // Mode changes do not silently destroy recorded history
      modeManager.setMode(DiagramMode.DESIGNER);
      expect(executionTracker.getSession(sessionId)).not.toBeNull();
      expect(executionTracker.getSteps(sessionId).length).toBe(1);

      // Explicit clear removes it
      executionTracker.clearSessions();
      expect(executionTracker.getSession(sessionId)).toBeNull();
    });
  });

  describe('Scenario 5: Mode Analytics', () => {
    it('should track time spent in each mode', async () => {
      modeManager.setMode(DiagramMode.DEBUG);
      await delay(30);

      modeManager.setMode(DiagramMode.RUNNING);
      await delay(30);

      modeManager.setMode(DiagramMode.DESIGNER);

      const analytics = modeManager.getModeAnalytics();
      expect(analytics[DiagramMode.DEBUG].count).toBe(1);
      expect(analytics[DiagramMode.RUNNING].count).toBe(1);
      expect(analytics[DiagramMode.DEBUG].totalTime).toBeGreaterThan(0);
      expect(analytics[DiagramMode.RUNNING].totalTime).toBeGreaterThan(0);
    });

    it('should calculate average time per mode', async () => {
      for (let i = 0; i < 3; i++) {
        modeManager.setMode(DiagramMode.DEBUG);
        await delay(15);
        modeManager.setMode(DiagramMode.DESIGNER);
        await delay(5);
      }

      const analytics = modeManager.getModeAnalytics();
      expect(analytics[DiagramMode.DEBUG].count).toBe(3);
      expect(analytics[DiagramMode.DEBUG].avgTime).toBeGreaterThan(0);
      expect(analytics[DiagramMode.DEBUG].avgTime).toBeCloseTo(
        analytics[DiagramMode.DEBUG].totalTime / 3,
        5
      );
    });
  });

  describe('Scenario 6: Mode Transition Hooks', () => {
    it('should execute hooks on mode change', () => {
      const hookCalls: string[] = [];

      modeManager.afterModeChange((prev, next) => {
        hookCalls.push(`${prev} -> ${next}`);
      });

      modeManager.setMode(DiagramMode.DEBUG);
      modeManager.setMode(DiagramMode.RUNNING);

      expect(hookCalls.length).toBe(2);
      expect(hookCalls[0]).toBe(`${DiagramMode.DESIGNER} -> ${DiagramMode.DEBUG}`);
      expect(hookCalls[1]).toBe(`${DiagramMode.DEBUG} -> ${DiagramMode.RUNNING}`);
    });

    it('should allow before-hooks to prevent mode change', () => {
      modeManager.beforeModeChange((prev, next) => {
        if (next === DiagramMode.RUNNING) {
          return false; // Block transition
        }
        return undefined;
      });

      modeManager.setMode(DiagramMode.RUNNING);
      expect(modeManager.getMode()).toBe(DiagramMode.DESIGNER);

      // Unblocked transitions still work
      modeManager.setMode(DiagramMode.DEBUG);
      expect(modeManager.getMode()).toBe(DiagramMode.DEBUG);
    });

    it('should stop calling an unsubscribed hook', () => {
      const hookCalls: string[] = [];
      const unsubscribe = modeManager.afterModeChange((prev, next) => {
        hookCalls.push(`${prev} -> ${next}`);
      });

      modeManager.setMode(DiagramMode.DEBUG);
      expect(hookCalls.length).toBe(1);

      unsubscribe();
      modeManager.setMode(DiagramMode.DESIGNER);
      expect(hookCalls.length).toBe(1);
    });
  });

  describe('Scenario 7: Complex Mode Workflows', () => {
    it('should handle a design-debug-run-design workflow', () => {
      // 1. Design mode - setup
      expect(modeManager.isDesignerMode()).toBe(true);
      const breakpoint = breakpointManager.addBreakpoint('node1', BreakpointType.BEFORE);

      // 2. Debug mode - step through with breakpoints
      modeManager.setMode(DiagramMode.DEBUG);
      const sessionId = executionTracker.startSession();
      const stepId = executionTracker.startStep(sessionId, 'node1', 'task');
      expect(breakpointManager.shouldBreak('node1', BreakpointType.BEFORE)).toBe(true);
      expect(breakpointManager.getBreakpoint(breakpoint.id)?.hitCount).toBe(1);
      executionTracker.completeStep(stepId);
      executionTracker.completeSession(sessionId);
      expect(executionTracker.getSessionStats(sessionId)?.completedSteps).toBe(1);

      // 3. Running mode - simulate
      modeManager.setMode(DiagramMode.RUNNING);
      simulationEngine.start();
      expect(simulationEngine.isRunning()).toBe(true);

      // 4. Back to design
      simulationEngine.stop();
      modeManager.setMode(DiagramMode.DESIGNER);
      expect(modeManager.isDesignerMode()).toBe(true);
      expect(simulationEngine.isRunning()).toBe(false);
    });

    it('should handle rapid mode switching', () => {
      const modes = [
        DiagramMode.DEBUG,
        DiagramMode.RUNNING,
        DiagramMode.DESIGNER,
        DiagramMode.DEBUG,
        DiagramMode.DESIGNER,
      ];

      for (const mode of modes) {
        modeManager.setMode(mode);
      }

      expect(modeManager.getMode()).toBe(DiagramMode.DESIGNER);
      // initial entry + one entry per transition
      expect(modeManager.getModeHistory().length).toBe(modes.length + 1);
    });

    it('should support temporary mode switches with push/pop', () => {
      modeManager.setMode(DiagramMode.DEBUG);

      modeManager.pushMode(DiagramMode.PRESENTATION);
      expect(modeManager.getMode()).toBe(DiagramMode.PRESENTATION);

      modeManager.popMode();
      expect(modeManager.getMode()).toBe(DiagramMode.DEBUG);
    });
  });

  describe('Scenario 8: Error Recovery in Mode Transitions', () => {
    it('should recover from blocked transitions', () => {
      const originalMode = modeManager.getMode();

      modeManager.addModeGuard('always-fail', () => ({
        allowed: false,
        reason: 'Test failure',
      }));

      modeManager.setMode(DiagramMode.DEBUG);
      expect(modeManager.getMode()).toBe(originalMode);

      // Clearing the guards restores normal behaviour
      modeManager.clearModeGuards();
      modeManager.setMode(DiagramMode.DEBUG);
      expect(modeManager.getMode()).toBe(DiagramMode.DEBUG);
    });

    it('should keep auxiliary state consistent when a transition is blocked', () => {
      modeManager.setMode(DiagramMode.DEBUG);
      executionTracker.startSession();
      breakpointManager.addBreakpoint('node1', BreakpointType.BEFORE);

      modeManager.addModeGuard('lock', () => ({ allowed: false, reason: 'locked' }));
      modeManager.setMode(DiagramMode.DESIGNER);

      // Still in debug mode with all state intact
      expect(modeManager.getMode()).toBe(DiagramMode.DEBUG);
      expect(executionTracker.getCurrentSession()).not.toBeNull();
      expect(breakpointManager.getAllBreakpoints().length).toBe(1);
    });
  });
});

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
