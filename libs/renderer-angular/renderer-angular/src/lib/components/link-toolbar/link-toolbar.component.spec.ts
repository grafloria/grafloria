// Wave 3 (Edges & links), Card B — the path-anchored edge toolbar.
//
// Covers the four behaviours the card is graded on:
//   1. it anchors to a FRACTION along the rendered path (and lifts off it)
//   2. it FOLLOWS a re-route (the anchor is recomputed, not cached)
//   3. delete removes the link and is UNDOABLE
//   4. insert-node-on-edge splits one link into two, is UNDOABLE, and respects
//      manual waypoints

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DiagramEngine, DiagramModel, LinkModel, NodeModel, PortModel } from '@grafloria/engine';

import { LinkToolbarComponent } from './link-toolbar.component';
import {
  createDefaultLinkActions,
  createDeleteLinkAction,
  createInsertNodeAction,
  insertNodeOnEdge,
  portSidesForTangent,
} from './link-toolbar-actions';

/** Parse `translate(50px, 22px)` → { x: 50, y: 22 }. */
function translationOf(transform: string): { x: number; y: number } {
  const m = transform.match(/translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/);
  expect(m).toBeTruthy();
  return { x: parseFloat(m![1]), y: parseFloat(m![2]) };
}

describe('LinkToolbarComponent', () => {
  let fixture: ComponentFixture<LinkToolbarComponent>;
  let component: LinkToolbarComponent;
  let engine: DiagramEngine;
  let diagram: DiagramModel;
  let link: LinkModel;

  function addNode(x: number, y: number, portId: string, side: 'left' | 'right'): NodeModel {
    const node = new NodeModel({ type: 'basic', position: { x, y }, size: { width: 100, height: 50 } });
    node.addPort(new PortModel({ id: portId, type: side === 'right' ? 'output' : 'input', side }));
    diagram.addNode(node);
    return node;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [LinkToolbarComponent] }).compileComponents();

    engine = new DiagramEngine();
    diagram = engine.createDiagram('Test')!;
    addNode(0, 0, 'p1', 'right');
    addNode(400, 0, 'p2', 'left');

    link = new LinkModel('p1', 'p2', 'orthogonal');
    diagram.addLink(link);
    // The route the renderer would have synced onto the model this frame.
    link.points = [{ x: 0, y: 0 }, { x: 100, y: 0 }];

    fixture = TestBed.createComponent(LinkToolbarComponent);
    component = fixture.componentInstance;
    component.link = link;
    component.engine = engine;
    component.viewport = { x: 0, y: 0, width: 800, height: 600 };
    component.zoom = 1;
    component.actions = createDefaultLinkActions(engine);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    engine.destroy();
  });

  describe('anchoring', () => {
    it('sits at the requested FRACTION along the path, lifted off it along the normal', () => {
      component.anchor = 0.5;
      component.offset = 22;
      component.updatePosition();

      // Midpoint of (0,0)→(100,0) is (50,0); the normal of a rightward path is
      // (0,1), so the toolbar is pushed 22px along it. (jsdom measures the
      // toolbar as 0×0, so no centring correction is applied.)
      expect(translationOf(component.transform)).toEqual({ x: 50, y: 22 });
    });

    it('honours a non-midpoint anchor', () => {
      component.anchor = 0.25;
      component.offset = 0;
      component.updatePosition();

      expect(translationOf(component.transform)).toEqual({ x: 25, y: 0 });
    });

    it('clamps a nonsense anchor into [0, 1]', () => {
      component.anchor = 4;
      component.offset = 0;
      component.updatePosition();

      expect(translationOf(component.transform)).toEqual({ x: 100, y: 0 });
    });

    it('FOLLOWS a re-route — the anchor is recomputed from the current route', () => {
      component.anchor = 0.5;
      component.offset = 0;
      component.updatePosition();
      expect(translationOf(component.transform)).toEqual({ x: 50, y: 0 });

      // A node moved: the renderer re-routes and syncs a new polyline. The
      // toolbar must land on the NEW line, not the one it first measured.
      link.points = [{ x: 0, y: 200 }, { x: 0, y: 400 }];
      component.updatePosition();

      expect(translationOf(component.transform)).toEqual({ x: 0, y: 300 });
    });

    it('never reads the model\'s stale segments', () => {
      link.segments = [{ type: 'line', from: { x: 0, y: 900 }, to: { x: 100, y: 900 } } as any];
      component.anchor = 0.5;
      component.offset = 0;
      component.updatePosition();

      // Stale segments would put it at y=900.
      expect(translationOf(component.transform)).toEqual({ x: 50, y: 0 });
    });

    it('applies zoom/pan (the inverse of the canvas\' clientToWorld)', () => {
      component.viewport = { x: 0, y: 0, width: 800, height: 600 };
      component.zoom = 2;
      component.anchor = 0.5;
      component.offset = 0;
      component.updatePosition();

      // viewBox at zoom 2 = 400×300 centred on (400,300) → origin (200,150).
      // screen = (world - origin) * zoom → (50-200)*2 = -300, (0-150)*2 = -300.
      expect(translationOf(component.transform)).toEqual({ x: -300, y: -300 });
    });

    it('hides itself instead of parking at (0,0) when the link has no geometry', () => {
      link.points = [];
      component.updatePosition();
      expect(component.isVisible).toBe(false);
    });
  });

  describe('actions', () => {
    it('renders a button per action and hands each one the link + WHERE on it', () => {
      component.anchor = 0.25;
      component.updatePosition();
      fixture.detectChanges();

      const buttons = fixture.nativeElement.querySelectorAll('.toolbar-button');
      expect(buttons.length).toBe(2);

      const ctx = component.actionContext!;
      expect(ctx.link).toBe(link);
      expect(ctx.t).toBe(0.25);
      expect(ctx.point).toEqual({ x: 25, y: 0 });
      expect(ctx.tangent).toEqual({ x: 1, y: 0 });
    });

    it('emits actionClicked and does not let the press fall through to the canvas', () => {
      const spy = jest.fn();
      component.actionClicked.subscribe(spy);
      component.updatePosition();
      fixture.detectChanges();

      const event = new MouseEvent('click', { bubbles: true, cancelable: true });
      const stopPropagation = jest.spyOn(event, 'stopPropagation');
      fixture.nativeElement.querySelector('[data-action-id="insert-node"]').dispatchEvent(event);

      expect(stopPropagation).toHaveBeenCalled();
      expect(spy).toHaveBeenCalled();
    });

    it('tells the host when the pointer is over it (so it survives leaving the stroke)', () => {
      const spy = jest.fn();
      component.pointerOverChange.subscribe(spy);

      component.onPointerEnter();
      component.onPointerLeave();

      expect(spy).toHaveBeenNthCalledWith(1, true);
      expect(spy).toHaveBeenNthCalledWith(2, false);
    });
  });
});

