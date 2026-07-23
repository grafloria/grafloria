import { AfterViewInit, Component } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/renderer-angular';
import { markReady } from '../demo-ready';

/** Dagre layered layout, declaratively: every node starts at 0,0 and
 *  [layout] arranges the tree — including the isolated node b2. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges"
      [layout]="layout" style="display:block; height:100vh" />
  `,
})
export class DagreTreeComponent implements AfterViewInit {
  layout = { name: 'dagre', options: { direction: 'TB', nodeSpacing: 40, rankSpacing: 80 } };
  nodes = ['root', 'a', 'b', 'a1', 'a2', 'b1', 'b2'].map((id) => ({
    id, position: { x: 0, y: 0 }, size: { width: 120, height: 48 }, label: id,
  }));
  edges = [
    { id: 'e1', source: 'root', target: 'a', sourceHandle: 'bottom', targetHandle: 'top' },
    { id: 'e2', source: 'root', target: 'b', sourceHandle: 'bottom', targetHandle: 'top' },
    { id: 'e3', source: 'a', target: 'a1', sourceHandle: 'bottom', targetHandle: 'top' },
    { id: 'e4', source: 'a', target: 'a2', sourceHandle: 'bottom', targetHandle: 'top' },
    { id: 'e5', source: 'b', target: 'b1', sourceHandle: 'bottom', targetHandle: 'top' },
  ];
  ngAfterViewInit() { markReady(); }
}
