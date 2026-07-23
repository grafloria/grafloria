import { AfterViewInit, Component, viewChild } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/renderer-angular';
import { GroupModel } from '@grafloria/element';
import { markReady } from '../demo-ready';

/** Compound layout with a cross-boundary edge induced at the LCA: two labelled
 *  containers, each with two members and an internal edge, and one edge that
 *  crosses between them — the cross edge decides which container sits left. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges"
      style="display:block; height:100vh" />
  `,
})
export class NestedContainersComponent implements AfterViewInit {
  canvas = viewChild.required(DiagramCanvasComponent);
  nodes = ['m1a', 'm1b', 'm2a', 'm2b'].map((id) => ({
    id, position: { x: 0, y: 0 }, size: { width: 90, height: 44 }, label: id,
  }));
  edges = [
    { id: 'i1', source: 'm1a', target: 'm1b' },
    { id: 'i2', source: 'm2a', target: 'm2b' },
    { id: 'cross', source: 'm1a', target: 'm2a' },
  ];

  async ngAfterViewInit() {
    const engine = this.canvas().activeEngine();
    if (engine) {
      const diagram = engine.getDiagram();
      const g1 = new GroupModel({ id: 'G1', name: 'Container 1' });
      const g2 = new GroupModel({ id: 'G2', name: 'Container 2' });
      diagram.addGroup(g1);
      diagram.addGroup(g2);
      g1.padding = 12;
      g2.padding = 12;
      g1.addMember('m1a', diagram);
      g1.addMember('m1b', diagram);
      g2.addMember('m2a', diagram);
      g2.addMember('m2b', diagram);
      await engine.layout('dagre', { direction: 'LR', nodeSpacing: 30, rankSpacing: 60 });
    }
    markReady();
  }
}
