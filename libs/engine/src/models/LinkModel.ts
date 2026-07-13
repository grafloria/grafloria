// LinkModel - Represents a connection between two ports

import { DiagramEntity } from './DiagramEntity';
import { generateId } from '../utils';
import type {
  Point,
  LinkStyle,
  LinkLabel,
  SerializedEntity,
  PathSegment,
} from '../types';

/**
 * Wave 4 (Edges & links), Card 5 — where each of the three edge label SLOTS sits
 * along the path.
 *
 * Pulled IN from the endpoints on purpose: at exactly 0 and 1 a slot label would
 * land under the arrowhead and on top of the port. 0.12 / 0.88 clears both while
 * still reading as "at the start / at the end of this edge".
 *
 * ONE definition, shared by the model (LinkModel.addLabel), the renderer
 * (LabelRenderer) and the edge optimizer — three places that must never disagree
 * about where a label actually is.
 */
export const LINK_LABEL_SLOT_POSITIONS: Record<'start' | 'center' | 'end', number> = {
  start: 0.12,
  center: 0.5,
  end: 0.88,
};

/**
 * The position along the path (0-1) a label resolves to.
 *
 * `slot` WINS over `position`. Naming a slot is an explicit act; `position` is a
 * required field that most slot users only fill in to satisfy the type, so
 * letting it win would make `slot` silently do nothing.
 */
export function linkLabelPosition(
  label: Pick<LinkLabel, 'position' | 'slot'>
): number {
  if (label.slot && label.slot in LINK_LABEL_SLOT_POSITIONS) {
    return LINK_LABEL_SLOT_POSITIONS[label.slot];
  }
  return typeof label.position === 'number' && isFinite(label.position)
    ? label.position
    : 0.5;
}

/**
 * Wave 5 (Edge routing) — Card 0. `pathType` conflated two independent choices:
 * WHERE the line goes (routing geometry) and HOW the polyline is drawn
 * (connector rendering). They are now two orthogonal, per-link, serializable
 * settings, with `pathType` kept as the back-compat shorthand that derives both
 * when the explicit fields are absent.
 *
 * Router names resolve against the engine's RoutingEngine registry, so a custom
 * registered router is addressable per link by its registration name.
 */
export type LinkRouterName =
  | 'straight'      // endpoint-to-endpoint, ignores obstacles
  | 'orthogonal'    // HVH/VHV elbows honouring port sides
  | 'manhattan'     // grid search with obstacle avoidance + direction-change cost
  | 'avoid'         // A* obstacle-avoiding router
  | 'elk'           // delegate geometry to ELK's edge router
  | (string & {});  // any custom router registered on the RoutingEngine

export type LinkConnectorName =
  | 'straight'      // straight segments, hard corners
  | 'rounded'       // straight segments, cornerRadius arcs (the orthogonal look)
  | 'smooth'        // catmull-rom-style smoothing through the points
  | 'bezier'        // cubic bezier between endpoints
  | (string & {});

export interface SerializedLink extends SerializedEntity {
  sourcePortId: string;
  targetPortId: string;
  sourceNodeId?: string;
  targetNodeId?: string;
  pathType: 'direct' | 'orthogonal' | 'smooth' | 'bezier';
  /** Card 0: explicit routing geometry; absent = derived from pathType. */
  router?: LinkRouterName;
  /** Card 0: explicit polyline rendering; absent = derived from pathType. */
  connector?: LinkConnectorName;
  points: Point[];
  segments: PathSegment[];
  labels: LinkLabel[];
  state: 'default' | 'selected' | 'hovered' | 'highlighted';
  style: Partial<LinkStyle>;
  data: Record<string, any>;
}

export class LinkModel extends DiagramEntity {
  // Connection
  sourcePortId: string;
  targetPortId: string;
  sourceNodeId?: string; // Cached for performance
  targetNodeId?: string; // Cached for performance

  // Path
  pathType: 'direct' | 'orthogonal' | 'smooth' | 'bezier' = 'smooth';
  /**
   * Card 0: WHERE the line goes. When unset, derived from pathType — see
   * {@link effectiveRouter}. Setting it does NOT touch pathType, so legacy
   * consumers keep working; the explicit field simply wins.
   */
  router?: LinkRouterName;
  /** Card 0: HOW the polyline is drawn. Unset = derived from pathType. */
  connector?: LinkConnectorName;
  points: Point[] = [];
  segments: PathSegment[] = [];

  // Labels
  labels: LinkLabel[] = [];

