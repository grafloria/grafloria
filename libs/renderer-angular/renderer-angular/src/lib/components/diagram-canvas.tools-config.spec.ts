/**
 * N6 (docs review v4, extend-tools-and-edit-actions Angular tab): the canvas
 * ignored three engine settings the JS canvas honours (dom-event-binder):
 *  - a node with a `dragHandler` child is dragged BY THE HANDLE only — a body
 *    press selects but does not move it;
 *  - `enableEasyConnect` + `easyConnectModifier`: a modified body press starts a
 *    wire from the nearest port instead of a move;
 *  - `enableProximityConnect`: the proposal is drawn as a live dashed wire
 *    (`engine.setProximityPreview`), within `proximityConnectRadius`.
 *
 * jsdom: the canvas falls back to its 800×600 viewport, so at zoom 1 client
 * coords ARE world coords.
 */
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { DiagramEngine, DiagramModel } from '@grafloria/engine';
import { buildNode } from '@grafloria/renderer';
import { DiagramCanvasComponent } from './diagram-canvas.component';

describe('DiagramCanvasComponent — drag handles, easy connect, proximity preview (N6)', () => {
  let engine: DiagramEngine;
  let diagram: DiagramModel;
  let fixture: ComponentFixture<DiagramCanvasComponent>;
  let el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [DiagramCanvasComponent] }).compileComponents();
    engine = new DiagramEngine();
    diagram = engine.createDiagram('n6');
    diagram.addNode(buildNode({ id: 'window', position: { x: 80, y: 100 }, size: { width: 240, height: 120 }, label: 'Review window' } as never, 0));
    diagram.addNode(buildNode({ id: 'grip', position: { x: 80, y: 100 }, size: { width: 240, height: 28 }, label: 'Title bar' } as never, 1));
    diagram.addNode(buildNode({ id: 'publish', position: { x: 520, y: 100 }, size: { width: 150, height: 80 }, label: 'Publish' } as never, 2));
    const grip = diagram.getNode('grip')!;
    grip.setParent('window');
    grip.setPosition(0, 0);
    grip.setBehavior({ dragHandler: { isDragHandler: true } } as never);
    fixture = TestBed.createComponent(DiagramCanvasComponent);
    fixture.componentRef.setInput('engine', engine);
    fixture.detectChanges();
    el = fixture.nativeElement;
  });

  afterEach(() => {
    fixture.destroy();
    engine.destroy();
  });

  const settle = () => new Promise((r) => setTimeout(r, 0));
  const fire = (type: string, x: number, y: number, init: MouseEventInit = {}) =>
    el.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, button: 0, buttons: type === 'mouseup' ? 0 : 1, bubbles: true, ...init }));
  /** Press, move in 40 px steps (hand speed), optionally release. */
  async function drag(from: { x: number; y: number }, to: { x: number; y: number }, init: MouseEventInit = {}, release = true) {
    fire('mousemove', from.x, from.y, { buttons: 0, ...init });
    fire('mousedown', from.x, from.y, init);
    const steps = Math.max(3, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 40));
    for (let i = 1; i <= steps; i++) {
      fire('mousemove', from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps, init);
    }
    if (release) fire('mouseup', to.x, to.y, init);
    await settle();
  }
  const pos = (id: string) => ({ x: diagram.getNode(id)!.position.x, y: diagram.getNode(id)!.position.y });

  test('a node with a drag handle does not move from a body press — only from its handle', async () => {
    const start = pos('window');
    await drag({ x: 150, y: 190 }, { x: 150, y: 290 }); // body, below the title bar
    expect(pos('window').y).toBe(start.y);
    expect(diagram.getNode('window')!.isSelected()).toBe(true);

    await drag({ x: 150, y: 114 }, { x: 150, y: 214 }); // the title bar (handle)
    expect(pos('window').y).toBeGreaterThan(start.y + 80); // (snapping may nudge it)
  });

  test('easyConnect with a Shift modifier: Shift + body drag wires instead of moving', async () => {
    engine.setInteractionConfig({ enableEasyConnect: true, easyConnectModifier: 'shift' } as never);
    const before = pos('publish');
    await drag({ x: 595, y: 160 }, { x: 200, y: 190 }, { shiftKey: true });
    expect(pos('publish')).toEqual(before);
    const links = diagram.getLinks();
    expect(links).toHaveLength(1);
    expect([links[0]!.sourceNodeId, links[0]!.targetNodeId]).toEqual(['publish', 'window']);

    // Without Shift the body drag still moves the node.
    await drag({ x: 595, y: 160 }, { x: 595, y: 260 });
    expect(pos('publish').y).toBe(before.y + 100);
  });

  test('proximity connect draws its proposal while dragging, and clears it on drop', async () => {
    engine.setInteractionConfig({ enableProximityConnect: true } as never);
    await drag({ x: 560, y: 160 }, { x: 420, y: 160 }, {}, false);
    expect(engine.getProximityPreview()).toMatchObject({ sourceNodeId: 'window', targetNodeId: 'publish' });
    fire('mouseup', 420, 160);
    await settle();
    expect(engine.getProximityPreview()).toBeNull();
    expect(diagram.getLinks()).toHaveLength(1);
  });

  test('proximityConnectRadius is honoured', async () => {
    engine.setInteractionConfig({ enableProximityConnect: true, proximityConnectRadius: 20 } as never);
    await drag({ x: 560, y: 160 }, { x: 420, y: 160 }, {}, false); // ~60 px gap: outside 20
    expect(engine.getProximityPreview()).toBeNull();
    fire('mouseup', 420, 160);
    await settle();
    expect(diagram.getLinks()).toHaveLength(0);
  });
});
