import { AfterViewInit, Component, viewChild } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/renderer-angular';
import type { SerializedDiagram } from '@grafloria/engine';
import { markReady } from '../demo-ready';

/** snapshot() captures the whole document; drag things around, then
 *  loadSnapshot() restores it byte-stable — persistence in two calls. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  templateUrl: './save-and-restore.component.html',
})
export class SaveAndRestoreComponent implements AfterViewInit {
  canvas = viewChild.required(DiagramCanvasComponent);
  saved: SerializedDiagram | null = null;
  nodes = [
    { id: 'a', position: { x: 120, y: 120 }, size: { width: 150, height: 66 }, label: 'Drag me' },
    { id: 'b', position: { x: 420, y: 220 }, size: { width: 150, height: 66 }, label: 'Then restore' },
  ];
  edges = [{ id: 'e1', source: 'a', target: 'b' }];
  save() { this.saved = this.canvas().snapshot(); }
  restore() { if (this.saved) this.canvas().loadSnapshot(this.saved); }
  ngAfterViewInit() { this.save(); markReady(); }
}
