// DiagramStore tests - TDD approach

import { DiagramStore, DiagramState } from './DiagramStore';

describe('DiagramStore', () => {
  let store: DiagramStore;

  beforeEach(() => {
    store = new DiagramStore();
  });

  describe('Initialization', () => {
    it('should create store with default state', () => {
      const state = store.getState();

      expect(state.diagram).toBeNull();
      expect(state.selectedNodes).toBeInstanceOf(Set);
      expect(state.selectedNodes.size).toBe(0);
      expect(state.selectedLinks).toBeInstanceOf(Set);
      expect(state.selectedLinks.size).toBe(0);
      expect(state.mode).toBe('design');
      expect(state.theme).toBe('light');
      expect(state.gridEnabled).toBe(true);
      expect(state.snapEnabled).toBe(true);
      expect(state.locked).toBe(false);
    });

    it('should create store with partial initial state', () => {
      const customStore = new DiagramStore({
        mode: 'readonly',
        theme: 'dark',
        gridEnabled: false,
      });

      const state = customStore.getState();

      expect(state.mode).toBe('readonly');
      expect(state.theme).toBe('dark');
      expect(state.gridEnabled).toBe(false);
      expect(state.snapEnabled).toBe(true); // Default
    });

    it('should return frozen (immutable) state', () => {
      const state = store.getState();

      expect(Object.isFrozen(state)).toBe(true);
      expect(() => {
        (state as any).mode = 'runtime';
      }).toThrow();
    });
  });

  describe('State Updates', () => {
    it('should update state using setState', () => {
      store.setState((state) => {
        state.mode = 'runtime';
        state.locked = true;
      });

      const state = store.getState();
      expect(state.mode).toBe('runtime');
      expect(state.locked).toBe(true);
    });

    it('should update nested state using set path', () => {
      store.set('viewport.x', 100);
      store.set('viewport.y', 200);

      const state = store.getState();
      expect(state.viewport.x).toBe(100);
      expect(state.viewport.y).toBe(200);
    });

    it('should create nested paths if they do not exist', () => {
      store.set('toolOptions.color', 'red');
      store.set('toolOptions.size', 10);

      const state = store.getState();
      expect(state.toolOptions['color']).toBe('red');
      expect(state.toolOptions['size']).toBe(10);
    });

    it('should not trigger listeners if state does not change', () => {
      const listener = jest.fn();
      store.subscribe(listener);

      const currentMode = store.select<string>('mode');
      store.set('mode', currentMode); // Same value

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('State Selection', () => {
    beforeEach(() => {
      store.setState((state) => {
        state.mode = 'design';
        state.viewport.x = 150;
        state.viewport.zoom = 1.5;
      });
    });

    it('should select state by path', () => {
      expect(store.select<string>('mode')).toBe('design');
      expect(store.select<number>('viewport.x')).toBe(150);
      expect(store.select<number>('viewport.zoom')).toBe(1.5);
    });

    it('should return undefined for non-existent paths', () => {
      expect(store.select<any>('nonexistent')).toBeUndefined();
      expect(store.select<any>('viewport.nonexistent')).toBeUndefined();
    });

    it('should select complex nested values', () => {
      store.set('toolOptions.brush.size', 20);
      store.set('toolOptions.brush.color', 'blue');

      expect(store.select<number>('toolOptions.brush.size')).toBe(20);
      expect(store.select<string>('toolOptions.brush.color')).toBe('blue');
    });
  });

  describe('Global Subscriptions', () => {
    it('should notify global listeners on state change', () => {
      const listener = jest.fn();
      store.subscribe(listener);

      store.set('mode', 'runtime');

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ mode: 'runtime' }),
        expect.arrayContaining(['mode'])
      );
    });

    it('should return unsubscribe function', () => {
      const listener = jest.fn();
      const unsubscribe = store.subscribe(listener);

      store.set('mode', 'runtime');
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();

      store.set('mode', 'design');
      expect(listener).toHaveBeenCalledTimes(1); // Not called again
    });

    it('should notify multiple global listeners', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      store.subscribe(listener1);
      store.subscribe(listener2);

      store.set('theme', 'dark');

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
    });

    it('should include all changed paths in notification', () => {
      const listener = jest.fn();
      store.subscribe(listener);

      store.setState((state) => {
        state.mode = 'runtime';
        state.locked = true;
        state.theme = 'dark';
      });

      expect(listener).toHaveBeenCalledTimes(1);
      const changes = listener.mock.calls[0][1];
      expect(changes).toContain('mode');
      expect(changes).toContain('locked');
      expect(changes).toContain('theme');
    });
  });

  describe('Path-specific Subscriptions', () => {
    it('should notify path listeners on specific path change', () => {
      const listener = jest.fn();
      store.watch('mode', listener);

      store.set('mode', 'runtime');

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith('runtime', undefined);
    });

    it('should not notify path listeners when other paths change', () => {
      const modeListener = jest.fn();
      store.watch('mode', modeListener);

      store.set('theme', 'dark'); // Different path

      expect(modeListener).not.toHaveBeenCalled();
    });

    it('should return unsubscribe function for path watchers', () => {
      const listener = jest.fn();
      const unwatch = store.watch('mode', listener);

      store.set('mode', 'runtime');
      expect(listener).toHaveBeenCalledTimes(1);

      unwatch();

      store.set('mode', 'design');
      expect(listener).toHaveBeenCalledTimes(1); // Not called again
    });

    it('should notify nested path listeners', () => {
      const viewportListener = jest.fn();
      const xListener = jest.fn();

      store.watch('viewport', viewportListener);
      store.watch('viewport.x', xListener);

      store.set('viewport.x', 100);

      // Both should be notified
      expect(viewportListener).toHaveBeenCalled();
      expect(xListener).toHaveBeenCalled();
    });

    it('should handle multiple listeners on same path', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      store.watch('mode', listener1);
      store.watch('mode', listener2);

      store.set('mode', 'runtime');

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
    });
  });

  describe('Batch Updates', () => {
    it('should batch multiple updates into single notification', () => {
      const listener = jest.fn();
      store.subscribe(listener);

      store.batch(() => {
        store.set('mode', 'runtime');
        store.set('theme', 'dark');
        store.set('locked', true);
      });

      expect(listener).toHaveBeenCalledTimes(1); // Only once
    });

    it('should not notify if batch has no changes', () => {
      const listener = jest.fn();
      store.subscribe(listener);

      store.batch(() => {
        // No changes
      });

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('Computed Values', () => {
    it('should compute and cache values', () => {
      const computeFn = jest.fn((state: DiagramState) => {
        return state.viewport.x + state.viewport.y;
      });

      store.set('viewport.x', 100);
      store.set('viewport.y', 200);

      const result1 = store.computed('total', computeFn);
      expect(result1).toBe(300);
      expect(computeFn).toHaveBeenCalledTimes(1);

      // Second call should use cache
      const result2 = store.computed('total', computeFn);
      expect(result2).toBe(300);
      expect(computeFn).toHaveBeenCalledTimes(1); // Same as before
    });

    it('should invalidate cache when dependencies change', () => {
      const computeFn = jest.fn((state: DiagramState) => {
        return state.viewport.x * 2;
      });

      store.set('viewport.x', 50);

      const result1 = store.computed('double', computeFn, ['viewport.x']);
      expect(result1).toBe(100);
      expect(computeFn).toHaveBeenCalledTimes(1);

      // Change dependency
      store.set('viewport.x', 100);

      const result2 = store.computed('double', computeFn, ['viewport.x']);
      expect(result2).toBe(200);
      expect(computeFn).toHaveBeenCalledTimes(2); // Recomputed
    });

    it('should not invalidate cache when unrelated state changes', () => {
      const computeFn = jest.fn((state: DiagramState) => {
        return state.viewport.x * 2;
      });

      store.set('viewport.x', 50);

      const result1 = store.computed('double', computeFn, ['viewport.x']);
      expect(result1).toBe(100);
      expect(computeFn).toHaveBeenCalledTimes(1);

      // Change unrelated state
      store.set('theme', 'dark');

      const result2 = store.computed('double', computeFn, ['viewport.x']);
      expect(result2).toBe(100);
      expect(computeFn).toHaveBeenCalledTimes(1); // Still cached
    });
  });

  describe('History and Time Travel', () => {
    it('should track state history', () => {
      store.set('mode', 'runtime');
      store.set('theme', 'dark');
      store.set('locked', true);

      const history = store.getHistory();

      expect(history.length).toBe(3);
      expect(history[0]?.state.mode).toBe('runtime');
      expect(history[1]?.state.theme).toBe('dark');
      expect(history[2]?.state.locked).toBe(true);
    });

    it('should time travel to previous state', () => {
      store.set('mode', 'runtime');
      store.set('theme', 'dark');

      expect(store.select<string>('theme')).toBe('dark');

      store.timeTravel(0); // Go back to first state

      expect(store.select<string>('mode')).toBe('runtime');
      expect(store.select<string>('theme')).toBe('light'); // Original
    });

    it('should limit history size', () => {
      // Make many changes
      for (let i = 0; i < 100; i++) {
        store.set('viewport.x', i);
      }

      const history = store.getHistory();

      expect(history.length).toBeLessThanOrEqual(50); // Default max
    });

    it('should not add to history when batch has no changes', () => {
      const initialHistoryLength = store.getHistory().length;

      store.batch(() => {
        // No changes
      });

      expect(store.getHistory().length).toBe(initialHistoryLength);
    });
  });

  describe('Snapshots', () => {
    it('should create state snapshot', () => {
      store.set('mode', 'runtime');
      store.set('theme', 'dark');

      const snapshot = store.createSnapshot();

      expect(snapshot.timestamp).toBeDefined();
      expect(snapshot.version).toBe('1.0.0');
      expect(snapshot.state.mode).toBe('runtime');
      expect(snapshot.state.theme).toBe('dark');
    });

    it('should restore from snapshot', () => {
      store.set('mode', 'runtime');
      const snapshot = store.createSnapshot();

      store.set('mode', 'design');
      expect(store.select<string>('mode')).toBe('design');

      store.restoreSnapshot(snapshot);
      expect(store.select<string>('mode')).toBe('runtime');
    });

    it('should notify listeners after restoring snapshot', () => {
      const listener = jest.fn();
      store.subscribe(listener);

      store.set('mode', 'runtime');
      const snapshot = store.createSnapshot();

      listener.mockClear();

      store.set('mode', 'design');
      store.restoreSnapshot(snapshot);

      expect(listener).toHaveBeenCalled();
    });

    it('should clear computed cache after restoring snapshot', () => {
      const computeFn = jest.fn((state: DiagramState) => state.mode);

      store.set('mode', 'runtime');
      store.computed('mode-value', computeFn);
      expect(computeFn).toHaveBeenCalledTimes(1);

      const snapshot = store.createSnapshot();

      store.set('mode', 'design');
      store.restoreSnapshot(snapshot);

      store.computed('mode-value', computeFn);
      expect(computeFn).toHaveBeenCalledTimes(2); // Recomputed
    });
  });

  describe('Reset', () => {
    it('should reset to default initial state', () => {
      store.set('mode', 'runtime');
      store.set('theme', 'dark');
      store.set('locked', true);

      store.reset();

      const state = store.getState();
      expect(state.mode).toBe('design');
      expect(state.theme).toBe('light');
      expect(state.locked).toBe(false);
    });

    it('should reset to custom initial state', () => {
      store.reset({ mode: 'readonly', theme: 'dark' });

      const state = store.getState();
      expect(state.mode).toBe('readonly');
      expect(state.theme).toBe('dark');
    });

    it('should clear history on reset', () => {
      store.set('mode', 'runtime');
      store.set('theme', 'dark');

      expect(store.getHistory().length).toBeGreaterThan(0);

      store.reset();

      expect(store.getHistory().length).toBe(0);
    });

    it('should clear computed cache on reset', () => {
      const computeFn = jest.fn((state: DiagramState) => state.mode);

      store.computed('mode-value', computeFn);
      expect(computeFn).toHaveBeenCalledTimes(1);

      store.reset();

      store.computed('mode-value', computeFn);
      expect(computeFn).toHaveBeenCalledTimes(2); // Recomputed
    });

    it('should notify listeners on reset', () => {
      const listener = jest.fn();
      store.subscribe(listener);

      store.reset();

      expect(listener).toHaveBeenCalled();
      expect(listener.mock.calls[0][1]).toContain('*'); // Wildcard for all changes
    });
  });

  describe('Change Detection', () => {
    it('should detect primitive value changes', () => {
      const listener = jest.fn();
      store.subscribe(listener);

      store.set('mode', 'runtime');

      expect(listener).toHaveBeenCalled();
      const changes = listener.mock.calls[0][1];
      expect(changes).toContain('mode');
    });

    it('should detect nested object changes', () => {
      const listener = jest.fn();
      store.subscribe(listener);

      store.set('viewport.x', 100);

      expect(listener).toHaveBeenCalled();
      const changes = listener.mock.calls[0][1];
      expect(changes).toContain('viewport.x');
    });

    it('should detect Set changes', () => {
      const listener = jest.fn();
      store.subscribe(listener);

      store.setState((state) => {
        state.selectedNodes.add('node1');
      });

      expect(listener).toHaveBeenCalled();
    });

    it('should detect array changes', () => {
      const listener = jest.fn();
      store.subscribe(listener);

      store.setState((state) => {
        state.errors.push(new Error('test'));
      });

      expect(listener).toHaveBeenCalled();
    });
  });
});
