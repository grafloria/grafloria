// The Kanban studio's CARD DETAILS dialog — the full card: cover, title, the
// badge row (members, labels, watch, dates), description, attachments,
// checklist and activity with comments, and the "Add to card" / "Actions"
// sidebar with its popovers. It edits a copy of the card and hands every change
// to `onChange(next)` at once: the board repaints the card and autoHeight
// re-measures it. Framework-free DOM.

import { el, icon, avatar, dueOf, when } from './kanban-studio-card.js';
import { coverBackground, attachmentThumb, COVER_ART, COVER_COLORS } from './kanban-studio-art.js';

const btn = (cls, text, iconName) => {
  const b = el('button', cls);
  b.type = 'button';
  if (iconName) b.append(icon(iconName));
  if (text) b.append(el('span', '', text));
  return b;
};
const autosize = (ta) => { ta.style.height = 'auto'; ta.style.height = `${ta.scrollHeight}px`; };

/**
 * Open the dialog over `mount`. `o` = { card, listId, lists, ctx: { labels,
 * members, me }, onChange(next), onArchive(), onCopy(), onMove(listId), log(text) }.
 * Answers { close, element }.
 */
export function openCardDialog(mount, o) {
  let data = structuredClone(o.card);
  const { ctx } = o;
  const memberOf = (id) => ctx.members.find((m) => m.id === id);
  const listName = (id) => o.lists.find((l) => l.id === id)?.name ?? '';
  const commit = (logText) => { o.onChange(structuredClone(data)); if (logText) o.log(logText); renderAll(); };

  const shade = el('div', 'ks-shade');
  const dlg = el('div', 'ks-dialog');
  dlg.setAttribute('role', 'dialog');
  dlg.setAttribute('aria-modal', 'true');
  shade.append(dlg);

  /* ---- popovers: one at a time, anchored under the button that opened it ---- */
  let pop = null;
  const closePop = () => { pop?.remove(); pop = null; };
  function popover(anchor, title, fill) {
    closePop();
    pop = el('div', 'ks-pop');
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', title);
    const head = el('div', 'ks-pop-head');
    const x = btn('ks-pop-x', '', 'close');
    x.setAttribute('aria-label', 'Close');
    x.addEventListener('click', closePop);
    head.append(el('span', '', title), x);
    const body = el('div', 'ks-pop-body');
    pop.append(head, body);
    fill(body);
    dlg.append(pop);
    const a = anchor.getBoundingClientRect(), d = dlg.getBoundingClientRect();
    const left = Math.max(8, Math.min(a.left - d.left, d.width - 312));
    pop.style.left = `${left}px`;
    pop.style.top = `${a.bottom - d.top + 6}px`;
    pop.querySelector('input, button:not(.ks-pop-x)')?.focus();
  }

  const labelsPicker = (body) => {
    const search = el('input', 'ks-field');
    search.placeholder = 'Search labels…';
    search.id = 'ks-pop-label-search';
    const list = el('div', 'ks-pop-list');
    const paint = () => list.replaceChildren(...ctx.labels.filter((l) => l.name.toLowerCase().includes(search.value.toLowerCase())).map((l) => {
      const row = el('label', 'ks-pop-label');
      const box = el('input');
      box.type = 'checkbox';
      box.checked = (data.labels ?? []).includes(l.id);
      box.addEventListener('change', () => {
        const set = new Set(data.labels ?? []);
        box.checked ? set.add(l.id) : set.delete(l.id);
        data.labels = ctx.labels.map((x) => x.id).filter((id) => set.has(id));
        commit();
      });
      const bar = el('span', 'ks-pop-bar', l.name);
      bar.style.setProperty('--c', l.color);
      row.append(box, bar);
      return row;
    }));
    search.addEventListener('input', paint);
    paint();
    body.append(search, el('h5', '', 'Labels'), list);
  };
  const membersPicker = (body) => {
    body.append(el('h5', '', 'Board members'));
    for (const m of ctx.members) {
      const row = btn('ks-pop-member');
      const on = (data.members ?? []).includes(m.id);
      row.append(avatar(m, 32), el('span', '', m.name), el('span', 'ks-pop-check', on ? '✓' : ''));
      row.setAttribute('aria-pressed', String(on));
      row.addEventListener('click', () => {
        const set = new Set(data.members ?? []);
        const adding = !set.has(m.id);
        adding ? set.add(m.id) : set.delete(m.id);
        data.members = ctx.members.map((x) => x.id).filter((id) => set.has(id));
        commit(m.id === ctx.me ? (adding ? `joined ${data.title}` : `left ${data.title}`) : `${adding ? 'added' : 'removed'} ${m.name} ${adding ? 'to' : 'from'} ${data.title}`);
        closePop();
      });
      body.append(row);
    }
  };
  const datesPicker = (body) => {
    const presets = [['Today', 0], ['Tomorrow', 1], ['In 3 days', 3], ['Next week', 7], ['In two weeks', 14]];
    const grid = el('div', 'ks-pop-dates');
    for (const [t, n] of presets) {
      const b = btn('ks-btn-subtle', t);
      b.addEventListener('click', () => { data.due = { in: n, done: false }; commit(`set ${data.title} to be due ${dueOf(data.due).text}`); closePop(); });
      grid.append(b);
    }
    body.append(el('h5', '', 'Due date'), grid);
    if (data.due) {
      const rm = btn('ks-btn-subtle ks-wide', 'Remove');
      rm.addEventListener('click', () => { delete data.due; commit(`removed the due date from ${data.title}`); closePop(); });
      body.append(rm);
    }
  };
  const coverPicker = (body) => {
    body.append(el('h5', '', 'Size'));
    const sizes = el('div', 'ks-pop-sizes');
    for (const size of ['normal', 'full']) {
      const b = btn(`ks-size ks-size--${size}`);
      b.setAttribute('aria-label', size === 'full' ? 'Full cover' : 'Cover above the title');
      b.setAttribute('aria-pressed', String((data.cover?.size ?? 'normal') === size && !!data.cover));
      b.disabled = !data.cover;
      b.addEventListener('click', () => { data.cover = { ...data.cover, size }; commit(); closePop(); coverBtnClick(); });
      sizes.append(b);
    }
    body.append(sizes, el('h5', '', 'Colours'));
    const colors = el('div', 'ks-pop-colors');
    for (const c of COVER_COLORS) {
      const b = btn('ks-swatch');
      b.style.background = c;
      b.setAttribute('aria-label', `Cover colour ${c}`);
      b.addEventListener('click', () => { data.cover = { color: c, size: data.cover?.size }; commit(); closePop(); });
      colors.append(b);
    }
    body.append(colors, el('h5', '', 'Illustrations'));
    const arts = el('div', 'ks-pop-arts');
    for (const name of Object.keys(COVER_ART)) {
      const b = btn('ks-art');
      b.style.background = coverBackground({ art: name });
      b.setAttribute('aria-label', `Cover illustration ${name}`);
      b.addEventListener('click', () => { data.cover = { art: name, size: data.cover?.size }; commit(); closePop(); });
      arts.append(b);
    }
    body.append(arts);
    if (data.cover) {
      const rm = btn('ks-btn-subtle ks-wide', 'Remove cover');
      rm.addEventListener('click', () => { delete data.cover; commit(); closePop(); });
      body.append(rm);
    }
  };
  let coverBtnClick = () => {};
  const movePicker = (body) => {
    const sel = el('select', 'ks-field');
    sel.id = 'ks-pop-move';
    for (const l of o.lists) { const opt = el('option', '', l.name + (l.id === o.listId ? ' (current)' : '')); opt.value = l.id; sel.append(opt); }
    sel.value = o.listId;
    const go = btn('ks-btn', 'Move');
    go.addEventListener('click', () => { if (sel.value !== o.listId) { const to = sel.value; done(); o.onMove(to); } else closePop(); });
    body.append(el('h5', '', 'List'), sel, go);
  };
  const sharePicker = (body) => {
    const link = el('input', 'ks-field');
    link.id = 'ks-pop-share';
    link.readOnly = true;
    link.value = `${location.origin}${location.pathname}#card-${o.cardId}`;
    const copy = btn('ks-btn', 'Copy link');
    copy.addEventListener('click', () => {
      link.select();
      navigator.clipboard?.writeText(link.value).then(() => { copy.lastChild.textContent = 'Copied'; }, () => { copy.lastChild.textContent = 'Press Ctrl+C'; });
    });
    body.append(el('h5', '', 'Link to this card'), link, copy);
  };

  /* ---- the dialog's parts --------------------------------------------------- */
  const coverEl = el('div', 'ks-dlg-cover');
  const coverBtn = btn('ks-dlg-coverbtn', 'Cover', 'image');
  coverEl.append(coverBtn);
  coverBtnClick = () => coverBtn.click();
  coverBtn.addEventListener('click', () => popover(coverBtn, 'Cover', coverPicker));
  const close = btn('ks-dlg-x', '', 'close');
  close.setAttribute('aria-label', 'Close (Esc)');
  close.title = 'Close (Esc)';

  const head = el('div', 'ks-dlg-head');
  const title = el('textarea', 'ks-dlg-title');
  title.id = 'ks-dlg-title';
  title.rows = 1;
  title.setAttribute('aria-label', 'Card title');
  title.addEventListener('input', () => autosize(title));
  title.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); title.blur(); } });
  title.addEventListener('change', () => { const v = title.value.trim().replace(/\s+/g, ' '); if (v && v !== data.title) { data.title = v; commit(); } else title.value = data.title; });
  const where = el('div', 'ks-dlg-where');
  head.append(icon('card', 20), el('div', 'ks-dlg-headtext'));
  head.lastChild.append(title, where);

  const grid = el('div', 'ks-dlg-grid');
  const main = el('div', 'ks-dlg-main');
  const side = el('div', 'ks-dlg-side');
  grid.append(main, side);
  dlg.append(coverEl, close, head, grid);

  const section = (iconName, label, ...tools) => {
    const s = el('section', 'ks-dlg-sec');
    const h = el('div', 'ks-dlg-sechead');
    h.append(icon(iconName, 20), el('h3', '', label), el('span', 'ks-sp'), ...tools);
    s.append(h);
    return s;
  };

  // The badge row: members · labels · notifications · dates
  const badges = el('div', 'ks-dlg-badges');
  // Description
  let editingDesc = false;
  const descSec = el('div');
  // Attachments, checklist, activity
  const attachSec = el('div');
  const checkSec = el('div');
  let hideChecked = false;
  let addingItem = false;
  const actSec = el('div');
  let showDetails = false;
  let commenting = false;
  main.append(badges, descSec, attachSec, checkSec, actSec);

  function renderBadges() {
    badges.replaceChildren();
    const group = (label, ...content) => { const g = el('div', 'ks-dlg-badge'); g.append(el('h4', '', label), ...content); return g; };
    if (data.members?.length) {
      const row = el('div', 'ks-dlg-avs');
      for (const id of data.members) { const m = memberOf(id); if (m) row.append(avatar(m, 32)); }
      const add = btn('ks-round', '', 'plus');
      add.setAttribute('aria-label', 'Add members');
      add.addEventListener('click', () => popover(add, 'Members', membersPicker));
      row.append(add);
      badges.append(group('Members', row));
    }
    if (data.labels?.length) {
      const row = el('div', 'ks-dlg-avs');
      for (const id of data.labels) {
        const l = ctx.labels.find((x) => x.id === id);
        if (!l) continue;
        const pill = btn('ks-dlg-label', l.name);
        pill.style.setProperty('--c', l.color);
        pill.addEventListener('click', () => popover(pill, 'Labels', labelsPicker));
        row.append(pill);
      }
      const add = btn('ks-round', '', 'plus');
      add.setAttribute('aria-label', 'Add labels');
      add.addEventListener('click', () => popover(add, 'Labels', labelsPicker));
      row.append(add);
      badges.append(group('Labels', row));
    }
    const watch = btn(`ks-btn-subtle${data.watching ? ' ks-on' : ''}`, data.watching ? 'Watching' : 'Watch', 'eye');
    if (data.watching) watch.append(el('span', 'ks-tick', '✓'));
    watch.addEventListener('click', () => { data.watching = !data.watching; commit(); });
    badges.append(group('Notifications', watch));
    if (data.due) {
      const due = dueOf(data.due);
      const box = el('input');
      box.type = 'checkbox';
      box.id = 'ks-dlg-due-done';
      box.checked = !!data.due.done;
      box.setAttribute('aria-label', 'Due date complete');
      box.addEventListener('change', () => { data.due.done = box.checked; commit(`marked the due date on ${data.title} ${box.checked ? 'complete' : 'incomplete'}`); });
      const chip = btn('ks-btn-subtle ks-dlg-due', `${due.text} at 12:00 PM`);
      chip.addEventListener('click', () => popover(chip, 'Dates', datesPicker));
      if (due.words) chip.append(el('span', `ks-due-tag ks-due--${due.state}`, due.words));
      const row = el('div', 'ks-dlg-avs');
      row.append(box, chip);
      badges.append(group('Due date', row));
    }
  }

  function renderDesc() {
    descSec.replaceChildren();
    const edit = btn('ks-btn-subtle', 'Edit');
    edit.addEventListener('click', () => { editingDesc = true; renderDesc(); });
    const s = section('text', 'Description', ...(data.desc && !editingDesc ? [edit] : []));
    if (editingDesc) {
      const ta = el('textarea', 'ks-field ks-dlg-desc');
      ta.id = 'ks-dlg-desc';
      ta.value = data.desc ?? '';
      ta.placeholder = 'Add a more detailed description…';
      const save = btn('ks-btn', 'Save');
      const cancel = btn('ks-btn-ghost', 'Cancel');
      save.addEventListener('click', () => { const v = ta.value.trim(); if (v) data.desc = v; else delete data.desc; editingDesc = false; commit(); });
      cancel.addEventListener('click', () => { editingDesc = false; renderDesc(); });
      const row = el('div', 'ks-row');
      row.append(save, cancel);
      s.append(ta, row);
      requestAnimationFrame(() => { ta.focus(); autosize(ta); });
      ta.addEventListener('input', () => autosize(ta));
    } else if (data.desc) {
      const text = el('div', 'ks-dlg-desctext');
      for (const para of data.desc.split(/\n{2,}/)) text.append(el('p', '', para));
      text.addEventListener('click', () => { editingDesc = true; renderDesc(); });
      s.append(text);
    } else {
      const ph = btn('ks-dlg-descph', 'Add a more detailed description…');
      ph.addEventListener('click', () => { editingDesc = true; renderDesc(); });
      s.append(ph);
    }
    descSec.append(s);
  }

  function renderAttachments() {
    attachSec.replaceChildren();
    if (!data.attachments?.length) return;
    const add = btn('ks-btn-subtle', 'Add');
    add.addEventListener('click', addAttachment);
    const s = section('clip', 'Attachments', add);
    for (const [i, a] of data.attachments.entries()) {
      const row = el('div', 'ks-att');
      const thumb = el('div', 'ks-att-thumb');
      thumb.style.background = attachmentThumb(a.kind);
      const info = el('div', 'ks-att-info');
      info.append(el('div', 'ks-att-name', a.name));
      const meta = el('div', 'ks-att-meta');
      meta.append(el('span', '', `Added ${when(a.at)}`));
      const del = btn('ks-link', 'Delete');
      del.addEventListener('click', () => { data.attachments.splice(i, 1); if (!data.attachments.length) delete data.attachments; commit(`deleted ${a.name} from ${data.title}`); });
      meta.append(el('span', 'ks-dot-sep', '•'), del);
      if (a.kind === 'image' || a.kind === 'design') {
        const mk = btn('ks-link', 'Make cover');
        mk.addEventListener('click', () => { data.cover = { art: a.kind === 'image' ? 'chart' : 'ui-mock' }; commit(); });
        meta.append(el('span', 'ks-dot-sep', '•'), mk);
      }
      info.append(meta);
      row.append(thumb, info);
      s.append(row);
    }
    attachSec.append(s);
  }
  function addAttachment() {
    const n = (data.attachments?.length ?? 0) + 1;
    (data.attachments ??= []).push({ name: `screenshot-${n}.png`, kind: 'image', at: 0 });
    commit(`attached screenshot-${n}.png to ${data.title}`);
  }

  function renderChecklist() {
    checkSec.replaceChildren();
    if (!data.checklist) return;
    const all = data.checklist;
    const doneN = all.filter((i) => i.done).length;
    const hide = btn('ks-btn-subtle', hideChecked ? `Show checked items (${doneN})` : 'Hide checked items');
    hide.addEventListener('click', () => { hideChecked = !hideChecked; renderChecklist(); });
    const del = btn('ks-btn-subtle', 'Delete');
    del.addEventListener('click', () => { delete data.checklist; commit(`removed the checklist from ${data.title}`); });
    const s = section('check', 'Checklist', ...(doneN ? [hide] : []), del);
    const pct = all.length ? Math.round((doneN / all.length) * 100) : 0;
    const bar = el('div', `ks-prog${pct === 100 ? ' ks-prog--done' : ''}`);
    const track = el('span', 'ks-prog-track');
    const fill = el('span');
    fill.style.width = `${pct}%`;
    track.append(fill);
    bar.append(el('span', 'ks-prog-text', `${pct}%`), track);
    s.append(bar);
    const ul = el('ul', 'ks-items');
    all.forEach((item, i) => {
      if (hideChecked && item.done) return;
      const li = el('li');
      const box = el('input');
      box.type = 'checkbox';
      box.id = `ks-item-${i}`;
      box.checked = item.done;
      const lab = el('label', item.done ? 'ks-done-text' : '', item.t);
      lab.htmlFor = box.id;
      box.addEventListener('change', () => {
        item.done = box.checked;
        commit(box.checked ? `completed ${item.t} on ${data.title}` : undefined);
      });
      li.append(box, lab);
      ul.append(li);
    });
    s.append(ul);
    if (addingItem) {
      const form = el('form', 'ks-additem');
      const input = el('textarea', 'ks-field');
      input.id = 'ks-dlg-add-item';
      input.rows = 1;
      input.placeholder = 'Add an item';
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); form.requestSubmit(); } });
      const add = btn('ks-btn', 'Add');
      add.type = 'submit';
      const cancel = btn('ks-btn-ghost', 'Cancel');
      cancel.addEventListener('click', () => { addingItem = false; renderChecklist(); });
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const t = input.value.trim();
        if (!t) return;
        all.push({ t, done: false });
        commit();
        requestAnimationFrame(() => checkSec.querySelector('#ks-dlg-add-item')?.focus());
      });
      const row = el('div', 'ks-row');
      row.append(add, cancel);
      form.append(input, row);
      s.append(form);
      requestAnimationFrame(() => input.focus());
    } else {
      const add = btn('ks-btn-subtle', 'Add an item');
      add.id = 'ks-dlg-additem-open';
      add.addEventListener('click', () => { addingItem = true; renderChecklist(); });
      s.append(add);
    }
    checkSec.append(s);
  }

  function renderActivity() {
    actSec.replaceChildren();
    const details = btn('ks-btn-subtle', showDetails ? 'Hide details' : 'Show details');
    details.addEventListener('click', () => { showDetails = !showDetails; renderActivity(); });
    const s = section('activity', 'Activity', details);
    const me = memberOf(ctx.me);
    const box = el('div', 'ks-cmt');
    box.append(avatar(me, 32));
    if (commenting) {
      const form = el('div', 'ks-cmt-form');
      const ta = el('textarea', 'ks-field');
      ta.id = 'ks-dlg-comment';
      ta.placeholder = 'Write a comment…';
      ta.rows = 3;
      const save = btn('ks-btn', 'Save');
      save.addEventListener('click', () => {
        const t = ta.value.trim();
        if (!t) return;
        (data.comments ??= []).push({ who: ctx.me, at: 0, text: t });
        commenting = false;
        commit(`commented on ${data.title}`);
      });
      form.append(ta, save);
      box.append(form);
      requestAnimationFrame(() => ta.focus());
    } else {
      const ph = btn('ks-cmt-ph', 'Write a comment…');
      ph.id = 'ks-dlg-comment-open';
      ph.addEventListener('click', () => { commenting = true; renderActivity(); });
      box.append(ph);
    }
    s.append(box);
    const feed = [
      ...(data.comments ?? []).map((cm, i) => ({ kind: 'comment', ...cm, i })),
      ...(showDetails ? (data.activity ?? []).map((a) => ({ kind: 'event', ...a })) : []),
    ].sort((a, b) => b.at - a.at);
    for (const item of feed) {
      const m = memberOf(item.who);
      const row = el('div', 'ks-feed');
      row.append(avatar(m, 32));
      const body = el('div', 'ks-feed-body');
      const line = el('div', 'ks-feed-line');
      line.append(el('strong', '', m.name));
      if (item.kind === 'event') line.append(document.createTextNode(` ${item.text}`));
      line.append(el('span', 'ks-feed-time', when(item.at)));
      body.append(line);
      if (item.kind === 'comment') {
        body.append(el('div', 'ks-feed-text', item.text));
        if (item.who === ctx.me) {
          const del = btn('ks-link', 'Delete');
          del.addEventListener('click', () => { data.comments.splice(item.i, 1); if (!data.comments.length) delete data.comments; commit(); });
          const links = el('div', 'ks-feed-links');
          links.append(del);
          body.append(links);
        }
      }
      row.append(body);
      s.append(row);
    }
    actSec.append(s);
  }

  function renderSide() {
    side.replaceChildren();
    const group = (label) => { const g = el('div', 'ks-side'); g.append(el('h4', '', label)); side.append(g); return g; };
    const add = group('Add to card');
    const sideBtn = (g, text, iconName, fn) => { const b = btn('ks-sidebtn', text, iconName); b.addEventListener('click', () => fn(b)); g.append(b); return b; };
    sideBtn(add, 'Members', 'people', (b) => popover(b, 'Members', membersPicker));
    sideBtn(add, 'Labels', 'tag', (b) => popover(b, 'Labels', labelsPicker));
    if (!data.checklist) sideBtn(add, 'Checklist', 'check', () => { data.checklist = []; addingItem = true; commit(`added a checklist to ${data.title}`); });
    sideBtn(add, 'Dates', 'clock', (b) => popover(b, 'Dates', datesPicker));
    sideBtn(add, 'Attachment', 'clip', addAttachment);
    if (!data.cover) sideBtn(add, 'Cover', 'image', (b) => popover(b, 'Cover', coverPicker));
    const acts = group('Actions');
    sideBtn(acts, 'Move', 'list', (b) => popover(b, 'Move card', movePicker));
    sideBtn(acts, 'Copy', 'copy', () => { o.onCopy(structuredClone(data)); });
    const arch = sideBtn(acts, 'Archive', 'archive', () => { done(); o.onArchive(); });
    arch.classList.add('ks-sidebtn--archive');
    sideBtn(acts, 'Share', 'share', (b) => popover(b, 'Share', sharePicker));
  }

  function renderAll() {
    coverEl.hidden = !data.cover;
    if (data.cover) coverEl.style.background = coverBackground(data.cover);
    dlg.setAttribute('aria-label', `Card: ${data.title}`);
    if (document.activeElement !== title) { title.value = data.title; requestAnimationFrame(() => autosize(title)); }
    where.replaceChildren(document.createTextNode('in list '), el('u', '', listName(o.listId)));
    if (data.watching) { const e = icon('eye'); e.classList.add('ks-where-eye'); where.append(e); }
    renderBadges();
    renderDesc();
    renderAttachments();
    renderChecklist();
    renderActivity();
    renderSide();
  }

  const onKey = (e) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    if (pop) closePop(); else done();
  };
  const done = () => {
    title.dispatchEvent(new Event('change'));
    window.removeEventListener('keydown', onKey, true);
    shade.remove();
    o.onClose?.();
  };
  close.addEventListener('click', done);
  shade.addEventListener('pointerdown', (e) => { if (e.target === shade) done(); });
  dlg.addEventListener('pointerdown', (e) => { if (pop && !pop.contains(e.target) && !e.target.closest('button')) closePop(); });
  window.addEventListener('keydown', onKey, true);
  mount.append(shade);
  renderAll();
  return { close: done, element: dlg, refresh: (card) => { data = structuredClone(card); renderAll(); } };
}
