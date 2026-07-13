// Wave 7 — Card 7b: auto-algorithm selection.
//
// The two properties that keep an auto-selector from becoming a support ticket:
// it must be DETERMINISTIC (same graph => same choice, every reload), and it must
// SHOW ITS WORKING (what it chose, what it beat, and by which measure).

import { DiagramEngine } from '../engine/DiagramEngine';
import { DiagramModel } from '../models/DiagramModel';
import { NodeModel } from '../models/NodeModel';
import { LinkModel } from '../models/LinkModel';
import { PortModel } from '../models/PortModel';
import { analyseGraphShape, AUTO_LAYOUT_NAME } from './layout-auto-select';
import { assessPortRespect, assessLabelClearance, countBends } from './layout-quality-extended';

function makeNode(id: string, w = 100, h = 60): NodeModel {
  const node = new NodeModel({ id, type: 'default', position: { x: 0, y: 0 } });
  node.setSize(w, h);
  return node;
}

function connect(diagram: DiagramModel, id: string, from: NodeModel, to: NodeModel): LinkModel {
  const link = new LinkModel(`${id}-sp`, `${id}-tp`);
  (link as any).id = id;
  link.sourceNodeId = from.id;
  link.targetNodeId = to.id;
  diagram.addLink(link);
  return link;
}

/** A small tree: a -> b, a -> c, b -> d. */
function treeDiagram(): { diagram: DiagramModel; nodes: NodeModel[] } {
  const diagram = new DiagramModel();
  const nodes = ['a', 'b', 'c', 'd'].map((id) => makeNode(id));
  nodes.forEach((n) => diagram.addNode(n));
  connect(diagram, 'l1', nodes[0], nodes[1]);
  connect(diagram, 'l2', nodes[0], nodes[2]);
  connect(diagram, 'l3', nodes[1], nodes[3]);
  return { diagram, nodes };
}

describe('graph shape analysis', () => {
  it('recognises a tree', () => {
    const { diagram, nodes } = treeDiagram();
    const shape = analyseGraphShape(nodes, diagram.getLinks());

    expect(shape.isTree).toBe(true);
    expect(shape.isDAG).toBe(true);
    expect(shape.components).toBe(1);
    expect(shape.nodeCount).toBe(4);
  });

  it('recognises a cycle as neither tree nor DAG', () => {
    const diagram = new DiagramModel();
    const nodes = ['a', 'b', 'c'].map((id) => makeNode(id));
    nodes.forEach((n) => diagram.addNode(n));
    connect(diagram, 'l1', nodes[0], nodes[1]);
    connect(diagram, 'l2', nodes[1], nodes[2]);
    connect(diagram, 'l3', nodes[2], nodes[0]);

    const shape = analyseGraphShape(nodes, diagram.getLinks());

    expect(shape.isDAG).toBe(false);
    expect(shape.isTree).toBe(false);
  });

  it('counts disconnected components', () => {
    const diagram = new DiagramModel();
    const nodes = ['a', 'b', 'c', 'd'].map((id) => makeNode(id));
    nodes.forEach((n) => diagram.addNode(n));
    connect(diagram, 'l1', nodes[0], nodes[1]);
    connect(diagram, 'l2', nodes[2], nodes[3]);

    expect(analyseGraphShape(nodes, diagram.getLinks()).components).toBe(2);
  });

  it('notices declared ports and edge labels', () => {
    const { diagram, nodes } = treeDiagram();
    expect(analyseGraphShape(nodes, diagram.getLinks()).hasDeclaredPorts).toBe(false);
    expect(analyseGraphShape(nodes, diagram.getLinks()).hasEdgeLabels).toBe(false);

    const port = new PortModel({ id: 'p', type: 'output', side: 'right' });
    port.nodeId = nodes[0].id;
    nodes[0].addPort(port);
    diagram.getLinks()[0].addLabel({ text: 'yes', position: 0.5 });

    const shape = analyseGraphShape(nodes, diagram.getLinks());
    expect(shape.hasDeclaredPorts).toBe(true);
    expect(shape.hasEdgeLabels).toBe(true);
  });
});

