// Robot cell programmer — how a step, a loop and a palette chip are drawn.
//
// A node's body is the canvas's STRUCTURED, sanitised content ({ tag, className,
// text, style, attrs, children }): plain tags only, no inline SVG, no data-*
// attributes. So icons are CSS masks (iconCss(), added to the page once), a
// card is found by its node's data-node-id, and its buttons by their classes.
// The palette, the lane names and the drag ghost are page DOM: toHtml() turns
// the same tree into markup for them. Colours come from robot-timeline.css.

import { COMMANDS, REPEAT, DEVICES, fmt, durationOf, summaryOf, itemSeconds } from './robot-timeline-catalog.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// 24×24 stroke icons; painted through CSS masks in the element's own colour.
const P = {
  arm: '<path d="M5 20h8M9 20v-4l4-6 5 2"/><circle cx="9" cy="16" r="1.6"/><circle cx="13" cy="10" r="1.6"/><path d="M18 12l2-3M18 12l2 1"/>',
  pick: '<path d="M12 3v7"/><path d="M8 10h8M8 10v4l2 2M16 10v4l-2 2"/><rect x="9" y="17" width="6" height="4" rx="1"/>',
  place: '<path d="M12 3v9M8.5 8.5 12 12l3.5-3.5"/><path d="M4 15h16v4H4z"/>',
  insert: '<path d="M4 10v9h16v-9"/><path d="M12 3v10M9 10l3 3 3-3"/>',
  close: '<path d="M4 12v7h16v-7"/><path d="M3 9.5 12 6l9 3.5"/><path d="M12 3v3"/>',
  stamp: '<path d="M9 3h6v5l3 3v3H6v-3l3-3z"/><path d="M5 18h14v3H5z"/>',
  move: '<path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/>',
  belt: '<rect x="2.5" y="9" width="19" height="6" rx="3"/><circle cx="6" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18" cy="12" r="1.2"/><path d="M8 5h8M13 3l3 2-3 2"/>',
  sense: '<path d="M12 12v.01"/><path d="M8.5 15.5a5 5 0 0 1 0-7M15.5 8.5a5 5 0 0 1 0 7M5.6 18.4a9 9 0 0 1 0-12.8M18.4 5.6a9 9 0 0 1 0 12.8"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  wait: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/>',
  repeat: '<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  warn: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.01"/>',
};
const svgOf = (d) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
/** The icon masks, once per page. */
export function iconCss() {
  return Object.entries(P).map(([k, d]) => `.rt-i-${k}{-webkit-mask-image:url("data:image/svg+xml,${encodeURIComponent(svgOf(d))}");mask-image:url("data:image/svg+xml,${encodeURIComponent(svgOf(d))}")}`).join('\n');
}

// ---- the structured tree, and markup from it ------------------------------------------------
const h = (tag, className, children = [], extra = {}) => ({ tag, className, ...(typeof children === 'string' ? { text: children } : { children }), ...extra });
const iconNode = (name, size = 15) => h('span', `rt-i rt-i-${P[name] ? name : 'wait'}`, [], { style: { width: `${size}px`, height: `${size}px` } });
const STYLE_KEY = (k) => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
/** Markup for a tree (page DOM: the drag ghost). */
export function toHtml(n) {
  if (!n) return '';
  const style = n.style ? ` style="${esc(Object.entries(n.style).map(([k, v]) => `${STYLE_KEY(k)}:${v}`).join(';'))}"` : '';
  const attrs = Object.entries(n.attrs ?? {}).map(([k, v]) => ` ${k}="${esc(v)}"`).join('');
  const inner = n.text != null ? esc(n.text) : (n.children ?? []).map(toHtml).join('');
  return `<${n.tag}${n.className ? ` class="${esc(n.className)}"` : ''}${style}${attrs}>${inner}</${n.tag}>`;
}
export const icon = (name, size = 15) => toHtml(iconNode(name, size));

/** The colour family of a command: arm / belt / camera / flow (CSS classes rt-k-*). */
export const kindOfCmd = (cmd) => (cmd === 'repeat' || cmd === 'wait' ? 'flow' : ({ Conveyor: 'belt', Camera: 'camera' })[COMMANDS[cmd]?.group] ?? 'arm');

// ---- geometry ---------------------------------------------------------------------
export const SIMPLE = { W: 156, H: 96, GAP: 44, LANE_Y: 60, FRAME_PAD: 18, FRAME_HEAD: 34, FRAME_FOOT: 30, X0: 40 };
export const ADV = { PPS: 50, MIN_W: 66, H: 64, LANE_H: 112, X0: 0, HEAD_W: 170, RULER: 40, FRAME_HEAD: 24, FRAME_PAD: 8 };

