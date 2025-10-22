// DuplicateCommand - Duplicate selected entities (Phase 1.8)

import { Command, CommandContext, SerializedCommand } from '../Command';
import { NodeModel } from '../../models/NodeModel';
import { LinkModel } from '../../models/LinkModel';
import { GroupModel } from '../../models/GroupModel';
import type { Point } from '../../types';
import { generateId } from '../../utils/id';

/**
 * DuplicateCommand duplicates selected entities in the diagram
 *
 * Features:
 * - Generates new IDs for duplicated entities
 * - Remaps relationships (links, groups, hierarchy)
 * - Applies position offset
 * - Preserves all properties (transforms, layout configs, etc.)
 * - Supports undo/redo
 * - Similar to paste but operates directly on selection
 */
export class DuplicateCommand extends Command {
  private duplicatedNodeIds: string[] = [];
  private duplicatedLinkIds: string[] = [];
  private duplicatedGroupIds: string[] = [];
  private idMap: Map<string, string> = new Map(); // old ID -> new ID

  constructor(
    private options: {
      offset?: Point; // Position offset (default: {x: 20, y: 20})
      selectDuplicated?: boolean; // Select duplicated entities (default: true)
    } = {}
  ) {
    super('Duplicate');
  }

  override execute(context: CommandContext): void {
    const diagram = context.diagram;
    if (!diagram) {
      throw new Error('Diagram not found in context');
    }

    const selectedNodeIds = context.store?.get('selectedNodes') as Set<string> | undefined;
    if (!selectedNodeIds || selectedNodeIds.size === 0) {
      throw new Error('No nodes selected');
    }

    // Reset ID map for this execution
    this.idMap.clear();
    this.duplicatedNodeIds = [];
    this.duplicatedLinkIds = [];
    this.duplicatedGroupIds = [];

    const offset = this.options.offset || { x: 20, y: 20 };
    const nodeIdSet = new Set<string>();

    // Step 1: Duplicate nodes with ID remapping
    for (const nodeId of selectedNodeIds) {
      const node = diagram.getNode(nodeId);
      if (!node) continue;

      // Clone node
      const nodeData = node.serialize();
      const oldId = node.id;
      const newId = generateId();
      const newNode = NodeModel.fromJSON({ ...nodeData, id: newId });

      this.idMap.set(oldId, newId);
      nodeIdSet.add(oldId);

      // Apply position offset
      newNode.position = {
        x: newNode.position.x + offset.x,
        y: newNode.position.y + offset.y,
        z: newNode.position.z,
      };

      // Remap parent ID if exists
      if (newNode.parentId) {
        const newParentId = this.idMap.get(newNode.parentId);
        if (newParentId) {
          newNode.parentId = newParentId;
        } else {
          // Parent not in selection, remove parent relationship
          newNode.parentId = undefined;
        }
      }

      // Remap children IDs
      const newChildren = new Set<string>();
      for (const childId of newNode.children) {
        const newChildId = this.idMap.get(childId);
        if (newChildId) {
          newChildren.add(newChildId);
        }
      }
      newNode.children = newChildren;

      // Add to diagram
      diagram.addNode(newNode);
      this.duplicatedNodeIds.push(newNode.id);
    }

    // Step 2: Duplicate links between selected nodes
    const allLinks = diagram.getLinks();
    for (const link of allLinks) {
      // Parse port IDs (format: "nodeId:portId")
      const sourceNodeId = link.sourcePortId.split(':')[0];
      const targetNodeId = link.targetPortId.split(':')[0];

      // Only duplicate link if both nodes are selected
      if (!nodeIdSet.has(sourceNodeId) || !nodeIdSet.has(targetNodeId)) {
        continue;
      }

      // Clone link
      const linkData = link.serialize();
      const newId = generateId();

      // Remap port IDs
      const sourcePortName = link.sourcePortId.split(':')[1];
      const targetPortName = link.targetPortId.split(':')[1];

      const newSourceNodeId = this.idMap.get(sourceNodeId);
      const newTargetNodeId = this.idMap.get(targetNodeId);

      if (!newSourceNodeId || !newTargetNodeId) {
        continue;
      }

      const newSourcePortId = `${newSourceNodeId}:${sourcePortName}`;
      const newTargetPortId = `${newTargetNodeId}:${targetPortName}`;

      // Create new link with new ID and remapped ports
      const newLink = LinkModel.fromJSON({ ...linkData, id: newId, sourcePortId: newSourcePortId, targetPortId: newTargetPortId });

      // Add to diagram
      diagram.addLink(newLink);
      this.duplicatedLinkIds.push(newLink.id);
    }

    // Step 3: Duplicate groups containing only selected nodes
    const allGroups = diagram.getGroups();
    for (const group of allGroups) {
      // Check if all group members are selected
      const allMembersSelected = (Array.from(group.members) as string[]).every((memberId) =>
        nodeIdSet.has(memberId)
      );

      if (!allMembersSelected || group.members.size === 0) {
        continue;
      }

      // Clone group
      const groupData = group.serialize();
      const oldId = group.id;
      const newId = generateId();

      // Create new group with new ID
      const newGroup = new GroupModel({ name: group.name });
      (newGroup as any).id = newId; // Override readonly id
      this.idMap.set(oldId, newId);

      // Remap member IDs
      const newMembers = new Set<string>();
      for (const memberId of newGroup.members) {
        const newMemberId = this.idMap.get(memberId);
        if (newMemberId) {
          newMembers.add(newMemberId);
        }
      }
      newGroup.members = newMembers;

      // Only add group if it has members
      if (newGroup.members.size > 0) {
        diagram.addGroup(newGroup);
        this.duplicatedGroupIds.push(newGroup.id);
      }
    }

    // Step 4: Select duplicated entities (if enabled)
    if (this.options.selectDuplicated !== false && context.store) {
      context.store.set('selectedNodes', new Set(this.duplicatedNodeIds));
      context.store.set('selectedLinks', new Set());

      // Update node states
      diagram.getNodes().forEach((node: NodeModel) => {
        node.setState({ selected: this.duplicatedNodeIds.includes(node.id) });
      });

      // Emit selection event
      context.eventBus?.emit('selection:changed', { nodes: this.duplicatedNodeIds });
    }
  }

