/**
 * BUILT-IN WIDGET RENDERERS — what `kind` means when you write no `renderWidget`.
 *
 * `dashboard({ views: [...] })` is data-first: a widget is `{ id, kind, span,
 * rows, data }`. Until now `kind` was a free-form string that only meant
 * something if the page supplied `renderWidget`; omitting it drew a titled
 * empty frame. This module is the other half — six real renderers driven by
 * the DEVELOPER'S OWN `data`, so a dashboard is useful from pure data alone:
 *
 * ```js
 * dashboard({ widgets: [
 *   { id: 'rev',   kind: 'kpi',   span: 3, data: { label: 'Revenue', value: '$6.8M', delta: 12.4 } },
 *   { id: 'trend', kind: 'line',  span: 8, rows: 2, data: { series: [10, 14, 12, 19] } },
 * ]});   // no renderWidget, no charting library, real widgets
 * ```
 *
 * TWO THINGS THIS DELIBERATELY IS NOT:
 *  - A charting library. Every mark is hand-drawn inline SVG (the same
 *    technique the dashboard demo uses), so the kit still adds ZERO
 *    dependencies and the whole file is readable.
 *  - A dataset. Nothing here ships sample numbers; every renderer reads the
 *    `data` the developer declared and degrades to an empty-state note when it
 *    is missing, partial or the wrong shape. A widget renderer must NEVER
 *    throw: it paints into a live board, mid-gesture, on every reflow.
 *
 * `renderWidget` remains the seam for anything richer — and it composes:
 * call `defaultWidgetRenderer(widget, host)` first, then decorate the host
 * (that is exactly what demos/dashboard/dashboard-builder.html does for its
 * focus ring and pin marker).
 */

import type { DashboardWidgetSpec } from './dashboard';
import { ensureDashboardKitStyles } from './styles';

/** The signature every renderer here (and `renderWidget`) satisfies. */
export type WidgetRenderer = (widget: DashboardWidgetSpec, host: HTMLElement) => void;

/** `kind: 'kpi'` — one headline number, an optional change, an optional trend. */
export interface KpiWidgetData {
  /** Small caption above the number (falls back to `widget.title`). */
  label?: string;
  /** The headline — pre-formatted by you, so units/currency stay yours. */
  value?: string | number;
  /** Signed percentage change. Positive paints up/green, negative down/red. */
  delta?: number;
  /** Caption after the delta (default 'vs previous'). */
  deltaLabel?: string;
  /** Sparkline values, oldest → newest. Fewer than 2 points draws nothing. */
  spark?: number[];
}

/** One named line of a `kind: 'line'` chart. */
export interface LineSeries {
  name?: string;
  values: number[];
}

/** `kind: 'line'` — one or many series over a shared x axis (area + line). */
export interface LineWidgetData {
  /** A bare `number[]` is the single-series shorthand. */
  series?: number[] | LineSeries[];
  /** X-axis tick labels, positionally matched to the values. */
  labels?: string[];
}

/** `kind: 'bar'` — categorical columns. */
export interface BarWidgetData {
  bars?: Array<{ label?: string; value?: number }>;
}

/** `kind: 'donut'` — parts of a whole, with a legend and a centre figure. */
export interface DonutWidgetData {
  slices?: Array<{ label?: string; value?: number; color?: string }>;
  /** Centre figure (default: the compacted total). */
  centerLabel?: string;
  /** Caption under the centre figure (default 'total'). */
  centerCaption?: string;
}

/** `kind: 'funnel'` — ordered stages, each bar scaled against the first. */
export interface FunnelWidgetData {
  stages?: Array<{ label?: string; value?: number }>;
}

/** `kind: 'table'` — plain rows. Numbers right-align on their own. */
export interface TableWidgetData {
  columns?: string[];
  rows?: Array<Array<string | number>>;
}

/** The kinds `defaultWidgetRenderer` knows; anything else gets the placeholder. */
export const BUILT_IN_WIDGET_KINDS = ['kpi', 'line', 'bar', 'donut', 'funnel', 'table'] as const;

