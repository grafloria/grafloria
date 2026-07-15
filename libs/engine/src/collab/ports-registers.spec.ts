// Wave 14 — the op-vocabulary cluster: ports and clears.
//
// ---------------------------------------------------------------------------
// THREE DEFECTS, ONE ROOT CAUSE: THE VOCABULARY WAS COARSER THAN THE EDITS
// ---------------------------------------------------------------------------
//
// DEFECT 1 — ports were a WHOLE-COLLECTION LWW register. capture emitted the entire
// serialized ports array as one `set(node,'ports',…)`. Two peers concurrently adding a
// DIFFERENT port to the same node raced that single register; one register write
// superseded the other, and the reconciling apply branch ACTIVELY DELETED the losing
// port from its creator's own node — referential integrity then orphaned every link
// already attached to it. The user watched their work vanish. This is the exact
// whole-entity-granularity failure Card 0 rejected for nodes, reintroduced one level
// down. The fix is expressible in the EXISTING vocabulary: the path is the register
// key, so each port gets its own register — `set(node, 'ports.<portId>', …)`.
//
// DEFECT 2 — live-port mutations emitted NO op. PortModel is a DiagramEntity with its
// own trackChange calls (position, alignment, offset, allowedTypes), but capture only
// watched node/link/group/stroke, and NodeModel emits 'ports' only on add/remove. So
// editing a LIVE port's properties silently never synced. Per-port registers fix this
// naturally: capture watches each port's change events and re-emits the port's
// serialized form to its `ports.<id>` register. COARSE per-port, deliberately — no
// `ports.<id>.position` sub-registers, because the register keyspace must stay
// prefix-free (the comments-suite lesson) and a port is small.
//
// DEFECT 3 — clearing a register put `undefined` on the wire, which OpValue forbids.
// The clear crossed the wire only because JSON.stringify silently DROPS an undefined
// key and the peer's apply happened to treat missing-as-undefined — a load-bearing
// accident, not a design. Clears are now EXPLICIT: `clear: true`, no value key. NOT
// null — null is a legitimate stored value, and this file proves the distinction.
// Old logs where the value key is simply absent still apply as a clear.

import { DiagramModel } from '../models/DiagramModel';
import { NodeModel } from '../models/NodeModel';
import { LinkModel } from '../models/LinkModel';
import { PortModel } from '../models/PortModel';
import type { SerializedPort } from '../models/PortModel';
import { OpCapture } from './capture';
import { Replica } from './replica';
import { replay } from './op-log';
import { applyOp } from './apply-op';
import type { Op, SetOp } from './op';
import { contentBytes, expectConverged, link, node, peer } from './test-helpers';

/** A pair of peers seeded with the same two nodes and a link, plus their outboxes. */
function twoPeers(withLink = true) {
  const seedOps: Op[] = [];
  const seeder = peer('seed', undefined, seedOps);
  seeder.diagram.addNode(node('a', 0, 0));
  seeder.diagram.addNode(node('b', 300, 0));
  if (withLink) seeder.diagram.addLink(link('ab', 'a', 'b'));

  const aliceOps: Op[] = [];
  const bobOps: Op[] = [];
  const alice = peer('alice', seeder.diagram, aliceOps);
  const bob = peer('bob', seeder.diagram, bobOps);
  alice.receive(seedOps);
  bob.receive(seedOps);
  aliceOps.length = 0;
  bobOps.length = 0;

  const dispose = () => [seeder, alice, bob].forEach((p) => p.dispose());
  return { seeder, alice, bob, aliceOps, bobOps, dispose };
}

/** Exchange both outboxes, then everything again — a mesh relays, a reconnect replays. */
function exchange(
  alice: Replica,
  bob: Replica,
  aliceOps: Op[],
  bobOps: Op[]
): void {
  alice.receive([...bobOps]);
  bob.receive([...aliceOps]);
  const everything = [...alice.history()];
  alice.receive([...bob.history()]);
  bob.receive(everything);
}

