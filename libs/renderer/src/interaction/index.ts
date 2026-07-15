// Interaction tools exports
// Phase 2.3: Interactive link editing

export * from './WaypointEditor';
export * from './ControlPointEditor';

// Framework-agnostic interaction brain (Angular's InteractionHandlerService is
// a thin @Injectable subclass of this).
export * from './interaction-controller';

// Wave 4 — Card 5: the floating tool layer (resize/rotate handles, Halo,
// link endpoint + vertex tools), the highlighter layer, and in-place text editing.
export * from './selection-tools';
export * from './highlighters';
export * from './in-place-editor';

// Wave 4 — Card 6: snaplines, equal-spacing guides, grid snap, keep-in-bounds,
// magnetic snap-to-port and proximity connect.
export * from './snapping';

// Wave 4 — Card 7: keyboard-first + accessible canvas interaction.
export * from './keyboard-navigation';

// wave10/whiteboard: the freehand-draw / rectangle / eraser tools, and the separate
// overlay layer the in-progress stroke draws on (the presence pattern, for the frame gate).
export * from './whiteboard-tools';
export * from './ink-overlay';
