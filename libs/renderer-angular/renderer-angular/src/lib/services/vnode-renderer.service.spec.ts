import { TestBed } from '@angular/core/testing';
import { VNodeRendererService } from './vnode-renderer.service';
import type { VNode } from '@grafloria/renderer';

describe('VNodeRendererService', () => {
  let service: VNodeRendererService;
  let container: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [VNodeRendererService]
    });
    service = TestBed.inject(VNodeRendererService);
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  describe('renderVNode', () => {
    test('should create SVG element for svg type', () => {
      const vnode: VNode = {
        type: 'svg',
        props: {
          width: 800,
          height: 600,
          viewBox: '0 0 800 600',
        },
      };

      const element = service.renderVNode(vnode);

      expect(element.tagName.toLowerCase()).toBe('svg');
      expect(element.getAttribute('width')).toBe('800');
      expect(element.getAttribute('height')).toBe('600');
      expect(element.getAttribute('viewBox')).toBe('0 0 800 600');
    });

    test('should create SVG group for g type', () => {
      const vnode: VNode = {
        type: 'g',
        props: {
          transform: 'translate(100, 200)',
          className: 'test-group',
        },
      };

      const element = service.renderVNode(vnode);

      expect(element.tagName.toLowerCase()).toBe('g');
      expect(element.getAttribute('transform')).toBe('translate(100, 200)');
      expect(element.getAttribute('class')).toBe('test-group');
    });

    test('should create rect element', () => {
      const vnode: VNode = {
        type: 'rect',
        props: {
          x: 10,
          y: 20,
          width: 100,
          height: 50,
          fill: '#ff0000',
          stroke: '#000000',
        },
      };

      const element = service.renderVNode(vnode);

      expect(element.tagName.toLowerCase()).toBe('rect');
      expect(element.getAttribute('x')).toBe('10');
      expect(element.getAttribute('y')).toBe('20');
      expect(element.getAttribute('width')).toBe('100');
      expect(element.getAttribute('height')).toBe('50');
      expect(element.getAttribute('fill')).toBe('#ff0000');
      expect(element.getAttribute('stroke')).toBe('#000000');
    });

    test('should create circle element', () => {
      const vnode: VNode = {
        type: 'circle',
        props: {
          cx: 50,
          cy: 50,
          r: 25,
          fill: '#00ff00',
        },
      };

      const element = service.renderVNode(vnode);

      expect(element.tagName.toLowerCase()).toBe('circle');
      expect(element.getAttribute('cx')).toBe('50');
      expect(element.getAttribute('cy')).toBe('50');
      expect(element.getAttribute('r')).toBe('25');
      expect(element.getAttribute('fill')).toBe('#00ff00');
    });

    test('should create path element', () => {
      const vnode: VNode = {
        type: 'path',
        props: {
          d: 'M 0 0 L 100 100',
          stroke: '#0000ff',
          fill: 'none',
        },
      };

      const element = service.renderVNode(vnode);

      expect(element.tagName.toLowerCase()).toBe('path');
      expect(element.getAttribute('d')).toBe('M 0 0 L 100 100');
      expect(element.getAttribute('stroke')).toBe('#0000ff');
      expect(element.getAttribute('fill')).toBe('none');
    });

    test('should create text element with textContent', () => {
      const vnode: VNode = {
        type: 'text',
        props: {
          x: 100,
          y: 50,
          textContent: 'Hello World',
          fontSize: 14,
          fill: '#333333',
        },
      };

      const element = service.renderVNode(vnode);

      expect(element.tagName.toLowerCase()).toBe('text');
      expect(element.getAttribute('x')).toBe('100');
      expect(element.getAttribute('y')).toBe('50');
      expect(element.textContent).toBe('Hello World');
      expect(element.getAttribute('font-size')).toBe('14');
      expect(element.getAttribute('fill')).toBe('#333333');
    });

    test('should render children recursively', () => {
      const vnode: VNode = {
        type: 'g',
        props: { className: 'parent' },
        children: [
          {
            type: 'rect',
            props: { x: 0, y: 0, width: 50, height: 50 },
          },
          {
            type: 'circle',
            props: { cx: 25, cy: 25, r: 10 },
          },
        ],
      };

      const element = service.renderVNode(vnode);

      expect(element.children.length).toBe(2);
      expect(element.children[0].tagName.toLowerCase()).toBe('rect');
      expect(element.children[1].tagName.toLowerCase()).toBe('circle');
    });

    test('should handle nested children', () => {
      const vnode: VNode = {
        type: 'svg',
        props: { width: 800, height: 600 },
        children: [
          {
            type: 'g',
            props: { className: 'layer1' },
            children: [
              {
                type: 'g',
                props: { className: 'layer2' },
                children: [
                  {
                    type: 'rect',
                    props: { x: 0, y: 0, width: 100, height: 100 },
                  },
                ],
              },
            ],
          },
        ],
      };

      const element = service.renderVNode(vnode);

      expect(element.children.length).toBe(1);
      const layer1 = element.children[0];
      expect(layer1.getAttribute('class')).toBe('layer1');
      expect(layer1.children.length).toBe(1);
      const layer2 = layer1.children[0];
      expect(layer2.getAttribute('class')).toBe('layer2');
      expect(layer2.children.length).toBe(1);
      expect(layer2.children[0].tagName.toLowerCase()).toBe('rect');
    });

    test('should handle custom attributes', () => {
      const vnode: VNode = {
        type: 'rect',
        props: {
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          'data-id': 'node-123',
          'data-type': 'basic',
        },
      };

      const element = service.renderVNode(vnode);

      expect(element.getAttribute('data-id')).toBe('node-123');
      expect(element.getAttribute('data-type')).toBe('basic');
    });

    test('should convert camelCase props to kebab-case attributes', () => {
      const vnode: VNode = {
        type: 'text',
        props: {
          fontSize: 14,
          fontFamily: 'Arial',
          textAnchor: 'middle',
        },
      };

      const element = service.renderVNode(vnode);

      expect(element.getAttribute('font-size')).toBe('14');
      expect(element.getAttribute('font-family')).toBe('Arial');
      expect(element.getAttribute('text-anchor')).toBe('middle');
    });
  });

  describe('updateVNode', () => {
    test('should update element properties', () => {
      const oldVNode: VNode = {
        type: 'rect',
        props: { x: 0, y: 0, width: 100, height: 100, fill: '#ff0000' },
      };

      const newVNode: VNode = {
        type: 'rect',
        props: { x: 10, y: 20, width: 150, height: 120, fill: '#00ff00' },
      };

      const element = service.renderVNode(oldVNode);
      service.updateVNode(element, oldVNode, newVNode);

      expect(element.getAttribute('x')).toBe('10');
      expect(element.getAttribute('y')).toBe('20');
      expect(element.getAttribute('width')).toBe('150');
      expect(element.getAttribute('height')).toBe('120');
      expect(element.getAttribute('fill')).toBe('#00ff00');
    });

    test('should add new properties', () => {
      const oldVNode: VNode = {
        type: 'rect',
        props: { x: 0, y: 0, width: 100, height: 100 },
      };

      const newVNode: VNode = {
        type: 'rect',
        props: { x: 0, y: 0, width: 100, height: 100, fill: '#ff0000', stroke: '#000000' },
      };

      const element = service.renderVNode(oldVNode);
      service.updateVNode(element, oldVNode, newVNode);

      expect(element.getAttribute('fill')).toBe('#ff0000');
      expect(element.getAttribute('stroke')).toBe('#000000');
    });

    test('should remove old properties', () => {
      const oldVNode: VNode = {
        type: 'rect',
        props: { x: 0, y: 0, width: 100, height: 100, fill: '#ff0000', stroke: '#000000' },
      };

      const newVNode: VNode = {
        type: 'rect',
        props: { x: 0, y: 0, width: 100, height: 100 },
      };

      const element = service.renderVNode(oldVNode);
      service.updateVNode(element, oldVNode, newVNode);

      expect(element.getAttribute('fill')).toBeNull();
      expect(element.getAttribute('stroke')).toBeNull();
    });

    test('should update textContent', () => {
      const oldVNode: VNode = {
        type: 'text',
        props: { x: 0, y: 0, textContent: 'Old Text' },
      };

      const newVNode: VNode = {
        type: 'text',
        props: { x: 0, y: 0, textContent: 'New Text' },
      };

      const element = service.renderVNode(oldVNode);
      service.updateVNode(element, oldVNode, newVNode);

      expect(element.textContent).toBe('New Text');
    });
  });

  describe('render (full tree)', () => {
    test('should render complete VNode tree to container', () => {
      const vnode: VNode = {
        type: 'svg',
        props: { width: 800, height: 600 },
        children: [
          {
            type: 'g',
            props: { className: 'nodes-layer' },
            children: [
              { type: 'rect', props: { x: 100, y: 100, width: 100, height: 50 } },
            ],
          },
          {
            type: 'g',
            props: { className: 'links-layer' },
            children: [
              { type: 'path', props: { d: 'M 0 0 L 100 100', stroke: '#000' } },
            ],
          },
        ],
      };

      service.render(vnode, container);

      expect(container.children.length).toBe(1);
      const svg = container.children[0];
      expect(svg.tagName.toLowerCase()).toBe('svg');
      expect(svg.children.length).toBe(2);
    });

    test('should replace old content when rendering', () => {
      const vnode1: VNode = {
        type: 'svg',
        props: { width: 800, height: 600 },
      };

      service.render(vnode1, container);
      expect(container.children.length).toBe(1);

      const vnode2: VNode = {
        type: 'svg',
        props: { width: 1000, height: 800 },
      };

      service.render(vnode2, container);
      expect(container.children.length).toBe(1);
      expect(container.children[0].getAttribute('width')).toBe('1000');
    });
  });
});
