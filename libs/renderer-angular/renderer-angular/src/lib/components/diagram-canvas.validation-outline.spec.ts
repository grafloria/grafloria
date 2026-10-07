/**
 * The validation outline (highlighter layer, ON by default in Angular) must not
 * flag a node just because its type is one of the built-in shapes.
 *
 * The docs review found the orange "Node type 'rect' is not registered" outline
 * on 14 of 21 Angular samples: `{ type: 'rect' }` — the DEFAULT type of every
 * node spec — is a shape the renderer draws, not a domain type somebody forgot
 * to register in the engine's TypeRegistry.
 */
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { DiagramEngine } from '@grafloria/engine';
import { buildNode, type NodeSpec } from '@grafloria/renderer';
import { DiagramCanvasComponent } from './diagram-canvas.component';

const SHAPES = ['rect', 'circle', 'ellipse', 'diamond', 'hexagon', 'cylinder', 'document', 'parallelogram'];

@Component({
  imports: [DiagramCanvasComponent],
  template: `<grafloria-diagram-canvas style="display:block;width:800px;height:600px" [(nodes)]="nodes" />`,
})
class ControlledHost {
  nodes = signal<NodeSpec[]>([
    { id: 'default', position: { x: 0, y: 0 }, size: { width: 100, height: 50 }, label: 'no type' },
    ...SHAPES.map((type, i) => ({ id: type, type, position: { x: 150 * (i + 1), y: 0 }, size: { width: 100, height: 50 } })),
  ]);
}

describe('DiagramCanvasComponent — validation outline on built-in shapes', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [DiagramCanvasComponent, ControlledHost] }).compileComponents();
  });

  const validationOutlines = (canvas: DiagramCanvasComponent) =>
    canvas.highlighters.filter((h) => h.kind === 'validation');

  function paint(fixture: ComponentFixture<unknown>, canvas: DiagramCanvasComponent): void {
    (canvas as unknown as { renderNow(): void }).renderNow();
    fixture.detectChanges();
  }

  test('controlled [(nodes)]: no built-in shape (nor the default type) is outlined', () => {
    const fixture = TestBed.createComponent(ControlledHost);
    fixture.detectChanges();
    const canvas = fixture.debugElement.query(By.directive(DiagramCanvasComponent)).componentInstance as DiagramCanvasComponent;
    paint(fixture, canvas);

    expect(canvas.activeEngine()!.getDiagram()!.getNodes()).toHaveLength(SHAPES.length + 1);
    expect(validationOutlines(canvas).map((h) => h.message)).toEqual([]);
    expect(fixture.nativeElement.querySelectorAll('.grafloria-highlighter-validation')).toHaveLength(0);
    fixture.destroy();
  });

  describe('[engine]', () => {
    let engine: DiagramEngine;
    let fixture: ComponentFixture<DiagramCanvasComponent>;
    let canvas: DiagramCanvasComponent;

    beforeEach(() => {
      engine = new DiagramEngine();
      engine.createDiagram('outline');
    });
    afterEach(() => {
      fixture.destroy();
      engine.destroy();
    });

    function mount(types: string[]): void {
      const diagram = engine.getDiagram()!;
      types.forEach((type, i) =>
        diagram.addNode(buildNode({ id: `n${i}`, type, position: { x: 150 * i, y: 0 }, size: { width: 100, height: 50 } } as never, i))
      );
      fixture = TestBed.createComponent(DiagramCanvasComponent);
      canvas = fixture.componentInstance;
      fixture.componentRef.setInput('engine', engine);
      fixture.detectChanges();
      paint(fixture, canvas);
    }

    test('built-in shapes are not outlined', () => {
      mount(SHAPES);
      expect(validationOutlines(canvas).map((h) => h.message)).toEqual([]);
    });

    test('control: a type that is neither registered nor a shape is still outlined', () => {
      mount(['rect', 'mystery-type']);
      const outlines = validationOutlines(canvas);
      expect(outlines).toHaveLength(1);
      expect(outlines[0]).toMatchObject({ entityId: 'n1', severity: 'warning' });
      expect(outlines[0]!.message).toBe("Node type 'mystery-type' is not registered");
    });

    test('control: a REGISTERED rule a shape-typed node breaks is still outlined', () => {
      engine.registerNodeType({ type: 'rect', label: 'Box', minPorts: 9 } as never);
      mount(['rect']);
      const outlines = validationOutlines(canvas);
      expect(outlines).toHaveLength(1);
      expect(outlines[0]).toMatchObject({ entityId: 'n0', severity: 'error' });
    });
  });
});
