// Model type definitions for diagram entities

export interface SerializedEntity {
  id: string;
  uuid: string;
  type: string;
  version: number;
  metadata: Record<string, any>;
}

export interface NodeState {
  visible: boolean;
  locked: boolean;
  selected: boolean;
  hovered: boolean;
  /**
   * Draw attention to the node without selecting it (search hits, traversal
   * highlights, "related" emphasis). Independent of `selected`; when both are
   * set, `selected` wins in the renderer's state precedence.
   */
  highlighted?: boolean;
  focused: boolean;
  expanded: boolean;
  enabled: boolean;
  error?: string;
  warning?: string;
  // Phase 1: Status-based animations
  status?: 'idle' | 'pending' | 'running' | 'completed' | 'error' | 'warning';
  animateStatus?: boolean;  // Enable automatic status-based animations
}

export interface NodeBehavior {
  selectable: boolean;
  draggable: boolean;
  resizable: boolean;
  rotatable: boolean;
  deletable: boolean;
  editable: boolean;
  connectable: boolean;
  groupable: boolean;
  cloneable: boolean;
  dragHandler?: {
    isDragHandler: boolean;
    dragChildren?: boolean;
  };
}

export interface NodeStyle {
  shape?: string; // Shape type (rectangle, circle, diamond, etc.)
  /**
   * Extra CSS class(es) put verbatim on the rendered element, alongside
   * `diagram-node` and the state classes. Purely a hook for host CSS — the
   * renderer never reads it back (React Flow's "className on every element").
   */
  className?: string;
  /**
   * Name(s) of NAMED STYLES to apply — the classDef / linkStyle equivalent.
   * Space-separated (`'critical dashed'`, later names win). Defined with
   * `defineStyle(name, style)` and resolved by the renderer's cascade:
   *   theme < type-default < named-class < element-inline < state
   * so an own property on this style object always beats the named style.
   */
  styleClass?: string;
  // Phase 4 (styling & theming): fill/stroke accept a paint-server SPEC OBJECT
  // (gradient/pattern) as well as a plain colour string. When an object is
  // supplied the renderer materialises a deduped <defs> entry and references it
  // via url(#…). (Types declared later in this file.)
  fill?: string | LinearGradient | RadialGradient | Pattern;
  stroke?: string | LinearGradient | RadialGradient | Pattern;
  strokeWidth?: number;
  strokeDasharray?: string;
  opacity?: number;
  // `true` keeps the legacy always-on drop-shadow VNode; a Shadow SPEC OBJECT
  // materialises an SVG feDropShadow <filter> referenced via url(#…).
  shadow?: boolean | Shadow;
  borderRadius?: number;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string; // normal, bold, etc.
  fontStyle?: string; // normal, italic, oblique
  textDecoration?: string; // underline, overline, line-through
  color?: string;
  padding?: number;
  zIndex?: number;
  // Phase 1: Border animations
  animatedBorder?: boolean;
  borderAnimationType?: 'gradient' | 'pulse' | 'breathe' | 'shimmer' | 'none';
  borderAnimationSpeed?: number;  // Duration in seconds
  borderAnimationColors?: string[];  // For gradient animations
}

export interface PortPosition {
  x: number; // 0-1 relative position
  y: number; // 0-1 relative position
}

export interface PortAlignment {
  side: 'left' | 'right' | 'top' | 'bottom';
  offset: number; // Pixels from edge
}

export interface LinkState {
  selected: boolean;
  hovered: boolean;
  highlighted: boolean;
  animated?: boolean;
}

// Phase 1.3: Jump point configuration
export interface JumpPointConfig {
  enabled: boolean;
  size?: number;          // Arc/gap size in pixels (default: 10)
  style?: 'arc' | 'gap' | 'bridge';  // Visual style (default: 'arc')
  detectMode?: 'all' | 'perpendicular' | 'threshold';  // Detection mode (default: 'all')
  threshold?: number;     // Angle threshold for perpendicular mode (default: 45 degrees)
}

