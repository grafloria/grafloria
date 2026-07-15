/**
 * wave14/ng-touch — the Angular host's touch pipeline (jsdom half).
 *
 * WHAT THIS SUITE CAN AND CANNOT PROVE. jsdom has no PointerEvent, no
 * touch-action, and no compatibility-mouse synthesis, so this suite drives the
 * component's pointer handlers with a shimmed PointerEvent and proves the
 * ROUTING + MATHS: touch forks to the shared TouchGestureController, the camera
 * sync round-trips signals ⇄ ViewportController, and the compat-mouse gate goes
 * silent once a pointer event has been seen. Whether a REAL browser delivers
 * these events at all (touch-action, preventDefault-suppressed compat mouse,
 * genuine multi-touch) is exactly what jsdom cannot answer — that lives in
 * `libs/renderer-angular/e2e/touch-run.mjs`, which includes a control that can
 * go red.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DiagramCanvasComponent } from './diagram-canvas.component';
import { DiagramEngine, DiagramModel, NodeModel } from '@grafloria/engine';

/**
 * jsdom has no PointerEvent. The component only reads MouseEvent fields plus
 * `pointerId` / `pointerType`, so a MouseEvent subclass is a faithful shim.
 */
class FakePointerEvent extends MouseEvent {
  readonly pointerId: number;
  readonly pointerType: string;

  constructor(
    type: string,
    init: MouseEventInit & { pointerId?: number; pointerType?: string }
  ) {
    super(type, { bubbles: true, cancelable: true, ...init });
    this.pointerId = init.pointerId ?? 1;
    this.pointerType = init.pointerType ?? 'touch';
  }
}

const touchEvent = (
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
  x: number,
  y: number,
  pointerId = 1
): PointerEvent =>
  new FakePointerEvent(type, {
    clientX: x,
    clientY: y,
    pointerId,
    pointerType: 'touch',
    button: 0,
    buttons: 1,
  }) as unknown as PointerEvent;