  // State
  state: 'default' | 'selected' | 'hovered' | 'highlighted' = 'default';

  // Styling
  style: Partial<LinkStyle> = {};

  // User data
  data: Record<string, any> = {};

  // Phase 1: Endpoint selection state (for reconnection)
  /**
   * Whether source endpoint handle is selected
   * Used for dragging endpoint to reconnect
   */
  isSourceEndpointSelected: boolean = false;

  /**
   * Whether target endpoint handle is selected
   * Used for dragging endpoint to reconnect
   */
  isTargetEndpointSelected: boolean = false;

  constructor(
    sourcePortId: string,
    targetPortId: string,
    pathType?: 'direct' | 'orthogonal' | 'smooth' | 'bezier'
  ) {
    super();

    this.sourcePortId = sourcePortId;
    this.targetPortId = targetPortId;

    if (pathType) {
      this.pathType = pathType;
    }
  }

  /**
   * Wave 4 (Edges & links) — Card 4: is this link a SELF-LOOP, i.e. do both
   * ends live on the same node?
   *
   * Reads the cached owning-node ids, which `DiagramModel.installLink` backfills
   * for every link that reaches a diagram (including ones built with
   * `new LinkModel()` + `addLink`, which carry no ids of their own). A link that
   * has never been installed has no ids and is — correctly — not a self-loop as
   * far as anything can tell.
   *
   * A self-loop between two DIFFERENT ports of the same node counts, and so does
   * one that starts and ends on the SAME port.
   */
  isSelfLoop(): boolean {
    return !!this.sourceNodeId && this.sourceNodeId === this.targetNodeId;
  }

  /**
   * Wave 4 — Card 4: the unordered node pair this link connects, as a stable
   * key. UNORDERED on purpose: A→B and B→A are the same visual bundle and must
   * fan out together, or a bidirectional pair would draw both links on the same
   * centre line. Returns null when the owning nodes are unknown.
   */
  getNodePairKey(): string | null {
    if (!this.sourceNodeId || !this.targetNodeId) return null;
    return this.sourceNodeId <= this.targetNodeId
      ? `${this.sourceNodeId}|${this.targetNodeId}`
      : `${this.targetNodeId}|${this.sourceNodeId}`;
  }

  /**
   * Set source port
   */
  setSourcePort(portId: string, nodeId?: string): void {
    const oldPortId = this.sourcePortId;
    this.sourcePortId = portId;
    if (nodeId) {
      this.sourceNodeId = nodeId;
    }
    this.trackChange('sourcePortId', oldPortId, portId);
  }

  /**
   * Set target port
   */
  setTargetPort(portId: string, nodeId?: string): void {
    const oldPortId = this.targetPortId;
    this.targetPortId = portId;
    if (nodeId) {
      this.targetNodeId = nodeId;
    }
    this.trackChange('targetPortId', oldPortId, portId);
  }

  /**
   * Set path type
   */
  setPathType(pathType: 'direct' | 'orthogonal' | 'smooth' | 'bezier'): void {
    const oldType = this.pathType;
    this.pathType = pathType;
    // The cached route belongs to the old path type; clear it so the renderer
    // re-routes with the new algorithm instead of drawing the stale polyline.
    if (oldType !== pathType) {
      this.points = [];
      this.segments = [];
      this.setMetadata('hasManualWaypoints', false);
    }
    this.trackChange('pathType', oldType, pathType);
  }

  /**
   * Card 0: set the routing geometry explicitly. Clears the cached route the
   * same way setPathType does — the old polyline belongs to the old router.
   */
  setRouter(router: LinkRouterName | undefined): void {
    const old = this.router;
    if (old === router) return;
    this.router = router;
    this.points = [];
    this.segments = [];
    this.setMetadata('hasManualWaypoints', false);
    this.trackChange('router', old, router);
  }

  /** Card 0: set the polyline rendering explicitly. Pure re-render; the routed
   * points are still valid, so the cache is NOT cleared. */
  setConnector(connector: LinkConnectorName | undefined): void {
    const old = this.connector;
    if (old === connector) return;
    this.connector = connector;
    this.trackChange('connector', old, connector);
  }

  /**
   * The router actually in force: the explicit field, else derived from
   * pathType exactly as the renderer always derived it (direct → straight,
   * orthogonal → orthogonal, smooth/bezier → straight-with-curved-rendering).
   */
  effectiveRouter(): LinkRouterName {
    if (this.router) return this.router;
    switch (this.pathType) {
      case 'orthogonal': return 'orthogonal';
      case 'direct':
      case 'smooth':
      case 'bezier':
      default: return 'straight';
    }
  }

