/**
 * Community Detection Layout Adapter
 *
 * Detects communities/clusters in graph and positions them separately.
 * Reveals modular structure and logical groupings in networks.
 *
 * Best for:
 * - Microservices architecture
 * - Organization charts
 * - Social network analysis
 * - Module detection
 *
 * Algorithm: Louvain community detection + force-directed sub-layouts
 *
 * @module layout/community-layout-adapter
 */

import { NodeModel } from '../models/NodeModel';
import { LinkModel } from '../models/LinkModel';
import { LayoutAdapter, LayoutOptions, LayoutResult } from './layout-adapter.interface';
import { LayoutQualityMetrics } from './layout-quality-metrics';
import { ForceLayoutAdapter } from './force-layout-adapter';

/**
 * Community detection layout options
 */
export interface CommunityLayoutOptions extends LayoutOptions {
  /** Community detection algorithm (default: 'louvain') */
  algorithm?: 'louvain' | 'label-propagation';

  /** Resolution parameter for community detection (default: 1.0) */
  resolution?: number;

  /** Separate communities visually (default: true) */
  separateCommunities?: boolean;

  /** Spacing between communities (default: 200) */
  communitySpacing?: number;

  /** Layout algorithm for communities (default: 'circular') */
  communityLayout?: 'circular' | 'grid' | 'force';

  /** Layout algorithm within communities (default: 'force') */
  innerLayout?: 'force' | 'circular';

  /** Force layout options for inner layout */
  forceOptions?: {
    iterations?: number;
    repulsion?: number;
    attraction?: number;
  };
}

/**
 * Community information
 */
interface Community {
  id: number;
  nodeIds: string[];
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Community Detection Layout Adapter
 *
 * Uses Louvain algorithm to detect communities and arranges them.
 */
export class CommunityLayoutAdapter implements LayoutAdapter {
  readonly name = 'community';
  private forceAdapter = new ForceLayoutAdapter();

  /**
   * Apply community detection layout
   */
  async apply(
    nodes: NodeModel[],
    links: LinkModel[],
    options: Partial<CommunityLayoutOptions> = {}
  ): Promise<LayoutResult> {
    const startTime = performance.now();

    // Merge with defaults
    const opts: CommunityLayoutOptions = {
      algorithm: options.algorithm ?? 'louvain',
      resolution: options.resolution ?? 1.0,
      separateCommunities: options.separateCommunities ?? true,
      communitySpacing: options.communitySpacing ?? 200,
      communityLayout: options.communityLayout ?? 'circular',
      innerLayout: options.innerLayout ?? 'force',
      forceOptions: options.forceOptions ?? {
        iterations: 100,
        repulsion: 50,
        attraction: 0.1,
      },
      ...options,
    };

    if (nodes.length === 0) {
      return {
        nodePositions: new Map(),
        bounds: { x: 0, y: 0, width: 0, height: 0 },
        metadata: {
          algorithm: 'community',
          executionTime: performance.now() - startTime,
          nodeCount: 0,
          linkCount: 0,
        },
      };
    }

    // Build node index map
    const nodeIndexMap = new Map(nodes.map((node, i) => [node.id, i]));

    // Detect communities
    const communityAssignments =
      opts.algorithm === 'louvain'
        ? this.louvainCommunityDetection(nodes, links, opts.resolution!)
        : this.labelPropagation(nodes, links);

    // Group nodes by community
    const communities = this.buildCommunities(nodes, communityAssignments);

    console.log(`Detected ${communities.length} communities`);

    // Layout each community internally
    const communityLayouts = await Promise.all(
      communities.map(community => this.layoutCommunity(community, nodes, links, opts))
    );

    // Position communities relative to each other
    if (opts.separateCommunities) {
      this.positionCommunities(communityLayouts, opts);
    }

    // Build final positions
    const nodePositions = new Map<string, { x: number; y: number }>();

    for (const community of communityLayouts) {
      community.nodeIds.forEach(nodeId => {
        const node = nodes.find(n => n.id === nodeId);
        if (node) {
          nodePositions.set(nodeId, {
            x: node.position.x + community.x,
            y: node.position.y + community.y,
          });
        }
      });
    }

    // Apply positions to nodes
    nodes.forEach(node => {
      const position = nodePositions.get(node.id);
      if (position) {
        node.setPosition(position.x, position.y);
      }
    });

    // Calculate bounds
    const bounds = this.calculateBounds(nodePositions);

    const endTime = performance.now();

    // Calculate quality metrics if requested
    let quality = undefined;
    if (options.calculateQuality) {
      quality = LayoutQualityMetrics.assess(nodes, links, {
        includeSuggestions: true,
        canvasDimensions: options.canvasDimensions,
      });
    }

    return {
      nodePositions,
      bounds,
      metadata: {
        algorithm: 'community',
        communityCount: communities.length,
        detectionAlgorithm: opts.algorithm,
        executionTime: endTime - startTime,
        nodeCount: nodes.length,
        linkCount: links.length,
      },
      quality,
    };
  }

