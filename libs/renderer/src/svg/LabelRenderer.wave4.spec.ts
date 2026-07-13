// LabelRenderer — Wave 4 (Edges & links)
//
// Card 5: label SLOTS, HTML labels (foreignObject), author label templates.
// Card 7: the optimizer's placement overrides the author's offset — but ONLY for
//         a label that opted into autoOffset, which is what keeps every existing
//         diagram's labels exactly where they were.

import { LabelRenderer, DEFAULT_HTML_LABEL_WIDTH, DEFAULT_HTML_LABEL_HEIGHT } from './LabelRenderer';
import { clearEdgeTemplates, registerLabelTemplate } from './edge-templates';
import { LINK_LABEL_SLOT_POSITIONS } from '@grafloria/engine';
import type { LinkLabel, LinkModel } from '@grafloria/engine';
import type { VNode } from '../types/vnode.types';

/** A link along the x axis from (0,0) to (100,0) — so t maps straight onto x. */
function horizontalLink(): LinkModel {
  return {
    getPointAtPosition: (t: number) => ({ x: 100 * t, y: 0 }),
    getAngleAt: () => 0,
    getNormalAt: () => ({ x: 0, y: 1 }),
  } as unknown as LinkModel;
}

const baseLabel = (over: Partial<LinkLabel> = {}): LinkLabel => ({
  id: 'l1',
  text: 'hello',
  position: 0.5,
  offset: { x: 0, y: 0 },
  ...over,
});

describe('LabelRenderer — Card 5: slots', () => {
  let renderer: LabelRenderer;
  beforeEach(() => (renderer = new LabelRenderer()));

  it('places a `start` slot label at the start slot position', () => {
    const vnode = renderer.renderLabel(baseLabel({ slot: 'start' }), horizontalLink())!;
    expect(vnode.props?.['transform']).toContain(`translate(${100 * LINK_LABEL_SLOT_POSITIONS.start}`);
  });

  it('places `center` and `end` slot labels at three DISTINCT points along the edge', () => {
    const at = (slot: 'start' | 'center' | 'end') => {
      const v = renderer.renderLabel(baseLabel({ slot }), horizontalLink())!;
      return String(v.props?.['transform']);
    };
    const xs = ['start', 'center', 'end'].map(s =>
      parseFloat(at(s as any).replace('translate(', ''))
    );

    expect(xs[0]).toBeLessThan(xs[1]);
    expect(xs[1]).toBeLessThan(xs[2]);
  });

  it('pulls the start/end slots clear of the endpoints, so they never sit under an arrowhead', () => {
    const v = renderer.renderLabel(baseLabel({ slot: 'end' }), horizontalLink())!;
    const x = parseFloat(String(v.props?.['transform']).replace('translate(', ''));
    expect(x).toBeLessThan(100);
    expect(x).toBeGreaterThan(50);
  });
});

describe('LabelRenderer — Card 5: HTML labels', () => {
  let renderer: LabelRenderer;
  beforeEach(() => (renderer = new LabelRenderer()));

  it('renders a foreignObject carrying the raw HTML', () => {
    const vnode = renderer.renderLabel(
      baseLabel({ html: '<b>hi</b>', width: 80, height: 24 }),
      horizontalLink()
    )!;

    const fo = vnode.children?.[0] as VNode;
    expect(fo.type).toBe('foreignObject');
    expect(fo.props?.['width']).toBe(80);
    expect((fo.children?.[0] as VNode).props?.['innerHTML']).toBe('<b>hi</b>');
  });

  it('defaults the box size (a foreignObject cannot size itself)', () => {
    const vnode = renderer.renderLabel(baseLabel({ html: '<i>x</i>' }), horizontalLink())!;
    const fo = vnode.children?.[0] as VNode;

    expect(fo.props?.['width']).toBe(DEFAULT_HTML_LABEL_WIDTH);
    expect(fo.props?.['height']).toBe(DEFAULT_HTML_LABEL_HEIGHT);
  });

  it('rotates an HTML label about its ANCHOR, not the SVG origin (a foreignObject positions itself with x/y)', () => {
    const vnode = renderer.renderLabel(
      baseLabel({ html: '<b>x</b>', rotation: 'auto', position: 0.5 }),
      horizontalLink()
    )!;

    expect(String(vnode.props?.['transform'])).toBe('rotate(0, 50, 0)');
  });

  it('renders SVG text (not HTML) when no html/template is set — the default path is untouched', () => {
    const vnode = renderer.renderLabel(baseLabel(), horizontalLink())!;
    expect(vnode.children?.some(c => (c as VNode).type === 'foreignObject')).toBeFalsy();
  });
});

