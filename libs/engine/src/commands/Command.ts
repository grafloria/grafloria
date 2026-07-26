// Command interface for undo/redo system

import { generateId } from '../utils';

// Forward declarations - will be defined when we create these classes
export interface CommandContext {
  diagram: any; // DiagramModel
  eventBus: any; // EventBus
  store?: any; // DiagramStore
  engine?: any; // DiagramEngine
}

export interface SerializedCommand {
  id: string;
  name: string;
  timestamp: number;
  data: any;
}

export abstract class Command {
  readonly id: string;
  readonly name: string;
  readonly timestamp: number;

  constructor(name: string) {
    this.id = generateId();
    this.name = name;
    this.timestamp = Date.now();
  }

  /**
   * Execute the command
   */
  abstract execute(context: CommandContext): void | Promise<void>;

  /**
   * Undo the command
   */
  abstract undo(context: CommandContext): void | Promise<void>;

  /**
   * Redo the command (default: re-execute)
   */
  redo(context: CommandContext): void | Promise<void> {
    return this.execute(context);
  }

  /**
   * Check if command can be executed
   */
  canExecute(context: CommandContext): boolean {
    return true;
  }

  /**
   * Check if command can be undone
   */
  canUndo(context: CommandContext): boolean {
    return true;
  }

  /**
   * Does this command belong on the undo stack AT ALL?
   *
   * `canUndo(context)` is a state probe ("can I undo RIGHT NOW?") consulted at
   * undo time — many commands answer it from live diagram state. This is the
   * static declaration consulted at EXECUTE time: a non-mutating command
   * (Copy) answers false and never enters history. Recording one used to
   * poison the stack — undo() hit the entry, threw "Cannot undo command:
   * Copy", never decremented the index, and everything behind it became
   * permanently unreachable.
   */
  isUndoable(): boolean {
    return true;
  }

  /**
   * Check if can merge with another command
   */
  canMergeWith(other: Command): boolean {
    return false;
  }

  /**
   * Merge with another command
   */
  mergeWith(other: Command): Command {
    throw new Error('Merge not supported');
  }

  /**
   * Serialize command
   */
  abstract serialize(): SerializedCommand;

  /**
   * Get description for UI
   */
  getDescription(): string {
    return this.name;
  }
}
