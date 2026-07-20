// PasteCommand - Paste entities from clipboard (Phase 1.8)

import { Command, CommandContext, SerializedCommand } from '../Command';
import type { ClipboardManager } from '../../clipboard/ClipboardManager';
import { NodeModel } from '../../models/NodeModel';
import { LinkModel } from '../../models/LinkModel';
import { GroupModel } from '../../models/GroupModel';
import type { Point } from '../../types';
import { generateId } from '../../utils/id';
import { remapNodePortIds } from './remapNodePortIds';

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
  private idMap: Map<string, string> = new Map(); // old node/group ID -> new ID
  private portIdMap: Map<string, string> = new Map(); // old port ID -> new port ID
  private pasteSlot: number | null = null; // claimed once; stable across redo

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

    // Reset ID maps for this execution
    this.idMap.clear();
    this.portIdMap.clear();
    this.pastedNodeIds = [];
    this.pastedLinkIds = [];
    this.pastedGroupIds = [];

    // An EXPLICIT offset is honored exactly (API contract). The DEFAULT
    // cascades per paste of the same copy — clipboard positions are frozen at
    // copy time, so without the cascade every default paste stacks on the
    // same pixels. The slot is claimed once per command: redo re-executes at
    // the same spot instead of drifting further.
    if (this.pasteSlot === null) {
      this.pasteSlot = this.clipboard.claimPasteSlot();
    }
    const offset = this.options.offset || { x: 20 * this.pasteSlot, y: 20 * this.pasteSlot };

    // Step 1: Paste nodes with ID remapping
    for (const nodeData of clipboardData.nodes) {
      // Generate new ID
      const oldId = nodeData.id;
      const newId = generateId();
      this.idMap.set(oldId, newId);

      // Create new node with new ID
      const node = NodeModel.fromJSON({ ...nodeData, id: newId });

      // Re-ID every port so the pasted node's ports are globally unique, and
      // record oldPortId -> newPortId. NodeModel.fromJSON preserves the ORIGINAL
      // port ids from the serialized data, so without this a pasted node would
      // share port ids with its source — and links (which reference the engine's
      // nanoid port ids, NOT "nodeId:portName" strings) would resolve to the
      // wrong node. Rebuild the ports map since its keys are the port ids.
      remapNodePortIds(node, newId, this.portIdMap);

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
      // Remap the endpoints through the port-id map built while cloning nodes.
      // A link's sourcePortId/targetPortId ARE port ids (engine nanoids), so if
      // either endpoint's port was not among the pasted nodes, drop the link.
      const newSourcePortId = this.portIdMap.get(linkData.sourcePortId);
      const newTargetPortId = this.portIdMap.get(linkData.targetPortId);

      if (!newSourcePortId || !newTargetPortId) {
        // Source or target port not pasted, skip this link
        continue;
      }

      // Generate new ID
      const oldId = linkData.id;
      const newId = generateId();
      this.idMap.set(oldId, newId);

      // Remap the cached owning-node ids through the node-id map (may be absent
      // on legacy links — addLink() backfills them from the port lookup).
      const newSourceNodeId = linkData.sourceNodeId
        ? this.idMap.get(linkData.sourceNodeId)
        : undefined;
      const newTargetNodeId = linkData.targetNodeId
        ? this.idMap.get(linkData.targetNodeId)
        : undefined;

      // Create new link with new ID and remapped ports + node caches
      const link = LinkModel.fromJSON({
        ...linkData,
        id: newId,
        sourcePortId: newSourcePortId,
        targetPortId: newTargetPortId,
        sourceNodeId: newSourceNodeId,
        targetNodeId: newTargetNodeId,
      });

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

      // Remap member IDs — from oldGroup, which is the one that HAS members.
      // This iterated `group.members` (the freshly-constructed, empty group), so
      // newMembers was always empty, the size>0 guard below dropped the group, and
      // pasting a grouped selection silently lost the group. No test caught it
      // because every paste test used groups:[]. See ClipboardCommands.spec.ts.
      const newMembers = new Set<string>();
      for (const memberId of oldGroup.members) {
        const newMemberId = this.idMap.get(memberId);
        if (newMemberId) {
          newMembers.add(newMemberId);
        }
      }
      // DIRECT field write, deliberately: `group` is DETACHED here (constructed,
      // not yet addGroup'd), so nothing is capturing it and a tracked mutator would
      // buy nothing — exactly like building a node before adding it. The addGroup
      // below is the funnel: it emits the structural op carrying group.serialize(),
      // whose `members` array is read wholesale, so a collab peer receives the
      // pasted group correctly regardless of this assignment. (Contrast an ATTACHED
      // group, where membership edits MUST go through addMember/removeMember.)
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
        portIdMap: Object.fromEntries(this.portIdMap),
        options: this.options,
      },
    };
  }

  override getDescription(): string {
    const count = this.pastedNodeIds.length;
    return `Paste ${count} node${count !== 1 ? 's' : ''}`;
  }
}
