/**
 * The validation outline (highlighter layer, ON by default in Angular) must not
 * flag a node just because its type is one of the built-in shapes.
 *
 * The docs review found the orange "Node type 'rect' is not registered" outline
 * on 14 of 21 Angular samples: `{ type: 'rect' }` — the DEFAULT type of every
 * node spec — is a shape the renderer draws, not a domain type somebody forgot
 * to register in the engine's TypeRegistry.
 */
import { Component, Input, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { DiagramEngine } from '@grafloria/engine';
import { buildNode, type NodeSpec } from '@grafloria/renderer';
import { DiagramCanvasComponent } from './diagram-canvas.component';
import { GrafloriaNodeDefDirective } from '../directives/grafloria-node-def.directive';
import { ComponentRendererService } from '../services/component-renderer.service';
import type { NodeModel } from '@grafloria/engine';

@Component({ selector: 'test-job', template: `<b>{{ node?.id }}</b>` })
class JobComponent {
  @Input() node: NodeModel | undefined = undefined;
}

/** The three ways a canvas draws a custom type: a template, a registered component, `custom: true`. */
@Component({
  imports: [DiagramCanvasComponent, GrafloriaNodeDefDirective],
  providers: [ComponentRendererService],
  template: `<grafloria-diagram-canvas style="display:block;width:800px;height:600px" [(nodes)]="nodes">
    <ng-template grafloriaNode="card" let-data="data"><div>{{ data.title }}</div></ng-template>
  </grafloria-diagram-canvas>`,
})
class CustomTypesHost {
  constructor(renderer: ComponentRendererService) {
    renderer.registerComponent('registered-job', JobComponent);
  }
  nodes = signal<NodeSpec[]>([
    { id: 'tpl', type: 'card', custom: true, position: { x: 0, y: 0 }, size: { width: 100, height: 50 }, data: { title: 'T' } },
    { id: 'cmp', type: 'registered-job', custom: true, position: { x: 150, y: 0 }, size: { width: 100, height: 50 } },
    { id: 'html', type: 'html-only', custom: true, position: { x: 300, y: 0 }, size: { width: 100, height: 50 } },
    { id: 'unknown', type: 'mystery-type', position: { x: 450, y: 0 }, size: { width: 100, height: 50 } },
  ]);
}

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
    await TestBed.configureTestingModule({ imports: [DiagramCanvasComponent, ControlledHost, CustomTypesHost] }).compileComponents();
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

  test('custom types the canvas draws (template, registered component, custom: true) are not outlined', () => {
    const fixture = TestBed.createComponent(CustomTypesHost);
    fixture.detectChanges();
    const canvas = fixture.debugElement.query(By.directive(DiagramCanvasComponent)).componentInstance as DiagramCanvasComponent;
    paint(fixture, canvas);
    // Only the plain node with a type nothing can draw keeps its warning.
    expect(validationOutlines(canvas).map((h) => h.entityId)).toEqual(['unknown']);
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
