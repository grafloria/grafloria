/**
 * ELK Layout Adapter
 *
 * Integrates the Eclipse Layout Kernel (ELK) for advanced multi-algorithm layouts.
 * Supports 6 different layout algorithms: layered, force, stress, mrtree, radial, and disco.
 *
 * @see https://www.eclipse.org/elk/
 * @see https://github.com/kieler/elkjs
 */

import ELK, { ElkNode, ElkExtendedEdge } from 'elkjs/lib/elk.bundled';
import { NodeModel } from '../models/NodeModel';
import { LinkModel } from '../models/LinkModel';
import { LayoutAdapter, LayoutOptions, LayoutResult } from './layout-adapter.interface';
import { ConstraintManager } from './layout-constraints.interface';
import {
  IncrementalLayoutOptions,
  IncrementalLayoutResult,
  IncrementalLayoutManager,
} from './incremental-layout.interface';
import { LayoutQualityMetrics } from './layout-quality-metrics';
import { PortAwareLayoutManager, PortInfo } from './port-aware-layout.interface';
import { SubgraphLayoutManager } from './subgraph-layout.interface';

/**
 * ELK layout algorithms
 */
export type ELKAlgorithm =
  | 'layered' // Hierarchical layout (similar to Dagre but more advanced)
  | 'force' // Force-directed layout
  | 'stress' // Stress minimization layout
  | 'mrtree' // Tree layout (Mr. Tree algorithm)
  | 'radial' // Radial layout
  | 'disco'; // Disconnected components layout

/**
 * ELK-specific layout options
 */
export interface ELKLayoutOptions extends LayoutOptions {
  /** ELK algorithm to use */
  algorithm: ELKAlgorithm;

  // Common options
  /** Layout direction */
  'elk.direction'?: 'RIGHT' | 'LEFT' | 'DOWN' | 'UP';
  /** Spacing between nodes */
  'elk.spacing.nodeNode'?: number;
  /** Spacing between edges and nodes */
  'elk.spacing.edgeNode'?: number;
  /** Spacing between edges */
  'elk.spacing.edgeEdge'?: number;

  // Layered algorithm specific options
  /** Spacing between nodes in different layers */
  'elk.layered.spacing.nodeNodeBetweenLayers'?: number;
  /** Spacing between edges and nodes in different layers */
  'elk.layered.spacing.edgeNodeBetweenLayers'?: number;
  /** Node placement strategy for layered algorithm */
  'elk.layered.nodePlacement.strategy'?:
    | 'SIMPLE'
    | 'INTERACTIVE'
    | 'LINEAR_SEGMENTS'
    | 'BRANDES_KOEPF'
    | 'NETWORK_SIMPLEX';
  /** Crossing minimization strategy */
  'elk.layered.crossingMinimization.strategy'?: 'LAYER_SWEEP' | 'INTERACTIVE';

  // Force algorithm specific options
  /** Repulsion force strength */
  'elk.force.repulsion'?: number;
  /** Temperature for force algorithm */
  'elk.force.temperature'?: number;
  /** Number of iterations for force algorithm */
  'elk.force.iterations'?: number;

  // Radial algorithm specific options
  /** Radius for radial layout */
  'elk.radial.radius'?: number;
  /** Whether to compact radial layout */
  'elk.radial.compaction'?: boolean;

  // Advanced options
  /** How to handle hierarchical graphs */
  hierarchyHandling?: 'INCLUDE_CHILDREN' | 'SEPARATE_CHILDREN';
  /** Edge routing style */
  edgeRouting?: 'ORTHOGONAL' | 'POLYLINE' | 'SPLINES';
}

/**
 * Default ELK layout options
 */
const DEFAULT_ELK_OPTIONS: Partial<ELKLayoutOptions> = {
  algorithm: 'layered',
  'elk.direction': 'RIGHT',
  'elk.spacing.nodeNode': 80,
};

/**
 * ELK Layout Adapter
 *
 * Provides advanced layout algorithms using the Eclipse Layout Kernel.
 * Supports multiple algorithms with extensive configuration options.
 */
export class ELKLayoutAdapter implements LayoutAdapter {
  readonly name = 'elk';
  private elk: ELK;

  constructor() {
    this.elk = new ELK();
  }

