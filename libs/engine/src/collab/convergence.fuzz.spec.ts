// Wave 9 — Card 4: THE FUZZ.
//
// ---------------------------------------------------------------------------
// A HAND-PICKED INTERLEAVING PROVES ONLY THE CASE YOU THOUGHT OF
// ---------------------------------------------------------------------------
//
// Every test in integrity.spec.ts and undo.spec.ts is a case someone thought of. The whole
// content of a convergence claim is that it also holds for the ones nobody thought of, so
// the only test that can actually support the claim is a randomised one. Seeded, so a
// failure is a bug report and not a ghost.
//
// Card 0's fuzz found the counterexample that forced lww.ts into existence within seconds
// of being written. It had two blind spots, and both hid real bugs:
//
//   • IT NEVER CREATED A LINK. So it could not see that a link installed before its node
//     has arrived keeps `undefined` endpoint node ids forever — ids that are in serialize().
//   • IT NEVER UNDID ANYTHING. So it could not see any of it interact with undo.
//
// This one does both, plus deletes, resurrections, port additions, three-way meshes,
// redelivery and out-of-order delivery.
//
// ---------------------------------------------------------------------------
// THE ORACLE, AND WHY IT IS NOT WEAKENED
// ---------------------------------------------------------------------------
// Content equality, with `version` — a per-replica mutation counter, a local quantity like
// a vector-clock component — as the ONLY field permitted to differ. That exemption is not a
// convenience: it is asserted. `expectConverged` checks the content AND separately asserts
// that nothing but `version` differs anywhere in the document. A divergence of one field of
// one node still fails.
//
// And convergence alone is not enough here, so the fuzz asserts the INVARIANT too: no peer
// may hold a link whose endpoint node is missing. Two peers can agree perfectly on a broken
// document — that is precisely what makes the dangling link so dangerous — so "they agree"
// and "they are right" are checked separately.

import { DiagramModel } from '../models/DiagramModel';
import { PortModel } from '../models/PortModel';
import { Replica } from './replica';
import type { Op } from './op';
import { expectConverged, link, node, peer, rng } from './testing';

/** No peer may hold a link whose endpoint node does not exist. Checked against the ENGINE's
 *  port index, not our own — an independent witness. */
function expectNoDanglingLinks(d: DiagramModel, context: unknown): void {
  const dangling = d
    .getLinks()
    .filter(
      (l) =>
        d.getNodeByPortId(l.sourcePortId) === undefined ||
        d.getNodeByPortId(l.targetPortId) === undefined
    )
    .map((l) => l.id);
  expect({ ...(context as object), dangling }).toEqual({ ...(context as object), dangling: [] });
}

interface Peer {
  replica: Replica;
  outbox: Op[];
  name: string;
}

