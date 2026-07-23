import { AfterViewInit, Component } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/renderer-angular';
import { markReady } from '../demo-ready';

/** Editor chrome in one prop: [plugins]="true" mounts minimap, zoom controls
 *  and the dotted background — lazy-loaded, so they cost nothing unused. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges"
      [plugins]="true" style="display:block; height:100vh" />
  `,
})
export class MinimapAndControlsComponent implements AfterViewInit {
  nodes = Array.from({ length: 9 }, (_, i) => ({
    id: 'n' + i, position: { x: 90 + (i % 3) * 300, y: 70 + Math.floor(i / 3) * 190 },
    size: { width: 170, height: 74 }, data: { label: 'Step ' + (i + 1) },
  }));
  edges = Array.from({ length: 8 }, (_, i) => ({
    id: 'e' + i, source: 'n' + i, target: 'n' + (i + 1),
  }));
  ngAfterViewInit() { markReady(); }
}
