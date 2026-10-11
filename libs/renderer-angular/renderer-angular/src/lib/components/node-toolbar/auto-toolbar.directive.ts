import {
  Directive,
  Input,
  OnInit,
  OnDestroy,
  TemplateRef,
  ElementRef,
  ViewContainerRef,
  EnvironmentInjector,
  contentChild,
  effect,
  untracked,
} from '@angular/core';
import { DiagramEngine, DiagramModel, NodeModel } from '@grafloria/engine';
import { DiagramCanvasComponent } from '../diagram-canvas.component';
import { NodeToolbarService } from './node-toolbar.service';
import { ToolbarAction, ToolbarPosition, ToolbarAlignment } from './node-toolbar.component';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

/**
 * AutoToolbarDirective
 *
 * Automatically shows/hides node toolbars based on node selection.
 * Apply this directive to the diagram canvas container to enable automatic toolbar management.
 *
 * @example
 * ```html
 * <div grafloriaAutoToolbar
 *      [engine]="diagramEngine"
 *      [viewport]="viewport"
 *      [zoom]="zoom"
 *      [toolbarPosition]="'top'"
 *      [toolbarActions]="actions">
 *   <grafloria-diagram-canvas [engine]="engine"></grafloria-diagram-canvas>
 * </div>
 * ```
 */
@Directive({
  selector: '[grafloriaAutoToolbar]',
  standalone: true,
})
export class AutoToolbarDirective implements OnInit, OnDestroy {
  @Input() engine!: DiagramEngine;
  @Input() viewport: { x: number; y: number; width: number; height: number } = { x: 0, y: 0, width: 800, height: 600 };
  @Input() zoom: number = 1.0;
  @Input() toolbarPosition: ToolbarPosition = 'top';
  @Input() toolbarAlignment: ToolbarAlignment = 'center';
  @Input() toolbarActions: ToolbarAction[] = [];
  @Input() toolbarTemplate?: TemplateRef<any>;
  @Input() toolbarOffset?: number;

  private destroy$ = new Subject<void>();

  /**
   * The canvas inside the host element, if any. Selection lives on the diagram
   * MODEL (and the canvas's `selectionChange`) — nothing emits `node:selected` on
   * the engine bus, so listening there alone never showed a toolbar (N1). The
   * canvas also owns the camera: the toolbar is placed with its pan and zoom.
   */
  private readonly canvas = contentChild(DiagramCanvasComponent);
  private readonly canvasElement = contentChild(DiagramCanvasComponent, { read: ElementRef });

  /** Unsubscribers for the engine bus and the current diagram. */
  private busOffs: Array<() => void> = [];
  private diagramOffs: Array<() => void> = [];
  private selectionQueued = false;
  private destroyed = false;

  constructor(
    private toolbarService: NodeToolbarService,
    private viewContainerRef: ViewContainerRef,
    private elementRef: ElementRef<HTMLElement>,
    private environmentInjector: EnvironmentInjector
  ) {
    // canvas camera → toolbars. The toolbar maps world → screen as
    // `world · zoom + viewport`, so its "viewport" is where the world origin
    // lands on screen (the canvas's viewBox is centre-anchored).
    effect(() => {
      const canvas = this.canvas();
      if (!canvas) return;
      canvas.zoom();
      canvas.viewport();
      untracked(() => this.syncCamera(canvas));
    });
  }

  ngOnInit() {
    if (!this.engine) {
      console.warn('AutoToolbarDirective: engine not provided');
      return;
    }

    // Initialize toolbar service with view container and injector
    this.toolbarService.setViewContainer(this.viewContainerRef);
    this.toolbarService.setEnvironmentInjector(this.environmentInjector);

    // Set canvas element (the canvas itself when it is inside the host)
    this.toolbarService.setCanvasElement(this.toolbarCanvasElement());

    // Set initial viewport and zoom
    const canvas = this.canvas();
    if (canvas) {
      this.syncCamera(canvas);
    } else {
      this.toolbarService.setViewport(this.viewport);
      this.toolbarService.setZoom(this.zoom);
    }

    // The diagram's selection drives the toolbars — whatever made it (a click,
    // a marquee, the keyboard, the model API). Rebind when the diagram is swapped
    // or created later (a canvas creates one for an engine that has none).
    this.bindDiagram(this.engine.getDiagram?.() ?? null);
    this.listen('diagram:changed', (event: any) => this.bindDiagram(event?.newDiagram ?? null));

    // Explicit engine-bus events (kept for hosts that emit them themselves)
    this.listen('node:selected', (event: any) => {
      if (event.node) {
        this.showFor(event.node);
      }
    });

    // Hide toolbar on node deselection
    this.listen('node:deselected', (event: any) => {
      if (event.node) {
        this.toolbarService.hide(event.node.id);
      }
    });

    // Update toolbar positions on zoom/pan
    this.listen('canvas:zoom', (event: any) => {
      if (event.zoom !== undefined) {
        this.zoom = event.zoom;
        this.toolbarService.setZoom(event.zoom);
      } else {
        this.toolbarService.updateAllPositions();
      }
    });

    this.listen('canvas:pan', (event: any) => {
      if (event.viewport) {
        this.viewport = event.viewport;
        this.toolbarService.setViewport(event.viewport);
      } else {
        this.toolbarService.updateAllPositions();
      }
    });

    // Update positions when nodes are moved or resized
    this.listen('node:moved', (event: any) => {
      if (event.node) {
        this.toolbarService.updatePosition(event.node.id);
      }
    });

    this.listen('node:resized', (event: any) => {
      if (event.node) {
        this.toolbarService.updatePosition(event.node.id);
      }
    });

    // Hide all toolbars when diagram is cleared
    this.listen('diagram:cleared', () => {
      this.toolbarService.hideAll();
    });
  }