describe('FUZZ: convergence under concurrent editing, deletion, resurrection and undo', () => {
  /**
   * One trial.
   *
   * Peers act blind to each other, ops are exchanged in random chunks at random moments, and
   * at the end everybody is told everything (twice, shuffled — a mesh relays, a reconnect
   * replays). Then they must agree, and the document they agree on must be VALID.
   */
  function trial(seed: number, peerCount: number, rounds: number): void {
    const { next, pick } = rng(seed);

    // A shared starting document. Everyone joins from the same snapshot identity, which is
    // how a real peer joins: the log carries content, the snapshot carries identity.
    const seedOps: Op[] = [];
    const seeder = peer('seed', undefined, seedOps);
    seeder.diagram.addNode(node('a', 0, 0));
    seeder.diagram.addNode(node('b', 300, 0));
    seeder.diagram.addNode(node('c', 600, 0));
    seeder.diagram.addLink(link('ab', 'a', 'b'));

    const peers: Peer[] = [];
    for (let i = 0; i < peerCount; i++) {
      const outbox: Op[] = [];
      const name = ['alice', 'bob', 'carol'][i];
      const r = peer(name, seeder.diagram, outbox);
      r.receive(seedOps);
      outbox.length = 0; // the seed is common ground, not traffic
      peers.push({ replica: r, outbox, name });
    }

    /** Ids a peer invents are its own — nanoid() makes real ones locally unique, and two
     *  peers minting the SAME id is a case the engine cannot represent (see the report). */
    let minted = 0;
    const freshId = (p: Peer) => `${p.name}-${minted++}`;

    const act = (p: Peer): void => {
      const d = p.replica.diagram;
      const nodes = d.getNodes();
      const links = d.getLinks();
      const target = nodes.length > 0 ? pick(nodes) : undefined;

      switch (pick([
        'move', 'rename', 'resize', 'select',
        'addNode', 'deleteNode',
        'addLink', 'deleteLink',
        'addPort',
        'undo', 'redo',
        'transactMove',
      ] as const)) {
        case 'move':
          target?.setPosition(Math.floor(next() * 800), Math.floor(next() * 800));
          break;
        case 'rename':
          target?.setMetadata('label', `L${Math.floor(next() * 50)}`);
          break;
        case 'resize':
          target?.setSize(50 + Math.floor(next() * 200), 50 + Math.floor(next() * 100));
          break;
        case 'select':
          target?.setState({ selected: next() < 0.5 });
          break;
        case 'addNode':
          d.addNode(node(freshId(p), Math.floor(next() * 800), Math.floor(next() * 800)));
          break;
        case 'deleteNode':
          if (target) d.removeNode(target.id);
          break;
        case 'addLink': {
          // Any two nodes, including ones another peer may be deleting RIGHT NOW. That race
          // is the whole point of the exercise.
          if (nodes.length < 2) break;
          const from = pick(nodes);
          const to = pick(nodes);
          if (from.id === to.id) break;
          d.addLink(link(freshId(p), from.id, to.id));
          break;
        }
        case 'deleteLink':
          if (links.length > 0) d.removeLink(pick(links).id);
          break;
        case 'addPort':
          // A port added to a node ALREADY IN the diagram — the path that put a live
          // PortModel on the wire and replaced node.ports (a Map) with a plain object.
          if (target) {
            target.addPort(
              new PortModel({ id: `${freshId(p)}-p`, type: 'output', side: 'bottom' })
            );
          }
          break;
        case 'undo':
          p.replica.undo();
          break;
        case 'redo':
          p.replica.redo();
          break;
        case 'transactMove':
          // A grouped gesture: several registers, one undo step.
          p.replica.transact(() => {
            target?.setPosition(Math.floor(next() * 800), Math.floor(next() * 800));
            target?.setSize(60 + Math.floor(next() * 100), 60);
          });
          break;
      }
    };

    const shuffle = <T>(xs: readonly T[]): T[] => {
      const c = [...xs];
      for (let i = c.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [c[i], c[j]] = [c[j], c[i]];
      }
      return c;
    };

    // --- the session: act, and let the network be the network ---------------
    for (let round = 0; round < rounds; round++) {
      for (const p of peers) {
        if (next() < 0.85) act(p);
      }

      // Deliver a RANDOM CHUNK of one peer's pending ops to another, out of order. Partial,
      // late and reordered delivery is the normal case, not the exotic one.
      if (peers.length > 1 && next() < 0.7) {
        const from = pick(peers);
        const to = pick(peers.filter((p) => p !== from));
        const take = Math.max(1, Math.floor(next() * from.outbox.length));
        const chunk = shuffle(from.outbox.slice(0, take));
        to.replica.receive(chunk);
      }
    }

    // --- settle: everyone learns everything, twice, out of order -------------
    // Convergence is a claim about peers that have seen the SAME SET of ops. Getting them
    // there is the precondition, not the thing under test.
    for (let pass = 0; pass < 2; pass++) {
      const everything = peers.flatMap((p) => [...p.replica.history()]);
      for (const p of peers) p.replica.receive(shuffle(everything));
    }

    // --- the assertions ------------------------------------------------------
    const ctx = { seed, peerCount };

    for (let i = 1; i < peers.length; i++) {
      expectConverged(peers[0].replica.diagram, peers[i].replica.diagram, {
        ...ctx,
        pair: `${peers[0].name}~${peers[i].name}`,
      });
    }

    // They agree — but do they agree on something VALID? Two peers can converge perfectly on
    // a broken document, which is exactly what makes a dangling link so dangerous.
    for (const p of peers) {
      expectNoDanglingLinks(p.replica.diagram, { ...ctx, peer: p.name });
    }

    // The quarantine is part of the converged state too: a link held out of the document on
    // one peer and held IN it on another is a divergence waiting for someone to press undo.
    for (let i = 1; i < peers.length; i++) {
      expect({ ...ctx, q: peers[i].replica.quarantinedLinks }).toEqual({
        ...ctx,
        q: peers[0].replica.quarantinedLinks,
      });
    }

    peers.forEach((p) => p.replica.dispose());
    seeder.dispose();
  }

  it('200 trials, 2 peers: concurrent edits, links, deletes, undo — all converge and stay VALID', () => {
    for (let s = 1; s <= 200; s++) trial(s, 2, 14);
  });

  it('120 trials, 3 peers: a mesh relays, and a third opinion is where merge bugs hide', () => {
    // Two peers can be wrong together in ways three cannot. A third peer sees the other two
    // in a different order, which is the cheapest way to catch an ordering assumption that
    // happens to hold pairwise.
    for (let s = 1000; s < 1120; s++) trial(s, 3, 18);
  });

  it('80 trials: EVERY op delivered TWICE, in a different order — idempotence under fire', () => {
    // A WebSocket reconnect replays; a mesh peer relays what it was already sent; a peer
    // re-sends on timeout. None of that may move the document.
    for (let s = 5000; s < 5080; s++) trial(s, 2, 16);
  });
});

