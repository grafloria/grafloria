// PortCommands - Wave 6 (Ports & connections): add/remove a port, undoably.
//
// The dynamic auto-port allocator (Card 7) spawns and retires ports as the user
// wires a node up. Those are MODEL MUTATIONS, so they go through the command
// layer like everything else — undo puts the port back, redo takes it away, and
// the renderer's dirty tracking fires exactly once either way.

import { Command, CommandContext, SerializedCommand } from '../Command';
import { PortModel, SerializedPort } from '../../models/PortModel';

export class AddPortCommand extends Command {
  private portData: SerializedPort;

  constructor(
    private nodeId: string,
    port: PortModel
  ) {
    super('Add Port');
    this.portData = port.serialize();
  }

  override execute(context: CommandContext): void {
    const node = context.diagram?.getNode(this.nodeId);
    if (!node) {
      throw new Error(`Node ${this.nodeId} not found`);
    }
    if (node.getPort(this.portData.id)) return; // idempotent
    node.addPort(PortModel.fromJSON(this.portData));
  }

  override undo(context: CommandContext): void {
    const node = context.diagram?.getNode(this.nodeId);
    node?.removePort(this.portData.id);
  }

  override canExecute(context: CommandContext): boolean {
    return !!context.diagram?.getNode(this.nodeId);
  }

  override serialize(): SerializedCommand {
    return {
      id: this.id,
      name: this.name,
      timestamp: this.timestamp,
      data: { nodeId: this.nodeId, port: this.portData },
    };
  }
}

export class RemovePortCommand extends Command {
  /** Captured at execute() time — a port removed must be a port restorable. */
  private portData?: SerializedPort;

  constructor(
    private nodeId: string,
    private portId: string
  ) {
    super('Remove Port');
  }

  override execute(context: CommandContext): void {
    const node = context.diagram?.getNode(this.nodeId);
    const port = node?.getPort(this.portId);
    if (!node || !port) return;
    this.portData = port.serialize();
    node.removePort(this.portId);
  }

  override undo(context: CommandContext): void {
    const node = context.diagram?.getNode(this.nodeId);
    if (!node || !this.portData) return;
    if (node.getPort(this.portData.id)) return;
    node.addPort(PortModel.fromJSON(this.portData));
  }

  override canExecute(context: CommandContext): boolean {
    return !!context.diagram?.getNode(this.nodeId)?.getPort(this.portId);
  }

  override serialize(): SerializedCommand {
    return {
      id: this.id,
      name: this.name,
      timestamp: this.timestamp,
      data: { nodeId: this.nodeId, portId: this.portId, port: this.portData },
    };
  }
}
