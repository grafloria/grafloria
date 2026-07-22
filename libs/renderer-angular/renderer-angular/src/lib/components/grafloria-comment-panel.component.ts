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
import type { CommentStore } from '@grafloria/engine';
import { CommentPanelView, type CommentPanelOptions } from '@grafloria/renderer';

/**
 * `<grafloria-comment-panel>` — the conversation UI for a comment store:
 * thread list, unread markers, selection. Feed it the canvas's store:
 *
 * ```html
 * <grafloria-diagram-canvas #canvas [comments]="true" … />
 * <grafloria-comment-panel [store]="canvas.getCommentStore()"
 *                          (threadSelect)="focus($event)" />
 * ```
 */
@Component({
  selector: 'grafloria-comment-panel',
  template: '',
  styles: [':host { display: block; }'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GrafloriaCommentPanelComponent implements AfterViewInit, OnDestroy {
  readonly store = input.required<CommentStore>();
  readonly options = input<CommentPanelOptions>({});
  /** The selected thread id, or null when dismissed. */
  readonly threadSelect = output<string | null>();

  private readonly hostRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private panel?: CommentPanelView;
  private off?: () => void;

  ngAfterViewInit(): void {
    const store = this.store();
    this.panel = new CommentPanelView(this.hostRef.nativeElement, store, {
      ...this.options(),
      onSelect: (threadId) => {
        this.options().onSelect?.(threadId);
        this.threadSelect.emit(threadId);
      },
    });
    this.off = store.onChange(() => this.panel?.update());
  }

  /** Programmatic selection (e.g. from a pin click). */
  select(threadId: string | null): void {
    this.panel?.select(threadId, { focus: true });
  }

  ngOnDestroy(): void {
    this.off?.();
    this.off = undefined;
    this.panel?.dispose();
    this.panel = undefined;
  }
}
