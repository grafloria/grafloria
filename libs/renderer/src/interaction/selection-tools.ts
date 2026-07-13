import type { DiagramEngine, NodeModel, LinkModel, Point, Command } from '@grafloria/engine';
import {
  MacroCommand,
  MoveNodeCommand,
  ResizeNodeCommand,
  RotateNodeCommand,
  RemoveNodeCommand,
  RemoveLinkCommand,
  AddNodeCommand,
  AddLinkCommand,
  SetLinkPointsCommand,
  NodeModel as NodeModelCtor,
  LinkModel as LinkModelCtor,
  remapNodePortIds,
  generateId,
} from '@grafloria/engine';
import type { Rectangle } from '../types/geometry.types';

/**
 * SelectionToolsController — the floating tool layer (Card 5, wave4/interaction).
 *
 * Everything a user can grab AROUND a selection lives here: the 8 resize
 * handles, the rotate handle, the remove button, the Halo context toolbar
 * (connect / clone / fork / delete), and — for links — the endpoint reconnect
 * anchors and the add/remove-vertex tools.
 *
 * ## Framework contract (same as InteractionController)
 *
 * This class answers "**what tools exist right now, where, and what does
 * grabbing one DO?**". It never renders and never re-renders: it emits plain
 * geometry ({@link SelectionToolLayer}) that any host can draw, and it returns
 * {@link Command}s that the host dispatches on the engine's CommandManager. Zero
 * framework imports; instantiate with a plain `new`.
 *
 * ## Coordinates
 *
 * All handle positions are WORLD coordinates, because the host already owns the
 * world→screen map (ViewportController) and the model lives in world space. Sizes
 * the user perceives (handle size, halo gap) are configured in SCREEN px and
 * divided by `zoom` when the layer is computed, so handles keep a constant
 * on-screen size at any zoom — the JointJS/GoJS behaviour.
 *
 * ## Rotation
 *
 * A node renders as `translate(pos) rotate(θ, w/2, h/2)`, i.e. rotation about the
 * box CENTRE. The tool layer applies the same rotation to every handle, so the
 * handles stay glued to a rotated node's corners, and a resize drag is
 * transformed back into the node's local frame before it is applied
 * ({@link applyResizeToNode}) — with the centre-compensation that keeps the
 * unresized edge visually still.
 */

/** The 8 resize handles, named by compass direction. */
export type ResizeHandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

/** Halo (context toolbar) actions, JointJS+-style. */
export type HaloAction = 'connect' | 'clone' | 'fork' | 'delete';

export type ToolKind =
  | 'resize'
  | 'rotate'
  | 'remove'
  | 'halo'
  | 'link-endpoint'
  | 'vertex-add'
  | 'vertex-remove';

/** One grabbable tool in the floating layer. */
export interface ToolHandle {
  /** Stable key (also the DOM key a host keys its @for/map on). */
  id: string;
  kind: ToolKind;
  /** Centre of the handle, in WORLD coordinates. */
  world: Point;
  /** Hit radius in WORLD units (= screen px / zoom). */
  hitRadius: number;
  /** CSS cursor a host should show over this handle. */
  cursor: string;
  /** Accessible name (also used for tooltips / ARIA). */
  label: string;
  /** For `resize`. */
  handleId?: ResizeHandleId;
  /** For `halo`. */
  action?: HaloAction;
  /** For `link-endpoint`. */
  endpoint?: 'source' | 'target';
  /** Vertex index (`vertex-remove`) or segment index (`vertex-add`). */
  index?: number;
  /** Owning entity. */
  nodeId?: string;
  linkId?: string;
}

/** Everything the host needs to draw the tool layer for the current selection. */
export interface SelectionToolLayer {
  /** World bbox of the selection; null when nothing is selected. */
  bounds: Rectangle | null;
  /** Rotation (deg) of the single selected node; 0 otherwise. */
  rotation: number;
  /** World centre the bounds rotate about (the frame outline follows it). */
  center: Point | null;
  nodeIds: string[];
  linkIds: string[];
  handles: ToolHandle[];
}

