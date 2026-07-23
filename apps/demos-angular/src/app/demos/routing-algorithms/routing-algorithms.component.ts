import { AfterViewInit, Component } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/renderer-angular';
import { markReady } from '../demo-ready';

const LANES: [string, string, string][] = [
  ['orthogonal', 'orthogonal — HVH elbows', '#2563eb'],
  ['manhattan',  'manhattan — grid search', '#059669'],
  ['elk',        'elk — ELK edge router',   '#7c3aed'],
];

/** EdgeSpec.router is a real per-link knob: three lanes, three algorithms,
 *  each dodging the obstacle its own way. Drag an obstacle and watch. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges"
      style="display:block; height:100vh" />
  `,
})
export class RoutingAlgorithmsComponent implements AfterViewInit {
  nodes = LANES.flatMap(([, label], i) => {
    const yc = 110 + i * 150;
    return [
      { id: 'a' + i, position: { x: 70, y: yc - 24 },  size: { width: 108, height: 48 }, label: 'A' },
      { id: 'b' + i, position: { x: 760, y: yc - 24 }, size: { width: 108, height: 48 }, label: 'B' },
      { id: 'o' + i, position: { x: 410, y: yc - 42 }, size: { width: 100, height: 84 },
        label, style: { fill: '#fde68a', stroke: '#d97706' } },
    ];
  });
  edges = LANES.map(([router, , color], i) => ({
    id: 'e' + i, source: 'a' + i, target: 'b' + i, router,
    style: { stroke: color, strokeWidth: 2.5 },
  }));
  ngAfterViewInit() { markReady(); }
}
