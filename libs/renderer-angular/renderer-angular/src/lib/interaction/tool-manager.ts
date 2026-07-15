/**
 * ToolManager — single-active-tool arbitration for canvas interaction.
 *
 * WHO ACTUALLY FEEDS IT (wave14/ng-touch — this comment used to lie). This
 * header once claimed a "unified PointerInputController" turned raw device
 * events into the stream the ToolManager consumes. No such thing ever ran:
 * `PointerInputController` was written, exported, unit-tested — and never
 * constructed by anything. It has been deleted. The real inputs are:
 *
 *   - MOUSE / PEN: `DiagramCanvasComponent`'s pointer/mouse handlers build a
 *     {@link ToolPointerEvent} per event (`toToolEvent`) and call
 *     `pointerDown/Move/Up/Cancel` directly for the node-drag and marquee
 *     branches of its ladder.
 *   - TOUCH: does NOT come here at all. Touch gestures route to the shared
 *     `TouchGestureController` from `@grafloria/renderer` (pan / pinch / tap /
 *     long-press / drag / resize), which owns its own arbitration.
 *
 * For every pointer gesture the manager HIT-TESTS the scene once (on down) and
 * routes the whole gesture to EXACTLY ONE tool — `select`, `node-drag`,
 * `link-draw`, `marquee` or `pan`. There is never more than one active tool,
 * which is what prevents the "everything fires at once" waterfall the canvas
 * grew organically.
 *
 * Two correctness rules are baked in here (and unit-tested in isolation from
 * Angular / the DOM):
 *
 *  1. MOVEMENT THRESHOLD (click vs drag). Drag-style tools (`node-drag`,
 *     `marquee`) are ARMED on down but do NOT commit — i.e. do not touch node
 *     positions or the selection rect — until the pointer travels farther than
 *     `dragThreshold` screen px. A plain click therefore never micro-jitters a
 *     node's position, which is the bug where `isDraggingNode` used to flip
 *     true on the very first mousedown.
 *
 *  2. DELIBERATE gating. In DELIBERATE mode a node only becomes draggable if it
 *     was ALREADY selected before this pointerdown. A first click selects; a
 *     second press-drag moves. The manager refuses to arm `node-drag` unless
 *     `hit.nodeWasSelected` is true.
 *
 * The manager is framework-agnostic: it owns arbitration + threshold + modifier
 * math, and delegates every side effect to an injected {@link ToolActions} sink
 * (implemented by the Angular canvas against the engine). It reads the scene
 * through an injected {@link SceneHitTester}. No Angular, no engine imports.
 */

/** The five canvas tools. Exactly one is ever active per gesture. */
export type ToolId = 'select' | 'node-drag' | 'link-draw' | 'marquee' | 'pan';

/** Interaction mode string (matches the engine's `InteractionMode` enum values). */
export type ToolInteractionMode = 'direct' | 'deliberate' | 'smart';

/** Keyboard modifier snapshot carried by every event. */
export interface ToolModifiers {
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
  meta: boolean;
}

/**
 * Minimal pointer event the tools consume. Built per-event by the canvas'
 * `toToolEvent()` from the native MouseEvent/PointerEvent.
 */
export interface ToolPointerEvent {
  type: 'down' | 'move' | 'up' | 'cancel';
  /** World-space X (viewBox / zoom applied). */
  worldX: number;
  /** World-space Y. */
  worldY: number;
  /** Element-local screen X in CSS px — used for the drag threshold. */
  screenX: number;
  /** Element-local screen Y in CSS px. */
  screenY: number;
  /** Button whose state changed (0 = left, 1 = middle, -1 = pure move). */
  button: number;
  /** Bitmask of pressed buttons. */
  buttons: number;
  modifiers: ToolModifiers;
}

/** What sits under the pointer at down-time. */
export type HitKind = 'node' | 'port' | 'link' | 'empty';

export interface HitTestResult {
  kind: HitKind;
  /** Owning node id for `node` / `port` hits. */
  nodeId?: string;
  /**
   * Whether the hit node was already selected BEFORE this pointerdown.
   * MUST be captured before any on-down selection mutation — it is the sole
   * input to DELIBERATE-mode drag gating.
   */
  nodeWasSelected?: boolean;
  /** Opaque hook for the actions layer (e.g. the port/link reference). */
  payload?: unknown;
}

/** Injected scene query — returns what is under a world-space point. */
export type SceneHitTester = (worldX: number, worldY: number) => HitTestResult;

/** How a marquee combines with the existing selection (derived from modifiers). */
export type SelectionMode = 'replace' | 'add' | 'subtract' | 'toggle';