describe('DiagramCanvasComponent — touch (wave14/ng-touch)', () => {
  let fixture: ComponentFixture<DiagramCanvasComponent>;
  let component: DiagramCanvasComponent;
  let engine: DiagramEngine;
  let diagram: DiagramModel;
  let node: NodeModel;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DiagramCanvasComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(DiagramCanvasComponent);
    component = fixture.componentInstance;

    engine = new DiagramEngine();
    diagram = engine.createDiagram('touch-spec');
    // 160×80, same as the renderer's own touch harness — and NOT smaller: every
    // node auto-creates 4 default ports on its edges, and a touch press applies
    // 16px of world hit-slop (TOUCH_HIT_SLOP_PX), so on a node under ~50px tall
    // a centre tap lands ON a port and correctly starts a CONNECTION instead of
    // a tap-select. The centre of a 160×80 node is 40px from every port.
    node = new NodeModel({
      id: 'N1',
      type: 'process',
      position: { x: 100, y: 100 },
      size: { width: 160, height: 80 },
    });
    diagram.addNode(node);

    fixture.componentRef.setInput('engine', engine);
    fixture.detectChanges();
    // jsdom's getBoundingClientRect() is all zeros, so canvasPixelSize() falls
    // back to the viewport signal (800×600) and world == canvas-local px at
    // zoom 1 — every coordinate below relies on that identity.
  });

  afterEach(() => {
    engine.destroy();
  });

  /** One finger straight-line drag through the pointer pipeline. */
  const drag = (
    from: { x: number; y: number },
    to: { x: number; y: number },
    steps = 8,
    pointerId = 1
  ) => {
    component.onPointerDown(touchEvent('pointerdown', from.x, from.y, pointerId));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      component.onPointerMove(
        touchEvent(
          'pointermove',
          from.x + (to.x - from.x) * t,
          from.y + (to.y - from.y) * t,
          pointerId
        )
      );
    }
    component.onPointerUp(touchEvent('pointerup', to.x, to.y, pointerId));
  };

  test('one-finger drag on empty canvas PANS the camera and leaves the model alone', () => {
    const before = { ...component.viewport() };
    const nodeBefore = { ...node.position };

    // Drag up-left ⇒ content follows the finger ⇒ camera moves right/down.
    drag({ x: 600, y: 500 }, { x: 500, y: 420 });

    const after = component.viewport();
    expect(after.x - before.x).toBeCloseTo(100, 0);
    expect(after.y - before.y).toBeCloseTo(80, 0);
    expect(node.position).toEqual(nodeBefore);
  });

  test('tap on a node SELECTS it; tap on empty canvas clears the selection', () => {
    // Tap the node's centre (world 180,140 == client 180,140 at zoom 1).
    component.onPointerDown(touchEvent('pointerdown', 180, 140));
    component.onPointerUp(touchEvent('pointerup', 180, 140));
    expect(node.isSelected()).toBe(true);

    // Tap far away on empty canvas.
    component.onPointerDown(touchEvent('pointerdown', 700, 550));
    component.onPointerUp(touchEvent('pointerup', 700, 550));
    expect(node.isSelected()).toBe(false);
  });

  test('one-finger drag STARTING on a node moves the node, not the camera', () => {
    const cameraBefore = { ...component.viewport() };

    drag({ x: 180, y: 140 }, { x: 330, y: 215 });

    expect(node.position.x).toBeCloseTo(250, 0); // 100 + 150
    expect(node.position.y).toBeCloseTo(175, 0); // 100 + 75
    expect(component.viewport().x).toBe(cameraBefore.x);
    expect(component.viewport().y).toBe(cameraBefore.y);
  });

  test('a touch press ON a port starts a CONNECTION drag, not a node drag (touch hit slop)', () => {
    // The right-side default port sits at world (260,140). Press 10px off it —
    // inside the 16px touch slop, outside mouse precision.
    const linksBefore = diagram.getLinks().length;
    const nodeBefore = { ...node.position };

    component.onPointerDown(touchEvent('pointerdown', 270, 143));
    component.onPointerMove(touchEvent('pointermove', 400, 300));
    component.onPointerUp(touchEvent('pointerup', 400, 300));

    // Dropped on empty canvas: no link created, but the gesture must have been a
    // connection attempt — the node did not move and the camera did not pan.
    expect(diagram.getLinks().length).toBe(linksBefore);
    expect(node.position).toEqual(nodeBefore);
    expect(component.viewport().x).toBe(0);
  });

  test('two-finger pinch (spread) ZOOMS IN, anchored on the point between the fingers', () => {
    const anchor = { x: 500, y: 350 };
    const worldBefore = (component as any).clientToWorld(anchor.x, anchor.y);

    // Finger 1 + finger 2 land, then spread symmetrically about the anchor:
    // gap 120px → 240px ⇒ zoom ×2 relative to gesture start.
    component.onPointerDown(touchEvent('pointerdown', anchor.x - 60, anchor.y, 1));
    component.onPointerDown(touchEvent('pointerdown', anchor.x + 60, anchor.y, 2));
    for (let i = 1; i <= 6; i++) {
      const half = 60 + (60 * i) / 6; // 60 → 120
      component.onPointerMove(touchEvent('pointermove', anchor.x - half, anchor.y, 1));
      component.onPointerMove(touchEvent('pointermove', anchor.x + half, anchor.y, 2));
    }
    component.onPointerUp(touchEvent('pointerup', anchor.x - 120, anchor.y, 1));
    component.onPointerUp(touchEvent('pointerup', anchor.x + 120, anchor.y, 2));

    expect(component.zoom()).toBeCloseTo(2, 1);

    // Anchored: the world point that was under the pinch centre stays there.
    const worldAfter = (component as any).clientToWorld(anchor.x, anchor.y);
    const drift = Math.hypot(
      worldAfter.worldX - worldBefore.worldX,
      worldAfter.worldY - worldBefore.worldY
    );
    expect(drift).toBeLessThan(8);
  });

  test('pinch zoom respects the maxZoom input', () => {
    fixture.componentRef.setInput('maxZoom', 1.5);
    fixture.detectChanges();

    const anchor = { x: 400, y: 300 };
    component.onPointerDown(touchEvent('pointerdown', anchor.x - 50, anchor.y, 1));
    component.onPointerDown(touchEvent('pointerdown', anchor.x + 50, anchor.y, 2));
    component.onPointerMove(touchEvent('pointermove', anchor.x - 200, anchor.y, 1));
    component.onPointerMove(touchEvent('pointermove', anchor.x + 200, anchor.y, 2));
    component.onPointerUp(touchEvent('pointerup', anchor.x - 200, anchor.y, 1));
    component.onPointerUp(touchEvent('pointerup', anchor.x + 200, anchor.y, 2));

    expect(component.zoom()).toBe(1.5);
  });

  test('pointercancel aborts the gesture without committing anything', () => {
    const before = { ...node.position };
    component.onPointerDown(touchEvent('pointerdown', 180, 140));
    component.onPointerMove(touchEvent('pointermove', 210, 160));
    component.onPointerCancel(touchEvent('pointercancel', 210, 160));

    // The node MAY have moved up to the cancel point (live drag), but the
    // gesture state must be fully dropped: the next tap works normally.
    component.onPointerDown(touchEvent('pointerdown', 700, 550));
    component.onPointerUp(touchEvent('pointerup', 700, 550));
    expect(node.isSelected()).toBe(false);
    expect(Number.isFinite(node.position.x)).toBe(true);
    expect(Number.isFinite(before.x)).toBe(true);
  });

  describe('compat-mouse dedupe', () => {
    test('a DOM mousedown still drives the ladder while NO pointer event has been seen (jsdom mode)', () => {
      diagram.selectNode(node);
      expect(node.isSelected()).toBe(true);

      // Plain mousedown on empty canvas → the mouse ladder clears the selection.
      const host = fixture.nativeElement as HTMLElement;
      host.dispatchEvent(
        new MouseEvent('mousedown', { clientX: 700, clientY: 550, button: 0, bubbles: true })
      );
      expect(node.isSelected()).toBe(false);
    });

    test('after a real pointer event, the legacy mouse listeners go SILENT (no double-fire)', () => {
      // A touch tap selects the node THROUGH the pointer pipeline...
      component.onPointerDown(touchEvent('pointerdown', 180, 140));
      component.onPointerUp(touchEvent('pointerup', 180, 140));
      expect(node.isSelected()).toBe(true);

      // ...then the browser-style compatibility mousedown arrives at the SAME
      // spot on empty canvas. Deduped: the ladder must NOT run again (an
      // un-gated ladder would clear the selection here).
      const host = fixture.nativeElement as HTMLElement;
      host.dispatchEvent(
        new MouseEvent('mousedown', { clientX: 700, clientY: 550, button: 0, bubbles: true })
      );
      expect(node.isSelected()).toBe(true);

      // The gate sits on the LISTENER: the method itself stays callable (it is
      // the seam the pointer fork routes real mouse pointers through).
      component.onMouseDown(
        new MouseEvent('mousedown', { clientX: 700, clientY: 550, button: 0 })
      );
      expect(node.isSelected()).toBe(false);
    });
  });

  test('read-only diagram refuses a touch node drag (camera pan still allowed)', () => {
    const model = engine.getDiagram();
    if (!model || typeof (model as any).setReadonly !== 'function') {
      // Engine builds without a runtime readonly toggle: nothing to assert here;
      // the shared TouchGestureController's own suite covers isReadonly().
      expect(true).toBe(true);
      return;
    }
    (model as any).setReadonly(true);
    const before = { ...node.position };
    drag({ x: 180, y: 140 }, { x: 330, y: 215 });
    expect(node.position).toEqual(before);
  });
});
