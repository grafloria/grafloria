import type { DiagramEngine, NodeModel, LinkModel, Point, Command } from '@grafloria/engine';
import {
  PortModel,
  LinkModel as LinkModelCtor,
  AddLinkCommand,
  isConnectionAllowedByGroup,
  // Wave 6: THE connection validator. This module used to own a rival copy.
  evaluatePortConnection,
} from '@grafloria/engine';
import type { Rectangle } from '../types/geometry.types';
// Wave 6: THE port-position function — what the renderer actually draws.
import { portWorldPosition } from '../svg/port-positioning';

/**
 * SnapController — alignment snaplines, equal-spacing guides, grid snap,
 * keep-in-bounds, magnetic snap-to-port and proximity connect (Card 6,
 * wave4/interaction).
 *
 * Framework-agnostic and pure w.r.t. the geometry it is handed: `computeSnap`
 * takes the moving box + the boxes it may align to and returns the corrected box
 * PLUS the guides a host should draw. Nothing here renders, and nothing mutates
 * the model — except the explicit port-highlight helper, which sets the same
 * `isHighlighted` / `isValidTarget` flags the renderer already draws for
 * connection dragging.
 *
 * Everything is measured in WORLD units. Hosts that want a constant on-screen
 * feel pass `snapThreshold: px / zoom` (see `DiagramCanvasComponent`).
 */

export interface SnapConfig {
  /** Master switch for alignment snaplines + equal spacing. */
  enabled: boolean;
  /** Quantise the box to a grid (applied when no alignment guide claims an axis). */
  snapToGrid: boolean;
  gridSize: number;
  /** Distance (world units) within which an alignment candidate snaps. */
  snapThreshold: number;
  /** Emit equal-spacing guides (Figma/GoJS-style distribution hints). */
  equalSpacing: boolean;
  /** World rectangle the moving box must stay inside (null = unbounded). */
  keepInBounds: Rectangle | null;
  /** Magnetic port radius — the engine's `snapToPortRadius` lives here. */
  snapToPortRadius: number;
  /** Drop-a-node-near-a-port auto-link radius (React-Flow proximity connect). */
  proximityConnectRadius: number;
}

export const DEFAULT_SNAP_CONFIG: SnapConfig = {
  enabled: true,
  snapToGrid: false,
  gridSize: 20,
  snapThreshold: 6,
  equalSpacing: true,
  keepInBounds: null,
  snapToPortRadius: 30,
  proximityConnectRadius: 60,
};

/** A single alignment snapline. `position` is the aligned coordinate. */
export interface AlignmentGuide {
  orientation: 'vertical' | 'horizontal';
  /** World x (vertical guide) or world y (horizontal guide). */
  position: number;
  /** Extent of the drawn line along the other axis. */
  from: number;
  to: number;
  kind: 'edge' | 'center';
}

/** An equal-spacing hint: two or more equal gaps, each with a distance label. */
export interface SpacingGuide {
  orientation: 'horizontal' | 'vertical';
  /** The equal gap, in world units. */
  gap: number;
  /** Human label the host draws at the segment's midpoint (e.g. "40"). */
  label: string;
  /** The measured gaps, as segments to draw. */
  segments: Array<{ x1: number; y1: number; x2: number; y2: number }>;
}

export interface SnapResult {
  /** The corrected box (grid / alignment / spacing / bounds applied). */
  box: Rectangle;
  /** Correction applied to the input box. */
  dx: number;
  dy: number;
  guides: AlignmentGuide[];
  spacing: SpacingGuide[];
}

/** A port the magnet found, with its owner. */
export interface PortHit {
  port: PortModel;
  node: NodeModel;
  /** World position of the port. */
  position: Point;
  distance: number;
}

/** A proximity-connect candidate: link `source` → `target` if the user drops here. */
export interface ProximityCandidate {
  sourcePort: PortModel;
  targetPort: PortModel;
  sourceNodeId: string;
  targetNodeId: string;
  distance: number;
}

