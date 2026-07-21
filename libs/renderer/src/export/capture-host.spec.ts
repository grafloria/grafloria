// The DOM boundary of custom-node export.
//
// These run on STRUCTURAL FAKES rather than jsdom, for one decisive reason: jsdom has
// no layout engine. Every `getBoundingClientRect()` there returns zeros, so a jsdom
// test of a module whose entire job is reading laid-out geometry would assert that
// zeros produce zeros. The fakes state the rects outright, which is the only way these
// numbers can be checked at all — and `captureCustomNodeHost` takes `unknown` and reads
// the DOM structurally, precisely so it can be driven this way.
//
// What is pinned here:
//   • an inline <svg> is LIFTED with `var(--…)` RESOLVED (the kit paints its grid and
//     labels with custom properties; carrying those into the file would break the
//     export's "no unresolved variables" guarantee and render black outside a browser)
//   • HTML text becomes <text> — this is what makes a KPI's headline number survive
//   • the camera zoom is divided back out, so a board exports the same at any zoom
//   • it NEVER throws: a bad host degrades to `empty`, which the pure layer turns into
//     a marked box and a warning

import { captureCustomNodeHost } from './capture-host';
import type { VNode } from '../types/vnode.types';

// -- structural fakes ---------------------------------------------------------

interface FakeRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface FakeNode {
  nodeType: number;
  nodeValue?: string | null;
}

