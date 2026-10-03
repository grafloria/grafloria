// Workflow automation builder — how a step is drawn. (A TypeScript copy of
// demos/interaction/workflow-builder-steps.js; the same file sits next to the
// demo in the React, Vue, Angular and Qwik apps.)
//
// Framework-free: a step's data ({ action, props, outputs }) → its tile box,
// its painted content (the structured, sanitised HTML the canvas renders in
// the node's foreignObject: tile, icon, two-line label, a "+" per output and
// the output names), its port list, the line styles, and the panel's form
// fragments (as data here: each framework's template renders them). The page
// owns the engine; this module only describes.

import { ACTIONS, PLACEHOLDER, outputsOf, type Field, type Output, type StepData } from './workflow-builder-catalog';

/** The structured, sanitised HTML the canvas paints in a node's foreignObject. */
export interface HtmlContent {
  tag: string; className?: string; text?: string; children?: HtmlContent[];
  attrs?: Record<string, string>; style?: Record<string, string>;
}
/** A step's tile box + how far its drawing spills (see layout.visualBox). */
export interface Geom { w: number; h: number; left: number; right: number; top: number; bottom: number; outs: number[] }
export interface PortSpec { id: string; type: 'input' | 'output'; side: 'left' | 'right'; x: number; y: number }

export const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c as '&']);

// ---- step geometry ---------------------------------------------------------
export const TILE = 56, CAP_W = 48, LABEL_W = 170;
export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
export const kindOf = (data: StepData): string => (data.action === PLACEHOLDER ? 'placeholder' : ACTIONS[data.action]?.kind ?? 'app');
export const isLogic = (data: StepData): boolean => ['condition', 'switch'].includes(kindOf(data));
export const portIdOf = (stepId: string, data: StepData, out: Output): string => (kindOf(data) === 'switch' ? `${stepId}__o_${out.id}` : `${stepId}__${out.id}`);
export const appNameOf = (data: StepData): string => (data.action === PLACEHOLDER ? 'Start here' : ACTIONS[data.action]?.app ?? data.action);
export const summaryOf = (data: StepData): string => {
  if (data.action === PLACEHOLDER) return 'Choose a trigger';
  const a = ACTIONS[data.action];
  try { return a ? a.summary(data.props) : ''; } catch { return a?.label ?? ''; }
};
export const iconOf = (data: StepData): string => ACTIONS[data.action]?.icon ?? 'delay';
let measureCtx: CanvasRenderingContext2D | null = null;
export const textWidth = (text: unknown, font: string): number => {
  measureCtx ??= document.createElement('canvas').getContext('2d')!;
  measureCtx.font = font;
  return measureCtx.measureText(String(text)).width;
};
/** Tile box + how far its drawing spills (see layout.visualBox). */
export function geomOf(data: StepData): Geom {
  const lines = textWidth(summaryOf(data), `550 11.5px ${FONT}`) > LABEL_W - 6 ? 2 : 1;
  const labelH = 7 + 14 + 15 * lines + 4;
  if (!isLogic(data)) {
    const side = LABEL_W / 2 - TILE / 2;
    return { w: TILE, h: TILE, left: side, right: Math.max(side, 32), top: 8, bottom: TILE + labelH, outs: [TILE / 2] };
  }
  const outs = outputsOf(data);
  const h = Math.max(64, outs.length * 26 + 12);
  const widest = Math.max(0, ...outs.map((o) => textWidth(o.label, `10px ${FONT}`)));
  const side = LABEL_W / 2 - CAP_W / 2;
  return { w: CAP_W, h, left: side, right: Math.max(side, 26 + widest + 8), top: 8, bottom: h + labelH,
    outs: outs.map((_, i) => Math.round((h * (i + 1)) / (outs.length + 1))) };
}

