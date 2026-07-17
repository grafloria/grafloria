// DeleteSelectionCommand - Delete selected entities (Phase 1.8)

import { Command, CommandContext, SerializedCommand } from '../Command';
import type { SerializedNode } from '../../models/NodeModel';
import type { SerializedLink } from '../../models/LinkModel';
import type { SerializedGroup } from '../../models/GroupModel';
import { resolveLinkNodeIds } from './resolveLinkNodeIds';

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
      /**
       * Proactively delete connected links in a first pass (default: true).
       *
       * Since wave 10, `DiagramModel.removeNode()` CASCADES the node's links —
       * a link to nowhere is not a link — so `false` cannot keep a deleted
       * node's links alive; they are removed either way. What `false` controls
       * is only the removal ORDER (cascade instead of an explicit pre-pass).
       * Every cascaded link is still recorded, so undo restores the diagram
       * whole under both settings.
       */
      deleteLinks?: boolean;
    } = {}
  ) {
    super('Delete Selection');
  }

  override execute(context: CommandContext): void {
    const diagram = context.diagram;
    if (!diagram) {
      throw new Error('Diagram not found in context');
    }

    // Diagram selection first — mouse selection never writes the store's sets
    // (see CopyCommand).
    const diagramNodeSel = diagram.getSelectedNodes().map((n: { id: string }) => n.id);
    const diagramLinkSel = diagram.getLinks().filter((l: { state: string }) => l.state === 'selected').map((l: { id: string }) => l.id);
    const storeNodeSel = context.store?.get('selectedNodes') as Set<string> | undefined;
    const storeLinkSel = context.store?.get('selectedLinks') as Set<string> | undefined;
    const selectedNodeIds = new Set<string>(diagramNodeSel.length > 0 ? diagramNodeSel : Array.from(storeNodeSel ?? []));
    const selectedLinkIds = new Set<string>(diagramLinkSel.length > 0 ? diagramLinkSel : Array.from(storeLinkSel ?? []));

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
        // Endpoints are PORT ids (nanoids), so the owning nodes must be resolved
        // through the port index. Splitting on ':' resolved NOTHING for links
        // made by connectNodes()/the interactive connect path, which left orphan
        // links behind whenever their nodes were deleted (removeNode() does not
        // cascade). See resolveLinkNodeIds().
        const { sourceNodeId, targetNodeId } = resolveLinkNodeIds(diagram, link);

        if (
          (sourceNodeId && nodeIdsToDelete.has(sourceNodeId)) ||
          (targetNodeId && nodeIdsToDelete.has(targetNodeId))
        ) {
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

    const recordedLinkIds = new Set(this.deletedLinks.map((l) => l.id));
    for (const node of nodesToDelete) {
      // Record links about to CASCADE before they vanish (wave 14). With
      // `deleteLinks: false`, Step 1 skipped them — but removeNode() cascades
      // a node's links regardless, so undo silently lost every link the
      // deleted nodes touched. Deduped: one link can touch two doomed nodes,
      // and with `deleteLinks: true` Step 1 already recorded (and removed)
      // all of these, so this records nothing new.
      for (const link of diagram.getLinksForNode(node.id)) {
        if (!recordedLinkIds.has(link.id)) {
          recordedLinkIds.add(link.id);
          this.deletedLinks.push(link.serialize());
        }
      }
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

    // Step 4: Restore links (guarded: restoreLink() would re-install over a
    // live link, double-registering its port connections)
    for (const linkData of this.deletedLinks) {
      if (diagram.getLink(linkData.id)) continue;
      const link = diagram.restoreLink(linkData);
      if (!link) {
        console.warn(`Failed to restore link ${linkData.id}`);
      }
    }
  }

  /**
   * Redo re-applies the RECORDED deletion instead of re-running execute().
   *
   * The default `Command.redo()` calls `execute()`, which reads the LIVE
   * selection — but `undo()` restores the entities WITHOUT restoring the
   * selection, so a redo would find an empty selection and throw
   * `No entities selected`. Redo therefore removes exactly the entities this
   * command removed the first time. The recorded arrays are left intact, so the
   * command can be undone again afterwards (undo/redo/undo/redo all work).
   */
  override redo(context: CommandContext): void {
    const diagram = context.diagram;
    if (!diagram) {
      throw new Error('Diagram not found in context');
    }

    // Never executed yet (redo before execute) → nothing recorded, use the
    // normal selection-driven path.
    if (
      this.deletedNodes.length === 0 &&
      this.deletedLinks.length === 0 &&
      this.deletedGroups.length === 0
    ) {
      this.execute(context);
      return;
    }

    // Same order as execute(): links → group memberships → groups → nodes.
    for (const linkData of this.deletedLinks) {
      diagram.removeLink(linkData.id);
    }

    for (const [groupId, memberIds] of this.affectedGroups.entries()) {
      const group = diagram.getGroup(groupId);
      if (group) {
        for (const memberId of memberIds) {
          group.removeMember(memberId);
        }
      }
    }

    for (const groupData of this.deletedGroups) {
      diagram.removeGroup(groupData.id);
    }

    // `deletedNodes` was recorded deepest-first, so children go before parents.
    for (const nodeData of this.deletedNodes) {
      diagram.removeNode(nodeData.id);
    }

    if (context.store) {
      context.store.set('selectedNodes', new Set());
      context.store.set('selectedLinks', new Set());
      context.eventBus?.emit('selection:cleared');
    }
  }

  override canExecute(context: CommandContext): boolean {
    const diagram = context.diagram;
    if (!diagram) return false;

    if (diagram.getSelectedNodes().length > 0) return true;
    if (diagram.getLinks().some((l: { state: string }) => l.state === 'selected')) return true;
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
