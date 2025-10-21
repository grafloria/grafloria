// MacroCommand - Named sequence of commands that can be recorded and replayed

import { Command, CommandContext, SerializedCommand } from '../Command';

export interface MacroStep {
  command: Command;
  delay?: number; // Delay before executing this step (ms)
}

export class MacroCommand extends Command {
  private steps: MacroStep[] = [];

  constructor(name: string) {
    super(name);
  }

  /**
   * Add step to macro
   */
  addStep(command: Command, delay?: number): void {
    this.steps.push({ command, delay });
  }

  /**
   * Add multiple steps
   */
  addSteps(commands: Command[]): void {
    commands.forEach((cmd) => this.addStep(cmd));
  }

  async execute(context: CommandContext): Promise<void> {
    for (const step of this.steps) {
      if (step.delay) {
        await this.sleep(step.delay);
      }
      await step.command.execute(context);
    }
  }

  async undo(context: CommandContext): Promise<void> {
    // Undo in reverse order
    for (let i = this.steps.length - 1; i >= 0; i--) {
      const step = this.steps[i];
      if (step) {
        await step.command.undo(context);
      }
    }
  }

  override canExecute(context: CommandContext): boolean {
    return this.steps.every((step) => step.command.canExecute(context));
  }

  override canUndo(context: CommandContext): boolean {
    return this.steps.every((step) => step.command.canUndo(context));
  }

  override serialize(): SerializedCommand {
    return {
      id: this.id,
      name: this.name,
      timestamp: this.timestamp,
      data: {
        steps: this.steps.map((step) => ({
          command: step.command.serialize(),
          delay: step.delay,
        })),
      },
    };
  }

  override getDescription(): string {
    return `${this.name} (${this.steps.length} steps)`;
  }

  /**
   * Get all steps in macro
   */
  getSteps(): ReadonlyArray<MacroStep> {
    return [...this.steps];
  }

  /**
   * Clear all steps
   */
  clear(): void {
    this.steps = [];
  }

  /**
   * Sleep utility for delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
