// The Kanban studio's card face and card-details dialog — framework-free DOM.
// The page owns the board; this module only paints a card from its data and
// edits that data in a dialog, handing every change back through `onChange`.

const SVG_NS = 'http://www.w3.org/2000/svg';
/** 16px line icons, drawn with currentColor. */
const ICONS = {
  clock: 'M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM8 4.5V8l2.5 1.5',
  text: 'M2.5 4h11M2.5 8h11M2.5 12h7',
  comment: 'M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z',
  clip: 'M10.5 5 6 9.5a1.4 1.4 0 0 0 2 2l5-5a2.8 2.8 0 0 0-4-4l-5 5a4.2 4.2 0 0 0 6 6l4-4',
  check: 'M2.5 2.5h11v11h-11zM5 8l2 2 4-4',
};
export function icon(name) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('aria-hidden', 'true');
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

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
export const initials = (name) => name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
export function avatar(m) {
  const a = el('span', 'ks-av', initials(m.name));
  a.style.background = m.color;
  a.title = m.name;
  return a;
}

/** The due chip's words and state, from an offset in days. */
export function dueOf(due) {
  if (!due) return null;
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + due.in);
  const text = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const state = due.done ? 'done' : due.in < 0 ? 'overdue' : due.in <= 2 ? 'soon' : 'later';
  const words = { done: 'Complete', overdue: 'Overdue', soon: due.in === 0 ? 'Due today' : 'Due soon', later: 'Due' }[state];
  return { text, state, words };
}

/**
 * Paint a card into `host` (a fresh child, so the kit's own classes on the host
 * stay intact). `ctx` = { labels, members }.
 */
