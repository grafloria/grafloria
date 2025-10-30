/**
 * Diagram Analyzer - Analyzes diagram structure for DSL generation
 *
 * Determines optimal DSL representation by analyzing:
 * - Node types and shapes
 * - Link patterns and directions
 * - Hierarchical structure
 * - Layout direction
 */

import { DiagramModel } from '../../models/DiagramModel';
import { NodeModel } from '../../models/NodeModel';
import { LinkModel } from '../../models/LinkModel';
import { Direction, DiagramType } from '../types/ASTNode';

export interface DiagramAnalysis {
  /**
   * Suggested diagram type
   */
  diagramType: DiagramType;

  /**
   * Suggested direction
   */
  direction: Direction;

  /**
   * Node ID to order mapping (for sequential output)
   */
  nodeOrder: string[];

  /**
   * Grouped nodes (for subgraphs)
   */
  nodeGroups: Map<string, string[]>;

  /**
   * Node metadata
   */
  nodeMetadata: Map<string, {
    shape: string;
    hasCustomStyle: boolean;
  }>;

  /**
   * Link metadata
   */
  linkMetadata: Map<string, {
    hasLabel: boolean;
    hasCustomStyle: boolean;
  }>;

  /**
   * Overall statistics
   */
  stats: {
    nodeCount: number;
    linkCount: number;
    maxDepth: number;
    hasCycles: boolean;
  };
}

export class DiagramAnalyzer {
  /**
   * Analyze diagram structure
   */
  analyze(diagram: DiagramModel): DiagramAnalysis {
    const nodes = diagram.getNodes();
    const links = diagram.getLinks();

    // Determine diagram type from metadata or node types
    const diagramType = this.determineDiagramType(diagram, nodes);

    // Determine optimal direction
    const direction = this.determineDirection(diagram, nodes, links);

    // Calculate node order for output
    const nodeOrder = this.calculateNodeOrder(nodes, links);

    // Detect node groups (subgraphs)
    const nodeGroups = this.detectNodeGroups(diagram, nodes);

    // Collect node metadata
    const nodeMetadata = this.collectNodeMetadata(nodes);

    // Collect link metadata
    const linkMetadata = this.collectLinkMetadata(links);

    // Calculate statistics
    const stats = this.calculateStats(nodes, links);

    return {
      diagramType,
      direction,
      nodeOrder,
      nodeGroups,
      nodeMetadata,
      linkMetadata,
      stats,
    };
  }

  /**
   * Determine diagram type
   */
  private determineDiagramType(diagram: DiagramModel, nodes: NodeModel[]): DiagramType {
    // Check metadata first
    const metaDiagramType = diagram.getMetadata('diagramType');
    if (metaDiagramType) {
      return metaDiagramType as DiagramType;
    }

    // Infer from node types
    if (nodes.length === 0) {
      return 'flowchart';
    }

    const types = nodes.map(n => n.type);
    const hasFlowchart = types.some(t => t.startsWith('flowchart:'));
    const hasBPMN = types.some(t => t.startsWith('bpmn:'));
    const hasERD = types.some(t => t.startsWith('erd:'));
    const hasUML = types.some(t => t.startsWith('uml:'));

    if (hasBPMN) return 'bpmn';
    if (hasERD) return 'erd';
    if (hasUML) return 'classDiagram';
    return 'flowchart';
  }

  /**
   * Determine optimal direction
   */
  private determineDirection(
    diagram: DiagramModel,
    nodes: NodeModel[],
    links: LinkModel[]
  ): Direction {
    // Check metadata first
    const metaDirection = diagram.getMetadata('direction');
    if (metaDirection) {
      return metaDirection as Direction;
    }

    // Analyze node positions to infer direction
    if (nodes.length < 2) {
      return 'TD'; // Default
    }

    // Calculate average position deltas
    let totalDx = 0;
    let totalDy = 0;
    let count = 0;

    for (const link of links) {
      const sourceNode = nodes.find(n => n.id === link.sourceNodeId);
      const targetNode = nodes.find(n => n.id === link.targetNodeId);

      if (sourceNode && targetNode) {
        const dx = targetNode.position.x - sourceNode.position.x;
        const dy = targetNode.position.y - sourceNode.position.y;
        totalDx += dx;
        totalDy += dy;
        count++;
      }
    }

    if (count === 0) {
      return 'TD';
    }

    const avgDx = totalDx / count;
    const avgDy = totalDy / count;

    // Determine primary direction
    if (Math.abs(avgDx) > Math.abs(avgDy)) {
      // Horizontal flow
      return avgDx > 0 ? 'LR' : 'RL';
    } else {
      // Vertical flow
      return avgDy > 0 ? 'TD' : 'BT';
    }
  }

