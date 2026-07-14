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
