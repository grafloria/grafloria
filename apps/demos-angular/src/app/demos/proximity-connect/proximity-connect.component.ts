import { AfterViewInit, Component } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/angular';
import { markReady } from '../demo-ready';

/** Drag a node near another and a proximity connection is proposed, then
 *  commits on drop. The canvas' built-in proximity connect (enabled by default)
 *  drives it — the SnapController's radius decides the pairing. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges"
      [enableProximityConnect]="true" style="display:block; height:100vh" />
  `,
})
export class ProximityConnectComponent implements AfterViewInit {
  nodes = [
    { id: 'a', position: { x: 150, y: 150 }, size: { width: 150, height: 80 }, label: 'drag me →' },
    { id: 'b', position: { x: 600, y: 150 }, size: { width: 150, height: 80 }, label: 'B' },
  ];
  edges = [];
  ngAfterViewInit() { markReady(); }
}
