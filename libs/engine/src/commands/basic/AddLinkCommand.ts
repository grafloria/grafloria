// AddLinkCommand - Adds a link to the diagram

import { Command, CommandContext, SerializedCommand } from '../Command';
import { LinkModel, SerializedLink } from '../../models/LinkModel';

export class AddLinkCommand extends Command {
  private linkData: SerializedLink;

  constructor(private link: LinkModel) {
    super('Add Link');
    this.linkData = link.serialize();
  }

  override execute(context: CommandContext): void {
    const diagram = context.diagram;
    if (!diagram) {
      throw new Error('Diagram not found in context');
    }

    // Restore link from serialized data
    const link = LinkModel.fromJSON(this.linkData);
    diagram.addLink(link);
  }

  override undo(context: CommandContext): void {
    const diagram = context.diagram;
    if (!diagram) {
      throw new Error('Diagram not found in context');
    }

    diagram.removeLink(this.linkData.id);
  }

  override canExecute(context: CommandContext): boolean {
    return context.diagram && !context.diagram.links.has(this.linkData.id);
  }

  override canUndo(context: CommandContext): boolean {
    return context.diagram && context.diagram.links.has(this.linkData.id);
  }

  override serialize(): SerializedCommand {
    return {
      id: this.id,
      name: this.name,
      timestamp: this.timestamp,
      data: {
        link: this.linkData,
      },
    };
  }

  override getDescription(): string {
    return `Add link from ${this.linkData.sourcePortId} to ${this.linkData.targetPortId}`;
  }
}
