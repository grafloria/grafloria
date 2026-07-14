// Wave 9 — Card 5: causal readiness.
//
// The first test is the one that matters, and it is a test of what happens WITHOUT this
// file — because the failure it prevents is not "the op is dropped". It is "the op is
// dropped, and every mechanism that could have recovered it has already been spent."

import { DiagramModel } from '../models/DiagramModel';
import { NodeModel } from '../models/NodeModel';
import { Replica } from '../collab/replica';
import type { Op } from '../collab/op';
import { CausalBuffer } from './causal-buffer';

function nodeData(id: string, x: number, y: number) {
  const n = new NodeModel({ type: 'basic', position: { x, y }, size: { width: 100, height: 50 } });
  (n as unknown as { id: string }).id = id;
  return n.serialize();
}

const addOp = (id: string, clock: number, x = 0, y = 0): Op =>
  ({ op: 'add', target: 'node', id, data: nodeData(id, x, y), clock, actor: 'alice' }) as Op;
const setOp = (id: string, clock: number, x: number, y: number): Op =>
  ({
    op: 'set',
    target: 'node',
    id,
    path: 'position',
    value: { x, y },
    clock,
    actor: 'alice',
  }) as Op;

describe('WHAT HAPPENS WITHOUT THE BUFFER — and why it is unrecoverable', () => {
  it('a `set` that overtakes its `add` is lost FOREVER, and re-delivery cannot save it', () => {
    // This is the raw Replica, fed a reordered stream directly — i.e. the code path that
    // existed before this card. Card 0's own header flags it and hands it to Card 5.
    const bob = new Replica(new DiagramModel('d'), { actor: 'bob' });

    const add = addOp('n7', 1, 0, 0);
    const move = setOp('n7', 2, 900, 900);

    // The transport reorders. The `set` lands first.
    bob.receive([move]); // logged · LWW register STAMPED · applied to nothing (no such node)
    bob.receive([add]); // the node appears — at its ORIGINAL position

    expect(bob.diagram.getNode('n7')!.position).toMatchObject({ x: 0, y: 0 }); // ← the edit evaporated

    // And it is gone for good. Both recovery mechanisms have already been consumed:
    //   • the LOG has seen it, so a re-delivery de-duplicates to nothing…
    bob.receive([move]);
    expect(bob.diagram.getNode('n7')!.position).toMatchObject({ x: 0, y: 0 });

    //   • …and the LWW register it stamped now REFUSES it as superseded — by itself.
    // One reordered packet. One node stuck at its birth position for the life of the
    // document. No error, on any layer, ever.
    bob.dispose();
  });

  it('WITH the buffer, the same reordered stream applies correctly', () => {
    const diagram = new DiagramModel('d');
    const bob = new Replica(diagram, { actor: 'bob' });
    const buffer = new CausalBuffer(diagram);

    const add = addOp('n7', 1, 0, 0);
    const move = setOp('n7', 2, 900, 900);

    // The `set` arrives first and is HELD — it never reaches the log, never stamps a
    // register, never gets silently applied to nothing.
    const first = buffer.admit([move]);
    expect(first.ready).toEqual([]);
    expect(buffer.pendingCount).toBe(1);
    bob.receive(first.ready);

    // The `add` arrives and RELEASES it, in total order.
    const second = buffer.admit([add]);
    expect(second.ready.map((o) => o.op)).toEqual(['add', 'set']);
    bob.receive(second.ready);

    expect(bob.diagram.getNode('n7')!.position).toMatchObject({ x: 900, y: 900 });
    expect(buffer.pendingCount).toBe(0);
    bob.dispose();
  });
});

describe('CausalBuffer', () => {
  it('sorts a mixed batch, so an `add` and its `set`s in ONE delivery never touch the buffer', () => {
    // A catch-up delta is exactly this shape. Sorting first means the common case costs
    // nothing at all.
    const buffer = new CausalBuffer(new DiagramModel('d'));
    const { ready, held } = buffer.admit([setOp('n1', 2, 5, 5), addOp('n1', 1)]);

    expect(held).toBe(0);
    expect(ready.map((o) => o.op)).toEqual(['add', 'set']);
  });

  it('does NOT hold an op for a DELETED entity — that would be a permanent hang', () => {
    // The readiness test is "have we ever SEEN an add for this id", not "does it exist NOW".
    // Get that wrong and a `set` on a node a peer legitimately deleted waits for an `add`
    // that is never coming, sits in the buffer for the rest of the session, and — because it
    // never reaches the log — gets re-requested by every single anti-entropy round.
    const diagram = new DiagramModel('d');
    const buffer = new CausalBuffer(diagram);

    buffer.admit([addOp('n1', 1)]);
    const removed: Op = { op: 'remove', target: 'node', id: 'n1', clock: 2, actor: 'alice' };
    buffer.admit([removed]);

    const late = buffer.admit([setOp('n1', 3, 7, 7)]); // a straggler for a dead node
    expect(late.ready).toHaveLength(1); // released, applies as the harmless no-op it is
    expect(buffer.pendingCount).toBe(0); // …and NOT stuck in the buffer forever
  });

  it('knows about entities that were on the diagram before the session started', () => {
    // A document loaded from disk. Without this, the first `set` on a pre-existing node
    // would be held forever waiting for an `add` that happened last Tuesday.
    const diagram = new DiagramModel('d');
    const n = new NodeModel({ type: 'basic', position: { x: 0, y: 0 }, size: { width: 1, height: 1 } });
    (n as unknown as { id: string }).id = 'preexisting';
    diagram.addNode(n);

    const buffer = new CausalBuffer(diagram);
    const { ready } = buffer.admit([setOp('preexisting', 1, 3, 3)]);

    expect(ready).toHaveLength(1);
    expect(buffer.pendingCount).toBe(0);
  });

  it('noteLocal(): an entity WE created is known, so a peer can edit it', () => {
    // The bug the fuzz found. Without this, a peer's edit to a node I made waits for an
    // `add` that nobody will ever send me — mine is the only one, it is already in my log,
    // and their anti-entropy correctly declines to echo it back.
    const buffer = new CausalBuffer(new DiagramModel('d'));

    const held = buffer.admit([setOp('mine', 5, 1, 1)]);
    expect(held.ready).toEqual([]); // …unknown, so far

    buffer.noteLocal(addOp('mine', 1)); // ← we created it; the transport will never tell us

    const now = buffer.admit([setOp('mine', 6, 2, 2)]);
    expect(now.ready).toHaveLength(1);
  });

  it('a duplicate delivery of a HELD op does not double the buffer', () => {
    const buffer = new CausalBuffer(new DiagramModel('d'));
    buffer.admit([setOp('ghost', 2, 1, 1)]);
    buffer.admit([setOp('ghost', 2, 1, 1)]);
    buffer.admit([setOp('ghost', 2, 1, 1)]);
    expect(buffer.pendingCount).toBe(1);
  });

  it('is BOUNDED — a broken peer cannot make us buffer without limit', () => {
    const buffer = new CausalBuffer(new DiagramModel('d'), { maxPending: 3 });
    for (let i = 0; i < 10; i++) buffer.admit([setOp('never-arrives', i + 1, i, i)]);

    expect(buffer.pendingCount).toBe(3);
    expect(buffer.overflowed).toBe(7); // counted, not swallowed
  });
});
