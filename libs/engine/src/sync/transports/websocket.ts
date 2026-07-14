// Wave 9 — Card 5: the WebSocket transport.
//
// ---------------------------------------------------------------------------
// WHY THIS DOES NOT `import WebSocket from 'ws'`, AND WHY THAT IS THE WHOLE POINT
// ---------------------------------------------------------------------------
//
// It programs against the WebSocket INTERFACE (`send`/`close`/`onopen`/`onmessage`/
// `onclose`/`onerror`), never against an implementation. Two things fall out of that, and
// both of them matter:
//
//   • The engine gains ZERO new dependencies. `@grafloria/engine` is a browser library; adding
//     `ws` to it to satisfy a Node test would put a Node socket implementation in every
//     user's bundle to make a test go green. That trade is never worth it.
//   • It becomes PROVABLE. `websocket-transport.spec.ts` starts a REAL `ws` server on a
//     real port, connects two REAL sockets to it, and drives two peers through a real
//     document edit and a real mid-session reconnect. `ws` is a devDependency of the
//     workspace, and it never crosses into the library.
//
// So this is not "a WebSocket adapter we could not test". It is a WebSocket adapter tested
// against a real socket, over a real TCP connection, on localhost. What I did NOT do is
// ship a SERVER — see below.
//
// ---------------------------------------------------------------------------
// THE SERVER: NOT SHIPPED, AND DELIBERATELY
// ---------------------------------------------------------------------------
//
// A production relay needs auth, room membership, persistence, backpressure, rate limits
// and an ops story. None of that belongs in a rendering engine, and a half-server that
// pretends otherwise is worse than none: people deploy it.
//
// The server contract, in its entirety, is ONE SENTENCE:
//
//     Broadcast every frame you receive to every other socket in the room, verbatim.
//
// No parsing, no ordering, no storage, no understanding of ops. That is why the test's
// server is nine lines, and those nine lines are the reference implementation:
//
//     wss.on('connection', (socket) => {
//       socket.on('message', (data) => {
//         for (const peer of wss.clients) {
//           if (peer !== socket && peer.readyState === 1) peer.send(data);
//         }
//       });
//     });
//
// If your server does more than that, the extra is YOUR product's (auth, persistence),
// not this protocol's. The catch-up, the ordering and the merge are all done by the peers.
//
// WEBRTC. The card also named it, and I have not shipped it. A DataChannel presents the
// same five members this class programs against (`send`, `close`, `onopen`, `onmessage`,
// `onclose`), so the transport itself would be a near-copy of this file — but the part
// that is actually WebRTC is the SIGNALLING (offer/answer/ICE exchange), which needs a
// signalling server and two real browsers to prove, and I cannot prove it here. Shipping a
// WebRTC adapter I could only unit-test against a mocked RTCDataChannel would be exactly
// the "machinery wired to nothing" this codebase keeps finding. So: not shipped, and the
// seam it would plug into is this file's interface, unchanged.

import type { SyncMessage } from '../protocol';
import type { SyncTransport, TransportStatus, Unsubscribe } from '../transport';

/** The standard WebSocket surface — satisfied by the browser global AND by `ws`. */
export interface WebSocketLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  readyState: number;
  onopen: ((event?: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event?: unknown) => void) | null;
  onerror: ((event?: unknown) => void) | null;
}

export interface WebSocketTransportOptions {
  url: string;
  /** The constructor. Defaults to the global. `ws` satisfies this in Node. */
  socketFactory?: (url: string) => WebSocketLike;

  /**
   * Reconnect backoff. The first retry waits `reconnectBaseMs`, then doubles to a cap.
   *
   * NOT a constant delay: every tab reconnects the instant a server restarts, and a fixed
   * retry turns that into a synchronised stampede that knocks the server back over. Set
   * `reconnect: false` to own the policy yourself.
   */
  reconnect?: boolean;
  reconnectBaseMs?: number;
  reconnectMaxMs?: number;

  /** Injectable, so the backoff test does not take 30 seconds of wall clock. */
  setTimer?: (cb: () => void, ms: number) => unknown;
  clearTimer?: (h: unknown) => void;
}

const OPEN = 1;

export class WebSocketTransport implements SyncTransport {
  private socket: WebSocketLike | null = null;
  private readonly handlers = new Set<(m: SyncMessage) => void>();
  private readonly statusHandlers = new Set<(s: TransportStatus) => void>();
  private _status: TransportStatus = 'disconnected';
  private closed = false;

