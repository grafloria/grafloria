// port-types.ts — Wave 6 (Ports & connections): the declarative port vocabulary.
//
// Every type here is DATA. None of it renders, routes or validates on its own —
// the renderer (glyphs, labels, spots), the layout engine (port-layout) and the
// connection validator (connection-rules) each consume it. That split is
// deliberate: the wave-6 audit's single biggest finding was "config declared but
// never consumed" (`PortModel.style`, `PortModel.visible`,
// `renderingConfig.svg.shape`, `InteractionConfig.highlightValidTargets` were
// ALL dead), so this module exists only alongside the code that reads it.
//
// DEFAULTS ARE THE OLD BEHAVIOUR. A port that sets none of these fields must
// resolve to exactly what Grafloria rendered and validated before wave 6 — that is
// what keeps every existing diagram byte-identical.

// ===========================================================================
// Glyph
// ===========================================================================

/**
 * The port's rendered marker. `circle` is the historical (and default) glyph;
 * everything else is new in wave 6.
 *
 * `path` renders a caller-supplied SVG path (`PortShapeSpec.path`), authored in
 * a box of `size` centred on the port's anchor point.
 */
export type PortGlyphShape = 'circle' | 'square' | 'diamond' | 'triangle' | 'path';

export interface PortShapeSpec {
  shape: PortGlyphShape;
  /**
   * Full width AND height of the glyph box, in px. For a circle this is the
   * DIAMETER (so `size: 12` === the legacy `portDefaultRadius: 6`). Omit to
   * inherit `InteractionConfig.portDefaultRadius * 2`.
   */
  size?: number;
  /** Non-square glyphs: override one axis. Falls back to `size`. */
  width?: number;
  height?: number;
  /** shape:'path' only — SVG path data, centred on (0,0) in a `size` box. */
  path?: string;
  /** Rotate the glyph about its own centre, in degrees. */
  rotation?: number;
}

// ===========================================================================
// Label
// ===========================================================================

/**
 * Where a port's label sits relative to the glyph.
 *
 * - `inside`     — pulled INTO the node body, opposite the port's outward normal.
 * - `outside`    — pushed AWAY from the node, along the outward normal (default).
 * - `orthogonal` — offset perpendicular to the outward normal (reads along the
 *                  edge, so a column of side ports doesn't stack labels on the
 *                  same line).
 * - `radial`     — offset along the ray from the node's centre through the port;
 *                  the layout that actually works on ellipse / circle nodes,
 *                  where "outward normal" and "away from centre" are the same
 *                  thing only at the four cardinal points.
 */
export type PortLabelLayout = 'inside' | 'outside' | 'orthogonal' | 'radial';

export interface PortLabelSpec {
  text: string;
  /** Default 'outside'. */
  layout?: PortLabelLayout;
  /** Gap from the glyph EDGE (not its centre), in px. Default 6. */
  offset?: number;
  /** Extra rotation applied to the label, in degrees. Default 0. */
  angle?: number;
  /**
   * Auto-flip a label whose total rotation would leave it upside-down
   * (|angle| > 90°) by adding 180°, so text always reads left-to-right.
   * Default true.
   */
  keepUpright?: boolean;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number | string;
  color?: string;
  /** Wrap width for the shared text-block engine. */
  maxWidth?: number;
  className?: string;
  /**
   * Opt OUT of collision-aware nudging (see `port-label.ts`). Default false —
   * i.e. crowded labels ARE nudged apart by default.
   */
  noNudge?: boolean;
}

// ===========================================================================
// Link attachment spots
// ===========================================================================

/**
 * A named point on the port's glyph box. `default` means "whatever the port's
 * side implies" — the outward-facing edge midpoint, which is the historical
 * attachment behaviour (the glyph CENTRE, since the legacy glyph had no box).
 */
export type PortSpotName =
  | 'default'
  | 'center'
  | 'top'
  | 'right'
  | 'bottom'
  | 'left'
  | 'topLeft'
  | 'topRight'
  | 'bottomLeft'
  | 'bottomRight';

export type PortEdge = 'left' | 'right' | 'top' | 'bottom';