/** How a marquee decides membership (derived from drag direction). */
export type IntersectionMode = 'contain' | 'intersect';

/** World-space rectangle, shaped to match the engine's `BoundingBox`. */
export interface MarqueeRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

/** Fully-resolved marquee query handed to the actions layer each move. */
export interface MarqueeSelection {
  rect: MarqueeRect;
  intersectionMode: IntersectionMode;
  selectionMode: SelectionMode;
}

/**
 * Side-effect sink. Every method is OPTIONAL so a host can wire only the tools
 * it owns (the canvas keeps pan / link-draw in their existing branches for now
 * and implements just the node-drag + marquee actions). The manager still
 * arbitrates all five so the model — and its tests — stay complete.
 */
export interface ToolActions {
  beginNodeDrag?(hit: HitTestResult, down: ToolPointerEvent): void;
  updateNodeDrag?(current: ToolPointerEvent, down: ToolPointerEvent): void;
  endNodeDrag?(current: ToolPointerEvent): void;

  beginMarquee?(down: ToolPointerEvent): void;
  updateMarquee?(
    selection: MarqueeSelection,
    current: ToolPointerEvent,
    down: ToolPointerEvent,
  ): void;
  endMarquee?(current: ToolPointerEvent): void;

  beginLinkDraw?(hit: HitTestResult, down: ToolPointerEvent): void;
  updateLinkDraw?(current: ToolPointerEvent): void;
  endLinkDraw?(current: ToolPointerEvent): void;

  beginPan?(down: ToolPointerEvent): void;
  updatePan?(current: ToolPointerEvent): void;
  endPan?(current: ToolPointerEvent): void;
}

export interface ToolManagerConfig {
  mode: ToolInteractionMode;
  /** Screen-px movement before a drag tool commits. */
  dragThreshold: number;
}

/**
 * Map modifier keys → selection combine mode.
 * Shift → add, Cmd/Ctrl → toggle, Alt → subtract, none → replace.
 * Precedence when several are held: shift > meta/ctrl > alt.
 */
export function modifiersToSelectionMode(m: ToolModifiers): SelectionMode {
  if (m.shift) return 'add';
  if (m.meta || m.ctrl) return 'toggle';
  if (m.alt) return 'subtract';
  return 'replace';
}

/**
 * Map drag direction → membership test.
 * Left→right (or straight down) = `contain` (fully enclosed), right→left =
 * `intersect` (touched) — the Sketch / Figma convention.
 */
export function directionToIntersectionMode(
  downWorldX: number,
  currentWorldX: number,
): IntersectionMode {
  return currentWorldX >= downWorldX ? 'contain' : 'intersect';
}

