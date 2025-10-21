// RemoveNodeCommand - Removes a node from the diagram

import { Command, CommandContext, SerializedCommand } from '../Command';
import { NodeModel, SerializedNode } from '../../models/NodeModel';

export class RemoveNodeCommand extends Command {
  private nodeData?: SerializedNode;

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
