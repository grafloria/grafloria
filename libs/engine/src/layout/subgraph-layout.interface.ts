/**
 * Subgraph Layout System
 *
 * Enables independent layout of groups, containers, and nested structures.
 * Critical for ERD diagrams, architecture diagrams, and any hierarchical visualization.
 *
 * Key features:
 * - Group-scoped layout (layout only specific groups)
 * - Recursive layout (layout nested groups)
 * - Group padding and boundaries
 * - Compound graph support
 * - Parent-child relationship preservation
 *
 * @module layout/subgraph-layout
 */

/**
 * Group/container information for layout
 */
export interface GroupInfo {
  /** Unique group identifier */
  id: string;

  /** Parent group ID (if nested) */
  parentId?: string;

  /** Node IDs that belong to this group */
  memberNodeIds: string[];

  /** Child group IDs (if this group contains other groups) */
  childGroupIds?: string[];

  /** Padding inside the group container */
  padding?: {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
  };

  /** Minimum size for the group */
  minSize?: {
    width: number;
    height: number;
  };

  /** Maximum size for the group */
  maxSize?: {
    width: number;
    height: number;
  };

  /** Fixed position (group doesn't move during layout) */
  fixed?: boolean;

  /** Fixed size (group size doesn't change to fit content) */
  fixedSize?: boolean;

  /** Layout algorithm to use for this group's contents */
  layoutAlgorithm?: 'dagre' | 'elk' | 'inherit';

  /** Layout options specific to this group */
  layoutOptions?: any;

  /** Whether this group should collapse its members visually */
  collapsed?: boolean;
}

/**
 * Configuration for subgraph layout
 */
export interface SubgraphLayoutOptions {
  /** Enable subgraph/group layout */
  enabled: boolean;

  /** Group information for all groups in the diagram */
  groups?: GroupInfo[];

  /** Specific group IDs to layout (if undefined, layout all) */
  targetGroups?: string[];

  /** Whether to recursively layout nested groups */
  recursive?: boolean;

  /** Default padding for groups without explicit padding */
  defaultPadding?: number;

  /** How to handle group boundaries */
  boundaryHandling?: 'strict' | 'flexible' | 'none';

  /** Whether to layout the top-level (non-grouped) nodes */
  layoutTopLevel?: boolean;

  /** Strategy for positioning groups relative to each other */
  groupPositioning?: 'compact' | 'spacious' | 'grid' | 'manual';

  /** Spacing between groups */
  groupSpacing?: number;

  /** Whether to automatically resize groups to fit content */
  autoResize?: boolean;

  /** Whether to maintain aspect ratio when resizing groups */
  maintainAspectRatio?: boolean;

  /** How to handle links between groups */
  interGroupLinks?: 'route-around' | 'direct' | 'hidden';
}

/**
 * Result of subgraph layout computation
 */
export interface SubgraphLayoutResult {
  /** Node positions within their groups (node ID -> position) */
  nodePositions: Map<string, { x: number; y: number; groupId?: string }>;

  /** Group positions (group ID -> position) */
  groupPositions: Map<string, { x: number; y: number }>;

  /** Computed group sizes (group ID -> size) */
  groupSizes: Map<string, { width: number; height: number }>;

  /** Groups that were laid out */
  laidOutGroups: string[];

  /** Groups that were skipped (fixed, collapsed, etc.) */
  skippedGroups: string[];

  /** Overall bounds */
  bounds: { x: number; y: number; width: number; height: number };

  /** Whether groups were recursively laid out */
  wasRecursive: boolean;
}

/**
 * Internal group tree node for hierarchical processing
 */
interface GroupTreeNode {
  info: GroupInfo;
  children: GroupTreeNode[];
  depth: number;
}

/**
 * Subgraph layout computation utilities
 */
export class SubgraphLayoutManager {
  private static readonly DEFAULT_PADDING = 20;
  private static readonly DEFAULT_GROUP_SPACING = 40;

