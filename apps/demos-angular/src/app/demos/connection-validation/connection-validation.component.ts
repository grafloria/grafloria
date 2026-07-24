import { AfterViewInit, Component, OnDestroy, viewChild } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/angular';
import { registerConnectionValidator, clearConnectionValidators } from '@grafloria/renderer';
import { markReady } from '../demo-ready';

/** A registered validator vetoes an invalid connection before it is made:
 *  output→output is rejected (with a reason), output→input is allowed. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges"
      style="display:block; height:100vh" />
  `,
})
export class ConnectionValidationComponent implements AfterViewInit, OnDestroy {
  canvas = viewChild.required(DiagramCanvasComponent);
  nodes = [
    { id: 'a', position: { x: 120, y: 260 }, size: { width: 120, height: 70 }, label: 'A (out)',
      ports: [{ id: 'ao', side: 'right' as const, type: 'output', shape: { shape: 'triangle', size: 13 } }] },
    { id: 'b', position: { x: 640, y: 140 }, size: { width: 120, height: 70 }, label: 'B (in)',
      ports: [{ id: 'bi', side: 'left' as const, type: 'input', shape: { shape: 'circle', size: 13 } }] },
    { id: 'c', position: { x: 640, y: 400 }, size: { width: 120, height: 70 }, label: 'C (out)',
      ports: [{ id: 'co', side: 'left' as const, type: 'output', shape: { shape: 'triangle', size: 13 } }] },
  ];
  edges = [];
  private dispose?: () => void;

  ngAfterViewInit() {
    clearConnectionValidators();
    this.dispose = registerConnectionValidator(({ sourcePort, targetPort }: any) => {
      if (!sourcePort || !targetPort) return true;
      if (sourcePort.type === 'output' && targetPort.type === 'output') return 'an output cannot feed another output';
      return true;
    }) as any;
    this.canvas().activeEngine()?.setInteractionConfig({ portVisibility: 'always' as never });
    markReady();
  }

  ngOnDestroy() { this.dispose?.(); clearConnectionValidators(); }
}
