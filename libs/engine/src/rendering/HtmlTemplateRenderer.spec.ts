// HTML Template Renderer Tests (Phase 3.4)
// Tests for LemonadeJS template rendering with EventBus integration

import { HtmlTemplateRenderer } from './HtmlTemplateRenderer';
import { EventBus } from '../events/EventBus';
import type { HtmlConfig } from '../templates/NodeTemplate';
import type { NodeModel } from '../models/NodeModel';

describe('HtmlTemplateRenderer (Phase 3.4)', () => {
  let renderer: HtmlTemplateRenderer;
  let eventBus: EventBus;
  let mockNode: Partial<NodeModel>;

  beforeEach(() => {
    eventBus = new EventBus();
    renderer = new HtmlTemplateRenderer(eventBus);

    // Mock node
    mockNode = {
      id: 'test-node-1',
      uuid: 'uuid-1',
      data: {
        name: 'Test Node',
        count: 42,
        user: {
          firstName: 'John',
          lastName: 'Doe',
        },
        items: ['apple', 'banana', 'cherry'],
      },
      getMetadata: jest.fn((key: string) => {
        if (key === 'label') return 'Test Label';
        return undefined;
      }),
      setData: jest.fn((path: string, value: any) => {
        // Update mock data
        const keys = path.split('.');
        let current: any = mockNode.data;
        for (let i = 0; i < keys.length - 1; i++) {
          current = current[keys[i]];
        }
        current[keys[keys.length - 1]] = value;
      }),
    } as any;
  });

  describe('Basic Template Rendering', () => {
    it('should render simple template', () => {
      const config: HtmlConfig = {
        mode: 'template',
        template: '<div>Hello World</div>',
      };

      const result = renderer.render(config, mockNode as NodeModel);

      expect(result.html).toContain('Hello World');
    });

    it('should render template with data binding', () => {
      const config: HtmlConfig = {
        mode: 'template',
        template: '<div>{{data.name}}</div>',
      };

      const result = renderer.render(config, mockNode as NodeModel);

      expect(result.html).toContain('Test Node');
    });

    it('should render nested data bindings', () => {
      const config: HtmlConfig = {
        mode: 'template',
        template: '<div>{{data.user.firstName}} {{data.user.lastName}}</div>',
      };

      const result = renderer.render(config, mockNode as NodeModel);

      expect(result.html).toContain('John Doe');
    });

    it('should apply className', () => {
      const config: HtmlConfig = {
        mode: 'template',
        template: '<div>Content</div>',
        className: 'custom-class another-class',
      };

      const result = renderer.render(config, mockNode as NodeModel);

      expect(result.html).toContain('class=');
      expect(result.html).toContain('custom-class');
      expect(result.html).toContain('another-class');
    });

    it('should apply inline styles', () => {
      const config: HtmlConfig = {
        mode: 'template',
        template: '<div>Content</div>',
        style: {
          color: 'red',
          fontSize: '16px',
          backgroundColor: '#fff',
        },
      };

      const result = renderer.render(config, mockNode as NodeModel);

      expect(result.html).toContain('style=');
      expect(result.html).toContain('color');
      expect(result.html).toContain('red');
    });

    it('should handle array className', () => {
      const config: HtmlConfig = {
        mode: 'template',
        template: '<div>Content</div>',
        className: ['class1', 'class2', 'class3'],
      };

      const result = renderer.render(config, mockNode as NodeModel);

      expect(result.html).toContain('class1');
      expect(result.html).toContain('class2');
      expect(result.html).toContain('class3');
    });
  });

  describe('Event Integration', () => {
    it('should register click event handler', () => {
      const config: HtmlConfig = {
        mode: 'template',
        template: '<button>Click Me</button>',
        events: {
          click: 'node:clicked',
        },
      };

      const result = renderer.render(config, mockNode as NodeModel);

      expect(result.eventHandlers).toBeDefined();
      expect(result.eventHandlers['click']).toBeDefined();
    });

    it('should emit event through EventBus when handler is called', (done) => {
      const config: HtmlConfig = {
        mode: 'template',
        template: '<button>Click Me</button>',
        events: {
          click: 'node:clicked',
        },
      };

      const result = renderer.render(config, mockNode as NodeModel);

      // Subscribe to the event
      eventBus.on('node:clicked', (data: any) => {
        expect(data.nodeId).toBe('test-node-1');
        expect(data.nodeUuid).toBe('uuid-1');
        done();
      });

      // Simulate click event
      const mockEvent = { type: 'click', target: {} };
      result.eventHandlers['click'](mockEvent);
    });

    it('should pass event data to EventBus', (done) => {
      const config: HtmlConfig = {
        mode: 'template',
        template: '<input />',
        events: {
          input: 'node:valueChanged',
        },
      };

      const result = renderer.render(config, mockNode as NodeModel);

      eventBus.on('node:valueChanged', (data: any) => {
        expect(data.nodeId).toBe('test-node-1');
        expect(data.event).toBeDefined();
        expect(data.event.type).toBe('input');
        done();
      });

      const mockEvent = { type: 'input', target: { value: 'new value' } };
      result.eventHandlers['input'](mockEvent);
    });

    it('should support multiple event handlers', () => {
      const config: HtmlConfig = {
        mode: 'template',
        template: '<div>Content</div>',
        events: {
          click: 'node:clicked',
          mouseenter: 'node:hovered',
          mouseleave: 'node:unhovered',
        },
      };

      const result = renderer.render(config, mockNode as NodeModel);

      expect(result.eventHandlers['click']).toBeDefined();
      expect(result.eventHandlers['mouseenter']).toBeDefined();
      expect(result.eventHandlers['mouseleave']).toBeDefined();
    });

    it('should include node metadata in event payload', (done) => {
      const config: HtmlConfig = {
        mode: 'template',
        template: '<button>Click</button>',
        events: {
          click: 'node:clicked',
        },
      };

      const result = renderer.render(config, mockNode as NodeModel);

      eventBus.on('node:clicked', (data: any) => {
        expect(data.nodeId).toBe('test-node-1');
        expect(data.nodeUuid).toBe('uuid-1');
        expect(data.nodeData).toBeDefined();
        expect(data.nodeData.name).toBe('Test Node');
        done();
      });

      const mockEvent = { type: 'click', target: {} };
      result.eventHandlers["click"](mockEvent);
    });
  });

  describe('Data Bindings', () => {
    it('should apply custom bindings', () => {
      const config: HtmlConfig = {
        mode: 'template',
        template: '<div>{{userName}}</div>',
        bindings: {
          userName: 'data.user.firstName',
        },
      };

      const result = renderer.render(config, mockNode as NodeModel);

      expect(result.bindings).toBeDefined();
      expect(result.bindings["userName"]).toBe('John');
    });

    it('should support computed bindings', () => {
      const config: HtmlConfig = {
        mode: 'template',
        template: '<div>{{itemCount}}</div>',
        bindings: {
          itemCount: 'data.items.length',
        },
      };

      const result = renderer.render(config, mockNode as NodeModel);

      expect(result.bindings["itemCount"]).toBe(3);
    });

    it('should merge data and bindings', () => {
      const config: HtmlConfig = {
        mode: 'template',
        template: '<div>{{fullName}} - {{itemCount}}</div>',
        bindings: {
          fullName: 'data.user.firstName',
          itemCount: 'data.items.length',
        },
      };

      const result = renderer.render(config, mockNode as NodeModel);

      expect(result.bindings["fullName"]).toBe('John');
      expect(result.bindings["itemCount"]).toBe(3);
    });
  });

  describe('Configuration Options', () => {
    it('should set z-index', () => {
      const config: HtmlConfig = {
        mode: 'template',
        template: '<div>Content</div>',
        zIndex: 100,
      };

      const result = renderer.render(config, mockNode as NodeModel);

      expect(result.zIndex).toBe(100);
    });

    it('should set pointer events', () => {
      const config: HtmlConfig = {
        mode: 'template',
        template: '<div>Content</div>',
        pointerEvents: false,
      };

      const result = renderer.render(config, mockNode as NodeModel);

      expect(result.pointerEvents).toBe(false);
    });

    it('should default pointer events to true', () => {
      const config: HtmlConfig = {
        mode: 'template',
        template: '<div>Content</div>',
      };

      const result = renderer.render(config, mockNode as NodeModel);

      expect(result.pointerEvents).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing template gracefully', () => {
      const config: HtmlConfig = {
        mode: 'template',
        // No template provided
      };

      expect(() => {
        renderer.render(config, mockNode as NodeModel);
      }).toThrow();
    });

    it('should handle invalid binding paths', () => {
      const config: HtmlConfig = {
        mode: 'template',
        template: '<div>{{value}}</div>',
        bindings: {
          value: 'data.nonexistent.path',
        },
      };

      const result = renderer.render(config, mockNode as NodeModel);

      // Should not throw, should return undefined
      expect(result.bindings["value"]).toBeUndefined();
    });

    it('should validate config mode', () => {
      const config: HtmlConfig = {
        // mode not specified, component not provided, template not provided
      };

      expect(() => {
        renderer.render(config, mockNode as NodeModel);
      }).toThrow();
    });
  });

  describe('Component Mode Compatibility', () => {
    it('should support component mode', () => {
      const config: HtmlConfig = {
        mode: 'component',
        component: 'UserAvatarComponent',
      };

      const result = renderer.render(config, mockNode as NodeModel);

      expect(result.componentRef).toBe('UserAvatarComponent');
      expect(result.mode).toBe('component');
    });

    it('should pass through component config without rendering', () => {
      const config: HtmlConfig = {
        mode: 'component',
        component: 'CustomComponent',
        className: 'custom-class',
        style: { color: 'blue' },
      };

      const result = renderer.render(config, mockNode as NodeModel);

      expect(result.mode).toBe('component');
      expect(result.componentRef).toBe('CustomComponent');
      expect(result.className).toBeDefined();
      expect(result.style).toBeDefined();
    });
  });

  describe('Backward Compatibility', () => {
    it('should default to component mode if component is specified', () => {
      const config: HtmlConfig = {
        component: 'SomeComponent',
        // mode not explicitly set
      };

      const result = renderer.render(config, mockNode as NodeModel);

      expect(result.mode).toBe('component');
    });

    it('should default to template mode if template is specified', () => {
      const config: HtmlConfig = {
        template: '<div>Test</div>',
        // mode not explicitly set
      };

      const result = renderer.render(config, mockNode as NodeModel);

      expect(result.mode).toBe('template');
    });
  });
});
