/**
 * The built-in widget renderers' contract.
 *
 * Three promises are under test, and they are the ones a page depends on:
 *  1. STRUCTURE — each `kind` turns the DEVELOPER'S data into the marks that
 *     kind implies (a bar per bar, an arc per slice, a row per row), so a
 *     dashboard is useful with no `renderWidget` at all.
 *  2. NO SAMPLE DATA — the numbers on screen are only ever the declared ones.
 *  3. IT CANNOT THROW — a widget renderer runs inside a live board, mid-
 *     gesture, on every reflow. Missing, empty, partial and wrong-typed data
 *     must all paint something rather than take the board down.
 */
import { dashboard } from './dashboard';
import { ensureDashboardKitStyles, DASHBOARD_KIT_STYLE_ID } from './styles';
import {
  BUILT_IN_WIDGET_KINDS,
  defaultWidgetRenderer,
  renderBarWidget,
  renderDonutWidget,
  renderFunnelWidget,
  renderKpiWidget,
  renderLineWidget,
  renderTableWidget,
  chartBox,
} from './widgets';

const host = (): HTMLElement => document.createElement('div');
const paint = (widget: Parameters<typeof defaultWidgetRenderer>[0]) => {
  const h = host();
  defaultWidgetRenderer(widget, h);
  return h;
};

