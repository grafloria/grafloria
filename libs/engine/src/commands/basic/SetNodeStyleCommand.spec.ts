// SetNodeStyleCommand — the undo semantics of a node style edit.
//
// The gap analysis recorded this as: "of 35 commands the only style one is
// UpdateLinkStyleCommand; NO node style command — setStyle() is a raw write outside
// undo." Changing a node's fill is the most ordinary edit a diagram editor has, and
// until this command it could not be undone at all.
//
// Convergence over the op log is proven separately, in collab/style-undo.spec.ts —
// single-process assertions cannot see the defect that made the link version wrong.

import { DiagramModel } from '../../models/DiagramModel';
import { NodeModel } from '../../models/NodeModel';
import { SetNodeStyleCommand } from './SetNodeStyleCommand';
import type { CommandContext } from '../Command';

function diagram(): { d: DiagramModel; ctx: CommandContext } {
  const d = new DiagramModel('d');
  for (const id of ['a', 'b', 'c']) {
    d.addNode(
      new NodeModel({ id, type: 'rect', position: { x: 0, y: 0 }, size: { width: 10, height: 10, depth: 0 } })
    );
  }
  return { d, ctx: { diagram: d } as unknown as CommandContext };
}

describe('SetNodeStyleCommand', () => {
  it('merges into the existing style rather than replacing it', () => {
    const { d, ctx } = diagram();
    d.getNode('a')!.setStyle({ fill: '#111', opacity: 0.5 });

    new SetNodeStyleCommand('a', { fill: '#c00' }).execute(ctx);

    expect(d.getNode('a')!.style.fill).toBe('#c00');
    expect(d.getNode('a')!.style.opacity).toBe(0.5); // untouched key survives
  });

  it('undo REMOVES a key the command introduced', () => {
    // The reason undo assigns wholesale instead of merging: `setStyle` can only add or
    // overwrite, so a merging undo would leave `stroke` behind forever.
    const { d, ctx } = diagram();
    d.getNode('a')!.setStyle({ fill: '#111' });

    const cmd = new SetNodeStyleCommand('a', { stroke: 'gold' });
    cmd.execute(ctx);
    expect(d.getNode('a')!.style.stroke).toBe('gold');

    cmd.undo(ctx);
    expect(d.getNode('a')!.style).toEqual({ fill: '#111' });
    expect('stroke' in d.getNode('a')!.style).toBe(false);
  });

  it('re-snapshots on redo — the second undo restores what the redo actually covered', () => {
    // WEAK TOOTH WARNING, learned the hard way. The obvious version of this test —
    // execute, undo, execute, undo, expect the original — passes with the snapshot
    // taken only ONCE, because the state before the second execute is identical to the
    // state before the first, so a stale snapshot happens to be right.
    //
    // The state must CHANGE between the two executes for the assertion to mean
    // anything. Here an unrelated edit lands while the command is undone; the redo must
    // capture THAT, so the final undo returns to 'moved-on', not to 'start'.
    const { d, ctx } = diagram();
    d.getNode('a')!.setStyle({ fill: 'start' });
    const cmd = new SetNodeStyleCommand('a', { fill: 'edited' });

    cmd.execute(ctx);
    cmd.undo(ctx);
    expect(d.getNode('a')!.style.fill).toBe('start');

    d.getNode('a')!.setStyle({ fill: 'moved-on' }); // an edit while we were undone

    cmd.execute(ctx); // redo
    expect(d.getNode('a')!.style.fill).toBe('edited');

    cmd.undo(ctx);
    expect(d.getNode('a')!.style.fill).toBe('moved-on');
  });

  it('styles MANY nodes as one undo entry', () => {
    const { d, ctx } = diagram();
    d.getNode('b')!.setStyle({ fill: 'b-was-here' });

    const cmd = new SetNodeStyleCommand(['a', 'b'], { fill: '#0a0' });
    cmd.execute(ctx);
    expect(d.getNode('a')!.style.fill).toBe('#0a0');
    expect(d.getNode('b')!.style.fill).toBe('#0a0');

    cmd.undo(ctx);
    // Each node returns to ITS OWN prior value — a single shared snapshot would give
    // both nodes the same style back.
    expect(d.getNode('a')!.style.fill).toBeUndefined();
    expect(d.getNode('b')!.style.fill).toBe('b-was-here');
    expect(d.getNode('c')!.style).toEqual({}); // a node not named is never touched
  });

  it('refuses when a target is missing, and does not half-apply', () => {
    const { d, ctx } = diagram();
    const cmd = new SetNodeStyleCommand(['a', 'ghost'], { fill: '#0a0' });

    expect(cmd.canExecute(ctx)).toBe(false);
    expect(() => cmd.execute(ctx)).toThrow();
    // The surviving node must NOT keep a partial application.
    expect(d.getNode('a')!.style.fill).toBeUndefined();
  });

  it('canUndo is false before execute and true after', () => {
    const { ctx } = diagram();
    const cmd = new SetNodeStyleCommand('a', { fill: '#0a0' });
    expect(cmd.canUndo(ctx)).toBe(false);
    cmd.execute(ctx);
    expect(cmd.canUndo(ctx)).toBe(true);
  });

  it('serializes its targets and both style states', () => {
    const { d, ctx } = diagram();
    d.getNode('a')!.setStyle({ fill: 'before' });
    const cmd = new SetNodeStyleCommand('a', { fill: 'after' });
    cmd.execute(ctx);

    const s = cmd.serialize();
    expect(s.data.nodeIds).toEqual(['a']);
    expect(s.data.style).toEqual({ fill: 'after' });
    expect((s.data.previousStyles as Record<string, unknown>)['a']).toEqual({ fill: 'before' });
  });
});
