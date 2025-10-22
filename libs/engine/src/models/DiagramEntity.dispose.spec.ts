// DiagramEntity.dispose.spec.ts - TDD tests for memory management (Phase 5.4)

import { DiagramEntity } from './DiagramEntity';

// Concrete test class
class TestEntity extends DiagramEntity {
  value: number = 0;

  setValue(newValue: number): void {
    const oldValue = this.value;
    this.value = newValue;
    this.trackChange('value', oldValue, newValue);
  }

  serialize(): any {
    return {
      id: this.id,
      uuid: this.uuid,
      type: 'test',
      version: this.version,
      metadata: Object.fromEntries(this.metadata),
      value: this.value,
    };
  }
}

describe('DiagramEntity - Memory Management (Phase 5.4)', () => {
  let entity: TestEntity;

  beforeEach(() => {
    entity = new TestEntity();
  });

  describe('dispose()', () => {
    it('should mark entity as disposed', () => {
      expect(entity.isDisposed()).toBe(false);

      entity.dispose();

      expect(entity.isDisposed()).toBe(true);
    });

    it('should emit disposed event', () => {
      const listener = jest.fn();
      entity.on('disposed', listener);

      entity.dispose();

      expect(listener).toHaveBeenCalled();
    });

    it('should remove all event listeners', () => {
      const changeListener = jest.fn();
      const metadataListener = jest.fn();

      entity.on('change', changeListener);
      entity.on('metadata:changed', metadataListener);

      // Verify listeners are registered
      expect(entity['emitter'].listenerCount('change')).toBeGreaterThan(0);
      expect(entity['emitter'].listenerCount('metadata:changed')).toBeGreaterThan(0);

      entity.dispose();

      // All listeners should be removed
      expect(entity['emitter'].listenerCount('change')).toBe(0);
      expect(entity['emitter'].listenerCount('metadata:changed')).toBe(0);
    });

    it('should clear change log', () => {
      entity.setValue(1);
      entity.setValue(2);

      expect(entity.getChangeLog().length).toBeGreaterThan(0);

      entity.dispose();

      expect(entity.getChangeLog().length).toBe(0);
    });

    it('should clear metadata', () => {
      entity.setMetadata('key1', 'value1');
      entity.setMetadata('key2', 'value2');

      expect(entity.getMetadata('key1')).toBe('value1');

      entity.dispose();

      expect(entity.getMetadata('key1')).toBeUndefined();
      expect(entity.getMetadata('key2')).toBeUndefined();
    });

    it('should be idempotent (safe to call multiple times)', () => {
      entity.dispose();
      entity.dispose(); // Should not throw or cause issues
      entity.dispose();

      expect(entity.isDisposed()).toBe(true);
    });

    it('should throw error when operating on disposed entity', () => {
      entity.dispose();

      expect(() => entity.setValue(42)).toThrow('Cannot operate on disposed entity');
      expect(() => entity.setMetadata('key', 'value')).toThrow('Cannot operate on disposed entity');
    });
  });

  describe('Memory Leak Prevention', () => {
    it('should clear all references to allow garbage collection', () => {
      // This test verifies the dispose pattern clears all references
      entity.setValue(42);
      entity.setMetadata('key1', 'value1');
      entity.setMetadata('key2', 'value2');

      entity.dispose();

      // All data should be cleared
      expect(entity.getChangeLog().length).toBe(0);
      expect(entity.getMetadata('key1')).toBeUndefined();

      // Note: Actual GC testing requires manual GC trigger which isn't available in Jest
      // This test just verifies the dispose pattern clears references
    });

    it('should not leak event listeners', () => {
      const listeners: Array<() => void> = [];

      // Create many listeners
      for (let i = 0; i < 100; i++) {
        const listener = jest.fn();
        listeners.push(listener);
        entity.on('change', listener);
      }

      // Get event listener count (internal)
      const listenersBefore = entity['emitter'].listenerCount('change');
      expect(listenersBefore).toBe(100);

      entity.dispose();

      // All listeners should be removed
      const listenersAfter = entity['emitter'].listenerCount('change');
      expect(listenersAfter).toBe(0);
    });
  });

  describe('Integration with Entity Lifecycle', () => {
    it('should prevent modifications after disposal', () => {
      entity.setValue(1);
      entity.markDirty();

      entity.dispose();

      // All these should throw
      expect(() => entity.setValue(2)).toThrow();
      expect(() => entity.markDirty()).toThrow();
      expect(() => entity.markClean()).toThrow();
    });

    it('should still allow reading state after disposal', () => {
      entity.setValue(42);
      const value = entity.value;

      entity.dispose();

      // Reading should still work
      expect(entity.value).toBe(value);
      expect(entity.id).toBeDefined();
      expect(entity.uuid).toBeDefined();
    });
  });
});
