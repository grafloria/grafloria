import { AfterViewInit, Component, signal } from '@angular/core';
import { GrafloriaDashboardComponent } from '@grafloria/angular';
import type { DashboardHandle, DashboardViewSpec } from '@grafloria/element';
import { markReady } from '../demo-ready';

/** THE FLUID BOARD. No width in [options] → mode 'fluid': the board is 100% of
 *  its element at zoom 1 and GROWS by default. The switches are INPUTS — a
 *  signal change is one handle call on the live board, never a remount:
 *  [sizing] 'fit' keeps the height and squeezes rows; [layout] 'split' turns
 *  the grid into the DevExpress-style splitter tree (no corner handles). */
@Component({
  standalone: true,
  imports: [GrafloriaDashboardComponent],
  template: `
    <div class="bar">
      <button id="fit" (click)="sizing.set('fit')" [class.on]="sizing() === 'fit'">Fit</button>
      <button id="grow" (click)="sizing.set('grow')" [class.on]="sizing() === 'grow'">Grow</button>
      <span class="sep"></span>
      <button id="grid" (click)="layout.set('grid')" [class.on]="layout() === 'grid'">Grid</button>
      <button id="split" (click)="layout.set('split')" [class.on]="layout() === 'split'">Split</button>
      <span class="sep"></span>
      <button id="handle" (click)="toggleHandle()" [class.on]="grip" title="DevExpress caption drag: a widget moves only from its header">Drag by header</button>
      <span class="sep"></span>
      <button id="add" (click)="addRow()">+ Add a row</button>
    </div>
    <grafloria-dashboard
      [views]="views" [options]="options"
      [layout]="layout()" [sizing]="sizing()"
      (ready)="handle = $event"
      style="display:block; height:calc(100vh - 44px)" />
  `,
  styles: [`
    .bar { display:flex; gap:6px; align-items:center; height:44px; padding:0 10px; box-sizing:border-box;
           border-bottom:1px solid #e5e7eb; font:13px system-ui, sans-serif; }
    .bar button { padding:5px 10px; border:1px solid #d1d5db; border-radius:6px; background:#fff; cursor:pointer; }
    .bar button.on { background:#3B52D9; border-color:#3B52D9; color:#fff; }
    .sep { width:1px; height:20px; background:#e5e7eb; margin:0 4px; }
  `],
})
export class FluidBoardComponent implements AfterViewInit {
  handle?: DashboardHandle;
  layout = signal<'grid' | 'split'>('grid');
  sizing = signal<'fit' | 'grow'>('grow');
  options = { columns: 12, gap: 10 };
  views: DashboardViewSpec[] = [{ id: 'main', widgets: [
    { id: 'rev',  kind: 'kpi',   span: 3, rows: 1, data: { label: 'Revenue',   value: '$6.81M', delta: 12.4, spark: [3.9, 4.4, 4.1, 5.2, 5.9, 6.8] } },
    { id: 'cust', kind: 'kpi',   span: 3, rows: 1, data: { label: 'Customers', value: '1,284',  delta: 8.1,  spark: [980, 1010, 1090, 1150, 1210, 1284] } },
    { id: 'win',  kind: 'kpi',   span: 3, rows: 1, data: { label: 'Win rate',  value: '27.4%', delta: -1.2, spark: [29, 28.5, 28, 27.9, 27.6, 27.4] } },
    { id: 'nps',  kind: 'kpi',   span: 3, rows: 1, data: { label: 'NPS',       value: '61',    delta: 4.0,  spark: [52, 54, 57, 58, 60, 61] } },
    { id: 'trend', kind: 'line', span: 8, rows: 3, title: 'Revenue vs target',
      data: { series: [{ name: 'Revenue', values: [4.1, 4.4, 4.9, 5.2, 5.9, 6.8] }, { name: 'Target', values: [4.0, 4.5, 5.0, 5.5, 6.0, 6.5] }],
              labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'] } },
    { id: 'mix',  kind: 'donut', span: 4, rows: 3, title: 'Revenue by region',
      data: { slices: [{ label: 'North America', value: 2860 }, { label: 'EMEA', value: 1920 }, { label: 'APAC', value: 1340 }, { label: 'LATAM', value: 690 }] } },
    { id: 'reps', kind: 'table', span: 7, rows: 3, title: 'Top reps',
      data: { columns: ['Rep', 'Region', 'Closed', 'Quota'],
              rows: [['A. Farouk', 'EMEA', 412000, '118%'], ['J. Park', 'APAC', 388000, '104%'], ['M. Silva', 'LATAM', 301000, '96%'], ['R. Chen', 'NA', 297000, '91%']] } },
    { id: 'funnel', kind: 'funnel', span: 5, rows: 3, title: 'Pipeline',
      data: { stages: [{ label: 'Leads', value: 1840 }, { label: 'Qualified', value: 920 }, { label: 'Proposal', value: 410 }, { label: 'Won', value: 188 }] } },
  ] }];

  grip = false;
  /** DevExpress caption drag, live on the handle: the header is the only grip. */
  toggleHandle() { this.grip = !this.grip; this.handle?.setDragHandle(this.grip); }
  addRow() {
    this.handle?.addWidget({ id: 'row-' + Date.now(), kind: 'kpi', span: 12, rows: 1, data: { label: 'Added row', value: '+1' } });
  }
  ngAfterViewInit() { markReady(); }
}
