// DiagramEntity.dirty.spec.ts - TDD tests for dirty marking system (Phase 5.2)

import { DiagramEntity } from './DiagramEntity';

// Concrete test class since DiagramEntity is abstract
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

describe('DiagramEntity - Dirty Marking (Phase 5.2)', () => {
  let entity: TestEntity;

  beforeEach(() => {
    entity = new TestEntity();
  });

  describe('Basic Dirty Flag', () => {
    it('should start with isDirty = true (never rendered)', () => {
      expect(entity.isDirty).toBe(true);
      expect(entity.getDirtyReasons()).toContain('created');
    });

    it('should allow setting isDirty flag manually', () => {
      entity.markDirty();
      expect(entity.isDirty).toBe(true);
    });

    it('should allow clearing isDirty flag manually', () => {
      entity.markDirty();
      expect(entity.isDirty).toBe(true);

      entity.markClean();
      expect(entity.isDirty).toBe(false);
    });

    it('should emit dirty:changed event when marking dirty', () => {
      entity.markClean(); // Start clean first

      const listener = jest.fn();
      entity.on('dirty:changed', listener);

      entity.markDirty();

      expect(listener).toHaveBeenCalledWith(true);
    });

    it('should emit dirty:changed event when marking clean', () => {
      entity.markDirty();

      const listener = jest.fn();
      entity.on('dirty:changed', listener);

      entity.markClean();

      expect(listener).toHaveBeenCalledWith(false);
    });

    it('should not emit dirty:changed if state does not change', () => {
      entity.markDirty();
      const listener = jest.fn();
      entity.on('dirty:changed', listener);

      entity.markDirty(); // Already dirty

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('Auto-marking on Changes', () => {
    it('should automatically mark dirty when trackChange is called', () => {
      entity.markClean(); // Start clean
      expect(entity.isDirty).toBe(false);

      entity.setValue(42);

      expect(entity.isDirty).toBe(true);
    });

    it('should not mark dirty if value does not actually change', () => {
      entity.markClean(); // Start clean
      entity.setValue(0); // Same as initial value
      expect(entity.isDirty).toBe(false);
    });

    it('should mark dirty when metadata changes', () => {
      entity.setMetadata('key', 'value');
      expect(entity.isDirty).toBe(true);
    });

    it('should mark dirty when metadata is deleted', () => {
      entity.setMetadata('key', 'value');
      entity.markClean();

      entity.deleteMetadata('key');
      expect(entity.isDirty).toBe(true);
    });
  });

  describe('Dirty Reason Tracking', () => {
    it('should track which properties changed', () => {
      entity.setValue(42);

      const reasons = entity.getDirtyReasons();
      expect(reasons).toContain('value');
    });

    it('should track multiple property changes', () => {
      entity.setValue(42);
      entity.setMetadata('key', 'value');

      const reasons = entity.getDirtyReasons();
      expect(reasons).toContain('value');
      expect(reasons).toContain('metadata.key');
    });

    it('should clear dirty reasons when marked clean', () => {
      entity.setValue(42);
      expect(entity.getDirtyReasons().length).toBeGreaterThan(0);

      entity.markClean();
      expect(entity.getDirtyReasons()).toEqual([]);
    });

    it('should accumulate reasons across multiple changes', () => {
      entity.setValue(42);
      entity.setValue(100);
      entity.setMetadata('a', '1');

      const reasons = entity.getDirtyReasons();
      expect(reasons).toContain('value');
      expect(reasons).toContain('metadata.a');
    });
  });

  describe('Dirty Timestamp', () => {
    it('should track when entity was marked dirty', () => {
      const before = Date.now();
      entity.markDirty();
      const after = Date.now();

      const timestamp = entity.getDirtyTimestamp();
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });

    it('should update timestamp on each change', () => {
      entity.setValue(42);
      const firstTimestamp = entity.getDirtyTimestamp();

      // Wait a bit
      jest.useFakeTimers();
      jest.advanceTimersByTime(100);

      entity.setValue(100);
      const secondTimestamp = entity.getDirtyTimestamp();

      jest.useRealTimers();

      expect(secondTimestamp).toBeGreaterThan(firstTimestamp!);
    });

    it('should return null when entity is clean', () => {
      entity.markClean(); // Start clean first
      expect(entity.getDirtyTimestamp()).toBeNull();
    });

    it('should clear timestamp when marked clean', () => {
      entity.markDirty();
      expect(entity.getDirtyTimestamp()).not.toBeNull();

      entity.markClean();
      expect(entity.getDirtyTimestamp()).toBeNull();
    });
  });

  describe('Bulk Operations', () => {
    it('should support batch updates without marking dirty each time', () => {
      entity.markClean(); // Start clean

      const listener = jest.fn();
      entity.on('dirty:changed', listener);

      entity.beginBatch();
      entity.setValue(1);
      entity.setValue(2);
      entity.setValue(3);
      entity.endBatch();

      // Should only emit once at end of batch
      expect(listener).toHaveBeenCalledTimes(1);
      expect(entity.isDirty).toBe(true);
    });

    it('should accumulate all changes during batch', () => {
      entity.beginBatch();
      entity.setValue(1);
      entity.setMetadata('a', '1');
      entity.setMetadata('b', '2');
      entity.endBatch();

      const reasons = entity.getDirtyReasons();
      expect(reasons).toContain('value');
      expect(reasons).toContain('metadata.a');
      expect(reasons).toContain('metadata.b');
    });

    it('should not mark dirty if batch had no changes', () => {
      entity.markClean(); // Start clean

      entity.beginBatch();
      // No changes
      entity.endBatch();

      expect(entity.isDirty).toBe(false);
    });
  });

  describe('Integration with Change Log', () => {
    it('should maintain change log independently of dirty flag', () => {
      entity.setValue(42);
      const changes1 = entity.getChangeLog();
      expect(changes1.length).toBe(1);

      entity.markClean();
      const changes2 = entity.getChangeLog();
      expect(changes2.length).toBe(1); // Change log not cleared
    });

    it('should use change log to determine dirty reasons', () => {
      entity.markClean(); // Start clean
      entity.setValue(42);
      entity.setMetadata('key', 'value');

      const reasons = entity.getDirtyReasons();
      const changeLog = entity.getChangeLog();

      // Reasons should match property names from change log
      expect(reasons).toContain('value');
      expect(reasons).toContain('metadata.key');
    });
  });
});
