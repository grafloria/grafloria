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
/* Every entry clears 3:1 against the light AND the dark card (WCAG 1.4.11,
   non-text contrast): the sky, teal and amber of the first palette sat at
   2.9, 2.5 and 2.2 against white and were replaced by their darker steps. */
const PALETTE_SIZE = 6;
/** The i-th palette token — the stylesheet resolves it per theme (`--axdb-c1…c6`). */
const colorAt = (i: number): string => `var(--axdb-c${(((i % PALETTE_SIZE) + PALETTE_SIZE) % PALETTE_SIZE) + 1})`;

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

/**
 * The drawing box a chart should lay itself out in: the body it is painted
 * into, less the legend's strip. A fixed 640×250 viewBox scaled to "meet" left
 * a wide fluid tile with ~170 px of dead card either side; drawing to the
 * body's own aspect fills it. Outside a layout (jsdom, a host not yet sized)
 * the classic 640×250 stands in, and the size watcher below repaints once the
 * real box exists.
 */
export function chartBox(body: { clientWidth: number; clientHeight: number }, legend = false): { W: number; H: number } {
  const w = body.clientWidth || 0;
  const h = (body.clientHeight || 0) - (legend ? 26 : 0);
  if (w < 60 || h < 40) return { W: 640, H: 250 };
  return { W: Math.round(w), H: Math.round(h) };
}

const sizeWatchers = new WeakMap<HTMLElement, ResizeObserver>();

/**
 * Re-lay a chart out when the HOST's box changes (a fit-mode reflow, a
 * resize, a narrower container) — coalesced to a frame, skipping sub-2-px
 * jitter. `relayout` redraws ONLY the chart body: the card and anything an
 * app painted onto it after `defaultWidgetRenderer` (a focus ring, a pin
 * marker — the documented composition) are never touched. The first version
 * re-ran the whole painter and wiped exactly those, which the save/load gate
 * caught as a reloaded board reading differently from the original.
 */
function watchSize(host: HTMLElement, relayout: () => void): void {
  if (typeof ResizeObserver === 'undefined') return;
  sizeWatchers.get(host)?.disconnect();
  let last = { w: host.clientWidth, h: host.clientHeight };
  let frame = 0;
  const ro = new ResizeObserver(() => {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (Math.abs(w - last.w) < 2 && Math.abs(h - last.h) < 2) return;
    last = { w, h };
    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (host.isConnected) relayout();
      else ro.disconnect();
    });
  });
  ro.observe(host);
  sizeWatchers.set(host, ro);
}

/**
 * The chart's numbers as a visually-hidden table — what a screen reader gets
 * instead of an svg it cannot read (WCAG 1.1.1). `role="img"` + aria-label on
 * the svg names the chart; this carries the values.
 */
const srTable = (caption: string, columns: string[], rows: Array<Array<string | number>>): string =>
  `<table class="axdb-sr"><caption>${esc(caption)}</caption><thead><tr>${columns
    .map((c) => `<th scope="col">${esc(c)}</th>`)
    .join('')}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>`;

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
  const body = card(host, widget, titleOf(widget));
  layoutLine(widget, body);
  watchSize(host, () => layoutLine(widget, body));
};

/** The line chart's body, drawn to the body's current box. */
function layoutLine(widget: DashboardWidgetSpec, body: HTMLElement): void {
  const d = data<LineWidgetData>(widget);
  const series = normalizeSeries(d.series);
  if (!series.length) return empty(body);

  const named = series.filter((s) => s.name);
  if (named.length) body.classList.add('axdb-has-lg');
  const { W, H } = chartBox(body, named.length > 0);
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
  // The label SET must not depend on the box: a board reloaded at another size
  // has to paint the same text as the original (the save/load gate's contract).
  // Only the geometry follows the box.
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
      // A series with ONE point has nothing for a polyline to connect, so the
      // plot rendered its axes and legend around an invisible chart — the
      // classic day-one-of-data tile. A single value is still data: draw it as
      // a dot. (Two or more points keep exactly the look they had.)
      const dots =
        s.values.length < 2
          ? s.values
              .map(
                (v, i) =>
                  `<circle cx="${xAt(i).toFixed(1)}" cy="${yAt(v).toFixed(1)}" r="3.5" ` +
                  `fill="${colorAt(si)}"></circle>`
              )
              .join('')
          : '';
      return (
        area +
        `<polyline points="${pts}" fill="none" stroke="${colorAt(si)}" stroke-width="${si === 0 ? 2.4 : 1.8}" ` +
        `stroke-linejoin="round" stroke-linecap="round"></polyline>` +
        dots
      );
    })
    .join('');

  body.innerHTML =
    `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" ` +
    `aria-label="${esc(titleOf(widget))}">${grid}${ticks}${marks}</svg>` +
    (named.length ? legend(series.map((s, i) => ({ label: String(s.name ?? ''), color: colorAt(i) }))) : '') +
    srTable(
      titleOf(widget),
      ['', ...series.map((s, i) => String(s.name ?? `Series ${i + 1}`))],
      Array.from({ length: count }, (_, i) => [labels[i] ?? String(i + 1), ...series.map((s) => s.values[i] ?? '')])
    );
}

