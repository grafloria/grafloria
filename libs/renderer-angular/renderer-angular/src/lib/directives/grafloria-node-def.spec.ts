/**
 * Phase 2 (Angular-native DX) — declarative custom nodes + provideGrafloria().
 *
 * <ng-template grafloriaNode="type"> is THE Angular idiom for custom nodes:
 * this file proves (a) a controlled spec whose type matches a def renders
 * through the template with real Angular bindings — WITHOUT the author setting
 * `custom`; (b) data changes re-render; (c) nodes without a def stay on the
 * SVG path; (d) the wildcard def catches custom nodes with no exact def;
 * (e) provideGrafloria({ theme }) is the app-wide default and an explicit
 * [theme] binding still wins.
 */
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { DiagramCanvasComponent } from '../components/diagram-canvas.component';
import { GrafloriaNodeDefDirective } from './grafloria-node-def.directive';
import { provideGrafloria } from '../providers';
import { DARK_THEME, LIGHT_THEME, type NodeSpec, type EdgeSpec } from '@grafloria/renderer';

@Component({
  imports: [DiagramCanvasComponent, GrafloriaNodeDefDirective],
  template: `
    <grafloria-diagram-canvas
      style="display:block;width:800px;height:600px"
      [viewport]="{ x: 0, y: 0, width: 800, height: 600 }"
      [zoom]="1"
      [(nodes)]="nodes"
      [(edges)]="edges">
      <ng-template grafloriaNode="card" let-node let-data="data">
        <div class="tpl-card" [attr.data-node]="node.id">{{ data['title'] }}</div>
      </ng-template>
      <ng-template grafloriaNode let-node>
        <div class="tpl-wild" [attr.data-node]="node.id">wild</div>
      </ng-template>
    </grafloria-diagram-canvas>
  `,
})
class TemplateNodesHost {
  nodes = signal<NodeSpec[]>([
    { id: 'c1', type: 'card', position: { x: 20, y: 20 }, size: { width: 120, height: 60 }, data: { title: 'Alpha card' } },
    { id: 'p1', type: 'plain', position: { x: 300, y: 20 }, size: { width: 100, height: 50 } },
    { id: 'w1', type: 'misc', custom: true, position: { x: 20, y: 200 }, size: { width: 100, height: 50 } },
  ]);
  edges = signal<EdgeSpec[]>([]);
}

function canvasOf(fixture: ComponentFixture<unknown>): DiagramCanvasComponent {
  return fixture.debugElement.query(By.directive(DiagramCanvasComponent)).componentInstance;
}

/** Paint synchronously (the render loop is rAF-coalesced) and run CD. */
function paint(fixture: ComponentFixture<unknown>): void {
  (canvasOf(fixture) as unknown as { renderNow(): void }).renderNow();
  fixture.detectChanges();
}

describe('<ng-template grafloriaNode> — Angular-native custom nodes', () => {
  let fixture: ComponentFixture<TemplateNodesHost>;
  let host: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [TemplateNodesHost] }).compileComponents();
    fixture = TestBed.createComponent(TemplateNodesHost);
    fixture.detectChanges();
    paint(fixture);
    host = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => fixture.destroy());

  it('renders a matching node through the template — no manual `custom` flag', () => {
    const card = host.querySelector('.tpl-card[data-node="c1"]');
    expect(card).toBeTruthy();
    expect(card!.textContent).toContain('Alpha card');
  });

  it('the template def alone routed the node to the HTML layer', () => {
    const wrapper = host.querySelector('.html-node-wrapper[data-node-id="c1"]');
    expect(wrapper).toBeTruthy();
  });

  it('re-renders when controlled data changes', () => {
    const h = fixture.componentInstance;
    h.nodes.set(h.nodes().map((n) => (n.id === 'c1' ? { ...n, data: { title: 'Beta card' } } : n)));
    fixture.detectChanges();
    paint(fixture);
    expect(host.querySelector('.tpl-card[data-node="c1"]')!.textContent).toContain('Beta card');
  });

  it('a node without a def stays on the SVG path (not forced into the HTML layer)', () => {
    expect(host.querySelector('.html-node-wrapper[data-node-id="p1"]')).toBeNull();
    expect(host.querySelector('.tpl-card[data-node="p1"]')).toBeNull();
  });

  it('the wildcard def renders custom nodes that have no exact def', () => {
    const wild = host.querySelector('.tpl-wild[data-node="w1"]');
    expect(wild).toBeTruthy();
    expect(wild!.textContent).toContain('wild');
  });
});

describe('provideGrafloria({ theme })', () => {
  @Component({
    imports: [DiagramCanvasComponent],
    template: `<grafloria-diagram-canvas style="display:block;width:400px;height:300px" />`,
  })
  class DefaultThemeHost {}

  @Component({
    imports: [DiagramCanvasComponent],
    template: `<grafloria-diagram-canvas style="display:block;width:400px;height:300px" [theme]="explicit" />`,
  })
  class ExplicitThemeHost {
    explicit = LIGHT_THEME;
  }

  it('is the app-wide default when the canvas has no [theme] binding', async () => {
    await TestBed.configureTestingModule({
      imports: [DefaultThemeHost],
      providers: [provideGrafloria({ theme: DARK_THEME })],
    }).compileComponents();
    const fixture = TestBed.createComponent(DefaultThemeHost);
    fixture.detectChanges();
    expect(canvasOf(fixture).effectiveTheme()).toBe(DARK_THEME);
    fixture.destroy();
  });

  it('an explicit [theme] binding wins over the provided default', async () => {
    await TestBed.configureTestingModule({
      imports: [ExplicitThemeHost],
      providers: [provideGrafloria({ theme: DARK_THEME })],
    }).compileComponents();
    const fixture = TestBed.createComponent(ExplicitThemeHost);
    fixture.detectChanges();
    expect(canvasOf(fixture).effectiveTheme()).toBe(LIGHT_THEME);
    fixture.destroy();
  });

  it('without a provider the built-in light theme applies', async () => {
    await TestBed.configureTestingModule({ imports: [DefaultThemeHost] }).compileComponents();
    const fixture = TestBed.createComponent(DefaultThemeHost);
    fixture.detectChanges();
    expect(canvasOf(fixture).effectiveTheme()).toBe(LIGHT_THEME);
    fixture.destroy();
  });
});
