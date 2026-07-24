import { AfterViewInit, Component } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/angular';
import { markReady } from '../demo-ready';

/** An edge label straight from the spec — drag a node and the label rides its
 *  wire; double-click it (on the canvas) to edit in place. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges"
      style="display:block; height:100vh" />
  `,
})
export class EdgeLabelsComponent implements AfterViewInit {
  nodes = [
    { id: 'a', position: { x: 120, y: 160 }, size: { width: 150, height: 70 }, label: 'Service A' },
    { id: 'b', position: { x: 560, y: 160 }, size: { width: 150, height: 70 }, label: 'Service B' },
  ];
  edges = [{ id: 'e1', source: 'a', target: 'b', type: 'direct', label: 'depends on' }];
  ngAfterViewInit() { markReady(); }
}