describe('link toolbar actions (all undoable through the command layer)', () => {
  let engine: DiagramEngine;
  let diagram: DiagramModel;
  let link: LinkModel;

  function ctx(t = 0.5, point = { x: 50, y: 0 }, tangent = { x: 1, y: 0 }) {
    return { link, engine, t, point, tangent };
  }

  beforeEach(() => {
    engine = new DiagramEngine();
    diagram = engine.createDiagram('Test')!;

    const source = new NodeModel({ type: 'basic', position: { x: 0, y: 0 }, size: { width: 100, height: 50 } });
    source.addPort(new PortModel({ id: 'p1', type: 'output', side: 'right' }));
    diagram.addNode(source);

    const target = new NodeModel({ type: 'basic', position: { x: 400, y: 0 }, size: { width: 100, height: 50 } });
    target.addPort(new PortModel({ id: 'p2', type: 'input', side: 'left' }));
    diagram.addNode(target);

    link = new LinkModel('p1', 'p2', 'orthogonal');
    link.style.stroke = '#ff0000';
    link.style.cornerRadius = 12;
    diagram.addLink(link);
    link.points = [{ x: 100, y: 25 }, { x: 400, y: 25 }];
  });

  afterEach(() => engine.destroy());

  describe('delete', () => {
    it('removes the link — and Ctrl+Z brings it back', async () => {
      createDeleteLinkAction(engine).onClick(ctx());
      await Promise.resolve();
      await new Promise(r => setTimeout(r, 0));

      expect(diagram.getLink(link.id)).toBeUndefined();

      await engine.commandManager.undo();
      expect(diagram.getLink(link.id)).toBeDefined();
    });
  });

  describe('insert node on edge', () => {
    it('splits ONE link into TWO through a new node placed at the split point', async () => {
      const result = (await insertNodeOnEdge(engine, link, 0.5, { x: 250, y: 25 }, { x: 1, y: 0 }))!;

      expect(result).not.toBeNull();
      expect(diagram.getLink(link.id)).toBeUndefined();   // the original is gone
      expect(diagram.getLinks()).toHaveLength(2);

      const node = diagram.getNode(result.nodeId)!;
      expect(node).toBeDefined();
      // Centred ON the split point (100×50 default size).
      expect(node.position).toEqual({ x: 200, y: 0 });

      const upstream = diagram.getLink(result.sourceLinkId)!;
      const downstream = diagram.getLink(result.targetLinkId)!;

      // The chain still runs source → node → target.
      expect(upstream.sourcePortId).toBe('p1');
      expect(upstream.targetPortId).toBe(node.getPortBySide('left')!.id);
      expect(downstream.sourcePortId).toBe(node.getPortBySide('right')!.id);
      expect(downstream.targetPortId).toBe('p2');
    });

    it('is ONE undo step — Ctrl+Z restores the original edge exactly', async () => {
      const result = (await insertNodeOnEdge(engine, link, 0.5, { x: 250, y: 25 }, { x: 1, y: 0 }))!;

      await engine.commandManager.undo();

      expect(diagram.getLinks()).toHaveLength(1);
      const restored = diagram.getLink(link.id)!;
      expect(restored).toBeDefined();
      expect(restored.sourcePortId).toBe('p1');
      expect(restored.targetPortId).toBe('p2');
      expect(diagram.getNode(result.nodeId)).toBeUndefined();

      // …and redo re-splits it.
      await engine.commandManager.redo();
      expect(diagram.getLinks()).toHaveLength(2);
      expect(diagram.getNode(result.nodeId)).toBeDefined();
    });

    it('inherits the split link\'s look, and moves the arrowhead to the second half only', async () => {
      link.style.arrowHead = { type: 'arrow', size: 10, filled: true };
      const result = (await insertNodeOnEdge(engine, link, 0.5, { x: 250, y: 25 }, { x: 1, y: 0 }))!;

      const upstream = diagram.getLink(result.sourceLinkId)!;
      const downstream = diagram.getLink(result.targetLinkId)!;

      expect(upstream.style.stroke).toBe('#ff0000');
      expect(upstream.style.cornerRadius).toBe(12);
      expect(upstream.pathType).toBe('orthogonal');

      // An arrowhead on the upstream half would now point at the middle of the
      // new node instead of at the target.
      expect(upstream.style.arrowHead).toBeUndefined();
      expect(downstream.style.arrowHead).toEqual({ type: 'arrow', size: 10, filled: true });
    });

    it('RESPECTS MANUAL WAYPOINTS — each half keeps the waypoints on its side', async () => {
      link.points = [
        { x: 100, y: 25 },
        { x: 200, y: 25 },   // upstream waypoint
        { x: 200, y: 225 },  // (the cut lands here, at t = 0.5 of a 400-long path)
        { x: 300, y: 225 },
        { x: 300, y: 25 },   // downstream waypoints
        { x: 400, y: 25 },
      ];
      link.setMetadata('hasManualWaypoints', true);

      const result = (await insertNodeOnEdge(engine, link, 0.5, { x: 200, y: 225 }, { x: 0, y: 1 }))!;

      const upstream = diagram.getLink(result.sourceLinkId)!;
      const downstream = diagram.getLink(result.targetLinkId)!;

      expect(upstream.getMetadata('hasManualWaypoints')).toBe(true);
      expect(downstream.getMetadata('hasManualWaypoints')).toBe(true);

      // Nothing was lost: the two halves' vertices reconstruct the original run.
      expect(upstream.points).toContainEqual({ x: 200, y: 25 });
      expect(downstream.points).toContainEqual({ x: 300, y: 225 });
      expect(downstream.points).toContainEqual({ x: 300, y: 25 });

      // Both halves meet at the split point.
      expect(upstream.points[upstream.points.length - 1]).toEqual(downstream.points[0]);
    });

    it('leaves an AUTO-ROUTED link auto-routed (its halves must re-route freely)', async () => {
      const result = (await insertNodeOnEdge(engine, link, 0.5, { x: 250, y: 25 }, { x: 1, y: 0 }))!;

      const upstream = diagram.getLink(result.sourceLinkId)!;
      expect(upstream.getMetadata('hasManualWaypoints')).toBeUndefined();
    });

    it('connects on the sides the edge actually travels through', () => {
      expect(portSidesForTangent({ x: 1, y: 0 })).toEqual({ entry: 'left', exit: 'right' });
      expect(portSidesForTangent({ x: -1, y: 0 })).toEqual({ entry: 'right', exit: 'left' });
      expect(portSidesForTangent({ x: 0, y: 1 })).toEqual({ entry: 'top', exit: 'bottom' });
      expect(portSidesForTangent({ x: 0, y: -1 })).toEqual({ entry: 'bottom', exit: 'top' });
      expect(portSidesForTangent(undefined)).toEqual({ entry: 'left', exit: 'right' });
    });

    it('is a no-op on a link that is no longer in the diagram', async () => {
      diagram.removeLink(link.id);
      const result = await insertNodeOnEdge(engine, link, 0.5, { x: 250, y: 25 });
      expect(result).toBeNull();
    });

    it('is reachable as a toolbar action', async () => {
      const action = createInsertNodeAction(engine, { label: 'Step' });
      expect(action.id).toBe('insert-node');

      action.onClick({ link, engine, t: 0.5, point: { x: 250, y: 25 }, tangent: { x: 1, y: 0 } });
      await new Promise(r => setTimeout(r, 0));

      expect(diagram.getLinks()).toHaveLength(2);
      const inserted = diagram.getNodes().find(n => n.getMetadata('label') === 'Step');
      expect(inserted).toBeDefined();
    });
  });
});
