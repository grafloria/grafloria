import { AfterViewInit, Component } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/renderer-angular';
import { markReady } from '../demo-ready';

/** Real finger input: one finger pans, one finger on a node drags it, a tap
 *  selects, and two fingers pinch-zoom — all through the same touch pipeline a
 *  phone uses. touch-action:none keeps the browser from eating the gesture. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <div style="padding:8px 24px;font:12px/1.5 ui-monospace,monospace;opacity:.85;border-bottom:1px solid rgba(127,127,127,.25)">drive with a finger: pan, pinch, tap, drag</div>
    <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges"
      style="display:block;height:calc(100vh - 40px);touch-action:none" />
  `,
})
export class TouchDeviceComponent implements AfterViewInit {
  nodes: any[] = [
    { id: 'a', position: { x: 500, y: 120 }, size: { width: 120, height: 60 }, label: 'A' },
    { id: 'b', position: { x: 500, y: 320 }, size: { width: 120, height: 60 }, label: 'B' },
  ];
  edges: any[] = [];
  ngAfterViewInit() { markReady(); }
}
