/**
 * Mermaid `block-beta` — a GRID of blocks, laid out the way Mermaid means it:
 * `columns N`, blocks filling rows left to right, `:N` spans, `space` holes,
 * `block … end` nesting a grid of its own. Grafloria recognised the type and
 * returned an empty diagram. Now it parses (reusing the flowchart grammar for
 * every block's shape, label, edge and style), lays the grid out, draws lines
 * straight between neighbours, and writes itself back as block-beta.
 */
import { importDiagramText, exportDiagramText } from '../../serialization/TextFormat';
import { parseMermaidBlock } from './MermaidBlock';
import type { DiagramModel } from '../../models/DiagramModel';

const imp = (t: string) => importDiagramText(t).diagram;
type Rect = { x: number; y: number; w: number; h: number };
const R = (d: DiagramModel, id: string): Rect => {
  const n = d.getNode(id);
  if (n) return { x: n.position.x, y: n.position.y, w: n.size.width, h: n.size.height };
  const b = d.getGroup(id)!.getOuterBounds();
  return { x: b.x, y: b.y, w: b.width, h: b.height };
};
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const GRID = `block-beta
  columns 3
  a["Frontend"] b["API"] c[("Database")]
  d["Cache layer"]:2 e["Queue"]
  a --> b
  b -- "writes" --> c
  d -.-> e
  style a fill:#e0f2fe,stroke:#0284c7`;

