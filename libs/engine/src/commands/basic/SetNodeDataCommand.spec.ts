// T9 — shape data as an undoable, per-key edit.

import { DiagramModel } from '../../models/DiagramModel';
import { NodeModel } from '../../models/NodeModel';
import { CommandContext } from '../Command';
import { SetNodeDataCommand } from './SetNodeDataCommand';

describe('SetNodeDataCommand', () => {
  let diagram: DiagramModel;
  let context: CommandContext;

  const add = (id: string, data?: Record<string, unknown>) => {
    const n = new NodeModel({ id, type: 'box', position: { x: 0, y: 0 } });
    for (const [k, v] of Object.entries(data ?? {})) n.setData(k, v);
    diagram.addNode(n);
    return n;
  };

  beforeEach(() => {
    diagram = new DiagramModel();
    context = { diagram, eventBus: { emit: jest.fn() } } as unknown as CommandContext;
  });

  it('writes the given keys and undoes back to the previous values', () => {
    const n = add('a', { owner: 'ops', sla: 3 });
    const cmd = new SetNodeDataCommand('a', { owner: 'finance' });

    cmd.execute(context);
    expect(n.getData('owner')).toBe('finance');
    expect(n.getData('sla')).toBe(3); // untouched keys are left alone

    cmd.undo(context);
    expect(n.getData('owner')).toBe('ops');
    expect(n.getData('sla')).toBe(3);
  });

  it('REMOVES a key on undo when the command invented it', () => {
    const n = add('a', { owner: 'ops' });
    const cmd = new SetNodeDataCommand('a', { priority: 'high' });

    cmd.execute(context);
    expect(n.getData('priority')).toBe('high');

    cmd.undo(context);
    // Not `undefined` — the key must be gone, or it serializes and syncs as a value.
    expect(Object.prototype.hasOwnProperty.call(n.data ?? {}, 'priority')).toBe(false);
  });

  it('edits a whole selection as ONE undo entry, each with its own snapshot', () => {
    const a = add('a', { stage: 'draft' });
    const b = add('b', { stage: 'review' });
    const cmd = new SetNodeDataCommand(['a', 'b'], { stage: 'done' });

    cmd.execute(context);
    expect(a.getData('stage')).toBe('done');
    expect(b.getData('stage')).toBe('done');

    cmd.undo(context);
    expect(a.getData('stage')).toBe('draft');   // different prior values, each restored
    expect(b.getData('stage')).toBe('review');
  });

  it('survives execute → undo → redo → undo', () => {
    const n = add('a', { owner: 'ops' });
    const cmd = new SetNodeDataCommand('a', { owner: 'finance' });

    cmd.execute(context);
    cmd.undo(context);
    cmd.execute(context);
    expect(n.getData('owner')).toBe('finance');
    cmd.undo(context);
    expect(n.getData('owner')).toBe('ops');
  });

  it('is atomic — a missing node refuses the whole write', () => {
    const a = add('a', { stage: 'draft' });
    const cmd = new SetNodeDataCommand(['a', 'ghost'], { stage: 'done' });
    expect(() => cmd.execute(context)).toThrow();
    expect(a.getData('stage')).toBe('draft'); // nothing was half-applied
  });

  it('guards: needs at least one node and one key', () => {
    add('a');
    expect(new SetNodeDataCommand([], { k: 1 }).canExecute(context)).toBe(false);
    expect(new SetNodeDataCommand('a', {}).canExecute(context)).toBe(false);
    expect(new SetNodeDataCommand('a', { k: 1 }).canExecute(context)).toBe(true);
  });
});