// ===========================================================================
describe('DEFECT 1: ports are per-port registers, not one whole-collection register', () => {
  // ===========================================================================

  it('THE ONE THAT MATTERS: two peers concurrently add DIFFERENT ports to the same node — BOTH survive, and so do their links', () => {
    // This is Card 0's founding argument (a concurrent move and rename both survive)
    // replayed one level down. Under the whole-collection register, one peer's ports
    // array superseded the other's, the reconciling apply DELETED the losing port from
    // its creator's own node, and integrity orphaned the link the user had just drawn
    // into it. Work vanished with no error anywhere.
    const { alice, bob, aliceOps, bobOps, dispose } = twoPeers();

    // CONCURRENTLY — neither has seen the other's edit
    alice.diagram
      .getNode('a')!
      .addPort(new PortModel({ id: 'alice-p', type: 'output', side: 'bottom' }));
    const la = new LinkModel('alice-p', 'b-in', 'orthogonal');
    (la as unknown as { id: string }).id = 'link-alice';
    alice.diagram.addLink(la);

    bob.diagram
      .getNode('a')!
      .addPort(new PortModel({ id: 'bob-p', type: 'output', side: 'top' }));
    const lb = new LinkModel('bob-p', 'b-in', 'orthogonal');
    (lb as unknown as { id: string }).id = 'link-bob';
    bob.diagram.addLink(lb);

    exchange(alice, bob, aliceOps, bobOps);

    for (const [who, p] of [['alice', alice], ['bob', bob]] as const) {
      const ports = p.diagram.getNode('a')!.getPorts().map((x) => x.id);
      expect({ who, hasAliceP: ports.includes('alice-p') }).toEqual({ who, hasAliceP: true });
      expect({ who, hasBobP: ports.includes('bob-p') }).toEqual({ who, hasBobP: true });
      // …and the links into those ports are LIVE, not quarantined, not gone.
      expect({ who, links: p.diagram.getLinks().map((l) => l.id).sort() }).toEqual({
        who,
        links: ['ab', 'link-alice', 'link-bob'],
      });
      expect({ who, q: p.quarantinedLinks }).toEqual({ who, q: [] });
    }
    expectConverged(alice.diagram, bob.diagram);
    dispose();
  });

  it('an edit-vs-remove race on the SAME port converges — one register, LWW decides, identically everywhere', () => {
    // Both edits write the same `ports.a-out` register: the removal as a clear, the
    // property edit as a full-port value. Whichever stamp is newer wins on BOTH peers —
    // the answer does not depend on arrival order, and redelivery changes nothing.
    // Both directions are driven, because each exercises a different apply path: a
    // clear landing over a live port (remove), and a value landing over an ABSENT port
    // (the removal's peer re-establishes it from the register — the port comes back).

    // --- direction 1: the REMOVE is stamped newer — the port goes, everywhere -------
    {
      const { alice, bob, aliceOps, bobOps, dispose } = twoPeers();
      bob.diagram.getNode('a')!.getPort('a-out')!.setOffset({ x: 4, y: 4 });
      alice.receive([...bobOps]); // alice SEES the edit…
      alice.diagram.getNode('a')!.removePort('a-out'); // …then cuts: her clear is newer
      exchange(alice, bob, aliceOps, bobOps);

      for (const [who, p] of [['alice', alice], ['bob', bob]] as const) {
        expect({ who, port: p.diagram.getNode('a')!.getPort('a-out')?.id }).toEqual({
          who,
          port: undefined,
        });
        // the link into the removed port is QUARANTINED — identically on both peers —
        // so an undo of the removal can still bring it home
        expect({ who, q: p.quarantinedLinks }).toEqual({ who, q: ['ab'] });
      }
      expectConverged(alice.diagram, bob.diagram, { direction: 'remove newer' });
      dispose();
    }

    // --- direction 2: truly CONCURRENT — same clock, so the actor tiebreak decides
    // ('bob' > 'alice'), the EDIT wins the register, and the removal is void ----------
    {
      const { alice, bob, aliceOps, bobOps, dispose } = twoPeers();
      bob.diagram.getNode('a')!.getPort('a-out')!.setOffset({ x: 4, y: 4 });
      alice.diagram.getNode('a')!.removePort('a-out'); // blind to each other
      expect(alice.quarantinedLinks).toEqual(['ab']); // her removal orphaned the link…
      exchange(alice, bob, aliceOps, bobOps);

      for (const [who, p] of [['alice', alice], ['bob', bob]] as const) {
        const port = p.diagram.getNode('a')!.getPort('a-out');
        expect({ who, offset: port?.offset }).toEqual({ who, offset: { x: 4, y: 4 } });
        // …and the winning edit brought the port back, so the link came home too
        expect({ who, q: p.quarantinedLinks }).toEqual({ who, q: [] });
        expect({ who, ab: p.diagram.getLink('ab')?.id }).toEqual({ who, ab: 'ab' });
      }
      expectConverged(alice.diagram, bob.diagram, { direction: 'edit wins tiebreak' });
      dispose();
    }
  });

  it('undo of a port ADD takes back exactly that port; undo of a port REMOVE restores exactly that port, and its link comes home', () => {
    const { alice, bob, aliceOps, bobOps, dispose } = twoPeers();

    // --- undo an add -------------------------------------------------------
    const a = alice.diagram.getNode('a')!;
    const portCount = a.getPorts().length;
    a.addPort(new PortModel({ id: 'temp-p', type: 'output', side: 'bottom' }));
    alice.undo();
    expect(a.getPort('temp-p')).toBeUndefined();
    // …and ONLY that port: the node's other ports are untouched. (The old
    // whole-collection `before` shadow got this wrong for the FIRST port change:
    // undo restored an empty register and stripped the node of every port it had.)
    expect(a.getPorts().length).toBe(portCount);

    // --- undo a remove -----------------------------------------------------
    const removed = a.getPort('a-out')!.serialize();
    alice.diagram.getNode('a')!.removePort('a-out');
    // the link ab lost its endpoint: quarantined, not destroyed
    expect(alice.quarantinedLinks).toEqual(['ab']);
    alice.undo();
    const back = alice.diagram.getNode('a')!.getPort('a-out');
    expect(back).toBeDefined();
    // exactly as it was at the moment of removal
    const strip = (p: SerializedPort) => ({ ...p, version: 0 });
    expect(strip(back!.serialize())).toEqual(strip(removed));
    expect(alice.quarantinedLinks).toEqual([]);
    expect(alice.diagram.getLink('ab')).toBeDefined();

    exchange(alice, bob, aliceOps, bobOps);
    expectConverged(alice.diagram, bob.diagram);
    expect(bob.diagram.getNode('a')!.getPort('temp-p')).toBeUndefined();
    expect(bob.diagram.getNode('a')!.getPort('a-out')).toBeDefined();
    expect(bob.quarantinedLinks).toEqual([]);
    dispose();
  });

  it('BACK-COMPAT: the legacy whole-collection ports op still applies — and mixes with per-port ops, in BOTH orders', () => {
    // Old logs, snapshot+tail files and a mid-rollout old peer all still speak
    // `set(node,'ports',<whole array>)`. The apply path stays; only the EMISSION
    // stopped. A mixed history must converge whatever order the network chose.
    const seed = node('a', 0, 0);
    const seedPorts = seed.getPorts().map((p) => p.serialize());

    const legacyPort = new PortModel({ id: 'legacy-p', type: 'input', side: 'top' });
    legacyPort.nodeId = 'a';
    const withLegacy = [...seedPorts, legacyPort.serialize()];

    const newPort = new PortModel({ id: 'new-p', type: 'output', side: 'bottom' });
    newPort.nodeId = 'a';
    const { version: _v, ...newPortWire } = newPort.serialize();

    const addOp: Op = { op: 'add', target: 'node', id: 'a', data: seed.serialize(), clock: 1, actor: 'seed' };

    /** Build the two mixed histories: legacy op older / newer than the per-port op. */
    const mk = (legacyClock: number, perPortClock: number): Op[] => [
      addOp,
      { op: 'set', target: 'node', id: 'a', path: 'ports', value: withLegacy as never, clock: legacyClock, actor: 'legacy' },
      { op: 'set', target: 'node', id: 'a', path: 'ports.new-p', value: newPortWire as never, clock: perPortClock, actor: 'new' },
    ];

    for (const [label, ops] of [
      ['legacy older', mk(5, 9)],
      ['legacy newer', mk(9, 5)],
    ] as const) {
      const base = new DiagramModel('mixed');
      const one = new Replica(new DiagramModel(base.name, { id: base.id, uuid: base.uuid }), { actor: 'one' });
      const two = new Replica(new DiagramModel(base.name, { id: base.id, uuid: base.uuid }), { actor: 'two' });
      const three = new Replica(new DiagramModel(base.name, { id: base.id, uuid: base.uuid }), { actor: 'three' });

      // ONE OP PER receive(), deliberately: a batch is sorted into total order before it
      // is applied, which would quietly reduce "both delivery orders" to one order and
      // never exercise the ports-collection barrier at all. (Mutation-testing the barrier
      // out of lww.ts caught exactly that: this test stayed green. Per-op delivery is
      // what a real network does anyway.)
      for (const o of ops) one.receive([o]); // in-order delivery
      for (const o of [...ops].reverse()) two.receive([o]); // …fully reversed…
      // …and the LEGACY STRAGGLER: the whole-collection op lands LAST, after the add and
      // the per-port write it races. This is the order that needs repairPorts — the
      // stateless apply rebuilds the whole collection, clobbering the newer per-port
      // register, and only the log knows what to put back. (Mutation-testing repairPorts
      // out survived the first two orders; this one kills it.)
      three.receive([ops[0]]);
      three.receive([ops[2]]);
      three.receive([ops[1]]);

      const ids = (r: Replica) => r.diagram.getNode('a')!.getPorts().map((p) => p.id);
      // the legacy collection landed either way
      expect({ label, legacy: ids(one).includes('legacy-p') }).toEqual({ label, legacy: true });
      // the NEWER write decides the racing register: per-port add survives the older
      // legacy collection, and is superseded by the newer one.
      expect({ label, newP: ids(one).includes('new-p') }).toEqual({
        label,
        newP: label === 'legacy older',
      });
      expectConverged(one.diagram, two.diagram, { label, pair: 'one~two' });
      expectConverged(one.diagram, three.diagram, { label, pair: 'one~three' });
      [one, two, three].forEach((r) => r.dispose());
    }
  });
});

