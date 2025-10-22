// BatchCommand - Executes multiple commands as a single operation

import { Command, CommandContext, SerializedCommand } from '../Command';

export class BatchCommand extends Command {
  constructor(
    name: string,
    private commands: Command[]
  ) {
    super(name);
  }

  async execute(context: CommandContext): Promise<void> {
    for (const command of this.commands) {
      await command.execute(context);
    }
  }

  async undo(context: CommandContext): Promise<void> {
    // Undo in reverse order
    for (let i = this.commands.length - 1; i >= 0; i--) {
      await this.commands[i]?.undo(context);
    }
  }

  override canExecute(context: CommandContext): boolean {
    return this.commands.every((cmd) => cmd.canExecute(context));
  }

  override canUndo(context: CommandContext): boolean {
    return this.commands.every((cmd) => cmd.canUndo(context));
  }

  override serialize(): SerializedCommand {
    return {
      id: this.id,
      name: this.name,
      timestamp: this.timestamp,
      data: {
        commands: this.commands.map((cmd) => cmd.serialize()),
      },
    };
  }

  override getDescription(): string {
    return `${this.name} (${this.commands.length} operations)`;
  }

  /**
   * Get all commands in batch
   */
  getCommands(): ReadonlyArray<Command> {
    return [...this.commands];
  }

  /**
   * Add command to batch
   */
  addCommand(command: Command): void {
    this.commands.push(command);
  }
}
