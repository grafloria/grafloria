/**
 * The canvas always has something to draw on, as the JS `createDiagram(el)` does
 * (`engine.getDiagram() ?? engine.createDiagram(...)`, and an engine of its own
 * when none is given).
 *
 * N2 (docs review v4): an `[engine]` without a diagram rendered nothing and never
 * fired `(ready)` — the extend-connections-and-style Angular tab was blank with
 * "Mount the diagram before installing its rules".
 * N3: a canvas with neither `[engine]` nor `[(nodes)]` had no engine at all, so
 * the whiteboard tab's `ngAfterViewInit` threw "Canvas is not mounted".
 */
import { AfterViewInit, Component, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DiagramEngine } from '@grafloria/engine';
import type { NodeSpec } from '@grafloria/renderer';
import { DiagramCanvasComponent } from './diagram-canvas.component';
import type { GrafloriaCanvasInstance } from './diagram-canvas.instance';

const NODES: NodeSpec[] = [
  { id: 'a', position: { x: 0, y: 0 }, size: { width: 100, height: 50 }, label: 'A' },
  { id: 'b', position: { x: 200, y: 0 }, size: { width: 100, height: 50 }, label: 'B' },
];

@Component({
  imports: [DiagramCanvasComponent],
  template: `<grafloria-diagram-canvas style="display:block;width:800px;height:600px"
    [engine]="engine" [(nodes)]="nodes" (ready)="ready.push($event)" />`,
})
class EngineWithoutDiagramHost implements AfterViewInit {
  readonly canvas = viewChild.required(DiagramCanvasComponent);
  readonly engine = new DiagramEngine();
  nodes = signal<NodeSpec[]>(NODES);
  ready: GrafloriaCanvasInstance[] = [];
  diagramAtViewInit: unknown = 'unset';
  ngAfterViewInit(): void {
    this.diagramAtViewInit = this.canvas().activeEngine()?.getDiagram();
  }
}

@Component({
  imports: [DiagramCanvasComponent],
  template: `<grafloria-diagram-canvas style="display:block;width:800px;height:600px"
    [engine]="engine" (ready)="ready.push($event)" />`,
})
class BareEngineHost {
  readonly engine = new DiagramEngine();
  ready: GrafloriaCanvasInstance[] = [];
}

@Component({
  imports: [DiagramCanvasComponent],
  template: `<grafloria-diagram-canvas style="display:block;width:800px;height:600px" (ready)="ready.push($event)" />`,
})
class NoInputsHost implements AfterViewInit {
  readonly canvas = viewChild.required(DiagramCanvasComponent);
  ready: GrafloriaCanvasInstance[] = [];
  atViewInit: { engine: boolean; diagram: boolean; viewport: boolean } | null = null;
  ngAfterViewInit(): void {
    const canvas = this.canvas();
    const engine = canvas.activeEngine();
    this.atViewInit = { engine: !!engine, diagram: !!engine?.getDiagram(), viewport: !!canvas.viewportController() };
  }
}

describe('DiagramCanvasComponent — always mounted on a diagram', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [EngineWithoutDiagramHost, BareEngineHost, NoInputsHost] }).compileComponents();
  });

  test('N2: an [engine] without a diagram gets one, draws the bound nodes and fires (ready)', () => {
    const fixture = TestBed.createComponent(EngineWithoutDiagramHost);
    const host = fixture.componentInstance;
    fixture.detectChanges();

    const diagram = host.engine.getDiagram();
    expect(diagram).toBeTruthy();
    expect(host.diagramAtViewInit).toBe(diagram);
    expect(diagram!.getNodes().map((n) => n.id)).toEqual(['a', 'b']);
    expect(fixture.nativeElement.querySelectorAll('svg.grafloria-diagram [data-node-id="a"]').length).toBeGreaterThan(0);
    expect(host.ready).toHaveLength(1);
    expect(host.ready[0]!.getModel()).toBe(diagram);
    fixture.destroy();
  });

  test('N2: an [engine] without a diagram and no nodes still fires (ready)', () => {
    const fixture = TestBed.createComponent(BareEngineHost);
    fixture.detectChanges();
    expect(fixture.componentInstance.engine.getDiagram()).toBeTruthy();
    expect(fixture.componentInstance.ready).toHaveLength(1);
    fixture.destroy();
  });
});