export interface SelectionToolsConfig {
  /** Side of a square resize handle, in SCREEN px. */
  handleSize: number;
  /** Distance from the selection's top edge to the rotate handle, SCREEN px. */
  rotateHandleOffset: number;
  /** Gap between the selection box and the halo column, SCREEN px. */
  haloGap: number;
  /** Diameter of a halo button, SCREEN px. */
  haloButtonSize: number;
  /** Show the Halo context toolbar. */
  showHalo: boolean;
  /** Show the 8 resize handles (single-node selection only). */
  showResizeHandles: boolean;
  /** Show the rotate handle (single-node selection, `behavior.rotatable`). */
  showRotateHandle: boolean;
  /** Show the ✕ remove button. */
  showRemoveButton: boolean;
  /** Show link endpoint / vertex tools for a selected link. */
  showLinkTools: boolean;
  /** Smallest width/height a resize may produce, WORLD units. */
  minWidth: number;
  minHeight: number;
  /** Rotation snap while a modifier is held, in degrees. */
  rotationSnapDegrees: number;
}

export const DEFAULT_SELECTION_TOOLS_CONFIG: SelectionToolsConfig = {
  handleSize: 8,
  rotateHandleOffset: 26,
  haloGap: 12,
  haloButtonSize: 22,
  showHalo: true,
  showResizeHandles: true,
  showRotateHandle: true,
  showRemoveButton: true,
  showLinkTools: true,
  minWidth: 16,
  minHeight: 16,
  rotationSnapDegrees: 15,
};

/** Cursor for each resize handle (unrotated). */
const RESIZE_CURSORS: Record<ResizeHandleId, string> = {
  nw: 'nwse-resize',
  n: 'ns-resize',
  ne: 'nesw-resize',
  e: 'ew-resize',
  se: 'nwse-resize',
  s: 'ns-resize',
  sw: 'nesw-resize',
  w: 'ew-resize',
};

/** Unit (0..1) position of each handle within the selection box. */
const RESIZE_ANCHORS: Record<ResizeHandleId, { u: number; v: number }> = {
  nw: { u: 0, v: 0 },
  n: { u: 0.5, v: 0 },
  ne: { u: 1, v: 0 },
  e: { u: 1, v: 0.5 },
  se: { u: 1, v: 1 },
  s: { u: 0.5, v: 1 },
  sw: { u: 0, v: 1 },
  w: { u: 0, v: 0.5 },
};

export const RESIZE_HANDLE_IDS: ResizeHandleId[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

const HALO_ORDER: HaloAction[] = ['connect', 'clone', 'fork', 'delete'];

const HALO_LABELS: Record<HaloAction, string> = {
  connect: 'Connect',
  clone: 'Clone',
  fork: 'Fork',
  delete: 'Delete',
};

// ============================================================================
// Pure geometry (exported: these are the bits the gesture tests pin down)
// ============================================================================

/** Rotate `(x, y)` about the origin by `deg` degrees (SVG's positive = clockwise). */
export function rotateVector(x: number, y: number, deg: number): Point {
  if (deg === 0) return { x, y };
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: x * cos - y * sin, y: x * sin + y * cos };
}

/** Rotate `point` about `center` by `deg` degrees. */
export function rotatePoint(point: Point, center: Point, deg: number): Point {
  const v = rotateVector(point.x - center.x, point.y - center.y, deg);
  return { x: center.x + v.x, y: center.y + v.y };
}

export interface ResizeOptions {
  minWidth?: number;
  minHeight?: number;
  /** Preserve the starting aspect ratio (corner handles only). */
  keepAspect?: boolean;
}

/**
 * Apply a resize drag to a box, in the box's OWN frame.
 *
 * `dx/dy` is the pointer delta since the drag began (same frame as the box). The
 * dragged edge(s) follow the pointer; the opposite edge stays put. Minimums clamp
 * the dragged edge, never the anchored one — so a runaway drag can't flip or
 * shrink the box past the minimum.
 */
export function resizeBox(
  start: Rectangle,
  handle: ResizeHandleId,
  dx: number,
  dy: number,
  options: ResizeOptions = {}
): Rectangle {
  const minWidth = Math.max(1, options.minWidth ?? 1);
  const minHeight = Math.max(1, options.minHeight ?? 1);

  const movesLeft = handle === 'nw' || handle === 'w' || handle === 'sw';
  const movesRight = handle === 'ne' || handle === 'e' || handle === 'se';
  const movesTop = handle === 'nw' || handle === 'n' || handle === 'ne';
  const movesBottom = handle === 'sw' || handle === 's' || handle === 'se';

  let left = start.x;
  let right = start.x + start.width;
  let top = start.y;
  let bottom = start.y + start.height;

  if (movesLeft) left = Math.min(start.x + dx, right - minWidth);
  if (movesRight) right = Math.max(start.x + start.width + dx, left + minWidth);
  if (movesTop) top = Math.min(start.y + dy, bottom - minHeight);
  if (movesBottom) bottom = Math.max(start.y + start.height + dy, top + minHeight);

  let width = right - left;
  let height = bottom - top;

  // Aspect lock: only meaningful on corners (an edge handle has one free axis).
  const isCorner = (movesLeft || movesRight) && (movesTop || movesBottom);
  if (options.keepAspect && isCorner && start.width > 0 && start.height > 0) {
    const aspect = start.width / start.height;
    // Grow along the dominant axis so the box always contains the pointer.
    if (width / height > aspect) {
      height = Math.max(minHeight, width / aspect);
    } else {
      width = Math.max(minWidth, height * aspect);
    }
    if (movesLeft) left = right - width;
    if (movesTop) top = bottom - height;
  }

  return { x: left, y: top, width, height };
}

