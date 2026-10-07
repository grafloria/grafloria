// The chatbot flow as plain data, and how a step becomes a card — copied as-is
// from demos/interaction/chatbot-flow.html. Framework-free: the same file sits
// next to the chatbot-flow demo in the React, Vue, Angular and Qwik apps.
import { PortModel } from '@grafloria/engine';

export interface Btn { id: string; title: string; url?: string }
export interface Block {
  id: string;
  kind: 'text' | 'collect' | 'delay' | 'image';
  text?: string; buttons?: Btn[];   // text
  field?: string;                   // collect: Phone / Email / Text
  secs?: number;                    // delay
  caption?: string;                 // image
}
export interface Action { id: string; label: string; sub: string }
export interface Trigger { label: string; sub: string }
export interface Step {
  id: string; kind: 'trigger' | 'message' | 'actions'; title: string; x: number; y: number;
  triggers?: Trigger[]; blocks?: Block[]; actions?: Action[];
}
export interface Flow { steps: Step[]; links: Array<[string, string]> }

// ---- the flow: steps + links, as plain data --------------------------------
export const W = { trigger: 232, message: 252, actions: 214 };
export const URL_BOOK = 'https://example.com/book';
export const FLOW0 = (): Flow => ({
  steps: [
    { id: 'trigger', kind: 'trigger', title: 'When…', x: 40, y: 70,
      triggers: [{ label: 'User sends a direct message', sub: 'Default reply' }] },
    { id: 'welcome', kind: 'message', title: 'Default Reply', x: 340, y: 40, blocks: [
      { id: 't', kind: 'text', text: 'Hi there! 👋 Thanks for reaching out to Atlas Business Hub. Please choose your language:\n\nأهلاً بك! 👋 شكراً لتواصلك مع أطلس لخدمات الأعمال. من فضلك اختر لغتك:',
        buttons: [{ id: 'en', title: 'English' }, { id: 'ar', title: 'العربية' }] },
    ] },
    { id: 'en_menu', kind: 'message', title: 'Send Message', x: 680, y: 150, blocks: [
      { id: 'd', kind: 'delay', secs: 2 },
      { id: 't', kind: 'text', text: 'Welcome! 🙌 We help you start and run your business:\n• Company registration\n• Virtual office\n• Website & online store\n• Accounting software\n\nShall we call you, or would you like to book a time yourself?',
        buttons: [{ id: 'phone', title: 'Call me back' }, { id: 'book', title: 'Book a call', url: URL_BOOK }] },
    ] },
    { id: 'ar_menu', kind: 'message', title: 'Send Message #4', x: 420, y: 470, blocks: [
      { id: 't', kind: 'text', text: 'أهلاً بك! 🙌 نساعدك على تأسيس شركتك وإدارتها:\n• تسجيل الشركات\n• مكتب افتراضي\n• المواقع والمتاجر الإلكترونية\n• برامج المحاسبة\n\nهل تفضل أن نتصل بك، أم تحجز موعداً بنفسك؟',
        buttons: [{ id: 'phone', title: 'اتصلوا بي' }, { id: 'book', title: 'احجز مكالمة', url: URL_BOOK }] },
    ] },
    { id: 'en_ask', kind: 'message', title: 'Send Message #2', x: 1010, y: 210, blocks: [
      { id: 't', kind: 'text', text: 'Please send your phone number and we\'ll call you within 24 hours.', buttons: [] },
      { id: 'c', kind: 'collect', field: 'Phone' },
    ] },
    { id: 'en_retry', kind: 'message', title: 'Send Message #3', x: 1340, y: 40, blocks: [
      { id: 't', kind: 'text', text: 'Still there? 🙂 Send your number any time, or book a call here: ' + URL_BOOK, buttons: [] },
    ] },
    { id: 'en_actions', kind: 'actions', title: 'Actions', x: 1340, y: 260,
      actions: [{ id: 'a1', label: 'Notify assignees', sub: '2 people via e-mail' }, { id: 'a2', label: 'Add tag', sub: 'Lead · call back' }] },
    { id: 'en_thanks', kind: 'message', title: 'Send Message #1', x: 1340, y: 420, blocks: [
      { id: 't', kind: 'text', text: 'Thank you! A member of our team will call you within 24 hours. Have a great day!', buttons: [] },
    ] },
    { id: 'ar_ask', kind: 'message', title: 'Send Message #5', x: 760, y: 640, blocks: [
      { id: 't', kind: 'text', text: 'من فضلك أرسل رقم هاتفك وسنتصل بك خلال ٢٤ ساعة.', buttons: [] },
      { id: 'c', kind: 'collect', field: 'Phone' },
    ] },
    { id: 'ar_retry', kind: 'message', title: 'Send Message #7', x: 1090, y: 600, blocks: [
      { id: 't', kind: 'text', text: 'هل ما زلت هنا؟ 🙂 أرسل رقمك في أي وقت، أو احجز مكالمة من هنا: ' + URL_BOOK, buttons: [] },
    ] },
    { id: 'ar_actions', kind: 'actions', title: 'Actions #1', x: 1090, y: 790,
      actions: [{ id: 'a1', label: 'Notify assignees', sub: '2 people via e-mail' }, { id: 'a2', label: 'Add tag', sub: 'Lead · call back' }] },
    { id: 'ar_thanks', kind: 'message', title: 'Send Message #6', x: 1090, y: 950, blocks: [
      { id: 't', kind: 'text', text: 'شكراً لك! سيتصل بك أحد أعضاء فريقنا خلال ٢٤ ساعة. يوماً سعيداً!', buttons: [] },
    ] },
  ],
  links: [
    ['trigger__then', 'welcome'], ['welcome__b_en', 'en_menu'], ['welcome__b_ar', 'ar_menu'],
    ['en_menu__b_phone', 'en_ask'], ['ar_menu__b_phone', 'ar_ask'],
    ['en_ask__reply', 'en_actions'], ['en_ask__noreply', 'en_retry'], ['en_ask__next', 'en_thanks'],
    ['ar_ask__reply', 'ar_actions'], ['ar_ask__noreply', 'ar_retry'], ['ar_ask__next', 'ar_thanks'],
  ],
});

