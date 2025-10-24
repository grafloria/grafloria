import { createForeignObject, isForeignObject, getContainerId } from './foreign-object';
import { ContainerIdGenerator } from './container-id-generator';
import type { VNode } from '../types/vnode.types';

describe('foreignObject VNode', () => {
  beforeEach(() => {
    ContainerIdGenerator.reset();
  });

  describe('createForeignObject', () => {
    it('should create valid foreignObject VNode with all required properties', () => {
      const vnode = createForeignObject({
        nodeId: 'node-1',
        x: 10,
        y: 20,
        width: 200,
        height: 150
      });

      expect(vnode.type).toBe('foreignObject');
      expect(vnode.props.x).toBe(10);
      expect(vnode.props.y).toBe(20);
      expect(vnode.props.width).toBe(200);
      expect(vnode.props.height).toBe(150);
      expect(vnode.props.containerId).toBeDefined();
      expect(vnode.props.containerId).toMatch(/^fo-node-1-\d+$/);
    });

    it('should auto-generate container ID if not provided', () => {
      const vnode1 = createForeignObject({
        nodeId: 'node-1',
        x: 0,
        y: 0,
        width: 100,
        height: 100
      });

      const vnode2 = createForeignObject({
        nodeId: 'node-1',
        x: 0,
        y: 0,
        width: 100,
        height: 100
      });

      expect(vnode1.props.containerId).toBe('fo-node-1-1');
      expect(vnode2.props.containerId).toBe('fo-node-1-2');
      expect(vnode1.props.containerId).not.toBe(vnode2.props.containerId);
    });

    it('should use custom container ID if provided', () => {
      const vnode = createForeignObject({
        nodeId: 'node-1',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        containerId: 'my-custom-id'
      });

      expect(vnode.props.containerId).toBe('my-custom-id');
    });

    it('should include default div wrapper with XHTML namespace', () => {
      const vnode = createForeignObject({
        nodeId: 'node-1',
        x: 0,
        y: 0,
        width: 100,
        height: 100
      });

      expect(vnode.children).toBeDefined();
      expect(vnode.children).toHaveLength(1);
      expect(vnode.children![0].type).toBe('div');
      expect(vnode.children![0].props.xmlns).toBe('http://www.w3.org/1999/xhtml');
      expect(vnode.children![0].props.style).toEqual({
        width: '100%',
        height: '100%',
        overflow: 'hidden'
      });
    });

    it('should accept custom children instead of default wrapper', () => {
      const customChildren: VNode[] = [
        {
          type: 'div',
          props: { className: 'custom-content' },
          children: [
            {
              type: 'span',
              props: { textContent: 'Custom Content' }
            }
          ]
        }
      ];

      const vnode = createForeignObject({
        nodeId: 'node-1',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        children: customChildren
      });

      expect(vnode.children).toEqual(customChildren);
      expect(vnode.children).toHaveLength(1);
      expect(vnode.children![0].props.className).toBe('custom-content');
    });

    it('should support optional key property', () => {
      const vnode = createForeignObject({
        nodeId: 'node-1',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        key: 'foreignObject-key-1'
      });

      expect(vnode.key).toBe('foreignObject-key-1');
    });

    it('should create VNode without key if not provided', () => {
      const vnode = createForeignObject({
        nodeId: 'node-1',
        x: 0,
        y: 0,
        width: 100,
        height: 100
      });

      expect(vnode.key).toBeUndefined();
    });

    it('should handle different node IDs', () => {
      const vnode1 = createForeignObject({
        nodeId: 'task-node-1',
        x: 0,
        y: 0,
        width: 200,
        height: 150
      });

      const vnode2 = createForeignObject({
        nodeId: 'decision-node-2',
        x: 100,
        y: 200,
        width: 300,
        height: 200
      });

      expect(vnode1.props.containerId).toBe('fo-task-node-1-1');
      expect(vnode2.props.containerId).toBe('fo-decision-node-2-2');
    });

    it('should handle zero and negative coordinates', () => {
      const vnode = createForeignObject({
        nodeId: 'node-1',
        x: -50,
        y: -100,
        width: 200,
        height: 150
      });

      expect(vnode.props.x).toBe(-50);
      expect(vnode.props.y).toBe(-100);
    });

    it('should preserve all provided dimensions', () => {
      const vnode = createForeignObject({
        nodeId: 'node-1',
        x: 10.5,
        y: 20.75,
        width: 200.25,
        height: 150.5
      });

      expect(vnode.props.x).toBe(10.5);
      expect(vnode.props.y).toBe(20.75);
      expect(vnode.props.width).toBe(200.25);
      expect(vnode.props.height).toBe(150.5);
    });
  });

  describe('isForeignObject', () => {
    it('should return true for foreignObject VNode', () => {
      const vnode = createForeignObject({
        nodeId: 'node-1',
        x: 0,
        y: 0,
        width: 100,
        height: 100
      });

      expect(isForeignObject(vnode)).toBe(true);
    });

    it('should return false for rect VNode', () => {
      const rectVNode: VNode = {
        type: 'rect',
        props: { x: 0, y: 0, width: 100, height: 100 }
      };

      expect(isForeignObject(rectVNode)).toBe(false);
    });

    it('should return false for circle VNode', () => {
      const circleVNode: VNode = {
        type: 'circle',
        props: { cx: 50, cy: 50, r: 25 }
      };

      expect(isForeignObject(circleVNode)).toBe(false);
    });

    it('should return false for text VNode', () => {
      const textVNode: VNode = {
        type: 'text',
        props: { textContent: 'Hello' }
      };

      expect(isForeignObject(textVNode)).toBe(false);
    });

    it('should return false for group VNode', () => {
      const groupVNode: VNode = {
        type: 'g',
        props: { transform: 'translate(100, 100)' }
      };

      expect(isForeignObject(groupVNode)).toBe(false);
    });

    it('should return false for path VNode', () => {
      const pathVNode: VNode = {
        type: 'path',
        props: { d: 'M 0 0 L 100 100' }
      };

      expect(isForeignObject(pathVNode)).toBe(false);
    });

    it('should be case-sensitive', () => {
      const vnode1: VNode = {
        type: 'ForeignObject',
        props: {}
      };

      const vnode2: VNode = {
        type: 'FOREIGNOBJECT',
        props: {}
      };

      expect(isForeignObject(vnode1)).toBe(false);
      expect(isForeignObject(vnode2)).toBe(false);
    });
  });

  describe('getContainerId', () => {
    it('should return container ID for foreignObject VNode', () => {
      const vnode = createForeignObject({
        nodeId: 'node-1',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        containerId: 'test-container-id'
      });

      expect(getContainerId(vnode)).toBe('test-container-id');
    });

    it('should return generated container ID', () => {
      const vnode = createForeignObject({
        nodeId: 'node-1',
        x: 0,
        y: 0,
        width: 100,
        height: 100
      });

      const containerId = getContainerId(vnode);
      expect(containerId).toBeDefined();
      expect(containerId).toMatch(/^fo-node-1-\d+$/);
    });

    it('should return undefined for non-foreignObject VNode', () => {
      const rectVNode: VNode = {
        type: 'rect',
        props: { x: 0, y: 0, width: 100, height: 100 }
      };

      expect(getContainerId(rectVNode)).toBeUndefined();
    });

    it('should return undefined for circle VNode', () => {
      const circleVNode: VNode = {
        type: 'circle',
        props: { cx: 50, cy: 50, r: 25 }
      };

      expect(getContainerId(circleVNode)).toBeUndefined();
    });

    it('should return undefined even if non-foreignObject has containerId', () => {
      const rectVNode: VNode = {
        type: 'rect',
        props: {
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          containerId: 'should-not-be-returned'
        }
      };

      expect(getContainerId(rectVNode)).toBeUndefined();
    });

    it('should handle foreignObject VNode without containerId in props', () => {
      const vnode: VNode = {
        type: 'foreignObject',
        props: {
          x: 0,
          y: 0,
          width: 100,
          height: 100
        }
      };

      expect(getContainerId(vnode)).toBeUndefined();
    });
  });

  describe('Integration tests', () => {
    it('should create multiple foreignObject VNodes with unique container IDs', () => {
      const vnodes = [
        createForeignObject({ nodeId: 'node-1', x: 0, y: 0, width: 100, height: 100 }),
        createForeignObject({ nodeId: 'node-2', x: 100, y: 0, width: 100, height: 100 }),
        createForeignObject({ nodeId: 'node-3', x: 200, y: 0, width: 100, height: 100 })
      ];

      const containerIds = vnodes.map(getContainerId);
      const uniqueIds = new Set(containerIds);

      expect(uniqueIds.size).toBe(3);
      expect(containerIds[0]).toBe('fo-node-1-1');
      expect(containerIds[1]).toBe('fo-node-2-2');
      expect(containerIds[2]).toBe('fo-node-3-3');
    });

    it('should work with type guards in practical scenarios', () => {
      const vnodes: VNode[] = [
        createForeignObject({ nodeId: 'node-1', x: 0, y: 0, width: 100, height: 100 }),
        { type: 'rect', props: { x: 0, y: 0, width: 100, height: 100 } },
        createForeignObject({ nodeId: 'node-2', x: 100, y: 0, width: 100, height: 100 }),
        { type: 'circle', props: { cx: 50, cy: 50, r: 25 } }
      ];

      const foreignObjectNodes = vnodes.filter(isForeignObject);
      const containerIds = foreignObjectNodes.map(getContainerId);

      expect(foreignObjectNodes).toHaveLength(2);
      expect(containerIds).toHaveLength(2);
      expect(containerIds[0]).toBe('fo-node-1-1');
      expect(containerIds[1]).toBe('fo-node-2-2');
    });

    it('should create complete foreignObject tree structure', () => {
      const vnode = createForeignObject({
        nodeId: 'complex-node',
        x: 50,
        y: 100,
        width: 300,
        height: 200,
        key: 'fo-complex'
      });

      // Verify structure
      expect(vnode.type).toBe('foreignObject');
      expect(vnode.key).toBe('fo-complex');
      expect(isForeignObject(vnode)).toBe(true);
      expect(getContainerId(vnode)).toBeDefined();

      // Verify default wrapper
      expect(vnode.children).toHaveLength(1);
      expect(vnode.children![0].type).toBe('div');
      expect(vnode.children![0].props.xmlns).toBe('http://www.w3.org/1999/xhtml');
    });
  });
});
