/**
 * TDD — <grafloria-dashboard>, written BEFORE the implementation.
 *
 * The dashboard kit is data-first (`dashboard({ views }) → render()`); the
 * Angular component makes that native:
 *
 *   - [views]/[options] declare the board; the kit's built-in painters draw
 *     kpi/line/bar/donut/funnel/table widgets with no template required
 *   - <ng-template grafloriaWidget="kind"> renders THAT kind with real
 *     Angular bindings (the node-template idiom, applied to widgets)
 *   - [(activeView)] two-way tab switching; (ready) hands out the typed
 *     DashboardHandle; (layoutChange) mirrors the kit's committed gestures
 *   - snapshot() proxies toJSON() — the data-first round trip
 */
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { GrafloriaDashboardComponent } from './grafloria-dashboard.component';
import { GrafloriaWidgetDefDirective } from './grafloria-widget-def.directive';
import type { DashboardHandle, DashboardViewSpec } from '@grafloria/element';

@Component({
  imports: [GrafloriaDashboardComponent, GrafloriaWidgetDefDirective],
  template: `
    <grafloria-dashboard
      style="display:block;width:1200px;height:700px"
      [views]="views"
      [options]="{ columns: 12, gap: 8 }"
      [(activeView)]="activeView"
      (ready)="handle = $event"
      (layoutChange)="layoutChanges = layoutChanges + 1">
      <ng-template grafloriaWidget="custom" let-widget let-data="data">
        <div class="tpl-widget" [attr.data-widget]="widget.id">{{ data['title'] }}</div>
      </ng-template>
    </grafloria-dashboard>
  `,
})
class DashboardHost {
  activeView: string | undefined = undefined;
  handle: DashboardHandle | null = null;
  layoutChanges = 0;
  views: DashboardViewSpec[] = [
    {
      id: 'sales',
      widgets: [
        { id: 'rev', kind: 'kpi', span: 3, data: { label: 'Revenue', value: '$6.8M' } },
        { id: 'note', kind: 'custom', span: 4, data: { title: 'Hello widget' } },
      ],
    },
    {
      id: 'ops',
      widgets: [{ id: 'load', kind: 'kpi', span: 3, data: { label: 'Load', value: '42%' } }],
    },
  ];
}

describe('<grafloria-dashboard>', () => {
  let fixture: ComponentFixture<DashboardHost>;
  let host: DashboardHost;
  let el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [DashboardHost] }).compileComponents();
    fixture = TestBed.createComponent(DashboardHost);
    host = fixture.componentInstance;
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => fixture.destroy());

  it('mounts the board and paints built-in widgets from data', () => {
    expect(host.handle).toBeTruthy();
    expect(el.textContent).toContain('Revenue');
    expect(el.textContent).toContain('$6.8M');
  });

  it('renders a matching widget kind through the ng-template', () => {
    const w = el.querySelector('.tpl-widget[data-widget="note"]');
    expect(w).toBeTruthy();
    expect(w!.textContent).toContain('Hello widget');
  });

  it('(ready) hands out the typed handle with the declared views', () => {
    expect(host.handle!.views).toEqual(['sales', 'ops']);
    expect(host.activeView).toBe('sales');
  });

  it('[(activeView)] switches views through the handle', () => {
    host.activeView = 'ops';
    fixture.detectChanges();
    expect(host.handle!.activeView).toBe('ops');
  });

  it('snapshot() round-trips as dashboard() input (the data-first contract)', () => {
    const dashboard = fixture.debugElement.query(By.directive(GrafloriaDashboardComponent))
      .componentInstance as GrafloriaDashboardComponent;
    const snap = dashboard.snapshot()!;
    expect(snap.views.map((v: { id?: string }) => v.id)).toEqual(['sales', 'ops']);
    expect(snap.views[0].widgets.map((w: { id: string }) => w.id).sort()).toEqual(['note', 'rev']);
  });

  it('destroy cleans the board DOM', () => {
    fixture.destroy();
    expect(document.querySelector('.tpl-widget')).toBeNull();
  });
});
