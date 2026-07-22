import { Component, signal } from '@angular/core';
import {
  GrafloriaDashboardComponent,
  GrafloriaWidgetDefDirective,
} from '@grafloria/renderer-angular';
import type { DashboardHandle, DashboardViewSpec } from '@grafloria/element';

@Component({
  selector: 'app-dashboard-page',
  imports: [GrafloriaDashboardComponent, GrafloriaWidgetDefDirective],
  template: `
    <h2>Dashboard kit — the Angular way</h2>
    <p>
      @for (view of handle?.views ?? []; track view) {
        <button [id]="'tab-' + view" type="button"
                [style.fontWeight]="activeView() === view ? '700' : '400'"
                (click)="activeView.set(view)">{{ view }}</button>
      }
      <span id="db-status">{{ status() }}</span>
    </p>
    <grafloria-dashboard
      style="display:block;width:860px;height:430px;border:1px solid #ccc"
      [views]="views"
      [options]="{ columns: 12, gap: 8 }"
      [(activeView)]="activeView"
      (ready)="handle = $event"
      (layoutChange)="status.set('layout changed: ' + $event.viewId)">
      <ng-template grafloriaWidget="deploys" let-data="data">
        <div class="tpl-deploys"
             style="width:100%;height:100%;border-radius:8px;background:#1d3557;color:#f1faee;
                    padding:10px;box-sizing:border-box;font:12px system-ui">
          <strong>Deploys (ng-template)</strong>
          @for (d of asDeploys(data['items']); track d.name) {
            <div>{{ d.name }} — {{ d.state }}</div>
          }
        </div>
      </ng-template>
    </grafloria-dashboard>
  `,
})
export class DashboardPageComponent {
  handle: DashboardHandle | null = null;
  readonly activeView = signal<string | undefined>(undefined);
  readonly status = signal('idle');

  asDeploys(v: unknown): Array<{ name: string; state: string }> {
    return (v as Array<{ name: string; state: string }>) ?? [];
  }

  views: DashboardViewSpec[] = [
    {
      id: 'sales',
      widgets: [
        { id: 'rev', kind: 'kpi', span: 3, data: { label: 'Revenue', value: '$6.8M', delta: 12.4 } },
        { id: 'ord', kind: 'kpi', span: 3, data: { label: 'Orders', value: '1,982', delta: -2.1 } },
        { id: 'trend', kind: 'line', span: 6, rows: 2, data: { series: [10, 14, 12, 19, 23, 21, 28], labels: ['M', 'T', 'W', 'T', 'F', 'S', 'S'] } },
        { id: 'mix', kind: 'donut', span: 3, data: { slices: [{ label: 'EU', value: 44 }, { label: 'US', value: 31 }, { label: 'APAC', value: 25 }] } },
        { id: 'deploys', kind: 'deploys', span: 3, data: { items: [{ name: 'api', state: 'live' }, { name: 'web', state: 'building' }] } },
      ],
    },
    {
      id: 'ops',
      widgets: [
        { id: 'cpu', kind: 'kpi', span: 4, data: { label: 'CPU', value: '42%' } },
        { id: 'errors', kind: 'bar', span: 8, rows: 2, data: { bars: [{ label: 'mon', value: 3 }, { label: 'tue', value: 7 }, { label: 'wed', value: 2 }] } },
      ],
    },
  ];
}
