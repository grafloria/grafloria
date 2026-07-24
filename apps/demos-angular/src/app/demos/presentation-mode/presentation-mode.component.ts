import { AfterViewInit, Component, viewChild } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/angular';
import { InMemoryViewportChannel, presentTo, followPresenter, lockDocument } from '@grafloria/element';
import { markReady } from '../demo-ready';

/** Presentation mode: the presenter drives the camera and every follower's
 *  viewport follows — the same world region at the same zoom, each keeping its
 *  own canvas size. The follower is read-only from the moment it mounts (the
 *  document lock drives the engine's real mode), yet its camera gestures stay
 *  live, because following is camera work, not a document edit. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <div style="font-size:12px;opacity:.8;padding:10px 24px;border-bottom:1px solid rgba(127,127,127,.25)">
      The presenter drives the camera; the follower's viewport follows — read-only from the moment it mounts.
    </div>
    <div style="display:flex; height:calc(100vh - 45px)">
      <div style="flex:1; min-width:0; position:relative; border-right:2px solid rgba(127,127,127,.35)">
        <span style="position:absolute;top:8px;left:8px;z-index:2;font:11px ui-monospace,Menlo,monospace;background:rgba(220,38,38,.9);color:#fff;padding:2px 8px;border-radius:4px">presenter</span>
        <grafloria-diagram-canvas #a [(nodes)]="nodesA" [(edges)]="edgesA" [plugins]="true" style="display:block; height:100%" />
      </div>
      <div style="flex:1; min-width:0; position:relative">
        <span style="position:absolute;top:8px;left:8px;z-index:2;font:11px ui-monospace,Menlo,monospace;background:rgba(37,99,235,.85);color:#fff;padding:2px 8px;border-radius:4px">follower (read-only)</span>
        <grafloria-diagram-canvas #b [(nodes)]="nodesB" [(edges)]="edgesB" style="display:block; height:100%" />
      </div>
    </div>
  `,
})
export class PresentationModeComponent implements AfterViewInit {
  canvasA = viewChild.required<DiagramCanvasComponent>('a');
  canvasB = viewChild.required<DiagramCanvasComponent>('b');

  private spec = () => ([
    { id: 'a', label: 'A', position: { x: 60,  y: 80 },  size: { width: 130, height: 60 } },
    { id: 'b', label: 'B', position: { x: 320, y: 80 },  size: { width: 130, height: 60 } },
    { id: 'c', label: 'C', position: { x: 190, y: 240 }, size: { width: 130, height: 60 } },
  ]);
  nodesA = this.spec();
  edgesA = [{ id: 'e1', source: 'a', target: 'b' }, { id: 'e2', source: 'a', target: 'c' }];
  nodesB = this.spec();
  edgesB = [{ id: 'e1', source: 'a', target: 'b' }, { id: 'e2', source: 'a', target: 'c' }];

  private channel = new InMemoryViewportChannel();

  ngAfterViewInit() {
    const A = this.canvasA(), B = this.canvasB();
    const hostA = { viewport: A.viewportController()!, render: () => A.scheduleRender() };
    const hostB = { viewport: B.viewportController()!, render: () => B.scheduleRender() };
    presentTo(hostA as never, this.channel, { presenterId: 'ana', throttleMs: 0 });
    followPresenter(hostB as never, this.channel, { ignorePresenterId: 'bo' });

    // The follower mounts with the document lock ON — a real read-only mode.
    const engB = B.activeEngine();
    if (engB) lockDocument(engB, true);

    // Frame the content in the presenter; the broadcast frames the follower.
    A.fitToContent(60);
    markReady();
  }
}
