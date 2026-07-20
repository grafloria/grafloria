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
