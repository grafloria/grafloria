// HybridLayoutAlgorithm - Intelligent pattern detection and algorithm selection

import { BaseLayoutAlgorithm, type ILayoutAlgorithm } from '../ILayoutAlgorithm';
import type { PlacementOptions, PlacementResult, LayoutConfiguration, HybridOptions } from '../types';
import type { DiagramModel } from '../../models/DiagramModel';
import type { NodeModel } from '../../models/NodeModel';
import type { Point } from '../../types';
import { GridLayoutAlgorithm } from './GridLayoutAlgorithm';
import { HierarchicalLayoutAlgorithm } from './HierarchicalLayoutAlgorithm';
import { ForceDirectedLayoutAlgorithm } from './ForceDirectedLayoutAlgorithm';

type DetectedPattern = 'grid' | 'tree' | 'network' | 'sparse';

interface PatternAnalysis {
  pattern: DetectedPattern;
  confidence: number;
  reason: string;
  recommendedAlgorithm: 'grid' | 'hierarchical' | 'force-directed';
  metrics: {
    nodeCount: number;
    edgeCount: number;
    density: number;
    avgDegree: number;
    hasCycles: boolean;
    isDirected: boolean;
    connectedComponents: number;
  };
}

/**
 * HybridLayoutAlgorithm
 *
 * Intelligent layout algorithm that:
 * - Analyzes the diagram structure
 * - Detects patterns (grid, tree, network, sparse)
 * - Automatically selects the best algorithm
 * - Delegates to the chosen algorithm
 *
 * Pattern Detection:
 * - Grid: Few or no edges, uniform structure
 * - Tree/Hierarchy: Acyclic, directional flow
 * - Network: Dense connections, cycles
 * - Sparse: Few nodes, simple connections
 *
 * Best for:
 * - Dynamic diagrams where structure changes
 * - Mixed diagram types
 * - When user doesn't want to choose algorithm
 */
export class HybridLayoutAlgorithm extends BaseLayoutAlgorithm implements ILayoutAlgorithm {
  private hybridOptions: HybridOptions;
  private gridAlgorithm: GridLayoutAlgorithm;
  private hierarchicalAlgorithm: HierarchicalLayoutAlgorithm;
  private forceDirectedAlgorithm: ForceDirectedLayoutAlgorithm;
  private lastDetectedPattern?: DetectedPattern;

  constructor(options?: HybridOptions) {
    super();
    this.hybridOptions = {
      fallbackAlgorithm: 'grid',
      enableAutoSwitch: true,
      analysisThreshold: 0.7, // Confidence threshold for pattern detection
      ...options,
    };

    // Initialize sub-algorithms
    this.gridAlgorithm = new GridLayoutAlgorithm();
    this.hierarchicalAlgorithm = new HierarchicalLayoutAlgorithm();
    this.forceDirectedAlgorithm = new ForceDirectedLayoutAlgorithm();
  }

  getName(): string {
    return 'Hybrid Layout (Auto)';
  }

  getType(): 'hybrid' {
    return 'hybrid';
  }

  override configure(config: LayoutConfiguration): void {
    if (config.options) {
      this.hybridOptions = {
        ...this.hybridOptions,
        ...config.options,
      };
    }

    // Pass configuration to sub-algorithms
    const hybridOpts = config.options as HybridOptions | undefined;
    if (hybridOpts?.gridOptions) {
      this.gridAlgorithm.configure({ type: 'grid', options: hybridOpts.gridOptions });
    }
    if (hybridOpts?.hierarchicalOptions) {
      this.hierarchicalAlgorithm.configure({
        type: 'hierarchical',
        options: hybridOpts.hierarchicalOptions,
      });
    }
    if (hybridOpts?.forceDirectedOptions) {
      this.forceDirectedAlgorithm.configure({
        type: 'force-directed',
        options: hybridOpts.forceDirectedOptions,
      });
    }
  }

  override getConfiguration(): LayoutConfiguration {
    return {
      type: 'hybrid',
      options: this.hybridOptions,
    };
  }

  override canApply(diagram: DiagramModel): { valid: boolean; reason?: string } {
    const nodes = diagram.getNodes();
    if (nodes.length === 0) {
      return { valid: false, reason: 'No nodes to layout' };
    }
    return { valid: true };
  }