export interface PortSpot {
  spot: PortSpotName;
  /**
   * The direction a link LEAVES (fromSpot) or APPROACHES (toSpot) the port.
   * Defaults to the port's side — i.e. the outward normal — which is what the
   * orthogonal router has always been handed.
   */
  direction?: PortEdge;
  /** Push the attachment point this many px further along `direction`. */
  distance?: number;
}

/**
 * Spread N links landing on ONE port along that port's edge instead of piling
 * them all on the centre point.
 *
 * Disabled by default: a port with one link never moves, and a port with many
 * links keeps its pre-wave-6 pile unless the author opts in. (Byte-stability.)
 */
export interface PortSpreadSpec {
  enabled: boolean;
  /** Gap between adjacent lanes, in px. Default 10. */
  spacing?: number;
  /**
   * Cap the number of distinct lanes; links beyond the cap reuse the outermost
   * lane. 0 (default) = uncapped.
   */
  max?: number;
}

// ===========================================================================
// Layout strategies
// ===========================================================================

/**
 * Named port-layout strategies (Card 4). `shape` is the DEFAULT and the
 * pre-wave-6 behaviour: defer to the shape registry's `portAnchor`, which knows
 * the true silhouette of every shape (cylinder rim seam, actor hands, hexagon
 * flats…). Every other strategy is an explicit opt-in that overrides it.
 */
export type PortLayoutStrategyName =
  | 'shape'
  | 'absolute'
  | 'line'
  | 'sideLinear'
  | 'ellipse'
  | 'ellipseSpread';

export interface PortLayoutArgs {
  // -- absolute ------------------------------------------------------------
  /** Absolute position. Fractions of the node box by default; px when `units:'px'`. */
  x?: number;
  y?: number;
  units?: 'fraction' | 'px';

  // -- line ----------------------------------------------------------------
  /** Spread ports evenly from `start` to `end` (node-local px). */
  start?: { x: number; y: number };
  end?: { x: number; y: number };
  /**
   * Fixed spacing between consecutive ports, in px. When set, ports march from
   * `start` toward `end` at this pitch instead of dividing the span evenly.
   */
  step?: number;

  // -- sideLinear ----------------------------------------------------------
  /** Inset from the corners of the edge, in px. Default 0. */
  padding?: number;

  // -- ellipse / ellipseSpread --------------------------------------------
  /** Start angle in degrees (0° = +x axis, growing clockwise in screen space). */
  angle?: number;
  /** Arc span in degrees. Default 360 (a full ring). */
  sweep?: number;
  /** Radii, in px. Default: the node's half-extents (the inscribed ellipse). */
  radiusX?: number;
  radiusY?: number;

  // -- shared --------------------------------------------------------------
  /** Constant nudge applied after the strategy, in node-local px. */
  dx?: number;
  dy?: number;
  /**
   * Counter-rotate the port about the node's centre by the node's own rotation,
   * so a rotated node's ports keep their WORLD-space arrangement. Default false.
   */
  compensateRotation?: boolean;
}

export interface PortLayoutSpec {
  strategy: PortLayoutStrategyName;
  args?: PortLayoutArgs;
}

// ===========================================================================
// Connection gating
// ===========================================================================

/**
 * Directional connectability (Card 2). The pre-wave-6 model had ONE total
 * `maxConnections` and no notion of "may start a link" vs "may end one", so a
 * flow-chart output that must fan out to many but accept none was inexpressible.
 *
 * Every field is optional and every default reproduces the old behaviour:
 *   isConnectableStart/End = true, from/toMaxLinks = null (unlimited),
 *   allowSelfLink = false, allowDuplicateLinks = true.
 */
export interface PortGatingSpec {
  /** May a link START here? Default true. */
  isConnectableStart?: boolean;
  /** May a link END here? Default true. */
  isConnectableEnd?: boolean;
  /** Cap on OUTGOING links. null/undefined = unlimited. */
  fromMaxLinks?: number | null;
  /** Cap on INCOMING links. null/undefined = unlimited. */
  toMaxLinks?: number | null;
  /** Cap on links in EITHER direction (the legacy knob). null = unlimited. */
  maxConnections?: number | null;
  /** Allow a link whose source node IS its target node. Default false. */
  allowSelfLink?: boolean;
  /** Allow a SECOND link between the same ordered pair of ports. Default true. */
  allowDuplicateLinks?: boolean;
  /** Restrict which port data-types / system-types may attach. Empty = no restriction. */
  allowedTypes?: string[];
}

