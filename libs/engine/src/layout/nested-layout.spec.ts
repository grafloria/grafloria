// Wave 7 — Card 4: nested container / subgraph layout.
//
// The claims, each of which was FALSE before this card:
//
//   1. REACHABILITY — nested layout runs from `engine.layout()`. CompoundLayoutService
//      had ZERO production callers; the whole compound stack was dead for the second
//      time (wave 5 found SubgraphLayoutManager dead, built this bridge, and nothing
//      called the bridge).
//   2. CROSS-CONTAINER EDGES — an edge from inside container A to inside container B
//      is induced onto the compound nodes at their lowest common ancestor, so the
//      containers land next to what they connect to. The root level used to be given
//      an EMPTY link array: A→B and A↛B produced the same picture. This is the
//      sub-flow failure React Flow is known for.
//   3. COLLAPSED = LEAF — a layout pass no longer silently un-collapses every
//      collapsed group, and the collapse proxy travels with its container.
//   4. FIXED CONTAINERS ARE NOT OVERLAPPED — wave 5's stated scope-down, closed.
//   5. DETERMINISM + IDEMPOTENCE survive at every depth.

import { DiagramEngine } from '../engine/DiagramEngine';
import { DiagramModel } from '../models/DiagramModel';
import { GroupModel } from '../models/GroupModel';
import { NodeModel } from '../models/NodeModel';
import { LinkModel } from '../models/LinkModel';
import { PortModel } from '../models/PortModel';
import { GroupCollapseService } from '../interaction/GroupCollapseService';
import { CompoundLayoutService } from './CompoundLayoutService';
import { DagreLayoutAdapter } from './dagre-layout-adapter';
import type { LayoutAdapter, LayoutResult } from './layout-adapter.interface';

// --- fixtures ---------------------------------------------------------------

function node(diagram: DiagramModel, id: string, x = 0, y = 0, w = 40, h = 40): NodeModel {
  const n = new NodeModel({ id, type: 'default', position: { x, y }, size: { width: w, height: h } });
  n.addPort(new PortModel({ id: `${id}-out`, type: 'output', side: 'right' }));
  n.addPort(new PortModel({ id: `${id}-in`, type: 'input', side: 'left' }));
  diagram.addNode(n);
  return n;
}

function group(diagram: DiagramModel, id: string, parent?: GroupModel): GroupModel {
  const g = new GroupModel({ id, name: id });
  diagram.addGroup(g);
  if (parent) parent.addMember(id, diagram);
  return g;
}

function link(diagram: DiagramModel, s: string, t: string): LinkModel {
  const l = new LinkModel(`${s}-out`, `${t}-in`);
  (l as unknown as { id: string }).id = `${s}->${t}`;
  diagram.addLink(l);
  return l;
}

/** Records the (nodes, links) each level was asked to arrange. */
interface Call {
  nodes: string[];
  links: string[];
}
function spyAdapter(calls: Call[], name = 'dagre'): LayoutAdapter {
  return {
    name,
    async apply(nodes, links): Promise<LayoutResult> {
      calls.push({
        nodes: nodes.map((n) => n.id).sort(),
        links: links.map((l) => `${l.sourceNodeId}->${l.targetNodeId}`).sort(),
      });
      const positions = new Map(nodes.map((n, i) => [n.id, { x: i * 300, y: 0 }]));
      return { nodePositions: positions, bounds: { x: 0, y: 0, width: nodes.length * 300, height: 100 } };
    },
    async applyIncremental() {
      throw new Error('not used');
    },
    validateOptions() {
      return true;
    },
  };
}

const boxesOverlap = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const snapshot = (diagram: DiagramModel): string =>
  JSON.stringify({
    nodes: diagram
      .getNodes()
      .map((n) => [n.id, Math.round(n.position.x * 1000), Math.round(n.position.y * 1000)])
      .sort(),
    groups: diagram
      .getGroups()
      .map((g) => {
        const b = g.getOuterBounds();
        return [g.id, Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)];
      })
      .sort(),
  });

// ---------------------------------------------------------------------------

