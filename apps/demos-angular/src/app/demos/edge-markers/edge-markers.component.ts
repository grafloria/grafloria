import { AfterViewInit, Component } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/renderer-angular';
import { markReady } from '../demo-ready';

const HEADS = ['arrow', 'open-arrow', 'circle', 'square', 'diamond', 'crow-foot', 'hollow-diamond', 'one-or-many', 'none'];

/** Eight built-in arrowheads + explicit none, one row each — the ERD heads
 *  (crow-foot, one-or-many) are first-class citizens. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges"
      style="display:block; height:100vh" />
  `,
})
export class EdgeMarkersComponent implements AfterViewInit {
  nodes = HEADS.flatMap((type, i) => [
    { id: 'a' + i, position: { x: 120, y: 40 + i * 62 }, size: { width: 120, height: 44 }, label: type },
    { id: 'b' + i, position: { x: 620, y: 40 + i * 62 }, size: { width: 120, height: 44 }, label: '' },
  ]);
  edges = HEADS.map((type, i) => ({
    id: 'e' + i, source: 'a' + i, target: 'b' + i,
    style: { arrowHead: { type, size: 14, filled: false } },
  }));
  ngAfterViewInit() { markReady(); }
}
