import { AfterViewInit, Component } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/renderer-angular';
import { markReady } from '../demo-ready';

/** Crossing wires hop: style.jumpPoints arcs the owning edge over the other
 *  where they intersect. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges"
      style="display:block; height:100vh" />
  `,
})
export class JumpOversComponent implements AfterViewInit {
  private jp = { enabled: true, size: 10, detectMode: 'all' };
  nodes = [
    { id: 'a', position: { x: 80,  y: 90 },  size: { width: 100, height: 44 }, label: 'A' },
    { id: 'b', position: { x: 80,  y: 430 }, size: { width: 100, height: 44 }, label: 'B' },
    { id: 'c', position: { x: 760, y: 90 },  size: { width: 100, height: 44 }, label: 'C' },
    { id: 'd', position: { x: 760, y: 430 }, size: { width: 100, height: 44 }, label: 'D' },
  ];
  edges = [
    { id: 'ad', source: 'a', target: 'd', type: 'direct' as const, style: { jumpPoints: this.jp } },
    { id: 'bc', source: 'b', target: 'c', type: 'direct' as const, style: { jumpPoints: this.jp } },
  ];
  ngAfterViewInit() { markReady(); }
}