/**
 * Can ports `a` (on `nodeA`) and `b` (on `nodeB`) be linked?
 *
 * The ONE rule shared by proximity connect (Card 6) and keyboard connect
 * (Card 7), so the two can never disagree about what is legal.
 *
 * Wave 6: it no longer OWNS that rule — it delegates to
 * `evaluatePortConnection`, the engine-side validator the connection drag also
 * runs through. Before wave 6 this function was one of THREE disagreeing copies
 * (the others: `PortModel.canConnectTo` and
 * `ConnectionStateManager.isValidConnection`), and the drift was real: this one
 * rejected duplicates and honoured `node.behavior.connectable`, the drag checked
 * neither; the drag ignored `maxConnections`, this one never heard of it. A port
 * you could legally drag to was one the magnet refused to snap to.
 *
 * `rejectDuplicatesByDefault` preserves this call site's own historical stance:
 * auto-linking a duplicate because a node drifted near is never what the user
 * meant, whatever the port's `allowDuplicateLinks` says.
 *
 * Note the argument order: `a` is the SOURCE. The rule is directional, and the
 * proximity search calls it once per orientation.
 */
export function canConnectPorts(
  a: PortModel,
  b: PortModel,
  nodeA: NodeModel,
  nodeB: NodeModel,
  engine: DiagramEngine,
  diagram: { getLinks(): LinkModel[] }
): boolean {
  return evaluatePortConnection(a, b, {
    sourceNode: nodeA,
    targetNode: nodeB,
    links: diagram.getLinks(),
    rejectDuplicatesByDefault: true,
    validators: [(source, target) => isConnectionAllowedByGroup(source, target, engine)],
  }).ok;
}

const edgesOf = (r: Rectangle) => ({
  left: r.x,
  center: r.x + r.width / 2,
  right: r.x + r.width,
  top: r.y,
  middle: r.y + r.height / 2,
  bottom: r.y + r.height,
});

export class SnapController {
  protected config: SnapConfig;

  constructor(config: Partial<SnapConfig> = {}) {
    this.config = { ...DEFAULT_SNAP_CONFIG, ...config };
  }

  getConfig(): SnapConfig {
    return { ...this.config };
  }

  updateConfig(patch: Partial<SnapConfig>): void {
    this.config = { ...this.config, ...patch };
  }

  /**
   * Read the snapping knobs off the engine's interaction config.
   *
   * `snapToPortRadius` has existed in `InteractionConfig` since the first
   * interaction phase and was read by NOTHING — the config panel wrote it, the
   * default was 30, and no code path ever consulted it. This is the seam that
   * finally consumes it (see {@link findPortMagnet} / {@link findProximityConnection}),
   * along with the waypoint editor's grid settings.
   */
  syncWithEngineConfig(engine: DiagramEngine): void {
    const config = engine?.getInteractionConfig?.();
    if (!config) return;

    const patch: Partial<SnapConfig> = {};
    if (typeof config.snapToPortRadius === 'number') {
      patch.snapToPortRadius = config.snapToPortRadius;
    }
    // The grid the vertex editor snaps to is the grid the canvas snaps to.
    const grid = config.waypointEditor;
    if (grid) {
      if (typeof grid.snapToGrid === 'boolean') patch.snapToGrid = grid.snapToGrid;
      if (typeof grid.gridSize === 'number' && grid.gridSize > 0) patch.gridSize = grid.gridSize;
    }
    this.updateConfig(patch);
  }

  // ==========================================================================
  // Alignment + spacing + grid + bounds
  // ==========================================================================

