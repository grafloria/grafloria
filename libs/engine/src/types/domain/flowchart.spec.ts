// flowchart.spec.ts - TDD tests for Flowchart type library

import { TypeRegistry } from '../../validation/TypeRegistry';
import { registerFlowchartTypes, FlowchartTypes } from './flowchart';

describe('Flowchart Type Library (Phase 2.3)', () => {
  let registry: TypeRegistry;

  beforeEach(() => {
    registry = new TypeRegistry();
  });

  describe('Type Registration', () => {
    it('should register all flowchart types', () => {
      registerFlowchartTypes(registry);

      const types = registry.listNodeTypes();
      expect(types.length).toBeGreaterThanOrEqual(9); // At least 9 flowchart types

      // Check that key flowchart types exist
      expect(registry.hasNodeType(FlowchartTypes.PROCESS)).toBe(true);
      expect(registry.hasNodeType(FlowchartTypes.DECISION)).toBe(true);
      expect(registry.hasNodeType(FlowchartTypes.TERMINAL)).toBe(true);
      expect(registry.hasNodeType(FlowchartTypes.DATA)).toBe(true);
      expect(registry.hasNodeType(FlowchartTypes.DOCUMENT)).toBe(true);
      expect(registry.hasNodeType(FlowchartTypes.CONNECTOR)).toBe(true);
      expect(registry.hasNodeType(FlowchartTypes.DELAY)).toBe(true);
      expect(registry.hasNodeType(FlowchartTypes.MANUAL_INPUT)).toBe(true);
      expect(registry.hasNodeType(FlowchartTypes.MANUAL_OPERATION)).toBe(true);
    });

    it('should register types with flowchart category', () => {
      registerFlowchartTypes(registry);

      const flowchartTypes = registry.getNodeTypesByCategory('flowchart');
      expect(flowchartTypes.length).toBeGreaterThanOrEqual(9);
    });
  });

  describe('Process Type', () => {
    beforeEach(() => {
      registerFlowchartTypes(registry);
    });

    it('should have correct metadata', () => {
      const processType = registry.getNodeType(FlowchartTypes.PROCESS);
      expect(processType).toBeDefined();
      expect(processType!.label).toBe('Process');
      expect(processType!.category).toBe('flowchart');
      expect(processType!.family).toBe('operation');
    });

    it('should have default style for rectangle', () => {
      const resolved = registry.resolveNodeType(FlowchartTypes.PROCESS);
      expect(resolved.defaultStyle).toBeDefined();
      expect(resolved.defaultStyle?.shape).toBe('rectangle');
    });

    it('should have default size', () => {
      const resolved = registry.resolveNodeType(FlowchartTypes.PROCESS);
      expect(resolved.defaultSize).toBeDefined();
      expect(resolved.defaultSize?.width).toBeGreaterThan(0);
      expect(resolved.defaultSize?.height).toBeGreaterThan(0);
    });

    it('should support input and output ports', () => {
      const resolved = registry.resolveNodeType(FlowchartTypes.PROCESS);
      expect(resolved.minPorts).toBeGreaterThanOrEqual(0);
      expect(resolved.maxPorts).toBeGreaterThan(0);
    });

    it('should have operation tag', () => {
      const resolved = registry.resolveNodeType(FlowchartTypes.PROCESS);
      expect(resolved.tags).toContain('operation');
    });
  });

  describe('Decision Type', () => {
    beforeEach(() => {
      registerFlowchartTypes(registry);
    });

    it('should have correct metadata', () => {
      const decisionType = registry.getNodeType(FlowchartTypes.DECISION);
      expect(decisionType).toBeDefined();
      expect(decisionType!.label).toBe('Decision');
      expect(decisionType!.category).toBe('flowchart');
      expect(decisionType!.family).toBe('control-flow');
    });

    it('should have diamond shape', () => {
      const resolved = registry.resolveNodeType(FlowchartTypes.DECISION);
      expect(resolved.defaultStyle?.shape).toBe('diamond');
    });

    it('should support multiple outputs (branches)', () => {
      const resolved = registry.resolveNodeType(FlowchartTypes.DECISION);
      // Decision nodes should allow 2+ outputs (yes/no branches)
      expect(resolved.maxPorts).toBeGreaterThanOrEqual(3); // 1 input + 2+ outputs
    });

    it('should have control-flow and decision tags', () => {
      const resolved = registry.resolveNodeType(FlowchartTypes.DECISION);
      expect(resolved.tags).toContain('control-flow');
      expect(resolved.tags).toContain('decision');
    });
  });

  describe('Terminal Type (Start/End)', () => {
    beforeEach(() => {
      registerFlowchartTypes(registry);
    });

    it('should have correct metadata', () => {
      const terminalType = registry.getNodeType(FlowchartTypes.TERMINAL);
      expect(terminalType).toBeDefined();
      expect(terminalType!.label).toBe('Terminal');
      expect(terminalType!.category).toBe('flowchart');
      expect(terminalType!.family).toBe('terminal');
    });

    it('should have rounded rectangle shape', () => {
      const resolved = registry.resolveNodeType(FlowchartTypes.TERMINAL);
      expect(resolved.defaultStyle?.shape).toBe('rounded-rectangle');
    });

    it('should have start and end variants', () => {
      const resolved = registry.resolveNodeType(FlowchartTypes.TERMINAL);
      expect(resolved.tags).toContain('terminal');
    });
  });

  describe('Data Type', () => {
    beforeEach(() => {
      registerFlowchartTypes(registry);
    });

    it('should have correct metadata', () => {
      const dataType = registry.getNodeType(FlowchartTypes.DATA);
      expect(dataType).toBeDefined();
      expect(dataType!.label).toBe('Data');
      expect(dataType!.category).toBe('flowchart');
      expect(dataType!.family).toBe('data');
    });

    it('should have parallelogram shape', () => {
      const resolved = registry.resolveNodeType(FlowchartTypes.DATA);
      expect(resolved.defaultStyle?.shape).toBe('parallelogram');
    });

    it('should have data tag', () => {
      const resolved = registry.resolveNodeType(FlowchartTypes.DATA);
      expect(resolved.tags).toContain('data');
    });
  });

  describe('Document Type', () => {
    beforeEach(() => {
      registerFlowchartTypes(registry);
    });

    it('should have correct metadata', () => {
      const docType = registry.getNodeType(FlowchartTypes.DOCUMENT);
      expect(docType).toBeDefined();
      expect(docType!.label).toBe('Document');
      expect(docType!.category).toBe('flowchart');
      expect(docType!.family).toBe('data');
    });

    it('should have document shape', () => {
      const resolved = registry.resolveNodeType(FlowchartTypes.DOCUMENT);
      expect(resolved.defaultStyle?.shape).toBe('document');
    });
  });

  describe('Connector Type', () => {
    beforeEach(() => {
      registerFlowchartTypes(registry);
    });

    it('should have correct metadata', () => {
      const connectorType = registry.getNodeType(FlowchartTypes.CONNECTOR);
      expect(connectorType).toBeDefined();
      expect(connectorType!.label).toBe('Connector');
      expect(connectorType!.category).toBe('flowchart');
      expect(connectorType!.family).toBe('connector');
    });

    it('should have circle shape', () => {
      const resolved = registry.resolveNodeType(FlowchartTypes.CONNECTOR);
      expect(resolved.defaultStyle?.shape).toBe('circle');
    });

    it('should be smaller than other nodes', () => {
      const resolved = registry.resolveNodeType(FlowchartTypes.CONNECTOR);
      const processResolved = registry.resolveNodeType(FlowchartTypes.PROCESS);

      expect(resolved.defaultSize!.width!).toBeLessThan(processResolved.defaultSize!.width!);
    });
  });

  describe('Type Families', () => {
    beforeEach(() => {
      registerFlowchartTypes(registry);
    });

    it('should group operation types', () => {
      const operations = registry.getNodeTypesByFamily('operation');
      expect(operations.length).toBeGreaterThan(0);

      const operationIds = operations.map((t) => t.type);
      expect(operationIds).toContain(FlowchartTypes.PROCESS);
    });

    it('should group control-flow types', () => {
      const controlFlow = registry.getNodeTypesByFamily('control-flow');
      expect(controlFlow.length).toBeGreaterThan(0);

      const controlFlowIds = controlFlow.map((t) => t.type);
      expect(controlFlowIds).toContain(FlowchartTypes.DECISION);
    });

    it('should group data types', () => {
      const dataTypes = registry.getNodeTypesByFamily('data');
      expect(dataTypes.length).toBeGreaterThan(0);

      const dataTypeIds = dataTypes.map((t) => t.type);
      expect(dataTypeIds).toContain(FlowchartTypes.DATA);
      expect(dataTypeIds).toContain(FlowchartTypes.DOCUMENT);
    });

    it('should group terminal types', () => {
      const terminals = registry.getNodeTypesByFamily('terminal');
      expect(terminals.length).toBeGreaterThan(0);

      const terminalIds = terminals.map((t) => t.type);
      expect(terminalIds).toContain(FlowchartTypes.TERMINAL);
    });
  });

  describe('Type Tags', () => {
    beforeEach(() => {
      registerFlowchartTypes(registry);
    });

    it('should find types by operation tag', () => {
      const operationTypes = registry.getNodeTypesByTag('operation');
      expect(operationTypes.length).toBeGreaterThan(0);
    });

    it('should find types by decision tag', () => {
      const decisionTypes = registry.getNodeTypesByTag('decision');
      expect(decisionTypes.length).toBeGreaterThan(0);
      expect(decisionTypes[0].type).toBe(FlowchartTypes.DECISION);
    });

    it('should find types by data tag', () => {
      const dataTypes = registry.getNodeTypesByTag('data');
      expect(dataTypes.length).toBeGreaterThanOrEqual(2); // Data + Document
    });
  });

  describe('Default Behaviors', () => {
    beforeEach(() => {
      registerFlowchartTypes(registry);
    });

    it('should set nodes as draggable by default', () => {
      const resolved = registry.resolveNodeType(FlowchartTypes.PROCESS);
      expect(resolved.defaultBehavior?.draggable).not.toBe(false);
    });

    it('should set nodes as deletable by default', () => {
      const resolved = registry.resolveNodeType(FlowchartTypes.PROCESS);
      expect(resolved.defaultBehavior?.deletable).not.toBe(false);
    });

    it('should set nodes as selectable by default', () => {
      const resolved = registry.resolveNodeType(FlowchartTypes.PROCESS);
      expect(resolved.defaultBehavior?.selectable).not.toBe(false);
    });
  });

  describe('Manual Input Type', () => {
    beforeEach(() => {
      registerFlowchartTypes(registry);
    });

    it('should have correct metadata', () => {
      const type = registry.getNodeType(FlowchartTypes.MANUAL_INPUT);
      expect(type).toBeDefined();
      expect(type!.label).toBe('Manual Input');
      expect(type!.category).toBe('flowchart');
      expect(type!.family).toBe('input');
    });

    it('should have parallelogram-top shape', () => {
      const resolved = registry.resolveNodeType(FlowchartTypes.MANUAL_INPUT);
      expect(resolved.defaultStyle?.shape).toBe('parallelogram-top');
    });
  });

  describe('Manual Operation Type', () => {
    beforeEach(() => {
      registerFlowchartTypes(registry);
    });

    it('should have correct metadata', () => {
      const type = registry.getNodeType(FlowchartTypes.MANUAL_OPERATION);
      expect(type).toBeDefined();
      expect(type!.label).toBe('Manual Operation');
      expect(type!.category).toBe('flowchart');
      expect(type!.family).toBe('operation');
    });

    it('should have trapezoid shape', () => {
      const resolved = registry.resolveNodeType(FlowchartTypes.MANUAL_OPERATION);
      expect(resolved.defaultStyle?.shape).toBe('trapezoid');
    });
  });

  describe('Delay Type', () => {
    beforeEach(() => {
      registerFlowchartTypes(registry);
    });

    it('should have correct metadata', () => {
      const type = registry.getNodeType(FlowchartTypes.DELAY);
      expect(type).toBeDefined();
      expect(type!.label).toBe('Delay');
      expect(type!.category).toBe('flowchart');
      expect(type!.family).toBe('operation');
    });

    it('should have rounded-rectangle shape', () => {
      const resolved = registry.resolveNodeType(FlowchartTypes.DELAY);
      expect(resolved.defaultStyle?.shape).toBe('rounded-rectangle');
    });
  });
});