/**
 * Apply a resize drag to a possibly-ROTATED node.
 *
 * The pointer delta arrives in WORLD space, but the box the user is resizing is
 * drawn in the node's local (unrotated) frame and rotated about its centre. So:
 *
 *  1. rotate the world delta by −θ → the node's local frame;
 *  2. resize the local box;
 *  3. the node re-renders rotated about its NEW centre, so compensate the
 *     position by rotating the centre shift back into world space.
 *
 * At θ = 0 this collapses to `pos + (box.x, box.y)`. Getting step 3 wrong is what
 * makes rotated resize "swim" away from the cursor in most implementations.
 */
export function applyResizeToNode(
  start: { position: Point; size: { width: number; height: number }; rotation: number },
  handle: ResizeHandleId,
  worldDx: number,
  worldDy: number,
  options: ResizeOptions = {}
): { position: Point; size: { width: number; height: number } } {
  const theta = start.rotation ?? 0;
  const local = rotateVector(worldDx, worldDy, -theta);

  const box = resizeBox(
    { x: 0, y: 0, width: start.size.width, height: start.size.height },
    handle,
    local.x,
    local.y,
    options
  );

  // Centre of the box before/after, in the node's local frame.
  const oldCenter = { x: start.size.width / 2, y: start.size.height / 2 };
  const newCenter = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

  // The world centre moves by the local centre shift, rotated into world space.
  const shift = rotateVector(newCenter.x - oldCenter.x, newCenter.y - oldCenter.y, theta);
  const worldCenter = {
    x: start.position.x + oldCenter.x + shift.x,
    y: start.position.y + oldCenter.y + shift.y,
  };

  return {
    position: { x: worldCenter.x - box.width / 2, y: worldCenter.y - box.height / 2 },
    size: { width: box.width, height: box.height },
  };
}

/** Angle (deg) of `point` seen from `center`; 0° = straight up, growing clockwise. */
export function angleAt(center: Point, point: Point): number {
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  // atan2(dx, -dy) puts 0° at "north" and turns clockwise, matching SVG rotate().
  const deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
  return normalizeAngle(deg);
}

/** Fold an angle into [0, 360). */
export function normalizeAngle(deg: number): number {
  const mod = deg % 360;
  return mod < 0 ? mod + 360 : mod;
}

/** Snap `deg` to the nearest multiple of `step` (step ≤ 0 → unchanged). */
export function snapAngle(deg: number, step: number): number {
  if (!step || step <= 0) return normalizeAngle(deg);
  return normalizeAngle(Math.round(deg / step) * step);
}

// ============================================================================
// Gesture state
// ============================================================================

interface ResizeGesture {
  kind: 'resize';
  nodeId: string;
  handle: ResizeHandleId;
  startPointer: Point;
  startPosition: Point;
  startSize: { width: number; height: number };
  startRotation: number;
}

interface RotateGesture {
  kind: 'rotate';
  nodeId: string;
  center: Point;
  startRotation: number;
  /** Pointer angle when the gesture began — rotation is relative to it. */
  startAngle: number;
}

interface VertexGesture {
  kind: 'vertex';
  linkId: string;
  index: number;
  startPoints: Point[];
}

type ToolGesture = ResizeGesture | RotateGesture | VertexGesture;

/** Modifier snapshot a host forwards from its pointer events. */
export interface ToolModifierState {
  shift?: boolean;
  alt?: boolean;
  ctrl?: boolean;
  meta?: boolean;
}

export class SelectionToolsController {
  protected config: SelectionToolsConfig;
  protected gesture: ToolGesture | null = null;

  constructor(config: Partial<SelectionToolsConfig> = {}) {
    this.config = { ...DEFAULT_SELECTION_TOOLS_CONFIG, ...config };
  }

  getConfig(): SelectionToolsConfig {
    return { ...this.config };
  }

