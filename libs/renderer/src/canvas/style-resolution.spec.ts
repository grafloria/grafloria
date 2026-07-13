// THE CSS-vs-Canvas seam.
//
// SVG mode gets its paint from the browser's cascade; Canvas has no cascade. The
// class-rule layer is NOT reimplemented here — it is the export card's
// `createClassStyleResolver`, so the screen, the hit canvas and an exported file
// all resolve `.diagram-node.selected` to the same colour. These tests pin that
// reuse, and the layers this module adds on top of it (CSS priority order,
// inheritance, opacity compositing, typed parsing).
//
// Everything here is a "canvas looks different from SVG" bug caught before it
// exists.

import { DARK_THEME, LIGHT_THEME } from '../themes';
import { BASE_STYLE_RULES } from '../themes/theme-css';
import { createClassStyleResolver } from '../export/style-flattener';
import { THEME_VARS } from '../themes/theme-vars';
import {
  CanvasStyleResolver,
  fontString,
  parseDashArray,
  parseInlineStyle,
  readCssVarOverrides,
  textAlignFor,
  textBaselineFor,
  toNumber,
} from './style-resolution';

const resolver = () => new CanvasStyleResolver({ theme: LIGHT_THEME });
const root = () => resolver().rootStyle();

describe('CanvasStyleResolver — reuses the export flattener for the class cascade', () => {
  it('resolves a class-only element from the stylesheet (the CSS-mode default)', () => {
    // In CSS mode the node body carries NO fill/stroke props at all: the paint
    // lives in `.diagram-node` + the instance's CSS variables. This is the case a
    // naive canvas backend gets wrong — it would paint nothing.
    const r = resolver();
    const style = r.resolve({ className: 'diagram-node' }, r.rootStyle());

    expect(style.fill).toBe(LIGHT_THEME.colors.node.default.fill);
    expect(style.stroke).toBe(LIGHT_THEME.colors.node.default.stroke);
    expect(style.strokeWidth).toBe(LIGHT_THEME.nodes.default.strokeWidth);
  });

  it('agrees with the export flattener, rule for rule — one cascade, two consumers', () => {
    // If Canvas and Export ever disagreed, the picture on screen and the picture
    // in the exported file would differ. Assert they resolve identically for
    // every class combination the renderer actually emits.
    const flatten = createClassStyleResolver(LIGHT_THEME);
    const r = resolver();

    const classSets = [
      ['diagram-node'],
      ['diagram-node', 'selected'],
      ['diagram-node', 'hovered'],
      ['diagram-node', 'highlighted', 'selected'],
      ['diagram-node', 'error'],
      ['diagram-node', 'disabled'],
      ['diagram-link'],
      ['diagram-link', 'selected'],
      ['diagram-link', 'hovered'],
      ['diagram-label'],
      ['port', 'port-input'],
      ['port', 'port-output', 'port-highlighted'],
      ['port', 'port-bi', 'port-hovered'],
    ];

    for (const classes of classSets) {
      const expected = flatten(classes);
      const actual = r.resolve({ className: classes.join(' ') }, r.rootStyle());

      // Compare on the properties the flattener actually produced.
      if (expected['fill'] !== undefined) {
        expect([classes.join('.'), actual.fill]).toEqual([
          classes.join('.'),
          expected['fill'] === 'none' ? undefined : expected['fill'],
        ]);
      }
      if (expected['stroke'] !== undefined) {
        expect([classes.join('.'), actual.stroke]).toEqual([
          classes.join('.'),
          expected['stroke'] === 'none' ? undefined : expected['stroke'],
        ]);
      }
      if (expected['stroke-width'] !== undefined) {
        expect([classes.join('.'), actual.strokeWidth]).toEqual([
          classes.join('.'),
          parseFloat(expected['stroke-width']),
        ]);
      }
    }
  });

  it('selection beats highlight when a node is both (stylesheet source order)', () => {
    const r = resolver();
    expect(r.resolve({ className: 'diagram-node highlighted selected' }, r.rootStyle()).fill).toBe(
      LIGHT_THEME.colors.node.selected.fill
    );
  });

  it('class order in the className does not change the outcome', () => {
    const r = resolver();
    const a = r.resolve({ className: 'diagram-node selected hovered' }, r.rootStyle());
    const b = r.resolve({ className: 'hovered selected diagram-node' }, r.rootStyle());
    expect(a.fill).toBe(b.fill);
    expect(a.fill).toBe(LIGHT_THEME.colors.node.selected.fill);
  });

  it('a compound selector (.port-input.port-highlighted) beats its single-class parts', () => {
    const r = resolver();
    const style = r.resolve({ className: 'port port-input port-highlighted' }, r.rootStyle());
    // `.port-input` sets fill to the surface colour; the compound rule overrides
    // it with the port's own colour (specificity 2 > 1).
    expect(style.fill).toBe(LIGHT_THEME.colors.port.input);
    expect(style.strokeWidth).toBe(3); // .port-highlighted emphasis width
  });
});

