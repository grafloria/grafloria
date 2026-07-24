import { AfterViewInit, Component, ElementRef, viewChild } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/angular';
import { QualityGovernor, PerfHud, EMPTY_SNAPSHOT } from '@grafloria/element';
import { markReady } from '../demo-ready';

/** Perf HUD & quality governor: an adaptive governor that steps the render tier
 *  DOWN under load and restores it when the budget recovers, and a HUD that
 *  reports it — fed live scene numbers off the mounted canvas. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <div style="font-size:12px;opacity:.8;padding:10px 24px;border-bottom:1px solid rgba(127,127,127,.25)">
      An adaptive quality governor and a HUD that reports it — measured live off the mounted scene.
    </div>
    <div style="height:calc(100vh - 45px);position:relative">
      <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges" style="display:block; height:100%" />
      <div #hud style="position:absolute;top:12px;right:12px;width:280px;z-index:5"></div>
    </div>
  `,
})
export class PerfHudComponent implements AfterViewInit {
  canvas = viewChild.required(DiagramCanvasComponent);
  hudHost = viewChild.required<ElementRef<HTMLElement>>('hud');
  nodes = Array.from({ length: 24 }, (_, i) => ({
    id: 'n' + i, label: 'N' + i,
    position: { x: 40 + (i % 6) * 150, y: 40 + Math.floor(i / 6) * 110 },
    size: { width: 120, height: 60 },
  }));
  edges = Array.from({ length: 20 }, (_, i) => ({ id: 'e' + i, source: 'n' + i, target: 'n' + (i + 1) }));

  ngAfterViewInit() {
    const canvas = this.canvas();
    const el = canvas.activeEngine()?.getDiagram();
    const gov = new QualityGovernor();
    const hud = new PerfHud(this.hudHost().nativeElement);
    hud.show();
    if (el) {
      const model = el as any;
      const hostEl = this.hudHost().nativeElement.parentElement as HTMLElement;
      hud.update({
        ...EMPTY_SNAPSHOT,
        nodes: model.getNodes().length,
        visibleNodes: hostEl.querySelectorAll('[data-node-id]').length,
        links: model.getLinks().length,
        visibleLinks: hostEl.querySelectorAll('[data-link-id]').length,
        tier: 'high',
        governor: gov.getState(),
      } as never);
    }
    markReady();
  }
}
