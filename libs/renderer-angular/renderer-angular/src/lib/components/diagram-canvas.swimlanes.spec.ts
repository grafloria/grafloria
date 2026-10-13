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
import { DiagramEngine, DiagramModel, GroupModel, NodeModel, SwimlaneService, GroupCollapseService } from '@grafloria/engine';

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
  test('a FULL lane refuses the ticket: it goes back where it came from, still in its own lane, nothing recorded', async () => {
    const { lanes } = pool();
    addNode('d', 400, 440);
    lanes[2]!.addMember('d', diagram);
    lanes[2]!.capacity = 1;
    paint();
    const t0 = { ...diagram.getNode('t')!.position };
    const done = lanes[2]!.getOuterBounds();
    drag('t', { x: 300, y: done.y + done.height / 2 });
    for (let i = 0; i < 5; i++) await flush();
    expect(lanes[2]!.members.has('t')).toBe(false);
    expect(lanes[1]!.members.has('t')).toBe(true);
    expect(diagram.getNode('t')!.position).toMatchObject({ x: t0.x, y: t0.y });
    expect(fullyInside('t', lanes[1]!.getInnerBounds())).toBe(true);
    expect(engine.commandManager.canUndo()).toBe(false);
  });

  test('two selected tickets dragged into "Done" BOTH join Done, in one undo step', async () => {
    const { lanes } = pool();
    addNode('u', 360, 230);
    lanes[1]!.addMember('u', diagram);
    diagram.getNode('t')!.setSelected(true);
    diagram.getNode('u')!.setSelected(true);
    paint();
    const t = diagram.getNode('t')!;
    const from = { x: t.position.x + t.size.width / 2, y: t.position.y + t.size.height / 2 };
    const done = lanes[2]!.getOuterBounds();
    const to = { x: from.x + 30, y: done.y + done.height / 2 };
    mouse('mousedown', from.x, from.y);
    for (let i = 1; i <= 6; i++) mouse('mousemove', from.x + ((to.x - from.x) * i) / 6, from.y + ((to.y - from.y) * i) / 6);
    mouse('mouseup', to.x, to.y);
    for (let i = 0; i < 5; i++) await flush();
    for (const id of ['t', 'u']) {
      expect(lanes[2]!.members.has(id)).toBe(true);
      expect(lanes[1]!.members.has(id)).toBe(false);
      expect(fullyInside(id, lanes[2]!.getInnerBounds())).toBe(true);
    }
    await engine.undo();
    for (const id of ['t', 'u']) expect(lanes[1]!.members.has(id)).toBe(true);
    expect(engine.commandManager.canUndo()).toBe(false);
  });

  test("pressing a FOLDED lane's band drags the whole pool — the band rides along, lanes stay tiled", async () => {
    const { pool: p, lanes } = pool();
    new GroupCollapseService(diagram).collapse(lanes[0]!);
    paint();
    const proxy = diagram.getNode(lanes[0]!.collapsedState!.proxyNodeId)!;
    const before = p.getOuterBounds(), band0 = { ...proxy.position };
    const press = { x: proxy.position.x + 300, y: proxy.position.y + proxy.size.height / 2 };
    mouse('mousedown', press.x, press.y);
    for (let i = 1; i <= 6; i++) mouse('mousemove', press.x + (60 * i) / 6, press.y + (40 * i) / 6);
    mouse('mouseup', press.x + 60, press.y + 40);
    for (let i = 0; i < 5; i++) await flush();
    const after = p.getOuterBounds();
    expect(after.x).toBeCloseTo(before.x + 60);
    expect(after.y).toBeCloseTo(before.y + 40);
    expect(proxy.position.x).toBeCloseTo(band0.x + 60);
    expect(proxy.position.y).toBeCloseTo(band0.y + 40);
  });

  // Lanes by hand. pool(): Backlog 20–140, In progress 140–380, Done 380–500 (x 60–720).
  const press = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    mouse('mousedown', from.x, from.y);
    for (let i = 1; i <= 6; i++) mouse('mousemove', from.x + ((to.x - from.x) * i) / 6, from.y + ((to.y - from.y) * i) / 6);
    mouse('mouseup', to.x, to.y);
  };

  test('dragging the line under "Backlog" makes Backlog taller; the pool grows; one undo takes it back', async () => {
    const { pool: p, lanes } = pool();
    press({ x: 400, y: 140 }, { x: 400, y: 200 });
    for (let i = 0; i < 5; i++) await flush();
    expect(lanes.map((l) => l.getOuterBounds().height)).toEqual([180, 240, 120]);
    expect(p.getOuterBounds().height).toBe(540);
    await engine.undo();
    expect(lanes.map((l) => l.getOuterBounds().height)).toEqual([120, 240, 120]);
    expect(engine.commandManager.canUndo()).toBe(false);
  });

  test("dragging the pool's right edge makes every lane longer", async () => {
    const { lanes } = pool();
    press({ x: 720, y: 300 }, { x: 780, y: 300 });
    for (let i = 0; i < 5; i++) await flush();
    expect(lanes.map((l) => l.getOuterBounds().width)).toEqual([720, 720, 720]);
  });

  test('dragging "Done" by its title up past "Backlog" moves the lane there, its ticket order intact', async () => {
    const { pool: p, lanes } = pool();
    press({ x: 400, y: 390 }, { x: 400, y: 30 });
    for (let i = 0; i < 5; i++) await flush();
    expect(p.laneConfig!.laneOrder).toEqual([lanes[2]!.id, lanes[0]!.id, lanes[1]!.id]);
    expect(lanes[1]!.members.has('t')).toBe(true);
    expect(fullyInside('t', lanes[1]!.getInnerBounds())).toBe(true);
  });

  test('the cursor shows a lane handle before the press', () => {
    pool();
    mouse('mousemove', 400, 141);
    const cursorOf = () => (component as unknown as { containerRef: { nativeElement: HTMLElement } }).containerRef.nativeElement.style.cursor;
    expect(cursorOf()).toBe('row-resize');
    mouse('mousemove', 400, 155);
    expect(cursorOf()).toBe('grab');
  });

  test('Escape in the middle of a border drag puts the pool back and records nothing', async () => {
    const { pool: p } = pool();
    mouse('mousedown', 400, 140);
    for (let i = 1; i <= 4; i++) mouse('mousemove', 400, 140 + i * 15);
    expect(p.getOuterBounds().height).toBeGreaterThan(480);
    host.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    mouse('mouseup', 400, 200);
    for (let i = 0; i < 5; i++) await flush();
    expect(p.getOuterBounds().height).toBe(480);
    expect(engine.commandManager.canUndo()).toBe(false);
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
