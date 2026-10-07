/**
 * Swimlanes through the ANGULAR canvas, which drives its own mouse pipeline (it
 * deliberately does not mount the shared DomEventBinder) and so never honoured
 * group rules on a drag: a lane member could leave its pool, a drop on another
 * lane did not move it there, and a confining group did not confine. Same
 * engine rules as every other host (`memberConfinement`, sibling-lane drops).
 *
 * jsdom: getBoundingClientRect() is all-zero, so the canvas uses its declared
 * 800×600 viewport and, at zoom 1, client coords ARE world coords.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DiagramCanvasComponent } from './diagram-canvas.component';
import { DiagramEngine, DiagramModel, GroupModel, NodeModel, SwimlaneService } from '@grafloria/engine';

describe('DiagramCanvasComponent — swimlanes under a hand', () => {
  let component: DiagramCanvasComponent;
  let fixture: ComponentFixture<DiagramCanvasComponent>;
  let engine: DiagramEngine;
  let diagram: DiagramModel;
  let host: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [DiagramCanvasComponent] }).compileComponents();
    fixture = TestBed.createComponent(DiagramCanvasComponent);
    component = fixture.componentInstance;
    engine = new DiagramEngine();
    diagram = engine.createDiagram('swimlanes');
    fixture.componentRef.setInput('engine', engine);
    fixture.componentRef.setInput('viewport', { x: 0, y: 0, width: 800, height: 600 });
    fixture.componentRef.setInput('zoom', 1);
    fixture.detectChanges();
    host = fixture.nativeElement as HTMLElement;
  });
  afterEach(() => { fixture.destroy(); engine.destroy(); });

  const paint = () => { (component as unknown as { renderNow(): void }).renderNow(); fixture.detectChanges(); };
  const flush = () => new Promise<void>((r) => setTimeout(r, 0));
  const mouse = (type: 'mousedown' | 'mousemove' | 'mouseup', x: number, y: number) =>
    host.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true }));
  function drag(id: string, to: { x: number; y: number }) {
    const n = diagram.getNode(id)!;
    diagram.selectNode(n);
    paint();
    const from = { x: n.position.x + n.size.width / 2, y: n.position.y + n.size.height / 2 };
    mouse('mousedown', from.x, from.y);
    for (let i = 1; i <= 6; i++) mouse('mousemove', from.x + ((to.x - from.x) * i) / 6, from.y + ((to.y - from.y) * i) / 6);
    mouse('mouseup', to.x, to.y);
  }
  const addNode = (id: string, x: number, y: number) => {
    const node = new NodeModel({ id, type: 'test', position: { x, y }, size: { width: 100, height: 40, depth: 0 } });
    diagram.addNode(node);
    return node;
  };
  const fullyInside = (id: string, r: { x: number; y: number; width: number; height: number }) => {
    const n = diagram.getNode(id)!;
    return n.position.x >= r.x - 0.5 && n.position.y >= r.y - 0.5 &&
      n.position.x + n.size.width <= r.x + r.width + 0.5 && n.position.y + n.size.height <= r.y + r.height + 0.5;
  };
  function pool() {
    addNode('t', 200, 230);
    const made = new SwimlaneService(diagram).createPool({
      name: 'Delivery', orientation: 'horizontal',
      bounds: { x: 20, y: 20, width: 700, height: 480 },
      lanes: [{ name: 'Backlog' }, { name: 'In progress', weight: 2 }, { name: 'Done' }],
      headerSize: 40,
    });
    made.lanes[1]!.addMember('t', diagram);
    paint();
    return made;
  }

  test('a ticket dragged far below the pool stays inside it', async () => {
    const { lanes } = pool();
    drag('t', { x: 300, y: 590 });
    await flush();
    const last = lanes[2]!.getInnerBounds();
    const t = diagram.getNode('t')!;
    expect(t.position.y + t.size.height).toBeLessThanOrEqual(last.y + last.height + 0.5);
    expect(lanes.some((l) => l.members.has('t'))).toBe(true);
  });

  test('dragged from "In progress" into "Done" it moves there and sits fully inside Done', async () => {
    const { lanes } = pool();
    const done = lanes[2]!.getOuterBounds();
    drag('t', { x: 300, y: done.y + 15 });
    await flush();
    expect(lanes[2]!.members.has('t')).toBe(true);
    expect(lanes[1]!.members.has('t')).toBe(false);
    expect(fullyInside('t', lanes[2]!.getInnerBounds())).toBe(true);
  });

  test('a member of a plain confining group cannot be dragged out', async () => {
    addNode('n', 200, 200);
    const g = new GroupModel({ name: 'box' });
    diagram.addGroup(g);
    g.setFrame({ x: 150, y: 150, width: 300, height: 200 });
    g.constrainChildren = true;
    g.addMember('n', diagram);
    paint();
    drag('n', { x: 760, y: 560 });
    await flush();
    expect(fullyInside('n', g.getInnerBounds())).toBe(true);
    expect(g.members.has('n')).toBe(true);
  });
  test('a drop from one group into another is ONE undo step', async () => {
    addNode('n', 200, 200);
    const billing = new GroupModel({ id: 'billing', name: 'billing' });
    const archive = new GroupModel({ id: 'archive', name: 'archive' });
    diagram.addGroup(billing);
    diagram.addGroup(archive);
    billing.setFrame({ x: 150, y: 150, width: 250, height: 200 });
    archive.setFrame({ x: 480, y: 150, width: 250, height: 200 });
    billing.addMember('n', diagram);
    paint();
    drag('n', { x: 600, y: 250 });
    for (let i = 0; i < 5; i++) await flush();
    expect(archive.members.has('n')).toBe(true);
    expect(billing.members.has('n')).toBe(false);

    await engine.undo();
    expect(billing.members.has('n')).toBe(true);
    expect(archive.members.has('n')).toBe(false);
    expect(diagram.getNode('n')!.position.x).toBeCloseTo(200, 0);
  });
});
