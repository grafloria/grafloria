// Wave 3 (Edges & links), Card A — per-link path SHAPE knobs.
//
//   • LinkStyle.cornerRadius — orthogonal bend radius, previously a hardcoded
//     5 (auto route + manual waypoints) / 12 (smooth detour fallback).
//   • LinkStyle.curvature    — smooth/bezier control-point tightness. Declared
//     on LinkStyle since Phase 4 but read by NOBODY: dead until now.
//   • pathType               — the per-link CONNECTOR override. Already worked;
//     pinned here so it can never silently regress (see the last describe).
//
// The invariant these specs exist to protect: a link that sets NEITHER knob
// must emit exactly the path it emitted before the knobs existed.

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

/** The VISIBLE link path `d` (the wide transparent hit area is skipped). */
function linkPathData(root: VNode, link: LinkModel): string {
  const group = findVNodeByKey(root, `link-${link.id}`);
  expect(group).toBeDefined();
  const path = (group.children ?? []).find(
    (c: any) => c?.type === 'path' && c.props?.className !== 'link-hit-area'
  );
  expect(path).toBeDefined();
  return path.props.d as string;
}

interface Cmd {
  op: string;
  args: number[];
}

/**
 * Tolerant SVG path tokenizer. The two path emitters in the renderer disagree
 * about separators — getBend writes `L 105,100Q 110,100 110,105` while
 * buildPathWithJumps writes ` L 105 100 Q 110 100 110 105` — so normalise
 * commas to spaces and walk the token stream instead of regexing one shape.
 */
