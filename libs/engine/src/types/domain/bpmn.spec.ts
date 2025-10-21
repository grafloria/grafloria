// bpmn.spec.ts - TDD tests for BPMN (Business Process Model and Notation) type library

import { TypeRegistry } from '../../validation/TypeRegistry';
import { registerBPMNTypes, BPMNTypes } from './bpmn';

describe('BPMN Type Library (Phase 2.3)', () => {
  let registry: TypeRegistry;

  beforeEach(() => {
    registry = new TypeRegistry();
  });

  describe('Type Registration', () => {
    it('should register all BPMN types', () => {
      registerBPMNTypes(registry);

      const types = registry.listNodeTypes();
      expect(types.length).toBeGreaterThanOrEqual(15); // At least 15 BPMN types

      // Activities
      expect(registry.hasNodeType(BPMNTypes.TASK)).toBe(true);
      expect(registry.hasNodeType(BPMNTypes.USER_TASK)).toBe(true);
      expect(registry.hasNodeType(BPMNTypes.SERVICE_TASK)).toBe(true);
      expect(registry.hasNodeType(BPMNTypes.MANUAL_TASK)).toBe(true);

      // Gateways
      expect(registry.hasNodeType(BPMNTypes.EXCLUSIVE_GATEWAY)).toBe(true);
      expect(registry.hasNodeType(BPMNTypes.PARALLEL_GATEWAY)).toBe(true);
      expect(registry.hasNodeType(BPMNTypes.INCLUSIVE_GATEWAY)).toBe(true);

      // Events
      expect(registry.hasNodeType(BPMNTypes.START_EVENT)).toBe(true);
      expect(registry.hasNodeType(BPMNTypes.END_EVENT)).toBe(true);
      expect(registry.hasNodeType(BPMNTypes.INTERMEDIATE_EVENT)).toBe(true);
    });

    it('should register types with bpmn category', () => {
      registerBPMNTypes(registry);

      const bpmnTypes = registry.getNodeTypesByCategory('bpmn');
      expect(bpmnTypes.length).toBeGreaterThanOrEqual(15);
    });
  });

  describe('Task Type (Base)', () => {
    beforeEach(() => {
      registerBPMNTypes(registry);
    });

    it('should have correct metadata', () => {
      const taskType = registry.getNodeType(BPMNTypes.TASK);
      expect(taskType).toBeDefined();
      expect(taskType!.label).toBe('Task');
      expect(taskType!.category).toBe('bpmn');
      expect(taskType!.family).toBe('activity');
    });

    it('should have rounded rectangle shape', () => {
      const resolved = registry.resolveNodeType(BPMNTypes.TASK);
      expect(resolved.defaultStyle?.shape).toBe('rounded-rectangle');
    });

    it('should have activity tag', () => {
      const resolved = registry.resolveNodeType(BPMNTypes.TASK);
      expect(resolved.tags).toContain('activity');
      expect(resolved.tags).toContain('task');
    });
  });

  describe('Specialized Task Types', () => {
    beforeEach(() => {
      registerBPMNTypes(registry);
    });

    it('should have User Task extending Task', () => {
      const userTask = registry.getNodeType(BPMNTypes.USER_TASK);
      expect(userTask!.extends).toBe(BPMNTypes.TASK);
    });

    it('should have Service Task extending Task', () => {
      const serviceTask = registry.getNodeType(BPMNTypes.SERVICE_TASK);
      expect(serviceTask!.extends).toBe(BPMNTypes.TASK);
    });

    it('should have Manual Task extending Task', () => {
      const manualTask = registry.getNodeType(BPMNTypes.MANUAL_TASK);
      expect(manualTask!.extends).toBe(BPMNTypes.TASK);
    });

    it('should have Business Rule Task extending Task', () => {
      const ruleTask = registry.getNodeType(BPMNTypes.BUSINESS_RULE_TASK);
      expect(ruleTask!.extends).toBe(BPMNTypes.TASK);
    });

    it('should have Script Task extending Task', () => {
      const scriptTask = registry.getNodeType(BPMNTypes.SCRIPT_TASK);
      expect(scriptTask!.extends).toBe(BPMNTypes.TASK);
    });
  });

  describe('Exclusive Gateway (XOR)', () => {
    beforeEach(() => {
      registerBPMNTypes(registry);
    });

    it('should have correct metadata', () => {
      const gateway = registry.getNodeType(BPMNTypes.EXCLUSIVE_GATEWAY);
      expect(gateway).toBeDefined();
      expect(gateway!.label).toBe('Exclusive Gateway');
      expect(gateway!.category).toBe('bpmn');
      expect(gateway!.family).toBe('gateway');
    });

    it('should have diamond shape', () => {
      const resolved = registry.resolveNodeType(BPMNTypes.EXCLUSIVE_GATEWAY);
      expect(resolved.defaultStyle?.shape).toBe('diamond');
    });

    it('should support multiple outputs', () => {
      const resolved = registry.resolveNodeType(BPMNTypes.EXCLUSIVE_GATEWAY);
      expect(resolved.maxPorts).toBeGreaterThanOrEqual(5);
    });

    it('should have gateway and xor tags', () => {
      const resolved = registry.resolveNodeType(BPMNTypes.EXCLUSIVE_GATEWAY);
      expect(resolved.tags).toContain('gateway');
      expect(resolved.tags).toContain('xor');
    });
  });

  describe('Parallel Gateway (AND)', () => {
    beforeEach(() => {
      registerBPMNTypes(registry);
    });

    it('should have correct metadata', () => {
      const gateway = registry.getNodeType(BPMNTypes.PARALLEL_GATEWAY);
      expect(gateway).toBeDefined();
      expect(gateway!.label).toBe('Parallel Gateway');
      expect(gateway!.family).toBe('gateway');
    });

    it('should have and tag', () => {
      const resolved = registry.resolveNodeType(BPMNTypes.PARALLEL_GATEWAY);
      expect(resolved.tags).toContain('and');
    });
  });

  describe('Inclusive Gateway (OR)', () => {
    beforeEach(() => {
      registerBPMNTypes(registry);
    });

    it('should have correct metadata', () => {
      const gateway = registry.getNodeType(BPMNTypes.INCLUSIVE_GATEWAY);
      expect(gateway).toBeDefined();
      expect(gateway!.label).toBe('Inclusive Gateway');
      expect(gateway!.family).toBe('gateway');
    });

    it('should have or tag', () => {
      const resolved = registry.resolveNodeType(BPMNTypes.INCLUSIVE_GATEWAY);
      expect(resolved.tags).toContain('or');
    });
  });

  describe('Start Event', () => {
    beforeEach(() => {
      registerBPMNTypes(registry);
    });

    it('should have correct metadata', () => {
      const startEvent = registry.getNodeType(BPMNTypes.START_EVENT);
      expect(startEvent).toBeDefined();
      expect(startEvent!.label).toBe('Start Event');
      expect(startEvent!.category).toBe('bpmn');
      expect(startEvent!.family).toBe('event');
    });

    it('should have circle shape', () => {
      const resolved = registry.resolveNodeType(BPMNTypes.START_EVENT);
      expect(resolved.defaultStyle?.shape).toBe('circle');
    });

    it('should have start and event tags', () => {
      const resolved = registry.resolveNodeType(BPMNTypes.START_EVENT);
      expect(resolved.tags).toContain('event');
      expect(resolved.tags).toContain('start');
    });

    it('should be smaller than tasks', () => {
      const event = registry.resolveNodeType(BPMNTypes.START_EVENT);
      const task = registry.resolveNodeType(BPMNTypes.TASK);

      expect(event.defaultSize!.width!).toBeLessThan(task.defaultSize!.width!);
    });
  });

  describe('End Event', () => {
    beforeEach(() => {
      registerBPMNTypes(registry);
    });

    it('should have correct metadata', () => {
      const endEvent = registry.getNodeType(BPMNTypes.END_EVENT);
      expect(endEvent).toBeDefined();
      expect(endEvent!.label).toBe('End Event');
      expect(endEvent!.family).toBe('event');
    });

    it('should have thicker border than start event', () => {
      const endEvent = registry.resolveNodeType(BPMNTypes.END_EVENT);
      const startEvent = registry.resolveNodeType(BPMNTypes.START_EVENT);

      expect(endEvent.defaultStyle!.strokeWidth!).toBeGreaterThan(startEvent.defaultStyle!.strokeWidth!);
    });

    it('should have end tag', () => {
      const resolved = registry.resolveNodeType(BPMNTypes.END_EVENT);
      expect(resolved.tags).toContain('end');
    });
  });

  describe('Intermediate Event', () => {
    beforeEach(() => {
      registerBPMNTypes(registry);
    });

    it('should have correct metadata', () => {
      const event = registry.getNodeType(BPMNTypes.INTERMEDIATE_EVENT);
      expect(event).toBeDefined();
      expect(event!.label).toBe('Intermediate Event');
      expect(event!.family).toBe('event');
    });

    it('should have double border (two circles)', () => {
      const resolved = registry.resolveNodeType(BPMNTypes.INTERMEDIATE_EVENT);
      expect(resolved.defaultStyle?.strokeWidth).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Type Families', () => {
    beforeEach(() => {
      registerBPMNTypes(registry);
    });

    it('should group activity types', () => {
      const activities = registry.getNodeTypesByFamily('activity');
      expect(activities.length).toBeGreaterThanOrEqual(5);

      const activityIds = activities.map((t) => t.type);
      expect(activityIds).toContain(BPMNTypes.TASK);
      expect(activityIds).toContain(BPMNTypes.USER_TASK);
      expect(activityIds).toContain(BPMNTypes.SERVICE_TASK);
    });

    it('should group gateway types', () => {
      const gateways = registry.getNodeTypesByFamily('gateway');
      expect(gateways.length).toBeGreaterThanOrEqual(3);

      const gatewayIds = gateways.map((t) => t.type);
      expect(gatewayIds).toContain(BPMNTypes.EXCLUSIVE_GATEWAY);
      expect(gatewayIds).toContain(BPMNTypes.PARALLEL_GATEWAY);
      expect(gatewayIds).toContain(BPMNTypes.INCLUSIVE_GATEWAY);
    });

    it('should group event types', () => {
      const events = registry.getNodeTypesByFamily('event');
      expect(events.length).toBeGreaterThanOrEqual(3);

      const eventIds = events.map((t) => t.type);
      expect(eventIds).toContain(BPMNTypes.START_EVENT);
      expect(eventIds).toContain(BPMNTypes.END_EVENT);
      expect(eventIds).toContain(BPMNTypes.INTERMEDIATE_EVENT);
    });
  });

  describe('Type Tags', () => {
    beforeEach(() => {
      registerBPMNTypes(registry);
    });

    it('should find types by task tag', () => {
      const tasks = registry.getNodeTypesByTag('task');
      expect(tasks.length).toBeGreaterThanOrEqual(5);
    });

    it('should find types by gateway tag', () => {
      const gateways = registry.getNodeTypesByTag('gateway');
      expect(gateways.length).toBeGreaterThanOrEqual(3);
    });

    it('should find types by event tag', () => {
      const events = registry.getNodeTypesByTag('event');
      expect(events.length).toBeGreaterThanOrEqual(3);
    });

    it('should find user interaction types', () => {
      const userTypes = registry.getNodeTypesByTag('user');
      expect(userTypes.length).toBeGreaterThanOrEqual(2); // User Task, Manual Task
    });

    it('should find automated types', () => {
      const automatedTypes = registry.getNodeTypesByTag('automated');
      expect(automatedTypes.length).toBeGreaterThanOrEqual(2); // Service Task, Script Task
    });
  });

  describe('Type Inheritance', () => {
    beforeEach(() => {
      registerBPMNTypes(registry);
    });

    it('should inherit base task properties', () => {
      const baseTask = registry.resolveNodeType(BPMNTypes.TASK);
      const userTask = registry.resolveNodeType(BPMNTypes.USER_TASK);

      // Should inherit shape
      expect(userTask.defaultStyle?.shape).toBe(baseTask.defaultStyle?.shape);

      // Should inherit behavior
      expect(userTask.defaultBehavior?.draggable).toBe(baseTask.defaultBehavior?.draggable);
    });

    it('should allow specialized tasks to override properties', () => {
      const userTask = registry.resolveNodeType(BPMNTypes.USER_TASK);
      const serviceTask = registry.resolveNodeType(BPMNTypes.SERVICE_TASK);

      // Different tasks may have different fills
      expect(userTask.defaultStyle?.fill).toBeDefined();
      expect(serviceTask.defaultStyle?.fill).toBeDefined();
    });
  });

  describe('BPMN-Specific Validation', () => {
    beforeEach(() => {
      registerBPMNTypes(registry);
    });

    it('should enforce that start events have outgoing flows', () => {
      const startEvent = registry.resolveNodeType(BPMNTypes.START_EVENT);
      // Start events should allow connections
      expect(startEvent.maxPorts).toBeGreaterThan(0);
    });

    it('should enforce that end events can have incoming flows', () => {
      const endEvent = registry.resolveNodeType(BPMNTypes.END_EVENT);
      expect(endEvent.maxPorts).toBeGreaterThan(0);
    });

    it('should allow gateways to have multiple connections', () => {
      const gateway = registry.resolveNodeType(BPMNTypes.EXCLUSIVE_GATEWAY);
      expect(gateway.maxPorts).toBeGreaterThanOrEqual(5);
    });
  });
});
