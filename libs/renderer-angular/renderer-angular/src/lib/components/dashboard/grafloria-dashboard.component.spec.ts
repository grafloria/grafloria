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


@Component({
  imports: [GrafloriaDashboardComponent],
  template: `
    <grafloria-dashboard
      style="display:block;width:1200px;height:600px"
      [views]="views" [options]="{ width: 1200, height: 600, layout: 'grid' }"
      [layout]="layout()" [sizing]="sizing()" [static]="isStatic()"
      (ready)="handle = $event; readyCount = readyCount + 1" />
  `,
})
class SwitchHost {
  handle: DashboardHandle | null = null;
  readyCount = 0;
  layout = signal<'grid' | 'split'>('split');
  sizing = signal<'fit' | 'grow'>('fit');
  isStatic = signal(true);
  views: DashboardViewSpec[] = [
    { id: 'main', widgets: [{ id: 'a', kind: 'kpi', span: 6 }, { id: 'b', kind: 'kpi', span: 6 }, { id: 'c', kind: 'line', span: 12, rows: 2 }] },
    { id: 'other', widgets: [{ id: 'd', kind: 'kpi', span: 12 }] },
  ];
}

describe('<grafloria-dashboard> live switches ([layout] / [sizing] / [static])', () => {
  it('boot from the inputs over [options], and switch live through the same handle', async () => {
    await TestBed.configureTestingModule({ imports: [SwitchHost] }).compileComponents();
    const fixture = TestBed.createComponent(SwitchHost);
    const host = fixture.componentInstance;
    fixture.detectChanges();
    expect(host.handle!.getLayout()).toBe('split');
    expect(host.handle!.getStatic()).toBe(true);
    const first = host.handle;
    host.layout.set('grid');
    host.sizing.set('grow');
    host.isStatic.set(false);
    // Effects run on the next change-detection pass; `whenStable` would wait
    // on the board's own observers and timers instead.
    fixture.detectChanges();
    await Promise.resolve();
    fixture.detectChanges();
    expect(first!.getLayout()).toBe('grid');
    expect(first!.getSizing()).toBe('grow');
    expect(first!.getStatic()).toBe(false);
    expect(host.readyCount).toBe(1);
    expect(host.handle).toBe(first);
    fixture.destroy();
  });
  it('[layout] names the whole board: a parked view switches too', async () => {
    await TestBed.configureTestingModule({ imports: [SwitchHost] }).compileComponents();
    const fixture = TestBed.createComponent(SwitchHost);
    const host = fixture.componentInstance;
    host.layout.set('grid');
    fixture.detectChanges();
    const h = host.handle!;
    expect(h.getLayout('main')).toBe('grid');
    expect(h.getLayout('other')).toBe('grid');
    host.layout.set('split');
    fixture.detectChanges();
    await Promise.resolve();
    fixture.detectChanges();
    expect(h.getLayout('main')).toBe('split');
    expect(h.getLayout('other')).toBe('split'); // parked, and switched all the same
    fixture.destroy();
  });
});
