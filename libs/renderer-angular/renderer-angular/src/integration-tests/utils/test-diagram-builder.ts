import type { VNode } from '@grafloria/renderer';

/**
 * TestDiagramBuilder
 *
 * Utility for building test diagram VNodes with a fluent API.
 * Simplifies creation of complex diagram structures for testing.
 *
 * @example
 * const diagram = new TestDiagramBuilder()
 *   .addNode('node1', { x: 0, y: 0, width: 100, height: 100 })
 *   .addNode('node2', { x: 200, y: 0, width: 100, height: 100 })
 *   .addEdge('edge1', 'node1', 'node2')
 *   .build();
 */
export class TestDiagramBuilder {
  private nodes: Map<string, VNode> = new Map();
  private edges: VNode[] = [];
  private metadata: Record<string, any> = {};

  /**
   * Add a node to the diagram.
   */
  addNode(
    id: string,
    props: {
      x: number;
      y: number;
      width: number;
      height: number;
      fill?: string;
      stroke?: string;
      label?: string;
      data?: Record<string, any>;
    }
  ): this {
    const { x, y, width, height, fill = '#4CAF50', stroke = '#2E7D32', label, data } = props;

    const node: VNode = {
      type: 'g',
      props: {
        id,
        transform: `translate(${x}, ${y})`,
        'data-node-id': id,
        ...(data && { 'data-custom': JSON.stringify(data) }),
      },
      children: [
        {
          type: 'rect',
          props: {
            x: 0,
            y: 0,
            width,
            height,
            fill,
            stroke,
            'stroke-width': 2,
            rx: 4,
          },
        },
        ...(label
          ? [
              {
                type: 'text',
                props: {
                  x: width / 2,
                  y: height / 2,
                  'text-anchor': 'middle',
                  'dominant-baseline': 'middle',
                  fill: '#FFFFFF',
                  'font-size': 14,
                  'font-weight': 'bold',
                  textContent: label,
                },
              } as VNode,
            ]
          : []),
      ],
    };

    this.nodes.set(id, node);
    return this;
  }

  /**
   * Add an edge connecting two nodes.
   */
  addEdge(
    id: string,
    sourceId: string,
    targetId: string,
    props?: {
      stroke?: string;
      strokeWidth?: number;
      animated?: boolean;
      label?: string;
    }
  ): this {
    const { stroke = '#9E9E9E', strokeWidth = 2, animated = false, label } = props || {};

    // Get source and target positions (simplified - assumes nodes exist)
    const sourceNode = this.nodes.get(sourceId);
    const targetNode = this.nodes.get(targetId);

    if (!sourceNode || !targetNode) {
      throw new Error(`Cannot create edge: source or target node not found`);
    }

    // Extract positions from transform
    const sourceMatch = (sourceNode.props?.transform as string)?.match(/translate\((\d+),\s*(\d+)\)/);
    const targetMatch = (targetNode.props?.transform as string)?.match(/translate\((\d+),\s*(\d+)\)/);

    const sx = sourceMatch ? parseInt(sourceMatch[1]) + 50 : 0;
    const sy = sourceMatch ? parseInt(sourceMatch[2]) + 50 : 0;
    const tx = targetMatch ? parseInt(targetMatch[1]) + 50 : 0;
    const ty = targetMatch ? parseInt(targetMatch[2]) + 50 : 0;

    const edge: VNode = {
      type: 'g',
      props: {
        id,
        'data-edge-id': id,
        'data-source': sourceId,
        'data-target': targetId,
      },
      children: [
        {
          type: 'line',
          props: {
            x1: sx,
            y1: sy,
            x2: tx,
            y2: ty,
            stroke,
            'stroke-width': strokeWidth,
            'marker-end': 'url(#arrowhead)',
            ...(animated && { 'stroke-dasharray': '5,5' }),
          },
        },
        ...(label
          ? [
              {
                type: 'text',
                props: {
                  x: (sx + tx) / 2,
                  y: (sy + ty) / 2,
                  'text-anchor': 'middle',
                  fill: '#424242',
                  'font-size': 12,
                  textContent: label,
                },
              } as VNode,
            ]
          : []),
      ],
    };

    this.edges.push(edge);
    return this;
  }