describe('built-in widget renderers — structure from the declared data', () => {
  it('kpi paints the value, a signed delta and a sparkline over the given points', () => {
    const h = paint({
      id: 'k',
      kind: 'kpi',
      data: { label: 'Total revenue', value: '$6.81M', delta: -2.3, spark: [4, 8, 6, 9] },
    });
    expect(h.querySelector('.axdb-widget-h')!.textContent).toBe('Total revenue');
    expect(h.querySelector('.axdb-kpi-v')!.textContent).toBe('$6.81M');
    // The SIGN drives the affordance: down is a distinct class, not just a glyph.
    const delta = h.querySelector('.axdb-kpi-d')!;
    expect(delta.classList.contains('down')).toBe(true);
    expect(delta.textContent).toContain('2.3%');
    // One point per declared value (a polyline of 4 pairs).
    expect(h.querySelector('polyline')!.getAttribute('points')!.split(' ')).toHaveLength(4);
  });

  it('kpi without a delta or spark paints just the number — no invented trend', () => {
    const h = paint({ id: 'k', kind: 'kpi', data: { label: 'Open tickets', value: 42 } });
    expect(h.querySelector('.axdb-kpi-v')!.textContent).toBe('42');
    expect(h.querySelector('.axdb-kpi-d')).toBeNull();
    expect(h.querySelector('svg')).toBeNull();
  });

  it('line accepts the number[] shorthand AND named series, one polyline each', () => {
    const short = paint({ id: 'l', kind: 'line', title: 'Trend', data: { series: [1, 5, 3] } });
    expect(short.querySelectorAll('polyline')).toHaveLength(1);
    expect(short.querySelector('.axdb-widget-h')!.textContent).toBe('Trend');

    const many = paint({
      id: 'l2',
      kind: 'line',
      data: {
        series: [
          { name: 'Revenue', values: [1, 5, 3] },
          { name: 'Target', values: [2, 4, 4] },
        ],
        labels: ['Jan', 'Feb', 'Mar'],
      },
    });
    expect(many.querySelectorAll('polyline')).toHaveLength(2);
    // Named series get a legend chip each; the labels become x-axis ticks.
    expect(many.querySelectorAll('.axdb-lg i')).toHaveLength(2);
    expect(many.querySelector('svg')!.textContent).toContain('Jan');
    // Only the first series is filled — an area per line would be unreadable.
    expect(many.querySelectorAll('path')).toHaveLength(1);
  });

  it('bar draws one rect per bar, labelled with the declared label and value', () => {
    const h = paint({
      id: 'b',
      kind: 'bar',
      data: { bars: [{ label: 'EMEA', value: 1920 }, { label: 'APAC', value: 1340 }] },
    });
    expect(h.querySelectorAll('rect')).toHaveLength(2);
    const text = h.querySelector('svg')!.textContent!;
    expect(text).toContain('EMEA');
    expect(text).toContain('APAC');
    // Taller bar for the bigger number — the one thing a bar chart must get right.
    const [emea, apac] = Array.from(h.querySelectorAll('rect')).map((r) => parseFloat(r.getAttribute('height')!));
    expect(emea).toBeGreaterThan(apac);
  });

  it('donut draws an arc per slice, honours per-slice colour, totals the centre', () => {
    const h = paint({
      id: 'd',
      kind: 'donut',
      data: { slices: [{ label: 'NA', value: 75, color: '#ff0000' }, { label: 'EMEA', value: 25 }] },
    });
    const arcs = Array.from(h.querySelectorAll('path'));
    expect(arcs).toHaveLength(2);
    expect(arcs[0].getAttribute('stroke')).toBe('#ff0000');
    // Centre figure defaults to the total; the legend carries the percentages.
    expect(h.querySelector('svg')!.textContent).toContain('100');
    expect(h.querySelector('.axdb-lg')!.textContent).toContain('75%');
  });

  it('donut honours an explicit centerLabel over the computed total', () => {
    const h = paint({
      id: 'd',
      kind: 'donut',
      data: { slices: [{ label: 'NA', value: 10 }], centerLabel: '$6.73M', centerCaption: 'ARR' },
    });
    const svg = h.querySelector('svg')!.textContent!;
    expect(svg).toContain('$6.73M');
    expect(svg).toContain('ARR');
  });

  it('funnel draws a bar per stage, each scaled against the first', () => {
    const h = paint({
      id: 'f',
      kind: 'funnel',
      data: { stages: [{ label: 'Lead', value: 1200 }, { label: 'Won', value: 300 }] },
    });
    const [lead, won] = Array.from(h.querySelectorAll('rect')).map((r) => parseFloat(r.getAttribute('width')!));
    expect(h.querySelectorAll('rect')).toHaveLength(2);
    // 300/1200 → a quarter of the track, so the stages are visibly a funnel.
    expect(won).toBeLessThan(lead / 2);
    expect(h.querySelector('svg')!.textContent).toContain('Lead');
  });

  it('funnel draws to its box with fixed type, and the smallest stage still holds its number', () => {
    const h = paint({
      id: 'f',
      kind: 'funnel',
      data: { stages: [{ label: 'Leads', value: 100000 }, { label: 'Won', value: 1 }] },
    });
    const svg = h.querySelector('svg')!;
    // Outside a layout the classic 640x250 stands in — the viewBox IS the box,
    // never a 260-wide picture scaled with the tile (24-px digits in a tall one).
    expect(svg.getAttribute('viewBox')).toBe('0 0 640 250');
    const [lead, won] = Array.from(h.querySelectorAll('rect'));
    expect(parseFloat(won.getAttribute('width')!)).toBeGreaterThanOrEqual(20); // wider than "1" at 11 px
    expect(parseFloat(won.getAttribute('width')!)).toBeLessThan(parseFloat(lead.getAttribute('width')!) / 10);
    for (const t of Array.from(svg.querySelectorAll('text'))) expect(['11', '10.5']).toContain(t.getAttribute('font-size'));
  });

  it('table renders a header cell per column, a row per row, numbers right-aligned', () => {
    const h = paint({
      id: 't',
      kind: 'table',
      data: { columns: ['Rep', 'Deals'], rows: [['A. Farouk', 38], ['M. Haddad', 31]] },
    });
    expect(h.querySelectorAll('th')).toHaveLength(2);
    expect(h.querySelectorAll('tbody tr')).toHaveLength(2);
    const cells = Array.from(h.querySelectorAll('tbody tr:first-child td'));
    expect(cells[0].className).toBe('');            // text stays left
    expect(cells[1].className).toBe('num');         // numbers align right
    expect(cells[1].textContent).toBe('38');
  });

  it('escapes developer data — a label can never inject markup', () => {
    const h = paint({ id: 't', kind: 'table', data: { columns: ['<img src=x>'], rows: [] } });
    expect(h.querySelector('img')).toBeNull();
    expect(h.querySelector('th')!.textContent).toBe('<img src=x>');
  });
});

