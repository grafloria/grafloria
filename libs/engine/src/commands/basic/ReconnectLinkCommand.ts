// ReconnectLinkCommand — moves one endpoint of a link to a different port, undoably.
// wave12 (deferred issue B, reconnect path): dragging a link endpoint to another port called
// link.reconnectSource()/reconnectTarget() directly and recorded NOTHING, so a reconnect could
// not be undone. This is the FROM→TO snapshot the other drag gestures (node, waypoint, group)
// use: the live gesture has already applied `new`, so execute() re-applies it (a no-op that
// records one history entry) and undo restores `old`. The link's routed points are DERIVED and
// re-computed from the endpoints on the next render, so restoring the port/node is enough.

import { Command, CommandContext, SerializedCommand } from '../Command';

export type LinkEndpoint = 'source' | 'target';

export class ReconnectLinkCommand extends Command {
  constructor(
    private linkId: string,
    private endpoint: LinkEndpoint,
    private newPortId: string,
    private newNodeId: string | undefined,
    private oldPortId: string,
    private oldNodeId: string | undefined
  ) {
    super('Reconnect Link');
  }

  private apply(context: CommandContext, portId: string, nodeId: string | undefined): void {
    const diagram = context.diagram;
    if (!diagram) throw new Error('Diagram not found in context');
    const link = diagram.getLink(this.linkId);
    if (!link) throw new Error(`Link ${this.linkId} not found`);
    if (this.endpoint === 'source') {
      link.reconnectSource(portId, nodeId);
    } else {
      link.reconnectTarget(portId, nodeId);
    }
  }

  override execute(context: CommandContext): void {
    this.apply(context, this.newPortId, this.newNodeId);
  }

  override undo(context: CommandContext): void {
    this.apply(context, this.oldPortId, this.oldNodeId);
  }

  override serialize(): SerializedCommand {
    return {
      id: this.id,
      name: this.name,
      timestamp: this.timestamp,
      data: {
        linkId: this.linkId,
        endpoint: this.endpoint,
        newPortId: this.newPortId,
        newNodeId: this.newNodeId,
        oldPortId: this.oldPortId,
        oldNodeId: this.oldNodeId,
      },
    };
  }
}
