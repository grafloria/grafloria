import { AfterViewInit, Component } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/renderer-angular';
import { markReady } from '../demo-ready';

/** Three links between the same pair auto-separate onto their own lanes
 *  (parallelLinks, on by default); a link from a node to ITSELF routes as a real
 *  loop outside the node body. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges"
      [rendererConfig]="{ parallelLinks: true, parallelSpacing: 18 }"
      style="display:block; height:100vh" />
  `,
})
export class ParallelLinksAndSelfLoopsComponent implements AfterViewInit {
  nodes = [
    { id: 'a', position: { x: 140, y: 120 }, size: { width: 130, height: 60 }, label: 'A' },
    { id: 'b', position: { x: 660, y: 120 }, size: { width: 130, height: 60 }, label: 'B' },
    { id: 's', position: { x: 400, y: 380 }, size: { width: 130, height: 60 }, label: 'Self' },
  ];
  edges = [
    { id: 'p1', source: 'a', target: 'b', type: 'direct' as const },
    { id: 'p2', source: 'a', target: 'b', type: 'direct' as const },
    { id: 'p3', source: 'a', target: 'b', type: 'direct' as const },
    { id: 'loop', source: 's', target: 's' },
  ];
  ngAfterViewInit() { markReady(); }
}
