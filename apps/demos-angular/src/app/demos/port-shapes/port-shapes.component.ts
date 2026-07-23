import { AfterViewInit, Component, viewChild } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/renderer-angular';
import { markReady } from '../demo-ready';

const SHAPES = [
  { id: 'circle',   spec: { shape: 'circle', size: 16 } },
  { id: 'square',   spec: { shape: 'square', size: 16 } },
  { id: 'diamond',  spec: { shape: 'diamond', size: 16 } },
  { id: 'triangle', spec: { shape: 'triangle', size: 16 } },
  { id: 'path',     spec: { shape: 'path', size: 18, path: 'M0,-9 L9,0 L0,9 L-9,0 Z M0,-4 L4,0 L0,4 L-4,0 Z' } },
];

/** Five ports, five different SVG primitives — including an author-supplied
 *  custom path. Always-visible via node metadata portsConfig. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges"
      style="display:block; height:100vh" />
  `,
})
export class PortShapesComponent implements AfterViewInit {
  canvas = viewChild.required(DiagramCanvasComponent);
  nodes = SHAPES.map((s, i) => ({
    id: s.id, position: { x: 120 + i * 170, y: 240 }, size: { width: 120, height: 70 }, label: s.id,
    ports: [{ id: s.id + '-p', side: 'right' as const, shape: s.spec }],
  }));
  edges = [];
  ngAfterViewInit() {
    // portVisibility lives on the interaction config — always-on ports
    // through the same seam the config panel drives.
    // 'always' is PortVisibilityStrategy.ALWAYS; the enum isn't in the public
    // barrel yet, so cast the literal (the lib's own config panel does the same).
    this.canvas().activeEngine()?.setInteractionConfig({ portVisibility: 'always' as never });
    markReady();
  }
}
