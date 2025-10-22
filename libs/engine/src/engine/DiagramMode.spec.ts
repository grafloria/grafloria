// DiagramMode.spec.ts - TDD tests for Diagram Mode system (Phase 1.5)

// Mock nanoid and uuid to avoid ES module issues
jest.mock('nanoid', () => ({
  nanoid: () => 'test-id',
}));

jest.mock('uuid', () => ({
  v4: () => 'test-uuid',
}));

import { DiagramEngine } from './DiagramEngine';
import { DiagramMode } from './DiagramMode';

describe('Diagram Mode System (Phase 1.5)', () => {
  let engine: DiagramEngine;

  beforeEach(() => {
    engine = new DiagramEngine({});
    engine.initialize();
    engine.createDiagram('Test Diagram'); // Create diagram for tests that need it
  });

  afterEach(() => {
    engine.destroy();
  });

  describe('DiagramMode Enum', () => {
    it('should define designer mode', () => {
      expect(DiagramMode.DESIGNER).toBe('designer');
    });

    it('should define running mode', () => {
      expect(DiagramMode.RUNNING).toBe('running');
    });

    it('should define view mode', () => {
      expect(DiagramMode.VIEW).toBe('view');
    });

    it('should define debug mode', () => {
      expect(DiagramMode.DEBUG).toBe('debug');
    });

    it('should define presentation mode', () => {
      expect(DiagramMode.PRESENTATION).toBe('presentation');
    });
  });

  describe('Mode Management', () => {
    it('should default to designer mode', () => {
      expect(engine.getMode()).toBe(DiagramMode.DESIGNER);
    });

    it('should allow setting mode to running', () => {
      engine.setMode(DiagramMode.RUNNING);
      expect(engine.getMode()).toBe(DiagramMode.RUNNING);
    });

    it('should allow setting mode to view', () => {
      engine.setMode(DiagramMode.VIEW);
      expect(engine.getMode()).toBe(DiagramMode.VIEW);
    });

    it('should allow setting mode to debug', () => {
      engine.setMode(DiagramMode.DEBUG);
      expect(engine.getMode()).toBe(DiagramMode.DEBUG);
    });

    it('should allow setting mode to presentation', () => {
      engine.setMode(DiagramMode.PRESENTATION);
      expect(engine.getMode()).toBe(DiagramMode.PRESENTATION);
    });

    it('should throw error for invalid mode', () => {
      expect(() => {
        engine.setMode('invalid' as DiagramMode);
      }).toThrow('Invalid diagram mode');
    });

    it('should return to designer mode', () => {
      engine.setMode(DiagramMode.RUNNING);
      engine.setMode(DiagramMode.DESIGNER);
      expect(engine.getMode()).toBe(DiagramMode.DESIGNER);
    });
  });

  describe('Mode Change Events', () => {
    it('should emit mode-changed event when mode changes', () => {
      const listener = jest.fn();
      engine.on('mode-changed', listener);

      engine.setMode(DiagramMode.RUNNING);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith({
        previousMode: DiagramMode.DESIGNER,
        currentMode: DiagramMode.RUNNING,
      });
    });

    it('should not emit event when setting same mode', () => {
      const listener = jest.fn();
      engine.setMode(DiagramMode.DESIGNER);
      engine.on('mode-changed', listener);

      engine.setMode(DiagramMode.DESIGNER);

      expect(listener).not.toHaveBeenCalled();
    });

    it('should emit events for multiple mode changes', () => {
      const listener = jest.fn();
      engine.on('mode-changed', listener);

      engine.setMode(DiagramMode.RUNNING);
      engine.setMode(DiagramMode.VIEW);
      engine.setMode(DiagramMode.DESIGNER);

      expect(listener).toHaveBeenCalledTimes(3);
      expect(listener).toHaveBeenNthCalledWith(1, {
        previousMode: DiagramMode.DESIGNER,
        currentMode: DiagramMode.RUNNING,
      });
      expect(listener).toHaveBeenNthCalledWith(2, {
        previousMode: DiagramMode.RUNNING,
        currentMode: DiagramMode.VIEW,
      });
      expect(listener).toHaveBeenNthCalledWith(3, {
        previousMode: DiagramMode.VIEW,
        currentMode: DiagramMode.DESIGNER,
      });
    });

    it('should allow removing mode change listeners', () => {
      const listener = jest.fn();
      engine.on('mode-changed', listener);
      engine.off('mode-changed', listener);

      engine.setMode(DiagramMode.RUNNING);

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('Mode-Aware Behavior - Designer Mode', () => {
    beforeEach(() => {
      engine.setMode(DiagramMode.DESIGNER);
    });

    it('should allow nodes to be draggable', () => {
      const behavior = engine.getNodeBehaviorForMode({ draggable: true });
      expect(behavior.draggable).toBe(true);
    });

    it('should allow nodes to be deletable', () => {
      const behavior = engine.getNodeBehaviorForMode({ deletable: true });
      expect(behavior.deletable).toBe(true);
    });

    it('should allow nodes to be resizable', () => {
      const behavior = engine.getNodeBehaviorForMode({ resizable: true });
      expect(behavior.resizable).toBe(true);
    });

    it('should allow nodes to be editable', () => {
      const behavior = engine.getNodeBehaviorForMode({ editable: true });
      expect(behavior.editable).toBe(true);
    });

    it('should allow nodes to be connectable', () => {
      const behavior = engine.getNodeBehaviorForMode({ connectable: true });
      expect(behavior.connectable).toBe(true);
    });

    it('should respect node-specific behavior restrictions', () => {
      const behavior = engine.getNodeBehaviorForMode({ draggable: false, deletable: false });
      expect(behavior.draggable).toBe(false);
      expect(behavior.deletable).toBe(false);
    });
  });

  describe('Mode-Aware Behavior - Running Mode', () => {
    beforeEach(() => {
      engine.setMode(DiagramMode.RUNNING);
    });

    it('should prevent nodes from being draggable', () => {
      const behavior = engine.getNodeBehaviorForMode({ draggable: true });
      expect(behavior.draggable).toBe(false);
    });

    it('should prevent nodes from being deletable', () => {
      const behavior = engine.getNodeBehaviorForMode({ deletable: true });
      expect(behavior.deletable).toBe(false);
    });

    it('should prevent nodes from being resizable', () => {
      const behavior = engine.getNodeBehaviorForMode({ resizable: true });
      expect(behavior.resizable).toBe(false);
    });

    it('should prevent nodes from being editable', () => {
      const behavior = engine.getNodeBehaviorForMode({ editable: true });
      expect(behavior.editable).toBe(false);
    });

    it('should prevent nodes from being connectable', () => {
      const behavior = engine.getNodeBehaviorForMode({ connectable: true });
      expect(behavior.connectable).toBe(false);
    });

    it('should keep nodes selectable for highlighting execution flow', () => {
      const behavior = engine.getNodeBehaviorForMode({ selectable: true });
      expect(behavior.selectable).toBe(true);
    });
  });

  describe('Mode-Aware Behavior - View Mode', () => {
    beforeEach(() => {
      engine.setMode(DiagramMode.VIEW);
    });

    it('should prevent nodes from being draggable', () => {
      const behavior = engine.getNodeBehaviorForMode({ draggable: true });
      expect(behavior.draggable).toBe(false);
    });

    it('should prevent nodes from being deletable', () => {
      const behavior = engine.getNodeBehaviorForMode({ deletable: true });
      expect(behavior.deletable).toBe(false);
    });

    it('should prevent nodes from being resizable', () => {
      const behavior = engine.getNodeBehaviorForMode({ resizable: true });
      expect(behavior.resizable).toBe(false);
    });

    it('should prevent nodes from being editable', () => {
      const behavior = engine.getNodeBehaviorForMode({ editable: true });
      expect(behavior.editable).toBe(false);
    });

    it('should prevent nodes from being connectable', () => {
      const behavior = engine.getNodeBehaviorForMode({ connectable: true });
      expect(behavior.connectable).toBe(false);
    });

    it('should keep nodes selectable for inspection', () => {
      const behavior = engine.getNodeBehaviorForMode({ selectable: true });
      expect(behavior.selectable).toBe(true);
    });
  });

  describe('Mode-Aware Behavior - Debug Mode', () => {
    beforeEach(() => {
      engine.setMode(DiagramMode.DEBUG);
    });

    it('should prevent nodes from being draggable', () => {
      const behavior = engine.getNodeBehaviorForMode({ draggable: true });
      expect(behavior.draggable).toBe(false);
    });

    it('should prevent nodes from being deletable', () => {
      const behavior = engine.getNodeBehaviorForMode({ deletable: true });
      expect(behavior.deletable).toBe(false);
    });

    it('should prevent nodes from being editable', () => {
      const behavior = engine.getNodeBehaviorForMode({ editable: true });
      expect(behavior.editable).toBe(false);
    });

    it('should keep nodes selectable for debugging', () => {
      const behavior = engine.getNodeBehaviorForMode({ selectable: true });
      expect(behavior.selectable).toBe(true);
    });

    it('should allow breakpoint toggling on nodes', () => {
      // In debug mode, nodes should have special debug properties
      expect(engine.getMode()).toBe(DiagramMode.DEBUG);
    });
  });

  describe('Mode-Aware Behavior - Presentation Mode', () => {
    beforeEach(() => {
      engine.setMode(DiagramMode.PRESENTATION);
    });

    it('should prevent nodes from being draggable', () => {
      const behavior = engine.getNodeBehaviorForMode({ draggable: true });
      expect(behavior.draggable).toBe(false);
    });

    it('should prevent nodes from being deletable', () => {
      const behavior = engine.getNodeBehaviorForMode({ deletable: true });
      expect(behavior.deletable).toBe(false);
    });

    it('should prevent nodes from being resizable', () => {
      const behavior = engine.getNodeBehaviorForMode({ resizable: true });
      expect(behavior.resizable).toBe(false);
    });

    it('should prevent nodes from being editable', () => {
      const behavior = engine.getNodeBehaviorForMode({ editable: true });
      expect(behavior.editable).toBe(false);
    });

    it('should prevent nodes from being connectable', () => {
      const behavior = engine.getNodeBehaviorForMode({ connectable: true });
      expect(behavior.connectable).toBe(false);
    });

    it('should allow nodes to be selectable for navigation', () => {
      const behavior = engine.getNodeBehaviorForMode({ selectable: true });
      expect(behavior.selectable).toBe(true);
    });
  });

  describe('Mode Transition Validation', () => {
    it('should allow transition from designer to any mode', () => {
      engine.setMode(DiagramMode.DESIGNER);

      expect(() => engine.setMode(DiagramMode.RUNNING)).not.toThrow();
      engine.setMode(DiagramMode.DESIGNER);
      expect(() => engine.setMode(DiagramMode.VIEW)).not.toThrow();
      engine.setMode(DiagramMode.DESIGNER);
      expect(() => engine.setMode(DiagramMode.DEBUG)).not.toThrow();
      engine.setMode(DiagramMode.DESIGNER);
      expect(() => engine.setMode(DiagramMode.PRESENTATION)).not.toThrow();
    });

    it('should allow transition from running to debug', () => {
      engine.setMode(DiagramMode.RUNNING);
      expect(() => engine.setMode(DiagramMode.DEBUG)).not.toThrow();
    });

    it('should allow transition from any mode back to designer', () => {
      engine.setMode(DiagramMode.RUNNING);
      expect(() => engine.setMode(DiagramMode.DESIGNER)).not.toThrow();

      engine.setMode(DiagramMode.VIEW);
      expect(() => engine.setMode(DiagramMode.DESIGNER)).not.toThrow();

      engine.setMode(DiagramMode.DEBUG);
      expect(() => engine.setMode(DiagramMode.DESIGNER)).not.toThrow();

      engine.setMode(DiagramMode.PRESENTATION);
      expect(() => engine.setMode(DiagramMode.DESIGNER)).not.toThrow();
    });
  });

  describe('Mode Persistence', () => {
    it('should maintain mode across diagram operations', () => {
      engine.setMode(DiagramMode.VIEW);

      // Simulate some diagram operations
      engine.createDiagram('Test Diagram');
      engine.setViewport({ x: 0, y: 0, zoom: 1, rotation: 0 });

      expect(engine.getMode()).toBe(DiagramMode.VIEW);
    });

    it('should reset to designer mode on engine re-initialization', () => {
      engine.setMode(DiagramMode.RUNNING);
      engine.destroy();
      engine.initialize();

      expect(engine.getMode()).toBe(DiagramMode.DESIGNER);
    });
  });

  describe('Mode Query Helpers', () => {
    it('should provide isDesignerMode helper', () => {
      engine.setMode(DiagramMode.DESIGNER);
      expect(engine.isDesignerMode()).toBe(true);

      engine.setMode(DiagramMode.RUNNING);
      expect(engine.isDesignerMode()).toBe(false);
    });

    it('should provide isRunningMode helper', () => {
      engine.setMode(DiagramMode.RUNNING);
      expect(engine.isRunningMode()).toBe(true);

      engine.setMode(DiagramMode.DESIGNER);
      expect(engine.isRunningMode()).toBe(false);
    });

    it('should provide isViewMode helper', () => {
      engine.setMode(DiagramMode.VIEW);
      expect(engine.isViewMode()).toBe(true);

      engine.setMode(DiagramMode.DESIGNER);
      expect(engine.isViewMode()).toBe(false);
    });

    it('should provide isDebugMode helper', () => {
      engine.setMode(DiagramMode.DEBUG);
      expect(engine.isDebugMode()).toBe(true);

      engine.setMode(DiagramMode.DESIGNER);
      expect(engine.isDebugMode()).toBe(false);
    });

    it('should provide isPresentationMode helper', () => {
      engine.setMode(DiagramMode.PRESENTATION);
      expect(engine.isPresentationMode()).toBe(true);

      engine.setMode(DiagramMode.DESIGNER);
      expect(engine.isPresentationMode()).toBe(false);
    });

    it('should provide isReadOnlyMode helper', () => {
      // View, Debug, Presentation are all read-only modes
      engine.setMode(DiagramMode.VIEW);
      expect(engine.isReadOnlyMode()).toBe(true);

      engine.setMode(DiagramMode.DEBUG);
      expect(engine.isReadOnlyMode()).toBe(true);

      engine.setMode(DiagramMode.PRESENTATION);
      expect(engine.isReadOnlyMode()).toBe(true);

      engine.setMode(DiagramMode.RUNNING);
      expect(engine.isReadOnlyMode()).toBe(true);

      engine.setMode(DiagramMode.DESIGNER);
      expect(engine.isReadOnlyMode()).toBe(false);
    });
  });

  describe('Link Behavior in Different Modes', () => {
    it('should allow link creation in designer mode', () => {
      engine.setMode(DiagramMode.DESIGNER);
      const behavior = engine.getLinkBehaviorForMode({ deletable: true });
      expect(behavior.deletable).toBe(true);
    });

    it('should prevent link creation in running mode', () => {
      engine.setMode(DiagramMode.RUNNING);
      const behavior = engine.getLinkBehaviorForMode({ deletable: true });
      expect(behavior.deletable).toBe(false);
    });

    it('should prevent link creation in view mode', () => {
      engine.setMode(DiagramMode.VIEW);
      const behavior = engine.getLinkBehaviorForMode({ deletable: true });
      expect(behavior.deletable).toBe(false);
    });

    it('should keep links selectable in all modes', () => {
      const modes = [
        DiagramMode.DESIGNER,
        DiagramMode.RUNNING,
        DiagramMode.VIEW,
        DiagramMode.DEBUG,
        DiagramMode.PRESENTATION,
      ];

      modes.forEach((mode) => {
        engine.setMode(mode);
        const behavior = engine.getLinkBehaviorForMode({ selectable: true });
        expect(behavior.selectable).toBe(true);
      });
    });
  });

  describe('Configuration Options', () => {
    it('should accept mode in engine config', () => {
      const customEngine = new DiagramEngine({
        mode: DiagramMode.VIEW,
      });
      customEngine.initialize();

      expect(customEngine.getMode()).toBe(DiagramMode.VIEW);

      customEngine.destroy();
    });

    it('should default to designer if no mode specified in config', () => {
      const customEngine = new DiagramEngine({});
      customEngine.initialize();

      expect(customEngine.getMode()).toBe(DiagramMode.DESIGNER);

      customEngine.destroy();
    });
  });

  describe('Priority 1: Mode Persistence', () => {
    it('should serialize current mode with diagram', () => {
      engine.setMode(DiagramMode.RUNNING);

      const serialized = engine.serialize();

      expect(serialized).toBeDefined();
      expect(serialized!.mode).toBe(DiagramMode.RUNNING);
    });

    it('should restore mode when deserializing diagram', () => {
      // Create diagram in RUNNING mode
      engine.setMode(DiagramMode.RUNNING);
      const serialized = engine.serialize();

      // Create new engine and load diagram
      const newEngine = new DiagramEngine({});
      newEngine.initialize();
      newEngine.loadFromJSON(serialized!);

      expect(newEngine.getMode()).toBe(DiagramMode.RUNNING);

      newEngine.destroy();
    });

    it('should preserve mode across save/load cycle', () => {
      const modes = [
        DiagramMode.DESIGNER,
        DiagramMode.RUNNING,
        DiagramMode.VIEW,
        DiagramMode.DEBUG,
        DiagramMode.PRESENTATION,
      ];

      modes.forEach((mode) => {
        engine.setMode(mode);
        const serialized = engine.serialize();

        const newEngine = new DiagramEngine({});
        newEngine.initialize();
        newEngine.loadFromJSON(serialized!);

        expect(newEngine.getMode()).toBe(mode);
        newEngine.destroy();
      });
    });

    it('should default to DESIGNER if mode not in serialized data', () => {
      const serialized = engine.serialize();
      delete serialized!.mode; // Remove mode field

      const newEngine = new DiagramEngine({});
      newEngine.initialize();
      newEngine.loadFromJSON(serialized!);

      expect(newEngine.getMode()).toBe(DiagramMode.DESIGNER);
      newEngine.destroy();
    });

    it('should validate mode from serialized data', () => {
      const serialized = engine.serialize();
      (serialized as any).mode = 'invalid-mode';

      const newEngine = new DiagramEngine({});
      newEngine.initialize();

      // Should fall back to DESIGNER for invalid mode
      newEngine.loadFromJSON(serialized!);
      expect(newEngine.getMode()).toBe(DiagramMode.DESIGNER);

      newEngine.destroy();
    });
  });

  describe('Priority 2a: Mode Transition Guards', () => {
    it('should allow registering mode transition guard', () => {
      const guard = jest.fn(() => ({ allowed: true }));

      engine.addModeGuard('test-guard', guard);
      engine.setMode(DiagramMode.RUNNING);

      expect(guard).toHaveBeenCalledWith(DiagramMode.DESIGNER, DiagramMode.RUNNING);
    });

    it('should prevent mode change when guard returns false', () => {
      engine.addModeGuard('block-running', (prev, next) => {
        if (next === DiagramMode.RUNNING) {
          return { allowed: false, reason: 'Running mode disabled' };
        }
        return { allowed: true };
      });

      engine.setMode(DiagramMode.RUNNING);

      // Mode should not change
      expect(engine.getMode()).toBe(DiagramMode.DESIGNER);
    });

    it('should emit guard-blocked event when transition prevented', () => {
      const listener = jest.fn();
      engine.on('mode-guard-blocked', listener);

      engine.addModeGuard('block-debug', (prev, next) => {
        if (next === DiagramMode.DEBUG) {
          return { allowed: false, reason: 'Debug disabled' };
        }
        return { allowed: true };
      });

      engine.setMode(DiagramMode.DEBUG);

      expect(listener).toHaveBeenCalledWith({
        previousMode: DiagramMode.DESIGNER,
        requestedMode: DiagramMode.DEBUG,
        guard: 'block-debug',
        reason: 'Debug disabled',
      });
    });

    it('should allow mode change when all guards pass', () => {
      engine.addModeGuard('guard1', () => ({ allowed: true }));
      engine.addModeGuard('guard2', () => ({ allowed: true }));
      engine.addModeGuard('guard3', () => ({ allowed: true }));

      engine.setMode(DiagramMode.RUNNING);

      expect(engine.getMode()).toBe(DiagramMode.RUNNING);
    });

    it('should stop at first failing guard', () => {
      const guard1 = jest.fn(() => ({ allowed: true }));
      const guard2 = jest.fn(() => ({ allowed: false, reason: 'Blocked' }));
      const guard3 = jest.fn(() => ({ allowed: true }));

      engine.addModeGuard('guard1', guard1);
      engine.addModeGuard('guard2', guard2);
      engine.addModeGuard('guard3', guard3);

      engine.setMode(DiagramMode.RUNNING);

      expect(guard1).toHaveBeenCalled();
      expect(guard2).toHaveBeenCalled();
      expect(guard3).not.toHaveBeenCalled(); // Should not call after failure
      expect(engine.getMode()).toBe(DiagramMode.DESIGNER);
    });

    it('should allow removing mode guard', () => {
      const guard = jest.fn(() => ({ allowed: false }));

      engine.addModeGuard('removable', guard);
      engine.removeModeGuard('removable');

      engine.setMode(DiagramMode.RUNNING);

      expect(guard).not.toHaveBeenCalled();
      expect(engine.getMode()).toBe(DiagramMode.RUNNING);
    });

    it('should clear all mode guards', () => {
      engine.addModeGuard('guard1', () => ({ allowed: false }));
      engine.addModeGuard('guard2', () => ({ allowed: false }));

      engine.clearModeGuards();
      engine.setMode(DiagramMode.RUNNING);

      expect(engine.getMode()).toBe(DiagramMode.RUNNING);
    });
  });

  describe('Priority 2b: Per-Entity Behavior Overrides', () => {
    it('should allow node to override behavior for specific mode', async () => {
      const node = await engine.addNode({ type: 'test', position: { x: 0, y: 0 } });

      // Override: allow dragging in RUNNING mode
      node.setBehaviorOverride(DiagramMode.RUNNING, { draggable: true });

      engine.setMode(DiagramMode.RUNNING);
      const behavior = engine.getNodeBehaviorForMode(node.behavior, node);

      // Should use override
      expect(behavior.draggable).toBe(true);
    });

    it('should respect base behavior when no override exists', async () => {
      const node = await engine.addNode({ type: 'test', position: { x: 0, y: 0 } });

      engine.setMode(DiagramMode.RUNNING);
      const behavior = engine.getNodeBehaviorForMode(node.behavior, node);

      // Should use default mode behavior (not draggable in RUNNING)
      expect(behavior.draggable).toBe(false);
    });

    it('should allow multiple overrides for different modes', async () => {
      const node = await engine.addNode({ type: 'test', position: { x: 0, y: 0 } });

      node.setBehaviorOverride(DiagramMode.RUNNING, { draggable: true });
      node.setBehaviorOverride(DiagramMode.VIEW, { selectable: false });

      engine.setMode(DiagramMode.RUNNING);
      let behavior = engine.getNodeBehaviorForMode(node.behavior, node);
      expect(behavior.draggable).toBe(true);

      engine.setMode(DiagramMode.VIEW);
      behavior = engine.getNodeBehaviorForMode(node.behavior, node);
      expect(behavior.selectable).toBe(false);
    });

    it('should allow removing behavior override', async () => {
      const node = await engine.addNode({ type: 'test', position: { x: 0, y: 0 } });

      node.setBehaviorOverride(DiagramMode.RUNNING, { draggable: true });
      node.clearBehaviorOverride(DiagramMode.RUNNING);

      engine.setMode(DiagramMode.RUNNING);
      const behavior = engine.getNodeBehaviorForMode(node.behavior, node);

      expect(behavior.draggable).toBe(false); // Back to default
    });

    it('should serialize behavior overrides', async () => {
      const node = await engine.addNode({ type: 'test', position: { x: 0, y: 0 } });
      node.setBehaviorOverride(DiagramMode.RUNNING, { draggable: true });

      const serialized = node.serialize();

      expect(serialized.behaviorOverrides).toBeDefined();
      expect(serialized.behaviorOverrides![DiagramMode.RUNNING]).toEqual({ draggable: true });
    });

    it('should restore behavior overrides from serialization', async () => {
      const node = await engine.addNode({ type: 'test', position: { x: 0, y: 0 } });
      node.setBehaviorOverride(DiagramMode.RUNNING, { draggable: true });

      const serialized = node.serialize();

      // Deserialize using NodeModel.fromJSON
      const { NodeModel } = await import('../models/NodeModel');
      const restored = NodeModel.fromJSON(serialized);

      engine.setMode(DiagramMode.RUNNING);
      const behavior = engine.getNodeBehaviorForMode(restored.behavior, restored);

      expect(behavior.draggable).toBe(true);
    });
  });

  describe('Priority 3a: Mode-Specific Viewport Settings', () => {
    it('should allow configuring viewport settings per mode', () => {
      engine.configureModeViewport(DiagramMode.PRESENTATION, {
        allowZoom: false,
        allowPan: false,
        minZoom: 1.0,
        maxZoom: 1.0,
      });

      const settings = engine.getModeViewportSettings(DiagramMode.PRESENTATION);

      expect(settings.allowZoom).toBe(false);
      expect(settings.allowPan).toBe(false);
      expect(settings.minZoom).toBe(1.0);
      expect(settings.maxZoom).toBe(1.0);
    });

    it('should return default settings when none configured', () => {
      const settings = engine.getModeViewportSettings(DiagramMode.DESIGNER);

      expect(settings.allowZoom).toBe(true);
      expect(settings.allowPan).toBe(true);
      expect(settings.minZoom).toBeUndefined();
      expect(settings.maxZoom).toBeUndefined();
    });

    it('should apply viewport settings when mode changes', () => {
      const listener = jest.fn();
      engine.on('viewport-settings-changed', listener);

      engine.configureModeViewport(DiagramMode.PRESENTATION, {
        allowZoom: false,
        fitToScreen: true,
      });

      engine.setMode(DiagramMode.PRESENTATION);

      expect(listener).toHaveBeenCalledWith({
        mode: DiagramMode.PRESENTATION,
        settings: expect.objectContaining({
          allowZoom: false,
          fitToScreen: true,
        }),
      });
    });

    it('should support centerOnLoad setting', () => {
      engine.configureModeViewport(DiagramMode.VIEW, {
        centerOnLoad: true,
        fitToScreen: true,
      });

      engine.setMode(DiagramMode.VIEW);
      const settings = engine.getModeViewportSettings(DiagramMode.VIEW);

      expect(settings.centerOnLoad).toBe(true);
      expect(settings.fitToScreen).toBe(true);
    });

    it('should support followNode setting for auto-centering', async () => {
      const node = await engine.addNode({ type: 'test', position: { x: 100, y: 100 } });

      engine.configureModeViewport(DiagramMode.RUNNING, {
        followNode: node.id,
        autoCenter: true,
      });

      const settings = engine.getModeViewportSettings(DiagramMode.RUNNING);

      expect(settings.followNode).toBe(node.id);
      expect(settings.autoCenter).toBe(true);
    });
  });

  describe('Priority 3b: Mode History/Stack', () => {
    it('should track mode changes in history', () => {
      engine.setMode(DiagramMode.RUNNING);
      engine.setMode(DiagramMode.DEBUG);
      engine.setMode(DiagramMode.VIEW);

      const history = engine.getModeHistory();

      expect(history.length).toBe(4); // DESIGNER + 3 changes
      expect(history[0].mode).toBe(DiagramMode.DESIGNER);
      expect(history[1].mode).toBe(DiagramMode.RUNNING);
      expect(history[2].mode).toBe(DiagramMode.DEBUG);
      expect(history[3].mode).toBe(DiagramMode.VIEW);
    });

    it('should include timestamp in mode history', () => {
      const before = Date.now();
      engine.setMode(DiagramMode.RUNNING);
      const after = Date.now();

      const history = engine.getModeHistory();
      const entry = history[history.length - 1];

      expect(entry.timestamp).toBeGreaterThanOrEqual(before);
      expect(entry.timestamp).toBeLessThanOrEqual(after);
    });

    it('should track duration in mode history', () => {
      jest.useFakeTimers();

      engine.setMode(DiagramMode.RUNNING);
      jest.advanceTimersByTime(5000);
      engine.setMode(DiagramMode.DEBUG);

      const history = engine.getModeHistory();
      const runningEntry = history.find(h => h.mode === DiagramMode.RUNNING);

      expect(runningEntry!.duration).toBe(5000);

      jest.useRealTimers();
    });

    it('should support previousMode navigation', () => {
      engine.setMode(DiagramMode.RUNNING);
      engine.setMode(DiagramMode.DEBUG);

      engine.previousMode();

      expect(engine.getMode()).toBe(DiagramMode.RUNNING);
    });

    it('should support nextMode navigation', () => {
      engine.setMode(DiagramMode.RUNNING);
      engine.setMode(DiagramMode.DEBUG);
      engine.previousMode(); // Back to RUNNING

      engine.nextMode(); // Forward to DEBUG

      expect(engine.getMode()).toBe(DiagramMode.DEBUG);
    });

    it('should support push/pop mode stack', () => {
      engine.setMode(DiagramMode.RUNNING);

      engine.pushMode(DiagramMode.DEBUG); // Push DEBUG, save RUNNING
      expect(engine.getMode()).toBe(DiagramMode.DEBUG);

      engine.popMode(); // Pop back to RUNNING
      expect(engine.getMode()).toBe(DiagramMode.RUNNING);
    });

    it('should handle multiple push/pop operations', () => {
      engine.pushMode(DiagramMode.RUNNING);
      engine.pushMode(DiagramMode.DEBUG);
      engine.pushMode(DiagramMode.VIEW);

      expect(engine.getMode()).toBe(DiagramMode.VIEW);

      engine.popMode(); // Back to DEBUG
      expect(engine.getMode()).toBe(DiagramMode.DEBUG);

      engine.popMode(); // Back to RUNNING
      expect(engine.getMode()).toBe(DiagramMode.RUNNING);

      engine.popMode(); // Back to DESIGNER
      expect(engine.getMode()).toBe(DiagramMode.DESIGNER);
    });

    it('should provide mode analytics', () => {
      jest.useFakeTimers();

      engine.setMode(DiagramMode.RUNNING);
      jest.advanceTimersByTime(1000);
      engine.setMode(DiagramMode.DESIGNER);
      jest.advanceTimersByTime(2000);
      engine.setMode(DiagramMode.RUNNING);
      jest.advanceTimersByTime(3000);
      engine.setMode(DiagramMode.DESIGNER);

      const analytics = engine.getModeAnalytics();

      expect(analytics[DiagramMode.RUNNING].count).toBe(2);
      expect(analytics[DiagramMode.RUNNING].totalTime).toBe(4000);
      expect(analytics[DiagramMode.RUNNING].avgTime).toBe(2000);

      jest.useRealTimers();
    });

    it('should clear mode history', () => {
      engine.setMode(DiagramMode.RUNNING);
      engine.setMode(DiagramMode.DEBUG);

      engine.clearModeHistory();

      const history = engine.getModeHistory();
      expect(history.length).toBe(1); // Only current mode
      expect(history[0].mode).toBe(DiagramMode.DEBUG);
    });
  });

  describe('Priority 3c: Before/After Mode Change Hooks', () => {
    it('should call beforeModeChange hook', () => {
      const hook = jest.fn();
      engine.beforeModeChange(hook);

      engine.setMode(DiagramMode.RUNNING);

      expect(hook).toHaveBeenCalledWith(
        DiagramMode.DESIGNER,
        DiagramMode.RUNNING,
        expect.objectContaining({ engine, diagram: expect.anything() })
      );
    });

    it('should call afterModeChange hook', () => {
      const hook = jest.fn();
      engine.afterModeChange(hook);

      engine.setMode(DiagramMode.RUNNING);

      expect(hook).toHaveBeenCalledWith(
        DiagramMode.DESIGNER,
        DiagramMode.RUNNING,
        expect.objectContaining({ engine, diagram: expect.anything() })
      );
    });

    it('should call hooks in correct order', () => {
      const callOrder: string[] = [];

      engine.beforeModeChange(() => {
        callOrder.push('before');
      });
      engine.on('mode-changed', () => {
        callOrder.push('event');
      });
      engine.afterModeChange(() => {
        callOrder.push('after');
      });

      engine.setMode(DiagramMode.RUNNING);

      expect(callOrder).toEqual(['before', 'event', 'after']);
    });

    it('should allow preventing mode change in beforeModeChange', () => {
      engine.beforeModeChange((prev, next) => {
        if (next === DiagramMode.DEBUG) {
          return false; // Prevent change
        }
        return undefined; // Allow change
      });

      engine.setMode(DiagramMode.DEBUG);

      expect(engine.getMode()).toBe(DiagramMode.DESIGNER);
    });

    it('should support multiple before hooks', () => {
      const hook1 = jest.fn();
      const hook2 = jest.fn();

      engine.beforeModeChange(hook1);
      engine.beforeModeChange(hook2);

      engine.setMode(DiagramMode.RUNNING);

      expect(hook1).toHaveBeenCalled();
      expect(hook2).toHaveBeenCalled();
    });

    it('should support removing hooks', () => {
      const hook = jest.fn();
      const unsubscribe = engine.beforeModeChange(hook);

      unsubscribe(); // Remove hook

      engine.setMode(DiagramMode.RUNNING);

      expect(hook).not.toHaveBeenCalled();
    });

    it('should pass context to hooks for plugins', () => {
      engine.beforeModeChange((prev, next, context) => {
        expect(context).toBeDefined();
        expect(context!.engine).toBe(engine);
        expect(context!.diagram).toBe(engine.getDiagram());
      });

      engine.setMode(DiagramMode.RUNNING);
    });
  });
});
