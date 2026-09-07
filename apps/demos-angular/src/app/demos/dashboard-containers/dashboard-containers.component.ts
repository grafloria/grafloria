import { AfterViewInit, Component } from '@angular/core';
import { GrafloriaDashboardComponent } from '@grafloria/angular';
import type { DashboardViewSpec } from '@grafloria/element';
import { markReady } from '../demo-ready';

/** NESTED CONTAINERS. A widget with `widgets` of its own is a CONTAINER: it
 *  mounts as a locked slab in the board with its own pack grid inside (here
 *  4 columns for 3 KPIs, so a dragged-in tile has a free slot to land in).
 *  width + height in [options] → mode 'fixed': a 1180×620 design the camera
 *  fits into the element. */
@Component({
  standalone: true,
  imports: [GrafloriaDashboardComponent],
  template: `
    <grafloria-dashboard [views]="views" [options]="options"
      style="display:block; height:100vh" />
  `,
})
export class DashboardContainersComponent implements AfterViewInit {
  options = { columns: 12, gap: 8, width: 1180, height: 620 };
  views: DashboardViewSpec[] = [{
    id: 'main', name: 'Overview',
    widgets: [
      { id: 'trend', kind: 'line', span: 8, rows: 2, title: 'Revenue trend',
        data: { series: [{ name: 'Revenue', values: [1.2, 1.5, 1.4, 1.9, 2.3, 2.8] }], labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'] } },
      { id: 'mix', kind: 'donut', span: 4, rows: 2, title: 'By region',
        data: { slices: [{ label: 'EMEA', value: 2.9, color: '#3B52D9' }, { label: 'APAC', value: 1.8, color: '#0891b2' }, { label: 'NA', value: 2.1, color: '#f59e0b' }] } },
      { id: 'kpis', title: 'KPI section', span: 12, rows: 1, columns: 4,
        widgets: [
          { id: 'k-rev',  kind: 'kpi', span: 1, rows: 1, data: { label: 'Revenue',   value: '$6.8M', delta: 12.4 } },
          { id: 'k-cust', kind: 'kpi', span: 1, rows: 1, data: { label: 'Customers', value: '1,284', delta: 8.1 } },
          { id: 'k-win',  kind: 'kpi', span: 1, rows: 1, data: { label: 'Win rate',  value: '27.4%', delta: 3.5 } },
        ] },
      { id: 'deals', kind: 'bar', span: 12, rows: 2, title: 'Deals by quarter',
        data: { bars: [{ label: 'Q1', value: 210 }, { label: 'Q2', value: 262 }, { label: 'Q3', value: 244 }, { label: 'Q4', value: 301 }] } },
    ],
  }];
  ngAfterViewInit() { markReady(); }
}
