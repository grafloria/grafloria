// CommandManager - Manages command execution, undo, and redo

import { Command, CommandContext } from './Command';
import { EventBus } from '../events/EventBus';
import { DiagramEventTypes } from '../types/event.types';

export interface CommandHistoryEntry {
  command: Command;
  timestamp: number;
  duration: number;
  success: boolean;
  error?: Error;
}

export class CommandManager {
  private history: CommandHistoryEntry[] = [];
  private currentIndex: number = -1;
  private maxHistorySize: number = 100;
  private batchMode: boolean = false;
  private batchCommands: Command[] = [];
  private mergingEnabled: boolean = true;
  private mergingWindow: number = 500; // ms

  constructor(
    private context: CommandContext,
    private eventBus: EventBus = context.eventBus
  ) {}

  /**
   * Wave 9 — Card 7. Is the document locked against edits?
   *
   * THE choke point for every command-shaped mutation. It matters far more than it
   * looks, because these all funnel through here:
   *   - clipboard: Paste / Cut / Duplicate commands (and `engine.paste()` etc.)
   *   - the Wave-6 a11y keyboard layer, which is a pure COMMAND FACTORY — it
   *     returns `Command | null` and never executes, so refusing here refuses
   *     keyboard delete / nudge / duplicate / connect in one place
   *   - `ext/public-api.ts`, the extension escape hatch
   *
   * `context.diagram` is typed `any` on CommandContext, hence the defensive probe.
   */
  private isReadonly(): boolean {
    return this.context?.diagram?.blocksDocumentWrite?.() === true;
  }

  /**
   * Execute a command
   */
  async execute(command: Command): Promise<void> {
    // Refused BEFORE canExecute so a command cannot mutate anything in its own
    // permission check, and before the merge path below — a merged command
    // re-executes, which would otherwise be a hole straight through the lock.
    if (this.isReadonly()) {
      this.eventBus.emit('command:refused', { command, reason: 'readonly' });
      return;
    }

    if (!command.canExecute(this.context)) {
      throw new Error(`Cannot execute command: ${command.name}`);
    }

    if (this.batchMode) {
      this.batchCommands.push(command);
      return;
    }

    // Try to merge with previous command
    if (this.mergingEnabled && this.canMergeWithPrevious(command)) {
      const lastEntry = this.history[this.currentIndex];
      if (lastEntry) {
        const merged = lastEntry.command.mergeWith(command);
        lastEntry.command = merged;
        lastEntry.timestamp = Date.now();

        // Re-execute merged command
        await this.executeCommand(merged);
        this.eventBus.emit(DiagramEventTypes.COMMAND_MERGED, { command: merged });
        return;
      }
    }

    // Execute command
    const startTime = performance.now();
    let success = false;
    let error: Error | undefined;

    try {
      await this.executeCommand(command);
      success = true;

      // Real-time validation (Phase 1 - Critical Fixes)
      if (success && this.context.engine) {
        const engine = this.context.engine;
        if (engine.isRealTimeValidationEnabled && engine.isRealTimeValidationEnabled()) {
          const config = engine.getConfig && engine.getConfig();
          const validationResult = engine.validateDiagram({ strict: config?.validation?.strict || false });

          // If validation fails in strict mode, undo the command
          if (!validationResult.valid && config?.validation?.strict) {
            await this.undo();
            throw new Error(`Command validation failed: ${validationResult.errors[0]?.message}`);
          }
        }
      }
    } catch (e) {
      error = e as Error;
      success = false;
      throw e;
    } finally {
      const duration = performance.now() - startTime;

      // Add to history
      this.addToHistory({
        command,
        timestamp: Date.now(),
        duration,
        success,
        error,
      });

      // Emit event
      this.eventBus.emit(success ? DiagramEventTypes.COMMAND_EXECUTED : DiagramEventTypes.COMMAND_FAILED, {
        command,
        duration,
        error,
      });
    }
  }

  /**
   * Undo last command
   */
  async undo(): Promise<void> {
    // Undo is a MUTATION and it bypasses executeCommand() entirely (it calls
    // command.undo() directly), so it needs its own guard — gating execute()
    // alone would leave undo/redo as a wide-open door into a locked document.
    if (this.isReadonly()) {
      this.eventBus.emit('command:refused', { reason: 'readonly', phase: 'undo' });
      return;
    }

    if (!this.canUndo()) {
      return;
    }

    const entry = this.history[this.currentIndex];
    if (!entry) return;

    const command = entry.command;

    if (!command.canUndo(this.context)) {
      throw new Error(`Cannot undo command: ${command.name}`);
    }

    const startTime = performance.now();

    try {
      await command.undo(this.context);
      this.currentIndex--;

      const duration = performance.now() - startTime;

      this.eventBus.emit(DiagramEventTypes.COMMAND_UNDONE, {
        command,
        duration,
      });
    } catch (error) {
      this.eventBus.emit(DiagramEventTypes.COMMAND_FAILED, {
        command,
        action: 'undo',
        error,
      });
      throw error;
    }
  }