// ===========================================================================
describe('DEFECT 2: editing a LIVE port syncs', () => {
  // ===========================================================================

  it('peer A moves a port to the other side — peer B sees it', () => {
    // PortModel has trackChange calls of its own (position, alignment, offset,
    // allowedTypes), but capture watched only node/link/group/stroke and NodeModel
    // emits 'ports' only on add/remove. A live-port edit was invisible: the two
    // documents diverged and nothing anywhere reported it.
    const { alice, bob, aliceOps, bobOps, dispose } = twoPeers(false);

    const port = alice.diagram.getNode('a')!.getPort('a-out')!;
    port.setAlignment({ side: 'left', offset: 12 });
    port.setPosition({ x: 0, y: 0.25 });
    port.setOffset({ x: -3, y: 0 });

    expect(aliceOps.length).toBeGreaterThan(0); // the edit emitted AT ALL

    exchange(alice, bob, aliceOps, bobOps);

    const seen = bob.diagram.getNode('a')!.getPort('a-out')!;
    expect(seen.alignment).toMatchObject({ side: 'left', offset: 12 });
    expect(seen.position).toMatchObject({ x: 0, y: 0.25 });
    expect(seen.offset).toMatchObject({ x: -3, y: 0 });
    expectConverged(alice.diagram, bob.diagram);
    dispose();
  });

  it('a port on a node that arrives LATER is watched too — its edits sync', () => {
    // The watch has to attach on every path a port can reach a live diagram by:
    // capture attach, port add, node add. This drives the node-add path.
    const { alice, bob, aliceOps, bobOps, dispose } = twoPeers(false);

    alice.diagram.addNode(node('c', 600, 0));
    alice.diagram.getNode('c')!.getPort('c-out')!.setAlignment({ side: 'top', offset: 5 });

    exchange(alice, bob, aliceOps, bobOps);
    expect(bob.diagram.getNode('c')!.getPort('c-out')!.alignment).toMatchObject({
      side: 'top',
      offset: 5,
    });
    expectConverged(alice.diagram, bob.diagram);

    // …and a REMOTELY-added node's ports are watched on the receiving side too:
    // bob edits the port alice created.
    bob.diagram.getNode('c')!.getPort('c-in')!.setOffset({ x: 7, y: 7 });
    exchange(alice, bob, aliceOps, bobOps);
    expect(alice.diagram.getNode('c')!.getPort('c-in')!.offset).toMatchObject({ x: 7, y: 7 });
    expectConverged(alice.diagram, bob.diagram);
    dispose();
  });

  it('a session with PORT edits replays byte-identically — the log is complete again', () => {
    // The op-log.spec contract test, extended to the edits that used to escape it.
    const diagram = new DiagramModel('live');
    const ops: Op[] = [];
    const capture = new OpCapture(diagram, { actor: 'alice', onOp: (op) => ops.push(op) });

    diagram.addNode(node('a', 0, 0));
    diagram.addNode(node('b', 300, 0));
    const l = new LinkModel('a-out', 'b-in', 'orthogonal');
    (l as unknown as { id: string }).id = 'l1';
    diagram.addLink(l);

    const a = diagram.getNode('a')!;
    a.addPort(new PortModel({ id: 'extra', type: 'output', side: 'bottom' }));
    a.getPort('extra')!.setAlignment({ side: 'top', offset: 3 }); // live-port edit
    a.getPort('a-out')!.setPosition({ x: 1, y: 0.75 }); // …of a born-with port too
    a.getPort('a-in')!.addAllowedType('data'); // a Set-backed register
    a.removePort('extra'); // add then remove
    a.setMetadata('label', 'Start');
    a.deleteMetadata('label'); // a clear crosses the wire explicitly now

    capture.stop();

    const replica = new DiagramModel(diagram.name, { id: diagram.id, uuid: diagram.uuid });
    replay(replica, ops);
    expect(contentBytes(replica)).toEqual(contentBytes(diagram));
  });
});

