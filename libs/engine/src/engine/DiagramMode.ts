// DiagramMode.ts - Diagram mode definitions and types

/**
 * Diagram mode enum - defines the operational mode of the diagram engine
 */
export enum DiagramMode {
  /**
   * Designer mode - Full editing capabilities (default)
   * - All node/link operations enabled
   * - Create, edit, delete, move, resize nodes
   * - Create and delete links
   */
  DESIGNER = 'designer',

  /**
   * Running mode - Execution/simulation mode
   * - Editing disabled
   * - Nodes selectable for execution flow visualization
   * - No structural changes allowed
   */
  RUNNING = 'running',

  /**
   * View mode - Read-only viewing
   * - All editing disabled
   * - Nodes selectable for inspection
   * - Pure viewing experience
   */
  VIEW = 'view',

  /**
   * Debug mode - Debugging mode
   * - Similar to running but with debug capabilities
   * - Breakpoints, step-through, inspection
   * - No structural changes allowed
   */
  DEBUG = 'debug',

  /**
   * Presentation mode - Clean presentation view
   * - All editing disabled
   * - Nodes selectable for navigation
   * - Clean UI without clutter
   */
  PRESENTATION = 'presentation',
}

/**
 * Mode change event payload
 */
export interface ModeChangeEvent {
  previousMode: DiagramMode;
  currentMode: DiagramMode;
}

/**
 * Type guard to check if a string is a valid DiagramMode
 */
export function isValidDiagramMode(mode: string): mode is DiagramMode {
  return Object.values(DiagramMode).includes(mode as DiagramMode);
}