  /** The connector actually in force: explicit field, else derived from pathType. */
  effectiveConnector(): LinkConnectorName {
    if (this.connector) return this.connector;
    switch (this.pathType) {
      case 'direct': return 'straight';
      case 'orthogonal': return 'rounded';
      case 'bezier': return 'bezier';
      case 'smooth':
      default: return 'smooth';
    }
  }

  /**
   * Set points for custom path
   */
  setPoints(points: Point[]): void {
    const oldPoints = [...this.points];
    this.points = points.map((p) => ({ ...p }));
    this.trackChange('points', oldPoints, this.points);
    this.updateSegments();
  }

  /**
   * Add point to path
   */
  addPoint(point: Point, index?: number): void {
    const actualIndex = index !== undefined ? index : this.points.length;
    if (index !== undefined) {
      this.points.splice(index, 0, { ...point });
    } else {
      this.points.push({ ...point });
    }
    this.trackChange('points', null, point);
    this.updateSegments();
    this.emitter.emit('link:point-added', { point, index: actualIndex });
  }

  /**
   * Remove point from path
   */
  removePoint(index: number): Point | undefined {
    if (index >= 0 && index < this.points.length) {
      const point = this.points.splice(index, 1)[0];
      this.trackChange('points', point, null);
      this.updateSegments();
      return point;
    }
    return undefined;
  }

  /**
   * Update segments based on points
   */
  private updateSegments(): void {
    this.segments = [];

    if (this.points.length < 2) return;

    for (let i = 0; i < this.points.length - 1; i++) {
      const from = this.points[i];
      const to = this.points[i + 1];

      if (from && to) {
        this.segments.push({
          type: 'line',
          from: { ...from },
          to: { ...to },
        });
      }
    }
  }

  /**
   * Generate path based on type
   */
  generatePath(
    sourcePoint: Point,
    targetPoint: Point,
    sourceDirection?: 'left' | 'right' | 'top' | 'bottom',
    targetDirection?: 'left' | 'right' | 'top' | 'bottom'
  ): void {
    switch (this.pathType) {
      case 'direct':
        this.generateDirectPath(sourcePoint, targetPoint);
        break;
      case 'orthogonal':
        this.generateOrthogonalPath(sourcePoint, targetPoint, sourceDirection, targetDirection);
        break;
      case 'smooth':
      case 'bezier':
        this.generateSmoothPath(sourcePoint, targetPoint);
        break;
    }

    // wave8/dirty — LATENT BUG. Every generator above rewrites `this.points` and
    // `this.segments` IN PLACE, bypassing `trackChange()` — so a link whose path
    // was regenerated by layout, live-rerouting, a node drag or connectNodes()
    // stayed CLEAN. Its rendered `d` had changed and nothing said so. The link
    // VNode cache keys off `isDirty`, and only Wave 4's per-frame geometry
    // signature (markLinksWhoseFrameChanged) was covering for it — a backstop
    // that only runs with caching on, and only for links the frame actually
    // visits. The path IS the link's state; say so.
    this.markDirty('points');

    this.emitter.emit('link:path-changed', { segments: this.segments });
  }

  /**
   * Generate direct path (straight line)
   */
  private generateDirectPath(from: Point, to: Point): void {
    this.points = [{ ...from }, { ...to }];
    this.segments = [
      {
        type: 'line',
        from: { ...from },
        to: { ...to },
      },
    ];
  }

