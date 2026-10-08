// The Kanban studio's card face — framework-free DOM, painted from a card's data.
// Controls on the face (the complete circle, the due badge, the labels, the
// quick-edit pencil) carry `data-act` for the page's one delegated listener. A
// click on them acts; a press-and-drag from them still lifts the card, the way
// the whole face of a card is its handle. Only the pencil (`data-axdb-pass`)
// never starts a drag.

import { coverBackground } from './kanban-studio-art.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
/** 16px line icons, drawn with currentColor. */
const ICONS = {
  clock: 'M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM8 4.5V8l2.5 1.5',
  text: 'M2.5 4h11M2.5 8h11M2.5 12h7',
  comment: 'M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z',
  clip: 'M10.5 5 6 9.5a1.4 1.4 0 0 0 2 2l5-5a2.8 2.8 0 0 0-4-4l-5 5a4.2 4.2 0 0 0 6 6l4-4',
  check: 'M2.5 2.5h11v11h-11zM5 8l2 2 4-4',
  eye: 'M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8ZM8 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z',
  pencil: 'M10.5 2.5l3 3-8 8h-3v-3zM9 4l3 3',
  tick: 'M4 8.5l2.5 2.5 5.5-6',
  card: 'M2 3.5h12v9H2zM2 6.5h12',
  list: 'M3 4h10M3 8h10M3 12h6',
  people: 'M6 7a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM1.5 14c0-2.5 2-4.5 4.5-4.5S10.5 11.5 10.5 14M11 7a2 2 0 1 0 0-4M12.5 9.6c1.2.6 2 1.9 2 3.4',
  tag: 'M2 2h5.5l6.5 6.5-5.5 5.5L2 7.5zM5 5h.01',
  image: 'M2 3h12v10H2zM2 11l3.5-3.5 3 3L11 8l3 3M10.5 6h.01',
  archive: 'M2 3h12v3H2zM3 6v7h10V6M6.5 9h3',
  copy: 'M5 5h8v9H5zM3 11V2h8',
  share: 'M12 5.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM4 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM12 14.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM5.8 9l4.4 2.5M10.2 4.5 5.8 7',
  bell: 'M4 11V7a4 4 0 0 1 8 0v4l1.5 1.5h-11zM6.5 14h3',
  help: 'M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM6.2 6.2a1.9 1.9 0 0 1 3.6.8c0 1.3-1.8 1.5-1.8 2.8M8 11.5h.01',
  search: 'M7 12.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11ZM11 11l3.5 3.5',
  star: 'M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z',
  filter: 'M2 3h12L9.5 8.5V13l-3-1.5v-3z',
  dots: 'M3.5 8h.01M8 8h.01M12.5 8h.01',
  grid: 'M2.5 2.5h3v3h-3zM6.5 2.5h3v3h-3zM10.5 2.5h3v3h-3zM2.5 6.5h3v3h-3zM6.5 6.5h3v3h-3zM10.5 6.5h3v3h-3zM2.5 10.5h3v3h-3zM6.5 10.5h3v3h-3zM10.5 10.5h3v3h-3z',
  board: 'M2 2.5h12v11H2zM5.5 5v6M8.5 5v3.5M11.5 5v5',
  globe: 'M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM1.5 8h13M8 1.5c1.8 1.8 2.6 4 2.6 6.5S9.8 12.7 8 14.5C6.2 12.7 5.4 10.5 5.4 8S6.2 3.3 8 1.5Z',
  plus: 'M8 3v10M3 8h10',
  close: 'M4 4l8 8M12 4l-8 8',
  bolt: 'M9 1.5 3.5 9h4L7 14.5 12.5 7h-4z',
  activity: 'M2 8h2.5l2-4.5 3 9 2-4.5H14',
};
export function icon(name, size = 14) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('ks-ico');
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', ICONS[name]);
  p.setAttribute('fill', 'none');
  p.setAttribute('stroke', 'currentColor');
  p.setAttribute('stroke-width', '1.4');
  p.setAttribute('stroke-linecap', 'round');
  p.setAttribute('stroke-linejoin', 'round');
  svg.append(p);
  return svg;
}

export const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
export const initials = (name) => name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
export function avatar(m, size = 24) {
  const a = el('span', 'ks-av', initials(m.name));
  a.style.background = m.color;
  a.style.width = a.style.height = `${size}px`;
  a.title = m.name;
  return a;
}