  /**
   * Apply ELK layout to nodes and links
   *
   * @param nodes - Nodes to layout
   * @param links - Links connecting the nodes
   * @param options - ELK layout options
   * @returns Layout result with positions and metadata
   */
  async apply(
    nodes: NodeModel[],
    links: LinkModel[],
    options: Partial<ELKLayoutOptions> = {}
  ): Promise<LayoutResult> {
    const startTime = performance.now();

    // Merge default options with provided options
    const elkOptions: Partial<ELKLayoutOptions> = {
      ...DEFAULT_ELK_OPTIONS,
      ...options,
    };

    // Build ELK graph structure
    const elkGraph: ElkNode = {
      id: 'root',
      layoutOptions: this.buildLayoutOptions(elkOptions),
      children: nodes.map((node) => ({
        id: node.id,
        width: node.size.width || 150,
        height: node.size.height || 50,
      })),
      edges: links
        .filter((link) => link.sourceNodeId && link.targetNodeId)
        .map((link) => ({
          id: link.id,
          sources: [link.sourceNodeId!],
          targets: [link.targetNodeId!],
        })),
    };

    // Run ELK layout algorithm
    const layoutedGraph = await this.elk.layout(elkGraph);

    // Extract positions from layouted graph
    const nodePositions = new Map<string, { x: number; y: number }>();

    layoutedGraph.children?.forEach((child) => {
      if (child.x !== undefined && child.y !== undefined) {
        nodePositions.set(child.id, {
          x: child.x,
          y: child.y,
        });
      }
    });

    // Apply layout constraints if provided
    if (options.constraints) {
      const constraintManager = new ConstraintManager(options.constraints);
      const conflictResolution = options.constraints.conflictResolution || 'priority';

      // Apply constraints to each node position
      nodePositions.forEach((position, nodeId) => {
        const constrainedPosition = constraintManager.applyConstraints(
          nodeId,
          position,
          conflictResolution
        );
        nodePositions.set(nodeId, constrainedPosition);
      });
    }

    // Calculate bounding box
    const bounds = this.calculateBounds(layoutedGraph);

    const endTime = performance.now();

    // Calculate quality metrics if requested
    let quality = undefined;
    if (options.calculateQuality) {
      // Apply positions to nodes temporarily for quality assessment
      nodes.forEach(node => {
        const newPos = nodePositions.get(node.id);
        if (newPos) {
          node.setPosition(newPos.x, newPos.y);
        }
      });

      quality = LayoutQualityMetrics.assess(nodes, links, {
        includeSuggestions: true,
        canvasDimensions: options.canvasDimensions,
      });
    }

    // Process port-aware layout if enabled (Phase 3)
    let portAware = undefined;
    if (options.portAware && options.portAware.enabled) {
      const nodeSizes = new Map<string, { width: number; height: number }>();
      nodes.forEach(node => {
        nodeSizes.set(node.id, {
          width: node.size.width || 150,
          height: node.size.height || 50,
        });
      });

      portAware = PortAwareLayoutManager.computePortLayout(
        options.portAware.ports || [],
        nodePositions,
        nodeSizes,
        links.map(link => ({
          sourcePortId: link.sourcePortId,
          targetPortId: link.targetPortId,
        })),
        options.portAware
      );
    }

    // Process subgraph layout if enabled (Phase 3)
    let subgraph = undefined;
    if (options.subgraph && options.subgraph.enabled && options.subgraph.groups) {
      const nodeSizes = new Map<string, { width: number; height: number }>();
      nodes.forEach(node => {
        nodeSizes.set(node.id, {
          width: node.size.width || 150,
          height: node.size.height || 50,
        });
      });

      // Convert NodeModel[] to generic node array
      const genericNodes = nodes.map(node => ({
        id: node.id,
        ...node
      }));

      const genericLinks = links.map(link => ({
        sourceNodeId: link.sourceNodeId || '',
        targetNodeId: link.targetNodeId || '',
        ...link
      }));

      subgraph = await SubgraphLayoutManager.computeSubgraphLayout(
        options.subgraph.groups,
        genericNodes,
        genericLinks,
        nodeSizes,
        this,
        options.subgraph
      );

      // If subgraph layout was performed, use those positions
      if (subgraph.nodePositions.size > 0) {
        // Replace node positions with subgraph positions
        subgraph.nodePositions.forEach((pos, nodeId) => {
          nodePositions.set(nodeId, { x: pos.x, y: pos.y });
        });

        // Update bounds
        bounds.x = subgraph.bounds.x;
        bounds.y = subgraph.bounds.y;
        bounds.width = subgraph.bounds.width;
        bounds.height = subgraph.bounds.height;
      }
    }

    return {
      nodePositions,
      bounds,
      metadata: {
        algorithm: 'elk',
        elkAlgorithm: elkOptions.algorithm || 'layered',
        direction: elkOptions['elk.direction'] || 'RIGHT',
        executionTime: endTime - startTime,
        nodeCount: nodes.length,
        linkCount: links.length,
      },
      quality,
      portAware,
      subgraph,
    };
  }

