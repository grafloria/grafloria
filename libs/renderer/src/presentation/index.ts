// Wave 9 (Collaboration) — Card 7: presentation & read-only share mode.
//
// The read-only ENFORCEMENT is not here — it lives in the engine, at the model and
// the CommandManager (libs/engine/src/models/readonly-lock.ts), because that is
// where mutation actually happens. This module is the presentation layer on top:
// locking, and the follow-presenter transport seam.
export * from './viewport-channel';
export * from './presentation';