describe('Mermaid block-beta', () => {
  describe('parsing', () => {
    it('reads columns, blocks with their spans, spaces, nested blocks — and passes edges and styles through', () => {
      const m = parseMermaidBlock(`block-beta
  columns 3
  a b:2
  space c
  block:grp:2
    columns 2
    x y
  end
  a --> b
  style a fill:#f96`);
      expect(m.columns).toBe(3);
      expect(m.cells.map((c) => (c.kind === 'space' ? `space:${c.span}` : `${c.kind}:${c.id}:${c.span}`))).toEqual([
        'block:a:1', 'block:b:2', 'space:1', 'block:c:1', 'group:grp:2',
      ]);
      const grp = m.cells[4]!;
      expect(grp.kind === 'group' && grp.columns).toBe(2);
      expect(grp.kind === 'group' && grp.cells.map((c) => (c.kind === 'block' ? c.id : '?'))).toEqual(['x', 'y']);
      expect(m.passthrough).toEqual(['a --> b', 'style a fill:#f96']);
    });

    it('a block arrow keeps its place in the row', () => {
      const m = parseMermaidBlock('block-beta\n  a ar<["go"]>(right) b');
      expect(m.cells.map((c) => (c.kind === 'block' ? c.id : c.kind))).toEqual(['a', 'ar', 'b']);
    });

    it('a block arrow draws as its label and an arrow pointing its way — no box — and writes back as a block arrow', () => {
      const d = imp('block-beta\n  columns 3\n  a ar<["go"]>(right) b\n  x dn<[" "]>(down) y');
      const ar = d.getNode('ar')!, dn = d.getNode('dn')!;
      expect((ar.getMetadata('shape') as { type?: string }).type).toBe('text');
      expect(ar.getLabel()).toBe('go →');
      expect(dn.getLabel()).toBe('↓');
      expect(ar.getMetadata('textAlign')).toBe('center');
      const out = exportDiagramText(d, { lossless: false });
      expect(out).toContain('ar<["go"]>(right)');
      expect(out).toContain('dn<[" "]>(down)');
    });
  });

  describe('importing lays the grid out', () => {
    const d = imp(GRID);

    it('is a block-beta diagram with every block, its label and shape', () => {
      expect(d.getMetadata('diagramType')).toBe('block-beta');
      expect(d.getNodes().map((n) => n.id).sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
      expect(d.getNode('b')!.getLabel()).toBe('API');
      expect(d.getNode('c')!.type).toBe('flowchart:data'); // `[( … )]` — the flowchart grammar's database / cylinder
    });

    it('blocks fill rows left to right, three to a row', () => {
      expect(R(d, 'a').y).toBeCloseTo(R(d, 'b').y, 0);
      expect(R(d, 'b').y).toBeCloseTo(R(d, 'c').y, 0);
      expect(R(d, 'a').x).toBeLessThan(R(d, 'b').x);
      expect(R(d, 'b').x).toBeLessThan(R(d, 'c').x);
      expect(R(d, 'd').y).toBeGreaterThan(R(d, 'a').y + R(d, 'a').h);
    });

    it('a span covers its columns: the cache layer runs under the frontend AND the API', () => {
      expect(R(d, 'd').x).toBeCloseTo(R(d, 'a').x, 0);
      expect(R(d, 'd').x + R(d, 'd').w).toBeCloseTo(R(d, 'b').x + R(d, 'b').w, 0);
      expect(R(d, 'e').x).toBeCloseTo(R(d, 'c').x, 0);
    });

    it('a row shares one height, a column one width — blocks fill their cells', () => {
      expect(R(d, 'a').h).toBeCloseTo(R(d, 'c').h, 0);
      expect(R(d, 'b').w).toBeCloseTo(R(d, 'b').w, 0);
      expect(R(d, 'e').w).toBeCloseTo(R(d, 'c').w, 0);
    });

    it('the edges come through (label, dashes, style) and run straight between neighbours', () => {
      const l = d.getLinks().find((x) => x.sourceNodeId === 'b' && x.targetNodeId === 'c')!;
      expect(l.getLabel()).toBe('writes');
      expect(d.getLinks().find((x) => x.sourceNodeId === 'd')!.style.strokeDasharray).toBeTruthy();
      expect(d.getNode('a')!.style.fill).toBe('#e0f2fe');
      for (const x of d.getLinks().filter((q) => q.sourceNodeId === 'a' || q.sourceNodeId === 'b')) {
        const y = (port: string | undefined, id: string) => R(d, id).y + Number(/@(-?\d+)/.exec(port ?? '')?.[1]);
        expect(Math.round(y(x.sourcePortId, x.sourceNodeId!))).toBe(Math.round(y(x.targetPortId, x.targetNodeId!)));
      }
    });

    it('a space leaves a hole: `a space b` puts b in the third column', () => {
      const g = imp('block-beta\n  columns 3\n  a space b\n  x y z');
      expect(R(g, 'b').x).toBeCloseTo(R(g, 'z').x, 0);
      expect(R(g, 'a').x).toBeCloseTo(R(g, 'x').x, 0);
    });

    it('a nested block is a box around its own grid, spanning its cells in the parent', () => {
      const g = imp(`block-beta
  columns 3
  a
  block:grp:2
    columns 2
    x y
  end
  p q r`);
      const frame = R(g, 'grp');
      for (const id of ['x', 'y']) {
        const r = R(g, id);
        expect(r.x >= frame.x && r.y >= frame.y && r.x + r.w <= frame.x + frame.w && r.y + r.h <= frame.y + frame.h).toBe(true);
      }
      expect(R(g, 'x').y).toBeCloseTo(R(g, 'y').y, 0);
      expect(frame.x + frame.w).toBeCloseTo(R(g, 'r').x + R(g, 'r').w, 0); // spans columns 2–3
      expect(g.getGroup('grp')!.name).toBe(''); // a block group has no caption
      const ids = g.getNodes().map((n) => n.id);
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) expect(overlaps(R(g, ids[i]!), R(g, ids[j]!))).toBe(false);
    });

    it('without columns every block sits in one row', () => {
      const g = imp('block-beta\n  a b c');
      expect(new Set(['a', 'b', 'c'].map((id) => Math.round(R(g, id).y))).size).toBe(1);
    });
  });

  describe('round trip', () => {
    it('exports as block-beta and imports back to the same grid', () => {
      const d = imp(GRID);
      const out = exportDiagramText(d, { lossless: false });
      expect(out.trimStart().startsWith('block-beta')).toBe(true);
      expect(out).toMatch(/columns 3/);
      expect(out).toMatch(/d\["Cache layer"\]:2/);
      const back = imp(out);
      for (const id of ['a', 'b', 'c', 'd', 'e']) {
        expect([id, Math.round(R(back, id).x), Math.round(R(back, id).y), Math.round(R(back, id).w)]).toEqual([id, Math.round(R(d, id).x), Math.round(R(d, id).y), Math.round(R(d, id).w)]);
      }
      expect(back.getLinks().length).toBe(3);
    });
  });
});
