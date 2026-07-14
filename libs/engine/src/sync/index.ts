// Wave 9 (Collaboration) — Card 5: the transport layer.
//
// Card 0 built a Replica that can merge. This makes it MULTIPLAYER: a transport-agnostic
// SyncAdapter that owns the four things every transport would otherwise get wrong on its
// own — catch-up after a reconnect, causal readiness, batching, and awareness — plus the
// presence channel that must never, under any circumstances, enter the op log.
//
//   createSyncSession(diagram, transport, { actor })   ← the one call a host makes
//
// Transports shipped: in-memory (two panes in one page; the test substrate),
// BroadcastChannel (real cross-tab multiplayer, no server), WebSocket (proven against a
// real `ws` server). WebRTC is NOT shipped — see transports/websocket.ts for why.

export { SyncAdapter, createSyncSession } from './sync-adapter';
export type { SyncAdapterOptions, SyncSessionOptions, SyncStats } from './sync-adapter';

export type { SyncTransport, TransportStatus, Unsubscribe as TransportUnsubscribe } from './transport';
export type {
  SyncMessage,
  HelloMessage,
  OpsMessage,
  AwarenessMessage,
  ByeMessage,
  AwarenessState,
} from './protocol';
export { isDocumentMessage } from './protocol';

export { Awareness } from './awareness';
export type { AwarenessChange, AwarenessOptions, PeerPresence } from './awareness';

export { VersionVector, deltaFor } from './version-vector';
export type { ActorFrontier, VersionVectorJSON } from './version-vector';

export { OpBatcher, coalesce } from './batcher';
export type { OpBatcherOptions } from './batcher';

export { CausalBuffer } from './causal-buffer';
export type { CausalBufferOptions, CausalSplit } from './causal-buffer';

export { MemoryHub, MemoryTransport } from './transports/memory';
export { UnreliableHub, mulberry32 } from './transports/unreliable';
export type { UnreliableOptions } from './transports/unreliable';
export { BroadcastChannelTransport } from './transports/broadcast-channel';
export type {
  BroadcastChannelLike,
  BroadcastChannelTransportOptions,
} from './transports/broadcast-channel';
export { WebSocketTransport } from './transports/websocket';
export type { WebSocketLike, WebSocketTransportOptions } from './transports/websocket';
