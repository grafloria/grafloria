// TypeRegistry Template Support Tests (Phase 2)

import { TypeRegistry, NodeTypeDefinition } from './TypeRegistry';

describe('TypeRegistry - Template Support (Phase 2)', () => {
  let registry: TypeRegistry;

  beforeEach(() => {
    registry = new TypeRegistry();
  });

  describe('Template Reference', () => {
    it('should store template ID in node type definition', () => {
      const typeDef: NodeTypeDefinition = {
        type: 'erd-table',
        label: 'ERD Table',
        templateId: 'erd:table',
      };

      registry.registerNodeType(typeDef);

      const retrieved = registry.getNodeType('erd-table');
      expect(retrieved?.templateId).toBe('erd:table');
    });

    it('should support types without template ID (backward compatibility)', () => {
      const typeDef: NodeTypeDefinition = {
        type: 'simple-node',
        label: 'Simple Node',
      };

      registry.registerNodeType(typeDef);

      const retrieved = registry.getNodeType('simple-node');
      expect(retrieved?.templateId).toBeUndefined();
    });
  });

  describe('Default Port Rendering', () => {
    it('should store default port rendering config', () => {
      const typeDef: NodeTypeDefinition = {
        type: 'workflow-process',
        label: 'Process Node',
        defaultPortRendering: {
          mode: 'html',
          size: { width: 12, height: 12 },
          visibility: 'on-hover',
        },
      };

      registry.registerNodeType(typeDef);

      const retrieved = registry.getNodeType('workflow-process');
      expect(retrieved?.defaultPortRendering).toEqual({
        mode: 'html',
        size: { width: 12, height: 12 },
        visibility: 'on-hover',
      });
    });

    it('should inherit default port rendering from parent type', () => {
      const parentDef: NodeTypeDefinition = {
        type: 'base-node',
        label: 'Base Node',
        defaultPortRendering: {
          mode: 'svg',
          visibility: 'always',
        },
      };

      const childDef: NodeTypeDefinition = {
        type: 'child-node',
        label: 'Child Node',
        extends: 'base-node',
      };

      registry.registerNodeType(parentDef);
      registry.registerNodeType(childDef);

      const resolved = registry.resolveNodeType('child-node');
      expect(resolved.defaultPortRendering).toEqual({
        mode: 'svg',
        visibility: 'always',
      });
    });

    it('should allow child to override parent port rendering', () => {
      const parentDef: NodeTypeDefinition = {
        type: 'base-node',
        label: 'Base Node',
        defaultPortRendering: {
          mode: 'svg',
          visibility: 'always',
        },
      };

      const childDef: NodeTypeDefinition = {
        type: 'child-node',
        label: 'Child Node',
        extends: 'base-node',
        defaultPortRendering: {
          mode: 'html',
          visibility: 'on-hover',
        },
      };

      registry.registerNodeType(parentDef);
      registry.registerNodeType(childDef);

      const resolved = registry.resolveNodeType('child-node');
      expect(resolved.defaultPortRendering).toEqual({
        mode: 'html',
        visibility: 'on-hover',
      });
    });
  });

  describe('Template Integration', () => {
    it('should resolve type with template ID preserved', () => {
      const parentDef: NodeTypeDefinition = {
        type: 'base',
        label: 'Base',
        templateId: 'base-template',
      };

      const childDef: NodeTypeDefinition = {
        type: 'child',
        label: 'Child',
        extends: 'base',
        templateId: 'child-template',
      };

      registry.registerNodeType(parentDef);
      registry.registerNodeType(childDef);

      const resolved = registry.resolveNodeType('child');
      expect(resolved.templateId).toBe('child-template');
    });

    it('should inherit template ID if child does not specify one', () => {
      const parentDef: NodeTypeDefinition = {
        type: 'base',
        label: 'Base',
        templateId: 'base-template',
      };

      const childDef: NodeTypeDefinition = {
        type: 'child',
        label: 'Child',
        extends: 'base',
      };

      registry.registerNodeType(parentDef);
      registry.registerNodeType(childDef);

      const resolved = registry.resolveNodeType('child');
      expect(resolved.templateId).toBe('base-template');
    });
  });

  describe('Query by Template', () => {
    it('should find all types using a specific template', () => {
      registry.registerNodeType({
        type: 'table-1',
        label: 'Table 1',
        templateId: 'erd:table',
      });

      registry.registerNodeType({
        type: 'table-2',
        label: 'Table 2',
        templateId: 'erd:table',
      });

      registry.registerNodeType({
        type: 'process-1',
        label: 'Process 1',
        templateId: 'workflow:process',
      });

      const erdTables = registry.getNodeTypesByTemplate('erd:table');
      expect(erdTables.length).toBe(2);
      expect(erdTables.map(t => t.type)).toContain('table-1');
      expect(erdTables.map(t => t.type)).toContain('table-2');
    });

    it('should return empty array if no types use template', () => {
      registry.registerNodeType({
        type: 'simple',
        label: 'Simple',
      });

      const types = registry.getNodeTypesByTemplate('non-existent');
      expect(types.length).toBe(0);
    });

    it('should find types using template through inheritance', () => {
      registry.registerNodeType({
        type: 'base',
        label: 'Base',
        templateId: 'base-template',
      });

      registry.registerNodeType({
        type: 'child',
        label: 'Child',
        extends: 'base',
      });

      const types = registry.getNodeTypesByTemplate('base-template');
      expect(types.length).toBe(2);
      expect(types.map(t => t.type)).toContain('base');
      expect(types.map(t => t.type)).toContain('child');
    });
  });

  describe('Backward Compatibility', () => {
    it('should work with types that do not use templates', () => {
      const typeDef: NodeTypeDefinition = {
        type: 'legacy-node',
        label: 'Legacy Node',
        defaultData: { value: 42 },
      };

      registry.registerNodeType(typeDef);

      const resolved = registry.resolveNodeType('legacy-node');
      expect(resolved.type).toBe('legacy-node');
      expect(resolved.templateId).toBeUndefined();
      expect(resolved.defaultPortRendering).toBeUndefined();
    });

    it('should resolve inherited types without template fields', () => {
      registry.registerNodeType({
        type: 'parent',
        label: 'Parent',
        defaultData: { x: 1 },
      });

      registry.registerNodeType({
        type: 'child',
        label: 'Child',
        extends: 'parent',
        defaultData: { y: 2 },
      });

      const resolved = registry.resolveNodeType('child');
      expect(resolved.defaultData).toEqual({ x: 1, y: 2 });
      expect(resolved.templateId).toBeUndefined();
    });
  });
});