// ---- a step → its painted content (structured, sanitised HTML) ---------------
export function stepContent(id: string, data: StepData, flags: { sel?: boolean; status?: string } = {}): HtmlContent {
  const kind = kindOf(data), g = geomOf(data);
  const cls = ['wf-node', kind === 'placeholder' ? 'wf-ph' : isLogic(data) ? 'wf-logic' : kind === 'trigger' ? 'wf-trigger wf-app' : 'wf-app'];
  if (flags.sel) cls.push('wf-sel');
  if (flags.status) cls.push('st-' + flags.status);
  const kids: HtmlContent[] = [];
  kids.push(kind === 'placeholder'
    ? { tag: 'div', className: 'wf-tile', text: '+' }
    : { tag: 'div', className: 'wf-tile', children: [{ tag: 'span', className: `wf-ic ic-${iconOf(data)}` }] });
  if (kind === 'trigger') kids.push({ tag: 'span', className: 'wf-bolt', text: '⚡' });
  if (flags.status) kids.push({ tag: 'span', className: 'wf-badge', text: ({ success: '✓', failed: '!', stopped: '■' } as Record<string, string>)[flags.status] ?? '' });
  kids.push({ tag: 'div', className: 'wf-label', children: [
    { tag: 'div', className: 'wf-app-name', text: appNameOf(data) },
    { tag: 'div', className: 'wf-sum', text: summaryOf(data) || '—' },
  ] });
  if (kind !== 'placeholder') {
    outputsOf(data).forEach((o, i) => {
      const y = g.outs[i] ?? g.h / 2;
      kids.push({ tag: 'span', className: `wf-plus wfp-${portIdOf(id, data, o)}`, text: '+',
        attrs: { title: o.label ? `Add a step after “${o.label}”` : 'Add the next step' }, style: { left: `${g.w + 16}px`, top: `${y}px` } });
      if (o.label) kids.push({ tag: 'span', className: 'wf-out-label', text: o.label, style: { left: `${g.w + 27}px`, top: `${y - 4}px` } });
    });
  }
  return { tag: 'div', className: cls.join(' '), children: kids };
}

// ---- ports -------------------------------------------------------------------
export function portList(id: string, data: StepData): PortSpec[] {
  const g = geomOf(data), kind = kindOf(data), list: PortSpec[] = [];
  if (kind !== 'trigger' && kind !== 'placeholder') list.push({ id: `${id}__in`, type: 'input', side: 'left', x: 0, y: g.h / 2 });
  outputsOf(data).forEach((o, i) => list.push({ id: portIdOf(id, data, o), type: 'output', side: 'right', x: g.w, y: g.outs[i] ?? g.h / 2 }));
  return list;
}
export const portConfig = (p: PortSpec) => ({
  id: p.id, type: p.type, side: p.side, shape: { shape: 'circle', size: 10 },
  layout: { strategy: 'absolute', args: { units: 'px', x: p.x, y: p.y } },
  style: { fill: '#ffffff', stroke: '#3B52D9', strokeWidth: 1.5 },
});
// ---- lines -------------------------------------------------------------------
export const DARK = matchMedia('(prefers-color-scheme: dark)');
export const lineStyle = (mode?: 'active' | 'done'): Record<string, unknown> => {
  const base = DARK.matches ? '#5b6377' : '#a8b0c0';
  if (mode === 'active') return { stroke: DARK.matches ? '#8b9cf2' : '#3B52D9', strokeWidth: 2.4, arrowHead: { type: 'none' }, animation: { type: 'flow', speed: 'fast', direction: 'forward' } };
  if (mode === 'done') return { stroke: '#16a34a', strokeWidth: 2.2, arrowHead: { type: 'none' }, animation: { type: 'none' } };
  return { stroke: base, strokeWidth: 1.6, arrowHead: { type: 'none' }, animation: { type: 'none' } };
};
// ---- the property panel's fragments ------------------------------------------
// The JS page builds these as HTML strings; here they are data, and each
// framework's template renders the markup (the same classes and data-* names).

/** The panel's step tile: its classes, and its icon (null: the placeholder's "+"). */
export const tileOf = (data: StepData): { cls: string; icon: string | null } => {
  const k = kindOf(data);
  return { cls: ['pn-tile', k === 'trigger' ? 'sq' : '', isLogic(data) ? 'logic' : ''].filter(Boolean).join(' '),
    icon: k === 'placeholder' ? null : iconOf(data) };
};
/** A select field's options as { value, label }. */
export const optionsOf = (f: Field): Array<{ value: string; label: string }> =>
  (f.options ?? []).map((o) => ({ value: o, label: f.optionLabels?.[o] ?? o }));
