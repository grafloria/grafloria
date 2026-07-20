// GATE — does a SAVED diagram come back as the diagram that was saved?
//
// THE REGRESSION THIS GUARDS
// --------------------------
// Serialization always worked. `DiagramSerializer.serialize()` round-trips
// byte-identically, and it is tempting to call that "save/load works". It is
// not. A document is data; a diagram is data PLUS the painters and the
// post-render wiring that make it a thing on a screen, and NEITHER of those is
// in the file:
//
//   • `renderCustomNode` is a function. Functions do not serialize. A dashboard
//     reloaded without one mounts every widget host and paints into none.
//   • `erDiagram()`/`umlDiagram()` do their interaction wiring in `finalize()`.
//     A document has no finalize, so a reloaded ERD looked perfect and did
//     nothing — no row selection, no in-canvas editing.
//   • A widget's TITLE and a board's GEOMETRY never reached the model at all,
//     so even a perfect loader could not have rebuilt the card headers or
//     rebound the grid.
//
// Unit tests cover `fromDocument()` in jsdom. They cannot cover this, because
// jsdom computes no layout: an unsized container reports a 0x0 viewport and the
// renderer CULLS every node, so the specs have to fake `clientWidth` to see
// anything paint at all. Only a real browser proves the pixels.
//
// WHAT IT DOES, per diagram: take the LIVE demo page, save its own instance's
// model, mount a SECOND instance from that document alone, and compare the two
// renders against each other — never against a hardcoded expectation, so the
// gate cannot drift into agreeing with a bug.
//
// Needs nothing but `demos/shell/grafloria.js` built from current libs
// (`node demos/build.mjs`). It serves the gallery itself on an ephemeral port,
// so it runs inside a worktree with no port conflict.