  /**
   * Build ELK layout options from our options interface
   *
   * Converts our strongly-typed options to ELK's string-based option format.
   *
   * @param options - Our layout options
   * @returns ELK layout options object
   */
  private buildLayoutOptions(options: Partial<ELKLayoutOptions>): Record<string, string> {
    const elkOptions: Record<string, string> = {
      'elk.algorithm': options.algorithm || 'layered',
    };

    // Map direction option
    if (options['elk.direction']) {
      elkOptions['elk.direction'] = options['elk.direction'];
    }

    // Map spacing options
    if (options['elk.spacing.nodeNode'] !== undefined) {
      elkOptions['elk.spacing.nodeNode'] = String(options['elk.spacing.nodeNode']);
    }
    if (options['elk.spacing.edgeNode'] !== undefined) {
      elkOptions['elk.spacing.edgeNode'] = String(options['elk.spacing.edgeNode']);
    }
    if (options['elk.spacing.edgeEdge'] !== undefined) {
      elkOptions['elk.spacing.edgeEdge'] = String(options['elk.spacing.edgeEdge']);
    }

    // Layered algorithm options
    if (options['elk.layered.spacing.nodeNodeBetweenLayers'] !== undefined) {
      elkOptions['elk.layered.spacing.nodeNodeBetweenLayers'] = String(
        options['elk.layered.spacing.nodeNodeBetweenLayers']
      );
    }
    if (options['elk.layered.spacing.edgeNodeBetweenLayers'] !== undefined) {
      elkOptions['elk.layered.spacing.edgeNodeBetweenLayers'] = String(
        options['elk.layered.spacing.edgeNodeBetweenLayers']
      );
    }
    if (options['elk.layered.nodePlacement.strategy']) {
      elkOptions['elk.layered.nodePlacement.strategy'] =
        options['elk.layered.nodePlacement.strategy'];
    }
    if (options['elk.layered.crossingMinimization.strategy']) {
      elkOptions['elk.layered.crossingMinimization.strategy'] =
        options['elk.layered.crossingMinimization.strategy'];
    }

    // Force algorithm options
    if (options['elk.force.repulsion'] !== undefined) {
      elkOptions['elk.force.repulsion'] = String(options['elk.force.repulsion']);
    }
    if (options['elk.force.temperature'] !== undefined) {
      elkOptions['elk.force.temperature'] = String(options['elk.force.temperature']);
    }
    if (options['elk.force.iterations'] !== undefined) {
      elkOptions['elk.force.iterations'] = String(options['elk.force.iterations']);
    }

    // Radial algorithm options
    if (options['elk.radial.radius'] !== undefined) {
      elkOptions['elk.radial.radius'] = String(options['elk.radial.radius']);
    }
    if (options['elk.radial.compaction'] !== undefined) {
      elkOptions['elk.radial.compaction'] = String(options['elk.radial.compaction']);
    }

    // Advanced options
    if (options.hierarchyHandling) {
      elkOptions['elk.hierarchyHandling'] = options.hierarchyHandling;
    }
    if (options.edgeRouting) {
      elkOptions['elk.edgeRouting'] = options.edgeRouting;
    }

    return elkOptions;
  }

