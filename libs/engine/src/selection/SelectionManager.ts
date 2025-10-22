// SelectionManager - Advanced selection operations (Phase 1.8a)

import type { DiagramModel } from '../models/DiagramModel';
import type { NodeModel } from '../models/NodeModel';
import type { LinkModel } from '../models/LinkModel';
import type { GroupModel } from '../models/GroupModel';
import type { DiagramStore } from '../state/DiagramStore';
import type { EventBus } from '../events/EventBus';
import type { BoundingBox, Point } from '../types';

/**
 * Selection options for controlling selection behavior
 */
export interface SelectionOptions {
  /** Mode for combining with existing selection */
  mode?: 'replace' | 'add' | 'subtract' | 'toggle';
  /** Whether to emit selection events */
  silent?: boolean;
  /** Maximum depth for recursive operations (-1 = unlimited) */
  maxDepth?: number;
}

/**
 * Options for connected node selection
 */
export interface ConnectedSelectionOptions extends SelectionOptions {
  /** Direction to follow links */
  direction?: 'incoming' | 'outgoing' | 'both';
  /** Whether to include the starting node */
  includeSelf?: boolean;
}

/**
 * Options for type-based selection
 */
export interface TypeSelectionOptions extends SelectionOptions {
  /** Whether to match exact type or allow subtypes */
  exact?: boolean;
}

/**
 * Options for filter-based selection
 */
export interface FilterSelectionOptions extends SelectionOptions {
  /** Entity types to filter */
  entityTypes?: ('node' | 'link' | 'group')[];
}

/**
 * Options for rectangle selection
 */
export interface RectSelectionOptions extends SelectionOptions {
  /** Intersection mode: 'intersect' or 'contain' */
  intersectionMode?: 'intersect' | 'contain';
}

/**
 * Options for bulk selection
 */
export interface BulkSelectionOptions extends SelectionOptions {
  /** Entity types to include */
  entityTypes?: ('node' | 'link' | 'group')[];
}

/**
 * SelectionManager provides advanced selection operations
 *
 * Implements 12 selection patterns from industry research:
 * - Hierarchical: children, descendants, ancestors, siblings, tree
 * - Graph: connected, connected component, path
 * - Group: group members, groups containing
 * - Filter: by type, by filter, in rectangle
 * - Bulk: select all, invert selection
 */
export class SelectionManager {
  private diagram: DiagramModel | null;

  constructor(
    diagram: DiagramModel | null,
    private store?: DiagramStore,
    private eventBus?: EventBus
  ) {
    this.diagram = diagram;
  }

  /**
   * Update diagram reference
   */
  setDiagram(diagram: DiagramModel | null): void {
    this.diagram = diagram;
  }

  // ============================================================================
  // Hierarchical Selection
  // ============================================================================

  /**
   * Select immediate children of a node
   */
  selectChildren(nodeId: string, options: SelectionOptions = {}): string[] {
    if (!this.diagram) return [];
    const node = this.diagram.getNode(nodeId);
    if (!node) return [];

    const childIds = Array.from(node.children);
    this.applySelection(childIds, [], options);
    return childIds;
  }

  /**
   * Select all descendants of a node (recursive)
   */
  selectDescendants(nodeId: string, options: SelectionOptions = {}): string[] {
    if (!this.diagram) return [];
    const node = this.diagram.getNode(nodeId);
    if (!node) return [];

    const descendants: string[] = [];
    const maxDepth = options.maxDepth ?? -1;

    this.collectDescendants(nodeId, descendants, 0, maxDepth);
    this.applySelection(descendants, [], options);
    return descendants;
  }

  /**
   * Select all ancestors of a node (recursive)
   */
  selectAncestors(nodeId: string, options: SelectionOptions = {}): string[] {
    if (!this.diagram) return [];
    const node = this.diagram.getNode(nodeId);
    if (!node) return [];

    const ancestors: string[] = [];
    const maxDepth = options.maxDepth ?? -1;

    this.collectAncestors(nodeId, ancestors, 0, maxDepth);
    this.applySelection(ancestors, [], options);
    return ancestors;
  }

