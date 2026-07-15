// CompoundLayoutService.spec.ts — Wave-5 Card 5: per-group recursive layout.
//
// Bottom-up (deepest first) orchestration over the GroupModel containment tree,
// calling layout adapters as BLACK BOXES, honoring padding + fixed groups, and
// treating each laid-out group as a single unit at the parent level. Also
// documents that the dead SubgraphLayoutManager path is now bridged.

import { DiagramModel } from '../models/DiagramModel';
import { GroupModel } from '../models/GroupModel';
import { NodeModel } from '../models/NodeModel';
import { LinkModel } from '../models/LinkModel';
import { CompoundLayoutService } from './CompoundLayoutService';
import type { LayoutAdapter, LayoutResult } from './layout-adapter.interface';
import { DagreLayoutAdapter } from './dagre-layout-adapter';

function node(id: string, x = 0, y = 0, w = 40, h = 40): NodeModel {
  return new NodeModel({ id, type: 'default', position: { x, y }, size: { width: w, height: h } });
}

/** A spy adapter that records the ids it was asked to lay out, then grids them. */
function spyAdapter(calls: string[][]): LayoutAdapter {
  return {
    name: 'spy',
    async apply(nodes): Promise<LayoutResult> {
      calls.push(nodes.map((n) => n.id));
      const positions = new Map<string, { x: number; y: number }>();
      nodes.forEach((n, i) => positions.set(n.id, { x: i * 200, y: 0 }));
      return {
        nodePositions: positions,
        bounds: { x: 0, y: 0, width: nodes.length * 200, height: 100 },
      };
    },
    async applyIncremental() {
      throw new Error('not used');
    },
    validateOptions() {
      return true;
    },
  };
}

