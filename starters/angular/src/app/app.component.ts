import { Component } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/angular';

// Drag, connect, Cmd/Ctrl+Z. Next: https://grafloria.com/learn/angular/
@Component({
  selector: 'app-root',
  imports: [DiagramCanvasComponent],
  template: `
    <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges"
      [plugins]="true" style="display:block; height:100vh" />
  `,
})
export class AppComponent {
  nodes = [
    { id: 'a', position: { x: 60, y: 80 },  size: { width: 180, height: 80 }, data: { label: 'Ingest' } },
    { id: 'b', position: { x: 380, y: 80 }, size: { width: 180, height: 80 }, data: { label: 'Publish' } },
  ];
  edges = [{ id: 'e1', source: 'a', target: 'b' }];
}