  /**
   * Generate orthogonal path (right angles)
   * Uses React Flow's smoothstep algorithm with port directions for proper routing
   */
  private generateOrthogonalPath(
    from: Point,
    to: Point,
    sourceDirection?: 'left' | 'right' | 'top' | 'bottom',
    targetDirection?: 'left' | 'right' | 'top' | 'bottom'
  ): void {
    // If no directions provided, use simple default
    if (!sourceDirection || !targetDirection) {
      const midX = (from.x + to.x) / 2;
      this.points = [
        { ...from },
        { x: midX, y: from.y },
        { x: midX, y: to.y },
        { ...to },
      ];
      this.segments = [
        { type: 'line', from: this.points[0]!, to: this.points[1]! },
        { type: 'line', from: this.points[1]!, to: this.points[2]! },
        { type: 'line', from: this.points[2]!, to: this.points[3]! },
      ];
      return;
    }

    // React Flow smoothstep algorithm
    const gapOffset = 20;

    // Calculate offset points (gap from ports)
    let sourceOffset = this.applyGapOffset(from, sourceDirection, gapOffset);
    let targetOffset = this.applyGapOffset(to, targetDirection, gapOffset);

    // Determine routing direction
    const dir = this.getRoutingDirection(sourceOffset, sourceDirection, targetOffset);
    const dirAccessor = dir.x !== 0 ? 'x' : 'y';

    const sourceDir = this.getDirectionVector(sourceDirection);
    const targetDir = this.getDirectionVector(targetDirection);

    let intermediatePoints: Point[] = [];
    const sourceGapOffset = { x: 0, y: 0 };
    const targetGapOffset = { x: 0, y: 0 };

    // Check if ports are opposite
    const areOpposite = sourceDir[dirAccessor] * targetDir[dirAccessor] === -1;

    if (areOpposite) {
      // Z-shape routing for opposite ports
      if (dirAccessor === 'x') {
        const centerX = (sourceOffset.x + targetOffset.x) / 2;
        intermediatePoints = [
          { x: centerX, y: sourceOffset.y },
          { x: centerX, y: targetOffset.y }
        ];
      } else {
        const centerY = (sourceOffset.y + targetOffset.y) / 2;
        intermediatePoints = [
          { x: sourceOffset.x, y: centerY },
          { x: targetOffset.x, y: centerY }
        ];
      }
    } else {
      // L-shape routing for perpendicular ports
      const isSourceHorizontal = sourceDirection === 'left' || sourceDirection === 'right';
      const isTargetHorizontal = targetDirection === 'left' || targetDirection === 'right';

      if (isSourceHorizontal && !isTargetHorizontal) {
        intermediatePoints = [{ x: targetOffset.x, y: sourceOffset.y }];
      } else if (!isSourceHorizontal && isTargetHorizontal) {
        intermediatePoints = [{ x: sourceOffset.x, y: targetOffset.y }];
      } else {
        if (dirAccessor === 'x') {
          intermediatePoints = [{ x: targetOffset.x, y: sourceOffset.y }];
        } else {
          intermediatePoints = [{ x: sourceOffset.x, y: targetOffset.y }];
        }
      }

      // Handle same position ports that are too close
      if (sourceDirection === targetDirection) {
        const diff = Math.abs(from[dirAccessor] - to[dirAccessor]);
        if (diff <= gapOffset) {
          const additionalGap = Math.min(gapOffset - 1, gapOffset - diff);
          const currDir = dir[dirAccessor];

          if (sourceDir[dirAccessor] === currDir) {
            const sign = sourceOffset[dirAccessor] > from[dirAccessor] ? -1 : 1;
            sourceGapOffset[dirAccessor] = sign * additionalGap;
          } else {
            const sign = targetOffset[dirAccessor] > to[dirAccessor] ? -1 : 1;
            targetGapOffset[dirAccessor] = sign * additionalGap;
          }
        }
      }
    }

    // Apply gap offsets
    sourceOffset.x += sourceGapOffset.x;
    sourceOffset.y += sourceGapOffset.y;
    targetOffset.x += targetGapOffset.x;
    targetOffset.y += targetGapOffset.y;

    // Construct final points array
    this.points = [
      { ...from },
      sourceOffset,
      ...intermediatePoints,
      targetOffset,
      { ...to }
    ];

    // Build segments
    this.segments = [];
    for (let i = 0; i < this.points.length - 1; i++) {
      this.segments.push({
        type: 'line',
        from: { ...this.points[i]! },
        to: { ...this.points[i + 1]! }
      });
    }
  }

  /**
   * Apply gap offset in port direction
   */
  private applyGapOffset(
    point: Point,
    direction: 'left' | 'right' | 'top' | 'bottom',
    offset: number
  ): Point {
    switch (direction) {
      case 'left':
        return { x: point.x - offset, y: point.y };
      case 'right':
        return { x: point.x + offset, y: point.y };
      case 'top':
        return { x: point.x, y: point.y - offset };
      case 'bottom':
        return { x: point.x, y: point.y + offset };
    }
  }

  /**
   * Get direction vector for port orientation
   */
  private getDirectionVector(direction: 'left' | 'right' | 'top' | 'bottom'): { x: number; y: number } {
    switch (direction) {
      case 'left': return { x: -1, y: 0 };
      case 'right': return { x: 1, y: 0 };
      case 'top': return { x: 0, y: -1 };
      case 'bottom': return { x: 0, y: 1 };
    }
  }

