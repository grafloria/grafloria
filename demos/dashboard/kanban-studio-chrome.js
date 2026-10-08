// The Kanban studio's app chrome — the app bar, the board header, the filter
// popover, the board menu drawer (about, background, activity) and the keyboard
// shortcuts sheet. Framework-free DOM; the page owns the state and passes
// callbacks in. Our own product mark and names throughout.

import { el, icon, avatar, when } from './kanban-studio-card.js';

const btn = (cls, text, iconName, title) => {
  const b = el('button', cls);
  b.type = 'button';
  if (iconName) b.append(icon(iconName, 16));
  if (text) b.append(el('span', '', text));
  if (title) { b.title = title; if (!text) b.setAttribute('aria-label', title); }
  return b;
};

/** Our product mark: three stacked cards. */
function mark() {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('width', '22');
  s.setAttribute('height', '22');
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = '<rect x="3" y="8" width="13" height="13" rx="3" fill="#fff" opacity=".45"/><rect x="6" y="5" width="13" height="13" rx="3" fill="#fff" opacity=".7"/><rect x="9" y="2" width="13" height="13" rx="3" fill="#fff"/><path d="M12 7h7M12 10h5" stroke="#3b52d9" stroke-width="1.8" stroke-linecap="round"/>';
  return s;
}

/**
 * Build the chrome into `appbar` and `boardbar`. `o` = { stage, data, filter,
 * onFilter, onBackdrop, onUndo, onRedo, activity(), backdropKey() }.
 */