  updateConfig(patch: Partial<SelectionToolsConfig>): void {
    this.config = { ...this.config, ...patch };
  }

  /** True while a resize / rotate / vertex drag owns the pointer. */
  isActive(): boolean {
    return this.gesture !== null;
  }

  /** The kind of gesture in flight (`null` when idle) — hosts branch on it. */
  activeGesture(): 'resize' | 'rotate' | 'vertex' | null {
    return this.gesture?.kind ?? null;
  }

  // ==========================================================================
  // The layer
  // ==========================================================================

  /**
   * Compute the tool layer for the CURRENT selection.
   *
   * `zoom` converts the screen-px sizes in the config into world units, so the
   * handles are the same physical size at every zoom level.
   *
   * Scope note (deliberate): resize + rotate are offered for a SINGLE selected
   * node. A multi-node selection gets the bounding frame, the halo and the remove
   * button — proportional multi-node resize is not implemented.
   */
  computeLayer(engine: DiagramEngine, zoom = 1): SelectionToolLayer {
    const empty: SelectionToolLayer = {
      bounds: null,
      rotation: 0,
      center: null,
      nodeIds: [],
      linkIds: [],
      handles: [],
    };

    const diagram = engine?.getDiagram?.();
    if (!diagram) return empty;

    const scale = zoom > 0 ? 1 / zoom : 1;
    const nodes = diagram.getNodes().filter((n: NodeModel) => n.isSelected());
    const links = diagram.getLinks().filter((l: LinkModel) => l.state === 'selected');

    if (nodes.length === 0 && links.length === 0) return empty;

    // Link-only selection → link tools (endpoints + vertices + remove).
    if (nodes.length === 0) {
      return this.computeLinkLayer(links, scale);
    }

    const single = nodes.length === 1 ? nodes[0]! : null;
    const bounds = this.unionBounds(nodes);
    if (!bounds) return empty;

    const rotation = single ? single.rotation || 0 : 0;
    const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    const handles: ToolHandle[] = [];

    const place = (u: number, v: number): Point =>
      rotatePoint(
        { x: bounds.x + u * bounds.width, y: bounds.y + v * bounds.height },
        center,
        rotation
      );

    const hitRadius = (this.config.handleSize * scale) / 2 + 2 * scale;

    // 8 resize handles — single node, resizable, unlocked.
    if (
      single &&
      this.config.showResizeHandles &&
      single.behavior?.resizable !== false &&
      !single.state?.locked
    ) {
      for (const handleId of RESIZE_HANDLE_IDS) {
        const anchor = RESIZE_ANCHORS[handleId];
        handles.push({
          id: `resize-${handleId}`,
          kind: 'resize',
          handleId,
          nodeId: single.id,
          world: place(anchor.u, anchor.v),
          hitRadius,
          cursor: RESIZE_CURSORS[handleId],
          label: `Resize ${handleId}`,
        });
      }
    }

    // Rotate handle: above the top edge, in the node's rotated frame.
    if (
      single &&
      this.config.showRotateHandle &&
      single.behavior?.rotatable === true &&
      !single.state?.locked
    ) {
      const raw = {
        x: center.x,
        y: bounds.y - this.config.rotateHandleOffset * scale,
      };
      handles.push({
        id: 'rotate',
        kind: 'rotate',
        nodeId: single.id,
        world: rotatePoint(raw, center, rotation),
        hitRadius,
        cursor: 'grab',
        label: 'Rotate',
      });
    }

    // Remove button: just outside the top-right corner.
    if (this.config.showRemoveButton) {
      const raw = {
        x: bounds.x + bounds.width + this.config.haloGap * scale * 0.5,
        y: bounds.y - this.config.haloGap * scale * 0.5,
      };
      handles.push({
        id: 'remove',
        kind: 'remove',
        nodeId: single?.id,
        world: rotatePoint(raw, center, rotation),
        hitRadius: (this.config.haloButtonSize * scale) / 2,
        cursor: 'pointer',
        label: 'Remove',
      });
    }

    // Halo: a column of context buttons to the RIGHT of the selection.
    if (this.config.showHalo) {
      const size = this.config.haloButtonSize * scale;
      const gap = this.config.haloGap * scale;
      HALO_ORDER.forEach((action, i) => {
        // `connect` and `fork` need a source node — hide them for multi-select.
        if (!single && (action === 'connect' || action === 'fork')) return;
        handles.push({
          id: `halo-${action}`,
          kind: 'halo',
          action,
          nodeId: single?.id,
          world: {
            x: bounds.x + bounds.width + gap + size / 2,
            y: bounds.y + size / 2 + i * (size + 4 * scale),
          },
          hitRadius: size / 2,
          cursor: 'pointer',
          label: HALO_LABELS[action],
        });
      });
    }

    return {
      bounds,
      rotation,
      center,
      nodeIds: nodes.map((n: NodeModel) => n.id),
      linkIds: links.map((l: LinkModel) => l.id),
      handles,
    };
  }

