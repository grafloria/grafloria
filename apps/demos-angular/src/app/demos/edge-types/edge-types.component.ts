import { AfterViewInit, Component } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/renderer-angular';
import { markReady } from '../demo-ready';

const TYPES = ['direct', 'smooth', 'orthogonal', 'bezier'] as const;

/** The four edge path families side by side — type picks router + connector,
 *  each overridable per edge. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges"
      style="display:block; height:100vh" />
  `,
})
export class EdgeTypesComponent implements AfterViewInit {
  nodes = TYPES.flatMap((type, i) => [
    { id: 'a' + i, position: { x: 100, y: 40 + i * 120 }, size: { width: 130, height: 54 }, label: type },
    { id: 'b' + i, position: { x: 600, y: 90 + i * 120 }, size: { width: 130, height: 54 }, label: '' },
  ]);
  edges = TYPES.map((type, i) => ({ id: 'e' + i, source: 'a' + i, target: 'b' + i, type }));
  ngAfterViewInit() { markReady(); }
}
