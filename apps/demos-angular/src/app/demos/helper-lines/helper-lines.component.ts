import { AfterViewInit, Component, viewChild } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/angular';
import { markReady } from '../demo-ready';

/** Snaplines: dragging a node near another's edge/centre snaps it into alignment
 *  and paints a dashed guide; three evenly-placed nodes yield an equal-spacing
 *  guide. The only wiring is setInteractionConfig({ enableHelperLines: true }) —
 *  the engine's SnapController drives the live drag. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <div style="padding:8px 24px;font:12px/1.5 ui-monospace,monospace;opacity:.8;border-bottom:1px solid rgba(127,127,127,.25)">drag the lower-right node toward the others — dashed guides appear as edges align</div>
    <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges" style="display:block;height:calc(100vh - 40px)" />
  `,
})
export class HelperLinesComponent implements AfterViewInit {
  canvas = viewChild.required(DiagramCanvasComponent);
  nodes: any[] = [
    { id: 'anchor', position: { x: 200, y: 120 }, size: { width: 120, height: 60 }, label: 'anchor' },
    { id: 'below', position: { x: 200, y: 320 }, size: { width: 120, height: 60 }, label: 'below' },
    { id: 'mover', position: { x: 460, y: 500 }, size: { width: 120, height: 60 }, label: 'drag me' },
  ];
  edges: any[] = [];

  ngAfterViewInit() {
    this.canvas().activeEngine()?.setInteractionConfig({ enableHelperLines: true } as never);
    markReady();
  }
}
