import { AfterViewInit, Component } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/angular';
import { markReady } from '../demo-ready';

/** Custom-shaped nodes declared per node in the spec — terminal,
 *  predefined-process and document silhouettes with their own fills. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges"
      style="display:block; height:100vh" />
  `,
})
export class CustomNodesComponent implements AfterViewInit {
  nodes = [
    { id: 'a', position: { x: 60, y: 80 },  size: { width: 180, height: 80 }, data: { label: 'Ingest' },
      shape: { type: 'terminal', fill: '#ecfdf5', stroke: '#059669' } },
    { id: 'b', position: { x: 380, y: 80 }, size: { width: 180, height: 80 }, data: { label: 'Transform' },
      shape: { type: 'predefined-process', fill: '#eff6ff', stroke: '#2563eb' } },
    { id: 'c', position: { x: 700, y: 80 }, size: { width: 180, height: 80 }, data: { label: 'Publish' },
      shape: { type: 'document', fill: '#fdf4ff', stroke: '#9333ea' } },
  ];
  edges = [
    { id: 'e1', source: 'a', target: 'b' },
    { id: 'e2', source: 'b', target: 'c' },
  ];
  ngAfterViewInit() { markReady(); }
}