  /**
   * Select all siblings of a node (nodes with same parent)
   */
  selectSiblings(nodeId: string, options: SelectionOptions = {}): string[] {
    if (!this.diagram) return [];
    const node = this.diagram.getNode(nodeId);
    if (!node || !node.parentId) return [];

    const parent = this.diagram.getNode(node.parentId);
    if (!parent) return [];

    // Get all children of parent except the node itself
    const siblings = Array.from(parent.children).filter(id => id !== nodeId);
    this.applySelection(siblings, [], options);
    return siblings;
  }

  /**
   * Select entire tree starting from a node (node + all descendants)
   */
  selectTree(nodeId: string, options: SelectionOptions = {}): string[] {
    if (!this.diagram) return [];
    const node = this.diagram.getNode(nodeId);
    if (!node) return [];

    const tree: string[] = [nodeId];
    const maxDepth = options.maxDepth ?? -1;

    this.collectDescendants(nodeId, tree, 0, maxDepth);
    this.applySelection(tree, [], options);
    return tree;
  }

  // ============================================================================
  // Graph/Connectivity Selection
  // ============================================================================

  /**
   * Select nodes directly connected to a node via links
   */
  selectConnected(nodeId: string, options: ConnectedSelectionOptions = {}): string[] {
    if (!this.diagram) return [];
    const node = this.diagram.getNode(nodeId);
    if (!node) return [];

    const direction = options.direction ?? 'both';
    const includeSelf = options.includeSelf ?? false;
    const connected = new Set<string>();

    if (includeSelf) {
      connected.add(nodeId);
    }

    const links = this.diagram.getLinks();
    for (const link of links) {
      const sourceNodeId = link.sourcePortId.split(':')[0];
      const targetNodeId = link.targetPortId.split(':')[0];

      // Outgoing links
      if ((direction === 'outgoing' || direction === 'both') && sourceNodeId === nodeId) {
        connected.add(targetNodeId);
      }

      // Incoming links
      if ((direction === 'incoming' || direction === 'both') && targetNodeId === nodeId) {
        connected.add(sourceNodeId);
      }
    }

    const connectedIds = Array.from(connected);
    this.applySelection(connectedIds, [], options);
    return connectedIds;
  }

  /**
   * Select entire connected component (all nodes reachable from a node)
   */
  selectConnectedComponent(nodeId: string, options: SelectionOptions = {}): string[] {
    if (!this.diagram) return [];
    const node = this.diagram.getNode(nodeId);
    if (!node) return [];

    const component = new Set<string>();
    const visited = new Set<string>();
    const queue: string[] = [nodeId];

    // BFS to find all connected nodes
    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (visited.has(currentId)) continue;

      visited.add(currentId);
      component.add(currentId);

      // Find all nodes connected to current node
      const links = this.diagram.getLinks();
      for (const link of links) {
        const sourceNodeId = link.sourcePortId.split(':')[0];
        const targetNodeId = link.targetPortId.split(':')[0];

        if (sourceNodeId === currentId && !visited.has(targetNodeId)) {
          queue.push(targetNodeId);
        }
        if (targetNodeId === currentId && !visited.has(sourceNodeId)) {
          queue.push(sourceNodeId);
        }
      }
    }

