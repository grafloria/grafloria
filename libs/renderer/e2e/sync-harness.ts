// Wave 9 (Collaboration) — Card 5: THE CROSS-TAB HARNESS.
//
// One page = one TAB = one user. `sync-run.mjs` opens TWO of them, in the same browser
// context on the same origin, and drives a real mouse across one while reading the other.
//
// There is no fixture in the path. The BroadcastChannel is the browser's own. The transport
// is the shipped one. The renderer, the event binder, the patcher, the Replica and the
// presence overlay are all the real ones. If a node moves in tab 2, it moved because tab 1
// really told it to, over a real browser IPC channel, and nothing in this file helped.

import { DiagramModel, NodeModel, createSyncSession, BroadcastChannelTransport } from '@grafloria/engine';
import type { SyncAdapter } from '@grafloria/engine';
import { createDiagram, bindPresence, LIGHT_THEME } from '@grafloria/renderer';
import type { DiagramInstance } from '@grafloria/renderer';

const ROOM = 'grafloria-e2e-room';

function node(id: string, x: number, y: number): NodeModel {
  const n = new NodeModel({
    type: 'basic',
    position: { x, y },
    size: { width: 140, height: 70 },
  });
  (n as unknown as { id: string }).id = id;
  n.setMetadata('label', id);
  return n;
}

interface Session {
  instance: DiagramInstance;
  adapter: SyncAdapter;
}

let session: Session | null = null;

/**
 * Mount this tab.
 *
 * `seed` is true for the tab that creates the document. The other tab starts EMPTY and must
 * be caught up by anti-entropy — which on a BroadcastChannel is not belt-and-braces, it is
 * the only way a second tab ever sees the document at all: the channel has no history, so a
 * tab that was not listening missed everything, permanently.
 */
function mount(actor: string, name: string, seed: boolean): void {
  const host = document.getElementById('canvas') as HTMLElement;

  const instance = createDiagram(host, { nodes: [], edges: [], theme: LIGHT_THEME });
  const model: DiagramModel = instance.getModel();

  const adapter = createSyncSession(
    model,
    new BroadcastChannelTransport({ name: ROOM, actor }),
    {
      actor,
      batch: { intervalMs: 16 }, // one message per frame, like a real drag
      awarenessThrottleMs: 30,
      heartbeatMs: 2000,
    }
  );
  adapter.join();

  bindPresence(instance, adapter, { name });

  if (seed) {
    model.addNode(node('alpha', 120, 120));
    model.addNode(node('beta', 480, 300));
    adapter.flush();
  }

  session = { instance, adapter };
  (window as unknown as { __READY__: boolean }).__READY__ = true;
}

/** What this tab currently believes. Read by the runner from the OTHER tab. */
function state(): {
  nodes: Array<{ id: string; x: number; y: number; label: unknown }>;
  cursors: Array<{ actor: string; transform: string; label: string | null; visible: boolean }>;
  outlines: string[];
  logLength: number;
  painted: number;
  peers: number;
} {
  const model = session!.instance.getModel();

  const cursors = [...document.querySelectorAll('.grafloria-presence-cursor')].map((el) => {
    const e = el as HTMLElement;
    return {
      actor: e.getAttribute('data-actor') ?? '',
      transform: e.style.transform,
      label: e.querySelector('.grafloria-presence-label')?.textContent ?? null,
      visible: e.style.display !== 'none',
    };
  });

  return {
    nodes: model.getNodes().map((n) => ({
      id: n.id,
      x: Math.round(n.position.x),
      y: Math.round(n.position.y),
      label: n.getMetadata('label'),
    })),
    cursors,
    outlines: [...document.querySelectorAll('.grafloria-presence-selection')].map(
      (el) => el.getAttribute('data-entity') ?? ''
    ),
    // The op log — asserted to be free of cursor traffic.
    logLength: session!.adapter.replica.history().length,
    // The DIAGRAM's paint count. Remote cursors must not move it.
    painted: session!.instance.scheduler.stats.painted,
    peers: session!.adapter.awareness.peerCount,
  };
}

/** Yank the cable on this tab, so the runner can prove the reconnect. */
function goOffline(): void {
  (session!.adapter as unknown as { transport: BroadcastChannelTransport }).transport.disconnect();
}

function goOnline(): void {
  (session!.adapter as unknown as { transport: BroadcastChannelTransport }).transport.connect();
}

/** An edit that does NOT go through the mouse — for the offline-divergence phase. */
function addNode(id: string, x: number, y: number): void {
  session!.instance.getModel().addNode(node(id, x, y));
  session!.adapter.flush();
}

function repaint(): void {
  session!.instance.renderNow();
}

Object.assign(window as unknown as Record<string, unknown>, {
  __mount: mount,
  __state: state,
  __offline: goOffline,
  __online: goOnline,
  __add: addNode,
  __repaint: repaint,
});
