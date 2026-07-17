import type { DiagramEngine, LinkModel, NodeModel, GroupModel } from '@grafloria/engine';
// wave12/connect-ergonomics (gap 1): the ONE undoable step a subflow drag commits.
import { MoveGroupCommand, MoveNodeCommand, MacroCommand } from '@grafloria/engine';
import type { Command } from '@grafloria/engine';
import type { GroupFrameSnapshot, GroupNodeMove, GroupFrameMove } from '@grafloria/engine';
import type { InteractionController } from '../interaction/interaction-controller';
import type { CanvasRect, ViewportController } from '../viewport/viewport-controller';
import { isBrowser } from '../platform';
// Wave 6 — Card 5: the pluggable tool registry. The binder CONSUMES it; a
// registered tool gets first refusal on every gesture (see onMouseDown).
import { resolveTool } from '../ext/tools';
import type { CanvasTool, ToolHitContext, ToolPointerEvent } from '../ext/tools';
// Wave 9 — Card 2: the touch/mobile gesture set (pan, pinch, tap, long-press,
// drag-to-connect). Nothing in the framework-free renderer handled touch before.
import { TouchGestureController } from '../interaction/touch-gestures';
// wave12/node-resize: the floating tool layer (8 resize handles + the clamp math).
// It answers "what tools exist and what does grabbing one DO"; the binder is the
// piece that was missing — the thing that actually GRABS one from a DOM pointer.
import { SelectionToolsController } from '../interaction/selection-tools';
import type { ToolHandle } from '../interaction/selection-tools';
// wave12/connect-ergonomics (gap 2): the shipped proximity-connect engine, now
// driven from the LIVE node drag instead of host glue.
import { SnapController } from '../interaction/snapping';
import type { ProximityCandidate } from '../interaction/snapping';

/**
 * DomEventBinder — the framework-agnostic DOM ⇄ interaction seam.
 *
 * Blocker #2 of the headless-instance contract (see ./diagram-instance.ts) and,
 * per that note, "the single largest remaining piece". The listeners used to be
 * Angular `@HostListener`s on the 2900-line `DiagramCanvasComponent`, and the
 * ORDER in which a `mousedown` is dispatched across
 *
 *   port → control-point → waypoint → link endpoint → link label → link body →
 *   node → empty canvas
 *
 * lived inline in that component. Nothing outside Angular could interact with a
 * diagram. This class owns exactly that decision tree, with no framework and no
 * engine-mutation logic of its own:
 *
 *      addEventListener  →  ViewportController.clientToWorld  →  InteractionController
 *
 * It never decides who re-renders. Like every other Wave-3 controller it answers
 * "what happened?" and calls {@link DomEventBinderHost.requestRender} when a
 * repaint is warranted; the host turns that into its own render trigger.
 *
 * ## What it owns beyond delegation
 *
 * - **Panning** (middle-drag, space+drag, wheel-scroll) — pure camera work, so it
 *   goes straight to the {@link ViewportController}.
 * - **Node dragging with a movement threshold.** A drag is ARMED on mousedown but
 *   does not move anything until the pointer travels farther than `dragThreshold`
 *   CSS px, so a plain click never micro-jitters a node's position. In DELIBERATE
 *   mode a node is only draggable if it was ALREADY selected before the press.
 *   (Same two rules the Angular `ToolManager` enforces — reimplemented here in 60
 *   lines because that class lives in the Angular library and a core module must
 *   not depend on a framework wrapper.)
 * - **Keyboard**: Delete/Backspace, Escape, Ctrl/⌘+A, Space (pan modifier).
 *
 * Marquee selection is deliberately NOT here: it needs an overlay rectangle in
 * the host's own layer, so it stays with the hosts that already draw one.
 */

/** Everything the binder needs from its host. Keeps this class DI-free. */
export interface DomEventBinderHost {
  /** The engine, or null before a diagram is attached. */
  getEngine(): DiagramEngine | null;
  readonly viewport: ViewportController;
  readonly interaction: InteractionController;
  /** The canvas' client rect (for screen→world). */
  getRect(): CanvasRect;
  /** "Something visible changed" — the host coalesces this into a frame. */
  requestRender(): void;
  /** Emit a public diagram event (`node:click`, `connect`, …). */
  emit(event: string, payload: unknown): void;
}

export interface DomEventBinderOptions {
  /** Middle-drag / space-drag / wheel-scroll panning. Default true. */
  enablePan?: boolean;
  /** Ctrl/⌘ + wheel zoom. Default true. */
  enableZoom?: boolean;
  /** Relative zoom step per wheel notch. Default 0.1 (a notch is ×1.1). */
  zoomSensitivity?: number;
  /** CSS px the pointer must travel before a node drag commits. Default 4. */
  dragThreshold?: number;
  /** Ignore every mutation-causing gesture (still pans/zooms). Default false. */
  readonly?: boolean;
}

/** An armed-but-not-yet-committed node drag. */
interface NodeDragState {
  nodeIds: string[];
  startClientX: number;
  startClientY: number;
  lastWorldX: number;
  lastWorldY: number;
  committed: boolean;
  /**
   * wave12: each dragged node's position when the drag first COMMITTED, captured so the
   * whole gesture can commit as one undoable MoveNodeCommand (a FROM→TO snapshot — see
   * commitNodeMove). Absent until the drag crosses the threshold.
   */
  startPositions?: Map<string, { x: number; y: number; z?: number }>;
  /**
   * Pointer world position at the press, kept so helper-line snapping can track
   * the VIRTUAL (unsnapped) position: virtual = start + (pointerNow − anchor).
   * Correcting the model per-move and then deriving the next move from the
   * corrected position would drift by every past correction; the virtual
   * position makes leaving a snapline land exactly back under the pointer.
   */
  snapAnchor?: { x: number; y: number };
}

/**
 * wave12/connect-ergonomics (gap 1): an armed-but-not-yet-committed GROUP drag.
 *
 * The engine stores absolute coordinates, so a group's members do not track the
 * frame — the drag translates every member node (recursively through nested
 * groups) and the frame(s) itself. `nodeFrom` / `frameFrom` are the drag-START
 * snapshot so the whole gesture commits as ONE undoable {@link MoveGroupCommand}.
 */
interface GroupDragState {
  groupId: string;
  nodeIds: string[];
  groupIds: string[];
  startClientX: number;
  startClientY: number;
  lastWorldX: number;
  lastWorldY: number;
  committed: boolean;
  nodeFrom: Map<string, { x: number; y: number; z?: number }>;
  frameFrom: Map<string, GroupFrameSnapshot>;
}

export class DomEventBinder {
  private readonly options: Required<DomEventBinderOptions>;

  private attached = false;
  private spaceKeyPressed = false;

  private isPanning = false;
  /** Armed by an empty-canvas left press; becomes a real pan past the drag threshold. */
  private pendingEmptyPan: { startX: number; startY: number } | null = null;
  private lastPanX = 0;
  private lastPanY = 0;

  private nodeDrag: NodeDragState | null = null;
  private groupDrag: GroupDragState | null = null;

  /**
   * wave12/connect-ergonomics (gap 2): the proximity-connect engine, lazily
   * built the first time `enableProximityConnect` is used. Reused across drags so
   * a highlight it painted can always be cleared by the same instance.
   */
  private snap?: SnapController;
  /** The proximity candidate currently highlighted mid-drag (for commit on drop). */
  private proximityCandidate: ProximityCandidate | null = null;

  // Bound once so removeEventListener gets the SAME function object it added —
  // `removeEventListener(this.onX.bind(this))` allocates a new function and
  // silently removes nothing (the classic listener leak).
  private readonly boundWheel = (e: WheelEvent) => this.onWheel(e);

  /**
   * Wave 9 — Card 2. The touch pipeline.
   *
   * The binder used to listen for `mousedown`/`mousemove`/`mouseup` — MouseEvent,
   * mouse only. A touch reached it only as a browser-synthesized "compatibility"
   * mouse event: no pinch, no two-finger pan, no long-press, a 300ms delay, and
   * nothing at all once the browser decided the gesture was a scroll.
   *
   * Now the binder listens for POINTER events and forks on `pointerType`:
   *   - touch  → TouchGestureController (multi-touch, gesture-aware)
   *   - mouse/pen → the existing ladder below, unchanged (PointerEvent IS a
   *     MouseEvent, so onMouseDown/Move/Up take it as-is)
   */
  private readonly touch: TouchGestureController;

  /**
   * wave12/node-resize. The floating-tool controller, configured to expose ONLY
   * the 8 resize handles (halo / rotate / remove / link tools stay off — those
   * belong to the richer host renderers, not the framework-free default path).
   *
   * ONE instance is shared with {@link TouchGestureController} so a resize can be
   * driven by a mouse OR a finger without two controllers ever fighting over the
   * same gesture (they never run at once, and single-active-gesture is the rule).
   */
  private readonly selectionTools: SelectionToolsController;

