/**
 * Card 4 — the public reactive + imperative surface.
 *
 * The interesting assertions are the ones the underlying machinery does NOT
 * already give you: that a selector fires only when its projection CHANGES (not
 * on every internal event), that screen↔flow round-trips, that
 * getIntersectingNodes distinguishes overlap from containment, and that
 * dispose() really unsubscribes.
 */

import { DiagramEngine, NodeModel } from '@grafloria/engine';
import { createDiagram } from '../instance/create-diagram';
import type { DiagramInstance } from '../instance/create-diagram';
import { createDiagramApi } from './public-api';
import type { DiagramApi } from './public-api';

describe('createDiagramApi (Card 4)', () => {
  let container: HTMLElement;
  let engine: DiagramEngine;
  let diagram: DiagramInstance;
  let api: DiagramApi;

  const addNode = (id: string, x: number, y: number, w = 100, h = 60): NodeModel => {
    const node = new NodeModel({ id, type: 'basic', position: { x, y } });
    node.size = { width: w, height: h };
    engine.getDiagram()!.addNode(node);
    return node;
  };

  beforeEach(() => {
    container = document.createElement('div');
    // jsdom gives every element a zero rect; the camera needs a real size.
    container.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0 }) as DOMRect;
    document.body.appendChild(container);

    engine = new DiagramEngine();
    engine.createDiagram('api');
    diagram = createDiagram(container, { engine });
    api = createDiagramApi(diagram);
  });

  afterEach(() => {
    api.dispose();
    diagram.dispose();
    container.remove();
  });

  it('reads nodes/edges/selection/viewport', () => {
    addNode('a', 10, 10);
    addNode('b', 300, 200);

    expect(api.getNodes()).toHaveLength(2);
    expect(api.getEdges()).toHaveLength(0);
    expect(api.getSelectedNodes()).toHaveLength(0);
    expect(api.getZoom()).toBe(1);

    const snapshot = api.getSnapshot();
    expect(snapshot.nodes).toHaveLength(2);
    expect(snapshot.viewport.width).toBe(800);
  });

  describe('subscribe()', () => {
    it('fires only when the SELECTED value changes, not on every event', () => {
      const listener = jest.fn();
      api.subscribe((s) => s.nodes.length, listener);

      addNode('a', 10, 10);
      diagram.renderNow();
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenLastCalledWith(1);

      // A pure VIEWPORT change must NOT wake a node-count selector — that is the
      // whole point of projecting, and it is what keeps a host from re-rendering
      // on every mousemove.
      diagram.viewport.pan(50, 50);
      diagram.renderNow();
      expect(listener).toHaveBeenCalledTimes(1);

      addNode('b', 40, 40);
      diagram.renderNow();
      expect(listener).toHaveBeenCalledTimes(2);
      expect(listener).toHaveBeenLastCalledWith(2);
    });

    it('a viewport selector DOES fire on pan', () => {
      const listener = jest.fn();
      api.subscribe((s) => s.zoom, listener);

      diagram.viewport.setZoom(2);
      expect(listener).toHaveBeenCalledWith(2);
    });

    it('unsubscribing stops the listener', () => {
      const listener = jest.fn();
      const off = api.subscribe((s) => s.nodes.length, listener);

      addNode('a', 0, 0);
      diagram.renderNow();
      expect(listener).toHaveBeenCalledTimes(1);

      off();
      addNode('b', 0, 0);
      diagram.renderNow();
      expect(listener).toHaveBeenCalledTimes(1); // no more
    });

    it('dispose() drops every subscription', () => {
      const listener = jest.fn();
      api.subscribe((s) => s.nodes.length, listener);

      api.dispose();

      addNode('a', 0, 0);
      diagram.renderNow();
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('screenToFlow / flowToScreen', () => {
    it('round-trips at zoom 1', () => {
      const flow = api.screenToFlow({ x: 120, y: 80 });
      const screen = api.flowToScreen(flow);
      expect(screen.x).toBeCloseTo(120);
      expect(screen.y).toBeCloseTo(80);
    });

    it('round-trips under zoom AND pan (the case that catches stale-rect bugs)', () => {
      diagram.viewport.setZoom(2);
      diagram.viewport.pan(133, 77);

      const flow = api.screenToFlow({ x: 400, y: 300 });
      const screen = api.flowToScreen(flow);

      expect(screen.x).toBeCloseTo(400);
      expect(screen.y).toBeCloseTo(300);
    });
  });

  describe('getIntersectingNodes', () => {
    beforeEach(() => {
      addNode('a', 0, 0, 100, 100); // 0..100
      addNode('b', 150, 0, 100, 100); // 150..250
      addNode('c', 500, 500, 100, 100); // far away
    });

    it('returns nodes that OVERLAP the rect', () => {
      const hit = api.getIntersectingNodes({ x: 50, y: 50, width: 150, height: 20 });
      expect(hit.map((n) => n.id).sort()).toEqual(['a', 'b']);
    });

    it('`fully` requires full containment (marquee semantics)', () => {
      // This rect merely CLIPS a, and fully encloses nothing.
      const partial = api.getIntersectingNodes(
        { x: 50, y: 50, width: 150, height: 20 },
        { fully: true }
      );
      expect(partial).toHaveLength(0);

      // This one encloses `a` entirely.
      const full = api.getIntersectingNodes(
        { x: -10, y: -10, width: 130, height: 130 },
        { fully: true }
      );
      expect(full.map((n) => n.id)).toEqual(['a']);
    });

    it('excludes nothing when the rect covers everything', () => {
      const all = api.getIntersectingNodes({ x: -1000, y: -1000, width: 5000, height: 5000 });
      expect(all).toHaveLength(3);
    });
  });

  describe('zoomTo', () => {
    it('zooms about the viewport CENTRE (content does not fly off-screen)', () => {
      const before = api.getViewport();
      const cx = before.x + before.width / 2;
      const cy = before.y + before.height / 2;

      api.zoomTo(2);

      const after = api.getViewport();
      expect(api.getZoom()).toBe(2);
      // The world point that was centred must STILL be centred.
      expect(after.x + after.width / 2).toBeCloseTo(cx);
      expect(after.y + after.height / 2).toBeCloseTo(cy);
    });
  });

  it('centerOn puts a world point at the viewport centre', () => {
    api.centerOn({ x: 1000, y: 500 });
    const v = api.getViewport();
    expect(v.x + v.width / 2).toBeCloseTo(1000);
    expect(v.y + v.height / 2).toBeCloseTo(500);
  });
});
