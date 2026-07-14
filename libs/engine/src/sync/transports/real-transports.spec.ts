// Wave 9 — Card 5: THE TRANSPORTS, AGAINST THE REAL THING.
//
// The prompt was explicit that a WebSocket adapter I could not test against a real socket
// would be a liability, and it is right. So neither of these is mocked:
//
//   • WebSocket — a REAL `ws` server, on a REAL port, over REAL TCP on localhost, with two
//     REAL sockets, a real document edit, and a real mid-session reconnect.
//   • BroadcastChannel — the REAL one. It is a Node ≥18 global as well as a browser
//     primitive, so the same class that gives users cross-tab multiplayer is exercised here
//     for real, with no fake in the path.
//
// `ws` is a devDependency of the workspace and is imported ONLY in this spec. The transport
// itself programs against the WebSocket INTERFACE, so the library gains no dependency and
// still runs on the browser's native global. That is the entire reason the seam is shaped
// the way it is.
//
// WHAT IS NOT HERE: WebRTC. See the header of `websocket.ts` — a DataChannel presents this
// same interface, so the transport would be a near-copy, but the part that IS WebRTC is the
// SIGNALLING, and proving that needs a signalling server and two real browsers. Shipping an
// adapter I could only test against a mocked RTCDataChannel would be precisely the
// "machinery wired to nothing" this codebase keeps finding, so I did not ship it.

import { WebSocketServer, WebSocket } from 'ws';
import type { AddressInfo } from 'net';
import { DiagramModel } from '../../models/DiagramModel';
import { NodeModel } from '../../models/NodeModel';
import { Replica } from '../../collab/replica';
import { replay } from '../../collab/op-log';
import type { Op } from '../../collab/op';
import { createSyncSession, type SyncAdapter } from '../sync-adapter';
import { WebSocketTransport, type WebSocketLike } from './websocket';
import { BroadcastChannelTransport } from './broadcast-channel';

function node(id: string, x = 0, y = 0): NodeModel {
  const n = new NodeModel({ type: 'basic', position: { x, y }, size: { width: 100, height: 50 } });
  (n as unknown as { id: string }).id = id;
  return n;
}

const SEED: { name: string; id: string; uuid: string; ops: Op[] } = (() => {
  const base = new DiagramModel('shared');
  const ops: Op[] = [];
  const seeder = new Replica(new DiagramModel(base.name, { id: base.id, uuid: base.uuid }), {
    actor: 'seed',
    onLocalOp: (o) => ops.push(o),
  });
  seeder.diagram.addNode(node('n1', 0, 0));
  seeder.dispose();
  return { name: base.name, id: base.id, uuid: base.uuid, ops };
})();

function seeded(): DiagramModel {
  const d = new DiagramModel(SEED.name, { id: SEED.id, uuid: SEED.uuid });
  replay(d, SEED.ops);
  return d;
}

/** Poll until `predicate` holds. Real sockets are async; a fixed sleep is a flake generator. */
async function until(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('timed out waiting for the network');
    await new Promise((r) => setTimeout(r, 5));
  }
}

