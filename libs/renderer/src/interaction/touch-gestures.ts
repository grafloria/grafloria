import type { DiagramEngine, LinkModel, NodeModel } from '@grafloria/engine';
import type { InteractionController } from './interaction-controller';
import type { CanvasRect, ViewportController } from '../viewport/viewport-controller';
// wave10/whiteboard: touch must give a registered tool first refusal too, or drawing with a
// finger is impossible — the whiteboard tools would only work with a mouse. Same registry,
// same single-active-tool rule as the DomEventBinder's mouse ladder.
import { resolveTool } from '../ext/tools';
import type { CanvasTool, ToolHitContext, ToolPointerEvent } from '../ext/tools';
// wave12/node-resize: the same floating-tool controller the mouse ladder uses, so a
// resize handle can be grabbed with a finger too (touch-run's resize gate). Shared,
// not a second instance — one gesture, one owner.
import type { SelectionToolsController, ToolHandle } from './selection-tools';

/**
 * Touch & mobile gestures — Wave 9, Card 2.
 *
 * ## What was actually there before this file
 *
 * The audit contradicted the card. The card said "Grafloria handles touch on resize
 * handles only". In fact:
 *
 *  - `DomEventBinder` — the ONLY interaction pipeline the framework-free renderer
 *    actually attaches — bound `mousedown`/`mousemove`/`mouseup`. Raw MouseEvent.
 *    **Not one pointer listener, not one touch listener.**
 *  - The "unified Pointer Events pipeline" Wave 1 is credited with
 *    (`renderer-angular/interaction/pointer-input.ts`) is real, well-written — and
 *    **DEAD**. `PointerInputController` is never constructed anywhere; it survives
 *    only as a name inside a doc comment in `tool-manager.ts`.
 *  - `renderer-angular/.../touch-resize-handle.component.ts` — the touch resize
 *    handle the card refers to — is **also dead**. Nothing references it.
 *  - `engine/lib/input/{touch-handler,mobile-interaction.service,mobile-manager.service}.ts`
 *    is a whole mobile stack (a `TouchHandler` with pinch/rotate/swipe, an
 *    `IMobileEngine`) that **nothing outside its own directory constructs**.
 *  - `touch-action` appears **nowhere in the repository**. Even had a handler
 *    existed, Chrome would have eaten every pan and pinch before it fired.
 *
 * So touch on the real canvas was not "partial". It was zero, behind four separate
 * piles of machinery that each looked like it did the job. This controller is the
 * one that is wired (see `DomEventBinder.attach`).
 *
 * ## The gesture set
 *
 * | fingers | gesture                       | result                              |
 * |---------|-------------------------------|-------------------------------------|
 * | 1       | drag on empty canvas          | pan                                 |
 * | 1       | drag on a node                | move the node (respects read-only)  |
 * | 1       | drag from a port             | draw a connection                   |
 * | 1       | tap                           | select node / link / clear          |
 * | 1       | long-press (500 ms)          | context menu (`contextmenu` event)  |
 * | 2       | pinch                         | zoom, anchored between the fingers  |
 * | 2       | drag                          | pan                                 |
 *
 * **Rotate is deliberately NOT implemented.** The card said to check first, so I
 * did: `ViewportController` has no rotation — no angle in its state, no rotate in
 * `getViewBox()`/`clientToWorld()`. A two-finger rotate would have had nothing to
 * write to. Building the gesture would have meant building canvas rotation, which
 * is a different (large) card. `NodeModel.setRotation` exists, but rotating the
 * *selection* by a canvas pinch is not what the gesture means.
 *
 * ## Why the browser would otherwise win
 *
 * Two things are load-bearing and both are easy to forget:
 *
 *  1. **`touch-action: none`** on the container (set by the binder). Without it the
 *     browser claims the gesture for native scroll/zoom and simply stops sending
 *     `pointermove` — your handler is correct and never runs.
 *  2. **`preventDefault()` on touch `pointerdown`** — suppresses the compatibility
 *     mouse events (`mousedown`/`mouseup`/`click`) a browser synthesizes after a
 *     tap. Without it every tap fires the touch path AND the mouse path, and a
 *     single tap selects, then immediately deselects.
 */