const tool = (act, name, title) => h('span', `rt-tb rt-act-${act}`, [iconNode(name, 12)], { attrs: { title } });

/**
 * A step's card. `opts`: { mode, n (step number), problem, status: 'running' | 'done', k (0–1),
 * pass, passes, sel, dragging, w }.
 */
export function cardTree(step, opts = {}) {
  const c = COMMANDS[step.cmd], kind = kindOfCmd(step.cmd);
  const dur = durationOf(step), pr = opts.problem;
  const cls = ['rt-card', `rt-k-${kind}`, opts.mode === 'advanced' ? 'rt-compact' : '', opts.mode === 'advanced' && (opts.w ?? 99) < 70 ? 'rt-tiny' : '',
    opts.sel ? 'rt-sel' : '', opts.dragging ? 'rt-dragging' : '', pr ? `rt-${pr.level}` : '', opts.status ? `rt-${opts.status}` : ''].filter(Boolean).join(' ');
  const top = [h('span', 'rt-ic', [iconNode(c?.icon ?? 'wait', 15)]), h('span', 'rt-title', c?.label ?? step.cmd)];
  const kids = [h('div', 'rt-top', top), h('div', 'rt-sum', summaryOf(step))];
  if (opts.mode !== 'advanced') kids.push(h('span', 'rt-meta', `${opts.n ? `#${opts.n} · ` : ''}${fmt(dur)} s`));
  if (pr) kids.push(h('div', 'rt-prob', [iconNode('warn', 12), h('span', '', pr.msg)], { attrs: { title: pr.msg } }));
  if (opts.status === 'running') kids.push(h('span', 'rt-bar', [h('span', '', [], { style: { width: `${Math.round((opts.k ?? 0) * 100)}%` } })]));
  kids.push(h('span', 'rt-tools', [tool('settings', 'gear', 'Settings'), tool('delete', 'x', 'Delete step')]));
  return h('div', cls, kids, { attrs: { title: `${c?.label ?? step.cmd} — ${summaryOf(step)} · ${fmt(dur)} s` } });
}

/** A loop's frame: its header (click for settings), and the way back under the steps. */
export function frameTree(loop, opts = {}) {
  const times = Number(loop.props.times) || 1;
  const cls = ['rt-frame', opts.mode === 'advanced' ? 'rt-compact' : '', opts.sel ? 'rt-sel' : '', opts.dragging ? 'rt-dragging' : '', opts.empty ? 'rt-empty' : '', opts.problem ? `rt-${opts.problem.level}` : ''].filter(Boolean).join(' ');
  const head = [iconNode('repeat', 14), h('b', '', `Repeat × ${times}`)];
  if (loop.props.note) head.push(h('span', 'rt-fnote', loop.props.note));
  if (opts.status === 'running') head.push(h('span', 'rt-fpass', `pass ${opts.pass + 1} of ${times}`));
  head.push(h('span', 'rt-fsp'), h('span', 'rt-ftot', `${fmt(itemSeconds(loop))} s`), tool('unloop', 'x', 'Remove the loop, keep its steps'));
  const kids = [h('div', 'rt-fhead', head, { attrs: { title: 'Repeat settings' } })];
  if (opts.empty) kids.push(h('div', 'rt-fdrop', 'Drop steps here'));
  if (opts.problem) kids.push(h('div', 'rt-fprob', opts.problem.msg));
  if (opts.mode !== 'advanced') kids.push(h('div', 'rt-fback', [h('span', 'rt-fback-line'), h('span', 'rt-fback-label', `back to the first step · ${times} passes`)]));
  return h('div', cls, kids);
}

/** A palette chip (pointer-dragged onto the timeline): page DOM. */
export function chipHtml(cmd) {
  const isLoop = cmd === 'repeat';
  const c = isLoop ? REPEAT : COMMANDS[cmd];
  const sec = isLoop ? '' : `<span class="rt-cdur">${fmt(durationOf({ cmd, props: {} }))} s</span>`;
  return `<div class="rt-chip rt-k-${kindOfCmd(cmd)}" data-chip="${cmd}" role="button" tabindex="0" aria-label="Drag ${esc(c.label)} onto the timeline">
    <span class="rt-ic">${icon(c.icon, 15)}</span><span class="rt-clabel">${esc(c.label)}</span>${sec}</div>`;
}

export const laneHeadHtml = (lane, busy) => `<div class="rt-lhead rt-k-${lane.device === 'belt' ? 'belt' : lane.device === 'camera' ? 'camera' : 'arm'}">
  <span class="rt-ic">${icon(DEVICES[lane.device]?.icon ?? 'arm', 16)}</span><span><b>${esc(DEVICES[lane.device]?.label ?? lane.device)}</b><small>${esc(busy)}</small></span></div>`;