  /**
   * Get routing direction from source to target
   */
  private getRoutingDirection(
    source: Point,
    sourcePosition: 'left' | 'right' | 'top' | 'bottom',
    target: Point
  ): { x: number; y: number } {
    if (sourcePosition === 'left' || sourcePosition === 'right') {
      return source.x < target.x ? { x: 1, y: 0 } : { x: -1, y: 0 };
    }
    return source.y < target.y ? { x: 0, y: 1 } : { x: 0, y: -1 };
  }

  /**
   * Wave 3 (Edges & links): the curve tightness of a smooth/bezier link.
   *
   * `style.curvature` is a multiplier of the endpoint distance for the
   * control-point offset. It used to be DEAD (declared on LinkStyle, read by
   * nobody); it is now the single knob both this model and the SVG renderer
   * read, so a per-link value produces the same curve whichever produced the
   * path. Default 0.5 = the historical hardcoded factor; negatives are clamped
   * to 0 (a straight chord).
   */
  static readonly DEFAULT_CURVATURE = 0.5;

  getCurvature(): number {
    const c = this.style.curvature;
    return typeof c === 'number' && isFinite(c) && c >= 0
      ? c
      : LinkModel.DEFAULT_CURVATURE;
  }

  /**
   * Generate smooth/bezier path
   */
  private generateSmoothPath(from: Point, to: Point): void {
    const dx = to.x - from.x;
    const controlOffset = Math.abs(dx) * this.getCurvature();

    this.points = [{ ...from }, { ...to }];

    this.segments = [
      {
        type: 'curve',
        from: { ...from },
        to: { ...to },
        control1: { x: from.x + controlOffset, y: from.y },
        control2: { x: to.x - controlOffset, y: to.y },
      },
    ];
  }

  /**
   * Add label
   *
   * Wave 4 (Card 5): `position` is no longer required when the label names a
   * `slot` — and every other LinkLabel field (html, template, slot, autoOffset,
   * rotation…) is now carried through instead of being silently dropped. The old
   * body hand-copied five fields, so a label created here could not be an HTML
   * label, could not auto-rotate and could not opt into auto-placement.
   */
  addLabel(
    label: Partial<LinkLabel> & { text: string } & (
        | { position: number }
        | { slot: NonNullable<LinkLabel['slot']> }
      )
  ): void {
    const fullLabel: LinkLabel = {
      ...label,
      id: label.id || generateId(),
      text: label.text,
      position: linkLabelPosition(label as LinkLabel),
      offset: label.offset || { x: 0, y: 0 },
      style: label.style,
    };
    this.labels.push(fullLabel);
    this.trackChange('labels', null, fullLabel);
    this.emitter.emit('link:label-added', fullLabel);
  }

  /**
   * Remove label by ID
   */
  removeLabel(labelId: string): LinkLabel | undefined {
    const index = this.labels.findIndex((l) => l.id === labelId);
    if (index !== -1) {
      const label = this.labels.splice(index, 1)[0];
      this.trackChange('labels', label, null);
      this.emitter.emit('link:label-removed', label);
      return label;
    }
    return undefined;
  }

  /**
   * Remove label by index
   */
  removeLabelAt(index: number): LinkLabel | undefined {
    if (index >= 0 && index < this.labels.length) {
      const label = this.labels.splice(index, 1)[0];
      this.trackChange('labels', label, null);
      this.emitter.emit('link:label-removed', label);
      return label;
    }
    return undefined;
  }

  /**
   * Update label by index
   */
  updateLabel(index: number, updates: Partial<LinkLabel>): void {
    const label = this.labels[index];
    if (label) {
      const oldLabel = { ...label };
      Object.assign(label, updates);
      this.trackChange('labels', oldLabel, label);
      this.emitter.emit('link:label-updated', { index, label });
    }
  }

  /**
   * Get label by ID
   */
  getLabel(labelId: string): LinkLabel | undefined {
    return this.labels.find((l) => l.id === labelId);
  }

  /**
   * Set state
   */
  setState(state: 'default' | 'selected' | 'hovered' | 'highlighted'): void {
    const oldState = this.state;
    this.state = state;
    this.trackChange('state', oldState, this.state);
    this.emitter.emit('link:state-changed', { oldState, newState: state });
  }

