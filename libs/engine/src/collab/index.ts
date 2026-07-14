// Wave 9 (Collaboration) — Card 0: the operation substrate.
//
// The op log is the thing every other collaboration card stands on: CRDT convergence
// (Card 4), the sync transport (Card 5), anchored comments (Card 6) and presentation
// mode (Card 7) all consume it. It exists because the engine's TWO existing candidates
// could not do the job:
//
//   • Command.serialize() is WRITE-ONLY — there is no deserializer anywhere in the tree.
//   • DiagramIncremental is a WHOLE-ENTITY diff — so a concurrent move and rename of the
//     same node silently throws one of them away.
//
// Ops are per-PROPERTY, carry a Lamport clock (causality, not wall time), sort into a
// total order identical on every peer, and are captured from `trackChange` — the single
// funnel every mutation in this engine already passes through.

export { LamportClock, compareOps, opId } from './op';
export type { ActorId, Op, AddOp, RemoveOp, SetOp, OpPath, OpTarget, OpValue } from './op';

export { applyOp, applyEntitySet, OpApplyError } from './apply-op';
export { OpLog, replay } from './op-log';
export { OpCapture } from './capture';
export type { OpCaptureOptions, OpBefore } from './capture';

export { Replica } from './replica';
export type { ReplicaOptions } from './replica';
export { LwwRegistry } from './lww';
export type { Stamp } from './lww';

// Card 4. The one invariant a diagram cannot survive breaking, and the undo that knows it
// is not alone in the room.
export { ReferentialIntegrity } from './integrity';
export { UndoStack } from './undo';

// ===========================================================================
// THERE IS NO YJS BINDING, AND THIS IS WHERE YOU WOULD HAVE LOOKED FOR IT
// ===========================================================================
//
// Card 4 asked for "an optional binding to Yjs for teams already standardized on it". It was
// not built. The reasoning, so that nobody has to reconstruct it:
//
// WHAT WOULD IT BUY? Not convergence — we have that. Yjs's Y.Map is a per-key LWW register
// map, which is exactly, precisely what `LwwRegistry` already is. Adopting Yjs would replace
// the one part of this system that was already correct, small, and free.
//
// The honest answer is INTEROP: a team with a running y-websocket server, y-indexeddb for
// offline, and y-protocols/awareness for presence could point them at this engine. That is a
// real thing to want. It is also a TRANSPORT concern, and this engine is already transport-
// agnostic: a Replica needs nothing but something that can move an array of JSON ops
// (`onLocalOp` out, `receive()` in). Wave 9's sync card is building exactly that seam. A Yjs
// binding would not open a door that is already open.
//
// AND IT WOULD PUNCH A HOLE. Everything this card actually spent its time on lives ABOVE the
// register layer, and the mutation matrix proves each piece is load-bearing:
//
//     • referential integrity  (a link whose endpoint node is gone must not survive)
//     • the presence barrier   (a write older than an entity's incarnation is void)
//     • repair-from-log        (an `add` must not clobber writes newer than itself)
//     • canonical entity order (Map insertion order is paint order, and it must converge)
//     • supersession-aware undo
//
// Yjs supplies NONE of them. A peer merging through a Y.Doc would hold dangling links,
// diverge on resurrection, and paint overlapping nodes in a different order — while believing
// it had converged, because at the register level it HAD. So the binding is either a second,
// weaker convergence path (a correctness hole, and the worst kind: silent), or it is all five
// mechanisms re-implemented on top of Y.Doc observers — at which point Yjs is contributing a
// wire format, in exchange for a hard dependency and a mapping layer to keep in step forever.
//
// The one thing Yjs would genuinely add is Y.Text: character-level merge of two people typing
// in the same node label, where we take last-writer-wins. That is a real gap and it is a
// SMALL one — a diagram label is a few words, every diagram tool on the market does LWW on it,
// and if we ever want it, the answer is a text CRDT on that one register, not a document model
// swap.
//
// So: not built. Last wave an agent built a canvas tier, measured it at 8.9× slower than what
// we had, and deleted its own card; that was the best result of the wave. A roadmap sentence
// is not a reason.

