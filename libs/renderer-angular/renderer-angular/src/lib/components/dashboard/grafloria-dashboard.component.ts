import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  ViewContainerRef,
  contentChildren,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  untracked,
  type EmbeddedViewRef,
  type TemplateRef,
} from '@angular/core';
import {
  dashboard,
  render,
  defaultWidgetRenderer,
  type DashboardHandle,
  type DashboardOptions,
  type DashboardSnapshot,
  type DashboardViewSpec,
  type DashboardWidgetSpec,
} from '@grafloria/element';
import type { DiagramInstance } from '@grafloria/renderer';
import {
  GrafloriaWidgetDefDirective,
  type GrafloriaWidgetTemplateContext,
} from './grafloria-widget-def.directive';

/**
 * `<grafloria-dashboard>` — the dashboard kit, the Angular way.
 *
 * The kit is DATA-FIRST: `[views]` (or `[widgets]` for a single unnamed view)
 * declare the whole board, the kit wires the pack grid, gestures, and undo.
 * This component adds the Angular idioms on top:
 *
 * ```html
 * <grafloria-dashboard [views]="views" [(activeView)]="tab"
 *     (ready)="handle = $event" (layoutChange)="persist($event)">
 *   <ng-template grafloriaWidget="orders" let-data="data">…</ng-template>
 * </grafloria-dashboard>
 * ```
 *
 * `snapshot()` returns `toJSON()` — feed it back to `[views]`/`[options]` to
 * rebuild the identical board (the kit's round-trip contract).
 */
@Component({
  selector: 'grafloria-dashboard',
  template: '',
  styles: [':host { display: block; position: relative; }'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GrafloriaDashboardComponent implements AfterViewInit, OnDestroy {
  /** Multi-view (tabbed) board. Mutually exclusive with `widgets`. */
  readonly views = input<DashboardViewSpec[] | undefined>(undefined);
  /** Single-view shorthand. */
  readonly widgets = input<DashboardWidgetSpec[] | undefined>(undefined);
  /** Board options: columns, gap, sizing, rtl, responsive, binder… */
  readonly options = input<Partial<DashboardOptions>>({});
  /** Two-way active view id — the tab pattern. */
  readonly activeView = model<string | undefined>(undefined);

  /** The typed DashboardHandle, once the board is live. */
  readonly ready = output<DashboardHandle>();
  /** Mirrors the kit's committed gestures (drag, resize, add, remove). */
  readonly layoutChange = output<{ viewId: string; widgets: DashboardWidgetSpec[] }>();

  private readonly widgetDefs = contentChildren(GrafloriaWidgetDefDirective);
  private readonly widgetDefMap = computed(() => {
    const map = new Map<string, TemplateRef<GrafloriaWidgetTemplateContext>>();
    for (const def of this.widgetDefs()) map.set(def.kind(), def.templateRef);
    return map;
  });

  private readonly hostRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly vcr = inject(ViewContainerRef);
  private instance?: DiagramInstance;
  private handle?: DashboardHandle;
  private readonly embedded: EmbeddedViewRef<GrafloriaWidgetTemplateContext>[] = [];

  constructor() {
    // [(activeView)] → handle.showView; the boot value is applied on mount.
    effect(() => {
      const view = this.activeView();
      untracked(() => {
        if (view && this.handle && this.handle.activeView !== view) {
          this.handle.showView(view);
        }
      });
    });
  }

  ngAfterViewInit(): void {
    const spec = dashboard({
      ...this.options(),
      ...(this.views() ? { views: this.views() } : {}),
      ...(!this.views() && this.widgets() ? { widgets: this.widgets() } : {}),
      renderWidget: (widget, host) => this.paintWidget(widget, host),
      onLayoutChange: (viewId, widgets) => this.layoutChange.emit({ viewId, widgets }),
    });
    this.instance = render(spec, this.hostRef.nativeElement);
    this.handle = spec.handle;

    const requested = this.activeView();
    if (requested && this.handle.activeView !== requested) {
      this.handle.showView(requested);
    } else {
      // Reflecting the boot view into the two-way model during the SAME change
      // detection pass is NG0100 — defer one microtask.
      const handle = this.handle;
      queueMicrotask(() => this.activeView.set(handle.activeView));
    }

    this.ready.emit(this.handle);
  }

  /** The live handle (undefined before the first paint). */
  getHandle(): DashboardHandle | undefined {
    return this.handle;
  }

  /** `toJSON()` — the whole board as plain data, ready to feed back in. */
  snapshot(): DashboardSnapshot | null {
    return this.handle?.toJSON() ?? null;
  }

  private paintWidget(widget: DashboardWidgetSpec, host: HTMLElement): void {
    const map = this.widgetDefMap();
    const tpl = map.get(widget.kind ?? '') ?? map.get('');
    if (!tpl) {
      defaultWidgetRenderer(widget, host);
      return;
    }
    const view = this.vcr.createEmbeddedView(tpl, {
      $implicit: widget,
      data: (widget.data ?? {}) as Record<string, unknown>,
    });
    view.detectChanges();
    const wrapper = host.ownerDocument.createElement('div');
    wrapper.style.cssText = 'width:100%;height:100%';
    for (const node of view.rootNodes as Node[]) wrapper.appendChild(node);
    host.replaceChildren(wrapper);
    this.embedded.push(view);
  }

  ngOnDestroy(): void {
    for (const view of this.embedded) view.destroy();
    this.embedded.length = 0;
    this.instance?.dispose();
    this.instance = undefined;
    this.handle = undefined;
  }
}
