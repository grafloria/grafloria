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
import {
  BUILT_IN_WIDGET_KINDS,
  defaultWidgetRenderer,
  renderBarWidget,
  renderDonutWidget,
  renderFunnelWidget,
  renderKpiWidget,
  renderLineWidget,
  renderTableWidget,
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