  /**
   * Update style
   */
  updateStyle(style: Partial<LinkStyle>): void {
    const oldStyle = { ...this.style };
    this.style = { ...this.style, ...style };
    this.trackChange('style', oldStyle, this.style);
    this.emitter.emit('link:style-changed', { oldStyle, newStyle: this.style });
  }

  /**
   * Set data property
   */
  setData(key: string, value: any): void {
    const oldValue = this.data[key];
    this.data[key] = value;
    this.trackChange(`data.${key}`, oldValue, value);
  }

  /**
   * Get data property
   */
  getData(key: string): any {
    return this.data[key];
  }

  /**
   * Phase 1: Reconnect source endpoint to new port
   * Used for link reconnection workflow
   */
  reconnectSource(newPortId: string, newNodeId?: string): void {
    const oldPortId = this.sourcePortId;
    const oldNodeId = this.sourceNodeId;

    this.sourcePortId = newPortId;
    if (newNodeId) {
      this.sourceNodeId = newNodeId;
    }

    this.trackChange('sourcePortId', oldPortId, newPortId);

    this.emitter.emit('link:reconnected', {
      endpoint: 'source',
      oldPortId,
      newPortId,
      oldNodeId,
      newNodeId,
    });

    // Mark dirty for re-rendering
    this.markDirty();
  }

  /**
   * Phase 1: Reconnect target endpoint to new port
   * Used for link reconnection workflow
   */
  reconnectTarget(newPortId: string, newNodeId?: string): void {
    const oldPortId = this.targetPortId;
    const oldNodeId = this.targetNodeId;

    this.targetPortId = newPortId;
    if (newNodeId) {
      this.targetNodeId = newNodeId;
    }

    this.trackChange('targetPortId', oldPortId, newPortId);

    this.emitter.emit('link:reconnected', {
      endpoint: 'target',
      oldPortId,
      newPortId,
      oldNodeId,
      newNodeId,
    });

    // Mark dirty for re-rendering
    this.markDirty();
  }

  /**
   * Phase 1: Get source endpoint position
   * Returns the first point in the path (source end)
   */
  getSourceEndpoint(): Point {
    return this.points[0] || { x: 0, y: 0 };
  }

  /**
   * Phase 1: Get target endpoint position
   * Returns the last point in the path (target end)
   */
  getTargetEndpoint(): Point {
    return this.points[this.points.length - 1] || { x: 0, y: 0 };
  }

  /**
   * Phase 1: Select source endpoint handle
   */
  selectSourceEndpoint(): void {
    this.isSourceEndpointSelected = true;
    this.isTargetEndpointSelected = false;
    this.emitter.emit('link:endpoint-selected', { endpoint: 'source' });
  }

  /**
   * Phase 1: Select target endpoint handle
   */
  selectTargetEndpoint(): void {
    this.isTargetEndpointSelected = true;
    this.isSourceEndpointSelected = false;
    this.emitter.emit('link:endpoint-selected', { endpoint: 'target' });
  }

  /**
   * Phase 1: Deselect all endpoint handles
   */
  deselectEndpoints(): void {
    this.isSourceEndpointSelected = false;
    this.isTargetEndpointSelected = false;
    this.emitter.emit('link:endpoint-deselected');
  }

  /**
   * Phase 1: Check if any endpoint is selected
   */
  hasSelectedEndpoint(): boolean {
    return this.isSourceEndpointSelected || this.isTargetEndpointSelected;
  }

  /**
   * Get point at position along link (0-1)
   */
  getPointAtPosition(t: number): Point | null {
    if (this.points.length < 2) return null;

    t = Math.max(0, Math.min(1, t));

    if (this.pathType === 'direct') {
      const from = this.points[0]!;
      const to = this.points[this.points.length - 1]!;
      return {
        x: from.x + (to.x - from.x) * t,
        y: from.y + (to.y - from.y) * t,
      };
    }

    // For other path types, use segments when they exist. Renderers that sync
    // `points` directly leave `segments` stale/empty — fall back to walking
    // the points polyline so consumers (e.g. label placement) still get a
    // real on-path position instead of the endpoint.
    const totalLength = this.getTotalLength();
    if (this.segments.length > 0 && totalLength > 0) {
      const targetLength = totalLength * t;
      let currentLength = 0;

      for (const segment of this.segments) {
        const segmentLength = this.getSegmentLength(segment);
        if (currentLength + segmentLength >= targetLength) {
          const segmentT = segmentLength > 0 ? (targetLength - currentLength) / segmentLength : 0;
          return this.getPointOnSegment(segment, segmentT);
        }
        currentLength += segmentLength;
      }
      return this.points[this.points.length - 1] || null;
    }

    // Polyline fallback: arc-length interpolation over points
    let polyLength = 0;
    for (let i = 0; i < this.points.length - 1; i++) {
      polyLength += Math.hypot(this.points[i + 1]!.x - this.points[i]!.x, this.points[i + 1]!.y - this.points[i]!.y);
    }
    if (polyLength <= 0) return { ...this.points[0]! };

    let remaining = polyLength * t;
    for (let i = 0; i < this.points.length - 1; i++) {
      const a = this.points[i]!;
      const b = this.points[i + 1]!;
      const segLen = Math.hypot(b.x - a.x, b.y - a.y);
      if (remaining <= segLen) {
        const st = segLen > 0 ? remaining / segLen : 0;
        return { x: a.x + (b.x - a.x) * st, y: a.y + (b.y - a.y) * st };
      }
      remaining -= segLen;
    }
    return { ...this.points[this.points.length - 1]! };
  }

