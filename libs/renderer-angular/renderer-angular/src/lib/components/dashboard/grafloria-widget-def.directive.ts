import { Directive, TemplateRef, inject, input } from '@angular/core';
import type { DashboardWidgetSpec } from '@grafloria/element';

/** Template context for `<ng-template grafloriaWidget>` widget templates. */
export interface GrafloriaWidgetTemplateContext {
  $implicit: DashboardWidgetSpec;
  data: Record<string, unknown>;
}

/**
 * Declarative dashboard widgets — the node-template idiom applied to boards:
 *
 * ```html
 * <grafloria-dashboard [views]="views">
 *   <ng-template grafloriaWidget="orders" let-widget let-data="data">
 *     <app-orders-card [orders]="data['orders']" />
 *   </ng-template>
 * </grafloria-dashboard>
 * ```
 *
 * A widget whose `kind` matches a template renders through it — full Angular
 * change detection, components, pipes, and event handlers. Kinds without a
 * template fall back to the kit's built-in painters
 * (kpi / line / bar / donut / funnel / table). `grafloriaWidget` with no value
 * is the wildcard for any kind without an exact template.
 */
@Directive({ selector: 'ng-template[grafloriaWidget]' })
export class GrafloriaWidgetDefDirective {
  /** Widget `kind` this template renders; empty string = wildcard fallback. */
  readonly kind = input<string>('', { alias: 'grafloriaWidget' });

  readonly templateRef = inject<TemplateRef<GrafloriaWidgetTemplateContext>>(TemplateRef);

  static ngTemplateContextGuard(
    _dir: GrafloriaWidgetDefDirective,
    ctx: unknown
  ): ctx is GrafloriaWidgetTemplateContext {
    return true;
  }
}