  /**
   * Calculate node order for sequential output
   * Uses topological sort for DAGs, or DFS for general graphs
   */
  private calculateNodeOrder(nodes: NodeModel[], links: LinkModel[]): string[] {
    if (nodes.length === 0) {
      return [];
    }

    // Build adjacency list
    const outgoing = new Map<string, Set<string>>();
    const incoming = new Map<string, number>();

    for (const node of nodes) {
      outgoing.set(node.id, new Set());
      incoming.set(node.id, 0);
    }

    for (const link of links) {
      const sourceId = link.sourceNodeId;
      const targetId = link.targetNodeId;

      if (sourceId && targetId) {
        outgoing.get(sourceId)?.add(targetId);
        incoming.set(targetId, (incoming.get(targetId) || 0) + 1);
      }
    }

    // Try topological sort (works for DAGs)
    const sorted = this.topologicalSort(nodes, outgoing, incoming);

    if (sorted.length === nodes.length) {
      return sorted;
    }

    // Fallback: DFS order
    return this.dfsOrder(nodes, outgoing);
  }

  /**
   * Topological sort (Kahn's algorithm)
   */
  private topologicalSort(
    nodes: NodeModel[],
    outgoing: Map<string, Set<string>>,
    incoming: Map<string, number>
  ): string[] {
    const result: string[] = [];
    const queue: string[] = [];

    // Find nodes with no incoming edges
    for (const [nodeId, inCount] of incoming.entries()) {
      if (inCount === 0) {
        queue.push(nodeId);
      }
    }

    const incomingCopy = new Map(incoming);

    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      result.push(nodeId);

      const neighbors = outgoing.get(nodeId);
      if (neighbors) {
        for (const neighbor of neighbors) {
          const count = incomingCopy.get(neighbor)! - 1;
          incomingCopy.set(neighbor, count);

          if (count === 0) {
            queue.push(neighbor);
          }
        }
      }
    }

