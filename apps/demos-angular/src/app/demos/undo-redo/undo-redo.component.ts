import { AfterViewInit, Component, viewChild } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/renderer-angular';
import { markReady } from '../demo-ready';

/** Command-based history on the component surface: drag a node (one gesture =
 *  one step), then undo()/redo() from your own UI — ⌘Z works too. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  templateUrl: './undo-redo.component.html',
})
export class UndoRedoComponent implements AfterViewInit {
  canvas = viewChild.required(DiagramCanvasComponent);
  nodes = [
    { id: 'a', position: { x: 160, y: 160 }, size: { width: 160, height: 70 }, label: 'Drag, then undo' },
    { id: 'b', position: { x: 480, y: 280 }, size: { width: 160, height: 70 }, label: 'Every step counts' },
  ];
  edges = [{ id: 'e1', source: 'a', target: 'b' }];
  undo() { void this.canvas().undo(); }
  redo() { void this.canvas().redo(); }
  ngAfterViewInit() { markReady(); }
}
