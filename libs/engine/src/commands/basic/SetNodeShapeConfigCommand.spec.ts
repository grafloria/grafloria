// SetNodeShapeConfigCommand — undo semantics of a metadata.shape edit.
//
// Exists for the corner-radius case: `shape.cornerRadius` is rect GEOMETRY and
// defers over the style-borne borderRadius, so on masters that ship it (the
// BPMN task family) the panel must edit THIS key for the change to paint.

import { DiagramModel } from '../../models/DiagramModel';
import { NodeModel } from '../../models/NodeModel';
import { SetNodeShapeConfigCommand } from './SetNodeShapeConfigCommand';
import type { CommandContext } from '../Command';

function build(shape?: Record<string, unknown>) {
  const d = new DiagramModel('d');
  const n = new NodeModel({
    id: 'a',
    type: 'rect',
    position: { x: 0, y: 0 },
    size: { width: 100, height: 60, depth: 0 },
  });
  if (shape) n.setMetadata('shape', shape);
  d.addNode(n);
  return { d, n, ctx: { diagram: d } as unknown as CommandContext };
}

describe('SetNodeShapeConfigCommand', () => {
  it('merges the patch into the existing shape config', () => {
    const { n, ctx } = build({ type: 'rect', fill: '#EEF2FF', cornerRadius: 8 });
    new SetNodeShapeConfigCommand('a', { cornerRadius: 16 }).execute(ctx);
    expect(n.getMetadata('shape')).toEqual({ type: 'rect', fill: '#EEF2FF', cornerRadius: 16 });
  });

  it('undo restores the previous shape object verbatim', () => {
    const { n, ctx } = build({ type: 'rect', cornerRadius: 8 });
    const cmd = new SetNodeShapeConfigCommand('a', { cornerRadius: 0 });
    cmd.execute(ctx);
    expect(n.getMetadata('shape').cornerRadius).toBe(0);
    cmd.undo(ctx);
    expect(n.getMetadata('shape')).toEqual({ type: 'rect', cornerRadius: 8 });
  });

  it('a node with NO shape config goes back to having none', () => {
    const { n, ctx } = build();
    const cmd = new SetNodeShapeConfigCommand('a', { cornerRadius: 12 });
    cmd.execute(ctx);
    expect(n.getMetadata('shape')).toEqual({ cornerRadius: 12 });
    cmd.undo(ctx);
    expect(n.getMetadata('shape')).toBeUndefined();
  });

  it('re-snapshots on redo — the second undo restores what the redo covered', () => {
    const { n, ctx } = build({ type: 'rect', cornerRadius: 8 });
    const cmd = new SetNodeShapeConfigCommand('a', { cornerRadius: 20 });
    cmd.execute(ctx);
    cmd.undo(ctx);
    n.setMetadata('shape', { type: 'rect', cornerRadius: 5 }); // moved on while undone
    cmd.execute(ctx); // redo
    cmd.undo(ctx);
    expect(n.getMetadata('shape')).toEqual({ type: 'rect', cornerRadius: 5 });
  });

  it('refuses a missing node and an empty patch', () => {
    const { ctx } = build();
    expect(new SetNodeShapeConfigCommand('ghost', { cornerRadius: 1 }).canExecute(ctx)).toBe(false);
    expect(new SetNodeShapeConfigCommand('a', {}).canExecute(ctx)).toBe(false);
    expect(() => new SetNodeShapeConfigCommand('ghost', { cornerRadius: 1 }).execute(ctx)).toThrow(
      'not found'
    );
  });

  it('canUndo is false before execute and true after', () => {
    const { ctx } = build();
    const cmd = new SetNodeShapeConfigCommand('a', { cornerRadius: 2 });
    expect(cmd.canUndo(ctx)).toBe(false);
    cmd.execute(ctx);
    expect(cmd.canUndo(ctx)).toBe(true);
  });
});