  /** Link tools: endpoint reconnect anchors, add/remove-vertex, remove. */
  protected computeLinkLayer(links: LinkModel[], scale: number): SelectionToolLayer {
    const handles: ToolHandle[] = [];
    const link = links[0];
    if (!link || !this.config.showLinkTools) {
      return {
        bounds: null,
        rotation: 0,
        center: null,
        nodeIds: [],
        linkIds: links.map((l) => l.id),
        handles,
      };
    }

    const points = link.points ?? [];
    if (points.length >= 2) {
      const hitRadius = (this.config.handleSize * scale) / 2 + 2 * scale;

      handles.push({
        id: `endpoint-source-${link.id}`,
        kind: 'link-endpoint',
        endpoint: 'source',
        linkId: link.id,
        world: { ...points[0]! },
        hitRadius,
        cursor: 'move',
        label: 'Reconnect source',
      });
      handles.push({
        id: `endpoint-target-${link.id}`,
        kind: 'link-endpoint',
        endpoint: 'target',
        linkId: link.id,
        world: { ...points[points.length - 1]! },
        hitRadius,
        cursor: 'move',
        label: 'Reconnect target',
      });

      // One "+" per segment midpoint → add a vertex there.
      for (let i = 0; i < points.length - 1; i++) {
        const a = points[i]!;
        const b = points[i + 1]!;
        handles.push({
          id: `vertex-add-${link.id}-${i}`,
          kind: 'vertex-add',
          index: i,
          linkId: link.id,
          world: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
          hitRadius: hitRadius * 0.9,
          cursor: 'copy',
          label: `Add vertex on segment ${i + 1}`,
        });
      }

      // One "−" per interior vertex → remove it.
      for (let i = 1; i < points.length - 1; i++) {
        handles.push({
          id: `vertex-remove-${link.id}-${i}`,
          kind: 'vertex-remove',
          index: i,
          linkId: link.id,
          world: { ...points[i]! },
          hitRadius,
          cursor: 'pointer',
          label: `Remove vertex ${i}`,
        });
      }
    }

    if (this.config.showRemoveButton && points.length >= 2) {
      const mid = points[Math.floor(points.length / 2)]!;
      handles.push({
        id: `remove-link-${link.id}`,
        kind: 'remove',
        linkId: link.id,
        world: { x: mid.x, y: mid.y - this.config.haloGap * scale * 1.5 },
        hitRadius: (this.config.haloButtonSize * scale) / 2,
        cursor: 'pointer',
        label: 'Remove link',
      });
    }

    return {
      bounds: null,
      rotation: 0,
      center: null,
      nodeIds: [],
      linkIds: links.map((l) => l.id),
      handles,
    };
  }

  /**
   * Which tool (if any) is under a world point.
   *
   * Later handles win ties, so the halo/remove buttons (emitted last) stay
   * clickable where they overlap a resize handle.
   */
  hitTest(layer: SelectionToolLayer, worldX: number, worldY: number): ToolHandle | null {
    let best: ToolHandle | null = null;
    for (const handle of layer.handles) {
      const dx = worldX - handle.world.x;
      const dy = worldY - handle.world.y;
      if (dx * dx + dy * dy <= handle.hitRadius * handle.hitRadius) {
        best = handle;
      }
    }
    return best;
  }

  /** World bbox of a node set. */
  protected unionBounds(nodes: NodeModel[]): Rectangle | null {
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;

    for (const node of nodes) {
      const box = node.getBoundingBox();
      left = Math.min(left, box.left);
      top = Math.min(top, box.top);
      right = Math.max(right, box.right);
      bottom = Math.max(bottom, box.bottom);
    }

    if (!isFinite(left) || !isFinite(top)) return null;
    return { x: left, y: top, width: right - left, height: bottom - top };
  }

  // ==========================================================================
  // Resize gesture
  // ==========================================================================

