// fitToContent takes in the group and lane FRAMES the canvas draws.
//
// The docs review found the "Delivery" lane pool clipped on the right AND the top
// after fitToContent in Angular: the fit measured node boxes only, and a pool's
// frame (title strip, padding, empty lane space) reaches past its tickets.
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DiagramCanvasComponent } from './diagram-canvas.component';
import { DiagramEngine, DiagramModel, GroupModel, NodeModel, SwimlaneService } from '@grafloria/engine';

describe('DiagramCanvasComponent — fitToContent includes group frames', () => {
  let component: DiagramCanvasComponent;
  let fixture: ComponentFixture<DiagramCanvasComponent>;
  let engine: DiagramEngine;
  let diagram: DiagramModel;

  const paint = () => (component as any).renderNow();
  const renderedViewBox = () => {
    const svg = fixture.nativeElement.querySelector('svg.grafloria-diagram');
    const [x, y, width, height] = (svg.getAttribute('viewBox') as string).split(/\s+/).map(Number);
    return { x, y, width, height };
  };
  const contains = (
    outer: { x: number; y: number; width: number; height: number },
    inner: { x: number; y: number; width: number; height: number }
  ) =>
    outer.x <= inner.x + 0.01 &&
    outer.y <= inner.y + 0.01 &&
    outer.x + outer.width >= inner.x + inner.width - 0.01 &&
    outer.y + outer.height >= inner.y + inner.height - 0.01;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [DiagramCanvasComponent] }).compileComponents();
    fixture = TestBed.createComponent(DiagramCanvasComponent);
    component = fixture.componentInstance;
    engine = new DiagramEngine();
    diagram = engine.createDiagram('fit-frames');
    fixture.componentRef.setInput('engine', engine);
    fixture.componentRef.setInput('viewport', { x: 0, y: 0, width: 800, height: 600 });
    fixture.componentRef.setInput('zoom', 1);
    fixture.detectChanges();
  });

  afterEach(() => {
    engine.destroy();
  });

  test('a lane pool is fitted whole — title strip, top and right edge included', () => {
    for (const [id, x, y] of [['login', 200, 90], ['billing', 480, 260]] as const) {
      diagram.addNode(new NodeModel({ id, type: 'basic', position: { x, y }, size: { width: 172, height: 46 } }));
    }
    const { pool } = new SwimlaneService(diagram).createPool({
      name: 'Delivery',
      orientation: 'horizontal',
      bounds: { x: 60, y: 40, width: 980, height: 480 },
      lanes: [{ name: 'Backlog', weight: 1 }, { name: 'In progress', weight: 2 }, { name: 'Done', weight: 1 }],
      headerSize: 40,
    });

    component.fitToContent(40);
    paint();

    expect(contains(renderedViewBox(), pool.getOuterBounds())).toBe(true);
  });

  test('a plain group frame with padding beyond its member is fitted whole', () => {
    diagram.addNode(new NodeModel({ id: 'a', type: 'basic', position: { x: 100, y: 100 }, size: { width: 120, height: 60 } }));
    const g = new GroupModel({ name: 'Team' });
    g.position = { x: -300, y: -200 };
    g.size = { width: 1400, height: 1000, depth: 0 };
    g.addMember('a', diagram);
    diagram.addGroup(g);

    component.fitToContent(40);
    paint();

    expect(contains(renderedViewBox(), g.getOuterBounds())).toBe(true);
  });
});
