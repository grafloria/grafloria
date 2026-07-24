import { AfterViewInit, Component } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/angular';
import { markReady } from '../demo-ready';

const IDS = ['ingest', 'parse', 'validate', 'enrich', 'score', 'store', 'index', 'notify', 'retry'];

/** Zero-config layout: every node starts at 0,0 and [layout]="'auto'" picks a
 *  sensible arrangement for the graph's shape. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges"
      [layout]="'auto'" style="display:block; height:100vh" />
  `,
})
export class AutoLayoutComponent implements AfterViewInit {
  nodes = IDS.map((id) => ({
    id, position: { x: 0, y: 0 }, size: { width: 130, height: 52 },
    label: id[0].toUpperCase() + id.slice(1),
  }));
  edges = [
    { id: 'e1', source: 'ingest',   target: 'parse' },
    { id: 'e2', source: 'parse',    target: 'validate' },
    { id: 'e3', source: 'validate', target: 'enrich' },
    { id: 'e4', source: 'validate', target: 'retry' },
    { id: 'e5', source: 'enrich',   target: 'score' },
    { id: 'e6', source: 'score',    target: 'store' },
    { id: 'e7', source: 'score',    target: 'index' },
    { id: 'e8', source: 'store',    target: 'notify' },
    { id: 'e9', source: 'index',    target: 'notify' },
  ];
  ngAfterViewInit() { markReady(); }
}
