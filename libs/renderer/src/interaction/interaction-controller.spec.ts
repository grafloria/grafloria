/**
 * Wave 3 (framework-agnostic instance API) — InteractionController.
 *
 * The interaction brain used to live in `@grafloria/angular` as an
 * `@Injectable` service, which meant every new framework wrapper would have had
 * to reimplement hover, connect, reconnect and waypoint editing. It now lives
 * here, and the Angular service is a thin subclass.
 *
 * EVERY test below constructs the controller with a PLAIN `new` — no Angular
 * TestBed, no DI container, no ChangeDetectorRef, no component fixture. That is
 * the proof it is framework-agnostic. The final `describe` block enforces it
 * mechanically by scanning the library's source for framework imports.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import {
  DiagramEngine,
  DiagramModel,
  NodeModel,
  PortModel,
  LinkModel,
} from '@grafloria/engine';
import { InteractionController } from './interaction-controller';

describe('InteractionController (framework-agnostic interaction brain)', () => {
  let controller: InteractionController;
  let engine: DiagramEngine;
  let diagram: DiagramModel;

  beforeEach(() => {
    // No TestBed.inject — just `new`. This is the whole point.
    controller = new InteractionController();
    engine = new DiagramEngine();
    diagram = engine.createDiagram('wave3-interaction');
  });

  afterEach(() => {
    controller.dispose();
    engine.destroy();
  });

  /**
   * A 100x50 node at (x, 0). NodeModel auto-creates the four default
   * bidirectional ports (top/right/bottom/left) — those are what hit-testing
   * actually finds, so the hover/connect/reconnect flows below drive them,
   * exactly as a real canvas does.
   */
  function addNode(x: number): NodeModel {
    const node = new NodeModel({
      type: 'test',
      position: { x, y: 0 },
      size: { width: 100, height: 50, depth: 0 },
    });
    diagram.addNode(node);
    return node;
  }

  /** The auto-created default port on a given side. */
  function sidePort(node: NodeModel, side: 'top' | 'right' | 'bottom' | 'left'): PortModel {
    const port = node.getPortBySide(side);
    if (!port) throw new Error(`no default ${side} port`);
    return port;
  }

  /** World position of a port — where the cursor must be to hit it. */
  function at(node: NodeModel, port: PortModel) {
    return port.getAbsolutePosition(node.getBoundingBox());
  }

  /** A → B link between the default (bidirectional) right/left ports. */
  function makeAToBLink(pathType: 'orthogonal' | 'direct' = 'orthogonal') {
    const aNode = addNode(0);
    const bNode = addNode(300);
    const aPort = sidePort(aNode, 'right');
    const bPort = sidePort(bNode, 'left');

    const link = new LinkModel(aPort.id, bPort.id, pathType);
    diagram.addLink(link);
    link.generatePath(at(aNode, aPort), at(bNode, bPort), 'right', 'left');

    return { link, a: { node: aNode, port: aPort }, b: { node: bNode, port: bPort } };
  }

  /**
   * A node carrying an EXTRA explicitly-typed port, plus a link built from those
   * typed ports. The validation tests need directional (input/output) endpoints —
   * a bidirectional port lifts the type restriction by design — and they call
   * `isValidReconnectionTarget` with the port object directly, so hit-testing
   * (which would find the default port first) never enters the picture.
   */
  function nodeWithPort(
    x: number,
    type: 'input' | 'output' | 'bi',
    side: 'left' | 'right'
  ): { node: NodeModel; port: PortModel } {
    const node = addNode(x);
    const port = new PortModel({ type, side });
    node.addPort(port);
    return { node, port };
  }

  /** A → B link whose endpoints are an explicit OUTPUT → INPUT pair. */
  function makeTypedAToBLink() {
    const a = nodeWithPort(0, 'output', 'right');
    const b = nodeWithPort(300, 'input', 'left');
    const link = new LinkModel(a.port.id, b.port.id, 'orthogonal');
    diagram.addLink(link);
    link.generatePath(at(a.node, a.port), at(b.node, b.port), 'right', 'left');
    return { link, a, b };
  }

  // ==========================================================================
  describe('instantiation without a framework', () => {
    it('constructs with a plain `new` and starts idle', () => {
      expect(controller).toBeInstanceOf(InteractionController);

      const state = controller.getState();
      expect(state.isConnecting).toBe(false);
      expect(state.isReconnectingLink).toBe(false);
      expect(state.hoveredNode).toBeNull();
      expect(state.hoveredPort).toBeNull();
      expect(state.hoveredLink).toBeNull();
      expect(controller.isInteracting()).toBe(false);
    });

    it('exposes performance metrics without any host wiring', () => {
      expect(controller.getPerformanceMetrics()).toEqual({
        hoverDetectionTime: 0,
        connectionUpdateTime: 0,
        portHitTestTime: 0,
      });
    });
  });

  // ==========================================================================
  describe('hover detection (returns "needs render", never triggers one)', () => {
    it('reports the hovered port and asks the host to re-render', () => {
      const node = addNode(0);
      const port = sidePort(node, 'right');
      const p = at(node, port);

      const needsRender = controller.handleMouseMove(p.x, p.y, engine);

      // The controller answers WHAT changed — the host decides how to react.
      expect(needsRender).toBe(true);
      expect(controller.getState().hoveredPort).toBe(port);
      expect(port.isHovered).toBe(true);
    });

    it('clears hover when the cursor leaves, and reports no change when idle', () => {
      const node = addNode(0);
      const port = sidePort(node, 'right');
      const p = at(node, port);

      controller.handleMouseMove(p.x, p.y, engine);
      expect(controller.handleMouseMove(9999, 9999, engine)).toBe(true); // hover lost
      expect(controller.getState().hoveredPort).toBeNull();
      expect(port.isHovered).toBe(false);

      // Nothing changed on a second move in empty space → no re-render needed.
      expect(controller.handleMouseMove(9998, 9998, engine)).toBe(false);
    });

    it('rejects non-finite coordinates instead of corrupting state', () => {
      expect(controller.handleMouseMove(NaN, 0, engine)).toBe(false);
      expect(controller.handleMouseMove(0, Infinity, engine)).toBe(false);
    });

    /**
     * Occlusion (live report, stacked pasted nodes): a buried node's port must
     * not win the hover race THROUGH the node covering it — the renderer hides
     * that glyph via the same oracle, and an invisible port that still hovers
     * (and would start a wire on press) is a ghost affordance.
     */
    it('a port covered by a higher node is not hoverable; the top node port wins', () => {
      const under = addNode(0);
      const top = new NodeModel({
        type: 'test',
        position: { x: 0, y: 0 },
        size: { width: 100, height: 50, depth: 0 },
      });
      diagram.addNode(top); // exactly stacked, above `under`

      // The shared right-side anchor (100, 25): both nodes have a port there.
      controller.handleMouseMove(100, 25, engine);
      const hovered = controller.getState().hoveredPort;
      expect(hovered).not.toBeNull();
      // …and it is the TOP node's port, never the buried one's.
      expect(top.getPortBySide('right')!.id).toBe(hovered!.id);
      expect(under.getPortBySide('right')!.id).not.toBe(hovered!.id);
    });

    /**
     * connectable:false (live report, dashboard-builder): a dashboard widget is
     * not a wiring endpoint — hovering it must not surface port affordances.
     * The engine's connection rules already refuse such a node as source AND
     * target; an affordance for a gesture the rules will refuse is a ghost.
     * Same paint-and-input-agree principle as the occlusion rule above.
     */
    it('ports of a connectable:false node are not hoverable', () => {
      const node = addNode(0);
      node.behavior.connectable = false;
      const port = sidePort(node, 'right');
      const p = at(node, port);

      controller.handleMouseMove(p.x, p.y, engine);
      expect(controller.getState().hoveredPort).toBeNull();
      expect(port.isHovered).toBe(false);
    });
  });

  // ==========================================================================
  describe('connection lifecycle', () => {
    it('start → state; cancel → clean slate', () => {
      const node = addNode(0);
      const port = sidePort(node, 'right');

      controller.startConnection(port, 100, 25, engine);
      expect(controller.getState().isConnecting).toBe(true);
      expect(controller.isInteracting()).toBe(true);

      controller.cancelConnection(engine);
      expect(controller.getState().isConnecting).toBe(false);
      expect(controller.isInteracting()).toBe(false);
    });

    it('completes a connection onto a hovered, compatible port', async () => {
      const aNode = addNode(0);
      const bNode = addNode(300);
      const aPort = sidePort(aNode, 'right');
      const bPort = sidePort(bNode, 'left');
      const target = at(bNode, bPort);

      const source = at(aNode, aPort);
      controller.startConnection(aPort, source.x, source.y, engine);

      // Hover the target port so completeConnection has somewhere to land.
      controller.handleMouseMove(target.x, target.y, engine);
      controller.handleConnectionDrag(target.x, target.y, engine);

      expect(controller.completeConnection(engine)).toBe(true);
      expect(controller.getState().isConnecting).toBe(false);

      // The engine creates the link on the `connection:complete` event, but it
      // AWAITS obstacle-avoidance routing first — so the link lands on a later
      // tick, not synchronously with completeConnection().
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(diagram.getLinks().length).toBe(1);
      const link = diagram.getLinks()[0]!;
      expect(link.sourcePortId).toBe(aPort.id);
      expect(link.targetPortId).toBe(bPort.id);
    });

    it('does not create a link when dropped on empty space', () => {
      const node = addNode(0);
      const port = sidePort(node, 'right');

      controller.startConnection(port, 100, 25, engine);
      controller.handleMouseMove(9999, 9999, engine); // nothing under cursor

      expect(controller.completeConnection(engine)).toBe(false);
      expect(diagram.getLinks().length).toBe(0);
    });

    it('drag updates are ignored when no connection is in flight', () => {
      expect(controller.handleConnectionDrag(10, 10, engine)).toBe(false);
    });
  });

  // ==========================================================================
  describe('endpoint reconnection validation', () => {
    it('accepts a type-compatible port on a different node', () => {
      const { link } = makeTypedAToBLink();
      const c = nodeWithPort(600, 'input', 'left');

      expect(controller.isValidReconnectionTarget(link, 'target', c.port, engine)).toBe(true);
    });

    it('rejects a same-direction port (output ↔ output)', () => {
      const { link } = makeTypedAToBLink(); // the fixed source endpoint is an OUTPUT
      const c = nodeWithPort(600, 'output', 'left');

      expect(controller.isValidReconnectionTarget(link, 'target', c.port, engine)).toBe(false);
    });

    it('rejects dropping back onto the stationary endpoint’s own node', () => {
      const { link, a } = makeTypedAToBLink();
      const selfPort = new PortModel({ type: 'input', side: 'left' });
      a.node.addPort(selfPort); // same node as the fixed source endpoint

      expect(controller.isValidReconnectionTarget(link, 'target', selfPort, engine)).toBe(false);
    });

    it('commits a valid reconnection and rewires the model', () => {
      const { link } = makeAToBLink();
      const cNode = addNode(600);
      const cPort = sidePort(cNode, 'left');
      const cAt = at(cNode, cPort);

      controller.startLinkReconnection(link, 'target', 300, 25, engine);
      expect(controller.getState().isReconnectingLink).toBe(true);

      controller.handleMouseMove(cAt.x, cAt.y, engine); // hover the new target
      controller.updateLinkReconnection(cAt.x, cAt.y, engine);

      expect(controller.completeLinkReconnection(engine)).toBe(true);
      expect(link.targetPortId).toBe(cPort.id);
      expect(link.targetNodeId).toBe(cNode.id);
      expect(controller.getState().isReconnectingLink).toBe(false);
    });

    it('restores the original connection when dropped on nothing', () => {
      const { link, b } = makeAToBLink();
      const originalTarget = link.targetPortId;

      controller.startLinkReconnection(link, 'target', 300, 25, engine);
      controller.handleMouseMove(9999, 9999, engine); // no port under cursor

      expect(controller.completeLinkReconnection(engine)).toBe(false);
      expect(link.targetPortId).toBe(originalTarget);
      expect(link.targetPortId).toBe(b.port.id);
    });

    it('a reconnection is command-UNDOABLE (undo restores the original endpoint)', async () => {
      const { link, b } = makeAToBLink();
      const originalPort = link.targetPortId;
      const originalNode = link.targetNodeId;
      const cNode = addNode(600);
      const cPort = sidePort(cNode, 'left');
      const cAt = at(cNode, cPort);

      controller.startLinkReconnection(link, 'target', 300, 25, engine);
      controller.handleMouseMove(cAt.x, cAt.y, engine);
      controller.updateLinkReconnection(cAt.x, cAt.y, engine);
      expect(controller.completeLinkReconnection(engine)).toBe(true);
      await new Promise((r) => setTimeout(r, 0)); // async command commit
      expect(link.targetPortId).toBe(cPort.id);

      // THE ASSERTION THAT WAS RED: undo puts the endpoint back on B.
      await engine.undo();
      expect(link.targetPortId).toBe(originalPort);
      expect(link.targetPortId).toBe(b.port.id);
      expect(link.targetNodeId).toBe(originalNode);
    });
  });

  // ==========================================================================
  describe('inline label drag-reposition', () => {
    it('maps a world point to a (position, offset) that reproduces the point', () => {
      const { link } = makeAToBLink();
      link.addLabel({ text: 'edge', position: 0.5 });

      const worldPoint = { x: 175, y: 40 };
      const update = controller.computeLabelDragUpdate(link, worldPoint);

      expect(update).not.toBeNull();
      const anchor = link.getPointAtPosition(update!.position)!;
      expect(anchor.x + update!.offset.x).toBeCloseTo(worldPoint.x, 5);
      expect(anchor.y + update!.offset.y).toBeCloseTo(worldPoint.y, 5);
    });

    it('moveLabelDrag writes the remapped placement onto the model', () => {
      const { link } = makeAToBLink();
      link.addLabel({ text: 'edge', position: 0.1, offset: { x: 0, y: 0 } });

      controller.startLabelDrag(link, 0);
      expect(controller.getState().isDraggingLabel).toBe(true);
      expect(controller.moveLabelDrag(175, 40)).toBe(true);

      const label = link.labels[0];
      const anchor = link.getPointAtPosition(label.position)!;
      expect(anchor.x + label.offset.x).toBeCloseTo(175, 5);
      expect(anchor.y + label.offset.y).toBeCloseTo(40, 5);

      controller.endLabelDrag();
      expect(controller.getState().isDraggingLabel).toBe(false);
    });

    it('returns null for a degenerate link (fewer than 2 points)', () => {
      const link = new LinkModel('p1', 'p2');
      (link as any).points = [{ x: 10, y: 10 }];

      expect(controller.computeLabelDragUpdate(link, { x: 0, y: 0 })).toBeNull();
    });
  });

  // ==========================================================================
  describe('waypoint editing (the flow the e2e harness drives)', () => {
    it('add → drag → remove, with the manual-waypoint flag tracking it', () => {
      const { link } = makeAToBLink('direct');
      expect(link.getMetadata('hasManualWaypoints')).not.toBe(true);
      expect(link.points.length).toBe(2);

      // Add on the path, comfortably clear of both endpoints.
      const mid = link.getPointAtPosition(0.5)!;
      expect(controller.addWaypoint(mid.x, mid.y, link)).toBe(true);
      expect(link.getMetadata('hasManualWaypoints')).toBe(true);
      expect(link.points.length).toBe(3);

      // Drag it.
      controller.startWaypointDrag(1, link);
      expect(controller.getState().isDraggingWaypoint).toBe(true);
      expect(controller.moveWaypoint(mid.x + 30, mid.y + 60, engine)).toBe(true);
      expect(link.points[1]).toMatchObject({ x: mid.x + 30, y: mid.y + 60 });

      controller.endWaypointDrag();
      expect(controller.getState().isDraggingWaypoint).toBe(false);

      // Remove it → back to 2 points, flag clears so auto-routing resumes.
      expect(controller.removeWaypoint(1, link)).toBe(true);
      expect(link.points.length).toBe(2);
      expect(link.getMetadata('hasManualWaypoints')).toBe(false);
    });

    it('moveWaypoint is a no-op when no drag is in flight', () => {
      expect(controller.moveWaypoint(10, 10, engine)).toBe(false);
    });

    it('a waypoint drag is command-UNDOABLE (endWaypointDrag commits a FROM→TO step)', async () => {
      const { link } = makeAToBLink('direct');
      const mid = link.getPointAtPosition(0.5)!;
      controller.addWaypoint(mid.x, mid.y, link);
      const before = link.points.map((p) => ({ x: p.x, y: p.y }));

      controller.startWaypointDrag(1, link);
      controller.moveWaypoint(mid.x + 40, mid.y + 70, engine);
      controller.endWaypointDrag(engine); // commit the gesture as one undoable step
      await new Promise((r) => setTimeout(r, 0)); // let the async command reach the stack

      expect(link.points[1]).toMatchObject({ x: mid.x + 40, y: mid.y + 70 });

      // THE ASSERTION THAT WAS RED: undo restores the path to before the drag.
      await engine.undo();
      expect(link.points.map((p) => ({ x: p.x, y: p.y }))).toEqual(before);
    });
  });

  // ==========================================================================
  describe('part-aware link hit-testing', () => {
    it('reports WHICH part of the link was hit', () => {
      const { link } = makeAToBLink();
      const onPath = link.getPointAtPosition(0.5)!;

      const hit = controller.getLinkHitAtPosition(onPath.x, onPath.y, engine);

      expect(hit).not.toBeNull();
      expect(hit!.link).toBe(link);
      expect(hit!.part).toBeDefined();
    });

    it('returns null in empty space', () => {
      makeAToBLink();
      expect(controller.getLinkHitAtPosition(9999, 9999, engine)).toBeNull();
    });

    /**
     * Fan-out steal (live report: near a shared source, clicking ON one edge's
     * ink selected its earlier-added sibling). Resolution is NEAREST link, not
     * first-in-model-order.
     */
    it('the NEAREST link wins, not the first in model order', () => {
      // Two parallel horizontal links 4px apart — both within the ~6px body
      // grab tolerance of a press on the SECOND one's ink.
      const first = new LinkModel('pa1', 'pb1', 'direct');
      diagram.addLink(first);
      first.generatePath({ x: 0, y: 100 }, { x: 300, y: 100 }, 'right', 'left');
      const second = new LinkModel('pa2', 'pb2', 'direct');
      diagram.addLink(second);
      second.generatePath({ x: 0, y: 104 }, { x: 300, y: 104 }, 'right', 'left');

      const hit = controller.getLinkHitAtPosition(150, 104, engine);
      expect(hit!.link).toBe(second);
      // …and squarely on the first one, the first one still wins.
      expect(controller.getLinkHitAtPosition(150, 100, engine)!.link).toBe(first);
    });

    /**
     * At a SHARED anchor every sibling's endpoint handle is equidistant — the
     * handle distance cannot break the tie. Body distance can: only the link
     * actually under the cursor runs through the press point.
     */
    it('shared-anchor fan-outs resolve by BODY distance, not the endpoint-handle tie', () => {
      const first = new LinkModel('pa1', 'pb1', 'direct');
      diagram.addLink(first);
      first.generatePath({ x: 0, y: 100 }, { x: 300, y: 100 }, 'right', 'left');
      // Same start anchor, heading diagonally down.
      const second = new LinkModel('pa2', 'pb2', 'direct');
      diagram.addLink(second);
      second.generatePath({ x: 0, y: 100 }, { x: 212, y: 312 }, 'right', 'left');

      // ~8px along the SECOND link (on its ink; 45°): inside BOTH links'
      // endpoint-handle radius around the shared anchor, and within body
      // tolerance of both. Body distance: second = 0, first ≈ 5.7.
      const hit = controller.getLinkHitAtPosition(5.66, 105.66, engine);
      expect(hit!.link).toBe(second);
    });
  });

  // ==========================================================================
  describe('cursor + teardown', () => {
    it('derives the cursor from interaction state (no DOM involved)', () => {
      const node = addNode(0);
      const port = sidePort(node, 'right');

      expect(controller.getCursor(engine)).toBe('default');

      controller.startConnection(port, 100, 25, engine);
      expect(controller.getCursor(engine)).toBe('crosshair');
    });

    it('dispose() releases every piece of interaction state', () => {
      const node = addNode(0);
      const port = sidePort(node, 'right');
      const p = at(node, port);

      controller.handleMouseMove(p.x, p.y, engine);
      controller.startConnection(port, p.x, p.y, engine);

      controller.dispose();

      const state = controller.getState();
      expect(state.isConnecting).toBe(false);
      expect(state.hoveredPort).toBeNull();
      expect(state.hoveredNode).toBeNull();
      expect(controller.isInteracting()).toBe(false);
    });
  });

  // ==========================================================================
  // The architectural guard: this is what keeps the layer framework-agnostic.
  // ==========================================================================
  describe('architectural guard — @grafloria/renderer imports no framework', () => {
    // Built at runtime so this spec file does not match its own needle.
    const FRAMEWORK_NEEDLES = ['@' + 'angular/', 'react', 'vue'];
    const SRC_ROOT = join(__dirname, '..');

    function sourceFiles(dir: string): string[] {
      const out: string[] = [];
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          out.push(...sourceFiles(full));
        } else if (entry.endsWith('.ts')) {
          out.push(full);
        }
      }
      return out;
    }

    /** `from '<pkg>'` / `require('<pkg>')` occurrences — not prose in comments. */
    function frameworkImports(file: string): string[] {
      const src = readFileSync(file, 'utf8');
      const importRe = /(?:from\s+|require\()\s*['"]([^'"]+)['"]/g;
      const hits: string[] = [];
      let m: RegExpExecArray | null;
      while ((m = importRe.exec(src)) !== null) {
        const spec = m[1]!.toLowerCase();
        if (FRAMEWORK_NEEDLES.some((n) => spec === n.replace(/\/$/, '') || spec.startsWith(n))) {
          hits.push(m[1]!);
        }
      }
      return hits;
    }

    it('InteractionController imports no framework package', () => {
      expect(frameworkImports(join(__dirname, 'interaction-controller.ts'))).toEqual([]);
    });

    it('ViewportController imports no framework package', () => {
      expect(frameworkImports(join(SRC_ROOT, 'viewport', 'viewport-controller.ts'))).toEqual([]);
    });

    it('NO file in libs/renderer/src imports a UI framework', () => {
      const offenders = sourceFiles(SRC_ROOT)
        .map((file) => ({ file, hits: frameworkImports(file) }))
        .filter(({ hits }) => hits.length > 0);

      expect(offenders).toEqual([]);
    });
  });
});