  /**
   * Louvain community detection algorithm
   */
  private louvainCommunityDetection(
    nodes: NodeModel[],
    links: LinkModel[],
    resolution: number
  ): Map<string, number> {
    const n = nodes.length;
    const nodeIndexMap = new Map(nodes.map((node, i) => [node.id, i]));

    // Initialize each node in its own community
    const communities = new Map(nodes.map((node, i) => [node.id, i]));

    // Build adjacency list
    const adjacency = new Map<string, Set<string>>();
    nodes.forEach(node => adjacency.set(node.id, new Set()));

    links.forEach(link => {
      if (link.sourceNodeId && link.targetNodeId) {
        adjacency.get(link.sourceNodeId!)?.add(link.targetNodeId!);
        adjacency.get(link.targetNodeId!)?.add(link.sourceNodeId!);
      }
    });

    // Calculate degrees
    const degrees = new Map(
      nodes.map(node => [node.id, adjacency.get(node.id)!.size])
    );

    const totalEdges = links.length;
    let improved = true;
    let iteration = 0;

    // Phase 1: Move nodes to maximize modularity
    while (improved && iteration < 100) {
      improved = false;

      for (const node of nodes) {
        const nodeId = node.id;
        const currentCommunity = communities.get(nodeId)!;

        // Calculate modularity gains for moving to neighbor communities
        const neighborCommunities = new Set<number>();
        adjacency.get(nodeId)!.forEach(neighborId => {
          neighborCommunities.add(communities.get(neighborId)!);
        });

        let bestCommunity = currentCommunity;
        let bestGain = 0;

        for (const targetCommunity of neighborCommunities) {
          if (targetCommunity === currentCommunity) continue;

          const gain = this.modularityGain(
            nodeId,
            currentCommunity,
            targetCommunity,
            communities,
            adjacency,
            degrees,
            totalEdges,
            resolution
          );

          if (gain > bestGain) {
            bestGain = gain;
            bestCommunity = targetCommunity;
          }
        }

        if (bestCommunity !== currentCommunity) {
          communities.set(nodeId, bestCommunity);
          improved = true;
        }
      }

      iteration++;
    }

    // Renumber communities sequentially
    const communityIds = new Set(communities.values());
    const communityMap = new Map(Array.from(communityIds).map((id, i) => [id, i]));

    const result = new Map<string, number>();
    communities.forEach((community, nodeId) => {
      result.set(nodeId, communityMap.get(community)!);
    });

    return result;
  }

  /**
   * Calculate modularity gain
   */
  private modularityGain(
    nodeId: string,
    fromCommunity: number,
    toCommunity: number,
    communities: Map<string, number>,
    adjacency: Map<string, Set<string>>,
    degrees: Map<string, number>,
    totalEdges: number,
    resolution: number
  ): number {
    let deltaQ = 0;

    const nodeDegree = degrees.get(nodeId)! || 0;

    // Edges to nodes in target community
    let edgesToCommunity = 0;
    adjacency.get(nodeId)!.forEach(neighborId => {
      if (communities.get(neighborId) === toCommunity) {
        edgesToCommunity++;
      }
    });

    // Edges from nodes in target community
    let edgesFromCommunity = 0;
    adjacency.get(nodeId)!.forEach(neighborId => {
      if (communities.get(neighborId) === fromCommunity) {
        edgesFromCommunity++;
      }
    });

    deltaQ =
      (edgesToCommunity - edgesFromCommunity) / totalEdges -
      resolution *
        nodeDegree *
        (this.communityDegree(toCommunity, communities, degrees) -
          this.communityDegree(fromCommunity, communities, degrees)) /
        (2 * totalEdges * totalEdges);

    return deltaQ;
  }