/** "3 minutes ago", "yesterday at 4:12 PM", "Oct 4 at 9:30 AM" — from an offset in minutes. */
export function when(minutesOffset) {
  const d = new Date(Date.now() + minutesOffset * 60000);
  const ago = -minutesOffset;
  if (ago < 1) return 'just now';
  if (ago < 60) return `${Math.round(ago)} minute${Math.round(ago) === 1 ? '' : 's'} ago`;
  if (ago < 60 * 24 && new Date().getDate() === d.getDate()) return `${Math.round(ago / 60)} hour${Math.round(ago / 60) === 1 ? '' : 's'} ago`;
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (y.toDateString() === d.toDateString()) return `yesterday at ${time}`;
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} at ${time}`;
}

/** The due chip's words and state, from an offset in days. */
export function dueOf(due) {
  if (!due) return null;
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + due.in);
  const text = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const state = due.done ? 'done' : due.in < 0 ? 'overdue' : due.in <= 1 ? 'soon' : 'later';
  const words = { done: 'Complete', overdue: 'Overdue', soon: due.in === 0 ? 'Due today' : 'Due soon', later: '' }[state];
  return { text, state, words };
}

const badge = (iconName, text, title, extra = '') => {
  const b = el('span', `ks-badge ${extra}`.trim());
  b.title = title;
  b.append(icon(iconName));
  if (text !== undefined) b.append(el('span', '', text));
  return b;
};
const act = (e, name, pass = false) => { e.dataset.act = name; if (pass) e.dataset.axdbPass = ''; return e; };

/**
 * Paint a card into `host` (a fresh child, so the kit's own classes on the host
 * stay intact). `ctx` = { labels, members }.
 */
export function paintCard(host, d, ctx) {
  const card = el('div', 'ks-card');
  card.dataset.card = '';
  if (d.draft) return paintDraft(host, card, d);
  const full = d.cover?.size === 'full';
  card.classList.toggle('ks-card--full', full);
  card.classList.toggle('ks-card--complete', !!d.complete);
  if (d.cover) {
    const cover = el('div', full ? 'ks-cover ks-cover--full' : `ks-cover${d.cover.art ? ' ks-cover--art' : ''}`);
    cover.style.background = coverBackground(d.cover);
    card.append(cover);
  }
  const body = el('div', 'ks-body');
  if (!full && d.labels?.length) {
    const row = el('div', 'ks-labels');
    for (const id of d.labels) {
      const l = ctx.labels.find((x) => x.id === id);
      if (!l) continue;
      const pill = act(el('button', 'ks-label', l.name), 'labels');
      pill.type = 'button';
      pill.style.setProperty('--c', l.color);
      pill.title = `${l.name} — click to show or hide label names`;
      row.append(pill);
    }
    body.append(row);
  }
  const titleRow = el('div', 'ks-titlerow');
  if (!full) {
    const done = act(el('button', 'ks-done'), 'complete');
    done.type = 'button';
    done.title = d.complete ? 'Mark incomplete' : 'Mark complete';
    done.setAttribute('aria-label', done.title);
    done.setAttribute('aria-pressed', String(!!d.complete));
    done.append(icon('tick', 12));
    titleRow.append(done);
  }
  titleRow.append(el('span', 'ks-title', d.title));
  body.append(titleRow);
  if (!full) {
    const badges = el('div', 'ks-badges');
    if (d.watching) badges.append(badge('eye', undefined, 'You are watching this card'));
    const due = dueOf(d.due);
    if (due) {
      const b = act(el('button', `ks-badge ks-due ks-due--${due.state}`), 'due');
      b.type = 'button';
      b.title = `${due.words ? `${due.words}: ` : 'Due '}${due.text} — click to mark ${due.state === 'done' ? 'not ' : ''}complete`;
      const box = el('span', 'ks-due-box');
      box.append(icon('tick', 10));
      b.append(icon('clock'), box, el('span', '', due.text));
      badges.append(b);
    }
    if (d.desc) badges.append(badge('text', undefined, 'This card has a description'));
    if (d.comments?.length) badges.append(badge('comment', String(d.comments.length), `${d.comments.length} comments`));
    if (d.attachments?.length) badges.append(badge('clip', String(d.attachments.length), `${d.attachments.length} attachments`));
    if (d.checklist?.length) {
      const n = d.checklist.filter((i) => i.done).length;
      badges.append(badge('check', `${n}/${d.checklist.length}`, `Checklist items: ${n} of ${d.checklist.length}`, n === d.checklist.length ? 'ks-check--done' : 'ks-check'));
    }
    const people = el('span', 'ks-people');
    for (const id of d.members ?? []) {
      const m = ctx.members.find((x) => x.id === id);
      if (m) people.append(avatar(m));
    }
    if (badges.childElementCount || people.childElementCount) {
      const foot = el('div', 'ks-foot');
      foot.append(badges, people);
      body.append(foot);
    }
  }
  card.append(body);
  const edit = act(el('button', 'ks-edit'), 'open', true);
  edit.type = 'button';
  edit.title = 'Open card';
  edit.setAttribute('aria-label', 'Open card');
  edit.append(icon('pencil'));
  card.append(edit);
  host.replaceChildren(card);
}

/** The composer: a card-shaped textarea at the end of a list. */
function paintDraft(host, card, d) {
  card.classList.add('ks-card--draft');
  const ta = el('textarea', 'ks-draft');
  ta.placeholder = 'Enter a title for this card…';
  ta.rows = 2;
  ta.value = d.title ?? '';
  ta.setAttribute('aria-label', 'New card title');
  card.append(ta);
  host.replaceChildren(card);
  return ta;
}

/** Does the card match the board's filter ({ labels:Set, members:Set, due:Set, text })? */
export function matches(d, f) {
  if (d.draft) return true;
  if (f.labels.size && !(d.labels ?? []).some((l) => f.labels.has(l))) return false;
  if (f.members.size && !(d.members ?? []).some((m) => f.members.has(m))) return false;
  if (f.due?.size) {
    const s = dueOf(d.due)?.state ?? 'none';
    const want = [...f.due];
    if (!want.some((w) => (w === 'none' ? !d.due : w === 'overdue' ? s === 'overdue' : w === 'soon' ? s === 'soon' : w === 'done' ? s === 'done' : false))) return false;
  }
  if (f.text) {
    const hay = `${d.title} ${d.desc ?? ''} ${(d.checklist ?? []).map((i) => i.t).join(' ')}`.toLowerCase();
    if (!hay.includes(f.text.toLowerCase())) return false;
  }
  return true;
}
