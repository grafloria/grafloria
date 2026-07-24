import { AfterViewInit, Component, viewChild } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/angular';
import { markReady } from '../demo-ready';

/** Port labels with placement control: outside, inside, orthogonal — plus an
 *  angled label that keeps itself upright. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges"
      style="display:block; height:100vh" />
  `,
})
export class PortLabelsComponent implements AfterViewInit {
  canvas = viewChild.required(DiagramCanvasComponent);
  nodes = [
    { id: 'n', position: { x: 380, y: 220 }, size: { width: 180, height: 160 }, label: 'placements',
      ports: [
        { id: 'out', side: 'left' as const,  shape: { shape: 'circle', size: 12 }, label: { text: 'OUT', layout: 'outside' } },
        { id: 'in',  side: 'right' as const, shape: { shape: 'circle', size: 12 }, label: { text: 'IN', layout: 'inside' } },
        { id: 'ort', side: 'top' as const,   shape: { shape: 'circle', size: 12 }, label: { text: 'ORT', layout: 'orthogonal' } },
      ] },
    { id: 'flip', position: { x: 120, y: 250 }, size: { width: 120, height: 80 }, label: 'keepUpright',
      ports: [{ id: 'up', side: 'left' as const, shape: { shape: 'circle', size: 12 }, label: { text: 'up', layout: 'outside', angle: 160, keepUpright: true } }] },
  ];
  edges = [];
  ngAfterViewInit() {
    // portVisibility lives on the interaction config — always-on ports
    // through the same seam the config panel drives.
    // 'always' is PortVisibilityStrategy.ALWAYS; the enum isn't in the public
    // barrel yet, so cast the literal (the lib's own config panel does the same).
    this.canvas().activeEngine()?.setInteractionConfig({ portVisibility: 'always' as never });
    markReady();
  }
}