  /**
   * Calculate total degree of nodes in community
   */
  private communityDegree(
    community: number,
    communities: Map<string, number>,
    degrees: Map<string, number>
  ): number {
    let total = 0;
    communities.forEach((comm, nodeId) => {
      if (comm === community) {
        total += degrees.get(nodeId) || 0;
      }
    });
    return total;
  }

  /**
   * Label propagation algorithm (simpler alternative)
   */
  private labelPropagation(nodes: NodeModel[], links: LinkModel[]): Map<string, number> {
    // Initialize labels
    const labels = new Map(nodes.map((node, i) => [node.id, i]));

    // Build adjacency list
    const adjacency = new Map<string, Set<string>>();
    nodes.forEach(node => adjacency.set(node.id, new Set()));

    links.forEach(link => {
      if (link.sourceNodeId && link.targetNodeId) {
        adjacency.get(link.sourceNodeId!)?.add(link.targetNodeId!);
        adjacency.get(link.targetNodeId!)?.add(link.sourceNodeId!);
      }
    });

    // Propagate labels
    let changed = true;
    let iteration = 0;

    while (changed && iteration < 100) {
      changed = false;

      // Randomize order
      const nodeOrder = [...nodes].sort(() => Math.random() - 0.5);

      for (const node of nodeOrder) {
        // Count neighbor labels
        const labelCounts = new Map<number, number>();
        adjacency.get(node.id)!.forEach(neighborId => {
          const label = labels.get(neighborId)!;
          labelCounts.set(label, (labelCounts.get(label) || 0) + 1);
        });

        if (labelCounts.size > 0) {
          // Find most common label
          let maxCount = 0;
          let maxLabel = labels.get(node.id)!;

          labelCounts.forEach((count, label) => {
            if (count > maxCount) {
              maxCount = count;
              maxLabel = label;
            }
          });

          if (maxLabel !== labels.get(node.id)) {
            labels.set(node.id, maxLabel);
            changed = true;
          }
        }
      }

      iteration++;
    }

    // Renumber communities
    const communityIds = new Set(labels.values());
    const communityMap = new Map(Array.from(communityIds).map((id, i) => [id, i]));

    const result = new Map<string, number>();
    labels.forEach((label, nodeId) => {
      result.set(nodeId, communityMap.get(label)!);
    });

    return result;
  }

  /**
   * Build community objects
   */
  private buildCommunities(
    nodes: NodeModel[],
    assignments: Map<string, number>
  ): Community[] {
    const communityMap = new Map<number, string[]>();

    assignments.forEach((community, nodeId) => {
      if (!communityMap.has(community)) {
        communityMap.set(community, []);
      }
      communityMap.get(community)!.push(nodeId);
    });

    const communities: Community[] = [];
    communityMap.forEach((nodeIds, id) => {
      communities.push({
        id,
        nodeIds,
        x: 0,
        y: 0,
        width: 0,
        height: 0,
      });
    });

    return communities;
  }