export interface LinkStyle {
  /**
   * Extra CSS class(es) put verbatim on the rendered path, alongside
   * `diagram-link` and the state classes. Host-CSS hook; never read back.
   */
  className?: string;
  /**
   * Name(s) of NAMED STYLES to apply — the classDef / linkStyle equivalent.
   * Space-separated (later names win). See NodeStyle.styleClass; identical
   * cascade: theme < type-default < named-class < element-inline < state.
   */
  styleClass?: string;
  // Phase 4 (styling & theming): stroke accepts a paint-server SPEC OBJECT
  // (gradient/pattern) as well as a plain colour string — materialised as a
  // deduped <defs> entry and referenced via url(#…).
  stroke?: string | LinearGradient | RadialGradient | Pattern;
  strokeWidth?: number;
  strokeDasharray?: string;
  opacity?: number;
  arrowHead?: ArrowStyle;
  arrowTail?: ArrowStyle;
  /**
   * Wave 3 (Edges & links): smooth/bezier curve TIGHTNESS, as a multiplier of
   * the endpoint distance for the control-point offset. Default `0.5`
   * (unchanged legacy behaviour); `0` collapses the curve onto its chord,
   * larger values bulge harder. Honoured by both LinkModel.generateSmoothPath
   * and the SVG renderer's control-point maths, so a link looks the same
   * however its path was produced.
   */
  curvature?: number;
  /**
   * Wave 3 (Edges & links): PER-LINK orthogonal corner radius (px). Defaults to
   * the renderer's built-ins (5px for `orthogonal`, 12px for the rounded
   * fallback a `smooth` detour falls back to). `0` gives hard 90° corners.
   *
   * Safe at any size: every bend is clamped to half the shorter adjacent
   * segment. When the link also draws jump points, the radius is additionally
   * clamped (never below the built-in default) so the jump arcs keep a legal
   * window clear of the corners — jumps win over an oversized radius.
   */
  cornerRadius?: number;
  // Phase 1.3: Jump points
  jumpPoints?: JumpPointConfig;
  /**
   * Wave 4 (Edges & links) — Card 4: how THIS link behaves when it is one of
   * several links between the same pair of nodes. Per-link override of the
   * renderer-wide `parallelLinks` config.
   */
  parallel?: ParallelLinkConfig;
  /**
   * Wave 4 (Edges & links) — Card 4: how THIS link is drawn when it is a
   * SELF-LOOP (source node === target node). Ignored on ordinary links.
   */
  selfLoop?: SelfLoopConfig;
  /**
   * Wave 4 (Edges & links) — Card 5: name of a registered LINK TEMPLATE
   * (`registerLinkTemplate` in @grafloria/renderer). The template replaces the
   * link's default visuals (path + arrows + labels) with whatever VNodes it
   * returns — arbitrary SVG, or HTML through a `foreignObject`. The hit area
   * and the `data-link-id` group are still emitted by the renderer, so hit
   * testing, selection and the edge toolbar keep working unchanged.
   *
   * Deliberately a NAME, not a function: LinkStyle is serializable model state
   * and the engine must not depend on the renderer's VNode type. Same shape as
   * `styleClass` → the named-style registry.
   */
  template?: string;
  // Phase 4: Advanced styling
  gradient?: LinearGradient | RadialGradient;
  pattern?: Pattern;
  shadow?: Shadow;
  animation?: LinkAnimation;
  markers?: Marker[];  // Markers along the path
}

/**
 * Wave 4 — Card 4: auto-separation of PARALLEL links (two or more links between
 * the same pair of nodes). Without it, ERD / BPMN / state-machine diagrams stack
 * every relationship between the same two entities on top of each other.
 *
 * The links in a pair are fanned out symmetrically around the un-separated
 * route: with 2 links and spacing 16 the offsets are -8 and +8; with 3 they are
 * -16, 0, +16. Direction of the fan is the left/right normal of the source →
 * target vector, so both directions of a bidirectional pair fan consistently.
 */
export interface ParallelLinkConfig {
  /** Turn separation off for this link (it stays on the un-separated route). */
  enabled?: boolean;
  /** Distance between adjacent links in the group, in px. Default 16. */
  spacing?: number;
  /**
   * Extra offset added on top of the computed fan offset (px, signed). Lets an
   * author nudge one member of a bundle without touching the others.
   */
  offset?: number;
}