  /**
   * Snap `box` against `others`.
   *
   * Precedence per axis (strongest first):
   *   1. alignment snapline (edge/centre) within `snapThreshold`
   *   2. equal-spacing guide within `snapThreshold`
   *   3. grid
   * then keep-in-bounds clamps whatever survived. Precedence matters: a grid snap
   * that fought an alignment snap would visibly jitter between the two.
   */
  computeSnap(box: Rectangle, others: Rectangle[]): SnapResult {
    const guides: AlignmentGuide[] = [];
    const spacing: SpacingGuide[] = [];
    let x = box.x;
    let y = box.y;

    if (this.config.enabled && others.length > 0) {
      const alignX = this.bestAlignment(box, others, 'x');
      const alignY = this.bestAlignment(box, others, 'y');

      if (alignX) {
        x = box.x + alignX.delta;
        guides.push(...alignX.guides);
      }
      if (alignY) {
        y = box.y + alignY.delta;
        guides.push(...alignY.guides);
      }

      if (this.config.equalSpacing) {
        if (!alignX) {
          const spaceX = this.bestSpacing(box, others, 'x');
          if (spaceX) {
            x = box.x + spaceX.delta;
            spacing.push(spaceX.guide);
          }
        }
        if (!alignY) {
          const spaceY = this.bestSpacing(box, others, 'y');
          if (spaceY) {
            y = box.y + spaceY.delta;
            spacing.push(spaceY.guide);
          }
        }
      }
    }

    if (this.config.snapToGrid && this.config.gridSize > 0) {
      const grid = this.config.gridSize;
      const claimedX =
        guides.some((g) => g.orientation === 'vertical') ||
        spacing.some((s) => s.orientation === 'horizontal');
      const claimedY =
        guides.some((g) => g.orientation === 'horizontal') ||
        spacing.some((s) => s.orientation === 'vertical');
      if (!claimedX) x = Math.round(x / grid) * grid;
      if (!claimedY) y = Math.round(y / grid) * grid;
    }

    let result: Rectangle = { x, y, width: box.width, height: box.height };
    if (this.config.keepInBounds) {
      result = this.keepInBounds(result, this.config.keepInBounds);
    }

    return {
      box: result,
      dx: result.x - box.x,
      dy: result.y - box.y,
      guides,
      spacing,
    };
  }

  /** Quantise a single point to the grid (used by the vertex drag). */
  snapPointToGrid(point: Point): Point {
    if (!this.config.snapToGrid || this.config.gridSize <= 0) return { ...point };
    const grid = this.config.gridSize;
    return { x: Math.round(point.x / grid) * grid, y: Math.round(point.y / grid) * grid };
  }

  /** Clamp a box so it stays fully inside `bounds` (no-op when it cannot fit). */
  keepInBounds(box: Rectangle, bounds: Rectangle): Rectangle {
    let x = box.x;
    let y = box.y;
    if (box.width <= bounds.width) {
      x = Math.min(Math.max(box.x, bounds.x), bounds.x + bounds.width - box.width);
    }
    if (box.height <= bounds.height) {
      y = Math.min(Math.max(box.y, bounds.y), bounds.y + bounds.height - box.height);
    }
    return { x, y, width: box.width, height: box.height };
  }

  /** Best edge/centre alignment on one axis. */
  protected bestAlignment(
    box: Rectangle,
    others: Rectangle[],
    axis: 'x' | 'y'
  ): { delta: number; guides: AlignmentGuide[] } | null {
    const me = edgesOf(box);
    const mine: Array<{ value: number; kind: 'edge' | 'center' }> =
      axis === 'x'
        ? [
            { value: me.left, kind: 'edge' },
            { value: me.center, kind: 'center' },
            { value: me.right, kind: 'edge' },
          ]
        : [
            { value: me.top, kind: 'edge' },
            { value: me.middle, kind: 'center' },
            { value: me.bottom, kind: 'edge' },
          ];

    // Collect EVERY (mine, theirs) pair inside the threshold.
    interface Candidate {
      delta: number;
      distance: number;
      position: number;
      kind: 'edge' | 'center';
    }
    const candidates: Candidate[] = [];

    for (const other of others) {
      const o = edgesOf(other);
      const theirs: Array<{ value: number; kind: 'edge' | 'center' }> =
        axis === 'x'
          ? [
              { value: o.left, kind: 'edge' },
              { value: o.center, kind: 'center' },
              { value: o.right, kind: 'edge' },
            ]
          : [
              { value: o.top, kind: 'edge' },
              { value: o.middle, kind: 'center' },
              { value: o.bottom, kind: 'edge' },
            ];

      for (const m of mine) {
        for (const t of theirs) {
          const distance = Math.abs(t.value - m.value);
          if (distance > this.config.snapThreshold) continue;
          candidates.push({
            delta: t.value - m.value,
            distance,
            position: t.value,
            kind: t.kind === 'center' && m.kind === 'center' ? 'center' : 'edge',
          });
        }
      }
    }

    if (candidates.length === 0) return null;

    // Closest wins; a centre-to-centre match breaks a tie (it is the line users
    // are actually aiming for).
    candidates.sort(
      (a, b) =>
        a.distance - b.distance ||
        (a.kind === 'center' ? 0 : 1) - (b.kind === 'center' ? 0 : 1)
    );
    const winner = candidates[0]!;

    // ONE correction can satisfy SEVERAL lines at once (aligning the left edges of
    // two equal-width boxes also aligns their centres and right edges). Draw them
    // all: showing only one would misreport what actually snapped.
    const snapped: Rectangle = {
      ...box,
      x: axis === 'x' ? box.x + winner.delta : box.x,
      y: axis === 'y' ? box.y + winner.delta : box.y,
    };

    const seen = new Set<number>();
    const guides: AlignmentGuide[] = [];
    for (const candidate of candidates) {
      if (Math.abs(candidate.delta - winner.delta) > 1e-6) continue;
      if (seen.has(candidate.position)) continue;
      seen.add(candidate.position);

      // Span each guide across every box actually sitting on that line — this is
      // what makes a snapline read as "these are aligned".
      const online = [
        snapped,
        ...others.filter((o) => this.touchesLine(o, candidate.position, axis)),
      ];
      const from = Math.min(...online.map((r) => (axis === 'x' ? r.y : r.x)));
      const to = Math.max(...online.map((r) => (axis === 'x' ? r.y + r.height : r.x + r.width)));

      guides.push({
        orientation: axis === 'x' ? 'vertical' : 'horizontal',
        position: candidate.position,
        from,
        to,
        kind: candidate.kind,
      });
    }

    return { delta: winner.delta, guides };
  }

