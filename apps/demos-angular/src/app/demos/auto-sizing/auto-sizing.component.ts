import { AfterViewInit, Component } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/renderer-angular';
import { markReady } from '../demo-ready';

/** Content-aware sizing: metadata.sizing.auto grows the node to fit its label
 *  on the very next frame — the fixed twin below must NOT resize. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges"
      style="display:block; height:100vh" />
  `,
})
export class AutoSizingComponent implements AfterViewInit {
  nodes = [
    { id: 'a', position: { x: 120, y: 140 }, size: { width: 60, height: 36 },
      label: 'a comfortably long label that will not fit in sixty pixels',
      metadata: { sizing: { auto: true, padding: 10 } } },
    { id: 'b', position: { x: 120, y: 280 }, size: { width: 60, height: 36 },
      label: 'a comfortably long label that will not fit in sixty pixels' },
  ];
  edges = [];
  ngAfterViewInit() { markReady(); }
}
