// marketing-automation-view.ts — what the Marketing automation studio demo
// PAINTS, kept framework-free and engine-free (demos/interaction/
// marketing-automation-view.js, translated to TypeScript):
//
//   • the icon set (CSS masks in currentColor — our own line glyphs, plus the
//     Slack mark from Simple Icons, CC0)
//   • the colours of lines and path chips (model styles, so they follow the
//     colour scheme in JS rather than CSS)
//   • the step cards and the workflow note, as the structured, sanitised HTML
//     trees a node's `metadata.html` takes, and a hidden twin to measure them in
//   • the ports every card carries, and the property panel's field table
//
// (Copied verbatim next to the demo in the React, Vue, Angular and Qwik apps —
// keep the copies identical.)

import * as M from './marketing-automation-model';
import type { Automation, Kind, Step } from './marketing-automation-model';

const { KINDS } = M;
const isDark = () => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;

// ---- icons: masks painted in currentColor --------------------------------------
// Our own 24px line glyphs; the Slack mark is Simple Icons (CC0).
export const ICONS: Record<string, string> = {
  flag: '<path d="M5.5 21V4"/><path d="M5.5 4.5h11.5l-2.4 4 2.4 4H5.5"/>',
  mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="m4.5 7.5 7.5 5.5 7.5-5.5"/>',
  task: '<rect x="4" y="4" width="16" height="16" rx="3.5"/><path d="m8.5 12.2 2.4 2.4 4.6-5"/>',
  gauge: '<path d="M4.3 16.5a8.5 8.5 0 1 1 15.4 0"/><path d="m12 14.5 3.8-4.6"/><circle cx="12" cy="14.6" r="1.3"/>',
  users: '<circle cx="9" cy="8.5" r="3"/><path d="M3.5 19c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6"/><circle cx="17" cy="9.5" r="2.3"/><path d="M15.9 14.6c2.3.1 4 1.5 4.6 4.1"/>',
  bolt: '<path d="M13.5 3 5.5 13.5h6l-1 7.5 8-10.5h-6z"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  fork: '<circle cx="6.5" cy="5.5" r="2"/><circle cx="6.5" cy="18.5" r="2"/><circle cx="17.5" cy="6.5" r="2"/><path d="M6.5 7.5v9"/><path d="M17.5 8.5c0 4.2-3.6 5-8.6 7.3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  play: '<path d="M7 4.5v15l12-7.5z" fill="#000"/>',
  fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  fitw: '<path d="M4 5v14M20 5v14M7.5 12h9M10 9.5 7.5 12l2.5 2.5M14 9.5l2.5 2.5-2.5 2.5"/>',
  ff: '<path d="M4 6.5v11l7.5-5.5zM12.5 6.5v11l7.5-5.5z" fill="#000"/>',
  map: '<path d="m9 4.5-5 2v13l5-2 6 2 5-2v-13l-5 2z"/><path d="M9 4.5v13M15 6.5v13"/>',
  trash: '<path d="M4.5 7h15M10 11v6M14 11v6M6.5 7l1 12.5h9l1-12.5M9.5 7V4.5h5V7"/>',
  bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5" stroke-width="2.6"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  close: '<path d="M6 6l12 12M18 6 6 18" stroke-width="2.4"/>',
  automation: '<rect x="3.5" y="3.5" width="7" height="6" rx="1.5"/><rect x="13.5" y="14.5" width="7" height="6" rx="1.5"/><path d="M7 9.5V14a3 3 0 0 0 3 3h3.5"/>',
};
export const SLACK = 'M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z';
export function injectIconCss(): void {
  if (document.getElementById('ma-icons')) return;
  const url = (svg: string) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  const line = (p: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  const rules = Object.entries(ICONS).map(([k, p]) => `.ma-i-${k}{-webkit-mask-image:${url(line(p))};mask-image:${url(line(p))}}`);
  const slack = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 28 28"><path d="${SLACK}"/></svg>`;
  rules.push(`.ma-i-slack{-webkit-mask-image:${url(slack)};mask-image:${url(slack)}}`);
  const style = document.createElement('style');
  style.id = 'ma-icons';
  style.textContent = rules.join('\n');
  document.head.appendChild(style);
}
export const ico = (name: string, extra = '') => `<span class="ma-ico ma-i-${name}"${extra}></span>`;
export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as Record<string, string>)[c]);