  /** Deliberate `disconnect()` must NOT trigger the auto-reconnect. */
  private intentionalClose = false;
  private retryTimer: unknown = null;
  private retryDelay: number;

  private readonly factory: (url: string) => WebSocketLike;
  private readonly setTimerFn: (cb: () => void, ms: number) => unknown;
  private readonly clearTimerFn: (h: unknown) => void;

  /** Reconnect attempts made. Asserted on by the backoff test. */
  attempts = 0;

  constructor(private readonly options: WebSocketTransportOptions) {
    this.retryDelay = options.reconnectBaseMs ?? 250;
    this.setTimerFn = options.setTimer ?? ((cb, ms) => setTimeout(cb, ms) as unknown);
    this.clearTimerFn =
      options.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));

    this.factory =
      options.socketFactory ??
      ((url: string) => {
        const Ctor = (globalThis as { WebSocket?: new (u: string) => WebSocketLike }).WebSocket;
        if (!Ctor) throw new Error('WebSocketTransport: no global WebSocket; pass socketFactory.');
        return new Ctor(url);
      });
  }

  get status(): TransportStatus {
    return this._status;
  }

  connect(): void {
    if (this.closed || this.socket) return;
    this.intentionalClose = false;
    this.attempts++;

    const socket = this.factory(this.options.url);
    this.socket = socket;

    socket.onopen = () => {
      // Reset the backoff on a SUCCESSFUL open, not on an attempt. Resetting on attempt
      // means a server that accepts the TCP connection and then immediately dies gets
      // hammered at the base delay forever.
      this.retryDelay = this.options.reconnectBaseMs ?? 250;
      this.setStatus('connected');
    };

    socket.onmessage = (event) => {
      if (this.closed) return;
      let msg: SyncMessage;
      try {
        msg = JSON.parse(String(event.data)) as SyncMessage;
      } catch {
        // A garbage frame must not take the document down. Someone else's protocol on our
        // port is a config error, not a reason to lose a user's work.
        return;
      }
      if (!msg || typeof msg.t !== 'string') return;
      for (const h of [...this.handlers]) h(msg);
    };

    socket.onclose = () => {
      this.socket = null;
      this.setStatus('disconnected');
      if (this.closed || this.intentionalClose) return;
      if (this.options.reconnect === false) return;
      this.scheduleRetry();
    };

    // `onerror` deliberately does nothing. A WebSocket error is ALWAYS followed by a
    // close, so reconnecting from both fires two sockets for one failure — and the second
    // one is orphaned, invisible, and holds the connection open forever. One recovery
    // path, and it is `onclose`.
    socket.onerror = () => undefined;
  }

  private scheduleRetry(): void {
    if (this.retryTimer !== null) return;
    const delay = this.retryDelay;
    this.retryDelay = Math.min(this.retryDelay * 2, this.options.reconnectMaxMs ?? 10_000);
    this.retryTimer = this.setTimerFn(() => {
      this.retryTimer = null;
      if (!this.closed && !this.intentionalClose) this.connect();
    }, delay);
  }

  send(message: SyncMessage): void {
    if (this.closed) return;
    const socket = this.socket;
    // Sending into a socket that is not OPEN throws in the browser. A dropped send is not
    // a lost edit — the op is in the log, and the reconnect's sync round delivers it —
    // whereas an exception thrown out of a pointermove handler kills the drag.
    if (!socket || socket.readyState !== OPEN) return;
    socket.send(JSON.stringify(message));
  }

  onMessage(handler: (m: SyncMessage) => void): Unsubscribe {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  onStatus(handler: (s: TransportStatus) => void): Unsubscribe {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  disconnect(): void {
    this.intentionalClose = true;
    this.cancelRetry();
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.onmessage = null;
      socket.onclose = null;
      socket.onopen = null;
      socket.onerror = null;
      try {
        socket.close();
      } catch {
        /* already dead */
      }
    }
    this.setStatus('disconnected');
  }

  close(): void {
    if (this.closed) return;
    this.disconnect();
    this.closed = true;
    this.handlers.clear();
    this.statusHandlers.clear();
  }

  private cancelRetry(): void {
    if (this.retryTimer !== null) {
      this.clearTimerFn(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private setStatus(next: TransportStatus): void {
    if (this._status === next) return;
    this._status = next;
    for (const h of [...this.statusHandlers]) h(next);
  }
}
