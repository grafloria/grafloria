import { AfterViewInit, Component } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/renderer-angular';
import { markReady } from '../demo-ready';

/** Declarative auto-layout: [layout]="'elk'" — ELK loads lazily in a Worker
 *  and arranges the tree; you never position a node by hand. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges"
      [layout]="'elk'" style="display:block; height:100vh" />
  `,
})
export class ElkTreeComponent implements AfterViewInit {
  nodes = ['root', 'auth', 'api', 'login', 'tokens', 'users', 'billing'].map((id) => ({
    id, position: { x: 0, y: 0 }, size: { width: 130, height: 56 }, data: { label: id },
  }));
  edges = [
    { id: 'e1', source: 'root', target: 'auth' },
    { id: 'e2', source: 'root', target: 'api' },
    { id: 'e3', source: 'auth', target: 'login' },
    { id: 'e4', source: 'auth', target: 'tokens' },
    { id: 'e5', source: 'api', target: 'users' },
    { id: 'e6', source: 'api', target: 'billing' },
  ];
  ngAfterViewInit() { markReady(); }
}
