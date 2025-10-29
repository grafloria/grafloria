/**
 * Dagre Layout Adapter
 *
 * Integrates the Dagre library for hierarchical graph layouts.
 * Supports multiple directions, ranking algorithms, and fine-tuned spacing controls.
 *
 * @see https://github.com/dagrejs/dagre
 */

import dagre from 'dagre';
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
 * Dagre-specific layout options
 */
export interface DagreLayoutOptions extends LayoutOptions {
  /** Layout direction */
  rankdir: 'TB' | 'BT' | 'LR' | 'RL';
  /** Alignment for rank nodes */
  align?: 'UL' | 'UR' | 'DL' | 'DR';
  /** Separation between adjacent nodes on the same rank (pixels) */
  nodesep: number;
  /** Separation between adjacent edges (pixels) */
  edgesep: number;
  /** Separation between ranks (pixels) */
  ranksep: number;
  /** Horizontal margin (pixels) */
  marginx: number;
  /** Vertical margin (pixels) */
  marginy: number;
  /** Acyclic strategy for breaking cycles */
  acyclicer?: 'greedy' | undefined;
  /** Algorithm for assigning ranks to nodes */
  ranker: 'network-simplex' | 'tight-tree' | 'longest-path';
}

/**
 * Default Dagre layout options
 */
const DEFAULT_DAGRE_OPTIONS: Omit<DagreLayoutOptions, keyof LayoutOptions> = {
  rankdir: 'TB',
  nodesep: 50,
  edgesep: 10,
  ranksep: 50,
  marginx: 0,
  marginy: 0,
  ranker: 'network-simplex',
};

/**
 * Dagre Layout Adapter
 *
 * Provides hierarchical layout using the Dagre library.
 * Converts between Grafloria's node/link model and Dagre's graph structure.
 */
export class DagreLayoutAdapter implements LayoutAdapter {
  readonly name = 'dagre';

  /**
   * Apply Dagre layout to nodes and links
   *
   * @param nodes - Nodes to layout
   * @param links - Links connecting the nodes
   * @param options - Dagre layout options
   * @returns Layout result with positions and metadata
   */
  async apply(
    nodes: NodeModel[],
    links: LinkModel[],
    options: Partial<DagreLayoutOptions> = {}
  ): Promise<LayoutResult> {
    const startTime = performance.now();

    // Create dagre graph
    const g = new dagre.graphlib.Graph();

    // Merge default options with provided options
    const dagreOptions: DagreLayoutOptions = {
      ...DEFAULT_DAGRE_OPTIONS,
      ...options,
    } as DagreLayoutOptions;

    // Set graph-level options
    g.setGraph({
      rankdir: dagreOptions.rankdir,
      align: dagreOptions.align,
      nodesep: dagreOptions.nodesep,
      edgesep: dagreOptions.edgesep,
      ranksep: dagreOptions.ranksep,
      marginx: dagreOptions.marginx,
      marginy: dagreOptions.marginy,
      acyclicer: dagreOptions.acyclicer,
      ranker: dagreOptions.ranker,
    });

    g.setDefaultEdgeLabel(() => ({}));

    // Add nodes to dagre graph
    nodes.forEach((node) => {
      g.setNode(node.id, {
        width: node.size.width || 150,
        height: node.size.height || 50,
        // Store original node for reference
        nodeModel: node,
      });
    });

    // Add edges to dagre graph
    links.forEach((link) => {
      if (link.sourceNodeId && link.targetNodeId) {
        g.setEdge(link.sourceNodeId, link.targetNodeId);
      }
    });

    // Run dagre layout algorithm
    dagre.layout(g);

    // Extract positions from dagre graph
    const nodePositions = new Map<string, { x: number; y: number }>();

    g.nodes().forEach((nodeId) => {
      const node = g.node(nodeId);
      if (node) {
        // Dagre returns center position, convert to top-left corner
        nodePositions.set(nodeId, {
          x: node.x - (node.width || 0) / 2,
          y: node.y - (node.height || 0) / 2,
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
    const bounds = this.calculateBounds(nodePositions, nodes);

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
        algorithm: 'dagre',
        direction: dagreOptions.rankdir,
        ranker: dagreOptions.ranker,
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
   * Validate Dagre layout options
   *
   * @param options - Options to validate
   * @returns true if valid, false otherwise
   */
  validateOptions(options: Partial<DagreLayoutOptions>): boolean {
    // Validate rankdir
    if (options.rankdir && !['TB', 'BT', 'LR', 'RL'].includes(options.rankdir)) {
      return false;
    }

    // Validate align
    if (options.align && !['UL', 'UR', 'DL', 'DR'].includes(options.align)) {
      return false;
    }

    // Validate ranker
    if (
      options.ranker &&
      !['network-simplex', 'tight-tree', 'longest-path'].includes(options.ranker)
    ) {
      return false;
    }

    // Validate acyclicer
    if (options.acyclicer !== undefined && options.acyclicer !== 'greedy') {
      return false;
    }

    // Validate numeric options are positive
    if (options.nodesep !== undefined && options.nodesep < 0) {
      return false;
    }
    if (options.edgesep !== undefined && options.edgesep < 0) {
      return false;
    }
    if (options.ranksep !== undefined && options.ranksep < 0) {
      return false;
    }

    return true;
  }

  /**
   * Calculate bounding box for all laid-out nodes
   *
   * @param positions - Map of node positions
   * @param nodes - Array of nodes
   * @returns Bounding box
   */
  private calculateBounds(
    positions: Map<string, { x: number; y: number }>,
    nodes: NodeModel[]
  ): { x: number; y: number; width: number; height: number } {
    if (positions.size === 0) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    positions.forEach((pos, nodeId) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (node) {
        const width = node.size.width || 150;
        const height = node.size.height || 50;

        minX = Math.min(minX, pos.x);
        minY = Math.min(minY, pos.y);
        maxX = Math.max(maxX, pos.x + width);
        maxY = Math.max(maxY, pos.y + height);
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
    layoutOptions?: Partial<DagreLayoutOptions>
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
    const mergedOptions: Partial<DagreLayoutOptions> = {
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
