// Panel header `lines` — the stacked «stereotype»/name band (master-sheet
// audit, finding: «dataType» DataType / «enumeration» Enumeration painted as
// ONE line wider than the 120px card and clipped at both edges).
//
// Two guarantees:
//   1. `lines` stack: the band grows to hold them, every line paints, the
//      stereotype line reads smaller/lighter than the name line;
//   2. NO header line can escape its card: a line longer than the band width
//      shrinks (same 0.6em estimate as the label engine), single-line `text`
//      headers included.

import { renderNodePanel, panelAdjustedInnerRect, measurePanelReserve } from './panel';
import { NodeModel } from '@grafloria/engine';

const ctx = {
  nodeId: 'n1',
  fontSize: 12,
  headerFill: '#eee',
  headerTextColor: '#111',
  bodyTextColor: '#111',
  badgeFill: '#ddd',
  badgeTextColor: '#111',
};

const nodeWith = (panel: unknown, w = 120, h = 80): NodeModel => {
  const node = new NodeModel({ type: 't', position: { x: 0, y: 0 }, size: { width: w, height: h } });
  node.setMetadata('panel', panel);
  return node;
};

const texts = (out: ReturnType<typeof renderNodePanel>) => out.filter((v) => v.type === 'text');
const band = (out: ReturnType<typeof renderNodePanel>) => out.find((v) => v.props['className'] === 'panel-header')!;

describe('panel header lines', () => {
  it('stacks stereotype over name: two text nodes, band grown to hold both', () => {
    const out = renderNodePanel(nodeWith({ header: { lines: ['«enumeration»', 'Enumeration'] } }), 120, 80, ctx);
    const h = band(out).props['height'] as number;
    expect(h).toBe(2 * 16 + 4);
    const [stereo, name] = texts(out);
    expect(stereo.props['textContent']).toBe('«enumeration»');
    expect(name.props['textContent']).toBe('Enumeration');
    // Both lines centred in their own half of the band, in order.
    expect(stereo.props['y']).toBe(h / 4);
    expect(name.props['y']).toBe((3 * h) / 4);
    // The stereotype reads lighter and smaller than the name.
    expect(stereo.props['fontWeight']).toBe(400);
    expect(name.props['fontWeight']).toBe(600);
    expect(Number(stereo.props['fontSize'])).toBeLessThan(Number(name.props['fontSize']));
  });

  it('every line fits the card: estimated line width <= band width', () => {
    for (const lines of [['«primitive»', 'PrimitiveType'], ['«dataType»', 'DataType']]) {
      const out = renderNodePanel(nodeWith({ header: { lines } }), 120, 80, ctx);
      for (const t of texts(out)) {
        const est = String(t.props['textContent']).length * Number(t.props['fontSize']) * 0.6;
        expect(est).toBeLessThanOrEqual(120);
      }
    }
  });

  it('a single-line text header shrinks instead of escaping a narrow card', () => {
    const out = renderNodePanel(nodeWith({ header: { text: 'PrimitiveTypeXY' } }), 90, 60, ctx);
    const t = texts(out)[0];
    expect(Number(t.props['fontSize'])).toBeLessThan(12);
    expect(String(t.props['textContent']).length * Number(t.props['fontSize']) * 0.6).toBeLessThanOrEqual(90);
    // …and a short one keeps the theme size exactly as before.
    const short = texts(renderNodePanel(nodeWith({ header: { text: 'Entity' } }), 90, 60, ctx))[0];
    expect(short.props['fontSize']).toBe(12);
    expect(short.props['fontWeight']).toBe(600);
  });

  it('the shrink has a legibility floor: a pathological name clamps at 8px', () => {
    const out = renderNodePanel(
      nodeWith({ header: { text: 'AbsurdlyLongClassifierNameNobodyShouldType' } }), 90, 60, ctx);
    expect(texts(out)[0].props['fontSize']).toBe(8);
  });

  it('reserve and label inner-rect both honour the grown band', () => {
    const node = nodeWith({ header: { lines: ['«signal»', 'Signal'] }, rows: [{ text: 'r' }] });
    expect(measurePanelReserve(node)?.top).toBe(36);
    const inner = panelAdjustedInnerRect(node, { x: 0, y: 0, w: 120, h: 80 }, 120, 80);
    expect(inner.y).toBe(36);
    expect(inner.h).toBe(80 - 36 - 18);
  });
});