describe('CanvasStyleResolver — CSS priority order', () => {
  it('inline style beats a stylesheet rule (this is why the renderer emits it inline)', () => {
    const r = resolver();
    const style = r.resolve(
      { className: 'diagram-node', style: 'fill: #ff0000; stroke-width: 7' },
      r.rootStyle()
    );
    expect(style.fill).toBe('#ff0000');
    expect(style.strokeWidth).toBe(7);
  });

  it('a stylesheet rule beats a presentation attribute (per the SVG spec)', () => {
    // This is the priority order the export card's live bug was about: a
    // presentation attribute LOSES to any author rule. Canvas must reproduce it,
    // or canvas and SVG disagree about which fill wins.
    const r = resolver();
    const style = r.resolve({ className: 'diagram-node', fill: '#123456' }, r.rootStyle());
    expect(style.fill).toBe(LIGHT_THEME.colors.node.default.fill);
    expect(style.fill).not.toBe('#123456');
  });

  it('a presentation attribute wins when no rule matches (programmatic mode)', () => {
    const r = resolver();
    const style = r.resolve({ fill: '#123456', strokeWidth: 3 }, r.rootStyle());
    expect(style.fill).toBe('#123456');
    expect(style.strokeWidth).toBe(3);
  });

  it('fill="none" means "do not fill", not "fill with the colour none"', () => {
    const r = resolver();
    expect(r.resolve({ fill: 'none' }, r.rootStyle()).fill).toBeUndefined();
    expect(r.resolve({ className: 'diagram-link' }, r.rootStyle()).fill).toBeUndefined();
  });

  it('link paint comes from .diagram-link and its state rules', () => {
    const r = resolver();
    expect(r.resolve({ className: 'diagram-link' }, r.rootStyle()).stroke).toBe(
      LIGHT_THEME.colors.link.default
    );
    expect(r.resolve({ className: 'diagram-link selected' }, r.rootStyle()).stroke).toBe(
      LIGHT_THEME.colors.link.selected
    );
  });

  it('label font + colour come from .diagram-label (canvas inherits no CSS font)', () => {
    const r = resolver();
    const style = r.resolve({ className: 'diagram-label' }, r.rootStyle());
    expect(style.fill).toBe(LIGHT_THEME.colors.text.primary);
    expect(style.fontSize).toBe(LIGHT_THEME.typography.fontSize.md);
    expect(style.fontFamily).toBe(LIGHT_THEME.typography.fontFamily.default);
  });
});

describe('CanvasStyleResolver — inheritance', () => {
  it('inherits paint down a group chain', () => {
    const r = resolver();
    const group = r.resolve({ fill: '#00ff00' }, r.rootStyle());
    expect(r.resolve({}, group).fill).toBe('#00ff00');
  });

  it('multiplies opacity down the chain (a group at 0.5 halves its children)', () => {
    const r = resolver();
    const group = r.resolve({ opacity: 0.5 }, r.rootStyle());
    expect(r.resolve({ opacity: 0.5 }, group).opacity).toBe(0.25);
  });

  it('does NOT inherit filter or clip-path (they are not inherited properties)', () => {
    const r = resolver();
    const group = r.resolve({ filter: 'blur(4px)', clipPath: 'url(#c1)' }, r.rootStyle());
    expect(group.filter).toBe('blur(4px)');
    expect(group.clipPathId).toBe('c1');

    const child = r.resolve({}, group);
    expect(child.filter).toBeUndefined();
    expect(child.clipPathId).toBeUndefined();
  });

  it('display:none / visibility:hidden mark the element unpaintable', () => {
    const r = resolver();
    expect(r.resolve({ display: 'none' }, r.rootStyle()).visible).toBe(false);
    expect(r.resolve({ style: { visibility: 'hidden' } }, r.rootStyle()).visible).toBe(false);
  });
});

