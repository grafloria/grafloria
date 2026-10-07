// Workflow automation builder — how a step is drawn.
//
// Framework-free: a step's data ({ action, props, outputs }) → its tile box,
// its painted content (the structured, sanitised HTML the canvas renders in
// the node's foreignObject: tile, icon, two-line label, a "+" per output and
// the output names), its port list, the line styles, and the panel's form
// fragments. The page owns the engine; this module only describes.

import { ACTIONS, METRICS, RULE_OPS, PLACEHOLDER, outputsOf } from './workflow-builder-catalog.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ---- step geometry ---------------------------------------------------------
export const TILE = 56, CAP_W = 48, LABEL_W = 170;
export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
export const kindOf = (data) => (data.action === PLACEHOLDER ? 'placeholder' : ACTIONS[data.action]?.kind ?? 'app');
export const isLogic = (data) => ['condition', 'switch'].includes(kindOf(data));
export const portIdOf = (stepId, data, out) => (kindOf(data) === 'switch' ? `${stepId}__o_${out.id}` : `${stepId}__${out.id}`);
export const appNameOf = (data) => (data.action === PLACEHOLDER ? 'Start here' : ACTIONS[data.action]?.app ?? data.action);
export const summaryOf = (data) => {
  if (data.action === PLACEHOLDER) return 'Choose a trigger';
  const a = ACTIONS[data.action];
  try { return a ? a.summary(data.props) : ''; } catch { return a?.label ?? ''; }
};
export const iconOf = (data) => ACTIONS[data.action]?.icon ?? 'delay';
let measureCtx = null;
export const textWidth = (text, font) => {
  measureCtx ??= document.createElement('canvas').getContext('2d');
  measureCtx.font = font;
  return measureCtx.measureText(String(text)).width;
};
/** Tile box + how far its drawing spills (see layout.visualBox). */
export function geomOf(data) {
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
export function stepContent(id, data, flags = {}) {
  const kind = kindOf(data), g = geomOf(data);
  const cls = ['wf-node', kind === 'placeholder' ? 'wf-ph' : isLogic(data) ? 'wf-logic' : kind === 'trigger' ? 'wf-trigger wf-app' : 'wf-app'];
  if (flags.sel) cls.push('wf-sel');
  if (flags.status) cls.push('st-' + flags.status);
  const kids = [];
  kids.push(kind === 'placeholder'
    ? { tag: 'div', className: 'wf-tile', text: '+' }
    : { tag: 'div', className: 'wf-tile', children: [{ tag: 'span', className: `wf-ic ic-${iconOf(data)}` }] });
  if (kind === 'trigger') kids.push({ tag: 'span', className: 'wf-bolt', text: '⚡' });
  if (flags.status) kids.push({ tag: 'span', className: 'wf-badge', text: { success: '✓', failed: '!', stopped: '■' }[flags.status] ?? '' });
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
export function portList(id, data) {
  const g = geomOf(data), kind = kindOf(data), list = [];
  if (kind !== 'trigger' && kind !== 'placeholder') list.push({ id: `${id}__in`, type: 'input', side: 'left', x: 0, y: g.h / 2 });
  outputsOf(data).forEach((o, i) => list.push({ id: portIdOf(id, data, o), type: 'output', side: 'right', x: g.w, y: g.outs[i] ?? g.h / 2 }));
  return list;
}
export const portConfig = (p) => ({
  id: p.id, type: p.type, side: p.side, shape: { shape: 'circle', size: 10 },
  layout: { strategy: 'absolute', args: { units: 'px', x: p.x, y: p.y } },
  style: { fill: '#ffffff', stroke: '#3B52D9', strokeWidth: 1.5 },
});
// ---- lines -------------------------------------------------------------------
export const DARK = matchMedia('(prefers-color-scheme: dark)');
export const lineStyle = (mode) => {
  const base = DARK.matches ? '#5b6377' : '#a8b0c0';
  if (mode === 'active') return { stroke: DARK.matches ? '#8b9cf2' : '#3B52D9', strokeWidth: 2.4, arrowHead: { type: 'none' }, animation: { type: 'flow', speed: 'fast', direction: 'forward' } };
  if (mode === 'done') return { stroke: '#16a34a', strokeWidth: 2.2, arrowHead: { type: 'none' }, animation: { type: 'none' } };
  return { stroke: base, strokeWidth: 1.6, arrowHead: { type: 'none' }, animation: { type: 'none' } };
};
// ---- the property panel's fragments -----------------------------------------
export const tileHtml = (data, cls = '') => {
  const k = kindOf(data);
  return `<div class="pn-tile ${k === 'trigger' ? 'sq' : ''} ${isLogic(data) ? 'logic' : ''} ${cls}">${k === 'placeholder' ? '+' : `<span class="wf-ic ic-${iconOf(data)}"></span>`}</div>`;
};
export const fieldHtml = (f, v) => {
  const req = f.required ? ' pn-req' : '';
  if (f.type === 'select') return `<label class="pn-field"><span class="${req}">${esc(f.label)}</span><select data-k="${f.key}">${f.options.map((o) => `<option value="${esc(o)}"${o === v ? ' selected' : ''}>${esc(f.optionLabels?.[o] ?? o)}</option>`).join('')}</select></label>`;
  if (f.type === 'textarea') return `<label class="pn-field"><span class="${req}">${esc(f.label)}</span><textarea data-k="${f.key}" placeholder="${esc(f.placeholder)}">${esc(v)}</textarea></label>`;
  return `<label class="pn-field"><span class="${req}">${esc(f.label)}</span><input data-k="${f.key}" ${f.type === 'number' ? 'type="number" min="1"' : ''} value="${esc(v)}" placeholder="${esc(f.placeholder)}" spellcheck="false"></label>`;
};
export const outHtml = (o, i) => `<div class="pn-out"><div class="pn-out-h"${o.rule ? '' : ' style="grid-template-columns:1fr"'}><input data-out="${i}" data-ok="label" value="${esc(o.label)}" aria-label="Output name">
    ${o.rule ? `<button class="pn-btn pn-x" data-act="rm-out" data-out="${i}" title="Remove this output" aria-label="Remove output">×</button>` : ''}</div>
  ${o.rule ? `<div class="pn-rule"><select data-out="${i}" data-ok="metric" aria-label="Metric">${METRICS.map((m) => `<option value="${m.key}"${m.key === o.rule.metric ? ' selected' : ''}>${m.label}</option>`).join('')}</select>
      <select data-out="${i}" data-ok="op" aria-label="Operator">${RULE_OPS.map((op) => `<option${op === o.rule.op ? ' selected' : ''}>${op}</option>`).join('')}</select>
      <input data-out="${i}" data-ok="value" type="number" value="${esc(o.rule.value)}" aria-label="Value"></div>`
    : '<div class="pn-rule"><span>when no rule above matches</span></div>'}</div>`;
