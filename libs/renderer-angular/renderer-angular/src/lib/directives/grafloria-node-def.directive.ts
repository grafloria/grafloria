import { Directive, TemplateRef, inject, input } from '@angular/core';
import type { DiagramEngine, NodeModel, GroupModel } from '@grafloria/engine';

/**
 * Template context for `<ng-template grafloriaNode>` custom-node templates.
 *
 * `$implicit` is the live model, so `let-node` gives templates the full
 * NodeModel surface; `data` is the free-form user payload for the common case.
 */
export interface GrafloriaNodeTemplateContext {
  $implicit: NodeModel | GroupModel;
  engine: DiagramEngine | undefined;
  data: Record<string, unknown>;
}

/**
 * Declarative, Angular-native custom nodes — the template idiom:
 *
 * ```html
 * <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges">
 *   <ng-template grafloriaNode="card" let-node let-data="data">
 *     <div class="card">
 *       <h4>{{ data['title'] }}</h4>
 *       <p>{{ data['subtitle'] }}</p>
 *     </div>
 *   </ng-template>
 * </grafloria-diagram-canvas>
 * ```
 *
 * A node whose `type` matches a template is rendered by THAT template in the
 * HTML layer — full Angular change detection, pipes, directives, and bindings,
 * no string micro-templates and no component registry required. In controlled
 * mode the canvas flags matching specs as `custom` automatically, so declaring
 * the template is the whole integration.
 *
 * `grafloriaNode` with no value (`<ng-template grafloriaNode>`) is the
 * wildcard: it renders any HTML-layer node whose type has no exact template.
 */
@Directive({ selector: 'ng-template[grafloriaNode]' })
export class GrafloriaNodeDefDirective {
  /** Node `type` this template renders; empty string = wildcard fallback. */
  readonly type = input<string>('', { alias: 'grafloriaNode' });

  readonly templateRef = inject<TemplateRef<GrafloriaNodeTemplateContext>>(TemplateRef);

  static ngTemplateContextGuard(
    _dir: GrafloriaNodeDefDirective,
    ctx: unknown
  ): ctx is GrafloriaNodeTemplateContext {
    return true;
  }
}