  /**
   * Redo command
   */
  async redo(): Promise<void> {
    if (this.isReadonly()) {
      this.eventBus.emit('command:refused', { reason: 'readonly', phase: 'redo' });
      return;
    }

    if (!this.canRedo()) {
      return;
    }

    this.currentIndex++;
    const entry = this.history[this.currentIndex];
    if (!entry) return;

    const command = entry.command;

    const startTime = performance.now();

    try {
      await command.redo(this.context);

      const duration = performance.now() - startTime;

      this.eventBus.emit(DiagramEventTypes.COMMAND_REDONE, {
        command,
        duration,
      });
    } catch (error) {
      this.currentIndex--;
      this.eventBus.emit(DiagramEventTypes.COMMAND_FAILED, {
        command,
        action: 'redo',
        error,
      });
      throw error;
    }
  }

  /**
   * Begin batch mode
   */
  beginBatch(): void {
    this.batchMode = true;
    this.batchCommands = [];
  }

  /**
   * End batch mode and execute batched commands
   */
  async endBatch(name: string = 'Batch Operation'): Promise<void> {
    this.batchMode = false;

    // endBatch calls executeCommand() DIRECTLY, so it needs its own guard: a batch
    // opened before the document was locked and flushed after would otherwise
    // replay every queued command straight through the lock.
    if (this.isReadonly()) {
      this.batchCommands = [];
      this.eventBus.emit('command:refused', { reason: 'readonly', phase: 'batch' });
      return;
    }

    if (this.batchCommands.length === 0) {
      return;
    }

    // For now, execute commands sequentially
    // Will implement BatchCommand in the composite commands phase
    const commands = [...this.batchCommands];
    this.batchCommands = [];

    for (const cmd of commands) {
      await this.executeCommand(cmd);
    }
  }

  /**
   * Cancel batch
   */
  cancelBatch(): void {
    this.batchMode = false;
    this.batchCommands = [];
  }

  /**
   * Clear history
   */
  clear(): void {
    this.history = [];
    this.currentIndex = -1;
    this.eventBus.emit(DiagramEventTypes.COMMAND_HISTORY_CLEARED);
  }

  /**
   * Can undo
   */
  canUndo(): boolean {
    return this.currentIndex >= 0;
  }

  /**
   * Can redo
   */
  canRedo(): boolean {
    return this.currentIndex < this.history.length - 1;
  }

  /**
   * Get history
   */
  getHistory(): ReadonlyArray<CommandHistoryEntry> {
    return [...this.history];
  }

  /**
   * Get undo stack
   */
  getUndoStack(): ReadonlyArray<Command> {
    return this.history.slice(0, this.currentIndex + 1).map((e) => e.command);
  }

  /**
   * Get redo stack
   */
  getRedoStack(): ReadonlyArray<Command> {
    return this.history.slice(this.currentIndex + 1).map((e) => e.command);
  }

  /**
   * Set max history size
   */
  setMaxHistorySize(size: number): void {
    this.maxHistorySize = size;
    this.trimHistory();
  }

  /**
   * Enable/disable merging
   */
  setMergingEnabled(enabled: boolean): void {
    this.mergingEnabled = enabled;
  }

  /**
   * Set merging window
   */
  setMergingWindow(milliseconds: number): void {
    this.mergingWindow = milliseconds;
  }

  /**
   * Update command context
   */
  updateContext(updates: Partial<CommandContext>): void {
    this.context = { ...this.context, ...updates };
  }

  /**
   * Execute command without adding to history
   */
  private async executeCommand(command: Command): Promise<void> {
    await command.execute(this.context);
  }

  /**
   * Add command to history
   */
  private addToHistory(entry: CommandHistoryEntry): void {
    // Remove any redo history
    if (this.currentIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.currentIndex + 1);
    }

    // Add new entry
    this.history.push(entry);
    this.currentIndex++;

    // Trim if needed
    this.trimHistory();
  }

  /**
   * Trim history to max size
   */
  private trimHistory(): void {
    if (this.history.length > this.maxHistorySize) {
      const removeCount = this.history.length - this.maxHistorySize;
      this.history = this.history.slice(removeCount);
      this.currentIndex -= removeCount;
    }
  }

  /**
   * Check if can merge with previous command
   */
  private canMergeWithPrevious(command: Command): boolean {
    if (this.currentIndex < 0) {
      return false;
    }

    const lastEntry = this.history[this.currentIndex];
    if (!lastEntry) return false;

    const lastCommand = lastEntry.command;

    // Check time window
    const timeDiff = Date.now() - lastEntry.timestamp;
    if (timeDiff > this.mergingWindow) {
      return false;
    }

    // Check if commands can merge
    return lastCommand.canMergeWith(command);
  }
}
