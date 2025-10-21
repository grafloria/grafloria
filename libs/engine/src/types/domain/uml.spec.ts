// uml.spec.ts - TDD tests for UML (Unified Modeling Language) type library

import { TypeRegistry } from '../../validation/TypeRegistry';
import { registerUMLTypes, UMLTypes } from './uml';

describe('UML Type Library (Phase 2.3)', () => {
  let registry: TypeRegistry;

  beforeEach(() => {
    registry = new TypeRegistry();
  });

  describe('Type Registration', () => {
    it('should register all UML types', () => {
      registerUMLTypes(registry);

      const types = registry.listNodeTypes();
      expect(types.length).toBeGreaterThanOrEqual(12); // At least 12 UML types

      // Classes and Classifiers
      expect(registry.hasNodeType(UMLTypes.CLASS)).toBe(true);
      expect(registry.hasNodeType(UMLTypes.INTERFACE)).toBe(true);
      expect(registry.hasNodeType(UMLTypes.ABSTRACT_CLASS)).toBe(true);
      expect(registry.hasNodeType(UMLTypes.ENUM)).toBe(true);

      // Structural Elements
      expect(registry.hasNodeType(UMLTypes.PACKAGE)).toBe(true);
      expect(registry.hasNodeType(UMLTypes.COMPONENT)).toBe(true);
      expect(registry.hasNodeType(UMLTypes.NODE)).toBe(true);

      // Behavioral Elements
      expect(registry.hasNodeType(UMLTypes.ACTOR)).toBe(true);
      expect(registry.hasNodeType(UMLTypes.USE_CASE)).toBe(true);

      // State Machine Elements
      expect(registry.hasNodeType(UMLTypes.STATE)).toBe(true);
      expect(registry.hasNodeType(UMLTypes.INITIAL_STATE)).toBe(true);
      expect(registry.hasNodeType(UMLTypes.FINAL_STATE)).toBe(true);

      // Annotations
      expect(registry.hasNodeType(UMLTypes.NOTE)).toBe(true);
    });

    it('should register types with uml category', () => {
      registerUMLTypes(registry);

      const umlTypes = registry.getNodeTypesByCategory('uml');
      expect(umlTypes.length).toBeGreaterThanOrEqual(12);
    });
  });

  describe('Class Type', () => {
    beforeEach(() => {
      registerUMLTypes(registry);
    });

    it('should have correct metadata', () => {
      const classType = registry.getNodeType(UMLTypes.CLASS);
      expect(classType).toBeDefined();
      expect(classType!.label).toBe('Class');
      expect(classType!.category).toBe('uml');
      expect(classType!.family).toBe('classifier');
    });

    it('should have rectangle shape', () => {
      const resolved = registry.resolveNodeType(UMLTypes.CLASS);
      expect(resolved.defaultStyle?.shape).toBe('rectangle');
    });

    it('should have classifier tag', () => {
      const resolved = registry.resolveNodeType(UMLTypes.CLASS);
      expect(resolved.tags).toContain('classifier');
      expect(resolved.tags).toContain('class');
    });

    it('should support multiple ports for relationships', () => {
      const resolved = registry.resolveNodeType(UMLTypes.CLASS);
      expect(resolved.maxPorts).toBeGreaterThan(4);
    });
  });

  describe('Interface Type', () => {
    beforeEach(() => {
      registerUMLTypes(registry);
    });

    it('should extend Class type', () => {
      const interfaceType = registry.getNodeType(UMLTypes.INTERFACE);
      expect(interfaceType!.extends).toBe(UMLTypes.CLASS);
    });

    it('should have correct metadata', () => {
      const resolved = registry.resolveNodeType(UMLTypes.INTERFACE);
      expect(resolved.label).toBe('Interface');
      expect(resolved.category).toBe('uml');
      expect(resolved.family).toBe('classifier');
    });

    it('should have interface tag', () => {
      const resolved = registry.resolveNodeType(UMLTypes.INTERFACE);
      expect(resolved.tags).toContain('interface');
    });

    it('should have distinct styling from regular class', () => {
      const classResolved = registry.resolveNodeType(UMLTypes.CLASS);
      const interfaceResolved = registry.resolveNodeType(UMLTypes.INTERFACE);

      // Interface should have different fill color
      expect(interfaceResolved.defaultStyle?.fill).toBeDefined();
      expect(interfaceResolved.defaultStyle?.fill).not.toBe(classResolved.defaultStyle?.fill);
    });
  });

  describe('Abstract Class Type', () => {
    beforeEach(() => {
      registerUMLTypes(registry);
    });

    it('should extend Class type', () => {
      const abstractClass = registry.getNodeType(UMLTypes.ABSTRACT_CLASS);
      expect(abstractClass!.extends).toBe(UMLTypes.CLASS);
    });

    it('should have abstract tag', () => {
      const resolved = registry.resolveNodeType(UMLTypes.ABSTRACT_CLASS);
      expect(resolved.tags).toContain('abstract');
    });

    it('should have italic text style', () => {
      const resolved = registry.resolveNodeType(UMLTypes.ABSTRACT_CLASS);
      expect(resolved.defaultStyle?.fontStyle).toBe('italic');
    });
  });

  describe('Enum Type', () => {
    beforeEach(() => {
      registerUMLTypes(registry);
    });

    it('should extend Class type', () => {
      const enumType = registry.getNodeType(UMLTypes.ENUM);
      expect(enumType!.extends).toBe(UMLTypes.CLASS);
    });

    it('should have enum tag', () => {
      const resolved = registry.resolveNodeType(UMLTypes.ENUM);
      expect(resolved.tags).toContain('enum');
    });

    it('should have distinct styling', () => {
      const resolved = registry.resolveNodeType(UMLTypes.ENUM);
      expect(resolved.defaultStyle?.fill).toBeDefined();
    });
  });

  describe('Package Type', () => {
    beforeEach(() => {
      registerUMLTypes(registry);
    });

    it('should have correct metadata', () => {
      const packageType = registry.getNodeType(UMLTypes.PACKAGE);
      expect(packageType).toBeDefined();
      expect(packageType!.label).toBe('Package');
      expect(packageType!.category).toBe('uml');
      expect(packageType!.family).toBe('structural');
    });

    it('should have package shape', () => {
      const resolved = registry.resolveNodeType(UMLTypes.PACKAGE);
      expect(resolved.defaultStyle?.shape).toBe('package');
    });

    it('should be larger than classes', () => {
      const packageResolved = registry.resolveNodeType(UMLTypes.PACKAGE);
      const classResolved = registry.resolveNodeType(UMLTypes.CLASS);

      expect(packageResolved.defaultSize!.width!).toBeGreaterThan(classResolved.defaultSize!.width!);
    });
  });

  describe('Component Type', () => {
    beforeEach(() => {
      registerUMLTypes(registry);
    });

    it('should have correct metadata', () => {
      const componentType = registry.getNodeType(UMLTypes.COMPONENT);
      expect(componentType).toBeDefined();
      expect(componentType!.label).toBe('Component');
      expect(componentType!.family).toBe('structural');
    });

    it('should have component shape', () => {
      const resolved = registry.resolveNodeType(UMLTypes.COMPONENT);
      expect(resolved.defaultStyle?.shape).toBe('component');
    });
  });

  describe('Node Type (Deployment)', () => {
    beforeEach(() => {
      registerUMLTypes(registry);
    });

    it('should have correct metadata', () => {
      const nodeType = registry.getNodeType(UMLTypes.NODE);
      expect(nodeType).toBeDefined();
      expect(nodeType!.label).toBe('Node');
      expect(nodeType!.family).toBe('deployment');
    });

    it('should have cube/3d shape', () => {
      const resolved = registry.resolveNodeType(UMLTypes.NODE);
      expect(resolved.defaultStyle?.shape).toBe('cube');
    });
  });

  describe('Actor Type', () => {
    beforeEach(() => {
      registerUMLTypes(registry);
    });

    it('should have correct metadata', () => {
      const actorType = registry.getNodeType(UMLTypes.ACTOR);
      expect(actorType).toBeDefined();
      expect(actorType!.label).toBe('Actor');
      expect(actorType!.category).toBe('uml');
      expect(actorType!.family).toBe('use-case');
    });

    it('should have actor shape (stick figure)', () => {
      const resolved = registry.resolveNodeType(UMLTypes.ACTOR);
      expect(resolved.defaultStyle?.shape).toBe('actor');
    });

    it('should have actor tag', () => {
      const resolved = registry.resolveNodeType(UMLTypes.ACTOR);
      expect(resolved.tags).toContain('actor');
      expect(resolved.tags).toContain('use-case');
    });
  });

  describe('Use Case Type', () => {
    beforeEach(() => {
      registerUMLTypes(registry);
    });

    it('should have correct metadata', () => {
      const useCaseType = registry.getNodeType(UMLTypes.USE_CASE);
      expect(useCaseType).toBeDefined();
      expect(useCaseType!.label).toBe('Use Case');
      expect(useCaseType!.family).toBe('use-case');
    });

    it('should have ellipse shape', () => {
      const resolved = registry.resolveNodeType(UMLTypes.USE_CASE);
      expect(resolved.defaultStyle?.shape).toBe('ellipse');
    });

    it('should have use-case tag', () => {
      const resolved = registry.resolveNodeType(UMLTypes.USE_CASE);
      expect(resolved.tags).toContain('use-case');
    });
  });

  describe('State Type', () => {
    beforeEach(() => {
      registerUMLTypes(registry);
    });

    it('should have correct metadata', () => {
      const stateType = registry.getNodeType(UMLTypes.STATE);
      expect(stateType).toBeDefined();
      expect(stateType!.label).toBe('State');
      expect(stateType!.category).toBe('uml');
      expect(stateType!.family).toBe('state-machine');
    });

    it('should have rounded rectangle shape', () => {
      const resolved = registry.resolveNodeType(UMLTypes.STATE);
      expect(resolved.defaultStyle?.shape).toBe('rounded-rectangle');
    });

    it('should have state tag', () => {
      const resolved = registry.resolveNodeType(UMLTypes.STATE);
      expect(resolved.tags).toContain('state');
    });
  });

  describe('Initial State Type', () => {
    beforeEach(() => {
      registerUMLTypes(registry);
    });

    it('should have correct metadata', () => {
      const initialState = registry.getNodeType(UMLTypes.INITIAL_STATE);
      expect(initialState).toBeDefined();
      expect(initialState!.label).toBe('Initial State');
      expect(initialState!.family).toBe('state-machine');
    });

    it('should have filled circle shape', () => {
      const resolved = registry.resolveNodeType(UMLTypes.INITIAL_STATE);
      expect(resolved.defaultStyle?.shape).toBe('circle');
    });

    it('should be small', () => {
      const resolved = registry.resolveNodeType(UMLTypes.INITIAL_STATE);
      const stateResolved = registry.resolveNodeType(UMLTypes.STATE);

      expect(resolved.defaultSize!.width!).toBeLessThan(stateResolved.defaultSize!.width!);
    });

    it('should have filled appearance', () => {
      const resolved = registry.resolveNodeType(UMLTypes.INITIAL_STATE);
      expect(resolved.defaultStyle?.fill).toBe('#000000');
    });
  });

  describe('Final State Type', () => {
    beforeEach(() => {
      registerUMLTypes(registry);
    });

    it('should have correct metadata', () => {
      const finalState = registry.getNodeType(UMLTypes.FINAL_STATE);
      expect(finalState).toBeDefined();
      expect(finalState!.label).toBe('Final State');
      expect(finalState!.family).toBe('state-machine');
    });

    it('should have circle with bull\'s-eye pattern', () => {
      const resolved = registry.resolveNodeType(UMLTypes.FINAL_STATE);
      expect(resolved.defaultStyle?.shape).toBe('circle');
      expect(resolved.defaultStyle?.strokeWidth).toBeGreaterThan(2);
    });

    it('should be small like initial state', () => {
      const resolved = registry.resolveNodeType(UMLTypes.FINAL_STATE);
      const initialResolved = registry.resolveNodeType(UMLTypes.INITIAL_STATE);

      expect(resolved.defaultSize!.width!).toBe(initialResolved.defaultSize!.width!);
    });
  });

  describe('Note Type', () => {
    beforeEach(() => {
      registerUMLTypes(registry);
    });

    it('should have correct metadata', () => {
      const noteType = registry.getNodeType(UMLTypes.NOTE);
      expect(noteType).toBeDefined();
      expect(noteType!.label).toBe('Note');
      expect(noteType!.category).toBe('uml');
      expect(noteType!.family).toBe('annotation');
    });

    it('should have note shape (rectangle with folded corner)', () => {
      const resolved = registry.resolveNodeType(UMLTypes.NOTE);
      expect(resolved.defaultStyle?.shape).toBe('note');
    });

    it('should have note tag', () => {
      const resolved = registry.resolveNodeType(UMLTypes.NOTE);
      expect(resolved.tags).toContain('note');
      expect(resolved.tags).toContain('annotation');
    });
  });

  describe('Type Families', () => {
    beforeEach(() => {
      registerUMLTypes(registry);
    });

    it('should group classifier types', () => {
      const classifiers = registry.getNodeTypesByFamily('classifier');
      expect(classifiers.length).toBeGreaterThanOrEqual(4);

      const classifierIds = classifiers.map((t) => t.type);
      expect(classifierIds).toContain(UMLTypes.CLASS);
      expect(classifierIds).toContain(UMLTypes.INTERFACE);
      expect(classifierIds).toContain(UMLTypes.ABSTRACT_CLASS);
      expect(classifierIds).toContain(UMLTypes.ENUM);
    });

    it('should group structural types', () => {
      const structural = registry.getNodeTypesByFamily('structural');
      expect(structural.length).toBeGreaterThanOrEqual(2);

      const structuralIds = structural.map((t) => t.type);
      expect(structuralIds).toContain(UMLTypes.PACKAGE);
      expect(structuralIds).toContain(UMLTypes.COMPONENT);
    });

    it('should group use-case types', () => {
      const useCaseTypes = registry.getNodeTypesByFamily('use-case');
      expect(useCaseTypes.length).toBeGreaterThanOrEqual(2);

      const useCaseIds = useCaseTypes.map((t) => t.type);
      expect(useCaseIds).toContain(UMLTypes.ACTOR);
      expect(useCaseIds).toContain(UMLTypes.USE_CASE);
    });

    it('should group state-machine types', () => {
      const stateMachine = registry.getNodeTypesByFamily('state-machine');
      expect(stateMachine.length).toBeGreaterThanOrEqual(3);

      const stateIds = stateMachine.map((t) => t.type);
      expect(stateIds).toContain(UMLTypes.STATE);
      expect(stateIds).toContain(UMLTypes.INITIAL_STATE);
      expect(stateIds).toContain(UMLTypes.FINAL_STATE);
    });

    it('should group deployment types', () => {
      const deployment = registry.getNodeTypesByFamily('deployment');
      expect(deployment.length).toBeGreaterThanOrEqual(1);

      const deploymentIds = deployment.map((t) => t.type);
      expect(deploymentIds).toContain(UMLTypes.NODE);
    });

    it('should group annotation types', () => {
      const annotations = registry.getNodeTypesByFamily('annotation');
      expect(annotations.length).toBeGreaterThanOrEqual(1);

      const annotationIds = annotations.map((t) => t.type);
      expect(annotationIds).toContain(UMLTypes.NOTE);
    });
  });

  describe('Type Tags', () => {
    beforeEach(() => {
      registerUMLTypes(registry);
    });

    it('should find classifier types by tag', () => {
      const classifierTypes = registry.getNodeTypesByTag('classifier');
      expect(classifierTypes.length).toBeGreaterThanOrEqual(4);
    });

    it('should find class types by tag', () => {
      const classTypes = registry.getNodeTypesByTag('class');
      expect(classTypes.length).toBeGreaterThanOrEqual(1);
    });

    it('should find interface types by tag', () => {
      const interfaceTypes = registry.getNodeTypesByTag('interface');
      expect(interfaceTypes.length).toBe(1);
      expect(interfaceTypes[0].type).toBe(UMLTypes.INTERFACE);
    });

    it('should find abstract types by tag', () => {
      const abstractTypes = registry.getNodeTypesByTag('abstract');
      expect(abstractTypes.length).toBeGreaterThanOrEqual(1);
    });

    it('should find enum types by tag', () => {
      const enumTypes = registry.getNodeTypesByTag('enum');
      expect(enumTypes.length).toBe(1);
    });

    it('should find use-case types by tag', () => {
      const useCaseTypes = registry.getNodeTypesByTag('use-case');
      expect(useCaseTypes.length).toBeGreaterThanOrEqual(2);
    });

    it('should find state types by tag', () => {
      const stateTypes = registry.getNodeTypesByTag('state');
      expect(stateTypes.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Type Inheritance', () => {
    beforeEach(() => {
      registerUMLTypes(registry);
    });

    it('should inherit properties from Class to Interface', () => {
      const baseClass = registry.resolveNodeType(UMLTypes.CLASS);
      const interfaceType = registry.resolveNodeType(UMLTypes.INTERFACE);

      // Interface should inherit shape from class
      expect(interfaceType.defaultStyle?.shape).toBe(baseClass.defaultStyle?.shape);

      // But should have different fill
      expect(interfaceType.defaultStyle?.fill).not.toBe(baseClass.defaultStyle?.fill);
    });

    it('should inherit properties from Class to Abstract Class', () => {
      const baseClass = registry.resolveNodeType(UMLTypes.CLASS);
      const abstractClass = registry.resolveNodeType(UMLTypes.ABSTRACT_CLASS);

      // Should inherit shape
      expect(abstractClass.defaultStyle?.shape).toBe(baseClass.defaultStyle?.shape);

      // But should have italic font style
      expect(abstractClass.defaultStyle?.fontStyle).toBe('italic');
    });

    it('should inherit properties from Class to Enum', () => {
      const baseClass = registry.resolveNodeType(UMLTypes.CLASS);
      const enumType = registry.resolveNodeType(UMLTypes.ENUM);

      // Should inherit shape
      expect(enumType.defaultStyle?.shape).toBe(baseClass.defaultStyle?.shape);

      // Should inherit behavior
      expect(enumType.defaultBehavior?.draggable).toBe(baseClass.defaultBehavior?.draggable);
    });
  });

  describe('UML-Specific Properties', () => {
    beforeEach(() => {
      registerUMLTypes(registry);
    });

    it('should have appropriate sizes for different types', () => {
      const classResolved = registry.resolveNodeType(UMLTypes.CLASS);
      const packageResolved = registry.resolveNodeType(UMLTypes.PACKAGE);
      const actorResolved = registry.resolveNodeType(UMLTypes.ACTOR);
      const initialResolved = registry.resolveNodeType(UMLTypes.INITIAL_STATE);

      // Package should be largest
      expect(packageResolved.defaultSize!.width!).toBeGreaterThan(classResolved.defaultSize!.width!);

      // Initial state should be smallest
      expect(initialResolved.defaultSize!.width!).toBeLessThan(classResolved.defaultSize!.width!);
      expect(initialResolved.defaultSize!.width!).toBeLessThan(actorResolved.defaultSize!.width!);
    });

    it('should support containment for packages', () => {
      const packageResolved = registry.resolveNodeType(UMLTypes.PACKAGE);
      // Package should allow multiple children
      expect(packageResolved.maxPorts).toBeGreaterThan(10);
    });
  });
});