// ---- line + chip colours (model styles, so they follow the scheme in JS) -------
export const PAL = {
  light: { line: '#aeb6c8', soft: '#c3c9d6', accent: '#3b52d9', done: '#1f9d55',
    chip: { color: '#8a5800', background: '#fff3dc', border: '#ecd096' }, chipDone: { color: '#13703b', background: '#e3f5ea', border: '#9fd8b5' } },
  dark: { line: '#4a5266', soft: '#3c4355', accent: '#8b9cf2', done: '#3ccf7e',
    chip: { color: '#f2cd7a', background: '#33290f', border: '#6a5321' }, chipDone: { color: '#8ce5b0', background: '#123222', border: '#2c7a4d' } },
};
export const pal = () => (isDark() ? PAL.dark : PAL.light);
export function lineStyle(kind: string, mark?: string): Record<string, unknown> {
  const P = pal();
  const base = { cornerRadius: 12, arrowHead: { type: 'none' }, strokeDasharray: undefined, animation: { type: 'none' } };
  if (kind === 'add' || kind === 'stub') return { ...base, stroke: P.soft, strokeWidth: 1.4, strokeDasharray: '4 4' };
  if (mark === 'run') return { ...base, stroke: P.accent, strokeWidth: 2.6, animation: { type: 'flow', speed: 'fast', direction: 'forward' } };
  if (mark === 'done') return { ...base, stroke: P.done, strokeWidth: 2.4 };
  return { ...base, stroke: P.line, strokeWidth: 1.6 };
}
export const chipStyle = (done: boolean) => ({ fontSize: 11, fontWeight: '600', padding: 5, borderRadius: 8, ...(done ? pal().chipDone : pal().chip) });

