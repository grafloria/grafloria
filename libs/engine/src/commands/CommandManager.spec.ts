// CommandManager undo-stack correctness (wave14/commands)
//
// Pins the four history-integrity contracts this manager must uphold:
//  1. a command whose execute() THREW never enters history — Ctrl+Z must never
//     "undo" a mutation that never happened,
//  2. a strict-validation failure reverts THE COMMAND THAT FAILED, leaving the
//     previous (valid) command applied, in history, and undoable,
//  3. the merge path only rewrites the history entry AFTER the merged command
//     re-executed successfully — and strict validation guards it too,
//  4. endBatch() commits the queued commands as ONE BatchCommand through the
//     normal execute() path: one history entry, one undo step.

import { DiagramModel } from '../models/DiagramModel';
import { NodeModel } from '../models/NodeModel';
import { Command, CommandContext, SerializedCommand } from './Command';
import { CommandManager } from './CommandManager';
import { AddNodeCommand } from './basic/AddNodeCommand';
import { MoveNodeCommand } from './basic/MoveNodeCommand';
import { BatchCommand } from './composite/BatchCommand';
import { DiagramEventTypes } from '../types/event.types';

/** A command that can be told to explode, and counts what actually ran. */
class ProbeCommand extends Command {
  executed = 0;
  undone = 0;

  constructor(
    name = 'Probe',
    private readonly opts: { throwOnExecute?: boolean } = {}
  ) {
    super(name);
  }

  override execute(): void {
    if (this.opts.throwOnExecute) {
      throw new Error(`${this.name} exploded`);
    }
    this.executed++;
  }

  override undo(): void {
    this.undone++;
  }

  override serialize(): SerializedCommand {
    return { id: this.id, name: this.name, timestamp: this.timestamp, data: {} };
  }
}

/**
 * A mergeable set-to-value command over a plain object, mirroring the
 * MoveNodeCommand merge contract: the merged command keeps the ORIGINAL
 * before-value, so undoing the merged command restores the pre-first state.
 */
class SetValueCommand extends Command {
  private before?: number;

  constructor(
    private readonly target: { value: number },
    readonly next: number,
    private readonly opts: { throwOnExecute?: boolean; mergedThrows?: boolean } = {},
    before?: number
  ) {
    super(`Set value ${next}`);
    if (before !== undefined) this.before = before;
  }

  override execute(): void {
    if (this.opts.throwOnExecute) {
      throw new Error(`${this.name} exploded`);
    }
    if (this.before === undefined) {
      this.before = this.target.value;
    }
    this.target.value = this.next;
  }

  override undo(): void {
    if (this.before === undefined) {
      throw new Error('Cannot undo: never executed');
    }
    this.target.value = this.before;
  }

  override canMergeWith(other: Command): boolean {
    return other instanceof SetValueCommand;
  }

  override mergeWith(other: Command): Command {
    const incoming = other as SetValueCommand;
    return new SetValueCommand(
      this.target,
      incoming.next,
      { throwOnExecute: incoming.opts.mergedThrows },
      this.before
    );
  }

  override serialize(): SerializedCommand {
    return { id: this.id, name: this.name, timestamp: this.timestamp, data: { next: this.next } };
  }
}

/** Minimal engine stub exposing exactly what CommandManager consults. */
const makeStrictEngine = (isValid: () => boolean) => ({
  isRealTimeValidationEnabled: () => true,
  getConfig: () => ({ validation: { realTime: true, strict: true } }),
  validateDiagram: jest.fn(() =>
    isValid()
      ? { valid: true, errors: [], warnings: [] }
      : { valid: false, errors: [{ message: 'invalid by test' }], warnings: [] }
  ),
});