interface FakeElSpec {
  tag: string;
  ns?: string;
  attrs?: Record<string, string>;
  style?: Record<string, string>;
  rect?: FakeRect;
  children?: Array<FakeElSpec | string>;
  /**
   * Pseudo-element computed styles, keyed by `'::before'` / `'::after'` — what a real
   * `getComputedStyle(el, '::before')` reports. A pseudo that is not declared reports
   * `content: 'none'`, which is exactly what browsers do for a non-existent pseudo.
   */
  pseudos?: Record<string, Record<string, string>>;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Text nodes carry their own rect so the Range path can be exercised. */
interface FakeText extends FakeNode {
  nodeType: 3;
  nodeValue: string;
  __rect?: FakeRect;
}

const styles = new WeakMap<object, Record<string, string>>();
const pseudoStyles = new WeakMap<object, Record<string, Record<string, string>>>();
const textRects = new WeakMap<object, FakeRect>();

const win = {
  getComputedStyle(el: object, pseudo?: string | null): Record<string, string> {
    if (pseudo) return pseudoStyles.get(el)?.[pseudo] ?? { content: 'none' };
    return styles.get(el) ?? {};
  },
};

const doc = {
  defaultView: win,
  createRange() {
    let target: object | null = null;
    return {
      selectNodeContents(n: object) {
        target = n;
      },
      getBoundingClientRect(): FakeRect {
        return (target && textRects.get(target)) || { left: 0, top: 0, width: 0, height: 0 };
      },
    };
  },
};

function build(spec: FakeElSpec): Record<string, unknown> {
  const attrs = Object.entries(spec.attrs ?? {}).map(([name, value]) => ({ name, value }));
  const rect = spec.rect ?? { left: 0, top: 0, width: 0, height: 0 };

  const childNodes: Array<FakeText | Record<string, unknown>> = (spec.children ?? []).map(child => {
    if (typeof child === 'string') {
      const text: FakeText = { nodeType: 3, nodeValue: child };
      return text;
    }
    return build(child);
  });

  const el: Record<string, unknown> = {
    localName: spec.tag,
    namespaceURI: spec.ns ?? (spec.tag === 'svg' ? SVG_NS : 'http://www.w3.org/1999/xhtml'),
    nodeType: 1,
    attributes: attrs,
    childNodes,
    offsetWidth: rect.width,
    ownerDocument: doc,
    getBoundingClientRect: () => rect,
    getAttribute: (name: string) => spec.attrs?.[name] ?? null,
  };

  styles.set(el, spec.style ?? {});
  if (spec.pseudos) pseudoStyles.set(el, spec.pseudos);
  return el;
}

/** Give a text child a laid-out box (what a Range would report). */
function withTextRect(host: Record<string, unknown>, index: number, rect: FakeRect): void {
  const node = (host['childNodes'] as unknown[])[index] as object;
  textRects.set(node, rect);
}

const NODE_RECT = { x: 40, y: 20, width: 200, height: 100 };
const capture = (host: unknown) => captureCustomNodeHost('w1', NODE_RECT, host);

const find = (nodes: VNode[], type: string): VNode | undefined => nodes.find(n => n.type === type);

// -- tests --------------------------------------------------------------------

describe('captureCustomNodeHost — inline SVG is lifted as real vector', () => {
  it('lifts chart geometry and bakes the viewBox fit into a transform', () => {
    // A 640x250 chart laid out into a 200x100 box: uniform scale min(200/640, 100/250)
    // = 0.3125, which draws 78.125px tall and leaves 21.875px of vertical slack to be
    // split evenly — the browser's `meet` fit, resolved here so that the PDF painter
    // and the bounds walker, neither of which implements nested-<svg> viewBox mapping,
    // still place it correctly.
    const host = build({
      tag: 'div',
      rect: { left: 0, top: 0, width: 200, height: 100 },
      children: [
        {
          tag: 'svg',
          attrs: { viewBox: '0 0 640 250', preserveAspectRatio: 'xMidYMid meet' },
          rect: { left: 0, top: 0, width: 200, height: 100 },
          children: [
            {
              tag: 'path',
              ns: SVG_NS,
              attrs: { d: 'M0,0 A66,66 0 0 1 10,10' },
              style: { stroke: 'rgb(59, 82, 217)', 'stroke-width': '26px', fill: 'none' },
            },
          ],
        },
      ],
    });

    const result = capture(host);
    expect(result.fidelity).toBe('vector');

    const lifted = find(result.content as VNode[], 'g');
    expect(lifted?.props['transform']).toBe('translate(0 0) translate(0 10.9375) scale(0.3125)');

    const path = lifted?.children?.[0] as VNode;
    expect(path.type).toBe('path');
    // Authored geometry, verbatim.
    expect(path.props['d']).toBe('M0,0 A66,66 0 0 1 10,10');
  });

  it('RESOLVES var(--…) paint through computed style', () => {
    // The kit writes `stroke="var(--axdb-grid)"` as an ATTRIBUTE. Copying attributes
    // verbatim would put `var(--axdb-grid)` in a standalone file, where nothing defines
    // it — the gridline would vanish. Computed style is what turns it into a colour.
    const host = build({
      tag: 'div',
      rect: { left: 0, top: 0, width: 100, height: 100 },
      children: [
        {
          tag: 'svg',
          attrs: { viewBox: '0 0 100 100' },
          rect: { left: 0, top: 0, width: 100, height: 100 },
          children: [
            {
              tag: 'line',
              ns: SVG_NS,
              attrs: { x1: '0', y1: '5', x2: '100', y2: '5', stroke: 'var(--axdb-grid)' },
              style: { stroke: 'rgba(120, 130, 148, 0.22)' },
            },
          ],
        },
      ],
    });

    const line = (find(capture(host).content as VNode[], 'g')?.children?.[0] as VNode).props;
    expect(line['stroke']).toBe('rgba(120, 130, 148, 0.22)');
    expect(JSON.stringify(line)).not.toContain('var(--');
  });

  it('carries SVG text content across', () => {
    const host = build({
      tag: 'div',
      rect: { left: 0, top: 0, width: 100, height: 100 },
      children: [
        {
          tag: 'svg',
          attrs: { viewBox: '0 0 100 100' },
          rect: { left: 0, top: 0, width: 100, height: 100 },
          children: [
            {
              tag: 'text',
              ns: SVG_NS,
              attrs: { x: '50', y: '50' },
              style: { fill: 'rgb(31, 36, 48)', 'font-size': '20px' },
              children: ['6.8M'],
            },
          ],
        },
      ],
    });

    const text = find(capture(host).content as VNode[], 'g')?.children?.[0] as VNode;
    expect(text.props['textContent']).toBe('6.8M');
    expect(text.props['fill']).toBe('rgb(31, 36, 48)');
  });

  it('drops class and style attributes, which mean nothing in a standalone file', () => {
    const host = build({
      tag: 'div',
      rect: { left: 0, top: 0, width: 100, height: 100 },
      children: [
        {
          tag: 'svg',
          attrs: { viewBox: '0 0 100 100', class: 'axdb-kpi-s' },
          rect: { left: 0, top: 0, width: 100, height: 100 },
          children: [
            {
              tag: 'rect',
              ns: SVG_NS,
              attrs: { x: '0', y: '0', width: '10', height: '10', class: 'mark', style: 'fill:red' },
              style: { fill: 'rgb(255, 0, 0)' },
            },
          ],
        },
      ],
    });

    const mark = (find(capture(host).content as VNode[], 'g')?.children?.[0] as VNode).props;
    expect(mark['class']).toBeUndefined();
    expect(mark['style']).toBeUndefined();
    expect(mark['fill']).toBe('rgb(255, 0, 0)');
  });
});

describe('captureCustomNodeHost — HTML text becomes <text>', () => {
  it('emits a text run at its laid-out position with the resolved font', () => {
    // The KPI headline is a plain <div>. No SVG is involved anywhere near it, so
    // "lift the inline svg" alone would export the widget WITHOUT its number.
    const host = build({
      tag: 'div',
      rect: { left: 0, top: 0, width: 200, height: 100 },
      style: {},
      children: [
        {
          tag: 'div',
          rect: { left: 0, top: 10, width: 200, height: 30 },
          style: {
            'font-size': '26px',
            'font-weight': '700',
            color: 'rgb(31, 36, 48)',
            'font-family': 'Inter, sans-serif',
          },
          children: ['$6.8M'],
        },
      ],
    });
    withTextRect((host['childNodes'] as Record<string, unknown>[])[0], 0, {
      left: 0,
      top: 10,
      width: 80,
      height: 30,
    });

    const text = find(capture(host).content as VNode[], 'text');
    expect(text?.props['textContent']).toBe('$6.8M');
    expect(text?.props['font-size']).toBe(26);
    expect(text?.props['font-weight']).toBe('700');
    expect(text?.props['fill']).toBe('rgb(31, 36, 48)');
    // Baseline derived from the line box centre: 10 + 15 + 26*0.36.
    expect(text?.props['y']).toBeCloseTo(34.36, 4);
  });

  it('maps text-align to text-anchor and moves the anchor point with it', () => {
    const host = build({
      tag: 'div',
      rect: { left: 0, top: 0, width: 200, height: 100 },
      children: [
        {
          tag: 'div',
          rect: { left: 0, top: 0, width: 200, height: 20 },
          style: { 'text-align': 'center', 'font-size': '10px' },
          children: ['total'],
        },
      ],
    });
    withTextRect((host['childNodes'] as Record<string, unknown>[])[0], 0, {
      left: 0,
      top: 0,
      width: 200,
      height: 20,
    });

    const text = find(capture(host).content as VNode[], 'text');
    expect(text?.props['text-anchor']).toBe('middle');
    expect(text?.props['x']).toBe(100);
  });

  it('applies text-transform — the DOM says "Total revenue", the SCREEN says "TOTAL REVENUE"', () => {
    // The kit's widget headers are `text-transform: uppercase`. The transform is applied
    // by the renderer and never written back to the text node, so capturing nodeValue
    // verbatim produces an export whose every title is subtly but visibly wrong.
    const host = build({
      tag: 'div',
      rect: { left: 0, top: 0, width: 200, height: 100 },
      children: [
        {
          tag: 'div',
          rect: { left: 0, top: 0, width: 200, height: 14 },
          style: { 'text-transform': 'uppercase', 'font-size': '10px', 'letter-spacing': '0.4px' },
          children: ['Total revenue'],
        },
      ],
    });
    withTextRect((host['childNodes'] as Record<string, unknown>[])[0], 0, {
      left: 0,
      top: 0,
      width: 90,
      height: 14,
    });

    const text = find(capture(host).content as VNode[], 'text');
    expect(text?.props['textContent']).toBe('TOTAL REVENUE');
    expect(text?.props['letter-spacing']).toBe(0.4);
  });

  it('honours lowercase and capitalize too', () => {
    const one = (transform: string, value: string) => {
      const host = build({
        tag: 'div',
        rect: { left: 0, top: 0, width: 200, height: 100 },
        children: [
          {
            tag: 'div',
            rect: { left: 0, top: 0, width: 200, height: 14 },
            style: { 'text-transform': transform, 'font-size': '10px' },
            children: [value],
          },
        ],
      });
      withTextRect((host['childNodes'] as Record<string, unknown>[])[0], 0, {
        left: 0,
        top: 0,
        width: 90,
        height: 14,
      });
      return find(capture(host).content as VNode[], 'text')?.props['textContent'];
    };

    expect(one('lowercase', 'WIN RATE')).toBe('win rate');
    expect(one('capitalize', 'win rate')).toBe('Win Rate');
    expect(one('none', 'Win rate')).toBe('Win rate');
  });

  it('collapses whitespace and skips blank runs', () => {
    const host = build({
      tag: 'div',
      rect: { left: 0, top: 0, width: 200, height: 100 },
      children: [
        {
          tag: 'div',
          rect: { left: 0, top: 0, width: 200, height: 20 },
          style: { 'font-size': '10px' },
          children: ['  Revenue   by  region \n', '   '],
        },
      ],
    });
    const inner = (host['childNodes'] as Record<string, unknown>[])[0];
    withTextRect(inner, 0, { left: 0, top: 0, width: 100, height: 20 });
    withTextRect(inner, 1, { left: 0, top: 0, width: 100, height: 20 });

    const texts = (capture(host).content as VNode[]).filter(n => n.type === 'text');
    expect(texts).toHaveLength(1);
    expect(texts[0].props['textContent']).toBe('Revenue by region');
  });
});

describe('captureCustomNodeHost — boxes', () => {
  it('emits a filled rect for a background and a stroked rect for a uniform border', () => {
    const host = build({
      tag: 'div',
      rect: { left: 0, top: 0, width: 200, height: 100 },
      style: {
        'background-color': 'rgb(255, 255, 255)',
        'border-top-left-radius': '12px',
        'border-top-width': '1px',
        'border-right-width': '1px',
        'border-bottom-width': '1px',
        'border-left-width': '1px',
        'border-top-color': 'rgb(231, 234, 241)',
        'border-right-color': 'rgb(231, 234, 241)',
        'border-bottom-color': 'rgb(231, 234, 241)',
        'border-left-color': 'rgb(231, 234, 241)',
        'border-top-style': 'solid',
        'border-right-style': 'solid',
        'border-bottom-style': 'solid',
        'border-left-style': 'solid',
      },
    });

    const rects = (capture(host).content as VNode[]).filter(n => n.type === 'rect');
    expect(rects[0].props).toMatchObject({ width: 200, height: 100, rx: 12, fill: 'rgb(255, 255, 255)' });
    // A CSS border paints INSIDE the box; an SVG stroke straddles the path, so the
    // rect is inset by half the border or the card grows by a pixel.
    expect(rects[1].props).toMatchObject({
      x: 0.5,
      y: 0.5,
      width: 199,
      height: 99,
      fill: 'none',
      stroke: 'rgb(231, 234, 241)',
      'stroke-width': 1,
    });
  });

  it('emits a line per side when the border is not uniform — a table rule survives', () => {
    const host = build({
      tag: 'div',
      rect: { left: 0, top: 10, width: 200, height: 24 },
      style: {
        'border-bottom-width': '1px',
        'border-bottom-color': 'rgb(231, 234, 241)',
        'border-bottom-style': 'solid',
      },
    });

    const lines = (capture(host).content as VNode[]).filter(n => n.type === 'line');
    expect(lines).toHaveLength(1);
    expect(lines[0].props).toMatchObject({ x1: 0, y1: 23.5, x2: 200, y2: 23.5 });
  });

  it('ignores a fully transparent background', () => {
    const host = build({
      tag: 'div',
      rect: { left: 0, top: 0, width: 200, height: 100 },
      style: { 'background-color': 'rgba(0, 0, 0, 0)' },
      children: [{ tag: 'div', rect: { left: 0, top: 0, width: 10, height: 10 }, style: { 'background-color': 'rgb(1, 2, 3)' } }],
    });

    const rects = (capture(host).content as VNode[]).filter(n => n.type === 'rect');
    expect(rects).toHaveLength(1);
    expect(rects[0].props['fill']).toBe('rgb(1, 2, 3)');
  });
});

describe('captureCustomNodeHost — CSS gradients become gradient paint servers', () => {
  const gradientHost = (backgroundImage: string) =>
    build({
      tag: 'div',
      rect: { left: 0, top: 0, width: 200, height: 100 },
      style: { 'background-image': backgroundImage },
    });

  it('transcribes a linear-gradient into a userSpaceOnUse <linearGradient> the box fills with', () => {
    const content = capture(
      gradientHost('linear-gradient(90deg, rgb(255, 0, 0) 0%, rgb(0, 0, 255) 100%)')
    ).content as VNode[];

    const grad = find(content, 'linearGradient');
    const rect = find(content, 'rect');
    expect(grad).toBeDefined();
    // The box's fill references THIS gradient's id — not merely "a gradient exists".
    expect(rect?.props['fill']).toBe(`url(#${grad?.props['id']})`);
    expect(grad?.props['gradientUnits']).toBe('userSpaceOnUse');

    // The stops are actually red → blue (a "no foreignObject" assertion would pass on an
    // empty gradient; this pins the colours).
    const stops = grad?.children as VNode[];
    expect(stops.map(s => s.props['stop-color'])).toEqual(['rgb(255, 0, 0)', 'rgb(0, 0, 255)']);
    expect(stops.map(s => s.props['offset'])).toEqual([0, 1]);
  });

  it('90deg is a HORIZONTAL line and 0deg is a VERTICAL one — proves the angle maths', () => {
    const horiz = find(
      capture(gradientHost('linear-gradient(90deg, rgb(1,2,3), rgb(4,5,6))')).content as VNode[],
      'linearGradient'
    )?.props as Record<string, number>;
    // 90deg → to the right: y1 === y2, x1 < x2, spanning the full width.
    expect(horiz['y1']).toBe(horiz['y2']);
    expect(horiz['x1']).toBeLessThan(horiz['x2']);
    expect(horiz['x2'] - horiz['x1']).toBeCloseTo(200, 4);
    expect(horiz['y1']).toBeCloseTo(50, 4);

    const vert = find(
      capture(gradientHost('linear-gradient(0deg, rgb(1,2,3), rgb(4,5,6))')).content as VNode[],
      'linearGradient'
    )?.props as Record<string, number>;
    // 0deg → to the top: x1 === x2, and the END is ABOVE the start (smaller y).
    expect(vert['x1']).toBe(vert['x2']);
    expect(vert['y2']).toBeLessThan(vert['y1']);
    expect(vert['y1'] - vert['y2']).toBeCloseTo(100, 4);
  });

  it('distributes stops with no explicit position evenly across [0,1]', () => {
    const grad = find(
      capture(
        gradientHost('linear-gradient(90deg, rgb(1,1,1), rgb(2,2,2), rgb(3,3,3))')
      ).content as VNode[],
      'linearGradient'
    );
    expect((grad?.children as VNode[]).map(s => s.props['offset'])).toEqual([0, 0.5, 1]);
  });

  it('transcribes a radial-gradient into a userSpaceOnUse <radialGradient>', () => {
    const content = capture(
      gradientHost('radial-gradient(rgb(255, 0, 0), rgb(0, 0, 255))')
    ).content as VNode[];
    const grad = find(content, 'radialGradient');
    const rect = find(content, 'rect');
    expect(grad?.props['gradientUnits']).toBe('userSpaceOnUse');
    expect(rect?.props['fill']).toBe(`url(#${grad?.props['id']})`);
    // Centre of a 200x100 box; default farthest-corner radius = sqrt(100^2+50^2).
    expect(grad?.props['cx']).toBeCloseTo(100, 4);
    expect(grad?.props['cy']).toBeCloseTo(50, 4);
    expect(grad?.props['r']).toBeCloseTo(Math.hypot(100, 50), 3);
  });

  it('two boxes with the SAME gradient share ONE def (deduped by id)', () => {
    const host = build({
      tag: 'div',
      rect: { left: 0, top: 0, width: 200, height: 100 },
      style: { 'background-image': 'linear-gradient(90deg, rgb(1,2,3), rgb(4,5,6))' },
      children: [
        {
          tag: 'div',
          rect: { left: 0, top: 0, width: 200, height: 100 },
          style: { 'background-image': 'linear-gradient(90deg, rgb(1,2,3), rgb(4,5,6))' },
        },
      ],
    });
    const grads = (capture(host).content as VNode[]).filter(n => n.type === 'linearGradient');
    expect(grads).toHaveLength(1);
  });
});

describe('captureCustomNodeHost — box-shadow becomes a drop-shadow filter', () => {
  it('emits a feDropShadow filter and applies it to the background box', () => {
    const content = capture(
      build({
        tag: 'div',
        rect: { left: 0, top: 0, width: 200, height: 100 },
        style: {
          'background-color': 'rgb(255, 255, 255)',
          'box-shadow': 'rgba(0, 0, 0, 0.25) 2px 4px 12px 0px',
        },
      })
    ).content as VNode[];

    const filter = find(content, 'filter');
    const drop = filter?.children?.[0] as VNode;
    const rect = find(content, 'rect');
    expect(drop.type).toBe('feDropShadow');
    expect(drop.props['dx']).toBe(2);
    expect(drop.props['dy']).toBe(4);
    // CSS blur radius maps to feGaussianBlur std-deviation ≈ radius/2, so a 12px CSS
    // blur is a std-deviation of 6 — matching how the serializer already translates blur.
    expect(drop.props['stdDeviation']).toBe(6);
    expect(drop.props['flood-color']).toBe('rgba(0, 0, 0, 0.25)');
    // The box wears the filter.
    expect(rect?.props['filter']).toBe(`url(#${filter?.props['id']})`);
  });

  it('skips an inset shadow and reports it, rather than drawing it wrong', () => {
    const result = capture(
      build({
        tag: 'div',
        rect: { left: 0, top: 0, width: 200, height: 100 },
        style: {
          'background-color': 'rgb(255, 255, 255)',
          'box-shadow': 'rgba(0, 0, 0, 0.25) 0px 2px 4px 0px inset',
        },
      })
    );
    expect((result.content as VNode[]).find(n => n.type === 'filter')).toBeUndefined();
    expect(result.warning ?? '').toMatch(/inset/i);
  });
});

describe('captureCustomNodeHost — images become <image>', () => {
  it('emits an <image> for an <img> at its laid-out box', () => {
    const host = build({
      tag: 'img',
      rect: { left: 0, top: 0, width: 120, height: 80 },
      attrs: { src: 'https://example.com/logo.png' },
    });
    const content = capture(host).content as VNode[];
    const image = find(content, 'image');
    expect(image).toBeDefined();
    expect(image?.props['href']).toBe('https://example.com/logo.png');
    expect(image?.props).toMatchObject({ x: 0, y: 0, width: 120, height: 80 });
  });

  it('reports an EXTERNAL image as a PDF fidelity risk — the PDF cannot fetch it', () => {
    const result = capture(
      build({ tag: 'img', rect: { left: 0, top: 0, width: 10, height: 10 }, attrs: { src: 'https://x/y.png' } })
    );
    expect(result.warning ?? '').toMatch(/PDF/);
  });

  it('does NOT flag a data: URI image as a PDF risk — the PDF embeds those now', () => {
    // The blanket warning predates the PDF writer's image XObjects (b2854b0a1).
    // A data: PNG/JPEG is embedded by the PDF painter, which carries its OWN
    // precise warnings for the forms it refuses (interlaced, 16-bit, CMYK…).
    // A capture-time blanket would re-assert a fixed limitation forever.
    const result = capture(
      build({ tag: 'img', rect: { left: 0, top: 0, width: 10, height: 10 },
        attrs: { src: 'data:image/png;base64,AAAA' } })
    );
    expect(result.warning ?? '').not.toMatch(/MISSING from a PDF/);
  });
});

describe('captureCustomNodeHost — what must not be captured', () => {
  it('skips display:none and visibility:hidden subtrees', () => {
    const host = build({
      tag: 'div',
      rect: { left: 0, top: 0, width: 200, height: 100 },
      children: [
        { tag: 'div', rect: { left: 0, top: 0, width: 10, height: 10 }, style: { display: 'none', 'background-color': 'red' } },
        { tag: 'div', rect: { left: 0, top: 0, width: 10, height: 10 }, style: { visibility: 'hidden', 'background-color': 'red' } },
      ],
    });

    expect(capture(host).fidelity).toBe('empty');
  });

  it('skips fully transparent chrome — the hover-revealed resize handle is not on screen', () => {
    const host = build({
      tag: 'div',
      rect: { left: 0, top: 0, width: 200, height: 100 },
      children: [
        {
          tag: 'div',
          rect: { left: 182, top: 82, width: 18, height: 18 },
          style: { opacity: '0', 'background-color': 'rgb(120, 130, 148)' },
        },
      ],
    });

    expect(capture(host).fidelity).toBe('empty');
  });
});

describe('captureCustomNodeHost — the camera zoom is divided back out', () => {
  it('reports layout coordinates, not screen coordinates', () => {
    // The html layer carries the camera as a CSS transform, so client rects come back
    // multiplied by the zoom. offsetWidth is layout space and does not, so their ratio
    // IS the zoom. At 2x, a child 40 screen-px in is 20 layout-px in.
    const host = build({
      tag: 'div',
      rect: { left: 100, top: 100, width: 400, height: 200 },
      children: [
        {
          tag: 'div',
          rect: { left: 140, top: 120, width: 200, height: 40 },
          style: { 'background-color': 'rgb(1, 2, 3)' },
        },
      ],
    });
    host['offsetWidth'] = 200; // 400 client / 200 layout ⇒ zoom 2

    const rect = find(capture(host).content as VNode[], 'rect');
    expect(rect?.props).toMatchObject({ x: 20, y: 10, width: 100, height: 20 });
  });

  it('exports identically at any zoom', () => {
    const at = (zoom: number) => {
      const host = build({
        tag: 'div',
        rect: { left: 0, top: 0, width: 200 * zoom, height: 100 * zoom },
        children: [
          {
            tag: 'div',
            rect: { left: 10 * zoom, top: 20 * zoom, width: 50 * zoom, height: 30 * zoom },
            style: { 'background-color': 'rgb(1, 2, 3)' },
          },
        ],
      });
      host['offsetWidth'] = 200;
      return JSON.stringify(capture(host).content);
    };

    expect(at(1)).toBe(at(3));
  });
});

describe('captureCustomNodeHost — never throws', () => {
  it('degrades a null host to empty', () => {
    expect(capture(null).fidelity).toBe('empty');
  });

  it('degrades a host with no window to empty', () => {
    expect(capture({ ownerDocument: null }).fidelity).toBe('empty');
  });

  it('degrades a host that throws mid-walk to empty', () => {
    const host = build({ tag: 'div', rect: { left: 0, top: 0, width: 10, height: 10 } });
    host['getBoundingClientRect'] = () => {
      throw new Error('detached');
    };
    expect(capture(host).fidelity).toBe('empty');
  });

  it('always carries the node rect through, even on failure', () => {
    expect(capture(null).rect).toEqual(NODE_RECT);
    expect(capture(null).id).toBe('w1');
  });
});

describe('captureCustomNodeHost — pseudo-elements (::before / ::after)', () => {
  it('emits ::before content text at the origin flow start, through the SAME text path — text-transform holds', () => {
    // A pseudo-element has no element to getBoundingClientRect(). Its box is DERIVED:
    // a static ::before flows at the origin's content start (border + padding in), and
    // its line box comes from its own font. The text goes through the same emission as
    // real text nodes, so text-transform / colour / tracking behave identically.
    const host = build({
      tag: 'div',
      rect: { left: 0, top: 0, width: 200, height: 100 },
      style: {
        'border-left-width': '2px',
        'border-top-width': '2px',
        'padding-left': '12px',
        'padding-top': '8px',
      },
      pseudos: {
        '::before': {
          content: '"beta flag"',
          'text-transform': 'uppercase',
          color: 'rgb(0, 140, 60)',
          'font-size': '10px',
        },
      },
    });

    const text = find(capture(host).content as VNode[], 'text');
    expect(text?.props['textContent']).toBe('BETA FLAG');
    expect(text?.props['fill']).toBe('rgb(0, 140, 60)');
    // Flow start: border-left 2 + padding-left 12.
    expect(text?.props['x']).toBe(14);
    // Line box top = border-top 2 + padding-top 8; height = font-size * 1.2 (no
    // line-height given): baseline = 10 + 6 + 10 * 0.36.
    expect(text?.props['y']).toBeCloseTo(19.6, 4);
  });

  it('a decorative ::before (content:"") with an absolute box becomes its background rect', () => {
    const host = build({
      tag: 'div',
      rect: { left: 0, top: 0, width: 200, height: 100 },
      pseudos: {
        '::before': {
          content: '""',
          position: 'absolute',
          left: '8px',
          top: '6px',
          width: '24px',
          height: '4px',
          'background-color': 'rgb(255, 0, 0)',
        },
      },
    });

    const rect = find(capture(host).content as VNode[], 'rect');
    expect(rect?.props).toMatchObject({ x: 8, y: 6, width: 24, height: 4, fill: 'rgb(255, 0, 0)' });
  });

  it('a ::before with a gradient background reuses the paint-server path', () => {
    const host = build({
      tag: 'div',
      rect: { left: 0, top: 0, width: 200, height: 100 },
      pseudos: {
        '::before': {
          content: '""',
          position: 'absolute',
          left: '0px',
          top: '0px',
          width: '100px',
          height: '10px',
          'background-image': 'linear-gradient(90deg, rgb(1,2,3), rgb(4,5,6))',
        },
      },
    });

    const content = capture(host).content as VNode[];
    const grad = find(content, 'linearGradient');
    const rect = find(content, 'rect');
    expect(grad).toBeDefined();
    expect(rect?.props['fill']).toBe(`url(#${grad?.props['id']})`);
  });

  it('content: none / normal generate no pseudo box at all', () => {
    const one = (content: string) =>
      capture(
        build({
          tag: 'div',
          rect: { left: 0, top: 0, width: 200, height: 100 },
          pseudos: {
            '::before': { content, 'background-color': 'rgb(255, 0, 0)', width: '10px', height: '10px' },
          },
        })
      );
    expect(one('none').fidelity).toBe('empty');
    expect(one('normal').fidelity).toBe('empty');
  });

  it('attr()/counter()/url() content is skipped and reported; a sized box still paints', () => {
    const result = capture(
      build({
        tag: 'div',
        rect: { left: 0, top: 0, width: 200, height: 100 },
        pseudos: {
          '::before': {
            content: 'attr(data-badge)',
            position: 'absolute',
            left: '0px',
            top: '0px',
            width: '10px',
            height: '10px',
            'background-color': 'rgb(1, 2, 3)',
          },
        },
      })
    );

    expect(result.warning ?? '').toMatch(/content/i);
    const content = result.content as VNode[];
    expect(find(content, 'rect')?.props['fill']).toBe('rgb(1, 2, 3)');
    expect(find(content, 'text')).toBeUndefined();
  });

  it('a painted ::after that flows after content it cannot measure is skipped and reported', () => {
    const host = build({
      tag: 'div',
      rect: { left: 0, top: 0, width: 200, height: 100 },
      style: { 'font-size': '10px' },
      children: ['Total'],
      pseudos: { '::after': { content: '"→"', 'font-size': '10px', color: 'rgb(1, 2, 3)' } },
    });
    withTextRect(host, 0, { left: 0, top: 0, width: 40, height: 12 });

    const result = capture(host);
    const texts = (result.content as VNode[]).filter(n => n.type === 'text');
    expect(texts).toHaveLength(1); // the real text run only — no guessed arrow position
    expect(texts[0].props['textContent']).toBe('Total');
    expect(result.warning ?? '').toMatch(/::after/);
  });

  it('an ::after on an origin with no other content flows at the start, like ::before', () => {
    const host = build({
      tag: 'div',
      rect: { left: 0, top: 0, width: 200, height: 100 },
      pseudos: { '::after': { content: '"done"', 'font-size': '10px', color: 'rgb(1, 2, 3)' } },
    });

    const text = find(capture(host).content as VNode[], 'text');
    expect(text?.props['textContent']).toBe('done');
    expect(text?.props['x']).toBe(0);
    expect(text?.props['y']).toBeCloseTo(9.6, 4);
  });

  it('a painted pseudo whose box cannot be derived is reported, not guessed', () => {
    const result = capture(
      build({
        tag: 'div',
        rect: { left: 0, top: 0, width: 200, height: 100 },
        style: { 'background-color': 'rgb(9, 9, 9)' },
        // width is auto and there is no text — nothing derivable to draw.
        pseudos: { '::before': { content: '""', 'background-color': 'rgb(255, 0, 0)' } },
      })
    );

    const rects = (result.content as VNode[]).filter(n => n.type === 'rect');
    expect(rects).toHaveLength(1); // the origin's own background only
    expect(rects[0].props['fill']).toBe('rgb(9, 9, 9)');
    expect(result.warning ?? '').toMatch(/derive/i);
  });
});

describe('captureCustomNodeHost — overflow clipping', () => {
  const CLIPPED_CARD = () =>
    build({
      tag: 'div',
      rect: { left: 0, top: 0, width: 200, height: 100 },
      style: {
        overflow: 'hidden',
        'border-top-left-radius': '16px',
        'background-color': 'rgb(255, 255, 255)',
      },
      children: [
        {
          tag: 'div',
          rect: { left: -20, top: -20, width: 240, height: 140 },
          style: { 'background-color': 'rgb(220, 0, 0)' },
        },
      ],
    });

  it('overflow:hidden + border-radius wraps DESCENDANTS in a rounded <clipPath>; the box itself stays outside', () => {
    const content = capture(CLIPPED_CARD()).content as VNode[];

    const clipDef = find(content, 'clipPath');
    expect(clipDef).toBeDefined();
    const shape = clipDef?.children?.[0] as VNode;
    expect(shape.type).toBe('rect');
    expect(shape.props).toMatchObject({ x: 0, y: 0, width: 200, height: 100, rx: 16 });

    // The group references THIS clip's id — not merely "a clipPath exists somewhere".
    const group = content.find(
      n => n.type === 'g' && n.props['clip-path'] === `url(#${clipDef?.props['id']})`
    ) as VNode;
    expect(group).toBeDefined();

    // The bleeding child is INSIDE the clip group…
    const inGroup = group.children as VNode[];
    expect(inGroup.some(c => c.type === 'rect' && c.props['fill'] === 'rgb(220, 0, 0)')).toBe(true);
    // …and the card's own background is NOT — overflow clips content, not the box.
    expect(content.some(c => c.type === 'rect' && c.props['fill'] === 'rgb(255, 255, 255)')).toBe(true);
    expect(inGroup.some(c => c.props['fill'] === 'rgb(255, 255, 255)')).toBe(false);
  });

  it('nested overflow:hidden composes as nested clip groups, each with its OWN clip', () => {
    const host = build({
      tag: 'div',
      rect: { left: 0, top: 0, width: 200, height: 100 },
      style: { overflow: 'hidden', 'border-top-left-radius': '12px' },
      children: [
        {
          tag: 'div',
          rect: { left: 10, top: 10, width: 100, height: 50 },
          style: {
            overflow: 'hidden',
            'border-top-left-radius': '8px',
            'background-color': 'rgb(0, 0, 255)',
          },
          children: [
            {
              tag: 'div',
              rect: { left: 0, top: 0, width: 300, height: 300 },
              style: { 'background-color': 'rgb(220, 0, 0)' },
            },
          ],
        },
      ],
    });

    const content = capture(host).content as VNode[];
    const defs = content.filter(n => n.type === 'clipPath');
    expect(defs).toHaveLength(2);

    const outerDef = defs.find(d => (d.children?.[0] as VNode).props['width'] === 200) as VNode;
    const innerDef = defs.find(d => (d.children?.[0] as VNode).props['width'] === 100) as VNode;
    expect((innerDef.children?.[0] as VNode).props).toMatchObject({ x: 10, y: 10, rx: 8 });

    const outerGroup = content.find(
      n => n.type === 'g' && n.props['clip-path'] === `url(#${outerDef.props['id']})`
    ) as VNode;
    expect(outerGroup).toBeDefined();

    // The inner card's OWN box is clipped by the outer clip but not by its own…
    const outerChildren = outerGroup.children as VNode[];
    expect(outerChildren.some(c => c.type === 'rect' && c.props['fill'] === 'rgb(0, 0, 255)')).toBe(true);
    // …and its bleeding grandchild sits inside the INNER clip group, inside the outer.
    const innerGroup = outerChildren.find(n => n.type === 'g') as VNode;
    expect(innerGroup.props['clip-path']).toBe(`url(#${innerDef.props['id']})`);
    expect((innerGroup.children as VNode[]).some(c => c.props['fill'] === 'rgb(220, 0, 0)')).toBe(true);
  });

  it('overflow:visible (the default) emits NO clip', () => {
    const host = build({
      tag: 'div',
      rect: { left: 0, top: 0, width: 200, height: 100 },
      children: [
        {
          tag: 'div',
          rect: { left: 0, top: 0, width: 240, height: 140 },
          style: { 'background-color': 'rgb(220, 0, 0)' },
        },
      ],
    });

    const content = capture(host).content as VNode[];
    expect(content.some(n => n.type === 'clipPath')).toBe(false);
    expect(content.some(n => n.type === 'g' && n.props['clip-path'] !== undefined)).toBe(false);
  });

  it('square overflow:hidden still clips — bleed is not a rounded-corner-only problem', () => {
    const host = build({
      tag: 'div',
      rect: { left: 0, top: 0, width: 200, height: 100 },
      style: { overflow: 'hidden' },
      children: [
        {
          tag: 'div',
          rect: { left: 0, top: 0, width: 400, height: 100 },
          style: { 'background-color': 'rgb(220, 0, 0)' },
        },
      ],
    });

    const clipDef = find(capture(host).content as VNode[], 'clipPath');
    const shape = clipDef?.children?.[0] as VNode;
    expect(shape?.props).toMatchObject({ x: 0, y: 0, width: 200, height: 100 });
    expect(shape?.props['rx']).toBeUndefined();
  });

  it('a clipped element with no painted descendants emits neither group nor def', () => {
    const content = capture(
      build({
        tag: 'div',
        rect: { left: 0, top: 0, width: 200, height: 100 },
        style: { overflow: 'hidden', 'background-color': 'rgb(255, 255, 255)' },
      })
    ).content as VNode[];

    expect(content.some(n => n.type === 'clipPath')).toBe(false);
    expect(content.some(n => n.type === 'g')).toBe(false);
    expect(find(content, 'rect')).toBeDefined(); // the background still paints
  });

  it('two identical clip shapes share ONE def', () => {
    const cell = (): FakeElSpec => ({
      tag: 'div',
      rect: { left: 0, top: 0, width: 50, height: 50 },
      style: { overflow: 'hidden', 'border-top-left-radius': '6px' },
      children: [
        {
          tag: 'div',
          rect: { left: 0, top: 0, width: 80, height: 80 },
          style: { 'background-color': 'rgb(220, 0, 0)' },
        },
      ],
    });
    const host = build({
      tag: 'div',
      rect: { left: 0, top: 0, width: 200, height: 100 },
      children: [cell(), cell()],
    });

    const content = capture(host).content as VNode[];
    const defs = content.filter(n => n.type === 'clipPath');
    expect(defs).toHaveLength(1);
    const groups = content.filter(n => n.type === 'g' && n.props['clip-path'] !== undefined);
    expect(groups).toHaveLength(2);
    expect(groups.every(g => g.props['clip-path'] === `url(#${defs[0].props['id']})`)).toBe(true);
  });

  it('does NOT report clipping as a PDF risk — the PDF painter applies these clips', () => {
    // The capture emits exactly the clip contract the PDF consumes (one shape
    // child, host-local user space, referenced by <g clip-path>): proven by
    // rasterizing the exported PDF — the rounded corners are visibly clipped.
    // Warning a caller about a limitation that no longer exists is the same
    // defect as staying silent about one that does.
    expect(capture(CLIPPED_CARD()).warning ?? '').not.toMatch(/BLEED in a PDF/);
  });
});

describe('captureCustomNodeHost — clip-path basic shapes', () => {
  const withClipPath = (clipPath: string) =>
    build({
      tag: 'div',
      rect: { left: 0, top: 0, width: 200, height: 100 },
      style: { 'clip-path': clipPath, 'background-color': 'rgb(1, 2, 3)' },
    });

  it('inset() clips the element ITSELF — its own background rides inside the clip group', () => {
    const content = capture(withClipPath('inset(10px 20px 30px 40px round 6px)')).content as VNode[];

    const clipDef = find(content, 'clipPath');
    const shape = clipDef?.children?.[0] as VNode;
    expect(shape.type).toBe('rect');
    expect(shape.props).toMatchObject({ x: 40, y: 10, width: 140, height: 60, rx: 6 });

    const group = content.find(
      n => n.type === 'g' && n.props['clip-path'] === `url(#${clipDef?.props['id']})`
    ) as VNode;
    expect(group).toBeDefined();
    // clip-path clips the element's own paint too — the background is INSIDE the group.
    expect((group.children as VNode[]).some(c => c.type === 'rect' && c.props['fill'] === 'rgb(1, 2, 3)')).toBe(true);
    expect(content.some(c => c.type === 'rect' && c.props['fill'] === 'rgb(1, 2, 3)')).toBe(false);
  });

  it('circle() resolves percentage centres against the box', () => {
    const shape = (find(capture(withClipPath('circle(40px at 25% 50%)')).content as VNode[], 'clipPath')
      ?.children?.[0]) as VNode;
    expect(shape.type).toBe('circle');
    expect(shape.props).toMatchObject({ cx: 50, cy: 50, r: 40 });
  });

  it('circle() with no radius defaults to closest-side', () => {
    const shape = (find(capture(withClipPath('circle(at 50% 50%)')).content as VNode[], 'clipPath')
      ?.children?.[0]) as VNode;
    expect(shape.props).toMatchObject({ cx: 100, cy: 50, r: 50 });
  });

  it('ellipse() carries both radii', () => {
    const shape = (find(capture(withClipPath('ellipse(60px 30px at 50% 50%)')).content as VNode[], 'clipPath')
      ?.children?.[0]) as VNode;
    expect(shape.type).toBe('ellipse');
    expect(shape.props).toMatchObject({ cx: 100, cy: 50, rx: 60, ry: 30 });
  });

  it('polygon() resolves percentage vertices against the box', () => {
    const shape = (find(capture(withClipPath('polygon(0% 0%, 100% 0%, 50% 100%)')).content as VNode[], 'clipPath')
      ?.children?.[0]) as VNode;
    expect(shape.type).toBe('polygon');
    expect(shape.props['points']).toBe('0,0 200,0 100,100');
  });

  it('path()/url() are skipped and reported — the content exports UNCLIPPED, not wrong', () => {
    const result = capture(withClipPath('path("M 0 0 H 10 V 10 Z")'));
    const content = result.content as VNode[];
    expect(content.some(n => n.type === 'clipPath')).toBe(false);
    // The background still paints, at top level (no group).
    expect(find(content, 'rect')?.props['fill']).toBe('rgb(1, 2, 3)');
    expect(result.warning ?? '').toMatch(/clip-path/);
  });
});