// ===========================================================================
describe('DEFECT 3: clears are explicit and typed — undefined never crosses the wire', () => {
  // ===========================================================================

  it('every set op a real session produces is EXPLICIT: a value that is present, or clear:true', () => {
    // The old shape — value:undefined — only worked because JSON.stringify DROPS the
    // key and the peer read missing-as-undefined. Twice-lucky is not a wire format.
    const ops: Op[] = [];
    const r = new Replica(new DiagramModel('d'), { actor: 'a', onLocalOp: (o) => ops.push(o) });
    r.diagram.addNode(node('n', 0, 0));
    const n = r.diagram.getNode('n')!;
    n.setMetadata('label', 'X');
    n.deleteMetadata('label'); // metadata clear
    n.setFlexItem({ grow: 1 } as never);
    n.clearFlexItem(); // a non-metadata clear (trackChange(…, undefined))
    n.getPort('n-out')!.setOffset({ x: 1, y: 1 }); // and a port register for good measure

    const sets = ops.filter((o): o is SetOp => o.op === 'set');
    expect(sets.length).toBeGreaterThan(3);
    for (const op of sets) {
      const explicit = op.clear === true ? op.value === undefined : op.value !== undefined;
      expect({ path: op.path, explicit }).toEqual({ path: op.path, explicit: true });
      // and the op survives JSON EXACTLY — nothing silently dropped
      expect(JSON.parse(JSON.stringify(op))).toEqual(op);
      expect(Object.keys(JSON.parse(JSON.stringify(op))).sort()).toEqual(Object.keys(op).sort());
    }
    r.dispose();
  });

  it('null is a STORED VALUE and cleared is EMPTY — the receiving Map knows the difference', () => {
    const { alice, bob, aliceOps, bobOps, dispose } = twoPeers(false);
    const aliceNode = alice.diagram.getNode('a')!;

    // store null — a legitimate value, not a clear
    aliceNode.setMetadata('note', null);
    // over the REAL wire: JSON round-trip
    bob.receive(JSON.parse(JSON.stringify([...aliceOps])));
    const bobNode = bob.diagram.getNode('a')!;
    expect(bobNode.metadata.has('note')).toBe(true);
    expect(bobNode.getMetadata('note')).toBeNull();
    expect((bobNode.serialize().metadata as Record<string, unknown>)['note']).toBeNull();

    // now CLEAR it — the key must be GONE, not present-with-undefined
    aliceOps.length = 0;
    aliceNode.deleteMetadata('note');
    bob.receive(JSON.parse(JSON.stringify([...aliceOps])));
    expect(bobNode.metadata.has('note')).toBe(false);
    expect(aliceNode.metadata.has('note')).toBe(false);
    expect('note' in (bobNode.serialize().metadata as Record<string, unknown>)).toBe(false);

    exchange(alice, bob, aliceOps, bobOps);
    expectConverged(alice.diagram, bob.diagram);
    dispose();
  });

  it('BACK-COMPAT: an OLD log that cleared by omission (no value key at all) still applies as a clear', () => {
    // Every persisted log written before this change contains exactly this shape:
    // the op was stringified with value:undefined and the key vanished.
    const d = new DiagramModel('old');
    d.addNode(node('n', 0, 0));
    d.getNode('n')!.setMetadata('label', 'X');

    const oldClear = JSON.parse(
      JSON.stringify({ op: 'set', target: 'node', id: 'n', path: 'metadata.label', value: undefined, clock: 9, actor: 'old' })
    ) as Op;
    expect('value' in oldClear).toBe(false); // this IS the old wire shape
    expect('clear' in oldClear).toBe(false);

    expect(applyOp(d, oldClear)).toBe(true);
    expect(d.getNode('n')!.getMetadata('label')).toBeUndefined();
    expect(d.getNode('n')!.metadata.has('label')).toBe(false);
    // idempotent: clearing an already-empty register changes nothing
    expect(applyOp(d, { ...oldClear, clock: 10 } as Op)).toBe(false);
  });

  it('undo of the FIRST value a register ever held is a clear — and it still works, explicitly', () => {
    const { alice, bob, aliceOps, bobOps, dispose } = twoPeers(false);
    const n = alice.diagram.getNode('a')!;
    n.setMetadata('label', 'First'); // the register was EMPTY before this
    alice.undo();
    expect(n.metadata.has('label')).toBe(false);

    // the undo's clear op is explicit on the wire
    const clearOp = aliceOps[aliceOps.length - 1] as SetOp;
    expect(clearOp.op).toBe('set');
    expect(clearOp.clear).toBe(true);
    expect('value' in clearOp && clearOp.value !== undefined).toBe(false);

    exchange(alice, bob, aliceOps, bobOps);
    expect(bob.diagram.getNode('a')!.metadata.has('label')).toBe(false);
    expectConverged(alice.diagram, bob.diagram);
    dispose();
  });
});
