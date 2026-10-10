/**
 * Who owns undo for a diagram.
 *
 * By default the engine's own CommandManager does. A collaborative Replica takes it over
 * (`DiagramModel.setHistoryOwner`) because its stack is per ACTOR: undo takes back MY edits
 * and never a peer's, which a plain command stack cannot know. Once an owner is set, the
 * CommandManager routes undo/redo/canUndo/canRedo to it and frames every command it executes
 * as ONE step; the canvas frames every press (down to up) as one step the same way.
 *
 * Steps NEST: only the outermost begin/end pair makes the step.
 */
export interface HistoryOwner {
  beginStep(): void;
  endStep(): void;
  undo(): unknown;
  redo(): unknown;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}
