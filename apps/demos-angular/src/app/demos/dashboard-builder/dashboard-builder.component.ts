import { AfterViewInit, Component } from '@angular/core';
import { GrafloriaDashboardComponent } from '@grafloria/angular';
import { markReady } from '../demo-ready';

/** The dashboard kit, data-first: [views] declares the whole board; the kit
 *  wires the 12-column pack grid, drag/resize gestures and undo. */
@Component({
  standalone: true,
  imports: [GrafloriaDashboardComponent],
  template: `
    <grafloria-dashboard [views]="views" [(activeView)]="tab"
      style="display:block; height:100vh" />
  `,
})
export class DashboardBuilderComponent implements AfterViewInit {
  tab: string | undefined = 'overview';
  views = [
    { id: 'overview', name: 'Overview', widgets: [
      { id: 'kpi-revenue', kind: 'kpi', span: 3, rows: 1,
        data: { label: 'Total revenue', value: '$6.81M', delta: 12.4, deltaLabel: 'vs last qtr',
                spark: [42, 45, 47, 51, 50, 55, 59, 61, 60, 65, 71, 76] } },
      { id: 'kpi-customers', kind: 'kpi', span: 3, rows: 1,
        data: { label: 'New customers', value: '1,284', delta: 8.1, deltaLabel: 'vs last qtr',
                spark: [70, 74, 79, 83, 88, 92, 96, 101, 108, 116, 124, 131] } },
      { id: 'trend', kind: 'line', span: 6, rows: 2, title: 'Revenue trend',
        data: { series: [{ name: 'Revenue', values: [42, 45, 47, 51, 50, 55, 59, 61, 60, 65, 71, 76] }],
                labels: ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'] } },
      { id: 'mix', kind: 'donut', span: 6, rows: 2, title: 'Revenue by region',
        data: { slices: [
          { label: 'EMEA', value: 2.9, color: '#3B52D9' },
          { label: 'AMER', value: 2.4, color: '#94A5F0' },
          { label: 'APAC', value: 1.5, color: '#059669' },
        ], centerLabel: '$6.8M' } },
      { id: 'bars', kind: 'bar', span: 6, rows: 2, title: 'Deals by quarter',
        data: { bars: [
          { label: 'Q1', value: 210 }, { label: 'Q2', value: 260 },
          { label: 'Q3', value: 245 }, { label: 'Q4', value: 292 },
        ] } },
    ]},
  ];
  ngAfterViewInit() { markReady(); }
}
