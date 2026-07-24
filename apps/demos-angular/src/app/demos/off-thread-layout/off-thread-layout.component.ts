import { AfterViewInit, Component, viewChild } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/angular';
import { markReady } from '../demo-ready';

const N = 45;

/** Force layout in a REAL module Worker via engine.setLayoutPort(): the 45-node
 *  graph is arranged off the main thread, which keeps ticking the whole time. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges"
      style="display:block; height:100vh" />
  `,
})
export class OffThreadLayoutComponent implements AfterViewInit {
  canvas = viewChild.required(DiagramCanvasComponent);
  nodes = Array.from({ length: N }, (_, i) => ({
    id: `n${i}`, position: { x: (i % 9) * 90, y: Math.floor(i / 9) * 90 },
    size: { width: 40, height: 40 }, label: `${i}`,
  }));
  edges = [
    ...Array.from({ length: N - 1 }, (_, k) => {
      const i = k + 1;
      return { id: `e${i}`, source: `n${i - 1}`, target: `n${i}`, type: 'direct' as const };
    }),
    ...Array.from({ length: Math.ceil(N / 5) }, (_, k) => {
      const i = k * 5;
      return { id: `x${i}`, source: `n${i}`, target: `n${(i + 12) % N}`, type: 'direct' as const };
    }),
  ];

  private worker?: Worker;

  async ngAfterViewInit() {
    const engine = this.canvas().activeEngine();
    if (engine) {
      this.worker = new Worker(new URL('./layout.worker', import.meta.url), { type: 'module' });
      engine.setLayoutPort(this.worker);
      await engine.layout('force', { seed: 0x5eed, iterations: 200, threshold: 0 });
    }
    markReady();
  }
}
