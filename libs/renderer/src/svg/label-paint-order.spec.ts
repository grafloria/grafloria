// Labels over lines, as Mermaid paints them: a line that crosses another link's
// label paints first; otherwise the order is kept.
import { LinkModel } from '@grafloria/engine';
import type { VNode } from '../types/vnode.types';
import { labelsOverLines } from './label-paint-order';

/** A link group as the renderer emits it: its line, and a label chip at (x, y). */
const group = (id: string, chip?: { x: number; y: number; w: number; h: number }): VNode => ({
  type: 'g',
  props: { className: 'link-group', 'data-link-id': id },
  children: [
    { type: 'path', props: { className: 'diagram-link' } },
    ...(chip
      ? [{ type: 'g', props: { className: 'link-label-group', transform: `translate(${chip.x}, ${chip.y})` }, children: [{ type: 'rect', props: { x: -chip.w / 2, y: -chip.h / 2, width: chip.w, height: chip.h } }] } as VNode]
      : []),
  ],
});
const link = (points: Array<{ x: number; y: number }>): LinkModel => {
  const l = new LinkModel('s', 't');
  l.setPoints(points);
  return l;
};
const ids = (vs: VNode[]) => vs.map((v) => v.props?.['data-link-id']);

describe('labelsOverLines', () => {
  it("a line crossing another link's label paints BEFORE that link", () => {
    // `a` has a label at (100, 50); `b` runs straight through it — and comes after `a`.
    const links = [link([{ x: 0, y: 0 }, { x: 200, y: 0 }]), link([{ x: 100, y: 0 }, { x: 100, y: 100 }])];
    const out = labelsOverLines(links, [group('a', { x: 100, y: 50, w: 60, h: 20 }), group('b')]);
    expect(ids(out)).toEqual(['b', 'a']);
  });

  it('no crossing: the order stays', () => {
    const links = [link([{ x: 0, y: 0 }, { x: 200, y: 0 }]), link([{ x: 300, y: 0 }, { x: 300, y: 100 }])];
    expect(ids(labelsOverLines(links, [group('a', { x: 100, y: 50, w: 60, h: 20 }), group('b')]))).toEqual(['a', 'b']);
  });

  it('two lines through each other\'s labels keep their order (a cycle)', () => {
    const links = [link([{ x: 0, y: 50 }, { x: 200, y: 50 }]), link([{ x: 100, y: 0 }, { x: 100, y: 100 }])];
    const out = labelsOverLines(links, [group('a', { x: 100, y: 50, w: 20, h: 20 }), group('b', { x: 100, y: 50, w: 20, h: 20 })]);
    expect(ids(out)).toEqual(['a', 'b']);
  });
});

describe('the renderer paints an import\'s labels over its lines — without a canvas too', () => {
  // A crossing that is certain: B's line runs straight through A's label, and
  // A comes first in the model. An import (its routes) paints B first; a native
  // diagram paints as written. A server's fresh model has no measured flag.
  async function serverOrder(imported: boolean): Promise<string[]> {
    const { DiagramModel, NodeModel, PortModel, LinkModel: Link } = await import('@grafloria/engine');
    const { renderToStaticSVG } = await import('../ssr/render-to-static');
    const d = new DiagramModel();
    const box = (id: string, x: number, y: number) => {
      const n = new NodeModel({ id, type: 'rect', position: { x, y }, size: { width: 60, height: 40 } });
      n.addPort(new PortModel({ id: `${id}-p`, type: 'bi', side: 'right' }));
      d.addNode(n);
    };
    box('a1', 0, 100); box('a2', 400, 100); box('b1', 230, -100); box('b2', 230, 300);
    const link = (id: string, from: string, to: string, pts: Array<{ x: number; y: number }>, label?: string) => {
      const l = new Link(`${from}-p`, `${to}-p`);
      (l as unknown as { id: string }).id = id;
      l.setPoints(pts);
      l.setMetadata('hasManualWaypoints', true);
      if (imported) l.setMetadata('importRoute', true);
      if (label) l.addLabel({ text: label, position: 0.5 });
      d.addLink(l);
    };
    link('A', 'a1', 'a2', [{ x: 60, y: 120 }, { x: 200, y: 120 }, { x: 400, y: 120 }], 'a label on A');
    // A's label sits mid-way along its drawn line, at x ≈ 260; B runs down through it.
    link('B', 'b1', 'b2', [{ x: 260, y: -60 }, { x: 260, y: 120 }, { x: 260, y: 300 }]);
    const { LIGHT_THEME } = await import('../themes');
    // A theme, as a server passes one: a label without one draws no chip.
    const svg = renderToStaticSVG({ nodes: d.getNodes() as never, edges: d.getLinks() as never, theme: LIGHT_THEME, width: 900, height: 700, fitView: true, lod: 'document' }).svg;
    return [...svg.matchAll(/class="link-group[^"]*"[^>]*data-link-id="([^"]+)"|data-link-id="([^"]+)"[^>]*class="link-group/g)].map((m) => m[1] ?? m[2]);
  }

  it("an import's crossing line paints before the label it crosses", async () => {
    expect(await serverOrder(true)).toEqual(['B', 'A']);
  });

  it('a native diagram paints as written', async () => {
    expect(await serverOrder(false)).toEqual(['A', 'B']);
  });
});