  /** Does `rect` have an edge or centre exactly on `position` (on `axis`)? */
  protected touchesLine(rect: Rectangle, position: number, axis: 'x' | 'y'): boolean {
    const e = edgesOf(rect);
    const values = axis === 'x' ? [e.left, e.center, e.right] : [e.top, e.middle, e.bottom];
    return values.some((v) => Math.abs(v - position) < 0.5);
  }

  /**
   * Equal-spacing snap on one axis.
   *
   * Two patterns, both classic:
   *  - BETWEEN: the moving box lands between two neighbours with equal gaps.
   *  - CHAIN:   an existing pair already has gap `g`; the moving box lands one
   *             gap `g` further along, continuing the rhythm.
   */
  protected bestSpacing(
    box: Rectangle,
    others: Rectangle[],
    axis: 'x' | 'y'
  ): { delta: number; guide: SpacingGuide } | null {
    const horizontal = axis === 'x';
    // Only boxes that overlap on the OTHER axis are in the same "row"/"column".
    const peers = others
      .filter((o) => this.overlapsOnOtherAxis(box, o, axis))
      .sort((a, b) => (horizontal ? a.x - b.x : a.y - b.y));
    if (peers.length < 2) return null;

    const start = (r: Rectangle) => (horizontal ? r.x : r.y);
    const size = (r: Rectangle) => (horizontal ? r.width : r.height);
    const end = (r: Rectangle) => start(r) + size(r);

    let best: { delta: number; guide: SpacingGuide } | null = null;
    let bestDistance = this.config.snapThreshold;

    const consider = (targetStart: number, gap: number, neighbours: Rectangle[]) => {
      if (gap <= 0) return;
      const delta = targetStart - start(box);
      const distance = Math.abs(delta);
      if (distance > bestDistance) return;
      bestDistance = distance;
      const placed: Rectangle = horizontal
        ? { ...box, x: targetStart }
        : { ...box, y: targetStart };
      best = {
        delta,
        guide: this.buildSpacingGuide([...neighbours, placed], gap, axis),
      };
    };

    for (let i = 0; i < peers.length - 1; i++) {
      const a = peers[i]!;
      const b = peers[i + 1]!;
      const between = start(b) - end(a);

      // BETWEEN: equal gaps either side of the moving box.
      const gap = (between - size(box)) / 2;
      if (gap > 0) {
        consider(end(a) + gap, gap, [a, b]);
      }

      // CHAIN: continue the a→b rhythm, on either side.
      if (between > 0) {
        consider(end(b) + between, between, [a, b]);
        consider(start(a) - between - size(box), between, [a, b]);
      }
    }

    return best;
  }