describe('degradation — a renderer must never throw, and never invent data', () => {
  const BAD: Array<[string, unknown]> = [
    ['missing data', undefined],
    ['empty object', {}],
    ['empty collections', { series: [], bars: [], slices: [], stages: [], rows: [], columns: [], spark: [] }],
    ['wrong types', { series: 'nope', bars: 7, slices: null, stages: {}, rows: 'x', columns: 3, value: null }],
    ['holes in the numbers', {
      series: [1, NaN, 3],
      bars: [{ label: 'a' }, null],
      slices: [{ value: 0 }, { label: 'b' }],
      stages: [{ label: 'a' }],
      rows: [[1], null, [2, 3]],
      columns: ['a', 'b'],
      spark: [NaN, NaN],
    }],
  ];

  for (const kind of BUILT_IN_WIDGET_KINDS) {
    for (const [name, bad] of BAD) {
      it(`${kind} survives ${name}`, () => {
        const h = host();
        expect(() =>
          defaultWidgetRenderer({ id: 'w', kind, title: 'T', data: bad as Record<string, unknown> }, h)
        ).not.toThrow();
        // It still paints a titled card rather than leaving a hole in the board.
        expect(h.querySelector('.axdb-widget')).not.toBeNull();
        expect(h.querySelector('.axdb-widget-h')!.textContent).toBe('T');
        expect(h.innerHTML).not.toContain('NaN');
      });
    }
  }

  it('every renderer can be called directly with nothing but an id', () => {
    for (const r of [
      renderKpiWidget,
      renderLineWidget,
      renderBarWidget,
      renderDonutWidget,
      renderFunnelWidget,
      renderTableWidget,
    ]) {
      expect(() => r({ id: 'x' }, host())).not.toThrow();
    }
  });

  it('repainting the same host replaces the card instead of stacking cards', () => {
    const h = host();
    defaultWidgetRenderer({ id: 'k', kind: 'kpi', data: { value: 1 } }, h);
    defaultWidgetRenderer({ id: 'k', kind: 'kpi', data: { value: 2 } }, h);
    expect(h.querySelectorAll('.axdb-widget')).toHaveLength(1);
    expect(h.querySelector('.axdb-kpi-v')!.textContent).toBe('2');
  });
});

describe('dispatch and the dashboard() default', () => {
  it('an unknown kind falls back to the titled placeholder frame', () => {
    const h = paint({ id: 'w', kind: 'sankey', title: 'Not built yet' });
    expect(h.querySelector('.axdb-widget')).not.toBeNull();
    expect(h.querySelector('.axdb-widget-h')!.textContent).toBe('Not built yet');
    expect(h.querySelector('svg')).toBeNull();
  });

  it('a widget with no kind and no title still names itself by id', () => {
    expect(paint({ id: 'orphan' }).textContent).toBe('orphan');
  });

  it('dashboard() uses them by default — kind alone paints a real widget', () => {
    const spec = dashboard({
      widgets: [{ id: 'rev', kind: 'kpi', span: 3, data: { label: 'Revenue', value: '$1.2M', delta: 4 } }],
    });
    const h = host();
    spec.renderCustomNode({ id: 'rev' }, h);
    expect(h.querySelector('.axdb-kpi-v')!.textContent).toBe('$1.2M');
    expect(h.querySelector('.axdb-kpi-d')!.classList.contains('up')).toBe(true);
  });

  it('an explicit renderWidget still wins — the seam is untouched', () => {
    const spec = dashboard({
      widgets: [{ id: 'rev', kind: 'kpi', data: { value: 'x' } }],
      renderWidget: (w, h) => { h.textContent = `mine:${w.id}`; },
    });
    const h = host();
    spec.renderCustomNode({ id: 'rev' }, h);
    expect(h.textContent).toBe('mine:rev');
  });
});

describe('line widget — a single data point is still data', () => {
  // A one-value series used to render axes, grid and legend around an invisible
  // chart: a polyline needs two points, and one point drew nothing. That is the
  // day-one-of-data tile, and it looked broken. A single value now draws a dot.
  function renderInto(values: number[]): HTMLElement {
    const host = document.createElement('div');
    document.body.appendChild(host);
    renderLineWidget(
      { id: 'w', kind: 'line', title: 'T', data: { series: [{ name: 'One', values }], labels: ['a', 'b'] } } as never,
      host
    );
    return host;
  }

  it('draws a visible dot for a one-point series', () => {
    const host = renderInto([42]);
    expect(host.querySelectorAll('circle').length).toBe(1);
    host.remove();
  });

  it('draws no dots once a real line exists — the ≥2-point look is unchanged', () => {
    const host = renderInto([42, 51]);
    expect(host.querySelectorAll('circle').length).toBe(0);
    expect(host.querySelector('polyline')).toBeTruthy();
    host.remove();
  });
});