describe('CanvasStyleResolver — theming', () => {
  it('a theme swap changes every resolved colour', () => {
    const r = resolver();
    const before = r.resolve({ className: 'diagram-node' }, r.rootStyle()).fill;

    r.setTheme(DARK_THEME);
    const after = r.resolve({ className: 'diagram-node' }, r.rootStyle()).fill;

    expect(before).toBe(LIGHT_THEME.colors.node.default.fill);
    expect(after).toBe(DARK_THEME.colors.node.default.fill);
    expect(after).not.toBe(before);
  });

  it('honours a host CSS custom-property override — the supported canvas theming seam', () => {
    const r = new CanvasStyleResolver({
      theme: LIGHT_THEME,
      varOverrides: { '--grafloria-node-fill': '#abcdef' },
    });
    expect(r.resolve({ className: 'diagram-node' }, r.rootStyle()).fill).toBe('#abcdef');
    // an un-overridden token still comes from the theme
    expect(r.resolve({ className: 'diagram-node' }, r.rootStyle()).stroke).toBe(
      LIGHT_THEME.colors.node.default.stroke
    );
  });

  it('every declaration in the stylesheet resolves — nothing is dropped', () => {
    // The stylesheet is written entirely in var(--grafloria-*). A variable that
    // failed to resolve would make canvas paint nothing where SVG painted fine.
    const r = resolver();
    expect(r.warnings).toEqual([]);
    expect(BASE_STYLE_RULES.length).toBeGreaterThan(0);
  });

  it('reads real computed --grafloria-* values off a host element', () => {
    const host = document.createElement('div');
    host.style.setProperty(THEME_VARS['node.fill'].cssVar, '#010203');
    document.body.appendChild(host);

    expect(readCssVarOverrides(host)[THEME_VARS['node.fill'].cssVar]).toBe('#010203');
    host.remove();
  });

  it('readCssVarOverrides is safe with no element (headless)', () => {
    expect(readCssVarOverrides(null)).toEqual({});
  });
});

describe('CSS value plumbing', () => {
  it('parses numbers with units', () => {
    expect(toNumber('2px')).toBe(2);
    expect(toNumber(3)).toBe(3);
    expect(toNumber('nope')).toBeUndefined();
  });

  it('parses dash arrays in every form the renderer emits', () => {
    expect(parseDashArray('5,5')).toEqual([5, 5]);
    expect(parseDashArray('5 5')).toEqual([5, 5]);
    expect(parseDashArray([5, 5])).toEqual([5, 5]);
    expect(parseDashArray('none')).toEqual([]);
  });

  it('parses inline styles in BOTH forms the renderer emits', () => {
    // The shape registry emits a string; the interaction overlays emit an object.
    expect(parseInlineStyle('fill: red; stroke-width: 2')).toEqual({
      fill: 'red',
      'stroke-width': '2',
    });
    expect(parseInlineStyle({ strokeWidth: 2, pointerEvents: 'none' })).toEqual({
      'stroke-width': '2',
      'pointer-events': 'none',
    });
  });

  it('builds a canvas font shorthand', () => {
    expect(fontString({ ...root(), fontSize: 14, fontFamily: 'Arial', fontWeight: '600' })).toBe(
      '600 14px Arial'
    );
    expect(fontString({ ...root(), fontSize: 12, fontFamily: 'Arial' })).toBe('12px Arial');
  });

  it('maps SVG text alignment onto canvas text alignment', () => {
    expect(textAlignFor('middle')).toBe('center');
    expect(textAlignFor('end')).toBe('right');
    expect(textAlignFor('start')).toBe('left');

    expect(textBaselineFor('middle')).toBe('middle');
    expect(textBaselineFor('hanging')).toBe('hanging');
    expect(textBaselineFor('baseline')).toBe('alphabetic');
    expect(textBaselineFor(undefined)).toBe('alphabetic');
  });
});