  /** Build the drawable gap segments between consecutive boxes, sorted along `axis`. */
  protected buildSpacingGuide(boxes: Rectangle[], gap: number, axis: 'x' | 'y'): SpacingGuide {
    const horizontal = axis === 'x';
    const sorted = [...boxes].sort((a, b) => (horizontal ? a.x - b.x : a.y - b.y));
    const segments: SpacingGuide['segments'] = [];

    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i]!;
      const b = sorted[i + 1]!;
      if (horizontal) {
        const y = (Math.max(a.y, b.y) + Math.min(a.y + a.height, b.y + b.height)) / 2;
        segments.push({ x1: a.x + a.width, y1: y, x2: b.x, y2: y });
      } else {
        const x = (Math.max(a.x, b.x) + Math.min(a.x + a.width, b.x + b.width)) / 2;
        segments.push({ x1: x, y1: a.y + a.height, x2: x, y2: b.y });
      }
    }

    return {
      orientation: horizontal ? 'horizontal' : 'vertical',
      gap,
      label: `${Math.round(gap)}`,
      segments,
    };
  }

  protected overlapsOnOtherAxis(a: Rectangle, b: Rectangle, axis: 'x' | 'y'): boolean {
    if (axis === 'x') {
      return a.y < b.y + b.height && b.y < a.y + a.height;
    }
    return a.x < b.x + b.width && b.x < a.x + a.width;
  }

  // ==========================================================================
  // The world boxes a host feeds `computeSnap`
  // ==========================================================================

  /** World bounding boxes of every node EXCEPT `excludeIds` (the moving ones). */
  siblingBoxes(engine: DiagramEngine, excludeIds: Iterable<string> = []): Rectangle[] {
    const diagram = engine?.getDiagram?.();
    if (!diagram) return [];
    const excluded = new Set(excludeIds);

    return diagram
      .getNodes()
      .filter((n: NodeModel) => !excluded.has(n.id) && n.state?.visible !== false)
      .map((n: NodeModel) => {
        const box = n.getBoundingBox();
        return {
          x: box.left,
          y: box.top,
          width: box.right - box.left,
          height: box.bottom - box.top,
        };
      });
  }

  // ==========================================================================
  // Magnetic ports + proximity connect
  // ==========================================================================

  /**
   * World position of a port — THE one the port is actually drawn at.
   *
   * BUG (wave 6): this used `port.getAbsolutePosition(node.getBoundingBox())`,
   * which walks the BOUNDING BOX and lands on an edge midpoint — blind to the
   * node's silhouette and to how many ports share the side. The renderer draws
   * ports with `getPortPositionForShape`. So on a circle, a diamond, a hexagon,
   * a cylinder — or ANY side carrying more than one port — the magnet was
   * snapping to a point several pixels away from the port you could see, and
   * proximity-connect measured its radius from the wrong place.
   */
  portPosition(node: NodeModel, port: PortModel): Point {
    return portWorldPosition(port, node);
  }

  /**
   * The nearest port to a world point within `snapToPortRadius` — the magnet the
   * connection drag snaps to. `excludeNodeId` keeps a drag from snapping back to
   * the node it started on.
   */
  findPortMagnet(
    engine: DiagramEngine,
    worldX: number,
    worldY: number,
    options: {
      excludeNodeId?: string;
      radius?: number;
      filter?: (port: PortModel, node: NodeModel) => boolean;
    } = {}
  ): PortHit | null {
    const diagram = engine?.getDiagram?.();
    if (!diagram) return null;

    const radius = options.radius ?? this.config.snapToPortRadius;
    if (radius <= 0) return null;

    let best: PortHit | null = null;
    for (const node of diagram.getNodes()) {
      if (options.excludeNodeId && node.id === options.excludeNodeId) continue;
      if (node.state?.visible === false) continue;

      for (const port of node.getPorts()) {
        if (options.filter && !options.filter(port, node)) continue;
        const position = this.portPosition(node, port);
        const distance = Math.hypot(worldX - position.x, worldY - position.y);
        if (distance <= radius && (!best || distance < best.distance)) {
          best = { port, node, position, distance };
        }
      }
    }
    return best;
  }

  /**
   * React-Flow-style proximity connect: after dragging `nodeId`, is one of ITS
   * ports close enough to a compatible port on another node to auto-link them?
   *
   * Validity is the same rule the connection drag enforces: different nodes,
   * direction-compatible ports (output→input, or a `bi` port on either side),
   * allowed by the connection groups, and not already connected.
   */
  findProximityConnection(
    engine: DiagramEngine,
    nodeId: string,
    radius?: number
  ): ProximityCandidate | null {
    const diagram = engine?.getDiagram?.();
    const node = diagram?.getNode(nodeId);
    if (!diagram || !node) return null;

    const reach = radius ?? this.config.proximityConnectRadius;
    if (reach <= 0) return null;

    let best: ProximityCandidate | null = null;

    for (const myPort of node.getPorts()) {
      const from = this.portPosition(node, myPort);

      const hit = this.findPortMagnet(engine, from.x, from.y, {
        excludeNodeId: node.id,
        radius: reach,
        // ORIENT FIRST, then validate. The rule is directional (wave 6:
        // `isConnectableStart` gates the source end, `isConnectableEnd` the
        // target end), so asking "may myPort connect to candidate?" when the link
        // will actually be built candidate→myPort asks the wrong question — and
        // would reject a perfectly legal output→input link the moment an author
        // marked their inputs `isConnectableStart: false`.
        filter: (candidate, owner) => {
          const forward = myPort.type === 'output' || (myPort.type === 'bi' && candidate.type === 'input');
          return forward
            ? this.canConnect(myPort, candidate, node, owner, engine, diagram)
            : this.canConnect(candidate, myPort, owner, node, engine, diagram);
        },
      });
      if (!hit) continue;

      // Orient the link: the `output`/`bi` side is the source.
      const myPortIsSource =
        myPort.type === 'output' || (myPort.type === 'bi' && hit.port.type === 'input');
      const candidate: ProximityCandidate = myPortIsSource
        ? {
            sourcePort: myPort,
            targetPort: hit.port,
            sourceNodeId: node.id,
            targetNodeId: hit.node.id,
            distance: hit.distance,
          }
        : {
            sourcePort: hit.port,
            targetPort: myPort,
            sourceNodeId: hit.node.id,
            targetNodeId: node.id,
            distance: hit.distance,
          };

      if (!best || candidate.distance < best.distance) {
        best = candidate;
      }
    }

    return best;
  }

  /** The connection rule shared by the magnet, the highlight and the auto-link. */
  protected canConnect(
    a: PortModel,
    b: PortModel,
    nodeA: NodeModel,
    nodeB: NodeModel,
    engine: DiagramEngine,
    diagram: { getLinks(): LinkModel[] }
  ): boolean {
    return canConnectPorts(a, b, nodeA, nodeB, engine, diagram);
  }

  /** Turn a candidate into the ONE undoable command that creates the link. */
  buildProximityLinkCommand(candidate: ProximityCandidate): Command {
    const link = new LinkModelCtor(candidate.sourcePort.id, candidate.targetPort.id);
    link.setSourcePort(candidate.sourcePort.id, candidate.sourceNodeId);
    link.setTargetPort(candidate.targetPort.id, candidate.targetNodeId);
    return new AddLinkCommand(link);
  }

  /**
   * Paint the nearest valid target: exactly the flags the SVG renderer already
   * draws for a connection drag (`isValidTarget` = eligible, `isHighlighted` =
   * the one that would win). Clears every other port so the highlight can never
   * go stale — the failure mode of "highlight on, nothing turns it off".
   */
  highlightProximityTarget(engine: DiagramEngine, candidate: ProximityCandidate | null): void {
    const diagram = engine?.getDiagram?.();
    if (!diagram) return;

    const winners = candidate
      ? new Set([candidate.sourcePort.id, candidate.targetPort.id])
      : new Set<string>();

    diagram.getNodes().forEach((node: NodeModel) => {
      node.getPorts().forEach((port: PortModel) => {
        const highlighted = winners.has(port.id);
        if (port.isHighlighted !== highlighted || port.isValidTarget !== highlighted) {
          port.isHighlighted = highlighted;
          port.isValidTarget = highlighted;
          node.markDirty('proximity-highlight');
        }
      });
    });
  }
}