// ---- cards: structured, sanitised HTML (metadata.html) ---------------------------
/** One element of a node's structured HTML (what `metadata.html.content` takes). */
export interface HtmlTree { tag: string; className?: string; text?: string; attrs?: Record<string, string>; children?: HtmlTree[] }
export const tile = (kind: Kind): HtmlTree => ({ tag: 'span', className: `ma-tile t-${KINDS[kind].tone}`, children: [{ tag: 'span', className: `ma-ico ma-i-${KINDS[kind].icon}` }] });
export const badge = (): HtmlTree => ({ tag: 'span', className: 'ma-badge', children: [{ tag: 'span', className: 'ma-ico ma-i-check' }] });
export function cardContent(s: Step, mark?: string, extra: { fresh?: boolean; wait?: string } = {}): HtmlTree {
  const cls = ['ma-card', `ma-k-${s.kind}`];
  if (mark) cls.push(`ma-${mark}`);
  if (extra.fresh) cls.push('ma-new');
  if (s.kind === 'trigger') {
    const chips = M.triggerChips(s);
    const free = Object.keys(M.CRITERIA).some((k) => s.props[k] === '' || s.props[k] == null);
    return { tag: 'div', className: cls.join(' '), children: [
      { tag: 'div', className: 'ma-trig-head', children: [tile('trigger'),
        { tag: 'div', className: 'ma-txt', children: [{ tag: 'div', className: 'ma-type', text: 'Trigger · enrolls contacts' }, { tag: 'div', className: 'ma-title', text: s.title }] }, badge()] },
      { tag: 'div', className: 'ma-trig-event', text: M.TRIGGER_EVENTS[s.props['event']] || '' },
      ...(chips.length ? [{ tag: 'div', className: 'ma-chips', children: chips.map((c) => ({ tag: 'span', className: `ma-chip ma-c-${c.key}`, children: [
        { tag: 'span', className: 'ma-chip-t', text: c.text },
        { tag: 'span', className: `ma-chip-x ma-x-${c.key}`, attrs: { title: 'Remove this criterion' }, children: [{ tag: 'span', className: 'ma-ico ma-i-close' }] },
      ] })) }] : []),
      ...(free ? [{ tag: 'div', className: 'ma-addcrit', children: [{ tag: 'span', className: 'ma-ico ma-i-plus' }, { tag: 'span', text: 'Add criteria' }] }] : []),
    ] };
  }
  const type = s.kind === 'branch' ? `Branch · ${s.arms!.length} paths` : KINDS[s.kind].label;
  return { tag: 'div', className: cls.join(' '), children: [
    tile(s.kind),
    { tag: 'div', className: 'ma-txt', children: [{ tag: 'div', className: 'ma-type', text: type }, { tag: 'div', className: 'ma-title', text: M.stepTitle(s) }] },
    badge(),
    ...(mark === 'wait' ? [{ tag: 'span', className: 'ma-ff', children: [{ tag: 'span', className: 'ma-ico ma-i-ff' }, { tag: 'span', text: extra.wait || '' }] }, { tag: 'span', className: 'ma-bar' }] : []),
  ] };
}
export function noteContent(state: Automation, collapsed: boolean): HtmlTree {
  const head: HtmlTree = { tag: 'div', className: 'ma-note-head', attrs: { title: collapsed ? 'Expand the description' : 'Collapse the description' }, children: [
    { tag: 'span', className: 'ma-note-h', text: 'Workflow description' },
    { tag: 'span', className: 'ma-note-toggle', children: [{ tag: 'span', className: 'ma-ico ma-i-chevron' }] }] };
  if (collapsed) return { tag: 'div', className: 'ma-note ma-note-min', children: [head] };
  const S = state.steps, root = S[state.rootId];
  const chips = M.triggerChips(root).map((c) => c.text);
  const first = root.next ? S[root.next] : null;
  // The first Branch on the spine — what "how the branch decides" describes.
  let b: Step | null = first;
  while (b && b.kind !== 'branch') b = b.next ? S[b.next] : null;
  const pathText = (id: string | null) => {
    const names: string[] = [];
    while (id && names.length < 3) { const s: Step = S[id]; names.push(M.stepTitle(s)); id = s.kind === 'branch' ? null : s.next; }
    return names.length ? names.join(', then ') + (id ? '…' : '') : 'nothing yet: the path ends';
  };
  const sec = (h: string, children: HtmlTree[]): HtmlTree => ({ tag: 'div', className: 'ma-note-sec', children: [{ tag: 'h4', text: h }, ...children] });
  return { tag: 'div', className: 'ma-note', children: [head,
    sec('What it does', [{ tag: 'p', text: state.description || 'Describe this automation in the panel on the right.' }]),
    sec('Trigger', [{ tag: 'p', children: [{ tag: 'b', text: M.TRIGGER_EVENTS[root.props['event']] || 'A contact enrolls' }, { tag: 'span', text: chips.length ? ` — ${chips.join(', ')}.` : ' — no criteria yet.' }] }]),
    sec('First action', [{ tag: 'p', text: first ? `${KINDS[first.kind].label}: ${M.stepTitle(first)}.` : 'None yet — press + under the trigger.' }]),
    ...(b ? [sec(`Branch: ${b.title}`, [
      { tag: 'p', text: `Splits on ${M.BRANCH_PROPS[b.props['property']]?.label.toLowerCase() || b.props['property']}:` },
      { tag: 'ul', children: b.arms!.map((a) => ({ tag: 'li', children: [{ tag: 'b', text: a.label }, { tag: 'span', text: ` → ${pathText(a.next)}` }] })) },
    ])] : []),
  ] };
}

// ---- measuring (the trigger's chips wrap, the note grows with its text) ----------
let measureHost: HTMLElement | null = null;
const toDom = (n: HtmlTree): HTMLElement => {
  const el = document.createElement(n.tag);
  if (n.className) el.className = n.className;
  if (n.children) for (const c of n.children) el.appendChild(toDom(c));
  else if (n.text != null) el.textContent = n.text;
  return el;
};
export function measure(content: HtmlTree, width: number): number {
  // A framework may have re-mounted #stage since the twin was made (a route
  // change, a StrictMode double mount): the twin goes back in, never measures
  // detached (a detached twin is 0px tall).
  if (!measureHost || !measureHost.isConnected) {
    measureHost = measureHost ?? document.createElement('div');
    measureHost.id = 'ma-measure';
    (document.getElementById('stage') ?? document.body).appendChild(measureHost);
  }
  measureHost.style.width = width + 'px';
  measureHost.replaceChildren(toDom(content));
  return Math.ceil((measureHost.firstChild as HTMLElement).getBoundingClientRect().height);
}
/** Drop the measuring twin (the demo unmounted). */
export function disposeMeasure(): void { measureHost?.remove(); measureHost = null; }

// ---- ports: in on top, out at the bottom, a Branch's "add a path" on its right --
export interface PortSpec {
  id: string; type: 'input' | 'output'; side: string; shape: { shape: string; size: number };
  layout: { strategy: string; args: { units: string; x: number; y: number } };
  gating: { isConnectableStart: boolean; isConnectableEnd: boolean };
}
export const portSpec = (id: string, x: number, y: number, side: string, type: 'input' | 'output'): PortSpec => ({ id, type, side, shape: { shape: 'circle', size: 8 },
  layout: { strategy: 'absolute', args: { units: 'px', x, y } }, gating: { isConnectableStart: false, isConnectableEnd: false } });
