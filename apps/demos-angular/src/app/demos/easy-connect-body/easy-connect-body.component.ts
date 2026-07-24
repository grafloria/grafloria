import { AfterViewInit, Component, viewChild } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/angular';
import { markReady } from '../demo-ready';

/** Easy Connect in the ENGINE: press anywhere on a node body and release on
 *  another and they wire up — no aiming at a 6px port. The only wiring is
 *  setInteractionConfig({ enableEasyConnect: true }); the built-in drag path
 *  starts the connection from the nearest port. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges" style="display:block;height:100vh" />
  `,
})
export class EasyConnectBodyComponent implements AfterViewInit {
  canvas = viewChild.required(DiagramCanvasComponent);
  nodes: any[] = [
    { id: 'a', position: { x: 100, y: 150 }, size: { width: 200, height: 120 }, label: 'A · press anywhere' },
    { id: 'b', position: { x: 560, y: 150 }, size: { width: 200, height: 120 }, label: 'B · release anywhere' },
  ];
  edges: any[] = [];

  ngAfterViewInit() {
    this.canvas().activeEngine()?.setInteractionConfig({ enableEasyConnect: true } as never);
    markReady();
  }
}