// ===========================================================================
// WEBSOCKET — a real server, a real port, real sockets.
// ===========================================================================
describe('WebSocketTransport — against a REAL ws server', () => {
  let wss: WebSocketServer;
  let url: string;

  beforeAll(async () => {
    // ---------------------------------------------------------------------------
    // THE ENTIRE SERVER. This is not a stub of a bigger one — it IS the reference
    // implementation, and the whole server contract is the one sentence it implements:
    //
    //     Broadcast every frame you receive to every other socket in the room, verbatim.
    //
    // No parsing. No ordering. No storage. No idea what an op is. Catch-up, causality and
    // merge are all done by the PEERS, which is why a production relay only has to add the
    // things a product needs (auth, rooms, persistence) and none of the things a
    // collaboration engine needs.
    // ---------------------------------------------------------------------------
    wss = new WebSocketServer({ port: 0 });
    wss.on('connection', (socket) => {
      socket.on('message', (data) => {
        for (const peer of wss.clients) {
          if (peer !== socket && peer.readyState === WebSocket.OPEN) {
            peer.send(data.toString());
          }
        }
      });
    });
    await new Promise<void>((resolve) => wss.once('listening', () => resolve()));
    url = `ws://localhost:${(wss.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => wss.close(() => resolve()));
  });

  function socketPeer(actor: string): SyncAdapter {
    const transport = new WebSocketTransport({
      url,
      // `ws`'s client satisfies the standard WebSocket surface this transport programs
      // against. The BROWSER's native WebSocket satisfies it too — that is the point, and it
      // is why the engine needs no socket dependency of its own.
      socketFactory: (u) => new WebSocket(u) as unknown as WebSocketLike,
      reconnectBaseMs: 20,
    });
    const a = createSyncSession(seeded(), transport, {
      actor,
      batch: { intervalMs: 5 },
    });
    a.join();
    return a;
  }

  it('two peers over real sockets: an edit crosses the wire and lands', async () => {
    const alice = socketPeer('alice');
    const bob = socketPeer('bob');
    await until(() => alice.awareness !== undefined && bob.stats.messagesReceived > 0);

    alice.diagram.getNode('n1')!.setPosition(111, 222);
    alice.diagram.addNode(node('over-the-wire', 50, 60));

    await until(() => bob.diagram.getNode('over-the-wire') !== undefined);
    expect(bob.diagram.getNode('n1')!.position).toMatchObject({ x: 111, y: 222 });

    alice.dispose();
    bob.dispose();
  });

  it('RECONNECT over a real socket: Bob drops, BOTH edit, Bob comes back, they converge', async () => {
    // The headline of the card, and this is it happening over TCP rather than in a fixture.
    const alice = socketPeer('alice');
    const bob = socketPeer('bob');
    await until(() => bob.stats.messagesReceived > 0 && alice.stats.messagesReceived > 0);

    // ---- the socket goes down ---------------------------------------------------------
    const bobCable = (bob as unknown as { transport: WebSocketTransport }).transport;
    bobCable.disconnect();
    await until(() => bobCable.status === 'disconnected');

    // Both keep working, neither hearing the other.
    bob.diagram.addNode(node('bob-offline', 1, 1));
    bob.diagram.getNode('n1')!.setMetadata('label', 'bob worked offline');
    alice.diagram.addNode(node('alice-online', 2, 2));
    alice.diagram.getNode('n1')!.setSize(640, 480);
    await new Promise((r) => setTimeout(r, 30)); // let the batchers fire into the void

    expect(alice.diagram.getNode('bob-offline')).toBeUndefined();
    expect(bob.diagram.getNode('alice-online')).toBeUndefined();

    // ---- the socket comes back --------------------------------------------------------
    bobCable.connect();

    await until(
      () =>
        alice.diagram.getNode('bob-offline') !== undefined &&
        bob.diagram.getNode('alice-online') !== undefined
    );

    for (const p of [alice, bob]) {
      expect(p.diagram.getNode('n1')!.getMetadata('label')).toBe('bob worked offline');
      expect(p.diagram.getNode('n1')!.size).toMatchObject({ width: 640, height: 480 });
    }

    alice.dispose();
    bob.dispose();
  });

  it('auto-reconnects with BACKOFF when the socket dies underneath it', async () => {
    const transport = new WebSocketTransport({
      url,
      socketFactory: (u) => new WebSocket(u) as unknown as WebSocketLike,
      reconnectBaseMs: 10,
      reconnectMaxMs: 100,
    });
    transport.connect();
    await until(() => transport.status === 'connected');

    const attemptsBefore = transport.attempts;

    // Kill it from the SERVER side — an unexpected close, not a `disconnect()`.
    for (const client of wss.clients) client.terminate();

    await until(() => transport.status === 'connected' && transport.attempts > attemptsBefore);
    expect(transport.attempts).toBeGreaterThan(attemptsBefore);

    transport.close();
  });

  it('a garbage frame does not take the document down', async () => {
    // Someone else's protocol on your port is a config error, not a reason to lose a user's
    // work. (And `onerror` is deliberately inert: a socket error is ALWAYS followed by a
    // close, so recovering from both would open two sockets for one failure and orphan one.)
    const alice = socketPeer('alice');
    await until(() => alice.stats.messagesSent > 0);

    const raw = new WebSocket(url);
    await new Promise<void>((resolve) => raw.once('open', () => resolve()));
    raw.send('this is not json');
    raw.send('{"valid":"json","but":"not a message"}');
    await new Promise((r) => setTimeout(r, 40));

    alice.diagram.getNode('n1')!.setPosition(7, 7); // still alive
    expect(alice.diagram.getNode('n1')!.position).toMatchObject({ x: 7, y: 7 });

    raw.close();
    alice.dispose();
  });
});

// ===========================================================================
// BROADCASTCHANNEL — the real global. Cross-tab multiplayer, no server.
// ===========================================================================
describe('BroadcastChannelTransport — against the REAL BroadcastChannel', () => {
  it('is supported here at all (Node ≥18 global / browser primitive)', () => {
    expect(BroadcastChannelTransport.isSupported()).toBe(true);
  });

  it('two "tabs" on one channel: an edit in one appears in the other', async () => {
    const room = `grafloria-test-${Math.random().toString(36).slice(2)}`;

    const mk = (actor: string): SyncAdapter => {
      const a = createSyncSession(
        seeded(),
        new BroadcastChannelTransport({ name: room, actor }),
        { actor, batch: { intervalMs: 5 } }
      );
      a.join();
      return a;
    };

    const tab1 = mk('tab-1');
    const tab2 = mk('tab-2');

    tab1.diagram.getNode('n1')!.setPosition(64, 128);
    tab1.diagram.addNode(node('made-in-tab-1', 3, 4));

    // BroadcastChannel delivery is async (a task hop), so we wait rather than assume.
    await until(() => tab2.diagram.getNode('made-in-tab-1') !== undefined);
    expect(tab2.diagram.getNode('n1')!.position).toMatchObject({ x: 64, y: 128 });

    tab1.dispose();
    tab2.dispose();
  });

  it('a tab opened LATE is caught up by the tab already there', async () => {
    // The channel has NO history — a tab that was not listening missed everything, forever.
    // So the newcomer is caught up by a PEER, via `hello` + the frontier exchange, or it
    // stares at a blank canvas. On this transport anti-entropy is not belt-and-braces; it is
    // the only reason a second tab ever sees the document.
    const room = `grafloria-test-${Math.random().toString(36).slice(2)}`;

    const first = createSyncSession(
      seeded(),
      new BroadcastChannelTransport({ name: room, actor: 'first' }),
      { actor: 'first', batch: { intervalMs: 5 } }
    );
    first.join();

    first.diagram.addNode(node('before-you-arrived', 9, 9));
    first.flush();
    await new Promise((r) => setTimeout(r, 20)); // …into a channel with nobody on it

    const late = createSyncSession(
      seeded(),
      new BroadcastChannelTransport({ name: room, actor: 'late' }),
      { actor: 'late', batch: { intervalMs: 5 } }
    );
    late.join();

    await until(() => late.diagram.getNode('before-you-arrived') !== undefined);

    first.dispose();
    late.dispose();
  });

  it('carries LIVE CURSORS between tabs — and never puts one in the op log', async () => {
    const room = `grafloria-test-${Math.random().toString(36).slice(2)}`;
    const mk = (actor: string): SyncAdapter => {
      const a = createSyncSession(
        seeded(),
        new BroadcastChannelTransport({ name: room, actor }),
        { actor, batch: { intervalMs: 5 }, awarenessThrottleMs: 0 }
      );
      a.join();
      return a;
    };

    const tab1 = mk('tab-1');
    const tab2 = mk('tab-2');

    tab1.setAwareness({ name: 'Tab One', cursor: { x: 42, y: 84 } });

    await until(() => tab2.awareness.peerCount === 1);
    expect(tab2.awareness.getPeer('tab-1')!.state.cursor).toEqual({ x: 42, y: 84 });

    // …and the document's history is untouched. Across a REAL channel, not a fixture.
    expect(tab1.replica.history()).toHaveLength(0);
    expect(tab2.replica.history()).toHaveLength(0);

    tab1.dispose();
    tab2.dispose();
  });
});