describe('FUZZ: the ops themselves survive the wire', () => {
  it('every op a real session produces is JSON-safe, and a round-trip changes nothing', () => {
    // Ops cross a network and a disk. An op carrying a live class instance (which is what
    // trackChange('ports', null, <PortModel>) hands the capture layer) LOOKS fine in memory
    // and arrives as something else entirely — or, worse, arrives as a plain object that
    // replaces a Map and takes the receiving peer's node apart from the inside.
    const { next, pick } = rng(31337);
    const ops: Op[] = [];
    const r = new Replica(new DiagramModel('wire'), { actor: 'a', onLocalOp: (o) => ops.push(o) });

    r.diagram.addNode(node('n1', 0, 0));
    r.diagram.addNode(node('n2', 300, 0));
    r.diagram.addLink(link('l1', 'n1', 'n2'));
    for (let i = 0; i < 40; i++) {
      const n = pick(r.diagram.getNodes());
      if (!n) break;
      switch (pick(['move', 'label', 'port', 'state'] as const)) {
        case 'move': n.setPosition(Math.floor(next() * 500), Math.floor(next() * 500)); break;
        case 'label': n.setMetadata('label', `L${i}`); break;
        case 'port': n.addPort(new PortModel({ id: `p${i}`, type: 'input', side: 'top' })); break;
        case 'state': n.setState({ selected: next() < 0.5 }); break;
      }
    }
    expect(ops.length).toBeGreaterThan(20);

    // THE ROUND TRIP. Not "it stringifies" — that a peer fed the ops that came OFF the wire
    // lands in the same place as one fed the ops in memory.
    const overTheWire: Op[] = JSON.parse(JSON.stringify(ops));
    for (const op of overTheWire) {
      expect(typeof op.clock).toBe('number');
      expect(typeof op.actor).toBe('string');
    }

    const direct = new Replica(new DiagramModel(r.diagram.name, {
      id: r.diagram.id, uuid: r.diagram.uuid,
    }), { actor: 'direct' });
    const wired = new Replica(new DiagramModel(r.diagram.name, {
      id: r.diagram.id, uuid: r.diagram.uuid,
    }), { actor: 'wired' });
    direct.receive(ops);
    wired.receive(overTheWire);

    // The ports are still a Map on the far side — the assertion that would have caught the
    // PortModel-on-the-wire bug at once.
    for (const n of wired.diagram.getNodes()) {
      expect(n.ports instanceof Map).toBe(true);
      expect(n.getPorts().length).toBe(r.diagram.getNode(n.id)!.getPorts().length);
    }

    expectConverged(direct.diagram, wired.diagram, { via: 'json' });
    expectConverged(wired.diagram, r.diagram, { via: 'author' });

    [r, direct, wired].forEach((p) => p.dispose());
  });
});