  /**
   * Get total path length
   */
  getTotalLength(): number {
    return this.segments.reduce(
      (sum, segment) => sum + this.getSegmentLength(segment),
      0
    );
  }

  /**
   * Get segment length
   */
  private getSegmentLength(segment: PathSegment): number {
    const dx = segment.to.x - segment.from.x;
    const dy = segment.to.y - segment.from.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Get point on segment
   */
  private getPointOnSegment(segment: PathSegment, t: number): Point {
    if (segment.type === 'curve' && segment.control1 && segment.control2) {
      // Cubic bezier
      const t2 = t * t;
      const t3 = t2 * t;
      const mt = 1 - t;
      const mt2 = mt * mt;
      const mt3 = mt2 * mt;

      return {
        x:
          mt3 * segment.from.x +
          3 * mt2 * t * segment.control1.x +
          3 * mt * t2 * segment.control2.x +
          t3 * segment.to.x,
        y:
          mt3 * segment.from.y +
          3 * mt2 * t * segment.control1.y +
          3 * mt * t2 * segment.control2.y +
          t3 * segment.to.y,
      };
    }

    // Linear interpolation for line segments
    return {
      x: segment.from.x + (segment.to.x - segment.from.x) * t,
      y: segment.from.y + (segment.to.y - segment.from.y) * t,
    };
  }

  // ========================================
  // Phase 4: Advanced Path Calculations
  // ========================================

  /**
   * Get path length (alias for getTotalLength for API consistency)
   */
  getLength(): number {
    return this.getTotalLength();
  }

  /**
   * Get tangent (direction vector) at position along path (0-1)
   * Returns normalized direction vector
   */
  getTangentAt(t: number): Point | null {
    if (this.segments.length === 0) return null;

    t = Math.max(0, Math.min(1, t));

    // For direct path, tangent is constant
    if (this.pathType === 'direct' && this.points.length >= 2) {
      const from = this.points[0]!;
      const to = this.points[this.points.length - 1]!;
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      return length > 0 ? { x: dx / length, y: dy / length } : { x: 1, y: 0 };
    }

    // Find segment at position t
    const totalLength = this.getTotalLength();
    const targetLength = totalLength * t;
    let currentLength = 0;

    for (const segment of this.segments) {
      const segmentLength = this.getSegmentLength(segment);
      if (currentLength + segmentLength >= targetLength) {
        const segmentT = segmentLength > 0 ? (targetLength - currentLength) / segmentLength : 0;
        return this.getTangentOnSegment(segment, segmentT);
      }
      currentLength += segmentLength;
    }

    // Fallback to last segment direction
    const lastSegment = this.segments[this.segments.length - 1];
    return lastSegment ? this.getTangentOnSegment(lastSegment, 1) : { x: 1, y: 0 };
  }

  /**
   * Get tangent on a specific segment
   */
  private getTangentOnSegment(segment: PathSegment, t: number): Point {
    if (segment.type === 'curve' && segment.control1 && segment.control2) {
      // Cubic bezier derivative
      const mt = 1 - t;
      const mt2 = mt * mt;
      const t2 = t * t;

      const dx =
        3 * mt2 * (segment.control1.x - segment.from.x) +
        6 * mt * t * (segment.control2.x - segment.control1.x) +
        3 * t2 * (segment.to.x - segment.control2.x);

      const dy =
        3 * mt2 * (segment.control1.y - segment.from.y) +
        6 * mt * t * (segment.control2.y - segment.control1.y) +
        3 * t2 * (segment.to.y - segment.control2.y);

      const length = Math.sqrt(dx * dx + dy * dy);
      return length > 0 ? { x: dx / length, y: dy / length } : { x: 1, y: 0 };
    }

    // Linear segment
    const dx = segment.to.x - segment.from.x;
    const dy = segment.to.y - segment.from.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    return length > 0 ? { x: dx / length, y: dy / length } : { x: 1, y: 0 };
  }

  /**
   * Get normal (perpendicular vector) at position along path (0-1)
   * Returns normalized perpendicular vector (90° counter-clockwise from tangent)
   */
  getNormalAt(t: number): Point | null {
    const tangent = this.getTangentAt(t);
    if (!tangent) return null;

    // Rotate tangent 90° counter-clockwise
    return {
      x: -tangent.y,
      y: tangent.x,
    };
  }

  /**
   * Get closest point on path to a given point
   * Returns the closest point, distance, and normalized position (t)
   */
  getClosestPoint(point: Point): { point: Point; distance: number; t: number } | null {
    if (this.segments.length === 0) {
      return null;
    }

    let closestPoint: Point | null = null;
    let minDistance = Infinity;
    let closestT = 0;
    let cumulativeLength = 0;
    const totalLength = this.getTotalLength();

    for (let i = 0; i < this.segments.length; i++) {
      const segment = this.segments[i]!;
      const segmentLength = this.getSegmentLength(segment);

      // Sample points along segment to find closest
      const samples = 20;
      for (let j = 0; j <= samples; j++) {
        const segmentT = j / samples;
        const samplePoint = this.getPointOnSegment(segment, segmentT);
        const dx = samplePoint.x - point.x;
        const dy = samplePoint.y - point.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < minDistance) {
          minDistance = distance;
          closestPoint = samplePoint;
          // Calculate global t
          closestT = totalLength > 0 ? (cumulativeLength + segmentLength * segmentT) / totalLength : 0;
        }
      }

      cumulativeLength += segmentLength;
    }

    if (!closestPoint) {
      return null;
    }

    return {
      point: closestPoint,
      distance: minDistance,
      t: closestT,
    };
  }