describe('engine.layout() — auto-selection', () => {
  let engine: DiagramEngine;

  beforeEach(() => {
    engine = new DiagramEngine();
  });

  it('is registered under a name, composing with Card 0\'s registry', () => {
    expect(engine.getLayoutRegistry().has(AUTO_LAYOUT_NAME)).toBe(true);
    // ...and did not fork a second entry point: it sits alongside the built-ins.
    expect(engine.getLayoutRegistry().names()).toEqual(
      expect.arrayContaining(['auto', 'dagre', 'elk', 'force'])
    );
  });

  it('runs with NO algorithm name and reports what it chose', async () => {
    const { diagram } = treeDiagram();
    engine.setDiagram(diagram);

    const result = await engine.layout(); // zero-config: the whole point

    expect(result.selection).toBeDefined();
    expect(result.selection!.chosen).toBeTruthy();
    expect(result.selection!.algorithm).toBeTruthy();
    // Every node actually moved into place.
    expect(result.nodePositions.size).toBe(4);
  });

  it('SHOWS ITS WORKING: every candidate, scored, best first', async () => {
    const { diagram } = treeDiagram();
    engine.setDiagram(diagram);

    const { selection } = await engine.layout();

    expect(selection!.candidates.length).toBeGreaterThan(1);

    // Sorted best-first, and each carries the numbers behind its verdict.
    const scores = selection!.candidates.map((c) => c.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);

    for (const candidate of selection!.candidates) {
      expect(candidate).toMatchObject({
        id: expect.any(String),
        score: expect.any(Number),
        portRespect: expect.any(Number),
        labelClearance: expect.any(Number),
        area: expect.any(Number),
      });
      expect(candidate.quality.metrics.edgeCrossings).toBeDefined();
    }

    // The winner is the top-scored candidate, and the reason names a real measure.
    expect(selection!.chosen).toBe(selection!.candidates[0].id);
    expect(selection!.reason).toMatch(/score/i);
  });

  it('is DETERMINISTIC: the same graph chooses the same algorithm every time', async () => {
    const runs = await Promise.all(
      [0, 1, 2].map(async () => {
        const localEngine = new DiagramEngine();
        const { diagram } = treeDiagram();
        localEngine.setDiagram(diagram);
        const result = await localEngine.layout();
        return {
          chosen: result.selection!.chosen,
          positions: [...result.nodePositions.entries()],
        };
      })
    );

    expect(runs[1].chosen).toBe(runs[0].chosen);
    expect(runs[2].chosen).toBe(runs[0].chosen);
    // ...and byte-identical coordinates, not merely the same algorithm.
    expect(runs[1].positions).toEqual(runs[0].positions);
    expect(runs[2].positions).toEqual(runs[0].positions);
  });

  it('is IDEMPOTENT: laying out twice changes nothing the second time', async () => {
    const { diagram } = treeDiagram();
    engine.setDiagram(diagram);

    const first = await engine.layout();
    const second = await engine.layout();

    expect([...second.nodePositions.entries()]).toEqual([...first.nodePositions.entries()]);
    expect(second.selection!.chosen).toBe(first.selection!.chosen);
  });

  it('commits positions through setPosition, so the model really moved', async () => {
    const { diagram } = treeDiagram();
    engine.setDiagram(diagram);

    const result = await engine.layout();

    for (const [id, position] of result.nodePositions) {
      const node = diagram.getNode(id)!;
      expect(node.position.x).toBeCloseTo(position.x);
      expect(node.position.y).toBeCloseTo(position.y);
    }
  });

  it('leaves the model on the WINNER, not on the last candidate it tried', async () => {
    // The selector has to apply each candidate to measure it (crossings are a
    // property of a drawn graph). If it forgot to re-apply the winner, the model
    // would silently end up wearing whichever layout ran last.
    const { diagram } = treeDiagram();
    engine.setDiagram(diagram);

    const result = await engine.layout();
    const winnerPositions = result.nodePositions;

    for (const [id, position] of winnerPositions) {
      expect(diagram.getNode(id)!.position.x).toBeCloseTo(position.x);
    }
  });

  it('prefers a port-aware engine when the graph declares ports', async () => {
    // The moat, as a test. A chain of nodes whose authored ports say "flow right"
    // should be laid out by an engine that can honour that.
    const diagram = new DiagramModel();
    const nodes = ['a', 'b', 'c'].map((id) => makeNode(id));
    nodes.forEach((node, i) => {
      diagram.addNode(node);
      const out = new PortModel({ id: `${node.id}-out`, type: 'output', side: 'right' });
      out.nodeId = node.id;
      node.addPort(out);
      const inp = new PortModel({ id: `${node.id}-in`, type: 'input', side: 'left' });
      inp.nodeId = node.id;
      node.addPort(inp);
    });

    const l1 = connect(diagram, 'l1', nodes[0], nodes[1]);
    l1.sourcePortId = 'a-out';
    l1.targetPortId = 'b-in';
    const l2 = connect(diagram, 'l2', nodes[1], nodes[2]);
    l2.sourcePortId = 'b-out';
    l2.targetPortId = 'c-in';

    engine.setDiagram(diagram);
    const { selection } = await engine.layout();

    // Whatever wins must not violate the authored port sides.
    expect(selection!.candidates[0].portRespect).toBe(100);
    expect(selection!.shape.hasDeclaredPorts).toBe(true);

    // And the chosen layout really does flow left-to-right.
    expect(nodes[1].position.x).toBeGreaterThan(nodes[0].position.x);
    expect(nodes[2].position.x).toBeGreaterThan(nodes[1].position.x);
  });
});