describe('LabelRenderer — Card 5: author templates', () => {
  let renderer: LabelRenderer;
  beforeEach(() => (renderer = new LabelRenderer()));
  afterEach(() => clearEdgeTemplates());

  it('renders whatever the template returns', () => {
    registerLabelTemplate('badge', ctx => ({
      type: 'circle',
      props: { cx: ctx.anchor.x, cy: ctx.anchor.y, r: 8, className: 'badge' },
    }));

    const vnode = renderer.renderLabel(baseLabel({ template: 'badge' }), horizontalLink())!;
    const child = vnode.children?.[0] as VNode;

    expect(child.type).toBe('circle');
    expect(child.props?.['cx']).toBe(50);
  });

  it('accepts an ARRAY of VNodes from a template', () => {
    registerLabelTemplate('multi', () => [
      { type: 'rect', props: {} },
      { type: 'text', props: {} },
    ]);

    const vnode = renderer.renderLabel(baseLabel({ template: 'multi' }), horizontalLink())!;
    expect(vnode.children).toHaveLength(2);
  });

  it('drops the label when the template returns null (an explicit opt-out)', () => {
    registerLabelTemplate('hidden', () => null);
    expect(renderer.renderLabel(baseLabel({ template: 'hidden' }), horizontalLink())).toBeNull();
  });

  it('falls back to the built-in rendering for an UNREGISTERED template name, rather than silently dropping the label', () => {
    const vnode = renderer.renderLabel(baseLabel({ template: 'never-registered' }), horizontalLink())!;
    expect(vnode).not.toBeNull();
    expect(vnode.props?.['className']).toBe('link-label-group');
  });

  it('wins over `html` when both are set', () => {
    registerLabelTemplate('wins', () => ({ type: 'circle', props: {} }));
    const vnode = renderer.renderLabel(
      baseLabel({ template: 'wins', html: '<b>ignored</b>' }),
      horizontalLink()
    )!;

    expect((vnode.children?.[0] as VNode).type).toBe('circle');
  });
});

describe('LabelRenderer — Card 7: the optimizer\'s offset', () => {
  let renderer: LabelRenderer;
  beforeEach(() => (renderer = new LabelRenderer()));

  it('uses the offset the optimizer supplies', () => {
    const vnode = renderer.renderLabel(baseLabel(), horizontalLink(), { offset: { x: 0, y: -30 } })!;
    expect(vnode.props?.['transform']).toBe('translate(50, -30)');
  });

  it('falls back to the label\'s own offset when the optimizer supplied none', () => {
    const vnode = renderer.renderLabel(baseLabel({ offset: { x: 5, y: -10 } }), horizontalLink())!;
    expect(vnode.props?.['transform']).toBe('translate(55, -10)');
  });
});

describe('LabelRenderer — labelBox (what the optimizer collides against)', () => {
  let renderer: LabelRenderer;
  beforeEach(() => (renderer = new LabelRenderer()));

  it('reports the declared box for an HTML label', () => {
    expect(renderer.labelBox(baseLabel({ html: '<b>x</b>', width: 90, height: 30 })))
      .toEqual({ width: 90, height: 30 });
  });

  it('estimates a text label\'s box from its font size and padding', () => {
    const box = renderer.labelBox(baseLabel({ text: 'hello', style: { fontSize: 10, padding: 2 } }));
    expect(box.width).toBeCloseTo(5 * 10 * 0.6 + 4);
    expect(box.height).toBeCloseTo(10 + 4);
  });

  it('grows with the text', () => {
    const short = renderer.labelBox(baseLabel({ text: 'a' }));
    const long = renderer.labelBox(baseLabel({ text: 'a much longer label' }));
    expect(long.width).toBeGreaterThan(short.width);
  });
});
