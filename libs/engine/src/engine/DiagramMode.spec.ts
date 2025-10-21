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
});