describe('CompoundLayoutService (Wave-5 Card 5)', () => {
  it('lays out a single group\'s members with the built-in grid + padding', async () => {
    const diagram = new DiagramModel();
    const g = new GroupModel({ id: 'g', name: 'G' });
    diagram.addGroup(g);
    g.padding = 10;
    g.headerHeight = 0; // subject: the grid arithmetic, not the title band
    [node('a'), node('b'), node('c'), node('d')].forEach((n) => {
      diagram.addNode(n);
      g.addMember(n.id, diagram);
    });

    const res = await new CompoundLayoutService(diagram, { gridGap: 20 }).layout();

    expect(res.laidOut).toContain('g');
    // 4 nodes → 2x2 grid of 40px cells + 20 gap → content 100x100, +10 padding
    const b = g.getOuterBounds();
    expect(b.width).toBe(120);
    expect(b.height).toBe(120);
    // members don't overlap
    const positions = ['a', 'b', 'c', 'd'].map((id) => diagram.getNode(id)!.position);
    const uniq = new Set(positions.map((p) => `${p.x},${p.y}`));
    expect(uniq.size).toBe(4);
  });

  it('processes deepest groups first (bottom-up) and treats a child as one unit', async () => {
    const diagram = new DiagramModel();
    const parent = new GroupModel({ id: 'parent', name: 'P' });
    const child = new GroupModel({ id: 'child', name: 'C' });
    diagram.addGroup(parent);
    diagram.addGroup(child);

    const p1 = node('p1');
    const c1 = node('c1');
    const c2 = node('c2');
    [p1, c1, c2].forEach((n) => diagram.addNode(n));

    child.addMember('c1', diagram);
    child.addMember('c2', diagram);
    parent.addMember('p1', diagram);
    parent.addMember('child', diagram);

    const calls: string[][] = [];
    const adapter = spyAdapter(calls);

    const res = await new CompoundLayoutService(diagram, {
      defaultAlgorithm: 'dagre',
      adapters: { dagre: adapter },
    }).layout();

    // child laid out before parent
    expect(res.laidOut.indexOf('child')).toBeLessThan(res.laidOut.indexOf('parent'));
    // the parent-level call saw the child as a SINGLE unit ('child'), not c1/c2
    const parentCall = calls.find((c) => c.includes('child'));
    expect(parentCall).toBeDefined();
    expect(parentCall).toContain('p1');
    expect(parentCall).toContain('child');
    expect(parentCall).not.toContain('c1');

    // child's members stayed together (moved as a subtree)
    const c1p = diagram.getNode('c1')!.position;
    const c2p = diagram.getNode('c2')!.position;
    expect(Math.abs(c1p.y - c2p.y)).toBeLessThan(1000); // still coherent, not scattered
  });

  it('honors fixed groups: not moved and not internally laid out', async () => {
    const diagram = new DiagramModel();
    const g = new GroupModel({ id: 'g', name: 'G' });
    diagram.addGroup(g);
    g.subgraphLayout = { fixed: true };
    const a = node('a', 500, 500);
    const b = node('b', 560, 500);
    [a, b].forEach((n) => diagram.addNode(n));
    g.addMember('a', diagram);
    g.addMember('b', diagram);

    const res = await new CompoundLayoutService(diagram).layout();
    expect(res.skipped).toContain('g');
    // positions untouched
    expect(a.position).toEqual({ x: 500, y: 500, z: undefined });
    expect(b.position).toEqual({ x: 560, y: 500, z: undefined });
  });

  it('calls the adapter as a black box with the group\'s internal links', async () => {
    const diagram = new DiagramModel();
    const g = new GroupModel({ id: 'g', name: 'G' });
    diagram.addGroup(g);
    const a = node('a');
    const b = node('b');
    [a, b].forEach((n) => diagram.addNode(n));
    g.addMember('a', diagram);
    g.addMember('b', diagram);
    // internal link a→b
    const link = new LinkModel(a.getPortBySide('right')!.id, b.getPortBySide('left')!.id);
    diagram.addLink(link);

    let sawLink = false;
    const adapter: LayoutAdapter = {
      name: 'spy',
      async apply(nodes, links): Promise<LayoutResult> {
        sawLink = links.some((l) => l.sourceNodeId === 'a' && l.targetNodeId === 'b');
        const positions = new Map(nodes.map((n, i) => [n.id, { x: i * 100, y: 0 }]));
        return { nodePositions: positions, bounds: { x: 0, y: 0, width: 200, height: 50 } };
      },
      async applyIncremental() {
        throw new Error('nope');
      },
      validateOptions() {
        return true;
      },
    };

    await new CompoundLayoutService(diagram, {
      defaultAlgorithm: 'dagre',
      adapters: { dagre: adapter },
    }).layout();

    expect(sawLink).toBe(true);
  });

  it('resolves \'inherit\' to the nearest ancestor\'s explicit algorithm', async () => {
    const diagram = new DiagramModel();
    const parent = new GroupModel({ id: 'parent', name: 'P' });
    const child = new GroupModel({ id: 'child', name: 'C' });
    diagram.addGroup(parent);
    diagram.addGroup(child);
    parent.subgraphLayout = { algorithm: 'elk' };
    child.subgraphLayout = { algorithm: 'inherit' };
    const c1 = node('c1');
    diagram.addNode(c1);
    child.addMember('c1', diagram);
    parent.addMember('child', diagram);

    const elkCalls: string[][] = [];
    await new CompoundLayoutService(diagram, {
      adapters: { elk: spyAdapter(elkCalls) },
    }).layout();

    // child (inherit → elk) drove the elk adapter for its own content
    expect(elkCalls.some((c) => c.includes('c1'))).toBe(true);
  });

  it('falls back to grid when a requested adapter is not wired', async () => {
    const diagram = new DiagramModel();
    const g = new GroupModel({ id: 'g', name: 'G' });
    diagram.addGroup(g);
    g.subgraphLayout = { algorithm: 'dagre' }; // dagre requested but not injected
    [node('a'), node('b')].forEach((n) => {
      diagram.addNode(n);
      g.addMember(n.id, diagram);
    });

    const res = await new CompoundLayoutService(diagram).layout(); // no adapters
    expect(res.laidOut).toContain('g');
    // grid placed them without overlap
    const pa = diagram.getNode('a')!.position;
    const pb = diagram.getNode('b')!.position;
    expect(pa.x !== pb.x || pa.y !== pb.y).toBe(true);
  });

  it('drives the REAL dagre adapter as a black box (integration)', async () => {
    const diagram = new DiagramModel();
    const g = new GroupModel({ id: 'g', name: 'G' });
    diagram.addGroup(g);
    g.subgraphLayout = { algorithm: 'dagre' };
    const a = node('a');
    const b = node('b');
    const c = node('c');
    [a, b, c].forEach((n) => diagram.addNode(n));
    [a.id, b.id, c.id].forEach((id) => g.addMember(id, diagram));
    // a→b→c chain so dagre ranks them.
    diagram.addLink(new LinkModel(a.getPortBySide('right')!.id, b.getPortBySide('left')!.id));
    diagram.addLink(new LinkModel(b.getPortBySide('right')!.id, c.getPortBySide('left')!.id));

    const res = await new CompoundLayoutService(diagram, {
      adapters: { dagre: new DagreLayoutAdapter() },
    }).layout();

    expect(res.laidOut).toContain('g');
    // dagre separated the three chained nodes (no two share a position).
    const positions = [a, b, c].map((n) => `${Math.round(n.position.x)},${Math.round(n.position.y)}`);
    expect(new Set(positions).size).toBe(3);
    // group fitted around them
    expect(g.getOuterBounds().width).toBeGreaterThan(0);
  });

  it('round-trips the per-group subgraphLayout config', () => {
    const g = new GroupModel({ id: 'g', name: 'G' });
    g.subgraphLayout = { algorithm: 'elk', fixed: true, layoutOptions: { rankdir: 'LR' } };
    const restored = GroupModel.fromJSON(g.serialize());
    expect(restored.subgraphLayout).toEqual({
      algorithm: 'elk',
      fixed: true,
      layoutOptions: { rankdir: 'LR' },
    });
  });
});
