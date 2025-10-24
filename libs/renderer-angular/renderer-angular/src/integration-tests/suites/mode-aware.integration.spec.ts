import { TestBed } from '@angular/core/testing';
import { ModeManagerService, type ModeChangeEvent } from '../../lib/services/mode-manager.service';
import { SimulationEngineService } from '../../lib/services/simulation-engine.service';
import { ExecutionTrackerService } from '../../lib/services/execution-tracker.service';
import { BreakpointManagerService } from '../../lib/services/breakpoint-manager.service';
import { DiagramMode } from '@grafloria/engine';
import { take } from 'rxjs/operators';

/**
 * Mode-Aware Integration Tests
 *
 * Tests mode transitions and mode-specific behavior:
 * - Mode switching (Design ↔ Debug ↔ Simulation)
 * - Mode guards and validation
 * - Mode-specific features
 * - State preservation across modes
 * - Mode analytics and history
 */

describe('Mode-Aware Integration Tests', () => {
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
  });

  afterEach(() => {
    modeManager.reset();
    simulationEngine.reset();
    executionTracker.reset();
    breakpointManager.clearAll();
  });

  describe('Scenario 1: Basic Mode Transitions', () => {
    it('should transition between modes', async () => {
      expect(modeManager.getCurrentMode()).toBe(DiagramMode.DESIGN);

      // Transition to DEBUG
      modeManager.setMode(DiagramMode.DEBUG);
      expect(modeManager.getCurrentMode()).toBe(DiagramMode.DEBUG);

      // Transition to SIMULATION
      modeManager.setMode(DiagramMode.SIMULATION);
      expect(modeManager.getCurrentMode()).toBe(DiagramMode.SIMULATION);

      // Back to DESIGN
      modeManager.setMode(DiagramMode.DESIGN);
      expect(modeManager.getCurrentMode()).toBe(DiagramMode.DESIGN);
    });

    it('should emit mode change events', async () => {
      const events: ModeChangeEvent[] = [];

      modeManager.modeChanged$.subscribe(event => {
        if (event) events.push(event);
      });

      modeManager.setMode(DiagramMode.DEBUG);
      modeManager.setMode(DiagramMode.SIMULATION);

      expect(events.length).toBe(2);
      expect(events[0].previousMode).toBe(DiagramMode.DESIGN);
      expect(events[0].currentMode).toBe(DiagramMode.DEBUG);
      expect(events[1].previousMode).toBe(DiagramMode.DEBUG);
      expect(events[1].currentMode).toBe(DiagramMode.SIMULATION);
    });

    it('should track mode history', () => {
      modeManager.setMode(DiagramMode.DEBUG);
      modeManager.setMode(DiagramMode.SIMULATION);
      modeManager.setMode(DiagramMode.DESIGN);

      const history = modeManager.getHistory();
      expect(history.length).toBeGreaterThanOrEqual(3);
      expect(history.map(h => h.mode)).toContain(DiagramMode.DEBUG);
      expect(history.map(h => h.mode)).toContain(DiagramMode.SIMULATION);
    });
  });

  describe('Scenario 2: Mode Guards and Validation', () => {
    it('should enforce mode transition guards', () => {
      // Add guard that prevents switching to DEBUG
      modeManager.addGuard((prev, next) => {
        if (next === DiagramMode.DEBUG) {
          return { allowed: false, reason: 'Debug mode disabled' };
        }
        return { allowed: true };
      });

      const result = modeManager.canTransition(DiagramMode.DESIGN, DiagramMode.DEBUG);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Debug mode disabled');
    });

    it('should allow mode transition when guards pass', () => {
      modeManager.addGuard((prev, next) => {
        // Allow all transitions
        return { allowed: true };
      });

      const result = modeManager.canTransition(DiagramMode.DESIGN, DiagramMode.DEBUG);
      expect(result.allowed).toBe(true);
    });

    it('should support conditional guards', () => {
      let allowDebug = false;

      modeManager.addGuard((prev, next) => {
        if (next === DiagramMode.DEBUG && !allowDebug) {
          return { allowed: false, reason: 'Debug not ready' };
        }
        return { allowed: true };
      });

      // Initially blocked
      expect(modeManager.canTransition(DiagramMode.DESIGN, DiagramMode.DEBUG).allowed).toBe(false);

      // Enable debug
      allowDebug = true;
      expect(modeManager.canTransition(DiagramMode.DESIGN, DiagramMode.DEBUG).allowed).toBe(true);
    });
  });

  describe('Scenario 3: Mode-Specific Features', () => {
    it('should enable debug features in DEBUG mode', () => {
      modeManager.setMode(DiagramMode.DEBUG);

      // Debug features should be available
      expect(modeManager.isDebugMode()).toBe(true);
      expect(executionTracker.isEnabled()).toBe(false); // Not tracking yet

      // Start tracking
      executionTracker.startTracking();
      expect(executionTracker.isEnabled()).toBe(true);
    });

    it('should enable simulation in SIMULATION mode', () => {
      modeManager.setMode(DiagramMode.SIMULATION);

      expect(modeManager.isSimulationMode()).toBe(true);
      expect(simulationEngine.isRunning()).toBe(false);

      // Can start simulation
      simulationEngine.start();
      expect(simulationEngine.isRunning()).toBe(true);
    });

    it('should disable mode-specific features when leaving mode', () => {
      // Start in debug mode
      modeManager.setMode(DiagramMode.DEBUG);
      executionTracker.startTracking();
      expect(executionTracker.isEnabled()).toBe(true);

      // Switch to design mode
      modeManager.setMode(DiagramMode.DESIGN);

      // Tracking should be stopped
      expect(executionTracker.isEnabled()).toBe(false);
    });
  });

  describe('Scenario 4: State Preservation Across Modes', () => {
    it('should preserve breakpoints across mode changes', () => {
      // Set breakpoints in design mode
      breakpointManager.addBreakpoint('node1');
      breakpointManager.addBreakpoint('node2');
      expect(breakpointManager.getAllBreakpoints().length).toBe(2);

      // Switch to debug mode
      modeManager.setMode(DiagramMode.DEBUG);
      expect(breakpointManager.getAllBreakpoints().length).toBe(2);

      // Back to design
      modeManager.setMode(DiagramMode.DESIGN);
      expect(breakpointManager.getAllBreakpoints().length).toBe(2);
    });

    it('should preserve simulation state when pausing', () => {
      modeManager.setMode(DiagramMode.SIMULATION);
      simulationEngine.start();

      // Simulate some progress
      simulationEngine.setCurrentStep(10);
      expect(simulationEngine.getCurrentStep()).toBe(10);

      // Pause
      simulationEngine.pause();
      expect(simulationEngine.isPaused()).toBe(true);
      expect(simulationEngine.getCurrentStep()).toBe(10);

      // Resume
      simulationEngine.resume();
      expect(simulationEngine.isPaused()).toBe(false);
      expect(simulationEngine.getCurrentStep()).toBe(10);
    });

    it('should clear execution state when returning to design', () => {
      modeManager.setMode(DiagramMode.DEBUG);
      executionTracker.startTracking();
      executionTracker.recordNodeExecution('node1', { duration: 100 });

      expect(executionTracker.getExecutionCount('node1')).toBe(1);

      // Return to design
      modeManager.setMode(DiagramMode.DESIGN);

      // Execution data should be cleared
      expect(executionTracker.getExecutionCount('node1')).toBe(0);
    });
  });

  describe('Scenario 5: Mode Analytics', () => {
    it('should track time spent in each mode', async () => {
      // Spend time in different modes
      modeManager.setMode(DiagramMode.DEBUG);
      await delay(50);

      modeManager.setMode(DiagramMode.SIMULATION);
      await delay(50);

      modeManager.setMode(DiagramMode.DESIGN);

      const analytics = modeManager.getAnalytics();
      expect(analytics[DiagramMode.DEBUG].count).toBeGreaterThan(0);
      expect(analytics[DiagramMode.SIMULATION].count).toBeGreaterThan(0);
      expect(analytics[DiagramMode.DEBUG].totalTime).toBeGreaterThan(0);
    });

    it('should calculate average time per mode', async () => {
      // Enter and exit DEBUG mode multiple times
      for (let i = 0; i < 3; i++) {
        modeManager.setMode(DiagramMode.DEBUG);
        await delay(20);
        modeManager.setMode(DiagramMode.DESIGN);
        await delay(10);
      }

      const analytics = modeManager.getAnalytics();
      expect(analytics[DiagramMode.DEBUG].count).toBe(3);
      expect(analytics[DiagramMode.DEBUG].avgTime).toBeGreaterThan(0);
    });
  });

  describe('Scenario 6: Mode Transition Hooks', () => {
    it('should execute hooks on mode change', () => {
      const hookCalls: string[] = [];

      modeManager.addHook((prev, next) => {
        hookCalls.push(`${prev} -> ${next}`);
      });

      modeManager.setMode(DiagramMode.DEBUG);
      modeManager.setMode(DiagramMode.SIMULATION);

      expect(hookCalls.length).toBe(2);
      expect(hookCalls[0]).toBe(`${DiagramMode.DESIGN} -> ${DiagramMode.DEBUG}`);
      expect(hookCalls[1]).toBe(`${DiagramMode.DEBUG} -> ${DiagramMode.SIMULATION}`);
    });

    it('should allow hooks to prevent mode change', () => {
      modeManager.addHook((prev, next) => {
        if (next === DiagramMode.SIMULATION) {
          return false; // Block transition
        }
      });

      const result = modeManager.setMode(DiagramMode.SIMULATION);
      expect(result).toBe(false);
      expect(modeManager.getCurrentMode()).toBe(DiagramMode.DESIGN);
    });
  });

  describe('Scenario 7: Complex Mode Workflows', () => {
    it('should handle debug-simulate-design workflow', async () => {
      // 1. Design mode - setup
      expect(modeManager.isDesignMode()).toBe(true);
      breakpointManager.addBreakpoint('node1');

      // 2. Debug mode - test
      modeManager.setMode(DiagramMode.DEBUG);
      executionTracker.startTracking();
      executionTracker.recordNodeExecution('node1', { duration: 100 });
      expect(executionTracker.getExecutionCount('node1')).toBe(1);

      // 3. Simulation mode - run
      executionTracker.stopTracking();
      modeManager.setMode(DiagramMode.SIMULATION);
      simulationEngine.start();
      expect(simulationEngine.isRunning()).toBe(true);

      // 4. Back to design
      simulationEngine.stop();
      modeManager.setMode(DiagramMode.DESIGN);
      expect(modeManager.isDesignMode()).toBe(true);
    });

    it('should handle rapid mode switching', async () => {
      const modes = [
        DiagramMode.DEBUG,
        DiagramMode.SIMULATION,
        DiagramMode.DESIGN,
        DiagramMode.DEBUG,
        DiagramMode.DESIGN,
      ];

      for (const mode of modes) {
        modeManager.setMode(mode);
        await delay(10);
      }

      expect(modeManager.getCurrentMode()).toBe(DiagramMode.DESIGN);
      expect(modeManager.getHistory().length).toBeGreaterThanOrEqual(modes.length);
    });
  });

  describe('Scenario 8: Error Recovery in Mode Transitions', () => {
    it('should recover from failed transitions', () => {
      const originalMode = modeManager.getCurrentMode();

      // Add failing guard
      modeManager.addGuard(() => ({
        allowed: false,
        reason: 'Test failure',
      }));

      const result = modeManager.setMode(DiagramMode.DEBUG);
      expect(result).toBe(false);
      expect(modeManager.getCurrentMode()).toBe(originalMode);
    });

    it('should handle cleanup on mode exit', () => {
      modeManager.setMode(DiagramMode.DEBUG);
      executionTracker.startTracking();
      breakpointManager.addBreakpoint('node1');

      expect(executionTracker.isEnabled()).toBe(true);
      expect(breakpointManager.getAllBreakpoints().length).toBe(1);

      // Switch mode - should cleanup
      modeManager.setMode(DiagramMode.DESIGN);

      expect(executionTracker.isEnabled()).toBe(false);
    });
  });
});

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
