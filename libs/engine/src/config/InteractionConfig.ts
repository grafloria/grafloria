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
   * Movement threshold in screen pixels that separates a click from a drag.
   * A pointer must travel farther than this from its down position before a
   * gesture is treated as a drag (node move / marquee) rather than a click.
   * This is what prevents a plain click from micro-jittering a node's position.
   * Default: 4.
   */
  dragThreshold: number;

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

  /**
   * Phase 2.3: Enable control point editing on bezier curves
   * Allow users to adjust bezier control points by dragging handles
   */
  enableControlPointEditing: boolean;

  /**
   * Phase 2.3: Show control point handles on selected bezier links
   */
  showControlPointHandles: boolean;

  /**
   * Phase 2.3: Control point editor configuration
   */
  controlPointEditor?: ControlPointEditorConfig;

  /**
   * wave12/connect-ergonomics (gap 1) — Drag a group's frame to move the whole
   * subflow: the container and every member node (recursively through nested
   * groups) translate by the same delta, committed as ONE undoable step.
   *
   * Opt-in (default false) so steady-state is untouched: with it off, a press on
   * a group's empty frame area still falls through to clear-selection exactly as
   * before. A press on a MEMBER NODE always drags that node (the node wins the
   * priority ladder) regardless of this flag.
   */
  enableGroupDrag: boolean;

  /**
   * wave12/connect-ergonomics (gap 2) — React-Flow "Proximity Connect": after a
   * node drag, if one of its ports comes within `proximityConnectRadius` of a
   * compatible port on another node, auto-create the link on drop (one undoable
   * command). Drives the shipped `SnapController.findProximityConnection` from
   * the LIVE drag path, not from host glue. Default false (opt-in).
   */
  enableProximityConnect: boolean;

  /**
   * wave12/connect-ergonomics (gap 2) — Auto-link radius in world units for
   * {@link enableProximityConnect}. Defaults to `DEFAULT_SNAP_CONFIG`'s value
   * when unset/0.
   */
  proximityConnectRadius: number;

  /**
   * wave15/helper-lines — React-Flow "Helper Lines": while dragging a single
   * top-level node, snap it to sibling edge/centre alignments and equal
   * spacing, and draw the guides as dashed overlay lines. The SnapController
   * always could compute this; nothing drove it from a live drag until now.
   * Default false (opt-in) so the stock drag feel is unchanged.
   */
  enableHelperLines: boolean;

  /**
   * wave12/connect-ergonomics (gap 3) — React-Flow "Easy Connect": make the
   * whole node BODY a connection handle. A press on a node body (not over a
   * specific port) starts a connection from the node's nearest/default port
   * instead of a move. Default false (opt-in) so normal body-drag-to-move is
   * preserved; when on, hold no modifier to connect and the configured
   * {@link easyConnectModifier} (if any) still gates it.
   */
  enableEasyConnect: boolean;

  /**
   * wave12/connect-ergonomics (gap 3) — Optional modifier that must be held for
   * an easy-connect body press to start a connection (e.g. 'shift'). When
   * 'none' (the default) any plain body press connects while {@link
   * enableEasyConnect} is on. Lets a host keep body-drag-to-move as the default
   * gesture and gate connect behind a key.
   */
  easyConnectModifier: 'none' | 'shift' | 'alt' | 'ctrl' | 'meta';
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
 * Phase 2.3: Control point editor configuration
 */
export interface ControlPointEditorConfig {
  /**
   * Snap control points to grid
   */
  snapToGrid: boolean;

  /**
   * Grid size for snapping (in pixels)
   */
  gridSize: number;

  /**
   * Control point handle radius (in pixels)
   */
  handleRadius: number;

  /**
   * Control point handle color
   */
  handleColor: string;

  /**
   * Control point handle stroke color
   */
  handleStrokeColor: string;

  /**
   * Control line color (line from anchor to control point)
   */
  controlLineColor: string;

  /**
   * Control line stroke width
   */
  controlLineWidth: number;

  /**
   * Control line dash pattern (e.g., [5, 5] for dashed)
   */
  controlLineDash: number[];

  /**
   * Maximum distance from control handle to detect click (in pixels)
   */
  clickDetectionRadius: number;

  /**
   * Show control lines connecting anchors to control points
   */
  showControlLines: boolean;

  /**
   * Auto-generate symmetric control points (mirror on both sides)
   */
  symmetricControls: boolean;
}

/**
 * Default interaction configuration
 * Optimized for modern diagramming workflows
 */
export const DEFAULT_INTERACTION_CONFIG: InteractionConfig = {
  mode: InteractionMode.SMART,
  dragThreshold: 4,
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
  // Phase 2.3: Control point editing defaults
  enableControlPointEditing: false,  // Disabled by default for backward compatibility
  showControlPointHandles: true,
  controlPointEditor: {
    snapToGrid: false,
    gridSize: 20,
    handleRadius: 6,
    handleColor: '#10b981',
    handleStrokeColor: '#ffffff',
    controlLineColor: '#6b7280',
    controlLineWidth: 1,
    controlLineDash: [5, 5],
    clickDetectionRadius: 10,
    showControlLines: true,
    symmetricControls: false,
  },
  // wave12/connect-ergonomics — all three opt-in so steady-state is untouched.
  enableGroupDrag: false,
  enableProximityConnect: false,
  proximityConnectRadius: 0, // 0 → fall back to DEFAULT_SNAP_CONFIG.proximityConnectRadius
  enableHelperLines: false,
  enableEasyConnect: false,
  easyConnectModifier: 'none',
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
