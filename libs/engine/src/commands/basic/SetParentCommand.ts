// SetParentCommand - Changes a node's parent (Phase 1.6a Part 5)

import { Command, CommandContext, SerializedCommand } from '../Command';
import { NodeModel } from '../../models/NodeModel';

export class SetParentCommand extends Command {
  private oldParentId?: string;

  constructor(
    private nodeId: string,
    private newParentId?: string
  ) {
    super('Set Parent');
  }

  override execute(context: CommandContext): void {
    const diagram = context.diagram;
    if (!diagram) {
      throw new Error('Diagram not found in context');
    }

    const node = diagram.getNode(this.nodeId);
    if (!node) {
      throw new Error(`Node ${this.nodeId} not found`);
    }

    // Check for circular reference
    if (this.newParentId) {
      const newParent = diagram.getNode(this.newParentId);
      if (!newParent) {
        throw new Error(`Parent node ${this.newParentId} not found`);
      }

      // Check if newParent is a descendant of node (would create circular reference)
      if (newParent.getAncestors().some((ancestor: NodeModel) => ancestor.id === this.nodeId)) {
        throw new Error('Cannot set parent: would create circular reference');
      }
    }

    // Save old parent for undo
    this.oldParentId = node.parentId;

    // Remove from old parent
    if (node.parentId) {
      const oldParent = diagram.getNode(node.parentId);
      if (oldParent) {
        oldParent.removeChild(node.id);
      }
    }

    // Set new parent
    node.setParent(this.newParentId);

    // Add to new parent
    if (this.newParentId) {
      const newParent = diagram.getNode(this.newParentId);
      if (newParent) {
        newParent.addChild(node.id);
      }
    }

    // Update hierarchy depth
    node.updateHierarchyDepth();
  }

  override undo(context: CommandContext): void {
    const diagram = context.diagram;
    if (!diagram) {
      throw new Error('Diagram not found in context');
    }

    const node = diagram.getNode(this.nodeId);
    if (!node) {
      throw new Error(`Node ${this.nodeId} not found`);
    }

    // Remove from current parent
    if (node.parentId) {
      const currentParent = diagram.getNode(node.parentId);
      if (currentParent) {
        currentParent.removeChild(node.id);
      }
    }

    // Restore old parent
    node.setParent(this.oldParentId);

    // Add back to old parent
    if (this.oldParentId) {
      const oldParent = diagram.getNode(this.oldParentId);
      if (oldParent) {
        oldParent.addChild(node.id);
      }
    }

    // Update hierarchy depth
    node.updateHierarchyDepth();
  }

  override canExecute(context: CommandContext): boolean {
    return context.diagram && context.diagram.nodes.has(this.nodeId);
  }

  override canUndo(context: CommandContext): boolean {
    return context.diagram && context.diagram.nodes.has(this.nodeId);
  }

  override serialize(): SerializedCommand {
    return {
      id: this.id,
      name: this.name,
      timestamp: this.timestamp,
      data: {
        nodeId: this.nodeId,
        newParentId: this.newParentId,
        oldParentId: this.oldParentId,
      },
    };
  }

  override getDescription(): string {
    if (this.newParentId) {
      return `Set parent of node ${this.nodeId} to ${this.newParentId}`;
    } else {
      return `Detach node ${this.nodeId} from parent`;
    }
  }
}