  /** Arm a resize. Returns false when the handle/node is not resizable. */
  beginResize(
    handle: ToolHandle,
    engine: DiagramEngine,
    worldX: number,
    worldY: number
  ): boolean {
    const node = handle.nodeId ? engine.getDiagram()?.getNode(handle.nodeId) : undefined;
    if (!node || !handle.handleId) return false;

    this.gesture = {
      kind: 'resize',
      nodeId: node.id,
      handle: handle.handleId,
      startPointer: { x: worldX, y: worldY },
      startPosition: { x: node.position.x, y: node.position.y },
      startSize: { width: node.size.width, height: node.size.height },
      startRotation: node.rotation || 0,
    };
    return true;
  }

  /**
   * Live-resize the node (direct model mutation, like the drag tool: smooth, no
   * command churn — the single undo entry is minted at {@link endGesture}).
   * `snap` optionally quantises the resulting box (grid / alignment) — the host
   * passes the SnapController's hook so Card 6 composes with Card 5.
   */
  updateResize(
    engine: DiagramEngine,
    worldX: number,
    worldY: number,
    modifiers: ToolModifierState = {},
    snap?: (box: Rectangle) => Rectangle
  ): boolean {
    const gesture = this.gesture;
    if (!gesture || gesture.kind !== 'resize') return false;

    const node = engine.getDiagram()?.getNode(gesture.nodeId);
    if (!node) return false;

    const next = applyResizeToNode(
      {
        position: gesture.startPosition,
        size: gesture.startSize,
        rotation: gesture.startRotation,
      },
      gesture.handle,
      worldX - gesture.startPointer.x,
      worldY - gesture.startPointer.y,
      {
        minWidth: this.config.minWidth,
        minHeight: this.config.minHeight,
        keepAspect: modifiers.shift === true,
      }
    );

    let box: Rectangle = {
      x: next.position.x,
      y: next.position.y,
      width: next.size.width,
      height: next.size.height,
    };
    // Snapping is only meaningful in the unrotated frame; skip it for rotated
    // nodes rather than snapping a box that isn't axis-aligned on screen.
    if (snap && (gesture.startRotation || 0) === 0) {
      box = snap(box);
    }

    node.setPosition(box.x, box.y, node.position.z);
    node.setSize(
      Math.max(this.config.minWidth, box.width),
      Math.max(this.config.minHeight, box.height)
    );
    node.markDirty('resized');
    return true;
  }

  // ==========================================================================
  // Rotate gesture
  // ==========================================================================

  beginRotate(handle: ToolHandle, engine: DiagramEngine, worldX: number, worldY: number): boolean {
    const node = handle.nodeId ? engine.getDiagram()?.getNode(handle.nodeId) : undefined;
    if (!node) return false;

    const box = node.getBoundingBox();
    const center = { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 };

    this.gesture = {
      kind: 'rotate',
      nodeId: node.id,
      center,
      startRotation: node.rotation || 0,
      startAngle: angleAt(center, { x: worldX, y: worldY }),
    };
    return true;
  }

  /** Live-rotate; Shift snaps to `rotationSnapDegrees`. */
  updateRotate(
    engine: DiagramEngine,
    worldX: number,
    worldY: number,
    modifiers: ToolModifierState = {}
  ): boolean {
    const gesture = this.gesture;
    if (!gesture || gesture.kind !== 'rotate') return false;

    const node = engine.getDiagram()?.getNode(gesture.nodeId);
    if (!node) return false;

    const current = angleAt(gesture.center, { x: worldX, y: worldY });
    let rotation = normalizeAngle(gesture.startRotation + (current - gesture.startAngle));
    if (modifiers.shift) {
      rotation = snapAngle(rotation, this.config.rotationSnapDegrees);
    }

    node.setRotation(rotation);
    node.markDirty('rotated');
    return true;
  }

  // ==========================================================================
  // Vertex (waypoint) drag
  // ==========================================================================

  beginVertexDrag(handle: ToolHandle, engine: DiagramEngine): boolean {
    const link = handle.linkId ? engine.getDiagram()?.getLink(handle.linkId) : undefined;
    if (!link || handle.index === undefined) return false;

    this.gesture = {
      kind: 'vertex',
      linkId: link.id,
      index: handle.index,
      startPoints: link.points.map((p: Point) => ({ ...p })),
    };
    return true;
  }

  updateVertexDrag(
    engine: DiagramEngine,
    worldX: number,
    worldY: number,
    snapPoint?: (p: Point) => Point
  ): boolean {
    const gesture = this.gesture;
    if (!gesture || gesture.kind !== 'vertex') return false;

    const link = engine.getDiagram()?.getLink(gesture.linkId);
    if (!link) return false;

    const points = link.points.map((p: Point) => ({ ...p }));
    if (gesture.index <= 0 || gesture.index >= points.length - 1) return false;

    const moved = snapPoint ? snapPoint({ x: worldX, y: worldY }) : { x: worldX, y: worldY };
    points[gesture.index] = moved;
    link.setPoints(points);
    link.setMetadata('hasManualWaypoints', true);
    link.markDirty('vertex-dragged');
    return true;
  }