import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, extname, resolve } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const checks = [];
const check = (name, ok, detail) => {
  checks.push(ok);
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
};
const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  const file = join(root, url === '/' ? 'index.html' : url);
  try {
    const body = readFileSync(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
const pageErrors = [];

/**
 * Mount a second instance from the page's OWN saved document and report both
 * renders in the same shape, so the caller compares like with like.
 *
 * The reload goes through the exact public one-liner an embedder would write:
 * `render(fromDocument(json), host)` — no privileged access, no second mounting
 * path that could drift from what a user gets.
 */
const ROUND_TRIP = async (tab, useAppPainter = false) =>
  tab.evaluate(async (useAppPainter) => {
    const { render, fromDocument, DiagramSerializer } = await import('/shell/grafloria.js');

    const live = window.__demoCtx.instance;
    const json = JSON.stringify(new DiagramSerializer().serialize(live.getModel()));

    // A fresh container the same size as the demo's, off to the side.
    const host = document.createElement('div');
    const box = window.__demoCtx.host.getBoundingClientRect();
    host.style.cssText = `position:absolute;left:-9999px;top:0;width:${box.width}px;height:${box.height}px`;
    document.body.appendChild(host);

    // `renderWidget` is a function and cannot be in the file. When the page has
    // one, an app reloading its own board hands it back — that is the seam.
    const spec = fromDocument(
      json,
      useAppPainter && window.__demoCtx.renderWidget
        ? { renderWidget: window.__demoCtx.renderWidget }
        : {}
    );
    const reloaded = render(spec, host);
    reloaded.renderNow();

    /** What each node PAINTED, keyed by node id — the unit of comparison.
     *  Both surfaces carry data-node-id: the SVG <g> (ER/UML cards paint into
     *  its <foreignObject>) and the html-layer host (dashboard widgets). A
     *  dashboard node has BOTH and only one holds content, so the LONGER text
     *  wins rather than document order, which would prefer the empty <g>. */
    const painted = (el) => {
      const out = {};
      for (const n of el.querySelectorAll('[data-node-id]')) {
        const id = n.getAttribute('data-node-id');
        const t = (n.textContent || '').replace(/\s+/g, ' ').trim();
        if (t.length > (out[id] || '').length) out[id] = t;
      }
      return out;
    };
    const shape = (api, el) => {
      const m = api.getModel();
      return {
        nodes: m.getNodes().map((n) => n.id).sort(),
        links: m.getLinks().map((l) => l.id).sort(),
        groups: m.getGroups().map((g) => `${g.id}:${[...g.members].sort().join(',')}`).sort(),
        painted: painted(el),
        // Custom-node hosts that actually received content — a widget that
        // mounted but never painted is the exact bug this gate exists for.
        widgetHosts: [...el.querySelectorAll('.grafloria-node-host')].filter(
          (h) => (h.textContent || '').trim().length > 0
        ).length,
      };
    };

    const before = shape(live, window.__demoCtx.host);
    const after = shape(reloaded, host);
    host.remove();
    return {
      before,
      after,
      bytes: json.length,
      boards: [...spec.boards.keys()],
      hasAppPainter: !!window.__demoCtx.renderWidget,
    };
  }, useAppPainter);

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Is `a` obtainable from `b` by DELETING characters only? True exactly when the
 *  reload dropped app chrome and neither invented text nor lost kit content. */
const isSubsequence = (a, b) => {
  let i = 0;
  for (const ch of b) if (i < a.length && a[i] === ch) i++;
  return i === a.length;
};

// ---------------------------------------------------------------------------
// The three diagrams, each through the same comparison.
// ---------------------------------------------------------------------------
const CASES = [
  { name: 'ERD (erd-editor)', url: '/diagrams/erd-editor.html', minNodes: 3, minLinks: 2, boards: 0 },
  { name: 'UML (class-uml)', url: '/diagrams/class-uml.html', minNodes: 4, minLinks: 4, boards: 0 },
  { name: 'dashboard (dashboard-builder)', url: '/dashboard/dashboard-builder.html', minNodes: 14, minGroups: 3, boards: 3 },
];

for (const c of CASES) {
  console.log(`\n--- ${c.name} ---`);
  const tab = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  tab.on('pageerror', (e) => pageErrors.push(`${c.name}: ${String(e).slice(0, 200)}`));
  await tab.goto(origin + c.url, { waitUntil: 'networkidle' });
  await tab.waitForFunction(() => window.__demoReady === true, { timeout: 20000 });
  await tab.waitForTimeout(400);

  const { before, after, bytes, boards, hasAppPainter } = await ROUND_TRIP(tab);

  // -- the document is not trivially small ----------------------------------
  // Guards every comparison below: two EMPTY renders compare equal.
  check(
    `the original mounted its content (${before.nodes.length} nodes, ${before.links.length} links, ${before.groups.length} groups)`,
    before.nodes.length >= c.minNodes &&
      before.links.length >= (c.minLinks ?? 0) &&
      before.groups.length >= (c.minGroups ?? 0),
    `${bytes.toLocaleString()} bytes saved`
  );
  check(
    'the original actually PAINTED — every node carries text',
    Object.keys(before.painted).length >= c.minNodes,
    `${Object.keys(before.painted).length} painted / ${before.nodes.length} nodes`
  );

  // -- structure -------------------------------------------------------------
  check('the reload has the same node ids', same(before.nodes, after.nodes), `${after.nodes.length}`);
  check('the reload has the same link ids', same(before.links, after.links), `${after.links.length}`);
  check(
    'the reload has the same groups, with the same members',
    same(before.groups, after.groups),
    after.groups.join(' | ') || 'none'
  );

  // -- THE GOVERNING CLAIM ---------------------------------------------------
  // Not "the reload painted something" and not "the reload matches a literal
  // this file carries" — the reload must paint what the ORIGINAL painted, node
  // for node. A blank node, a missing node, and a node painting a neighbour's
  // content are all separately visible here.
  //
  // For a page with its own `renderWidget` the DEFAULT reload legitimately
  // cannot match: a painter is a function, it is not in the file, and what it
  // drew on top of the kit's chart is gone until the app hands it back. So the
  // claim is split — this is the LIMIT, stated and measured rather than hidden:
  //
  //   default reload → the reload lost only app chrome. Every node's text is a
  //                    SUBSEQUENCE of the original's: nothing invented, no kit
  //                    content dropped, and never an empty node.
  //   with the painter → byte-for-byte identical.
  const diffOf = (b, a) =>
    Object.keys({ ...b, ...a }).filter((id) => b[id] !== a[id]);
  const show = (ids, b, a) =>
    ids.slice(0, 3).map((id) => `${id}: "${(b[id] || '').slice(0, 40)}" -> "${(a[id] || '').slice(0, 40)}"`).join(' | ');

  const diffs = diffOf(before.painted, after.painted);
  if (!hasAppPainter) {
    check(
      'EVERY NODE PAINTS THE SAME TEXT AS THE ORIGINAL',
      diffs.length === 0,
      diffs.length ? show(diffs, before.painted, after.painted) : `${Object.keys(after.painted).length} nodes identical`
    );
  } else {
    const bad = Object.keys(before.painted).filter((id) => {
      const a = after.painted[id] ?? '';
      return a.length === 0 || !isSubsequence(a, before.painted[id] ?? '');
    });
    check(
      'the default reload lost ONLY app chrome — every node still paints the kit content',
      bad.length === 0,
      bad.length ? show(bad, before.painted, after.painted) : `${Object.keys(after.painted).length} nodes, ${diffs.length} carrying app chrome`
    );

    // …and the seam that gets the rest back.
    const withPainter = await ROUND_TRIP(tab, true);
    const exact = diffOf(withPainter.before.painted, withPainter.after.painted);
    check(
      'EVERY NODE PAINTS THE SAME TEXT AS THE ORIGINAL, once the app hands its painter back',
      exact.length === 0,
      exact.length ? show(exact, withPainter.before.painted, withPainter.after.painted) : `${Object.keys(withPainter.after.painted).length} nodes identical`
    );
  }

  // -- custom nodes ----------------------------------------------------------
  check(
    'every custom-node host that painted before paints after',
    after.widgetHosts === before.widgetHosts,
    `${before.widgetHosts} -> ${after.widgetHosts}`
  );

  // -- interaction, not just pixels -----------------------------------------
  check(
    `the reload re-attached ${c.boards} grid binder(s)`,
    boards.length === c.boards,
    boards.join(',') || 'none'
  );

  await tab.close();
}

// ---------------------------------------------------------------------------
// A loaded ERD must still be an EDITOR, not a picture of one.
// ---------------------------------------------------------------------------
console.log('\n--- a loaded ERD is still interactive ---');
{
  const tab = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  tab.on('pageerror', (e) => pageErrors.push(`interaction: ${String(e).slice(0, 200)}`));
  await tab.goto(origin + '/diagrams/erd-editor.html', { waitUntil: 'networkidle' });
  await tab.waitForFunction(() => window.__demoReady === true, { timeout: 20000 });
  await tab.waitForTimeout(400);

  const out = await tab.evaluate(async () => {
    const { render, fromDocument, DiagramSerializer } = await import('/shell/grafloria.js');
    const live = window.__demoCtx.instance;
    const json = JSON.stringify(new DiagramSerializer().serialize(live.getModel()));

    const host = document.createElement('div');
    host.style.cssText = 'position:absolute;left:-9999px;top:0;width:1200px;height:800px';
    document.body.appendChild(host);
    render(fromDocument(json), host).renderNow();

    const events = [];
    host.addEventListener('axk:row-select', (e) => events.push(e.detail));

    // 1. ROW SELECTION — click a column in the reloaded diagram.
    const rows = [...host.querySelectorAll('[data-node-id="CUSTOMERS"] .axk-row')];
    const email = rows.find((r) => (r.textContent || '').includes('email'));
    email?.querySelector('.axk-col')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const selected = !!email?.classList.contains('axk-row-selected');
    const eventName = events.at(-1)?.selected?.name ?? null;

    // 2. IN-CANVAS EDITING — double-click the header, expect the inline editor
    //    PREFILLED from the loaded model (a blank one means stale/absent data).
    host
      .querySelector('[data-node-id="CUSTOMERS"] .axk-entity-head')
      ?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    const input = host.querySelector('.axk-edit-input');

    // 3. The editable chrome itself came back.
    const addAffordance = !!host.querySelector('[data-node-id="ORDERS"] .axk-entity-add');
    const delControls = host.querySelectorAll('.axk-col-del').length;

    const res = {
      selected,
      eventName,
      editorOpen: !!input,
      editorValue: input ? input.value : null,
      addAffordance,
      delControls,
    };
    host.remove();
    return res;
  });

  check('clicking a column in the RELOADED diagram selects that row', out.selected);
  check('…and axk:row-select carried the field name', out.eventName === 'email', `got ${JSON.stringify(out.eventName)}`);
  check('double-clicking the header opens the inline editor', out.editorOpen);
  check(
    '…prefilled from the LOADED model, not blank',
    out.editorValue === 'Customers',
    `got ${JSON.stringify(out.editorValue)}`
  );
  check('the editable chrome came back (add-column affordance)', out.addAffordance);
  check('…and the per-row delete controls', out.delControls > 0, `${out.delControls}`);

  await tab.close();
}

// ---------------------------------------------------------------------------
// The FK→PK edge must still be pinned to its COLUMN, not to a side.
// ---------------------------------------------------------------------------
console.log('\n--- the field-level FK port survives the round trip ---');
{
  const tab = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  tab.on('pageerror', (e) => pageErrors.push(`ports: ${String(e).slice(0, 200)}`));
  await tab.goto(origin + '/diagrams/erd-editor.html', { waitUntil: 'networkidle' });
  await tab.waitForFunction(() => window.__demoReady === true, { timeout: 20000 });
  await tab.waitForTimeout(400);

  const out = await tab.evaluate(async () => {
    const { render, fromDocument, DiagramSerializer } = await import('/shell/grafloria.js');
    const live = window.__demoCtx.instance;
    const json = JSON.stringify(new DiagramSerializer().serialize(live.getModel()));
    const host = document.createElement('div');
    host.style.cssText = 'position:absolute;left:-9999px;top:0;width:1200px;height:800px';
    document.body.appendChild(host);
    const api = render(fromDocument(json), host);
    api.renderNow();

    const pick = (m) => {
      const l = m.getLink('fk_customer');
      return l ? { source: l.sourcePortId, target: l.targetPortId } : null;
    };
    const res = { before: pick(live.getModel()), after: pick(api.getModel()) };
    host.remove();
    return res;
  });

  check('the FK edge exists in both', !!out.before && !!out.after);
  check(
    'it is pinned to the COLUMN port, not a bare side',
    !!out.before && /customer_id/.test(out.before.source),
    out.before?.source
  );
  check(
    'and the reload names the SAME ports',
    JSON.stringify(out.before) === JSON.stringify(out.after),
    `${out.before?.source} -> ${out.after?.source}`
  );

  await tab.close();
}

// ===========================================================================
//  VERSION HISTORY — the dashboard builder's save/load, driven with a mouse.
// ===========================================================================
//
// THE WEAK TEETH THIS GATE REFUSES TO GROW
// ----------------------------------------
// "a version appeared in the list" is green for a version of an EMPTY board.
// "restoring v2 worked" is green when v2 happens to equal what is already on
// screen, and green again for a restore that always loads the newest. So the
// three versions below are made GENUINELY DIFFERENT, and — the part that
// matters — different in a way that no widget COUNT can distinguish:
//
//   v1  the declared board          7 overview widgets, HAS the reps table, NO funnel
//   v2  v1 + a funnel               8 overview widgets, HAS the table, HAS a funnel
//   v3  v2 minus the reps table     7 overview widgets, NO table,        HAS a funnel
//
// v1 and v3 hold the same NUMBER of widgets, so every assertion has to name
// content that only one version owns. And the restores below deliberately jump
// PAST the neighbouring version (v3 → v1, then v1 → v2, then v2 → v3), so
// "always restores the newest", "always restores the oldest" and "restores
// nothing at all" each fail on a different line.
//
// Every interaction is a real Playwright mouse click on the real control.
console.log('\n--- version history: each save is a version you can go back to ---');
{
  const tab = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  tab.on('pageerror', (e) => pageErrors.push(`history: ${String(e).slice(0, 200)}`));
  await tab.goto(origin + '/dashboard/dashboard-builder.html', { waitUntil: 'networkidle' });
  await tab.waitForFunction(() => window.__demoReady === true, { timeout: 20000 });
  await tab.waitForTimeout(400);

  /** What is ON THE BOARD right now — model AND paint, so a restore that
   *  updates one and not the other is visible. */
  const board = () =>
    tab.evaluate(() => {
      const ws = window.__dash.handle.widgetsOf('overview');
      return {
        count: ws.length,
        kinds: ws.map((w) => w.spec.kind).sort(),
        hasReps: ws.some((w) => w.id === 'reps'),
        hasFunnel: ws.some((w) => w.spec.kind === 'funnel'),
        // PAINTED, not just modelled: the html-layer host for the table.
        paintedReps: !!document.querySelector('.grafloria-node-host[data-node-id="reps"]'),
        paintedFunnels: [...document.querySelectorAll('.grafloria-node-host')].filter(
          (h) => h.getBoundingClientRect().x > -5000 && /CONVERSION FUNNEL/i.test(h.textContent || '')
        ).length,
      };
    });
  /** The drawer's own model, as the page holds it. */
  const store = () =>
    tab.evaluate(() => ({
      ids: window.__dash.history.map((v) => v.id),
      autos: window.__dash.history.map((v) => !!v.auto),
      current: window.__dash.currentVersion,
      open: window.__dash.historyOpen,
      // per version: what its OWN thumbnail says, independent of the live board
      thumbs: window.__dash.history.map((v) => ({
        id: v.id,
        bytes: v.thumb ? v.thumb.length : 0,
        table: !!v.thumb && v.thumb.includes('A. Farouk'),
        kpi: !!v.thumb && v.thumb.includes('$6.81M'),
        funnel: !!v.thumb && v.thumb.includes('Negotiation'),
      })),
      views: Object.fromEntries(
        window.__dash.history.map((v) => [
          v.id,
          {
            widgets: v.views.reduce((s, x) => s + x.widgets.length, 0),
            view: v.view,
            sizing: v.sizing,
            // WHAT the version holds, per widget — a count cannot tell v1 from
            // v3, and this can. toJSON() carries `kind` through, so this is the
            // saved data speaking, not the live board.
            kinds: (v.views.find((x) => x.id === 'overview')?.widgets ?? []).map((w) => w.kind).sort(),
            ids: (v.views.find((x) => x.id === 'overview')?.widgets ?? []).map((w) => w.id).sort(),
          },
        ])
      ),
    }));
  const cards = () =>
    tab.evaluate(() =>
      [...document.querySelectorAll('.hist-item')].map((c) => ({
        id: c.dataset.version,
        current: c.classList.contains('current'),
        delta: c.querySelector('.hist-delta')?.textContent.trim() ?? '',
        sub: c.querySelector('.hist-sub')?.textContent.trim() ?? '',
        img: c.querySelector('img.hist-thumb')?.naturalWidth ?? 0,
      }))
    );
  const canvasW = () =>
    tab.evaluate(() => Math.round(document.getElementById('canvas').getBoundingClientRect().width));
  const trendW = () =>
    tab.evaluate(() =>
      Math.round(
        document.querySelector('.grafloria-node-host[data-node-id="trend"]')?.getBoundingClientRect().width ?? 0
      )
    );

  // -- build three genuinely different boards, saving each -------------------
  await tab.click('#t-save');                                    // v1: as declared
  await tab.waitForTimeout(350);
  await tab.click('.pal-item[data-add="funnel"]');               // + a funnel
  await tab.waitForTimeout(700);
  await tab.click('#t-save');                                    // v2
  await tab.waitForTimeout(350);
  await tab.click('.grafloria-node-host[data-node-id="reps"]');      // focus the table
  await tab.waitForTimeout(300);
  await tab.click('#t-remove');                                  // − the table
  await tab.waitForTimeout(700);
  await tab.click('#t-save');                                    // v3
  await tab.waitForTimeout(350);

  const v3Live = await board();
  check(
    'setup: the three versions really are three different boards',
    v3Live.count === 7 && v3Live.hasFunnel && !v3Live.hasReps,
    `v3 live: ${v3Live.count} widgets, funnel=${v3Live.hasFunnel}, reps=${v3Live.hasReps}`
  );

  const s0 = await store();
  check('three saves banked three versions, newest first', JSON.stringify(s0.ids) === '["v3","v2","v1"]', s0.ids.join(','));
  // THE ANTI-WEAK-TOOTH: v1 and v3 hold the SAME NUMBER of widgets. Only their
  // contents separate them, so that is what every version assertion reads.
  check(
    'each version banked its OWN board — and v1 vs v3 proves a COUNT could not tell them apart',
    s0.views.v1.widgets === 14 &&
      s0.views.v3.widgets === 14 &&
      s0.views.v1.ids.includes('reps') &&
      !s0.views.v1.kinds.includes('funnel') &&
      s0.views.v2.ids.includes('reps') &&
      s0.views.v2.kinds.includes('funnel') &&
      !s0.views.v3.ids.includes('reps') &&
      s0.views.v3.kinds.includes('funnel'),
    `v1=[${s0.views.v1.kinds}] v2=[${s0.views.v2.kinds}] v3=[${s0.views.v3.kinds}]`
  );

  // -- THE THUMBNAILS ARE OF THE VERSION, NOT OF "NOW" -----------------------
  // Each is exportSvgString({ includeIds: exportIds() }) taken at save time, so
  // the table's text is in v1's and v2's pictures and NOT in v3's. A drawer that
  // re-shot the live board, or reused one image for every card, fails here.
  const t = Object.fromEntries(s0.thumbs.map((x) => [x.id, x]));
  check('every version carries a thumbnail', s0.thumbs.every((x) => x.bytes > 5000), s0.thumbs.map((x) => `${x.id}:${x.bytes}b`).join(' '));
  check(
    'the thumbnails are TRUE WIDGET CONTENT — the KPI headline is in the vector',
    t.v1.kpi && t.v2.kpi && t.v3.kpi,
    'a custom-node export that lost its widgets would have none of it'
  );
  check(
    "v1's thumbnail contains the table it holds…",
    t.v1.table && !t.v1.funnel,
    `table=${t.v1.table} funnel=${t.v1.funnel}`
  );
  check('…v2 shows BOTH the table and the funnel it added…', t.v2.table && t.v2.funnel, `table=${t.v2.table} funnel=${t.v2.funnel}`);
  check(
    "…and v3's shows the funnel with the table GONE — each picture is its own board",
    t.v3.funnel && !t.v3.table,
    `table=${t.v3.table} funnel=${t.v3.funnel}`
  );
  check('no two versions share one picture', new Set(s0.thumbs.map((x) => x.bytes)).size === 3, s0.thumbs.map((x) => x.bytes).join(' vs '));

  // -- the drawer is a COLUMN, and opening it reframes the board -------------
  const wClosed = await canvasW(), trendClosed = await trendW();
  await tab.click('#t-history');
  await tab.waitForTimeout(600);
  const wOpen = await canvasW(), trendOpen = await trendW();
  check('the Versions button opens the drawer', (await store()).open === true);
  check(
    'the drawer takes a grid COLUMN — the canvas is genuinely narrower, not overlaid',
    wOpen < wClosed - 200,
    `${wClosed}px → ${wOpen}px`
  );
  check(
    '…and the board REFRAMED into what is left of the canvas',
    trendOpen > 0 && trendOpen < trendClosed - 40,
    `the line chart: ${trendClosed}px → ${trendOpen}px`
  );

  const c0 = await cards();
  check('the drawer lists one card per version, newest first', JSON.stringify(c0.map((c) => c.id)) === '["v3","v2","v1"]', c0.map((c) => c.id).join(','));
  check(
    'every card DECODED its thumbnail — a real picture, not a broken <img>',
    c0.every((c) => c.img > 800),
    c0.map((c) => `${c.id}:${c.img}px`).join(' ')
  );
  check('the newest card is marked current', c0[0].current && !c0[1].current && !c0[2].current);
  check(
    'the cards name the view the picture shows AND how much of the board is on it',
    /^Overview · 7 of 14 widgets/.test(c0[0].sub) && /^Overview · 8 of 15 widgets/.test(c0[1].sub),
    `${c0[0].sub} | ${c0[1].sub}`
  );
  check("v2's card reports the widget it ADDED", /\+1 added/.test(c0[1].delta), c0[1].delta);
  check("v3's card reports the widget it REMOVED", /1 removed/.test(c0[0].delta), c0[0].delta);
  check('the oldest card has nothing to diff against and says so', /first version/.test(c0[2].delta), c0[2].delta);

  // -- an UNSAVED edit, then restore ----------------------------------------
  // The case a "restore" gets wrong: you have been editing, you have NOT saved,
  // and you click an old version. That work must not evaporate.
  await tab.click('.pal-item[data-add="bar"]');
  await tab.waitForTimeout(700);
  const dirty = await board();
  check(
    'setup: an UNSAVED bar chart is on the board, in no version yet',
    dirty.count === 8 && dirty.kinds.includes('bar'),
    `${dirty.count} widgets: ${dirty.kinds}`
  );

  // -- RESTORE: click v1's card, PAST v2 ------------------------------------
  await tab.click('.hist-item[data-version="v1"]');
  await tab.waitForTimeout(900);
  const afterV1 = await board();
  check(
    'clicking v1 restored V1 — the table is back and the funnel is gone',
    afterV1.hasReps && !afterV1.hasFunnel && afterV1.count === 7,
    `${afterV1.count} widgets, reps=${afterV1.hasReps}, funnel=${afterV1.hasFunnel}`
  );
  check(
    '…and it restored the PAINT, not just the model',
    afterV1.paintedReps && afterV1.paintedFunnels === 0,
    `reps host=${afterV1.paintedReps}, funnel hosts=${afterV1.paintedFunnels}`
  );

  // A RESTORE IS NOT A ONE-WAY DOOR: what we were leaving got banked first.
  const s1 = await store();
  check('the restore banked the board it was leaving, tagged auto', s1.autos[0] === true && s1.ids[0] === 'v4', s1.ids.join(','));
  check(
    '…and the bank holds the UNSAVED board we left — bar chart and all, a board no saved version has',
    s1.views.v4.kinds.includes('bar') &&
      s1.views.v4.kinds.includes('funnel') &&
      !s1.views.v4.ids.includes('reps'),
    `v4 overview = [${s1.views.v4.kinds}]`
  );
  check(
    '…so the unsaved work is one click from coming back',
    s1.thumbs[0].funnel && !s1.thumbs[0].table && s1.thumbs[0].bytes > 5000,
    `its own thumbnail: ${s1.thumbs[0].bytes} bytes, funnel=${s1.thumbs[0].funnel} table=${s1.thumbs[0].table}`
  );
  check('the drawer now marks v1 as current', s1.current === 'v1', s1.current);

  // -- RESTORE v2: the one in the middle, from the v1 board ------------------
  await tab.click('.hist-item[data-version="v2"]');
  await tab.waitForTimeout(900);
  const afterV2 = await board();
  check(
    'clicking v2 restored V2 — table AND funnel, the only board with both',
    afterV2.hasReps && afterV2.hasFunnel && afterV2.count === 8,
    `${afterV2.count} widgets, reps=${afterV2.hasReps}, funnel=${afterV2.hasFunnel}`
  );

  // -- RESTORE v3 -----------------------------------------------------------
  await tab.click('.hist-item[data-version="v3"]');
  await tab.waitForTimeout(900);
  const afterV3 = await board();
  check(
    'clicking v3 restored V3 — funnel, no table',
    !afterV3.hasReps && afterV3.hasFunnel && afterV3.count === 7,
    `${afterV3.count} widgets, reps=${afterV3.hasReps}, funnel=${afterV3.hasFunnel}`
  );

  // -- browsing must not breed entries --------------------------------------
  const before = (await store()).ids.length;
  await tab.click('.hist-item[data-version="v3"]');   // restore what is already loaded
  await tab.waitForTimeout(800);
  check(
    're-restoring the board already on screen banks NOTHING (no duplicate churn)',
    (await store()).ids.length === before,
    `${before} → ${(await store()).ids.length}`
  );

  // -- the drawer closes, and gives the canvas back -------------------------
  await tab.keyboard.press('Escape');
  await tab.waitForTimeout(500);
  check('Escape closes the drawer', (await store()).open === false);
  check('…and the canvas gets its width back', (await canvasW()) === wClosed, `${await canvasW()} vs ${wClosed}`);

  // -- versions OUTLIVE the page --------------------------------------------
  // The old Load kept its blob in a module variable and wrote a localStorage key
  // it never read back, so a reload lost everything. Prove the drawer does not.
  const preReload = await store();
  await tab.reload({ waitUntil: 'networkidle' });
  await tab.waitForFunction(() => window.__demoReady === true, { timeout: 20000 });
  await tab.waitForTimeout(500);
  const reloaded = await store();
  check(
    'a full page reload finds every version still there',
    JSON.stringify(reloaded.ids) === JSON.stringify(preReload.ids) && reloaded.ids.includes('v1'),
    `${preReload.ids.join(',')} → ${reloaded.ids.join(',')}`
  );
  check(
    '…thumbnails and all — v1 still carries the table in its picture',
    reloaded.thumbs.find((x) => x.id === 'v1')?.table === true,
    `${reloaded.thumbs.find((x) => x.id === 'v1')?.bytes} bytes`
  );
  await tab.click('#t-history');
  await tab.waitForTimeout(400);
  await tab.click('.hist-item[data-version="v1"]');
  await tab.waitForTimeout(900);
  const afterReload = await board();
  check(
    'and a version saved BEFORE the reload still restores after it',
    afterReload.hasReps && !afterReload.hasFunnel,
    `reps=${afterReload.hasReps} funnel=${afterReload.hasFunnel}`
  );

  // -- Clear ----------------------------------------------------------------
  await tab.click('#hist-clear');
  await tab.waitForTimeout(400);
  check('Clear empties the drawer', (await store()).ids.length === 0 && (await cards()).length === 0);

  await tab.close();
}

// ---------------------------------------------------------------------------
// The two limits localStorage imposes, both exercised rather than asserted about.
// ---------------------------------------------------------------------------
console.log('\n--- the version store is bounded, and survives a full disk ---');
{
  const tab = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  tab.on('pageerror', (e) => pageErrors.push(`history-cap: ${String(e).slice(0, 200)}`));
  await tab.goto(origin + '/dashboard/dashboard-builder.html', { waitUntil: 'networkidle' });
  await tab.waitForFunction(() => window.__demoReady === true, { timeout: 20000 });
  await tab.waitForTimeout(400);

  for (let i = 0; i < 11; i++) {
    await tab.click('#t-save');
    await tab.waitForTimeout(160);
  }
  const capped = await tab.evaluate(() => ({
    ids: window.__dash.history.map((v) => v.id),
    stored: JSON.parse(localStorage.getItem('grafloria-dashboard-history') || '{}').versions?.length ?? 0,
  }));
  check(
    'eleven saves keep the newest EIGHT — localStorage cannot grow without bound',
    capped.ids.length === 8 && capped.ids[0] === 'v11' && capped.ids[7] === 'v4',
    capped.ids.join(',')
  );
  check('…and what is on disk is capped too, not just what is in memory', capped.stored === 8, `${capped.stored} stored`);

  // QUOTA. setItem THROWS when the store is full — the page must shed payload
  // rather than break. Simulated deterministically: a real 5 MB fill races the
  // browser's own eviction and would flake.
  const quota = await tab.evaluate(async () => {
    const real = Storage.prototype.setItem;
    Storage.prototype.setItem = function () {
      const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e;
    };
    let threw = null;
    try { document.getElementById('t-save').click(); } catch (e) { threw = String(e); }
    Storage.prototype.setItem = real;
    return {
      threw,
      survivors: window.__dash.history.length,
      newest: window.__dash.history[0]?.id ?? null,
      restorable: window.__dash.history[0]?.views?.length ?? 0,
      status: document.getElementById('db-status').textContent,
    };
  });
  check('a save into a FULL store does not throw at the user', quota.threw === null, quota.threw ?? 'no throw');
  check('…it sheds until it fits and keeps the newest version usable',
    quota.survivors >= 1 && quota.newest === 'v12' && quota.restorable === 3,
    `${quota.survivors} left, newest=${quota.newest}, ${quota.restorable} views`);
  check('…and says so instead of failing silently', /storage full/.test(quota.status), quota.status);

  await tab.close();
}

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
server.close();

const failed = checks.filter((c) => !c).length;
console.log(
  failed === 0
    ? `\nsave/load gate: ${checks.length}/${checks.length} checks pass`
    : `\nsave/load gate: ${failed}/${checks.length} FAILED`
);
process.exit(failed === 0 ? 0 : 1);
