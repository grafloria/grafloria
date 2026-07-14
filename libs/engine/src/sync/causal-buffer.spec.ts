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

// FIXED AT MERGE by wave9/crdt, and this test is INVERTED to guard the fix.
//
// It was written to characterise a real, unrecoverable defect: a reordered `set` overtaking
// its `add` was logged, STAMPED ITS LWW REGISTER, and then evaporated in applyOp because the
// entity did not exist yet. Both recovery routes were then already spent — the log dedupes a
// re-delivery, and the register refuses the op as superseded BY ITSELF. One reordered packet,
// one node stuck at its birth position for the life of the document, no error anywhere.
//
// wave9/crdt closed it from the other end: an `add` now ESTABLISHES AN INCARNATION and
// REPAIRS the entity from the log — replaying every write newer than the add. So the raw
// Replica survives a reordered stream on its own, and the causal buffer became provably
// redundant (its own mutation test showed it could be deleted with everything still green).
describe('a reordered stream is survivable on the RAW Replica — no buffer required', () => {
  it('a `set` that overtakes its `add` is REPAIRED FROM THE LOG, not lost', () => {
    const bob = new Replica(new DiagramModel('d'), { actor: 'bob' });

    const add = addOp('n7', 1, 0, 0);
    const move = setOp('n7', 2, 900, 900);

    // The transport reorders. The `set` lands first, against a node that does not exist.
    bob.receive([move]);
    bob.receive([add]); // …and the add repairs the entity from the log as it lands

    // The edit SURVIVED. This is the assertion that used to read {x: 0, y: 0}.
    expect(bob.diagram.getNode('n7')!.position).toMatchObject({ x: 900, y: 900 });

    // …and re-delivery still changes nothing, because idempotence is the log's job.
    bob.receive([move]);
    expect(bob.diagram.getNode('n7')!.position).toMatchObject({ x: 900, y: 900 });

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
