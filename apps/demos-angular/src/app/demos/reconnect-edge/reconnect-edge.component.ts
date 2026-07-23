import { AfterViewInit, Component } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/renderer-angular';
import { markReady } from '../demo-ready';

/** Select the wire, then drag its endpoint handle from B onto C — the edge
 *  reconnects, undoably. Built-in behaviour; nothing to wire. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges"
      style="display:block; height:100vh" />
  `,
})
export class ReconnectEdgeComponent implements AfterViewInit {
  nodes = [
    { id: 'a', position: { x: 80,  y: 260 }, size: { width: 120, height: 60 }, label: 'A' },
    { id: 'b', position: { x: 660, y: 110 }, size: { width: 120, height: 60 }, label: 'B' },
    { id: 'c', position: { x: 660, y: 430 }, size: { width: 120, height: 60 }, label: 'C' },
  ];
  edges = [{ id: 'e1', source: 'a', target: 'b', sourceHandle: 'right', targetHandle: 'left', type: 'direct' as const }];
  ngAfterViewInit() { markReady(); }
}