  override undo(context: CommandContext): void {
    const diagram = context.diagram;
    if (!diagram) {
      throw new Error('Diagram not found in context');
    }

    // Remove duplicated entities in reverse order
    for (const groupId of this.duplicatedGroupIds.reverse()) {
      diagram.removeGroup(groupId);
    }

    for (const linkId of this.duplicatedLinkIds.reverse()) {
      diagram.removeLink(linkId);
    }

    for (const nodeId of this.duplicatedNodeIds.reverse()) {
      diagram.removeNode(nodeId);
    }

    // Clear selection
    if (context.store) {
      context.store.set('selectedNodes', new Set());
      context.eventBus?.emit('selection:cleared');
    }
  }

  override canExecute(context: CommandContext): boolean {
    const diagram = context.diagram;
    if (!diagram) return false;

    const selectedNodeIds = context.store?.get('selectedNodes') as Set<string> | undefined;
    return !!(selectedNodeIds && selectedNodeIds.size > 0);
  }

  override canUndo(context: CommandContext): boolean {
    return !!(context.diagram && this.duplicatedNodeIds.length > 0);
  }

  override serialize(): SerializedCommand {
    return {
      id: this.id,
      name: this.name,
      timestamp: this.timestamp,
      data: {
        duplicatedNodeIds: this.duplicatedNodeIds,
        duplicatedLinkIds: this.duplicatedLinkIds,
        duplicatedGroupIds: this.duplicatedGroupIds,
        idMap: Object.fromEntries(this.idMap),
        options: this.options,
      },
    };
  }

  override getDescription(): string {
    const count = this.duplicatedNodeIds.length;
    return `Duplicate ${count} node${count !== 1 ? 's' : ''}`;
  }
}
