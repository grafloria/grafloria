// ArrowRenderer — Wave 4 (Edges & links), Card 5
//
// The arrowhead catalogue used to be a CLOSED ENUM: an author who wanted a
// half-arrow, a bespoke barb or a domain-specific terminator had to fork the
// renderer. It is now open — a raw SVG path, or anything registered by name.

import { ArrowRenderer } from './ArrowRenderer';
import { clearEdgeTemplates, registerMarker } from './edge-templates';
import type { ArrowStyle } from '@grafloria/engine';

describe('ArrowRenderer — Card 5: half-arrowheads (Mermaid 11.13)', () => {
  let renderer: ArrowRenderer;
  beforeEach(() => (renderer = new ArrowRenderer()));

  it('renders a left half-arrow with only ONE barb', () => {
    const style: ArrowStyle = { type: 'half-arrow-left', size: 10, filled: true, color: '#000' };
    const vnode = renderer.renderArrow(style, 'translate(0,0)')!;

    expect(vnode.type).toBe('polygon');
    expect(String(vnode.props?.['className'])).toContain('arrow-half-left');
    // Three points: the shaft root, the tip, and one barb (a full arrow has two).
    expect(vnode.props?.['points']).toBe('0,0 10,0 0,-5');
  });

  it('mirrors the barb for the right half-arrow', () => {
    const style: ArrowStyle = { type: 'half-arrow-right', size: 10, filled: true, color: '#000' };
    expect(renderer.renderArrow(style, 't')!.props?.['points']).toBe('0,0 10,0 0,5');
  });

  it('anchors a half-arrow exactly like a full one — its tip is at +size', () => {
    const style: ArrowStyle = { type: 'half-arrow-left', size: 14, filled: true };
    expect(renderer.getTipOffset(style)).toBe(14);
    expect(renderer.getTipOffset({ type: 'arrow', size: 14, filled: true })).toBe(14);
  });
});

describe('ArrowRenderer — Card 5: raw-path markers', () => {
  let renderer: ArrowRenderer;
  beforeEach(() => (renderer = new ArrowRenderer()));

  it('draws the author\'s path verbatim', () => {
    const style: ArrowStyle = {
      type: 'custom',
      size: 10,
      filled: false,
      color: '#f00',
      path: 'M0,-6 L0,6',
    };
    const vnode = renderer.renderArrow(style, 'translate(5,5)')!;

    expect(vnode.type).toBe('path');
    expect(vnode.props?.['d']).toBe('M0,-6 L0,6');
    expect(vnode.props?.['transform']).toBe('translate(5,5)');
    expect(String(vnode.props?.['className'])).toContain('arrow-custom');
  });

  it('assumes the tip is at the ORIGIN when the author declared nothing', () => {
    expect(renderer.getTipOffset({ type: 'custom', size: 10, filled: true, path: 'M0,0' })).toBe(0);
  });

  it('honours an explicit tipOffset', () => {
    expect(renderer.getTipOffset({ type: 'custom', size: 10, filled: true, path: 'M0,0', tipOffset: 6 })).toBe(6);
  });

  it('renders nothing for a `custom` marker with no path and no registration', () => {
    expect(renderer.renderArrow({ type: 'custom', size: 10, filled: true }, 't')).toBeNull();
  });
});

describe('ArrowRenderer — Card 5: registered markers', () => {
  let renderer: ArrowRenderer;
  beforeEach(() => {
    renderer = new ArrowRenderer();
    clearEdgeTemplates();
  });
  afterEach(() => clearEdgeTemplates());

  it('renders a marker registered by name, used AS the type', () => {
    registerMarker('feather', {
      tipOffset: style => style.size,
      render: ctx => ({
        type: 'path',
        props: { d: `M0,0 L${ctx.size},0`, stroke: ctx.color, transform: ctx.transform, className: 'arrow-feather' },
      }),
    });

    const vnode = renderer.renderArrow({ type: 'feather', size: 12, filled: true, color: '#0f0' }, 'tr')!;
    expect(vnode.props?.['d']).toBe('M0,0 L12,0');
    expect(vnode.props?.['stroke']).toBe('#0f0');
    expect(vnode.props?.['transform']).toBe('tr');
  });

  it('renders a marker referenced via `{ type: "custom", marker: name }`', () => {
    registerMarker('feather', { render: () => ({ type: 'g', props: { className: 'f' } }) });

    const vnode = renderer.renderArrow(
      { type: 'custom', size: 10, filled: true, marker: 'feather' },
      't'
    )!;
    expect(vnode.props?.['className']).toBe('f');
  });

  it('reads the registered marker\'s OWN tip offset, so its tip lands on the port', () => {
    registerMarker('feather', { tipOffset: style => style.size * 2, render: () => null });
    expect(renderer.getTipOffset({ type: 'feather', size: 6, filled: true })).toBe(12);
  });

  it('lets an explicit style.tipOffset override the registered one', () => {
    registerMarker('feather', { tipOffset: 100, render: () => null });
    expect(renderer.getTipOffset({ type: 'feather', size: 6, filled: true, tipOffset: 3 })).toBe(3);
  });

  it('tells the marker WHICH END it is on — an asymmetric marker has to know', () => {
    const seen: string[] = [];
    registerMarker('asym', { render: ctx => { seen.push(ctx.end); return null; } });

    renderer.renderArrow({ type: 'asym', size: 8, filled: true }, 't', 'white', 'source');
    renderer.renderArrow({ type: 'asym', size: 8, filled: true }, 't', 'white', 'target');

    expect(seen).toEqual(['source', 'target']);
  });

  it('hands the marker the theme background, so a hollow marker does not glare on a dark theme', () => {
    let bg = '';
    registerMarker('hollow', { render: ctx => { bg = ctx.backgroundColor; return null; } });

    renderer.renderArrow({ type: 'hollow', size: 8, filled: false }, 't', '#0b1220');
    expect(bg).toBe('#0b1220');
  });

  it('does NOT shadow a built-in unless something is actually registered under that name', () => {
    // Nothing registered as 'arrow' ⇒ the built-in triangle still wins.
    const vnode = renderer.renderArrow({ type: 'arrow', size: 10, filled: true, color: '#000' }, 't')!;
    expect(String(vnode.props?.['className'])).toContain('arrow-triangle');

    // …and a registration under that name DOES take over.
    registerMarker('arrow', { render: () => ({ type: 'g', props: { className: 'overridden' } }) });
    expect(renderer.renderArrow({ type: 'arrow', size: 10, filled: true }, 't')!.props?.['className'])
      .toBe('overridden');
  });

  it('still returns null for `none` and for zero size', () => {
    expect(renderer.renderArrow({ type: 'none', size: 10, filled: true }, 't')).toBeNull();
    expect(renderer.renderArrow({ type: 'half-arrow-left', size: 0, filled: true }, 't')).toBeNull();
    expect(renderer.getTipOffset({ type: 'half-arrow-left', size: 0, filled: true })).toBe(0);
  });
});
