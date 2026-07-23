import { AfterViewInit, Component, viewChild } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/renderer-angular';
import { markReady } from '../demo-ready';

/** A designated grip drags its parent — and ONLY the grip: the body still
 *  selects but no longer drags. Imperative model work through the component's
 *  public activeEngine() surface. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges"
      style="display:block; height:100vh" />
  `,
})
export class DragHandleComponent implements AfterViewInit {
  canvas = viewChild.required(DiagramCanvasComponent);
  nodes = [
    { id: 'win',  position: { x: 300, y: 200 }, size: { width: 240, height: 120 }, label: 'window body' },
    { id: 'grip', position: { x: 300, y: 200 }, size: { width: 240, height: 28 },  label: '⠿ title bar (drag me)' },
  ];
  edges = [];
  ngAfterViewInit() {
    // The grip becomes a drag-handle child INSIDE the parent's top strip —
    // same calls as the JS demo, reached through the live model.
    const diagram = this.canvas().activeEngine()?.getDiagram();
    const grip = diagram?.getNode('grip');
    if (grip) {
      grip.setParent('win');
      grip.setPosition(0, 0);
      grip.setBehavior({ dragHandler: { isDragHandler: true } });
    }
    markReady();
  }
}
