// AddNodeCommand - Adds a node to the diagram

import { Command, CommandContext, SerializedCommand } from '../Command';
import { NodeModel, SerializedNode } from '../../models/NodeModel';

export class AddNodeCommand extends Command {
  private nodeData: SerializedNode;

  constructor(private node: NodeModel) {
    super('Add Node');
    this.nodeData = node.serialize();
  }

  override execute(context: CommandContext): void {
    const diagram = context.diagram;
    if (!diagram) {
      throw new Error('Diagram not found in context');
    }

    // Restore node from serialized data
    const node = NodeModel.fromJSON(this.nodeData);
    diagram.addNode(node);

    // Set up hierarchy if node has parent (Phase 1.6a Part 5)
    if (node.parentId) {
      const parent = diagram.getNode(node.parentId);
      if (parent) {
        parent.addChild(node.id);
      }
    }
  }

  override undo(context: CommandContext): void {
    const diagram = context.diagram;
    if (!diagram) {
      throw new Error('Diagram not found in context');
    }

    // Clean up hierarchy before removing (Phase 1.6a Part 5)
    const node = diagram.getNode(this.nodeData.id);
    if (node && node.parentId) {
      const parent = diagram.getNode(node.parentId);
      if (parent) {
        parent.removeChild(node.id);
      }
    }

    diagram.removeNode(this.nodeData.id);
  }

  override canExecute(context: CommandContext): boolean {
    return context.diagram && !context.diagram.nodes.has(this.nodeData.id);
  }

  override canUndo(context: CommandContext): boolean {
    return context.diagram && context.diagram.nodes.has(this.nodeData.id);
  }

  override serialize(): SerializedCommand {
    return {
      id: this.id,
      name: this.name,
      timestamp: this.timestamp,
      data: {
        node: this.nodeData,
      },
    };
  }

  override getDescription(): string {
    return `Add ${this.nodeData.type} node`;
  }
}
