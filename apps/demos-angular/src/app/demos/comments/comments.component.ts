import { AfterViewInit, Component, viewChild } from '@angular/core';
import { DiagramCanvasComponent, GrafloriaCommentPanelComponent } from '@grafloria/renderer-angular';
import type { CommentStore } from '@grafloria/engine';
import { markReady } from '../demo-ready';

/** Anchored comment threads: [comments]="true" turns the capability on; the
 *  conversation panel binds to the canvas's own CommentStore. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent, GrafloriaCommentPanelComponent],
  templateUrl: './comments.component.html',
})
export class CommentsComponent implements AfterViewInit {
  canvas = viewChild.required(DiagramCanvasComponent);
  store: CommentStore | null = null;
  nodes = [
    { id: 'design', position: { x: 80, y: 120 },  size: { width: 150, height: 66 }, data: { label: 'Design' } },
    { id: 'review', position: { x: 330, y: 120 }, size: { width: 150, height: 66 }, data: { label: 'Review' } },
    { id: 'ship',   position: { x: 580, y: 120 }, size: { width: 150, height: 66 }, data: { label: 'Ship' } },
  ];
  edges = [
    { id: 'e1', source: 'design', target: 'review' },
    { id: 'e2', source: 'review', target: 'ship' },
  ];
  ngAfterViewInit() {
    this.store = this.canvas().getCommentStore();
    if (this.store) {
      const t = this.store.createThread({ kind: 'node', id: 'review' }, 'Can we tighten the hero copy?');
      this.store.reply(t, 'On it — draft by Friday.');
    }
    markReady();
  }
}
