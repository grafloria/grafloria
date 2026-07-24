import { AfterViewInit, Component, viewChild } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/angular';
import { markReady } from '../demo-ready';

/** A pointer node-drag commits ONE undoable step: drag a node, undo, and it
 *  returns to where the drag began; redo re-applies. The drag now goes through
 *  the command history like every other gesture. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <div style="position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:5;display:flex;gap:8px">
      <button (click)="undo()" style="padding:7px 16px;border-radius:999px;border:0;background:#3B52D9;color:#fff;font-weight:600;cursor:pointer">↩ Undo</button>
      <button (click)="redo()" style="padding:7px 16px;border-radius:999px;border:1px solid #94A5F0;background:#EEF1FE;color:#3B52D9;font-weight:600;cursor:pointer">↪ Redo</button>
    </div>
    <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges" style="display:block;height:100vh" />
  `,
})
export class DragUndoComponent implements AfterViewInit {
  canvas = viewChild.required(DiagramCanvasComponent);
  nodes: any[] = [
    { id: 'n1', position: { x: 260, y: 200 }, size: { width: 120, height: 60 }, label: 'drag me' },
    { id: 'n2', position: { x: 520, y: 200 }, size: { width: 120, height: 60 }, label: 'and me' },
  ];
  edges: any[] = [];
  undo() { void this.canvas().undo(); }
  redo() { void this.canvas().redo(); }
  ngAfterViewInit() { markReady(); }
}
