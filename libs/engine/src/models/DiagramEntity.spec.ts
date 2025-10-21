// DiagramEntity test suite

// Mock nanoid and uuid to avoid ESM issues in Jest
let idCounter = 0;
let uuidCounter = 0;

jest.mock('nanoid', () => ({
  nanoid: (size?: number) => 'test-id-' + (idCounter++).toString().padStart(12, '0')
}));

jest.mock('uuid', () => ({
  v4: () => `12345678-1234-1234-1234-${(uuidCounter++).toString().padStart(12, '0')}`
}));

import { DiagramEntity, ChangeEntry } from './DiagramEntity';
import { SerializedEntity } from '../types';

// Test implementation of DiagramEntity
class TestEntity extends DiagramEntity {
  private _name: string = '';

  get name(): string {
    return this._name;
  }

  set name(value: string) {
    const oldValue = this._name;
    this._name = value;
    this.trackChange('name', oldValue, value);
  }

  serialize(): SerializedEntity {
    return {
      id: this.id,
      uuid: this.uuid,
      type: 'test',
      version: this.version,
      metadata: Object.fromEntries(this.metadata),
    };
  }
}

describe('DiagramEntity', () => {
  let entity: TestEntity;

  beforeEach(() => {
    entity = new TestEntity();
  });

  afterEach(() => {
    entity.dispose();
  });

  it('should generate unique ID and UUID', () => {
    const entity1 = new TestEntity();
    const entity2 = new TestEntity();

    expect(entity1.id).toBeDefined();
    expect(entity1.uuid).toBeDefined();
    expect(entity1.id).not.toBe(entity2.id);
    expect(entity1.uuid).not.toBe(entity2.uuid);

    entity1.dispose();
    entity2.dispose();
  });

  it('should track property changes', () => {
    const changeHandler = jest.fn();
    entity.on('change', changeHandler);

    entity.name = 'Test';

    expect(changeHandler).toHaveBeenCalled();
    const entry = changeHandler.mock.calls[0][0] as ChangeEntry;
    expect(entry.property).toBe('name');
    expect(entry.oldValue).toBe('');
    expect(entry.newValue).toBe('Test');
  });

  it('should increment version on change', () => {
    const initialVersion = entity.version;
    entity.name = 'Test';
    expect(entity.version).toBe(initialVersion + 1);
  });

  it('should emit property-specific change events', () => {
    const handler = jest.fn();
    entity.onPropertyChange('name', handler);

    entity.name = 'Updated';

    expect(handler).toHaveBeenCalled();
    const data = handler.mock.calls[0][0];
    expect(data.newValue).toBe('Updated');
  });

  it('should manage metadata', () => {
    entity.setMetadata('key1', 'value1');
    expect(entity.getMetadata('key1')).toBe('value1');

    entity.deleteMetadata('key1');
    expect(entity.getMetadata('key1')).toBeUndefined();
  });

  it('should maintain change log', () => {
    entity.name = 'First';
    entity.name = 'Second';
    entity.name = 'Third';

    const log = entity.getChangeLog();
    expect(log.length).toBeGreaterThan(0);
  });

  it('should clear change log', () => {
    entity.name = 'Test';
    expect(entity.getChangeLog().length).toBeGreaterThan(0);

    entity.clearChangeLog();
    expect(entity.getChangeLog().length).toBe(0);
  });

  it('should serialize correctly', () => {
    entity.setMetadata('test', 'value');
    const serialized = entity.serialize();

    expect(serialized.id).toBe(entity.id);
    expect(serialized.uuid).toBe(entity.uuid);
    expect(serialized.type).toBe('test');
    expect(serialized.metadata['test']).toBe('value');
  });

  it('should dispose correctly', () => {
    entity.setMetadata('key', 'value');
    entity.name = 'Test';

    entity.dispose();

    expect(entity.getChangeLog().length).toBe(0);
    expect(entity.metadata.size).toBe(0);
  });

  it('should not track unchanged values', () => {
    entity.name = 'Test';
    entity.clearChangeLog();

    entity.name = 'Test'; // Same value

    expect(entity.getChangeLog().length).toBe(0);
  });
});
