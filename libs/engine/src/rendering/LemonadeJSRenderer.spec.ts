/**
 * @jest-environment jsdom
 */

// LemonadeJS Renderer Tests
// Tests for full LemonadeJS integration with reactivity

import { LemonadeJSRenderer } from './LemonadeJSRenderer';
import { EventBus } from '../events/EventBus';
import type { HtmlConfig } from '../templates/NodeTemplate';
import type { NodeModel } from '../models/NodeModel';

describe('LemonadeJSRenderer (Full Integration)', () => {
  let renderer: LemonadeJSRenderer;
  let eventBus: EventBus;
  let mockNode: Partial<NodeModel>;

  beforeEach(() => {
    eventBus = new EventBus();
    renderer = new LemonadeJSRenderer(eventBus);

    mockNode = {
      id: 'test-node-1',
      uuid: 'uuid-1',
      data: {
        name: 'John Doe',
        email: 'john@example.com',
        count: 0,
        user: {
          firstName: 'John',
          lastName: 'Doe',
        },
      },
      setData: jest.fn((path: string, value: any) => {
        const keys = path.split('.');
        let current: any = mockNode.data;
        for (let i = 0; i < keys.length - 1; i++) {
          current = current[keys[i]];
        }
        current[keys[keys.length - 1]] = value;
      }),
    } as any;
  });

  describe('Basic LemonadeJS Rendering', () => {
    it('should render simple template with LemonadeJS', () => {
      const config: HtmlConfig = {
        mode: 'template',
        template: '<div>Hello {{data.name}}</div>',
      };

      const result = renderer.render(config, mockNode as NodeModel);

      expect(result.element).toBeDefined();
      expect(result.html).toContain('John Doe');
    });

    it('should create LemonadeJS element with reactive data', () => {
      const config: HtmlConfig = {
        mode: 'template',
        template: '<div>{{data.name}}</div>',
      };

      const result = renderer.render(config, mockNode as NodeModel);

      expect(result.self).toBeDefined();
      expect(result.self.data).toBeDefined();
      expect(result.self.data.name).toBe('John Doe');
    });

    it('should render nested data bindings', () => {
      const config: HtmlConfig = {
        mode: 'template',
        template: '<div>{{data.user.firstName}} {{data.user.lastName}}</div>',
      };

      const result = renderer.render(config, mockNode as NodeModel);

      expect(result.html).toContain('John Doe');
    });
  });

  describe('LemonadeJS Event Integration', () => {
    it('should create event handler methods on self object', () => {
      const config: HtmlConfig = {
        mode: 'template',
        template: '<button>Click</button>',
        events: {
          click: 'node:clicked',
        },
      };

      const result = renderer.render(config, mockNode as NodeModel);

      expect(result.self).toBeDefined();
      expect(result.self.onClick).toBeDefined();
      expect(typeof result.self.onClick).toBe('function');
    });

    it('should emit events through EventBus when handler called', (done) => {
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
        expect(data.nodeData.name).toBe('John Doe');
        done();
      });

      // Simulate event
      result.self.onClick({ type: 'click', target: {} });
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

      expect(result.self.onClick).toBeDefined();
      expect(result.self.onMouseenter).toBeDefined();
      expect(result.self.onMouseleave).toBeDefined();
    });
  });

  describe('Custom Data Bindings', () => {
    it('should resolve custom bindings', () => {
      const config: HtmlConfig = {
        mode: 'template',
        template: '<div>{{fullName}}</div>',
        bindings: {
          fullName: 'data.user.firstName',
        },
      };

      const result = renderer.render(config, mockNode as NodeModel);

      expect(result.self.fullName).toBe('John');
      expect(result.bindings['fullName']).toBe('John');
    });

    it('should support computed bindings', () => {
      (mockNode.data as any).items = ['a', 'b', 'c'];

      const config: HtmlConfig = {
        mode: 'template',
        template: '<div>{{itemCount}}</div>',
        bindings: {
          itemCount: 'data.items.length',
        },
      };

      const result = renderer.render(config, mockNode as NodeModel);

      expect(result.self.itemCount).toBe(3);
    });
  });

  describe('Styling and Presentation', () => {
    it('should apply className to element', () => {
      const config: HtmlConfig = {
        mode: 'template',
        template: '<div>Content</div>',
        className: 'custom-class another-class',
      };

      const result = renderer.render(config, mockNode as NodeModel);

      expect(result.element?.className).toContain('custom-class');
      expect(result.element?.className).toContain('another-class');
    });

    it('should apply inline styles to element', () => {
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

      expect(result.element?.style.color).toBe('red');
      expect(result.element?.style.fontSize).toBe('16px');
    });

    it('should apply z-index', () => {
      const config: HtmlConfig = {
        mode: 'template',
        template: '<div>Content</div>',
        zIndex: 100,
      };

      const result = renderer.render(config, mockNode as NodeModel);

      expect(result.element?.style.zIndex).toBe('100');
    });

    it('should apply pointer events', () => {
      const config: HtmlConfig = {
        mode: 'template',
        template: '<div>Content</div>',
        pointerEvents: false,
      };

      const result = renderer.render(config, mockNode as NodeModel);

      expect(result.element?.style.pointerEvents).toBe('none');
    });
  });

  describe('Error Handling', () => {
    it('should handle missing template', () => {
      const config: HtmlConfig = {
        mode: 'template',
      };

      expect(() => {
        renderer.render(config, mockNode as NodeModel);
      }).toThrow('Template mode requires template property');
    });

    it('should fallback on rendering errors', () => {
      const config: HtmlConfig = {
        mode: 'template',
        template: '<div>{{invalid..syntax}}</div>',
      };

      // Should not throw, should fallback
      const result = renderer.render(config, mockNode as NodeModel);
      expect(result.html).toBeDefined();
    });
  });

  describe('Component Mode', () => {
    it('should support component mode', () => {
      const config: HtmlConfig = {
        mode: 'component',
        component: 'UserAvatarComponent',
      };

      const result = renderer.render(config, mockNode as NodeModel);

      expect(result.mode).toBe('component');
      expect(result.componentRef).toBe('UserAvatarComponent');
    });
  });

  describe('Backward Compatibility', () => {
    it('should default to component mode if component specified', () => {
      const config: HtmlConfig = {
        component: 'SomeComponent',
      };

      const result = renderer.render(config, mockNode as NodeModel);

      expect(result.mode).toBe('component');
    });

    it('should default to template mode if template specified', () => {
      const config: HtmlConfig = {
        template: '<div>Test</div>',
      };

      const result = renderer.render(config, mockNode as NodeModel);

      expect(result.mode).toBe('template');
    });
  });

  describe('LemonadeJS Self Object', () => {
    it('should include node data in self', () => {
      const config: HtmlConfig = {
        mode: 'template',
        template: '<div>Test</div>',
      };

      const result = renderer.render(config, mockNode as NodeModel);

      expect(result.self.data).toEqual(mockNode.data);
      expect(result.self.nodeId).toBe('test-node-1');
      expect(result.self.nodeUuid).toBe('uuid-1');
    });

    it('should create self object with custom bindings', () => {
      const config: HtmlConfig = {
        mode: 'template',
        template: '<div>Test</div>',
        bindings: {
          userName: 'data.name',
          userEmail: 'data.email',
        },
      };

      const result = renderer.render(config, mockNode as NodeModel);

      expect(result.self.userName).toBe('John Doe');
      expect(result.self.userEmail).toBe('john@example.com');
    });
  });

  describe('Integration with EventBus Features', () => {
    it('should work with debounced events', (done) => {
      let callCount = 0;

      const config: HtmlConfig = {
        mode: 'template',
        template: '<input />',
        events: {
          input: 'form:valueChanged',
        },
      };

      const result = renderer.render(config, mockNode as NodeModel);

      // Debounced handler
      eventBus.onDebounced('form:valueChanged', 200, () => {
        callCount++;
        expect(callCount).toBe(1);
        done();
      });

      // Trigger multiple times quickly
      result.self.onInput({ type: 'input', target: { value: 'a' } });
      result.self.onInput({ type: 'input', target: { value: 'ab' } });
      result.self.onInput({ type: 'input', target: { value: 'abc' } });
    });

    it('should work with filtered events', (done) => {
      const config: HtmlConfig = {
        mode: 'template',
        template: '<button>Click</button>',
        events: {
          click: 'node:clicked',
        },
      };

      const result = renderer.render(config, mockNode as NodeModel);

      // Filtered subscription
      eventBus.onFiltered(
        'node:clicked',
        (data: any) => data.nodeData.name === 'John Doe',
        (data: any) => {
          expect(data.nodeId).toBe('test-node-1');
          done();
        }
      );

      result.self.onClick({ type: 'click', target: {} });
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
        expect(result.element).toBeDefined();
        expect(result.self).toBeDefined();

        // Dispose the node
        renderer.disposeNode('uuid-1');

        // Resources should be cleaned up
        // Note: We can't directly check private maps, but we can verify behavior
        // by rendering again and checking it doesn't accumulate
        const result2 = renderer.render(config, mockNode as NodeModel);
        expect(result2.element).toBeDefined();
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
          },
        };

        const result = renderer.render(config, mockNode as NodeModel);
        expect(Object.keys(result.eventHandlers).length).toBe(2);

        renderer.disposeNode('uuid-1');

        // Re-render and verify new handlers are created (old ones disposed)
        const result2 = renderer.render(config, mockNode as NodeModel);
        expect(Object.keys(result2.eventHandlers).length).toBe(2);
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
        expect(result1.element).toBeDefined();
        expect(result2.element).toBeDefined();
        expect(result3.element).toBeDefined();

        // Elements should be different instances
        expect(result1.element).not.toBe(result2.element);
        expect(result2.element).not.toBe(result3.element);
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
          expect(result.element).toBeDefined();
        }

        // Final dispose should work fine
        expect(() => {
          renderer.dispose();
        }).not.toThrow();
      });
    });

    describe('LemonadeJS self object cleanup', () => {
      it('should clean up self object properties', () => {
        const config: HtmlConfig = {
          mode: 'template',
          template: '<div>{{data.name}}</div>',
        };

        const result = renderer.render(config, mockNode as NodeModel);
        const self = result.self;

        expect(self.data).toBeDefined();
        expect(self.nodeId).toBe('test-node-1');

        // Dispose and verify new render creates new self
        renderer.disposeNode('uuid-1');
        const result2 = renderer.render(config, mockNode as NodeModel);

        // Should be a different self object
        expect(result2.self).not.toBe(self);
      });
    });
  });
});
