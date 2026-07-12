/**
 * @jest-environment jsdom
 *
 * Wave 2 (Edges & links): unit tests for the two table-stakes edge cards on
 * InteractionHandlerService.
 *
 *  Card 1 — inline label drag-reposition: computeLabelDragUpdate maps a world
 *           point to a (position 0-1, offset) pair that reproduces the point.
 *  Card 2 — reconnectable endpoints: reconnecting to a valid port commits;
 *           reconnecting to an invalid port restores the original connection.
 *
 * These exercise the pure/service logic directly (no DOM/canvas), per the task.
 */

import { TestBed } from '@angular/core/testing';
import {
  DiagramEngine,
  DiagramModel,
  NodeModel,
  PortModel,
  LinkModel,
} from '@grafloria/engine';
import { InteractionHandlerService } from './interaction-handler.service';

describe('InteractionHandlerService — Wave 2 edges', () => {
  let service: InteractionHandlerService;
  let engine: DiagramEngine;
  let diagram: DiagramModel;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(InteractionHandlerService);
    engine = new DiagramEngine();
    diagram = engine.createDiagram('wave2-edges');
  });

  afterEach(() => {
    engine.destroy();
  });

  /** Add a node at (x,y) 100x50 with a single port of the given type/side. */
  function nodeWithPort(
    x: number,
    type: 'input' | 'output' | 'bi',
    side: 'left' | 'right'
  ): { node: NodeModel; port: PortModel } {
    const node = new NodeModel({
      type: 'test',
      position: { x, y: 0 },
      size: { width: 100, height: 50, depth: 0 },
    });
    diagram.addNode(node);
    const port = new PortModel({ type, side });
    node.addPort(port);
    return { node, port };
  }

  /** A -> B link (output right of A, input left of B), routed orthogonally. */
  function makeAToBLink(): {
    link: LinkModel;
    a: { node: NodeModel; port: PortModel };
    b: { node: NodeModel; port: PortModel };
  } {
    const a = nodeWithPort(0, 'output', 'right');
    const b = nodeWithPort(300, 'input', 'left');
    const link = new LinkModel(a.port.id, b.port.id, 'orthogonal');
    diagram.addLink(link);
    const sp = a.port.getAbsolutePosition(a.node.getBoundingBox());
    const tp = b.port.getAbsolutePosition(b.node.getBoundingBox());
    link.generatePath(sp, tp, 'right', 'left');
    return { link, a, b };
  }

  // ---------------------------------------------------------------------------
  // Card 1: inline label drag-reposition
  // ---------------------------------------------------------------------------
  describe('Card 1 — label drag-reposition', () => {
    it('maps a world point to position(t)+offset that reproduces the point', () => {
      const { link } = makeAToBLink();
      link.addLabel({ text: 'edge', position: 0.5 });

      const worldPoint = { x: 175, y: 40 };
      const update = service.computeLabelDragUpdate(link, worldPoint);

      expect(update).not.toBeNull();
      expect(update!.position).toBeGreaterThanOrEqual(0);
      expect(update!.position).toBeLessThanOrEqual(1);

      // The renderer draws the label at getPointAtPosition(position) + offset;
      // that MUST reproduce the dragged world point.
      const anchor = link.getPointAtPosition(update!.position)!;
      expect(anchor.x + update!.offset.x).toBeCloseTo(worldPoint.x, 5);
      expect(anchor.y + update!.offset.y).toBeCloseTo(worldPoint.y, 5);
    });

    it('yields ~zero offset when the point is exactly on the path', () => {
      const { link } = makeAToBLink();
      const onPath = link.getPointAtPosition(0.5)!;

      const update = service.computeLabelDragUpdate(link, onPath)!;

      expect(update.position).toBeCloseTo(0.5, 1);
      expect(update.offset.x).toBeCloseTo(0, 3);
      expect(update.offset.y).toBeCloseTo(0, 3);
    });

    it('reproduces the point via the polyline fallback when segments are stale', () => {
      const { link } = makeAToBLink();
      // Simulate a renderer that syncs `points` directly and leaves `segments`
      // empty (getClosestPoint returns null → polyline fallback path).
      (link as any).segments = [];

      const worldPoint = { x: 150, y: 25 };
      const update = service.computeLabelDragUpdate(link, worldPoint)!;

      expect(update).not.toBeNull();
      const anchor = link.getPointAtPosition(update.position)!;
      expect(anchor.x + update.offset.x).toBeCloseTo(worldPoint.x, 5);
      expect(anchor.y + update.offset.y).toBeCloseTo(worldPoint.y, 5);
    });

    it('moveLabelDrag writes the remapped placement onto the model label', () => {
      const { link } = makeAToBLink();
      link.addLabel({ text: 'edge', position: 0.1, offset: { x: 0, y: 0 } });

      service.startLabelDrag(link, 0);
      expect(service.getState().isDraggingLabel).toBe(true);

      const moved = service.moveLabelDrag(175, 40);
      expect(moved).toBe(true);

      const label = link.labels[0];
      const anchor = link.getPointAtPosition(label.position)!;
      expect(anchor.x + label.offset.x).toBeCloseTo(175, 5);
      expect(anchor.y + label.offset.y).toBeCloseTo(40, 5);

      service.endLabelDrag();
      expect(service.getState().isDraggingLabel).toBe(false);
    });

    it('returns null for a degenerate link (fewer than 2 points)', () => {
      const link = new LinkModel('p1', 'p2');
      (link as any).points = [{ x: 10, y: 10 }];
      expect(service.computeLabelDragUpdate(link, { x: 0, y: 0 })).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Card 2: reconnectable endpoints + validation
  // ---------------------------------------------------------------------------
  describe('Card 2 — endpoint reconnection validation', () => {
    it('accepts a type-compatible port on a different node', () => {
      const { link } = makeAToBLink();
      const c = nodeWithPort(600, 'input', 'left'); // input, different node

      expect(
        service.isValidReconnectionTarget(link, 'target', c.port, engine)
      ).toBe(true);
    });

    it('rejects a same-direction port (output↔output)', () => {
      const { link } = makeAToBLink(); // fixed source is an OUTPUT port
      const c = nodeWithPort(600, 'output', 'left');

      expect(
        service.isValidReconnectionTarget(link, 'target', c.port, engine)
      ).toBe(false);
    });

    it('rejects a port on the same node as the fixed endpoint', () => {
      const { link, a } = makeAToBLink();
      // Add a second (input) port to node A and try to drop the target on it.
      const extra = new PortModel({ type: 'input', side: 'left' });
      a.node.addPort(extra);

      expect(
        service.isValidReconnectionTarget(link, 'target', extra, engine)
      ).toBe(false);
    });

    it('rejects across mismatched connection groups', () => {
      const { link, a } = makeAToBLink();
      const c = nodeWithPort(600, 'input', 'left');
      a.node.setConnectionGroup('groupA');
      c.node.setConnectionGroup('groupB');

      expect(
        service.isValidReconnectionTarget(link, 'target', c.port, engine)
      ).toBe(false);
    });

    it('commits reconnection to a valid port', () => {
      const { link, b } = makeAToBLink();
      const c = nodeWithPort(600, 'input', 'left');
      const originalTarget = link.targetPortId;
      expect(originalTarget).toBe(b.port.id);

      service.startLinkReconnection(link, 'target', 150, 25, engine);
      // Endpoint drag seeds the live preview on the engine.
      expect(engine.getReconnectionPreview()?.linkId).toBe(link.id);

      (service as any).hoveredPort = c.port; // cursor over valid drop target
      const ok = service.completeLinkReconnection(engine);

      expect(ok).toBe(true);
      expect(link.targetPortId).toBe(c.port.id);
      // State + preview cleared.
      expect(service.getState().isReconnectingLink).toBe(false);
      expect(engine.getReconnectionPreview()).toBeNull();
      expect(link.isTargetEndpointSelected).toBe(false);
    });

    it('restores the original connection when dropped on an invalid port', () => {
      const { link, b } = makeAToBLink();
      const c = nodeWithPort(600, 'output', 'left'); // invalid: output↔output
      const originalTarget = link.targetPortId;

      service.startLinkReconnection(link, 'target', 150, 25, engine);
      (service as any).hoveredPort = c.port;
      const ok = service.completeLinkReconnection(engine);

      expect(ok).toBe(false);
      // Original connection untouched, state + preview cleared.
      expect(link.targetPortId).toBe(originalTarget);
      expect(service.getState().isReconnectingLink).toBe(false);
      expect(engine.getReconnectionPreview()).toBeNull();
      expect(link.isTargetEndpointSelected).toBe(false);
    });

    it('restores the original connection when dropped on empty space', () => {
      const { link } = makeAToBLink();
      const originalTarget = link.targetPortId;

      service.startLinkReconnection(link, 'target', 150, 25, engine);
      (service as any).hoveredPort = null; // dropped on nothing
      const ok = service.completeLinkReconnection(engine);

      expect(ok).toBe(false);
      expect(link.targetPortId).toBe(originalTarget);
      expect(service.getState().isReconnectingLink).toBe(false);
      expect(engine.getReconnectionPreview()).toBeNull();
    });

    it('cancelLinkReconnection clears preview and endpoint selection', () => {
      const { link } = makeAToBLink();
      service.startLinkReconnection(link, 'source', 10, 10, engine);
      expect(service.getState().isReconnectingLink).toBe(true);
      expect(link.isSourceEndpointSelected).toBe(true);

      service.cancelLinkReconnection(engine);

      expect(service.getState().isReconnectingLink).toBe(false);
      expect(engine.getReconnectionPreview()).toBeNull();
      expect(link.isSourceEndpointSelected).toBe(false);
    });

    it('updateLinkReconnection marks the hovered valid port as the preview target', () => {
      const { link } = makeAToBLink();
      const c = nodeWithPort(600, 'input', 'left');

      service.startLinkReconnection(link, 'target', 150, 25, engine);
      (service as any).hoveredPort = c.port;
      service.updateLinkReconnection(320, 25, engine);

      const preview = engine.getReconnectionPreview()!;
      expect(preview.mousePoint).toEqual({ x: 320, y: 25 });
      expect(preview.isValid).toBe(true);
      expect(c.port.isValidTarget).toBe(true);
    });
  });
});