  /**
   * Analyze diagram structure and detect pattern
   */
  private analyzePattern(diagram: DiagramModel): PatternAnalysis {
    const nodes = diagram.getNodes();
    const links = diagram.getLinks();

    const nodeCount = nodes.length;
    const edgeCount = links.length;

    // Calculate graph metrics
    const density = nodeCount > 1 ? (2 * edgeCount) / (nodeCount * (nodeCount - 1)) : 0;
    const avgDegree = nodeCount > 0 ? (2 * edgeCount) / nodeCount : 0;

    // Build adjacency list
    const adjacency = new Map<string, Set<string>>();
    const inDegree = new Map<string, number>();
    const outDegree = new Map<string, number>();

    nodes.forEach((node) => {
      adjacency.set(node.id, new Set());
      inDegree.set(node.id, 0);
      outDegree.set(node.id, 0);
    });

    links.forEach((link) => {
      if (link.sourceNodeId && link.targetNodeId) {
        adjacency.get(link.sourceNodeId)?.add(link.targetNodeId);
        adjacency.get(link.targetNodeId)?.add(link.sourceNodeId);
        outDegree.set(link.sourceNodeId, (outDegree.get(link.sourceNodeId) || 0) + 1);
        inDegree.set(link.targetNodeId, (inDegree.get(link.targetNodeId) || 0) + 1);
      }
    });

    // Detect cycles using DFS
    const hasCycles = this.detectCycles(adjacency, nodes.map((n) => n.id));

    // Check if graph is directed (unequal in/out degrees)
    let isDirected = false;
    for (const nodeId of nodes.map((n) => n.id)) {
      if (inDegree.get(nodeId) !== outDegree.get(nodeId)) {
        isDirected = true;
        break;
      }
    }

    // Count connected components
    const connectedComponents = this.countConnectedComponents(adjacency, nodes.map((n) => n.id));

    // Pattern detection logic
    let pattern: DetectedPattern;
    let confidence: number;
    let reason: string;
    let recommendedAlgorithm: 'grid' | 'hierarchical' | 'force-directed';

    // Rule 1: Very few or no edges -> Grid
    if (edgeCount === 0 || density < 0.1) {
      pattern = 'sparse';
      confidence = 0.95;
      reason = 'Few or no connections detected';
      recommendedAlgorithm = 'grid';
    }
    // Rule 2: Acyclic + directed flow -> Tree/Hierarchy
    else if (!hasCycles && isDirected && density < 0.4) {
      pattern = 'tree';
      confidence = 0.9;
      reason = 'Acyclic directed graph detected (tree structure)';
      recommendedAlgorithm = 'hierarchical';
    }
    // Rule 3: High connectivity or cycles -> Network
    else if (hasCycles || density > 0.3 || avgDegree > 3) {
      pattern = 'network';
      confidence = 0.85;
      reason = 'Dense network with cycles detected';
      recommendedAlgorithm = 'force-directed';
    }
    // Rule 4: Medium connectivity, no clear pattern -> Network
    else if (density >= 0.1 && density <= 0.3) {
      pattern = 'network';
      confidence = 0.7;
      reason = 'Medium connectivity, using force-directed layout';
      recommendedAlgorithm = 'force-directed';
    }
    // Fallback: Grid
    else {
      pattern = 'grid';
      confidence = 0.6;
      reason = 'No clear pattern detected, using grid layout';
      recommendedAlgorithm = 'grid';
    }

    return {
      pattern,
      confidence,
      reason,
      recommendedAlgorithm,
      metrics: {
        nodeCount,
        edgeCount,
        density,
        avgDegree,
        hasCycles,
        isDirected,
        connectedComponents,
      },
    };
  }

  /**
   * Detect cycles in graph using DFS
   */
  private detectCycles(adjacency: Map<string, Set<string>>, nodeIds: string[]): boolean {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (nodeId: string): boolean => {
      visited.add(nodeId);
      recursionStack.add(nodeId);

      const neighbors = adjacency.get(nodeId) || new Set();
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (dfs(neighbor)) return true;
        } else if (recursionStack.has(neighbor)) {
          return true; // Back edge found (cycle)
        }
      }

