/**
 * NodeFactory Tests - TDD Approach
 */

// Mock nanoid
let idCounter = 0;
jest.mock('nanoid', () => ({
  nanoid: (size?: number) => 'test-id-' + (idCounter++).toString().padStart(12, '0'),
}));

import { NodeFactory } from './NodeFactory';
import { TemplateRegistry } from './TemplateRegistry';
import { NodeTemplate } from './NodeTemplate';
import { DiagramModel } from '../models/DiagramModel';
import { EventBus } from '../events/EventBus';

describe('NodeFactory', () => {
  let factory: NodeFactory;
  let registry: TemplateRegistry;
  let diagram: DiagramModel;
  let eventBus: EventBus;

  const simpleTemplate: NodeTemplate = {
    id: 'simple-node',
    version: '1.0.0',
    meta: {
      name: 'Simple Node',
      category: 'test',
    },
    structure: {
      type: 'container',
      size: { width: 200, height: 100 },
    },
  };

  const templateWithPorts: NodeTemplate = {
    id: 'node-with-ports',
    version: '1.0.0',
    meta: {
      name: 'Node With Ports',
      category: 'test',
    },
    structure: {
      type: 'process',
      size: { width: 180, height: 80 },
      ports: {
        enabled: true,
        top: { enabled: true, type: 'input' },
        bottom: { enabled: true, type: 'output' },
        left: { enabled: false },
        right: { enabled: false },
      },
    },
  };

  const templateWithChildren: NodeTemplate = {
    id: 'node-with-children',
    version: '1.0.0',
    meta: {
      name: 'Node With Children',
      category: 'test',
    },
    structure: {
      type: 'container',
      size: { width: 300, height: 'auto' },
      layout: {
        type: 'flexbox',
        direction: 'column',
        gap: 8,
      },
      children: [
        {
          type: 'header',
          size: { width: '100%', height: 40 },
        },
        {
          type: 'body',
          size: { width: '100%', height: 60 },
        },
      ],
    },
  };

  beforeEach(() => {
    idCounter = 0;
    eventBus = new EventBus();
    diagram = new DiagramModel();
    registry = new TemplateRegistry(eventBus);
    factory = new NodeFactory(registry, diagram);
  });

  describe('createFromTemplate', () => {
    it('should throw error if template not found', () => {
      expect(() => {
        factory.createFromTemplate('non-existent', {}, { x: 0, y: 0 });
      }).toThrow('Template not found');
    });

    it('should create node from simple template', () => {
      registry.register(simpleTemplate);

      const node = factory.createFromTemplate(
        'simple-node',
        { label: 'Test Node' },
        { x: 100, y: 100 }
      );

      expect(node).toBeDefined();
      expect(node.type).toBe('container');
      expect(node.position).toEqual({ x: 100, y: 100, z: 0 });
      expect(node.size).toEqual({ width: 200, height: 100, depth: 0 });
    });

    it('should store template metadata in node', () => {
      registry.register(simpleTemplate);

      const node = factory.createFromTemplate(
        'simple-node',
        {},
        { x: 0, y: 0 }
      );

      expect(node.getMetadata('templateId')).toBe('simple-node');
      expect(node.getMetadata('templateVersion')).toBe('1.0.0');
    });

    it('should merge user data with default data', () => {
      const templateWithDefaults: NodeTemplate = {
        ...simpleTemplate,
        id: 'with-defaults',
        defaultData: {
          title: 'Default Title',
          count: 0,
        },
      };
      registry.register(templateWithDefaults);

      const node = factory.createFromTemplate(
        'with-defaults',
        { title: 'Custom Title', value: 42 },
        { x: 0, y: 0 }
      );

      expect(node.data.title).toBe('Custom Title'); // User override
      expect(node.data.count).toBe(0); // Default
      expect(node.data.value).toBe(42); // User data
    });

    it('should add node to diagram', () => {
      registry.register(simpleTemplate);

      const node = factory.createFromTemplate(
        'simple-node',
        {},
        { x: 0, y: 0 }
      );

      expect(diagram.getNode(node.id)).toBe(node);
    });
  });

  describe('Port Creation', () => {
    it('should create default 4 ports when ports not specified', () => {
      registry.register(simpleTemplate);

      const node = factory.createFromTemplate(
        'simple-node',
        {},
        { x: 0, y: 0 }
      );

      const ports = node.getPorts();
      expect(ports.length).toBe(4);

      const sides = ports.map(p => p.side);
      expect(sides).toContain('top');
      expect(sides).toContain('right');
      expect(sides).toContain('bottom');
      expect(sides).toContain('left');
    });

    it('should clear default ports when template specifies custom ports', () => {
      registry.register(templateWithPorts);

      const node = factory.createFromTemplate(
        'node-with-ports',
        {},
        { x: 0, y: 0 }
      );

      const ports = node.getPorts();

      // Should only have top and bottom (left/right disabled)
      expect(ports.length).toBe(2);

      const sides = ports.map(p => p.side);
      expect(sides).toContain('top');
      expect(sides).toContain('bottom');
      expect(sides).not.toContain('left');
      expect(sides).not.toContain('right');
    });

    it('should set correct port types', () => {
      registry.register(templateWithPorts);

      const node = factory.createFromTemplate(
        'node-with-ports',
        {},
        { x: 0, y: 0 }
      );

      const topPort = node.getPortBySide('top');
      const bottomPort = node.getPortBySide('bottom');

      expect(topPort?.type).toBe('input');
      expect(bottomPort?.type).toBe('output');
    });
  });

  describe('Hierarchy Creation', () => {
    it('should create child nodes', () => {
      registry.register(templateWithChildren);

      const node = factory.createFromTemplate(
        'node-with-children',
        {},
        { x: 0, y: 0 }
      );

      const children = node.getChildren();
      expect(children.length).toBe(2);
    });

    it('should set parent-child relationships', () => {
      registry.register(templateWithChildren);

      const parent = factory.createFromTemplate(
        'node-with-children',
        {},
        { x: 0, y: 0 }
      );

      const children = parent.getChildren();

      children.forEach(child => {
        expect(child.parentId).toBe(parent.id);
        expect(parent.children.has(child.id)).toBe(true);
      });
    });

    it('should set child positioning mode to layout', () => {
      registry.register(templateWithChildren);

      const parent = factory.createFromTemplate(
        'node-with-children',
        {},
        { x: 0, y: 0 }
      );

      const children = parent.getChildren();

      children.forEach(child => {
        expect(child.positionMode).toBe('layout');
      });
    });

    it('should add all children to diagram', () => {
      registry.register(templateWithChildren);

      const parent = factory.createFromTemplate(
        'node-with-children',
        {},
        { x: 0, y: 0 }
      );

      const children = parent.getChildren();

      children.forEach(child => {
        expect(diagram.getNode(child.id)).toBe(child);
      });
    });
  });

  describe('HTML Configuration', () => {
    it('should set useHTMLLayer metadata when HTML component specified', () => {
      const htmlTemplate: NodeTemplate = {
        ...simpleTemplate,
        id: 'html-node',
        structure: {
          ...simpleTemplate.structure,
          html: {
            component: 'custom-component',
          },
        },
      };
      registry.register(htmlTemplate);

      const node = factory.createFromTemplate(
        'html-node',
        {},
        { x: 0, y: 0 }
      );

      expect(node.getMetadata('useHTMLLayer')).toBe(true);
    });

    it('should store HTML configuration in node data', () => {
      const htmlTemplate: NodeTemplate = {
        ...simpleTemplate,
        id: 'html-node',
        structure: {
          ...simpleTemplate.structure,
          html: {
            component: 'test-component',
            className: 'test-class',
          },
        },
      };
      registry.register(htmlTemplate);

      const node = factory.createFromTemplate(
        'html-node',
        {},
        { x: 0, y: 0 }
      );

      const htmlConfig = node.data._html;
      expect(htmlConfig).toBeDefined();
      expect(htmlConfig.component).toBe('test-component');
      expect(htmlConfig.className).toBe('test-class');
    });
  });

  describe('Behavior Configuration', () => {
    it('should set node behavior from template', () => {
      const behaviorTemplate: NodeTemplate = {
        ...simpleTemplate,
        id: 'behavior-node',
        structure: {
          ...simpleTemplate.structure,
          behavior: {
            draggable: false,
            selectable: true,
            connectable: false,
          },
        },
      };
      registry.register(behaviorTemplate);

      const node = factory.createFromTemplate(
        'behavior-node',
        {},
        { x: 0, y: 0 }
      );

      expect(node.behavior.draggable).toBe(false);
      expect(node.behavior.selectable).toBe(true);
      expect(node.behavior.connectable).toBe(false);
    });
  });

  describe('Data Binding', () => {
    it('should apply data bindings to node data', () => {
      const bindingTemplate: NodeTemplate = {
        ...simpleTemplate,
        id: 'binding-node',
        structure: {
          ...simpleTemplate.structure,
          dataBind: {
            bindings: {
              'data.title': 'label',
              'data.count': 'value',
            },
          },
        },
      };
      registry.register(bindingTemplate);

      const node = factory.createFromTemplate(
        'binding-node',
        { title: 'My Title', count: 42 },
        { x: 0, y: 0 }
      );

      expect(node.data.label).toBe('My Title');
      expect(node.data.value).toBe(42);
    });
  });
});
