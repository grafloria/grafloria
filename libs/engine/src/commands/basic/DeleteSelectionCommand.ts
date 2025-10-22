// DeleteSelectionCommand - Delete selected entities (Phase 1.8)

import { Command, CommandContext, SerializedCommand } from '../Command';
import type { SerializedNode } from '../../models/NodeModel';
import type { SerializedLink } from '../../models/LinkModel';
import type { SerializedGroup } from '../../models/GroupModel';

/**
 * DeleteSelectionCommand deletes selected entities from diagram
 *
 * Features:
 * - Deletes selected nodes, links, and groups
 * - Recursively deletes child nodes
 * - Removes links connected to deleted nodes
 * - Removes nodes from groups they belong to
 * - Stores all deleted data for undo
 * - Supports undo/redo
 */
export class DeleteSelectionCommand extends Command {
  private deletedNodes: SerializedNode[] = [];
  private deletedLinks: SerializedLink[] = [];
  private deletedGroups: SerializedGroup[] = [];
  private affectedGroups: Map<string, Set<string>> = new Map(); // groupId -> removed member IDs

  constructor(
    private options: {
      deleteChildren?: boolean; // Delete child nodes recursively (default: true)
      deleteLinks?: boolean; // Delete connected links (default: true)
    } = {}
  ) {
    super('Delete Selection');
  }

  override execute(context: CommandContext): void {
    const diagram = context.diagram;
    if (!diagram) {
      throw new Error('Diagram not found in context');
    }

    const selectedNodeIds = context.store?.get('selectedNodes') as Set<string> | undefined;
    const selectedLinkIds = context.store?.get('selectedLinks') as Set<string> | undefined;

    if (
      (!selectedNodeIds || selectedNodeIds.size === 0) &&
      (!selectedLinkIds || selectedLinkIds.size === 0)
    ) {
      throw new Error('No entities selected');
    }

    // Reset state
    this.deletedNodes = [];
    this.deletedLinks = [];
    this.deletedGroups = [];
    this.affectedGroups.clear();

    const deleteChildren = this.options.deleteChildren !== false;
    const deleteLinks = this.options.deleteLinks !== false;

    // Collect all node IDs to delete (including children if enabled)
    const nodeIdsToDelete = new Set<string>();
    if (selectedNodeIds) {
      for (const nodeId of selectedNodeIds) {
        this.collectNodeIdsToDelete(diagram, nodeId, nodeIdsToDelete, deleteChildren);
      }
    }

    // Step 1: Delete links connected to nodes (if enabled) or selected links
    if (deleteLinks && nodeIdsToDelete.size > 0) {
      const allLinks = diagram.getLinks();
      for (const link of allLinks) {
        const sourceNodeId = link.sourcePortId.split(':')[0];
        const targetNodeId = link.targetPortId.split(':')[0];

        if (nodeIdsToDelete.has(sourceNodeId) || nodeIdsToDelete.has(targetNodeId)) {
          this.deletedLinks.push(link.serialize());
          diagram.removeLink(link.id);
        }
      }
    }

    // Delete explicitly selected links
    if (selectedLinkIds) {
      for (const linkId of selectedLinkIds) {
        const link = diagram.getLink(linkId);
        if (link) {
          this.deletedLinks.push(link.serialize());
          diagram.removeLink(linkId);
        }
      }
    }

    // Step 2: Remove nodes from groups they belong to
    const allGroups = diagram.getGroups();
    for (const group of allGroups) {
      const removedMembers = new Set<string>();
      for (const memberId of group.members) {
        if (nodeIdsToDelete.has(memberId)) {
          removedMembers.add(memberId);
        }
      }

      if (removedMembers.size > 0) {
        this.affectedGroups.set(group.id, removedMembers);
        for (const memberId of removedMembers) {
          group.removeMember(memberId);
        }
      }
    }

    // Step 3: Delete groups that have no members left or are empty
    for (const group of allGroups) {
      if (group.members.size === 0) {
        this.deletedGroups.push(group.serialize());
        diagram.removeGroup(group.id);
      }
    }

    // Step 4: Delete nodes (in reverse hierarchy order - children first)
    const nodesToDelete = Array.from(nodeIdsToDelete)
      .map((id) => diagram.getNode(id))
      .filter((node) => node !== undefined);

    // Sort by hierarchy depth (deepest first)
    nodesToDelete.sort((a, b) => {
      const depthA = this.getNodeDepth(diagram, a.id);
      const depthB = this.getNodeDepth(diagram, b.id);
      return depthB - depthA;
    });

    for (const node of nodesToDelete) {
      this.deletedNodes.push(node.serialize());
      diagram.removeNode(node.id);
    }

    // Step 5: Clear selection
    if (context.store) {
      context.store.set('selectedNodes', new Set());
      context.store.set('selectedLinks', new Set());
      context.eventBus?.emit('selection:cleared');
    }
  }

