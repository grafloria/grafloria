import {
  Directive,
  Input,
  OnInit,
  OnDestroy,
  TemplateRef,
  ElementRef,
  ViewContainerRef,
  EnvironmentInjector,
} from '@angular/core';
import { DiagramEngine } from '@grafloria/engine';
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

  constructor(
    private toolbarService: NodeToolbarService,
    private viewContainerRef: ViewContainerRef,
    private elementRef: ElementRef<HTMLElement>,
    private environmentInjector: EnvironmentInjector
  ) {}

  ngOnInit() {
    if (!this.engine) {
      console.warn('AutoToolbarDirective: engine not provided');
      return;
    }

    // Initialize toolbar service with view container and injector
    this.toolbarService.setViewContainer(this.viewContainerRef);
    this.toolbarService.setEnvironmentInjector(this.environmentInjector);

    // Set canvas element
    const canvasElement = this.elementRef.nativeElement;
    this.toolbarService.setCanvasElement(canvasElement);

    // Set initial viewport and zoom
    this.toolbarService.setViewport(this.viewport);
    this.toolbarService.setZoom(this.zoom);

    // Show toolbar on node selection
    this.engine.eventBus.on('node:selected', (event: any) => {
      if (event.node) {
        this.toolbarService.show(event.node, this.engine, {
          position: this.toolbarPosition,
          alignment: this.toolbarAlignment,
          actions: this.toolbarActions,
          template: this.toolbarTemplate,
          offset: this.toolbarOffset,
          canvasElement,
          viewport: this.viewport,
          zoom: this.zoom,
        });
      }
    });

    // Hide toolbar on node deselection
    this.engine.eventBus.on('node:deselected', (event: any) => {
      if (event.node) {
        this.toolbarService.hide(event.node.id);
      }
    });

    // Update toolbar positions on zoom/pan
    this.engine.eventBus.on('canvas:zoom', (event: any) => {
      if (event.zoom !== undefined) {
        this.zoom = event.zoom;
        this.toolbarService.setZoom(event.zoom);
      } else {
        this.toolbarService.updateAllPositions();
      }
    });

    this.engine.eventBus.on('canvas:pan', (event: any) => {
      if (event.viewport) {
        this.viewport = event.viewport;
        this.toolbarService.setViewport(event.viewport);
      } else {
        this.toolbarService.updateAllPositions();
      }
    });

    // Update positions when nodes are moved or resized
    this.engine.eventBus.on('node:moved', (event: any) => {
      if (event.node) {
        this.toolbarService.updatePosition(event.node.id);
      }
    });

    this.engine.eventBus.on('node:resized', (event: any) => {
      if (event.node) {
        this.toolbarService.updatePosition(event.node.id);
      }
    });

    // Hide all toolbars when diagram is cleared
    this.engine.eventBus.on('diagram:cleared', () => {
      this.toolbarService.hideAll();
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    this.toolbarService.hideAll();
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
