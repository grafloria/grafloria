// InteractionConfig - Configuration for diagram interaction modes
// This is part of Phase 1: Engine Foundation for interaction modes

/**
 * Interaction modes for node dragging and connection creation
 */
export enum InteractionMode {
  /**
   * Direct Mode: Click+drag body=move immediately, drag port=connect
   * Fast workflow, industry standard
   */
  DIRECT = 'direct',

  /**
   * Deliberate Mode: Must select node first, then drag to move
   * Safer workflow, prevents accidental moves
   */
  DELIBERATE = 'deliberate',

  /**
   * Smart Mode (Visio-style): Hover reveals ports, intelligent auto-connect
   * Ports appear on hover, drop on body connects to nearest port
   */
  SMART = 'smart',
}

/**
 * Port visibility strategies
 */
export enum PortVisibilityStrategy {
  /**
   * Ports always visible
   * Best for technical diagrams with few ports
   */
  ALWAYS = 'always',

  /**
   * Ports visible only when hovering over node
   * Industry standard, reduces visual clutter
   */
  ON_HOVER = 'on-hover',

  /**
   * Ports hidden - drag-to-connect disabled
   * For diagrams where connections are created programmatically
   */
  HIDDEN = 'hidden',
}

/**
 * Connection line style for preview
 */
export enum ConnectionLineStyle {
  /**
   * Straight line from port to mouse
   */
  STRAIGHT = 'straight',

  /**
   * Smooth bezier curve
   */
  BEZIER = 'bezier',

  /**
   * Step function (orthogonal)
   */
  STEP = 'step',
}

/**
 * Interaction configuration
 */
export interface InteractionConfig {
  /**
   * Interaction mode (direct, deliberate, smart)
   */
  mode: InteractionMode;

  /**
   * Port visibility strategy
   */
  portVisibility: PortVisibilityStrategy;

  /**
   * Port hover scale factor (e.g., 1.5 = 50% larger on hover)
   */
  portHoverScaleFactor: number;

  /**
   * Port default radius in pixels
   */
  portDefaultRadius: number;

  /**
   * Snap to port radius in pixels
   * Connection will snap when mouse is within this distance
   */
  snapToPortRadius: number;

  /**
   * Show connection preview line while dragging
   */
  showConnectionPreview: boolean;

  /**
   * Connection line style for preview
   */
  connectionLineStyle: ConnectionLineStyle;

  /**
   * Enable link endpoint reconnection
   */
  enableLinkReconnection: boolean;

  /**
   * Show endpoint handles on selected links
   */
  showLinkEndpointHandles: boolean;

  /**
   * Enable smart mode nearest port auto-connect
   * When enabled, dropping on node body connects to nearest port
   */
  enableSmartAutoConnect: boolean;

  /**
   * Highlight valid connection targets during drag
   */
  highlightValidTargets: boolean;

  /**
   * Show animated dots on connection preview
   */
  animateConnectionPreview: boolean;

  /**
   * Phase 2.3: Enable waypoint editing on links
   * Allow users to add/move/remove waypoints by clicking/dragging link paths
   */
  enableWaypointEditing: boolean;

  /**
   * Phase 2.3: Show waypoint handles on selected links
   */
  showWaypointHandles: boolean;

  /**
   * Phase 2.3: Waypoint editor configuration
   */
  waypointEditor?: WaypointEditorConfig;
}

/**
 * Phase 2.3: Waypoint editor configuration
 */
export interface WaypointEditorConfig {
  /**
   * Snap waypoints to grid
   */
  snapToGrid: boolean;

  /**
   * Grid size for snapping (in pixels)
   */
  gridSize: number;

  /**
   * Remove waypoint on double-click
   */
  removeOnDoubleClick: boolean;

  /**
   * Waypoint handle radius (in pixels)
   */
  handleRadius: number;

  /**
   * Waypoint handle color
   */
  handleColor: string;

  /**
   * Waypoint handle stroke color
   */
  handleStrokeColor: string;

  /**
   * Minimum distance from endpoints to add waypoint (in pixels)
   */
  minDistanceFromEndpoints: number;

  /**
   * Maximum distance from path to detect click (in pixels)
   */
  clickDetectionRadius: number;
}

/**
 * Default interaction configuration
 * Optimized for modern diagramming workflows
 */
export const DEFAULT_INTERACTION_CONFIG: InteractionConfig = {
  mode: InteractionMode.SMART,
  portVisibility: PortVisibilityStrategy.ON_HOVER,
  portHoverScaleFactor: 1.5,
  portDefaultRadius: 6,
  snapToPortRadius: 30,
  showConnectionPreview: true,
  connectionLineStyle: ConnectionLineStyle.BEZIER,
  enableLinkReconnection: true,
  showLinkEndpointHandles: true,
  enableSmartAutoConnect: true,
  highlightValidTargets: true,
  animateConnectionPreview: true,
  // Phase 2.3: Waypoint editing defaults
  enableWaypointEditing: false,  // Disabled by default for backward compatibility
  showWaypointHandles: true,
  waypointEditor: {
    snapToGrid: false,
    gridSize: 20,
    removeOnDoubleClick: true,
    handleRadius: 5,
    handleColor: '#3b82f6',
    handleStrokeColor: '#ffffff',
    minDistanceFromEndpoints: 30,
    clickDetectionRadius: 10,
  },
};

/**
 * Direct mode preset (fast workflow)
 */
export const DIRECT_MODE_CONFIG: Partial<InteractionConfig> = {
  mode: InteractionMode.DIRECT,
  portVisibility: PortVisibilityStrategy.ALWAYS,
  portHoverScaleFactor: 1.3,
};

/**
 * Deliberate mode preset (safe workflow)
 */
export const DELIBERATE_MODE_CONFIG: Partial<InteractionConfig> = {
  mode: InteractionMode.DELIBERATE,
  portVisibility: PortVisibilityStrategy.ON_HOVER,
  portHoverScaleFactor: 1.5,
};

/**
 * Smart mode preset (Visio-style)
 */
export const SMART_MODE_CONFIG: Partial<InteractionConfig> = {
  mode: InteractionMode.SMART,
  portVisibility: PortVisibilityStrategy.ON_HOVER,
  portHoverScaleFactor: 1.5,
  enableSmartAutoConnect: true,
  highlightValidTargets: true,
};
