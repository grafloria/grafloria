// Style edits over the op log — and the UNDO that never travelled.
//
// ---------------------------------------------------------------------------
// THE BUG THIS FILE EXISTS TO KEEP FIXED
// ---------------------------------------------------------------------------
//
// `UpdateLinkStyleCommand.undo()` restored the previous style by ASSIGNING THE FIELD:
//
//     link.style = restored;
//     link.markDirty('style');
//
// `style` is a plain public field, and `trackChange()` is the single funnel collab
// captures from — so the assignment reached the renderer (markDirty bumps the mutation
// counter) and reached NOBODY ELSE. Measured, before the fix:
//
//     ops from execute(): 1
//     ops from undo():    0
//
// The author's own document was always correct, which is exactly why this survived: undo
// looked perfect on the machine that pressed Ctrl+Z. Every OTHER peer kept the styled
// link forever, and no later edit ever corrected it — the register simply never heard
// that the value went back. Two users, one document, permanently different pictures.
//
// The same trap is why `SetNodeStyleCommand` does NOT copy that shape: it restores
// through `replaceStyle()`, a tracked wholesale write, so the undo is an op like any
// other edit.
//
// Every assertion below demands the PEER's bytes, never the author's. An assertion on
// the author's model passes with the bug fully present.

import { DiagramModel } from '../models/DiagramModel';
import { SetNodeStyleCommand } from '../commands/basic/SetNodeStyleCommand';
import { UpdateLinkStyleCommand } from '../commands/basic/UpdateLinkStyleCommand';
import { link, node, peer } from './test-helpers';
import { replay } from './op-log';
import type { Op } from './op';
import type { CommandContext } from '../commands/Command';

/** A real wire hop — an op that cannot survive JSON has not travelled. */
function overTheWire(ops: readonly Op[]): Op[] {
  return JSON.parse(JSON.stringify(ops)) as Op[];
}

/**
 * Alice (capturing) and Bob (a replica of the same document), both already holding two
 * nodes and one link. Ops Alice produces are collected so a test can replay exactly the
 * slice it cares about.
 */
function session() {
  const sink: Op[] = [];
  const alice = peer('alice' as never, undefined, sink);
  const d = alice.diagram;
  d.addNode(node('a', 0, 0));
  d.addNode(node('b', 200, 0));
  d.addLink(link('l1', 'a', 'b'));

  const bob = new DiagramModel(d.name, { id: d.id, uuid: d.uuid } as never);
  bob.addNode(node('a', 0, 0));
  bob.addNode(node('b', 200, 0));
  bob.addLink(link('l1', 'a', 'b'));

  const ctx = { diagram: d } as unknown as CommandContext;
  /** Run `fn`, then push everything it emitted onto Bob. Returns the op count. */
  const andSync = (fn: () => void): number => {
    sink.length = 0;
    fn();
    const ops = overTheWire(sink);
    replay(bob, ops);
    return ops.length;
  };
  return { alice: d, bob, ctx, andSync };
}

describe('link style — the undo that did not travel', () => {
  it('an undone link style reaches the peer', () => {
    const { alice, bob, ctx, andSync } = session();
    const cmd = new UpdateLinkStyleCommand('l1', { stroke: 'red', strokeWidth: 9 });

    const execOps = andSync(() => cmd.execute(ctx));
    expect(execOps).toBeGreaterThan(0);
    expect(bob.getLink('l1')!.style.stroke).toBe('red');

    // THE TOOTH. Before the fix this count was 0 and Bob stayed red forever.
    const undoOps = andSync(() => cmd.undo(ctx));
    expect(undoOps).toBeGreaterThan(0);

    // Asserted on the PEER. `alice.style` is correct even with the bug present, so an
    // assertion there is worth nothing.
    expect(bob.getLink('l1')!.style.stroke).toBeUndefined();
    expect(bob.getLink('l1')!.style.strokeWidth).toBeUndefined();
    expect(alice.getLink('l1')!.style).toEqual({});
  });
});

describe('node style over the wire', () => {
  it('a node style edit and its undo both reach the peer', () => {
    const { alice, bob, ctx, andSync } = session();
    const cmd = new SetNodeStyleCommand('a', { fill: '#c00', strokeWidth: 4 });

    expect(andSync(() => cmd.execute(ctx))).toBeGreaterThan(0);
    expect(bob.getNode('a')!.style.fill).toBe('#c00');

    expect(andSync(() => cmd.undo(ctx))).toBeGreaterThan(0);
    expect(bob.getNode('a')!.style.fill).toBeUndefined();
    expect(alice.getNode('a')!.style.fill).toBeUndefined();
  });

  it('undo REMOVES a key the command introduced, on the peer too', () => {
    // The merge trap: `setStyle` cannot delete a key, so an undo that merges the
    // snapshot back leaves whatever the command added. Both sides must lose it.
    const { alice, bob, ctx, andSync } = session();
    alice.getNode('a')!.setStyle({ fill: '#111' });
    andSync(() => undefined); // flush the seed edit onto Bob
    replay(bob, []);
    bob.getNode('a')!.setStyle({ fill: '#111' });

    const cmd = new SetNodeStyleCommand('a', { stroke: 'gold' });
    andSync(() => cmd.execute(ctx));
    expect(bob.getNode('a')!.style.stroke).toBe('gold');

    andSync(() => cmd.undo(ctx));
    expect(alice.getNode('a')!.style).toEqual({ fill: '#111' });
    expect(bob.getNode('a')!.style.stroke).toBeUndefined();
    expect(bob.getNode('a')!.style.fill).toBe('#111');
  });

  it('a multi-node edit reaches the peer for EVERY node, and undoes for every node', () => {
    const { bob, ctx, andSync } = session();
    const cmd = new SetNodeStyleCommand(['a', 'b'], { fill: '#0a0' });

    andSync(() => cmd.execute(ctx));
    expect(bob.getNode('a')!.style.fill).toBe('#0a0');
    expect(bob.getNode('b')!.style.fill).toBe('#0a0');

    andSync(() => cmd.undo(ctx));
    // A per-node loop that forgets a node leaves exactly one of these red.
    expect(bob.getNode('a')!.style.fill).toBeUndefined();
    expect(bob.getNode('b')!.style.fill).toBeUndefined();
  });
});
