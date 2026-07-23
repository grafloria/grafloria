import { AfterViewInit, Component, viewChild } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/renderer-angular';
import { markReady } from '../demo-ready';

/** A port GROUP declares a layout once; its member ports inherit it. Three
 *  pluggable strategies: sideLinear (a column down one edge), line (evenly along
 *  a node-local segment), ellipseSpread (fanned around the inscribed ellipse). */
const ringPorts = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `r${i}`, group: 'g', shape: { shape: 'circle', size: 10 } }));

@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges"
      style="display:block; height:100vh" />
  `,
})
export class PortGroupsAndLayoutsComponent implements AfterViewInit {
  canvas = viewChild.required(DiagramCanvasComponent);
  nodes = [
    { id: 'side', position: { x: 80, y: 200 }, size: { width: 130, height: 220 }, label: 'sideLinear',
      metadata: { portGroups: { g: { id: 'g', side: 'left', layout: { strategy: 'sideLinear', args: { padding: 10 } } } } },
      ports: Array.from({ length: 4 }, (_, i) => ({ id: `s${i}`, group: 'g', shape: { shape: 'circle', size: 10 } })) },
    { id: 'line', position: { x: 330, y: 200 }, size: { width: 200, height: 220 }, label: 'line',
      metadata: { portGroups: { g: { id: 'g', layout: { strategy: 'line', args: { start: { x: 0, y: 0 }, end: { x: 200, y: 220 } } } } } },
      ports: Array.from({ length: 4 }, (_, i) => ({ id: `l${i}`, group: 'g', shape: { shape: 'circle', size: 10 } })) },
    { id: 'ring', position: { x: 640, y: 190 }, size: { width: 200, height: 200 }, label: 'ellipseSpread',
      metadata: { portGroups: { g: { id: 'g', layout: { strategy: 'ellipseSpread', args: { sweep: 360 } } } } },
      ports: ringPorts(6) },
  ];
  edges = [];

  ngAfterViewInit() {
    this.canvas().activeEngine()?.setInteractionConfig({ portVisibility: 'always' as never });
    markReady();
  }
}