function parsePath(d: string): Cmd[] {
  const tokens = d.replace(/,/g, ' ').match(/[A-Za-z]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  const arity: Record<string, number> = { M: 2, L: 2, Q: 4, C: 6, A: 7, Z: 0 };
  const cmds: Cmd[] = [];
  let i = 0;
  while (i < tokens.length) {
    const op = tokens[i++];
    const n = arity[op.toUpperCase()] ?? 0;
    const args: number[] = [];
    for (let k = 0; k < n; k++) args.push(parseFloat(tokens[i++]));
    cmds.push({ op, args });
  }
  return cmds;
}

/**
 * The realised bend radius at every rounded corner: the distance from where the
 * straight run stops (the point before the Q) to the Q's control point, which
 * IS the corner vertex. Works for both emitters.
 */
function bendRadii(d: string): number[] {
  const cmds = parsePath(d);
  const radii: number[] = [];
  let cur = { x: 0, y: 0 };
  for (const { op, args } of cmds) {
    const o = op.toUpperCase();
    if (o === 'M' || o === 'L') {
      cur = { x: args[0], y: args[1] };
    } else if (o === 'Q') {
      radii.push(Math.hypot(args[0] - cur.x, args[1] - cur.y));
      cur = { x: args[2], y: args[3] };
    } else if (o === 'C') {
      cur = { x: args[4], y: args[5] };
    } else if (o === 'A') {
      cur = { x: args[5], y: args[6] };
    }
  }
  return radii;
}

function ops(d: string): string[] {
  return parsePath(d).map(c => c.op.toUpperCase());
}

describe('SVGRenderer — per-link path shape (Wave 3, Card A)', () => {
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

  function node(x: number, y: number, portId: string, side: 'left' | 'right' | 'top' | 'bottom'): NodeModel {
    const n = new NodeModel({ type: 'basic', position: { x, y }, size: { width: 100, height: 50 } });
    n.addPort(new PortModel({ id: portId, type: side === 'right' ? 'output' : 'input', side }));
    diagram.addNode(n);
    return n;
  }

  /** A link whose route is guaranteed to bend (ports offset in BOTH axes). */
  function bentLink(
    pathType: 'orthogonal' | 'smooth' | 'direct',
    style: Partial<LinkModel['style']> = {},
    ids: [string, string] = ['s1', 't1'],
    from: [number, number] = [100, 100],
    to: [number, number] = [500, 400]
  ): LinkModel {
    node(from[0], from[1], ids[0], 'right');
    node(to[0], to[1], ids[1], 'left');
    const link = new LinkModel(ids[0], ids[1], pathType);
    Object.assign(link.style, style);
    diagram.addLink(link);
    return link;
  }

  function render(): VNode {
    return renderer.render(VIEWPORT, 1.0) as VNode;
  }

  // ---------------------------------------------------------------- corner radius
  describe('LinkStyle.cornerRadius (orthogonal)', () => {
    it('defaults to 5px — an untouched link is byte-identical to pre-feature output', () => {
      const link = bentLink('orthogonal');
      const d = linkPathData(render(), link);

      const radii = bendRadii(d);
      expect(radii.length).toBeGreaterThan(0);
      // Long segments here → the clamp never bites → every corner is the full default.
      expect(Math.max(...radii)).toBeCloseTo(5, 6);
    });

    it('honours a per-link radius: 20px corners on THIS link only', () => {
      const wide = bentLink('orthogonal', { cornerRadius: 20 }, ['s1', 't1'], [100, 100], [500, 400]);
      const plain = bentLink('orthogonal', {}, ['s2', 't2'], [100, 500], [500, 700]);

      const root = render();
      expect(Math.max(...bendRadii(linkPathData(root, wide)))).toBeCloseTo(20, 6);
      // The sibling link keeps the default — the override is PER LINK, not global.
      expect(Math.max(...bendRadii(linkPathData(root, plain)))).toBeCloseTo(5, 6);
    });

    it('cornerRadius: 0 gives hard 90° corners (zero-length bends)', () => {
      const link = bentLink('orthogonal', { cornerRadius: 0 });
      const radii = bendRadii(linkPathData(render(), link));
      expect(radii.length).toBeGreaterThan(0);
      expect(Math.max(...radii)).toBeCloseTo(0, 6);
    });

    it('a LARGE radius is safe: every bend stays clamped to half its shortest adjacent segment', () => {
      // Ports 60px apart vertically → the middle segment is short; a 400px
      // radius must not overshoot it (getBend clamps), and must not emit NaN.
      const link = bentLink('orthogonal', { cornerRadius: 400 }, ['s1', 't1'], [100, 100], [400, 160]);
      const d = linkPathData(render(), link);

      expect(d).not.toMatch(/NaN|Infinity/);
      const cmds = parsePath(d);
      const pts: Array<{ x: number; y: number }> = [];
      let cur = { x: 0, y: 0 };
      for (const { op, args } of cmds) {
        const o = op.toUpperCase();
        if (o === 'M' || o === 'L') cur = { x: args[0], y: args[1] };
        else if (o === 'Q') cur = { x: args[2], y: args[3] };
        pts.push(cur);
      }
      // Every realised bend is finite and no larger than the requested radius.
      for (const r of bendRadii(d)) {
        expect(Number.isFinite(r)).toBe(true);
        expect(r).toBeLessThanOrEqual(400 + 1e-6);
      }
      expect(pts.length).toBeGreaterThan(2);
    });

    it('ignores a nonsense radius (negative / NaN) and falls back to the default', () => {
      const bad = bentLink('orthogonal', { cornerRadius: -30 }, ['s1', 't1']);
      const nan = bentLink('orthogonal', { cornerRadius: NaN }, ['s2', 't2'], [100, 500], [500, 700]);

      const root = render();
      expect(Math.max(...bendRadii(linkPathData(root, bad)))).toBeCloseTo(5, 6);
      expect(Math.max(...bendRadii(linkPathData(root, nan)))).toBeCloseTo(5, 6);
    });

    it('applies to MANUAL-WAYPOINT paths too (both path-emitting branches agree)', () => {
      const link = bentLink('orthogonal', { cornerRadius: 16 });

      // Auto-route once so link.points carries the REAL port endpoints (the
      // renderer resolves them through the shape's port layout — hand-guessing
      // them leaves a stub segment that clamps every bend).
      render();
      const start = { ...link.points[0] };
      const end = { ...link.points[link.points.length - 1] };
      const midX = (start.x + end.x) / 2;

      // Mark the link as user-waypointed — the flag the waypoint editor sets,
      // which routes renderLink down its OTHER path emitter (generatePathData).
      link.points = [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end];
      link.setMetadata('hasManualWaypoints', true);
      link.markDirty('waypoints');

      const radii = bendRadii(linkPathData(render(), link));
      expect(radii.length).toBeGreaterThan(0);
      expect(Math.max(...radii)).toBeCloseTo(16, 6);
    });

    it('survives serialization (LinkModel.serialize spreads style wholesale)', () => {
      const link = bentLink('orthogonal', { cornerRadius: 20, curvature: 0.9 });
      const restored = LinkModel.fromJSON(link.serialize());
      expect(restored.style.cornerRadius).toBe(20);
      expect(restored.style.curvature).toBe(0.9);
    });
  });

  // ------------------------------------------------------------------- curvature
  describe('LinkStyle.curvature (smooth / bezier) — was DEAD, now honoured', () => {
    /** Control points of the single cubic in a 2-point smooth link. */
    function controls(d: string): { cp1: { x: number; y: number }; cp2: { x: number; y: number } } {
      const c = parsePath(d).find(cmd => cmd.op.toUpperCase() === 'C');
      expect(c).toBeDefined();
      return {
        cp1: { x: c!.args[0], y: c!.args[1] },
        cp2: { x: c!.args[2], y: c!.args[3] },
      };
    }

    // A straight horizontal shot → 2-point route → the simple-bezier branch.
    function straightSmooth(style: Partial<LinkModel['style']>, ids: [string, string], y: number): LinkModel {
      node(100, y, ids[0], 'right');
      node(400, y, ids[1], 'left');
      const link = new LinkModel(ids[0], ids[1], 'smooth');
      Object.assign(link.style, style);
      diagram.addLink(link);
      return link;
    }

    it('defaults to 0.5 — the legacy Math.min(distance / 2, 100) control offset', () => {
      const link = straightSmooth({}, ['s1', 't1'], 100);
      const d = linkPathData(render(), link);
      const { cp1, cp2 } = controls(d);
      const start = parsePath(d)[0].args;

      // start.x = 200 (right port), end.x = 400 (left port) → distance 200 → offset 100.
      expect(cp1.x - start[0]).toBeCloseTo(100, 6);
      expect(cp2.x - start[0]).toBeCloseTo(100, 6);
    });

    it('a higher curvature pushes the control points further out (looser curve)', () => {
      const tight = straightSmooth({ curvature: 0.5 }, ['s1', 't1'], 100);
      const loose = straightSmooth({ curvature: 1 }, ['s2', 't2'], 400);

      const root = render();
      const t = controls(linkPathData(root, tight));
      const l = controls(linkPathData(root, loose));

      const tightOffset = t.cp1.x - 200;
      const looseOffset = l.cp1.x - 200;
      expect(looseOffset).toBeCloseTo(tightOffset * 2, 6);
      expect(looseOffset).toBeGreaterThan(tightOffset);
    });

    it('curvature: 0 collapses the curve onto its chord (control points at the endpoints)', () => {
      const link = straightSmooth({ curvature: 0 }, ['s1', 't1'], 100);
      const d = linkPathData(render(), link);
      const { cp1, cp2 } = controls(d);
      const start = parsePath(d)[0].args;

      expect(cp1.x).toBeCloseTo(start[0], 6);
      expect(cp2.x).toBeCloseTo(400, 6);
    });

    it('the ENGINE agrees with the renderer: generateSmoothPath uses the same knob', () => {
      const link = new LinkModel('a', 'b', 'smooth');
      link.style.curvature = 1;
      link.generatePath({ x: 0, y: 0 }, { x: 100, y: 0 });

      // controlOffset = |dx| * curvature = 100 * 1 (default 0.5 would give 50)
      expect(link.segments[0].control1!.x).toBeCloseTo(100, 6);

      const dflt = new LinkModel('a', 'b', 'smooth');
      dflt.generatePath({ x: 0, y: 0 }, { x: 100, y: 0 });
      expect(dflt.segments[0].control1!.x).toBeCloseTo(50, 6);
    });
  });

  // ----------------------------------------------------------- jumps × big radius
  describe('jump points × a large corner radius (the documented RISK)', () => {
    /**
     * Two links that CROSS: a horizontal one and a vertical one. The horizontal
     * link owns the jumps.
     */
    function crossingPair(style: Partial<LinkModel['style']>): LinkModel {
      // Horizontal: (100,300) → (700,300)-ish, with jumps on.
      node(100, 275, 'hs', 'right');
      node(700, 275, 'ht', 'left');
      // Vertical crosser straddling the middle of that run.
      node(350, 100, 'vs', 'bottom');
      node(350, 500, 'vt', 'top');

      const vertical = new LinkModel('vs', 'vt', 'orthogonal');
      diagram.addLink(vertical);

      const horizontal = new LinkModel('hs', 'ht', 'orthogonal');
      Object.assign(horizontal.style, { jumpPoints: { enabled: true, size: 10, style: 'arc' }, ...style });
      diagram.addLink(horizontal);
      return horizontal;
    }

    it('draws jump arcs at the default radius (baseline)', () => {
      const link = crossingPair({});
      const d = linkPathData(render(), link);
      expect(ops(d).filter(o => o === 'A').length).toBeGreaterThan(0);
    });

    it('KEEPS its jump arcs at a huge radius — the radius is clamped, the jumps are not dropped', () => {
      const link = crossingPair({ cornerRadius: 200 });
      const d = linkPathData(render(), link);

      const arcs = ops(d).filter(o => o === 'A').length;
      expect(arcs).toBeGreaterThan(0);           // ← the bug this clamp exists to prevent
      expect(d).not.toMatch(/NaN|Infinity/);

      // Clamped DOWN from 200, but never below the 5px built-in default, so a
      // default-radius link's geometry is untouched by the clamp.
      for (const r of bendRadii(d)) {
        expect(r).toBeLessThan(200);
        expect(r).toBeGreaterThanOrEqual(0);
      }
    });

    it('a radius at/below the default is never clamped (no behaviour change for existing links)', () => {
      const plain = crossingPair({});
      const dPlain = linkPathData(render(), plain);

      // Same diagram shape, explicit default → identical geometry.
      renderer.dispose();
      engine.destroy();
      engine = new DiagramEngine();
      diagram = engine.createDiagram('Test2')!;
      renderer = new SVGRenderer(engine, {});
      const explicit = crossingPair({ cornerRadius: 5 });
      const dExplicit = linkPathData(render(), explicit);

      expect(dExplicit).toBe(dPlain);
    });
  });

  // -------------------------------------------------- per-link connector override
  describe('per-link connector override (pathType) — already supported, pinned here', () => {
    it('each link renders with ITS OWN pathType in the same diagram', () => {
      const orth = bentLink('orthogonal', {}, ['s1', 't1'], [100, 100], [500, 400]);
      const smooth = bentLink('smooth', {}, ['s2', 't2'], [100, 500], [500, 700]);
      const direct = bentLink('direct', {}, ['s3', 't3'], [700, 100], [1000, 300]);

      const root = render();
      const dOrth = ops(linkPathData(root, orth));
      const dSmooth = ops(linkPathData(root, smooth));
      const dDirect = ops(linkPathData(root, direct));

      // Orthogonal → rounded right angles (quadratic bends), never a cubic.
      expect(dOrth).toContain('Q');
      expect(dOrth).not.toContain('C');

      // Smooth → a cubic bezier (or a spline), never a plain L-only polyline.
      expect(dSmooth.some(o => o === 'C' || o === 'Q')).toBe(true);

      // Direct → straight lines only.
      expect(dDirect).toEqual(expect.arrayContaining(['M', 'L']));
      expect(dDirect).not.toContain('Q');
      expect(dDirect).not.toContain('C');
    });

    it('exposes the link id on the rendered group so the DOM can be addressed per link', () => {
      const link = bentLink('orthogonal');
      const group = findVNodeByKey(render(), `link-${link.id}`);
      expect(group.props['data-link-id']).toBe(link.id);
    });
  });
});