  ngOnDestroy() {
    this.destroyed = true;
    for (const off of [...this.busOffs, ...this.diagramOffs]) off();
    this.busOffs = [];
    this.diagramOffs = [];
    this.destroy$.next();
    this.destroy$.complete();
    this.toolbarService.hideAll();
  }

  private listen(event: string, handler: (payload: any) => void): void {
    const off = this.engine.eventBus.on(event, handler) as unknown;
    if (typeof off === 'function') this.busOffs.push(off as () => void);
  }

  private toolbarCanvasElement(): HTMLElement {
    return this.canvasElement()?.nativeElement ?? this.elementRef.nativeElement;
  }

  private showFor(node: NodeModel): void {
    this.toolbarService.show(node, this.engine, {
      position: this.toolbarPosition,
      alignment: this.toolbarAlignment,
      actions: this.toolbarActions,
      template: this.toolbarTemplate,
      offset: this.toolbarOffset,
      canvasElement: this.toolbarCanvasElement(),
      viewport: this.viewport,
      zoom: this.zoom,
    });
  }

  private bindDiagram(diagram: DiagramModel | null): void {
    for (const off of this.diagramOffs) off();
    this.diagramOffs = [];
    if (!diagram || typeof diagram.on !== 'function') {
      this.toolbarService.hideAll();
      return;
    }
    const onSelection = () => this.scheduleSelectionSync();
    for (const event of ['selection:changed', 'node:changed', 'node:removed', 'nodes:cleared']) {
      this.diagramOffs.push(diagram.on(event as never, onSelection as never));
    }
    // A dragged (or resized) node carries its toolbar along.
    const onMove = () => this.toolbarService.updateAllPositions();
    for (const event of ['node:moved', 'node:resized']) {
      this.diagramOffs.push(diagram.on(event as never, onMove as never));
    }
    this.scheduleSelectionSync();
  }

  /** Coalesce a burst of model events (a click deselects, then selects) into one sync. */
  private scheduleSelectionSync(): void {
    if (this.selectionQueued || this.destroyed) return;
    this.selectionQueued = true;
    queueMicrotask(() => {
      this.selectionQueued = false;
      if (!this.destroyed) this.syncSelection();
    });
  }

  /** One toolbar for a single selected node; none for no or a multi-selection. */
  private syncSelection(): void {
    const diagram = this.engine.getDiagram?.();
    const selected = diagram ? diagram.getSelectedNodes() : [];
    const only = selected.length === 1 ? selected[0] : undefined;
    for (const ref of this.toolbarService.getAll()) {
      const id = ref.instance.node?.id;
      if (id !== undefined && id !== only?.id) this.toolbarService.hide(id);
    }
    if (only && !this.toolbarService.isShown(only.id)) {
      this.showFor(only);
    }
  }

  private syncCamera(canvas: DiagramCanvasComponent): void {
    const origin = canvas.worldToScreen(0, 0);
    const current = canvas.viewport();
    this.viewport = { x: origin.screenX, y: origin.screenY, width: current.width, height: current.height };
    this.zoom = canvas.zoom();
    this.toolbarService.setViewport(this.viewport);
    this.toolbarService.setZoom(this.zoom);
  }

  /**
   * Update viewport (to be called when viewport changes)
   */
  updateViewport(viewport: { x: number; y: number; width: number; height: number }) {
    this.viewport = viewport;
    this.toolbarService.setViewport(viewport);
  }

  /**
   * Update zoom (to be called when zoom changes)
   */
  updateZoom(zoom: number) {
    this.zoom = zoom;
    this.toolbarService.setZoom(zoom);
  }
}