  /**
   * Build hierarchical tree of groups
   */
  static buildGroupTree(groups: GroupInfo[]): GroupTreeNode[] {
    const groupMap = new Map<string, GroupTreeNode>();
    const roots: GroupTreeNode[] = [];

    // Create nodes
    for (const group of groups) {
      groupMap.set(group.id, {
        info: group,
        children: [],
        depth: 0,
      });
    }

    // Build parent-child relationships
    for (const group of groups) {
      const node = groupMap.get(group.id)!;

      if (group.parentId) {
        const parent = groupMap.get(group.parentId);
        if (parent) {
          parent.children.push(node);
          node.depth = parent.depth + 1;
        } else {
          roots.push(node); // Parent not found, treat as root
        }
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  /**
   * Get all groups at a specific depth level
   */
  static getGroupsAtDepth(roots: GroupTreeNode[], depth: number): GroupInfo[] {
    const result: GroupInfo[] = [];

    const traverse = (node: GroupTreeNode) => {
      if (node.depth === depth) {
        result.push(node.info);
      }
      for (const child of node.children) {
        traverse(child);
      }
    };

    for (const root of roots) {
      traverse(root);
    }

    return result;
  }

  /**
   * Get maximum depth of group tree
   */
  static getMaxDepth(roots: GroupTreeNode[]): number {
    let maxDepth = 0;

    const traverse = (node: GroupTreeNode) => {
      maxDepth = Math.max(maxDepth, node.depth);
      for (const child of node.children) {
        traverse(child);
      }
    };

    for (const root of roots) {
      traverse(root);
    }

    return maxDepth;
  }

  /**
   * Filter nodes by group membership
   */
  static getNodesInGroup(
    groupId: string,
    group: GroupInfo,
    allNodes: Array<{ id: string; [key: string]: any }>,
    options: SubgraphLayoutOptions
  ): Array<{ id: string; [key: string]: any }> {
    return allNodes.filter((node) => group.memberNodeIds.includes(node.id));
  }

  /**
   * Filter links within a group
   */
  static getLinksInGroup(
    group: GroupInfo,
    allLinks: Array<{ sourceNodeId: string; targetNodeId: string; [key: string]: any }>,
    options: SubgraphLayoutOptions
  ): Array<{ sourceNodeId: string; targetNodeId: string; [key: string]: any }> {
    const memberIds = new Set(group.memberNodeIds);

    return allLinks.filter((link) => {
      const sourceInGroup = memberIds.has(link.sourceNodeId);
      const targetInGroup = memberIds.has(link.targetNodeId);

      // Only include links where both ends are in the group
      return sourceInGroup && targetInGroup;
    });
  }

  /**
   * Calculate group size based on its content
   */
  static calculateGroupSize(
    group: GroupInfo,
    nodePositions: Map<string, { x: number; y: number }>,
    nodeSizes: Map<string, { width: number; height: number }>,
    options: SubgraphLayoutOptions
  ): { width: number; height: number } {
    // If fixed size, return it
    if (group.fixedSize && group.minSize) {
      return { ...group.minSize };
    }

    // Calculate bounds of all member nodes
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const nodeId of group.memberNodeIds) {
      const pos = nodePositions.get(nodeId);
      const size = nodeSizes.get(nodeId) || { width: 100, height: 50 };

      if (pos) {
        minX = Math.min(minX, pos.x - size.width / 2);
        minY = Math.min(minY, pos.y - size.height / 2);
        maxX = Math.max(maxX, pos.x + size.width / 2);
        maxY = Math.max(maxY, pos.y + size.height / 2);
      }
    }

    // Add padding
    const padding = this.getGroupPadding(group, options);
    const width = maxX - minX + padding.left + padding.right;
    const height = maxY - minY + padding.top + padding.bottom;

    // Apply min/max constraints
    let finalWidth = width;
    let finalHeight = height;

    if (group.minSize) {
      finalWidth = Math.max(finalWidth, group.minSize.width);
      finalHeight = Math.max(finalHeight, group.minSize.height);
    }

    if (group.maxSize) {
      finalWidth = Math.min(finalWidth, group.maxSize.width);
      finalHeight = Math.min(finalHeight, group.maxSize.height);
    }

    // Maintain aspect ratio if required
    if (options.maintainAspectRatio && group.minSize) {
      const aspectRatio = group.minSize.width / group.minSize.height;
      if (finalWidth / finalHeight > aspectRatio) {
        finalHeight = finalWidth / aspectRatio;
      } else {
        finalWidth = finalHeight * aspectRatio;
      }
    }

    return { width: finalWidth, height: finalHeight };
  }

  /**
   * Get effective padding for a group
   */
  static getGroupPadding(
    group: GroupInfo,
    options: SubgraphLayoutOptions
  ): { top: number; right: number; bottom: number; left: number } {
    const defaultPadding = options.defaultPadding || this.DEFAULT_PADDING;

    return {
      top: group.padding?.top ?? defaultPadding,
      right: group.padding?.right ?? defaultPadding,
      bottom: group.padding?.bottom ?? defaultPadding,
      left: group.padding?.left ?? defaultPadding,
    };
  }

  /**
   * Position groups relative to each other
   */
  static positionGroups(
    groups: GroupInfo[],
    groupSizes: Map<string, { width: number; height: number }>,
    options: SubgraphLayoutOptions
  ): Map<string, { x: number; y: number }> {
    const positions = new Map<string, { x: number; y: number }>();

    // Filter out fixed groups
    const movableGroups = groups.filter((g) => !g.fixed);
    const fixedGroups = groups.filter((g) => g.fixed);

    // Position fixed groups first (they may have predetermined positions)
    // For now, we'll assume they're already positioned

    // Position movable groups
    if (options.groupPositioning === 'grid') {
      this.positionGroupsInGrid(movableGroups, groupSizes, options, positions);
    } else if (options.groupPositioning === 'compact') {
      this.positionGroupsCompact(movableGroups, groupSizes, options, positions);
    } else if (options.groupPositioning === 'spacious') {
      this.positionGroupsSpacious(movableGroups, groupSizes, options, positions);
    } else {
      // Manual - groups should already have positions
      // Just ensure they're in the map
      for (const group of movableGroups) {
        if (!positions.has(group.id)) {
          positions.set(group.id, { x: 0, y: 0 });
        }
      }
    }

    return positions;
  }

  /**
   * Position groups in a grid layout
   */
  private static positionGroupsInGrid(
    groups: GroupInfo[],
    groupSizes: Map<string, { width: number; height: number }>,
    options: SubgraphLayoutOptions,
    positions: Map<string, { x: number; y: number }>
  ): void {
    const spacing = options.groupSpacing || this.DEFAULT_GROUP_SPACING;
    const cols = Math.ceil(Math.sqrt(groups.length));

    let x = 0;
    let y = 0;
    let maxHeightInRow = 0;

    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      const size = groupSizes.get(group.id) || { width: 200, height: 200 };

      positions.set(group.id, { x, y });

      maxHeightInRow = Math.max(maxHeightInRow, size.height);

      x += size.width + spacing;

      if ((i + 1) % cols === 0) {
        x = 0;
        y += maxHeightInRow + spacing;
        maxHeightInRow = 0;
      }
    }
  }

  /**
   * Position groups in a compact layout (minimize total area)
   */
  private static positionGroupsCompact(
    groups: GroupInfo[],
    groupSizes: Map<string, { width: number; height: number }>,
    options: SubgraphLayoutOptions,
    positions: Map<string, { x: number; y: number }>
  ): void {
    // Sort by area (largest first) for better packing
    const sorted = [...groups].sort((a, b) => {
      const sizeA = groupSizes.get(a.id) || { width: 200, height: 200 };
      const sizeB = groupSizes.get(b.id) || { width: 200, height: 200 };
      return sizeB.width * sizeB.height - sizeA.width * sizeA.height;
    });

    const spacing = options.groupSpacing || this.DEFAULT_GROUP_SPACING;
    let x = 0;
    let y = 0;
    let rowHeight = 0;
    let currentRowWidth = 0;
    const maxRowWidth = 1200; // Maximum width before wrapping

    for (const group of sorted) {
      const size = groupSizes.get(group.id) || { width: 200, height: 200 };

      // Check if we need to wrap to next row
      if (currentRowWidth + size.width > maxRowWidth && currentRowWidth > 0) {
        x = 0;
        y += rowHeight + spacing;
        rowHeight = 0;
        currentRowWidth = 0;
      }

      positions.set(group.id, { x, y });

      x += size.width + spacing;
      currentRowWidth += size.width + spacing;
      rowHeight = Math.max(rowHeight, size.height);
    }
  }

  /**
   * Position groups in a spacious layout (maximize whitespace)
   */
  private static positionGroupsSpacious(
    groups: GroupInfo[],
    groupSizes: Map<string, { width: number; height: number }>,
    options: SubgraphLayoutOptions,
    positions: Map<string, { x: number; y: number }>
  ): void {
    const spacing = (options.groupSpacing || this.DEFAULT_GROUP_SPACING) * 2; // Double spacing

    let x = 0;
    let y = 0;

    for (const group of groups) {
      const size = groupSizes.get(group.id) || { width: 200, height: 200 };

      positions.set(group.id, { x, y });

      x += size.width + spacing;
    }
  }

  /**
   * Translate node positions to group-local coordinates
   */
  static translateToGroupCoordinates(
    nodePositions: Map<string, { x: number; y: number }>,
    group: GroupInfo,
    groupPosition: { x: number; y: number },
    options: SubgraphLayoutOptions
  ): Map<string, { x: number; y: number }> {
    const padding = this.getGroupPadding(group, options);
    const translated = new Map<string, { x: number; y: number }>();

    // Calculate the center of the group content
    let minX = Infinity;
    let minY = Infinity;

    for (const nodeId of group.memberNodeIds) {
      const pos = nodePositions.get(nodeId);
      if (pos) {
        minX = Math.min(minX, pos.x);
        minY = Math.min(minY, pos.y);
      }
    }

    // Translate nodes to be relative to group position with padding
    for (const nodeId of group.memberNodeIds) {
      const pos = nodePositions.get(nodeId);
      if (pos) {
        translated.set(nodeId, {
          x: groupPosition.x + padding.left + (pos.x - minX),
          y: groupPosition.y + padding.top + (pos.y - minY),
        });
      }
    }

    return translated;
  }

  /**
   * Apply layout to a single group
   */
  static async layoutGroup(
    group: GroupInfo,
    allNodes: Array<{ id: string; [key: string]: any }>,
    allLinks: Array<{ sourceNodeId: string; targetNodeId: string; [key: string]: any }>,
    nodeSizes: Map<string, { width: number; height: number }>,
    layoutAdapter: any, // LayoutAdapter
    options: SubgraphLayoutOptions
  ): Promise<{
    nodePositions: Map<string, { x: number; y: number }>;
    bounds: { x: number; y: number; width: number; height: number };
  }> {
    // Get nodes and links in this group
    const groupNodes = this.getNodesInGroup(group.id, group, allNodes, options);
    const groupLinks = this.getLinksInGroup(group, allLinks, options);

    if (groupNodes.length === 0) {
      return {
        nodePositions: new Map(),
        bounds: { x: 0, y: 0, width: 0, height: 0 },
      };
    }

    // Use group's layout algorithm if specified, otherwise use the provided adapter
    const layoutOptions = group.layoutOptions || {};

    // Apply layout to group contents
    const result = await layoutAdapter.apply(groupNodes, groupLinks, layoutOptions);

    return {
      nodePositions: result.nodePositions,
      bounds: result.bounds,
    };
  }

  /**
   * Main subgraph layout computation
   */
  static async computeSubgraphLayout(
    groups: GroupInfo[],
    allNodes: Array<{ id: string; [key: string]: any }>,
    allLinks: Array<{ sourceNodeId: string; targetNodeId: string; [key: string]: any }>,
    nodeSizes: Map<string, { width: number; height: number }>,
    layoutAdapter: any,
    options: SubgraphLayoutOptions
  ): Promise<SubgraphLayoutResult> {
    const finalNodePositions = new Map<string, { x: number; y: number; groupId?: string }>();
    const groupPositions = new Map<string, { x: number; y: number }>();
    const groupSizes = new Map<string, { width: number; height: number }>();
    const laidOutGroups: string[] = [];
    const skippedGroups: string[] = [];

    // Filter target groups if specified
    const targetGroups = options.targetGroups
      ? groups.filter((g) => options.targetGroups!.includes(g.id))
      : groups;

    // Build group tree for recursive processing
    const groupTree = this.buildGroupTree(targetGroups);

    if (options.recursive) {
      // Layout from deepest to shallowest
      const maxDepth = this.getMaxDepth(groupTree);

      for (let depth = maxDepth; depth >= 0; depth--) {
        const groupsAtDepth = this.getGroupsAtDepth(groupTree, depth);

        for (const group of groupsAtDepth) {
          if (group.collapsed || group.fixed) {
            skippedGroups.push(group.id);
            continue;
          }

          // Layout this group
          const layoutResult = await this.layoutGroup(
            group,
            allNodes,
            allLinks,
            nodeSizes,
            layoutAdapter,
            options
          );

          // Store node positions (relative to group)
          for (const [nodeId, pos] of layoutResult.nodePositions) {
            finalNodePositions.set(nodeId, { ...pos, groupId: group.id });
          }

          // Calculate and store group size
          const size = this.calculateGroupSize(group, layoutResult.nodePositions, nodeSizes, options);
          groupSizes.set(group.id, size);

          laidOutGroups.push(group.id);
        }
      }
    } else {
      // Non-recursive: just layout each group independently
      for (const group of targetGroups) {
        if (group.collapsed || group.fixed) {
          skippedGroups.push(group.id);
          continue;
        }

        const layoutResult = await this.layoutGroup(
          group,
          allNodes,
          allLinks,
          nodeSizes,
          layoutAdapter,
          options
        );

        for (const [nodeId, pos] of layoutResult.nodePositions) {
          finalNodePositions.set(nodeId, { ...pos, groupId: group.id });
        }

        const size = this.calculateGroupSize(group, layoutResult.nodePositions, nodeSizes, options);
        groupSizes.set(group.id, size);

        laidOutGroups.push(group.id);
      }
    }

    // Position groups relative to each other
    const relativeGroupPositions = this.positionGroups(targetGroups, groupSizes, options);

    // Translate node positions to absolute coordinates
    for (const group of targetGroups) {
      const groupPos = relativeGroupPositions.get(group.id) || { x: 0, y: 0 };
      groupPositions.set(group.id, groupPos);

      // Translate member nodes
      const memberPositions = new Map<string, { x: number; y: number }>();
      for (const nodeId of group.memberNodeIds) {
        const relPos = finalNodePositions.get(nodeId);
        if (relPos) {
          memberPositions.set(nodeId, { x: relPos.x, y: relPos.y });
        }
      }

      const translated = this.translateToGroupCoordinates(memberPositions, group, groupPos, options);

      for (const [nodeId, pos] of translated) {
        finalNodePositions.set(nodeId, { ...pos, groupId: group.id });
      }
    }

    // Calculate overall bounds
    const bounds = this.calculateOverallBounds(finalNodePositions, groupPositions, groupSizes);

    return {
      nodePositions: finalNodePositions,
      groupPositions,
      groupSizes,
      laidOutGroups,
      skippedGroups,
      bounds,
      wasRecursive: options.recursive || false,
    };
  }

  /**
   * Calculate overall bounding box
   */
  private static calculateOverallBounds(
    nodePositions: Map<string, { x: number; y: number; groupId?: string }>,
    groupPositions: Map<string, { x: number; y: number }>,
    groupSizes: Map<string, { width: number; height: number }>
  ): { x: number; y: number; width: number; height: number } {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    // Consider group bounds
    for (const [groupId, pos] of groupPositions) {
      const size = groupSizes.get(groupId) || { width: 200, height: 200 };
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x + size.width);
      maxY = Math.max(maxY, pos.y + size.height);
    }

    // Consider node positions
    for (const [nodeId, pos] of nodePositions) {
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x);
      maxY = Math.max(maxY, pos.y);
    }

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }
}
