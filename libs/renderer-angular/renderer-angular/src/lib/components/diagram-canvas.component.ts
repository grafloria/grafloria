import {
  Component,
  ComponentRef,
  AfterViewInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  HostListener,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  createComponent,
  EnvironmentInjector,
  inject,
  input,
  model,
  output,
  signal,
  computed,
  effect,
  untracked,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  DiagramEngine,
  PortModel,
  NodeModel,
  LinkModel,
  GroupModel,
  DiagramModel,
  // wave3/interaction: the canvas commits every direct-manipulation edit as a
  // Command, so gestures become undoable (they never were).
  type Command,
  type Point,
  MacroCommand,
  MoveNodeCommand,
  CopyCommand,
  CutCommand,
  PasteCommand,
  DeleteSelectionCommand,
  // wave4/ngwrapper (Card 2): the OUTBOUND delta. IncrementalCapture already
  // coalesces a diagram's mutations into a replayable patch, with a suite-enforced
  // replay invariant — no reason to invent a second one for `modelChange`.
  beginIncrementalCapture,
  type IncrementalCapture,
  type DiagramIncremental,
} from '@grafloria/engine';
import {
  SVGRenderer,
  LIGHT_THEME,
  type Theme,
  type Rectangle,
  type SVGRendererConfig,
  getPortPositionForShape,
  // wave4/ngwrapper (Card 2): the INBOUND reconciler. `applyNodes` / `applyEdges`
  // and the `toNodeSpec` / `toEdgeSpec` back-projection are the framework-agnostic
  // spec↔model layer that the React wrapper and the web component already use.
  // Angular delegates to exactly the same code: one diff algorithm, not two.
  applyNodes,
  applyEdges,
  toNodeSpec,
  toEdgeSpec,
  type NodeSpec,
  type EdgeSpec,
  // wave4/interaction — every bit of tool/snap/keyboard LOGIC lives in
  // @grafloria/renderer (framework-agnostic). This component only routes DOM events
  // into it, draws the geometry it returns, and dispatches the commands it builds.
  SelectionToolsController,
  type SelectionToolLayer,
  type ToolHandle,
  SnapController,
  type AlignmentGuide,
  type SpacingGuide,
  type ProximityCandidate,
  HighlighterController,
  type Highlighter,
  KeyboardNavigationController,
  type FocusRing,
  type Announcement,
  InPlaceTextEditor,
  // wave4/styling — colorMode / theme set / design-token bridge are RENDERER
  // config; the wrapper only forwards them.
  type ColorMode,
  type ThemeSet,
  type TokenBridge,
} from '@grafloria/renderer';
import { VNodeRendererService } from '../services/vnode-renderer.service';
import { InteractionHandlerService } from '../services/interaction-handler.service';
import { ComponentRendererService } from '../services/component-renderer.service';
import { HandleRegistryService } from '../services/handle-registry.service';
import { HtmlNodeRendererDirective } from '../directives/html-node-renderer.directive';
import { GrafloriaHandleDirective } from '../directives/grafloria-handle.directive';
import {
  ToolManager,
  ToolActions,
  ToolPointerEvent,
  HitTestResult,
  MarqueeSelection,
  ToolInteractionMode,
} from '../interaction';
// Wave 3 (Edges & links): path-anchored edge toolbar. The canvas only HOSTS it
// (picks the target link, forwards viewport/zoom) — all toolbar logic lives in
// the component.
import {
  LinkToolbarComponent,
  LinkToolbarAction,
  createDefaultLinkActions,
} from './link-toolbar';

/**
 * DiagramCanvasComponent
 *
 * Standalone, OnPush, **signal-based** Angular canvas over the framework-agnostic
 * `SVGRenderer` + engine. A thin shell on purpose: every decision it makes is
 * delegated down into `@grafloria/renderer` (`InteractionController`, `SVGRenderer`,
 * `applyNodes`/`applyEdges`) or `@grafloria/engine` (commands, `IncrementalCapture`).
 *
 * ## wave4/ngwrapper — Card 1: signals & zoneless
 *
 * Inputs are `input()` / `model()` signals, outputs are `output()`: **no NgZone
 * dependency, no EventEmitter**, so the component runs under
 * `provideZonelessChangeDetection()`. Everything the *template* binds is a signal
 * (`marquee`, `htmlNodes`, `htmlLayerTransform`, `linkToolbarTarget`) — that is
 * what lets the zoneless scheduler see a change with no zone tick. The SVG layer
 * is painted imperatively (VNode → DOM patcher) and never went through change
 * detection at all.
 *
 * `viewport` and `zoom` are `model()` signals because the canvas WRITES them (pan,
 * cursor-anchored zoom, fit-to-content), so `[(zoom)]` / `[(viewport)]` round-trip.
 * `zoomChanged` / `viewportChanged` are kept alongside for backwards compatibility
 * (`viewportChanged` emits the VISIBLE world rect — the viewBox — whereas the
 * `model`'s `viewportChange` emits the camera rect the `viewport` input IS).
 *
 * ## wave4/ngwrapper — Card 2: controlled data binding
 *
 * Two modes, both supported:
 *
 * - **Uncontrolled (legacy):** bind `[engine]` and mutate the engine yourself.
 *   Unchanged behaviour.
 * - **Controlled:** bind `[(nodes)]` / `[(edges)]` — the same `NodeSpec` /
 *   `EdgeSpec` data the React wrapper and `<grafloria-flow>` take. They are reconciled
 *   against the live model by `applyNodes` / `applyEdges` **from `@grafloria/renderer`**
 *   (the shared reconciler — Angular does not get a second diff algorithm), and
 *   model mutations come back out as `nodesChange` / `edgesChange` (the next array
 *   — Angular's two-way contract) plus `modelChange` (a `DiagramIncremental`:
 *   precisely which entities were added / removed / modified — GoJS's
 *   `IncrementalData`). `[skipModelUpdate]="true"` suspends the inbound half
 *   (GoJS's `skipsDiagramUpdate`).
 *
 * @example
 * ```html
 * <!-- uncontrolled -->
 * <grafloria-diagram-canvas [engine]="engine" [(zoom)]="zoom" />
 *
 * <!-- controlled -->
 * <grafloria-diagram-canvas
 *   [(nodes)]="nodes"
 *   [(edges)]="edges"
 *   (modelChange)="persist($event)" />
 * ```
 */
