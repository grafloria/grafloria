import { AfterViewInit, Component, viewChild } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/renderer-angular';
import { portTypeRegistry } from '@grafloria/element';
import { markReady } from '../demo-ready';

/** Ports coloured by data type, refusing a mismatched connection —
 *  number→number is allowed, number→string is rejected before it is made.
 *  Compatibility comes entirely from the registered types. */
portTypeRegistry.registerAll([
  { name: 'number', color: '#2563eb', compatibleWith: ['number'] },
  { name: 'string', color: '#9333ea', compatibleWith: ['string'] },
]);

@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges"
      style="display:block; height:100vh" />
  `,
})
export class TypedPortsComponent implements AfterViewInit {
  canvas = viewChild.required(DiagramCanvasComponent);
  nodes = [
    { id: 'src', position: { x: 120, y: 260 }, size: { width: 130, height: 70 }, label: 'number src',
      ports: [{ id: 'out', side: 'right' as const, type: 'output', dataType: 'number', shape: { shape: 'circle', size: 13 } }] },
    { id: 'num', position: { x: 640, y: 140 }, size: { width: 130, height: 70 }, label: 'number in',
      ports: [{ id: 'nin', side: 'left' as const, type: 'input', dataType: 'number', shape: { shape: 'circle', size: 13 } }] },
    { id: 'str', position: { x: 640, y: 400 }, size: { width: 130, height: 70 }, label: 'string in',
      ports: [{ id: 'sin', side: 'left' as const, type: 'input', dataType: 'string', shape: { shape: 'circle', size: 13 } }] },
  ];
  edges = [];

  ngAfterViewInit() {
    this.canvas().activeEngine()?.setInteractionConfig({ portVisibility: 'always' as never });
    markReady();
  }
}
