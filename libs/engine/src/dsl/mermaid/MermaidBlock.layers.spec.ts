/**
 * A layered application in block-beta — the classic 3-tier picture: layers
 * stacked, each NAMED, a Security column running down beside all of them.
 *
 * Two things it needs that the grid did not do:
 *  - a nested block can carry a label, `block:ui["Presentation layer"]` (real
 *    Mermaid draws it); we read it as `block:ui` and dropped the name.
 *  - a nested block stretched to its cell FILLS it with its own blocks, as
 *    Mermaid's block layout does ("growing to fit"). The Security column grew
 *    to the layers' height with its blocks bunched at the top, and a layer of
 *    three sat left-aligned under a layer of four.
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
const inside = (r: Rect, f: Rect) => r.x >= f.x - 0.5 && r.y >= f.y - 0.5 && r.x + r.w <= f.x + f.w + 0.5 && r.y + r.h <= f.y + f.h + 0.5;
const near = (a: number, b: number) => Math.abs(a - b) < 1;

const LAYERS = `block-beta
  columns 4
  block:app["Application"]:3
    columns 1
    block:ui["Presentation layer"]
      columns 3
      web["Web app"] mobile["Mobile app"] admin["Admin portal"]
    end
    block:bll["Business logic layer"]
      columns 4
      orders["Orders"] billing["Billing"] rules["Business rules"] flows["Workflows"]
    end
    block:dal["Data access layer"]
      columns 2
      repos["Repositories"] orm["ORM / unit of work"]
    end
  end
  block:sec["Security"]
    columns 1
    authn["Authentication"] authz["Authorization"] crypto["Encryption"]
  end`;

const LAYER_BLOCKS: Record<string, string[]> = {
  ui: ['web', 'mobile', 'admin'],
  bll: ['orders', 'billing', 'rules', 'flows'],
  dal: ['repos', 'orm'],
};

describe('Mermaid block-beta: a layered application', () => {
  it('reads a nested block label, with and without a span, in either bracket', () => {
    const m = parseMermaidBlock(`block-beta
  columns 4
  block:app["Application"]:3
    block:ui["Presentation layer"]
      a
    end
  end
  block:r("Round one")
    b
  end`);
    const app = m.cells[0] as { kind: string; id: string; span: number; label?: string; cells: Array<{ kind: string; id: string; label?: string }> };
    expect([app.kind, app.id, app.span, app.label]).toEqual(['group', 'app', 3, 'Application']);
    expect([app.cells[0]!.id, app.cells[0]!.label]).toEqual(['ui', 'Presentation layer']);
    expect((m.cells[1] as { label?: string }).label).toBe('Round one');
  });

  describe('laid out', () => {
    const d = imp(LAYERS);

    it('a labelled nested block is a captioned frame; its blocks sit below the caption', () => {
      expect(d.getGroup('ui')!.name).toBe('Presentation layer');
      expect(d.getGroup('sec')!.name).toBe('Security');
      for (const [layer, ids] of Object.entries(LAYER_BLOCKS)) {
        const f = R(d, layer);
        const captionRoom = Math.min(...ids.map((id) => R(d, id).y)) - f.y;
        const sideInset = R(d, ids[0]!).x - f.x;
        expect([layer, captionRoom > sideInset + 12]).toEqual([layer, true]);
      }
    });

    it('an unlabelled nested block still has no caption', () => {
      const plain = imp('block-beta\n  block:g\n    a b\n  end');
      expect(plain.getGroup('g')!.name).toBe('');
    });

    it('the layers stack to one width, and every layer\'s blocks FILL it edge to edge', () => {
      const frames = Object.keys(LAYER_BLOCKS).map((l) => R(d, l));
      for (const f of frames) expect([near(f.x, frames[0]!.x), near(f.w, frames[0]!.w)]).toEqual([true, true]);
      for (const [layer, ids] of Object.entries(LAYER_BLOCKS)) {
        const f = R(d, layer);
        const first = R(d, ids[0]!), last = R(d, ids[ids.length - 1]!);
        const left = first.x - f.x, right = f.x + f.w - (last.x + last.w);
        expect([layer, Math.round(left)]).toEqual([layer, Math.round(right)]);
        // one row: every block the same height, the same top
        for (const id of ids) expect([id, near(R(d, id).y, first.y), near(R(d, id).h, first.h)]).toEqual([id, true, true]);
      }
    });

    it('the cells of a grid are ONE width, the widest block\'s — as Mermaid sizes them ("Orders" as wide as "Business rules")', () => {
      for (const [layer, ids] of Object.entries(LAYER_BLOCKS)) {
        const w = R(d, ids[0]!).w;
        for (const id of ids) expect([layer, id, Math.round(R(d, id).w)]).toEqual([layer, id, Math.round(w)]);
      }
      const plain = imp('block-beta\n  columns 3\n  a["A"] b["A much longer name"] c["C"]\n  d["D"]:2 e["E"]');
      expect(new Set(['a', 'b', 'c', 'e'].map((id) => Math.round(R(plain, id).w))).size).toBe(1);
      // a block spanning two cells covers two cells and the gap between them
      expect(Math.round(R(plain, 'd').w)).toBe(Math.round(R(plain, 'b').x + R(plain, 'b').w - R(plain, 'a').x));
    });

    it('the Security column runs the full height of the layers, its blocks spread down all of it', () => {
      const app = R(d, 'app'), sec = R(d, 'sec');
      expect([near(sec.y, app.y), near(sec.y + sec.h, app.y + app.h)]).toEqual([true, true]);
      expect(sec.x).toBeGreaterThan(app.x + app.w);
      const ids = ['authn', 'authz', 'crypto'];
      const first = R(d, ids[0]!), last = R(d, ids[ids.length - 1]!);
      const side = first.x - sec.x;
      const bottom = sec.y + sec.h - (last.y + last.h);
      expect(Math.round(bottom)).toBe(Math.round(side)); // the last block ends one inset above the frame, not half-way up
      for (const id of ids) expect([id, near(R(d, id).w, sec.w - 2 * side)]).toEqual([id, true]);
    });

    it('nothing overlaps; every block inside its layer, every layer inside the application', () => {
      const ids = d.getNodes().map((n) => n.id);
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) expect([ids[i], ids[j], overlaps(R(d, ids[i]!), R(d, ids[j]!))]).toEqual([ids[i], ids[j], false]);
      for (const [layer, members] of Object.entries(LAYER_BLOCKS)) {
        for (const id of members) expect([id, inside(R(d, id), R(d, layer))]).toEqual([id, true]);
        expect([layer, inside(R(d, layer), R(d, 'app'))]).toEqual([layer, true]);
      }
    });
  });

  it('round trip: the labels write back as Mermaid wrote them, and import to the same picture', () => {
    const d = imp(LAYERS);
    const out = exportDiagramText(d, { lossless: false });
    expect(out).toMatch(/block:app\["Application"\]:3/);
    expect(out).toMatch(/block:ui\["Presentation layer"\]\n/);
    expect(out).toMatch(/block:sec\["Security"\]\n/);
    const back = imp(out);
    for (const id of ['app', 'ui', 'bll', 'dal', 'sec', 'web', 'flows', 'orm', 'crypto']) {
      const a = R(d, id), b = R(back, id);
      expect([id, Math.round(b.x), Math.round(b.y), Math.round(b.w), Math.round(b.h)]).toEqual([id, Math.round(a.x), Math.round(a.y), Math.round(a.w), Math.round(a.h)]);
    }
  });
});