/**
 * Wave 4 — Card 4: SELF-LOOP geometry (source node === target node). The loop
 * leaves the source port, bulges away from the node body and re-enters at the
 * target port. Several self-loops on the same node nest concentrically
 * (`size + i * spacing`), so each keeps its own label slot.
 */
export interface SelfLoopConfig {
  /** How far the loop bulges away from the node body (px). Default 40. */
  size?: number;
  /**
   * Lateral span of the loop along the node's side (px). Only used when the
   * source and target attachment points coincide (or nearly do) — the two ends
   * are spread by this much so the loop has a body. Default = `size`.
   */
  width?: number;
  /** Extra size added per additional self-loop on the same node (px). Default 18. */
  spacing?: number;
  /**
   * Force the side the loop bulges out of. `'auto'` (default) uses the source
   * port's own side.
   */
  side?: 'auto' | 'top' | 'right' | 'bottom' | 'left';
}

// Phase 4: Gradient types
export interface LinearGradient {
  type: 'linear';
  x1: number;  // 0-1 normalized
  y1: number;
  x2: number;
  y2: number;
  stops: GradientStop[];
}

export interface RadialGradient {
  type: 'radial';
  cx: number;  // 0-1 normalized center
  cy: number;
  r: number;   // radius
  stops: GradientStop[];
}

export interface GradientStop {
  offset: number;  // 0-1
  color: string;
  opacity?: number;
}

// Phase 4: Pattern for fills
export interface Pattern {
  type: 'dots' | 'lines' | 'grid' | 'hatch' | 'crosshatch';
  color?: string;
  backgroundColor?: string;
  size?: number;
  spacing?: number;
}

// Phase 4: Shadow effect
export interface Shadow {
  offsetX: number;
  offsetY: number;
  blur: number;
  color: string;
}

// Phase 1 & 4: Animation
export interface LinkAnimation {
  // Phase 1: New animation types
  type: 'marching-ants' | 'flow' | 'pulse' | 'dash-flow' | 'none';
  duration?: number;  // milliseconds
  dashOffset?: number;
  // Phase 1: Animation control
  speed?: 'slow' | 'normal' | 'fast';
  direction?: 'forward' | 'reverse';
}

// Phase 4: Markers along path
export interface Marker {
  type: 'arrow' | 'circle' | 'square' | 'custom';
  position: number;  // 0-1 along path
  size?: number;
  color?: string;
}

export interface ArrowStyle {
  type: 'none' | 'arrow' | 'circle' | 'square' | 'diamond'
    // Phase 4: ERD-specific arrows
    | 'crow-foot'           // ERD many relationship (⋈)
    | 'one'                 // ERD one relationship (|)
    | 'zero-or-one'         // ERD optional relationship (O|)
    | 'zero-or-many'        // ERD optional many (O⋈)
    | 'one-or-many'         // ERD mandatory many (|⋈)
    // Phase 4: UML-specific arrows
    | 'hollow-diamond'      // UML aggregation (◇)
    | 'filled-diamond'      // UML composition (◆)
    | 'generalization'      // UML inheritance (△)
    | 'open-arrow'          // UML dependency/realization (⊳)
    | 'double-arrow'        // Bidirectional (⇄)
    // Phase 4: Additional arrows
    | 'cross'               // X mark
    | 'bar'                 // Perpendicular line (⊥)
    | 'dot'                 // Simple dot
    | 'oval'                // Oval shape
    // Wave 4 (Edges & links) — Card 5: half-arrowheads (Mermaid 11.13)
    | 'half-arrow-left'     // Only the left barb (relative to direction of travel)
    | 'half-arrow-right'    // Only the right barb
    // Wave 4 — Card 5: author-defined marker. Either `path` (raw SVG path data,
    // drawn in the marker's local frame with the tip toward +x) or `marker`
    // (the name of a marker registered with `registerMarker` in @grafloria/renderer).
    | 'custom'
    // …and any other registered marker name. Keeps literal autocompletion for
    // the built-ins while letting `registerMarker('my-thing', …)` be used by
    // name, so the catalogue is no longer a closed enum.
    | (string & {});
  size: number;
  filled: boolean;
  // Phase 4: Advanced arrow properties
  width?: number;           // Arrow width (independent of size)
  offset?: number;          // Distance from node edge
  color?: string;           // Override link color
  /**
   * Wave 4 — Card 5: raw SVG path data for a `type: 'custom'` marker. Drawn in
   * the marker's LOCAL frame: the origin is the anchor the renderer pulls back
   * from the endpoint, +x is the direction of travel. Scale it yourself (or
   * read `size` when you build the string).
   */
  path?: string;
  /**
   * Wave 4 — Card 5: name of a marker registered via `registerMarker`. Set it
   * with `type: 'custom'` (or simply put the registered name in `type`).
   */
  marker?: string;
  /**
   * Wave 4 — Card 5: distance from the custom marker's local origin to its
   * visual TIP, in the +x direction. The renderer pulls the marker back from
   * the path endpoint by exactly this much so the tip lands on the port.
   * Registered markers supply their own default; this overrides it. Default 0
   * for an unregistered `path` marker (i.e. the tip is at the origin).
   */
  tipOffset?: number;
}