describe('CommandManager — undo-stack correctness (wave14)', () => {
  let diagram: DiagramModel;
  let context: CommandContext;
  let manager: CommandManager;

  beforeEach(() => {
    diagram = new DiagramModel();
    context = {
      diagram,
      eventBus: { emit: jest.fn() },
      store: new Map(),
    };
    manager = new CommandManager(context, context.eventBus);
  });

  describe('history on throw (defect 1)', () => {
    it('a command whose execute() throws NEVER enters history', async () => {
      const failing = new ProbeCommand('Failing', { throwOnExecute: true });

      await expect(manager.execute(failing)).rejects.toThrow('Failing exploded');

      expect(manager.getHistory().length).toBe(0);
      expect(manager.canUndo()).toBe(false);
    });

    it('COMMAND_FAILED is still emitted for the throwing command', async () => {
      const failing = new ProbeCommand('Failing', { throwOnExecute: true });

      await expect(manager.execute(failing)).rejects.toThrow();

      expect(context.eventBus.emit).toHaveBeenCalledWith(
        DiagramEventTypes.COMMAND_FAILED,
        expect.objectContaining({ command: failing })
      );
    });

    it('undo after a failed command reverts the last SUCCESSFUL command, not the failed one', async () => {
      const node = new NodeModel({ type: 'rect', position: { x: 0, y: 0 } });
      diagram.addNode(node);

      const good = new MoveNodeCommand(node.id, { x: 100, y: 100 });
      await manager.execute(good);
      expect(node.position).toEqual(expect.objectContaining({ x: 100, y: 100 }));

      const failing = new ProbeCommand('Failing', { throwOnExecute: true });
      await expect(manager.execute(failing)).rejects.toThrow();

      // History holds exactly the command that ran.
      expect(manager.getHistory().length).toBe(1);
      expect(manager.getHistory()[0]!.command).toBe(good);

      await manager.undo();

      expect(failing.undone).toBe(0); // the failed command was never "undone"
      expect(node.position).toEqual(expect.objectContaining({ x: 0, y: 0 }));
      expect(manager.canUndo()).toBe(false);
    });
  });

  describe('strict-validation failure (defect 2)', () => {
    it('reverts the FAILED command only; the previous command stays applied and undoable', async () => {
      const node = new NodeModel({ type: 'rect', position: { x: 0, y: 0 } });
      diagram.addNode(node);

      // Strict engine that rejects the diagram whenever the node sits at x=999.
      context.engine = makeStrictEngine(() => node.position.x !== 999);
      manager.updateContext({ engine: context.engine });
      manager.setMergingEnabled(false); // two moves of one node would merge

      const goodMove = new MoveNodeCommand(node.id, { x: 10, y: 10 });
      await manager.execute(goodMove);
      expect(node.position).toEqual(expect.objectContaining({ x: 10, y: 10 }));

      const badMove = new MoveNodeCommand(node.id, { x: 999, y: 999 });
      await expect(manager.execute(badMove)).rejects.toThrow('Command validation failed');

      // The invalid mutation was reverted — back to the last VALID state.
      expect(node.position).toEqual(expect.objectContaining({ x: 10, y: 10 }));

      // The previous good command is still the (only) history top.
      expect(manager.getHistory().length).toBe(1);
      expect(manager.getHistory()[0]!.command).toBe(goodMove);
      expect(manager.canUndo()).toBe(true);

      await manager.undo();
      expect(node.position).toEqual(expect.objectContaining({ x: 0, y: 0 }));
    });
  });

  describe('merge path (defect 3)', () => {
    it('merging still coalesces two commands into ONE entry whose undo restores the pre-first state', async () => {
      const target = { value: 0 };

      await manager.execute(new SetValueCommand(target, 5));
      await manager.execute(new SetValueCommand(target, 9));

      expect(target.value).toBe(9);
      expect(manager.getHistory().length).toBe(1);
      expect(manager.getHistory()[0]!.command.name).toBe('Set value 9');

      await manager.undo();
      expect(target.value).toBe(0);
    });

    it('a merged re-execution that THROWS leaves the original entry in history', async () => {
      const target = { value: 0 };

      const first = new SetValueCommand(target, 5);
      await manager.execute(first);

      // Merging this one produces a merged command whose execute() throws.
      const second = new SetValueCommand(target, 9, { mergedThrows: true });
      await expect(manager.execute(second)).rejects.toThrow('exploded');

      // History still describes what is actually applied: the FIRST command.
      expect(manager.getHistory().length).toBe(1);
      expect(manager.getHistory()[0]!.command).toBe(first);
      expect(target.value).toBe(5);

      await manager.undo();
      expect(target.value).toBe(0);
    });

    it('strict validation guards merged re-executions too, and reverts to the last valid state', async () => {
      const target = { value: 0 };
      context.engine = makeStrictEngine(() => target.value !== 9);
      manager.updateContext({ engine: context.engine });

      const first = new SetValueCommand(target, 5);
      await manager.execute(first);

      const second = new SetValueCommand(target, 9);
      await expect(manager.execute(second)).rejects.toThrow('Command validation failed');

      // Back to the post-first (last valid) state, first still applied + undoable.
      expect(target.value).toBe(5);
      expect(manager.getHistory().length).toBe(1);
      expect(manager.getHistory()[0]!.command).toBe(first);

      await manager.undo();
      expect(target.value).toBe(0);
    });
  });

  describe('endBatch (defect 4)', () => {
    it('commits the queue as ONE BatchCommand: one history entry, one undo step', async () => {
      const n1 = new NodeModel({ type: 'rect', position: { x: 0, y: 0 } });
      const n2 = new NodeModel({ type: 'rect', position: { x: 100, y: 0 } });

      manager.beginBatch();
      await manager.execute(new AddNodeCommand(n1));
      await manager.execute(new AddNodeCommand(n2));
      expect(diagram.getNodes().length).toBe(0); // queued, not applied

      await manager.endBatch('Add two nodes');

      expect(diagram.getNodes().length).toBe(2);
      expect(manager.getHistory().length).toBe(1);
      const entry = manager.getHistory()[0]!;
      expect(entry.command).toBeInstanceOf(BatchCommand);
      expect(entry.command.name).toBe('Add two nodes');

      await manager.undo();
      expect(diagram.getNodes().length).toBe(0);
      expect(manager.canUndo()).toBe(false);

      await manager.redo();
      expect(diagram.getNodes().length).toBe(2);
    });

    it('undoes the batch in REVERSE order of execution', async () => {
      const target = { value: 0 };

      manager.beginBatch();
      await manager.execute(new SetValueCommand(target, 5));
      await manager.execute(new SetValueCommand(target, 9));
      await manager.endBatch();

      expect(target.value).toBe(9);

      // Reverse order: Set9.undo → 5, then Set5.undo → 0. Forward order
      // would land on 5 — the tell-tale of a forward-looping undo.
      await manager.undo();
      expect(target.value).toBe(0);
    });

    it('an empty batch adds nothing to history', async () => {
      manager.beginBatch();
      await manager.endBatch();

      expect(manager.getHistory().length).toBe(0);
      expect(manager.canUndo()).toBe(false);
    });
  });
});