export function paintCard(host, d, ctx) {
  const card = el('div', 'ks-card');
  card.dataset.card = '';
  if (d.cover) {
    const cover = el('div', 'ks-cover');
    cover.style.background = d.cover;
    card.append(cover);
  }
  const body = el('div', 'ks-body');
  if (d.labels?.length) {
    const row = el('div', 'ks-labels');
    for (const id of d.labels) {
      const l = ctx.labels.find((x) => x.id === id);
      if (!l) continue;
      const pill = el('span', 'ks-label', l.name);
      pill.style.setProperty('--c', l.color);
      row.append(pill);
    }
    body.append(row);
  }
  body.append(el('div', 'ks-title', d.title));
  const badges = el('div', 'ks-badges');
  const due = dueOf(d.due);
  if (due) {
    const b = el('span', `ks-badge ks-due ks-due--${due.state}`);
    b.title = `${due.words}: ${due.text}`;
    b.append(icon('clock'), el('span', '', due.text));
    badges.append(b);
  }
  if (d.desc) {
    const b = el('span', 'ks-badge');
    b.title = 'This card has a description';
    b.append(icon('text'));
    badges.append(b);
  }
  if (d.comments) {
    const b = el('span', 'ks-badge');
    b.title = `${d.comments} comments`;
    b.append(icon('comment'), el('span', '', String(d.comments)));
    badges.append(b);
  }
  if (d.attachments) {
    const b = el('span', 'ks-badge');
    b.title = `${d.attachments} attachments`;
    b.append(icon('clip'), el('span', '', String(d.attachments)));
    badges.append(b);
  }
  if (d.checklist?.length) {
    const done = d.checklist.filter((i) => i.done).length;
    const b = el('span', `ks-badge ks-check${done === d.checklist.length ? ' ks-check--done' : ''}`);
    b.title = `Checklist: ${done} of ${d.checklist.length}`;
    b.append(icon('check'), el('span', '', `${done}/${d.checklist.length}`));
    badges.append(b);
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
  card.append(body);
  host.replaceChildren(card);
}

/** Does the card match the board's filter ({ labels:Set, members:Set, text })? */
export function matches(d, f) {
  if (f.labels.size && !(d.labels ?? []).some((l) => f.labels.has(l))) return false;
  if (f.members.size && !(d.members ?? []).some((m) => f.members.has(m))) return false;
  if (f.text) {
    const hay = `${d.title} ${d.desc ?? ''} ${(d.checklist ?? []).map((i) => i.t).join(' ')}`.toLowerCase();
    if (!hay.includes(f.text.toLowerCase())) return false;
  }
  return true;
}

/**
 * The CARD DETAILS dialog: edits a copy of the card's data and hands each
 * change to `onChange(next)` at once (the board repaints the card, and
 * autoHeight re-measures it). `onDelete()` removes the card. Answers close().
 */
export function openDetails(mount, d, ctx, { listName, onChange, onDelete }) {
  let data = structuredClone(d);
  const commit = () => onChange(structuredClone(data));

  const shade = el('div', 'ks-shade');
  const dlg = el('div', 'ks-dialog');
  dlg.setAttribute('role', 'dialog');
  dlg.setAttribute('aria-modal', 'true');
  dlg.setAttribute('aria-label', `Card: ${data.title}`);
  shade.append(dlg);

  if (data.cover) {
    const cover = el('div', 'ks-dlg-cover');
    cover.style.background = data.cover;
    dlg.append(cover);
  }
  const close = el('button', 'ks-dlg-x', '×');
  close.type = 'button';
  close.title = 'Close (Esc)';
  dlg.append(close);

  const head = el('div', 'ks-dlg-head');
  const title = el('textarea', 'ks-dlg-title');
  title.id = 'ks-dlg-title';
  title.rows = 1;
  title.value = data.title;
  title.setAttribute('aria-label', 'Card title');
  title.addEventListener('change', () => {
    const v = title.value.trim();
    if (v && v !== data.title) { data.title = v; commit(); }
  });
  head.append(title, el('div', 'ks-dlg-where', `in list ${listName}`));
  dlg.append(head);

  const grid = el('div', 'ks-dlg-grid');
  const main = el('div', 'ks-dlg-main');
  const side = el('div', 'ks-dlg-side');
  grid.append(main, side);
  dlg.append(grid);

  // Labels and members: toggles
  const section = (label) => { const s = el('section', 'ks-dlg-sec'); s.append(el('h4', '', label)); return s; };
  const labelSec = section('Labels');
  const labelRow = el('div', 'ks-dlg-chips');
  for (const l of ctx.labels) {
    const b = el('button', 'ks-chip ks-chip--label', l.name);
    b.type = 'button';
    b.style.setProperty('--c', l.color);
    const sync = () => b.setAttribute('aria-pressed', String((data.labels ?? []).includes(l.id)));
    sync();
    b.addEventListener('click', () => {
      const set = new Set(data.labels ?? []);
      set.has(l.id) ? set.delete(l.id) : set.add(l.id);
      data.labels = ctx.labels.map((x) => x.id).filter((id) => set.has(id));
      sync();
      commit();
    });
    labelRow.append(b);
  }
  labelSec.append(labelRow);
  main.append(labelSec);

  const memberSec = section('Members');
  const memberRow = el('div', 'ks-dlg-chips');
  for (const m of ctx.members) {
    const b = el('button', 'ks-chip ks-chip--member');
    b.type = 'button';
    b.append(avatar(m), el('span', '', m.name.split(' ')[0]));
    const sync = () => b.setAttribute('aria-pressed', String((data.members ?? []).includes(m.id)));
    sync();
    b.addEventListener('click', () => {
      const set = new Set(data.members ?? []);
      set.has(m.id) ? set.delete(m.id) : set.add(m.id);
      data.members = ctx.members.map((x) => x.id).filter((id) => set.has(id));
      sync();
      commit();
    });
    memberRow.append(b);
  }
  memberSec.append(memberRow);
  main.append(memberSec);

  // Description
  const descSec = section('Description');
  const desc = el('textarea', 'ks-dlg-desc');
  desc.id = 'ks-dlg-desc';
  desc.placeholder = 'Add a more detailed description…';
  desc.value = data.desc ?? '';
  desc.rows = 4;
  desc.addEventListener('change', () => {
    const v = desc.value.trim();
    if (v === (data.desc ?? '')) return;
    if (v) data.desc = v; else delete data.desc;
    commit();
  });
  descSec.append(desc);
  main.append(descSec);

  // Checklist
  const checkSec = section('Checklist');
  const bar = el('div', 'ks-dlg-bar');
  const barFill = el('span');
  const barText = el('span', 'ks-dlg-bar-text');
  bar.append(barText, el('span', 'ks-dlg-track'));
  bar.lastChild.append(barFill);
  const list = el('ul', 'ks-dlg-items');
  const renderItems = () => {
    const all = data.checklist ?? [];
    const done = all.filter((i) => i.done).length;
    const pct = all.length ? Math.round((done / all.length) * 100) : 0;
    barText.textContent = `${pct}%`;
    barFill.style.width = `${pct}%`;
    bar.classList.toggle('ks-dlg-bar--done', all.length > 0 && done === all.length);
    list.replaceChildren(...all.map((item, i) => {
      const li = el('li');
      const box = el('input');
      box.type = 'checkbox';
      box.id = `ks-item-${i}`;
      box.checked = item.done;
      const lab = el('label', item.done ? 'ks-done' : '', item.t);
      lab.htmlFor = box.id;
      box.addEventListener('change', () => { item.done = box.checked; renderItems(); commit(); });
      li.append(box, lab);
      return li;
    }));
  };
  const add = el('form', 'ks-dlg-add');
  const addIn = el('input');
  addIn.id = 'ks-dlg-add-item';
  addIn.placeholder = 'Add an item';
  addIn.setAttribute('aria-label', 'New checklist item');
  const addBtn = el('button', 'ks-btn', 'Add');
  addBtn.type = 'submit';
  add.append(addIn, addBtn);
  add.addEventListener('submit', (e) => {
    e.preventDefault();
    const t = addIn.value.trim();
    if (!t) return;
    (data.checklist ??= []).push({ t, done: false });
    addIn.value = '';
    renderItems();
    commit();
  });
  renderItems();
  checkSec.append(bar, list, add);
  main.append(checkSec);

  // Side: due date and the destructive action, apart
  const dueSec = section('Due date');
  const dueSel = el('select', 'ks-dlg-select');
  dueSel.id = 'ks-dlg-due';
  dueSel.setAttribute('aria-label', 'Due date');
  const opts = [['', 'No due date'], ['-1', 'Yesterday'], ['0', 'Today'], ['1', 'Tomorrow'], ['3', 'In 3 days'], ['7', 'In a week'], ['14', 'In two weeks']];
  for (const [v, t] of opts) { const o = el('option', '', t); o.value = v; dueSel.append(o); }
  dueSel.value = data.due ? String(data.due.in) : '';
  if (data.due && ![...dueSel.options].some((o) => o.value === String(data.due.in))) {
    const o = el('option', '', dueOf(data.due).text); o.value = String(data.due.in); dueSel.prepend(o); dueSel.value = o.value;
  }
  const doneWrap = el('label', 'ks-dlg-done');
  const doneBox = el('input');
  doneBox.type = 'checkbox';
  doneBox.id = 'ks-dlg-due-done';
  doneBox.checked = !!data.due?.done;
  doneWrap.append(doneBox, el('span', '', 'Complete'));
  const syncDone = () => { doneWrap.hidden = !data.due; };
  syncDone();
  dueSel.addEventListener('change', () => {
    data.due = dueSel.value === '' ? undefined : { in: Number(dueSel.value), done: doneBox.checked };
    if (!data.due) delete data.due;
    syncDone();
    commit();
  });
  doneBox.addEventListener('change', () => { if (data.due) { data.due.done = doneBox.checked; commit(); } });
  dueSec.append(dueSel, doneWrap);
  side.append(dueSec);

  const del = el('button', 'ks-btn ks-btn--danger', 'Delete card');
  del.type = 'button';
  del.addEventListener('click', () => { onDelete(); done(); });
  const delSec = section('Actions');
  delSec.append(del, el('p', 'ks-dlg-hint', 'Undo brings it back.'));
  side.append(delSec);

  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(); } };
  const done = () => {
    // a title or description still being typed counts as written
    title.dispatchEvent(new Event('change'));
    desc.dispatchEvent(new Event('change'));
    window.removeEventListener('keydown', onKey, true);
    shade.remove();
  };
  close.addEventListener('click', done);
  shade.addEventListener('pointerdown', (e) => { if (e.target === shade) done(); });
  window.addEventListener('keydown', onKey, true);
  mount.append(shade);
  title.focus();
  return { close: done, element: dlg };
}
