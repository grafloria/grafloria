import { AfterViewInit, Component } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/renderer-angular';
import { markReady } from '../demo-ready';

/** A Manhattan/orthogonal route that dodges an obstacle: the A→B edge declares
 *  router:'orthogonal' and bends in right-angle segments around the wall O that
 *  sits squarely on the straight line between them. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges"
      style="display:block; height:100vh" />
  `,
})
export class EdgeRoutingComponent implements AfterViewInit {
  nodes = [
    { id: 'a', position: { x: 80, y: 305 }, size: { width: 120, height: 60 }, label: 'A' },
    { id: 'b', position: { x: 840, y: 305 }, size: { width: 120, height: 60 }, label: 'B' },
    { id: 'o', position: { x: 430, y: 250 }, size: { width: 140, height: 170 }, label: 'obstacle' },
  ];
  edges = [{ id: 'e1', source: 'a', target: 'b', router: 'orthogonal' }];
  ngAfterViewInit() { markReady(); }
}