/**
 * Categorical default palette — readable on both light and dark cards. Per-mark
 * overrides win (`slices[].color`); everything else cycles this list.
 */
const PALETTE = ['#3b52d9', '#0ea5e9', '#14b8a6', '#f59e0b', '#8b5cf6', '#64748b'];
const colorAt = (i: number): string => PALETTE[((i % PALETTE.length) + PALETTE.length) % PALETTE.length];

// -- primitives ---------------------------------------------------------------

const esc = (v: unknown): string =>
  String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

/** Finite numbers only — a NaN in the data must not become a NaN in a path. */
const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** 6730 → '6.7k'. Axis and centre figures only; your `value` is never touched. */
function compact(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e4) return `${(n / 1e3).toFixed(1)}k`;
  return `${Math.round(n * 100) / 100}`;
}

/** Round an axis maximum up to a friendly step (762 → 800, 2860 → 3000). */
function niceMax(v: number): number {
  if (!(v > 0)) return 1;
  const step = Math.pow(10, Math.floor(Math.log10(v))) / 2;
  return Math.ceil(v / step) * step;
}

/** The card shell: `<div class="axdb-widget"><div h/><div b/></div>`, body returned. */
function card(host: HTMLElement, widget: DashboardWidgetSpec, title: string): HTMLElement {
  const doc = host.ownerDocument ?? document;
  ensureDashboardKitStyles(doc);
  host.innerHTML = '';
  const root = doc.createElement('div');
  root.className = `axdb-widget axdb-widget--${widget.kind ?? 'widget'}`;
  const head = doc.createElement('div');
  head.className = 'axdb-widget-h';
  head.textContent = title;
  const body = doc.createElement('div');
  body.className = 'axdb-widget-b';
  root.appendChild(head);
  root.appendChild(body);
  host.appendChild(root);
  return body;
}

/** Header text: an explicit title wins, then a data-supplied label, then the kind. */
function titleOf(widget: DashboardWidgetSpec, label?: unknown): string {
  const t = widget.title ?? (typeof label === 'string' && label ? label : undefined) ?? widget.kind ?? widget.id;
  return String(t);
}

/** The one empty state, so every kind fails the same readable way. */
function empty(body: HTMLElement, note = 'no data'): void {
  body.innerHTML = `<div class="axdb-widget-empty">${esc(note)}</div>`;
}

const data = <T>(widget: DashboardWidgetSpec): Partial<T> =>
  (widget.data ?? {}) as Partial<T>;

const legend = (items: Array<{ label: string; color: string }>, column = false): string =>
  `<div class="axdb-lg${column ? ' axdb-lg--col' : ''}">` +
  items.map((i) => `<i><b style="background:${esc(i.color)}"></b>${esc(i.label)}</i>`).join('') +
  '</div>';

// -- kpi ----------------------------------------------------------------------