describe('port/label quality metrics', () => {
  it('scores a backwards edge as a port violation', () => {
    // `a` emits from its RIGHT port, but `b` sits to its LEFT: the edge has to
    // double back around the node. No generic metric notices this; this one does.
    const a = makeNode('a');
    const b = makeNode('b');
    a.setPosition(500, 0);
    b.setPosition(0, 0);

    const out = new PortModel({ id: 'a-out', type: 'output', side: 'right' });
    out.nodeId = 'a';
    a.addPort(out);

    const link = new LinkModel('a-out', 'b-in');
    (link as any).id = 'l1';
    link.sourceNodeId = 'a';
    link.targetNodeId = 'b';

    const result = assessPortRespect([a, b], [link]);

    expect(result.violations).toBe(1);
    expect(result.score).toBe(0);
    expect(result.violatingLinks).toEqual(['l1']);
  });

  it('scores a forwards edge as respecting its port', () => {
    const a = makeNode('a');
    const b = makeNode('b');
    a.setPosition(0, 0);
    b.setPosition(500, 0);

    const out = new PortModel({ id: 'a-out', type: 'output', side: 'right' });
    out.nodeId = 'a';
    a.addPort(out);

    const link = new LinkModel('a-out', 'b-in');
    (link as any).id = 'l1';
    link.sourceNodeId = 'a';
    link.targetNodeId = 'b';

    expect(assessPortRespect([a, b], [link]).score).toBe(100);
  });

  it('a graph with no declared ports is vacuously perfect', () => {
    const a = makeNode('a');
    const b = makeNode('b');
    const link = new LinkModel('x', 'y');
    link.sourceNodeId = 'a';
    link.targetNodeId = 'b';

    expect(assessPortRespect([a, b], [link]).score).toBe(100);
    expect(assessPortRespect([a, b], [link]).judged).toBe(0);
  });

  it('catches a label that would land on a node', () => {
    // Two nodes almost touching: the midpoint of the edge is INSIDE the gap, and a
    // wide label there covers a node. A layout that does this is worse than one
    // that leaves room, and the selector must be able to tell.
    const a = makeNode('a', 100, 60);
    const b = makeNode('b', 100, 60);
    a.setPosition(0, 0);
    b.setPosition(110, 0); // 10px gap — nowhere for a label to go

    const link = new LinkModel('x', 'y');
    (link as any).id = 'l1';
    link.sourceNodeId = 'a';
    link.targetNodeId = 'b';
    link.addLabel({ text: 'a very wide edge label', position: 0.5 });

    const result = assessLabelClearance([a, b], [link], {
      nodePositions: new Map(),
      bounds: { x: 0, y: 0, width: 210, height: 60 },
    });

    expect(result.overlaps).toBe(1);
    expect(result.score).toBe(0);
  });

  it('an unlabelled graph is vacuously perfect', () => {
    const a = makeNode('a');
    const b = makeNode('b');
    const link = new LinkModel('x', 'y');
    link.sourceNodeId = 'a';
    link.targetNodeId = 'b';

    const result = assessLabelClearance([a, b], [link], {
      nodePositions: new Map(),
      bounds: { x: 0, y: 0, width: 100, height: 100 },
    });

    expect(result.score).toBe(100);
    expect(result.judged).toBe(0);
  });

  it('measures a label at the path MIDPOINT, not at the route\'s end', () => {
    // THE BUG (found by driving a real graph, not by a unit test): the midpoint was
    // taken as points[floor(n/2)] — an array index. A straight route has two
    // points, so that selected points[1]: the route's END, sitting on the target
    // node's border. A label centred there always "collides", so every clean,
    // bend-free edge was scored as a label collision — systematically punishing the
    // engines that route best, and biasing auto-selection AGAINST ELK, the very
    // port-aware engine this card exists to favour.
    //
    // Here: two nodes far apart, a straight route between them, and a small label.
    // Half-way along that route is empty space. There is no collision.
    const a = makeNode('a', 100, 60);
    const b = makeNode('b', 100, 60);
    a.setPosition(0, 0);
    b.setPosition(600, 0); // 500px of clear air between them

    const link = new LinkModel('x', 'y');
    (link as any).id = 'l1';
    link.sourceNodeId = 'a';
    link.targetNodeId = 'b';
    link.addLabel({ text: 'ok', position: 0.5 });

    const result = assessLabelClearance([a, b], [link], {
      nodePositions: new Map(),
      bounds: { x: 0, y: 0, width: 700, height: 60 },
      routing: {
        portPositions: new Map(),
        // A straight, bend-free route: node A's right edge to node B's left edge.
        edgeRoutes: new Map([
          ['l1', { start: { x: 100, y: 30 }, end: { x: 600, y: 30 }, bends: [] }],
        ]),
        labelSpace: new Map(),
        orthogonal: true,
      },
    });

    expect(result.judged).toBe(1);
    expect(result.overlaps).toBe(0); // was 1: the label was measured ON node b
    expect(result.score).toBe(100);
  });

  it('reports bends as ABSENT, not zero, when the engine gave no routes', () => {
    // A silent engine must not score a perfect 0 bends — that would let saying
    // nothing beat a measured result.
    expect(
      countBends({ nodePositions: new Map(), bounds: { x: 0, y: 0, width: 0, height: 0 } })
    ).toBeUndefined();
  });
});