  /**
   * Get angle at position along path (0-1) in degrees
   * Useful for label rotation
   */
  getAngleAt(t: number): number | null {
    const tangent = this.getTangentAt(t);
    if (!tangent) return null;

    return (Math.atan2(tangent.y, tangent.x) * 180) / Math.PI;
  }

  /**
   * Serialize to JSON
   */
  override serialize(): SerializedLink {
    return {
      id: this.id,
      uuid: this.uuid,
      type: 'link',
      version: this.version,
      metadata: Object.fromEntries(this.metadata),
      sourcePortId: this.sourcePortId,
      targetPortId: this.targetPortId,
      sourceNodeId: this.sourceNodeId,
      targetNodeId: this.targetNodeId,
      pathType: this.pathType,
      // Card 0: only when explicitly set — legacy documents stay byte-identical,
      // which the round-trip invariant enforces.
      ...(this.router !== undefined ? { router: this.router } : {}),
      ...(this.connector !== undefined ? { connector: this.connector } : {}),
      points: this.points.map((p) => ({ ...p })),
      segments: this.segments.map((s) => ({ ...s })),
      labels: this.labels.map((l) => ({ ...l })),
      state: this.state,
      style: { ...this.style },
      data: { ...this.data },
    };
  }

  /**
   * Deserialize from JSON
   */
  static fromJSON(data: SerializedLink): LinkModel {
    const link = new LinkModel(
      data.sourcePortId,
      data.targetPortId,
      data.pathType
    );

    // Restore ID (no constructor param exists for it) and persisted
    // identity/version via the sanctioned entity helper.
    (link as unknown as { id: string }).id = data.id;
    link.restoreIdentity(data);

    link.sourceNodeId = data.sourceNodeId;
    link.targetNodeId = data.targetNodeId;
    if (data.router !== undefined) link.router = data.router;
    if (data.connector !== undefined) link.connector = data.connector;
    link.points = data.points.map((p) => ({ ...p }));
    link.segments = data.segments.map((s) => ({ ...s }));
    link.labels = data.labels.map((l) => ({ ...l }));
    link.state = data.state;
    link.style = data.style;
    link.data = data.data;

    // Restore metadata
    for (const [key, value] of Object.entries(data.metadata)) {
      link.metadata.set(key, value);
    }

    return link;
  }
}