/** Everything the gesture controller needs from its host (keeps it DI-free). */
export interface TouchGestureHost {
  getEngine(): DiagramEngine | null;
  readonly viewport: ViewportController;
  readonly interaction: InteractionController;
  getRect(): CanvasRect;
  requestRender(): void;
  emit(event: string, payload: unknown): void;
  /** Live read — read-only can be toggled while the canvas is mounted. */
  isReadonly(): boolean;
}

export interface TouchGestureOptions {
  enablePan?: boolean;
  enableZoom?: boolean;
  /** ms a finger must rest before it becomes a context-menu gesture. Default 500. */
  longPressMs?: number;
  /** CSS px of travel that cancels a long-press / promotes a tap to a drag. Default 10. */
  moveTolerancePx?: number;
  /** Max ms for a press+release to count as a tap. Default 300. */
  tapMaxMs?: number;
}

/**
 * Extra hit radius, in CSS px, granted to a TOUCH pointer.
 *
 * A port renders at ~5 px radius. A fingertip is ~9 mm. WCAG 2.5.8 wants a 24×24
 * target and Apple/Material ask for 44/48. 16 px of slop takes an effective port
 * target from ~14 px to ~46 px across, which clears 44. Applied in WORLD units
 * (slop ÷ zoom) because every hit test in this engine is world-space — applying it
 * in screen px would make ports unhittable when zoomed out, which is exactly when
 * they are smallest and you need the help most.
 */
export const TOUCH_HIT_SLOP_PX = 16;

interface TrackedPointer {
  id: number;
  clientX: number;
  clientY: number;
  startClientX: number;
  startClientY: number;
  startTime: number;
}

/** What a single finger is currently doing. */
type SingleAction =
  | { kind: 'none' }
  | { kind: 'pan'; lastX: number; lastY: number }
  | { kind: 'node'; nodeIds: string[]; lastWorldX: number; lastWorldY: number; committed: boolean }
  | { kind: 'connect' }
  // wave10/whiteboard: a registered tool (draw / rectangle / eraser) owns this finger.
  | { kind: 'tool'; tool: CanvasTool; hit: ToolHitContext }
  // wave12/node-resize: a finger is dragging a resize handle.
  | { kind: 'resize' }
  | { kind: 'pinch' };

export class TouchGestureController {
  private readonly options: Required<TouchGestureOptions>;

  /** Live touch points, keyed by pointerId. A Map because fingers lift out of order. */
  private readonly pointers = new Map<number, TrackedPointer>();

  private action: SingleAction = { kind: 'none' };
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private longPressFired = false;

  // Pinch baseline, captured when the SECOND finger lands.
  private pinchStartDistance = 0;
  private pinchStartZoom = 1;
  private pinchLastMidX = 0;
  private pinchLastMidY = 0;

  constructor(
    private readonly host: TouchGestureHost,
    options: TouchGestureOptions = {},
    /**
     * wave12/node-resize. The SHARED tool controller (the binder owns it and hands
     * the same instance to the mouse ladder). Optional so a host that builds a bare
     * TouchGestureController still works — without it, touch simply offers no resize.
     */
    private readonly selectionTools?: SelectionToolsController
  ) {
    this.options = {
      enablePan: options.enablePan ?? true,
      enableZoom: options.enableZoom ?? true,
      longPressMs: options.longPressMs ?? 500,
      moveTolerancePx: options.moveTolerancePx ?? 10,
      tapMaxMs: options.tapMaxMs ?? 300,
    };
  }

  /** How many fingers are down. Exposed for tests and for the binder's cursor logic. */
  get activePointerCount(): number {
    return this.pointers.size;
  }

  /** True while a two-finger pinch owns the gesture. */
  get isPinching(): boolean {
    return this.action.kind === 'pinch';
  }

  // ==========================================================================
  // down
  // ==========================================================================