    return result;
  }

  /**
   * DFS order (fallback for cyclic graphs)
   */
  private dfsOrder(nodes: NodeModel[], outgoing: Map<string, Set<string>>): string[] {
    const result: string[] = [];
    const visited = new Set<string>();

    const dfs = (nodeId: string) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      result.push(nodeId);

      const neighbors = outgoing.get(nodeId);
      if (neighbors) {
        for (const neighbor of neighbors) {
          dfs(neighbor);
        }
      }
    };

    // Start from all unvisited nodes
    for (const node of nodes) {
      if (!visited.has(node.id)) {
        dfs(node.id);
      }
    }

    return result;
  }

  /**
   * Detect node groups (for subgraph generation)
   */
  private detectNodeGroups(diagram: DiagramModel, nodes: NodeModel[]): Map<string, string[]> {
    const groups = new Map<string, string[]>();

    // Check for explicit groups
    const diagramGroups = diagram.getGroups();
    for (const group of diagramGroups) {
      const memberIds = group.getMetadata('members') || [];
      if (memberIds.length > 0) {
        groups.set(group.id, memberIds);
      }
    }

    // TODO: Add clustering analysis for implicit groups

    return groups;
  }

  /**
   * Collect node metadata
   */
  private collectNodeMetadata(nodes: NodeModel[]): Map<string, { shape: string; hasCustomStyle: boolean }> {
    const metadata = new Map();

    for (const node of nodes) {
      const shape = node.getMetadata('dslShape') || node.getMetadata('shape') || 'rectangle';
      const hasCustomStyle = this.hasCustomStyle(node.style);

      metadata.set(node.id, { shape, hasCustomStyle });
    }

    return metadata;
  }

  /**
   * Collect link metadata
   */
  private collectLinkMetadata(links: LinkModel[]): Map<string, { hasLabel: boolean; hasCustomStyle: boolean }> {
    const metadata = new Map();

    for (const link of links) {
      const hasLabel = !!link.data['label'];
      const hasCustomStyle = this.hasCustomStyle(link.style);

      metadata.set(link.id, { hasLabel, hasCustomStyle });
    }

    return metadata;
  }

  /**
   * Check if entity has custom styling
   */
  private hasCustomStyle(style: any): boolean {
    if (!style) return false;

    const defaultKeys = ['fill', 'stroke', 'strokeWidth'];
    const customKeys = Object.keys(style).filter(k => !defaultKeys.includes(k));

    return customKeys.length > 0 || this.hasNonDefaultValues(style);
  }

  /**
   * Check if style has non-default values
   */
  private hasNonDefaultValues(style: any): boolean {
    // Simple heuristic: check for common non-default values
    if (style.strokeDasharray) return true;
    if (style.strokeWidth && style.strokeWidth !== 2) return true;
    return false;
  }

  /**
   * Calculate statistics
   */
  private calculateStats(nodes: NodeModel[], links: LinkModel[]): {
    nodeCount: number;
    linkCount: number;
    maxDepth: number;
    hasCycles: boolean;
  } {
    const nodeCount = nodes.length;
    const linkCount = links.length;

    // Build adjacency list
    const outgoing = new Map<string, Set<string>>();
    const incoming = new Map<string, Set<string>>();

    for (const node of nodes) {
      outgoing.set(node.id, new Set());
      incoming.set(node.id, new Set());
    }

    for (const link of links) {
      const sourceId = link.sourceNodeId;
      const targetId = link.targetNodeId;

      if (sourceId && targetId) {
        outgoing.get(sourceId)?.add(targetId);
        incoming.get(targetId)?.add(sourceId);
      }
    }

    // Detect cycles
    const hasCycles = this.detectCyclesDFS(nodes, outgoing);

    // Calculate max depth
    const maxDepth = this.calculateMaxDepthBFS(nodes, outgoing, incoming);

    return {
      nodeCount,
      linkCount,
      maxDepth,
      hasCycles,
    };
  }

  /**
   * Detect cycles using DFS
   */
  private detectCyclesDFS(nodes: NodeModel[], outgoing: Map<string, Set<string>>): boolean {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (nodeId: string): boolean => {
      visited.add(nodeId);
      recursionStack.add(nodeId);

      const neighbors = outgoing.get(nodeId);
      if (neighbors) {
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            if (dfs(neighbor)) return true;
          } else if (recursionStack.has(neighbor)) {
            return true; // Cycle detected
          }
        }
      }

      recursionStack.delete(nodeId);
      return false;
    };

    for (const node of nodes) {
      if (!visited.has(node.id)) {
        if (dfs(node.id)) return true;
      }
    }

    return false;
  }

  /**
   * Calculate max depth using BFS
   */
  private calculateMaxDepthBFS(
    nodes: NodeModel[],
    outgoing: Map<string, Set<string>>,
    incoming: Map<string, Set<string>>
  ): number {
    // Find root nodes (no incoming edges)
    const roots = nodes.filter(node => (incoming.get(node.id)?.size || 0) === 0);

    if (roots.length === 0) {
      return 0; // Cyclic graph
    }

    let maxDepth = 0;
    const depths = new Map<string, number>();

    // BFS from all roots
    const queue: Array<{ nodeId: string; depth: number }> = [];
    for (const root of roots) {
      queue.push({ nodeId: root.id, depth: 1 });
      depths.set(root.id, 1);
    }

    while (queue.length > 0) {
      const { nodeId, depth } = queue.shift()!;
      maxDepth = Math.max(maxDepth, depth);

      const neighbors = outgoing.get(nodeId);
      if (neighbors) {
        for (const neighbor of neighbors) {
          const currentDepth = depths.get(neighbor) || 0;
          if (depth + 1 > currentDepth) {
            depths.set(neighbor, depth + 1);
            queue.push({ nodeId: neighbor, depth: depth + 1 });
          }
        }
      }
    }

    return maxDepth;
  }
}