  // ==========================================================================
  // Commit
  // ==========================================================================

  /**
   * End the active gesture and return the ONE command that makes it undoable
   * (null for a no-op gesture). The model already sits at its final state — the
   * command re-applies it (a no-op) and records the inverse, exactly like the
   * wave-3 node-drag commit.
   */
  endGesture(engine: DiagramEngine): Command | null {
    const gesture = this.gesture;
    this.gesture = null;
    if (!gesture) return null;

    const diagram = engine.getDiagram();
    if (!diagram) return null;

    if (gesture.kind === 'resize') {
      const node = diagram.getNode(gesture.nodeId);
      if (!node) return null;

      const movedX = node.position.x !== gesture.startPosition.x;
      const movedY = node.position.y !== gesture.startPosition.y;
      const resized =
        node.size.width !== gesture.startSize.width ||
        node.size.height !== gesture.startSize.height;
      if (!movedX && !movedY && !resized) return null;

      const resize = new ResizeNodeCommand(
        node.id,
        { width: node.size.width, height: node.size.height },
        { width: gesture.startSize.width, height: gesture.startSize.height }
      );
      if (!movedX && !movedY) return resize;

      // A corner/edge resize also MOVES the node (the anchored edge stays put),
      // so the undo step is the pair — as one MacroCommand.
      const macro = new MacroCommand('Resize Node');
      macro.addStep(
        new MoveNodeCommand(
          node.id,
          { x: node.position.x, y: node.position.y, z: node.position.z },
          { x: gesture.startPosition.x, y: gesture.startPosition.y, z: node.position.z },
          { mergeable: false }
        )
      );
      macro.addStep(resize);
      return macro;
    }

    if (gesture.kind === 'rotate') {
      const node = diagram.getNode(gesture.nodeId);
      if (!node) return null;
      if (node.rotation === gesture.startRotation) return null;
      return new RotateNodeCommand(node.id, node.rotation, gesture.startRotation);
    }

    // vertex
    const link = diagram.getLink(gesture.linkId);
    if (!link) return null;
    if (samePoints(link.points, gesture.startPoints)) return null;
    return new SetLinkPointsCommand(
      link.id,
      link.points.map((p: Point) => ({ ...p })),
      gesture.startPoints
    );
  }

  /** Abandon the gesture, restoring the model to its pre-gesture state. */
  cancelGesture(engine: DiagramEngine): void {
    const gesture = this.gesture;
    this.gesture = null;
    if (!gesture) return;

    const diagram = engine.getDiagram();
    if (!diagram) return;

    if (gesture.kind === 'resize') {
      const node = diagram.getNode(gesture.nodeId);
      node?.setPosition(gesture.startPosition.x, gesture.startPosition.y, node.position.z);
      node?.setSize(gesture.startSize.width, gesture.startSize.height);
      node?.markDirty('resize-cancelled');
    } else if (gesture.kind === 'rotate') {
      const node = diagram.getNode(gesture.nodeId);
      node?.setRotation(gesture.startRotation);
      node?.markDirty('rotate-cancelled');
    } else {
      const link = diagram.getLink(gesture.linkId);
      link?.setPoints(gesture.startPoints.map((p) => ({ ...p })));
      link?.markDirty('vertex-cancelled');
    }
  }

  // ==========================================================================
  // Click tools (no drag): vertex add/remove, remove, halo
  // ==========================================================================

  /** Insert a vertex at the clicked segment midpoint. Undoable. */
  addVertexCommand(handle: ToolHandle, engine: DiagramEngine): Command | null {
    const link = handle.linkId ? engine.getDiagram()?.getLink(handle.linkId) : undefined;
    if (!link || handle.index === undefined) return null;

    const points = link.points.map((p: Point) => ({ ...p }));
    if (handle.index < 0 || handle.index >= points.length - 1) return null;

    const next = [...points];
    next.splice(handle.index + 1, 0, { ...handle.world });
    return new SetLinkPointsCommand(link.id, next, points);
  }