  /**
   * Layout nodes within a community
   */
  private async layoutCommunity(
    community: Community,
    allNodes: NodeModel[],
    allLinks: LinkModel[],
    options: CommunityLayoutOptions
  ): Promise<Community> {
    // Get nodes and links for this community
    const communityNodes = allNodes.filter(n => community.nodeIds.includes(n.id));
    const communityLinks = allLinks.filter(
      link =>
        link.sourceNodeId &&
        link.targetNodeId &&
        community.nodeIds.includes(link.sourceNodeId) &&
        community.nodeIds.includes(link.targetNodeId)
    );

    if (communityNodes.length === 0) {
      return community;
    }

    // Apply inner layout
    if (options.innerLayout === 'force') {
      await this.forceAdapter.apply(communityNodes, communityLinks, {
        ...options.forceOptions,
        iterations: options.forceOptions?.iterations || 100,
        repulsion: options.forceOptions?.repulsion || 50,
        randomize: false,
      });
    } else {
      // Circular layout
      this.circularLayout(communityNodes);
    }

    // Calculate bounds
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    communityNodes.forEach(node => {
      minX = Math.min(minX, node.position.x);
      minY = Math.min(minY, node.position.y);
      maxX = Math.max(maxX, node.position.x);
      maxY = Math.max(maxY, node.position.y);
    });

    community.width = maxX - minX + 100;
    community.height = maxY - minY + 100;

    // Center nodes at origin
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    communityNodes.forEach(node => {
      node.setPosition(node.position.x - cx, node.position.y - cy);
    });

    return community;
  }

  /**
   * Simple circular layout
   */
  private circularLayout(nodes: NodeModel[]): void {
    const n = nodes.length;
    const radius = Math.max(100, n * 20);

    nodes.forEach((node, i) => {
      const angle = (i / n) * 2 * Math.PI;
      node.setPosition(Math.cos(angle) * radius, Math.sin(angle) * radius);
    });
  }

  /**
   * Position communities relative to each other
   */
  private positionCommunities(
    communities: Community[],
    options: CommunityLayoutOptions
  ): void {
    if (communities.length === 0) return;

    const spacing = options.communitySpacing!;

    if (options.communityLayout === 'circular') {
      // Arrange communities in a circle
      const radius = Math.max(300, communities.length * 150);

      communities.forEach((community, i) => {
        const angle = (i / communities.length) * 2 * Math.PI;
        community.x = Math.cos(angle) * radius;
        community.y = Math.sin(angle) * radius;
      });
    } else if (options.communityLayout === 'grid') {
      // Arrange in grid
      const cols = Math.ceil(Math.sqrt(communities.length));
      let x = 0, y = 0;
      let maxHeight = 0;

      communities.forEach((community, i) => {
        community.x = x;
        community.y = y;

        maxHeight = Math.max(maxHeight, community.height);

        x += community.width + spacing;

        if ((i + 1) % cols === 0) {
          x = 0;
          y += maxHeight + spacing;
          maxHeight = 0;
        }
      });
    } else {
      // Force-directed layout of communities
      // Simplified: just space them out
      let x = 0;
      communities.forEach(community => {
        community.x = x;
        community.y = 0;
        x += community.width + spacing;
      });
    }
  }

  /**
   * Calculate bounding box
   */
  private calculateBounds(
    positions: Map<string, { x: number; y: number }>
  ): {
    x: number;
    y: number;
    width: number;
    height: number;
  } {
    if (positions.size === 0) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    positions.forEach(pos => {
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x);
      maxY = Math.max(maxY, pos.y);
    });

    const padding = 50;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  /**
   * Apply incremental layout (Phase 1 compatibility)
   */
  async applyIncremental(
    nodes: NodeModel[],
    links: LinkModel[],
    incrementalOptions: any,
    layoutOptions?: Partial<CommunityLayoutOptions>
  ): Promise<LayoutResult & { incremental: any }> {
    // Community detection layout doesn't support true incremental layout
    // Just apply full layout
    const result = await this.apply(nodes, links, layoutOptions);

    return {
      ...result,
      incremental: {
        newNodeIds: incrementalOptions.newNodeIds || [],
        pinnedNodeIds: [],
        movedNodeIds: nodes.map(n => n.id),
        strategy: 'full-relayout',
        constraintsApplied: 0,
      },
    };
  }

  /**
   * Validate options
   */
  validateOptions(options: Partial<CommunityLayoutOptions>): boolean {
    if (options.resolution !== undefined && options.resolution <= 0) {
      return false;
    }
    if (options.communitySpacing !== undefined && options.communitySpacing < 0) {
      return false;
    }
    return true;
  }
}
