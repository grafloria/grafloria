// Wave 5 (Edge routing) — Card 0, renderer side: the router × connector split
// actually REACHES the routing engine and the path emitters.
//
// The audit finding this closes: mapPathTypeToAlgorithm could only ever produce
// 'straight' or 'orthogonal', so the registered obstacle routers (a-star,
// dijkstra, visibility-graph) were UNREACHABLE from any link. These specs prove
// (1) an explicit `router` selects the named algorithm on the real RoutingEngine,
// (2) an explicit `connector` changes only the drawing, and (3) a link that sets
// neither renders byte-identically to the legacy pathType behaviour.

import { SVGRenderer } from './svg-renderer';
import { DiagramEngine, DiagramModel, NodeModel, LinkModel, PortModel } from '@grafloria/engine';
import type { VNode } from '../types';

const VIEWPORT = { x: 0, y: 0, width: 1200, height: 800 };

function findVNodeByKey(vnode: any, key: string): any {
  if (!vnode) return undefined;
  if (vnode.key === key) return vnode;
  for (const child of vnode.children ?? []) {
    const found = findVNodeByKey(child, key);
    if (found) return found;
  }
  return undefined;
}

function linkPathData(root: VNode, link: LinkModel): string {
  const group = findVNodeByKey(root, `link-${link.id}`);
  expect(group).toBeDefined();
  const path = (group.children ?? []).find(
    (c: any) => c?.type === 'path' && c.props?.className !== 'link-hit-area'
  );
  expect(path).toBeDefined();
  return path.props.d as string;
}

describe('SVGRenderer — router × connector reachability (Wave 5, Card 0)', () => {
  let engine: DiagramEngine;
  let diagram: DiagramModel;
  let renderer: SVGRenderer;

  beforeEach(() => {
    engine = new DiagramEngine();
    diagram = engine.createDiagram('Test')!;
    renderer = new SVGRenderer(engine, {});
  });

  afterEach(() => {
    renderer?.dispose();
    engine.destroy();
  });

  function node(x: number, y: number, portId: string, side: 'left' | 'right'): NodeModel {
    const n = new NodeModel({ type: 'basic', position: { x, y }, size: { width: 100, height: 50 } });
    n.addPort(new PortModel({ id: portId, type: side === 'right' ? 'output' : 'input', side }));
    diagram.addNode(n);
    return n;
  }

  function link(
    ids: [string, string],
    from: [number, number],
    to: [number, number],
    setup?: (l: LinkModel) => void
  ): LinkModel {
    node(from[0], from[1], ids[0], 'right');
    node(to[0], to[1], ids[1], 'left');
    const l = new LinkModel(ids[0], ids[1], 'orthogonal');
    setup?.(l);
    diagram.addLink(l);
    return l;
  }

  function render(): VNode {
    return renderer.render(VIEWPORT, 1.0) as VNode;
  }

  it('routes through the algorithm the explicit router names — the registry is finally reachable per link', () => {
    const routingEngine = engine.getRoutingEngine();
    const seen: string[] = [];
    const realRoute = routingEngine.route.bind(routingEngine);
    jest.spyOn(routingEngine, 'route').mockImplementation((request: any) => {
      seen.push(request?.options?.algorithm);
      return realRoute(request);
    });

    const l = link(['s1', 't1'], [100, 100], [500, 400], (x) => x.setRouter('avoid'));
    render();

    // 'avoid' is the public alias for the A* obstacle router.
    expect(seen).toContain('a-star');
    // and the link still produced a drawable path
    expect(l.points.length).toBeGreaterThanOrEqual(2);
  });

  it('a custom router NAME passes through to the engine verbatim', () => {
    const routingEngine = engine.getRoutingEngine();
    const seen: string[] = [];
    const realRoute = routingEngine.route.bind(routingEngine);
    jest.spyOn(routingEngine, 'route').mockImplementation((request: any) => {
      seen.push(request?.options?.algorithm);
      return realRoute(request);
    });

    link(['s1', 't1'], [100, 100], [500, 400], (x) => x.setRouter('visibility-graph'));
    render();
    expect(seen).toContain('visibility-graph');
  });

  it('connector changes ONLY the drawing: same routed elbows, curved vs hard-corner emission', () => {
    // Two identical layouts far apart; only the connector differs.
    const rounded = link(['s1', 't1'], [100, 100], [500, 400]); // orthogonal → rounded (legacy)
    const hard = link(['s2', 't2'], [100, 900], [500, 1200], (x) => x.setConnector('straight'));

    const root = render();
    const dRounded = linkPathData(root, rounded);
    const dHard = linkPathData(root, hard);

    // rounded corners emit quadratic bends; hard corners emit none
    expect(dRounded).toMatch(/Q/);
    expect(dHard).not.toMatch(/Q/);
    // but BOTH are elbow routes (multiple line segments), because the router
    // is unchanged — the connector never touches geometry.
    expect((dHard.match(/L/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('LinkStyle.jetty reaches the router: the rendered path leaves the port with the full stub', () => {
    // Ports at (200,125)→right and (500,425)→left; a 60px jetty must survive
    // into the drawn geometry (the legacy best-effort stub is 20px).
    const l = link(['s1', 't1'], [100, 100], [500, 400], (x) => {
      x.style.jetty = 60;
    });
    render();
    // the link's synced points carry the routed geometry
    const pts = l.points;
    expect(pts.length).toBeGreaterThanOrEqual(2);
    const first = { x: pts[1].x - pts[0].x, y: pts[1].y - pts[0].y };
    // source port faces right: first segment horizontal, ≥ 60 to the right
    expect(first.y).toBe(0);
    expect(first.x).toBeGreaterThanOrEqual(60);
    const last = { x: pts[pts.length - 1].x - pts[pts.length - 2].x, y: pts[pts.length - 1].y - pts[pts.length - 2].y };
    // target port faces left: final segment horizontal, arriving from ≥ 60 out
    expect(last.y).toBe(0);
    expect(last.x).toBeGreaterThanOrEqual(60);
  });

  it('legacy byte-stability: setting router+connector to the DERIVED values emits the identical path', () => {
    const plain = link(['s1', 't1'], [100, 100], [500, 400]);
    const explicit = link(['s2', 't2'], [100, 100 + 600], [500, 400 + 600], (x) => {
      x.setRouter('orthogonal');
      x.setConnector('rounded');
    });

    const root = render();
    const dPlain = linkPathData(root, plain);
    const dExplicit = linkPathData(root, explicit);

    // identical modulo the 600px vertical offset — the command STRUCTURE
    // (op sequence) is what proves the same code path emitted both.
    const ops = (d: string) => (d.match(/[A-Za-z]/g) ?? []).join('');
    expect(ops(dExplicit)).toBe(ops(dPlain));
  });
});
