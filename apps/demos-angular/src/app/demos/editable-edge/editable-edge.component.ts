import { AfterViewInit, Component } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/renderer-angular';
import { markReady } from '../demo-ready';

/** Click the wire to select it, click its body to drop a waypoint, drag the
 *  waypoint — the route bends to follow. Every bend is undoable. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges"
      style="display:block; height:100vh" />
  `,
})
export class EditableEdgeComponent implements AfterViewInit {
  nodes = [
    { id: 'a', position: { x: 120, y: 180 }, size: { width: 150, height: 70 }, data: { label: 'A' } },
    { id: 'b', position: { x: 620, y: 180 }, size: { width: 150, height: 70 }, data: { label: 'B' } },
  ];
  edges = [{ id: 'e1', source: 'a', target: 'b' }];
  ngAfterViewInit() { markReady(); }
}
