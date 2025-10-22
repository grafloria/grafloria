// RemoveLinkCommand - Removes a link from the diagram

import { Command, CommandContext, SerializedCommand } from '../Command';
import { LinkModel, SerializedLink } from '../../models/LinkModel';

export class RemoveLinkCommand extends Command {
  private linkData?: SerializedLink;

  constructor(private linkId: string) {
    super('Remove Link');
  }

  override execute(context: CommandContext): void {
    const diagram = context.diagram;
    if (!diagram) {
      throw new Error('Diagram not found in context');
    }

    const link = diagram.getLink(this.linkId);
    if (!link) {
      throw new Error(`Link ${this.linkId} not found`);
    }

    // Save link data for undo
    this.linkData = link.serialize();

    // Remove link
    diagram.removeLink(this.linkId);
  }

  override undo(context: CommandContext): void {
    const diagram = context.diagram;
    if (!diagram || !this.linkData) {
      throw new Error('Cannot undo: missing diagram or link data');
    }

    // Restore link
    const link = LinkModel.fromJSON(this.linkData);
    diagram.addLink(link);
  }

  override canExecute(context: CommandContext): boolean {
    return context.diagram && context.diagram.links.has(this.linkId);
  }

  override canUndo(context: CommandContext): boolean {
    return context.diagram && !!this.linkData;
  }

  override serialize(): SerializedCommand {
    return {
      id: this.id,
      name: this.name,
      timestamp: this.timestamp,
      data: {
        linkId: this.linkId,
        linkData: this.linkData,
      },
    };
  }

  override getDescription(): string {
    return `Remove link ${this.linkId}`;
  }
}