  /** Remove the vertex under the tool. Undoable. */
  removeVertexCommand(handle: ToolHandle, engine: DiagramEngine): Command | null {
    const link = handle.linkId ? engine.getDiagram()?.getLink(handle.linkId) : undefined;
    if (!link || handle.index === undefined) return null;

    const points = link.points.map((p: Point) => ({ ...p }));
    if (handle.index <= 0 || handle.index >= points.length - 1) return null;

    const next = points.filter((_, i) => i !== handle.index);
    return new SetLinkPointsCommand(link.id, next, points);
  }

  /**
   * The command behind a remove button / halo `delete`: drop the whole selection
   * (every selected node AND link) in ONE undo step.
   */
  removeSelectionCommand(engine: DiagramEngine): Command | null {
    const diagram = engine.getDiagram();
    if (!diagram) return null;

    const nodes = diagram.getNodes().filter((n: NodeModel) => n.isSelected());
    const links = diagram.getLinks().filter((l: LinkModel) => l.state === 'selected');
    if (nodes.length === 0 && links.length === 0) return null;

    if (nodes.length === 1 && links.length === 0) {
      return new RemoveNodeCommand(nodes[0]!.id);
    }
    if (nodes.length === 0 && links.length === 1) {
      return new RemoveLinkCommand(links[0]!.id);
    }

    const macro = new MacroCommand(`Remove ${nodes.length + links.length} items`);
    // Links first: removing a node cascades its links, and a RemoveLinkCommand for
    // an already-removed link would fail canExecute.
    links.forEach((l: LinkModel) => macro.addStep(new RemoveLinkCommand(l.id)));
    nodes.forEach((n: NodeModel) => macro.addStep(new RemoveNodeCommand(n.id)));
    return macro;
  }

  /**
   * Halo `clone`: a copy of the node, offset, as one undoable AddNodeCommand.
   * Ports get fresh ids (via the engine's shared {@link remapNodePortIds}) so the
   * clone never shares port identity with its source — the bug paste/duplicate
   * already learned.
   */
  cloneNodeCommand(
    engine: DiagramEngine,
    nodeId: string,
    offset: Point = { x: 40, y: 40 }
  ): Command | null {
    const clone = this.buildClone(engine, nodeId, offset);
    return clone ? new AddNodeCommand(clone.node) : null;
  }

  /**
   * Halo `fork`: clone the node AND link the original to the clone — one undo
   * step (MacroCommand). The link runs from an output-capable port on the source
   * to an input-capable port on the clone; null when either side has no usable port.
   */
  forkNodeCommand(
    engine: DiagramEngine,
    nodeId: string,
    offset: Point = { x: 160, y: 0 }
  ): Command | null {
    const diagram = engine.getDiagram();
    const source = diagram?.getNode(nodeId);
    if (!diagram || !source) return null;

    const clone = this.buildClone(engine, nodeId, offset);
    if (!clone) return null;

    const sourcePort = source.getPorts().find((p) => p.type === 'output' || p.type === 'bi');
    const targetPort = clone.node.getPorts().find((p) => p.type === 'input' || p.type === 'bi');
    if (!sourcePort || !targetPort) return null;

    // LinkModel's constructor is positional; the node-id caches are set after.
    const link = new LinkModelCtor(sourcePort.id, targetPort.id);
    link.setSourcePort(sourcePort.id, source.id);
    link.setTargetPort(targetPort.id, clone.node.id);

    const macro = new MacroCommand('Fork Node');
    macro.addStep(new AddNodeCommand(clone.node));
    macro.addStep(new AddLinkCommand(link));
    return macro;
  }

  /** Deserialize → re-id → offset. Shared by clone + fork. */
  protected buildClone(
    engine: DiagramEngine,
    nodeId: string,
    offset: Point
  ): { node: NodeModel } | null {
    const node = engine.getDiagram()?.getNode(nodeId);
    if (!node) return null;

    // Same recipe PasteCommand uses: fresh node id, then fresh port ids (fromJSON
    // restores the ORIGINAL port ids, which would make two live nodes share port
    // identity and break every link lookup that resolves a node by port id).
    const data = node.serialize();
    const newId = generateId();
    const clone = NodeModelCtor.fromJSON({ ...data, id: newId });
    remapNodePortIds(clone, newId, new Map<string, string>());
    clone.setPosition(node.position.x + offset.x, node.position.y + offset.y, node.position.z);
    // A clone starts unselected; the host selects it after the command lands.
    clone.setState({ selected: false, hovered: false });
    return { node: clone };
  }
}

/** Point-array equality (used to suppress no-op vertex commits). */
function samePoints(a: Point[], b: Point[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i]!.x !== b[i]!.x || a[i]!.y !== b[i]!.y) return false;
  }
  return true;
}