// ---- ports: which kind each one is, and how it and its line look ------------
export type PortKind = 'in' | 'button' | 'next' | 'reply' | 'noreply';
export const portKind = (pid: string): PortKind => pid.endsWith('__in') ? 'in' : pid.endsWith('__noreply') ? 'noreply'
  : pid.endsWith('__reply') ? 'reply' : pid.includes('__b_') ? 'button' : 'next';
const PORT_STYLE: Record<PortKind, { fill: string; stroke: string; strokeWidth: number }> = {
  in:      { fill: '#ffffff', stroke: '#9aa3b5', strokeWidth: 1.5 },
  button:  { fill: '#7d8698', stroke: '#ffffff', strokeWidth: 1.5 },
  next:    { fill: '#ffffff', stroke: '#7d8698', strokeWidth: 1.5 },
  reply:   { fill: '#f5a524', stroke: '#ffffff', strokeWidth: 1.5 },
  noreply: { fill: '#ef4444', stroke: '#ffffff', strokeWidth: 1.5 },
};
const LINE = { grey: '#9aa3b5', reply: '#f5a524', noreply: '#ef4444' };
const lineColor = (srcPid: string) => { const k = portKind(srcPid); return k === 'reply' ? LINE.reply : k === 'noreply' ? LINE.noreply : LINE.grey; };
export const lineStyle = (srcPid: string, running = false) => ({
  stroke: running ? '#2f7cf6' : lineColor(srcPid), strokeWidth: running ? 2.4 : 1.6,
  arrowHead: { type: 'arrow', size: 7, filled: true, color: running ? '#2f7cf6' : lineColor(srcPid) },
  animation: running ? { type: 'flow', speed: 'fast', direction: 'forward' } : { type: 'none' },
});