  /**
   * Add a group of nodes.
   */
  addNodeGroup(
    nodes: Array<{
      id: string;
      x: number;
      y: number;
      width?: number;
      height?: number;
      label?: string;
    }>
  ): this {
    nodes.forEach(node => {
      this.addNode(node.id, {
        x: node.x,
        y: node.y,
        width: node.width || 100,
        height: node.height || 60,
        label: node.label,
      });
    });
    return this;
  }

  /**
   * Add metadata to the diagram.
   */
  withMetadata(key: string, value: any): this {
    this.metadata[key] = value;
    return this;
  }

  /**
   * Create a simple flowchart diagram.
   */
  static createSimpleFlowchart(): TestDiagramBuilder {
    return new TestDiagramBuilder()
      .addNode('start', { x: 100, y: 50, width: 120, height: 60, label: 'Start', fill: '#2196F3' })
      .addNode('process', { x: 100, y: 150, width: 120, height: 60, label: 'Process' })
      .addNode('end', { x: 100, y: 250, width: 120, height: 60, label: 'End', fill: '#F44336' })
      .addEdge('edge1', 'start', 'process')
      .addEdge('edge2', 'process', 'end');
  }

  /**
   * Create a complex diagram with multiple branches.
   */
  static createComplexDiagram(): TestDiagramBuilder {
    const builder = new TestDiagramBuilder();

    // Add nodes in a grid
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 4; col++) {
        const id = `node-${row}-${col}`;
        builder.addNode(id, {
          x: col * 150 + 50,
          y: row * 120 + 50,
          width: 100,
          height: 60,
          label: `N${row}${col}`,
        });
      }
    }

    // Add edges
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        const currentId = `node-${row}-${col}`;
        const nextRowId = `node-${row + 1}-${col}`;
        const nextColId = `node-${row}-${col + 1}`;

        if (row < 4) {
          builder.addEdge(`edge-v-${row}-${col}`, currentId, nextRowId);
        }
        if (col < 3) {
          builder.addEdge(`edge-h-${row}-${col}`, currentId, nextColId);
        }
      }
    }

    return builder;
  }

  /**
   * Create a large diagram for performance testing.
   */
  static createLargeDiagram(nodeCount: number = 1000): TestDiagramBuilder {
    const builder = new TestDiagramBuilder();
    const cols = Math.ceil(Math.sqrt(nodeCount));

    for (let i = 0; i < nodeCount; i++) {
      const row = Math.floor(i / cols);
      const col = i % cols;
      builder.addNode(`node-${i}`, {
        x: col * 120 + 20,
        y: row * 100 + 20,
        width: 80,
        height: 50,
        label: `${i}`,
      });

      // Connect to previous node
      if (i > 0) {
        builder.addEdge(`edge-${i}`, `node-${i - 1}`, `node-${i}`);
      }
    }

    return builder;
  }

  /**
   * Build the diagram VNode.
   */
  build(): VNode {
    const defs: VNode = {
      type: 'defs',
      props: {},
      children: [
        {
          type: 'marker',
          props: {
            id: 'arrowhead',
            markerWidth: 10,
            markerHeight: 7,
            refX: 9,
            refY: 3.5,
            orient: 'auto',
          },
          children: [
            {
              type: 'polygon',
              props: {
                points: '0 0, 10 3.5, 0 7',
                fill: '#9E9E9E',
              },
            },
          ],
        },
      ],
    };

    return {
      type: 'svg',
      props: {
        xmlns: 'http://www.w3.org/2000/svg',
        width: '100%' as unknown as number,
        height: '100%' as unknown as number,
        viewBox: '0 0 1000 800',
        ...(Object.keys(this.metadata).length > 0 && {
          'data-metadata': JSON.stringify(this.metadata),
        }),
      },
      children: [defs, ...Array.from(this.nodes.values()), ...this.edges],
    };
  }

  /**
   * Get node count.
   */
  getNodeCount(): number {
    return this.nodes.size;
  }

  /**
   * Get edge count.
   */
  getEdgeCount(): number {
    return this.edges.length;
  }

  /**
   * Clear all nodes and edges.
   */
  clear(): this {
    this.nodes.clear();
    this.edges = [];
    this.metadata = {};
    return this;
  }
}
