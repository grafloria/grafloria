import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, Input, OnChanges, OnDestroy, OnInit, SimpleChanges, TemplateRef, ViewChild, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { DiagramEngine, DiagramModel, LinkModel } from '@grafloria/engine';
import { Subject, fromEvent } from 'rxjs';
import { takeUntil, throttleTime } from 'rxjs/operators';

// Reuse the node toolbar's styling/animation contracts verbatim — an edge
// toolbar that looked different from a node toolbar would just be a bug.
import type { ToolbarStyleConfig, ToolbarAnimationConfig } from '../node-toolbar/node-toolbar.component';
import { LinkActionContext, LinkToolbarAction } from './link-toolbar-actions';
import { Point, RenderedLinkPath, clamp01 } from './rendered-link-path';

/**
 * Wave 3 (Edges & links), Card B — a floating, PATH-ANCHORED action layer.
 *
 * Mirrors NodeToolbarComponent, but an edge has no bounding box to hang off:
 * it is anchored to a FRACTION along the link (default the midpoint) and lifted
 * off the stroke along the path NORMAL, so it never sits on top of the line it
 * acts on. It re-anchors itself whenever the route changes — pan, zoom, a node
 * drag that reroutes the edge, a waypoint edit.
 *
 * Geometry comes from RenderedLinkPath (the drawn <path>, or the per-frame
 * point polyline), never from LinkModel.segments — see that file for why.
 *
 * @example
 * ```html
 * <grafloria-link-toolbar
 *   [link]="hoveredLink" [engine]="engine"
 *   [viewport]="viewport" [zoom]="zoom" [anchor]="0.5">
 * </grafloria-link-toolbar>
 * ```
 */
