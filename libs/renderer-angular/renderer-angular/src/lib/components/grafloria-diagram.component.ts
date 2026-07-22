import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  inject,
  input,
  output,
} from '@angular/core';
import { render, type RenderSpec, type RenderOptions } from '@grafloria/element';
import type { DiagramInstance } from '@grafloria/renderer';

/**
 * `<grafloria-diagram>` — the generic kit host. Any kit spec renders:
 *
 * ```ts
 * spec = erDiagram({ entities, relationships });        // or umlDiagram({...}),
 * ```
 * ```html
 * <grafloria-diagram [spec]="spec" (ready)="instance = $event" />
 * ```
 *
 * One component for every present and future kit — because every kit speaks
 * the same contract: a spec with nodes/edges/renderCustomNode/finalize that
 * `render()` mounts in one call.
 */
@Component({
  selector: 'grafloria-diagram',
  template: '',
  styles: [':host { display: block; position: relative; }'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GrafloriaDiagramComponent implements AfterViewInit, OnDestroy {
  /** Any kit spec — `erDiagram(...)`, `umlDiagram(...)`, `dashboard(...)`, or DSL text. */
  readonly spec = input.required<RenderSpec>();
  /** Options passed through to the underlying `createDiagram`. */
  readonly options = input<RenderOptions>({});
  /** The live DiagramInstance after mount. */
  readonly ready = output<DiagramInstance>();

  private readonly hostRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private instance?: DiagramInstance;

  ngAfterViewInit(): void {
    this.instance = render(this.spec(), this.hostRef.nativeElement, this.options());
    this.ready.emit(this.instance);
  }

  getInstance(): DiagramInstance | undefined {
    return this.instance;
  }

  ngOnDestroy(): void {
    this.instance?.dispose();
    this.instance = undefined;
  }
}