/**
 * Wave 4 — Card 5: the three label SLOTS along an edge (ngx-vflow ships exactly
 * these). A slot is shorthand for a `position`: start = 0.12, center = 0.5,
 * end = 0.88 — pulled off the very endpoints so a slot label never sits under
 * an arrowhead. An explicit `position` still wins.
 */
export type LinkLabelSlot = 'start' | 'center' | 'end';

export interface LinkLabel {
  id: string;
  text: string;
  position: number; // 0-1 along the link
  offset: Point;    // Offset from link
  style?: LabelStyle;
  // Phase 4: Advanced label features
  rotation?: 'auto' | number;        // Auto-rotate with path or fixed angle
  rotationOffset?: number;           // Additional rotation offset (degrees)
  keepUpright?: boolean;             // Flip label if upside down
  textAnchor?: 'start' | 'middle' | 'end';  // Horizontal alignment
  textBaseline?: 'top' | 'middle' | 'bottom';  // Vertical alignment
  textWrap?: boolean;                // Enable multi-line wrapping
  maxWidth?: number;                 // Maximum width before wrapping
  /**
   * Auto-position this label so it does not overlap nodes, other labels or
   * links. Handled by the diagram-wide edge optimizer (Card 7): `offset` is the
   * label's PREFERRED placement and the optimizer searches outward from it only
   * when it collides. Was declared-but-dead until Wave 4.
   */
  autoOffset?: boolean;
  segmentIndex?: number;             // Place on specific segment
  /**
   * Wave 4 — Card 5: one of the three edge slots. Shorthand for `position`;
   * ignored when the label carries an explicit `position` (see LinkLabelSlot).
   */
  slot?: LinkLabelSlot;
  /**
   * Wave 4 — Card 5: render this label as ARBITRARY HTML inside a
   * `foreignObject` instead of SVG text. The string is injected verbatim, so it
   * is the author's job to keep it trusted/escaped — exactly like any
   * `innerHTML` seam.
   */
  html?: string;
  /**
   * Wave 4 — Card 5: name of a label template registered with
   * `registerLabelTemplate` (@grafloria/renderer). The template returns VNodes, so
   * it can emit SVG or a `foreignObject` full of HTML. Wins over `html`.
   */
  template?: string;
  /** Width of the HTML/template label's box (px). Default 120. */
  width?: number;
  /** Height of the HTML/template label's box (px). Default 28. */
  height?: number;
}

export interface LabelStyle {
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  background?: string;
  padding?: number;
  borderRadius?: number;
  // Phase 4: Advanced label styling
  fontWeight?: 'normal' | 'bold' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900';
  fontStyle?: 'normal' | 'italic' | 'oblique';
  textDecoration?: 'none' | 'underline' | 'overline' | 'line-through';
  border?: string;                   // Border style
  borderWidth?: number;
  shadow?: Shadow;
  opacity?: number;
  lineHeight?: number;               // For multi-line labels
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  path: string;
  message: string;
  code: string;
  severity: 'error';
}

export interface ValidationWarning {
  path: string;
  message: string;
  code: string;
  severity: 'warning';
}

import { Point } from './geometry.types';
