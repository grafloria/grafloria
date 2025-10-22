// erd.spec.ts - TDD tests for ERD (Entity Relationship Diagram) type library

import { TypeRegistry } from '../../validation/TypeRegistry';
import { registerERDTypes, ERDTypes } from './erd';

describe('ERD Type Library (Phase 2.3)', () => {
  let registry: TypeRegistry;

  beforeEach(() => {
    registry = new TypeRegistry();
  });

  describe('Type Registration', () => {
    it('should register all ERD types', () => {
      registerERDTypes(registry);

      const types = registry.listNodeTypes();
      expect(types.length).toBeGreaterThanOrEqual(10); // At least 10 ERD types

      // Check that key ERD types exist
      expect(registry.hasNodeType(ERDTypes.ENTITY)).toBe(true);
      expect(registry.hasNodeType(ERDTypes.WEAK_ENTITY)).toBe(true);
      expect(registry.hasNodeType(ERDTypes.RELATIONSHIP)).toBe(true);
      expect(registry.hasNodeType(ERDTypes.WEAK_RELATIONSHIP)).toBe(true);
      expect(registry.hasNodeType(ERDTypes.ATTRIBUTE)).toBe(true);
      expect(registry.hasNodeType(ERDTypes.KEY_ATTRIBUTE)).toBe(true);
      expect(registry.hasNodeType(ERDTypes.MULTIVALUED_ATTRIBUTE)).toBe(true);
      expect(registry.hasNodeType(ERDTypes.DERIVED_ATTRIBUTE)).toBe(true);
      expect(registry.hasNodeType(ERDTypes.COMPOSITE_ATTRIBUTE)).toBe(true);
      expect(registry.hasNodeType(ERDTypes.ISA_RELATIONSHIP)).toBe(true);
    });

    it('should register types with erd category', () => {
      registerERDTypes(registry);

      const erdTypes = registry.getNodeTypesByCategory('erd');
      expect(erdTypes.length).toBeGreaterThanOrEqual(10);
    });
  });

  describe('Entity Type', () => {
    beforeEach(() => {
      registerERDTypes(registry);
    });

    it('should have correct metadata', () => {
      const entityType = registry.getNodeType(ERDTypes.ENTITY);
      expect(entityType).toBeDefined();
      expect(entityType!.label).toBe('Entity');
      expect(entityType!.category).toBe('erd');
      expect(entityType!.family).toBe('entity');
    });

    it('should have rectangle shape', () => {
      const resolved = registry.resolveNodeType(ERDTypes.ENTITY);
      expect(resolved.defaultStyle?.shape).toBe('rectangle');
    });

    it('should have default size', () => {
      const resolved = registry.resolveNodeType(ERDTypes.ENTITY);
      expect(resolved.defaultSize).toBeDefined();
      expect(resolved.defaultSize?.width).toBeGreaterThan(0);
      expect(resolved.defaultSize?.height).toBeGreaterThan(0);
    });

    it('should have entity tag', () => {
      const resolved = registry.resolveNodeType(ERDTypes.ENTITY);
      expect(resolved.tags).toContain('entity');
    });

    it('should support multiple ports for relationships', () => {
      const resolved = registry.resolveNodeType(ERDTypes.ENTITY);
      expect(resolved.maxPorts).toBeGreaterThan(4);
    });
  });

  describe('Weak Entity Type', () => {
    beforeEach(() => {
      registerERDTypes(registry);
    });

    it('should extend Entity type', () => {
      const weakEntity = registry.getNodeType(ERDTypes.WEAK_ENTITY);
      expect(weakEntity!.extends).toBe(ERDTypes.ENTITY);
    });

    it('should have correct metadata', () => {
      const resolved = registry.resolveNodeType(ERDTypes.WEAK_ENTITY);
      expect(resolved.label).toBe('Weak Entity');
      expect(resolved.category).toBe('erd');
      expect(resolved.family).toBe('entity');
    });

    it('should have double border style', () => {
      const resolved = registry.resolveNodeType(ERDTypes.WEAK_ENTITY);
      expect(resolved.defaultStyle?.strokeWidth).toBeGreaterThan(2);
    });

    it('should have weak-entity tag', () => {
      const resolved = registry.resolveNodeType(ERDTypes.WEAK_ENTITY);
      expect(resolved.tags).toContain('weak-entity');
    });
  });

  describe('Relationship Type', () => {
    beforeEach(() => {
      registerERDTypes(registry);
    });

    it('should have correct metadata', () => {
      const relType = registry.getNodeType(ERDTypes.RELATIONSHIP);
      expect(relType).toBeDefined();
      expect(relType!.label).toBe('Relationship');
      expect(relType!.category).toBe('erd');
      expect(relType!.family).toBe('relationship');
    });

    it('should have diamond shape', () => {
      const resolved = registry.resolveNodeType(ERDTypes.RELATIONSHIP);
      expect(resolved.defaultStyle?.shape).toBe('diamond');
    });

    it('should support multiple connections (cardinality)', () => {
      const resolved = registry.resolveNodeType(ERDTypes.RELATIONSHIP);
      expect(resolved.maxPorts).toBeGreaterThanOrEqual(4);
    });

    it('should have relationship tag', () => {
      const resolved = registry.resolveNodeType(ERDTypes.RELATIONSHIP);
      expect(resolved.tags).toContain('relationship');
    });
  });

  describe('Weak Relationship Type', () => {
    beforeEach(() => {
      registerERDTypes(registry);
    });

    it('should extend Relationship type', () => {
      const weakRel = registry.getNodeType(ERDTypes.WEAK_RELATIONSHIP);
      expect(weakRel!.extends).toBe(ERDTypes.RELATIONSHIP);
    });

    it('should have correct metadata', () => {
      const resolved = registry.resolveNodeType(ERDTypes.WEAK_RELATIONSHIP);
      expect(resolved.label).toBe('Weak Relationship');
      expect(resolved.family).toBe('relationship');
    });

    it('should have double border for identifying relationship', () => {
      const resolved = registry.resolveNodeType(ERDTypes.WEAK_RELATIONSHIP);
      expect(resolved.defaultStyle?.strokeWidth).toBeGreaterThan(2);
    });
  });

  describe('Attribute Type', () => {
    beforeEach(() => {
      registerERDTypes(registry);
    });

    it('should have correct metadata', () => {
      const attrType = registry.getNodeType(ERDTypes.ATTRIBUTE);
      expect(attrType).toBeDefined();
      expect(attrType!.label).toBe('Attribute');
      expect(attrType!.category).toBe('erd');
      expect(attrType!.family).toBe('attribute');
    });

    it('should have ellipse/oval shape', () => {
      const resolved = registry.resolveNodeType(ERDTypes.ATTRIBUTE);
      expect(resolved.defaultStyle?.shape).toBe('ellipse');
    });

    it('should be smaller than entities', () => {
      const attrResolved = registry.resolveNodeType(ERDTypes.ATTRIBUTE);
      const entityResolved = registry.resolveNodeType(ERDTypes.ENTITY);

      expect(attrResolved.defaultSize!.width!).toBeLessThan(entityResolved.defaultSize!.width!);
    });

    it('should have attribute tag', () => {
      const resolved = registry.resolveNodeType(ERDTypes.ATTRIBUTE);
      expect(resolved.tags).toContain('attribute');
    });
  });

  describe('Key Attribute Type', () => {
    beforeEach(() => {
      registerERDTypes(registry);
    });

    it('should extend Attribute type', () => {
      const keyAttr = registry.getNodeType(ERDTypes.KEY_ATTRIBUTE);
      expect(keyAttr!.extends).toBe(ERDTypes.ATTRIBUTE);
    });

    it('should have underlined text style', () => {
      const resolved = registry.resolveNodeType(ERDTypes.KEY_ATTRIBUTE);
      expect(resolved.defaultStyle?.textDecoration).toBe('underline');
    });

    it('should have primary-key tag', () => {
      const resolved = registry.resolveNodeType(ERDTypes.KEY_ATTRIBUTE);
      expect(resolved.tags).toContain('primary-key');
    });
  });

  describe('Multivalued Attribute Type', () => {
    beforeEach(() => {
      registerERDTypes(registry);
    });

    it('should extend Attribute type', () => {
      const multiAttr = registry.getNodeType(ERDTypes.MULTIVALUED_ATTRIBUTE);
      expect(multiAttr!.extends).toBe(ERDTypes.ATTRIBUTE);
    });

    it('should have double border', () => {
      const resolved = registry.resolveNodeType(ERDTypes.MULTIVALUED_ATTRIBUTE);
      expect(resolved.defaultStyle?.strokeWidth).toBeGreaterThan(2);
    });

    it('should have multivalued tag', () => {
      const resolved = registry.resolveNodeType(ERDTypes.MULTIVALUED_ATTRIBUTE);
      expect(resolved.tags).toContain('multivalued');
    });
  });

  describe('Derived Attribute Type', () => {
    beforeEach(() => {
      registerERDTypes(registry);
    });

    it('should extend Attribute type', () => {
      const derivedAttr = registry.getNodeType(ERDTypes.DERIVED_ATTRIBUTE);
      expect(derivedAttr!.extends).toBe(ERDTypes.ATTRIBUTE);
    });

    it('should have dashed border', () => {
      const resolved = registry.resolveNodeType(ERDTypes.DERIVED_ATTRIBUTE);
      expect(resolved.defaultStyle?.strokeDasharray).toBeDefined();
    });

    it('should have derived tag', () => {
      const resolved = registry.resolveNodeType(ERDTypes.DERIVED_ATTRIBUTE);
      expect(resolved.tags).toContain('derived');
    });
  });

  describe('Composite Attribute Type', () => {
    beforeEach(() => {
      registerERDTypes(registry);
    });

    it('should extend Attribute type', () => {
      const compAttr = registry.getNodeType(ERDTypes.COMPOSITE_ATTRIBUTE);
      expect(compAttr!.extends).toBe(ERDTypes.ATTRIBUTE);
    });

    it('should have composite tag', () => {
      const resolved = registry.resolveNodeType(ERDTypes.COMPOSITE_ATTRIBUTE);
      expect(resolved.tags).toContain('composite');
    });

    it('should support child attributes', () => {
      const resolved = registry.resolveNodeType(ERDTypes.COMPOSITE_ATTRIBUTE);
      expect(resolved.maxPorts).toBeGreaterThan(2);
    });
  });

  describe('ISA Relationship Type', () => {
    beforeEach(() => {
      registerERDTypes(registry);
    });

    it('should have correct metadata', () => {
      const isaType = registry.getNodeType(ERDTypes.ISA_RELATIONSHIP);
      expect(isaType).toBeDefined();
      expect(isaType!.label).toBe('ISA');
      expect(isaType!.category).toBe('erd');
      expect(isaType!.family).toBe('inheritance');
    });

    it('should have triangle shape', () => {
      const resolved = registry.resolveNodeType(ERDTypes.ISA_RELATIONSHIP);
      expect(resolved.defaultStyle?.shape).toBe('triangle');
    });

    it('should have specialization tag', () => {
      const resolved = registry.resolveNodeType(ERDTypes.ISA_RELATIONSHIP);
      expect(resolved.tags).toContain('specialization');
    });
  });

  describe('Type Families', () => {
    beforeEach(() => {
      registerERDTypes(registry);
    });

    it('should group entity types', () => {
      const entities = registry.getNodeTypesByFamily('entity');
      expect(entities.length).toBeGreaterThanOrEqual(2);

      const entityIds = entities.map((t) => t.type);
      expect(entityIds).toContain(ERDTypes.ENTITY);
      expect(entityIds).toContain(ERDTypes.WEAK_ENTITY);
    });

    it('should group relationship types', () => {
      const relationships = registry.getNodeTypesByFamily('relationship');
      expect(relationships.length).toBeGreaterThanOrEqual(2);

      const relIds = relationships.map((t) => t.type);
      expect(relIds).toContain(ERDTypes.RELATIONSHIP);
      expect(relIds).toContain(ERDTypes.WEAK_RELATIONSHIP);
    });

    it('should group attribute types', () => {
      const attributes = registry.getNodeTypesByFamily('attribute');
      expect(attributes.length).toBeGreaterThanOrEqual(5);

      const attrIds = attributes.map((t) => t.type);
      expect(attrIds).toContain(ERDTypes.ATTRIBUTE);
      expect(attrIds).toContain(ERDTypes.KEY_ATTRIBUTE);
      expect(attrIds).toContain(ERDTypes.MULTIVALUED_ATTRIBUTE);
      expect(attrIds).toContain(ERDTypes.DERIVED_ATTRIBUTE);
      expect(attrIds).toContain(ERDTypes.COMPOSITE_ATTRIBUTE);
    });

    it('should group inheritance types', () => {
      const inheritance = registry.getNodeTypesByFamily('inheritance');
      expect(inheritance.length).toBeGreaterThanOrEqual(1);

      const isaIds = inheritance.map((t) => t.type);
      expect(isaIds).toContain(ERDTypes.ISA_RELATIONSHIP);
    });
  });

  describe('Type Tags', () => {
    beforeEach(() => {
      registerERDTypes(registry);
    });

    it('should find entity types by tag', () => {
      const entityTypes = registry.getNodeTypesByTag('entity');
      expect(entityTypes.length).toBeGreaterThanOrEqual(2);
    });

    it('should find weak entities by tag', () => {
      const weakEntities = registry.getNodeTypesByTag('weak-entity');
      expect(weakEntities.length).toBe(1);
      expect(weakEntities[0].type).toBe(ERDTypes.WEAK_ENTITY);
    });

    it('should find primary key attributes by tag', () => {
      const keyAttrs = registry.getNodeTypesByTag('primary-key');
      expect(keyAttrs.length).toBeGreaterThanOrEqual(1);
      expect(keyAttrs[0].type).toBe(ERDTypes.KEY_ATTRIBUTE);
    });

    it('should find multivalued attributes by tag', () => {
      const multiAttrs = registry.getNodeTypesByTag('multivalued');
      expect(multiAttrs.length).toBe(1);
    });

    it('should find derived attributes by tag', () => {
      const derivedAttrs = registry.getNodeTypesByTag('derived');
      expect(derivedAttrs.length).toBe(1);
    });
  });

  describe('Type Inheritance', () => {
    beforeEach(() => {
      registerERDTypes(registry);
    });

    it('should inherit properties from base Attribute to Key Attribute', () => {
      const baseAttr = registry.resolveNodeType(ERDTypes.ATTRIBUTE);
      const keyAttr = registry.resolveNodeType(ERDTypes.KEY_ATTRIBUTE);

      // Key attribute should inherit shape from base attribute
      expect(keyAttr.defaultStyle?.shape).toBe(baseAttr.defaultStyle?.shape);

      // But should have additional textDecoration
      expect(keyAttr.defaultStyle?.textDecoration).toBe('underline');
    });

    it('should inherit properties from Entity to Weak Entity', () => {
      const entity = registry.resolveNodeType(ERDTypes.ENTITY);
      const weakEntity = registry.resolveNodeType(ERDTypes.WEAK_ENTITY);

      // Should inherit shape
      expect(weakEntity.defaultStyle?.shape).toBe(entity.defaultStyle?.shape);

      // But should have thicker stroke
      expect(weakEntity.defaultStyle?.strokeWidth).toBeGreaterThan(entity.defaultStyle!.strokeWidth!);
    });

    it('should inherit properties from Relationship to Weak Relationship', () => {
      const rel = registry.resolveNodeType(ERDTypes.RELATIONSHIP);
      const weakRel = registry.resolveNodeType(ERDTypes.WEAK_RELATIONSHIP);

      // Should inherit shape
      expect(weakRel.defaultStyle?.shape).toBe(rel.defaultStyle?.shape);

      // But should have thicker stroke
      expect(weakRel.defaultStyle?.strokeWidth).toBeGreaterThan(rel.defaultStyle!.strokeWidth!);
    });
  });
});
