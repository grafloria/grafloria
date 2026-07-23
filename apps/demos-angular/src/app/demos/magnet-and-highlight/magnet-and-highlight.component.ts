import { AfterViewInit, Component, viewChild } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/renderer-angular';
import { markReady } from '../demo-ready';

/** While you drag a connection, every valid target port lights up and the drop
 *  snaps to the nearest port within the magnet radius. An output source's valid
 *  targets are the INPUT ports, decided by the engine's native connection rules;
 *  the stray output stays dark. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges"
      style="display:block; height:100vh" />
  `,
})
export class MagnetAndHighlightComponent implements AfterViewInit {
  canvas = viewChild.required(DiagramCanvasComponent);
  nodes = [
    { id: 'src', position: { x: 120, y: 280 }, size: { width: 120, height: 70 }, label: 'source',
      ports: [{ id: 'o', side: 'right' as const, type: 'output', shape: { shape: 'circle', size: 13 } }] },
    { id: 't1', position: { x: 640, y: 120 }, size: { width: 120, height: 70 }, label: 'target 1',
      ports: [{ id: 'i1', side: 'left' as const, type: 'input', shape: { shape: 'circle', size: 13 } }] },
    { id: 't2', position: { x: 640, y: 300 }, size: { width: 120, height: 70 }, label: 'target 2',
      ports: [{ id: 'i2', side: 'left' as const, type: 'input', shape: { shape: 'circle', size: 13 } }] },
    { id: 'bad', position: { x: 640, y: 480 }, size: { width: 120, height: 70 }, label: 'not a target',
      ports: [{ id: 'bo', side: 'left' as const, type: 'output', shape: { shape: 'circle', size: 13 } }] },
  ];
  edges = [];

  ngAfterViewInit() {
    this.canvas().activeEngine()?.setInteractionConfig({ portVisibility: 'always' as never });
    markReady();
  }
}