@Component({
    selector: 'grafloria-diagram-canvas',
    imports: [CommonModule, HtmlNodeRendererDirective, GrafloriaHandleDirective, LinkToolbarComponent],
    templateUrl: './diagram-canvas.component.html',
    styleUrls: ['./diagram-canvas.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class DiagramCanvasComponent implements AfterViewInit, OnDestroy {
  // ==========================================================================
  // Inputs (signals)
  // ==========================================================================

  /**
   * Diagram engine instance. Optional: in controlled mode (`nodes`/`edges` bound)
   * the canvas creates and owns one if you do not supply it.
   */
  readonly engine = input<DiagramEngine | undefined>(undefined);

  /**
   * Controlled node data (Card 2) — the shared `NodeSpec` shape. `undefined` =
   * uncontrolled: the engine's node set is left alone. Two-way: `[(nodes)]`.
   */
  readonly nodes = model<readonly (NodeSpec | NodeModel)[] | undefined>(undefined);

  /** Controlled edge data (Card 2). Two-way: `[(edges)]`. */
  readonly edges = model<readonly (EdgeSpec | LinkModel)[] | undefined>(undefined);

  /**
   * Suspend the INBOUND half of the controlled binding (GoJS's
   * `skipsDiagramUpdate`): incoming `nodes`/`edges` are not pushed into the model
   * while this is true. Flipping it back to false re-syncs immediately. Outbound
   * emissions are unaffected.
   */
  readonly skipModelUpdate = input(false);

  /** Camera rectangle. Two-way: `[(viewport)]` (the canvas pans/zooms it). */
  readonly viewport = model<Rectangle>({ x: 0, y: 0, width: 800, height: 600 });

  /** Zoom level. Two-way: `[(zoom)]` (the canvas writes it on wheel/fit/keys). */
  readonly zoom = model(1.0);

  /**
   * Theme configuration.
   *
   * Ignored as a SOURCE once `colorMode` is set — the mode plus the OS's
   * preferences then decide which of `themes` is active.
   */
  readonly theme = input<Theme>(LIGHT_THEME);

  /**
   * Wave 4 (styling) — Card "colorMode".
   *
   * `'light' | 'dark' | 'system'`. `'system'` follows `prefers-color-scheme` and
   * re-themes LIVE when the OS flips, by rebinding this diagram's CSS variables.
   * A `prefers-contrast: more` / forced-colors preference upgrades to the
   * high-contrast theme on top of whichever mode is in force.
   *
   * Leave unset for the pre-Wave-4 behaviour (`[theme]` is used verbatim).
   */
  readonly colorMode = input<ColorMode | undefined>(undefined);

  /** The themes `colorMode` chooses between. Defaults to the built-in set. */
  readonly themes = input<ThemeSet | undefined>(undefined);

  /**
   * Wave 4 (styling) — Card "design-token bridge".
   *
   * Map the host design system's tokens onto Grafloria's CSS variables:
   *   `[tokenBridge]="shadcnBridge()"` — and the whole diagram adopts the app's
   * palette, live, with no node template touched.
   */
  readonly tokenBridge = input<TokenBridge | undefined>(undefined);

  /**
   * Extra SVGRenderer options (e.g. smartConnectionPoints, linkHitAreaWidth).
   * Merged over the component defaults; changing it recreates the renderer.
   */
  readonly rendererConfig = input<Partial<SVGRendererConfig>>({});

  /** Enable ctrl/⌘ + wheel zoom. */
  readonly enableMouseWheelZoom = input(true);

  /** Enable pan (middle-drag, space-drag, wheel-scroll). */
  readonly enablePan = input(true);

  /** Relative zoom step per wheel notch / keyboard zoom. */
  readonly zoomSensitivity = input(0.1);

  /** Minimum zoom level. */
  readonly minZoom = input(0.1);

  /** Maximum zoom level. */
  readonly maxZoom = input(3.0);

  // ==========================================================================
  // Outputs
  // ==========================================================================

  /**
   * The VISIBLE world rect (the SVG viewBox) after a pan/zoom. NOT the same as the
   * `viewport` model's `viewportChange`, which emits the camera rect.
   */
  readonly viewportChanged = output<Rectangle>();

  /** Zoom after a pan/zoom gesture. (`zoomChange` is the two-way twin.) */
  readonly zoomChanged = output<number>();

  /**
   * Card 2: the incremental patch describing what the MODEL just changed — added /
   * removed / modified nodes, links and groups (GoJS `IncrementalData`). Produced
   * by the engine's `IncrementalCapture`, so it replays exactly. Emitted for
   * engine-originated changes only: a change you pushed in through `[nodes]` /
   * `[edges]` is not echoed back at you.
   */
  readonly modelChange = output<DiagramIncremental>();

  // ==========================================================================
  // Derived / internal state
  // ==========================================================================

  /** Engine created by the canvas itself (controlled mode with no `[engine]`). */
  private readonly internalEngine = signal<DiagramEngine | null>(null);

  /** The engine actually in use: the bound one, else the one we own. */
  readonly activeEngine = computed<DiagramEngine | undefined>(
    () => this.engine() ?? this.internalEngine() ?? undefined
  );

  /**
   * Internal alias for {@link activeEngine} with the pre-signals ergonomics: this
   * component's body is full of `if (!this.eng) return;` guards followed by
   * non-null use, exactly as when `engine` was `@Input() engine!: DiagramEngine`.
   */
  private get eng(): DiagramEngine {
    return this.activeEngine() as DiagramEngine;
  }

  // ==========================================================================
  // Wave 3 (Edges & links) — edge toolbar host.
  // The canvas' ONLY jobs here: pick the target link (READ-ONLY from the
  // interaction handler + link state) and forward viewport/zoom. Everything
  // else — anchoring, screen maths, actions, undo — lives in LinkToolbar.
  // ==========================================================================

  /** Show the floating edge toolbar on link hover/selection. */
  readonly enableLinkToolbar = input(true);

  /** Buttons on the edge toolbar. Defaults to delete + insert-node-on-edge. */
  readonly linkToolbarActions = input<LinkToolbarAction[] | undefined>(undefined);

  /** Fraction along the link the toolbar is glued to (0.5 = midpoint). */
  readonly linkToolbarAnchor = input(0.5);

  /** Link the edge toolbar is currently attached to (null = no toolbar). */
  readonly linkToolbarTarget = signal<LinkModel | null>(null);

  /** True while the pointer is inside the toolbar itself. */
  private linkToolbarHovered = false;

  /** Memoised default actions (rebuilding per frame would churn the buttons). */
  private defaultLinkActions?: LinkToolbarAction[];

  get effectiveLinkToolbarActions(): LinkToolbarAction[] {
    const configured = this.linkToolbarActions();
    if (configured) {
      return configured;
    }
    if (!this.defaultLinkActions && this.eng) {
      this.defaultLinkActions = createDefaultLinkActions(this.eng);
    }
    return this.defaultLinkActions ?? [];
  }

  /**
   * Pick the link the toolbar should hang off, consuming existing state
   * READ-ONLY: a selected link wins over a merely hovered one (the renderer's
   * own state precedence), and the toolbar survives the pointer leaving the
   * stroke to reach for a button.
   */
  private updateLinkToolbarTarget(): void {
    if (!this.enableLinkToolbar() || !this.eng) {
      this.linkToolbarTarget.set(null);
      return;
    }

    const diagram = this.eng.getDiagram();
    if (!diagram) {
      this.linkToolbarTarget.set(null);
      return;
    }

    const selected = diagram.getLinks().find((l: LinkModel) => l.state === 'selected') ?? null;
    const hovered = this.interactionHandler.getState().hoveredLink ?? null;
    const next = selected ?? hovered;

    // Keep the current toolbar alive while the pointer is on it (otherwise it
    // vanishes the instant you move off the line to click a button).
    if (!next && this.linkToolbarHovered && this.linkToolbarTarget()) {
      return;
    }
    this.linkToolbarTarget.set(next);
  }

  onLinkToolbarPointerOver(isOver: boolean): void {
    this.linkToolbarHovered = isOver;
    if (!isOver) {
      this.updateLinkToolbarTarget();
      this.cdr.markForCheck();
    }
  }

  // ==========================================================================
  // wave4/interaction — Cards 5-7. The canvas is a THIN host: it owns the DOM
  // events and the overlay markup; the controllers below (all in @grafloria/renderer)
  // own the geometry, the gesture state machines and the undo commands.
  // ==========================================================================

  /** Card 5: resize/rotate handles, Halo, link endpoint + vertex tools. */
  readonly enableSelectionTools = input(true);

  /** Card 6: alignment snaplines, equal spacing, grid snap, keep-in-bounds. */
  readonly enableSnapping = input(true);

  /** Card 6: drop a node near a compatible port → auto-link it. */
  readonly enableProximityConnect = input(true);

  /** Card 7: Tab/arrow focus, nudge, keyboard connect, ARIA announcements. */
  readonly enableKeyboardNavigation = input(true);

  /** Card 6: world rectangle nodes may not be dragged outside of (null = free). */
  /**
   * wave4/interaction — keep-in-bounds for dragging. A signal input, not @Input:
   * ngOnChanges no longer exists (wave4/ngwrapper made this component zoneless),
   * so a plain @Input would be read once and never react to a rebind. The effect
   * below pushes every change into the SnapController.
   */
  readonly canvasBounds = input<Rectangle | null>(null);

  /** Card 5: double-click a node to edit its label in place. */
  readonly enableInPlaceEditing = input(true);

  private readonly selectionTools = new SelectionToolsController();
  private readonly snapController = new SnapController();
  private readonly highlighterController = new HighlighterController();
  private readonly keyboardNav = new KeyboardNavigationController();
  private readonly inPlaceEditor = new InPlaceTextEditor();

  /** Live tool layer for the current selection (template-bound). */
  toolLayer: SelectionToolLayer = {
    bounds: null,
    rotation: 0,
    center: null,
    nodeIds: [],
    linkIds: [],
    handles: [],
  };

  /** Hover / selection / validation / drop-target decorations (template-bound). */
  highlighters: Highlighter[] = [];

  /** Live alignment snaplines + equal-spacing guides during a drag/resize. */
  alignmentGuides: AlignmentGuide[] = [];
  spacingGuides: SpacingGuide[] = [];

  /** Card 7: the visible focus ring (keyboard focus ≠ selection). */
  focusRing: FocusRing | null = null;

  /** Card 7: text of the ARIA live region. */
  liveMessage = '';
  livePoliteness: 'polite' | 'assertive' = 'polite';

  /** The proximity-connect candidate under the dragged node (Card 6). */
  private proximityCandidate: ProximityCandidate | null = null;

  /** Unsubscribe for the announcement stream. */
  private announcementSub?: () => void;

  /**
   * Main container reference
   */
  @ViewChild('container', { static: true }) containerRef!: ElementRef<HTMLDivElement>;

  /**
   * SVG layer reference (Phase 1: Hybrid Rendering)
   */
  @ViewChild('svgLayer', { static: true }) svgLayerRef!: ElementRef<HTMLDivElement>;

  /**
   * HTML layer reference (Phase 1: Hybrid Rendering)
   */
  @ViewChild('htmlLayer', { static: true }) htmlLayerRef!: ElementRef<HTMLDivElement>;

  /**
   * SVGRenderer instance
   */
  private renderer?: SVGRenderer;

  /**
   * Flag to track if component is destroyed
   */
  private destroyed = false;

  /** True from ngAfterViewInit: the SVG/HTML layers exist and can be painted. */
  private viewReady = false;

  /**
   * Pan/drag state (Phase 0.5 - Option B)
   */
  private isPanning = false;
  private lastPanX = 0;
  private lastPanY = 0;
  private spaceKeyPressed = false;

  /**
   * Node drag state (Option 1: Node Interaction)
   *
   * wave3/interaction: the start position captured here is also the `oldPosition`
   * of the MoveNodeCommand committed at pointer-UP — the live drag keeps mutating
   * the model directly (for smoothness), and ONE command per gesture is what makes
   * it undoable.
   */
  private isDraggingNode = false;
  private draggedNodes: Map<string, { startX: number; startY: number; startZ?: number }> =
    new Map();

  /**
   * wave3/interaction: the last command dispatched by a gesture/keybinding.
   * CommandManager.execute() is async; tests await this to observe the result.
   */
  private pendingCommand: Promise<void> | null = null;

  /**
   * wave3/interaction: last pointer position in CLIENT coords, so paste can drop
   * the clipboard at the cursor. Null until the pointer has moved over the canvas.
   */
  private lastPointerClient: { x: number; y: number } | null = null;

  /**
   * Wave-2 Interaction: single-active-tool arbitration.
   * Owns the click-vs-drag threshold, DELIBERATE gating and the marquee tool.
   * The canvas keeps its existing port/pan/waypoint branches; the ToolManager
   * is fed only for the node-drag and empty-space (marquee) gestures.
   */
  private toolManager!: ToolManager;

  /**
   * Live marquee overlay rectangle in SCREEN px (relative to the container),
   * or null when no marquee is active. Bound by the template's SVG overlay.
   */
  readonly marquee = signal<{ x: number; y: number; width: number; height: number } | null>(null);

  /** Selection captured when a marquee starts, restored before each move so
   *  add/subtract/toggle stay idempotent as the rectangle grows/shrinks. */
  private marqueeBaseSelection: Set<string> | null = null;

  /** Throttle bookkeeping for marquee selection (RISK: applySelection rewrites
   *  every node's state + the store on each move — expensive on big diagrams). */
  private lastMarqueeSelectAt = 0;

  /**
   * HTML layer transform (Phase 1: Hybrid Rendering)
   * Synced with viewport to keep HTML nodes aligned with SVG
   */
  readonly htmlLayerTransform = signal("");

  /**
   * HTML nodes to render (DECLARATIVE APPROACH - React Flow style)
   * Exposed as a public property for template binding
   */
  readonly htmlNodes = signal<any[]>([]);

  /**
   * Track last HTML node count to reduce console logging
   */
  private _lastHtmlNodeCount?: number;

  /**
   * HTML node component instances (Phase 1: Hybrid Rendering)
   * DEPRECATED: No longer used - switched to declarative rendering
   * Maps node ID to Angular ComponentRef for lifecycle management
   */
  private htmlNodeComponents = new Map<string, ComponentRef<any>>();

  // ==========================================================================
  // wave2/rendering: frame-coalesced render loop + real frame metrics
  // ==========================================================================
  /** Set by scheduleRender(); cleared the moment a frame actually paints. */
  private renderDirty = false;
  /** Handle of the currently-queued animation frame (null when none pending). */
  private rafHandle: number | null = null;
  /** viewport+zoom actually drawn last frame — used by the idle-skip check. */
  private lastRenderedViewportKey = '';
  /** Whether last painted frame drew a live connection preview (idle-skip). */
  private lastFrameHadConnectionPreview = false;
  /** Ring buffer of recent frame END timestamps (ms) → rolling FPS. */
  private frameTimestamps: number[] = [];
  /** Ring buffer of recent frame render DURATIONS (ms) → rolling frame-time. */
  private frameDurations: number[] = [];
  /** Cumulative count of frames whose render blew the budget. */
  private droppedFrameCount = 0;
  /** How many recent frames to keep in the ring buffers. */
  private static readonly FRAME_HISTORY = 60;
  /** A frame render slower than this (ms, ~2× a 60fps budget) is "dropped". */
  private static readonly DROPPED_FRAME_MS = 32;

  // ==========================================================================
  // wave4/ngwrapper — Card 2: controlled-mode bookkeeping.
  // ==========================================================================

  /** Watches the live diagram; drained into a `modelChange` patch per emit. */
  private capture: IncrementalCapture | null = null;

  /** The engine `attachEngine()` last wired up (renderer, tools, subscriptions). */
  private attachedEngine: DiagramEngine | null = null;

  /** Unsubscribers for the engine/diagram event subscriptions we own. */
  private engineSubscriptions: Array<() => void> = [];

  /**
   * >0 while an INBOUND array is being pushed into the model. The engine fires its
   * normal events during that apply; echoing them straight back at the host as
   * `nodesChange` would be the classic controlled-component feedback loop, so
   * emission is suppressed for the duration.
   */
  private applyDepth = 0;

  /** True once the host has actually bound `nodes` (resp. `edges`) at least once. */
  private nodesBound = false;
  private edgesBound = false;

  /** An outbound emission is already queued on a microtask. */
  private emitQueued = false;

  /** The exact array instances we last emitted (identity-compared on the way in). */
  private lastEmittedNodes: readonly unknown[] | null = null;
  private lastEmittedEdges: readonly unknown[] | null = null;

  private readonly vnodeRenderer = inject(VNodeRendererService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly interactionHandler = inject(InteractionHandlerService);
  private readonly componentRenderer = inject(ComponentRendererService);
  private readonly environmentInjector = inject(EnvironmentInjector);
  private readonly handleRegistry = inject(HandleRegistryService);

  constructor() {
    // --- engine lifecycle: renderer + tools + subscriptions follow the engine ---
    // wave4/interaction: keep-in-bounds is a live input — push every change into
    // the SnapController (ngOnChanges used to do this).
    effect(() => {
      const bounds = this.canvasBounds();
      untracked(() => this.snapController.updateConfig({ keepInBounds: bounds ?? null }));
    });

    effect(() => {
      const engine = this.activeEngine();
      untracked(() => this.attachEngine(engine));
    });

    // --- theme ---------------------------------------------------------------
    effect(() => {
      const theme = this.theme();
      untracked(() => {
        // wave4/styling: when a colorMode is in force, the OS preference + the theme
        // SET decide which theme is active — a stray [theme] binding must not fight
        // them.
        if (this.renderer && !this.colorMode()) {
          this.renderer.setTheme(theme);
          this.scheduleRender();
        }
      });
    });

    // --- wave4/styling: colour mode + theme set ------------------------------
    // Rebinding these must NOT recreate the renderer — the whole point of the card
    // is that a mode flip is a CSS-variable rebind, not a diagram rebuild.
    effect(() => {
      const mode = this.colorMode();
      const themes = this.themes();
      untracked(() => {
        if (this.renderer && mode) {
          this.renderer.setColorMode(mode, themes);
          this.scheduleRender();
        }
      });
    });

    // --- wave4/styling: design-token bridge ----------------------------------
    // Pure CSS (it re-points --grafloria-* at the host's tokens), so no re-render is
    // strictly needed; schedule one anyway so a host that also changed something
    // else still paints exactly one frame.
    effect(() => {
      const bridge = this.tokenBridge();
      untracked(() => {
        if (this.renderer) {
          this.renderer.setTokenBridge(bridge);
          this.scheduleRender();
        }
      });
    });

    // --- renderer options: a change recreates the renderer --------------------
    effect(() => {
      this.rendererConfig();
      untracked(() => {
        if (this.renderer) {
          this.initializeRenderer();
          this.scheduleRender();
        }
      });
    });

    // --- camera: repaint on any zoom/viewport change (whoever wrote it) -------
    effect(() => {
      this.zoom();
      this.viewport();
      untracked(() => {
        this.scheduleRender();
        this.cdr.markForCheck();
      });
    });

    // --- Card 2: controlled data IN ------------------------------------------
    effect(() => {
      const nodes = this.nodes();
      const edges = this.edges();
      const skip = this.skipModelUpdate();
      untracked(() => this.syncFromInputs(nodes, edges, skip));
    });
  }

  ngAfterViewInit(): void {
    this.viewReady = true;

    // The engine may already be attached by the constructor effect; attachEngine
    // is idempotent, so this only matters when effects have not flushed yet.
    this.attachEngine(untracked(() => this.activeEngine()));

    if (this.eng) {
      // wave2/rendering: paint the FIRST frame synchronously (renderNow also runs
      // change detection). A single mount render can't benefit from coalescing,
      // and OnPush needs the immediate paint so nodes created before
      // AfterViewInit are visible right away.
      this.renderNow();
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.cleanup();
  }

  // ==========================================================================
  // wave4/ngwrapper — Card 2: the controlled-component seam.
  //
  // IN:  host array → `applyNodes`/`applyEdges` (the SHARED reconciler in
  //      @grafloria/renderer, also used by @grafloria/react and <grafloria-flow>).
  // OUT: engine events → `IncrementalCapture` → `modelChange`, plus the next
  //      `nodes`/`edges` arrays via `toNodeSpec`/`toEdgeSpec`.
  //
  // The loop is cut in THREE independent places, so no single mistake spins the CPU:
  //   1. re-applying a spec array that already describes the model mutates nothing
  //      (applyNodeSpec only writes fields that actually differ), so an echoed
  //      array produces no engine events and therefore no further emission;
  //   2. emission is suppressed while an inbound array is being applied
  //      (`applyDepth`), so the host is never told about its own edit;
  //   3. the array we emit is remembered, and seeing it come straight back is a
  //      no-op.
  // ==========================================================================

  /** Ensure there is an engine to hold controlled data, creating one if needed. */
  private ensureEngine(): DiagramEngine | undefined {
    const provided = untracked(() => this.engine());
    if (provided) {
      return provided;
    }
    const owned = untracked(() => this.internalEngine());
    if (owned) {
      return owned;
    }
    const created = new DiagramEngine();
    created.createDiagram('Diagram');
    this.internalEngine.set(created); // → activeEngine → attachEngine effect
    return created;
  }

  /** Push the host's arrays into the model (guards 1 + 2 + 3). */
  private syncFromInputs(
    nodes: readonly (NodeSpec | NodeModel)[] | undefined,
    edges: readonly (EdgeSpec | LinkModel)[] | undefined,
    skip: boolean
  ): void {
    if (nodes !== undefined) this.nodesBound = true;
    if (edges !== undefined) this.edgesBound = true;

    if (nodes === undefined && edges === undefined) {
      return; // fully uncontrolled — the legacy `[engine]` path
    }
    if (skip) {
      return; // GoJS's skipsDiagramUpdate
    }

    // Guard 3: this is the very array we just handed the host. Nothing to do.
    const echoedNodes = nodes === undefined || nodes === this.lastEmittedNodes;
    const echoedEdges = edges === undefined || edges === this.lastEmittedEdges;
    if (echoedNodes && echoedEdges) {
      return;
    }

    const diagram = this.ensureEngine()?.getDiagram();
    if (!diagram) {
      return;
    }

    this.applyDepth++; // guard 2
    try {
      // Guard 1 lives inside the shared reconciler: applyNodeSpec/applyEdgeSpec
      // only write a field when it actually differs, so re-applying the model's
      // own projection emits nothing.
      if (nodes) applyNodes(diagram, nodes as Array<NodeSpec | NodeModel>);
      if (edges) applyEdges(diagram, edges as Array<EdgeSpec | LinkModel>);
    } finally {
      this.applyDepth--;
    }

    // The host already knows about the change it just made — drop it from the
    // capture window so the next genuine emission does not replay it.
    this.capture?.commit();

    this.scheduleRender();
    this.cdr.markForCheck();
  }

  /**
   * An engine-originated mutation: repaint, and (unless it was ours) emit.
   *
   * NOTE: deliberately no `markForCheck()` here. The paint goes through
   * `scheduleRender()` → `renderNow()`, which writes the template's signals
   * (`htmlNodes`, `marquee`, …) and runs change detection itself. A `markForCheck()`
   * on top would only notify Angular's scheduler a second time — one extra
   * rAF-raced tick per engine event, for no repaint.
   */
  private onModelMutated(): void {
    this.scheduleRender();
    if (this.applyDepth > 0) {
      return; // inbound apply — do not echo the host's own edit back at it
    }
    this.scheduleModelEmit();
  }

  /** Coalesce a burst of engine events into ONE outbound emission. */
  private scheduleModelEmit(): void {
    if (this.emitQueued || this.destroyed) {
      return;
    }
    this.emitQueued = true;
    queueMicrotask(() => {
      this.emitQueued = false;
      if (!this.destroyed) {
        this.flushModelEmit();
      }
    });
  }

  /**
   * Drain the capture window and publish it: `modelChange` always, plus the next
   * `nodes` / `edges` arrays for whichever collections the host actually bound.
   */
  private flushModelEmit(): void {
    const diagram = this.eng?.getDiagram();
    if (!diagram || !this.capture) {
      return;
    }

    const patch = this.capture.commit();
    if (!patch) {
      return; // nothing actually changed
    }

    this.modelChange.emit(patch);

    if (this.nodesBound) {
      const next: NodeSpec[] = diagram.getNodes().map((node) => toNodeSpec(node));
      this.lastEmittedNodes = next;
      this.nodes.set(next); // → (nodesChange); `[(nodes)]` round-trips
    }
    if (this.edgesBound) {
      const next: EdgeSpec[] = diagram.getLinks().map((link) => toEdgeSpec(link));
      this.lastEmittedEdges = next;
      this.edges.set(next); // → (edgesChange)
    }
  }

  /** Force the pending outbound emission to happen NOW (tests, imperative hosts). */
  flushModelChange(): void {
    this.emitQueued = false;
    this.flushModelEmit();
  }

  /**
   * Wire (or re-wire) everything that hangs off the engine. Idempotent, and safe to
   * call before the view exists: the renderer and the tool manager are both DOM-free
   * — only `renderDiagram()` needs the layers.
   */
  private attachEngine(engine: DiagramEngine | undefined): void {
    if (this.destroyed || engine === this.attachedEngine) {
      return;
    }

    this.detachEngine();
    this.attachedEngine = engine ?? null;
    if (!engine) {
      return;
    }

    this.initializeRenderer();
    this.initializeToolManager();
    // wave4/interaction: selection tools / snapping / highlighters / keyboard nav.
    // Their previous call sites (ngAfterViewInit + ngOnChanges) were deleted by the
    // signal rewrite, so attachEngine — the single place an engine is wired — owns
    // them now, and they are re-initialised on every [engine] swap.
    this.initializeWave4Controllers();
    this.subscribeToEngineEvents();

    const diagram = engine.getDiagram();
    if (diagram) {
      this.capture = beginIncrementalCapture(diagram);
    }

    this.scheduleRender();
  }

  /** Drop every subscription/resource tied to the previously attached engine. */
  private detachEngine(): void {
    this.engineSubscriptions.forEach((off) => {
      try {
        off();
      } catch {
        /* a disposed emitter is not an error here */
      }
    });
    this.engineSubscriptions = [];
    this.capture?.stop();
    this.capture = null;
    this.defaultLinkActions = undefined;
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = undefined;
    }
  }

  /**
   * Initialize SVG renderer
   */
  private initializeRenderer(): void {
    // Dispose old renderer if exists
    if (this.renderer) {
      this.renderer.dispose();
    }

    // Create new renderer
    this.renderer = new SVGRenderer(
      this.eng,
      {
        enableCaching: true,
        useCSSMode: true, // CRITICAL: Required for animations to work (CSS classes)
        // Wave 4 (styling): colorMode / theme set / design-token bridge. Passed
        // through to the renderer, which owns ALL of the logic — this wrapper
        // only forwards Angular inputs.
        ...(this.colorMode() ? { colorMode: this.colorMode() } : {}),
        ...(this.themes() ? { themes: this.themes() } : {}),
        ...(this.tokenBridge() ? { tokenBridge: this.tokenBridge() } : {}),
        ...this.rendererConfig(),
      },
      this.theme()
    );

    // LATENT BUG (Wave 4): `applyInstanceScope()` existed since the scoped-theme
    // card and NOTHING ever called it. The root <svg> carries the instance scope
    // itself, and foreignObject content inherits from it — but nodes on the HTML
    // LAYER (`metadata.useHTMLLayer`) are SIBLINGS of the svg, so they inherited
    // no `--grafloria-*` variables and matched none of the scoped rules. Scoping the
    // container, which wraps BOTH layers, is what the method was written for.
    this.renderer.applyInstanceScope(this.containerRef?.nativeElement);
  }

  /**
   * Wave-2 Interaction: build the ToolManager and wire its side-effect sink to
   * the engine. Arbitration + threshold + DELIBERATE + modifier math live in the
   * ToolManager; these adapters just translate its decisions into engine calls.
   */
  private initializeToolManager(): void {
    const config = this.eng.getInteractionConfig();
    const actions: ToolActions = {
      beginNodeDrag: (_hit, down) => this.beginNodeDrag(down),
      updateNodeDrag: (current, down) => this.updateNodeDrag(current, down),
      endNodeDrag: () => this.endNodeDrag(),
      beginMarquee: (down) => this.beginMarquee(down),
      updateMarquee: (selection, current, down) => this.updateMarquee(selection, current, down),
      endMarquee: (current) => this.endMarquee(current),
    };
    this.toolManager = new ToolManager(
      (worldX, worldY) => this.hitTestForTool(worldX, worldY),
      actions,
      {
        mode: this.toToolMode(config.mode),
        dragThreshold: config.dragThreshold ?? 4,
      }
    );
  }

  // ==========================================================================
  // wave4/interaction — Cards 5-7 wiring
  // ==========================================================================

  /** Screen-px slack for an alignment snap (converted to world units per zoom). */
  private static readonly SNAP_PX = 6;

  /** The vertex handle a pointer went down on (a click with no drag removes it). */
  private pendingVertexHandle: ToolHandle | null = null;

  /**
   * Bring the framework-agnostic controllers up on the current engine.
   *
   * This is also where `InteractionConfig.snapToPortRadius` finally gets CONSUMED:
   * it has been in the config (and in the config panel's UI) since the first
   * interaction phase with no reader anywhere in the codebase.
   */
  private initializeWave4Controllers(): void {
    if (!this.eng) {
      return;
    }
    this.snapController.syncWithEngineConfig(this.eng);
    this.snapController.updateConfig({
      keepInBounds: this.canvasBounds() ?? null,
      snapThreshold: DiagramCanvasComponent.SNAP_PX / Math.max(this.zoom(), 0.01),
    });
    this.highlighterController.refreshValidation(this.eng);

    this.announcementSub?.();
    this.announcementSub = this.keyboardNav.onAnnounce((announcement: Announcement) => {
      this.liveMessage = announcement.message;
      this.livePoliteness = announcement.politeness;
      this.cdr.markForCheck();
    });
  }

  /** Keep the snap slack a constant NUMBER OF SCREEN PIXELS at any zoom. */
  private syncSnapScale(): void {
    this.snapController.updateConfig({
      snapThreshold: DiagramCanvasComponent.SNAP_PX / Math.max(this.zoom(), 0.01),
    });
  }

  /**
   * Recompute the overlay geometry for the frame that was just painted: the tool
   * layer, the highlighters and the focus ring. Called from renderDiagram() so
   * the overlays can never disagree with the picture underneath them.
   */
  private updateOverlays(): void {
    if (!this.eng) {
      return;
    }

    this.toolLayer =
      this.enableSelectionTools() && !this.isDraggingNode
        ? this.selectionTools.computeLayer(this.eng, this.zoom())
        : { bounds: null, rotation: 0, center: null, nodeIds: [], linkIds: [], handles: [] };

    this.highlighters = this.highlighterController.compute(this.eng);
    this.focusRing = this.enableKeyboardNavigation()
      ? this.keyboardNav.getFocusRing(this.eng)
      : null;
  }

  /** viewBox for the world-space overlay <svg> — identical to the renderer's. */
  get overlayViewBox(): string {
    const box = this.getViewBox();
    return `${box.x} ${box.y} ${box.width} ${box.height}`;
  }

  /** Stroke width that stays 1 CSS px in a world-space overlay. */
  get overlayStroke(): number {
    return 1 / Math.max(this.zoom(), 0.01);
  }

  /** Square side of a tool handle in world units (constant on screen). */
  handleSide(handle: ToolHandle): number {
    return handle.hitRadius * 2;
  }

  /** Font size for overlay glyphs/labels, constant on screen. */
  get overlayFontSize(): number {
    return 11 / Math.max(this.zoom(), 0.01);
  }

  /** Glyph drawn inside a click-tool button. */
  toolGlyph(handle: ToolHandle): string {
    if (handle.kind === 'remove') return '✕';
    if (handle.kind === 'vertex-add') return '+';
    if (handle.kind === 'vertex-remove') return '−';
    switch (handle.action) {
      case 'connect':
        return '⇢';
      case 'clone':
        return '⧉';
      case 'fork':
        return '⑂';
      case 'delete':
        return '✕';
      default:
        return '';
    }
  }

  /** SVG transform that rotates the selection frame with a rotated node. */
  get toolFrameTransform(): string | null {
    const layer = this.toolLayer;
    if (!layer.center || !layer.rotation) return null;
    return `rotate(${layer.rotation}, ${layer.center.x}, ${layer.center.y})`;
  }

  /** Rotation transform for one highlighter box (rotated nodes). */
  highlighterTransform(h: Highlighter): string | null {
    if (!h.bounds || !h.rotation) return null;
    const cx = h.bounds.x + h.bounds.width / 2;
    const cy = h.bounds.y + h.bounds.height / 2;
    return `rotate(${h.rotation}, ${cx}, ${cy})`;
  }

  /** Polyline `points` attribute for a link highlighter / focus ring. */
  pointsAttr(points?: Point[]): string {
    return (points ?? []).map((p) => `${p.x},${p.y}`).join(' ');
  }

  /** Midpoint of a spacing segment (where its distance label is drawn). */
  spacingLabelX(segment: { x1: number; x2: number }): number {
    return (segment.x1 + segment.x2) / 2;
  }

  spacingLabelY(segment: { y1: number; y2: number }): number {
    return (segment.y1 + segment.y2) / 2;
  }

  // --- Card 5: tool-layer pointer routing ------------------------------------

  /**
   * A tool handle was pressed. Drag tools (resize / rotate / vertex) arm a
   * gesture that the mousemove/mouseup handlers drive; click tools dispatch
   * their command immediately. Every one of them is undoable.
   */
  private onToolHandleDown(handle: ToolHandle, worldX: number, worldY: number): void {
    this.pendingVertexHandle = null;

    switch (handle.kind) {
      case 'resize':
        this.syncSnapScale();
        this.selectionTools.beginResize(handle, this.eng, worldX, worldY);
        return;

      case 'rotate':
        this.selectionTools.beginRotate(handle, this.eng, worldX, worldY);
        return;

      case 'vertex-remove':
        // Drag = move the vertex; a click that never moves = remove it (the
        // no-op gesture at mouseup is what tells the two apart).
        this.pendingVertexHandle = handle;
        this.selectionTools.beginVertexDrag(handle, this.eng);
        return;

      case 'vertex-add': {
        const command = this.selectionTools.addVertexCommand(handle, this.eng);
        if (command) this.executeCommand(command);
        return;
      }

      case 'remove': {
        const command = this.selectionTools.removeSelectionCommand(this.eng);
        if (command) this.executeCommand(command);
        return;
      }

      case 'halo':
        this.onHaloAction(handle);
        return;

      case 'link-endpoint': {
        const link = handle.linkId ? this.eng.getDiagram()?.getLink(handle.linkId) : undefined;
        if (link && handle.endpoint) {
          this.interactionHandler.startLinkReconnection(
            link,
            handle.endpoint,
            worldX,
            worldY,
            this.eng
          );
          this.renderDiagram();
        }
        return;
      }
    }
  }

  /** Halo (context toolbar): connect / clone / fork / delete. */
  private onHaloAction(handle: ToolHandle): void {
    const diagram = this.eng.getDiagram();
    if (!diagram) return;

    switch (handle.action) {
      case 'connect': {
        const node = handle.nodeId ? diagram.getNode(handle.nodeId) : undefined;
        const port = node?.getPorts().find((p) => p.type === 'output' || p.type === 'bi');
        if (!node || !port) return;
        // Start the SAME connection drag a port press starts — the halo is just
        // another way in, so the drop/validation rules are automatically shared.
        const at = port.getAbsolutePosition(node.getBoundingBox());
        this.interactionHandler.startConnection(port, at.x, at.y, this.eng);
        this.scheduleRender();
        return;
      }

      case 'clone': {
        if (!handle.nodeId) return;
        const command = this.selectionTools.cloneNodeCommand(this.eng, handle.nodeId);
        if (command) this.executeCommand(command);
        return;
      }

      case 'fork': {
        if (!handle.nodeId) return;
        const command = this.selectionTools.forkNodeCommand(this.eng, handle.nodeId);
        if (command) this.executeCommand(command);
        return;
      }

      case 'delete': {
        const command = this.selectionTools.removeSelectionCommand(this.eng);
        if (command) this.executeCommand(command);
        return;
      }
    }
  }

  /** Drive the in-flight resize / rotate / vertex gesture. */
  private updateToolGesture(event: MouseEvent): void {
    const { worldX, worldY } = this.clientToWorld(event.clientX, event.clientY);
    const modifiers = {
      shift: event.shiftKey,
      alt: event.altKey,
      ctrl: event.ctrlKey,
      meta: event.metaKey,
    };

    let changed = false;
    switch (this.selectionTools.activeGesture()) {
      case 'resize':
        changed = this.selectionTools.updateResize(this.eng, worldX, worldY, modifiers, (box) =>
          this.snapBox(box, this.toolLayer.nodeIds)
        );
        break;
      case 'rotate':
        changed = this.selectionTools.updateRotate(this.eng, worldX, worldY, modifiers);
        break;
      case 'vertex':
        changed = this.selectionTools.updateVertexDrag(this.eng, worldX, worldY, (p) =>
          this.snapController.snapPointToGrid(p)
        );
        break;
    }

    if (changed) {
      const diagram = this.eng.getDiagram();
      if (diagram && this.toolLayer.nodeIds.length > 0) {
        this.recalculateLinkPathsForNodes(diagram, this.toolLayer.nodeIds);
      }
      this.renderDiagram();
      this.cdr.markForCheck();
    }
  }

  /** Commit the gesture as ONE undo step (or remove the vertex that never moved). */
  private endToolGesture(): void {
    const command = this.selectionTools.endGesture(this.eng);
    if (command) {
      this.executeCommand(command);
    } else if (this.pendingVertexHandle) {
      const remove = this.selectionTools.removeVertexCommand(this.pendingVertexHandle, this.eng);
      if (remove) this.executeCommand(remove);
    }
    this.pendingVertexHandle = null;
    this.clearGuides();
    this.scheduleRender();
    this.cdr.markForCheck();
  }

  // --- Card 6: snapping ------------------------------------------------------

  /** Snap a world box against its siblings, remembering the guides to draw. */
  private snapBox(box: Rectangle, excludeIds: string[]): Rectangle {
    if (!this.enableSnapping()) {
      return box;
    }
    const result = this.snapController.computeSnap(
      box,
      this.snapController.siblingBoxes(this.eng, excludeIds)
    );
    this.alignmentGuides = result.guides;
    this.spacingGuides = result.spacing;
    return result.box;
  }

  private clearGuides(): void {
    if (this.alignmentGuides.length || this.spacingGuides.length) {
      this.alignmentGuides = [];
      this.spacingGuides = [];
    }
    if (this.proximityCandidate) {
      this.snapController.highlightProximityTarget(this.eng, null);
      this.proximityCandidate = null;
    }
  }

  /** Map the engine's InteractionMode enum value onto the ToolManager's mode. */
  private toToolMode(mode: unknown): ToolInteractionMode {
    return (mode as string) === 'deliberate'
      ? 'deliberate'
      : (mode as string) === 'direct'
      ? 'direct'
      : 'smart';
  }

  /** Build a canonical tool pointer event from a native MouseEvent. */
  private toToolEvent(event: MouseEvent, type: ToolPointerEvent['type']): ToolPointerEvent {
    const rect = this.containerRef.nativeElement.getBoundingClientRect();
    const { worldX, worldY } = this.clientToWorld(event.clientX, event.clientY);
    return {
      type,
      worldX,
      worldY,
      screenX: event.clientX - rect.left,
      screenY: event.clientY - rect.top,
      button: event.button,
      buttons: event.buttons,
      modifiers: {
        shift: event.shiftKey,
        ctrl: event.ctrlKey,
        alt: event.altKey,
        meta: event.metaKey,
      },
    };
  }

  /**
   * Fallback hit-test for the ToolManager. The mousedown handler always passes
   * an explicit hit (it already resolves the clicked node + prior selection), so
   * this only classifies node-vs-empty for any direct ToolManager use.
   */
  private hitTestForTool(worldX: number, worldY: number): HitTestResult {
    const diagram = this.eng?.getDiagram();
    const node = diagram?.getNodeAtPosition(worldX, worldY);
    if (node) {
      return { kind: 'node', nodeId: node.id, nodeWasSelected: node.isSelected() };
    }
    return { kind: 'empty' };
  }

  // --- ToolActions: node drag ------------------------------------------------

  /** Capture the start positions of all draggable selected nodes (no mutation
   *  happens until the pointer has crossed the drag threshold). */
  private beginNodeDrag(_down: ToolPointerEvent): void {
    const diagram = this.eng.getDiagram();
    if (!diagram) return;
    this.isDraggingNode = true;
    this.syncSnapScale(); // snap slack is screen-px, so it depends on the zoom
    this.draggedNodes.clear();
    diagram.getSelectedNodes().forEach((node) => {
      if (node.isDraggable()) {
        this.draggedNodes.set(node.id, {
          startX: node.position.x,
          startY: node.position.y,
          startZ: node.position.z,
        });
      }
    });
    if (this.containerRef?.nativeElement) {
      this.containerRef.nativeElement.style.cursor = 'move';
    }
  }

  private updateNodeDrag(current: ToolPointerEvent, down: ToolPointerEvent): void {
    const diagram = this.eng.getDiagram();
    if (!diagram) return;
    // World-space delta measured from the DOWN point so there is no jump when
    // the drag finally commits at the threshold.
    let dx = current.worldX - down.worldX;
    let dy = current.worldY - down.worldY;

    // wave4/interaction (Card 6): snap the PRIMARY dragged node — alignment
    // snaplines / equal spacing / grid / keep-in-bounds — and shift the whole
    // selection by the same correction so a multi-drag keeps its shape.
    const draggedIds = Array.from(this.draggedNodes.keys());
    const primaryId = draggedIds[0];
    const primary = primaryId ? diagram.getNode(primaryId) : undefined;
    const start = primaryId ? this.draggedNodes.get(primaryId) : undefined;

    if (this.enableSnapping() && primary && start) {
      const snapped = this.snapBox(
        {
          x: start.startX + dx,
          y: start.startY + dy,
          width: primary.size.width,
          height: primary.size.height,
        },
        draggedIds
      );
      dx = snapped.x - start.startX;
      dy = snapped.y - start.startY;
    }

    this.draggedNodes.forEach((initialPos, nodeId) => {
      const node = diagram.getNode(nodeId);
      if (node) {
        node.setPosition(initialPos.startX + dx, initialPos.startY + dy);
      }
    });

    // Card 6: proximity connect — is a port of the dragged node close enough to a
    // compatible port to auto-link on drop? Highlight it so the user can see it
    // BEFORE releasing (React Flow's "drop near a node to connect" affordance).
    if (this.enableProximityConnect() && primaryId) {
      this.proximityCandidate = this.snapController.findProximityConnection(
        this.eng,
        primaryId
      );
      this.snapController.highlightProximityTarget(this.eng, this.proximityCandidate);
    }

    this.recalculateLinkPathsForNodes(diagram, draggedIds);
    this.renderDiagram();
    this.cdr.markForCheck();
  }

  /**
   * wave3/interaction: COMMIT the drag as exactly ONE undo step.
   *
   * The live drag mutated node positions directly (smooth, no command churn), so
   * by the time we get here the nodes already sit at their final positions. We
   * therefore build the command(s) from `start → current` and execute them: the
   * execute() is a no-op on the model (it re-applies the position the node is
   * already at) but it is what puts the gesture on the undo stack.
   *
   * - one node  → one MoveNodeCommand (mergeable:false, so two quick drags of the
   *   same node do NOT collapse into a single undo step inside CommandManager's
   *   500ms merge window)
   * - many nodes → ONE MacroCommand wrapping one MoveNodeCommand per node.
   *   NOTE: CommandManager.beginBatch/endBatch does NOT build an undoable batch —
   *   it just re-executes sequentially — so a MacroCommand is the only way to get
   *   multi-node drag to undo as one step.
   *
   * A gesture that ends where it started adds nothing to the history.
   */
  private endNodeDrag(): void {
    const diagram = this.eng?.getDiagram();
    const moves: Array<{ nodeId: string; from: Point; to: Point }> = [];

    if (diagram) {
      this.draggedNodes.forEach((start, nodeId) => {
        const node = diagram.getNode(nodeId);
        if (!node) return;
        const to: Point = { x: node.position.x, y: node.position.y, z: node.position.z };
        const from: Point = { x: start.startX, y: start.startY, z: start.startZ };
        if (from.x !== to.x || from.y !== to.y) {
          moves.push({ nodeId, from, to });
        }
      });
    }

    this.isDraggingNode = false;
    this.draggedNodes.clear();
    if (this.containerRef?.nativeElement) {
      this.containerRef.nativeElement.style.cursor = this.spaceKeyPressed ? 'grab' : 'default';
    }

    // wave4/interaction (Card 6): the node was dropped next to a compatible port
    // → create the link. It belongs to the SAME gesture, so it goes into the same
    // undo step as the move: one Ctrl+Z takes back both.
    const candidate = this.proximityCandidate;
    this.proximityCandidate = null;
    this.snapController.highlightProximityTarget(this.eng, null);
    this.clearGuides();

    const linkCommand =
      candidate && this.enableProximityConnect()
        ? this.snapController.buildProximityLinkCommand(candidate)
        : null;

    if (moves.length === 0 && !linkCommand) {
      return; // click, or a drag that returned to its origin → no history entry
    }

    let command: Command;
    if (moves.length === 0 && linkCommand) {
      command = linkCommand;
    } else if (moves.length === 1 && !linkCommand) {
      command = this.buildMoveCommand(moves[0]);
    } else {
      const macro = this.buildMoveMacro(moves);
      if (linkCommand) macro.addStep(linkCommand);
      command = macro;
    }

    this.executeCommand(command);
  }

  /** One node's gesture-committed move (opts out of CommandManager merging). */
  private buildMoveCommand(move: { nodeId: string; from: Point; to: Point }): MoveNodeCommand {
    return new MoveNodeCommand(move.nodeId, move.to, move.from, { mergeable: false });
  }

  /** Multi-node gesture → ONE MacroCommand = ONE undo step. */
  private buildMoveMacro(moves: Array<{ nodeId: string; from: Point; to: Point }>): MacroCommand {
    const macro = new MacroCommand(`Move ${moves.length} Nodes`);
    moves.forEach((move) => macro.addStep(this.buildMoveCommand(move)));
    return macro;
  }

  // ==========================================================================
  // wave3/interaction — Card A: transactional edits (gestures → commands)
  //
  // Everything the user does by direct manipulation now goes through the
  // engine's CommandManager, which is what makes it undoable. The commands all
  // existed; the canvas simply never invoked them.
  // ==========================================================================

  /**
   * Dispatch a command on the engine's CommandManager.
   *
   * CommandManager.execute() is async and REJECTS when canExecute() is false, so
   * every call site funnels through here: the promise is kept (tests await it)
   * and failures are logged instead of surfacing as unhandled rejections.
   */
  private executeCommand(command: Command): Promise<void> {
    const engine = this.eng;
    if (!engine) {
      return Promise.resolve();
    }

    const done = engine.commandManager
      .execute(command)
      .then(() => {
        // wave4/interaction (Cards 5+7): a command that changed the STRUCTURE
        // invalidates the validation highlighters and is worth announcing to a
        // screen reader. Pure transforms (move/resize/rotate) announce themselves
        // where the gesture happens, and can't change validity.
        if (this.isStructuralCommand(command)) {
          this.highlighterController.refreshValidation(engine);
          if (this.enableKeyboardNavigation()) {
            this.keyboardNav.announceStructure(engine, command.name);
          }
        }
        this.scheduleRender();
        this.cdr.markForCheck();
      })
      .catch((error: unknown) => {
        console.warn(`[DiagramCanvas] command "${command.name}" failed:`, error);
      });

    this.pendingCommand = done;
    return done;
  }

  /** Does this command add/remove/rewire entities (vs. just move them)? */
  private isStructuralCommand(command: Command): boolean {
    return /add|remove|delete|paste|cut|fork|duplicate|link/i.test(command.name);
  }

  /**
   * Bridge the two selection worlds before running a selection-driven command.
   *
   * The canvas selects through the MODEL (`diagram.selectNode()` →
   * `node.state.selected`, `link.state === 'selected'`) — which is what the
   * renderer draws — while CopyCommand / CutCommand / DeleteSelectionCommand read
   * the ENGINE STORE (`selectedNodes` / `selectedLinks`). Only the marquee path
   * (SelectionManager) writes the store, so a plain click-selected node was
   * invisible to the commands ("No nodes selected"). Syncing store ← model right
   * before dispatch makes every selection path work, whoever produced it.
   */
  private syncSelectionToStore(): void {
    const diagram = this.eng?.getDiagram();
    if (!diagram) return;

    const store = this.eng.getStore();
    store.set(
      'selectedNodes',
      new Set(diagram.getSelectedNodes().map((node: NodeModel) => node.id))
    );
    store.set(
      'selectedLinks',
      new Set(
        diagram
          .getLinks()
          .filter((link: any) => link.state === 'selected')
          .map((link: any) => link.id)
      )
    );
  }

  /** True when at least one node or link is selected (store-backed). */
  private hasSelection(): boolean {
    const store = this.eng.getStore();
    const nodes = (store.get('selectedNodes') as Set<string>) ?? new Set();
    const links = (store.get('selectedLinks') as Set<string>) ?? new Set();
    return nodes.size > 0 || links.size > 0;
  }

  /** Undo the last command (Ctrl/Cmd+Z). */
  undo(): Promise<void> {
    if (!this.eng?.canUndo()) {
      return Promise.resolve();
    }
    const done = this.eng
      .undo()
      .then(() => {
        this.scheduleRender();
        this.cdr.markForCheck();
      })
      .catch((error: unknown) => console.warn('[DiagramCanvas] undo failed:', error));
    this.pendingCommand = done;
    return done;
  }

  /** Redo the last undone command (Ctrl/Cmd+Shift+Z or Ctrl+Y). */
  redo(): Promise<void> {
    if (!this.eng?.canRedo()) {
      return Promise.resolve();
    }
    const done = this.eng
      .redo()
      .then(() => {
        this.scheduleRender();
        this.cdr.markForCheck();
      })
      .catch((error: unknown) => console.warn('[DiagramCanvas] redo failed:', error));
    this.pendingCommand = done;
    return done;
  }

  /** Copy the selection to the clipboard (Ctrl/Cmd+C). */
  copySelection(): Promise<void> {
    this.syncSelectionToStore();
    if (!this.hasSelection()) {
      return Promise.resolve();
    }
    const done = this.executeCommand(new CopyCommand(this.eng.clipboardManager));
    void this.writeClipboardToOS();
    return done;
  }

  /** Cut the selection: clipboard + delete, as ONE undo step (Ctrl/Cmd+X). */
  cutSelection(): Promise<void> {
    this.syncSelectionToStore();
    if (!this.hasSelection()) {
      return Promise.resolve();
    }
    const done = this.executeCommand(new CutCommand(this.eng.clipboardManager));
    void done.then(() => this.writeClipboardToOS());
    return done;
  }

  /** Delete the selection as ONE undo step (Delete / Backspace). */
  deleteSelection(): Promise<void> {
    this.syncSelectionToStore();
    if (!this.hasSelection()) {
      return Promise.resolve();
    }
    return this.executeCommand(new DeleteSelectionCommand());
  }

  /**
   * Paste the clipboard, dropping it under the cursor (Ctrl/Cmd+V).
   *
   * PasteCommand's `offset` is a DELTA added to every pasted node's stored
   * position, so "paste at the cursor" = cursor − centre of the copied bbox. With
   * no known cursor (never moved over the canvas) we fall back to a small nudge so
   * repeated pastes still stack visibly instead of landing on top of the source.
   *
   * The pasted link endpoints stay valid because PasteCommand re-ids every port
   * via remapNodePortIds() and remaps the links through that map (verified by
   * CutCommand.spec + ClipboardCommands.spec).
   */
  pasteClipboard(): Promise<void> {
    const done = this.pasteInternal();
    this.pendingCommand = done;
    return done;
  }

  private async pasteInternal(): Promise<void> {
    if (!this.eng) {
      return;
    }
    // Cross-tab paste: adopt a Grafloria payload from the OS clipboard if there is
    // one, otherwise keep whatever the in-app clipboard holds.
    await this.readClipboardFromOS();
    if (!this.eng.hasClipboardData()) {
      return;
    }
    await this.executeCommand(
      new PasteCommand(this.eng.clipboardManager, { offset: this.pasteOffset() })
    );
  }

  /** Delta that lands the clipboard's bounding-box centre under the cursor. */
  private pasteOffset(): Point {
    const data = this.eng.getClipboardData();
    if (!data || data.nodes.length === 0 || !this.lastPointerClient) {
      return { x: 20, y: 20 };
    }

    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (const node of data.nodes) {
      const { x, y } = node.position ?? { x: 0, y: 0 };
      const width = node.size?.width ?? 0;
      const height = node.size?.height ?? 0;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x + width);
      bottom = Math.max(bottom, y + height);
    }
    if (!isFinite(left) || !isFinite(top)) {
      return { x: 20, y: 20 };
    }

    const { worldX, worldY } = this.clientToWorld(
      this.lastPointerClient.x,
      this.lastPointerClient.y
    );
    return {
      x: worldX - (left + right) / 2,
      y: worldY - (top + bottom) / 2,
    };
  }

  /**
   * Nice-to-have: mirror the clipboard payload onto the OS clipboard so the
   * selection can be pasted into another tab/app. Guarded because the async
   * Clipboard API is absent in jsdom and requires a secure context + permission
   * in the browser — a rejection here must never break the in-app copy.
   */
  private async writeClipboardToOS(): Promise<void> {
    const data = this.eng?.getClipboardData();
    const clipboard = (globalThis as any)?.navigator?.clipboard;
    if (!data || !clipboard?.writeText) {
      return;
    }
    try {
      await clipboard.writeText(
        JSON.stringify({ __grafloriaClipboard: 1, ...data })
      );
    } catch {
      // Denied / insecure context / no focus — the in-app clipboard still holds it.
    }
  }

  /**
   * Nice-to-have companion of {@link writeClipboardToOS}: adopt a Grafloria payload
   * pasted from another tab. Returns true when the OS clipboard replaced the
   * in-app one, false when there is nothing usable (so paste falls back to it).
   */
  private async readClipboardFromOS(): Promise<boolean> {
    const clipboard = (globalThis as any)?.navigator?.clipboard;
    if (!clipboard?.readText) {
      return false;
    }
    try {
      const text = await clipboard.readText();
      if (!text) return false;
      const parsed = JSON.parse(text);
      if (!parsed || parsed.__grafloriaClipboard !== 1 || !Array.isArray(parsed.nodes)) {
        return false;
      }
      if (parsed.nodes.length === 0) {
        return false;
      }

      // Rehydrate through the models and re-copy: ClipboardManager.copy() is the
      // only public way in, and it re-serializes what we hand it — so the payload
      // lands in exactly the shape PasteCommand expects.
      this.eng.clipboardManager.copy({
        nodes: parsed.nodes.map((n: any) => NodeModel.fromJSON(n)),
        links: (Array.isArray(parsed.links) ? parsed.links : []).map((l: any) =>
          LinkModel.fromJSON(l)
        ),
        groups: (Array.isArray(parsed.groups) ? parsed.groups : []).map((g: any) =>
          GroupModel.fromJSON(g)
        ),
        sourceDiagramId: parsed.sourceDiagramId,
      });
      return true;
    } catch {
      return false;
    }
  }

  // --- ToolActions: marquee --------------------------------------------------

  private beginMarquee(down: ToolPointerEvent): void {
    // Snapshot the selection so modifier combine modes are idempotent per move.
    const store = this.eng.getStore();
    const current = (store.get('selectedNodes') as Set<string>) ?? new Set<string>();
    this.marqueeBaseSelection = new Set(current);
    this.lastMarqueeSelectAt = 0;
    this.marquee.set({ x: down.screenX, y: down.screenY, width: 0, height: 0 });
    this.cdr.markForCheck();
  }

  private updateMarquee(
    selection: MarqueeSelection,
    current: ToolPointerEvent,
    down: ToolPointerEvent
  ): void {
    // Remember the latest payload even when the sweep is throttled, so end can
    // finalize with the TRUE last rectangle rather than the last applied one.
    this.lastMarquee = selection;

    // Overlay follows the pointer every frame (cheap).
    this.marquee.set({
      x: Math.min(down.screenX, current.screenX),
      y: Math.min(down.screenY, current.screenY),
      width: Math.abs(current.screenX - down.screenX),
      height: Math.abs(current.screenY - down.screenY),
    });

    // Throttle the (potentially expensive) selection sweep. Scale the interval
    // with diagram size so huge diagrams don't re-select-all on every mousemove.
    const nodeCount = this.eng.getDiagram()?.getNodes().length ?? 0;
    const throttleMs = nodeCount > 400 ? 60 : nodeCount > 100 ? 30 : 0;
    const now = Date.now();
    if (now - this.lastMarqueeSelectAt >= throttleMs) {
      this.applyMarqueeSelection(selection);
      this.lastMarqueeSelectAt = now;
    }
    this.cdr.markForCheck();
  }

  private endMarquee(_current: ToolPointerEvent): void {
    // Always finalize with the last rectangle (in case the tail move was throttled).
    if (this.marquee()) {
      const diagram = this.eng.getDiagram();
      if (diagram && this.lastMarquee) {
        this.applyMarqueeSelection(this.lastMarquee);
      }
      // wave4/interaction (Card 7): a screen-reader user must learn what a
      // rubber-band sweep actually selected.
      if (this.enableKeyboardNavigation()) {
        this.keyboardNav.announceSelection(this.eng);
      }
    }
    this.marquee.set(null);
    this.lastMarquee = null;
    this.marqueeBaseSelection = null;
    this.renderDiagram();
    this.cdr.markForCheck();
  }

  /** Last marquee selection payload — remembered so end can re-apply it. */
  private lastMarquee: MarqueeSelection | null = null;

  private applyMarqueeSelection(selection: MarqueeSelection): void {
    this.lastMarquee = selection;
    // Restore the pre-marquee selection so add/subtract/toggle recompute from a
    // stable base rather than compounding across moves.
    if (this.marqueeBaseSelection) {
      this.eng.getStore().set('selectedNodes', new Set(this.marqueeBaseSelection));
    }
    this.eng.selectionManager.selectInRectangle(selection.rect, {
      intersectionMode: selection.intersectionMode,
      mode: selection.selectionMode,
    });
    this.renderDiagram();
  }

  /**
   * Update HTML layer transform to sync with viewport (Phase 1: Hybrid Rendering)
   * The HTML layer uses CSS transform to match the SVG viewport pan/zoom
   * This keeps HTML nodes visually aligned with SVG edges
   */
  private updateHTMLLayerTransform(): void {
    // wave3/interaction: the HTML layer must implement the SAME world→screen map
    // as the SVG viewBox, or HTML/foreignObject nodes drift away from the SVG
    // edges at any zoom ≠ 1:
    //
    //     screen = (world − viewBox.origin) · zoom
    //
    // The layer has transform-origin 0 0 and its children are positioned at their
    // WORLD coordinates (see getNodeX/getNodeY), so `scale(zoom)` contributes the
    // ·zoom and the translate contributes the −origin·zoom. Translating by
    // viewport.x/y (as before) only matches the viewBox origin at zoom 1 — that
    // was the desync.
    const viewBox = this.getViewBox();
    const translateX = -viewBox.x * this.zoom();
    const translateY = -viewBox.y * this.zoom();

    this.htmlLayerTransform.set(`translate(${translateX}px, ${translateY}px) scale(${this.zoom()})`);
  }

  /**
   * Render HTML nodes to HTML layer (Phase 2: Hybrid Rendering)
   * This method renders nodes with metadata.useHTMLLayer = true as HTML elements
   * outside the SVG canvas, similar to React Flow's approach
   *
   * Component Lifecycle:
   * 1. Detect nodes marked for HTML layer (metadata.useHTMLLayer = true)
   * 2. Create new component instances for new nodes
   * 3. Update existing components for changed nodes
   * 4. Destroy components for removed nodes
   * 5. Position all components based on node.position (accounting for zoom)
   */
  /**
   * Update HTML nodes array for declarative rendering (React Flow pattern)
   * Phase 3: REFACTORED to use Angular's declarative rendering instead of imperative createComponent
   *
   * PERFORMANCE FIX: Only update array when nodes actually change (add/remove)
   * Don't recreate array on every render cycle (mousemove)
   */
  private renderHTMLNodes(): void {
    const diagram = this.eng?.getDiagram();
    if (!diagram) {
      if (this.htmlNodes().length > 0) {
        this.htmlNodes.set([]);
      }
      return;
    }

    // Get all nodes AND groups that should render in HTML layer
    const nodes = diagram.getNodes();
    const groups = diagram.getGroups();

    // Combine nodes and groups, filtering for HTML layer rendering
    const htmlNodeModels = nodes.filter(node => node.getMetadata('useHTMLLayer') === true);
    const htmlGroupModels = groups.filter(group => group.getMetadata('useHTMLLayer') === true);
    const newHtmlNodes = [...htmlNodeModels, ...htmlGroupModels];

    // CRITICAL FIX: Always create new array reference to ensure template re-render
    // This allows data changes (like selection state) to trigger re-render
    // Note: We create a shallow copy with spread operator to maintain node references
    // but signal Angular that the array has changed
    this.htmlNodes.set([...newHtmlNodes]);

    // No need for imperative component management - Angular template handles it with @for
  }

  /**
   * Create a new HTML node component (Phase 2)
   */
  private createHTMLNode(node: any): void {
    if (!this.htmlLayerRef || !this.componentRenderer.hasComponent(node.type)) {
      // Component not registered for this node type - skip silently
      // (This is expected for nodes that haven't been migrated to HTML layer yet)
      return;
    }

    try {
      // Get component class
      const componentClass = this.componentRenderer.getRegisteredComponent(node.type);
      if (!componentClass) {
        return;
      }

      // CRITICAL FIX: Create component WITHOUT specifying hostElement
      // Let Angular create its own host element, then we append it
      const componentRef = createComponent(componentClass, {
        environmentInjector: this.environmentInjector,
        // Do NOT pass hostElement here - it causes component reuse issues
      });

      // Get the host element that Angular created
      const hostElement = componentRef.location.nativeElement as HTMLElement;

      // Set node ID attribute for handle detection
      hostElement.setAttribute('data-node-id', node.id);
      hostElement.style.position = 'absolute';

      // Set initial inputs (if component has them)
      if ('node' in componentRef.instance) {
        componentRef.instance.node = node;
      }

      // Position the component
      this.updateHTMLNodePosition(node, componentRef);

      // Store component reference BEFORE appending
      this.htmlNodeComponents.set(node.id, componentRef);

      // Append to HTML layer - this is where it actually gets added to the DOM
      this.htmlLayerRef.nativeElement.appendChild(hostElement);

      // Trigger change detection
      componentRef.changeDetectorRef.detectChanges();
    } catch (error) {
      console.error(`❌ [HTMLLayer] Failed to create component for node "${node.id}":`, error);
    }
  }

  /**
   * Update HTML node component position (Phase 2)
   * Position is relative to HTML layer (which is already transformed)
   * so we just use node.position directly
   */
  private updateHTMLNodePosition(node: any, componentRef: ComponentRef<any>): void {
    const hostElement = componentRef.location.nativeElement as HTMLElement;
    const position = node.position || { x: 0, y: 0 };

    // Position is already in world coordinates, HTML layer transform handles zoom/pan
    hostElement.style.left = `${position.x}px`;
    hostElement.style.top = `${position.y}px`;
  }

  /**
   * wave2/rendering: the ONE coalescing entry point for every re-render.
   *
   * Marks the canvas dirty and queues a SINGLE requestAnimationFrame. Any
   * number of scheduleRender() calls in the same tick collapse into one frame,
   * so a burst of engine events (node:changed ×N, a drag's mousemoves, several
   * @Input changes in one ngOnChanges) paints exactly once. Every former
   * synchronous renderDiagram() call site now routes through here.
   */
  scheduleRender(): void {
    // wave4/ngwrapper: signal EFFECTS now drive invalidation, and they can run
    // before the view exists (inputs are set before ngAfterViewInit). There is
    // nothing to paint yet — and queueing a frame here would leave `rafHandle`
    // armed, so the FIRST real invalidation would coalesce into a frame that
    // predates the layers. ngAfterViewInit paints the mount frame synchronously.
    if (this.destroyed || !this.viewReady) {
      return;
    }
    this.renderDirty = true;
    if (this.rafHandle !== null) {
      return; // a frame is already queued for this tick → coalesce into it
    }
    this.rafHandle = requestAnimationFrame(() => {
      this.rafHandle = null;
      if (this.destroyed) {
        return;
      }
      // Nothing asked for a paint (e.g. a synchronous flush already ran).
      if (!this.renderDirty) {
        return;
      }
      // Idle-skip: something scheduled a frame but nothing visible changed.
      if (this.canSkipFrame()) {
        this.renderDirty = false;
        return;
      }
      this.renderNow();
    });
  }

  /**
   * wave2/rendering: render immediately (no rAF): paint, run change detection,
   * record the frame in the metrics ring buffers and clear the dirty flag.
   * Used for the synchronous mount paint and as the body of each queued frame.
   */
  private renderNow(): void {
    if (!this.renderer || !this.containerRef || this.destroyed) {
      this.renderDirty = false;
      return;
    }

    const start = this.now();
    this.renderDiagram();
    this.cdr.detectChanges();
    const end = this.now();

    // Clear dirty + snapshot what we drew so the next frame can idle-skip.
    this.renderDirty = false;
    this.lastRenderedViewportKey = this.viewportKey();
    this.lastFrameHadConnectionPreview = this.isConnectionPreviewActive();

    // Real metrics: one sample per ACTUALLY-rendered frame (skips add nothing).
    const duration = end - start;
    if (duration > DiagramCanvasComponent.DROPPED_FRAME_MS) {
      this.droppedFrameCount++;
    }
    this.frameTimestamps.push(end);
    this.frameDurations.push(duration);
    if (this.frameTimestamps.length > DiagramCanvasComponent.FRAME_HISTORY) {
      this.frameTimestamps.shift();
    }
    if (this.frameDurations.length > DiagramCanvasComponent.FRAME_HISTORY) {
      this.frameDurations.shift();
    }
  }

  /**
   * wave2/rendering: real render-loop metrics, computed from the ring buffers
   * (replaces any hardcoded/estimated FPS).
   * - fps:          rolling frames-per-second across the last N painted frames
   * - frameTime:    average render duration (ms) over the same window
   * - droppedFrames: cumulative frames whose render blew the ~60fps budget
   * - sampleCount:  number of frames currently in the window
   */
  getPerformanceMetrics(): {
    fps: number;
    frameTime: number;
    droppedFrames: number;
    sampleCount: number;
  } {
    const ts = this.frameTimestamps;
    let fps = 0;
    if (ts.length >= 2) {
      const span = ts[ts.length - 1] - ts[0];
      if (span > 0) {
        fps = ((ts.length - 1) / span) * 1000;
      }
    }
    const durs = this.frameDurations;
    const frameTime =
      durs.length > 0 ? durs.reduce((a, b) => a + b, 0) / durs.length : 0;

    return {
      fps: Math.round(fps * 10) / 10,
      frameTime: Math.round(frameTime * 100) / 100,
      droppedFrames: this.droppedFrameCount,
      sampleCount: durs.length,
    };
  }

  /** Monotonic-ish clock, falling back to Date.now() where performance is absent. */
  private now(): number {
    return typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  }

  /** Stable key for the current viewport + zoom (idle-skip comparison). */
  private viewportKey(): string {
    const v = this.viewport();
    return `${v.x},${v.y},${v.width},${v.height}@${this.zoom()}`;
  }

  /** True while the engine is dragging out a new connection (preview line). */
  private isConnectionPreviewActive(): boolean {
    try {
      return (
        this.eng?.getConnectionStateManager?.().getState?.().isConnecting === true
      );
    } catch {
      return false;
    }
  }

  /**
   * wave2/rendering idle-skip: a queued frame may be dropped only when nothing
   * visible could have changed — no dirty entities, an unchanged viewport/zoom,
   * and no connection preview this frame or last. The connection preview lives
   * in interaction state (not entity dirty flags), so we never skip while it is
   * (or just was) active, otherwise its removal wouldn't repaint.
   */
  private canSkipFrame(): boolean {
    const diagram = this.eng?.getDiagram();
    if (!diagram) {
      return false; // no diagram snapshot yet → let the frame render
    }
    const dirtyEntities =
      diagram.getDirtyNodes().length +
      diagram.getDirtyLinks().length +
      diagram.getDirtyGroups().length;
    if (dirtyEntities > 0) {
      return false;
    }
    if (this.viewportKey() !== this.lastRenderedViewportKey) {
      return false; // pan / zoom changed
    }
    if (this.isConnectionPreviewActive() || this.lastFrameHadConnectionPreview) {
      return false;
    }
    return true;
  }

  /**
   * Render diagram to DOM
   * Phase 1: Updated to support hybrid HTML+SVG rendering
   */
  private renderDiagram(): void {
    if (!this.renderer || !this.containerRef || this.destroyed) {
      return;
    }

    // Phase 1: Update HTML layer transform FIRST (before rendering)
    // This ensures HTML nodes stay in sync with viewport changes
    this.updateHTMLLayerTransform();

    // Calculate actual viewport dimensions based on canvas size and zoom
    const actualViewport = this.calculateActualViewport();

    // Generate VNode tree using SVGRenderer (edges, pure SVG nodes, ports)
    const vnode = this.renderer.render(actualViewport, this.zoom());

    // Render SVG content to svgLayer div (Phase 1: changed from containerRef)
    if (this.svgLayerRef) {
      this.vnodeRenderer.render(vnode, this.svgLayerRef.nativeElement);
    }

    // Phase 1: Render HTML nodes to htmlLayer div
    // This renders nodes with metadata.useHTMLLayer = true
    this.renderHTMLNodes();

    // Wave 3 (Edges & links): re-pick the edge-toolbar target from the state
    // this frame was drawn with (hover/selection changes come through here).
    this.updateLinkToolbarTarget();

    // wave4/interaction (Cards 5-7): recompute the floating tool layer, the
    // highlighters and the focus ring from the SAME state this frame drew, so an
    // overlay can never lag the picture underneath it by a frame.
    this.updateOverlays();
  }

  // ==========================================================================
  // wave3/interaction — Card B: ONE viewport convention, shared by the SVG
  // viewBox, the HTML layer and every hit-test.
  //
  // CONVENTION (fixed by SVGRenderer.render(), which is the renderer's contract):
  //   Given the rect handed to the renderer — `x/y` = world position of the
  //   canvas' top-left AT ZOOM 1, `width/height` = the canvas size in CSS px —
  //   the renderer builds a CENTER-ANCHORED viewBox:
  //
  //     centre  = (x + w/2, y + h/2)                 ← invariant under zoom
  //     size    = (w/zoom, h/zoom)
  //     origin  = centre − size/2
  //
  //   The <svg> fills the container (CSS 100%), so the on-screen scale is
  //   canvasPx / viewBoxSize = zoom, giving the two maps everything else uses:
  //
  //     screen = (world − origin) · zoom
  //     world  = centre + (screen − canvasCentre) / zoom      ← clientToWorld
  //
  // The renderer divides by zoom ITSELF, so calculateActualViewport() must hand it
  // the canvas PIXEL size. It used to pass px/zoom, so the renderer divided twice:
  // the drawn scale was zoom² while hit-testing assumed zoom, and the HTML layer
  // assumed a top-left anchor — three different mappings that only agreed at
  // zoom 1. That is why zoom "drifted" and HTML nodes desynced.
  // ==========================================================================

  /** Canvas size in CSS px (falls back to the declared viewport when unlaid-out, e.g. jsdom). */
  private canvasPixelSize(): { width: number; height: number } {
    const container = this.containerRef?.nativeElement;
    const rect = container?.getBoundingClientRect();
    return {
      width: rect?.width || this.viewport().width,
      height: rect?.height || this.viewport().height,
    };
  }

  /**
   * The world-space rect actually visible right now — i.e. exactly the viewBox
   * SVGRenderer will emit for the current viewport + zoom. The single source of
   * truth for clientToWorld(), the HTML layer transform and the zoom anchor.
   */
  private getViewBox(): Rectangle {
    const { width: pxW, height: pxH } = this.canvasPixelSize();
    const centreX = this.viewport().x + pxW / 2;
    const centreY = this.viewport().y + pxH / 2;
    const width = pxW / this.zoom();
    const height = pxH / this.zoom();
    return {
      x: centreX - width / 2,
      y: centreY - height / 2,
      width,
      height,
    };
  }

  /**
   * Rect handed to SVGRenderer.render(): world origin + the canvas PIXEL size.
   * The renderer re-derives the center-anchored viewBox from it (dividing by zoom
   * itself), so this must NOT be pre-divided — see the convention block above.
   */
  private calculateActualViewport(): Rectangle {
    const { width, height } = this.canvasPixelSize();
    return {
      x: this.viewport().x,
      y: this.viewport().y,
      width,
      height,
    };
  }

  /**
   * Subscribe to engine events to trigger re-renders
   */
  private subscribeToEngineEvents(): void {
    const engine = this.eng;
    if (!engine) {
      return;
    }

    // CRITICAL FIX: Subscribe to diagram:changed event
    // This ensures we re-subscribe and re-render when the diagram is swapped
    const eventBus = engine['eventBus']; // Access private eventBus
    if (eventBus) {
      this.engineSubscriptions.push(
        eventBus.on(
          'diagram:changed',
          ({ newDiagram }: { oldDiagram: DiagramModel | null; newDiagram: DiagramModel | null }) => {
            // Re-subscribe to the new diagram's events
            this.subscribeToDiagramEvents(newDiagram);
            // The capture is bound to a specific diagram — rebind it too.
            this.capture?.stop();
            this.capture = newDiagram ? beginIncrementalCapture(newDiagram) : null;
            // Re-render with the new diagram
            this.scheduleRender();
            this.cdr.markForCheck();
          }
        )
      );

      // Subscribe to interaction config changes
      this.engineSubscriptions.push(
        eventBus.on('config:interaction-changed', () => {
          // Sync editor configs (handle colors, etc.) with engine config
          this.interactionHandler.syncWithEngineConfig(engine);
          // Wave-2 Interaction: keep the ToolManager's mode + threshold in sync.
          if (this.toolManager) {
            const cfg = engine.getInteractionConfig();
            this.toolManager.setConfig({
              mode: this.toToolMode(cfg.mode),
              dragThreshold: cfg.dragThreshold ?? 4,
            });
          }
          this.scheduleRender();
          this.cdr.markForCheck();
        })
      );
    }

    // Subscribe to the current diagram's events
    this.subscribeToDiagramEvents(engine.getDiagram());
  }

  /**
   * Subscribe to diagram events.
   *
   * Every one of these means "the model changed": repaint, and (Card 2) tell the
   * host — unless the change is one the host itself just pushed in.
   *
   * wave4/ngwrapper: these are now UNSUBSCRIBED on engine swap / destroy. They used
   * to leak — swapping `[engine]` re-subscribed to the new engine while the old
   * handlers stayed live on the old one, and a destroyed canvas kept running change
   * detection off engine events.
   */
  private subscribeToDiagramEvents(diagram: DiagramModel | null): void {
    if (!diagram) {
      return;
    }

    const onMutation = () => this.onModelMutated();
    for (const event of [
      'node:added',
      'node:removed',
      'node:changed',
      'node:moved',
      'node:resized',
      'link:added',
      'link:removed',
      'link:changed',
    ] as const) {
      this.engineSubscriptions.push(diagram.on(event, onMutation));
    }
  }

  /**
   * Handle keydown for pan mode (Space key) - This is now merged with the other onKeyDown handler below
   * Kept as a comment for reference
   */
  // This method is merged with the onKeyDown method that handles Delete/Escape/Ctrl+A

  /**
   * Handle keyup to exit pan mode (Space key)
   */
  @HostListener('window:keyup', ['$event'])
  onKeyUp(event: KeyboardEvent): void {
    if (event.code === 'Space') {
      this.spaceKeyPressed = false;
      this.isPanning = false;
      // Reset cursor
      if (this.containerRef?.nativeElement) {
        this.containerRef.nativeElement.style.cursor = 'default';
      }
    }
  }

  /**
   * Wheel: ctrl/⌘ (and trackpad pinch, which the browser reports as ctrl+wheel)
   * ZOOMS at the cursor; a plain wheel SCROLLS the canvas (shift → horizontal).
   * This is the Figma/Miro/VS Code convention — the previous behaviour zoomed on
   * every wheel event around the viewport CENTRE, which is the "feels wrong"
   * competitors were compared against.
   */
  @HostListener('wheel', ['$event'])
  onWheel(event: WheelEvent): void {
    if (!this.eng || !this.eng.getDiagram()) {
      return;
    }

    const wantsZoom = event.ctrlKey || event.metaKey;

    if (wantsZoom) {
      if (!this.enableMouseWheelZoom()) {
        return;
      }
      event.preventDefault();

      // Multiplicative steps: a wheel notch is a constant RELATIVE change, so a
      // step feels the same at 0.2× and at 3× (a linear ±sensitivity does not).
      const factor = 1 + this.zoomSensitivity();
      const target = event.deltaY > 0 ? this.zoom() / factor : this.zoom() * factor;
      this.zoomAtClient(target, event.clientX, event.clientY);
      return;
    }

    // Scroll-to-pan.
    if (!this.enablePan()) {
      return;
    }
    event.preventDefault();
    const [dxPx, dyPx] = event.shiftKey
      ? [event.deltaY || event.deltaX, 0] // shift → horizontal scroll
      : [event.deltaX, event.deltaY];
    this.panByScreen(dxPx, dyPx);
  }

  // ==========================================================================
  // wave3/interaction — Card B: zoom + pan API (cursor-anchored)
  // ==========================================================================

  /**
   * Zoom to `targetZoom` keeping the world point under (clientX, clientY) pinned
   * to that same screen pixel.
   *
   * DERIVATION against the center-anchored convention (see the block above
   * calculateActualViewport). With `s` the cursor's screen offset from the canvas'
   * LEFT edge, `W` the canvas px width and `c = viewport.x + W/2` the world-space
   * centre (which is what the viewBox is anchored on):
   *
   *     world(s) = c + (s − W/2) / zoom
   *
   * Pinning world(s) across z0 → z1 means solving for the new centre c₁:
   *
   *     c₁ = world − (s − W/2) / z₁
   *   ⇒ viewport.x₁ = world − (s − W/2)/z₁ − W/2
   *
   * (`W` does not change with zoom, so the centre is the only free variable.)
   * Zooming at the exact canvas centre leaves viewport.x/y untouched — which is
   * precisely the old behaviour, now a special case rather than the only one.
   */
  zoomAtClient(targetZoom: number, clientX: number, clientY: number): void {
    const diagram = this.eng?.getDiagram();
    if (!diagram) {
      return;
    }

    const newZoom = this.clampZoom(targetZoom);
    if (newZoom === this.zoom()) {
      return;
    }

    // The world point under the cursor BEFORE the zoom — the thing we pin.
    const { worldX, worldY } = this.clientToWorld(clientX, clientY);
    const { screenX, screenY } = this.clientToScreen(clientX, clientY);
    const { width: pxW, height: pxH } = this.canvasPixelSize();

    this.zoom.set(newZoom);

    this.setViewportOrigin(
      worldX - (screenX - pxW / 2) / newZoom - pxW / 2,
      worldY - (screenY - pxH / 2) / newZoom - pxH / 2
    );

    diagram.setZoom(newZoom);
    this.zoomChanged.emit(newZoom);
    this.emitViewportChanged();

    this.scheduleRender();
    this.cdr.markForCheck();
  }

  /** Zoom keeping the canvas centre fixed (keyboard zoom, toolbar buttons). */
  zoomBy(factor: number): void {
    const { width, height } = this.canvasPixelSize();
    const rect = this.containerRef?.nativeElement?.getBoundingClientRect();
    this.zoomAtClient(
      this.zoom() * factor,
      (rect?.left ?? 0) + width / 2,
      (rect?.top ?? 0) + height / 2
    );
  }

  /** Ctrl/⌘ + '=' */
  zoomIn(): void {
    this.zoomBy(1 + this.zoomSensitivity());
  }

  /** Ctrl/⌘ + '-' */
  zoomOut(): void {
    this.zoomBy(1 / (1 + this.zoomSensitivity()));
  }

  /** Ctrl/⌘ + '0' — back to 100%, canvas centre unchanged. */
  resetZoom(): void {
    this.zoomBy(1 / this.zoom());
  }

  /**
   * Fit every node in the diagram into view (Shift+1).
   * Picks the largest zoom (within [minZoom, maxZoom]) at which the content's
   * bounding box fits inside the canvas with `padding` screen px to spare, then
   * centres the viewport on that box.
   */
  fitToContent(padding = 40): void {
    const diagram = this.eng?.getDiagram();
    if (!diagram) return;
    this.fitBounds(this.boundsOf(diagram.getNodes()), padding);
  }

  /** Fit the CURRENT SELECTION into view (Shift+2); falls back to everything. */
  zoomToSelection(padding = 40): void {
    const diagram = this.eng?.getDiagram();
    if (!diagram) return;
    const selected = diagram.getSelectedNodes();
    this.fitBounds(
      this.boundsOf(selected.length > 0 ? selected : diagram.getNodes()),
      padding
    );
  }

  /** World bounding box of a set of nodes (null when there is nothing to fit). */
  private boundsOf(
    nodes: NodeModel[]
  ): { left: number; top: number; right: number; bottom: number } | null {
    if (!nodes || nodes.length === 0) {
      return null;
    }
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;

    for (const node of nodes) {
      if (node.state?.visible === false) continue;
      const x = this.getAbsoluteX(node);
      const y = this.getAbsoluteY(node);
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x + (node.size?.width ?? 0));
      bottom = Math.max(bottom, y + (node.size?.height ?? 0));
    }

    return isFinite(left) && isFinite(top) ? { left, top, right, bottom } : null;
  }

  /** Centre + scale the viewport on a world box, honouring the zoom clamp. */
  private fitBounds(
    bounds: { left: number; top: number; right: number; bottom: number } | null,
    padding: number
  ): void {
    const diagram = this.eng?.getDiagram();
    if (!diagram || !bounds) {
      return;
    }

    const { width: pxW, height: pxH } = this.canvasPixelSize();
    const boxWidth = Math.max(bounds.right - bounds.left, 1);
    const boxHeight = Math.max(bounds.bottom - bounds.top, 1);

    // Available screen px after padding, converted into a scale: at zoom z the box
    // occupies boxWidth·z px, and it must fit in (pxW − 2·padding).
    const availableW = Math.max(pxW - padding * 2, 1);
    const availableH = Math.max(pxH - padding * 2, 1);
    const newZoom = this.clampZoom(Math.min(availableW / boxWidth, availableH / boxHeight));

    this.zoom.set(newZoom);

    // Centre the viewport on the box: the visible world rect is centred on
    // (viewport.x + pxW/2, viewport.y + pxH/2), so put THAT at the box centre.
    this.setViewportOrigin(
      (bounds.left + bounds.right) / 2 - pxW / 2,
      (bounds.top + bounds.bottom) / 2 - pxH / 2
    );

    diagram.setZoom(newZoom);
    this.zoomChanged.emit(newZoom);
    this.emitViewportChanged();

    this.scheduleRender();
    this.cdr.markForCheck();
  }

  /** Pan by a SCREEN-px delta (wheel scroll); world delta = px / zoom. */
  private panByScreen(dxPx: number, dyPx: number): void {
    if (!dxPx && !dyPx) {
      return;
    }
    const diagram = this.eng?.getDiagram();
    if (!diagram) return;

    const dx = dxPx / this.zoom();
    const dy = dyPx / this.zoom();

    this.setViewportOrigin(this.viewport().x + dx, this.viewport().y + dy);
    diagram.pan(dx, dy);
    this.emitViewportChanged();

    this.scheduleRender();
    this.cdr.markForCheck();
  }

  /** Move the viewport origin, keeping the object identity churn in one place. */
  private setViewportOrigin(x: number, y: number): void {
    this.viewport.set({ ...this.viewport(), x, y });
  }

  private clampZoom(zoom: number): number {
    return Math.max(this.minZoom(), Math.min(this.maxZoom(), zoom));
  }

  /**
   * Emit the world rect currently VISIBLE (i.e. the SVG viewBox). Previously this
   * emitted the raw renderer input, whose origin was the un-zoomed viewport corner
   * — not a rect the host could actually use for a minimap/overview.
   */
  private emitViewportChanged(): void {
    this.viewportChanged.emit(this.getViewBox());
  }

  /**
   * Handle mouse down for panning and node selection (Phase 0.5 - Option B + Option 1)
   * Supports:
   * - Left click: Select/drag nodes
   * - Ctrl + Left click: Multi-select
   * - Middle mouse button: Pan
   * - Space + Left click: Pan
   */
  @HostListener('mousedown', ['$event'])
  onMouseDown(event: MouseEvent): void {
    if (!this.eng) {
      return;
    }

    const diagram = this.eng.getDiagram();
    if (!diagram) {
      return;
    }

    // Middle mouse button (button === 1) for panning
    // OR left mouse button (button === 0) while Space key is pressed
    if (event.button === 1 || (event.button === 0 && this.spaceKeyPressed)) {
      if (!this.enablePan()) {
        return;
      }

      event.preventDefault();
      this.isPanning = true;
      this.lastPanX = event.clientX;
      this.lastPanY = event.clientY;

      // Change cursor to grabbing when panning starts
      if (this.containerRef?.nativeElement) {
        this.containerRef.nativeElement.style.cursor = 'grabbing';
      }
      return;
    }

    // Left mouse button for node interaction
    if (event.button === 0 && !this.spaceKeyPressed) {
      // Convert client coordinates to world coordinates
      const { worldX, worldY } = this.clientToWorld(event.clientX, event.clientY);

      // wave4/interaction (Card 5): the floating tool layer is drawn ON TOP of
      // everything, so it gets the first look at the press — otherwise a resize
      // handle sitting over a port would start a connection instead of a resize.
      if (this.enableSelectionTools()) {
        const toolHit = this.selectionTools.hitTest(this.toolLayer, worldX, worldY);
        if (toolHit) {
          event.preventDefault();
          this.onToolHandleDown(toolHit, worldX, worldY);
          this.cdr.markForCheck();
          return;
        }
      }

      // Phase 3: Check for HTML handle click (Phase 2 integration - HIGHEST PRIORITY)
      // HTML handles need to be checked before SVG ports
      console.log('🔍 [Phase 3 Debug] Checking for HTML handle at:', {
        clientX: event.clientX,
        clientY: event.clientY,
        zoom: this.zoom(),
        handleStats: this.handleRegistry.getStats()
      });

      const htmlHandleHit = this.handleRegistry.getHandleAtPoint(event.clientX, event.clientY, this.zoom());

      console.log('🔍 [Phase 3 Debug] Handle detection result:', htmlHandleHit);

      if (htmlHandleHit) {
        event.preventDefault();
        console.log('🧪 [Phase 3] HTML Handle clicked:', {
          nodeId: htmlHandleHit.nodeId,
          handleId: htmlHandleHit.handleId,
          type: htmlHandleHit.handle.type,
          position: htmlHandleHit.handle.position
        });

        // Create a temporary PortModel to work with existing connection system
        const tempPort = this.createTempPortFromHandle(htmlHandleHit, worldX, worldY);
        if (tempPort) {
          this.interactionHandler.startConnection(tempPort, worldX, worldY, this.eng);
          this.scheduleRender();
          this.cdr.markForCheck();
        }
        return;
      }

      // CRITICAL FIX: Get the current interaction state (from last mousemove)
      // We rely on mousemove to have already updated hover states
      const interactionState = this.interactionHandler.getState();

      // Phase 3: Check for SVG port click
      if (interactionState.hoveredPort) {
        event.preventDefault();
        this.interactionHandler.startConnection(interactionState.hoveredPort, worldX, worldY, this.eng);
        this.scheduleRender();
        this.cdr.markForCheck();
        return;
      }

      // Phase 2.3b: Check for control point click (if control point editing enabled)
      const config = this.eng.getInteractionConfig();
      if (config.enableControlPointEditing) {
        // CRITICAL FIX: Check for control point clicks on ALL selected links, not just hovered link
        // Control point handles are separate SVG circles, so clicking them doesn't register as hovering over the link path
        // We need to check all selected links to see if any control point was clicked
        const selectedLinks = diagram.getLinks().filter((link: any) => link.state === 'selected');

        for (const selectedLink of selectedLinks) {
          const controlPointHit = this.interactionHandler.hitTestControlPoint(worldX, worldY, selectedLink);

          if (controlPointHit) {
            event.preventDefault();
            console.log('🟢 Control point handle clicked:', controlPointHit.controlType, 'of segment', controlPointHit.segmentIndex, 'on link', selectedLink.id);
            this.interactionHandler.startControlPointDrag(controlPointHit.segmentIndex, controlPointHit.controlType, selectedLink);
            this.cdr.markForCheck();
            return;
          }
        }
      }

      // Phase 2.3a: Check for waypoint click (if waypoint editing enabled)
      if (config.enableWaypointEditing) {
        // CRITICAL FIX: Check for waypoint clicks on ALL selected links, not just hovered link
        // Waypoint handles are separate SVG circles, so clicking them doesn't register as hovering over the link path
        // We need to check all selected links to see if any waypoint was clicked
        const selectedLinks = diagram.getLinks().filter((link: any) => link.state === 'selected');

        for (const selectedLink of selectedLinks) {
          const waypointIndex = this.interactionHandler.hitTestWaypoint(worldX, worldY, selectedLink);

          if (waypointIndex !== null) {
            event.preventDefault();
            console.log('🔵 Waypoint handle clicked:', waypointIndex, 'on link', selectedLink.id);
            this.interactionHandler.startWaypointDrag(waypointIndex, selectedLink);
            this.cdr.markForCheck();
            return;
          }

          // Check if clicking on link path (to add waypoint)
          const hitPath = this.interactionHandler.hitTestPath(worldX, worldY, selectedLink);
          if (hitPath) {
            event.preventDefault();
            console.log('🟢 Link path clicked, adding waypoint on link', selectedLink.id);
            const added = this.interactionHandler.addWaypoint(worldX, worldY, selectedLink);
            if (added) {
              this.scheduleRender();
              this.cdr.markForCheck();
            }
            return;
          }
        }
      }

      // Wave 2 (Edges & links): part-aware edge interactions — grab a selected
      // link's endpoint handle to reconnect it, or a label to drag-reposition it.
      // Uses the merged part-aware hit-test so body clicks still fall through to
      // the normal link-selection path below.
      const edgeHit = this.interactionHandler.getLinkHitAtPosition(worldX, worldY, this.eng);
      if (edgeHit) {
        if (
          (edgeHit.part === 'source-endpoint' || edgeHit.part === 'target-endpoint') &&
          config.enableLinkReconnection &&
          edgeHit.link.state === 'selected'
        ) {
          event.preventDefault();
          const endpoint = edgeHit.part === 'source-endpoint' ? 'source' : 'target';
          this.interactionHandler.startLinkReconnection(edgeHit.link, endpoint, worldX, worldY, this.eng);
          this.renderDiagram();
          this.cdr.markForCheck();
          return;
        }

        if (edgeHit.part === 'label' && edgeHit.labelIndex !== undefined) {
          event.preventDefault();
          this.interactionHandler.startLabelDrag(edgeHit.link, edgeHit.labelIndex);
          this.cdr.markForCheck();
          return;
        }
      }

      // Phase 3: Check for link click (for selection)
      // FIXED: Use direct hit testing if hover state not available (e.g., on initial load)
      let linkToSelect = interactionState.hoveredLink;
      if (!linkToSelect) {
        linkToSelect = this.interactionHandler.getLinkAtPosition(worldX, worldY, this.eng);
      }

      if (linkToSelect) {
        event.preventDefault();
        const multiSelect = event.ctrlKey || event.metaKey;
        this.interactionHandler.selectLink(linkToSelect, this.eng, multiSelect);
        this.scheduleRender();
        this.cdr.markForCheck();
        return;
      }

      // Check if clicking on a node
      let clickedNode = diagram.getNodeAtPosition(worldX, worldY);

      // CRITICAL FIX: If no node found via SVG hit testing, check if clicking on HTML overlay
      // HTML overlays are positioned absolutely and may not be detected by SVG hit testing
      if (!clickedNode && event.target) {
        const targetElement = event.target as HTMLElement;
        // Check if clicked element or any parent has data-node-id attribute
        let element: HTMLElement | null = targetElement;
        while (element && element !== this.containerRef?.nativeElement) {
          const nodeId = element.getAttribute('data-node-id');
          if (nodeId) {
            clickedNode = diagram.getNode(nodeId);
            break;
          }
          element = element.parentElement;
        }
      }

      if (clickedNode) {
        event.preventDefault();

        // Store the originally clicked node (before any parent substitution)
        const originallyClickedNode = clickedNode;

        console.log('[FieldSelectDebug] Clicked node:', {
          id: clickedNode.id,
          type: clickedNode.type,
          draggable: clickedNode.behavior?.draggable,
          selectable: clickedNode.behavior?.selectable,
          parentId: clickedNode.parentId
        });

        // DRAG HANDLER SUPPORT: If clicked node is a drag handler, use its parent for dragging
        const isDragHandler = originallyClickedNode.behavior?.dragHandler?.isDragHandler === true;
        if (isDragHandler && originallyClickedNode.parentId) {
          const parentNode = diagram.getNode(originallyClickedNode.parentId);
          if (parentNode) {
            console.log('[FieldSelectDebug] Drag handler - switching to parent:', parentNode.id);
            clickedNode = parentNode;
          }
        }

        // CRITICAL FIX: If clicked node is not draggable AND not selectable, check for draggable parent
        // This allows child nodes (like table rows) to trigger parent drag
        // BUT if the node is selectable (even if not draggable), keep it selected
        if (!isDragHandler) {
          const nodeIsSelectable = clickedNode.behavior?.selectable !== false;
          console.log('[FieldSelectDebug] Node selectable check:', {
            nodeIsSelectable,
            isDraggable: clickedNode.isDraggable(),
            willCheckParent: !clickedNode.isDraggable() && !nodeIsSelectable && clickedNode.parentId
          });

          if (!clickedNode.isDraggable() && !nodeIsSelectable && clickedNode.parentId) {
            let currentNode = clickedNode;
            while (currentNode.parentId) {
              const parentNode = diagram.getNode(currentNode.parentId);
              if (parentNode && parentNode.isDraggable()) {
                console.log('[FieldSelectDebug] Non-selectable node - switching to draggable parent:', parentNode.id);
                clickedNode = parentNode;
                break;
              }
              currentNode = parentNode || currentNode;
              if (!parentNode) break;
            }
          }
        }

        // Wave-2 Interaction: capture selection state BEFORE we mutate it — this
        // is the sole input to DELIBERATE-mode drag gating in the ToolManager.
        const nodeWasSelected = clickedNode.isSelected();

        // Handle selection
        console.log('[FieldSelectDebug] Before selection - node:', clickedNode.id, 'isSelected:', clickedNode.isSelected());
        if (event.ctrlKey || event.metaKey) {
          // Ctrl+Click: Toggle selection (multi-select)
          diagram.toggleNodeSelection(clickedNode);
          console.log('[FieldSelectDebug] Toggled selection - isSelected:', clickedNode.isSelected());
        } else if (!clickedNode.isSelected()) {
          // Normal click on unselected node: Select only this node (clearing others)
          diagram.selectNode(clickedNode);
          console.log('[FieldSelectDebug] Selected node - isSelected:', clickedNode.isSelected());
        }
        // If clicking an already-selected node without Ctrl: Keep all selections for multi-drag

        // wave4/interaction (Card 7): pointer selection is announced too, and the
        // keyboard focus follows the pointer — so Tab resumes from what you clicked.
        if (this.enableKeyboardNavigation()) {
          this.keyboardNav.setFocus({ type: 'node', id: clickedNode.id });
          this.keyboardNav.announceSelection(this.eng);
        }

        // Force immediate render to show selection highlight instantly
        this.scheduleRender();

        // Start drag if node is draggable
        // Allow dragging if clicked node is draggable (even if other selected nodes are locked)
        // Note: Drag handler logic is already handled above - if user clicked a drag handler,
        // clickedNode was already replaced with its parent
        const canDrag = clickedNode.isDraggable() && clickedNode.isSelected();

        if (canDrag) {
          // Wave-2 Interaction: hand the gesture to the ToolManager. It arms
          // node-drag but does NOT move anything until the pointer crosses the
          // drag threshold (fixing the mousedown micro-jitter), and refuses to
          // arm at all in DELIBERATE mode unless the node was already selected.
          this.toolManager?.pointerDown(this.toToolEvent(event, 'down'), {
            kind: 'node',
            nodeId: clickedNode.id,
            nodeWasSelected,
          });
        }
      } else {
        // Clicked on empty space.
        // With no modifier a bare click clears the selection (existing behavior);
        // with a modifier we keep it so Shift/Cmd/Alt-marquee can extend it.
        const hasModifier = event.shiftKey || event.ctrlKey || event.metaKey || event.altKey;
        if (!hasModifier) {
          diagram.clearSelection();

          // Also deselect all links
          diagram.getLinks().forEach((link: any) => {
            if (link.state === 'selected') {
              link.setState('default');
            }
          });

          // Coalesced render to clear selection highlights
          this.scheduleRender();
        }

        // Wave-2 Interaction: arm the marquee tool. It commits (and starts
        // sweeping selectInRectangle) only once the pointer crosses the threshold.
        this.toolManager?.pointerDown(this.toToolEvent(event, 'down'), { kind: 'empty' });
      }

      this.cdr.markForCheck();
    }
  }

  /**
   * Handle mouse move for panning, node dragging, and hover (Phase 0.5 - Option B + Option 1 + Option 2)
   */
  @HostListener('mousemove', ['$event'])
  onMouseMove(event: MouseEvent): void {
    if (!this.eng) {
      return;
    }

    const diagram = this.eng.getDiagram();
    if (!diagram) {
      return;
    }

    // wave3/interaction: remember the cursor so paste can drop at it.
    this.lastPointerClient = { x: event.clientX, y: event.clientY };

    // Handle panning
    if (this.isPanning) {
      // Calculate pan delta in world-space coordinates
      const dx = (this.lastPanX - event.clientX) / this.zoom();
      const dy = (this.lastPanY - event.clientY) / this.zoom();

      // Update local viewport position
      this.viewport.set({
        ...this.viewport(),
        x: this.viewport().x + dx,
        y: this.viewport().y + dy,
      });

      // Update diagram viewport
      diagram.pan(dx, dy);

      // Update last position
      this.lastPanX = event.clientX;
      this.lastPanY = event.clientY;

      // Emit the world rect now visible (wave3/interaction: one meaning everywhere)
      this.emitViewportChanged();

      // Trigger re-render
      this.scheduleRender();
      this.cdr.markForCheck();
      return;
    }

    // wave4/interaction (Card 5): a resize / rotate / vertex gesture owns the move.
    if (this.selectionTools.isActive()) {
      this.updateToolGesture(event);
      return;
    }

    // Wave-2 Interaction: a ToolManager gesture (node-drag or marquee) owns the
    // move. Below the threshold this is a no-op — which is exactly what stops a
    // plain click from micro-jittering a node's position.
    if (this.toolManager?.hasGesture) {
      this.toolManager.pointerMove(this.toToolEvent(event, 'move'));
      return;
    }

    // Phase 2.3b: Handle control point dragging
    const interactionState = this.interactionHandler.getState();
    if (interactionState.isDraggingControlPoint) {
      // Convert to world coordinates
      const { worldX, worldY } = this.clientToWorld(event.clientX, event.clientY);

      // Move control point to new position
      const moved = this.interactionHandler.moveControlPoint(worldX, worldY, this.eng);
      if (moved) {
        this.scheduleRender();
        this.cdr.markForCheck();
      }
      return;
    }

    // Phase 2.3a: Handle waypoint dragging
    if (interactionState.isDraggingWaypoint) {
      // Convert to world coordinates
      const { worldX, worldY } = this.clientToWorld(event.clientX, event.clientY);

      // Move waypoint to new position
      const moved = this.interactionHandler.moveWaypoint(worldX, worldY, this.eng);
      if (moved) {
        this.scheduleRender();
        this.cdr.markForCheck();
      }
      return;
    }

    // Wave 2: Handle label drag-reposition
    if (interactionState.isDraggingLabel) {
      const { worldX, worldY } = this.clientToWorld(event.clientX, event.clientY);
      const moved = this.interactionHandler.moveLabelDrag(worldX, worldY);
      if (moved) {
        this.renderDiagram();
        this.cdr.markForCheck();
      }
      return;
    }

    // Wave 2: Handle endpoint reconnection drag (ghost preview + port validity)
    if (interactionState.isReconnectingLink) {
      const { worldX, worldY } = this.clientToWorld(event.clientX, event.clientY);
      // Refresh hover so the reconnection validity can see the port under the cursor
      this.interactionHandler.handleMouseMove(worldX, worldY, this.eng);
      this.interactionHandler.updateLinkReconnection(worldX, worldY, this.eng);
      this.renderDiagram();
      this.cdr.markForCheck();
      return;
    }

    // Phase 3: Handle hover detection and connection drag
    if (!this.spaceKeyPressed) {
      // Convert client coordinates to world coordinates
      const { worldX, worldY } = this.clientToWorld(event.clientX, event.clientY);

      // Handle hover detection (nodes, ports, links)
      let needsRender = this.interactionHandler.handleMouseMove(worldX, worldY, this.eng);

      // Handle connection drag update
      if (this.interactionHandler.getState().isConnecting) {
        needsRender = this.interactionHandler.handleConnectionDrag(worldX, worldY, this.eng) || needsRender;
      }

      // Phase 2.3a: Update hovered waypoint for Delete key support
      const config = this.eng.getInteractionConfig();
      if (config.enableWaypointEditing) {
        const state = this.interactionHandler.getState();
        // Only track waypoint hover on selected links
        const selectedLink = state.hoveredLink && state.hoveredLink.state === 'selected' ? state.hoveredLink : null;
        this.interactionHandler.updateHoveredWaypoint(worldX, worldY, selectedLink);
      }

      // Phase 2.3b: Update hovered control point for Delete key support
      if (config.enableControlPointEditing) {
        const state = this.interactionHandler.getState();
        // Only track control point hover on selected links with segments
        const selectedLink = state.hoveredLink && state.hoveredLink.state === 'selected' ? state.hoveredLink : null;
        this.interactionHandler.updateHoveredControlPoint(worldX, worldY, selectedLink);
      }

      // Update cursor based on interaction state
      if (this.containerRef?.nativeElement) {
        this.containerRef.nativeElement.style.cursor = this.interactionHandler.getCursor(this.eng);
      }

      // PERFORMANCE FIX: Only re-render if something actually changed
      // Previously we re-rendered on EVERY mousemove which was very expensive
      if (needsRender) {
        this.scheduleRender();
        this.cdr.markForCheck();
      }
    }
  }

  /**
   * Handle mouse up to stop panning, node dragging, and connections (Phase 0.5 - Option B + Option 1 + Phase 3)
   */
  @HostListener('mouseup', ['$event'])
  onMouseUp(event: MouseEvent): void {
    if (event.button === 1 || event.button === 0) {
      // wave4/interaction (Card 5): commit a resize / rotate / vertex gesture as
      // ONE undo entry.
      if (this.selectionTools.isActive()) {
        event.preventDefault();
        this.endToolGesture();
        return;
      }

      // Phase 2.3b: End control point drag if in progress
      const interactionState = this.interactionHandler.getState();
      if (interactionState.isDraggingControlPoint) {
        event.preventDefault();
        this.interactionHandler.endControlPointDrag();
        this.scheduleRender();
        this.cdr.markForCheck();
        return;
      }

      // Phase 2.3a: End waypoint drag if in progress
      if (interactionState.isDraggingWaypoint) {
        event.preventDefault();
        this.interactionHandler.endWaypointDrag();
        this.scheduleRender();
        this.cdr.markForCheck();
        return;
      }

      // Wave 2: End label drag if in progress
      if (interactionState.isDraggingLabel) {
        event.preventDefault();
        this.interactionHandler.endLabelDrag();
        this.renderDiagram();
        this.cdr.markForCheck();
        return;
      }

      // Phase 3: Complete connection if in progress
      if (interactionState.isConnecting) {
        event.preventDefault();
        const success = this.interactionHandler.completeConnection(this.eng);
        this.scheduleRender();
        this.cdr.markForCheck();
        return;
      }

      // Phase 3: Complete link reconnection if in progress
      if (interactionState.isReconnectingLink) {
        event.preventDefault();
        const success = this.interactionHandler.completeLinkReconnection(this.eng);
        this.scheduleRender();
        this.cdr.markForCheck();
        return;
      }

      // Wave-2 Interaction: end an active ToolManager gesture (node-drag /
      // marquee). Its end hook clears drag/marquee state and finalizes selection.
      if (this.toolManager?.hasGesture) {
        this.toolManager.pointerUp(this.toToolEvent(event, 'up'));
      }

      // Stop panning
      if (this.isPanning) {
        this.isPanning = false;
      }

      // Stop node dragging
      if (this.isDraggingNode) {
        this.isDraggingNode = false;
        this.draggedNodes.clear();
      }

      // Restore cursor based on space key state
      if (this.containerRef?.nativeElement) {
        this.containerRef.nativeElement.style.cursor = this.spaceKeyPressed ? 'grab' : 'default';
      }
    }
  }

  /**
   * Handle mouse leave to stop panning and node dragging (Phase 0.5 - Option B + Option 1)
   */
  @HostListener('mouseleave')
  onMouseLeave(): void {
    this.isPanning = false;

    // wave4/interaction: abandon an in-flight tool gesture (restoring the model)
    // so a resize/rotate can't "stick" when the pointer leaves the canvas.
    if (this.selectionTools.isActive()) {
      this.selectionTools.cancelGesture(this.eng);
      this.pendingVertexHandle = null;
    }
    this.clearGuides();

    // Wave-2 Interaction: abort any in-flight gesture so a drag/marquee doesn't
    // "stick" when the pointer leaves the canvas.
    if (this.toolManager?.hasGesture) {
      this.toolManager.pointerCancel({
        type: 'cancel',
        worldX: 0,
        worldY: 0,
        screenX: 0,
        screenY: 0,
        button: -1,
        buttons: 0,
        modifiers: { shift: false, ctrl: false, alt: false, meta: false },
      });
    }
    this.marquee.set(null);
    this.lastMarquee = null;
    this.marqueeBaseSelection = null;
    this.isDraggingNode = false;
    this.draggedNodes.clear();

    // Reset cursor
    if (this.containerRef?.nativeElement) {
      this.containerRef.nativeElement.style.cursor = 'default';
    }
  }

  /**
   * Wave 2 (Edges & links): double-click on a link.
   * - On a label: open an inline text editor in place.
   * - On the link body: insert a waypoint at the double-clicked point.
   */
  @HostListener('dblclick', ['$event'])
  onDoubleClick(event: MouseEvent): void {
    if (!this.eng) {
      return;
    }
    const diagram = this.eng.getDiagram();
    if (!diagram) {
      return;
    }

    const { worldX, worldY } = this.clientToWorld(event.clientX, event.clientY);
    const edgeHit = this.interactionHandler.getLinkHitAtPosition(worldX, worldY, this.eng);
    if (!edgeHit) {
      // wave4/interaction (Card 5): double-click a NODE → edit its label in place.
      const node = diagram.getNodeAtPosition(worldX, worldY);
      if (node && this.enableInPlaceEditing()) {
        event.preventDefault();
        this.openNodeLabelEditor(node.id);
      }
      return;
    }

    if (edgeHit.part === 'label' && edgeHit.labelIndex !== undefined) {
      event.preventDefault();
      this.openLinkLabelEditor(edgeHit.link, edgeHit.labelIndex, event.clientX, event.clientY);
      return;
    }

    if (edgeHit.part === 'body') {
      event.preventDefault();
      const added = this.interactionHandler.addWaypoint(worldX, worldY, edgeHit.link);
      if (added) {
        this.renderDiagram();
        this.cdr.markForCheck();
      }
    }
  }

  /**
   * Wave 2: transient inline label editor (a floating <input>).
   */
  private activeLabelEditor?: HTMLInputElement;

  /**
   * Wave 2 → wave4/interaction: edit a link label in place.
   *
   * The geometry and the COMMIT now come from the framework-agnostic
   * {@link InPlaceTextEditor}: this used to call `link.updateLabel()` directly,
   * which meant an edited edge label could NOT be undone — the last direct
   * manipulation still outside the command layer. It now commits a
   * SetLinkLabelCommand like everything else.
   */
  private openLinkLabelEditor(
    link: any,
    labelIndex: number,
    _clientX?: number,
    _clientY?: number
  ): void {
    const session = this.inPlaceEditor.begin(this.eng, {
      type: 'link-label',
      linkId: link.id,
      labelIndex,
    });
    if (session) {
      this.openTextEditor(session.value, session.center, session.multiline);
    }
  }

  /** wave4/interaction (Card 5): edit a NODE's label in place (double-click / Enter). */
  private openNodeLabelEditor(nodeId: string): void {
    const session = this.inPlaceEditor.begin(this.eng, { type: 'node', nodeId });
    if (session) {
      this.openTextEditor(session.value, session.center, session.multiline);
    }
  }

  /**
   * The transient text widget. This is the ONLY part of in-place editing that is
   * framework/DOM-specific: where it goes and what committing MEANS both come
   * from the session the InPlaceTextEditor opened.
   *
   * The editor is positioned by mapping the session's WORLD anchor through the
   * canvas' world→screen map, so it lands on the text at any zoom (the old code
   * used the raw double-click point, which drifted from the label).
   */
  private openTextEditor(value: string, worldCenter: Point, multiline: boolean): void {
    const container = this.containerRef?.nativeElement;
    if (!container) {
      this.inPlaceEditor.cancel();
      return;
    }

    this.closeLabelEditor();

    const { screenX, screenY } = this.worldToScreen(worldCenter.x, worldCenter.y);
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value;
    input.className = multiline ? 'grafloria-node-label-editor' : 'grafloria-link-label-editor';
    input.style.position = 'absolute';
    input.style.left = `${screenX}px`;
    input.style.top = `${screenY}px`;
    input.style.transform = 'translate(-50%, -50%)';
    input.style.zIndex = '1000';
    input.style.font = '12px sans-serif';
    input.style.textAlign = 'center';
    input.style.minWidth = '40px';
    input.style.padding = '1px 4px';

    let settled = false;
    const cleanup = () => {
      input.removeEventListener('keydown', onKeyDown);
      input.removeEventListener('blur', commit);
      if (input.parentElement) {
        input.parentElement.removeChild(input);
      }
      if (this.activeLabelEditor === input) {
        this.activeLabelEditor = undefined;
      }
    };
    const commit = () => {
      if (settled) return;
      settled = true;
      const command = this.inPlaceEditor.commit(this.eng, input.value);
      cleanup();
      if (command) {
        this.executeCommand(command);
      }
      this.renderDiagram();
      this.cdr.markForCheck();
    };
    const cancel = () => {
      if (settled) return;
      settled = true;
      this.inPlaceEditor.cancel();
      cleanup();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      // Keep the canvas' window key handlers (Delete/Escape/etc.) out of the way.
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        commit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      }
    };

    input.addEventListener('keydown', onKeyDown);
    input.addEventListener('blur', commit);

    container.appendChild(input);
    this.activeLabelEditor = input;
    input.focus();
    input.select();
  }

  /**
   * Wave 2: remove the active inline label editor without committing.
   */
  private closeLabelEditor(): void {
    const el = this.activeLabelEditor;
    if (el) {
      this.activeLabelEditor = undefined;
      if (el.parentElement) {
        el.parentElement.removeChild(el);
      }
    }
  }

  /**
   * Recalculate link paths for specific nodes
   * Called during node drag to keep links connected to moving nodes
   */
  private recalculateLinkPathsForNodes(diagram: any, nodeIds: string[]): void {
    const links = diagram.getLinks();
    const allNodes = diagram.getNodes();

    links.forEach((link: any) => {
      // Find source and target nodes
      const sourceNode = allNodes.find((n: any) =>
        n.getPorts().some((p: any) => p.id === link.sourcePortId)
      );
      const targetNode = allNodes.find((n: any) =>
        n.getPorts().some((p: any) => p.id === link.targetPortId)
      );

      if (!sourceNode || !targetNode) {
        return;
      }

      // Check if this link is connected to any of the dragged nodes
      const isConnected = nodeIds.includes(sourceNode.id) || nodeIds.includes(targetNode.id);
      if (!isConnected) {
        return; // Skip links not connected to dragged nodes
      }

      // Find the actual port objects
      const sourcePort = sourceNode.getPorts().find((p: any) => p.id === link.sourcePortId);
      const targetPort = targetNode.getPorts().find((p: any) => p.id === link.targetPortId);

      if (!sourcePort || !targetPort) {
        return;
      }

      // Get node bounding boxes
      const sourceBounds = sourceNode.getBoundingBox();
      const targetBounds = targetNode.getBoundingBox();

      // Calculate absolute port positions
      const sourcePoint = sourcePort.getAbsolutePosition(sourceBounds);
      const targetPoint = targetPort.getAbsolutePosition(targetBounds);

      // Get port directions for orthogonal routing
      const sourceDirection = sourcePort.alignment?.side;
      const targetDirection = targetPort.alignment?.side;

      // Regenerate the link path with new port positions and directions
      link.generatePath(sourcePoint, targetPoint, sourceDirection, targetDirection);
      link.markDirty(); // Force re-render
    });
  }

  /**
   * CRITICAL: Convert client coordinates to world coordinates.
   * MUST match the viewBox SVGRenderer emits — it is derived from the very same
   * getViewBox(), so the two can no longer drift apart:
   *
   *     world = viewBox.origin + screen / zoom
   */
  private clientToWorld(clientX: number, clientY: number): { worldX: number; worldY: number } {
    const { screenX, screenY } = this.clientToScreen(clientX, clientY);
    const viewBox = this.getViewBox();

    return {
      worldX: viewBox.x + screenX / this.zoom(),
      worldY: viewBox.y + screenY / this.zoom(),
    };
  }

  /** Client (page) coords → canvas-local screen px. */
  private clientToScreen(clientX: number, clientY: number): { screenX: number; screenY: number } {
    const rect = this.containerRef.nativeElement.getBoundingClientRect();
    return { screenX: clientX - rect.left, screenY: clientY - rect.top };
  }

  /**
   * Inverse of {@link clientToWorld}: world → canvas-local screen px.
   * Exposed (public) because it is the invariant the cursor-anchored zoom is
   * defined by, and the zoom tests assert on it.
   */
  worldToScreen(worldX: number, worldY: number): { screenX: number; screenY: number } {
    const viewBox = this.getViewBox();
    return {
      screenX: (worldX - viewBox.x) * this.zoom(),
      screenY: (worldY - viewBox.y) * this.zoom(),
    };
  }

  /**
   * Handle keyboard events (Option 1: Node Interaction)
   * - Space: Pan mode cursor
   * - Delete/Backspace: Delete selection (undoable)
   * - Escape: Clear selection
   * - Ctrl+A: Select all
   * wave3/interaction adds:
   * - Ctrl/⌘+Z undo, Ctrl/⌘+Shift+Z or Ctrl+Y redo
   * - Ctrl/⌘+X / +C / +V cut / copy / paste-at-cursor
   * - Ctrl/⌘ +'=' / '-' / '0' zoom in / out / reset; Shift+1 fit, Shift+2 fit selection
   */
  @HostListener('window:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    // Handle Space key for pan mode cursor
    if (event.code === 'Space' && !this.spaceKeyPressed) {
      this.spaceKeyPressed = true;
      // Change cursor to indicate pan mode
      if (this.containerRef?.nativeElement) {
        this.containerRef.nativeElement.style.cursor = 'grab';
      }
    }

    if (!this.eng) {
      return;
    }

    const diagram = this.eng.getDiagram();
    if (!diagram) {
      return;
    }

    // Never steal keys from a text field (incl. the inline link-label editor).
    if (this.isTextInput(event.target)) {
      return;
    }

    // wave3/interaction: history + clipboard + zoom keybindings.
    if (this.handleShortcut(event)) {
      return;
    }

    // wave4/interaction (Card 7): Tab/arrow focus, nudge, Enter-to-edit and the
    // keyboard connect flow. Runs after the accelerators so Ctrl+A etc. keep
    // their meaning, and before Delete/Escape so a connect flow can absorb Escape.
    if (this.enableKeyboardNavigation() && this.handleKeyboardNavigation(event)) {
      return;
    }

    // Handle Delete key (Phase 3: Also delete links, Phase 2.3a: Also delete waypoints)
    if (event.key === 'Delete' || event.key === 'Backspace') {
      // Phase 2.3a: Try deleting hovered waypoint first (highest priority)
      const config = this.eng.getInteractionConfig();
      if (config.enableWaypointEditing) {
        const waypointDeleted = this.interactionHandler.deleteHoveredWaypoint();
        if (waypointDeleted) {
          event.preventDefault();
          this.scheduleRender();
          this.cdr.markForCheck();
          return;
        }
      }

      // wave3/interaction: nodes AND links now go through DeleteSelectionCommand,
      // so a deletion is ONE undoable step (it used to call
      // diagram.deleteSelected() / removeLink() directly — unrecoverable).
      this.syncSelectionToStore();
      if (this.hasSelection()) {
        event.preventDefault();
        this.deleteSelection();
        return;
      }

      // Fallback: a link the interaction handler considers selected but that the
      // model-level sync above could not see.
      const linkDeleted = this.interactionHandler.deleteSelectedLink(this.eng);
      if (linkDeleted) {
        event.preventDefault();
        this.scheduleRender();
        this.cdr.markForCheck();
        return;
      }
    }

    // Handle Escape key - cancel connection or clear selection (Phase 3)
    if (event.key === 'Escape') {
      // Cancel connection or endpoint reconnection if in progress
      const interactionState = this.interactionHandler.getState();
      if (interactionState.isConnecting) {
        this.interactionHandler.cancelConnection(this.eng);
        this.scheduleRender();
        this.cdr.markForCheck();
        return;
      }
      if (interactionState.isReconnectingLink) {
        // Wave 2: restore the link's original connection and clear the ghost
        this.interactionHandler.cancelLinkReconnection(this.eng);
        this.renderDiagram();
        this.cdr.markForCheck();
        return;
      }

      // Otherwise clear selection
      diagram.clearSelection();
      this.scheduleRender();
      this.cdr.markForCheck();
    }

    // Handle Ctrl+A - select all
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      diagram.selectAll();
      this.scheduleRender();
      this.cdr.markForCheck();
    }
  }

  /**
   * wave4/interaction — Card 7: the keyboard-first canvas.
   *
   *   Tab / Shift+Tab   move the FOCUS ring across nodes then links
   *   Arrows            nudge the SELECTION (Shift = coarse step);
   *                     with nothing selected they move focus spatially
   *   Enter             select the focused entity; on a node, open its label editor
   *   C                 start a keyboard connection from the focused node
   *                     (Arrows pick the port, Tab the target node, Enter commits,
   *                      Escape cancels)
   *
   * Every model change goes through the command layer, so a nudge or a
   * keyboard-built link is exactly as undoable as its pointer equivalent.
   *
   * @returns true when the key was consumed.
   */
  private handleKeyboardNavigation(event: KeyboardEvent): boolean {
    // Accelerated combos belong to handleShortcut(); never shadow them.
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return false;
    }

    const diagram = this.eng.getDiagram();
    if (!diagram) {
      return false;
    }

    const key = event.key;

    if (key === 'Tab') {
      event.preventDefault();
      if (this.keyboardNav.isConnecting()) {
        this.keyboardNav.cycleTargetNode(this.eng, event.shiftKey ? -1 : 1);
      } else if (event.shiftKey) {
        this.keyboardNav.focusPrevious(this.eng);
      } else {
        this.keyboardNav.focusNext(this.eng);
      }
      this.scheduleRender();
      this.cdr.markForCheck();
      return true;
    }

    if (key === 'Escape' && this.keyboardNav.isConnecting()) {
      event.preventDefault();
      this.keyboardNav.cancelConnect();
      this.cdr.markForCheck();
      return true;
    }

    if (key === 'Enter') {
      if (this.keyboardNav.isConnecting()) {
        event.preventDefault();
        const command = this.keyboardNav.confirmConnect(this.eng);
        if (command) {
          this.executeCommand(command);
        }
        this.cdr.markForCheck();
        return true;
      }

      const focused = this.keyboardNav.getFocused();
      if (focused) {
        event.preventDefault();
        this.keyboardNav.selectFocused(this.eng);
        if (focused.type === 'node' && this.enableInPlaceEditing()) {
          this.openNodeLabelEditor(focused.id);
        }
        this.scheduleRender();
        this.cdr.markForCheck();
        return true;
      }
      return false;
    }

    if ((key === 'c' || key === 'C') && !this.keyboardNav.isConnecting()) {
      if (this.keyboardNav.getFocused()?.type !== 'node') {
        return false;
      }
      event.preventDefault();
      this.keyboardNav.beginConnect(this.eng);
      this.cdr.markForCheck();
      return true;
    }

    const nudge = this.keyboardNav.nudgeDelta(key, event.shiftKey);
    if (!nudge) {
      return false;
    }
    event.preventDefault();

    // While connecting, the arrows pick the port instead of moving anything.
    if (this.keyboardNav.isConnecting()) {
      this.keyboardNav.cyclePort(
        this.eng,
        key === 'ArrowRight' || key === 'ArrowDown' ? 1 : -1
      );
      this.cdr.markForCheck();
      return true;
    }

    if (diagram.getSelectedNodes().length > 0) {
      const command = this.keyboardNav.nudgeCommand(this.eng, nudge.x, nudge.y);
      if (command) {
        this.executeCommand(command);
      }
      return true;
    }

    // Nothing selected → the arrows move the focus ring instead.
    const direction =
      key === 'ArrowLeft'
        ? 'left'
        : key === 'ArrowRight'
        ? 'right'
        : key === 'ArrowUp'
        ? 'up'
        : 'down';
    this.keyboardNav.focusDirection(this.eng, direction);
    this.scheduleRender();
    this.cdr.markForCheck();
    return true;
  }

  /**
   * wave3/interaction: history / clipboard / zoom shortcuts.
   * @returns true when the key was consumed (the caller must stop).
   */
  private handleShortcut(event: KeyboardEvent): boolean {
    const accel = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();

    if (accel) {
      switch (key) {
        case 'z':
          event.preventDefault();
          // Ctrl+Shift+Z = redo (the Windows/Linux + macOS convention).
          if (event.shiftKey) {
            this.redo();
          } else {
            this.undo();
          }
          return true;

        case 'y':
          event.preventDefault();
          this.redo();
          return true;

        case 'x':
          event.preventDefault();
          this.cutSelection();
          return true;

        case 'c':
          event.preventDefault();
          this.copySelection();
          return true;

        case 'v':
          event.preventDefault();
          this.pasteClipboard();
          return true;

        // '=' and '+' share a key; accept both, plus the numpad names.
        case '=':
        case '+':
        case 'add':
          event.preventDefault();
          this.zoomIn();
          return true;

        case '-':
        case '_':
        case 'subtract':
          event.preventDefault();
          this.zoomOut();
          return true;

        case '0':
          event.preventDefault();
          this.resetZoom();
          return true;

        default:
          return false;
      }
    }

    // Figma-style view shortcuts (no accelerator).
    if (event.shiftKey && key === '1') {
      event.preventDefault();
      this.fitToContent();
      return true;
    }
    if (event.shiftKey && key === '2') {
      event.preventDefault();
      this.zoomToSelection();
      return true;
    }

    return false;
  }

  /** True when the event targets a text-entry element (never steal its keys). */
  private isTextInput(target: EventTarget | null): boolean {
    const element = target as HTMLElement | null;
    if (!element || !element.tagName) {
      return false;
    }
    const tag = element.tagName.toUpperCase();
    return (
      tag === 'INPUT' ||
      tag === 'TEXTAREA' ||
      tag === 'SELECT' ||
      element.isContentEditable === true
    );
  }

  /**
   * Create a temporary PortModel from an HTML handle (Phase 3)
   * This allows HTML handles to work with the existing connection system
   */
  private createTempPortFromHandle(
    htmlHandleHit: { nodeId: string; handleId: string; handle: any },
    worldX: number,
    worldY: number
  ): PortModel | null {
    const diagram = this.eng?.getDiagram();
    if (!diagram) return null;

    // Get the node that owns this handle
    const node = diagram.getNode(htmlHandleHit.nodeId);
    if (!node) {
      console.error(`❌ [Phase 3] Node not found: ${htmlHandleHit.nodeId}`);
      return null;
    }

    // Check if node already has a port for this handle
    // HTML handles map to virtual ports on the node
    const portId = `html-port-${htmlHandleHit.handleId}`;
    let port = node.getPort(portId);

    if (!port) {
      // Create a new virtual port for this HTML handle
      // Map handle type to port type
      const portType = htmlHandleHit.handle.type === 'source' ? 'output' : 'input';

      // Map handle position to port side
      const portSide = htmlHandleHit.handle.position; // 'top' | 'right' | 'bottom' | 'left'

      port = new PortModel({
        id: portId,
        type: portType,
        side: portSide,
      });

      // Add port to node
      node.addPort(port);

      console.log(`✅ [Phase 3] Created virtual port for HTML handle:`, {
        portId,
        type: portType,
        side: portSide,
        nodeId: node.id
      });
    }

    return port;
  }

  /**
   * Get absolute X position for a node (including parent offset and transforms)
   * CRITICAL FIX: Use getWorldPosition() for simple cases, getGlobalPosition() for transforms
   * This properly handles rotation, scale, and nested hierarchies
   */
  getAbsoluteX(node: any): number {
    // CRITICAL FIX: Check if node or any ancestor has transforms (rotation/scale)
    // If yes, use getGlobalPosition() which accounts for transforms
    // Otherwise, use getWorldPosition() which is faster for simple cases

    if (this.hasTransformsInHierarchy(node)) {
      // Use global position which applies all parent transforms
      const globalPos = node.getGlobalPosition();
      return globalPos.x;
    } else {
      // Use world position (faster, no transform calculations)
      const worldPos = node.getWorldPosition();
      return worldPos.x;
    }
  }

  /**
   * Get absolute Y position for a node (including parent offset and transforms)
   * CRITICAL FIX: Use getWorldPosition() for simple cases, getGlobalPosition() for transforms
   * This properly handles rotation, scale, and nested hierarchies
   */
  getAbsoluteY(node: any): number {
    // CRITICAL FIX: Check if node or any ancestor has transforms (rotation/scale)
    // If yes, use getGlobalPosition() which accounts for transforms
    // Otherwise, use getWorldPosition() which is faster for simple cases

    if (this.hasTransformsInHierarchy(node)) {
      // Use global position which applies all parent transforms
      const globalPos = node.getGlobalPosition();
      return globalPos.y;
    } else {
      // Use world position (faster, no transform calculations)
      const worldPos = node.getWorldPosition();
      return worldPos.y;
    }
  }

  /**
   * Check if node or any ancestor has transforms (rotation/scale)
   * Used to determine if we need full transform calculations
   */
  private hasTransformsInHierarchy(node: NodeModel): boolean {
    let currentNode: NodeModel | null | undefined = node;
    const diagram = this.eng?.getDiagram();

    while (currentNode) {
      // Check if node has non-default rotation or scale
      if (currentNode.rotation !== 0 ||
          currentNode.scale?.x !== 1 ||
          currentNode.scale?.y !== 1) {
        return true;
      }

      // Move to parent
      if (currentNode.parentId && diagram) {
        currentNode = diagram.getNode(currentNode.parentId);
      } else {
        break;
      }
    }

    return false;
  }

  /**
   * Get node X position for HTML rendering — in WORLD units.
   *
   * wave3/interaction: the HTML layer's transform is
   * `translate(−viewBox.origin·zoom) scale(zoom)`, so a child positioned at its
   * world coordinate lands at (world − origin)·zoom — byte-for-byte the SVG map.
   * The old `/ zoom` cancelled the layer's scale, which pinned HTML nodes to a
   * zoom-independent offset while the SVG around them scaled: the desync.
   */
  getNodeX(node: any): number {
    return this.getAbsoluteX(node);
  }

  /**
   * Get node Y position for HTML rendering — in WORLD units (see getNodeX).
   */
  getNodeY(node: any): number {
    return this.getAbsoluteY(node);
  }

  /**
   * Check if a port should be rendered as an HTML handle
   * Respects port visibility settings and template configuration
   */
  shouldRenderPort(port: PortModel, node: NodeModel): boolean {
    // Check if node has ports enabled via template metadata
    const portsConfig = node.getMetadata('portsConfig');
    if (portsConfig && portsConfig.enabled === false) {
      return false;
    }

    // Check port visibility (defaultVisibility or port-specific visibility)
    const defaultVisibility = portsConfig?.defaultVisibility || 'on-hover';
    const portVisibility = port.getMetadata('visibility') || defaultVisibility;

    // For now, always show ports that are explicitly enabled
    // TODO: Implement on-hover visibility when interaction system is enhanced
    return portVisibility === 'always' || portVisibility === 'on-hover';
  }

  /**
   * Get port position CSS value for top or left
   * CRITICAL FIX: Use shape-aware positioning from getPortPositionForShape()
   * This ensures HTML ports align with SVG ports for all shape types
   */
  getPortPosition(port: PortModel, node: NodeModel, axis: 'top' | 'left'): string {
    // Get shape-aware position in local coordinates (pixels relative to node origin)
    const localPos = getPortPositionForShape(port, node);

    // Convert to percentage based on node size for CSS positioning
    // This ensures ports position correctly at any zoom level
    if (axis === 'top') {
      // Vertical positioning: convert Y coordinate to percentage
      const percentage = (localPos.y / node.size.height) * 100;
      return `${percentage}%`;
    } else {
      // Horizontal positioning: convert X coordinate to percentage
      const percentage = (localPos.x / node.size.width) * 100;
      return `${percentage}%`;
    }
  }

  /**
   * Cleanup resources
   * Phase 2: Also destroy HTML node components
   */
  private cleanup(): void {
    // Wave 2: tear down any open inline label editor
    this.closeLabelEditor();

    // wave4/interaction: drop the announcement subscription and the keyboard
    // controller's listeners (a leaked listener would keep the component alive).
    this.announcementSub?.();
    this.announcementSub = undefined;
    this.keyboardNav.dispose();
    this.inPlaceEditor.cancel();

    // wave2/rendering: cancel any queued animation frame so no render fires
    // after the component is gone.
    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
    this.renderDirty = false;

    // Destroy all HTML node components
    for (const [, componentRef] of this.htmlNodeComponents.entries()) {
      componentRef.destroy();
    }
    this.htmlNodeComponents.clear();

    // wave4/ngwrapper: drops the engine/diagram subscriptions, stops the
    // incremental capture AND disposes the SVG renderer.
    this.detachEngine();
    this.attachedEngine = null;

    // An engine the canvas created for controlled mode is the canvas' to destroy.
    const owned = untracked(() => this.internalEngine());
    if (owned) {
      owned.destroy();
      this.internalEngine.set(null);
    }
  }
}