/** Build the world-space rect spanned by two points. */
export function buildMarqueeRect(
  down: ToolPointerEvent,
  current: ToolPointerEvent,
): MarqueeRect {
  const left = Math.min(down.worldX, current.worldX);
  const right = Math.max(down.worldX, current.worldX);
  const top = Math.min(down.worldY, current.worldY);
  const bottom = Math.max(down.worldY, current.worldY);
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

export class ToolManager {
  private downEvent: ToolPointerEvent | null = null;
  private downHit: HitTestResult | null = null;
  private armed: ToolId | null = null;
  /** True once the armed tool has committed (its begin* action fired). */
  private committed = false;
  /** True while the armed tool waits for the movement threshold to commit. */
  private pendingThreshold = false;

  constructor(
    private hitTest: SceneHitTester,
    private actions: ToolActions,
    private config: ToolManagerConfig,
  ) {}

  /** Patch config (e.g. when the engine's interaction mode / threshold changes). */
  setConfig(patch: Partial<ToolManagerConfig>): void {
    this.config = { ...this.config, ...patch };
  }

  /** The tool that has actually committed for the current gesture, else null. */
  get activeTool(): ToolId | null {
    return this.committed ? this.armed : null;
  }

  /** The tool armed on down (may still be pending the threshold), else null. */
  get armedTool(): ToolId | null {
    return this.armed;
  }

  /** True while a gesture is in flight (between down and up/cancel). */
  get hasGesture(): boolean {
    return this.downEvent !== null;
  }

  /**
   * Begin a gesture: hit-test once and choose the single tool that will own it.
   * Drag tools are armed but not committed until the threshold is crossed.
   */
  pointerDown(event: ToolPointerEvent, hit?: HitTestResult): void {
    // Defensive: abandon any half-finished gesture (missed up) without side
    // effects beyond the tool's own end hook.
    if (this.downEvent) {
      this.finishGesture(event, /*cancelled*/ true);
    }

    this.downEvent = event;
    this.downHit = hit ?? this.hitTest(event.worldX, event.worldY);
    this.armed = null;
    this.committed = false;
    this.pendingThreshold = false;

    // Middle button = pan, regardless of what is underneath.
    if (event.button === 1) {
      this.armed = 'pan';
      this.commit(event);
      return;
    }

    // Only the primary (left) button drives the hit-routed tools.
    if (event.button !== 0) {
      return;
    }

    switch (this.downHit.kind) {
      case 'port':
        // Connecting is unambiguous — commit immediately, no threshold.
        this.armed = 'link-draw';
        this.commit(event);
        break;

      case 'node': {
        const wasSelected = this.downHit.nodeWasSelected === true;
        if (this.config.mode === 'deliberate' && !wasSelected) {
          // DELIBERATE: an unselected node can only be selected, never dragged
          // by this same press. The click-select itself is the host's job.
          this.armed = 'select';
        } else {
          this.armed = 'node-drag';
          this.pendingThreshold = true;
        }
        break;
      }

      case 'link':
        // Click-to-select a link; no drag gesture owned here.
        this.armed = 'select';
        break;

      case 'empty':
      default:
        this.armed = 'marquee';
        this.pendingThreshold = true;
        break;
    }
  }

  /**
   * Continue a gesture. Promotes an armed drag tool to committed once the
   * pointer crosses the threshold, then forwards the move to the active tool.
   */
  pointerMove(event: ToolPointerEvent): void {
    const down = this.downEvent;
    if (!down || !this.armed) {
      // No gesture in flight — hover handling is the host's concern.
      return;
    }

    if (this.pendingThreshold && !this.committed) {
      if (!this.movedPastThreshold(event)) {
        return; // still a click; do NOT touch the scene
      }
      this.commit(event);
    }

    if (!this.committed) {
      return; // e.g. a `select` tool never commits — nothing to update
    }

    switch (this.armed) {
      case 'node-drag':
        this.actions.updateNodeDrag?.(event, down);
        break;
      case 'marquee':
        this.actions.updateMarquee?.(
          this.buildMarqueeSelection(down, event),
          event,
          down,
        );
        break;
      case 'link-draw':
        this.actions.updateLinkDraw?.(event);
        break;
      case 'pan':
        this.actions.updatePan?.(event);
        break;
    }
  }

  /** End a gesture, firing the active tool's end hook. */
  pointerUp(event: ToolPointerEvent): void {
    this.finishGesture(event, /*cancelled*/ false);
  }

  /** Abort a gesture (pointercancel / mouseleave). */
  pointerCancel(event: ToolPointerEvent): void {
    this.finishGesture(event, /*cancelled*/ true);
  }

  private commit(event: ToolPointerEvent): void {
    this.committed = true;
    const down = this.downEvent ?? event;
    switch (this.armed) {
      case 'node-drag':
        this.actions.beginNodeDrag?.(this.downHit as HitTestResult, down);
        break;
      case 'marquee':
        this.actions.beginMarquee?.(down);
        break;
      case 'link-draw':
        this.actions.beginLinkDraw?.(this.downHit as HitTestResult, down);
        break;
      case 'pan':
        this.actions.beginPan?.(down);
        break;
    }
  }

  private finishGesture(event: ToolPointerEvent, cancelled: boolean): void {
    if (this.committed) {
      switch (this.armed) {
        case 'node-drag':
          this.actions.endNodeDrag?.(event);
          break;
        case 'marquee':
          this.actions.endMarquee?.(event);
          break;
        case 'link-draw':
          this.actions.endLinkDraw?.(event);
          break;
        case 'pan':
          this.actions.endPan?.(event);
          break;
      }
    }
    this.downEvent = null;
    this.downHit = null;
    this.armed = null;
    this.committed = false;
    this.pendingThreshold = false;
    void cancelled;
  }

  private movedPastThreshold(event: ToolPointerEvent): boolean {
    const down = this.downEvent;
    if (!down) return false;
    const dx = event.screenX - down.screenX;
    const dy = event.screenY - down.screenY;
    const t = this.config.dragThreshold;
    return dx * dx + dy * dy > t * t;
  }

  private buildMarqueeSelection(
    down: ToolPointerEvent,
    current: ToolPointerEvent,
  ): MarqueeSelection {
    return {
      rect: buildMarqueeRect(down, current),
      intersectionMode: directionToIntersectionMode(down.worldX, current.worldX),
      selectionMode: modifiersToSelectionMode(current.modifiers),
    };
  }
}