// ===========================================================================
// Typed data-flow (Card 7)
// ===========================================================================

export interface PortDataTypeDefinition {
  /** The type's own name. */
  name: string;
  /**
   * Types this one may ALSO connect to (beyond an exact name match). `'*'`
   * means "compatible with everything" — the escape hatch for an `any` port.
   */
  compatibleWith?: string[];
  /** Affordance: the glyph colour for ports of this type. */
  color?: string;
}

/**
 * Dynamic auto-ports (Card 7): keep a group topped up with free ports so the
 * user always has somewhere to drop the next link — the node-editor pattern
 * (Blender / Unreal / n8n).
 */
export interface DynamicPortSpec {
  enabled: boolean;
  /** How many UNCONNECTED ports the group must always offer. Default 1. */
  spare?: number;
  /** Hard cap on total ports in the group. 0 (default) = uncapped. */
  max?: number;
  /** Id prefix for spawned ports. Default `<groupId>-`. */
  idPrefix?: string;
}

// ===========================================================================
// Port groups (Card 3)
// ===========================================================================

export type PortVisibilityMode = 'always' | 'on-hover' | 'never' | 'hidden';

/**
 * A named, reusable bundle of port config on a node type. Ports name their
 * group and override ONLY what differs — replacing the old
 * top/right/bottom/left-only `PortsConfig`, in which "eight typed inputs down
 * the left edge, each with a label" could not be said at all.
 */
export interface PortGroupDefinition {
  id: string;
  /** Default side for members that don't declare one. */
  side?: PortEdge;
  layout?: PortLayoutSpec;
  shape?: PortShapeSpec;
  /** Raw SVG presentation attributes merged onto the glyph (fill, stroke, …). */
  style?: Record<string, unknown>;
  /** Label defaults. Members supply/override `text`. */
  label?: Partial<PortLabelSpec>;
  visibility?: PortVisibilityMode;
  gating?: PortGatingSpec;
  /** Default port direction (input/output/bi) for members. */
  type?: 'input' | 'output' | 'bi';
  dataType?: string;
  fromSpot?: PortSpot;
  toSpot?: PortSpot;
  spread?: PortSpreadSpec;
  dynamic?: DynamicPortSpec;
}

/**
 * A port's config with its group folded in — what the renderer and the
 * validator actually read. Produced by `resolvePortConfig()`.
 */
/**
 * Gating with every question ANSWERED — no `undefined` anywhere, because a
 * validator that has to ask "was this unset or set to false?" is a validator
 * with a bug waiting in it. `null` is the explicit "unlimited" for the caps.
 */
export interface ResolvedPortGating {
  isConnectableStart: boolean;
  isConnectableEnd: boolean;
  allowSelfLink: boolean;
  allowDuplicateLinks: boolean;
  fromMaxLinks: number | null;
  toMaxLinks: number | null;
  maxConnections: number | null;
  allowedTypes: string[];
}

export interface ResolvedPortConfig {
  side: PortEdge;
  layout?: PortLayoutSpec;
  shape?: PortShapeSpec;
  style: Record<string, unknown>;
  label?: PortLabelSpec;
  visibility?: PortVisibilityMode;
  gating: ResolvedPortGating;
  dataType?: string;
  fromSpot?: PortSpot;
  toSpot?: PortSpot;
  spread?: PortSpreadSpec;
  dynamic?: DynamicPortSpec;
  /** The group this resolved from, if any. */
  groupId?: string;
}

/** The gating defaults — every one of them reproduces pre-wave-6 behaviour. */
export const DEFAULT_PORT_GATING: ResolvedPortGating = {
  isConnectableStart: true,
  isConnectableEnd: true,
  allowSelfLink: false,
  allowDuplicateLinks: true,
  fromMaxLinks: null,
  toMaxLinks: null,
  maxConnections: null,
  allowedTypes: [],
};

export const DEFAULT_PORT_LABEL_OFFSET = 6;
export const DEFAULT_PORT_SPREAD_SPACING = 10;
