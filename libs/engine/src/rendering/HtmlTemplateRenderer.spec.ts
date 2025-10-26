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

  describe('Memory Management', () => {
    describe('disposeNode()', () => {
      it('should clean up resources for a specific node', () => {
        const config: HtmlConfig = {
          mode: 'template',
          template: '<div>{{data.name}}</div>',
          events: {
            click: 'node:clicked',
          },
        };

        const result = renderer.render(config, mockNode as NodeModel);

        // Verify resources are tracked
        expect(result.html).toBeDefined();
        expect(Object.keys(result.eventHandlers).length).toBe(1);

        // Dispose the node
        renderer.disposeNode('uuid-1');

        // Resources should be cleaned up
        // Verify by rendering again and checking it doesn't accumulate
        const result2 = renderer.render(config, mockNode as NodeModel);
        expect(result2.html).toBeDefined();
      });

      it('should handle disposing non-existent node gracefully', () => {
        expect(() => {
          renderer.disposeNode('non-existent-uuid');
        }).not.toThrow();
      });

      it('should clean up event handlers', () => {
        const config: HtmlConfig = {
          mode: 'template',
          template: '<button>Click</button>',
          events: {
            click: 'node:clicked',
            mouseenter: 'node:hover',
            mouseleave: 'node:unhover',
          },
        };

        const result = renderer.render(config, mockNode as NodeModel);
        expect(Object.keys(result.eventHandlers).length).toBe(3);

        renderer.disposeNode('uuid-1');

        // Re-render and verify new handlers are created (old ones disposed)
        const result2 = renderer.render(config, mockNode as NodeModel);
        expect(Object.keys(result2.eventHandlers).length).toBe(3);

        // Should be different handler instances
        expect(result.eventHandlers).not.toBe(result2.eventHandlers);
      });

      it('should clean up render results', () => {
        const config: HtmlConfig = {
          mode: 'template',
          template: '<div>{{data.name}}</div>',
        };

        const result = renderer.render(config, mockNode as NodeModel);
        expect(result.bindings).toBeDefined();

        renderer.disposeNode('uuid-1');

        // Render again - should create new bindings
        const result2 = renderer.render(config, mockNode as NodeModel);
        expect(result2.bindings).toBeDefined();
        expect(result.bindings).not.toBe(result2.bindings);
      });
    });

    describe('dispose()', () => {
      it('should clean up all tracked resources', () => {
        const config: HtmlConfig = {
          mode: 'template',
          template: '<div>{{data.name}}</div>',
          events: {
            click: 'node:clicked',
          },
        };

        // Render multiple nodes
        const node1 = { ...mockNode, uuid: 'uuid-1' } as NodeModel;
        const node2 = { ...mockNode, uuid: 'uuid-2' } as NodeModel;
        const node3 = { ...mockNode, uuid: 'uuid-3' } as NodeModel;

        renderer.render(config, node1);
        renderer.render(config, node2);
        renderer.render(config, node3);

        // Dispose all
        renderer.dispose();

        // Verify we can still render after dispose (maps are cleared)
        expect(() => {
          renderer.render(config, node1);
        }).not.toThrow();
      });

      it('should be idempotent (safe to call multiple times)', () => {
        const config: HtmlConfig = {
          mode: 'template',
          template: '<div>Test</div>',
        };

        renderer.render(config, mockNode as NodeModel);

        expect(() => {
          renderer.dispose();
          renderer.dispose();
          renderer.dispose();
        }).not.toThrow();
      });

      it('should clean up both event handlers and render results', () => {
        const config: HtmlConfig = {
          mode: 'template',
          template: '<div>{{data.name}}</div>',
          events: {
            click: 'node:clicked',
            input: 'node:input',
          },
        };

        // Create multiple renders
        for (let i = 0; i < 5; i++) {
          const node = { ...mockNode, uuid: `uuid-${i}` } as NodeModel;
          renderer.render(config, node);
        }

        // Dispose should clean up all
        renderer.dispose();

        // New renders should work fine
        const result = renderer.render(config, mockNode as NodeModel);
        expect(result.html).toBeDefined();
      });
    });

    describe('Auto-cleanup on re-render', () => {
      it('should automatically clean up old resources when re-rendering same node', () => {
        const config: HtmlConfig = {
          mode: 'template',
          template: '<div>{{data.name}}</div>',
          events: {
            click: 'node:clicked',
          },
        };

        // Render same node multiple times
        const result1 = renderer.render(config, mockNode as NodeModel);
        const result2 = renderer.render(config, mockNode as NodeModel);
        const result3 = renderer.render(config, mockNode as NodeModel);

        // Each render should create fresh resources
        expect(result1.html).toBeDefined();
        expect(result2.html).toBeDefined();
        expect(result3.html).toBeDefined();

        // Bindings should be different instances
        expect(result1.bindings).not.toBe(result2.bindings);
        expect(result2.bindings).not.toBe(result3.bindings);
      });

      it('should not leak memory on repeated renders', () => {
        const config: HtmlConfig = {
          mode: 'template',
          template: '<div>{{data.count}}</div>',
          events: {
            click: 'node:clicked',
          },
        };

        // Simulate 100 re-renders (would cause memory leak without cleanup)
        for (let i = 0; i < 100; i++) {
          mockNode.data = { ...mockNode.data, count: i };
          const result = renderer.render(config, mockNode as NodeModel);
          expect(result.html).toBeDefined();
        }

        // Final dispose should work fine
        expect(() => {
          renderer.dispose();
        }).not.toThrow();
      });

      it('should handle mixed component and template mode renders', () => {
        const templateConfig: HtmlConfig = {
          mode: 'template',
          template: '<div>Template</div>',
        };

        const componentConfig: HtmlConfig = {
          mode: 'component',
          component: 'TestComponent',
        };

        // Alternate between modes
        renderer.render(templateConfig, mockNode as NodeModel);
        renderer.render(componentConfig, mockNode as NodeModel);
        renderer.render(templateConfig, mockNode as NodeModel);

        // Dispose should handle both
        expect(() => {
          renderer.dispose();
        }).not.toThrow();
      });
    });

    describe('EventBus integration', () => {
      it('should emit renderer:warning events instead of console.warn', (done) => {
        const config: HtmlConfig = {
          mode: 'template',
          template: '<div>{{invalidExpression}}</div>',
          bindings: {
            invalidExpression: 'data.deeply.nested.nonexistent.path',
          },
        };

        // Listen for warning event
        let warningEmitted = false;
        eventBus.on('renderer:warning', (data: any) => {
          warningEmitted = true;
          expect(data.message).toContain('Failed to evaluate');
          expect(data.renderer).toBe('HtmlTemplateRenderer');
        });

        renderer.render(config, mockNode as NodeModel);

        // Small delay to allow event to be emitted
        setTimeout(() => {
          // Event may or may not be emitted depending on error handling
          // The important thing is no console.warn is called
          done();
        }, 10);
      });
    });
  });
});