describe('every built-in chart carries its data as a screen-reader table', () => {
  const host = () => document.createElement('div');
  it('line, bar, donut and funnel each render one .axdb-sr table with the numbers', () => {
    const cases: Array<[string, Record<string, unknown>, string]> = [
      ['line', { series: [{ name: 'Rev', values: [1, 2] }], labels: ['Jan', 'Feb'] }, '2'],
      ['bar', { bars: [{ label: 'Q1', value: 210 }] }, '210'],
      ['donut', { slices: [{ label: 'EMEA', value: 3 }, { label: 'NA', value: 1 }] }, '75%'],
      ['funnel', { stages: [{ label: 'Leads', value: 1840 }] }, '1840'],
    ];
    for (const [kind, data, needle] of cases) {
      const h = host();
      defaultWidgetRenderer({ id: 'w', kind, data }, h);
      const table = h.querySelector('table.axdb-sr');
      expect(table).toBeTruthy();
      expect(table!.textContent).toContain(needle);
      expect(h.querySelector('svg')!.getAttribute('role')).toBe('img');
    }
  });
});

// ---------------------------------------------------------------------------
// CONTRAST (WCAG 1.4.3 text ≥ 4.5:1, 1.4.11 non-text ≥ 3:1), both themes —
// computed from the stylesheet's own tokens so a colour tweak that breaks a
// ratio fails here before axe-core sees it in the battery.
// ---------------------------------------------------------------------------
describe('the built-in widgets keep their contrast in both themes', () => {
  const lum = (hex: string): number => {
    const h = hex.replace('#', '');
    const c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const ratio = (a: string, b: string): number => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const tokensOf = (block: string): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const m of block.matchAll(/--axdb-([a-z0-9]+):\s*(#[0-9a-fA-F]{3,6})/g)) out[m[1]] = m[2].length === 4 ? '#' + [...m[2].slice(1)].map((c) => c + c).join('') : m[2];
    return out;
  };
  const themes = (): { light: Record<string, string>; dark: Record<string, string> } => {
    ensureDashboardKitStyles(document);
    const css = document.getElementById(DASHBOARD_KIT_STYLE_ID)!.textContent ?? '';
    const lightStart = css.indexOf('.axdb-widget {');
    const darkStart = css.indexOf('@media (prefers-color-scheme: dark) {\n  .axdb-widget {');
    const light = tokensOf(css.slice(lightStart, css.indexOf('}', lightStart)));
    const dark = { ...light, ...tokensOf(css.slice(darkStart, css.indexOf('}', darkStart))) };
    return { light, dark };
  };

  it('captions, deltas and headers read at 4.5:1 or better', () => {
    for (const t of Object.values(themes())) {
      expect(ratio(t['muted'], t['card'])).toBeGreaterThanOrEqual(4.5);
      expect(ratio(t['ink'], t['card'])).toBeGreaterThanOrEqual(4.5);
      expect(ratio(t['up'], t['card'])).toBeGreaterThanOrEqual(4.5);
      expect(ratio(t['down'], t['card'])).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('every palette entry clears 3:1 against its card', () => {
    for (const t of Object.values(themes())) {
      for (let i = 1; i <= 6; i++) expect(ratio(t['c' + i], t['card'])).toBeGreaterThanOrEqual(3);
    }
  });

  it('charts colour through the tokens, so the dark card gets its own steps', () => {
    const h = document.createElement('div');
    defaultWidgetRenderer({ id: 'w', kind: 'bar', data: { bars: [{ label: 'a', value: 1 }, { label: 'b', value: 2 }] } }, h);
    const fills = Array.from(h.querySelectorAll('rect')).map((r) => r.getAttribute('fill'));
    expect(fills).toEqual(['var(--axdb-c1)', 'var(--axdb-c2)']);
  });

  it('the table body is a focusable, named region (axe: scrollable-region-focusable)', () => {
    const h = document.createElement('div');
    defaultWidgetRenderer({ id: 'w', kind: 'table', title: 'Top reps', data: { columns: ['a'], rows: [[1]] } }, h);
    const body = h.querySelector('.axdb-scroll')!;
    expect(body.getAttribute('tabindex')).toBe('0');
    expect(body.getAttribute('role')).toBe('region');
    expect(body.getAttribute('aria-label')).toBe('Top reps');
  });
});

describe('charts draw to the box they are painted into', () => {
  it('chartBox follows the body, less the legend strip, and falls back to 640×250 without a layout', () => {
    expect(chartBox({ clientWidth: 0, clientHeight: 0 })).toEqual({ W: 640, H: 250 });
    expect(chartBox({ clientWidth: 1100, clientHeight: 300 })).toEqual({ W: 1100, H: 300 });
    expect(chartBox({ clientWidth: 1100, clientHeight: 300 }, true)).toEqual({ W: 1100, H: 274 });
    expect(chartBox({ clientWidth: 50, clientHeight: 300 })).toEqual({ W: 640, H: 250 }); // too small to trust
  });

  it('the label set does not depend on the box — a reload at another size paints the same text', () => {
    const labels = Array.from({ length: 12 }, (_, i) => 'M' + i);
    const paint = (w: number, h: number): string[] => {
      const host = document.createElement('div');
      Object.defineProperty(host, 'clientWidth', { value: w });
      Object.defineProperty(host, 'clientHeight', { value: h });
      defaultWidgetRenderer({ id: 'w', kind: 'line', data: { series: labels.map((_, i) => i), labels } }, host);
      return Array.from(host.querySelectorAll('svg text')).map((t) => t.textContent ?? '').filter((t) => /^M\d+$/.test(t));
    };
    expect(paint(0, 0)).toEqual(paint(1200, 300));
    expect(paint(0, 0)).toHaveLength(6); // >8 labels → every second one
  });
});

describe('the KPI card steps down instead of clipping', () => {
  it('the stylesheet hides the sparkline, then the delta, then the value as the body shrinks', () => {
    ensureDashboardKitStyles(document);
    const css = document.getElementById(DASHBOARD_KIT_STYLE_ID)!.textContent ?? '';
    expect(css).toContain('@container (max-height: 78px) { .axdb-kpi > .axdb-kpi-s { display: none; } }');
    expect(css).toContain('@container (max-height: 40px) { .axdb-kpi > .axdb-kpi-d { display: none; } }');
    expect(css).toContain('@container (max-height: 16px) { .axdb-kpi > .axdb-kpi-v { display: none; } }');
    expect(css).toContain('.grafloria-html-layer > .grafloria-node-host { container: axdb-tile / size; }');
  });

  it('a short, wide KPI lays the figure, delta and sparkline in a row; the strip puts header and figure on one line', () => {
    ensureDashboardKitStyles(document);
    const css = document.getElementById(DASHBOARD_KIT_STYLE_ID)!.textContent ?? '';
    const row = css.indexOf('@container axdb-tile (max-height: 125px) and (min-width: 340px) {');
    expect(row).toBeGreaterThan(-1);
    const block = css.slice(row, css.indexOf('/* THE STRIP', row));
    expect(block).toContain('.axdb-widget--kpi > .axdb-kpi { flex-direction: row;');
    // The spark comes back in the row — a nested query on the BODY keeps it away
    // from a strip too thin to draw it readably.
    expect(block).toContain('@container axdb-kpi (min-height: 24px) {');
    expect(block).toContain('.axdb-kpi > .axdb-kpi-s { display: block; flex: 1 1 40%;');
    // The row rule must come AFTER the stacked hide rule: same specificity, later wins.
    expect(css.indexOf('@container (max-height: 78px) { .axdb-kpi > .axdb-kpi-s { display: none; } }')).toBeLessThan(row);
    const strip = css.slice(css.indexOf('/* THE STRIP'));
    expect(strip).toContain('@container axdb-tile (max-height: 46px) {\n  .axdb-widget--kpi { flex-direction: row;');
  });

  it('the donut ring takes its body height (square, capped) instead of a fixed 150 px', () => {
    ensureDashboardKitStyles(document);
    const css = document.getElementById(DASHBOARD_KIT_STYLE_ID)!.textContent ?? '';
    const rule = css.slice(css.indexOf('.axdb-widget-b.axdb-donut > svg {'));
    expect(rule.slice(0, rule.indexOf('}'))).toContain('height: 100%; max-height: 260px; max-width: 60%; aspect-ratio: 1 / 1;');
    expect(css).not.toContain('max-width: 150px');
    // The sr-only data table sits at the body's origin, so it never extends the
    // card's scroll range below the chart (a table ignores a 1-px height).
    expect(css).toContain('.axdb-sr {\n  position: absolute; top: 0; left: 0;');
  });
});