export function portsFor(id: string, kind: string, w: number, h: number): PortSpec[] {
  if (kind === 'note') return [];
  if (kind === 'anchor') return [portSpec(`${id}__in`, w / 2, 0, 'top', 'input')];
  const out = [portSpec(`${id}__in`, w / 2, 0, 'top', 'input'), portSpec(`${id}__out`, w / 2, h, 'bottom', 'output')];
  if (kind === 'branch') out.push(portSpec(`${id}__add`, w, h / 2, 'right', 'output'));
  return out;
}

// ---- the property panel: one form per step kind (a hint under every field) -----
export interface FieldDef {
  key: string; label: string; type: 'select' | 'text' | 'number' | 'textarea';
  options?: Array<string | [string, string]>; hint: string; placeholder?: string; min?: number;
}
export const FIELDS: Partial<Record<Kind, FieldDef[]>> = {
  trigger: [
    { key: 'event', label: 'Enroll when', type: 'select', options: Object.entries(M.TRIGGER_EVENTS), hint: 'What a contact does to enter this automation.' },
    { key: 'formId', label: 'Form ID', type: 'text', placeholder: 'e.g. webinar-q4-tour', hint: 'Identifier of the form (or webinar sign-up) to watch.' },
    { key: 'pageUrl', label: 'Page URL', type: 'text', placeholder: '/webinars/*', hint: 'Only count submissions made on this page or URL pattern.' },
    { key: 'utmSource', label: 'UTM source', type: 'text', placeholder: 'linkedin', hint: 'The traffic source that must match before the contact enrolls.' },
    { key: 'minScore', label: 'Minimum lead score', type: 'number', min: 0, placeholder: '0', hint: 'Only enroll contacts whose lead score is at least this.' },
  ],
  email: [
    { key: 'template', label: 'Template', type: 'select', options: M.EMAIL_TEMPLATES, hint: 'The saved email design to send.' },
    { key: 'subject', label: 'Subject line', type: 'text', hint: 'What the contact sees in the inbox — under 60 characters reads best.' },
    { key: 'sender', label: 'Sender', type: 'text', hint: 'The name and mailbox the email comes from.' },
  ],
  slack: [
    { key: 'channel', label: 'Channel', type: 'text', hint: 'The channel (or person) to notify, e.g. #sales.' },
    { key: 'message', label: 'Message', type: 'textarea', hint: 'Write {{contact.name}} to insert the contact\'s name.' },
  ],
  task: [
    { key: 'owner', label: 'Assign to', type: 'select', options: M.TASK_OWNERS, hint: 'Who gets the to-do in their task list.' },
    { key: 'due', label: 'Due in (days)', type: 'number', min: 0, hint: 'Counted from the moment the contact reaches this step.' },
  ],
  score: [
    { key: 'amount', label: 'Points (+ / −)', type: 'number', hint: 'A positive number adds points, a negative one removes them.' },
    { key: 'reason', label: 'Reason', type: 'text', hint: 'Shown in the contact\'s score history.' },
  ],
  audience: [
    { key: 'audience', label: 'Audience', type: 'select', options: M.AUDIENCES, hint: 'The ads audience the contact is synced into.' },
    { key: 'network', label: 'Ad network', type: 'select', options: M.NETWORKS, hint: 'Where the audience lives.' },
  ],
  webhook: [
    { key: 'method', label: 'Method', type: 'select', options: ['POST', 'PUT'], hint: 'POST creates, PUT replaces.' },
    { key: 'url', label: 'Endpoint URL', type: 'text', hint: 'It receives the contact as JSON.' },
  ],
  branch: [
    { key: 'property', label: 'Split on', type: 'select', options: Object.entries(M.BRANCH_PROPS).map(([k, p]) => [k, p.label] as [string, string]), hint: 'The contact property the paths are decided by.' },
  ],
};
export const SUBTITLE: Record<Kind, string> = { trigger: 'Configure who enters the automation', email: 'Configure the email', slack: 'Configure the notification', task: 'Configure the task',
  score: 'Configure the score change', audience: 'Configure the audience sync', webhook: 'Configure the request', delay: 'Configure the wait', branch: 'Configure the paths' };
