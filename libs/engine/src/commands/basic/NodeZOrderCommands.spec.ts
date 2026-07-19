// C — the undoable command surface for node z-order.

import { DiagramModel } from '../../models/DiagramModel';
import { NodeModel } from '../../models/NodeModel';
import { CommandContext } from '../Command';
import {
  SetNodeZIndexCommand,
  BringNodeToFrontCommand,
  SendNodeToBackCommand,
} from './NodeZOrderCommands';

describe('Node z-order commands', () => {
  let diagram: DiagramModel;
  let context: CommandContext;

  beforeEach(() => {
    diagram = new DiagramModel();
    context = { diagram, eventBus: { emit: jest.fn() } } as unknown as CommandContext;
    for (const id of ['a', 'b', 'c']) {
      diagram.addNode(new NodeModel({ id, type: 'box', position: { x: 0, y: 0 } }));
    }
  });

  it('SetNodeZIndexCommand sets, and undoes back to UNSET', () => {
    const a = diagram.getNode('a')!;
    const cmd = new SetNodeZIndexCommand('a', 5);

    cmd.execute(context);
    expect(a.zIndex).toBe(5);

    cmd.undo(context);
    expect(a.zIndex).toBeUndefined();

    cmd.execute(context);
    expect(a.zIndex).toBe(5);
  });

  it('SetNodeZIndexCommand undoes back to a PREVIOUS explicit value', () => {
    const a = diagram.getNode('a')!;
    a.setZIndex(2);

    const cmd = new SetNodeZIndexCommand('a', 5);
    cmd.execute(context);
    cmd.undo(context);

    expect(a.zIndex).toBe(2);
  });

  it('BringNodeToFrontCommand lifts above the stack and undoes', () => {
    const b = diagram.getNode('b')!;
    const c = diagram.getNode('c')!;
    b.setZIndex(4);

    const cmd = new BringNodeToFrontCommand('c');
    cmd.execute(context);
    expect(c.getEffectiveZIndex()).toBeGreaterThan(b.getEffectiveZIndex());

    cmd.undo(context);
    expect(c.zIndex).toBeUndefined();
  });

  it('SendNodeToBackCommand drops below the stack and undoes', () => {
    const a = diagram.getNode('a')!;
    const b = diagram.getNode('b')!;
    a.setZIndex(3);

    const cmd = new SendNodeToBackCommand('b');
    cmd.execute(context);
    expect(b.getEffectiveZIndex()).toBeLessThan(a.getEffectiveZIndex());

    cmd.undo(context);
    expect(b.zIndex).toBeUndefined();
  });

  it('refuses to execute against a missing node', () => {
    expect(new SetNodeZIndexCommand('nope', 1).canExecute(context)).toBe(false);
    expect(new BringNodeToFrontCommand('nope').canExecute(context)).toBe(false);
    expect(new SendNodeToBackCommand('nope').canExecute(context)).toBe(false);
  });

  it('throws when the node vanished between construction and execution', () => {
    expect(() => new SetNodeZIndexCommand('nope', 1).execute(context)).toThrow();
  });

  it('serializes its payload', () => {
    const cmd = new SetNodeZIndexCommand('a', 5);
    cmd.execute(context);
    expect(cmd.serialize().data).toMatchObject({ nodeId: 'a', zIndex: 5 });
    expect(cmd.getDescription()).toContain('a');
  });
});
