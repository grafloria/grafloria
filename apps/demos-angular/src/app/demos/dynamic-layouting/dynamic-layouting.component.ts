import { AfterViewInit, Component } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/angular';
import { markReady } from '../demo-ready';

/** Mental-map-preserving layout: a layered chain n0 → n5. An incremental pass
 *  moves the existing nodes far less than a from-scratch relayout — here the
 *  chain is laid out left-to-right by the layered engine. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges"
      [layout]="layout" style="display:block; height:100vh" />
  `,
})
export class DynamicLayoutingComponent implements AfterViewInit {
  layout = { name: 'layered', options: { direction: 'LR' } };
  nodes = ['n0', 'n1', 'n2', 'n3', 'n4', 'n5'].map((id) => ({
    id, position: { x: 0, y: 0 }, size: { width: 110, height: 46 }, label: id,
  }));
  edges = [
    { id: 'e0', source: 'n0', target: 'n1' },
    { id: 'e1', source: 'n1', target: 'n2' },
    { id: 'e2', source: 'n2', target: 'n3' },
    { id: 'e3', source: 'n3', target: 'n4' },
    { id: 'e4', source: 'n4', target: 'n5' },
  ];
  ngAfterViewInit() { markReady(); }
}
