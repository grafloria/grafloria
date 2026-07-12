/**
 * Unit tests for Layout History
 */

import { LayoutHistory, LayoutSnapshot } from './layout-history';
import { NodeModel } from '../models/NodeModel';

describe('LayoutHistory', () => {
  describe('Constructor', () => {
    it('should create empty history with default options', () => {
      const history = new LayoutHistory();

      expect(history.size()).toBe(0);
      expect(history.getCurrentIndex()).toBe(-1);
      expect(history.canUndo()).toBe(false);
      expect(history.canRedo()).toBe(false);
    });

    it('should respect custom max history size', () => {
      // Dedup uses Date.now(); fake timers make advanceTimersByTime move it
      jest.useFakeTimers();
      const history = new LayoutHistory({ maxHistorySize: 5 });

      const nodes = [createNode('1', 0, 0)];

      // Push 10 snapshots
      for (let i = 0; i < 10; i++) {
        history.pushSnapshot(nodes, `Snapshot ${i}`);
        // Wait to avoid deduplication
        jest.advanceTimersByTime(1100);
      }

      // Should only keep last 5
      expect(history.size()).toBe(5);
      jest.useRealTimers();
    });
  });

  describe('pushSnapshot()', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should create and push snapshot', () => {
      const history = new LayoutHistory();
      const nodes = [
        createNode('1', 100, 200),
        createNode('2', 300, 400),
      ];

      const snapshot = history.pushSnapshot(nodes, 'Test layout', 'dagre', { rankdir: 'TB' });

      expect(snapshot).toBeDefined();
      expect(snapshot.id).toBeDefined();
      expect(snapshot.timestamp).toBeGreaterThan(0);
      expect(snapshot.positions.size).toBe(2);
      expect(snapshot.description).toBe('Test layout');
      expect(snapshot.algorithm).toBe('dagre');
      expect(snapshot.options).toEqual({ rankdir: 'TB' });
      expect(history.size()).toBe(1);
      expect(history.getCurrentIndex()).toBe(0);
    });

    it('should store node positions correctly', () => {
      const history = new LayoutHistory();
      const nodes = [
        createNode('1', 100, 200),
        createNode('2', 300, 400),
      ];

      const snapshot = history.pushSnapshot(nodes);

      expect(snapshot.positions.get('1')).toEqual({ x: 100, y: 200 });
      expect(snapshot.positions.get('2')).toEqual({ x: 300, y: 400 });
    });

    it('should not create snapshot if minSnapshotInterval not elapsed', () => {
      const history = new LayoutHistory({ minSnapshotInterval: 1000 });
      const nodes = [createNode('1', 0, 0)];

      history.pushSnapshot(nodes, 'First');
      jest.advanceTimersByTime(500); // Only 500ms
      history.pushSnapshot(nodes, 'Second');

      // Should still be 1 snapshot
      expect(history.size()).toBe(1);
    });

    it('should create snapshot after minSnapshotInterval', () => {
      const history = new LayoutHistory({ minSnapshotInterval: 1000 });
      const nodes = [createNode('1', 0, 0)];

      history.pushSnapshot(nodes, 'First');
      jest.advanceTimersByTime(1100); // 1.1 seconds
      history.pushSnapshot(nodes, 'Second');

      expect(history.size()).toBe(2);
    });

    it('should remove future history when pushing after undo', () => {
      const history = new LayoutHistory();
      const nodes = [createNode('1', 0, 0)];

      history.pushSnapshot(nodes, 'First');
      jest.advanceTimersByTime(1100);
      history.pushSnapshot(nodes, 'Second');
      jest.advanceTimersByTime(1100);
      history.pushSnapshot(nodes, 'Third');

      // Undo twice
      history.undo();
      history.undo();

      // Push new snapshot
      jest.advanceTimersByTime(1100);
      history.pushSnapshot(nodes, 'New');

      // Should have First, New (Second and Third removed)
      expect(history.size()).toBe(2);
      expect(history.getCurrentSnapshot()?.description).toBe('New');
    });
  });

  describe('undo()', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should undo to previous snapshot', () => {
      const history = new LayoutHistory();
      const nodes = [createNode('1', 0, 0)];

      history.pushSnapshot(nodes, 'First');
      jest.advanceTimersByTime(1100);
      history.pushSnapshot(nodes, 'Second');

      const previous = history.undo();

      expect(previous).toBeDefined();
      expect(previous?.description).toBe('First');
      expect(history.getCurrentIndex()).toBe(0);
    });

    it('should return undefined if cannot undo', () => {
      const history = new LayoutHistory();

      const result = history.undo();

      expect(result).toBeUndefined();
    });

    it('should allow multiple undos', () => {
      const history = new LayoutHistory();
      const nodes = [createNode('1', 0, 0)];

      history.pushSnapshot(nodes, 'First');
      jest.advanceTimersByTime(1100);
      history.pushSnapshot(nodes, 'Second');
      jest.advanceTimersByTime(1100);
      history.pushSnapshot(nodes, 'Third');

      history.undo(); // To Second
      const snapshot = history.undo(); // To First

      expect(snapshot?.description).toBe('First');
      expect(history.getCurrentIndex()).toBe(0);
    });
  });

  describe('redo()', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should redo to next snapshot', () => {
      const history = new LayoutHistory();
      const nodes = [createNode('1', 0, 0)];

      history.pushSnapshot(nodes, 'First');
      jest.advanceTimersByTime(1100);
      history.pushSnapshot(nodes, 'Second');

      history.undo();
      const next = history.redo();

      expect(next).toBeDefined();
      expect(next?.description).toBe('Second');
      expect(history.getCurrentIndex()).toBe(1);
    });

    it('should return undefined if cannot redo', () => {
      const history = new LayoutHistory();
      const nodes = [createNode('1', 0, 0)];

      history.pushSnapshot(nodes, 'First');

      const result = history.redo();

      expect(result).toBeUndefined();
    });
  });

  describe('canUndo() and canRedo()', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should correctly report undo/redo availability', () => {
      const history = new LayoutHistory();
      const nodes = [createNode('1', 0, 0)];

      // Empty history
      expect(history.canUndo()).toBe(false);
      expect(history.canRedo()).toBe(false);

      // One snapshot
      history.pushSnapshot(nodes, 'First');
      expect(history.canUndo()).toBe(false);
      expect(history.canRedo()).toBe(false);

      // Two snapshots
      jest.advanceTimersByTime(1100);
      history.pushSnapshot(nodes, 'Second');
      expect(history.canUndo()).toBe(true);
      expect(history.canRedo()).toBe(false);

      // After undo
      history.undo();
      expect(history.canUndo()).toBe(false);
      expect(history.canRedo()).toBe(true);

      // After redo
      history.redo();
      expect(history.canUndo()).toBe(true);
      expect(history.canRedo()).toBe(false);
    });
  });

  describe('getCurrentSnapshot()', () => {
    it('should return current snapshot', () => {
      const history = new LayoutHistory();
      const nodes = [createNode('1', 0, 0)];

      history.pushSnapshot(nodes, 'Test');

      const current = history.getCurrentSnapshot();

      expect(current).toBeDefined();
      expect(current?.description).toBe('Test');
    });

    it('should return undefined for empty history', () => {
      const history = new LayoutHistory();

      const current = history.getCurrentSnapshot();

      expect(current).toBeUndefined();
    });
  });

  describe('restoreSnapshot()', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should restore snapshot by ID', () => {
      const history = new LayoutHistory();
      const nodes = [createNode('1', 0, 0)];

      const first = history.pushSnapshot(nodes, 'First');
      jest.advanceTimersByTime(1100);
      history.pushSnapshot(nodes, 'Second');
      jest.advanceTimersByTime(1100);
      history.pushSnapshot(nodes, 'Third');

      const restored = history.restoreSnapshot(first.id);

      expect(restored).toBeDefined();
      expect(restored?.description).toBe('First');
      expect(history.getCurrentIndex()).toBe(0);
    });

    it('should return undefined for invalid ID', () => {
      const history = new LayoutHistory();

      const result = history.restoreSnapshot('invalid-id');

      expect(result).toBeUndefined();
    });
  });

  describe('applySnapshot()', () => {
    it('should apply positions to nodes', () => {
      const nodes = [
        createNode('1', 0, 0),
        createNode('2', 0, 0),
      ];

      const snapshot: LayoutSnapshot = {
        id: 'test',
        timestamp: Date.now(),
        positions: new Map([
          ['1', { x: 100, y: 200 }],
          ['2', { x: 300, y: 400 }],
        ]),
      };

      const updated = LayoutHistory.applySnapshot(snapshot, nodes);

      expect(updated).toBe(2);
      expect(nodes[0].position).toEqual({ x: 100, y: 200 });
      expect(nodes[1].position).toEqual({ x: 300, y: 400 });
    });

    it('should handle partial matches', () => {
      const nodes = [
        createNode('1', 0, 0),
        createNode('2', 0, 0),
        createNode('3', 0, 0),
      ];

      const snapshot: LayoutSnapshot = {
        id: 'test',
        timestamp: Date.now(),
        positions: new Map([
          ['1', { x: 100, y: 200 }],
          ['3', { x: 300, y: 400 }],
          // Node 2 not in snapshot
        ]),
      };

      const updated = LayoutHistory.applySnapshot(snapshot, nodes);

      expect(updated).toBe(2);
      expect(nodes[0].position).toEqual({ x: 100, y: 200 });
      expect(nodes[1].position).toEqual({ x: 0, y: 0 }); // Unchanged
      expect(nodes[2].position).toEqual({ x: 300, y: 400 });
    });
  });

  describe('clear()', () => {
    it('should clear all history', () => {
      const history = new LayoutHistory();
      const nodes = [createNode('1', 0, 0)];

      history.pushSnapshot(nodes, 'Test');

      history.clear();

      expect(history.size()).toBe(0);
      expect(history.getCurrentIndex()).toBe(-1);
      expect(history.canUndo()).toBe(false);
    });
  });

  describe('export/import JSON', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should export history to JSON', () => {
      const history = new LayoutHistory();
      const nodes = [createNode('1', 100, 200)];

      history.pushSnapshot(nodes, 'Test', 'dagre');

      const json = history.exportToJSON();

      expect(json).toBeDefined();
      expect(json.length).toBeGreaterThan(0);

      const parsed = JSON.parse(json);
      expect(parsed.history).toBeDefined();
      expect(parsed.history.length).toBe(1);
      expect(parsed.currentIndex).toBe(0);
    });

    it('should import history from JSON', () => {
      const history1 = new LayoutHistory();
      const nodes = [createNode('1', 100, 200)];

      history1.pushSnapshot(nodes, 'Test', 'dagre');
      const json = history1.exportToJSON();

      const history2 = new LayoutHistory();
      const success = history2.importFromJSON(json);

      expect(success).toBe(true);
      expect(history2.size()).toBe(1);
      expect(history2.getCurrentSnapshot()?.description).toBe('Test');
    });

    it('should handle invalid JSON gracefully', () => {
      const history = new LayoutHistory();

      const success = history.importFromJSON('invalid json');

      expect(success).toBe(false);
      expect(history.size()).toBe(0);
    });
  });

  describe('getStatistics()', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should return correct statistics', () => {
      const history = new LayoutHistory();
      const nodes = [createNode('1', 0, 0)];

      history.pushSnapshot(nodes, 'First');
      jest.advanceTimersByTime(2000);
      history.pushSnapshot(nodes, 'Second');
      jest.advanceTimersByTime(2000);
      history.pushSnapshot(nodes, 'Third');

      const stats = history.getStatistics();

      expect(stats.totalSnapshots).toBe(3);
      expect(stats.currentIndex).toBe(2);
      expect(stats.canUndo).toBe(true);
      expect(stats.canRedo).toBe(false);
      expect(stats.averageInterval).toBeCloseTo(2000, 0);
    });

    it('should handle empty history', () => {
      const history = new LayoutHistory();

      const stats = history.getStatistics();

      expect(stats.totalSnapshots).toBe(0);
      expect(stats.currentIndex).toBe(-1);
      expect(stats.canUndo).toBe(false);
      expect(stats.canRedo).toBe(false);
      expect(stats.averageInterval).toBe(0);
    });
  });
});

// Helper function to create test nodes
function createNode(id: string, x: number, y: number): NodeModel {
  const node = new NodeModel({ id, type: 'layout-test', position: { x, y }, size: { width: 150, height: 50 } });
  return node;
}
