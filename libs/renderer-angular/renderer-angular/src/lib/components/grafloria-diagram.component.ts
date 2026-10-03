import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  inject,
  input,
  output,
} from '@angular/core';
import { render, type RenderSpec, type RenderOptions } from '@grafloria/element';
import type { DiagramInstance } from '@grafloria/renderer';
import { specKey } from '../spec-key';

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
export class GrafloriaDiagramComponent implements AfterViewInit, OnChanges, OnDestroy {
  /** Any kit spec — `erDiagram(...)`, `umlDiagram(...)`, `dashboard(...)`, or DSL text. */
  readonly spec = input.required<RenderSpec>();
  /** Options passed through to the underlying `createDiagram`. */
  readonly options = input<RenderOptions>({});
  /** The live DiagramInstance after mount. */
  readonly ready = output<DiagramInstance>();

  private readonly hostRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private instance?: DiagramInstance;
  private mountedKey = '';

  ngAfterViewInit(): void {
    this.mount();
  }

  /** A CHANGED spec or options replaces the diagram; an equal new one does not. */
  ngOnChanges(changes: SimpleChanges): void {
    if (!this.instance || !(changes['spec'] || changes['options'])) return;
    if (specKey(this.spec(), this.options()) !== this.mountedKey) this.mount();
  }

  private mount(): void {
    this.instance?.dispose();
    this.mountedKey = specKey(this.spec(), this.options());
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
