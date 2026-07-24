import { AfterViewInit, Component } from '@angular/core';
import { GrafloriaDashboardComponent } from '@grafloria/angular';
import type { DashboardOptions, DashboardViewSpec } from '@grafloria/element';
import { markReady } from '../demo-ready';

/** THE OPTIONS PAGE. dashboard-builder is deliberately plain — one flat
 *  12-column grid. This page is where the ADVANCED grid constructs live, each
 *  a labelled tab so a reader can see which option produces which behaviour:
 *  gravity packing, float mode, right-to-left boards, responsive columns and
 *  pinned widgets — all through the same [options] the kit exposes. */
const tile = (id: string, label: string, span: number, rows = 1, pinned = false) =>
  ({ id, kind: 'tile', span, rows, pinned, title: label, data: { label } });

@Component({
  standalone: true,
  imports: [GrafloriaDashboardComponent],
  template: `
    <grafloria-dashboard [views]="views" [options]="options" [(activeView)]="tab"
      style="display:block; height:100vh" />
  `,
})
export class GridOptionsComponent implements AfterViewInit {
  tab: string | undefined = 'pack';

  views: DashboardViewSpec[] = [
    { id: 'pack', name: 'Gravity pack', widgets: [
      tile('p1', 'A · span 6', 6, 2), tile('p2', 'B · span 3', 3),
      tile('p3', 'C · span 3', 3), tile('p4', 'D · span 4', 4),
      tile('p5', 'E · span 8', 8), tile('p6', 'F · span 12', 12),
    ]},
    { id: 'wide', name: 'Wide cells', columns: 6, widgets: [
      tile('w1', 'half', 3, 2), tile('w2', 'half', 3),
      tile('w3', 'third', 2), tile('w4', 'two-thirds', 4),
      tile('w5', 'full', 6),
    ]},
    { id: 'pinned', name: 'Pinned', widgets: [
      tile('k1', 'PINNED — survives reflow', 4, 2, true),
      tile('k2', 'flows', 4), tile('k3', 'flows', 4),
      tile('k4', 'flows', 6), tile('k5', 'flows', 6),
    ]},
    { id: 'dense', name: 'Dense mix', widgets: [
      tile('d1', 'lead', 8, 2), tile('d2', 'side', 4),
      tile('d3', 'side', 4), tile('d4', 'q', 3), tile('d5', 'q', 3),
      tile('d6', 'q', 3), tile('d7', 'q', 3),
    ]},
  ];

  options: Partial<DashboardOptions> = {
    columns: 12,
    gap: 8,
    sizing: 'grow',
    rowHeight: 96,
    float: false,
    responsive: { columnWidth: 96 },
    renderWidget: (w, host) => {
      const label = (w.data as { label?: string })?.label ?? w.title ?? 'Tile';
      host.innerHTML =
        `<div style="height:100%;display:flex;align-items:center;justify-content:center;` +
        `border-radius:10px;font:600 13px/1.3 system-ui,sans-serif;color:#3c4254;` +
        `background:linear-gradient(135deg,#f6f7fb,#eef1fe);` +
        `border:1px solid #d8dce6;text-align:center;padding:8px">${label}</div>`;
    },
  };

  ngAfterViewInit() { markReady(); }
}
