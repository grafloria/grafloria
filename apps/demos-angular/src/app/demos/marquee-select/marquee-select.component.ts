import { AfterViewInit, Component } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/angular';
import { markReady } from '../demo-ready';

/** Marquee (rubber-band) box-selection: press on empty canvas and drag a box and
 *  every node it encloses is selected; nodes still drag normally. The canvas'
 *  built-in selection tools own the marquee gesture (enableSelectionTools). */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges" style="display:block;height:100vh" />
  `,
})
export class MarqueeSelectComponent implements AfterViewInit {
  nodes: any[] = [
    { id: 'n1', position: { x: 120, y: 110 }, size: { width: 120, height: 60 }, label: 'n1' },
    { id: 'n2', position: { x: 300, y: 110 }, size: { width: 120, height: 60 }, label: 'n2' },
    { id: 'n3', position: { x: 120, y: 230 }, size: { width: 120, height: 60 }, label: 'n3' },
    { id: 'n4', position: { x: 560, y: 120 }, size: { width: 120, height: 60 }, label: 'n4' },
    { id: 'n5', position: { x: 560, y: 300 }, size: { width: 120, height: 60 }, label: 'n5' },
    { id: 'n6', position: { x: 330, y: 410 }, size: { width: 120, height: 60 }, label: 'n6' },
  ];
  edges: any[] = [
    { id: 'e1', source: 'n1', target: 'n2' },
    { id: 'e2', source: 'n1', target: 'n3' },
    { id: 'e3', source: 'n4', target: 'n5' },
  ];
  ngAfterViewInit() { markReady(); }
}