  /**
   * Validate ELK layout options
   *
   * @param options - Options to validate
   * @returns true if valid, false otherwise
   */
  validateOptions(options: Partial<ELKLayoutOptions>): boolean {
    // Validate algorithm
    const validAlgorithms: ELKAlgorithm[] = [
      'layered',
      'force',
      'stress',
      'mrtree',
      'radial',
      'disco',
    ];
    if (options.algorithm && !validAlgorithms.includes(options.algorithm)) {
      return false;
    }

    // Validate direction
    const validDirections = ['RIGHT', 'LEFT', 'DOWN', 'UP'];
    if (options['elk.direction'] && !validDirections.includes(options['elk.direction'])) {
      return false;
    }

    // Validate node placement strategy
    const validNodePlacementStrategies = [
      'SIMPLE',
      'INTERACTIVE',
      'LINEAR_SEGMENTS',
      'BRANDES_KOEPF',
      'NETWORK_SIMPLEX',
    ];
    if (
      options['elk.layered.nodePlacement.strategy'] &&
      !validNodePlacementStrategies.includes(options['elk.layered.nodePlacement.strategy'])
    ) {
      return false;
    }

    // Validate crossing minimization strategy
    const validCrossingMinStrategies = ['LAYER_SWEEP', 'INTERACTIVE'];
    if (
      options['elk.layered.crossingMinimization.strategy'] &&
      !validCrossingMinStrategies.includes(options['elk.layered.crossingMinimization.strategy'])
    ) {
      return false;
    }

    // Validate numeric options are positive
    const numericOptions = [
      'elk.spacing.nodeNode',
      'elk.spacing.edgeNode',
      'elk.spacing.edgeEdge',
      'elk.layered.spacing.nodeNodeBetweenLayers',
      'elk.layered.spacing.edgeNodeBetweenLayers',
      'elk.force.repulsion',
      'elk.force.temperature',
      'elk.force.iterations',
      'elk.radial.radius',
    ] as const;

    for (const option of numericOptions) {
      if (options[option] !== undefined && (options[option] as number) < 0) {
        return false;
      }
    }

    return true;
  }

  /**
   * Calculate bounding box from ELK graph
   *
   * @param graph - ELK graph after layout
   * @returns Bounding box
   */
  private calculateBounds(graph: ElkNode): {
    x: number;
    y: number;
    width: number;
    height: number;
  } {
    if (!graph.children || graph.children.length === 0) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    graph.children.forEach((child) => {
      if (child.x !== undefined && child.y !== undefined) {
        const width = child.width || 0;
        const height = child.height || 0;

        minX = Math.min(minX, child.x);
        minY = Math.min(minY, child.y);
        maxX = Math.max(maxX, child.x + width);
        maxY = Math.max(maxY, child.y + height);
      }
    });

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  /**
   * Apply incremental layout - layout new nodes while preserving existing positions
   *
   * @param nodes - Array of all nodes (existing + new)
   * @param links - Array of all links
   * @param incrementalOptions - Options for incremental layout
   * @param layoutOptions - Base layout options
   * @returns Layout result with positions and incremental statistics
   */
  async applyIncremental(
    nodes: NodeModel[],
    links: LinkModel[],
    incrementalOptions: IncrementalLayoutOptions,
    layoutOptions?: Partial<ELKLayoutOptions>
  ): Promise<LayoutResult & { incremental: IncrementalLayoutResult }> {
    // Store original positions for movement calculation
    const oldPositions = new Map<string, { x: number; y: number }>();
    nodes.forEach(node => {
      const pos = node.getPosition();
      oldPositions.set(node.id, { x: pos.x, y: pos.y });
    });

    // Identify new nodes
    const newNodeIds = IncrementalLayoutManager.identifyNewNodes(nodes, incrementalOptions);
    const strategy = incrementalOptions.strategy || 'pin-existing';

    // Generate constraints based on strategy
    const generatedConstraints = IncrementalLayoutManager.generateConstraints(
      nodes,
      incrementalOptions
    );

    // Merge layout options with generated constraints
    const mergedOptions: Partial<ELKLayoutOptions> = {
      ...layoutOptions,
      constraints: generatedConstraints,
    };

    // Apply normal layout with constraints
    const layoutResult = await this.apply(nodes, links, mergedOptions);

    // Calculate incremental statistics
    const incrementalResult = IncrementalLayoutManager.calculateResult(
      nodes,
      oldPositions,
      newNodeIds,
      generatedConstraints,
      strategy
    );

    // Return combined result
    return {
      ...layoutResult,
      incremental: incrementalResult,
    };
  }
}