export function buildChrome(appbar, boardbar, o) {
  const { data } = o;
  const memberOf = (id) => data.MEMBERS.find((m) => m.id === id);

  /* ---- floating menus (one at a time) ------------------------------------- */
  let menu = null;
  const closeMenu = () => { menu?.el.remove(); menu?.anchor.setAttribute('aria-expanded', 'false'); menu = null; };
  function openMenu(anchor, title, fill, width = 304) {
    if (menu?.anchor === anchor) return closeMenu();
    closeMenu();
    const m = el('div', 'ks-menu');
    m.style.width = `${width}px`;
    m.setAttribute('role', 'dialog');
    m.setAttribute('aria-label', title);
    const head = el('div', 'ks-pop-head');
    const x = btn('ks-pop-x', '', 'close', 'Close');
    x.addEventListener('click', closeMenu);
    head.append(el('span', '', title), x);
    const body = el('div', 'ks-pop-body');
    m.append(head, body);
    fill(body);
    o.stage.append(m);
    const a = anchor.getBoundingClientRect(), s = o.stage.getBoundingClientRect();
    m.style.left = `${Math.max(8, Math.min(a.left - s.left, s.width - width - 8))}px`;
    m.style.top = `${a.bottom - s.top + 6}px`;
    anchor.setAttribute('aria-expanded', 'true');
    menu = { el: m, anchor };
    m.querySelector('input')?.focus();
  }
  document.addEventListener('pointerdown', (e) => {
    if (menu && !menu.el.contains(e.target) && !menu.anchor.contains(e.target)) closeMenu();
  }, true);

  const backdropThumb = (key) => {
    const b = data.BACKDROPS.find((x) => x.key === key);
    return b?.image ? `url(${b.image}) center / cover` : b?.color ?? '#3b4a5f';
  };

  /* ---- the app bar ---------------------------------------------------------- */
  const apps = btn('ks-app-ibtn', '', 'grid', 'Switch apps');
  const brand = el('a', 'ks-brand');
  brand.href = '#';
  brand.addEventListener('click', (e) => e.preventDefault());
  brand.append(mark(), el('span', '', 'Grafloria Boards'));
  const nav = el('nav', 'ks-app-nav');
  const navMenu = (label, fill) => {
    const b = btn('ks-app-menu', label);
    b.append(el('span', 'ks-caret', '▾'));
    b.setAttribute('aria-haspopup', 'dialog');
    b.addEventListener('click', () => openMenu(b, label, fill));
    nav.append(b);
    return b;
  };
  navMenu('Workspaces', (body) => {
    body.append(el('h5', '', 'Current workspace'));
    const ws = el('div', 'ks-menu-row');
    const tile = el('span', 'ks-ws-tile', data.WORKSPACE[0]);
    ws.append(tile, el('span', '', data.WORKSPACE));
    body.append(ws);
  });
  const boardsList = (body, onlyStarred) => {
    for (const r of data.RECENT.filter((x, i) => !onlyStarred || i === 0)) {
      const row = el('div', 'ks-menu-row');
      const t = el('span', 'ks-menu-thumb');
      t.style.background = backdropThumb(r.backdrop);
      row.append(t, el('span', 'ks-menu-name', r.name), el('span', 'ks-menu-ws', data.WORKSPACE));
      body.append(row);
    }
  };
  navMenu('Recent', (body) => boardsList(body, false));
  navMenu('Starred', (body) => boardsList(body, true));
  navMenu('Templates', (body) => {
    for (const t of ['Kanban template', 'Project management', 'Design sprint', 'Bug tracker']) body.append(el('div', 'ks-menu-row ks-menu-plain', t));
  });
  const create = btn('ks-create', 'Create');
  create.addEventListener('click', () => openMenu(create, 'Create', (body) => {
    for (const [t, d] of [['Create board', 'A board is made up of cards ordered in lists.'], ['Start with a template', 'Get started faster with a board template.']]) {
      const row = el('div', 'ks-menu-item');
      row.append(el('strong', '', t), el('p', '', d));
      body.append(row);
    }
  }));
  nav.append(create);
  const search = el('label', 'ks-app-search');
  search.append(icon('search', 16));
  const searchIn = el('input');
  searchIn.id = 'ks-app-search';
  searchIn.placeholder = 'Search';
  searchIn.setAttribute('aria-label', 'Search cards on this board');
  search.append(searchIn);
  searchIn.addEventListener('input', () => { o.filter.text = searchIn.value.trim(); o.onFilter(); syncFilterBtn(); });
  const bell = btn('ks-app-ibtn ks-bell', '', 'bell', 'Notifications');
  bell.append(el('span', 'ks-bell-dot'));
  bell.addEventListener('click', () => openMenu(bell, 'Notifications', (body) => {
    for (const a of o.activity().slice(0, 4)) {
      const row = el('div', 'ks-notif');
      row.append(avatar(memberOf(a.who), 28));
      const t = el('div');
      t.append(el('strong', '', memberOf(a.who).name), document.createTextNode(` ${a.text}`), el('div', 'ks-feed-time', when(a.at)));
      row.append(t);
      body.append(row);
    }
    bell.querySelector('.ks-bell-dot')?.remove();
  }, 360));
  const help = btn('ks-app-ibtn', '', 'help', 'Keyboard shortcuts (?)');
  help.addEventListener('click', () => shortcuts());
  const me = avatar(memberOf(data.ME), 28);
  me.classList.add('ks-me');
  appbar.append(apps, brand, nav, el('span', 'ks-sp'), search, bell, help, me);

  /* ---- the board header ------------------------------------------------------ */
  const name = el('input', 'ks-name');
  name.id = 'ks-name';
  name.value = data.BOARD_NAME;
  name.setAttribute('aria-label', 'Board name');
  const fitName = () => { name.style.width = `${Math.max(4, name.value.length) + 1}ch`; };
  name.addEventListener('input', fitName);
  name.addEventListener('keydown', (e) => { if (e.key === 'Enter') name.blur(); });
  fitName();
  const star = btn('ks-bbtn ks-star', '', 'star', 'Star or unstar board');
  star.setAttribute('aria-pressed', 'true');
  star.addEventListener('click', () => star.setAttribute('aria-pressed', String(star.getAttribute('aria-pressed') !== 'true')));
  const vis = btn('ks-bbtn', '', 'people', 'Visibility: Workspace — everyone in the workspace can see this board');
  vis.addEventListener('click', () => openMenu(vis, 'Change visibility', (body) => {
    for (const [t, d, on] of [['Private', 'Only board members can see and edit this board.', false], ['Workspace', `All members of ${data.WORKSPACE} can see and edit this board.`, true], ['Public', 'Anyone on the internet can see this board.', false]]) {
      const row = el('div', `ks-menu-item${on ? ' ks-menu-item--on' : ''}`);
      row.append(el('strong', '', t + (on ? '  ✓' : '')), el('p', '', d));
      body.append(row);
    }
  }));
  const view = btn('ks-view', 'Board', 'board');
  view.setAttribute('aria-current', 'true');
  const left = el('div', 'ks-bb-left');
  left.append(name, star, vis, view);

  const filterBtn = btn('ks-bbtn ks-filterbtn', 'Filters', 'filter');
  filterBtn.id = 'ks-filter-btn';
  const filterCount = el('span', 'ks-fcount');
  filterBtn.append(filterCount);
  const clearBtn = btn('ks-bbtn ks-clear', 'Clear all');
  clearBtn.hidden = true;
  function syncFilterBtn() {
    const n = o.filter.labels.size + o.filter.members.size + o.filter.due.size + (o.filter.text ? 1 : 0);
    filterBtn.classList.toggle('ks-on', n > 0);
    filterCount.textContent = n ? String(n) : '';
    clearBtn.hidden = n === 0;
  }
  clearBtn.addEventListener('click', () => {
    o.filter.labels.clear(); o.filter.members.clear(); o.filter.due.clear(); o.filter.text = '';
    searchIn.value = '';
    o.onFilter(); syncFilterBtn(); closeMenu();
  });
  const filterPanel = (body) => {
    const kw = el('input', 'ks-field');
    kw.id = 'ks-filter-text';
    kw.placeholder = 'Enter a keyword…';
    kw.value = o.filter.text;
    kw.addEventListener('input', () => { o.filter.text = kw.value.trim(); searchIn.value = kw.value; o.onFilter(); syncFilterBtn(); });
    body.append(el('h5', '', 'Keyword'), kw, el('p', 'ks-hint', 'Search cards, members, labels, and more.'));
    const check = (set, value, label, lead) => {
      const row = el('label', 'ks-frow');
      const box = el('input');
      box.type = 'checkbox';
      box.checked = set.has(value);
      box.dataset.filter = value;
      box.addEventListener('change', () => { box.checked ? set.add(value) : set.delete(value); o.onFilter(); syncFilterBtn(); });
      row.append(box, lead, label);
      return row;
    };
    body.append(el('h5', '', 'Members'));
    const meM = memberOf(data.ME);
    body.append(check(o.filter.members, data.ME, el('span', '', 'Cards assigned to me'), avatar(meM, 24)));
    for (const m of data.MEMBERS.filter((x) => x.id !== data.ME)) body.append(check(o.filter.members, m.id, el('span', '', m.name), avatar(m, 24)));
    body.append(el('h5', '', 'Due date'));
    for (const [v, t, c] of [['none', 'No dates', '#8590a2'], ['overdue', 'Overdue', '#c9372c'], ['soon', 'Due in the next day', '#b38600'], ['done', 'Marked as complete', '#1f845a']]) {
      const dot = el('span', 'ks-fdot');
      dot.style.background = c;
      body.append(check(o.filter.due, v, el('span', '', t), dot));
    }
    body.append(el('h5', '', 'Labels'));
    for (const l of data.LABELS) {
      const bar = el('span', 'ks-fbar', l.name);
      bar.style.setProperty('--c', l.color);
      body.append(check(o.filter.labels, l.id, bar, el('span')));
    }
  };
  filterBtn.addEventListener('click', () => openMenu(filterBtn, 'Filter', filterPanel, 320));

  const team = el('div', 'ks-team');
  for (const m of data.MEMBERS) team.append(avatar(m, 28));
  const share = btn('ks-share', 'Share', 'people');
  share.addEventListener('click', () => openMenu(share, 'Share board', (body) => {
    const link = el('input', 'ks-field');
    link.id = 'ks-share-link';
    link.readOnly = true;
    link.value = location.href.split('#')[0];
    const copy = btn('ks-btn', 'Copy link');
    copy.addEventListener('click', () => { link.select(); navigator.clipboard?.writeText(link.value).then(() => { copy.lastChild.textContent = 'Copied'; }, () => { copy.lastChild.textContent = 'Press Ctrl+C'; }); });
    body.append(el('h5', '', 'Link to this board'), link, copy, el('h5', '', 'Board members'));
    for (const m of data.MEMBERS) {
      const row = el('div', 'ks-menu-row');
      row.append(avatar(m, 28), el('span', 'ks-menu-name', m.name), el('span', 'ks-menu-ws', m.id === data.ME ? 'Admin (you)' : 'Member'));
      body.append(row);
    }
  }, 360));
  const more = btn('ks-bbtn', '', 'dots', 'Show menu');
  more.id = 'ks-menu-btn';
  more.addEventListener('click', () => toggleDrawer());
  const undo = btn('ks-bbtn', 'Undo');
  undo.id = 'ks-undo';
  undo.title = 'Undo (Ctrl+Z)';
  undo.addEventListener('click', o.onUndo);
  const redo = btn('ks-bbtn', 'Redo');
  redo.id = 'ks-redo';
  redo.title = 'Redo (Ctrl+Shift+Z)';
  redo.addEventListener('click', o.onRedo);
  const match = el('span', 'ks-match');
  match.id = 'ks-match';
  match.setAttribute('aria-live', 'polite');
  const right = el('div', 'ks-bb-right');
  right.append(match, undo, redo, filterBtn, clearBtn, el('span', 'ks-vsep'), team, share, more);
  boardbar.append(left, right);

  /* ---- the board menu drawer --------------------------------------------------- */
  const drawer = el('aside', 'ks-drawer');
  drawer.hidden = true;
  drawer.setAttribute('aria-label', 'Board menu');
  o.stage.append(drawer);
  let drawerView = 'main';
  function toggleDrawer(force) {
    const open = force ?? drawer.hidden;
    drawer.hidden = !open;
    more.setAttribute('aria-expanded', String(open));
    if (open) { drawerView = 'main'; renderDrawer(); }
  }
  function renderDrawer() {
    drawer.replaceChildren();
    const head = el('div', 'ks-drawer-head');
    if (drawerView !== 'main') {
      const back = btn('ks-pop-x', '', 'list', 'Back');
      back.textContent = '‹';
      back.addEventListener('click', () => { drawerView = 'main'; renderDrawer(); });
      head.append(back);
    }
    head.append(el('h3', '', { main: 'Menu', background: 'Change background', activity: 'Activity' }[drawerView]));
    const x = btn('ks-pop-x', '', 'close', 'Close menu');
    x.addEventListener('click', () => toggleDrawer(false));
    head.append(x);
    const body = el('div', 'ks-drawer-body');
    drawer.append(head, body);
    if (drawerView === 'main') {
      const about = el('div', 'ks-drawer-about');
      about.append(el('h4', '', 'About this board'), el('p', '', data.BOARD_ABOUT));
      const admins = el('div', 'ks-menu-row');
      admins.append(avatar(memberOf(data.ME), 28), el('span', 'ks-menu-name', memberOf(data.ME).name), el('span', 'ks-menu-ws', 'Board admin'));
      about.append(admins);
      body.append(about);
      const item = (iconName, text, fn, swatch) => {
        const b = btn('ks-drawer-item', text, iconName);
        if (swatch) { const s = el('span', 'ks-drawer-swatch'); s.style.background = backdropThumb(o.backdropKey()); b.prepend(s); b.querySelector('svg')?.remove(); }
        b.addEventListener('click', fn);
        body.append(b);
        return b;
      };
      item('image', 'Change background', () => { drawerView = 'background'; renderDrawer(); }, true).id = 'ks-drawer-bg';
      item('activity', 'Activity', () => { drawerView = 'activity'; renderDrawer(); }).id = 'ks-drawer-activity';
      item('help', 'Keyboard shortcuts', () => shortcuts());
      body.append(el('h4', 'ks-drawer-sub', 'Recent activity'));
      activityList(body, 5);
    } else if (drawerView === 'background') {
      body.append(el('h4', '', 'Scenes'));
      const scenes = el('div', 'ks-bg-grid');
      const colors = el('div', 'ks-bg-grid ks-bg-grid--colors');
      for (const b of data.BACKDROPS) {
        const t = btn('ks-bg', '', undefined, `${b.name} background`);
        t.style.background = backdropThumb(b.key);
        t.dataset.backdrop = b.key;
        t.setAttribute('aria-pressed', String(o.backdropKey() === b.key));
        t.addEventListener('click', () => { o.onBackdrop(b.key); renderDrawer(); });
        (b.image ? scenes : colors).append(t);
      }
      body.append(scenes, el('h4', '', 'Colours'), colors);
    } else {
      activityList(body, 50);
    }
  }
  function activityList(body, n) {
    for (const a of o.activity().slice(0, n)) {
      const m = memberOf(a.who);
      const row = el('div', 'ks-feed');
      row.append(avatar(m, 32));
      const t = el('div', 'ks-feed-body');
      const line = el('div', 'ks-feed-line');
      line.append(el('strong', '', m.name), document.createTextNode(` ${a.text}`));
      t.append(line, el('div', 'ks-feed-time', when(a.at)));
      row.append(t);
      body.append(row);
    }
  }

  /* ---- keyboard shortcuts sheet ---------------------------------------------- */
  function shortcuts() {
    closeMenu();
    const shade = el('div', 'ks-shade');
    const sheet = el('div', 'ks-dialog ks-keys');
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-label', 'Keyboard shortcuts');
    const x = btn('ks-dlg-x', '', 'close', 'Close');
    sheet.append(x, el('h2', '', 'Keyboard shortcuts'));
    const rows = [['F', 'Open the filter'], ['Q', 'Show only cards assigned to me'], ['X', 'Clear all filters'], ['Ctrl Z', 'Undo'], ['Ctrl Shift Z', 'Redo'], ['Esc', 'Close a dialog or menu'], ['?', 'Show this sheet']];
    const dl = el('dl');
    for (const [k, t] of rows) { const dt = el('dt'); for (const part of k.split(' ')) dt.append(el('kbd', '', part)); dl.append(dt, el('dd', '', t)); }
    sheet.append(dl);
    shade.append(sheet);
    const end = () => { shade.remove(); window.removeEventListener('keydown', onKey, true); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); end(); } };
    x.addEventListener('click', end);
    shade.addEventListener('pointerdown', (e) => { if (e.target === shade) end(); });
    window.addEventListener('keydown', onKey, true);
    o.stage.append(shade);
    x.focus();
  }

  return {
    syncUndo(canUndo, canRedo) { undo.disabled = !canUndo; redo.disabled = !canRedo; },
    setMatch(text) { match.textContent = text; },
    openFilter() { filterBtn.click(); },
    syncFilterBtn,
    refreshActivity() { if (!drawer.hidden && drawerView !== 'background') renderDrawer(); },
    toggleDrawer,
    closeMenu,
    shortcuts,
    get menuOpen() { return !!menu; },
  };
}
