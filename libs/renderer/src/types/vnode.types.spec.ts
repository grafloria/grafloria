import type { VNode, VNodeProps } from './vnode.types';

describe('VNode Types', () => {
  describe('Basic VNode Structure', () => {
    test('should create VNode with required properties', () => {
      const vnode: VNode = {
        type: 'rect',
        props: { x: 0, y: 0, width: 100, height: 50 }
      };

      expect(vnode.type).toBe('rect');
      expect(vnode.props).toBeDefined();
      expect(vnode.props.x).toBe(0);
      expect(vnode.props.width).toBe(100);
    });

    test('should support children array', () => {
      const parent: VNode = {
        type: 'g',
        props: { className: 'node-group' },
        children: [
          { type: 'rect', props: { x: 0, y: 0 } },
          { type: 'text', props: { textContent: 'Hello' } }
        ]
      };

      expect(parent.children).toBeDefined();
      expect(parent.children).toHaveLength(2);
      expect(parent.children![0].type).toBe('rect');
      expect(parent.children![1].type).toBe('text');
    });

    test('should support optional key for diffing', () => {
      const vnode: VNode = {
        type: 'g',
        key: 'node-123',
        props: {}
      };

      expect(vnode.key).toBe('node-123');
    });

    test('should allow empty children array', () => {
      const vnode: VNode = {
        type: 'g',
        props: {},
        children: []
      };

      expect(vnode.children).toEqual([]);
    });
  });

  describe('VNode Props - SVG Geometry', () => {
    test('should support rectangle props', () => {
      const props: VNodeProps = {
        x: 10,
        y: 20,
        width: 100,
        height: 50,
        rx: 4,
        ry: 4
      };

      expect(props.x).toBe(10);
      expect(props.y).toBe(20);
      expect(props.width).toBe(100);
      expect(props.rx).toBe(4);
    });

    test('should support circle props', () => {
      const props: VNodeProps = {
        cx: 50,
        cy: 50,
        r: 25
      };

      expect(props.cx).toBe(50);
      expect(props.r).toBe(25);
    });

    test('should support path props', () => {
      const props: VNodeProps = {
        d: 'M 0 0 L 100 100'
      };

      expect(props.d).toBe('M 0 0 L 100 100');
    });
  });

  describe('VNode Props - SVG Styling', () => {
    test('should support fill and stroke', () => {
      const props: VNodeProps = {
        fill: '#ffffff',
        stroke: '#000000',
        strokeWidth: 2,
        strokeDasharray: '5,5',
        opacity: 0.8
      };

      expect(props.fill).toBe('#ffffff');
      expect(props.stroke).toBe('#000000');
      expect(props.strokeWidth).toBe(2);
      expect(props.strokeDasharray).toBe('5,5');
      expect(props.opacity).toBe(0.8);
    });

    test('should support transform', () => {
      const props: VNodeProps = {
        transform: 'translate(100, 200) rotate(45)'
      };

      expect(props.transform).toBe('translate(100, 200) rotate(45)');
    });

    test('should support CSS classes', () => {
      const props: VNodeProps = {
        className: 'diagram-node selected'
      };

      expect(props.className).toBe('diagram-node selected');
    });
  });

  describe('VNode Props - Text', () => {
    test('should support text props', () => {
      const props: VNodeProps = {
        textContent: 'Hello World',
        fontSize: 14,
        fontFamily: 'Arial',
        textAnchor: 'middle'
      };

      expect(props.textContent).toBe('Hello World');
      expect(props.fontSize).toBe(14);
      expect(props.fontFamily).toBe('Arial');
      expect(props.textAnchor).toBe('middle');
    });

    test('should support all text anchor values', () => {
      const start: VNodeProps = { textAnchor: 'start' };
      const middle: VNodeProps = { textAnchor: 'middle' };
      const end: VNodeProps = { textAnchor: 'end' };

      expect(start.textAnchor).toBe('start');
      expect(middle.textAnchor).toBe('middle');
      expect(end.textAnchor).toBe('end');
    });
  });

  describe('VNode Props - Event Handlers', () => {
    test('should support event handlers', () => {
      const clickHandler = jest.fn();
      const hoverHandler = jest.fn();

      const props: VNodeProps = {
        onClick: clickHandler,
        onMouseEnter: hoverHandler,
        onMouseLeave: jest.fn(),
        onMouseDown: jest.fn()
      };

      expect(props.onClick).toBe(clickHandler);
      expect(props.onMouseEnter).toBe(hoverHandler);
      expect(props.onMouseLeave).toBeDefined();
      expect(props.onMouseDown).toBeDefined();
    });
  });

  describe('VNode Props - Custom Properties', () => {
    test('should support custom properties via index signature', () => {
      const props: VNodeProps = {
        'data-node-id': '123',
        'data-selected': true,
        customProp: { nested: 'value' }
      };

      expect(props['data-node-id']).toBe('123');
      expect(props['data-selected']).toBe(true);
      expect(props['customProp']).toEqual({ nested: 'value' });
    });
  });

  describe('Complex VNode Trees', () => {
    test('should support nested VNode hierarchies', () => {
      const diagram: VNode = {
        type: 'svg',
        key: 'root',
        props: { width: 1920, height: 1080 },
        children: [
          {
            type: 'g',
            props: { className: 'links-layer' },
            children: []
          },
          {
            type: 'g',
            props: { className: 'nodes-layer' },
            children: [
              {
                type: 'g',
                key: 'node-1',
                props: { transform: 'translate(100, 100)' },
                children: [
                  { type: 'rect', props: { width: 200, height: 100 } },
                  { type: 'text', props: { textContent: 'Node 1' } }
                ]
              }
            ]
          }
        ]
      };

      expect(diagram.type).toBe('svg');
      expect(diagram.children).toHaveLength(2);
      expect(diagram.children![1].children).toHaveLength(1);
      expect(diagram.children![1].children![0].children).toHaveLength(2);
    });
  });
});
