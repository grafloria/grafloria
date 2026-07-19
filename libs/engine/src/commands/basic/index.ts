// Basic commands index

export * from './AddNodeCommand';
export * from './RemoveNodeCommand';
export * from './MoveNodeCommand';
export * from './MoveGroupCommand'; // wave12/connect-ergonomics (drag subflow → members follow)
export * from './ResizeNodeCommand';
export * from './AddLinkCommand';
export * from './RemoveLinkCommand';
export * from './SetParentCommand'; // Phase 1.6a Part 5
export * from './AddGroupCommand'; // Phase 1.6c Part 3
export * from './RemoveGroupCommand'; // Phase 1.6c Part 3
export * from './AddToGroupCommand'; // Phase 1.6c Part 3
export * from './RemoveFromGroupCommand'; // Phase 1.6c Part 3
export * from './ExpandGroupCommand'; // Phase 1.6c Part 3
export * from './CollapseGroupCommand'; // Phase 1.6c Part 3
export * from './SetLayoutCommand'; // Phase 1.7 Part 2
export * from './SetFlexItemCommand'; // Phase 1.7 Part 2
export * from './SetGridItemCommand'; // Phase 1.7 Part 2
export * from './CopyCommand'; // Phase 1.8
export * from './PasteCommand'; // Phase 1.8
export * from './DuplicateCommand'; // Phase 1.8
export * from './DeleteSelectionCommand'; // Phase 1.8
export * from './CutCommand'; // wave3/interaction
export * from './resolveLinkNodeIds'; // wave3/interaction
export * from './UpdateLinkStyleCommand'; // wave4/edges
export * from './SetLinkLabelsCommand'; // wave4/edges
// wave4/interaction: the clone re-id recipe is public now — the Halo's clone/fork
// tools (in @grafloria/renderer) must mint fresh port ids exactly the way Paste does,
// and it was only reachable via a deep relative import.
export * from './remapNodePortIds';
export * from './RotateNodeCommand'; // wave4/interaction (rotate handle)
export * from './SetNodeLabelCommand'; // wave4/interaction (in-place text editing)
export * from './SetLinkPointsCommand'; // wave4/interaction (vertex tools)
export * from './SetStrokePointsCommand'; // wave13/stroke-edit (the edit tool's commit)
export * from './StrokeLifecycleCommands'; // draw + erase as undoable gestures (live audit)
export * from './ReconnectLinkCommand'; // wave12 (reconnect undo)
export * from './SetLinkLabelCommand'; // wave4/interaction (in-place text editing)

export * from './PortCommands'; // wave6/ports (dynamic auto-ports)

// C — node stacking order as undoable commands (dashboard z-order).
export * from './NodeZOrderCommands';
