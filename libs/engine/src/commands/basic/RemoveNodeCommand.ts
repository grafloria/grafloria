// RemoveNodeCommand - Removes a node from the diagram

import { Command, CommandContext, SerializedCommand } from '../Command';
import { NodeModel, SerializedNode } from '../../models/NodeModel';

export class RemoveNodeCommand extends Command {
  private nodeData?: SerializedNode;
  private descendantsData?: SerializedNode[]; // Phase 1.6a Part 5

  constructor(private nodeId: string) {
    super('Remove Node');
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

    // Save node data for undo
    this.nodeData = node.serialize();

    // Get and save all descendants (Phase 1.6a Part 5)
    const descendants = node.getDescendants();
    this.descendantsData = descendants.map((d: NodeModel) => d.serialize());

    // Clean up hierarchy with parent (Phase 1.6a Part 5)
    if (node.parentId) {
      const parent = diagram.getNode(node.parentId);
      if (parent) {
        parent.removeChild(node.id);
      }
    }

    // Remove all descendants first (bottom-up)
    for (const descendant of descendants.reverse()) {
      diagram.removeNode(descendant.id);
    }

    // Remove node
    diagram.removeNode(this.nodeId);
  }

  override undo(context: CommandContext): void {
    const diagram = context.diagram;
    if (!diagram || !this.nodeData) {
      throw new Error('Cannot undo: missing diagram or node data');
    }

    // Restore node
    const node = NodeModel.fromJSON(this.nodeData);
    diagram.addNode(node);

    // Restore hierarchy with parent (Phase 1.6a Part 5)
    if (node.parentId) {
      const parent = diagram.getNode(node.parentId);
      if (parent) {
        parent.addChild(node.id);
      }
    }

    // Restore all descendants (Phase 1.6a Part 5)
    if (this.descendantsData) {
      for (const descendantData of this.descendantsData) {
        const descendant = NodeModel.fromJSON(descendantData);
        diagram.addNode(descendant);

        // Restore hierarchy relationship
        if (descendant.parentId) {
          const parent = diagram.getNode(descendant.parentId);
          if (parent) {
            parent.addChild(descendant.id);
          }
        }
      }
    }
  }

  override canExecute(context: CommandContext): boolean {
    return context.diagram && context.diagram.nodes.has(this.nodeId);
  }

  override canUndo(context: CommandContext): boolean {
    return context.diagram && !!this.nodeData;
  }

  override serialize(): SerializedCommand {
    return {
      id: this.id,
      name: this.name,
      timestamp: this.timestamp,
      data: {
        nodeId: this.nodeId,
        nodeData: this.nodeData,
      },
    };
  }

  override getDescription(): string {
    return `Remove node ${this.nodeId}`;
  }
}