      recursionStack.delete(nodeId);
      return false;
    };

    for (const nodeId of nodeIds) {
      if (!visited.has(nodeId)) {
        if (dfs(nodeId)) return true;
      }
    }

    return false;
  }

  /**
   * Count connected components using BFS
   */
  private countConnectedComponents(
    adjacency: Map<string, Set<string>>,
    nodeIds: string[]
  ): number {
    const visited = new Set<string>();
    let components = 0;

    const bfs = (startId: string) => {
      const queue = [startId];
      visited.add(startId);

      while (queue.length > 0) {
        const nodeId = queue.shift()!;
        const neighbors = adjacency.get(nodeId) || new Set();

        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push(neighbor);
          }
        }
      }
    };

    for (const nodeId of nodeIds) {
      if (!visited.has(nodeId)) {
        bfs(nodeId);
        components++;
      }
    }

    return components;
  }

  calculatePlacement(options: PlacementOptions): PlacementResult {
    // For single node placement, we need to consider existing structure
    const { existingNodes } = options;

    // If no existing nodes, just use grid
    if (existingNodes.length === 0) {
      return this.gridAlgorithm.calculatePlacement(options);
    }

    // Quick heuristic: if we have a last detected pattern, use that algorithm
    if (this.lastDetectedPattern) {
      switch (this.lastDetectedPattern) {
        case 'grid':
        case 'sparse':
          return this.gridAlgorithm.calculatePlacement(options);
        case 'tree':
          return this.hierarchicalAlgorithm.calculatePlacement(options);
        case 'network':
          return this.forceDirectedAlgorithm.calculatePlacement(options);
      }
    }

    // Fallback to grid for single placement
    return this.gridAlgorithm.calculatePlacement(options);
  }

  reLayout(diagram: DiagramModel, config?: LayoutConfiguration): Map<string, Point> {
    if (config) {
      this.configure(config);
    }

    // Analyze the diagram structure
    const analysis = this.analyzePattern(diagram);
    this.lastDetectedPattern = analysis.pattern;

    console.log('🔍 Hybrid Layout Analysis:', {
      pattern: analysis.pattern,
      confidence: `${(analysis.confidence * 100).toFixed(0)}%`,
      reason: analysis.reason,
      algorithm: analysis.recommendedAlgorithm,
      metrics: analysis.metrics,
    });

    // Select and apply algorithm based on analysis
    let positions: Map<string, Point>;

    if (analysis.confidence >= (this.hybridOptions.analysisThreshold || 0.7)) {
      switch (analysis.recommendedAlgorithm) {
        case 'grid':
          console.log('📊 Applying Grid Layout');
          positions = this.gridAlgorithm.reLayout(diagram, config);
          break;
        case 'hierarchical':
          console.log('🌳 Applying Hierarchical Layout');
          positions = this.hierarchicalAlgorithm.reLayout(diagram, config);
          break;
        case 'force-directed':
          console.log('🧲 Applying Force-Directed Layout');
          positions = this.forceDirectedAlgorithm.reLayout(diagram, config);
          break;
        default:
          positions = this.gridAlgorithm.reLayout(diagram, config);
      }
    } else {
      // Low confidence, use fallback
      const fallback = this.hybridOptions.fallbackAlgorithm || 'grid';
      console.log(`⚠️ Low confidence (${(analysis.confidence * 100).toFixed(0)}%), using fallback: ${fallback}`);

      switch (fallback) {
        case 'grid':
          positions = this.gridAlgorithm.reLayout(diagram, config);
          break;
        case 'hierarchical':
          positions = this.hierarchicalAlgorithm.reLayout(diagram, config);
          break;
        case 'force-directed':
          positions = this.forceDirectedAlgorithm.reLayout(diagram, config);
          break;
        default:
          positions = this.gridAlgorithm.reLayout(diagram, config);
      }
    }

    return positions;
  }

  onActivate(): void {
    console.log('🎯 Hybrid layout activated (intelligent pattern detection)');
  }

  onDeactivate(): void {
    console.log('🎯 Hybrid layout deactivated');
  }

  /**
   * Get the last detected pattern (useful for debugging/UI)
   */
  getLastDetectedPattern(): DetectedPattern | undefined {
    return this.lastDetectedPattern;
  }
}