// ---- a step → its card (structured, sanitised HTML; `port` marks a row) -----
export interface CardNode { tag: string; className?: string; text?: string; port?: string; children?: CardNode[] }
const textRuns = (text: string): CardNode[] => {
  const parts = String(text).split(/(https?:\/\/\S+)/g).filter((p) => p !== '');
  return parts.map((p) => /^https?:\/\//.test(p) ? { tag: 'span', className: 'mc-link', text: p } : { tag: 'span', text: p });
};
const head = (step: Step, chan: string): CardNode => ({ tag: 'div', className: 'mc-head', children: [
  { tag: 'span', className: 'mc-ch' },
  { tag: 'div', children: [{ tag: 'div', className: 'mc-chan', text: chan }, { tag: 'div', className: 'mc-title', text: step.title || 'Untitled' }] },
] });
const outRow = (pid: string, cls: string, text: string): CardNode => ({ tag: 'div', className: 'mc-out ' + cls, text, port: pid });

export function cardContent(step: Step, flags: { sel?: boolean; run?: boolean } = {}): CardNode {
  const cls = 'mc-card' + (flags.sel ? ' mc-sel' : '') + (flags.run ? ' mc-run' : '');
  if (step.kind === 'trigger') {
    return { tag: 'div', className: cls + ' mc-trig', children: [
      { tag: 'div', className: 'mc-head mc-head-trig', children: [{ tag: 'span', className: 'mc-bolt', text: '⚡' }, { tag: 'span', text: step.title }] },
      { tag: 'div', className: 'mc-body', children: [
        ...step.triggers!.map((t) => ({ tag: 'div', className: 'mc-trig-chip', children: [
          { tag: 'span', className: 'mc-ch' },
          { tag: 'div', children: [{ tag: 'div', className: 'mc-trig-l', text: t.label }, { tag: 'div', className: 'mc-trig-s', text: t.sub }] },
        ] })),
        { tag: 'div', className: 'mc-new-trig', text: '+ New Trigger' },
      ] },
      { tag: 'div', className: 'mc-foot', children: [outRow(step.id + '__then', 'mc-next', 'Then')] },
    ] };
  }
  if (step.kind === 'actions') {
    return { tag: 'div', className: cls + ' mc-act', children: [
      { tag: 'div', className: 'mc-head-act', text: '⚡ ' + (step.title || 'Actions') },
      { tag: 'div', className: 'mc-body', children: step.actions!.length
        ? step.actions!.map((a) => ({ tag: 'div', className: 'mc-action', children: [
            { tag: 'div', className: 'mc-a-l', text: a.label }, { tag: 'div', className: 'mc-a-s', text: a.sub }] }))
        : [{ tag: 'div', className: 'mc-a-l', text: 'No actions yet' }] },
      { tag: 'div', className: 'mc-foot', children: [outRow(step.id + '__next', 'mc-next', 'Next Step')] },
    ] };
  }
  const body: CardNode[] = [];
  for (const b of step.blocks!) {
    if (b.kind === 'text') {
      body.push({ tag: 'div', className: 'mc-bubble', children: [
        b.text!.trim() ? { tag: 'div', className: 'mc-text', children: textRuns(b.text!) } : { tag: 'div', className: 'mc-text mc-empty', text: 'Enter your text…' },
        ...b.buttons!.map((btn): CardNode => btn.url
          ? { tag: 'div', className: 'mc-btn mc-url', children: [{ tag: 'span', text: btn.title || 'Button' }, { tag: 'span', className: 'mc-url-ico', text: '↗' }] }
          : { tag: 'div', className: 'mc-btn', text: btn.title || 'Button', port: `${step.id}__b_${btn.id}` }),
      ] });
    } else if (b.kind === 'collect') {
      body.push({ tag: 'div', className: 'mc-wait', children: [{ tag: 'span', className: 'mc-wait-ico' }, { tag: 'span', text: `Waiting for ${b.field} from contact…` }] });
    } else if (b.kind === 'delay') {
      body.push({ tag: 'div', className: 'mc-delay', children: [{ tag: 'span', className: 'mc-delay-ico' }, { tag: 'span', text: `Typing… ${b.secs} sec` }] });
    } else if (b.kind === 'image') {
      body.push({ tag: 'div', className: 'mc-img', text: '🖼  ' + (b.caption || 'Image') });
    }
  }
  const collects = step.blocks!.some((b) => b.kind === 'collect');
  return { tag: 'div', className: cls + ' mc-msg', children: [
    head(step, 'Messenger'),
    { tag: 'div', className: 'mc-body', children: body },
    { tag: 'div', className: 'mc-foot', children: [
      ...(collects ? [outRow(step.id + '__reply', 'mc-reply', '⚡ Action on reply'), outRow(step.id + '__noreply', 'mc-noreply', 'If contact has not responded')] : []),
      outRow(step.id + '__next', 'mc-next', 'Next Step'),
    ] },
  ] };
}
// The renderer drops keys it does not know, but strip `port` anyway — the
// model stores exactly what it renders.
export const stripPorts = (n: CardNode): CardNode => {
  const { port, children, ...rest } = n;
  return children ? { ...rest, children: children.map(stripPorts) } : rest;
};

// ---- measuring: the card's height, and the centre of every port row ---------
// A hidden twin (#mc-measure, appended to <body>) the page measures cards in,
// so every port lands on its row. disposeMeasure() removes it on unmount.
let measureHost: HTMLElement | null = null;
const toDom = (n: CardNode): HTMLElement => {
  const el = document.createElement(n.tag);
  if (n.className) el.className = n.className;
  if (n.port) el.dataset['port'] = n.port;
  if (n.children) for (const c of n.children) el.appendChild(toDom(c));
  else if (n.text != null) el.textContent = n.text;
  return el;
};
export interface Measured { w: number; h: number; rows: Record<string, number> }
export function measure(step: Step): Measured {
  if (!measureHost || !measureHost.isConnected) {
    measureHost = document.createElement('div'); measureHost.id = 'mc-measure'; document.body.appendChild(measureHost);
  }
  const w = W[step.kind];
  measureHost.style.width = w + 'px';
  measureHost.replaceChildren(toDom(cardContent(step)));
  const card = measureHost.firstChild as HTMLElement, top = card.getBoundingClientRect().top;
  const h = Math.ceil(card.getBoundingClientRect().height);
  const rows: Record<string, number> = {};
  for (const el of Array.from(card.querySelectorAll<HTMLElement>('[data-port]'))) {
    const r = el.getBoundingClientRect();
    rows[el.dataset['port']!] = Math.round(r.top - top + r.height / 2);
  }
  return { w, h, rows };
}
export function disposeMeasure(): void {
  measureHost?.remove();
  measureHost = null;
}

// The ports a measured step needs: one input on the header, one output per row.
export interface PortPlace { id: string; type: 'input' | 'output'; side: 'left' | 'right'; x: number; y: number }
export function portList(step: Step, m: Measured): PortPlace[] {
  const out: PortPlace[] = [];
  if (step.kind !== 'trigger') out.push({ id: step.id + '__in', type: 'input', side: 'left', x: 0, y: 23 });
  for (const [pid, y] of Object.entries(m.rows)) {
    out.push({ id: pid, type: 'output', side: 'right', x: m.w, y });
  }
  return out;
}
const portConfig = (p: PortPlace) => ({
  id: p.id, type: p.type, side: p.side,
  shape: { shape: 'circle', size: 12 },
  layout: { strategy: 'absolute', args: { units: 'px', x: p.x, y: p.y } },
  style: PORT_STYLE[portKind(p.id)],
});
const portSpec = (p: PortPlace) => ({ ...portConfig(p), gating: { isConnectableStart: p.type === 'output', isConnectableEnd: p.type === 'input' } });
export const portModel = (p: PortPlace) => new PortModel({ ...portConfig(p), isConnectableStart: p.type === 'output', isConnectableEnd: p.type === 'input' } as never);

export function nodeSpec(step: Step, flags?: { sel?: boolean; run?: boolean }) {
  const m = measure(step);
  return {
    id: step.id, position: { x: step.x, y: step.y }, size: { width: m.w, height: m.h },
    metadata: { html: { content: stripPorts(cardContent(step, flags)), padding: 0 } },
    shape: { type: 'rect', cornerRadius: 12 },
    style: { selection: 'border' },   // selected = the card's own border, no ring
    ports: portList(step, m).map(portSpec),
  };
}
export const edgeSpecs = (links: Flow['links']) => links.map(([src, tgt], i) => ({
  id: 'l' + i, source: src.split('__')[0], target: tgt, sourceHandle: src,
  targetHandle: tgt + '__in', type: 'bezier', style: lineStyle(src),
}));
