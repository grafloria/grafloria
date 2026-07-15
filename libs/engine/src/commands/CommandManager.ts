// CommandManager - Manages command execution, undo, and redo

import { Command, CommandContext } from './Command';
import { BatchCommand } from './composite/BatchCommand';
import { EventBus } from '../events/EventBus';
import { DiagramEventTypes } from '../types/event.types';

export interface CommandHistoryEntry {
  command: Command;
  timestamp: number;
  duration: number;
  /**
   * Wave 14: history only ever records commands that EXECUTED successfully, so
   * this is always `true` and `error` is never set. Both fields survive purely
   * for API compatibility — a command that throws (or fails strict validation)
   * no longer enters history at all, because canUndo()/undo() never consulted
   * these flags and would happily "undo" a mutation that never happened.
   */
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
        await this.executeMerged(lastEntry, command);
        return;
      }
    }

    // Execute command
    const startTime = performance.now();

    try {
      await this.executeCommand(command);
      // Real-time validation (Phase 1 - Critical Fixes). In strict mode an
      // invalid result reverts THIS command and throws — see assertResultValid.
      await this.assertResultValid(() => command.undo(this.context));
    } catch (e) {
      this.eventBus.emit(DiagramEventTypes.COMMAND_FAILED, {
        command,
        duration: performance.now() - startTime,
        error: e as Error,
      });
      throw e;
    }

    const duration = performance.now() - startTime;

    // Only a command that EXECUTED (and validated) may enter history. A thrown
    // execute() used to land here anyway — via a `finally` — leaving Ctrl+Z
    // pointing at a mutation that never happened.
    this.addToHistory({
      command,
      timestamp: Date.now(),
      duration,
      success: true,
    });

    this.eventBus.emit(DiagramEventTypes.COMMAND_EXECUTED, {
      command,
      duration,
    });
  }

  /**
   * Merge `incoming` into the previous history entry and re-execute (wave 14).
   *
   * Order matters: the merged command EXECUTES FIRST and only then replaces the
   * entry's command — the old code overwrote the entry BEFORE re-executing, so
   * a throwing merged execution left history claiming the merged command was
   * applied.
   *
   * Strict validation applies here too — deliberately NOT skipped: had
   * `incoming` not merged, the normal path would have validated this exact
   * terminal state (mergeable commands are set-to-value, so executing the
   * merged command lands exactly where executing `incoming` on top of
   * `previous` would have). Merging is a history-compression detail and must
   * not double as a validation bypass. The revert is two steps because a
   * merged command keeps the ORIGINAL before-state (see MoveNodeCommand):
   * merged.undo() rewinds PAST `previous`, so previous.redo() then re-applies
   * the last valid state, leaving the history entry untouched.
   */
  private async executeMerged(lastEntry: CommandHistoryEntry, incoming: Command): Promise<void> {
    const previous = lastEntry.command;
    const merged = previous.mergeWith(incoming);

    const startTime = performance.now();

    try {
      await this.executeCommand(merged);
      await this.assertResultValid(async () => {
        await merged.undo(this.context);
        await previous.redo(this.context);
      });
    } catch (e) {
      // History untouched: the entry still describes `previous`, which IS
      // what remains applied.
      this.eventBus.emit(DiagramEventTypes.COMMAND_FAILED, {
        command: merged,
        duration: performance.now() - startTime,
        error: e as Error,
      });
      throw e;
    }

    lastEntry.command = merged;
    lastEntry.timestamp = Date.now();
    this.eventBus.emit(DiagramEventTypes.COMMAND_MERGED, { command: merged });
  }

  /**
   * Real-time validation of the diagram AFTER a command executed (wave 14).
   *
   * In strict mode an invalid diagram runs `revert` — which must undo exactly
   * the just-executed command — and throws. It must NOT call this.undo(): the
   * failing command is not in history (yet), so undo() would revert the
   * PREVIOUS entry and decrement currentIndex, which is precisely the old
   * triple corruption (previous good command reverted, then permanently erased
   * by addToHistory's redo-truncation, failed command left as the undoable top).
   */
  private async assertResultValid(revert: () => void | Promise<void>): Promise<void> {
    const engine = this.context.engine;
    if (!engine) return;
    if (!(engine.isRealTimeValidationEnabled && engine.isRealTimeValidationEnabled())) return;

    const config = engine.getConfig && engine.getConfig();
    const strict = config?.validation?.strict || false;
    const validationResult = engine.validateDiagram({ strict });

    if (!validationResult.valid && strict) {
      await revert();
      throw new Error(`Command validation failed: ${validationResult.errors[0]?.message}`);
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
   * End batch mode: commit the queued commands as ONE BatchCommand through the
   * normal execute() path (wave 14) — one history entry, one undo step (with
   * reverse-order undo), and the same strict-validation gate as any other
   * command. The old code looped executeCommand() directly, so a "batch"
   * mutated the diagram while building NO history at all.
   *
   * Note BatchCommand's existing gate contract: its canExecute() checks every
   * queued command against the CURRENT (pre-batch) state, so a queue whose
   * later commands only become executable after earlier ones ran is refused
   * up front rather than applied halfway.
   */
  async endBatch(name: string = 'Batch Operation'): Promise<void> {
    this.batchMode = false;

    // Guarded here as well as in execute(): the refusal must clear the queue
    // and announce phase 'batch', which execute()'s generic guard would not.
    // A batch opened before the document was locked and flushed after would
    // otherwise replay every queued command straight through the lock.
    if (this.isReadonly()) {
      this.batchCommands = [];
      this.eventBus.emit('command:refused', { reason: 'readonly', phase: 'batch' });
      return;
    }

    if (this.batchCommands.length === 0) {
      return;
    }

    const commands = [...this.batchCommands];
    this.batchCommands = [];

    await this.execute(new BatchCommand(name, commands));
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