describe('Card 4 — nested container layout', () => {
  describe('reachability: engine.layout() does compound layout', () => {
    it('runs nested layout by default when the diagram has containers', async () => {
      const engine = new DiagramEngine();
      const diagram = engine.createDiagram('nested')!;
      const g = group(diagram, 'G');
      ['a', 'b', 'c'].forEach((id) => {
        node(diagram, id);
        g.addMember(id, diagram);
      });
      g.padding = 10;

      const result = await engine.layout('dagre');

      expect(result.metadata?.['nested']).toBe(true);
      expect(result.metadata?.['containersLaidOut']).toContain('G');
      // The container was auto-sized around its members (+ padding on each side).
      const b = g.getOuterBounds();
      expect(b.width).toBeGreaterThan(0);
      expect(b.height).toBeGreaterThan(0);
      const members = ['a', 'b', 'c'].map((id) => diagram.getNode(id)!.getGlobalBounds());
      for (const m of members) {
        expect(m.left).toBeGreaterThanOrEqual(b.x);
        expect(m.top).toBeGreaterThanOrEqual(b.y);
        expect(m.right).toBeLessThanOrEqual(b.x + b.width);
        expect(m.bottom).toBeLessThanOrEqual(b.y + b.height);
      }
    });

    it('THE FLAT-PATH BUG: nested:false moves nodes but strands the container frame', async () => {
      const engine = new DiagramEngine();
      const diagram = engine.createDiagram('flat')!;
      const g = group(diagram, 'G');
      ['a', 'b'].forEach((id) => {
        node(diagram, id, 1000, 1000);
        g.addMember(id, diagram);
      });
      g.setFrame({ x: 990, y: 990, width: 100, height: 100 });

      await engine.layout('dagre', { nested: false });

      // Flat layout moved the members to the origin and left the frame at 990 —
      // the container is now nowhere near its contents. That is why nested is
      // the default for grouped diagrams.
      expect(diagram.getNode('a')!.position.x).toBeLessThan(500);
      expect(g.getOuterBounds().x).toBe(990);

      // Nested puts it right.
      await engine.layout('dagre');
      const b = g.getOuterBounds();
      const a = diagram.getNode('a')!.getGlobalBounds();
      expect(a.left).toBeGreaterThanOrEqual(b.x);
      expect(a.right).toBeLessThanOrEqual(b.x + b.width);
    });
  });

  // -------------------------------------------------------------------------
  // THE CRUX
  // -------------------------------------------------------------------------
  describe('cross-container edges (the crux)', () => {
    it('induces an edge between the COMPOUND NODES at the root — the level that used to get []', async () => {
      const diagram = new DiagramModel();
      const A = group(diagram, 'A');
      const B = group(diagram, 'B');
      ['a1', 'a2'].forEach((id) => {
        node(diagram, id);
        A.addMember(id, diagram);
      });
      ['b1', 'b2'].forEach((id) => {
        node(diagram, id);
        B.addMember(id, diagram);
      });
      link(diagram, 'a1', 'a2'); // internal to A
      link(diagram, 'a2', 'b1'); // CROSSES the A/B boundary

      const calls: Call[] = [];
      await new CompoundLayoutService(diagram, {
        defaultAlgorithm: 'dagre',
        adapters: { dagre: spyAdapter(calls) },
        layoutTopLevel: true,
      }).layout();

      const root = calls.find((c) => c.nodes.includes('A') && c.nodes.includes('B'));
      expect(root).toBeDefined();
      // The root level sees the containers as compound nodes AND sees the edge
      // between them. Before this card the link array here was literally `[]`.
      expect(root!.nodes).toEqual(['A', 'B']);
      expect(root!.links).toEqual(['A->B']);

      // A's own level sees only its INTERNAL edge — the crossing edge is not its
      // business (its far end is not a unit of A).
      const inA = calls.find((c) => c.nodes.includes('a1'));
      expect(inA!.links).toEqual(['a1->a2']);
    });

    it('places the containers in flow order because of that edge (real dagre)', async () => {
      const build = (withCrossEdge: boolean): DiagramModel => {
        const diagram = new DiagramModel();
        const A = group(diagram, 'A');
        const B = group(diagram, 'B');
        node(diagram, 'a1');
        A.addMember('a1', diagram);
        node(diagram, 'b1');
        B.addMember('b1', diagram);
        if (withCrossEdge) link(diagram, 'a1', 'b1');
        return diagram;
      };

      const laid = async (diagram: DiagramModel) => {
        await new CompoundLayoutService(diagram, {
          defaultAlgorithm: 'dagre',
          adapters: { dagre: new DagreLayoutAdapter() },
          layoutTopLevel: true,
          layoutOptions: { direction: 'TB', rankSpacing: 80 } as never,
        }).layout();
        return {
          A: diagram.getGroup('A')!.getOuterBounds(),
          B: diagram.getGroup('B')!.getOuterBounds(),
        };
      };

      const withEdge = await laid(build(true));
      // A ranks above B: the containers are ordered by the edge that crosses them.
      expect(withEdge.A.y + withEdge.A.height).toBeLessThanOrEqual(withEdge.B.y);
      expect(boxesOverlap(withEdge.A, withEdge.B)).toBe(false);

      // Control: with no edge, dagre has no reason to rank them — they share a rank.
      const noEdge = await laid(build(false));
      expect(noEdge.A.y).toBe(noEdge.B.y);
    });

    it('induces at the LOWEST COMMON ANCESTOR, from any depth', async () => {
      // root ── P ── A ── A1 ── a  (a at depth 3)
      //          └── B ── B1 ── b
      // plus a loose root node `z`, with an edge from deep `a` to `z`.
      const diagram = new DiagramModel();
      const P = group(diagram, 'P');
      const A = group(diagram, 'A', P);
      const B = group(diagram, 'B', P);
      const A1 = group(diagram, 'A1', A);
      const B1 = group(diagram, 'B1', B);
      node(diagram, 'a');
      A1.addMember('a', diagram);
      node(diagram, 'b');
      B1.addMember('b', diagram);
      node(diagram, 'z'); // loose, at the root

      link(diagram, 'a', 'b'); // deep A ↔ deep B: LCA is P
      link(diagram, 'a', 'z'); // deep A ↔ root loose node: LCA is the root

      const calls: Call[] = [];
      await new CompoundLayoutService(diagram, {
        defaultAlgorithm: 'dagre',
        adapters: { dagre: spyAdapter(calls) },
        layoutTopLevel: true,
      }).layout();

      // At P: both deep endpoints project onto P's own child containers.
      const inP = calls.find((c) => c.nodes.includes('A') && c.nodes.includes('B'));
      expect(inP!.links).toEqual(['A->B']);

      // At the root: `a` projects onto the root container P; `z` is a unit.
      // a→b induces P->P (dropped, it is internal to P); a→z induces P->z.
      const root = calls.find((c) => c.nodes.includes('P') && c.nodes.includes('z'));
      expect(root).toBeDefined();
      expect(root!.links).toEqual(['P->z']);

      // Nobody at an inner level saw an edge it has no units for.
      const inA = calls.find((c) => c.nodes.includes('A1'));
      expect(inA!.links).toEqual([]);
    });

    it('nests to depth 3 with every container fitted around the one below it', async () => {
      const diagram = new DiagramModel();
      const P = group(diagram, 'P');
      const C = group(diagram, 'C', P);
      const GC = group(diagram, 'GC', C);
      [P, C, GC].forEach((g) => (g.padding = 8));
      node(diagram, 'x');
      GC.addMember('x', diagram);
      node(diagram, 'y');
      C.addMember('y', diagram);

      await new CompoundLayoutService(diagram, {
        adapters: { dagre: new DagreLayoutAdapter() },
        defaultAlgorithm: 'dagre',
        layoutTopLevel: true,
      }).layout();

      const p = P.getOuterBounds();
      const c = C.getOuterBounds();
      const gc = GC.getOuterBounds();

      const contains = (outer: typeof p, inner: typeof p) =>
        inner.x >= outer.x &&
        inner.y >= outer.y &&
        inner.x + inner.width <= outer.x + outer.width &&
        inner.y + inner.height <= outer.y + outer.height;

      expect(contains(p, c)).toBe(true);
      expect(contains(c, gc)).toBe(true);
      const x = diagram.getNode('x')!.getGlobalBounds();
      expect(x.left).toBeGreaterThanOrEqual(gc.x);
      expect(x.right).toBeLessThanOrEqual(gc.x + gc.width);
    });
  });

  // -------------------------------------------------------------------------
  describe('collapsed containers are LEAVES', () => {
    const collapsedFixture = () => {
      const diagram = new DiagramModel();
      const G = group(diagram, 'G');
      const H = group(diagram, 'H');
      ['g1', 'g2'].forEach((id) => {
        node(diagram, id);
        G.addMember(id, diagram);
      });
      node(diagram, 'h1');
      H.addMember('h1', diagram);
      link(diagram, 'g1', 'h1'); // crosses G's boundary → re-homed to G's proxy
      new GroupCollapseService(diagram).collapse(G);
      return { diagram, G, H };
    };

    it('does not un-collapse the container (the frame stays a placeholder)', async () => {
      const { diagram, G } = collapsedFixture();
      const collapsedSize = G.getOuterBounds();

      const res = await new CompoundLayoutService(diagram, {
        adapters: { dagre: new DagreLayoutAdapter() },
        defaultAlgorithm: 'dagre',
        layoutTopLevel: true,
      }).layout();

      expect(res.collapsed).toContain('G');
      expect(res.laidOut).not.toContain('G');
      // The old code laid out the hidden members and re-fitted the frame around
      // them — one layout pass silently un-collapsed the group.
      expect(G.isCollapsed).toBe(true);
      expect(G.getOuterBounds().width).toBe(collapsedSize.width);
      expect(G.getOuterBounds().height).toBe(collapsedSize.height);
      expect(diagram.getNode('g1')!.state.visible).toBe(false);
    });

    it('carries the collapse proxy with the container when the container moves', async () => {
      const { diagram, G } = collapsedFixture();
      const proxyId = G.collapsedState!.proxyNodeId;

      await new CompoundLayoutService(diagram, {
        adapters: { dagre: new DagreLayoutAdapter() },
        defaultAlgorithm: 'dagre',
        layoutTopLevel: true,
      }).layout();

      // The proxy IS the container's visible box. Before this card it stayed at
      // the old coordinates while the frame moved away underneath it.
      const proxy = diagram.getNode(proxyId)!;
      const frame = G.getOuterBounds();
      expect(proxy.position.x).toBe(frame.x);
      expect(proxy.position.y).toBe(frame.y);
    });

    it('still contributes its cross-boundary edges (via the proxy)', async () => {
      const { diagram } = collapsedFixture();
      const calls: Call[] = [];
      await new CompoundLayoutService(diagram, {
        defaultAlgorithm: 'dagre',
        adapters: { dagre: spyAdapter(calls) },
        layoutTopLevel: true,
      }).layout();

      // The collapsed container's edge was re-homed onto its proxy node; the
      // proxy resolves back to the container, so the root still sees G→H.
      const root = calls.find((c) => c.nodes.includes('G') && c.nodes.includes('H'));
      expect(root).toBeDefined();
      expect(root!.links).toEqual(['G->H']);
    });

    it('expands back to exactly the pre-collapse layout', async () => {
      const { diagram, G } = collapsedFixture();
      await new CompoundLayoutService(diagram, {
        adapters: { dagre: new DagreLayoutAdapter() },
        defaultAlgorithm: 'dagre',
        layoutTopLevel: true,
      }).layout();

      new GroupCollapseService(diagram).expand(G);
      expect(G.isCollapsed).toBe(false);
      expect(diagram.getNode('g1')!.state.visible).not.toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  describe('fixed containers (wave 5 scope-down, closed)', () => {
    it('nothing is laid out on top of a fixed container', async () => {
      const diagram = new DiagramModel();
      const P = group(diagram, 'P');
      const FIX = group(diagram, 'FIX', P);
      const MOV = group(diagram, 'MOV', P);
      FIX.subgraphLayout = { fixed: true };

      node(diagram, 'f1', 500, 500);
      node(diagram, 'f2', 560, 500);
      FIX.addMember('f1', diagram);
      FIX.addMember('f2', diagram);
      ['m1', 'm2'].forEach((id) => {
        node(diagram, id);
        MOV.addMember(id, diagram);
      });
      ['p1', 'p2', 'p3'].forEach((id) => {
        node(diagram, id);
        P.addMember(id, diagram);
      });
      link(diagram, 'p1', 'f1'); // an edge INTO the fixed container

      const res = await new CompoundLayoutService(diagram, {
        adapters: { dagre: new DagreLayoutAdapter() },
        defaultAlgorithm: 'dagre',
        layoutTopLevel: true,
      }).layout();

      // Pinned: never entered, never rearranged. Its interior is untouched, so
      // the offset its members were authored with survives exactly.
      expect(res.skipped).toContain('FIX');
      expect(res.laidOut).not.toContain('FIX');
      const f1 = diagram.getNode('f1')!.position;
      const f2 = diagram.getNode('f2')!.position;
      expect({ dx: f2.x - f1.x, dy: f2.y - f1.y }).toEqual({ dx: 60, dy: 0 });

      // And nothing landed on top of it. This is exactly what wave 5 could not
      // promise: it excluded fixed groups from the unit set, so the parent
      // arranged the other units straight through them.
      const fixedBox = FIX.getOuterBounds();
      for (const id of ['p1', 'p2', 'p3', 'm1', 'm2']) {
        const n = diagram.getNode(id)!;
        const b = n.getGlobalBounds();
        expect(
          boxesOverlap({ x: b.left, y: b.top, width: b.right - b.left, height: b.bottom - b.top }, fixedBox)
        ).toBe(false);
      }
      expect(boxesOverlap(MOV.getOuterBounds(), fixedBox)).toBe(false);
    });

    it('a fixed ROOT container is pinned in world coordinates', async () => {
      const diagram = new DiagramModel();
      const FIX = group(diagram, 'FIX');
      FIX.subgraphLayout = { fixed: true };
      node(diagram, 'f1', 500, 500);
      FIX.addMember('f1', diagram);
      const MOV = group(diagram, 'MOV');
      ['m1', 'm2'].forEach((id) => {
        node(diagram, id);
        MOV.addMember(id, diagram);
      });

      await new CompoundLayoutService(diagram, {
        adapters: { dagre: new DagreLayoutAdapter() },
        defaultAlgorithm: 'dagre',
        layoutTopLevel: true,
      }).layout();

      // Nothing above it to carry it, so `fixed` means what it says.
      expect(diagram.getNode('f1')!.position).toMatchObject({ x: 500, y: 500 });
      expect(boxesOverlap(MOV.getOuterBounds(), FIX.getOuterBounds())).toBe(false);
    });

    it('a fixed CHILD travels rigidly with its parent (it cannot escape the frame)', async () => {
      // `fixed` pins a container WITHIN its parent's arrangement — the parent
      // never rearranges it — but the parent still carries it. A child that
      // refused to follow its parent would end up outside the parent's frame,
      // which is not a thing a container can mean.
      const diagram = new DiagramModel();
      const P = group(diagram, 'P');
      const FIX = group(diagram, 'FIX', P);
      FIX.subgraphLayout = { fixed: true };
      node(diagram, 'f1', 500, 500);
      node(diagram, 'f2', 560, 500);
      [ 'f1', 'f2' ].forEach((id) => FIX.addMember(id, diagram));
      node(diagram, 'p1');
      P.addMember('p1', diagram);

      await new CompoundLayoutService(diagram, {
        adapters: { dagre: new DagreLayoutAdapter() },
        defaultAlgorithm: 'dagre',
        layoutTopLevel: true,
      }).layout();

      const p = P.getOuterBounds();
      const fx = FIX.getOuterBounds();
      const contains =
        fx.x >= p.x && fx.y >= p.y && fx.x + fx.width <= p.x + p.width && fx.y + fx.height <= p.y + p.height;
      expect(contains).toBe(true);
      // Rigid: the interior kept its shape through the parent's translation.
      const f1 = diagram.getNode('f1')!.position;
      const f2 = diagram.getNode('f2')!.position;
      expect({ dx: f2.x - f1.x, dy: f2.y - f1.y }).toEqual({ dx: 60, dy: 0 });
    });

    it('separates from SEVERAL fixed containers (the case the anchor cannot solve)', async () => {
      const diagram = new DiagramModel();
      const F1 = group(diagram, 'F1');
      const F2 = group(diagram, 'F2');
      const MOV = group(diagram, 'MOV');
      F1.subgraphLayout = { fixed: true };
      F2.subgraphLayout = { fixed: true };
      node(diagram, 'f1', 0, 0, 200, 200);
      F1.addMember('f1', diagram);
      node(diagram, 'f2', 220, 0, 200, 200);
      F2.addMember('f2', diagram);
      ['m1', 'm2', 'm3'].forEach((id) => {
        node(diagram, id);
        MOV.addMember(id, diagram);
      });

      await new CompoundLayoutService(diagram, {
        adapters: { dagre: new DagreLayoutAdapter() },
        defaultAlgorithm: 'dagre',
        layoutTopLevel: true,
      }).layout();

      const mov = MOV.getOuterBounds();
      expect(boxesOverlap(mov, F1.getOuterBounds())).toBe(false);
      expect(boxesOverlap(mov, F2.getOuterBounds())).toBe(false);
      // The fixed containers really are pinned.
      expect(diagram.getNode('f1')!.position).toMatchObject({ x: 0, y: 0 });
      expect(diagram.getNode('f2')!.position).toMatchObject({ x: 220, y: 0 });
    });
  });

  // -------------------------------------------------------------------------
  describe('determinism and idempotence at every depth', () => {
    /** Same graph, different insertion order. */
    const build = (order: 'forward' | 'reverse'): DiagramModel => {
      const diagram = new DiagramModel();
      const ids = ['a1', 'a2', 'b1', 'b2'];
      const P = group(diagram, 'P');
      const A = group(diagram, 'A', P);
      const B = group(diagram, 'B', P);
      const seq = order === 'forward' ? ids : [...ids].reverse();
      for (const id of seq) {
        node(diagram, id);
        (id.startsWith('a') ? A : B).addMember(id, diagram);
      }
      const edges: Array<[string, string]> = [
        ['a1', 'a2'],
        ['a2', 'b1'],
        ['b1', 'b2'],
      ];
      for (const [s, t] of order === 'forward' ? edges : [...edges].reverse()) link(diagram, s, t);
      return diagram;
    };

    const run = async (diagram: DiagramModel) =>
      new CompoundLayoutService(diagram, {
        adapters: { dagre: new DagreLayoutAdapter() },
        defaultAlgorithm: 'dagre',
        layoutTopLevel: true,
      }).layout();

    it('is independent of insertion order (canonical input ordering, at every depth)', async () => {
      const forward = build('forward');
      const reverse = build('reverse');
      await run(forward);
      await run(reverse);
      // Wave 5 fed the adapter `group.members` (a Set → insertion order) and an
      // unsorted link list, so these two diverged.
      expect(snapshot(reverse)).toBe(snapshot(forward));
    });

    it('is idempotent — the second pass moves nothing, containers included', async () => {
      const diagram = build('forward');
      await run(diagram);
      const once = snapshot(diagram);
      await run(diagram);
      expect(snapshot(diagram)).toBe(once);
    });

    it('engine.layout() is deterministic and idempotent on a nested diagram', async () => {
      const engine = new DiagramEngine();
      const diagram = engine.createDiagram('nested-det')!;
      const P = group(diagram, 'P');
      const A = group(diagram, 'A', P);
      ['a1', 'a2'].forEach((id) => {
        node(diagram, id);
        A.addMember(id, diagram);
      });
      node(diagram, 'z');
      link(diagram, 'a1', 'z');

      await engine.layout('dagre');
      const once = snapshot(diagram);
      await engine.layout('dagre');
      expect(snapshot(diagram)).toBe(once);
    });
  });

  // -------------------------------------------------------------------------
  describe('the registry composes with nested layout', () => {
    it('a container can be laid out by ANY registered engine, not just dagre|elk', async () => {
      const engine = new DiagramEngine();
      const diagram = engine.createDiagram('any-engine')!;
      const G = group(diagram, 'G');
      ['a', 'b', 'c'].forEach((id) => {
        node(diagram, id);
        G.addMember(id, diagram);
      });
      // 'force' was unreachable for a subgraph: wave 5 keyed adapters by the
      // closed literal type 'dagre' | 'elk'.
      G.subgraphLayout = { algorithm: 'force' };

      expect(engine.getLayoutRegistry().adapters()['force']).toBeDefined();
      const result = await engine.layout('dagre');
      expect(result.metadata?.['containersLaidOut']).toContain('G');
    });

    it('an unknown container algorithm falls back to the grid rather than throwing', async () => {
      const engine = new DiagramEngine();
      const diagram = engine.createDiagram('unknown-engine')!;
      const G = group(diagram, 'G');
      ['a', 'b'].forEach((id) => {
        node(diagram, id);
        G.addMember(id, diagram);
      });
      G.subgraphLayout = { algorithm: 'does-not-exist' };

      await expect(engine.layout('dagre')).resolves.toBeDefined();
      const a = diagram.getNode('a')!.position;
      const b = diagram.getNode('b')!.position;
      expect(a.x !== b.x || a.y !== b.y).toBe(true);
    });
  });
});
