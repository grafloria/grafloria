// PasteCommand - Paste entities from clipboard (Phase 1.8)

import { Command, CommandContext, SerializedCommand } from '../Command';
import type { ClipboardManager } from '../../clipboard/ClipboardManager';
import { NodeModel } from '../../models/NodeModel';
import { LinkModel } from '../../models/LinkModel';
import { GroupModel } from '../../models/GroupModel';
import type { Point } from '../../types';
import { generateId } from '../../utils/id';

/**
 * PasteCommand pastes entities from clipboard into diagram
 *
 * Features:
 * - Generates new IDs for pasted entities
 * - Remaps relationships (links, groups, hierarchy)
 * - Applies position offset
 * - Preserves all properties (transforms, layout configs, etc.)
 * - Supports undo/redo
 */
export class PasteCommand extends Command {
  private pastedNodeIds: string[] = [];
  private pastedLinkIds: string[] = [];
  private pastedGroupIds: string[] = [];
  private idMap: Map<string, string> = new Map(); // old ID -> new ID

  constructor(
    private clipboard: ClipboardManager,
    private options: {
      offset?: Point; // Position offset (default: {x: 20, y: 20})
      selectPasted?: boolean; // Select pasted entities (default: true)
    } = {}
  ) {
    super('Paste');
  }

  override execute(context: CommandContext): void {
    const diagram = context.diagram;
    if (!diagram) {
      throw new Error('Diagram not found in context');
    }

    const clipboardData = this.clipboard.get();
    if (!clipboardData) {
      throw new Error('Clipboard is empty');
    }

    // Reset ID map for this execution
    this.idMap.clear();
    this.pastedNodeIds = [];
    this.pastedLinkIds = [];
    this.pastedGroupIds = [];

    const offset = this.options.offset || { x: 20, y: 20 };

    // Step 1: Paste nodes with ID remapping
    for (const nodeData of clipboardData.nodes) {
      const oldNode = NodeModel.fromJSON(nodeData);

      // Generate new ID
      const oldId = oldNode.id;
      const newId = generateId();
      this.idMap.set(oldId, newId);

      // Create new node with new ID
      const node = NodeModel.fromJSON({ ...nodeData, id: newId });

      // Apply position offset
      node.position = {
        x: node.position.x + offset.x,
        y: node.position.y + offset.y,
        z: node.position.z,
      };

      // Remap parent ID if exists
      if (node.parentId) {
        const newParentId = this.idMap.get(node.parentId);
        if (newParentId) {
          node.parentId = newParentId;
        } else {
          // Parent not in clipboard, remove parent relationship
          node.parentId = undefined;
        }
      }

      // Remap children IDs
      const newChildren = new Set<string>();
      for (const childId of node.children) {
        const newChildId = this.idMap.get(childId);
        if (newChildId) {
          newChildren.add(newChildId);
        }
      }
      node.children = newChildren;

      // Add to diagram
      diagram.addNode(node);
      this.pastedNodeIds.push(node.id);
    }

    // Step 2: Paste links with ID remapping
    for (const linkData of clipboardData.links) {
      const oldLink = LinkModel.fromJSON(linkData);

      // Generate new ID
      const oldId = oldLink.id;
      const newId = generateId();
      this.idMap.set(oldId, newId);

      // Remap port IDs (format: "nodeId:portId")
      const sourceNodeId = oldLink.sourcePortId.split(':')[0];
      const sourcePortName = oldLink.sourcePortId.split(':')[1];
      const targetNodeId = oldLink.targetPortId.split(':')[0];
      const targetPortName = oldLink.targetPortId.split(':')[1];

      const newSourceNodeId = this.idMap.get(sourceNodeId);
      const newTargetNodeId = this.idMap.get(targetNodeId);

      if (!newSourceNodeId || !newTargetNodeId) {
        // Source or target node not pasted, skip this link
        continue;
      }

      const newSourcePortId = `${newSourceNodeId}:${sourcePortName}`;
      const newTargetPortId = `${newTargetNodeId}:${targetPortName}`;

      // Create new link with new ID and remapped ports
      const link = LinkModel.fromJSON({ ...linkData, id: newId, sourcePortId: newSourcePortId, targetPortId: newTargetPortId });

      // Add to diagram
      diagram.addLink(link);
      this.pastedLinkIds.push(link.id);
    }

    // Step 3: Paste groups with ID remapping
    for (const groupData of clipboardData.groups) {
      const oldGroup = GroupModel.fromJSON(groupData);

      // Create new group with new ID
      const oldId = oldGroup.id;
      const newId = generateId();
      const group = new GroupModel({ name: oldGroup.name });
      (group as any).id = newId; // Override readonly id
      this.idMap.set(oldId, newId);

      // Remap member IDs
      const newMembers = new Set<string>();
      for (const memberId of group.members) {
        const newMemberId = this.idMap.get(memberId);
        if (newMemberId) {
          newMembers.add(newMemberId);
        }
      }
      group.members = newMembers;

      // Only add group if it has members
      if (group.members.size > 0) {
        diagram.addGroup(group);
        this.pastedGroupIds.push(group.id);
      }
    }

    // Step 4: Select pasted entities (if enabled)
    if (this.options.selectPasted !== false && context.store) {
      context.store.set('selectedNodes', new Set(this.pastedNodeIds));
      context.store.set('selectedLinks', new Set());

      // Update node states
      diagram.getNodes().forEach((node: NodeModel) => {
        node.setState({ selected: this.pastedNodeIds.includes(node.id) });
      });

      // Emit selection event
      context.eventBus?.emit('selection:changed', { nodes: this.pastedNodeIds });
    }
  }

  override undo(context: CommandContext): void {
    const diagram = context.diagram;
    if (!diagram) {
      throw new Error('Diagram not found in context');
    }

    // Remove pasted entities in reverse order
    for (const groupId of this.pastedGroupIds.reverse()) {
      diagram.removeGroup(groupId);
    }

    for (const linkId of this.pastedLinkIds.reverse()) {
      diagram.removeLink(linkId);
    }

    for (const nodeId of this.pastedNodeIds.reverse()) {
      diagram.removeNode(nodeId);
    }

    // Clear selection
    if (context.store) {
      context.store.set('selectedNodes', new Set());
      context.eventBus?.emit('selection:cleared');
    }
  }

  override canExecute(context: CommandContext): boolean {
    return !!(context.diagram && this.clipboard.hasData());
  }

  override canUndo(context: CommandContext): boolean {
    return !!(context.diagram && this.pastedNodeIds.length > 0);
  }

  override serialize(): SerializedCommand {
    return {
      id: this.id,
      name: this.name,
      timestamp: this.timestamp,
      data: {
        pastedNodeIds: this.pastedNodeIds,
        pastedLinkIds: this.pastedLinkIds,
        pastedGroupIds: this.pastedGroupIds,
        idMap: Object.fromEntries(this.idMap),
        options: this.options,
      },
    };
  }

  override getDescription(): string {
    const count = this.pastedNodeIds.length;
    return `Paste ${count} node${count !== 1 ? 's' : ''}`;
  }
}