// -- bar ----------------------------------------------------------------------

/** `{ bars: [{label, value}] }` — columns, value above, category below. */
export const renderBarWidget: WidgetRenderer = (widget, host) => {
  const body = card(host, widget, titleOf(widget));
  layoutBar(widget, body);
  watchSize(host, () => layoutBar(widget, body));
};

/** The bar chart's body, drawn to the body's current box. */
function layoutBar(widget: DashboardWidgetSpec, body: HTMLElement): void {
  const d = data<BarWidgetData>(widget);
  const bars = (Array.isArray(d.bars) ? d.bars : []).filter((b) => !!b);
  if (!bars.length) return empty(body);

  const { W, H } = chartBox(body);
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
    `aria-label="${esc(titleOf(widget))}">${grid}${marks}</svg>` +
    srTable(titleOf(widget), ['Category', 'Value'], bars.map((b) => [b.label ?? '', num(b.value)]));
}

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
    ) +
    srTable(
      titleOf(widget),
      ['Slice', 'Value', 'Share'],
      slices.map((s) => [s.label ?? '', num(s.value), `${Math.round((num(s.value) / total) * 100)}%`])
    );
};

// -- funnel -------------------------------------------------------------------

/** `{ stages: [{label, value}] }` — centred bars scaled against the widest stage. */
export const renderFunnelWidget: WidgetRenderer = (widget, host) => {
  const body = card(host, widget, titleOf(widget));
  layoutFunnel(widget, body);
  watchSize(host, () => layoutFunnel(widget, body));
};

/** Room an 11-px value needs, so the smallest stage's bar still holds its number. */
const valueWidth = (text: string): number => text.length * 6.6 + 14;

/**
 * The funnel's body, drawn to the body's current box. The old fixed 260-wide
 * viewBox scaled bars AND type with the tile: 24-px digits in a tall tile,
 * "188" spilling out of a stage narrower than its own label. Here the type is
 * fixed, bars share the height between a readable 18 px and a 40 px cap, the
 * stack is centred, and a bar is never narrower than its value.
 */
function layoutFunnel(widget: DashboardWidgetSpec, body: HTMLElement): void {
  const d = data<FunnelWidgetData>(widget);
  const stages = (Array.isArray(d.stages) ? d.stages : []).filter((s) => !!s);
  if (!stages.length) return empty(body);

  const { W, H } = chartBox(body);
  const n = stages.length;
  const gap = 6;
  const rowH = Math.max(18, Math.min(40, (H - gap * (n - 1)) / n));
  const top = Math.max(0, (H - (n * rowH + (n - 1) * gap)) / 2);
  const labelCol = Math.min(120, Math.max(60, W * 0.28));
  const track = Math.max(40, W - labelCol - 16);
  const max = Math.max(...stages.map((s) => num(s.value)), 1);

  const marks = stages
    .map((s, i) => {
      const text = compact(num(s.value));
      const w = Math.min(track, Math.max(valueWidth(text), (num(s.value) / max) * track));
      const x = 8 + (track - w) / 2;
      const y = top + i * (rowH + gap);
      const mid = (y + rowH / 2 + 4).toFixed(1);
      return (
        `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${rowH.toFixed(1)}" rx="6" fill="${colorAt(i)}"></rect>` +
        `<text x="${(x + w / 2).toFixed(1)}" y="${mid}" text-anchor="middle" font-size="11" ` +
        `font-weight="600" fill="#fff">${esc(text)}</text>` +
        `<text x="${8 + track + 8}" y="${mid}" font-size="10.5" fill="var(--axdb-muted)">${esc(s.label ?? '')}</text>`
      );
    })
    .join('');

  body.innerHTML =
    `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" ` +
    `aria-label="${esc(titleOf(widget))}">${marks}</svg>` +
    srTable(titleOf(widget), ['Stage', 'Value'], stages.map((s) => [s.label ?? '', num(s.value)]));
}

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
  // A scrollable region must be reachable by keyboard (axe: scrollable-
  // region-focusable) — it is a tab stop with the table's name.
  body.setAttribute('tabindex', '0');
  body.setAttribute('role', 'region');
  body.setAttribute('aria-label', titleOf(widget));
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