  onPointerDown(event: PointerEvent): void {
    const engine = this.host.getEngine();
    if (!engine?.getDiagram()) return;

    this.pointers.set(event.pointerId, {
      id: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startTime: Date.now(),
    });

    // SECOND finger — abandon whatever one finger was doing and pinch.
    if (this.pointers.size === 2) {
      this.cancelLongPress();
      this.abortSingleAction(engine);
      this.beginPinch();
      return;
    }

    // A third finger is noise during a pinch; ignore it rather than re-arming.
    if (this.pointers.size > 2) return;

    this.applyTouchHitSlop();

    const { x: worldX, y: worldY } = this.toWorld(event);
    const diagram = engine.getDiagram();
    if (!diagram) return;

    // Refresh hover so port/link hit state reflects where the finger actually is.
    // A touch has no hover — nothing moved over the port before the press — so
    // without this the port under the finger is simply not known.
    this.host.interaction.handleMouseMove(worldX, worldY, engine);
    const state = this.host.interaction.getState();

    this.armLongPress(event, worldX, worldY);

    // wave10/whiteboard: a REGISTERED TOOL gets first refusal, exactly as on the mouse ladder
    // — otherwise the whiteboard tools would only work with a mouse and touch-run's "drawing
    // MUST work with a finger" gate could never pass. A claiming tool owns the whole gesture
    // (move/up/cancel); the long-press-to-menu gesture is disarmed so a slow draw does not pop
    // a context menu mid-line.
    if (!this.host.isReadonly()) {
      const toolEvent = this.toToolEvent('down', event, worldX, worldY);
      const toolHit = this.toToolHit(worldX, worldY, engine);
      const tool = resolveTool(toolEvent, toolHit);
      if (tool) {
        this.cancelLongPress();
        this.action = { kind: 'tool', tool, hit: toolHit };
        tool.onPointerDown?.(toolEvent, toolHit);
        this.host.requestRender();
        return;
      }
    }

    // wave12/node-resize: a resize handle on the selected node — grabbed before the
    // port/node branches for the same reason as the mouse ladder (a corner handle
    // sits on the node's corner). A finger gets extra hit slop so a ~6px handle is
    // actually reachable.
    //
    // Same port-over-side-handle rule as the mouse ladder: the n/e/s/w handles
    // sit exactly on the default side ports, and a finger on a visible port
    // glyph must draw a wire, not resize. Corners stay resize.
    if (!this.host.isReadonly()) {
      const handle = this.resizeHandleAt(worldX, worldY);
      if (handle) {
        const sideHandle =
          handle.kind === 'resize' && ['n', 'e', 's', 'w'].includes(String(handle.handleId));
        const portClaims =
          sideHandle && state.hoveredPort && state.hoveredPort.nodeId === handle.nodeId;
        if (!portClaims) {
          this.cancelLongPress();
          this.selectionTools!.beginResize(handle, engine, worldX, worldY);
          this.action = { kind: 'resize' };
          this.host.requestRender();
          return;
        }
      }
    }

    // Port → connection drag. Read-only refuses.
    if (!this.host.isReadonly() && state.hoveredPort) {
      this.host.interaction.startConnection(state.hoveredPort, worldX, worldY, engine);
      this.action = { kind: 'connect' };
      this.host.requestRender();
      return;
    }

    // Node → drag it (if editable), else fall through to pan. Drag-handle
    // semantics mirror the mouse ladder: a press ON the handle drags the
    // PARENT; a body press on a node that HAS a handle child does not drag.
    const rawHit = diagram.getNodeAtPosition(worldX, worldY);
    const viaHandle = rawHit?.behavior?.dragHandler?.isDragHandler === true;
    const node =
      viaHandle && rawHit?.parentId ? (diagram.getNode(rawHit.parentId) ?? rawHit) : rawHit;
    const handleOnly =
      !viaHandle &&
      node &&
      [...(node.children ?? [])].some(
        (id) => diagram.getNode(id)?.behavior?.dragHandler?.isDragHandler === true
      );
    if (node && !this.host.isReadonly() && node.isDraggable() && !handleOnly) {
      const selected = diagram
        .getSelectedNodes()
        .filter((n: NodeModel) => n.isDraggable());
      const nodeIds = selected.some((n: NodeModel) => n.id === node.id)
        ? selected.map((n: NodeModel) => n.id)
        : [node.id];

      this.action = {
        kind: 'node',
        nodeIds,
        lastWorldX: worldX,
        lastWorldY: worldY,
        committed: false,
      };
      return;
    }

    // Empty canvas (or a node we may not move) → pan.
    if (this.options.enablePan) {
      this.action = { kind: 'pan', lastX: event.clientX, lastY: event.clientY };
    }
  }

  // ==========================================================================
  // move
  // ==========================================================================

