import { AfterViewInit, Component } from '@angular/core';
import { DiagramCanvasComponent, GrafloriaNodeDefDirective } from '@grafloria/renderer-angular';
import { markReady } from '../demo-ready';

/** Custom nodes THE ANGULAR WAY: an ng-template per node type, with real
 *  bindings — the node still hit-tests, routes and drags like any other. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent, GrafloriaNodeDefDirective],
  templateUrl: './html-nodes.component.html',
})
export class HtmlNodesComponent implements AfterViewInit {
  nodes = [
    { id: 'a', type: 'card', position: { x: 80, y: 90 },  size: { width: 230, height: 110 },
      data: { title: 'Build', owner: 'CI', status: 'passing' } },
    { id: 'b', type: 'card', position: { x: 430, y: 90 }, size: { width: 230, height: 110 },
      data: { title: 'Deploy', owner: 'CD', status: 'ready' } },
  ];
  edges = [{ id: 'e1', source: 'a', target: 'b' }];
  ngAfterViewInit() { markReady(); }
}
