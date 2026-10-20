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
  it('a server render of imported routes (no measured flag) orders a crossing line first', async () => {
    const { importDiagramText, runDeterministic } = await import('@grafloria/engine');
    const { renderToStaticSVG } = await import('../ssr/render-to-static');
    const order = runDeterministic(() => {
      const d = importDiagramText(`flowchart LR
        Offer -->|Valid Offer| Valid[Valid offer]
        Offer -->|Alternative Offer| Alternative[Alternative offer]
        Offer -->|Revision| Revision
        Offer -->|Rejected Offer| Rejected[Rejected offer]
        Offer -->|Cancel RFQ| Cancelled[Cancelled RFQ]
        Offer -->|Regretted To Offer| Regretted[Regretted offer]`).diagram;
      expect(d.getMetadata('measuredText')).toBeUndefined(); // a server: nothing measured
      const svg = renderToStaticSVG({ nodes: d.getNodes() as never, edges: d.getLinks() as never, width: 900, height: 600, fitView: true, lod: 'document' }).svg;
      const ids = [...svg.matchAll(/class="link-group[^"]*"[^>]*data-link-id="([^"]+)"|data-link-id="([^"]+)"[^>]*class="link-group/g)].map((m) => m[1] ?? m[2]);
      return { ids, model: d.getLinks().map((l) => l.id) };
    });
    expect(new Set(order.ids)).toEqual(new Set(order.model));
    // A fan crosses its neighbours' labels: some line was moved before a label it crosses.
    expect(order.ids).not.toEqual(order.model);
  });
});