  override undo(context: CommandContext): void {
    const diagram = context.diagram;
    if (!diagram) {
      throw new Error('Diagram not found in context');
    }

    // Restore in reverse order of deletion

    // Step 1: Restore nodes (parents first)
    const nodesToRestore = [...this.deletedNodes].reverse();
    for (const nodeData of nodesToRestore) {
      const node = diagram.restoreNode(nodeData);
      if (!node) {
        console.warn(`Failed to restore node ${nodeData.id}`);
      }
    }

    // Step 2: Restore groups
    for (const groupData of this.deletedGroups) {
      const group = diagram.restoreGroup(groupData);
      if (!group) {
        console.warn(`Failed to restore group ${groupData.id}`);
      }
    }

    // Step 3: Restore group memberships
    for (const [groupId, memberIds] of this.affectedGroups.entries()) {
      const group = diagram.getGroup(groupId);
      if (group) {
        for (const memberId of memberIds) {
          group.addMember(memberId);
        }
      }
    }

    // Step 4: Restore links
    for (const linkData of this.deletedLinks) {
      const link = diagram.restoreLink(linkData);
      if (!link) {
        console.warn(`Failed to restore link ${linkData.id}`);
      }
    }
  }

  override canExecute(context: CommandContext): boolean {
    const diagram = context.diagram;
    if (!diagram) return false;

    const selectedNodeIds = context.store?.get('selectedNodes') as Set<string> | undefined;
    const selectedLinkIds = context.store?.get('selectedLinks') as Set<string> | undefined;

    return !!(
      (selectedNodeIds && selectedNodeIds.size > 0) ||
      (selectedLinkIds && selectedLinkIds.size > 0)
    );
  }

  override canUndo(context: CommandContext): boolean {
    return !!(
      context.diagram &&
      (this.deletedNodes.length > 0 ||
        this.deletedLinks.length > 0 ||
        this.deletedGroups.length > 0)
    );
  }

  override serialize(): SerializedCommand {
    return {
      id: this.id,
      name: this.name,
      timestamp: this.timestamp,
      data: {
        deletedNodes: this.deletedNodes,
        deletedLinks: this.deletedLinks,
        deletedGroups: this.deletedGroups,
        affectedGroups: Array.from(this.affectedGroups.entries()).map(([groupId, memberIds]) => ({
          groupId,
          memberIds: Array.from(memberIds),
        })),
        options: this.options,
      },
    };
  }

  override getDescription(): string {
    const nodeCount = this.deletedNodes.length;
    const linkCount = this.deletedLinks.length;
    const parts: string[] = [];

    if (nodeCount > 0) {
      parts.push(`${nodeCount} node${nodeCount !== 1 ? 's' : ''}`);
    }
    if (linkCount > 0) {
      parts.push(`${linkCount} link${linkCount !== 1 ? 's' : ''}`);
    }

    return `Delete ${parts.join(' and ')}`;
  }

  /**
   * Recursively collect node IDs to delete (including children if enabled)
   */
  private collectNodeIdsToDelete(
    diagram: any,
    nodeId: string,
    collected: Set<string>,
    includeChildren: boolean
  ): void {
    if (collected.has(nodeId)) return;

    collected.add(nodeId);

    if (includeChildren) {
      const node = diagram.getNode(nodeId);
      if (node) {
        for (const childId of node.children) {
          this.collectNodeIdsToDelete(diagram, childId, collected, includeChildren);
        }
      }
    }
  }

  /**
   * Get hierarchy depth of a node (root = 0)
   */
  private getNodeDepth(diagram: any, nodeId: string): number {
    const node = diagram.getNode(nodeId);
    if (!node || !node.parentId) return 0;

    return 1 + this.getNodeDepth(diagram, node.parentId);
  }
}