  /**
   * Have we ever seen a real PointerEvent?
   *
   * The mouse listeners are kept as a LEGACY FALLBACK and auto-disable the instant
   * a pointer event arrives. Why: every real browser fires `pointerdown` before the
   * compatibility `mousedown`, so in a browser the pointer path wins and the mouse
   * path goes dead — no double-handling. But jsdom implements NO PointerEvent at
   * all, and this renderer's unit suites drive the binder by dispatching real
   * `MouseEvent`s at the container. Feature-detecting instead of hard-switching
   * keeps those suites (and any host that synthesizes mouse events) working exactly
   * as before, while real hardware gets the pointer pipeline.
   */
  private sawPointerEvent = false;

  /** The container's own touch-action, restored on detach. */
  private previousTouchAction: string | null = null;

  private readonly boundPointerDown = (e: PointerEvent) => this.onPointerDown(e);
  private readonly boundPointerMove = (e: PointerEvent) => this.onPointerMove(e);
  private readonly boundPointerUp = (e: PointerEvent) => this.onPointerUp(e);
  private readonly boundPointerCancel = (e: PointerEvent) => this.onPointerCancel(e);
  private readonly boundContextMenu = (e: MouseEvent) => this.onContextMenu(e);
  /**
   * Wave 6 — Card 5. The registered tool that CLAIMED the current gesture, if
   * any. Exactly one tool owns a gesture end-to-end (the same single-active-tool
   * rule the Angular ToolManager enforces).
   */
  private activeTool?: CanvasTool;
  private activeToolHit?: ToolHitContext;

  /**
   * Wave 6 — Card 3. The nodes currently being DRAGGED (past the movement
   * threshold — an armed-but-uncommitted press is a click, not a drag).
   *
   * Node-drag state lives here, not on the InteractionController, so a custom
   * node component had no way to know it was being dragged — and `dragging` is
   * one of the props the component contract promises. This is the read-only
   * window onto it.
   */
  getDraggingNodeIds(): string[] {
    return this.nodeDrag?.committed ? [...this.nodeDrag.nodeIds] : [];
  }

  // The legacy mouse listeners are GATED on `sawPointerEvent`: once the environment
  // has proved it delivers PointerEvents, the pointer pipeline owns everything and
  // these must go silent, or every mouse gesture would be handled twice (once as
  // pointerdown, once as the compatibility mousedown that follows it).
  //
  // Gated on the LISTENER, not on onMouseDown() itself — the pointer fork calls
  // onMouseDown() directly for mouse/pen, so gating the method would deafen the
  // very path that replaces these.
  private readonly boundMouseDown = (e: MouseEvent) => {
    if (this.sawPointerEvent) return;
    this.onMouseDown(e);
  };
  private readonly boundMouseMove = (e: MouseEvent) => {
    if (this.sawPointerEvent) return;
    this.onMouseMove(e);
  };
  private readonly boundMouseUp = (e: MouseEvent) => {
    if (this.sawPointerEvent) return;
    this.onMouseUp(e);
  };
  private readonly boundMouseLeave = () => this.onMouseLeave();
  private readonly boundDblClick = (e: MouseEvent) => this.onDoubleClick(e);
  private readonly boundKeyDown = (e: KeyboardEvent) => this.onKeyDown(e);
  private readonly boundKeyUp = (e: KeyboardEvent) => this.onKeyUp(e);

  constructor(
    private readonly container: HTMLElement,
    private readonly host: DomEventBinderHost,
    options: DomEventBinderOptions = {}
  ) {
    this.options = {
      enablePan: options.enablePan ?? true,
      enableZoom: options.enableZoom ?? true,
      zoomSensitivity: options.zoomSensitivity ?? 0.1,
      dragThreshold: options.dragThreshold ?? 4,
      readonly: options.readonly ?? false,
    };

    this.selectionTools = new SelectionToolsController({
      showHalo: false,
      showRotateHandle: false,
      showRemoveButton: false,
      showLinkTools: false,
    });

    this.touch = new TouchGestureController(
      {
        getEngine: () => this.host.getEngine(),
        viewport: this.host.viewport,
        interaction: this.host.interaction,
        getRect: () => this.host.getRect(),
        requestRender: () => this.host.requestRender(),
        emit: (event, payload) => this.host.emit(event, payload),
        isReadonly: () => this.isReadonly(),
      },
      {
        enablePan: this.options.enablePan,
        enableZoom: this.options.enableZoom,
      },
      this.selectionTools
    );
  }

  /**
   * Wave 9 — Card 7. Is editing forbidden RIGHT NOW?
   *
   * Was: `this.options.readonly` — a static constructor flag. Which meant
   * `engine.setMode(PRESENTATION)` — the engine's own read-only mode — did not
   * reach the event binder AT ALL. You could put the engine in presentation mode
   * and still drag nodes with the mouse.
   *
   * Now the binder asks the DOCUMENT, every time, so the mode is live: flip the
   * engine to VIEW/PRESENTATION on a mounted canvas and the very next gesture is
   * refused. The constructor option still forces read-only for a host that has no
   * mode concept.
   */
  private isReadonly(): boolean {
    return this.options.readonly || this.host.getEngine()?.getDiagram()?.isReadonly() === true;
  }

  /** Bind DOM listeners. No-op on the server and no-op if already attached. */
  attach(): void {
    if (this.attached || !isBrowser()) return;
    this.attached = true;

    // ------------------------------------------------------------------------
    // Wave 9 — Card 2. `touch-action: none`.
    //
    // THE line that makes touch work, and it did not exist anywhere in this
    // repository. Without it the browser owns the gesture: it decides a one-finger
    // drag is a page scroll and a two-finger spread is a page zoom, and it STOPS
    // DELIVERING pointermove to us mid-gesture. Every handler below can be
    // perfectly correct and the canvas still will not pan — the events never
    // arrive. This is the difference between "touch code exists" and "touch works".
    //
    // Set imperatively rather than in a stylesheet because the renderer is
    // framework-free and ships no CSS; the container belongs to the host.
    // ------------------------------------------------------------------------
    this.previousTouchAction = this.container.style.touchAction ?? '';
    this.container.style.touchAction = 'none';

    this.container.addEventListener('wheel', this.boundWheel, { passive: false });

    // Pointer events: the primary pipeline (mouse, pen AND touch).
    this.container.addEventListener('pointerdown', this.boundPointerDown);
    this.container.addEventListener('pointermove', this.boundPointerMove);
    this.container.addEventListener('pointerup', this.boundPointerUp);
    this.container.addEventListener('pointercancel', this.boundPointerCancel);

    // Suppress the OS long-press menu on touch; we emit our own `contextmenu`
    // payload from the gesture controller (with the node/edge under the finger).
    this.container.addEventListener('contextmenu', this.boundContextMenu);

    // Legacy mouse listeners. Auto-disabled the moment a real PointerEvent shows
    // up (see `sawPointerEvent`), so in a browser these are dead and there is no
    // double-handling — but jsdom has no PointerEvent, and the unit suites drive
    // this binder with dispatched MouseEvents.
    this.container.addEventListener('mousedown', this.boundMouseDown);
    this.container.addEventListener('mousemove', this.boundMouseMove);
    this.container.addEventListener('mouseup', this.boundMouseUp);
    this.container.addEventListener('mouseleave', this.boundMouseLeave);
    this.container.addEventListener('dblclick', this.boundDblClick);
    window.addEventListener('keydown', this.boundKeyDown);
    window.addEventListener('keyup', this.boundKeyUp);
  }

