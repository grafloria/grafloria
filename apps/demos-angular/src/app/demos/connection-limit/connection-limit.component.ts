import { AfterViewInit, Component } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/angular';
import { markReady } from '../demo-ready';

/** Ports are model anatomy: the target's left port declares maxConnections: 1
 *  and REFUSES a second wire during the real drag — the UI stays enabled. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges"
      style="display:block; height:100vh" />
  `,
})
export class ConnectionLimitComponent implements AfterViewInit {
  nodes = [
    { id: 's1', position: { x: 60, y: 60 },  size: { width: 150, height: 70 }, label: 'Source 1' },
    { id: 's2', position: { x: 60, y: 240 }, size: { width: 150, height: 70 }, label: 'Source 2' },
    { id: 't',  position: { x: 520, y: 150 }, size: { width: 150, height: 70 }, label: 'Target (1 max)',
      ports: [
        { id: 't__left',  side: 'left',  type: 'bi', maxConnections: 1 },
        { id: 't__right', side: 'right', type: 'bi' },
      ] },
  ];
  edges = [];
  ngAfterViewInit() { markReady(); }
}
