import { AfterViewInit, Component, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DiagramCanvasComponent } from '@grafloria/angular';
import { markReady } from '../demo-ready';

/** Diagram-as-text: exportText() writes Mermaid-style text from the live
 *  canvas; loadText() reconciles edited text back INTO the same instance —
 *  positions survive through the lossless sidecar. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent, FormsModule],
  templateUrl: './mermaid-text.component.html',
})
export class MermaidTextComponent implements AfterViewInit {
  canvas = viewChild.required(DiagramCanvasComponent);
  text = '';
  nodes = [
    { id: 'start', position: { x: 80, y: 60 },  size: { width: 140, height: 60 }, data: { label: 'Start' } },
    { id: 'work',  position: { x: 320, y: 60 }, size: { width: 140, height: 60 }, data: { label: 'Work' } },
    { id: 'done',  position: { x: 560, y: 60 }, size: { width: 140, height: 60 }, data: { label: 'Done' } },
  ];
  edges = [
    { id: 'e1', source: 'start', target: 'work' },
    { id: 'e2', source: 'work', target: 'done' },
  ];
  export() { this.text = this.canvas().exportText(); }
  load() { this.canvas().loadText(this.text); }
  ngAfterViewInit() { this.export(); markReady(); }
}
