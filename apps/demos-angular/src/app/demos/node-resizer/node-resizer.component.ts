import { AfterViewInit, Component } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/renderer-angular';
import { markReady } from '../demo-ready';

/** Select the node: the built-in resizer chrome appears — corner dots + edge
 *  lines, min/max clamped DURING the gesture, one release = one undo step. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges"
      style="display:block; height:100vh" />
  `,
})
export class NodeResizerComponent implements AfterViewInit {
  nodes = [
    { id: 'a', position: { x: 200, y: 140 }, size: { width: 220, height: 110 },
      data: { label: 'Select me, then drag a corner' },
      metadata: { sizing: { minWidth: 120, minHeight: 70, maxWidth: 460, maxHeight: 240 } } },
  ];
  edges = [];
  ngAfterViewInit() { markReady(); }
}
