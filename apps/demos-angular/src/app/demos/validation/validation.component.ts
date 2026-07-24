import { AfterViewInit, Component, OnDestroy, viewChild } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/angular';
import { registerConnectionValidator, clearConnectionValidators } from '@grafloria/renderer';
import { markReady } from '../demo-ready';

/** A typed graph — sources, transforms, sinks — with a registered validator:
 *  nothing flows OUT of a Sink, so a connection whose source is a sink is
 *  refused (with a reason) while the legal ones connect. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <div style="padding:8px 24px;font:12px/1.5 ui-monospace,monospace;opacity:.8;border-bottom:1px solid rgba(127,127,127,.25)">validator registered: a Sink may not be a connection source</div>
    <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges" style="display:block;height:calc(100vh - 40px)" />
  `,
})
export class ValidationComponent implements AfterViewInit, OnDestroy {
  canvas = viewChild.required(DiagramCanvasComponent);
  nodes: any[] = [
    { id: 'src', position: { x: 80, y: 80 }, size: { width: 120, height: 46 }, label: 'Source', data: { role: 'source' } },
    { id: 'xf', position: { x: 320, y: 80 }, size: { width: 120, height: 46 }, label: 'Transform', data: { role: 'transform' } },
    { id: 'sink', position: { x: 560, y: 80 }, size: { width: 120, height: 46 }, label: 'Sink', data: { role: 'sink' } },
  ];
  edges: any[] = [];
  private dispose?: () => void;

  ngAfterViewInit() {
    clearConnectionValidators();
    this.dispose = registerConnectionValidator(({ sourceNode }: any) => {
      if (sourceNode?.data?.role === 'sink') return 'A Sink has no outputs';
      return true;
    }) as any;
    this.canvas().activeEngine()?.setInteractionConfig({ portVisibility: 'always' as never });
    markReady();
  }

  ngOnDestroy() { this.dispose?.(); clearConnectionValidators(); }
}
