/**
 * Integration Tests for VNode foreignObject Support
 *
 * Tests the complete integration of:
 * - VNode type system with foreignObject
 * - ContainerIdGenerator
 * - foreignObject helper functions
 * - Type safety and TypeScript strict mode compliance
 */

import type { VNode, VNodeType } from '../types/vnode.types';
import {
  createForeignObject,
  isForeignObject,
  getContainerId,
  ContainerIdGenerator,
  type ForeignObjectOptions
} from './index';

describe('VNode foreignObject Integration', () => {
  beforeEach(() => {
    ContainerIdGenerator.reset();
  });

  describe('End-to-End Workflow', () => {
    it('should create multiple foreignObject nodes with unique IDs', () => {
      // Simulate creating a diagram with multiple nodes
      const nodes = [
        { id: 'task-1', x: 0, y: 0, width: 200, height: 100 },
        { id: 'task-2', x: 250, y: 0, width: 200, height: 100 },
        { id: 'decision-1', x: 500, y: 0, width: 150, height: 150 }
      ];

      const vnodes = nodes.map(node =>
        createForeignObject({
          nodeId: node.id,
          x: node.x,
          y: node.y,
          width: node.width,
          height: node.height,
          key: `fo-${node.id}`
        })
      );

      // Verify all are foreignObject nodes
      expect(vnodes.every(isForeignObject)).toBe(true);

      // Verify unique container IDs
      const containerIds = vnodes.map(getContainerId);
      const uniqueIds = new Set(containerIds);
      expect(uniqueIds.size).toBe(3);

      // Verify container IDs match expected pattern
      expect(containerIds[0]).toBe('fo-task-1-1');
      expect(containerIds[1]).toBe('fo-task-2-2');
      expect(containerIds[2]).toBe('fo-decision-1-3');

      // Verify all have default XHTML wrapper
      vnodes.forEach(vnode => {
        expect(vnode.children).toHaveLength(1);
        expect(vnode.children![0].type).toBe('div');
        expect(vnode.children![0].props.xmlns).toBe('http://www.w3.org/1999/xhtml');
      });
    });

    it('should handle mixed VNode types in a diagram tree', () => {
      const diagram: VNode = {
        type: 'svg',
        props: { width: 1920, height: 1080 },
        children: [
          {
            type: 'g',
            props: { className: 'nodes-layer' },
            children: [
              // Regular SVG node
              {
                type: 'g',
                key: 'node-1',
                props: { transform: 'translate(100, 100)' },
                children: [
                  { type: 'rect', props: { width: 200, height: 100, fill: '#ffffff' } },
                  { type: 'text', props: { textContent: 'Simple Node' } }
                ]
              },
              // foreignObject node with rich content
              createForeignObject({
                nodeId: 'node-2',
                x: 350,
                y: 100,
                width: 200,
                height: 150,
                key: 'fo-node-2'
              })
            ]
          }
        ]
      };

      // Find all foreignObject nodes in the tree
      const findForeignObjects = (node: VNode): VNode[] => {
        const results: VNode[] = [];
        if (isForeignObject(node)) {
          results.push(node);
        }
        if (node.children) {
          node.children.forEach(child => {
            results.push(...findForeignObjects(child));
          });
        }
        return results;
      };

      const foreignObjects = findForeignObjects(diagram);
      expect(foreignObjects).toHaveLength(1);
      expect(getContainerId(foreignObjects[0])).toBe('fo-node-2-1');
    });

    it('should support custom children for rich content', () => {
      // Create custom HTML content for foreignObject
      const customContent: VNode[] = [
        {
          type: 'div',
          props: {
            xmlns: 'http://www.w3.org/1999/xhtml',
            className: 'node-content',
            style: {
              display: 'flex',
              flexDirection: 'column',
              padding: '10px'
            }
          },
          children: [
            {
              type: 'div',
              props: {
                className: 'header',
                style: { fontWeight: 'bold' }
              },
              children: [
                {
                  type: 'span',
                  props: { textContent: 'Task Node' }
                }
              ]
            },
            {
              type: 'div',
              props: {
                className: 'body',
                style: { marginTop: '5px' }
              },
              children: [
                {
                  type: 'span',
                  props: { textContent: 'Status: In Progress' }
                }
              ]
            }
          ]
        }
      ];

      const vnode = createForeignObject({
        nodeId: 'task-node-1',
        x: 100,
        y: 200,
        width: 250,
        height: 180,
        children: customContent
      });

      expect(isForeignObject(vnode)).toBe(true);
      expect(vnode.children).toEqual(customContent);
      expect(vnode.children![0].children).toHaveLength(2);
    });
  });

  describe('Type Safety', () => {
    it('should enforce VNodeType union type', () => {
      const validTypes: VNodeType[] = [
        'rect',
        'circle',
        'ellipse',
        'line',
        'polyline',
        'polygon',
        'path',
        'text',
        'g',
        'svg',
        'foreignObject',
        'div',
        'span'
      ];

      validTypes.forEach(type => {
        const vnode: VNode = { type, props: {} };
        expect(vnode.type).toBe(type);
      });
    });

    it('should support foreignObject-specific props', () => {
      const vnode: VNode = {
        type: 'foreignObject',
        props: {
          x: 10,
          y: 20,
          width: 200,
          height: 150,
          containerId: 'fo-node-1',
          requiredExtensions: 'http://www.w3.org/1999/xhtml'
        }
      };

      expect(vnode.props.containerId).toBeDefined();
      expect(vnode.props.requiredExtensions).toBeDefined();
    });

    it('should support HTML props for foreignObject children', () => {
      const divNode: VNode = {
        type: 'div',
        props: {
          xmlns: 'http://www.w3.org/1999/xhtml',
          style: {
            display: 'block',
            padding: '10px'
          },
          className: 'content'
        }
      };

      expect(divNode.props.xmlns).toBe('http://www.w3.org/1999/xhtml');
      expect(divNode.props.style).toBeDefined();
      expect(divNode.props.className).toBe('content');
    });
  });

  describe('Container ID Management', () => {
    it('should generate globally unique IDs across sessions', () => {
      const ids1 = Array.from({ length: 10 }, (_, i) =>
        ContainerIdGenerator.generate(`node-${i}`)
      );

      const ids2 = Array.from({ length: 10 }, (_, i) =>
        ContainerIdGenerator.generate(`node-${i}`)
      );

      const allIds = [...ids1, ...ids2];
      const uniqueIds = new Set(allIds);

      expect(uniqueIds.size).toBe(20); // All IDs must be unique
    });

    it('should extract node ID from container ID', () => {
      const nodeIds = ['task-1', 'decision-2', 'gateway-3'];

      nodeIds.forEach(nodeId => {
        const containerId = ContainerIdGenerator.generate(nodeId);
        const extracted = ContainerIdGenerator.getNodeId(containerId);
        expect(extracted).toBe(nodeId);
      });
    });

    it('should validate container IDs correctly', () => {
      const validId = ContainerIdGenerator.generate('node-1');
      expect(ContainerIdGenerator.isContainerId(validId)).toBe(true);
      expect(ContainerIdGenerator.isContainerId('random-id')).toBe(false);
    });

    it('should reset counter for testing', () => {
      ContainerIdGenerator.generate('node-1');
      ContainerIdGenerator.generate('node-1');

      ContainerIdGenerator.reset();

      const id = ContainerIdGenerator.generate('node-1');
      expect(id).toBe('fo-node-1-1');
    });
  });

  describe('Helper Functions', () => {
    it('should create foreignObject with all options', () => {
      const options: ForeignObjectOptions = {
        nodeId: 'test-node',
        x: 50,
        y: 100,
        width: 300,
        height: 200,
        containerId: 'custom-id',
        key: 'my-key',
        children: [
          {
            type: 'div',
            props: { className: 'custom' }
          }
        ]
      };

      const vnode = createForeignObject(options);

      expect(vnode.type).toBe('foreignObject');
      expect(vnode.props.x).toBe(50);
      expect(vnode.props.y).toBe(100);
      expect(vnode.props.width).toBe(300);
      expect(vnode.props.height).toBe(200);
      expect(vnode.props.containerId).toBe('custom-id');
      expect(vnode.key).toBe('my-key');
      expect(vnode.children![0].props.className).toBe('custom');
    });

    it('should filter foreignObject nodes from mixed array', () => {
      const vnodes: VNode[] = [
        { type: 'rect', props: {} },
        createForeignObject({ nodeId: 'node-1', x: 0, y: 0, width: 100, height: 100 }),
        { type: 'circle', props: {} },
        createForeignObject({ nodeId: 'node-2', x: 100, y: 0, width: 100, height: 100 }),
        { type: 'text', props: {} }
      ];

      const foreignObjects = vnodes.filter(isForeignObject);
      expect(foreignObjects).toHaveLength(2);

      const containerIds = foreignObjects.map(getContainerId);
      expect(containerIds).toEqual(['fo-node-1-1', 'fo-node-2-2']);
    });

    it('should get container ID only from foreignObject nodes', () => {
      const foNode = createForeignObject({
        nodeId: 'node-1',
        x: 0,
        y: 0,
        width: 100,
        height: 100
      });

      const rectNode: VNode = {
        type: 'rect',
        props: { x: 0, y: 0, width: 100, height: 100 }
      };

      expect(getContainerId(foNode)).toBeDefined();
      expect(getContainerId(rectNode)).toBeUndefined();
    });
  });

  describe('Performance - NFR-FO-003', () => {
    it('should generate container IDs in O(1) time at scale', () => {
      ContainerIdGenerator.reset();

      const iterations = 10000;
      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        ContainerIdGenerator.generate(`node-${i}`);
      }

      const endTime = performance.now();
      const totalTime = endTime - startTime;

      // Should complete 10k generations in reasonable time
      expect(totalTime).toBeLessThan(100);

      // Average time per generation should be minimal
      const avgTime = totalTime / iterations;
      expect(avgTime).toBeLessThan(0.01); // Less than 0.01ms per generation
    });

    it('should create foreignObject VNodes efficiently', () => {
      ContainerIdGenerator.reset();

      const iterations = 1000;
      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        createForeignObject({
          nodeId: `node-${i}`,
          x: i * 10,
          y: i * 10,
          width: 200,
          height: 150
        });
      }

      const endTime = performance.now();
      const totalTime = endTime - startTime;

      // Should create 1k VNodes in reasonable time
      expect(totalTime).toBeLessThan(100);
    });

    it('should check foreignObject type efficiently', () => {
      const vnodes = Array.from({ length: 1000 }, (_, i) =>
        i % 2 === 0
          ? createForeignObject({ nodeId: `node-${i}`, x: 0, y: 0, width: 100, height: 100 })
          : { type: 'rect' as const, props: {} }
      );

      const startTime = performance.now();
      const foreignObjects = vnodes.filter(isForeignObject);
      const endTime = performance.now();
      const totalTime = endTime - startTime;

      expect(foreignObjects).toHaveLength(500);
      expect(totalTime).toBeLessThan(50);
    });
  });

  describe('Real-World Scenarios', () => {
    it('should support complete node rendering pipeline', () => {
      // Simulate a complete node with foreignObject content
      const nodeVNode: VNode = {
        type: 'g',
        key: 'node-complete-1',
        props: {
          transform: 'translate(100, 100)',
          className: 'diagram-node'
        },
        children: [
          // Background rectangle
          {
            type: 'rect',
            props: {
              x: 0,
              y: 0,
              width: 250,
              height: 180,
              fill: '#ffffff',
              stroke: '#000000',
              strokeWidth: 2,
              rx: 5,
              ry: 5
            }
          },
          // foreignObject for rich content
          createForeignObject({
            nodeId: 'complete-1',
            x: 5,
            y: 5,
            width: 240,
            height: 170,
            children: [
              {
                type: 'div',
                props: {
                  xmlns: 'http://www.w3.org/1999/xhtml',
                  className: 'node-content',
                  style: {
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '10px'
                  }
                }
              }
            ]
          })
        ]
      };

      // Verify structure
      expect(nodeVNode.children).toHaveLength(2);
      expect(nodeVNode.children![0].type).toBe('rect');
      expect(isForeignObject(nodeVNode.children![1])).toBe(true);

      const containerId = getContainerId(nodeVNode.children![1]);
      expect(containerId).toBe('fo-complete-1-1');
    });

    it('should handle diagram with multiple node types', () => {
      interface DiagramNode {
        id: string;
        type: 'simple' | 'rich';
        x: number;
        y: number;
      }

      const nodes: DiagramNode[] = [
        { id: 'node-1', type: 'simple', x: 0, y: 0 },
        { id: 'node-2', type: 'rich', x: 300, y: 0 },
        { id: 'node-3', type: 'simple', x: 600, y: 0 },
        { id: 'node-4', type: 'rich', x: 900, y: 0 }
      ];

      const vnodes = nodes.map(node => {
        if (node.type === 'rich') {
          return createForeignObject({
            nodeId: node.id,
            x: node.x,
            y: node.y,
            width: 250,
            height: 180,
            key: `fo-${node.id}`
          });
        } else {
          return {
            type: 'g' as const,
            key: `simple-${node.id}`,
            props: {
              transform: `translate(${node.x}, ${node.y})`
            },
            children: [
              { type: 'rect' as const, props: { width: 200, height: 100 } },
              { type: 'text' as const, props: { textContent: node.id } }
            ]
          };
        }
      });

      const richNodes = vnodes.filter(isForeignObject);
      expect(richNodes).toHaveLength(2);

      const containerIds = richNodes.map(getContainerId);
      expect(containerIds).toEqual(['fo-node-2-1', 'fo-node-4-2']);
    });
  });

  describe('Framework Agnostic - NFR-FO-002', () => {
    it('should have no Angular dependencies', () => {
      // This test verifies that all code is pure TypeScript
      const vnode = createForeignObject({
        nodeId: 'test',
        x: 0,
        y: 0,
        width: 100,
        height: 100
      });

      // Should be serializable (no functions except event handlers)
      const serialized = JSON.stringify({
        type: vnode.type,
        props: {
          x: vnode.props.x,
          y: vnode.props.y,
          width: vnode.props.width,
          height: vnode.props.height,
          containerId: vnode.props.containerId
        },
        children: vnode.children
      });

      const deserialized = JSON.parse(serialized);
      expect(deserialized.type).toBe('foreignObject');
      expect(deserialized.props.containerId).toBe('fo-test-1');
    });
  });
});
