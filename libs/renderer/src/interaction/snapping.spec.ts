/**
 * Wave 4 — Card 6: snaplines, equal-spacing guides, grid snap, keep-in-bounds,
 * magnetic snap-to-port and proximity connect.
 *
 * Framework-agnostic: plain `new`, no DOM. The proximity link is executed on the
 * real CommandManager, so "undoable" is proven by undoing it.
 */
import { DiagramEngine, DiagramModel, NodeModel, LinkModel, PortModel } from '@grafloria/engine';
import { SnapController, canConnectPorts, DEFAULT_SNAP_CONFIG } from './snapping';

describe('Card 6 — SnapController', () => {
  let snap: SnapController;
  let engine: DiagramEngine;
  let diagram: DiagramModel;

  beforeEach(() => {
    snap = new SnapController();
    engine = new DiagramEngine();
    diagram = engine.createDiagram('wave4-snap');
  });

  afterEach(() => engine.destroy());

  function addNode(x: number, y: number, width = 100, height = 50): NodeModel {
    const node = new NodeModel({
      type: 'test',
      position: { x, y },
      size: { width, height, depth: 0 },
    });
    diagram.addNode(node);
    return node;
  }

  // ==========================================================================
  // Alignment snaplines
  // ==========================================================================

  describe('alignment snaplines', () => {
    test('snaps a near-aligned LEFT edge and emits the guide', () => {
      const other = { x: 100, y: 300, width: 100, height: 50 };
      const moving = { x: 103, y: 0, width: 100, height: 50 };

      const result = snap.computeSnap(moving, [other]);
      expect(result.box.x).toBe(100);
      expect(result.dx).toBe(-3);

      // Equal-width boxes: ONE correction aligns left edges, centres AND right
      // edges — all three lines are real, so all three are drawn.
      const positions = result.guides.map((g) => g.position).sort((a, b) => a - b);
      expect(positions).toEqual([100, 150, 200]);

      const left = result.guides.find((g) => g.position === 100)!;
      expect(left.orientation).toBe('vertical');
      // The guide spans BOTH boxes — that is what makes it read as an alignment.
      expect(left.from).toBeLessThanOrEqual(0);
      expect(left.to).toBeGreaterThanOrEqual(350);
    });

    test('snaps CENTRE to CENTRE and labels that guide as a centre line', () => {
      const other = { x: 0, y: 300, width: 60, height: 50 }; // centre x = 30
      const moving = { x: -17, y: 0, width: 100, height: 50 }; // centre x = 33

      const result = snap.computeSnap(moving, [other]);
      expect(result.box.x).toBe(-20); // centre lands on 30
      const centre = result.guides.find((g) => g.position === 30)!;
      expect(centre.kind).toBe('center');
    });

    test('does NOT snap beyond the threshold', () => {
      const other = { x: 100, y: 300, width: 100, height: 50 };
      const moving = { x: 140, y: 0, width: 100, height: 50 };

      const result = snap.computeSnap(moving, [other]);
      expect(result.box.x).toBe(140);
      expect(result.guides).toHaveLength(0);
    });

    test('snaps both axes independently', () => {
      const other = { x: 100, y: 100, width: 100, height: 50 };
      const moving = { x: 102, y: 400, width: 100, height: 50 };
      const result = snap.computeSnap(moving, [other]);
      expect(result.box.x).toBe(100);
      expect(result.box.y).toBe(400);
    });
  });

  // ==========================================================================
  // Equal spacing
  // ==========================================================================

  describe('equal-spacing guides', () => {
    test('BETWEEN: centres the box between two neighbours with equal gaps, labelled', () => {
      const a = { x: 0, y: 0, width: 100, height: 50 };
      const b = { x: 500, y: 0, width: 100, height: 50 };
      // Free space between them = 400; a 100-wide box leaves 150 each side.
      const moving = { x: 253, y: 0, width: 100, height: 50 };

      const result = snap.computeSnap(moving, [a, b]);
      expect(result.box.x).toBe(250);

      const spacing = result.spacing[0]!;
      expect(spacing.orientation).toBe('horizontal');
      expect(spacing.gap).toBe(150);
      expect(spacing.label).toBe('150');
      expect(spacing.segments).toHaveLength(2); // a→moving, moving→b
    });

    test('CHAIN: continues an existing rhythm on the far side', () => {
      const a = { x: 0, y: 0, width: 100, height: 50 };
      const b = { x: 150, y: 0, width: 100, height: 50 }; // gap 50
      const moving = { x: 303, y: 0, width: 100, height: 50 }; // wants 300

      const result = snap.computeSnap(moving, [a, b]);
      expect(result.box.x).toBe(300);
      expect(result.spacing[0]!.gap).toBe(50);
    });

    test('only considers peers that overlap on the other axis', () => {
      const a = { x: 0, y: 0, width: 100, height: 50 };
      const b = { x: 500, y: 900, width: 100, height: 50 }; // different row
      const moving = { x: 253, y: 0, width: 100, height: 50 };

      const result = snap.computeSnap(moving, [a, b]);
      expect(result.spacing).toHaveLength(0);
      expect(result.box.x).toBe(253);
    });
  });

  // ==========================================================================
  // Grid + bounds
  // ==========================================================================

  describe('grid + keep-in-bounds', () => {
    test('grid snap quantises when nothing else claims the axis', () => {
      snap.updateConfig({ snapToGrid: true, gridSize: 20 });
      const result = snap.computeSnap({ x: 47, y: 33, width: 100, height: 50 }, []);
      expect(result.box).toEqual({ x: 40, y: 40, width: 100, height: 50 });
    });

    test('an alignment guide WINS over the grid on that axis (no jitter fight)', () => {
      snap.updateConfig({ snapToGrid: true, gridSize: 20 });
      const other = { x: 103, y: 300, width: 100, height: 50 };
      const result = snap.computeSnap({ x: 105, y: 33, width: 100, height: 50 }, [other]);

      expect(result.box.x).toBe(103); // aligned, NOT grid-rounded to 100
      expect(result.box.y).toBe(40); // free axis → grid
    });

    test('keep-in-bounds clamps the box inside the canvas rect', () => {
      snap.updateConfig({ keepInBounds: { x: 0, y: 0, width: 500, height: 500 } });

      expect(snap.computeSnap({ x: -30, y: -10, width: 100, height: 50 }, []).box).toMatchObject({
        x: 0,
        y: 0,
      });
      expect(snap.computeSnap({ x: 480, y: 490, width: 100, height: 50 }, []).box).toMatchObject({
        x: 400,
        y: 450,
      });
    });

    test('snapPointToGrid is a no-op when the grid is off', () => {
      expect(snap.snapPointToGrid({ x: 47, y: 33 })).toEqual({ x: 47, y: 33 });
      snap.updateConfig({ snapToGrid: true, gridSize: 20 });
      expect(snap.snapPointToGrid({ x: 47, y: 33 })).toEqual({ x: 40, y: 40 });
    });
  });

  // ==========================================================================
  // The DEAD CONFIG this card revives
  // ==========================================================================

  describe('snapToPortRadius (was dead config)', () => {
    test('syncWithEngineConfig CONSUMES snapToPortRadius — nothing read it before', () => {
      expect(DEFAULT_SNAP_CONFIG.snapToPortRadius).toBe(30);

      engine.setInteractionConfig({ snapToPortRadius: 77 });
      snap.syncWithEngineConfig(engine);
      expect(snap.getConfig().snapToPortRadius).toBe(77);
    });

    test('syncWithEngineConfig also adopts the waypoint editor grid', () => {
      engine.setInteractionConfig({
        waypointEditor: {
          ...engine.getInteractionConfig().waypointEditor!,
          snapToGrid: true,
          gridSize: 25,
        },
      });
      snap.syncWithEngineConfig(engine);
      expect(snap.getConfig()).toMatchObject({ snapToGrid: true, gridSize: 25 });
    });

    test('findPortMagnet returns the nearest port within the radius, and null past it', () => {
      const node = addNode(0, 0, 100, 50);
      const right = node.getPortBySide('right')!; // world (100, 25)

      const hit = snap.findPortMagnet(engine, 115, 25, { radius: 30 });
      expect(hit?.port.id).toBe(right.id);
      expect(hit?.position).toEqual({ x: 100, y: 25 });
      expect(hit?.distance).toBeCloseTo(15, 6);

      expect(snap.findPortMagnet(engine, 200, 25, { radius: 30 })).toBeNull();
    });

    test('findPortMagnet can exclude the node being dragged', () => {
      const node = addNode(0, 0);
      expect(snap.findPortMagnet(engine, 100, 25, { excludeNodeId: node.id })).toBeNull();
    });
  });

  // ==========================================================================
  // Proximity connect
  // ==========================================================================

  describe('proximity connect', () => {
    test('finds a candidate when a dragged node lands near a compatible port', () => {
      const a = addNode(0, 0); // right port at (100, 25)
      const b = addNode(140, 0); // left port at (140, 25) → 40 apart

      const candidate = snap.findProximityConnection(engine, b.id, 60);
      expect(candidate).not.toBeNull();
      expect(candidate!.distance).toBeCloseTo(40, 6);
      expect([candidate!.sourceNodeId, candidate!.targetNodeId].sort()).toEqual(
        [a.id, b.id].sort()
      );
    });

    test('no candidate beyond the radius', () => {
      addNode(0, 0);
      const b = addNode(400, 0);
      expect(snap.findProximityConnection(engine, b.id, 60)).toBeNull();
    });

    test('never proposes a link that already exists', () => {
      addNode(0, 0);
      const b = addNode(140, 0);
      const candidate = snap.findProximityConnection(engine, b.id, 60)!;

      const link = new LinkModel(candidate.sourcePort.id, candidate.targetPort.id);
      link.setSourcePort(candidate.sourcePort.id, candidate.sourceNodeId);
      link.setTargetPort(candidate.targetPort.id, candidate.targetNodeId);
      diagram.addLink(link);

      const again = snap.findProximityConnection(engine, b.id, 60);
      if (again) {
        expect(
          again.sourcePort.id === candidate.sourcePort.id &&
            again.targetPort.id === candidate.targetPort.id
        ).toBe(false);
      }
    });

    test('the candidate becomes ONE undoable AddLinkCommand', async () => {
      addNode(0, 0);
      const b = addNode(140, 0);
      const candidate = snap.findProximityConnection(engine, b.id, 60)!;

      await engine.commandManager.execute(snap.buildProximityLinkCommand(candidate));
      expect(diagram.getLinks()).toHaveLength(1);
      const link = diagram.getLinks()[0]!;
      expect(link.sourcePortId).toBe(candidate.sourcePort.id);
      expect(link.targetPortId).toBe(candidate.targetPort.id);

      await engine.undo();
      expect(diagram.getLinks()).toHaveLength(0);
    });

    test('highlightProximityTarget paints the winning ports and CLEARS every other', () => {
      addNode(0, 0);
      const b = addNode(140, 0);
      const candidate = snap.findProximityConnection(engine, b.id, 60)!;

      snap.highlightProximityTarget(engine, candidate);
      const highlighted = diagram
        .getNodes()
        .flatMap((n: NodeModel) => n.getPorts())
        .filter((p: PortModel) => p.isHighlighted);
      expect(highlighted.map((p) => p.id).sort()).toEqual(
        [candidate.sourcePort.id, candidate.targetPort.id].sort()
      );
      expect(highlighted.every((p) => p.isValidTarget)).toBe(true);

      // The stale-highlight failure mode: clearing must actually clear.
      snap.highlightProximityTarget(engine, null);
      const stillOn = diagram
        .getNodes()
        .flatMap((n: NodeModel) => n.getPorts())
        .filter((p: PortModel) => p.isHighlighted || p.isValidTarget);
      expect(stillOn).toHaveLength(0);
    });
  });

  describe('canConnectPorts (shared by proximity + keyboard connect)', () => {
    test('rejects two ports on the same node', () => {
      const node = addNode(0, 0);
      const left = node.getPortBySide('left')!;
      const right = node.getPortBySide('right')!;
      expect(canConnectPorts(left, right, node, node, engine, diagram)).toBe(false);
    });

    test('rejects two same-direction directional ports, allows a bi port', () => {
      const a = addNode(0, 0);
      const b = addNode(300, 0);

      const outA = new PortModel({ type: 'output', side: 'right' });
      const outB = new PortModel({ type: 'output', side: 'left' });
      a.addPort(outA);
      b.addPort(outB);
      expect(canConnectPorts(outA, outB, a, b, engine, diagram)).toBe(false);

      const inB = new PortModel({ type: 'input', side: 'left' });
      b.addPort(inB);
      expect(canConnectPorts(outA, inB, a, b, engine, diagram)).toBe(true);
    });

    test('rejects a non-connectable node', () => {
      const a = addNode(0, 0);
      const b = addNode(300, 0);
      b.behavior.connectable = false;
      expect(
        canConnectPorts(
          a.getPortBySide('right')!,
          b.getPortBySide('left')!,
          a,
          b,
          engine,
          diagram
        )
      ).toBe(false);
    });
  });

  describe('siblingBoxes', () => {
    test('returns world boxes of every node except the excluded ones', () => {
      const a = addNode(0, 0, 100, 50);
      addNode(200, 100, 40, 20);

      expect(snap.siblingBoxes(engine)).toHaveLength(2);
      const rest = snap.siblingBoxes(engine, [a.id]);
      expect(rest).toEqual([{ x: 200, y: 100, width: 40, height: 20 }]);
    });
  });
});
