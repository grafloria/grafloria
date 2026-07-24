import { AfterViewInit, Component, viewChild } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/angular';
import { markReady } from '../demo-ready';

/** A container that holds a nested graph: three nodes become members, the frame
 *  fits itself around them, and a "Retry handler" sub-group nests inside — a
 *  real parent/child group hierarchy, with "outside" beyond both frames. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges"
      style="display:block; height:100vh" />
  `,
})
export class SubFlowComponent implements AfterViewInit {
  canvas = viewChild.required(DiagramCanvasComponent);
  nodes = [
    { id: 'n1', position: { x: 400, y: 150 }, size: { width: 120, height: 60 }, label: 'stage 1' },
    { id: 'n2', position: { x: 560, y: 150 }, size: { width: 120, height: 60 }, label: 'stage 2' },
    { id: 'n3', position: { x: 480, y: 275 }, size: { width: 120, height: 60 }, label: 'retry' },
    { id: 'outside', position: { x: 80, y: 150 }, size: { width: 120, height: 60 }, label: 'outside' },
  ];
  edges = [
    { id: 'e1', source: 'n1', target: 'n2' },
    { id: 'e2', source: 'n1', target: 'n3' },
  ];

  async ngAfterViewInit() {
    const engine = this.canvas().activeEngine();
    if (engine) {
      const diagram = engine.getDiagram();
      const g = await engine.addGroup({ name: 'Pipeline' });
      await engine.addToGroup(g.id, 'n1');
      await engine.addToGroup(g.id, 'n2');
      await engine.addToGroup(g.id, 'n3');

      const inner = await engine.addGroup({ name: 'Retry handler' });
      await engine.addToGroup(inner.id, 'n3');
      g.addMember(inner.id, diagram);

      inner.fitToContents(diagram);
      g.fitToContents(diagram);
    }
    markReady();
  }
}