  /** Remove EXACTLY the listeners we added, and drop all gesture state. */
  detach(): void {
    if (!this.attached) return;
    this.attached = false;

    this.container.removeEventListener('wheel', this.boundWheel);
    this.container.removeEventListener('pointerdown', this.boundPointerDown);
    this.container.removeEventListener('pointermove', this.boundPointerMove);
    this.container.removeEventListener('pointerup', this.boundPointerUp);
    this.container.removeEventListener('pointercancel', this.boundPointerCancel);
    this.container.removeEventListener('contextmenu', this.boundContextMenu);
    this.container.removeEventListener('mousedown', this.boundMouseDown);
    this.container.removeEventListener('mousemove', this.boundMouseMove);
    this.container.removeEventListener('mouseup', this.boundMouseUp);
    this.container.removeEventListener('mouseleave', this.boundMouseLeave);
    this.container.removeEventListener('dblclick', this.boundDblClick);
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.boundKeyDown);
      window.removeEventListener('keyup', this.boundKeyUp);
    }

    // Give the container its touch-action back — the binder must leave no trace.
    if (this.previousTouchAction !== null) {
      this.container.style.touchAction = this.previousTouchAction;
      this.previousTouchAction = null;
    }

    this.touch.reset();
    this.isPanning = false;
    this.pendingEmptyPan = null;
    this.nodeDrag = null;
    this.groupDrag = null;
    this.spaceKeyPressed = false;
    this.engine()?.setSnapGuides(null);
  }

  // ==========================================================================
  // Pointer events — the fork. Touch goes to the gesture controller; mouse and
  // pen fall through to the ladder below (a PointerEvent IS a MouseEvent).
  // ==========================================================================

  private onPointerDown(event: PointerEvent): void {
    this.sawPointerEvent = true;
    if (event.pointerType === 'touch') {
      // Claim the gesture: suppresses the synthesized compatibility mouse events
      // (which would otherwise run the whole mouse ladder a second time for every
      // tap) and the OS text-selection/callout.
      event.preventDefault();
      // Capture, so a finger that slides off the canvas keeps delivering move/up.
      // Without it a drag that leaves the element silently stops mid-gesture.
      //
      // wave11/gallery BUG FIX — this can THROW. setPointerCapture raises
      // NotFoundError ("no active pointer with the given id") when the pointer is not
      // an active one — which happens for a synthetic PointerEvent (a test, an a11y
      // tool, a programmatic gesture) and, in the wild, when the pointer has already
      // been released by the time the handler runs. Optional chaining does not catch a
      // throw, so an unguarded call turned a lost race into an uncaught error that
      // aborted the whole gesture. Capture is an optimisation, not a precondition;
      // failing to get it must not take the gesture down with it.
      try {
        this.container.setPointerCapture?.(event.pointerId);
      } catch {
        /* capture is best-effort; the gesture still works without it */
      }
      this.touch.onPointerDown(event);
      return;
    }
    this.onMouseDown(event);
  }

  private onPointerMove(event: PointerEvent): void {
    this.sawPointerEvent = true;
    if (event.pointerType === 'touch') {
      this.touch.onPointerMove(event);
      return;
    }
    this.onMouseMove(event);
  }

  private onPointerUp(event: PointerEvent): void {
    this.sawPointerEvent = true;
    if (event.pointerType === 'touch') {
      // Mirror of onPointerDown's guard — releasing a capture we never held (or that
      // the browser already dropped) throws NotFoundError, which must not abort the
      // gesture's own bookkeeping below.
      try {
        this.container.releasePointerCapture?.(event.pointerId);
      } catch {
        /* nothing to release; carry on */
      }
      this.touch.onPointerUp(event);
      return;
    }
    this.onMouseUp(event);
  }

  private onPointerCancel(event: PointerEvent): void {
    if (event.pointerType === 'touch') {
      try {
        this.container.releasePointerCapture?.(event.pointerId);
      } catch {
        /* nothing to release */
      }
      this.touch.onPointerCancel(event);
      return;
    }
    this.onMouseLeave();
  }

  /**
   * The native context menu. On touch the long-press already emitted our own
   * `contextmenu` payload, so the OS menu here would be a duplicate on top of it.
   */
  private onContextMenu(event: MouseEvent): void {
    const pointerType = (event as PointerEvent).pointerType;
    if (pointerType === 'touch' || this.touch.activePointerCount > 0) {
      event.preventDefault();
    }
  }

  get isAttached(): boolean {
    return this.attached;
  }

  // ==========================================================================
  // Wheel — ctrl/⌘ (and trackpad pinch) zooms at the cursor; a plain wheel pans.
  // The Figma/Miro/VS Code convention.
  // ==========================================================================

  onWheel(event: WheelEvent): void {
    const engine = this.engine();
    if (!engine) return;

    if (event.ctrlKey || event.metaKey) {
      if (!this.options.enableZoom) return;
      event.preventDefault();

      // Multiplicative: a notch is a constant RELATIVE change, so it feels the
      // same at 0.2× and at 3× (an additive ±sensitivity does not).
      const factor = 1 + this.options.zoomSensitivity;
      const zoom = this.host.viewport.getZoom();
      const target = event.deltaY > 0 ? zoom / factor : zoom * factor;

      this.host.viewport.zoomAtPoint(target, event.clientX, event.clientY, this.host.getRect());
      this.host.requestRender();
      return;
    }

    if (!this.options.enablePan) return;
    event.preventDefault();

    const [dxPx, dyPx] = event.shiftKey
      ? [event.deltaY || event.deltaX, 0] // shift → horizontal scroll
      : [event.deltaX, event.deltaY];
    if (!dxPx && !dyPx) return;

    this.host.viewport.panByScreenDelta(dxPx, dyPx);
    this.host.requestRender();
  }

  // ==========================================================================
  // Mouse down — the priority ladder.
  // ==========================================================================

  /** Wave 6 — Card 5: adapt a DOM event to the framework-free tool contract. */
  private toToolEvent(
    type: 'down' | 'move' | 'up' | 'cancel',
    event: MouseEvent,
    worldX: number,
    worldY: number
  ): ToolPointerEvent {
    const rect = this.host.getRect();
    return {
      type,
      world: { x: worldX, y: worldY },
      screen: { x: event.clientX - rect.left, y: event.clientY - rect.top },
      modifiers: {
        shift: event.shiftKey,
        ctrl: event.ctrlKey,
        alt: event.altKey,
        meta: event.metaKey,
      },
      source: event,
    };
  }

  /** What the gesture landed on. Resolved ONCE, on pointerdown. */
  private toToolHit(worldX: number, worldY: number): ToolHitContext {
    const diagram = this.engine()?.getDiagram();
    const state = this.host.interaction.getState();
    const node = diagram?.getNodeAtPosition(worldX, worldY) ?? undefined;

    return {
      node: node ?? undefined,
      link: state.hoveredLink ?? undefined,
      port: state.hoveredPort ?? undefined,
      empty: !node && !state.hoveredLink && !state.hoveredPort,
      // DELIBERATE mode's rule: a node only becomes draggable if it was ALREADY
      // selected before this gesture. Captured here, before selection changes.
      nodeWasSelected: node ? node.state?.selected === true : false,
    };
  }

  /**
   * wave12/node-resize: the resize handle (if any) under a world point.
   *
   * Recomputes the tool layer at the CURRENT zoom on every press — the handles are
   * a constant screen size, so their world footprint changes with the camera, and a
   * stale layer would hit-test against last frame's zoom. Only `kind: 'resize'`
   * handles are returned; the controller is configured to emit no others.
   */
  private resizeHandleAt(worldX: number, worldY: number): ToolHandle | null {
    const engine = this.engine();
    if (!engine) return null;
    const layer = this.selectionTools.computeLayer(engine, this.host.viewport.getZoom());
    const hit = this.selectionTools.hitTest(layer, worldX, worldY);
    return hit && hit.kind === 'resize' ? hit : null;
  }

  /**
   * wave14/interaction (defect 1): the reconnectable link ENDPOINT HANDLE under a
   * world point, or null.
   *
   * Non-null only when the part-aware edge hit resolves to a source/target
   * endpoint (8px grab radius) of a SELECTED link with reconnection enabled —
   * i.e. exactly when the renderer draws a handle there. The mousedown ladder
   * consults this INSIDE the hovered-port rung, because the handle is drawn on
   * top of the port and a press inside its radius means the handle, not the port.
   * Same gate as the rung-5/6 reconnect branch, so hover-then-press and
   * press-without-hover start the identical gesture.
   */
  private reconnectableEndpointAt(
    worldX: number,
    worldY: number,
    engine: DiagramEngine,
    config: ReturnType<DiagramEngine['getInteractionConfig']>
  ): { link: LinkModel; endpoint: 'source' | 'target' } | null {
    if (!config.enableLinkReconnection) return null;
    const hit = this.host.interaction.getLinkHitAtPosition(worldX, worldY, engine);
    if (!hit || hit.link.state !== 'selected') return null;
    if (hit.part === 'source-endpoint') return { link: hit.link, endpoint: 'source' };
    if (hit.part === 'target-endpoint') return { link: hit.link, endpoint: 'target' };
    return null;
  }

  onMouseDown(event: MouseEvent): void {
    const engine = this.engine();
    const diagram = engine?.getDiagram();
    if (!engine || !diagram) return;

    // 1. Pan: middle button, or left button while Space is held.
    if (event.button === 1 || (event.button === 0 && this.spaceKeyPressed)) {
      if (!this.options.enablePan) return;
      event.preventDefault();
      this.isPanning = true;
      this.lastPanX = event.clientX;
      this.lastPanY = event.clientY;
      this.setCursor('grabbing');
      return;
    }

    if (event.button !== 0) return;

    const { x: worldX, y: worldY } = this.toWorld(event);
    const config = engine.getInteractionConfig();
    const state = this.host.interaction.getState();

    // ------------------------------------------------------------------
    // Wave 6 — Card 5: REGISTERED TOOLS get first refusal on the gesture.
    //
    // The five built-in behaviours below are a hardcoded priority ladder. A host
    // that wanted to replace one — a custom lasso, a different node-drag — had
    // no seam to do it through. Now a registered tool may CLAIM the gesture on
    // pointerdown, and if it does it owns the whole thing (move/up/cancel) and
    // none of the ladder runs.
    //
    // With NO tools registered `resolveTool` returns undefined and everything
    // below is byte-identical to before — which is why this is additive.
    // ------------------------------------------------------------------
    if (!this.isReadonly()) {
      const toolEvent = this.toToolEvent('down', event, worldX, worldY);
      const toolHit = this.toToolHit(worldX, worldY);
      const tool = resolveTool(toolEvent, toolHit);
      if (tool) {
        event.preventDefault();
        this.activeTool = tool;
        this.activeToolHit = toolHit;
        tool.onPointerDown?.(toolEvent, toolHit);
        this.host.requestRender();
        return;
      }
    }

    // ------------------------------------------------------------------
    // wave12/node-resize: a RESIZE HANDLE on the selected node.
    //
    // Checked BEFORE ports and before node selection/drag: a corner handle sits
    // exactly on the node's corner, so if the node hit-test won here every attempt
    // to resize would drag the node instead. Handles only exist for a single
    // selected, resizable node (see SelectionToolsController.computeLayer), so this
    // is inert until the user has selected something — the first click selects, the
    // handle appears, the second grabs it.
    //
    // EXCEPT the four SIDE handles (n/e/s/w): they sit at the edge midpoints —
    // the exact anchors of the default side ports — so on a selected node every
    // press on a visible port glyph used to become a RESIZE (a user drew a wire
    // and got a 40px-wider node instead; the port's hover hit radius fully
    // contains the handle's, so the handle was unreachable-around anyway). When
    // the pointer is on a hovered port OF THE SAME NODE, the PORT wins and the
    // press falls through to the connection rung below. Corners never coincide
    // with ports and stay resize; side-resize remains on nodes whose ports are
    // hidden (no hover ⇒ no port claim).
    // ------------------------------------------------------------------
    if (!this.isReadonly()) {
      const handle = this.resizeHandleAt(worldX, worldY);
      if (handle) {
        const sideHandle =
          handle.kind === 'resize' && ['n', 'e', 's', 'w'].includes(String(handle.handleId));
        const portClaims =
          sideHandle && state.hoveredPort && state.hoveredPort.nodeId === handle.nodeId;
        if (!portClaims) {
          event.preventDefault();
          this.selectionTools.beginResize(handle, engine, worldX, worldY);
          this.host.requestRender();
          return;
        }
      }
    }

    if (!this.isReadonly()) {
      // 2. Port → start a connection drag… UNLESS the press is on a link
      // endpoint handle drawn ON that port.
      //
      // wave14/interaction DEFECT-1 FIX. A selected link's endpoint handle is
      // rendered AT the port it connects to (the routed polyline ends on the
      // port), and the pointermove that carries the mouse onto the handle sets
      // `hoveredPort` (≈11px hit radius: portDefaultRadius 6 × hoverScale 1.5
      // + 2px) — so this rung used to swallow the press and the natural
      // reconnect gesture ALWAYS started a new connection instead. When the
      // press point is inside the endpoint's own 8px grab radius
      // (DEFAULT_ENDPOINT_RADIUS) on a selected, reconnectable link, the user
      // is visibly touching the handle drawn on top: the ENDPOINT wins.
      //
      // Starting a fresh connection from that port stays possible: the annulus
      // 8 < d ≤ 11 around the handle still belongs to the port (3px of ring for
      // a mouse — thin but real, and it widens by `hitSlop` on touch), every
      // OTHER port of the node is untouched, and an endpoint drag dropped on an
      // invalid target reverts, so the worst mis-grab costs one Escape.
      if (state.hoveredPort) {
        event.preventDefault();
        const endpointHit = this.reconnectableEndpointAt(worldX, worldY, engine, config);
        if (endpointHit) {
          this.host.interaction.startLinkReconnection(
            endpointHit.link,
            endpointHit.endpoint,
            worldX,
            worldY,
            engine
          );
          this.host.requestRender();
          return;
        }
        this.host.interaction.startConnection(state.hoveredPort, worldX, worldY, engine);
        this.host.requestRender();
        return;
      }

      // 3/4. Control-point and waypoint handles. These are separate SVG circles,
      // so clicking one does NOT register as hovering the link path — which is
      // why both are hit-tested against every SELECTED link rather than the
      // hovered one.
      const selectedLinks = diagram
        .getLinks()
        .filter((link: LinkModel) => link.state === 'selected');

      if (config.enableControlPointEditing) {
        for (const link of selectedLinks) {
          const hit = this.host.interaction.hitTestControlPoint(worldX, worldY, link);
          if (hit) {
            event.preventDefault();
            this.host.interaction.startControlPointDrag(hit.segmentIndex, hit.controlType, link);
            this.host.requestRender();
            return;
          }
        }
      }

      if (config.enableWaypointEditing) {
        for (const link of selectedLinks) {
          const waypointIndex = this.host.interaction.hitTestWaypoint(worldX, worldY, link);
          if (waypointIndex !== null) {
            event.preventDefault();
            this.host.interaction.startWaypointDrag(waypointIndex, link);
            this.host.requestRender();
            return;
          }
          if (this.host.interaction.hitTestPath(worldX, worldY, link)) {
            event.preventDefault();
            if (this.host.interaction.addWaypoint(worldX, worldY, link)) {
              this.host.requestRender();
            }
            return;
          }
        }
      }

      // 5/6. Part-aware edge hit: endpoint handle → reconnect, label → drag.
      // A body hit deliberately falls through to link selection below.
      const edgeHit = this.host.interaction.getLinkHitAtPosition(worldX, worldY, engine);
      if (edgeHit) {
        if (
          (edgeHit.part === 'source-endpoint' || edgeHit.part === 'target-endpoint') &&
          config.enableLinkReconnection &&
          edgeHit.link.state === 'selected'
        ) {
          event.preventDefault();
          const endpoint = edgeHit.part === 'source-endpoint' ? 'source' : 'target';
          this.host.interaction.startLinkReconnection(
            edgeHit.link,
            endpoint,
            worldX,
            worldY,
            engine
          );
          this.host.requestRender();
          return;
        }

        if (edgeHit.part === 'label' && edgeHit.labelIndex !== undefined) {
          event.preventDefault();
          this.host.interaction.startLabelDrag(edgeHit.link, edgeHit.labelIndex);
          this.host.requestRender();
          return;
        }
      }
    }

    // 7. Link body → select. Hover state is the fast path; fall back to a direct
    // hit-test because on first load no mousemove has run yet.
    const link =
      state.hoveredLink ??
      this.host.interaction.getLinkAtPosition(worldX, worldY, engine);
    if (link) {
      event.preventDefault();
      this.host.interaction.selectLink(link, engine, event.ctrlKey || event.metaKey);
      this.host.requestRender();
      this.emitSelectionChange();
      this.host.emit('edge:click', { edge: link, world: { x: worldX, y: worldY } });
      return;
    }

    // 8. Node → select (+ arm a drag).
    const node = this.resolveNode(diagram, worldX, worldY, event);
    if (node) {
      event.preventDefault();

      // 8a. wave12 (gap 3) — Easy Connect: the whole node BODY is a handle. When
      // on (and the configured modifier, if any, is held), a body press starts a
      // CONNECTION from the node's nearest port instead of a move. A press ON a
      // port already started a connection at step 2, so this only fires on the
      // body. Off by default, so normal body-drag-to-move is untouched; a host
      // that keeps move gates connect behind `easyConnectModifier` (e.g. shift).
      if (!this.isReadonly() && config.enableEasyConnect && this.easyConnectModifierHeld(event, config)) {
        // Select the node first (so a plain click still selects), THEN connect.
        this.host.interaction.startNodeBodyConnection(node, worldX, worldY, engine);
        this.host.requestRender();
        this.host.emit('node:click', { node, world: { x: worldX, y: worldY } });
        return;
      }

      this.pressNode(node, diagram, event, worldX, worldY);
      this.host.emit('node:click', { node, world: { x: worldX, y: worldY } });
      return;
    }

    // 8b. wave12 (gap 1) — Group frame → drag the whole subflow. Only reached
    // when NO node/link/port was under the cursor (a member node wins the ladder
    // above), so this is a press on the container's empty area / header. Opt-in
    // via `enableGroupDrag`; off, this falls straight through to the clear below,
    // byte-identical to the historic behaviour.
    if (
      !this.isReadonly() &&
      config.enableGroupDrag &&
      !(event.shiftKey || event.ctrlKey || event.metaKey || event.altKey)
    ) {
      const group = this.findGroupAtPoint(diagram, worldX, worldY);
      if (group) {
        event.preventDefault();
        this.pressGroup(group, diagram, event, worldX, worldY);
        return;
      }
    }

    // 9. Empty canvas → clear the selection (unless a modifier is extending it),
    //    and ARM a pan: dragging empty canvas is the industry-default pan
    //    gesture (React Flow, Figma, tldraw), and six demo pages documented it
    //    while the binder only panned on middle-button/Space (live audit: the
    //    printed step was a silent no-op). A plain CLICK still only deselects —
    //    the pan engages past the drag threshold in onMouseMove.
    const hasModifier = event.shiftKey || event.ctrlKey || event.metaKey || event.altKey;
    if (!hasModifier) {
      diagram.clearSelection();
      diagram.getLinks().forEach((l: LinkModel) => {
        if (l.state === 'selected') l.setState('default');
      });
      this.host.requestRender();
      this.emitSelectionChange();
      if (this.options.enablePan) {
        this.pendingEmptyPan = { startX: event.clientX, startY: event.clientY };
      }
    }
  }

  // ==========================================================================
  // Mouse move
  // ==========================================================================

  onMouseMove(event: MouseEvent): void {
    const engine = this.engine();
    if (!engine || !engine.getDiagram()) return;

    // Wave 6 — Card 5: a tool that CLAIMED this gesture owns every subsequent
    // move until pointerup. Checked before panning so a tool can pan itself.
    if (this.activeTool) {
      const { x, y } = this.toWorld(event);
      this.activeTool.onPointerMove?.(
        this.toToolEvent('move', event, x, y),
        this.activeToolHit ?? { empty: true }
      );
      this.host.requestRender();
      return;
    }

    // wave12/node-resize: an in-flight resize owns the pointer. The clamp
    // (min/max/aspect) is applied INSIDE updateResize, every move — you cannot drag
    // the box past its limits, it is not fixed up at the end.
    if (this.selectionTools.activeGesture() === 'resize') {
      const { x, y } = this.toWorld(event);
      if (
        this.selectionTools.updateResize(engine, x, y, {
          shift: event.shiftKey,
          alt: event.altKey,
          ctrl: event.ctrlKey,
          meta: event.metaKey,
        })
      ) {
        this.host.interaction.invalidatePortHitCache();
        this.host.requestRender();
      }
      return;
    }

    if (this.pendingEmptyPan && !this.isPanning) {
      // Only while the PRIMARY button is genuinely down: the armed state is
      // also cleared on pointerup, but a hover move must never engage a pan.
      if ((event.buttons & 1) === 0) {
        this.pendingEmptyPan = null;
      } else {
      const dx = event.clientX - this.pendingEmptyPan.startX;
      const dy = event.clientY - this.pendingEmptyPan.startY;
      if (Math.hypot(dx, dy) >= this.options.dragThreshold) {
        this.isPanning = true;
        this.lastPanX = event.clientX;
        this.lastPanY = event.clientY;
        this.setCursor('grabbing');
      }
      }
    }

    if (this.isPanning) {
      // Drag RIGHT ⇒ camera LEFT, so the content follows the cursor.
      this.host.viewport.panByScreenDelta(
        this.lastPanX - event.clientX,
        this.lastPanY - event.clientY
      );
      this.lastPanX = event.clientX;
      this.lastPanY = event.clientY;
      this.host.requestRender();
      return;
    }

    if (this.groupDrag) {
      this.moveGroupDrag(event);
      return;
    }

    if (this.nodeDrag) {
      this.moveNodeDrag(event);
      return;
    }

    const state = this.host.interaction.getState();
    const { x: worldX, y: worldY } = this.toWorld(event);

    if (state.isDraggingControlPoint) {
      if (this.host.interaction.moveControlPoint(worldX, worldY, engine)) {
        this.host.requestRender();
      }
      return;
    }

    if (state.isDraggingWaypoint) {
      if (this.host.interaction.moveWaypoint(worldX, worldY, engine)) {
        this.host.requestRender();
      }
      return;
    }

    if (state.isDraggingLabel) {
      if (this.host.interaction.moveLabelDrag(worldX, worldY)) {
        this.host.requestRender();
      }
      return;
    }

    if (state.isReconnectingLink) {
      // Refresh hover first so reconnection validity sees the port under the cursor.
      this.host.interaction.handleMouseMove(worldX, worldY, engine);
      this.host.interaction.updateLinkReconnection(worldX, worldY, engine);
      this.host.requestRender();
      return;
    }

    if (this.spaceKeyPressed) return;

    let needsRender = this.host.interaction.handleMouseMove(worldX, worldY, engine);

    if (this.host.interaction.getState().isConnecting) {
      needsRender =
        this.host.interaction.handleConnectionDrag(worldX, worldY, engine) || needsRender;
    }

    // Keep the Delete-key targets (hovered waypoint / control point) current.
    const config = engine.getInteractionConfig();
    if (config.enableWaypointEditing || config.enableControlPointEditing) {
      const hovered = this.host.interaction.getState().hoveredLink;
      const selectedLink = hovered && hovered.state === 'selected' ? hovered : null;
      if (config.enableWaypointEditing) {
        this.host.interaction.updateHoveredWaypoint(worldX, worldY, selectedLink);
      }
      if (config.enableControlPointEditing) {
        this.host.interaction.updateHoveredControlPoint(worldX, worldY, selectedLink);
      }
    }

    this.setCursor(this.host.interaction.getCursor(engine));

    if (needsRender) this.host.requestRender();
  }

  // ==========================================================================
  // Mouse up
  // ==========================================================================

  onMouseUp(event: MouseEvent): void {
    const engine = this.engine();
    if (!engine) return;
    if (event.button !== 0 && event.button !== 1) return;

    // Wave 6 — Card 5: hand the gesture's end to the tool that claimed it, then
    // release it. Released in a `finally` so a throwing tool cannot wedge the
    // canvas into a state where every future gesture is swallowed.
    if (this.activeTool) {
      const tool = this.activeTool;
      const hit = this.activeToolHit ?? { empty: true };
      const { x, y } = this.toWorld(event);
      try {
        tool.onPointerUp?.(this.toToolEvent('up', event, x, y), hit);
      } finally {
        this.activeTool = undefined;
        this.activeToolHit = undefined;
        this.host.requestRender();
      }
      return;
    }

    // wave12/node-resize: commit the resize as ONE undoable command. The model
    // already sits at its final size (updateResize mutated it live); the command
    // re-applies that (a no-op) and records the inverse — the wave-3 gesture-commit
    // pattern. `void`: the manager's execute() is async, but the visible state is
    // already correct, so we don't block the pointerup on it.
    if (this.selectionTools.activeGesture() === 'resize') {
      event.preventDefault();
      const command = this.selectionTools.endGesture(engine);
      if (command) {
        void engine.commandManager.execute(command);
        this.emitNodesChange();
      }
      this.host.requestRender();
      return;
    }

    const state = this.host.interaction.getState();

    if (state.isDraggingControlPoint) {
      event.preventDefault();
      this.host.interaction.endControlPointDrag();
      this.host.requestRender();
      return;
    }

    if (state.isDraggingWaypoint) {
      event.preventDefault();
      this.host.interaction.endWaypointDrag(engine);
      this.host.requestRender();
      return;
    }

    if (state.isDraggingLabel) {
      event.preventDefault();
      this.host.interaction.endLabelDrag();
      this.host.requestRender();
      return;
    }

    if (state.isConnecting) {
      event.preventDefault();
      // The link itself is created asynchronously by the engine's
      // `connection:complete` handler, so `connect` is emitted from the
      // instance's `link:added` subscription — not from here.
      this.host.interaction.completeConnection(engine);
      this.host.requestRender();
      return;
    }

    if (state.isReconnectingLink) {
      event.preventDefault();
      // Capture BEFORE completing: completion clears the reconnection state.
      const link = state.reconnectingLink;
      const endpoint = state.reconnectingEndpoint;
      if (this.host.interaction.completeLinkReconnection(engine) && link && endpoint) {
        this.host.emit('reconnect', { link, endpoint });
        this.emitEdgesChange();
      }
      this.host.requestRender();
      return;
    }

    if (this.groupDrag) {
      event.preventDefault();
      this.endGroupDrag(engine);
      this.setCursor('default');
      return;
    }

    if (this.nodeDrag) {
      const drag = this.nodeDrag;
      const moved = drag.committed;
      this.nodeDrag = null;
      // wave12: record the completed drag as one undoable step BEFORE anything else.
      if (moved && engine) this.commitNodeMove(engine, drag);
      // wave12 (gap 2): a drag that ended near a compatible port auto-links on drop.
      const connected = moved ? this.commitProximityConnection() : false;
      if (moved) this.emitNodesChange();
      if (connected) this.emitEdgesChange();
    }

    this.isPanning = false;
    this.pendingEmptyPan = null;
    this.setCursor(this.spaceKeyPressed ? 'grab' : 'default');
  }

  /** Pointer left the canvas — abort every in-flight gesture so nothing sticks. */
  onMouseLeave(): void {
    const engine = this.engine();
    this.isPanning = false;

    // wave12/node-resize: the pointer left mid-resize → commit what we have (the
    // node already looks right; abandoning would snap it back under the user).
    if (engine && this.selectionTools.activeGesture() === 'resize') {
      const command = this.selectionTools.endGesture(engine);
      if (command) {
        void engine.commandManager.execute(command);
        this.emitNodesChange();
      }
      this.host.requestRender();
    }

    // wave12/connect-ergonomics (gap 1): the pointer left mid-group-drag → commit it.
    if (this.groupDrag) {
      if (engine) this.endGroupDrag(engine);
      else this.groupDrag = null;
    }

    if (this.nodeDrag) {
      const drag = this.nodeDrag;
      const moved = drag.committed;
      this.nodeDrag = null;
      // Pointer left mid-drag: keep the move (the node already looks moved; snapping it
      // back would be worse) and STILL record it as one undoable step. Do not auto-connect.
      if (moved && engine) this.commitNodeMove(engine, drag);
      this.clearProximityPreview();
      if (moved) this.emitNodesChange();
    }

    if (engine && this.host.interaction.getState().isConnecting) {
      this.host.interaction.cancelConnection(engine);
      this.host.requestRender();
    }

    this.setCursor('default');
  }

  /** Double-click on a link body inserts a waypoint there (label editing is a host concern). */
  onDoubleClick(event: MouseEvent): void {
    const engine = this.engine();
    if (!engine || this.isReadonly()) return;

    const { x: worldX, y: worldY } = this.toWorld(event);
    const hit = this.host.interaction.getLinkHitAtPosition(worldX, worldY, engine);
    if (!hit) {
      const node = engine.getDiagram()?.getNodeAtPosition(worldX, worldY);
      if (node) {
        this.host.emit('node:doubleclick', { node, world: { x: worldX, y: worldY } });
      }
      return;
    }

    if (hit.part === 'body' && engine.getInteractionConfig().enableWaypointEditing) {
      event.preventDefault();
      if (this.host.interaction.addWaypoint(worldX, worldY, hit.link)) {
        this.host.requestRender();
        this.emitEdgesChange();
      }
    }
  }

  // ==========================================================================
  // Keyboard
  // ==========================================================================

  onKeyDown(event: KeyboardEvent): void {
    const engine = this.engine();
    const diagram = engine?.getDiagram();
    if (!engine || !diagram) return;

    // Never steal keys from a focused text field / contenteditable.
    if (isTextEntryTarget(event.target)) return;

    if (event.code === 'Space' && !this.spaceKeyPressed) {
      this.spaceKeyPressed = true;
      this.setCursor('grab');
      return;
    }

    if (event.key === 'Escape') {
      // wave13/stroke-edit: a REGISTERED TOOL that claimed the current gesture gets
      // cancelled too. Every whiteboard tool implements onCancel() (clear the overlay,
      // drop the in-flight state), but until now only pointercancel ever reached it —
      // Escape mid-drag left the tool live and still eating pointermoves. Released in
      // a `finally` for the same reason onMouseUp does: a throwing tool must not wedge
      // the canvas into a state where every future gesture is swallowed.
      if (this.activeTool) {
        try {
          this.activeTool.onCancel?.();
        } finally {
          this.activeTool = undefined;
          this.activeToolHit = undefined;
        }
      }
      const state = this.host.interaction.getState();
      if (state.isConnecting) this.host.interaction.cancelConnection(engine);
      if (state.isReconnectingLink) this.host.interaction.cancelLinkReconnection(engine);
      // wave12/node-resize: Escape abandons an in-flight resize, restoring the
      // node's pre-gesture size/position (SelectionToolsController.cancelGesture).
      if (this.selectionTools.activeGesture() === 'resize') {
        this.selectionTools.cancelGesture(engine);
      }
      // wave12 (gap 1): abandon an in-flight group drag WITHOUT restoring — matches
      // node-drag Escape (which also leaves the node where the drag left it).
      this.nodeDrag = null;
      this.groupDrag = null;
      this.clearProximityPreview(); // (gap 2) Escape never auto-connects
      diagram.clearSelection();
      this.host.requestRender();
      this.emitSelectionChange();
      return;
    }

    if ((event.key === 'Delete' || event.key === 'Backspace') && !this.isReadonly()) {
      const removedWaypoint = this.host.interaction.deleteHoveredWaypoint();
      const selectedLink = diagram
        .getLinks()
        .find((l: { state?: string }) => l.state === 'selected');
      const selectedNodes = diagram.getSelectedNodes();

      if (removedWaypoint || selectedLink || selectedNodes.length > 0) {
        event.preventDefault();
        // THROUGH THE COMMAND STACK, as ONE undoable step. The old handler
        // mutated the model directly (diagram.deleteSelected / removeLink), so
        // keyboard Delete could not be undone — and worse, the NEXT undo
        // replayed whatever stale command sat on top of the stack, aimed at an
        // entity that no longer existed (the sweep caught MoveNodeCommand.undo
        // throwing exactly that way).
        const nodeIds = selectedNodes.map((n: NodeModel) => n.id);
        const linkId = selectedLink?.id;
        void (async () => {
          const cm = engine.commandManager;
          const many = nodeIds.length + (linkId ? 1 : 0) > 1;
          if (many) cm.beginBatch();
          try {
            if (linkId) await engine.removeLink(linkId);
            for (const id of nodeIds) await engine.removeNode(id);
          } finally {
            if (many) await cm.endBatch('Delete Selection');
          }
          this.host.requestRender();
          if (nodeIds.length > 0) this.emitNodesChange();
          if (linkId) this.emitEdgesChange();
          this.emitSelectionChange();
        })();
      }
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      diagram.selectAll();
      this.host.requestRender();
      this.emitSelectionChange();
      return;
    }

    // Standard editor keys. The engine has ALWAYS had the command stack and the
    // clipboard — but no default binding reached them, so on a live page ⌘Z /
    // Ctrl+Z did nothing (live report: "undo isn't working", "copy paste not
    // working" — the demos proved the APIs while no keyboard path existed).
    // ctrlKey OR metaKey throughout: a Ctrl-only chord is dead on every Mac.
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (this.isReadonly()) return;
      void (event.shiftKey ? engine.redo() : engine.undo()).then(() => {
        this.host.requestRender();
        this.emitNodesChange();
        this.emitEdgesChange();
        this.emitSelectionChange();
      });
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      if (this.isReadonly()) return;
      void engine.redo().then(() => {
        this.host.requestRender();
        this.emitNodesChange();
        this.emitEdgesChange();
        this.emitSelectionChange();
      });
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
      // Copying mutates nothing — allowed even in readonly.
      void engine.copy();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
      if (this.isReadonly() || !engine.hasClipboardData()) return;
      event.preventDefault();
      void engine.paste().then(() => {
        this.host.requestRender();
        this.emitNodesChange();
        this.emitEdgesChange();
        this.emitSelectionChange();
      });
      return;
    }
  }

  onKeyUp(event: KeyboardEvent): void {
    if (event.code === 'Space') {
      this.spaceKeyPressed = false;
      this.isPanning = false;
      this.setCursor('default');
    }
  }

  // ==========================================================================
  // Node press / drag (threshold-gated)
  // ==========================================================================

  private pressNode(
    node: NodeModel,
    diagram: NonNullable<ReturnType<DiagramEngine['getDiagram']>>,
    event: MouseEvent,
    worldX: number,
    worldY: number
  ): void {
    // MUST be read before we mutate the selection — it is the sole input to
    // DELIBERATE-mode drag gating (select first, drag second).
    const wasSelected = node.isSelected();

    if (event.ctrlKey || event.metaKey) {
      diagram.toggleNodeSelection(node);
    } else if (!wasSelected) {
      diagram.selectNode(node);
    }
    // Clicking an already-selected node without a modifier keeps the whole
    // selection, so a multi-node drag works.

    this.host.requestRender();
    this.emitSelectionChange();

    if (this.isReadonly() || !node.isDraggable() || !node.isSelected()) return;

    // Declaring a drag handle MEANS "drag me by the handle": once a node has
    // one, its body press selects but no longer arms a drag — otherwise the
    // handle is decoration (React Flow's dragHandle has the same semantics).
    // A press that arrived here REDIRECTED FROM the handle still drags.
    if (!this.pressViaDragHandle && this.hasDragHandlerChild(node, diagram)) return;

    const mode = this.engine()?.getInteractionConfig().mode;
    if (mode === 'deliberate' && !wasSelected) return; // first click only selects

    const selected = diagram.getSelectedNodes().filter((n: NodeModel) => n.isDraggable());
    const nodeIds = selected.some((n: NodeModel) => n.id === node.id)
      ? selected.map((n: NodeModel) => n.id)
      : [node.id];

    this.nodeDrag = {
      nodeIds,
      startClientX: event.clientX,
      startClientY: event.clientY,
      lastWorldX: worldX,
      lastWorldY: worldY,
      committed: false,
      snapAnchor: { x: worldX, y: worldY },
    };
  }

  private moveNodeDrag(event: MouseEvent): void {
    const drag = this.nodeDrag;
    const diagram = this.engine()?.getDiagram();
    if (!drag || !diagram) return;

    if (!drag.committed) {
      const dx = event.clientX - drag.startClientX;
      const dy = event.clientY - drag.startClientY;
      if (Math.hypot(dx, dy) < this.options.dragThreshold) {
        return; // still a click, not a drag — do NOT touch any position
      }
      drag.committed = true;

      // wave12: snapshot each node's pre-drag position, NOW — before the first
      // setPosition below — so drag-end can commit an undoable FROM→TO move. Nothing
      // has moved yet on this frame (the delta is applied after this block), so these
      // are the true start positions.
      drag.startPositions = new Map();
      for (const id of drag.nodeIds) {
        const n = diagram.getNode(id);
        if (n) drag.startPositions.set(id, { x: n.position.x, y: n.position.y, z: n.position.z });
      }
    }

    const { x: worldX, y: worldY } = this.toWorld(event);
    const dx = worldX - drag.lastWorldX;
    const dy = worldY - drag.lastWorldY;
    drag.lastWorldX = worldX;
    drag.lastWorldY = worldY;
    if (!dx && !dy) return;

    // wave15/helper-lines: opt-in live snaplines. `computeSnap` existed as a
    // pure engine while NOTHING called it from a real drag (live report: "no
    // matter what i try doesn't look like something is happening"). Single
    // top-level node drags snap against sibling boxes and publish the guides
    // the renderer draws; everything else keeps the raw delta path.
    const snapped = this.applyHelperLineSnap(drag, diagram, worldX, worldY);
    if (!snapped) {
      for (const id of drag.nodeIds) {
        const node = diagram.getNode(id);
        if (!node || node.state.locked) continue;
        node.setPosition(node.position.x + dx, node.position.y + dy);
      }
    }

    // Node geometry moved ⇒ the port hit cache is stale.
    this.host.interaction.invalidatePortHitCache();

    // wave12 (gap 2): live proximity-connect preview — light up the port pair a
    // drop would auto-link, and remember it for commit on mouseup.
    this.updateProximityPreview(drag.nodeIds);

    this.host.requestRender();
  }

  // ==========================================================================
  // wave12/connect-ergonomics (gap 2) — Proximity connect on the live node drag.
  // ==========================================================================

  /** The lazily-built proximity-connect engine (only when the feature is on). */
  private snapController(): SnapController {
    if (!this.snap) this.snap = new SnapController();
    return this.snap;
  }

  /**
   * While dragging, find the best proximity candidate for any dragged node and
   * highlight its port pair (the SAME flags a connection drag paints). Stores it
   * so {@link commitProximityConnection} can create the link on drop. No-op —
   * and clears any prior highlight — when the feature is off or nothing is near.
   */
  private updateProximityPreview(draggedIds: string[]): void {
    const engine = this.engine();
    if (!engine) return;
    if (!engine.getInteractionConfig().enableProximityConnect) return;

    this.proximityCandidate = this.bestProximityCandidate(draggedIds);
    this.snapController().highlightProximityTarget(engine, this.proximityCandidate);
    // The renderer draws the proposal as a live dashed wire — port glyphs alone
    // read as "nothing is happening" (live report: "the wire isn't showing").
    engine.setProximityPreview(
      this.proximityCandidate
        ? {
            sourceNodeId: this.proximityCandidate.sourceNodeId,
            sourcePortId: this.proximityCandidate.sourcePort.id,
            targetNodeId: this.proximityCandidate.targetNodeId,
            targetPortId: this.proximityCandidate.targetPort.id,
          }
        : null
    );
  }

  /**
   * wave15/helper-lines: snap a SINGLE top-level dragged node to sibling
   * alignments/equal-spacing and publish the guide segments for the renderer.
   * Returns true when it owned the position write (the caller then skips the
   * raw delta loop). Tracks the VIRTUAL position from {@link NodeDragState.snapAnchor}
   * so corrections never accumulate into pointer drift.
   */
  private applyHelperLineSnap(
    drag: NodeDragState,
    diagram: NonNullable<ReturnType<DiagramEngine['getDiagram']>>,
    worldX: number,
    worldY: number
  ): boolean {
    const engine = this.engine();
    if (!engine || engine.getInteractionConfig().enableHelperLines !== true) return false;
    if (drag.nodeIds.length !== 1 || !drag.snapAnchor || !drag.startPositions) return false;

    const id = drag.nodeIds[0];
    const node = diagram.getNode(id);
    const start = drag.startPositions.get(id);
    if (!node || !start || node.state.locked || node.parentId) return false;

    const virtualX = start.x + (worldX - drag.snapAnchor.x);
    const virtualY = start.y + (worldY - drag.snapAnchor.y);

    const snap = this.snapController();
    snap.syncWithEngineConfig(engine);
    const result = snap.computeSnap(
      { x: virtualX, y: virtualY, width: node.size.width, height: node.size.height },
      snap.siblingBoxes(engine, [id])
    );
    node.setPosition(result.box.x, result.box.y);

    const segments = [
      ...result.guides.map((g) =>
        g.orientation === 'vertical'
          ? { x1: g.position, y1: g.from, x2: g.position, y2: g.to, kind: 'alignment' as const }
          : { x1: g.from, y1: g.position, x2: g.to, y2: g.position, kind: 'alignment' as const }
      ),
      ...result.spacing.flatMap((s) =>
        s.segments.map((seg) => ({ ...seg, kind: 'spacing' as const, label: s.label }))
      ),
    ];
    engine.setSnapGuides(segments.length > 0 ? segments : null);
    return true;
  }

  /** The closest proximity candidate across all dragged nodes (or null). */
  private bestProximityCandidate(draggedIds: string[]): ProximityCandidate | null {
    const engine = this.engine();
    if (!engine) return null;
    const config = engine.getInteractionConfig();
    const radius = config.proximityConnectRadius > 0 ? config.proximityConnectRadius : undefined;

    let best: ProximityCandidate | null = null;
    for (const id of draggedIds) {
      const candidate = this.snapController().findProximityConnection(engine, id, radius);
      if (candidate && (!best || candidate.distance < best.distance)) best = candidate;
    }
    return best;
  }

  /**
   * Commit the highlighted proximity candidate as ONE undoable AddLinkCommand,
   * then clear the highlight. Called on the node-drag mouseup. Returns true when
   * a link was actually created.
   */
  private commitProximityConnection(): boolean {
    const engine = this.engine();
    if (!engine) return false;

    const candidate = this.proximityCandidate;
    this.proximityCandidate = null;
    this.snapController().highlightProximityTarget(engine, null);
    engine.setProximityPreview(null);
    engine.setSnapGuides(null); // helper lines end with the drag

    if (!candidate || engine.getInteractionConfig().enableProximityConnect !== true) return false;
    if (this.isReadonly()) return false;

    const command = this.snapController().buildProximityLinkCommand(candidate);
    void engine.commandManager.execute(command);
    return true;
  }

  /** Drop any live proximity highlight/candidate without committing. */
  private clearProximityPreview(): void {
    const engine = this.engine();
    if (this.proximityCandidate && engine) {
      this.snapController().highlightProximityTarget(engine, null);
      engine.setProximityPreview(null);
    }
    engine?.setSnapGuides(null); // helper lines end with the drag
    this.proximityCandidate = null;
  }

  // ==========================================================================
  // wave12/connect-ergonomics (gap 1) — Group drag: move a subflow container and
  // ALL its contents by the same delta, as ONE undoable step.
  // ==========================================================================

  /**
   * The innermost group whose outer frame contains the world point. "Innermost"
   * (deepest nesting, then smallest area) so grabbing a nested sub-flow drags the
   * sub-flow, not the pipeline around it. Skips groups with no drawable frame.
   */
  private findGroupAtPoint(
    diagram: NonNullable<ReturnType<DiagramEngine['getDiagram']>>,
    worldX: number,
    worldY: number
  ): GroupModel | undefined {
    let best: GroupModel | undefined;
    let bestDepth = -Infinity;
    let bestArea = Infinity;

    for (const group of diagram.getGroups()) {
      if (group.isCollapsed) continue;
      const r = group.getOuterBounds();
      if (r.width <= 0 || r.height <= 0) continue;
      if (worldX < r.x || worldX > r.x + r.width || worldY < r.y || worldY > r.y + r.height) {
        continue;
      }
      const depth = diagram.getDepth(group.id);
      const area = r.width * r.height;
      if (depth > bestDepth || (depth === bestDepth && area < bestArea)) {
        best = group;
        bestDepth = depth;
        bestArea = area;
      }
    }
    return best;
  }

  /**
   * Every member NODE (recursively through nested groups) and every group FRAME
   * (this group + its descendant groups) that a drag of `group` must carry.
   * Cycle-guarded so a corrupt membership loop can never spin.
   */
  private collectGroupContents(
    diagram: NonNullable<ReturnType<DiagramEngine['getDiagram']>>,
    group: GroupModel
  ): { nodeIds: string[]; groupIds: string[] } {
    const nodeIds = new Set<string>();
    const groupIds = new Set<string>();
    const stack: GroupModel[] = [group];

    while (stack.length) {
      const g = stack.pop()!;
      if (groupIds.has(g.id)) continue;
      groupIds.add(g.id);
      for (const memberId of g.members) {
        const node = diagram.getNode(memberId);
        if (node) {
          nodeIds.add(memberId);
          continue;
        }
        const child = diagram.getGroup(memberId);
        if (child && !groupIds.has(child.id)) stack.push(child);
      }
    }
    return { nodeIds: [...nodeIds], groupIds: [...groupIds] };
  }

  /** Snapshot a group frame's restorable geometry (for undo). */
  private snapshotFrame(group: GroupModel): GroupFrameSnapshot {
    return {
      position: { x: group.position.x, y: group.position.y },
      size: group.size ? { ...group.size } : undefined,
      bounds: group.bounds ? { ...group.bounds } : undefined,
    };
  }

  /** Arm a group drag (threshold-gated, mirroring the node-drag arming). */
  private pressGroup(
    group: GroupModel,
    diagram: NonNullable<ReturnType<DiagramEngine['getDiagram']>>,
    event: MouseEvent,
    worldX: number,
    worldY: number
  ): void {
    const { nodeIds, groupIds } = this.collectGroupContents(diagram, group);

    const nodeFrom = new Map<string, { x: number; y: number; z?: number }>();
    for (const id of nodeIds) {
      const node = diagram.getNode(id);
      if (node && !node.state.locked) nodeFrom.set(id, { ...node.position });
    }
    const frameFrom = new Map<string, GroupFrameSnapshot>();
    for (const id of groupIds) {
      const g = diagram.getGroup(id);
      if (g) frameFrom.set(id, this.snapshotFrame(g));
    }

    this.groupDrag = {
      groupId: group.id,
      nodeIds: [...nodeFrom.keys()],
      groupIds: [...frameFrom.keys()],
      startClientX: event.clientX,
      startClientY: event.clientY,
      lastWorldX: worldX,
      lastWorldY: worldY,
      committed: false,
      nodeFrom,
      frameFrom,
    };
    this.setCursor('move');
  }

  /** Translate the whole subflow live during a group drag (past the threshold). */
  private moveGroupDrag(event: MouseEvent): void {
    const drag = this.groupDrag;
    const diagram = this.engine()?.getDiagram();
    if (!drag || !diagram) return;

    if (!drag.committed) {
      const dx = event.clientX - drag.startClientX;
      const dy = event.clientY - drag.startClientY;
      if (Math.hypot(dx, dy) < this.options.dragThreshold) return;
      drag.committed = true;
    }

    const { x: worldX, y: worldY } = this.toWorld(event);
    const dx = worldX - drag.lastWorldX;
    const dy = worldY - drag.lastWorldY;
    drag.lastWorldX = worldX;
    drag.lastWorldY = worldY;
    if (!dx && !dy) return;

    // Members: N absolute position sets (per-property LWW converges under collab).
    for (const id of drag.nodeIds) {
      const node = diagram.getNode(id);
      if (!node || node.state.locked) continue;
      node.setPosition(node.position.x + dx, node.position.y + dy);
    }
    // Frames: translate this group + nested group frames alongside their contents.
    for (const id of drag.groupIds) {
      const g = diagram.getGroup(id);
      if (!g) continue;
      const r = g.getOuterBounds();
      g.setFrame({ x: r.x + dx, y: r.y + dy, width: r.width, height: r.height });
    }

    this.host.interaction.invalidatePortHitCache();
    this.host.requestRender();
  }

  /**
   * wave12: commit a finished node drag as ONE undoable step.
   *
   * The live drag mutated node positions directly for feedback and recorded NOTHING on
   * the command history — so Ctrl+Z could not undo a drag (keyboard-nudge and resize both
   * commit MoveNodeCommand; only the pointer drag skipped it). This is the same FROM→TO
   * snapshot endGroupDrag uses: the state is already at `to`, so each MoveNodeCommand's
   * execute() is a visual no-op that records one history entry, and undo restores `from`.
   * A multi-node drag collapses into one MacroCommand — one gesture, one undo step.
   */
  private commitNodeMove(engine: DiagramEngine, drag: NodeDragState): void {
    if (!drag.committed || !drag.startPositions) return;
    const diagram = engine.getDiagram();
    if (!diagram) return;

    const steps: Command[] = [];
    for (const id of drag.nodeIds) {
      const node = diagram.getNode(id);
      const from = drag.startPositions.get(id);
      if (!node || !from) continue;
      if (node.position.x === from.x && node.position.y === from.y) continue; // never moved
      steps.push(
        new MoveNodeCommand(
          id,
          { x: node.position.x, y: node.position.y, z: node.position.z },
          { x: from.x, y: from.y, z: from.z },
          { mergeable: false } // a completed gesture is its own step; do not merge into it
        )
      );
    }
    if (steps.length === 0) return;

    let command: Command;
    if (steps.length === 1) {
      command = steps[0];
    } else {
      const macro = new MacroCommand('Move nodes');
      for (const s of steps) macro.addStep(s);
      command = macro;
    }
    void engine.commandManager.execute(command);
  }

  /**
   * End a group drag: commit the whole gesture as ONE undoable MoveGroupCommand
   * (drag-start snapshot → current), then emit change events. The live drag has
   * already applied the final positions, so the command's execute() is a visual
   * no-op that merely records the single history entry; undo restores the start.
   */
  private endGroupDrag(engine: DiagramEngine): void {
    const drag = this.groupDrag;
    this.groupDrag = null;
    if (!drag) return;

    if (!drag.committed) return; // a press with no drag — nothing moved

    const diagram = engine.getDiagram();
    if (!diagram) return;

    const nodeMoves: GroupNodeMove[] = [];
    for (const [id, from] of drag.nodeFrom) {
      const node = diagram.getNode(id);
      if (!node) continue;
      nodeMoves.push({ nodeId: id, from, to: { ...node.position } });
    }
    const frameMoves: GroupFrameMove[] = [];
    for (const [id, from] of drag.frameFrom) {
      const g = diagram.getGroup(id);
      if (!g) continue;
      frameMoves.push({ groupId: id, from, to: this.snapshotFrame(g) });
    }

    const command = new MoveGroupCommand(nodeMoves, frameMoves);
    if (!command.isNoop()) {
      // Record on the undo stack. State is already at `to`, so this is idempotent.
      void engine.commandManager.execute(command);
      this.emitNodesChange();
    }
    this.host.requestRender();
  }

  // ==========================================================================
  // helpers
  // ==========================================================================

  private engine(): DiagramEngine | null {
    return this.host.getEngine();
  }

  /**
   * wave12 (gap 3): is the easy-connect gate satisfied for this press? With
   * `easyConnectModifier: 'none'` (the default when the feature is on) any plain
   * body press connects — the whole node is a handle and move is done via a drag
   * handle / selection. A specific modifier lets a host KEEP body-drag-to-move
   * and reserve connect for, say, a shift-drag.
   */
  private easyConnectModifierHeld(
    event: MouseEvent,
    config: ReturnType<DiagramEngine['getInteractionConfig']>
  ): boolean {
    switch (config.easyConnectModifier) {
      case 'shift': return event.shiftKey;
      case 'alt': return event.altKey;
      case 'ctrl': return event.ctrlKey;
      case 'meta': return event.metaKey;
      case 'none':
      default: return true;
    }
  }

  private toWorld(event: MouseEvent): { x: number; y: number } {
    return this.host.viewport.clientToWorld(event.clientX, event.clientY, this.host.getRect());
  }

  /**
   * The node under the pointer. SVG hit-testing first; then walk up from
   * `event.target` looking for a `data-node-id`, which is how nodes rendered
   * into the HTML layer (foreignObject / custom components) are found — they are
   * absolutely positioned DOM, invisible to the geometric hit-test.
   */
  private resolveNode(
    diagram: NonNullable<ReturnType<DiagramEngine['getDiagram']>>,
    worldX: number,
    worldY: number,
    event: MouseEvent
  ): NodeModel | undefined {
    this.pressViaDragHandle = false;
    const hit = diagram.getNodeAtPosition(worldX, worldY);
    if (hit) {
      this.pressViaDragHandle = hit.behavior?.dragHandler?.isDragHandler === true;
      return this.dragTargetFor(hit, diagram);
    }

    let element = event.target as HTMLElement | null;
    while (element && element !== this.container) {
      const nodeId = element.getAttribute?.('data-node-id');
      if (nodeId) {
        const node = diagram.getNode(nodeId);
        this.pressViaDragHandle = node?.behavior?.dragHandler?.isDragHandler === true;
        return node ? this.dragTargetFor(node, diagram) : undefined;
      }
      element = element.parentElement;
    }
    return undefined;
  }

  /** Did the press that resolveNode just handled land ON a drag handle? */
  private pressViaDragHandle = false;

  /** Does this node delegate its dragging to a designated handle child? */
  private hasDragHandlerChild(
    node: NodeModel,
    diagram: NonNullable<ReturnType<DiagramEngine['getDiagram']>>
  ): boolean {
    for (const childId of node.children ?? []) {
      if (diagram.getNode(childId)?.behavior?.dragHandler?.isDragHandler === true) return true;
    }
    return false;
  }

  /**
   * Redirect the press to the node that should actually MOVE: an explicit drag
   * handle drags its parent, and a child that is neither draggable nor
   * selectable (e.g. a table row inside a node) drags its nearest draggable
   * ancestor.
   */
  private dragTargetFor(
    node: NodeModel,
    diagram: NonNullable<ReturnType<DiagramEngine['getDiagram']>>
  ): NodeModel {
    if (node.behavior?.dragHandler?.isDragHandler === true && node.parentId) {
      return diagram.getNode(node.parentId) ?? node;
    }

    const selectable = node.behavior?.selectable !== false;
    if (node.isDraggable() || selectable) return node;

    let current: NodeModel | undefined = node;
    while (current?.parentId) {
      const parent: NodeModel | undefined = diagram.getNode(current.parentId);
      if (!parent) break;
      if (parent.isDraggable()) return parent;
      current = parent;
    }
    return node;
  }

  private setCursor(cursor: string): void {
    if (this.container?.style) this.container.style.cursor = cursor;
  }

  private emitSelectionChange(): void {
    const diagram = this.engine()?.getDiagram();
    if (!diagram) return;
    this.host.emit('selection:change', {
      nodes: diagram.getSelectedNodes(),
      edges: diagram.getLinks().filter((l: LinkModel) => l.state === 'selected'),
    });
  }

  private emitNodesChange(): void {
    const diagram = this.engine()?.getDiagram();
    if (diagram) this.host.emit('nodes:change', { nodes: diagram.getNodes() });
  }

  private emitEdgesChange(): void {
    const diagram = this.engine()?.getDiagram();
    if (diagram) this.host.emit('edges:change', { edges: diagram.getLinks() });
  }
}

/** Is the event target a place where the user is typing? */
function isTextEntryTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== 'string') return false;
  const tag = el.tagName.toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true;
}
