import { AfterViewInit, Component, viewChild } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/angular';
import { markReady } from '../demo-ready';

/** Select a node and the renderer paints the full resizer chrome — four corner
 *  dots and four edge lines, each with its own cursor. metadata.sizing declares
 *  the min/max/aspect clamps applied live during the drag. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges"
      style="display:block; height:100vh" />
  `,
})
export class NodeResizeGestureComponent implements AfterViewInit {
  canvas = viewChild.required(DiagramCanvasComponent);
  nodes = [
    { id: 'clamp', position: { x: 140, y: 130 }, size: { width: 160, height: 100 },
      data: { label: '80–260 wide' },
      metadata: { sizing: { minWidth: 80, minHeight: 60, maxWidth: 260, maxHeight: 200 } } },
    { id: 'ratio', position: { x: 560, y: 130 }, size: { width: 160, height: 100 },
      data: { label: 'aspect 1.6' },
      metadata: { sizing: { aspectLock: true } } },
  ];
  edges = [];

  ngAfterViewInit() {
    const model = this.canvas().activeEngine()?.getDiagram() as any;
    const clamp = model?.getNode('clamp');
    if (model && clamp) {
      model.selectNode ? model.selectNode(clamp) : clamp.setSelected?.(true);
    }
    markReady();
  }
}
