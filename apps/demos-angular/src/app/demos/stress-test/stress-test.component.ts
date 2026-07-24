import { AfterViewInit, Component } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/angular';
import { markReady } from '../demo-ready';

/** A 900-node mesh (30×30, each wired to its right + down neighbour). Viewport
 *  culling keeps only the visible slice in the DOM; one layout call snaps all
 *  900 into a clean layered diamond. */
const R = 30, C = 30;
const nid = (r: number, c: number) => 'n' + (r * C + c);

function buildNodes() {
  const nodes = [];
  for (let r = 0; r < R; r++)
    for (let c = 0; c < C; c++)
      nodes.push({ id: nid(r, c), position: { x: c * 120, y: r * 80 }, size: { width: 92, height: 46 }, label: '' + (r * C + c) });
  return nodes;
}
function buildEdges() {
  const edges = [];
  for (let r = 0; r < R; r++)
    for (let c = 0; c < C; c++) {
      if (c + 1 < C) edges.push({ id: 'h' + r + '_' + c, source: nid(r, c), target: nid(r, c + 1) });
      if (r + 1 < R) edges.push({ id: 'v' + r + '_' + c, source: nid(r, c), target: nid(r + 1, c) });
    }
  return edges;
}

@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges"
      [layout]="layout" style="display:block; height:100vh" />
  `,
})
export class StressTestComponent implements AfterViewInit {
  layout = { name: 'layered', options: { direction: 'TB', nodeSpacing: 20, rankSpacing: 52 } };
  nodes = buildNodes();
  edges = buildEdges();
  ngAfterViewInit() { markReady(); }
}
