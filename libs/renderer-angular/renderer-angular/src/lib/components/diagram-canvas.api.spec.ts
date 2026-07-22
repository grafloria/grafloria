/**
 * Phase 2 (Angular-native DX) — the declarative [layout] input and the public
 * component API: applyLayout() / exportSvg() / snapshot() / loadSnapshot().
 *
 * The engine capabilities themselves are unit-tested in @grafloria/engine and
 * @grafloria/renderer; THIS file proves the Angular seams: the binding runs a
 * real registry layout, the export contains the real scene, and a snapshot
 * round-trips through loadSnapshot.
 */
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { DiagramCanvasComponent, type GrafloriaLayoutRequest } from './diagram-canvas.component';
import type { NodeSpec, EdgeSpec } from '@grafloria/renderer';

@Component({
  imports: [DiagramCanvasComponent],
  template: `
    <grafloria-diagram-canvas
      style="display:block;width:800px;height:600px"
      [viewport]="{ x: 0, y: 0, width: 800, height: 600 }"
      [zoom]="1"
      [layout]="layout()"
      [(nodes)]="nodes"
      [(edges)]="edges"
      (layoutDone)="layoutsCompleted = layoutsCompleted + 1">
    </grafloria-diagram-canvas>
  `,
})
class ApiHost {
  layout = signal<string | GrafloriaLayoutRequest | undefined>(undefined);
  layoutsCompleted = 0;
  // All nodes deliberately stacked at the same position — any real layout
  // must separate them.
  nodes = signal<NodeSpec[]>([
    { id: 'a', position: { x: 0, y: 0 }, size: { width: 100, height: 50 }, label: 'A' },
    { id: 'b', position: { x: 0, y: 0 }, size: { width: 100, height: 50 }, label: 'B' },
    { id: 'c', position: { x: 0, y: 0 }, size: { width: 100, height: 50 }, label: 'C' },
  ]);
  edges = signal<EdgeSpec[]>([
    { source: 'a', target: 'b' },
    { source: 'b', target: 'c' },
  ]);
}

describe('diagram-canvas Angular-native API', () => {
  let fixture: ComponentFixture<ApiHost>;
  let host: ApiHost;
  let canvas: DiagramCanvasComponent;

  const positions = () => {
    const diagram = (canvas as any).eng.getDiagram();
    return diagram.getNodes().map((n: any) => ({ id: n.id, ...n.position }));
  };
  const distinctPositions = () => new Set(positions().map((p: any) => `${p.x},${p.y}`)).size;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ApiHost] }).compileComponents();
    fixture = TestBed.createComponent(ApiHost);
    host = fixture.componentInstance;
    fixture.detectChanges();
    canvas = fixture.debugElement.query(By.directive(DiagramCanvasComponent)).componentInstance;
    (canvas as unknown as { renderNow(): void }).renderNow();
    fixture.detectChanges();
  });

  afterEach(() => fixture.destroy());

  it('stacked nodes stay stacked until a layout is requested', () => {
    expect(distinctPositions()).toBe(1);
  });

  it('[layout]="\'grid\'" runs a registry layout and separates the nodes', async () => {
    host.layout.set('grid');
    fixture.detectChanges(); // flush effects — the layout kicks off async
    // whenStable() would wait on the layout's rAF animation chain forever in
    // jsdom; poll the model instead.
    for (let i = 0; i < 100 && distinctPositions() !== 3; i++) {
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(distinctPositions()).toBe(3);
    expect(host.layoutsCompleted).toBeGreaterThanOrEqual(1);
  });

  it('applyLayout() re-runs imperatively and resolves with the result', async () => {
    const result = await canvas.applyLayout({ name: 'tree' });
    expect(result).toBeDefined();
    expect(distinctPositions()).toBe(3);
  });

  it('exportSvg() returns the real scene', () => {
    const out = canvas.exportSvg();
    const svg = typeof out === 'string' ? out : out.svg;
    expect(svg).toContain('<svg');
    expect(svg).toContain('A'); // node label made it into the export
  });

  it('snapshot() → loadSnapshot() round-trips the diagram', async () => {
    await canvas.applyLayout({ name: 'grid' });
    const saved = canvas.snapshot()!;
    expect(saved).toBeTruthy();
    const savedPositions = JSON.stringify(positions());

    // wreck the live diagram, then restore
    await canvas.applyLayout({ name: 'tree' });
    expect(JSON.stringify(positions())).not.toBe(savedPositions);

    canvas.loadSnapshot(saved);
    expect(JSON.stringify(positions())).toBe(savedPositions);
  });
});