/** `{ label, value, delta?, spark? }` — headline number + change + sparkline. */
export const renderKpiWidget: WidgetRenderer = (widget, host) => {
  const d = data<KpiWidgetData>(widget);
  const body = card(host, widget, titleOf(widget, d.label));
  const value = d.value === undefined || d.value === null || d.value === '' ? '—' : d.value;
  let html = `<div class="axdb-kpi-v">${esc(value)}</div>`;

  if (isNum(d.delta)) {
    const up = d.delta >= 0;
    html +=
      `<div class="axdb-kpi-d ${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${Math.abs(d.delta)}% ` +
      `<span>${esc(d.deltaLabel ?? 'vs previous')}</span></div>`;
  }

  const spark = (Array.isArray(d.spark) ? d.spark : []).filter(isNum);
  if (spark.length > 1) {
    const W = 240;
    const H = 40;
    const max = Math.max(...spark);
    const min = Math.min(...spark);
    const pts = spark.map((v, i) => {
      const x = (i / (spark.length - 1)) * W;
      const y = H - ((v - min) / (max - min || 1)) * (H - 6) - 3;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    html +=
      `<svg class="axdb-kpi-s" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">` +
      `<path d="M0,${H} L${pts.join(' L')} L${W},${H} Z" fill="${colorAt(0)}" fill-opacity="0.12"></path>` +
      `<polyline points="${pts.join(' ')}" fill="none" stroke="${colorAt(0)}" stroke-width="2" ` +
      `stroke-linejoin="round" stroke-linecap="round"></polyline></svg>`;
  }

  body.classList.add('axdb-kpi');
  body.innerHTML = html;
};

// -- line ---------------------------------------------------------------------

/** Accept both `number[]` and `{name, values}[]`, drop anything unusable. */
function normalizeSeries(raw: LineWidgetData['series']): LineSeries[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  if (raw.every((s) => typeof s === 'number')) {
    const values = (raw as number[]).filter(isNum);
    return values.length ? [{ values }] : [];
  }
  return (raw as LineSeries[])
    .filter((s): s is LineSeries => !!s && Array.isArray(s.values))
    .map((s) => ({ name: s.name, values: s.values.filter(isNum) }))
    .filter((s) => s.values.length > 0);
}

/** `{ series, labels? }` — area under the first series, a line per series. */
export const renderLineWidget: WidgetRenderer = (widget, host) => {
  const d = data<LineWidgetData>(widget);
  const body = card(host, widget, titleOf(widget));
  const series = normalizeSeries(d.series);
  if (!series.length) return empty(body);

  const W = 640;
  const H = 250;
  const pad = { l: 34, r: 12, t: 12, b: 22 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const all = series.flatMap((s) => s.values);
  const count = Math.max(...series.map((s) => s.values.length));
  const max = niceMax(Math.max(...all));
  const min = Math.min(0, ...all);
  const xAt = (i: number): number => pad.l + (count > 1 ? (i / (count - 1)) * iw : iw / 2);
  const yAt = (v: number): number => pad.t + ih - ((v - min) / (max - min || 1)) * ih;

  const grid = [0, 0.25, 0.5, 0.75, 1]
    .map((f) => {
      const y = pad.t + ih - f * ih;
      return (
        `<line x1="${pad.l}" y1="${y.toFixed(1)}" x2="${W - pad.r}" y2="${y.toFixed(1)}" ` +
        `stroke="var(--axdb-grid)" stroke-width="1"></line>` +
        `<text x="${pad.l - 6}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-size="9" ` +
        `fill="var(--axdb-muted)">${esc(compact(min + f * (max - min)))}</text>`
      );
    })
    .join('');

  const labels = Array.isArray(d.labels) ? d.labels : [];
  const every = labels.length > 8 ? 2 : 1;
  const ticks = labels
    .slice(0, count)
    .map((l, i) =>
      i % every === 0
        ? `<text x="${xAt(i).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="9" ` +
          `fill="var(--axdb-muted)">${esc(l)}</text>`
        : ''
    )
    .join('');

  const marks = series
    .map((s, si) => {
      const pts = s.values.map((v, i) => `${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`).join(' ');
      const area =
        si === 0 && s.values.length > 1
          ? `<path d="M${xAt(0).toFixed(1)},${(pad.t + ih).toFixed(1)} L${pts.replace(/ /g, ' L')} ` +
            `L${xAt(s.values.length - 1).toFixed(1)},${(pad.t + ih).toFixed(1)} Z" ` +
            `fill="${colorAt(si)}" fill-opacity="0.10"></path>`
          : '';
      return (
        area +
        `<polyline points="${pts}" fill="none" stroke="${colorAt(si)}" stroke-width="${si === 0 ? 2.4 : 1.8}" ` +
        `stroke-linejoin="round" stroke-linecap="round"></polyline>`
      );
    })
    .join('');

  const named = series.filter((s) => s.name);
  if (named.length) body.classList.add('axdb-has-lg');
  body.innerHTML =
    `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" ` +
    `aria-label="${esc(titleOf(widget))}">${grid}${ticks}${marks}</svg>` +
    (named.length ? legend(series.map((s, i) => ({ label: String(s.name ?? ''), color: colorAt(i) }))) : '');
};

// -- bar ----------------------------------------------------------------------

/** `{ bars: [{label, value}] }` — columns, value above, category below. */
export const renderBarWidget: WidgetRenderer = (widget, host) => {
  const d = data<BarWidgetData>(widget);
  const body = card(host, widget, titleOf(widget));
  const bars = (Array.isArray(d.bars) ? d.bars : []).filter((b) => !!b);
  if (!bars.length) return empty(body);

  const W = 640;
  const H = 250;
  const pad = { l: 34, r: 12, t: 12, b: 26 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const max = niceMax(Math.max(...bars.map((b) => num(b.value))));
  const slot = iw / bars.length;
  const bw = slot * 0.56;

  const grid = [0, 0.5, 1]
    .map((f) => {
      const y = pad.t + ih - f * ih;
      return (
        `<line x1="${pad.l}" y1="${y.toFixed(1)}" x2="${W - pad.r}" y2="${y.toFixed(1)}" ` +
        `stroke="var(--axdb-grid)" stroke-width="1"></line>` +
        `<text x="${pad.l - 6}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-size="9" ` +
        `fill="var(--axdb-muted)">${esc(compact(f * max))}</text>`
      );
    })
    .join('');

  const marks = bars
    .map((b, i) => {
      const v = Math.max(0, num(b.value));
      const h = (v / max) * ih;
      const x = pad.l + i * slot + (slot - bw) / 2;
      const y = pad.t + ih - h;
      return (
        `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" ` +
        `rx="4" fill="${colorAt(i)}"></rect>` +
        `<text x="${(x + bw / 2).toFixed(1)}" y="${(y - 4).toFixed(1)}" text-anchor="middle" font-size="9.5" ` +
        `font-weight="600" fill="var(--axdb-ink)">${esc(compact(num(b.value)))}</text>` +
        `<text x="${(x + bw / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="9" ` +
        `fill="var(--axdb-muted)">${esc(b.label ?? '')}</text>`
      );
    })
    .join('');

  body.innerHTML =
    `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" ` +
    `aria-label="${esc(titleOf(widget))}">${grid}${marks}</svg>`;
};

// -- donut --------------------------------------------------------------------

/** One arc of the ring, as an SVG path command. */
function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const at = (a: number): [number, number] => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const [x0, y0] = at(a0);
  const [x1, y1] = at(a1);
  return `M${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1.toFixed(2)},${y1.toFixed(2)}`;
}

/** `{ slices: [{label, value, color?}], centerLabel? }` — ring + legend. */
export const renderDonutWidget: WidgetRenderer = (widget, host) => {
  const d = data<DonutWidgetData>(widget);
  const body = card(host, widget, titleOf(widget));
  const slices = (Array.isArray(d.slices) ? d.slices : []).filter((s) => !!s && num(s.value) > 0);
  const total = slices.reduce((s, x) => s + num(x.value), 0);
  if (!slices.length || total <= 0) return empty(body);

  const cx = 90;
  const cy = 90;
  const r = 66;
  let a = -Math.PI / 2;
  const segs = slices
    .map((s, i) => {
      const sweep = (num(s.value) / total) * Math.PI * 2;
      const a1 = a + sweep;
      // A hair of padding each side keeps neighbouring arcs visually separate —
      // clamped so a very thin slice cannot invert into a backwards arc.
      const inset = Math.min(0.02, sweep / 4);
      const path = arcPath(cx, cy, r, a + inset, a1 - inset);
      a = a1;
      return `<path d="${path}" fill="none" stroke="${esc(s.color ?? colorAt(i))}" stroke-width="26" stroke-linecap="round"></path>`;
    })
    .join('');

  body.classList.add('axdb-donut');
  body.innerHTML =
    `<svg viewBox="0 0 180 180" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(titleOf(widget))}">` +
    segs +
    `<text x="${cx}" y="${cy - 2}" text-anchor="middle" font-size="20" font-weight="700" ` +
    `fill="var(--axdb-ink)">${esc(d.centerLabel ?? compact(total))}</text>` +
    `<text x="${cx}" y="${cy + 16}" text-anchor="middle" font-size="10" ` +
    `fill="var(--axdb-muted)">${esc(d.centerCaption ?? 'total')}</text>` +
    '</svg>' +
    legend(
      slices.map((s, i) => ({
        label: `${s.label ?? ''} · ${Math.round((num(s.value) / total) * 100)}%`,
        color: s.color ?? colorAt(i),
      })),
      true
    );
};

// -- funnel -------------------------------------------------------------------

/** `{ stages: [{label, value}] }` — centred bars scaled against the first stage. */
export const renderFunnelWidget: WidgetRenderer = (widget, host) => {
  const d = data<FunnelWidgetData>(widget);
  const body = card(host, widget, titleOf(widget));
  const stages = (Array.isArray(d.stages) ? d.stages : []).filter((s) => !!s);
  if (!stages.length) return empty(body);

  const W = 260;
  const rowH = 34;
  const gap = 8;
  const H = stages.length * (rowH + gap);
  const max = Math.max(...stages.map((s) => num(s.value)), 1);
  const track = W - 90;

  const marks = stages
    .map((s, i) => {
      const w = Math.max(2, (num(s.value) / max) * track);
      const x = (track - w) / 2 + 8;
      const y = i * (rowH + gap);
      return (
        `<rect x="${x.toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="${rowH}" rx="6" fill="${colorAt(i)}"></rect>` +
        `<text x="${(x + w / 2).toFixed(1)}" y="${y + rowH / 2 + 4}" text-anchor="middle" font-size="11" ` +
        `font-weight="600" fill="#fff">${esc(compact(num(s.value)))}</text>` +
        `<text x="${W - 78}" y="${y + rowH / 2 + 4}" font-size="10.5" fill="var(--axdb-muted)">${esc(s.label ?? '')}</text>`
      );
    })
    .join('');

  body.innerHTML =
    `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" ` +
    `aria-label="${esc(titleOf(widget))}">${marks}</svg>`;
};

// -- table --------------------------------------------------------------------

/** `{ columns, rows }` — plain rows; numeric cells right-align themselves. */
export const renderTableWidget: WidgetRenderer = (widget, host) => {
  const d = data<TableWidgetData>(widget);
  const body = card(host, widget, titleOf(widget));
  const columns = Array.isArray(d.columns) ? d.columns : [];
  const rows = (Array.isArray(d.rows) ? d.rows : []).filter((r) => Array.isArray(r));
  if (!columns.length && !rows.length) return empty(body);

  const head = columns.length
    ? `<thead><tr>${columns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>`
    : '';
  const cols = columns.length || Math.max(0, ...rows.map((r) => r.length));
  const tbody = rows
    .map(
      (r) =>
        '<tr>' +
        Array.from({ length: cols }, (_, i) => r[i])
          .map((cell) => `<td class="${isNum(cell) ? 'num' : ''}">${esc(cell ?? '')}</td>`)
          .join('') +
        '</tr>'
    )
    .join('');

  body.classList.add('axdb-scroll');
  body.innerHTML = `<table class="axdb-table">${head}<tbody>${tbody}</tbody></table>`;
};

// -- dispatch -----------------------------------------------------------------

const BY_KIND: Record<string, WidgetRenderer> = {
  kpi: renderKpiWidget,
  line: renderLineWidget,
  bar: renderBarWidget,
  donut: renderDonutWidget,
  funnel: renderFunnelWidget,
  table: renderTableWidget,
};

/**
 * Paint `widget` into `host` by its `kind` — `dashboard()`'s default
 * `renderWidget`, and the composable base for your own.
 *
 * An unknown (or absent) kind falls back to the titled placeholder frame, so a
 * board of not-yet-implemented widgets still lays out and is still testable.
 * Never throws: bad data paints an empty state.
 */
export const defaultWidgetRenderer: WidgetRenderer = (widget, host) => {
  const renderer = BY_KIND[widget?.kind ?? ''];
  if (renderer) {
    try {
      renderer(widget, host);
      return;
    } catch {
      /* a broken widget must not take the board down — fall through to the frame */
    }
  }
  card(host, widget ?? { id: '' }, titleOf(widget ?? { id: '' }));
};
