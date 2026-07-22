/** <grafloria-comment-panel> — the conversation list bound to the canvas's store. */
import { Component, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DiagramCanvasComponent } from './diagram-canvas.component';
import { GrafloriaCommentPanelComponent } from './grafloria-comment-panel.component';
import type { NodeSpec } from '@grafloria/renderer';

describe('<grafloria-comment-panel>', () => {
  it('lists a thread, emits selection, and live-hides it on resolve', async () => {
    @Component({
      imports: [DiagramCanvasComponent, GrafloriaCommentPanelComponent],
      template: `
        <grafloria-diagram-canvas #canvas style="display:block;width:400px;height:300px"
          [viewport]="{ x: 0, y: 0, width: 400, height: 300 }" [zoom]="1"
          [(nodes)]="nodes" [comments]="true" />
        @if (canvas.getCommentStore(); as store) {
          <grafloria-comment-panel [store]="store" (threadSelect)="selections.push($event)" />
        }
      `,
    })
    class Host {
      canvas = viewChild.required<DiagramCanvasComponent>('canvas');
      selections: Array<string | null> = [];
      nodes = signal<NodeSpec[]>([{ id: 'a', position: { x: 50, y: 50 }, size: { width: 100, height: 50 } }]);
    }
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges(); // canvas mounts, store exists
    fixture.detectChanges(); // @if picks the store up, panel mounts
    const el = fixture.nativeElement as HTMLElement;
    const store = fixture.componentInstance.canvas().getCommentStore()!;

    const threadId = store.createThread({ kind: 'node', id: 'a' }, 'looks wrong');
    await new Promise((r) => setTimeout(r, 20));
    expect(el.textContent).toContain('looks wrong');

    (el.querySelector('[role="complementary"] button') as HTMLElement).click();
    expect(fixture.componentInstance.selections).toContain(threadId);

    store.resolve(threadId);
    await new Promise((r) => setTimeout(r, 20));
    expect(el.textContent).not.toContain('looks wrong');
    fixture.destroy();
  });
});