    const componentIds = Array.from(component);
    this.applySelection(componentIds, [], options);
    return componentIds;
  }

  /**
   * Select shortest path between two nodes
   */
  selectPath(fromNodeId: string, toNodeId: string, options: SelectionOptions = {}): string[] {
    if (!this.diagram) return [];
    const fromNode = this.diagram.getNode(fromNodeId);
    const toNode = this.diagram.getNode(toNodeId);
    if (!fromNode || !toNode) return [];

    // BFS to find shortest path
    const queue: { nodeId: string; path: string[] }[] = [{ nodeId: fromNodeId, path: [fromNodeId] }];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const { nodeId, path } = queue.shift()!;

      if (nodeId === toNodeId) {
        this.applySelection(path, [], options);
        return path;
      }

      if (visited.has(nodeId)) continue;
      visited.add(nodeId);

      // Find neighbors
      const links = this.diagram.getLinks();
      for (const link of links) {
        const sourceNodeId = link.sourcePortId.split(':')[0];
        const targetNodeId = link.targetPortId.split(':')[0];

        let nextNodeId: string | null = null;
        if (sourceNodeId === nodeId) nextNodeId = targetNodeId;
        else if (targetNodeId === nodeId) nextNodeId = sourceNodeId;

        if (nextNodeId && !visited.has(nextNodeId)) {
          queue.push({ nodeId: nextNodeId, path: [...path, nextNodeId] });
        }
      }
    }

    // No path found
    return [];
  }

  // ============================================================================
  // Group Selection
  // ============================================================================

  /**
   * Select all members of a group
   */
  selectGroupMembers(groupId: string, options: SelectionOptions = {}): string[] {
    if (!this.diagram) return [];
    const group = this.diagram.getGroup(groupId);
    if (!group) return [];

    const memberIds = Array.from(group.members);
    this.applySelection(memberIds, [], options);
    return memberIds;
  }

  /**
   * Select all groups that contain a specific node
   */
  selectGroupsContaining(nodeId: string, options: SelectionOptions = {}): string[] {
    if (!this.diagram) return [];
    const node = this.diagram.getNode(nodeId);
    if (!node) return [];

    const groupIds: string[] = [];
    const groups = this.diagram.getGroups();

    for (const group of groups) {
      if (group.members.has(nodeId)) {
        groupIds.push(group.id);
      }
    }

    this.applySelection([], groupIds, options);
    return groupIds;
  }

  // ============================================================================
  // Filter Selection
  // ============================================================================

  /**
   * Select all nodes of a specific type
   */
  selectByType(type: string, options: TypeSelectionOptions = {}): string[] {
    if (!this.diagram) return [];
    const exact = options.exact ?? true;
    const nodeIds: string[] = [];

    const nodes = this.diagram.getNodes();
    for (const node of nodes) {
      if (exact ? node.type === type : node.type.includes(type)) {
        nodeIds.push(node.id);
      }
    }

    this.applySelection(nodeIds, [], options);
    return nodeIds;
  }

  /**
   * Select nodes matching a predicate function
   */
  selectByFilter(
    predicate: (node: NodeModel) => boolean,
    options: FilterSelectionOptions = {}
  ): string[] {
    if (!this.diagram) return [];
    const nodeIds: string[] = [];

    const nodes = this.diagram.getNodes();
    for (const node of nodes) {
      if (predicate(node)) {
        nodeIds.push(node.id);
      }
    }

    this.applySelection(nodeIds, [], options);
    return nodeIds;
  }

  /**
   * Select all nodes within or intersecting a rectangle
   */
  selectInRectangle(rect: BoundingBox, options: RectSelectionOptions = {}): string[] {
    if (!this.diagram) return [];
    const mode = options.intersectionMode ?? 'intersect';
    const nodeIds: string[] = [];

    const nodes = this.diagram.getNodes();
    for (const node of nodes) {
      const nodeBounds = node.getBoundingBox();

      const intersects = this.rectanglesIntersect(rect, nodeBounds);
      const contains = mode === 'contain' ? this.rectangleContains(rect, nodeBounds) : intersects;

      if (mode === 'intersect' ? intersects : contains) {
        nodeIds.push(node.id);
      }
    }

    this.applySelection(nodeIds, [], options);
    return nodeIds;
  }

  // ============================================================================
  // Bulk Selection
  // ============================================================================

  /**
   * Select all entities in the diagram
   */
  selectAll(options: BulkSelectionOptions = {}): { nodes: string[]; links: string[]; groups: string[] } {
    if (!this.diagram) return { nodes: [], links: [], groups: [] };
    const entityTypes = options.entityTypes ?? ['node'];

    const nodeIds: string[] = [];
    const linkIds: string[] = [];
    const groupIds: string[] = [];

    if (entityTypes.includes('node')) {
      const nodes = this.diagram.getNodes();
      nodeIds.push(...nodes.map(n => n.id));
    }

    if (entityTypes.includes('link')) {
      const links = this.diagram.getLinks();
      linkIds.push(...links.map(l => l.id));
    }

    if (entityTypes.includes('group')) {
      const groups = this.diagram.getGroups();
      groupIds.push(...groups.map(g => g.id));
    }

    this.applySelection(nodeIds, groupIds, options);
    return { nodes: nodeIds, links: linkIds, groups: groupIds };
  }

  /**
   * Invert current selection
   */
  invertSelection(options: BulkSelectionOptions = {}): { nodes: string[]; links: string[]; groups: string[] } {
    if (!this.diagram) return { nodes: [], links: [], groups: [] };

    const entityTypes = options.entityTypes ?? ['node'];

    // Get current selection from store
    const currentNodeIds = (this.store?.get('selectedNodes') as Set<string>) ?? new Set<string>();
    const currentLinkIds = (this.store?.get('selectedLinks') as Set<string>) ?? new Set<string>();
    const currentGroupIds = new Set<string>(); // Groups selection not yet in store

    const nodeIds: string[] = [];
    const linkIds: string[] = [];
    const groupIds: string[] = [];

    if (entityTypes.includes('node')) {
      const nodes = this.diagram.getNodes();
      for (const node of nodes) {
        if (!currentNodeIds.has(node.id)) {
          nodeIds.push(node.id);
        }
      }
    }

    if (entityTypes.includes('link')) {
      const links = this.diagram.getLinks();
      for (const link of links) {
        if (!currentLinkIds.has(link.id)) {
          linkIds.push(link.id);
        }
      }
    }

    if (entityTypes.includes('group')) {
      const groups = this.diagram.getGroups();
      for (const group of groups) {
        if (!currentGroupIds.has(group.id)) {
          groupIds.push(group.id);
        }
      }
    }

    this.applySelection(nodeIds, groupIds, { ...options, mode: 'replace' });
    return { nodes: nodeIds, links: linkIds, groups: groupIds };
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Recursively collect all descendants of a node
   */
  private collectDescendants(
    nodeId: string,
    collected: string[],
    currentDepth: number,
    maxDepth: number
  ): void {
    if (maxDepth !== -1 && currentDepth >= maxDepth) return;
    if (!this.diagram) return;

    const node = this.diagram.getNode(nodeId);
    if (!node) return;

    for (const childId of node.children) {
      collected.push(childId);
      this.collectDescendants(childId, collected, currentDepth + 1, maxDepth);
    }
  }

  /**
   * Recursively collect all ancestors of a node
   */
  private collectAncestors(
    nodeId: string,
    collected: string[],
    currentDepth: number,
    maxDepth: number
  ): void {
    if (maxDepth !== -1 && currentDepth >= maxDepth) return;
    if (!this.diagram) return;

    const node = this.diagram.getNode(nodeId);
    if (!node || !node.parentId) return;

    collected.push(node.parentId);
    this.collectAncestors(node.parentId, collected, currentDepth + 1, maxDepth);
  }

  /**
   * Apply selection based on mode
   */
  private applySelection(
    nodeIds: string[],
    groupIds: string[],
    options: SelectionOptions
  ): void {
    if (!this.store) return;

    const mode = options.mode ?? 'replace';

    // Get current selection
    const currentNodes = (this.store.get('selectedNodes') as Set<string>) ?? new Set<string>();
    const newNodes = new Set(currentNodes);

    // Apply mode for nodes
    switch (mode) {
      case 'replace':
        newNodes.clear();
        nodeIds.forEach(id => newNodes.add(id));
        break;
      case 'add':
        nodeIds.forEach(id => newNodes.add(id));
        break;
      case 'subtract':
        nodeIds.forEach(id => newNodes.delete(id));
        break;
      case 'toggle':
        nodeIds.forEach(id => {
          if (newNodes.has(id)) newNodes.delete(id);
          else newNodes.add(id);
        });
        break;
    }

    // Update store
    this.store.set('selectedNodes', newNodes);

    // Update node states
    if (this.diagram) {
      const nodes = this.diagram.getNodes();
      for (const node of nodes) {
        node.setState({ selected: newNodes.has(node.id) });
      }
    }

    // Emit event if not silent
    if (!options.silent && this.eventBus) {
      this.eventBus.emit('selection:changed', { nodes: Array.from(newNodes) });
    }
  }

  /**
   * Check if two rectangles intersect
   */
  private rectanglesIntersect(rect1: BoundingBox, rect2: BoundingBox): boolean {
    return !(
      rect1.right < rect2.left ||
      rect2.right < rect1.left ||
      rect1.bottom < rect2.top ||
      rect2.bottom < rect1.top
    );
  }

  /**
   * Check if rect1 contains rect2
   */
  private rectangleContains(rect1: BoundingBox, rect2: BoundingBox): boolean {
    return (
      rect2.left >= rect1.left &&
      rect2.top >= rect1.top &&
      rect2.right <= rect1.right &&
      rect2.bottom <= rect1.bottom
    );
  }
}