@Component({
  selector: 'grafloria-link-toolbar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      #toolbar
      class="grafloria-link-toolbar"
      role="toolbar"
      [attr.aria-label]="ariaLabel"
      [attr.aria-hidden]="!isVisible"
      [attr.data-link-id]="link?.id"
      [class.visible]="isVisible"
      [class.animated]="animation?.enabled !== false"
      [style.transform]="transform"
      [style.opacity]="isVisible ? 1 : 0"
      [style.pointer-events]="isVisible ? 'all' : 'none'"
      [style.--toolbar-bg]="styleConfig?.backgroundColor"
      [style.--toolbar-border]="styleConfig?.borderColor"
      [style.--toolbar-radius]="styleConfig?.borderRadius"
      [style.--toolbar-shadow]="styleConfig?.boxShadow"
      [style.--toolbar-padding]="styleConfig?.padding"
      [style.--toolbar-z]="styleConfig?.zIndex"
      [style.--toolbar-transition]="animation?.duration || '0.15s'"
      (mouseenter)="onPointerEnter()"
      (mouseleave)="onPointerLeave()"
      (keydown)="handleKeyDown($event)"
    >
      @if (!customTemplate) {
        <div class="toolbar-content" role="group">
          @for (action of visibleActions; track action.id; let idx = $index) {
            <button
              type="button"
              class="toolbar-button"
              [attr.aria-label]="action.tooltip || action.label"
              [attr.aria-disabled]="action.disabled"
              [attr.data-action-id]="action.id"
              [attr.tabindex]="idx === focusedActionIndex ? 0 : -1"
              [disabled]="action.disabled"
              [title]="action.tooltip || action.label"
              (click)="handleActionClick(action, $event)"
              (focus)="focusedActionIndex = idx"
            >
              @if (action.icon) {
                <i [class]="action.icon" aria-hidden="true"></i>
              }
              <span>{{ action.label }}</span>
            </button>
          }
        </div>
      }

      @if (customTemplate) {
        <ng-container
          *ngTemplateOutlet="customTemplate; context: { $implicit: link, actions: visibleActions, context: actionContext }">
        </ng-container>
      }
    </div>
  `,
  styles: [`
    .grafloria-link-toolbar {
      position: absolute;
      top: 0;
      left: 0;
      display: flex;
      gap: 4px;
      background: var(--toolbar-bg, var(--grafloria-toolbar-bg, white));
      border: 1px solid var(--toolbar-border, var(--grafloria-toolbar-border, #e2e8f0));
      border-radius: var(--toolbar-radius, var(--grafloria-toolbar-radius, 8px));
      box-shadow: var(--toolbar-shadow, var(--grafloria-toolbar-shadow, 0 4px 6px rgba(0, 0, 0, 0.1)));
      padding: var(--toolbar-padding, var(--grafloria-toolbar-padding, 2px));
      z-index: var(--toolbar-z, var(--grafloria-toolbar-z, 1000));
      outline: none;
      white-space: nowrap;
    }

    .grafloria-link-toolbar.animated {
      transition: opacity var(--toolbar-transition, 0.15s) ease;
    }

    .grafloria-link-toolbar:focus-within {
      outline: 2px solid var(--grafloria-focus-color, #667eea);
      outline-offset: 2px;
    }

    .toolbar-content {
      display: flex;
      gap: 2px;
    }

    .toolbar-button {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 4px 8px;
      background: transparent;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      line-height: 1.4;
      color: var(--grafloria-toolbar-text, #334155);
      transition: background-color 0.15s ease;
      white-space: nowrap;
    }

    .toolbar-button:hover:not(:disabled) {
      background: var(--grafloria-toolbar-hover, #f1f5f9);
    }

    .toolbar-button:active:not(:disabled) {
      background: var(--grafloria-toolbar-active, #e2e8f0);
    }

    .toolbar-button:focus {
      outline: 2px solid var(--grafloria-focus-color, #667eea);
      outline-offset: -2px;
    }

    .toolbar-button:disabled,
    .toolbar-button[aria-disabled="true"] {
      opacity: 0.5;
      cursor: not-allowed;
    }

    @media (prefers-reduced-motion: reduce) {
      .grafloria-link-toolbar,
      .toolbar-button {
        transition: none;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LinkToolbarComponent implements OnInit, OnChanges, OnDestroy {
  /** The link this toolbar acts on. */
  @Input() link!: LinkModel;
  @Input() engine!: DiagramEngine;

  /** Canvas container the toolbar is positioned inside (and measured against). */
  @Input() canvasElement?: HTMLElement;

  /** Same viewport/zoom the canvas renders with — the screen-space fallback. */
  @Input() viewport: { x: number; y: number; width: number; height: number } = {
    x: 0, y: 0, width: 800, height: 600,
  };
  @Input() zoom = 1.0;

  /** Fraction along the path to glue the toolbar to (0 = source, 1 = target). */
  @Input() anchor = 0.5;

  /** Screen-px lift along the path normal, so the buttons clear the stroke. */
  @Input() offset = 22;

  @Input() actions: LinkToolbarAction[] = [];
  @Input() customTemplate?: TemplateRef<any>;
  @Input() visible = true;
  @Input() styleConfig?: ToolbarStyleConfig;
  @Input() animation?: ToolbarAnimationConfig;
  @Input() ariaLabel = 'Link actions';

  readonly actionClicked = output<{ action: LinkToolbarAction; context: LinkActionContext }>();
  readonly positionUpdated = output<Point>();
  /** Emits while the pointer is over the toolbar — lets the host keep it alive
   *  when the pointer leaves the link itself to reach for a button. */
  readonly pointerOverChange = output<boolean>();

  @ViewChild('toolbar', { read: ElementRef }) toolbarRef?: ElementRef<HTMLDivElement>;

  isVisible = false;
  transform = '';
  focusedActionIndex = 0;

  /** Last resolved anchor, in world space — the action context's `point`. */
  private anchorPoint: Point | null = null;
  private anchorTangent: Point | null = null;

  private destroy$ = new Subject<void>();
  private engineListeners: Array<{ event: string; handler: (...args: any[]) => void }> = [];
  /** DiagramModel.on() returns its own unsubscribe fn — there is no `off()`. */
  private diagramUnsubscribers: Array<() => void> = [];
  private positionUpdatePending = false;
  private lastPosition: Point = { x: 0, y: 0 };

  constructor(private cdr: ChangeDetectorRef, private host: ElementRef<HTMLElement>) {}

  ngOnInit(): void {
    this.isVisible = this.visible;
    this.subscribeToEngine();
    // Position after the first paint, when the toolbar has a measurable size.
    setTimeout(() => this.updatePosition(), 0);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible']) {
      this.isVisible = this.visible;
    }
    if (changes['engine'] && !changes['engine'].firstChange) {
      this.unsubscribe();
      this.subscribeToEngine();
    }
    // Any of these moves the anchor: a different link, a different fraction,
    // a pan/zoom, a resized viewport.
    if (
      changes['link'] || changes['anchor'] || changes['offset'] ||
      changes['viewport'] || changes['zoom'] || changes['visible']
    ) {
      this.schedulePositionUpdate();
    }
    this.cdr.markForCheck();
  }

  ngOnDestroy(): void {
    this.unsubscribe();
    this.destroy$.next();
    this.destroy$.complete();
  }

  get visibleActions(): LinkToolbarAction[] {
    const ctx = this.actionContext;
    return (this.actions ?? []).filter(action => {
      if (action.hidden) return false;
      if (action.visible && ctx && !action.visible(ctx)) return false;
      return true;
    });
  }

  /** What every button is handed: the link, WHERE on it, and in which direction. */
  get actionContext(): LinkActionContext | null {
    if (!this.link || !this.engine) return null;
    return {
      link: this.link,
      engine: this.engine,
      t: clamp01(this.anchor),
      point: this.anchorPoint ?? { x: 0, y: 0 },
      tangent: this.anchorTangent ?? undefined,
    };
  }

  handleActionClick(action: LinkToolbarAction, event?: Event): void {
    // The canvas listens for clicks on itself (select/deselect) — a toolbar
    // press must not fall through and change the selection under the toolbar.
    event?.stopPropagation();
    if (action.disabled) return;

    const ctx = this.actionContext;
    if (!ctx) return;

    try {
      action.onClick(ctx);
      this.actionClicked.emit({ action, context: ctx });
    } catch (error) {
      console.error('LinkToolbar: action handler failed', error);
    }
  }

  handleKeyDown(event: KeyboardEvent): void {
    const actions = this.visibleActions;
    if (actions.length === 0) return;

    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        this.focusAction((this.focusedActionIndex + 1) % actions.length);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        this.focusAction((this.focusedActionIndex - 1 + actions.length) % actions.length);
        break;
      case 'Home':
        event.preventDefault();
        this.focusAction(0);
        break;
      case 'End':
        event.preventDefault();
        this.focusAction(actions.length - 1);
        break;
      case 'Enter':
      case ' ': {
        event.preventDefault();
        const action = actions[this.focusedActionIndex];
        if (action) this.handleActionClick(action);
        break;
      }
      case 'Escape':
        event.preventDefault();
        this.isVisible = false;
        this.cdr.markForCheck();
        break;
    }
  }

  onPointerEnter(): void {
    this.pointerOverChange.emit(true);
  }

  onPointerLeave(): void {
    this.pointerOverChange.emit(false);
  }

  /**
   * Re-anchor to the CURRENT rendered route.
   *
   * Runs the whole chain: rendered path → point + normal at `anchor` → screen
   * px → centred, normal-offset transform. Any missing link in that chain hides
   * the toolbar rather than parking it at (0, 0).
   */
  updatePosition(): void {
    try {
      if (!this.link || !this.visible) {
        this.applyHidden();
        return;
      }

      const canvasEl = this.getCanvasElement();
      const path = RenderedLinkPath.forLink(this.link, canvasEl);
      if (!path.isValid) {
        this.applyHidden();
        return;
      }

      const t = clamp01(this.anchor);
      const world = path.pointAt(t);
      if (!world) {
        this.applyHidden();
        return;
      }
      this.anchorPoint = world;
      this.anchorTangent = path.tangentAt(t);

      const screen = this.worldToScreen(world, canvasEl);
      const normal = path.normalAt(t) ?? { x: 0, y: -1 };

      // Lift OFF the stroke along the normal (screen px — the normal is a unit
      // vector, and the world→screen map is a uniform scale, so direction survives).
      const size = this.toolbarSize();
      let x = screen.x + normal.x * this.offset - size.width / 2;
      let y = screen.y + normal.y * this.offset - size.height / 2;

      ({ x, y } = this.clampToCanvas(x, y, size, canvasEl));

      this.lastPosition = { x, y };
      this.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      this.isVisible = this.visible;
      this.cdr.detectChanges();
      this.positionUpdated.emit({ x, y });
    } catch (error) {
      console.error('LinkToolbar: failed to update position', error);
      this.transform = `translate(${this.lastPosition.x}px, ${this.lastPosition.y}px)`;
      this.cdr.detectChanges();
    }
  }

  // -------------------------------------------------------------- positioning

  /**
   * World → container-local px.
   *
   * Truth #1 is the viewBox the renderer just wrote on the live <svg>: reading
   * it back cannot drift from what was actually drawn. Truth #2 (no SVG yet, or
   * an unlaid-out element as in jsdom) is the canvas' own screen↔world contract
   * — the exact inverse of DiagramCanvasComponent.clientToWorld, so the toolbar
   * lands where hit-testing says the link is.
   */
  private worldToScreen(p: Point, canvasEl: HTMLElement | null): Point {
    const svg = canvasEl?.querySelector('svg.grafloria-diagram') as SVGSVGElement | null;
    if (svg && canvasEl) {
      const vb = (svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
      const svgRect = svg.getBoundingClientRect();
      const canvasRect = canvasEl.getBoundingClientRect();
      if (
        vb.length === 4 && vb.every(n => isFinite(n)) && vb[2] > 0 && vb[3] > 0 &&
        svgRect.width > 0 && svgRect.height > 0
      ) {
        // SVG's default preserveAspectRatio="xMidYMid meet": uniform scale, centred.
        const scale = Math.min(svgRect.width / vb[2], svgRect.height / vb[3]);
        const padX = (svgRect.width - vb[2] * scale) / 2;
        const padY = (svgRect.height - vb[3] * scale) / 2;
        return {
          x: (svgRect.left - canvasRect.left) + padX + (p.x - vb[0]) * scale,
          y: (svgRect.top - canvasRect.top) + padY + (p.y - vb[1]) * scale,
        };
      }
    }

    // Fallback: inverse of the canvas' clientToWorld (zoom about the viewport centre).
    const zoom = this.zoom || 1;
    const vbWidth = this.viewport.width / zoom;
    const vbHeight = this.viewport.height / zoom;
    const vbX = this.viewport.x + this.viewport.width / 2 - vbWidth / 2;
    const vbY = this.viewport.y + this.viewport.height / 2 - vbHeight / 2;
    return { x: (p.x - vbX) * zoom, y: (p.y - vbY) * zoom };
  }

  private toolbarSize(): { width: number; height: number } {
    const el = this.toolbarRef?.nativeElement;
    if (!el) return { width: 0, height: 0 };
    const rect = el.getBoundingClientRect();
    // jsdom (and a not-yet-laid-out element) reports 0×0 — centring on 0 is
    // correct there, and the real browser gives real numbers.
    return { width: rect.width || 0, height: rect.height || 0 };
  }

  /** Keep the toolbar inside the canvas when the anchor is near an edge. */
  private clampToCanvas(
    x: number,
    y: number,
    size: { width: number; height: number },
    canvasEl: HTMLElement | null
  ): Point {
    if (!canvasEl) return { x, y };
    const rect = canvasEl.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0)) return { x, y };

    const margin = 4;
    return {
      x: Math.max(margin, Math.min(x, rect.width - size.width - margin)),
      y: Math.max(margin, Math.min(y, rect.height - size.height - margin)),
    };
  }

  private applyHidden(): void {
    if (this.isVisible) {
      this.isVisible = false;
      this.cdr.detectChanges();
    }
  }

  private getCanvasElement(): HTMLElement | null {
    if (this.canvasElement) return this.canvasElement;
    const host = this.host?.nativeElement;
    return (
      (host?.closest?.('.diagram-canvas-container') as HTMLElement | null) ??
      (document.querySelector('.diagram-canvas-container') as HTMLElement | null)
    );
  }

  // --------------------------------------------------------------- reactivity

  private schedulePositionUpdate(): void {
    if (this.positionUpdatePending) return;
    this.positionUpdatePending = true;

    const run = () => {
      this.positionUpdatePending = false;
      this.updatePosition();
    };
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(run);
    } else {
      setTimeout(run, 0);
    }
  }

  /**
   * Anything that can move the RENDERED route moves the toolbar: pan, zoom, a
   * node drag (which reroutes the edges attached to it), a waypoint/label edit.
   * Consumed READ-ONLY — this component never writes interaction state.
   */
  private subscribeToEngine(): void {
    if (!this.engine?.eventBus) return;

    const reposition = () => this.schedulePositionUpdate();
    for (const event of ['canvas:zoom', 'canvas:pan', 'node:moved', 'node:resized']) {
      this.engine.eventBus.on(event, reposition);
      this.engineListeners.push({ event, handler: reposition });
    }

    const onDiagramChanged = ({ newDiagram }: { newDiagram: DiagramModel | null }) => {
      this.unsubscribeDiagram();
      this.subscribeToDiagram(newDiagram ?? this.engine.getDiagram());
      this.schedulePositionUpdate();
    };
    this.engine.eventBus.on('diagram:changed', onDiagramChanged);
    this.engineListeners.push({ event: 'diagram:changed', handler: onDiagramChanged });

    this.subscribeToDiagram(this.engine.getDiagram());

    fromEvent(window, 'resize')
      .pipe(throttleTime(100), takeUntil(this.destroy$))
      .subscribe(() => this.updatePosition());
  }

  private subscribeToDiagram(diagram: DiagramModel | null): void {
    if (!diagram?.on) return;
    const reposition = () => this.schedulePositionUpdate();
    for (const event of ['link:changed', 'node:changed', 'link:added', 'link:removed']) {
      this.diagramUnsubscribers.push(diagram.on(event, reposition));
    }
  }

  private unsubscribeDiagram(): void {
    for (const unsubscribe of this.diagramUnsubscribers) {
      try {
        unsubscribe();
      } catch {
        /* a disposed diagram may already have dropped its emitter */
      }
    }
    this.diagramUnsubscribers = [];
  }

  private unsubscribe(): void {
    if (this.engine?.eventBus) {
      for (const { event, handler } of this.engineListeners) {
        this.engine.eventBus.off(event, handler);
      }
    }
    this.engineListeners = [];
    this.unsubscribeDiagram();
  }

  private focusAction(index: number): void {
    this.focusedActionIndex = index;
    this.cdr.detectChanges();
    const buttons = this.toolbarRef?.nativeElement.querySelectorAll('.toolbar-button');
    const btn = buttons?.[index] as HTMLElement | undefined;
    btn?.focus();
  }
}
