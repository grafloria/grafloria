import type { DiagramEngine, LinkModel, NodeModel } from '@grafloria/engine';
import type { InteractionController } from '../interaction/interaction-controller';
import type { CanvasRect, ViewportController } from '../viewport/viewport-controller';
import { isBrowser } from '../platform';
// Wave 6 — Card 5: the pluggable tool registry. The binder CONSUMES it; a
// registered tool gets first refusal on every gesture (see onMouseDown).
import { resolveTool } from '../ext/tools';
import type { CanvasTool, ToolHitContext, ToolPointerEvent } from '../ext/tools';

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
}

export class DomEventBinder {
  private readonly options: Required<DomEventBinderOptions>;

  private attached = false;
  private spaceKeyPressed = false;

  private isPanning = false;
  private lastPanX = 0;
  private lastPanY = 0;

  private nodeDrag: NodeDragState | null = null;

  // Bound once so removeEventListener gets the SAME function object it added —
  // `removeEventListener(this.onX.bind(this))` allocates a new function and
  // silently removes nothing (the classic listener leak).
  private readonly boundWheel = (e: WheelEvent) => this.onWheel(e);
  /**
   * Wave 6 — Card 5. The registered tool that CLAIMED the current gesture, if
   * any. Exactly one tool owns a gesture end-to-end (the same single-active-tool
   * rule the Angular ToolManager enforces).
   */
  private activeTool?: CanvasTool;
  private activeToolHit?: ToolHitContext;

  private readonly boundMouseDown = (e: MouseEvent) => this.onMouseDown(e);
  private readonly boundMouseMove = (e: MouseEvent) => this.onMouseMove(e);
  private readonly boundMouseUp = (e: MouseEvent) => this.onMouseUp(e);
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
  }

  /** Bind DOM listeners. No-op on the server and no-op if already attached. */
  attach(): void {
    if (this.attached || !isBrowser()) return;
    this.attached = true;

    this.container.addEventListener('wheel', this.boundWheel, { passive: false });
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
    this.container.removeEventListener('mousedown', this.boundMouseDown);
    this.container.removeEventListener('mousemove', this.boundMouseMove);
    this.container.removeEventListener('mouseup', this.boundMouseUp);
    this.container.removeEventListener('mouseleave', this.boundMouseLeave);
    this.container.removeEventListener('dblclick', this.boundDblClick);
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.boundKeyDown);
      window.removeEventListener('keyup', this.boundKeyUp);
    }

    this.isPanning = false;
    this.nodeDrag = null;
    this.spaceKeyPressed = false;
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
    if (!this.options.readonly) {
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

    if (!this.options.readonly) {
      // 2. Port → start a connection drag.
      if (state.hoveredPort) {
        event.preventDefault();
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
      this.pressNode(node, diagram, event, worldX, worldY);
      this.host.emit('node:click', { node, world: { x: worldX, y: worldY } });
      return;
    }

    // 9. Empty canvas → clear the selection (unless a modifier is extending it).
    const hasModifier = event.shiftKey || event.ctrlKey || event.metaKey || event.altKey;
    if (!hasModifier) {
      diagram.clearSelection();
      diagram.getLinks().forEach((l: LinkModel) => {
        if (l.state === 'selected') l.setState('default');
      });
      this.host.requestRender();
      this.emitSelectionChange();
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

    const state = this.host.interaction.getState();

    if (state.isDraggingControlPoint) {
      event.preventDefault();
      this.host.interaction.endControlPointDrag();
      this.host.requestRender();
      return;
    }

    if (state.isDraggingWaypoint) {
      event.preventDefault();
      this.host.interaction.endWaypointDrag();
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

    if (this.nodeDrag) {
      const moved = this.nodeDrag.committed;
      this.nodeDrag = null;
      if (moved) this.emitNodesChange();
    }

    this.isPanning = false;
    this.setCursor(this.spaceKeyPressed ? 'grab' : 'default');
  }

  /** Pointer left the canvas — abort every in-flight gesture so nothing sticks. */
  onMouseLeave(): void {
    const engine = this.engine();
    this.isPanning = false;

    if (this.nodeDrag) {
      const moved = this.nodeDrag.committed;
      this.nodeDrag = null;
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
    if (!engine || this.options.readonly) return;

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
      const state = this.host.interaction.getState();
      if (state.isConnecting) this.host.interaction.cancelConnection(engine);
      if (state.isReconnectingLink) this.host.interaction.cancelLinkReconnection(engine);
      this.nodeDrag = null;
      diagram.clearSelection();
      this.host.requestRender();
      this.emitSelectionChange();
      return;
    }

    if ((event.key === 'Delete' || event.key === 'Backspace') && !this.options.readonly) {
      const removedWaypoint = this.host.interaction.deleteHoveredWaypoint();
      const removedLink = this.host.interaction.deleteSelectedLink(engine);
      const selectedNodes = diagram.getSelectedNodes();
      const removedNodes = selectedNodes.length > 0 ? diagram.deleteSelected() : 0;

      if (removedWaypoint || removedLink || removedNodes > 0) {
        event.preventDefault();
        this.host.requestRender();
        if (removedNodes > 0) this.emitNodesChange();
        if (removedLink) this.emitEdgesChange();
        this.emitSelectionChange();
      }
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      diagram.selectAll();
      this.host.requestRender();
      this.emitSelectionChange();
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

    if (this.options.readonly || !node.isDraggable() || !node.isSelected()) return;

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
    }

    const { x: worldX, y: worldY } = this.toWorld(event);
    const dx = worldX - drag.lastWorldX;
    const dy = worldY - drag.lastWorldY;
    drag.lastWorldX = worldX;
    drag.lastWorldY = worldY;
    if (!dx && !dy) return;

    for (const id of drag.nodeIds) {
      const node = diagram.getNode(id);
      if (!node || node.state.locked) continue;
      node.setPosition(node.position.x + dx, node.position.y + dy);
    }

    // Node geometry moved ⇒ the port hit cache is stale.
    this.host.interaction.invalidatePortHitCache();
    this.host.requestRender();
  }

  // ==========================================================================
  // helpers
  // ==========================================================================

  private engine(): DiagramEngine | null {
    return this.host.getEngine();
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
    const hit = diagram.getNodeAtPosition(worldX, worldY);
    if (hit) return this.dragTargetFor(hit, diagram);

    let element = event.target as HTMLElement | null;
    while (element && element !== this.container) {
      const nodeId = element.getAttribute?.('data-node-id');
      if (nodeId) {
        const node = diagram.getNode(nodeId);
        return node ? this.dragTargetFor(node, diagram) : undefined;
      }
      element = element.parentElement;
    }
    return undefined;
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
