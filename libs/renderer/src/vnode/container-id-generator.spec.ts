import { ContainerIdGenerator } from './container-id-generator';

describe('ContainerIdGenerator', () => {
  beforeEach(() => {
    ContainerIdGenerator.reset();
  });

  describe('generate', () => {
    it('should generate unique sequential IDs', () => {
      const id1 = ContainerIdGenerator.generate('node-1');
      const id2 = ContainerIdGenerator.generate('node-1');
      const id3 = ContainerIdGenerator.generate('node-2');

      expect(id1).toBe('fo-node-1-1');
      expect(id2).toBe('fo-node-1-2');
      expect(id3).toBe('fo-node-2-3');
    });

    it('should generate unique IDs for different node IDs', () => {
      const id1 = ContainerIdGenerator.generate('node-1');
      const id2 = ContainerIdGenerator.generate('node-2');
      const id3 = ContainerIdGenerator.generate('node-3');

      expect(id1).toBe('fo-node-1-1');
      expect(id2).toBe('fo-node-2-2');
      expect(id3).toBe('fo-node-3-3');
      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
    });

    it('should handle complex node IDs', () => {
      const id = ContainerIdGenerator.generate('my-complex-node-123-abc');
      expect(id).toBe('fo-my-complex-node-123-abc-1');
    });

    it('should generate unique IDs across multiple calls', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(ContainerIdGenerator.generate('node-1'));
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('isContainerId', () => {
    it('should identify valid container IDs', () => {
      expect(ContainerIdGenerator.isContainerId('fo-node-1-1')).toBe(true);
      expect(ContainerIdGenerator.isContainerId('fo-node-123-456')).toBe(true);
      expect(ContainerIdGenerator.isContainerId('fo-my-node-1')).toBe(true);
    });

    it('should reject invalid container IDs', () => {
      expect(ContainerIdGenerator.isContainerId('node-1')).toBe(false);
      expect(ContainerIdGenerator.isContainerId('random-id')).toBe(false);
      expect(ContainerIdGenerator.isContainerId('fo-')).toBe(false);
      expect(ContainerIdGenerator.isContainerId('fo')).toBe(false);
      expect(ContainerIdGenerator.isContainerId('')).toBe(false);
    });

    it('should reject IDs that start with fo- but have invalid format', () => {
      expect(ContainerIdGenerator.isContainerId('fo-invalid')).toBe(false);
      expect(ContainerIdGenerator.isContainerId('fo--1')).toBe(false);
    });
  });

  describe('getNodeId', () => {
    it('should extract node ID from valid container ID', () => {
      expect(ContainerIdGenerator.getNodeId('fo-node-123-5')).toBe('node-123');
      expect(ContainerIdGenerator.getNodeId('fo-my-node-99')).toBe('my-node');
      expect(ContainerIdGenerator.getNodeId('fo-node-1-1')).toBe('node-1');
    });

    it('should handle complex node IDs with hyphens', () => {
      expect(ContainerIdGenerator.getNodeId('fo-my-complex-node-123')).toBe('my-complex-node');
      expect(ContainerIdGenerator.getNodeId('fo-a-b-c-d-1')).toBe('a-b-c-d');
    });

    it('should return null for invalid container IDs', () => {
      expect(ContainerIdGenerator.getNodeId('invalid')).toBeNull();
      expect(ContainerIdGenerator.getNodeId('node-1')).toBeNull();
      expect(ContainerIdGenerator.getNodeId('fo-')).toBeNull();
      expect(ContainerIdGenerator.getNodeId('')).toBeNull();
    });

    it('should return null for IDs without counter suffix', () => {
      expect(ContainerIdGenerator.getNodeId('fo-node-abc')).toBeNull();
      expect(ContainerIdGenerator.getNodeId('fo-node')).toBeNull();
    });
  });

  describe('reset', () => {
    it('should reset counter to zero', () => {
      ContainerIdGenerator.generate('node-1');
      ContainerIdGenerator.generate('node-1');
      expect(ContainerIdGenerator.generate('node-1')).toBe('fo-node-1-3');

      ContainerIdGenerator.reset();

      expect(ContainerIdGenerator.generate('node-1')).toBe('fo-node-1-1');
    });

    it('should allow counter to increment after reset', () => {
      ContainerIdGenerator.generate('node-1');
      ContainerIdGenerator.reset();

      const id1 = ContainerIdGenerator.generate('node-1');
      const id2 = ContainerIdGenerator.generate('node-1');

      expect(id1).toBe('fo-node-1-1');
      expect(id2).toBe('fo-node-1-2');
    });
  });

  describe('Performance - NFR-FO-003', () => {
    it('should generate IDs in O(1) time', () => {
      ContainerIdGenerator.reset();

      const startTime = performance.now();
      for (let i = 0; i < 10000; i++) {
        ContainerIdGenerator.generate('node-1');
      }
      const endTime = performance.now();
      const totalTime = endTime - startTime;

      // Should complete 10k generations in reasonable time (< 100ms)
      expect(totalTime).toBeLessThan(100);
    });

    it('should check container ID in O(1) time', () => {
      const startTime = performance.now();
      for (let i = 0; i < 10000; i++) {
        ContainerIdGenerator.isContainerId('fo-node-1-1');
      }
      const endTime = performance.now();
      const totalTime = endTime - startTime;

      // Should complete 10k checks in reasonable time (< 50ms)
      expect(totalTime).toBeLessThan(50);
    });
  });
});