  onPointerMove(event: PointerEvent): void {
    const tracked = this.pointers.get(event.pointerId);
    if (!tracked) return;

    tracked.clientX = event.clientX;
    tracked.clientY = event.clientY;

    const engine = this.host.getEngine();
    if (!engine) return;

    if (this.travelled(tracked) > this.options.moveTolerancePx) {
      this.cancelLongPress();
    }

    if (this.action.kind === 'pinch') {
      this.updatePinch();
      return;
    }

    switch (this.action.kind) {
      case 'tool': {
        const { x, y } = this.toWorld(event);
        this.action.tool.onPointerMove?.(this.toToolEvent('move', event, x, y), this.action.hit);
        this.host.requestRender();
        return;
      }

      case 'pan': {
        // Drag RIGHT ⇒ camera LEFT, so content follows the finger.
        this.host.viewport.panByScreenDelta(
          this.action.lastX - event.clientX,
          this.action.lastY - event.clientY
        );
        this.action.lastX = event.clientX;
        this.action.lastY = event.clientY;
        this.host.requestRender();
        return;
      }

      case 'node': {
        if (this.host.isReadonly()) return;
        if (!this.action.committed) {
          if (this.travelled(tracked) < this.options.moveTolerancePx) return;
          this.action.committed = true;
        }
        const { x, y } = this.toWorld(event);
        const dx = x - this.action.lastWorldX;
        const dy = y - this.action.lastWorldY;
        this.action.lastWorldX = x;
        this.action.lastWorldY = y;
        if (!dx && !dy) return;

        const diagram = engine.getDiagram();
        for (const id of this.action.nodeIds) {
          const node = diagram?.getNode(id);
          if (!node || node.state.locked) continue;
          node.setPosition(node.position.x + dx, node.position.y + dy);
        }
        this.host.interaction.invalidatePortHitCache();
        this.host.requestRender();
        return;
      }

      case 'connect': {
        const { x, y } = this.toWorld(event);
        this.host.interaction.handleMouseMove(x, y, engine);
        this.host.interaction.handleConnectionDrag(x, y, engine);
        this.host.requestRender();
        return;
      }

      case 'resize': {
        if (this.host.isReadonly()) return;
        const { x, y } = this.toWorld(event);
        // Clamp (min/max/aspect) is applied inside updateResize, every move.
        if (
          this.selectionTools!.updateResize(engine, x, y, {
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

      default:
        return;
    }
  }

  // ==========================================================================
  // up / cancel
  // ==========================================================================

  onPointerUp(event: PointerEvent): void {
    const tracked = this.pointers.get(event.pointerId);
    this.pointers.delete(event.pointerId);

    const engine = this.host.getEngine();
    if (!engine) {
      this.reset();
      return;
    }

    // Lifting one finger out of a pinch must NOT silently become a one-finger
    // pan/drag — the remaining finger has been stationary and would jump the
    // canvas. Stay inert until every finger is up.
    if (this.action.kind === 'pinch') {
      if (this.pointers.size === 0) this.action = { kind: 'none' };
      return;
    }

    this.cancelLongPress();

    const wasTap =
      !!tracked &&
      !this.longPressFired &&
      Date.now() - tracked.startTime <= this.options.tapMaxMs &&
      this.travelled(tracked) <= this.options.moveTolerancePx;

    switch (this.action.kind) {
      case 'tool': {
        const { x, y } = this.clientToWorld(event.clientX, event.clientY);
        this.action.tool.onPointerUp?.(this.toToolEvent('up', event, x, y), this.action.hit);
        this.host.requestRender();
        break;
      }

      case 'connect':
        this.host.interaction.completeConnection(engine);
        this.host.requestRender();
        break;

      case 'resize': {
        // Commit as ONE undoable command — the model already sits at its final size.
        const command = this.selectionTools!.endGesture(engine);
        if (command) {
          void engine.commandManager.execute(command);
          this.host.emit('nodes:change', { nodes: engine.getDiagram()?.getNodes() ?? [] });
        }
        this.host.requestRender();
        break;
      }

      case 'node':
        if (this.action.committed) {
          this.host.emit('nodes:change', { nodes: engine.getDiagram()?.getNodes() ?? [] });
        } else if (wasTap && tracked) {
          this.tap(tracked, engine);
        }
        break;

      case 'pan':
        if (wasTap && tracked) this.tap(tracked, engine);
        break;

      default:
        break;
    }

    if (this.pointers.size === 0) {
      this.action = { kind: 'none' };
      this.longPressFired = false;
      this.clearTouchHitSlop();
    }
  }

  /** The OS took the gesture (call, notification, browser back-swipe). Abort cleanly. */
  onPointerCancel(event: PointerEvent): void {
    this.pointers.delete(event.pointerId);
    const engine = this.host.getEngine();
    this.cancelLongPress();
    if (engine) this.abortSingleAction(engine);
    if (this.pointers.size === 0) this.reset();
  }

  /** Drop every listener-visible bit of state (binder detach). */
  reset(): void {
    this.cancelLongPress();
    this.pointers.clear();
    this.action = { kind: 'none' };
    this.longPressFired = false;
    this.clearTouchHitSlop();
  }

  // ==========================================================================
  // tap / long-press
  // ==========================================================================

  private tap(tracked: TrackedPointer, engine: DiagramEngine): void {
    const diagram = engine.getDiagram();
    if (!diagram) return;

    const { x: worldX, y: worldY } = this.clientToWorld(tracked.clientX, tracked.clientY);

    const link =
      this.host.interaction.getState().hoveredLink ??
      this.host.interaction.getLinkAtPosition(worldX, worldY, engine);
    if (link) {
      this.host.interaction.selectLink(link, engine, false);
      this.host.requestRender();
      this.emitSelection(diagram);
      this.host.emit('edge:click', { edge: link, world: { x: worldX, y: worldY } });
      return;
    }

    const node = diagram.getNodeAtPosition(worldX, worldY);
    if (node) {
      diagram.selectNode(node);
      this.host.requestRender();
      this.emitSelection(diagram);
      this.host.emit('node:click', { node, world: { x: worldX, y: worldY } });
      return;
    }

    diagram.clearSelection();
    diagram.getLinks().forEach((l: LinkModel) => {
      if (l.state === 'selected') l.setState('default');
    });
    this.host.requestRender();
    this.emitSelection(diagram);
  }

  private armLongPress(event: PointerEvent, worldX: number, worldY: number): void {
    this.cancelLongPress();
    this.longPressFired = false;

    const clientX = event.clientX;
    const clientY = event.clientY;

    this.longPressTimer = setTimeout(() => {
      this.longPressTimer = null;
      this.longPressFired = true;

      const engine = this.host.getEngine();
      const diagram = engine?.getDiagram();
      if (!diagram) return;

      // The long-press target is resolved at FIRE time, not at press time: the
      // finger may have drifted a few px within tolerance.
      const node = diagram.getNodeAtPosition(worldX, worldY) ?? undefined;
      const link = node
        ? undefined
        : (this.host.interaction.getLinkAtPosition(worldX, worldY, engine!) ?? undefined);

      // A long-press that opens a menu must not ALSO drag the thing under it.
      this.action = { kind: 'none' };

      this.host.emit('contextmenu', {
        node,
        edge: link,
        world: { x: worldX, y: worldY },
        client: { x: clientX, y: clientY },
        source: 'touch',
        readonly: this.host.isReadonly(),
      });
      this.host.requestRender();
    }, this.options.longPressMs);
  }

  private cancelLongPress(): void {
    if (this.longPressTimer !== null) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }

  // ==========================================================================
  // pinch
  // ==========================================================================

  private beginPinch(): void {
    const [a, b] = [...this.pointers.values()];
    if (!a || !b) return;

    this.action = { kind: 'pinch' };
    this.pinchStartDistance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1;
    this.pinchStartZoom = this.host.viewport.getZoom();
    this.pinchLastMidX = (a.clientX + b.clientX) / 2;
    this.pinchLastMidY = (a.clientY + b.clientY) / 2;
  }

  private updatePinch(): void {
    const [a, b] = [...this.pointers.values()];
    if (!a || !b) return;

    const midX = (a.clientX + b.clientX) / 2;
    const midY = (a.clientY + b.clientY) / 2;

    // Two-finger PAN: the midpoint moving is a pan, independent of the spread.
    // Applied first so the zoom anchor below is computed against the panned camera.
    if (this.options.enablePan) {
      const dx = this.pinchLastMidX - midX;
      const dy = this.pinchLastMidY - midY;
      if (dx || dy) this.host.viewport.panByScreenDelta(dx, dy);
    }
    this.pinchLastMidX = midX;
    this.pinchLastMidY = midY;

    if (this.options.enableZoom) {
      const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      // Zoom is RELATIVE TO THE GESTURE START, not incremental per move event.
      // Incremental (zoom *= d/lastD) accumulates float error and drifts on a slow
      // pinch; ratio-to-start always lands on the same zoom for the same finger
      // spread, which is what makes a pinch feel like it is holding the canvas.
      const target = this.pinchStartZoom * (distance / this.pinchStartDistance);
      this.host.viewport.zoomAtPoint(target, midX, midY, this.host.getRect());
    }

    this.host.requestRender();
  }

  // ==========================================================================
  // helpers
  // ==========================================================================

  /**
   * Grow every hit target for the duration of a touch gesture. World units, because
   * the hit tests are world-space and a screen-px slop would vanish when zoomed out.
   */
  private applyTouchHitSlop(): void {
    const zoom = this.host.viewport.getZoom() || 1;
    this.host.interaction.setHitSlop(TOUCH_HIT_SLOP_PX / zoom);
  }

  private clearTouchHitSlop(): void {
    this.host.interaction.setHitSlop(0);
  }

  /** Abort an in-flight one-finger action without committing it. */
  private abortSingleAction(engine: DiagramEngine): void {
    if (this.action.kind === 'connect') {
      this.host.interaction.cancelConnection(engine);
      this.host.requestRender();
    } else if (this.action.kind === 'tool') {
      // A second finger (pinch) or an OS interruption mid-draw: discard the in-progress
      // stroke rather than committing a half-line.
      this.action.tool.onCancel?.();
      this.host.requestRender();
    } else if (this.action.kind === 'resize') {
      // A second finger or an OS interruption mid-resize: abandon, restoring size.
      this.selectionTools?.cancelGesture(engine);
      this.host.requestRender();
    }
    this.action = { kind: 'none' };
  }

  /**
   * wave12/node-resize: the resize handle under a world point, with touch slop.
   *
   * Handles are a constant ~6 screen px; a fingertip is far bigger, so the layer's
   * own hit radius is grown by {@link TOUCH_HIT_SLOP_PX} (in world units) before the
   * distance test. Returns only `kind: 'resize'` handles.
   */
  private resizeHandleAt(worldX: number, worldY: number): ToolHandle | null {
    const engine = this.host.getEngine();
    if (!engine || !this.selectionTools) return null;
    const zoom = this.host.viewport.getZoom();
    const layer = this.selectionTools.computeLayer(engine, zoom);
    const slop = zoom > 0 ? TOUCH_HIT_SLOP_PX / zoom : TOUCH_HIT_SLOP_PX;

    let best: ToolHandle | null = null;
    for (const handle of layer.handles) {
      if (handle.kind !== 'resize') continue;
      const dx = worldX - handle.world.x;
      const dy = worldY - handle.world.y;
      const r = handle.hitRadius + slop;
      if (dx * dx + dy * dy <= r * r) best = handle;
    }
    return best;
  }

  /** Adapt a touch PointerEvent to the framework-free tool contract. */
  private toToolEvent(
    type: 'down' | 'move' | 'up' | 'cancel',
    event: PointerEvent,
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

  /** What the finger landed on, resolved once on pointerdown. */
  private toToolHit(worldX: number, worldY: number, engine: DiagramEngine): ToolHitContext {
    const diagram = engine.getDiagram();
    const state = this.host.interaction.getState();
    const node = diagram?.getNodeAtPosition(worldX, worldY) ?? undefined;
    return {
      node: node ?? undefined,
      link: state.hoveredLink ?? undefined,
      port: state.hoveredPort ?? undefined,
      empty: !node && !state.hoveredLink && !state.hoveredPort,
      nodeWasSelected: node ? node.state?.selected === true : false,
    };
  }

  private travelled(p: TrackedPointer): number {
    return Math.hypot(p.clientX - p.startClientX, p.clientY - p.startClientY);
  }

  private toWorld(event: PointerEvent): { x: number; y: number } {
    return this.clientToWorld(event.clientX, event.clientY);
  }

  private clientToWorld(clientX: number, clientY: number): { x: number; y: number } {
    return this.host.viewport.clientToWorld(clientX, clientY, this.host.getRect());
  }

  private emitSelection(diagram: NonNullable<ReturnType<DiagramEngine['getDiagram']>>): void {
    this.host.emit('selection:change', {
      nodes: diagram.getSelectedNodes(),
      edges: diagram.getLinks().filter((l: LinkModel) => l.state === 'selected'),
    });
  }
}
