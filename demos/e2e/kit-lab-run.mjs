// DASHBOARD KIT LAB — the 0.4.12 switches driven for real, with edge cases.
//
// dashboard-scenarios-run drives the agreed model on the demo pages. This gate
// drives the SWITCHES the Quantia brief asked for — squeeze, the caption band,
// static click-through, edge cursors, selection across rebinds, grip
// placements, accent theming — on kit-lab.html, a page of 23 small boards each
// configured for one case. Every scenario is a real pointer sequence, reads the
// board back, and shoots the board's card so the truth can be LOOKED at.
//
//   node demos/e2e/kit-lab-run.mjs            # shots to e2e/kit-lab-shots/
//   node demos/e2e/kit-lab-run.mjs --out DIR
//   node demos/e2e/kit-lab-run.mjs --live     # against the bundle deployed on grafloria.com

import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, extname } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const argv = process.argv.slice(2);
const outIdx = argv.indexOf('--out');
const OUT = outIdx >= 0 ? argv[outIdx + 1] : join(here, 'kit-lab-shots');
mkdirSync(OUT, { recursive: true });

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
// --live: drive the lab against the bundle DEPLOYED on grafloria.com — the
// artifact every app actually loads — instead of the local build.
const LIVE = argv.includes('--live');
const liveBundle = LIVE ? Buffer.from(await (await fetch('https://grafloria.com/demos/shell/grafloria.js', { cache: 'no-store' })).arrayBuffer()) : null;
if (LIVE) console.log(`lab against the LIVE bundle: ${liveBundle.byteLength} bytes`);
const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (liveBundle && url === '/shell/grafloria.js') { res.writeHead(200, { 'Content-Type': MIME['.js'] }); return res.end(liveBundle); }
  try { const body = readFileSync(join(root, url)); res.writeHead(200, { 'Content-Type': MIME[extname(url)] ?? 'application/octet-stream' }); res.end(body); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, r));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(`${origin}/e2e/kit-lab.html`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__labReady === true, { timeout: 30000 });

const results = [];
let scenario = '';
let step = 0;
const failures = [];
function begin(name) { scenario = name; step = 0; }
function verdict(ok, detail) {
  results.push({ scenario, ok, detail });
  if (!ok) failures.push(`${scenario}: ${detail}`);
  console.log(`${ok ? '✓' : '✗'} ${scenario}   ${detail}`);
}
/** Shoot one board's card (not the 11 000 px page). */
async function shot(board, label) {
  step++;
  const card = page.locator(`#cv-${board}`).locator('..');
  await card.screenshot({ path: join(OUT, `${scenario}.${step}-${label}.png`) });
}

// ---- readers --------------------------------------------------------------
const hostSel = (board, id) => `#cv-${board} .grafloria-node-host[data-node-id="${id}"]`;
const rect = (board, id) => page.evaluate((s) => { const h = document.querySelector(s); if (!h) return null; const r = h.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom }; }, hostSel(board, id));
const heights = (board) => page.evaluate((b) => Object.fromEntries([...document.querySelectorAll(`#cv-${b} .grafloria-node-host`)].filter((n) => n.getBoundingClientRect().x > -5000).map((n) => [n.dataset.nodeId, Math.round(n.getBoundingClientRect().height)])), board);
const cells = (board) => page.evaluate((b) => Object.fromEntries(window.__lab[b].handle.widgetsOf().map((w) => [w.id, { x: w.cell.x, y: w.cell.y, w: w.cell.w, h: w.cell.h }])), board);
const events = (board) => page.evaluate((b) => window.__labEvents[b].splice(0), board);
const undoDepth = (board) => page.evaluate((b) => { const cm = window.__lab[b].api.getEngine().commandManager; let n = 0; const snap = cm.canUndo(); return snap ? 1 : 0; }, board);
const selected = (board) => page.evaluate((b) => [...document.querySelectorAll(`#cv-${b} .grafloria-node-host.axdb-selected`)].map((h) => h.dataset.nodeId), board);
const grip = (board, id) => page.evaluate((s) => { const h = document.querySelector(s); const g = h?.querySelector(':scope > .axdb-grip'); if (!g) return null; const r = g.getBoundingClientRect(); const hr = h.getBoundingClientRect(); const cs = getComputedStyle(g); const under = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { cls: g.className, opacity: +cs.opacity, x: Math.round(r.x - hr.x), y: Math.round(r.y - hr.y), w: Math.round(r.width), h: Math.round(r.height), hostW: Math.round(hr.width), hit: !!under && (under === g || g.contains(under)), border: cs.borderColor }; }, hostSel(board, id));
/** Overlap and overflow check for one board: hosts inside the frame, none overlapping. */
const sanity = (board) => page.evaluate((b) => {
  const cv = document.getElementById(`cv-${b}`).getBoundingClientRect();
  const hs = [...document.querySelectorAll(`#cv-${b} .grafloria-node-host`)].map((h) => h.getBoundingClientRect()).filter((r) => r.x > -5000 && r.width > 4);
  let overlaps = 0, overflow = 0;
  for (let i = 0; i < hs.length; i++) {
    const a = hs[i];
    if (a.bottom > cv.bottom + 1 || a.right > cv.right + 1 || a.x < cv.x - 1 || a.y < cv.y - 1) overflow++;
    for (let j = i + 1; j < hs.length; j++) { const c = hs[j]; if (a.x < c.right - 4 && c.x < a.right - 4 && a.y < c.bottom - 4 && c.y < a.bottom - 4) overlaps++; }
  }
  return { count: hs.length, overlaps, overflow };
}, board);
/** Card to the top of the viewport: a +300 px pull must stay inside the window. */
/** A container GROUP's frame (groups have no node host). */
const groupRect = (board, id) => page.evaluate(([b, id]) => { const g = window.__lab[b].api.getModel().getGroup(id); return g ? { x: g.position.x, y: g.position.y, w: g.size?.width ?? 0, h: g.size?.height ?? 0 } : null; }, [board, id]);
const scrollTo = async (board) => { await page.evaluate((b) => document.getElementById(`cv-${b}`).parentElement.scrollIntoView({ block: 'start' }), board); await page.waitForTimeout(120); };

// ---- gestures -------------------------------------------------------------
async function drag(x0, y0, x1, y1, { steps = 14, hold = 250, settle = 500, mid = null } = {}) {
  await page.mouse.move(x0, y0); await page.mouse.down();
  await page.mouse.move(x1, y1, { steps });
  await page.waitForTimeout(hold);
  if (mid) await mid();
  await page.mouse.up();
  await page.waitForTimeout(settle);
}
/** Pull a host's bottom edge down by dy. */
async function pullBottom(board, id, dy, opts) { const r = await rect(board, id); await drag(r.x + r.w / 2, r.bottom - 3, r.x + r.w / 2, r.bottom - 3 + dy, opts); }
/** Drag from a point inside a host (offset from its top-left) by dx, dy. */
async function dragFrom(board, id, ox, oy, dx, dy, opts) { const r = await rect(board, id); await drag(r.x + ox, r.y + oy, r.x + ox + dx, r.y + oy + dy, opts); }
/** Inject a badge showing the cursor under the pointer, for the screenshot. */
const badge = (board, text, x, y) => page.evaluate(([b, t, x, y]) => { const cv = document.getElementById(`cv-${b}`); let el = cv.querySelector('.lab-badge'); if (!el) { el = document.createElement('div'); el.className = 'lab-badge'; el.style.cssText = 'position:absolute;z-index:99;background:#111;color:#fff;font:600 11px ui-monospace,monospace;padding:3px 6px;border-radius:3px;pointer-events:none'; cv.appendChild(el); } const r = cv.getBoundingClientRect(); el.textContent = t; el.style.left = `${x - r.x + 14}px`; el.style.top = `${y - r.y + 14}px`; }, [board, text, x, y]);
const clearBadge = (board) => page.evaluate((b) => document.querySelector(`#cv-${b} .lab-badge`)?.remove(), board);
const cursorAt = (board, id, x, y) => page.evaluate(([s, x, y]) => { const h = document.querySelector(s); const el = document.elementFromPoint(x, y); return { attr: h.getAttribute('data-axdb-edge') ?? '', under: el ? getComputedStyle(el).cursor : '', tag: el?.tagName ?? '' }; }, [hostSel(board, id), x, y]);

try {
// ===========================================================================
// SQUEEZE
// ===========================================================================
{
  begin('L01-elastic-fit-squeezes-neighbours');
  await scrollTo('elastic');
  const before = await heights('elastic');
  await pullBottom('elastic', 'rev', 300, { mid: async () => shot('elastic', 'mid-gesture') });
  const after = await heights('elastic');
  const ev = await events('elastic');
  await shot('elastic', 'after');
  const s = await sanity('elastic');
  verdict(before.rev === 130 && after.rev > 300 && after.cust === 28 && after.trend < 80 && ev.some((e) => e.type === 'commit' && e.changed === true) && s.overlaps === 0 && s.overflow === 0,
    `rev ${before.rev}→${after.rev} cust→${after.cust} trend→${after.trend} events=${JSON.stringify(ev)} ${JSON.stringify(s)}`);
}
{
  begin('L02-frozen-fit-refuses-the-pull');
  await scrollTo('frozen');
  const before = await heights('frozen');
  const c0 = await cells('frozen');
  let mid = null;
  await pullBottom('frozen', 'rev', 300, { mid: async () => { mid = await page.evaluate(() => { const p = document.querySelector('#cv-frozen .axdb-ph'); const h = document.querySelector('#cv-frozen .grafloria-node-host[data-node-id="rev"]'); return { ph: p ? Math.round(p.getBoundingClientRect().height) : null, revLive: Math.round(h.getBoundingClientRect().height) }; }); await shot('frozen', 'mid-gesture'); } });
  const after = await heights('frozen');
  const c1 = await cells('frozen');
  const ev = await events('frozen');
  const canUndo = await undoDepth('frozen');
  await shot('frozen', 'after');
  verdict(JSON.stringify(before) === JSON.stringify(after) && JSON.stringify(c0) === JSON.stringify(c1) && ev.length > 0 && ev.every((e) => e.changed === false) && canUndo === 0,
    `heights same=${JSON.stringify(before) === JSON.stringify(after)} cells same=${JSON.stringify(c0) === JSON.stringify(c1)} mid=${JSON.stringify(mid)} events=${JSON.stringify(ev)} canUndo=${canUndo}`);
}
{
  begin('L03-frozen-allows-what-fits');
  await scrollTo('frozen');
  // shrink trend 2→1 rows: allowed (frees a row) …
  const t = await rect('frozen', 'trend');
  await drag(t.x + t.w / 2, t.bottom - 3, t.x + t.w / 2, t.bottom - 3 - 130);
  const ev1 = await events('frozen');
  const c1 = await cells('frozen');
  await shot('frozen', 'trend-shrunk');
  // … and back 1→2: allowed, the row was the board's own
  const t2 = await rect('frozen', 'trend');
  await drag(t2.x + t2.w / 2, t2.bottom - 3, t2.x + t2.w / 2, t2.bottom - 3 + 130);
  const ev2 = await events('frozen');
  const c2 = await cells('frozen');
  const h2 = await heights('frozen');
  await shot('frozen', 'trend-grown-back');
  verdict(c1.trend.h === 1 && ev1.some((e) => e.type === 'commit' && e.changed) && c2.trend.h === 2 && ev2.some((e) => e.type === 'commit' && e.changed) && h2.trend === 270 && h2.rev === 130,
    `shrink→h=${c1.trend.h} ${JSON.stringify(ev1)} grow→h=${c2.trend.h} ${JSON.stringify(ev2)} heights=${JSON.stringify(h2)}`);
}
{
  begin('L04-frozen-refuses-an-add-elastic-takes-it');
  await scrollTo('frozen');
  const r = await page.evaluate(() => {
    const add = (b) => !!window.__lab[b].handle.addWidget({ id: `added-${b}`, kind: 'kpi', span: 12, rows: 1, data: { label: 'Added row', value: '+1' } });
    return { frozen: add('frozen'), elastic: add('edges'), frozenCap: window.__lab.frozen.handle.metrics().capacity, elasticCap: window.__lab.edges.handle.metrics().capacity };
  });
  await page.waitForTimeout(500);
  const hf = await heights('frozen'); const he = await heights('edges');
  await shot('frozen', 'add-refused');
  await shot('edges', 'add-taken');
  const sf = await sanity('frozen'); const se = await sanity('edges');
  verdict(r.frozen === false && r.elastic === true && !('added-frozen' in hf) && ('added-edges' in he) && sf.overflow === 0 && se.overflow === 0 && r.frozenCap === 3 && r.elasticCap > 3,
    `frozen add=${r.frozen} cap=${r.frozenCap} · elastic add=${r.elastic} cap=${r.elasticCap} rows=${JSON.stringify(he)} ${JSON.stringify(se)}`);
}
{
  begin('L05-minRowHeight-41-stops-the-squeeze');
  await scrollTo('floor41');
  await pullBottom('floor41', 'rev', 300);
  const h = await heights('floor41');
  const ev = await events('floor41');
  const add = await page.evaluate(() => !!window.__lab.floor41.handle.addWidget({ id: 'floor-add', kind: 'kpi', span: 12, rows: 1, data: { label: 'Row', value: '+1' } }));
  await page.waitForTimeout(400);
  const cap = await page.evaluate(() => window.__lab.floor41.handle.metrics());
  // the squeezed donut's legend stays inside its body, under the title
  const legend = await page.evaluate(() => { const h = document.querySelector('#cv-floor41 .grafloria-node-host[data-node-id="mix"]'); const t = h.querySelector('.axdb-widget-h').getBoundingClientRect(); const l = h.querySelector('.axdb-lg').getBoundingClientRect(); const b = h.querySelector('.axdb-widget-b').getBoundingClientRect(); return { legendTop: Math.round(l.top), titleBottom: Math.round(t.bottom), bodyBottom: Math.round(b.bottom), legendBottom: Math.round(l.bottom) }; });
  await shot('floor41', 'after');
  const s = await sanity('floor41');
  // rows quantise to the capacity at the floor: 8 rows of 41 in 430 px paint at 42–43
  verdict(h.cust >= 41 && h.cust <= 45 && h.rev > 250 && ev.some((e) => e.changed) && add === false && cap.rows === cap.capacity && s.overflow === 0 && s.overlaps === 0 && legend.legendTop >= legend.titleBottom - 1 && legend.legendBottom <= legend.bodyBottom + 1,
    `cust→${h.cust} rev→${h.rev} add=${add} rows=${cap.rows}/${cap.capacity} donut legend ${JSON.stringify(legend)} ${JSON.stringify(s)}`);
}
{
  begin('L06-grow-ignores-squeeze');
  await scrollTo('grow-frozen');
  await pullBottom('grow-frozen', 'rev', 300);
  const h = await heights('grow-frozen');
  const c = await cells('grow-frozen');
  const ev = await events('grow-frozen');
  await shot('grow-frozen', 'after');
  verdict(c.rev.h === 3 && h.cust === 130 && h.trend === 270 && ev.some((e) => e.type === 'commit' && e.changed),
    `rev rows=${c.rev.h} h=${h.rev} cust=${h.cust} trend=${h.trend} events=${JSON.stringify(ev)}`);
}
{
  begin('L07-overfull-document-squeezes-to-the-frame');
  await scrollTo('overfull');
  const h0 = await heights('overfull');
  const s0 = await sanity('overfull');
  const m = await page.evaluate(() => window.__lab.overfull.handle.metrics());
  await pullBottom('overfull', 'rev', 200);
  const h1 = await heights('overfull');
  const ev = await events('overfull');
  await shot('overfull', 'after-refused-pull');
  const s1 = await sanity('overfull');
  verdict(s0.count === 9 && s0.overflow === 0 && s0.overlaps === 0 && h0.rev < 130 && h0.rev >= 28 && JSON.stringify(h0) === JSON.stringify(h1) && ev.every((e) => !e.changed) && s1.overflow === 0,
    `loaded rows=${m.rows} cap=${m.capacity} rev=${h0.rev} ${JSON.stringify(s0)} pull events=${JSON.stringify(ev)} same=${JSON.stringify(h0) === JSON.stringify(h1)}`);
}

// ===========================================================================
// CAPTION BAND + SELECTOR HANDLE
// ===========================================================================
{
  begin('L08-caption-band-on-a-custom-host');
  await scrollTo('custom');
  const c0 = await cells('custom');
  // press in the body (60 px down) and pull right: NOT a drag, the tile stays
  await dragFrom('custom', 'c1', 60, 60, 420, 0);
  const c1 = await cells('custom');
  // press in the band (10 px down) and pull right onto c2: a drag
  await dragFrom('custom', 'c1', 60, 10, 420, 0, { mid: async () => shot('custom', 'band-drag-mid') });
  const c2 = await cells('custom');
  // the button inside still clicks
  const b = await page.evaluate(() => document.querySelector('#cv-custom .grafloria-node-host[data-node-id="c2"] .my-btn').getBoundingClientRect().toJSON());
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(150);
  const clicks = await page.evaluate(() => ({ ...window.__labClicks }));
  // the one-row tile: its band is still the top 28 px
  await dragFrom('custom', 'c4', 40, 12, 300, 0);
  const c3 = await cells('custom');
  await shot('custom', 'after');
  const s = await sanity('custom');
  verdict(JSON.stringify(c0.c1) === JSON.stringify(c1.c1) && c2.c1.x !== c0.c1.x && clicks.c2 === 1 && c3.c4.x !== c2.c4.x && s.overlaps === 0,
    `body-press moved=${JSON.stringify(c0.c1) !== JSON.stringify(c1.c1)} band-press moved c1 ${c0.c1.x}→${c2.c1.x} button clicks=${JSON.stringify(clicks)} tiny c4 ${c2.c4.x}→${c3.c4.x} ${JSON.stringify(s)}`);
}
{
  begin('L09-selector-handle-only');
  await scrollTo('selector');
  const c0 = await cells('selector');
  // band area but not the handle: no drag
  await dragFrom('selector', 's1', 30, 10, 500, 0);
  const c1 = await cells('selector');
  // the handle itself: a drag
  const h = await page.evaluate(() => document.querySelector('#cv-selector .grafloria-node-host[data-node-id="s1"] .my-handle').getBoundingClientRect().toJSON());
  await drag(h.x + h.width / 2, h.y + h.height / 2, h.x + h.width / 2 + 500, h.y + h.height / 2, { mid: async () => shot('selector', 'handle-drag-mid') });
  const c2 = await cells('selector');
  await shot('selector', 'after');
  verdict(JSON.stringify(c0.s1) === JSON.stringify(c1.s1) && c2.s1.x !== c0.s1.x,
    `band-not-handle moved=${JSON.stringify(c0.s1) !== JSON.stringify(c1.s1)} handle moved s1 ${c0.s1.x}→${c2.s1.x}`);
}

// ===========================================================================
// STATIC
// ===========================================================================
{
  begin('L10-static-kit-board-no-gesture-no-chrome');
  await scrollTo('static');
  const c0 = await cells('static');
  const t = await rect('static', 'trend');
  await page.evaluate(() => { window.__sc = 0; document.querySelector('#cv-static .grafloria-node-host[data-node-id="trend"] .axdb-widget-b').addEventListener('click', () => window.__sc++); });
  await page.mouse.click(t.x + t.w / 2, t.y + t.h / 2); await page.waitForTimeout(150);
  await drag(t.x + t.w / 2, t.y + 12, t.x + t.w / 2, t.y + 12 + 200);
  await page.mouse.move(t.x + t.w / 2, t.bottom - 3); await page.waitForTimeout(120);
  const cur = await cursorAt('static', 'trend', t.x + t.w / 2, t.bottom - 3);
  const chrome = await page.evaluate(() => ({ rs: document.querySelectorAll('#cv-static .axdb-rs').length, grips: [...document.querySelectorAll('#cv-static .axdb-grip')].filter((g) => +getComputedStyle(g).opacity > 0).length, sel: [...document.querySelectorAll('#cv-static .axdb-selected')].length }));
  const clicks = await page.evaluate(() => window.__sc);
  const c1 = await cells('static');
  // …and the drag selected no text on the board (kit cards are not prose)
  const selectedText = await page.evaluate(() => (window.getSelection()?.toString() ?? '').trim().length);
  await shot('static', 'after');
  verdict(clicks === 1 && JSON.stringify(c0) === JSON.stringify(c1) && cur.attr === '' && chrome.rs === 0 && chrome.grips === 0 && selectedText === 0,
    `click=${clicks} moved=${JSON.stringify(c0) !== JSON.stringify(c1)} edge-attr='${cur.attr}' rs=${chrome.rs} visible-grips=${chrome.grips} selected=${chrome.sel} text-selected-chars=${selectedText}`);
}
{
  begin('L11-static-custom-host-button-clicks');
  await scrollTo('static-custom');
  const c0 = await cells('static-custom');
  const b = await page.evaluate(() => document.querySelector('#cv-static-custom .grafloria-node-host[data-node-id="b1"] .my-btn').getBoundingClientRect().toJSON());
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(150);
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(150);
  const clicks = await page.evaluate(() => window.__labClicks.b1 ?? 0);
  await dragFrom('static-custom', 'b1', 60, 10, 500, 0);
  const c1 = await cells('static-custom');
  await shot('static-custom', 'after');
  verdict(clicks === 2 && JSON.stringify(c0) === JSON.stringify(c1), `button clicks=${clicks} band-drag moved=${JSON.stringify(c0) !== JSON.stringify(c1)}`);
}
{
  begin('L12-static-split-divider-frozen-content-clickable');
  await scrollTo('static-split');
  const t = await rect('static-split', 'trend');
  await page.evaluate(() => { window.__ssc = 0; document.querySelector('#cv-static-split .grafloria-node-host[data-node-id="trend"] .axdb-widget-b').addEventListener('click', () => window.__ssc++); });
  await page.mouse.click(t.x + t.w / 2, t.y + t.h / 2); await page.waitForTimeout(150);
  const clicks = await page.evaluate(() => window.__ssc);
  const div = await page.evaluate(() => { const d = document.querySelector('#cv-static-split .axdb-div'); return d ? d.getBoundingClientRect().toJSON() : null; });
  const w0 = await rect('static-split', 'trend');
  if (div) await drag(div.x + div.width / 2, div.y + div.height / 2, div.x + div.width / 2 + 150, div.y + div.height / 2);
  const w1 = await rect('static-split', 'trend');
  await drag(t.x + t.w / 2, t.y + 12, t.x + t.w / 2 + 300, t.y + 12);
  const w2 = await rect('static-split', 'trend');
  await shot('static-split', 'after');
  const s = await sanity('static-split');
  verdict(clicks === 1 && Math.round(w0.w) === Math.round(w1.w) && Math.round(w0.x) === Math.round(w2.x) && s.overlaps === 0,
    `click=${clicks} divider=${div ? 'present' : 'none'} trend w ${Math.round(w0.w)}→${Math.round(w1.w)} x ${Math.round(w0.x)}→${Math.round(w2.x)} ${JSON.stringify(s)}`);
}
{
  begin('L13-static-toggled-at-runtime-in-a-container');
  await scrollTo('nested');
  const c0 = await cells('nested');
  await page.evaluate(() => { window.__lab.nested.handle.setStatic(true); window.__nc = 0; document.querySelector('#cv-nested .grafloria-node-host[data-node-id="n-trend"] .axdb-widget-b').addEventListener('click', () => window.__nc++); });
  await page.waitForTimeout(200);
  const t = await rect('nested', 'n-trend');
  await page.mouse.click(t.x + t.w / 2, t.y + t.h / 2); await page.waitForTimeout(150);
  await drag(t.x + t.w / 2, t.y + 10, t.x + t.w / 2, t.y + 10 - 150);
  const clicks = await page.evaluate(() => window.__nc);
  const innerAfterStatic = await page.evaluate(() => { const h = document.querySelector('#cv-nested .grafloria-node-host[data-node-id="n-trend"]'); const r = h.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y) }; });
  await shot('nested', 'static-on');
  await page.evaluate(() => window.__lab.nested.handle.setStatic(false));
  await page.waitForTimeout(200);
  // back to live: a drag on a KPI by its grip moves it (grip mode → select first)
  const r = await rect('nested', 'rev');
  await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2); await page.waitForTimeout(200);
  const g = await grip('nested', 'rev');
  const gr = await page.evaluate(() => document.querySelector('#cv-nested .grafloria-node-host[data-node-id="rev"] > .axdb-grip').getBoundingClientRect().toJSON());
  await drag(gr.x + gr.width / 2, gr.y + gr.height / 2, gr.x + gr.width / 2 + 350, gr.y + gr.height / 2);
  const c2 = await cells('nested');
  await shot('nested', 'static-off-drag-works');
  const tBefore = await rect('nested', 'n-trend');
  verdict(clicks === 1 && c2.rev.x !== c0.rev.x && g && g.opacity === 1 && Math.round(t.y) === innerAfterStatic.y,
    `inner click=${clicks} inner moved under static=${Math.round(t.y) !== innerAfterStatic.y} grip=${g ? `${g.cls} op=${g.opacity}` : 'none'} rev ${c0.rev.x}→${c2.rev.x}`);
}

// ===========================================================================
// EDGE CURSORS
// ===========================================================================
{
  begin('L14-edge-cursors-all-four-and-corners');
  await scrollTo('edges');
  const t = await rect('edges', 'trend');
  const probes = [
    ['bottom', t.x + t.w / 2, t.bottom - 3, 'ns-resize'],
    ['top', t.x + t.w / 2, t.y + 3, 'ns-resize'],
    ['right', t.right - 3, t.y + t.h / 2, 'ew-resize'],
    ['left', t.x + 3, t.y + t.h / 2, 'ew-resize'],
    ['bottom-right', t.right - 3, t.bottom - 3, 'nwse-resize'],
    ['top-left', t.x + 3, t.y + 3, 'nwse-resize'],
    ['top-right', t.right - 3, t.y + 3, 'nesw-resize'],
    ['bottom-left', t.x + 3, t.bottom - 3, 'nesw-resize'],
    ['middle', t.x + t.w / 2, t.y + t.h / 2, ''],
  ];
  const got = [];
  for (const [name, x, y, want] of probes) {
    await page.mouse.move(x, y); await page.waitForTimeout(80);
    const c = await cursorAt('edges', 'trend', x, y);
    got.push({ name, want, attr: c.attr, under: c.under, tag: c.tag, ok: c.attr === want && (want === '' || c.under === want) });
    if (name === 'bottom-right') { await badge('edges', `under pointer: ${c.under} (${c.tag})`, x, y); await shot('edges', 'corner-cursor'); await clearBadge('edges'); }
  }
  // resizable:false → no affordance; leave → attribute removed
  const r = await rect('edges', 'rev');
  await page.mouse.move(r.x + r.w / 2, r.bottom - 3); await page.waitForTimeout(80);
  const nores = await cursorAt('edges', 'rev', r.x + r.w / 2, r.bottom - 3);
  const c = await rect('edges', 'cust');
  await page.mouse.move(c.x + c.w / 2, c.bottom - 3); await page.waitForTimeout(80);
  const yes = await cursorAt('edges', 'cust', c.x + c.w / 2, c.bottom - 3);
  await page.mouse.move(c.x + c.w / 2, c.bottom + 60); await page.waitForTimeout(80);
  const left = await cursorAt('edges', 'cust', c.x + c.w / 2, c.bottom - 3);
  const bad = got.filter((g) => !g.ok);
  verdict(bad.length === 0 && nores.attr === '' && yes.attr === 'ns-resize' && yes.under === 'ns-resize' && left.attr === '',
    `${got.map((g) => `${g.name}=${g.attr || '∅'}/${g.under}(${g.tag})`).join(' ')} · resizable:false='${nores.attr}' kpi='${yes.attr}' after-leave='${left.attr}'`);
}

// ===========================================================================
// GRIP PLACEMENTS
// ===========================================================================
for (const [board, pos, place] of [['grip-in-l', 'left', 'inside'], ['grip-in-c', 'center', 'inside'], ['grip-in-r', 'right', 'inside'], ['grip-out-l', 'left', 'outside'], ['grip-out-c', 'center', 'outside'], ['grip-out-r', 'right', 'outside']]) {
  begin(`L15-grip-${place}-${pos}`);
  await scrollTo(board);
  const hidden = await grip(board, 'trend');
  const t = await rect(board, 'trend');
  await page.mouse.click(t.x + t.w / 2, t.y + t.h / 2); await page.waitForTimeout(250);
  const g = await grip(board, 'trend');
  // first-row tile: the OUTSIDE tab must not be clipped by the board's top
  const r = await rect(board, 'rev');
  await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2); await page.waitForTimeout(250);
  const g0 = await grip(board, 'rev');
  const sel = await selected(board);
  await shot(board, 'first-row-selected');
  const posOk = pos === 'left' ? g.x < 40 : pos === 'right' ? g.x > g.hostW - 60 : Math.abs(g.x + g.w / 2 - g.hostW / 2) < 4;
  const placeOk = place === 'inside' ? g.y >= 0 : g.y < 0;
  verdict(hidden.opacity === 0 && g.opacity === 1 && g.cls.includes(`axdb-grip--${pos}`) && g.cls.includes(`axdb-grip--${place}`) && posOk && placeOk && g0.opacity === 1 && g0.hit && sel.length === 1 && sel[0] === 'rev',
    `rest op=${hidden.opacity} · trend grip op=${g.opacity} at (${g.x},${g.y}) ${g.w}×${g.h} host ${g.hostW} · rev grip op=${g0.opacity} at (${g0.x},${g0.y}) hit-testable=${g0.hit} · selected=${sel}`);
}
{
  begin('L16-grip-mode-drags-only-from-the-grip');
  await scrollTo('grip-in-l');
  const c0 = await cells('grip-in-l');
  const t = await rect('grip-in-l', 'trend');
  await page.mouse.click(t.x + t.w / 2, t.y + t.h / 2); await page.waitForTimeout(250);
  // body press: selects, does not drag
  await drag(t.x + t.w / 2, t.y + t.h / 2, t.x + t.w / 2, t.y + t.h / 2 - 200);
  const c1 = await cells('grip-in-l');
  const gr = await page.evaluate(() => document.querySelector('#cv-grip-in-l .grafloria-node-host[data-node-id="trend"] > .axdb-grip').getBoundingClientRect().toJSON());
  await drag(gr.x + gr.width / 2, gr.y + gr.height / 2, gr.x + gr.width / 2, gr.y + gr.height / 2 - 200, { mid: async () => shot('grip-in-l', 'grip-drag-mid') });
  const c2 = await cells('grip-in-l');
  const selAfter = await selected('grip-in-l');
  // void click clears the selection and hides the grip
  const cv = await page.evaluate(() => document.getElementById('cv-grip-in-l').getBoundingClientRect().toJSON());
  await page.mouse.click(cv.x + cv.width - 8, cv.y + cv.height - 8); await page.waitForTimeout(250);
  const selVoid = await selected('grip-in-l');
  const gHidden = await grip('grip-in-l', 'trend');
  await shot('grip-in-l', 'after-void-click');
  const s = await sanity('grip-in-l');
  verdict(JSON.stringify(c0) === JSON.stringify(c1) && c2.trend.y !== c0.trend.y && selAfter[0] === 'trend' && selVoid.length === 0 && gHidden.opacity === 0 && s.overlaps === 0,
    `body-drag moved=${JSON.stringify(c0) !== JSON.stringify(c1)} grip-drag trend y ${c0.trend.y}→${c2.trend.y} selected-after=${selAfter} void→${selVoid.length} grip op=${gHidden.opacity} ${JSON.stringify(s)}`);
}
{
  begin('L17-grip-over-a-custom-host');
  await scrollTo('grip-custom');
  const c0 = await cells('grip-custom');
  const r = await rect('grip-custom', 'g1');
  await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2); await page.waitForTimeout(250);
  const g = await grip('grip-custom', 'g1');
  const gr = await page.evaluate(() => document.querySelector('#cv-grip-custom .grafloria-node-host[data-node-id="g1"] > .axdb-grip').getBoundingClientRect().toJSON());
  await shot('grip-custom', 'selected');
  await drag(gr.x + gr.width / 2, gr.y + gr.height / 2, gr.x + gr.width / 2 + 500, gr.y + gr.height / 2);
  const c1 = await cells('grip-custom');
  await shot('grip-custom', 'after-grip-drag');
  verdict(g && g.opacity === 1 && g.hit && c1.g1.x !== c0.g1.x, `grip=${g ? `op=${g.opacity} hit=${g.hit} at (${g.x},${g.y})` : 'none'} g1 x ${c0.g1.x}→${c1.g1.x}`);
}
{
  begin('L18-rtl-grip-and-drag');
  await scrollTo('rtl');
  const c0 = await cells('rtl');
  const r = await rect('rtl', 'rev');
  const cv = await page.evaluate(() => document.getElementById('cv-rtl').getBoundingClientRect().toJSON());
  await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2); await page.waitForTimeout(250);
  const g = await grip('rtl', 'rev');
  const gr = await page.evaluate(() => document.querySelector('#cv-rtl .grafloria-node-host[data-node-id="rev"] > .axdb-grip').getBoundingClientRect().toJSON());
  await shot('rtl', 'selected');
  await drag(gr.x + gr.width / 2, gr.y + gr.height / 2, gr.x + gr.width / 2 - 350, gr.y + gr.height / 2);
  const c1 = await cells('rtl');
  await shot('rtl', 'after');
  const s = await sanity('rtl');
  verdict(r.right > cv.right - 40 && g && g.opacity === 1 && c1.rev.x !== c0.rev.x && s.overlaps === 0,
    `rev at right edge=${r.right > cv.right - 40} grip op=${g?.opacity} at (${g?.x},${g?.y}) rev cell x ${c0.rev.x}→${c1.rev.x} ${JSON.stringify(s)}`);
}
{
  begin('L19-keyboard-focus-shows-the-grip');
  await scrollTo('grip-in-c');
  const cv = await page.evaluate(() => document.getElementById('cv-grip-in-c').getBoundingClientRect().toJSON());
  await page.mouse.click(cv.x + cv.width - 8, cv.y + cv.height - 8); await page.waitForTimeout(200);
  const focused = await page.evaluate(() => { const h = document.querySelector('#cv-grip-in-c .grafloria-node-host[tabindex="0"]'); h?.focus(); return h?.dataset.nodeId ?? null; });
  await page.waitForTimeout(250);
  const g = focused ? await grip('grip-in-c', focused) : null;
  await shot('grip-in-c', 'keyboard-focused');
  verdict(!!focused && g && g.opacity === 1, `focused=${focused} grip op=${g?.opacity}`);
}

// ===========================================================================
// ACCENT
// ===========================================================================
{
  begin('L20-accent-variable-themes-ring-grip-outline');
  await scrollTo('accent');
  const t = await rect('accent', 'trend');
  await page.mouse.click(t.x + t.w / 2, t.y + t.h / 2); await page.waitForTimeout(250);
  const gr = await page.evaluate(() => document.querySelector('#cv-accent .grafloria-node-host[data-node-id="trend"] > .axdb-grip').getBoundingClientRect().toJSON());
  await page.mouse.move(gr.x + gr.width / 2, gr.y + gr.height / 2); await page.waitForTimeout(150);
  const css = await page.evaluate(() => { const h = document.querySelector('#cv-accent .grafloria-node-host[data-node-id="trend"]'); const g = h.querySelector(':scope > .axdb-grip'); const w = h.querySelector(':scope > .axdb-widget'); h.focus(); return { ring: getComputedStyle(w).boxShadow, gripBorder: getComputedStyle(g).borderColor, gripColor: getComputedStyle(g).color, outline: getComputedStyle(h).outlineColor }; });
  await shot('accent', 'selected-grip-hovered');
  const crimson = 'rgb(194, 24, 91)';
  verdict(css.ring.includes('rgba(194, 24, 91') && css.gripBorder === crimson && css.gripColor === crimson,
    `ring=${css.ring.slice(0, 60)} gripBorder=${css.gripBorder} gripColor=${css.gripColor} outline=${css.outline}`);
}

// ===========================================================================
// SELECTION ACROSS REBINDS
// ===========================================================================
{
  begin('L21-selection-survives-every-rebind');
  await scrollTo('layouts');
  const t = await rect('layouts', 'trend');
  await page.mouse.click(t.x + t.w / 2, t.y + t.h / 2); await page.waitForTimeout(250);
  const steps = [];
  const record = async (label) => { const s = await selected('layouts'); const g = await grip('layouts', 'trend'); steps.push({ label, sel: s.join(','), op: g?.opacity ?? null, cls: g?.cls?.replace(/axdb-grip\s*/, '') ?? '' }); await shot('layouts', label); };
  await record('grid-selected');
  await page.evaluate(() => window.__lab.layouts.handle.setLayout('split')); await page.waitForTimeout(400); await record('split');
  await page.evaluate(() => window.__lab.layouts.handle.setLayout('grid')); await page.waitForTimeout(400); await record('grid-again');
  await page.evaluate(() => window.__lab.layouts.handle.setDragHandle({ grip: true, position: 'right', placement: 'outside' })); await page.waitForTimeout(400); await record('grip-moved-outside-right');
  await page.evaluate(() => window.__lab.layouts.handle.setStatic(true)); await page.waitForTimeout(400);
  const underStatic = { sel: (await selected('layouts')).join(','), op: (await grip('layouts', 'trend'))?.opacity };
  await shot('layouts', 'static');
  await page.evaluate(() => window.__lab.layouts.handle.setStatic(false)); await page.waitForTimeout(400); await record('static-off');
  await page.evaluate(() => window.__lab.layouts.handle.setColumns(6)); await page.waitForTimeout(500); await record('columns-6');
  await page.evaluate(() => window.__lab.layouts.handle.setColumns(12)); await page.waitForTimeout(500); await record('columns-12');
  // remove the selected widget: no selection left, no error
  await page.evaluate(() => window.__lab.layouts.handle.widget('trend').remove()); await page.waitForTimeout(500);
  const afterRemove = await selected('layouts');
  await shot('layouts', 'selected-removed');
  const s = await sanity('layouts');
  const allKept = steps.every((x) => x.sel === 'trend' && x.op === 1);
  const gripRight = steps.find((x) => x.label === 'grip-moved-outside-right')?.cls.includes('right');
  verdict(allKept && gripRight && (underStatic.op ?? 0) === 0 && afterRemove.length === 0 && s.overlaps === 0,
    `${steps.map((x) => `${x.label}:${x.sel}/op${x.op}`).join(' ')} · static: sel=${underStatic.sel} op=${underStatic.op} · after-remove sel=${afterRemove.length} ${JSON.stringify(s)}`);
}
{
  begin('L22-views-switch-and-focus-after-add');
  await scrollTo('views');
  const r = await rect('views', 'rev');
  await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2); await page.waitForTimeout(250);
  await page.evaluate(() => window.__lab.views.handle.showView('v2')); await page.waitForTimeout(400);
  const v2 = await page.evaluate(() => ({ visible: [...document.querySelectorAll('#cv-views .grafloria-node-host')].filter((h) => h.getBoundingClientRect().x > -5000).map((h) => h.dataset.nodeId) }));
  await shot('views', 'v2');
  await page.evaluate(() => window.__lab.views.handle.showView('v1')); await page.waitForTimeout(400);
  const selBack = await selected('views');
  // add then focus immediately: selected once the add lands, with the fade
  const res = await page.evaluate(() => { const w = window.__lab.views.handle.addWidget({ id: 'fresh', kind: 'kpi', span: 12, rows: 1, data: { label: 'Fresh', value: '+1' } }); const f = window.__lab.views.handle.focusWidget('fresh'); return { added: !!w, focusReturned: f }; });
  await page.waitForTimeout(30);
  const early = await grip('views', 'fresh');
  await page.waitForTimeout(400);
  const late = await grip('views', 'fresh');
  const sel = await selected('views');
  await shot('views', 'fresh-focused');
  // parked view under split carries no corner handles
  await page.evaluate(() => window.__lab.views.handle.setLayout('split')); await page.waitForTimeout(500);
  const parkedRs = await page.evaluate(() => [...document.querySelectorAll('#cv-views .grafloria-node-host')].filter((h) => h.getBoundingClientRect().x < -5000).map((h) => h.querySelectorAll('.axdb-rs').length).reduce((a, b) => a + b, 0));
  await shot('views', 'split');
  const s = await sanity('views');
  verdict(v2.visible.length === 4 && res.added && res.focusReturned && late && late.opacity === 1 && sel[0] === 'fresh' && parkedRs === 0 && s.overlaps === 0,
    `v2 shows ${v2.visible.length} · selection after v1 back=${selBack} · add=${res.added} focus=${res.focusReturned} grip op early=${early?.opacity ?? 'none'} late=${late?.opacity} sel=${sel} · parked .axdb-rs=${parkedRs} ${JSON.stringify(s)}`);
}
{
  begin('L23-nested-grip-inside-a-container');
  await scrollTo('nested');
  const c0 = await page.evaluate(() => { const h = document.querySelector('#cv-nested .grafloria-node-host[data-node-id="n-mix"]'); const r = h.getBoundingClientRect(); return { x: Math.round(r.x) }; });
  const t = await rect('nested', 'n-mix');
  await page.mouse.click(t.x + t.w / 2, t.y + t.h / 2); await page.waitForTimeout(250);
  const g = await grip('nested', 'n-mix');
  const gr = await page.evaluate(() => document.querySelector('#cv-nested .grafloria-node-host[data-node-id="n-mix"] > .axdb-grip').getBoundingClientRect().toJSON());
  await drag(gr.x + gr.width / 2, gr.y + gr.height / 2, gr.x + gr.width / 2 - 600, gr.y + gr.height / 2, { mid: async () => shot('nested', 'inner-grip-drag-mid') });
  const c1 = await page.evaluate(() => { const h = document.querySelector('#cv-nested .grafloria-node-host[data-node-id="n-mix"]'); const r = h.getBoundingClientRect(); return { x: Math.round(r.x) }; });
  await shot('nested', 'inner-after');
  const s = await sanity('nested');
  verdict(g && g.opacity === 1 && g.hit && c1.x < c0.x && s.overlaps === 0, `inner grip op=${g?.opacity} hit=${g?.hit} n-mix x ${c0.x}→${c1.x} ${JSON.stringify(s)}`);
}
{
  begin('L24-narrow-container-reflows-without-overflow');
  await scrollTo('narrow');
  const h0 = await heights('narrow');
  await page.evaluate(() => { document.getElementById('cv-narrow').style.width = '600px'; }); await page.waitForTimeout(700);
  const cols = await page.evaluate(() => window.__lab.narrow.handle.getColumns());
  const s1 = await sanity('narrow');
  const h1 = await heights('narrow');
  const m = await page.evaluate(() => window.__lab.narrow.handle.metrics());
  await shot('narrow', 'at-600');
  await page.evaluate(() => { document.getElementById('cv-narrow').style.width = ''; }); await page.waitForTimeout(700);
  const cols2 = await page.evaluate(() => window.__lab.narrow.handle.getColumns());
  const h2 = await heights('narrow');
  const s2 = await sanity('narrow');
  await shot('narrow', 'back-wide');
  verdict(cols === 6 && s1.overflow === 0 && s1.overlaps === 0 && s1.count === 6 && cols2 === 12 && JSON.stringify(h0) === JSON.stringify(h2) && s2.overflow === 0,
    `600px → cols=${cols} rows=${m.rows} ${JSON.stringify(s1)} heights=${JSON.stringify(h1)} · back → cols=${cols2} restored=${JSON.stringify(h0) === JSON.stringify(h2)}`);
}

// ===========================================================================
// ITEM 7 — LAYOUT AND SIZING PER CONTAINER
// ===========================================================================
{
  begin('L25-container-split-dividers-tree-and-switch');
  await scrollTo('c-split');
  const divs0 = await page.evaluate(() => [...document.querySelectorAll('#cv-c-split .axdb-div')].map((d) => d.getBoundingClientRect().toJSON()));
  const t0 = await rect('c-split', 'n-trend'); const m0 = await rect('c-split', 'n-mix');
  const box0 = await groupRect('c-split', 'box');
  await shot('c-split', 'at-rest');
  // the divider between the two inner tiles: drag it 150 px left
  const div = divs0.find((d) => d.height > d.width) ?? divs0[0];
  if (div) await drag(div.x + div.width / 2, div.y + div.height / 2, div.x + div.width / 2 - 150, div.y + div.height / 2, { mid: async () => shot('c-split', 'divider-drag-mid') });
  const t1 = await rect('c-split', 'n-trend'); const m1 = await rect('c-split', 'n-mix');
  const json1 = await page.evaluate(() => { const b = window.__lab['c-split'].handle.toJSON().views[0].widgets.find((w) => w.id === 'box'); return { layout: b.layout, tree: !!b.tree, kids: (b.widgets ?? []).map((w) => w.id).sort() }; });
  // select an inner tile, switch the CONTAINER to grid and back: selection kept, children kept
  await page.mouse.click(m1.x + m1.w / 2, m1.y + m1.h / 2); await page.waitForTimeout(250);
  const sel0 = await selected('c-split');
  await page.evaluate(() => window.__lab['c-split'].handle.setLayout('grid', 'box')); await page.waitForTimeout(500);
  const asGrid = { layout: await page.evaluate(() => window.__lab['c-split'].handle.getLayout('box')), divs: await page.evaluate(() => document.querySelectorAll('#cv-c-split .axdb-div').length), sel: await selected('c-split'), kids: await page.evaluate(() => window.__lab['c-split'].handle.toJSON().views[0].widgets.find((w) => w.id === 'box').widgets.length), viewLayout: await page.evaluate(() => window.__lab['c-split'].handle.getLayout()) };
  await shot('c-split', 'container-as-grid');
  await page.evaluate(() => window.__lab['c-split'].handle.setLayout('split', 'box')); await page.waitForTimeout(500);
  const asSplit = { layout: await page.evaluate(() => window.__lab['c-split'].handle.getLayout('box')), divs: await page.evaluate(() => document.querySelectorAll('#cv-c-split .axdb-div').length), sel: await selected('c-split') };
  // an inner press still reaches the container's own tool after the rebind: drag n-mix's grip → it moves
  const gr = await page.evaluate(() => document.querySelector('#cv-c-split .grafloria-node-host[data-node-id="n-mix"] > .axdb-grip')?.getBoundingClientRect().toJSON());
  const mx0 = (await rect('c-split', 'n-mix')).x;
  if (gr) await drag(gr.x + gr.width / 2, gr.y + gr.height / 2, gr.x + gr.width / 2 - 600, gr.y + gr.height / 2);
  const mx1 = (await rect('c-split', 'n-mix')).x;
  const box1 = await groupRect('c-split', 'box');
  await shot('c-split', 'container-split-again');
  const s = await sanity('c-split');
  verdict(divs0.length >= 1 && t1.w < t0.w - 100 && m1.w > m0.w + 100 && json1.layout === 'split' && json1.tree && json1.kids.join() === 'n-mix,n-trend' && sel0[0] === 'n-mix' && asGrid.layout === 'grid' && asGrid.divs === 0 && asGrid.sel[0] === 'n-mix' && asGrid.kids === 2 && asGrid.viewLayout === 'grid' && asSplit.layout === 'split' && asSplit.divs >= 1 && asSplit.sel[0] === 'n-mix' && mx1 < mx0 && Math.round(box1.h) === Math.round(box0.h) && s.overlaps === 0,
    `dividers=${divs0.length} trend w ${Math.round(t0.w)}→${Math.round(t1.w)} mix w ${Math.round(m0.w)}→${Math.round(m1.w)} json=${JSON.stringify(json1)} sel=${sel0} grid=${JSON.stringify(asGrid)} split=${JSON.stringify(asSplit)} mix x ${Math.round(mx0)}→${Math.round(mx1)} box h ${Math.round(box0.h)}→${Math.round(box1.h)} ${JSON.stringify(s)}`);
}
{
  begin('L26-container-fit-refuses-a-pull-past-the-pane');
  await scrollTo('c-fit');
  const box0 = await groupRect('c-fit', 'box'); const t0 = await rect('c-fit', 'n-trend');
  const c0 = await cells('c-fit');
  const inner0 = await page.evaluate(() => { const w = window.__lab['c-fit'].handle.widget('n-trend'); return { h: w.cell.h }; });
  await pullBottom('c-fit', 'n-trend', 150, { mid: async () => shot('c-fit', 'pull-mid') });
  const box1 = await groupRect('c-fit', 'box'); const t1 = await rect('c-fit', 'n-trend');
  const c1 = await cells('c-fit');
  const inner1 = await page.evaluate(() => { const w = window.__lab['c-fit'].handle.widget('n-trend'); return { h: w.cell.h }; });
  const ev = await events('c-fit');
  await shot('c-fit', 'after');
  const s = await sanity('c-fit');
  verdict(Math.round(box0.h) === Math.round(box1.h) && Math.round(t0.h) === Math.round(t1.h) && c0.box.h === c1.box.h && inner0.h === inner1.h && ev.length > 0 && ev.every((e) => !e.changed) && s.overlaps === 0,
    `slab h ${Math.round(box0.h)}→${Math.round(box1.h)} rows ${c0.box.h}→${c1.box.h} inner trend rows ${inner0.h}→${inner1.h} px ${Math.round(t0.h)}→${Math.round(t1.h)} events=${JSON.stringify(ev)} ${JSON.stringify(s)}`);
}
{
  begin('L27-container-grow-escalates-the-slab');
  await scrollTo('c-grow');
  const box0 = await groupRect('c-grow', 'box'); const t0 = await rect('c-grow', 'n-trend');
  const c0 = await cells('c-grow');
  await pullBottom('c-grow', 'n-trend', 150, { mid: async () => shot('c-grow', 'pull-mid') });
  const box1 = await groupRect('c-grow', 'box'); const t1 = await rect('c-grow', 'n-trend');
  const c1 = await cells('c-grow');
  const inner1 = await page.evaluate(() => window.__lab['c-grow'].handle.widget('n-trend').cell.h);
  const ev = await events('c-grow');
  await shot('c-grow', 'after');
  // Both inner tiles span the container's full height, so the slab gains a row
  // in the parent and both grow a row with it (the strip model, in cells). The
  // parent is a GROW board, so it extends past the 430 px frame and scrolls —
  // overflow of the frame is the point.
  const s = await sanity('c-grow');
  verdict(c1.box.h === c0.box.h + 1 && box1.h > box0.h + 100 && inner1 === 3 && t1.h > t0.h + 100 && ev.some((e) => e.type === 'commit' && e.changed) && s.overlaps === 0,
    `slab rows ${c0.box.h}→${c1.box.h} px ${Math.round(box0.h)}→${Math.round(box1.h)} inner trend rows ${inner1} px ${Math.round(t0.h)}→${Math.round(t1.h)} events=${JSON.stringify(ev)} ${JSON.stringify(s)}`);
}

// ===========================================================================
// MULTI-ROW SECTIONS (the Quantia Groups page)
// ===========================================================================
{
  begin('L28-partial-tile-in-a-section-is-refused-not-scaled');
  await scrollTo('panel-fit');
  const before = await heights('panel-fit'); const c0 = await cells('panel-fit');
  const slab0 = await groupRect('panel-fit', 'sec-controls');
  const inner0 = await page.evaluate(() => Object.fromEntries(window.__lab['panel-fit'].handle.binderOf('sec-controls').saveLayout().cells));
  // the corner of the one-row Product control, pulled 150 px — 3 rows the section does not hold
  const rs = await page.evaluate(() => document.querySelector('#cv-panel-fit .grafloria-node-host[data-node-id="ctl-product"] .axdb-rs').getBoundingClientRect().toJSON());
  await drag(rs.x + rs.width / 2, rs.y + rs.height / 2, rs.x + rs.width / 2, rs.y + rs.height / 2 + 150, { steps: 20, mid: async () => shot('panel-fit', 'pull-mid') });
  const after = await heights('panel-fit'); const c1 = await cells('panel-fit');
  const slab1 = await groupRect('panel-fit', 'sec-controls');
  const inner1 = await page.evaluate(() => Object.fromEntries(window.__lab['panel-fit'].handle.binderOf('sec-controls').saveLayout().cells));
  const ev = await events('panel-fit');
  await shot('panel-fit', 'after');
  const s = await sanity('panel-fit');
  verdict(JSON.stringify(before) === JSON.stringify(after) && JSON.stringify(c0) === JSON.stringify(c1) && JSON.stringify(inner0) === JSON.stringify(inner1) && Math.round(slab0.h) === Math.round(slab1.h) && c1['sec-controls'].h === 14 && ev.length > 0 && ev.every((e) => !e.changed) && s.overlaps === 0 && s.overflow === 0,
    `heights same=${JSON.stringify(before) === JSON.stringify(after)} slab rows ${c0['sec-controls'].h}→${c1['sec-controls'].h} px ${Math.round(slab0.h)}→${Math.round(slab1.h)} inner same=${JSON.stringify(inner0) === JSON.stringify(inner1)} caption ${before['ctl-caption']}→${after['ctl-caption']} amount ${before['ctl-amount']}→${after['ctl-amount']} events=${JSON.stringify(ev)} ${JSON.stringify(s)}`);
}
{
  begin('L29-full-height-tile-still-escalates-and-a-shrink-stops-at-the-design');
  await scrollTo('panel-grow');
  const c0 = await cells('panel-grow'); const f0 = await rect('panel-grow', 'sec-filter'); const ch0 = await rect('panel-grow', 'sec-chart');
  // Status spans all 14 rows of Paid business: pulling it past the section
  // grows the SECTION and Status with it. Its sibling (the chart) keeps its
  // own 14 rows — a grid resize changes what you grabbed, nothing else.
  const rs = await page.evaluate(() => document.querySelector('#cv-panel-grow .grafloria-node-host[data-node-id="sec-filter"] .axdb-rs').getBoundingClientRect().toJSON());
  await drag(rs.x + rs.width / 2, rs.y + rs.height / 2, rs.x + rs.width / 2, rs.y + rs.height / 2 + 120, { steps: 16, mid: async () => shot('panel-grow', 'full-height-pull-mid') });
  const c1 = await cells('panel-grow'); const f1 = await rect('panel-grow', 'sec-filter'); const ch1 = await rect('panel-grow', 'sec-chart');
  await shot('panel-grow', 'section-grew');
  // …and pulling it back well above the section shrinks it, but never below its 14 designed rows
  const rs2 = await page.evaluate(() => document.querySelector('#cv-panel-grow .grafloria-node-host[data-node-id="sec-filter"] .axdb-rs').getBoundingClientRect().toJSON());
  await drag(rs2.x + rs2.width / 2, rs2.y + rs2.height / 2, rs2.x + rs2.width / 2, rs2.y + rs2.height / 2 - 400, { steps: 20 });
  const c2 = await cells('panel-grow');
  await shot('panel-grow', 'section-back');
  const s = await sanity('panel-grow');
  verdict(c1['sec-paid'].h > c0['sec-paid'].h && f1.h > f0.h + 60 && ch1.h < f1.h - 60 && c2['sec-paid'].h === 14 && s.overlaps === 0,
    `paid rows ${c0['sec-paid'].h}→${c1['sec-paid'].h}→${c2['sec-paid'].h} · DRAGGED filter px ${Math.round(f0.h)}→${Math.round(f1.h)} · sibling chart px ${Math.round(ch0.h)}→${Math.round(ch1.h)} (kept its cell) ${JSON.stringify(s)}`);
}

{
  begin('L30-partial-tile-pushes-below-and-grows-the-section');
  await scrollTo('panel-grow');
  const cellsOf = () => page.evaluate(() => { const H = window.__lab['panel-grow'].handle; const b = H.binderOf('sec-controls'); const c = (id) => b.cellOf(id); return { slab: H.widget('sec-controls').cell.h, product: c('ctl-product').h, date: c('ctl-date').y, amount: c('ctl-amount').y, amountEnd: c('ctl-amount').y + c('ctl-amount').h }; });
  const c0 = await cellsOf(); const p0 = await rect('panel-grow', 'ctl-product'); const a0 = await rect('panel-grow', 'ctl-amount');
  const rs = await page.evaluate(() => document.querySelector('#cv-panel-grow .grafloria-node-host[data-node-id="ctl-product"] .axdb-rs').getBoundingClientRect().toJSON());
  // pull the one-row Product 3 rows taller (34-px rows): what is below moves down, the section grows
  await drag(rs.x + rs.width / 2, rs.y + rs.height / 2, rs.x + rs.width / 2, rs.y + rs.height / 2 + 3 * 44, { steps: 24, mid: async () => shot('panel-grow', 'partial-pull-mid') });
  const c1 = await cellsOf(); const p1 = await rect('panel-grow', 'ctl-product'); const a1 = await rect('panel-grow', 'ctl-amount');
  await shot('panel-grow', 'section-grew-by-the-push');
  // pull it back: the rows go back to the board, the section returns to its 14-row design
  const rs2 = await page.evaluate(() => document.querySelector('#cv-panel-grow .grafloria-node-host[data-node-id="ctl-product"] .axdb-rs').getBoundingClientRect().toJSON());
  await drag(rs2.x + rs2.width / 2, rs2.y + rs2.height / 2, rs2.x + rs2.width / 2, rs2.y + rs2.height / 2 - 3 * 44 - 20, { steps: 24 });
  const c2 = await cellsOf();
  await shot('panel-grow', 'section-back-to-design');
  // undo the two commits: the design again, then the grown state, then the design
  const s = await sanity('panel-grow');
  verdict(c1.product === c0.product + 3 && c1.date === c0.date + 3 && c1.amount === c0.amount + 3 && c1.slab === c0.slab + 3 && c1.amountEnd === c1.slab && Math.round(a1.h) === Math.round(a0.h) && p1.h > p0.h + 100 && c2.product === c0.product && c2.slab === c0.slab && c2.amount === c0.amount && s.overlaps === 0,
    `product rows ${c0.product}→${c1.product}→${c2.product} · date y ${c0.date}→${c1.date}→${c2.date} · amount y ${c0.amount}→${c1.amount}→${c2.amount} (end ${c1.amountEnd}) · slab ${c0.slab}→${c1.slab}→${c2.slab} · amount px ${Math.round(a0.h)}→${Math.round(a1.h)} product px ${Math.round(p0.h)}→${Math.round(p1.h)} ${JSON.stringify(s)}`);
}
{
  begin('L31-one-kpi-of-a-strip-grows-alone-and-comes-back');
  await scrollTo('strip');
  const cellsOf = () => page.evaluate(() => { const H = window.__lab.strip.handle; const b = H.binderOf('kpis'); return { slab: H.widget('kpis').cell.h, kpis: ['s-rev', 's-cust', 's-win', 's-nps'].map((id) => b.cellOf(id).h), trendY: H.widget('s-trend').cell.y }; });
  const c0 = await cellsOf(); const k0 = await rect('strip', 's-cust');
  const rs = await page.evaluate(() => document.querySelector('#cv-strip .grafloria-node-host[data-node-id="s-rev"] .axdb-rs').getBoundingClientRect().toJSON());
  await drag(rs.x + rs.width / 2, rs.y + rs.height / 2, rs.x + rs.width / 2, rs.y + rs.height / 2 + 75, { steps: 16, mid: async () => shot('strip', 'pull-mid') });
  const c1 = await cellsOf(); const k1 = await rect('strip', 's-cust');
  await shot('strip', 'one-kpi-grew');
  const rs2 = await page.evaluate(() => document.querySelector('#cv-strip .grafloria-node-host[data-node-id="s-rev"] .axdb-rs').getBoundingClientRect().toJSON());
  await drag(rs2.x + rs2.width / 2, rs2.y + rs2.height / 2, rs2.x + rs2.width / 2, rs2.y + rs2.height / 2 - 90, { steps: 16 });
  const c2 = await cellsOf();
  await shot('strip', 'row-back');
  const s = await sanity('strip');
  // The dragged KPI (s-rev) gains the row; its three siblings keep theirs,
  // and the section grows to hold it — the widget you grabbed is the only
  // one that changes cells.
  verdict(c0.slab === 1 && c1.slab === 2 && c1.kpis[0] === 2 && c1.kpis.slice(1).every((h) => h === 1)
    && c1.trendY === c0.trendY + 1 && c2.slab === 1 && c2.kpis.every((h) => h === 1) && c2.trendY === c0.trendY && s.overlaps === 0,
    `slab ${c0.slab}→${c1.slab}→${c2.slab} · kpi rows ${c1.kpis}→${c2.kpis} (only the dragged one grew) · trend y ${c0.trendY}→${c1.trendY}→${c2.trendY} · sibling px ${Math.round(k0.h)}→${Math.round(k1.h)} ${JSON.stringify(s)}`);
}

{
  begin('L32-one-selection-per-canvas-across-a-section-and-its-board');
  await scrollTo('nested');
  const cv = await page.evaluate(() => document.getElementById('cv-nested').getBoundingClientRect().toJSON());
  await page.mouse.click(cv.x + cv.width - 8, cv.y + cv.height - 8); await page.waitForTimeout(200);
  const click = async (id) => { const r = await rect('nested', id); await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2); await page.waitForTimeout(250); return selected('nested'); };
  const s1 = await click('n-mix');      // inside the container
  const s2 = await click('rev');        // on the board
  await shot('nested', 'board-tile-selected-only');
  const s3 = await click('n-trend');    // back inside
  await shot('nested', 'inner-tile-selected-only');
  const api = await page.evaluate(() => { const H = window.__lab.nested.handle; H.selectWidget('cust'); const a = H.getSelectedWidget(); const inner = H.binderOf('box').getSelectedWidget(); H.focusWidget('n-mix'); return { a, inner, b: H.getSelectedWidget(), outer: H.binderOf().getSelectedWidget() }; });
  verdict(s1.join() === 'n-mix' && s2.join() === 'rev' && s3.join() === 'n-trend' && api.a === 'cust' && api.inner === undefined && api.b === 'n-mix' && api.outer === undefined,
    `clicks: ${s1} → ${s2} → ${s3} · API selectWidget(cust): ${api.a}/inner=${api.inner} · focusWidget(n-mix): ${api.b}/outer=${api.outer}`);
}
{
  begin('L33-outside-grip-tab-fits-the-gap');
  await scrollTo('grip-out-c');
  const t = await rect('grip-out-c', 'trend');
  await page.mouse.click(t.x + t.w / 2, t.y + t.h / 2); await page.waitForTimeout(250);
  const g = await page.evaluate(() => { const h = document.querySelector('#cv-grip-out-c .grafloria-node-host[data-node-id="trend"]'); const gr = h.querySelector(':scope > .axdb-grip').getBoundingClientRect(); const hr = h.getBoundingClientRect(); const above = [...document.querySelectorAll('#cv-grip-out-c .grafloria-node-host')].filter((o) => o !== h && o.getBoundingClientRect().bottom <= hr.top + 1 && o.getBoundingClientRect().right > gr.x && o.getBoundingClientRect().x < gr.right).map((o) => ({ id: o.dataset.nodeId, bottom: o.getBoundingClientRect().bottom })); return { top: gr.top, bottom: gr.bottom, h: gr.height, hostTop: hr.top, above, gap: getComputedStyle(document.querySelector('#cv-grip-out-c .grafloria-diagram-root') || h.parentElement).getPropertyValue('--axdb-gap') }; });
  await shot('grip-out-c', 'tab-in-the-gap');
  const clear = g.above.every((o) => g.top >= o.bottom - 0.5);
  verdict(g.bottom <= g.hostTop + 0.5 && clear && g.h >= 6 && g.h <= 11, `tab ${Math.round(g.top)}→${Math.round(g.bottom)} (${g.h}px) host top ${Math.round(g.hostTop)} above=${JSON.stringify(g.above.map((o) => `${o.id}@${Math.round(o.bottom)}`))} gap-var='${g.gap.trim()}'`);
}

{
  begin('L34-split-round-trip-keeps-14-row-sections');
  await scrollTo('panel-fit');
  const snap = () => page.evaluate(() => { const H = window.__lab['panel-fit'].handle; const flat = (ws, p) => ws.flatMap((w) => [`${p}${w.id}@${w.x},${w.y} ${w.span}x${w.rows}`, ...(w.widgets ? flat(w.widgets, p + w.id + '/') : [])]); return flat(H.toJSON().views[0].widgets, '').join(' | '); });
  const h0 = await heights('panel-fit'); const s0 = await snap();
  await page.evaluate(() => window.__lab['panel-fit'].handle.setLayout('split')); await page.waitForTimeout(500);
  const sSplit = await snap(); const hSplit = await heights('panel-fit');
  await shot('panel-fit', 'split');
  await page.evaluate(() => window.__lab['panel-fit'].handle.setLayout('grid')); await page.waitForTimeout(500);
  const s1 = await snap(); const h1 = await heights('panel-fit');
  await shot('panel-fit', 'grid-again');
  const s = await sanity('panel-fit');
  verdict(s1 === s0 && JSON.stringify(h1) === JSON.stringify(h0) && /sec-controls@0,0 3x14/.test(sSplit) && JSON.stringify(hSplit) === JSON.stringify(h0) && s.overlaps === 0 && s.overflow === 0,
    `cells back=${s1 === s0} px back=${JSON.stringify(h1) === JSON.stringify(h0)} split cells: ${sSplit.slice(0, 120)}… ${JSON.stringify(s)}`);
}

{
  begin('L35-a-section-is-selected-by-a-press-on-its-empty-band');
  await scrollTo('panel-grow');
  const slab = (id) => page.evaluate((id) => { const el = document.querySelector(`#cv-panel-grow .axdb-slab[data-slab-id="${id}"]`); if (!el) return null; const r = el.getBoundingClientRect(); const rs = el.querySelector('.axdb-rs'); return { x: r.x, y: r.y, w: r.width, h: r.height, selected: el.classList.contains('axdb-slab--selected'), handleOp: rs ? +getComputedStyle(rs).opacity : null, handle: rs ? rs.getBoundingClientRect().toJSON() : null }; }, id);
  await page.evaluate(() => { window.__labSelects['panel-grow'] = []; });
  const s0 = await slab('sec-controls');
  // the free column of Report controls: right of its children, mid-height
  const amount = await rect('panel-grow', 'ctl-amount');
  await page.mouse.click(amount.right + 30, amount.y + 40); await page.waitForTimeout(300);
  const s1 = await slab('sec-controls');
  const api1 = await page.evaluate(() => ({ sel: window.__lab['panel-grow'].handle.getSelectedWidget(), events: window.__labSelects['panel-grow'].slice() }));
  await shot('panel-grow', 'section-selected');
  // a child press moves the selection to the child; the section ring goes
  await page.mouse.click(amount.x + amount.w / 2, amount.y + amount.h / 2); await page.waitForTimeout(300);
  const s2 = await slab('sec-controls'); const sel2 = await selected('panel-grow');
  // and the API can select a section too
  const api3 = await page.evaluate(() => { const H = window.__lab['panel-grow'].handle; const ok = H.selectWidget('sec-paid'); return { ok, sel: H.getSelectedWidget(), inner: H.binderOf('sec-controls').getSelectedWidget() }; });
  const s3 = await slab('sec-paid');
  await shot('panel-grow', 'paid-selected-by-api');
  verdict(s0 && !s0.selected && s0.handleOp === 0 && s1.selected && s1.handleOp === 1 && api1.sel === 'sec-controls' && api1.events.includes('main:sec-controls') && !s2.selected && sel2.join() === 'ctl-amount' && api3.ok && api3.sel === 'sec-paid' && api3.inner === undefined && s3.selected,
    `rest: sel=${s0?.selected} handle=${s0?.handleOp} · after band press: sel=${s1?.selected} handle=${s1?.handleOp} api=${api1.sel} events=${api1.events} · child press: slab=${s2?.selected} sel=${sel2} · API sec-paid: ${JSON.stringify(api3)} slab=${s3?.selected}`);
}
{
  begin('L36-a-section-resizes-by-handle-and-edge-floored-at-its-children');
  await scrollTo('panel-grow');
  const cellOf = (id) => page.evaluate((id) => { const c = window.__lab['panel-grow'].handle.widget(id).cell; return { x: c.x, y: c.y, w: c.w, h: c.h }; }, id);
  const c0 = await cellOf('sec-controls'); const a0 = await rect('panel-grow', 'ctl-amount');
  const amount = await rect('panel-grow', 'ctl-amount');
  await page.mouse.click(amount.right + 30, amount.y + 40); await page.waitForTimeout(300);
  const hnd = await page.evaluate(() => document.querySelector('#cv-panel-grow .axdb-slab[data-slab-id="sec-controls"] > .axdb-rs').getBoundingClientRect().toJSON());
  // 1. corner handle: two rows taller (34-px rows + 10 gap)
  await drag(hnd.x + hnd.width / 2, hnd.y + hnd.height / 2, hnd.x + hnd.width / 2, hnd.y + hnd.height / 2 + 2 * 44, { steps: 16, mid: async () => shot('panel-grow', 'section-handle-pull-mid') });
  const c1 = await cellOf('sec-controls'); const a1 = await rect('panel-grow', 'ctl-amount');
  const ev1 = await events('panel-grow');
  await shot('panel-grow', 'section-taller');
  // 2. pull it back well above its children's rows: floored at 14
  const hnd2 = await page.evaluate(() => document.querySelector('#cv-panel-grow .axdb-slab[data-slab-id="sec-controls"] > .axdb-rs').getBoundingClientRect().toJSON());
  await drag(hnd2.x + hnd2.width / 2, hnd2.y + hnd2.height / 2, hnd2.x + hnd2.width / 2, hnd2.y + hnd2.height / 2 - 6 * 44, { steps: 16 });
  const c2 = await cellOf('sec-controls'); const a2 = await rect('panel-grow', 'ctl-amount');
  // 3. the right EDGE (no handle): one column narrower, from the free band near the frame's right edge
  const fr = await groupRect('panel-grow', 'sec-controls');
  const cv = await page.evaluate(() => document.getElementById('cv-panel-grow').getBoundingClientRect().toJSON());
  const ex = cv.x + fr.x + fr.w - 3, ey = cv.y + fr.y + fr.h / 2;
  await page.mouse.move(ex, ey); await page.waitForTimeout(120);
  const cursor = await page.evaluate(() => document.getElementById('cv-panel-grow').querySelector('.grafloria-diagram-root')?.style.cursor || getComputedStyle(document.getElementById('cv-panel-grow').firstElementChild).cursor);
  await drag(ex, ey, ex - 120, ey, { steps: 12 });
  const c3 = await cellOf('sec-controls'); const a3 = await rect('panel-grow', 'ctl-amount');
  await shot('panel-grow', 'section-narrower-by-edge');
  // 4. undo twice: width back, then height back to the design
  await page.evaluate(async () => { const cm = window.__lab['panel-grow'].api.getEngine().commandManager; await cm.undo(); await cm.undo(); await cm.undo(); }); await page.waitForTimeout(500);
  const c4 = await cellOf('sec-controls');
  const s = await sanity('panel-grow');
  verdict(c1.h === c0.h + 2 && a1.h > a0.h + 20 && ev1.some((e) => e.type === 'commit' && e.changed) && c2.h === 14 && Math.round(a2.h) === Math.round(a0.h) && c3.w === c0.w - 1 && c3.h === 14 && a3.w < a0.w - 40 && cursor === 'ew-resize' && c4.w === c0.w && c4.h === c0.h && s.overlaps === 0,
    `rows ${c0.h}→${c1.h}→${c2.h} (amount px ${Math.round(a0.h)}→${Math.round(a1.h)}→${Math.round(a2.h)}) · edge cursor=${cursor} width ${c0.w}→${c3.w} (amount px w ${Math.round(a0.w)}→${Math.round(a3.w)}) · undo → ${c4.w}x${c4.h} · events=${JSON.stringify(ev1)} ${JSON.stringify(s)}`);
}

{
  begin('L37-resizing-items-inside-a-section-every-edge');
  await scrollTo('panel-grow');
  const cell = (id) => page.evaluate((id) => { const b = window.__lab['panel-grow'].handle.binderOf('sec-controls'); const c = b.cellOf(id); return { x: c.x, y: c.y, w: c.w, h: c.h }; }, id);
  const secRows = () => page.evaluate(() => window.__lab['panel-grow'].handle.widget('sec-controls').cell.h);
  const cells = async () => ({ caption: await cell('ctl-caption'), product: await cell('ctl-product'), date: await cell('ctl-date'), amount: await cell('ctl-amount'), sec: await secRows() });
  const edge = async (id, side, dx, dy, label) => { const r = await rect('panel-grow', id); const x = side === 'e' ? r.right - 3 : side === 'w' ? r.x + 3 : r.x + r.w / 2; const y = side === 's' ? r.bottom - 3 : side === 'n' ? r.y + 3 : r.y + r.h / 2; await drag(x, y, x + dx, y + dy, { steps: 14, mid: label ? async () => shot('panel-grow', label) : null }); return cells(); };
  const c0 = await cells();
  const cu = (await rect('panel-grow', 'ctl-product')).w / 3; // an inner column, px
  // a. Product's right edge into the free column, and back
  const a1 = await edge('ctl-product', 'e', cu + 6, 0, 'width-into-free-column-mid');
  const a2 = await edge('ctl-product', 'e', -(cu + 6), 0);
  await shot('panel-grow', 'width-back');
  // b. Invoice date's TOP edge pulled up one row (Product above it: the push goes sideways into the free column or is refused — never an overlap)
  const b1 = await edge('ctl-date', 'n', 0, -44, 'top-edge-pull-mid');
  await shot('panel-grow', 'top-edge-after');
  // c. Invoice size's bottom edge up two rows: it shrinks; the section keeps its 14 designed rows
  const cB = await cells();
  const c1 = await edge('ctl-amount', 's', 0, -88);
  await shot('panel-grow', 'child-shrunk');
  // d. Invoice date's corner: one column wider and one row taller (pushes Invoice size down; the section grows a row)
  const rsD = await page.evaluate(() => document.querySelector('#cv-panel-grow .grafloria-node-host[data-node-id="ctl-date"] .axdb-rs').getBoundingClientRect().toJSON());
  await drag(rsD.x + 12, rsD.y + 12, rsD.x + 12 + cu, rsD.y + 12 + 44, { steps: 14, mid: async () => shot('panel-grow', 'corner-pull-mid') });
  const d1 = await cells();
  await shot('panel-grow', 'corner-after');
  // e. undo exactly the commits this scenario made: back to the start
  const commits = (await events('panel-grow')).filter((e) => e.type === 'commit' && e.changed).length;
  await page.evaluate(async (n) => { const cm = window.__lab['panel-grow'].api.getEngine().commandManager; for (let i = 0; i < n && cm.canUndo(); i++) await cm.undo(); }, commits); await page.waitForTimeout(500);
  const e1 = await cells();
  const s = await sanity('panel-grow');
  const same = (p, q) => JSON.stringify(p) === JSON.stringify(q);
  // b: the row above Invoice date is taken, so a top-edge pull is REFUSED — nothing grows, the section stays
  verdict(a1.product.w === 4 && a1.date.w === 3 && a2.product.w === 3 && same(a2, c0)
    && same(b1, c0)
    && c1.amount.h === cB.amount.h - 2 && c1.sec === 14
    && d1.date.w === 4 && d1.date.h > c1.date.h && d1.amount.y === c1.amount.y + (d1.date.h - c1.date.h)
    && same(e1, c0) && s.overlaps === 0,
    `a: product w ${c0.product.w}→${a1.product.w}→${a2.product.w} · b: date ${JSON.stringify(c0.date)}→${JSON.stringify(b1.date)} product ${JSON.stringify(b1.product)} sec ${b1.sec} · c: amount h ${cB.amount.h}→${c1.amount.h} sec ${cB.sec}→${c1.sec} · d: date ${JSON.stringify(d1.date)} amount y ${c1.amount.y}→${d1.amount.y} sec ${d1.sec} · undo back=${same(e1, c0)} ${JSON.stringify(s)}`);
}
{
  begin('L38-a-selected-section-owns-the-shared-corner');
  await scrollTo('panel-grow');
  // select Paid business; its corner handle sits on Area sales' corner — the press resizes the SECTION
  const ch = await rect('panel-grow', 'sec-chart');
  await page.evaluate(() => window.__lab['panel-grow'].handle.selectWidget('sec-paid')); await page.waitForTimeout(250);
  const before = await page.evaluate(() => ({ sec: window.__lab['panel-grow'].handle.widget('sec-paid').cell.h, chart: window.__lab['panel-grow'].handle.binderOf('sec-paid').cellOf('sec-chart').h }));
  const hnd = await page.evaluate(() => document.querySelector('#cv-panel-grow .axdb-slab[data-slab-id="sec-paid"] > .axdb-rs').getBoundingClientRect().toJSON());
  const under = await page.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return el?.closest('.axdb-slab') ? 'slab-handle' : el?.closest('.grafloria-node-host')?.dataset.nodeId ?? el?.className?.toString().slice(0, 30); }, [hnd.x + 12, hnd.y + 12]);
  await drag(hnd.x + 12, hnd.y + 12, hnd.x + 12, hnd.y + 12 + 44, { steps: 12 });
  const after = await page.evaluate(() => ({ sec: window.__lab['panel-grow'].handle.widget('sec-paid').cell.h, chart: window.__lab['panel-grow'].handle.binderOf('sec-paid').cellOf('sec-chart').h }));
  await shot('panel-grow', 'section-owns-corner');
  // deselect: the child's own corner is back
  const cv = await page.evaluate(() => document.getElementById('cv-panel-grow').getBoundingClientRect().toJSON());
  await page.mouse.click(cv.x + cv.width - 8, cv.y + cv.height - 8); await page.waitForTimeout(250);
  const under2 = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('.grafloria-node-host')?.dataset.nodeId ?? document.elementFromPoint(x, y)?.className?.toString().slice(0, 30), [ch.right - 6, ch.bottom - 6]);
  await page.evaluate(async () => { const cm = window.__lab['panel-grow'].api.getEngine().commandManager; if (cm.canUndo()) await cm.undo(); }); await page.waitForTimeout(400);
  verdict(under === 'slab-handle' && after.sec === before.sec + 1 && after.chart === before.chart && under2 === 'sec-chart',
    `under the shared corner while selected: ${under} · sec rows ${before.sec}→${after.sec}, chart rows ${before.chart}→${after.chart} · after deselect the corner belongs to: ${under2}`);
}

{
  begin('L39-split-section-dividers-after-a-switch-and-the-section-handle');
  await scrollTo('panel-grow');
  const state = () => page.evaluate(() => { const H = window.__lab['panel-grow'].handle; const sec = H.widget('sec-controls').cell; const px = (id) => Math.round(document.querySelector(`#cv-panel-grow .grafloria-node-host[data-node-id="${id}"]`).getBoundingClientRect().height); return { w: sec.w, h: sec.h, date: px('ctl-date'), amount: px('ctl-amount'), divs: document.querySelectorAll('#cv-panel-grow .axdb-div').length }; });
  const cells0 = await page.evaluate(() => { const b = window.__lab['panel-grow'].handle.binderOf('sec-controls'); return ['ctl-caption', 'ctl-product', 'ctl-date', 'ctl-amount'].map((id) => { const c = b.cellOf(id); return `${c.y}+${c.h}`; }).join(' '); });
  await page.evaluate(() => window.__lab['panel-grow'].handle.setLayout('split', 'sec-controls')); await page.waitForTimeout(500);
  const s0 = await state();
  const divs = await page.evaluate(() => [...document.querySelectorAll('#cv-panel-grow .axdb-div')].map((d) => d.getBoundingClientRect().toJSON()).filter((d) => d.width > d.height).sort((a, b) => a.y - b.y));
  const d = divs[divs.length - 1]; // between Invoice date and Invoice size
  // a. the divider grabbed mid-width: the two panes trade height, the section keeps its cell
  await drag(d.x + d.width / 2, d.y + d.height / 2, d.x + d.width / 2, d.y + d.height / 2 + 60, { steps: 12, mid: async () => shot('panel-grow', 'split-divider-mid') });
  const s1 = await state();
  // b. grabbed 3 px from the section's right edge: still the divider, never the section
  const d2 = (await page.evaluate(() => [...document.querySelectorAll('#cv-panel-grow .axdb-div')].map((d) => d.getBoundingClientRect().toJSON()).filter((d) => d.width > d.height).sort((a, b) => a.y - b.y))).slice(-1)[0];
  await drag(d2.x + d2.width - 3, d2.y + d2.height / 2, d2.x + d2.width - 3, d2.y + d2.height / 2 - 40, { steps: 12 });
  const s2 = await state();
  await shot('panel-grow', 'split-dividers-dragged');
  // c. the section itself: selected by API (a split section has no empty band), its handle pulls it two rows taller
  await page.evaluate(() => window.__lab['panel-grow'].handle.selectWidget('sec-controls')); await page.waitForTimeout(250);
  const hnd = await page.evaluate(() => document.querySelector('#cv-panel-grow .axdb-slab[data-slab-id="sec-controls"] > .axdb-rs').getBoundingClientRect().toJSON());
  await drag(hnd.x + 12, hnd.y + 12, hnd.x + 12, hnd.y + 12 + 88, { steps: 12 });
  const s3 = await state();
  await shot('panel-grow', 'split-section-taller');
  // d. back to grid: the four controls' cells are what they were
  await page.evaluate(() => window.__lab['panel-grow'].handle.setLayout('grid', 'sec-controls')); await page.waitForTimeout(500);
  const cells1 = await page.evaluate(() => { const b = window.__lab['panel-grow'].handle.binderOf('sec-controls'); return ['ctl-caption', 'ctl-product', 'ctl-date', 'ctl-amount'].map((id) => { const c = b.cellOf(id); return `${c.y}+${c.h}`; }).join(' '); });
  const s4 = await state();
  await page.evaluate(async () => { const cm = window.__lab['panel-grow'].api.getEngine().commandManager; for (let i = 0; i < 4 && cm.canUndo(); i++) await cm.undo(); }); await page.waitForTimeout(400);
  const sane = await sanity('panel-grow');
  verdict(s0.divs >= 3 && s1.date > s0.date + 30 && s1.amount < s0.amount - 30 && s1.w === s0.w && s1.h === s0.h
    && s2.date < s1.date - 20 && s2.w === s0.w && s2.h === s0.h
    && s3.h === s0.h + 2 && s3.w === s0.w
    && s4.divs === 0 && sane.overlaps === 0,
    `dividers=${s0.divs} · mid: date ${s0.date}→${s1.date} amount ${s0.amount}→${s1.amount} section ${s0.w}x${s0.h}→${s1.w}x${s1.h} · edge grab: date →${s2.date} section ${s2.w}x${s2.h} · handle: section →${s3.w}x${s3.h} · grid again cells ${cells0} → ${cells1} divs=${s4.divs} ${JSON.stringify(sane)}`);
}


// ---- SECTION CAPTIONS (0.4.22) ------------------------------------------------
const band = (board, id) => page.evaluate(([b, id]) => {
  const el = document.querySelector(`#cv-${b} .axdb-slab[data-slab-id="${id}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect().toJSON();
  const h = el.querySelector(':scope > .axdb-slab-h');
  if (!h) return { slab: r, band: null, selected: el.classList.contains('axdb-slab--selected') };
  const cs = getComputedStyle(h);
  const q = (sel) => h.querySelector(sel);
  const rr = (n) => (n ? n.getBoundingClientRect().toJSON() : null);
  const acts = q('.axdb-slab-h-actions');
  return {
    slab: r, band: rr(h), selected: el.classList.contains('axdb-slab--selected'),
    text: q('.axdb-slab-h-text')?.textContent ?? h.textContent, textRect: rr(q('.axdb-slab-h-text')),
    sub: q('.axdb-slab-h-sub')?.textContent ?? null, subShown: q('.axdb-slab-h-sub') ? getComputedStyle(q('.axdb-slab-h-sub')).display !== 'none' : null,
    icon: q('.axdb-slab-h-icon')?.textContent ?? null, info: q('.axdb-slab-h-info')?.getAttribute('title') ?? null,
    actions: [...h.querySelectorAll('.axdb-slab-h-action')].map((a) => ({ id: a.dataset.action, disabled: a.disabled, r: a.getBoundingClientRect().toJSON() })),
    actionsOp: acts ? +getComputedStyle(acts).opacity : null, actionsShown: acts ? getComputedStyle(acts).display !== 'none' : null, actionsRect: rr(acts),
    cls: h.className, opacity: +cs.opacity, justify: cs.justifyContent, alignItems: cs.alignItems, transform: cs.textTransform,
    bg: cs.backgroundColor, borderBottom: cs.borderBottomWidth, fontSize: cs.fontSize, fontWeight: cs.fontWeight, fontFamily: cs.fontFamily, color: cs.color, dir: h.getAttribute('dir'),
    aria: el.getAttribute('aria-label'),
  };
}, [board, id]);
/** The topmost child host of a section, in client px. */
const childTop = (board, id) => page.evaluate(([b, id]) => {
  const g = window.__lab[b].api.getModel().getGroup(id);
  const ys = [...(g?.members ?? [])].map((m) => document.querySelector(`#cv-${b} .grafloria-node-host[data-node-id="${m}"]`)?.getBoundingClientRect().y).filter((y) => y != null);
  return ys.length ? Math.min(...ys) : null;
}, [board, id]);
const actionsOf = (board) => page.evaluate((b) => (window.__labActions[b] ?? []).splice(0), board);
const selEvents = (board) => page.evaluate((b) => (window.__labSelects[b] ?? []).splice(0), board);
const undoAll = async (board, n = 6) => { await page.evaluate(async ([b, n]) => { const cm = window.__lab[b].api.getEngine().commandManager; for (let i = 0; i < n && cm.canUndo(); i++) await cm.undo(); }, [board, n]); await page.waitForTimeout(350); };

{
  begin('L40-a-caption-is-painted-and-its-pixels-are-reserved');
  await scrollTo('cap-default');
  const a = await band('cap-default', 'sec-controls');
  const b = await band('cap-default', 'sec-paid');
  const c = await band('cap-default', 'sec-out');
  const aTop = await childTop('cap-default', 'sec-controls');
  const bTop = await childTop('cap-default', 'sec-paid');
  const cTop = await childTop('cap-default', 'sec-out');
  const sane = await sanity('cap-default');
  await shot('cap-default', 'captions-at-rest');
  const okA = a?.band && Math.round(a.band.height) === 28 && a.text === 'Report controls' && Math.abs(a.band.y - a.slab.y) < 1 && Math.abs(a.band.width - a.slab.width) < 1 && aTop >= a.band.y + a.band.height - 0.5 && a.aria === 'Report controls';
  const okB = b?.band && Math.round(b.band.height) === 44 && b.text === 'Paid business' && b.sub === 'net of refunds' && b.icon === '💰' && b.info === 'Paid invoices only, current quarter' && b.actions.length === 3 && b.actions[2].disabled && bTop >= b.band.y + b.band.height - 0.5;
  const okC = c && c.band === null && Math.abs(cTop - c.slab.y) < 1;
  verdict(okA && okB && okC && sane.overlaps === 0 && sane.overflow === 0,
    `A: band ${a?.band?.width}x${a?.band?.height} "${a?.text}" aria=${a?.aria} child top ${aTop} vs band bottom ${a?.band ? a.band.y + a.band.height : '-'} · B: ${b?.band?.height}px "${b?.text}" sub="${b?.sub}" icon=${b?.icon} info="${b?.info}" actions=${b?.actions?.map((x) => x.id + (x.disabled ? '!' : ''))} child top ${bTop} · C: band=${c?.band} child top ${cTop} slab y ${c?.slab?.y} · ${JSON.stringify(sane)}`);
}
{
  begin('L41-a-press-on-the-band-selects-an-action-fires-hover-reveals');
  await scrollTo('cap-default');
  await selEvents('cap-default'); await actionsOf('cap-default');
  const b0 = await band('cap-default', 'sec-paid');
  // a. the band selects the section (not the child under it)
  await page.mouse.click(b0.textRect.x + 10, b0.textRect.y + b0.textRect.height / 2); await page.waitForTimeout(300);
  const b1 = await band('cap-default', 'sec-paid');
  const sel1 = await page.evaluate(() => window.__lab['cap-default'].handle.getSelectedWidget());
  const ev1 = await selEvents('cap-default');
  await shot('cap-default', 'band-press-selects');
  // b. hover the band: the actions appear; press Maximize: onCaptionAction, selection unchanged
  await page.mouse.move(b1.band.x + b1.band.width - 60, b1.band.y + 20); await page.waitForTimeout(300);
  const b2 = await band('cap-default', 'sec-paid');
  const max = b2.actions.find((x) => x.id === 'max');
  await page.mouse.click(max.r.x + max.r.width / 2, max.r.y + max.r.height / 2); await page.waitForTimeout(250);
  const acts = await actionsOf('cap-default');
  const sel2 = await page.evaluate(() => window.__lab['cap-default'].handle.getSelectedWidget());
  await shot('cap-default', 'actions-revealed-and-pressed');
  // c. the disabled action is inert
  const off = b2.actions.find((x) => x.id === 'off');
  await page.mouse.click(off.r.x + off.r.width / 2, off.r.y + off.r.height / 2); await page.waitForTimeout(200);
  const acts2 = await actionsOf('cap-default');
  // d. a child press moves the selection; the actions hide when the pointer leaves an unselected band
  const st = await rect('cap-default', 'sec-filter');
  await page.mouse.click(st.x + st.w / 2, st.y + st.h / 2); await page.waitForTimeout(300);
  const b3 = await band('cap-default', 'sec-paid');
  const sel3 = await selected('cap-default');
  const sane = await sanity('cap-default');
  verdict(!b0.selected && b0.actionsOp === 0 && b1.selected && sel1 === 'sec-paid' && ev1.includes('main:sec-paid') && b2.actionsOp === 1 && acts.join() === 'main:sec-paid:max' && sel2 === 'sec-paid' && acts2.length === 0 && !b3.selected && b3.actionsOp === 0 && sel3.join() === 'sec-filter' && sane.overlaps === 0,
    `rest: selected=${b0.selected} actions op=${b0.actionsOp} · band press: selected=${b1.selected} api=${sel1} events=${ev1} · hover: op=${b2.actionsOp} · Maximize: ${acts} sel=${sel2} · disabled: ${acts2.length} · child press: slab=${b3.selected} op=${b3.actionsOp} sel=${sel3} ${JSON.stringify(sane)}`);
}
{
  begin('L42-a-tab-caption-reserves-its-own-space-and-never-covers-a-neighbour');
  await scrollTo('cap-tab');
  const t = await band('cap-tab', 'box');
  const top = await band('cap-tab', 'top');
  const inner = await childTop('cap-tab', 'box');
  const innerTop = await childTop('cap-tab', 'top');
  const above = await rect('cap-tab', 'above');
  const cv = await page.evaluate(() => document.getElementById('cv-cap-tab').getBoundingClientRect().toJSON());
  const under = await page.evaluate(([x, y]) => (document.elementFromPoint(x, y)?.closest('.axdb-slab-h') ? 'band' : 'other'), [t.textRect.x + 4, t.textRect.y + t.textRect.height / 2]);
  await page.mouse.click(t.textRect.x + 4, t.textRect.y + t.textRect.height / 2); await page.waitForTimeout(300);
  const t1 = await band('cap-tab', 'box');
  const sel = await page.evaluate(() => window.__lab['cap-tab'].handle.getSelectedWidget());
  const sane = await sanity('cap-tab');
  await shot('cap-tab', 'tab-captions-reserved');
  verdict(t.band && t.cls.includes('axdb-slab-h--tab')
    // sized to its text, inside its own slab, reserving its height for the children
    && t.band.width < t.slab.width - 40 && Math.abs(t.band.y - t.slab.y) < 1 && inner >= t.band.y + t.band.height - 0.5
    // never over the chart above it, and never off the top of the canvas
    && t.band.y >= above.bottom - 0.5 && top.band.y >= cv.y - 0.5 && innerTop >= top.band.y + top.band.height - 0.5
    && under === 'band' && t1.selected && sel === 'box' && sane.overlaps === 0 && sane.overflow === 0,
    `tab: ${t.band?.width} of ${t.slab.width} wide, y ${t.band?.y} slab y ${t.slab.y} child top ${inner} · chart above ends ${above.bottom} · top-row tab y ${top.band?.y} canvas y ${cv.y} its child ${innerTop} · under=${under} press: sel=${sel} ${JSON.stringify(sane)}`);
}
{
  begin('L49-no-caption-band-ever-lies-over-a-widget-that-is-not-its-own');
  const boards = ['cap-default', 'cap-fit', 'cap-tab', 'cap-styled', 'cap-custom', 'cap-rtl', 'cap-tight', 'cap-nested', 'cap-edge', 'cap-squeeze'];
  const bad = [];
  for (const b of boards) {
    await scrollTo(b);
    const r = await page.evaluate((b) => {
      const out = [];
      const cv = document.getElementById(`cv-${b}`);
      const model = window.__lab[b].api.getModel();
      for (const slab of cv.querySelectorAll('.axdb-slab')) {
        const sid = slab.dataset.slabId;
        const bandEl = slab.querySelector(':scope > .axdb-slab-h');
        const sr = slab.getBoundingClientRect();
        const own = new Set([...(model.getGroup(sid)?.members ?? [])]);
        if (bandEl && getComputedStyle(bandEl).opacity !== '0') {
          const br = bandEl.getBoundingClientRect();
          // inside its own slab
          if (br.top < sr.top - 0.5 || br.bottom > sr.bottom + 0.5 || br.left < sr.left - 0.5 || br.right > sr.right + 0.5) out.push(`${b}/${sid}:BAND-OUTSIDE-SLAB`);
          for (const h of cv.querySelectorAll('.grafloria-node-host')) {
            const r2 = h.getBoundingClientRect();
            if (r2.width < 4) continue;
            if (br.left < r2.right - 1 && r2.left < br.right - 1 && br.top < r2.bottom - 1 && r2.top < br.bottom - 1) out.push(`${b}/${sid}:COVERS ${h.dataset.nodeId}${own.has(h.dataset.nodeId) ? '(own)' : '(FOREIGN)'}`);
          }
        }
        // every child inside its own section, and none crushed
        for (const m of own) {
          const h = cv.querySelector(`.grafloria-node-host[data-node-id="${m}"]`);
          if (!h) continue;
          const r2 = h.getBoundingClientRect();
          if (r2.top < sr.top - 0.5 || r2.bottom > sr.bottom + 0.5) out.push(`${b}/${sid}:CHILD-OUT ${m}`);
          if (r2.height < 12) out.push(`${b}/${sid}:CHILD-CRUSHED ${m}(${Math.round(r2.height)}px)`);
        }
      }
      return out;
    }, b);
    bad.push(...r);
  }
  await shot('cap-edge', 'edge-captions');
  await shot('cap-tab', 'tab-captions');
  await shot('cap-squeeze', 'nested-captions-squeezed');
  // a hover band is the ONE overlay: it may cover its own children, never a foreign one
  const foreign = bad.filter((x) => x.includes('FOREIGN') || x.includes('OUTSIDE') || x.includes('CHILD-OUT') || x.includes('CRUSHED'));
  verdict(foreign.length === 0, `${boards.length} captioned boards swept · offences: ${foreign.length ? foreign.join(' | ') : 'none'} (own-child overlays, allowed: ${bad.length - foreign.length})`);
}
{
  begin('L57-a-tab-container-shows-one-page-at-a-time');
  await scrollTo('tabs');
  const onCanvas = () => page.evaluate(() => ['pa1', 'pa2', 'pb1', 'pb2', 'pc1'].filter((id) => { const h = document.querySelector(`#cv-tabs .grafloria-node-host[data-node-id="${id}"]`); return h && h.getBoundingClientRect().x > -5000; }));
  const stripState = () => page.evaluate(() => {
    const s = document.querySelector('#cv-tabs .axdb-tabs');
    const r = s?.getBoundingClientRect();
    const slab = window.__lab.tabs.api.getModel().getGroup('panel');
    const firstKid = ['pa1', 'pb1', 'pc1'].map((id) => document.querySelector(`#cv-tabs .grafloria-node-host[data-node-id="${id}"]`)).find((h) => h && h.getBoundingClientRect().x > -5000);
    return {
      tabs: [...(s?.querySelectorAll('.axdb-tab') ?? [])].map((t) => `${t.textContent}${t.getAttribute('aria-selected') === 'true' ? '*' : ''}`),
      role: s?.getAttribute('role'),
      strip: r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null,
      slab: { x: Math.round(slab.position.x), y: Math.round(slab.position.y), w: Math.round(slab.size.width) },
      pageTop: firstKid ? Math.round(firstKid.getBoundingClientRect().top) : null,
      active: window.__lab.tabs.handle.getActiveTab('panel'),
    };
  });
  await page.evaluate(() => { window.__labTabs = []; });
  const s0 = await stripState(); const v0 = await onCanvas();
  await shot('tabs', 'page-one');
  // a real click on the second tab
  await page.click('#cv-tabs .axdb-tab[data-tab-id="pg-b"]'); await page.waitForTimeout(400);
  const s1 = await stripState(); const v1 = await onCanvas();
  const divs = await page.evaluate(() => document.querySelectorAll('#cv-tabs .axdb-div').length);
  await shot('tabs', 'page-two-is-a-split');
  // the keyboard walks the strip
  await page.evaluate(() => document.querySelector('#cv-tabs .axdb-tab[aria-selected="true"]').focus());
  await page.keyboard.press('ArrowRight'); await page.waitForTimeout(350);
  const s2 = await stripState(); const v2 = await onCanvas();
  await shot('tabs', 'page-three-by-keyboard');
  // back to the first page: its two widgets return exactly as they were
  await page.click('#cv-tabs .axdb-tab[data-tab-id="pg-a"]'); await page.waitForTimeout(400);
  const s3 = await stripState(); const v3 = await onCanvas();
  const events = await page.evaluate(() => window.__labTabs.slice());
  const sane = await sanity('tabs');
  verdict(s0.role === 'tablist' && s0.tabs.join() === 'Filters*,Alerts,Notes' && v0.join() === 'pa1,pa2'
    && s1.tabs.join() === 'Filters,Alerts*,Notes' && v1.join() === 'pb1,pb2' && divs > 0
    && s2.tabs.join() === 'Filters,Alerts,Notes*' && v2.join() === 'pc1'
    && s3.active === 'pg-a' && v3.join() === 'pa1,pa2'
    // the strip spans the container and the page starts below it (the slab's x
    // is WORLD space, the strip's is client — compare the width, not the x)
    && s0.strip && s0.strip.w === s0.slab.w && s0.pageTop >= s0.strip.y + s0.strip.h - 0.5
    && events.join() === 'main:panel:pg-b,main:panel:pg-c,main:panel:pg-a' && sane.overlaps === 0 && sane.overflow === 0,
    `boot ${s0.tabs} showing ${v0} · click Alerts → ${s1.tabs} showing ${v1} (a split page: ${divs} dividers) · ArrowRight → ${s2.tabs} showing ${v2} · back to Filters → showing ${v3} · strip ${JSON.stringify(s0.strip)} spans the slab (w${s0.slab.w}), page starts ${s0.pageTop} · onTabChange ${events} ${JSON.stringify(sane)}`);
}
{
  begin('L58-a-tab-container-is-selected-by-its-strip-and-the-strip-follows-it');
  await scrollTo('tabs');
  const geo = () => page.evaluate(() => {
    const r = (s) => { const b = document.querySelector(s)?.getBoundingClientRect(); return b ? { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) } : null; };
    return { strip: r('#cv-tabs .axdb-tabs'), slab: r('#cv-tabs .axdb-slab[data-slab-id="panel"]'), kid: r('#cv-tabs .grafloria-node-host[data-node-id="pa1"]'), cell: window.__lab.tabs.handle.widget('panel').cell };
  });
  const aligned = (g) => g.strip && g.slab && g.strip.x === g.slab.x && g.strip.y === g.slab.y && g.strip.w === g.slab.w && g.kid.y >= g.strip.y + g.strip.h - 0.5;
  await page.evaluate(() => window.__lab.tabs.handle.selectWidget(undefined)); await page.waitForTimeout(200);
  const g0 = await geo();
  // A tab container's PAGES cover it, so the strip's empty space is the only
  // place to press it — without that it could not be selected, and an
  // unselected section shows no corner handle, so it could not be resized.
  await page.mouse.click(g0.strip.x + g0.strip.w - 20, g0.strip.y + g0.strip.h / 2); await page.waitForTimeout(350);
  const sel = await page.evaluate(() => window.__lab.tabs.handle.getSelectedWidget());
  const hnd = await page.evaluate(() => document.querySelector('#cv-tabs .axdb-slab[data-slab-id="panel"] > .axdb-rs')?.getBoundingClientRect().toJSON() ?? null);
  let mid = null;
  await drag(hnd.x + 8, hnd.y + 8, hnd.x + 8 - 160, hnd.y + 8 + 60, { steps: 12, mid: async () => { mid = await geo(); await shot('tabs', 'strip-follows-mid-drag'); } });
  const g1 = await geo();
  await shot('tabs', 'container-resized');
  await undoAll('tabs', 2);
  const g2 = await geo();
  const sane = await sanity('tabs');
  verdict(sel === 'panel' && !!hnd && aligned(g0) && !!mid && aligned(mid) && aligned(g1)
    && g1.cell.w < g0.cell.w && g1.cell.h > g0.cell.h && aligned(g2) && g2.cell.w === g0.cell.w && g2.cell.h === g0.cell.h
    && sane.overlaps === 0,
    `a press on the strip's empty space selected ${sel} · resize ${g0.cell.w}x${g0.cell.h} → ${g1.cell.w}x${g1.cell.h} → undo ${g2.cell.w}x${g2.cell.h} · the strip tracks the container at rest/mid-drag/after: ${[g0, mid, g1, g2].map((g) => (g && aligned(g) ? 'yes' : 'NO')).join('/')} (widths ${g0.strip?.w}→${mid?.strip?.w}→${g1.strip?.w}→${g2.strip?.w}) ${JSON.stringify(sane)}`);
}
{
  begin('L59-a-drop-blocked-by-a-locked-section-lands-beside-it');
  await scrollTo('near');
  const owner = () => page.evaluate(() => { const walk = (ws, p) => { for (const w of ws) { if (w.id === 'n-inner') return `${p}:${w.x},${w.y}`; if (w.widgets) { const r = walk(w.widgets, w.id); if (r) return r; } } return null; }; return walk(window.__lab.near.handle.toJSON().views[0].widgets, 'BOARD'); });
  const before = await owner();
  const a = await rect('near', 'n-a');
  const cv = await page.evaluate(() => document.getElementById('cv-near').getBoundingClientRect().toJSON());
  const col = (cv.width - 16) / 12;
  // aim so the tile's own cell would START at column 6 — overlapping the locked
  // section at column 7. The only room on that row is columns 4..7.
  const src = await rect('near', 'n-inner');
  await drag(src.x + src.w / 2, src.y + src.h / 2, cv.x + 8 + col * 6.5, a.y + a.h / 2, { steps: 16 });
  const after = await owner();
  const sane = await sanity('near');
  await shot('near', 'landed-beside-the-locked-section');
  await undoAll('near', 2);
  const undone = await owner();
  verdict(before === 'n-sec:0,0' && after === 'BOARD:4,0' && undone === before && sane.overlaps === 0,
    `dragged out of the section over the LOCKED slab: ${before} → ${after} (wanted BOARD:4,0 — beside it on the same row, not a new row at the bottom) · undo → ${undone} ${JSON.stringify(sane)}`);
}
{
  begin('L60-a-drop-onto-an-occupied-row-lands-where-the-ghost-promised');
  await scrollTo('push');
  const cells = () => page.evaluate(() => { const out = {}; const walk = (ws, p) => { for (const w of ws) { out[w.id] = { own: p, x: w.x, y: w.y }; if (w.widgets) walk(w.widgets, w.id); } }; walk(window.__lab.push.handle.toJSON().views[0].widgets, 'BOARD'); return out; });
  const box = (o) => (o ? { x: Math.round(o.x), y: Math.round(o.y), w: Math.round(o.w ?? o.width), h: Math.round(o.h ?? o.height) } : null);
  const before = await cells();
  const src = await rect('push', 'pu-in');
  const mid = await rect('push', 'pu-mid');
  let ghost = null;
  // drop it squarely onto the tile that owns the middle row — that row must
  // move down, and the tile must land on the cell the ghost drew, not a row of
  // its own at the bottom.
  await drag(src.x + src.w / 2, src.y + src.h / 2, mid.x + mid.w / 2, mid.y + mid.h / 2, { steps: 16, mid: async () => {
    ghost = box(await page.evaluate(() => { const p = document.querySelector('#cv-push .axdb-ph'); return p ? p.getBoundingClientRect().toJSON() : null; }));
    await shot('push', 'ghost-promises-the-occupied-row');
  } });
  const after = await cells();
  const landed = box(await rect('push', 'pu-in'));
  const sane = await sanity('push');
  await shot('push', 'landed-where-the-ghost-promised');
  const same = ghost && landed && ['x', 'y', 'w', 'h'].every((k) => Math.abs(ghost[k] - landed[k]) <= 3);
  await undoAll('push', 3);
  const undone = await cells();
  const back = ['pu-in', 'pu-mid', 'pu-top'].every((k) => undone[k].own === before[k].own && undone[k].x === before[k].x && undone[k].y === before[k].y);
  verdict(before['pu-in'].own === 'pu-p1' && after['pu-in'].own === 'BOARD' && same
    && after['pu-mid'].y > before['pu-mid'].y && after['pu-mid'].y > after['pu-in'].y
    && back && sane.overlaps === 0,
    `dragged out of a tab page onto the occupied row · pu-in ${before['pu-in'].own}:${before['pu-in'].x},${before['pu-in'].y} -> ${after['pu-in'].own}:${after['pu-in'].x},${after['pu-in'].y} · ghost ${JSON.stringify(ghost)} vs landed ${JSON.stringify(landed)} (${same ? 'the same cell' : 'DIFFERENT — the drop ignored its own preview'}) · pu-mid pushed ${before['pu-mid'].y} -> ${after['pu-mid'].y} · undo restores: ${back} ${JSON.stringify(sane)}`);
}
{
  begin('L61-a-tab-dragged-off-its-strip-tears-the-page-out-as-its-own-group');
  await scrollTo('tabs');
  const state = () => page.evaluate(() => {
    const out = { tabs: [...document.querySelectorAll('#cv-tabs .axdb-tabs[data-tabs-id="panel"] .axdb-tab')].map((t) => t.textContent), born: [...document.querySelectorAll('#cv-tabs .axdb-tabs[data-tabs-id="pg-c__group"] .axdb-tab')].map((t) => t.textContent), active: window.__lab.tabs.handle.getActiveTab('panel'), owners: {} };
    const walk = (ws, p) => { for (const w of ws) { out.owners[w.id] = `${p}:${w.x},${w.y}`; if (w.widgets) walk(w.widgets, w.id); } };
    walk(window.__lab.tabs.handle.toJSON().views[0].widgets, 'BOARD');
    return out;
  });
  const before = await state();
  const tab = await page.evaluate(() => document.querySelector('#cv-tabs .axdb-tab[data-tab-id=\"pg-c\"]').getBoundingClientRect().toJSON());
  const left = await rect('tabs', 't-left');
  // FIRST: a drag that ends back over its own container is a cancel — dragging
  // a tab around its own strip must not tear the page out of it.
  await drag(tab.x + tab.width / 2, tab.y + tab.height / 2, tab.x + 40, tab.y + 90, { steps: 10 });
  const held = await state();
  let mid = null;
  // press the NOTES tab and carry it onto the board's left column
  await drag(tab.x + tab.width / 2, tab.y + tab.height / 2, left.x + left.w / 2, left.y + left.h - 30, { steps: 18, mid: async () => {
    mid = await page.evaluate(() => ({
      chip: document.querySelector('.axdb-tab-chip')?.textContent ?? null,
      ph: !!document.querySelector('#cv-tabs .axdb-ph'),
    }));
    await shot('tabs', 'tab-chip-follows-the-pointer');
  } });
  const after = await state();
  const sane = await sanity('tabs');
  await shot('tabs', 'the-page-became-its-own-group');
  await undoAll('tabs', 2);
  const undone = await state();
  verdict(before.tabs.join(',') === 'Filters,Alerts,Notes' && mid?.chip === 'Notes' && mid?.ph === true
    && held.tabs.join(',') === 'Filters,Alerts,Notes' && held.owners['pg-c'] === before.owners['pg-c'] && held.active === before.active
    && after.tabs.join(',') === 'Filters,Alerts'
    // VS Code: the page becomes a GROUP of its own, still wearing its tab
    && after.born.join(',') === 'Notes' && after.owners['pg-c__group']?.startsWith('BOARD:') && after.owners['pg-c']?.startsWith('pg-c__group:')
    && after.owners['pc1'] === 'pg-c:0,0' && sane.overlaps === 0
    && undone.tabs.join(',') === 'Filters,Alerts,Notes' && undone.born.length === 0 && undone.owners['pg-c'] === before.owners['pg-c'] && !undone.owners['pg-c__group'],
    `released back over its own container: tabs ${held.tabs.join('/')} pg-c ${held.owners['pg-c']} active ${held.active} (all unchanged — a drag is not a click) · then dragged the Notes TAB onto the board · chip ${JSON.stringify(mid)} · tabs ${before.tabs.join('/')} -> ${after.tabs.join('/')} · the page became its own group: pg-c__group ${after.owners['pg-c__group']} with tabs [${after.born.join(',')}], pg-c ${after.owners['pg-c']} carrying pc1 (${after.owners['pc1']}) · undo -> ${undone.tabs.join('/')} / ${undone.owners['pg-c']} / group ${undone.owners['pg-c__group'] ?? 'gone'} ${JSON.stringify(sane)}`);
}
{
  begin('L62-a-tall-tile-blocked-by-a-full-width-section-takes-the-nearest-row');
  await scrollTo('vert');
  const own = () => page.evaluate(() => { const walk = (ws, p) => { for (const w of ws) { if (w.id === 'v-in') return `${p}:${w.x},${w.y}`; if (w.widgets) { const r = walk(w.widgets, w.id); if (r) return r; } } return null; }; return walk(window.__lab.vert.handle.toJSON().views[0].widgets, 'BOARD'); });
  const before = await own();
  const src = await rect('vert', 'v-in');
  // aim at the tile just BELOW the wall: the dragged tile is 4 rows tall, so
  // centring it there puts its top rows across the locked section and every
  // column of that row is refused. Sliding sideways can never clear a wall
  // that spans the board — it has to take a neighbouring row.
  const b = await rect('vert', 'v-b');
  await drag(src.x + src.w / 2, src.y + src.h / 2, b.x + b.w / 2, b.y + b.h / 2, { steps: 16 });
  const after = await own();
  const sane = await sanity('vert');
  await shot('vert', 'landed-on-the-nearest-row');
  await undoAll('vert', 3);
  const undone = await own();
  const row = after ? Number(after.split(',').pop()) : -1;
  verdict(before === 'v-src:0,0' && after?.startsWith('BOARD:') && row >= 4 && row <= 7 && undone === before && sane.overlaps === 0,
    `a 4-row tile dropped where its rows cross a FULL-WIDTH locked section: ${before} -> ${after} (wanted row 6 — the nearest row that clears the wall, not row 12 at the bottom) · undo -> ${undone} ${JSON.stringify(sane)}`);
}
{
  begin('L63-a-tab-torn-out-of-a-full-height-panel-lands-under-the-pointer');
  await scrollTo('tear');
  const cells = () => page.evaluate(() => { const out = {}; const walk = (ws, p) => { for (const w of ws) { out[w.id] = { own: p, x: w.x, y: w.y, w: w.span, h: w.rows }; if (w.widgets) walk(w.widgets, w.id); } }; walk(window.__lab.tear.handle.toJSON().views[0].widgets, 'BOARD'); return out; });
  const before = await cells();
  const tab = await page.evaluate(() => document.querySelector('#cv-tear .axdb-tab[data-tab-id="te-p2"]').getBoundingClientRect().toJSON());
  const a = await rect('tear', 'te-a');
  // the panel is FULL HEIGHT and a locked wall spans the left column: the old
  // rule found exactly one legal cell for an 8-row page — below the wall, off
  // the bottom — and drew its placeholder there, out of sight
  const to = { x: a.x + a.w / 2, y: a.y + 30 };
  let ghost = null;
  await drag(tab.x + tab.width / 2, tab.y + tab.height / 2, to.x, to.y, { steps: 18, mid: async () => {
    ghost = await page.evaluate(() => { const p = document.querySelector('#cv-tear .axdb-ph'); const r = p?.getBoundingClientRect(); return r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null; });
    await shot('tear', 'placeholder-under-the-pointer');
  } });
  const after = await cells();
  const strip = await page.evaluate(() => [...document.querySelectorAll('#cv-tear .axdb-tabs[data-tabs-id="te-p2__group"] .axdb-tab')].map((t) => t.textContent));
  const born = await groupRect('tear', 'te-p2__group');
  const sane = await sanity('tear');
  await shot('tear', 'landed-as-a-one-tab-group-under-the-pointer');
  await undoAll('tear', 2);
  const undone = await cells();
  const nearPointer = ghost && Math.abs(ghost.y - to.y) <= 60 && ghost.x <= to.x && to.x <= ghost.x + ghost.w;
  const g = after['te-p2__group'];
  verdict(!!ghost && nearPointer && !!g && g.own === 'BOARD' && g.y <= 1 && g.h <= 6 && g.h >= 2 && after['te-p2']?.own === 'te-p2__group'
    && strip.join(',') === 'Alerts' && !!born && Math.abs(born.y - (ghost?.y ?? -1) + (await page.evaluate(() => document.getElementById('cv-tear').getBoundingClientRect().y))) <= 60
    && after['te-wall'].y >= before['te-wall'].y && sane.overlaps === 0
    && undone['te-p2']?.own === 'te-side' && !undone['te-p2__group'],
    `pointer at ${Math.round(to.x)},${Math.round(to.y)} · placeholder ${JSON.stringify(ghost)} (${nearPointer ? 'UNDER THE POINTER' : 'NOT under the pointer'}) · landed ${g ? `${g.own}:${g.x},${g.y} ${g.w}x${g.h} rows` : 'nowhere'} (wanted row ≤1, 2..6 rows — shrunk to the room above the wall, not the 8 it came with) · strip on the new group [${strip.join(',')}] · undo -> te-p2 in ${undone['te-p2']?.own} ${JSON.stringify(sane)}`);
}
{
  begin('L64-tearing-the-last-tab-out-closes-the-empty-container');
  await scrollTo('solo');
  const ids = () => page.evaluate(() => { const out = {}; const walk = (ws, p) => { for (const w of ws) { out[w.id] = p; if (w.widgets) walk(w.widgets, w.id); } }; walk(window.__lab.solo.handle.toJSON().views[0].widgets, 'BOARD'); return out; });
  const strips = () => page.evaluate(() => [...document.querySelectorAll('#cv-solo .axdb-tabs')].map((s) => `${s.getAttribute('data-tabs-id')}[${[...s.querySelectorAll('.axdb-tab')].map((t) => t.textContent).join(',')}]`));
  const before = await ids();
  const tab = await page.evaluate(() => document.querySelector('#cv-solo .axdb-tab[data-tab-id="so-p"]').getBoundingClientRect().toJSON());
  const a = await rect('solo', 'so-a');
  let ghost = null;
  await drag(tab.x + tab.width / 2, tab.y + tab.height / 2, a.x + a.w / 2, a.y + a.h - 20, { steps: 16, mid: async () => {
    ghost = await page.evaluate(() => { const p = document.querySelector('#cv-solo .axdb-ph'); const r = p?.getBoundingClientRect(); return r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null; });
    await shot('solo', 'placeholder-mid-drag');
  } });
  const after = await ids();
  const stripsAfter = await strips();
  const sane = await sanity('solo');
  // the strip element of the NEW group is where it painted: its top-left must be the placeholder's
  const bornStrip = await page.evaluate(() => { const e = document.querySelector('#cv-solo .axdb-tabs[data-tabs-id="so-p__group"]'); const r = e?.getBoundingClientRect(); return r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) } : null; });
  const landedWherePromised = !!ghost && !!bornStrip && Math.abs(ghost.x - bornStrip.x) <= 3 && Math.abs(ghost.y - bornStrip.y) <= 3 && Math.abs(ghost.w - bornStrip.w) <= 3;
  await shot('solo', 'empty-container-closed');
  await undoAll('solo', 2);
  const undone = await ids();
  const stripsUndone = await strips();
  await shot('solo', 'undo-reopened-it');
  verdict(before['so-p'] === 'so-tabs' && !after['so-tabs'] && after['so-p'] === 'so-p__group' && stripsAfter.join(' ') === 'so-p__group[Only]'
    && landedWherePromised
    && sane.overlaps === 0 && undone['so-tabs'] === 'BOARD' && undone['so-p'] === 'so-tabs' && !undone['so-p__group'] && stripsUndone.join(' ') === 'so-tabs[Only]',
    `dragged the ONLY tab out: so-tabs ${after['so-tabs'] ?? 'GONE'} (wanted gone), so-p in ${after['so-p']}, strips ${stripsAfter.join(' ')} · placeholder ${JSON.stringify(ghost)} vs the new group's strip ${JSON.stringify(bornStrip)} (${landedWherePromised ? 'landed where promised' : 'MOVED after the drop'}) · undo -> so-tabs ${undone['so-tabs']}, so-p in ${undone['so-p']}, strips ${stripsUndone.join(' ')} ${JSON.stringify(sane)}`);
}
{
  begin('L65-a-tab-dropped-onto-another-group-joins-it-where-the-strip-marks');
  await scrollTo('join');
  const strips = () => page.evaluate(() => { const o = {}; for (const s of document.querySelectorAll('#cv-join .axdb-tabs')) o[s.getAttribute('data-tabs-id')] = [...s.querySelectorAll('.axdb-tab')].map((t) => t.textContent); return o; });
  const owners = () => page.evaluate(() => { const out = {}; const walk = (ws, p) => { for (const w of ws) { out[w.id] = p; if (w.widgets) walk(w.widgets, w.id); } }; walk(window.__lab.join.handle.toJSON().views[0].widgets, 'BOARD'); return out; });
  const tabRect = (c, p) => page.evaluate(([c, p]) => document.querySelector(`#cv-join .axdb-tabs[data-tabs-id="${c}"] .axdb-tab[data-tab-id="${p}"]`).getBoundingClientRect().toJSON(), [c, p]);
  const before = await strips();
  // 1. the right group's NOTES tab, released on the left STRIP just before MARGIN
  const notes = await tabRect('j-right', 'jr-d');
  const margin = await tabRect('j-left', 'jl-b');
  let mid = null;
  await drag(notes.x + notes.width / 2, notes.y + notes.height / 2, margin.x + margin.width * 0.25, margin.y + margin.height / 2, { steps: 18, mid: async () => {
    mid = await page.evaluate(() => {
      const j = document.querySelector('#cv-join .axdb-join'); const jr = j?.getBoundingClientRect();
      const left = document.querySelector('#cv-join .axdb-slab[data-slab-id="j-left"]')?.getBoundingClientRect() ?? document.querySelector('#cv-join .axdb-tabs[data-tabs-id="j-left"]')?.getBoundingClientRect();
      return { overlay: jr ? { x: Math.round(jr.x), y: Math.round(jr.y), w: Math.round(jr.width) } : null, leftStrip: left ? { x: Math.round(left.x), y: Math.round(left.y), w: Math.round(left.width) } : null,
        marked: [...document.querySelectorAll('#cv-join .axdb-tab--drop-before')].map((t) => t.textContent), stripLit: !!document.querySelector('#cv-join .axdb-tabs[data-tabs-id="j-left"].axdb-tabs--drop'), ph: !!document.querySelector('#cv-join .axdb-ph'), chip: document.querySelector('.axdb-tab-chip')?.textContent ?? null };
    });
    await shot('join', 'held-over-the-left-strip-before-margin');
  } });
  const s1 = await strips(); const o1 = await owners();
  const active1 = await page.evaluate(() => window.__lab.join.handle.getActiveTab('j-left'));
  await shot('join', 'notes-joined-the-left-group');
  // 2. the right group's LAST tab, released on the left group's BODY: joins on the end, the empty right group closes
  const filters = await tabRect('j-right', 'jr-c');
  const leftBody = await page.evaluate(() => { const g = window.__lab.join.api.getModel().getGroup('j-left'); const cv = document.getElementById('cv-join').getBoundingClientRect(); return { x: cv.x + 8 + g.position.x + g.size.width / 2, y: cv.y + 8 + g.position.y + g.size.height * 0.6 }; });
  await drag(filters.x + filters.width / 2, filters.y + filters.height / 2, leftBody.x, leftBody.y, { steps: 18 });
  const s2 = await strips(); const o2 = await owners();
  const sane = await sanity('join');
  await shot('join', 'filters-joined-on-the-end-and-the-right-group-closed');
  await undoAll('join', 2);
  const s3 = await strips(); const o3 = await owners();
  await shot('join', 'undo-twice');
  const overlayOnLeft = !!mid?.overlay && !!mid?.leftStrip && Math.abs(mid.overlay.x - mid.leftStrip.x) <= 3 && Math.abs(mid.overlay.w - mid.leftStrip.w) <= 3;
  verdict(before['j-left'].join(',') === 'Sales,Margin' && before['j-right'].join(',') === 'Filters,Notes'
    && !!mid && mid.chip === 'Notes' && overlayOnLeft && mid.stripLit && mid.marked.join(',') === 'Margin' && mid.ph === false
    && s1['j-left'].join(',') === 'Sales,Notes,Margin' && s1['j-right'].join(',') === 'Filters' && active1 === 'jr-d' && o1['jr-d'] === 'j-left' && !o1['jr-d__group']
    && s2['j-left'].join(',') === 'Sales,Notes,Margin,Filters' && !s2['j-right'] && !o2['j-right'] && o2['jr-c'] === 'j-left' && sane.overlaps === 0
    && s3['j-left'].join(',') === 'Sales,Margin' && s3['j-right'].join(',') === 'Filters,Notes' && o3['jr-d'] === 'j-right',
    `held over the left strip before Margin: chip ${mid?.chip}, overlay on the left group ${overlayOnLeft}, strip lit ${mid?.stripLit}, mark before [${mid?.marked}], board placeholder ${mid?.ph} · dropped: left ${s1['j-left']?.join('/')} right ${s1['j-right']?.join('/')} active ${active1} (Notes joined the left group, no group of its own: ${!o1['jr-d__group']}) · then Filters onto the left BODY: left ${s2['j-left']?.join('/')}, right group ${o2['j-right'] ? 'still there' : 'closed'} · undo ×2: left ${s3['j-left']?.join('/')} right ${s3['j-right']?.join('/')} ${JSON.stringify(sane)}`);
}
{
  begin('L66-a-page-whose-last-widget-leaves-closes-and-an-emptied-group-with-it');
  await scrollTo('join');
  const strips = () => page.evaluate(() => { const o = {}; for (const s of document.querySelectorAll('#cv-join .axdb-tabs')) o[s.getAttribute('data-tabs-id')] = [...s.querySelectorAll('.axdb-tab')].map((t) => t.textContent); return o; });
  const own = (id) => page.evaluate((id) => { const walk = (ws, p) => { for (const w of ws) { if (w.id === id) return p; if (w.widgets) { const r = walk(w.widgets, w.id); if (r) return r; } } return null; }; return walk(window.__lab.join.handle.toJSON().views[0].widgets, 'BOARD'); }, id);
  const before = await strips();
  // the Sales page holds ONE widget: drag it out onto the board, below the groups
  const w = await rect('join', 'jw-a');
  const cv = await page.evaluate(() => document.getElementById('cv-join').getBoundingClientRect().toJSON());
  let mid = null;
  await drag(w.x + w.w / 2, w.y + w.h / 2, cv.x + cv.width / 2, cv.y + cv.height - 30, { steps: 16, mid: async () => { mid = await page.evaluate(() => !!document.querySelector('#cv-join .axdb-ph')); await shot('join', 'last-widget-leaving-its-page'); } });
  const after = await strips(); const ownAfter = await own('jw-a');
  await shot('join', 'the-emptied-page-closed');
  await undoAll('join', 2);
  const undone = await strips(); const ownUndone = await own('jw-a');
  verdict(before['j-left'].join(',') === 'Sales,Margin' && mid === true && after['j-left']?.join(',') === 'Margin' && ownAfter === 'BOARD'
    && undone['j-left'].join(',') === 'Sales,Margin' && ownUndone === 'jl-a',
    `Sales held one widget; dragged out (placeholder ${mid}): jw-a -> ${ownAfter}, left strip ${before['j-left'].join('/')} -> ${after['j-left']?.join('/')} (the emptied page closed) · undo -> ${undone['j-left'].join('/')}, jw-a in ${ownUndone}`);
  // …and on a ONE-page group, the group closes with its page
  await scrollTo('solo');
  const s0 = await page.evaluate(() => [...document.querySelectorAll('#cv-solo .axdb-tabs')].map((s) => s.getAttribute('data-tabs-id')));
  const sw = await rect('solo', 'so-in'); const sa = await rect('solo', 'so-a');
  await drag(sw.x + sw.w / 2, sw.y + sw.h / 2, sa.x + sa.w / 2, sa.y + sa.h - 20, { steps: 16 });
  const s1 = await page.evaluate(() => [...document.querySelectorAll('#cv-solo .axdb-tabs')].map((s) => s.getAttribute('data-tabs-id')));
  const g1 = await page.evaluate(() => !!window.__lab.solo.api.getModel().getGroup('so-tabs'));
  await shot('solo', 'group-closed-with-its-last-page');
  await undoAll('solo', 2);
  const s2 = await page.evaluate(() => [...document.querySelectorAll('#cv-solo .axdb-tabs')].map((s) => s.getAttribute('data-tabs-id')));
  verdict(s0.join(',') === 'so-tabs' && s1.length === 0 && g1 === false && s2.join(',') === 'so-tabs',
    `one-page group: its widget dragged out -> strips [${s1.join(',')}], group ${g1 ? 'STILL THERE' : 'closed'} · undo -> [${s2.join(',')}]`);
}
{
  begin('L67-a-widget-dropped-on-a-strip-becomes-a-new-tab-at-the-marked-slot');
  await scrollTo('tabs');
  const strip = (c) => page.evaluate((c) => [...document.querySelectorAll(`#cv-tabs .axdb-tabs[data-tabs-id="${c}"] .axdb-tab`)].map((t) => t.textContent), c);
  const own = (id) => page.evaluate((id) => { const walk = (ws, p) => { for (const w of ws) { if (w.id === id) return p; if (w.widgets) { const r = walk(w.widgets, w.id); if (r) return r; } } return null; }; return walk(window.__lab.tabs.handle.toJSON().views[0].widgets, 'BOARD'); }, id);
  const before = await strip('panel');
  const left = await rect('tabs', 't-left');
  const alerts = await page.evaluate(() => document.querySelector('#cv-tabs .axdb-tab[data-tab-id="pg-b"]').getBoundingClientRect().toJSON());
  let mid = null;
  // the board's LEFT chart, dropped on the strip just before ALERTS
  await drag(left.x + left.w / 2, left.y + left.h / 2, alerts.x + alerts.width * 0.25, alerts.y + alerts.height / 2, { steps: 18, mid: async () => {
    mid = await page.evaluate(() => ({ lit: !!document.querySelector('#cv-tabs .axdb-tabs[data-tabs-id="panel"].axdb-tabs--drop'), marked: [...document.querySelectorAll('#cv-tabs .axdb-tab--drop-before')].map((t) => t.textContent), ph: !!document.querySelector('#cv-tabs .axdb-ph') }));
    await shot('tabs', 'widget-held-over-the-strip');
  } });
  const after = await strip('panel'); const ownAfter = await own('t-left');
  const active = await page.evaluate(() => window.__lab.tabs.handle.getActiveTab('panel'));
  const shown = await rect('tabs', 't-left');
  const sane = await sanity('tabs');
  await shot('tabs', 'the-widget-became-a-tab');
  await undoAll('tabs', 2);
  const undone = await strip('panel'); const ownUndone = await own('t-left');
  verdict(before.join(',') === 'Filters,Alerts,Notes' && !!mid && mid.lit && mid.marked.join(',') === 'Alerts' && mid.ph === false
    && after.join(',') === 'Filters,Left,Alerts,Notes' && ownAfter === 't-left__page' && active === 't-left__page' && !!shown && shown.w > 300
    && sane.overlaps === 0 && undone.join(',') === 'Filters,Alerts,Notes' && ownUndone === 'BOARD',
    `held over the strip before Alerts: lit ${mid?.lit}, mark before [${mid?.marked}], board placeholder ${mid?.ph} · dropped: strip ${before.join('/')} -> ${after.join('/')}, t-left in ${ownAfter}, active ${active}, painted ${shown ? Math.round(shown.w) + 'px wide' : 'nowhere'} · undo -> ${undone.join('/')}, t-left in ${ownUndone} ${JSON.stringify(sane)}`);
}
{
  begin('L68-a-tab-reorders-along-its-own-strip');
  await scrollTo('tabs');
  const strip = () => page.evaluate(() => [...document.querySelectorAll('#cv-tabs .axdb-tabs[data-tabs-id="panel"] .axdb-tab')].map((t) => t.textContent));
  const before = await strip();
  const notes = await page.evaluate(() => document.querySelector('#cv-tabs .axdb-tab[data-tab-id="pg-c"]').getBoundingClientRect().toJSON());
  const filters = await page.evaluate(() => document.querySelector('#cv-tabs .axdb-tab[data-tab-id="pg-a"]').getBoundingClientRect().toJSON());
  let mid = null;
  await drag(notes.x + notes.width / 2, notes.y + notes.height / 2, filters.x + filters.width * 0.2, filters.y + filters.height / 2, { steps: 16, mid: async () => {
    mid = await page.evaluate(() => ({ marked: [...document.querySelectorAll('#cv-tabs .axdb-tab--drop-before')].map((t) => t.textContent), dimmed: !!document.querySelector('.axdb-tab-chip.axdb-out'), overlay: !!document.querySelector('#cv-tabs .axdb-join') }));
    await shot('tabs', 'notes-held-before-filters');
  } });
  const after = await strip();
  const saved = await page.evaluate(() => window.__lab.tabs.handle.toJSON().views[0].widgets.find((w) => w.id === 'panel').widgets.map((p) => p.id));
  await shot('tabs', 'reordered');
  await undoAll('tabs', 1);
  const undone = await strip();
  verdict(before.join(',') === 'Filters,Alerts,Notes' && !!mid && mid.marked.join(',') === 'Filters' && mid.dimmed === false && mid.overlay === false
    && after.join(',') === 'Notes,Filters,Alerts' && saved.join(',') === 'pg-c,pg-a,pg-b' && undone.join(',') === 'Filters,Alerts,Notes',
    `Notes held before Filters on its own strip: mark [${mid?.marked}], chip dimmed ${mid?.dimmed}, overlay ${mid?.overlay} · dropped: ${before.join('/')} -> ${after.join('/')}, toJSON order ${saved.join('/')} · undo -> ${undone.join('/')}`);
}
{
  begin('L69-a-section-moves-by-its-caption-and-a-tab-group-by-its-strip');
  await scrollTo('movesec');
  const cell = (id) => page.evaluate((id) => window.__lab.movesec.handle.widget(id)?.cell ?? null, id);
  const b0 = await cell('ms-b'); const s0 = await cell('ms-sec'); const in0 = await rect('movesec', 'ms-in');
  const band = await page.evaluate(() => document.querySelector('#cv-movesec .axdb-slab[data-slab-id="ms-sec"] > .axdb-slab-h').getBoundingClientRect().toJSON());
  const bRect = await rect('movesec', 'ms-b');
  // press the CAPTION BAND and carry the section down onto B
  await drag(band.x + band.width / 2, band.y + band.height / 2, band.x + band.width / 2, bRect.y + 30, { steps: 16, mid: async () => shot('movesec', 'section-held-by-its-caption') });
  const s1 = await cell('ms-sec'); const b1 = await cell('ms-b'); const in1 = await rect('movesec', 'ms-in');
  const sane = await sanity('movesec');
  await shot('movesec', 'section-moved-child-with-it');
  await undoAll('movesec', 1);
  const s2 = await cell('ms-sec'); const in2 = await rect('movesec', 'ms-in');
  verdict(!!s0 && s0.y === 0 && !!s1 && s1.y > 0 && s1.x === 0 && !!b1 && b1.y > b0.y && in1.y > in0.y + 20 && sane.overlaps === 0
    && !!s2 && s2.y === 0 && Math.abs(in2.y - in0.y) <= 2,
    `section by its caption: cell ${JSON.stringify(s0)} -> ${JSON.stringify(s1)}, its child moved ${Math.round(in0.y)} -> ${Math.round(in1.y)}, B pushed ${b0.y} -> ${b1?.y} · undo -> ${JSON.stringify(s2)}, child back at ${Math.round(in2.y)} ${JSON.stringify(sane)}`);
  // …and a TAB GROUP by its strip's empty space
  await scrollTo('tabs');
  const pc = (id) => page.evaluate((id) => window.__lab.tabs.handle.widget(id)?.cell ?? null, id);
  const p0 = await pc('panel');
  const strip = await page.evaluate(() => document.querySelector('#cv-tabs .axdb-tabs[data-tabs-id="panel"]').getBoundingClientRect().toJSON());
  const left = await rect('tabs', 't-left');
  await drag(strip.right - 30, strip.y + strip.height / 2, left.x + 40, left.y + left.h - 20, { steps: 16, mid: async () => shot('tabs', 'group-held-by-its-strip') });
  const p1 = await pc('panel');
  const strips1 = await page.evaluate(() => [...document.querySelectorAll('#cv-tabs .axdb-tabs[data-tabs-id="panel"] .axdb-tab')].map((t) => t.textContent));
  const sane2 = await sanity('tabs');
  await shot('tabs', 'group-moved');
  await undoAll('tabs', 1);
  const p2 = await pc('panel');
  verdict(!!p0 && !!p1 && (p1.x !== p0.x || p1.y !== p0.y) && strips1.join(',') === 'Filters,Alerts,Notes' && sane2.overlaps === 0 && !!p2 && p2.x === p0.x && p2.y === p0.y,
    `tab group by its strip's empty space: cell ${JSON.stringify(p0)} -> ${JSON.stringify(p1)} keeping its tabs [${strips1.join(',')}] · undo -> ${JSON.stringify(p2)} ${JSON.stringify(sane2)}`);
}
{
  begin('L70-a-tab-dropped-on-a-group-edge-splits-it-right-then-below');
  await scrollTo('join');
  const cell = (id) => page.evaluate((id) => window.__lab.join.handle.widget(id)?.cell ?? null, id);
  const strips = () => page.evaluate(() => { const o = {}; for (const s of document.querySelectorAll('#cv-join .axdb-tabs')) o[s.getAttribute('data-tabs-id')] = [...s.querySelectorAll('.axdb-tab')].map((t) => t.textContent); return o; });
  const gr = (id) => groupRect('join', id);
  const cv = await page.evaluate(() => document.getElementById('cv-join').getBoundingClientRect().toJSON());
  const l0 = await cell('j-left');
  // 1. Notes from the right group, released on the left group's RIGHT third
  let tab = await page.evaluate(() => document.querySelector('#cv-join .axdb-tab[data-tab-id="jr-d"]').getBoundingClientRect().toJSON());
  let left = await gr('j-left');
  const left0 = left; // the frame the FIRST drop was aimed at — `left` is re-read for the second
  let mid = null;
  await drag(tab.x + tab.width / 2, tab.y + tab.height / 2, cv.x + 8 + left.x + left.w * 0.9, cv.y + 8 + left.y + 30 + (left.h - 30) * 0.5, { steps: 18, mid: async () => {
    mid = await page.evaluate(() => { const j = document.querySelector('#cv-join .axdb-join'); const r = j?.getBoundingClientRect(); return { overlay: r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null, ph: !!document.querySelector('#cv-join .axdb-ph') }; });
    await shot('join', 'held-on-the-right-third');
  } });
  const l1 = await cell('j-left'); const n1 = await cell('jr-d__group'); const s1 = await strips();
  const sane1 = await sanity('join');
  await shot('join', 'split-right');
  // 2. Filters (the right group's last tab) released on the left group's BOTTOM third: stacked under it, the right group closes
  tab = await page.evaluate(() => document.querySelector('#cv-join .axdb-tab[data-tab-id="jr-c"]').getBoundingClientRect().toJSON());
  left = await gr('j-left');
  await drag(tab.x + tab.width / 2, tab.y + tab.height / 2, cv.x + 8 + left.x + left.w * 0.5, cv.y + 8 + left.y + 30 + (left.h - 30) * 0.92, { steps: 18, mid: async () => shot('join', 'held-on-the-bottom-third') });
  const l2 = await cell('j-left'); const n2 = await cell('jr-c__group'); const s2 = await strips();
  const sane2 = await sanity('join');
  await shot('join', 'split-below-and-the-right-group-closed');
  await undoAll('join', 2);
  const l3 = await cell('j-left'); const s3 = await strips();
  const halfW = l0 && l1 && n1 && l1.w + n1.w === l0.w && l1.x === l0.x && n1.x === l0.x + l1.w && l1.h === l0.h && n1.h === l0.h;
  const halfH = l1 && l2 && n2 && l2.h + n2.h === l1.h && l2.y === l1.y && n2.y === l1.y + l2.h && l2.w === l1.w && n2.w === l1.w;
  const overlayIsRightHalf = !!mid?.overlay && Math.abs(mid.overlay.x - (cv.x + left0.x + left0.w * 0.5)) <= left0.w * 0.12;
  verdict(!!l0 && halfW && s1['j-left'].join(',') === 'Sales,Margin' && s1['jr-d__group'].join(',') === 'Notes' && mid?.ph === false && overlayIsRightHalf && sane1.overlaps === 0
    && halfH && !s2['j-right'] && s2['jr-c__group'].join(',') === 'Filters' && sane2.overlaps === 0
    && !!l3 && l3.w === l0.w && l3.h === l0.h && s3['j-right'].join(',') === 'Filters,Notes',
    `right third: left ${JSON.stringify(l0)} -> ${JSON.stringify(l1)}, born ${JSON.stringify(n1)} (${halfW ? 'the two halves tile the old cell' : 'NOT halves'}), overlay on the right half ${overlayIsRightHalf}, no board placeholder ${mid?.ph === false} · bottom third: left -> ${JSON.stringify(l2)}, born ${JSON.stringify(n2)} (${halfH ? 'stacked under' : 'NOT stacked'}), right group ${s2['j-right'] ? 'still there' : 'closed'} · undo ×2 -> left ${JSON.stringify(l3)}, right ${s3['j-right']?.join('/')} ${JSON.stringify(sane2)}`);
}
{
  begin('L71-a-tab-dropped-on-the-board-edge-docks-there-pushing-the-sections');
  await scrollTo('tabs');
  const cell = (id) => page.evaluate((id) => window.__lab.tabs.handle.widget(id)?.cell ?? null, id);
  const cv = await page.evaluate(() => document.getElementById('cv-tabs').getBoundingClientRect().toJSON());
  const p0 = await cell('panel'); const t0 = await cell('t-left');
  const tab = await page.evaluate(() => document.querySelector('#cv-tabs .axdb-tab[data-tab-id="pg-c"]').getBoundingClientRect().toJSON());
  let mid = null;
  // the TOP band: within 20 px of the canvas's top edge
  await drag(tab.x + tab.width / 2, tab.y + tab.height / 2, cv.x + cv.width * 0.4, cv.y + 8 + 5, { steps: 18, mid: async () => {
    mid = await page.evaluate(() => { const j = document.querySelector('#cv-tabs .axdb-join'); const r = j?.getBoundingClientRect(); return r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null; });
    await shot('tabs', 'held-on-the-top-band');
  } });
  const born = await cell('pg-c__group'); const p1 = await cell('panel'); const t1 = await cell('t-left');
  const strips = await page.evaluate(() => { const o = {}; for (const s of document.querySelectorAll('#cv-tabs .axdb-tabs')) o[s.getAttribute('data-tabs-id')] = [...s.querySelectorAll('.axdb-tab')].map((t) => t.textContent); return o; });
  const sane = await sanity('tabs');
  await shot('tabs', 'docked-at-the-top');
  await undoAll('tabs', 1);
  const p2 = await cell('panel'); const t2 = await cell('t-left');
  const bandWide = !!mid && mid.w >= cv.width - 40;
  verdict(!!born && born.x === 0 && born.y === 0 && born.w === 12 && born.h >= 2 && !!p1 && p1.y === born.h && !!t1 && t1.y === born.h && strips['pg-c__group']?.join(',') === 'Notes' && strips['panel'].join(',') === 'Filters,Alerts' && bandWide && sane.overlaps === 0
    && !!p2 && p2.y === p0.y && !!t2 && t2.y === t0.y,
    `top band: born ${JSON.stringify(born)} (full width at row 0), the tab group pushed ${p0.y} -> ${p1?.y}, the chart pushed ${t0.y} -> ${t1?.y}, overlay ${JSON.stringify(mid)} · undo -> panel y ${p2?.y}, chart y ${t2?.y} ${JSON.stringify(sane)}`);
}
{
  begin('L72-deepest-target-wins-an-outer-tab-joins-an-inner-group-inside-its-own-container');
  await scrollTo('deep');
  await page.click('#cv-deep .axdb-tabs[data-tabs-id="dp"] .axdb-tab[data-tab-id="dp-nested"]'); await page.waitForTimeout(400);
  const strips = () => page.evaluate(() => { const o = {}; for (const s of document.querySelectorAll('#cv-deep .axdb-tabs')) o[s.getAttribute('data-tabs-id')] = [...s.querySelectorAll('.axdb-tab')].map((t) => t.textContent); return o; });
  const before = await strips();
  const tab = await page.evaluate(() => document.querySelector('#cv-deep .axdb-tab[data-tab-id="dp-grid"]').getBoundingClientRect().toJSON());
  const inner = await page.evaluate(() => document.querySelector('#cv-deep .axdb-tabs[data-tabs-id="dp-intabs"]').getBoundingClientRect().toJSON());
  let mid = null;
  await drag(tab.x + tab.width / 2, tab.y + tab.height / 2, inner.right - 30, inner.y + inner.height / 2, { steps: 18, mid: async () => {
    mid = await page.evaluate(() => ({ overlay: !!document.querySelector('#cv-deep .axdb-join'), lit: !!document.querySelector('#cv-deep .axdb-tabs[data-tabs-id="dp-intabs"].axdb-tabs--drop'), dimmed: !!document.querySelector('.axdb-tab-chip.axdb-out') }));
    await shot('deep', 'outer-tab-over-the-inner-strip');
  } });
  const after = await strips();
  const own = await page.evaluate(() => { const walk = (ws, p) => { for (const w of ws) { if (w.id === 'dp-grid') return p; if (w.widgets) { const r = walk(w.widgets, w.id); if (r) return r; } } return null; }; return walk(window.__lab.deep.handle.toJSON().views[0].widgets, 'BOARD'); });
  await shot('deep', 'joined-the-inner-group');
  await undoAll('deep', 1);
  const undone = await strips();
  verdict(before['dp'].join(',') === 'Grid page,Split page,Nested page' && before['dp-intabs'].join(',') === 'Inner A,Inner B'
    && !!mid && mid.lit && mid.dimmed === false && after['dp-intabs'].join(',') === 'Inner A,Inner B,Grid page' && after['dp'].join(',') === 'Split page,Nested page' && own === 'dp-intabs'
    && undone['dp'].join(',') === 'Grid page,Split page,Nested page' && undone['dp-intabs'].join(',') === 'Inner A,Inner B',
    `Grid page (outer) held over the INNER strip inside its own container: lit ${mid?.lit}, dimmed ${mid?.dimmed} · dropped: inner ${after['dp-intabs']?.join('/')}, outer ${after['dp']?.join('/')}, dp-grid in ${own} · undo -> outer ${undone['dp']?.join('/')}, inner ${undone['dp-intabs']?.join('/')}`);
}
{
  begin('L73-an-outside-widget-dropped-into-a-FULL-page-is-taken-the-page-squeezes-its-rows');
  await scrollTo('solo');
  const cell = (id) => page.evaluate((id) => window.__lab.solo.handle.widget(id)?.cell ?? null, id);
  const pathOf = () => page.evaluate(() => { const walk = (ws, path) => { for (const w of ws ?? []) { if (w.id === 'so-b') return [...path, w.id].join(' > '); const r = walk(w.widgets, [...path, w.id]); if (r) return r; } return null; }; return walk(window.__lab.solo.handle.toJSON().views[0].widgets, ['main']); });
  const b0 = await cell('so-b'); const in0 = await cell('so-in');
  const host = (id) => page.evaluate((id) => document.querySelector(`#cv-solo .grafloria-node-host[data-node-id="${id}"]`).getBoundingClientRect().toJSON(), id);
  const b = await host('so-b'); const inner = await host('so-in'); const tabs = await groupRect('solo', 'so-tabs'); const cv = await page.evaluate(() => document.getElementById('cv-solo').getBoundingClientRect().toJSON());
  let mid = null;
  // Onto Region... the page's only widget: the page must squeeze two rows in, not refuse with no sign of why
  await drag(b.x + b.width / 2, b.y + b.height / 2, inner.x + inner.width / 2, inner.y + inner.height / 2, { steps: 18, mid: async () => {
    mid = await page.evaluate(() => [...document.querySelectorAll('#cv-solo .axdb-ph')].map((p) => { const r = p.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; }));
    await shot('solo', 'held-over-the-full-page');
  } });
  const path1 = await pathOf(); const in1 = await cell('so-in'); const b1 = await cell('so-b');
  const sane = await sanity('solo');
  await shot('solo', 'taken-the-page-squeezed');
  await undoAll('solo', 1);
  const path2 = await pathOf(); const in2 = await cell('so-in'); const b2 = await cell('so-b');
  const phInPage = Array.isArray(mid) && mid.some((r) => r.x >= cv.x + tabs.x - 2 && r.x + r.w <= cv.x + tabs.x + tabs.w + 2 && r.y >= cv.y + tabs.y - 2 && r.h >= 20);
  verdict(path1 === 'main > so-tabs > so-p > so-b' && !!in1 && !!b1 && (in1.y > 0 || b1.y >= in1.y + in1.h) && Math.max(in1.y + in1.h, b1.y + b1.h) > 4 && phInPage && sane.overlaps === 0
    && path2 === 'main > so-b' && JSON.stringify(b2) === JSON.stringify(b0) && JSON.stringify(in2) === JSON.stringify(in0),
    `held: placeholder inside the page ${phInPage} ${JSON.stringify(mid)} · dropped: ${path1}, page widget ${JSON.stringify(in0)} -> ${JSON.stringify(in1)}, arrival ${JSON.stringify(b1)} (the 4-row page now reaches row ${Math.max(in1?.y + in1?.h || 0, b1?.y + b1?.h || 0)}) ${JSON.stringify(sane)} · undo -> ${path2}, ${JSON.stringify(b2)}`);
}
{
  begin('L74-the-own-strip-after-a-detour-reorders-and-the-camera-stays-put');
  await scrollTo('tabs');
  const strips = () => page.evaluate(() => [...document.querySelectorAll('#cv-tabs .axdb-tabs[data-tabs-id="panel"] .axdb-tab')].map((t) => t.textContent));
  const cam = () => page.evaluate(() => { const v = window.__lab.tabs.api.viewport?.getViewport?.(); return v ? Math.round(v.y) : 0; });
  const probe = () => page.evaluate(() => ({ mark: document.querySelector('#cv-tabs .axdb-tab--drop-before')?.getAttribute('data-tab-id') ?? (document.querySelector('#cv-tabs .axdb-tabs--drop-end') ? 'end' : null), lit: !!document.querySelector('#cv-tabs .axdb-tabs--drop'), dim: !!document.querySelector('.axdb-tab-chip.axdb-out'), join: !!document.querySelector('#cv-tabs .axdb-join') }));
  const s0 = await strips(); const cam0 = await cam();
  const tab = await page.evaluate(() => document.querySelector('#cv-tabs .axdb-tab[data-tab-id="pg-c"]').getBoundingClientRect().toJSON());
  const strip = await page.evaluate(() => document.querySelector('#cv-tabs .axdb-tabs[data-tabs-id="panel"]').getBoundingClientRect().toJSON());
  const body = await rect('tabs', 'pa1');
  let home = null, before = null, atEnd = null, cams = [];
  // Notes: over its own page body (home), back up before Filters, then the strip's end — the camera must not move an inch
  await page.mouse.move(tab.x + tab.width / 2, tab.y + tab.height / 2); await page.mouse.down(); await page.mouse.move(tab.x + tab.width / 2 - 8, tab.y + tab.height / 2 + 8);
  await page.mouse.move(body.x + body.w / 2, body.y + body.h / 2, { steps: 12 }); await page.waitForTimeout(350); home = await probe(); cams.push(await cam());
  await shot('tabs', 'over-its-own-body');
  await page.mouse.move(strip.x + 18, strip.y + strip.height / 2, { steps: 12 }); await page.waitForTimeout(350); before = await probe(); cams.push(await cam());
  await shot('tabs', 'back-on-the-strip-before-filters');
  await page.mouse.move(strip.x + strip.width - 24, strip.y + strip.height / 2, { steps: 12 }); await page.waitForTimeout(350); atEnd = await probe(); cams.push(await cam());
  await shot('tabs', 'the-strip-end');
  await page.mouse.up(); await page.waitForTimeout(700);
  const s1 = await strips(); const j1 = await page.evaluate(() => !!document.querySelector('#cv-tabs .axdb-join'));
  await shot('tabs', 'reordered-to-the-end');
  await undoAll('tabs', 1);
  const s2 = await strips();
  verdict(home?.dim === true && before?.mark === 'pg-a' && before?.lit === true && atEnd?.mark === 'end' && !atEnd?.join && cams.every((c) => c === cam0) && s1.join(',') === 'Filters,Alerts,Notes' && !j1 && s2.join(',') === s0.join(','),
    `home ${JSON.stringify(home)} · before Filters ${JSON.stringify(before)} · end ${JSON.stringify(atEnd)} · camera ${cam0} -> ${cams.join('/')} · dropped ${s1.join(',')} overlay-left ${j1} · undo ${s2.join(',')}`);
}
{
  begin('L75-a-tab-released-outside-the-canvas-lands-nothing');
  await scrollTo('tabs');
  const cv = await page.evaluate(() => document.getElementById('cv-tabs').getBoundingClientRect().toJSON());
  const tab = await page.evaluate(() => document.querySelector('#cv-tabs .axdb-tab[data-tab-id="pg-c"]').getBoundingClientRect().toJSON());
  const left = await rect('tabs', 't-left');
  const strips0 = await page.evaluate(() => [...document.querySelectorAll('#cv-tabs .axdb-tabs[data-tabs-id="panel"] .axdb-tab')].map((t) => t.textContent));
  let onBoard = null, off = null;
  await page.mouse.move(tab.x + tab.width / 2, tab.y + tab.height / 2); await page.mouse.down(); await page.mouse.move(tab.x + tab.width / 2 - 8, tab.y + tab.height / 2 + 8);
  await page.mouse.move(left.x + left.w / 2, left.y + left.h / 2, { steps: 12 }); await page.waitForTimeout(350);
  onBoard = await page.evaluate(() => ({ ph: !!document.querySelector('#cv-tabs .axdb-ph'), dim: !!document.querySelector('.axdb-tab-chip.axdb-out') }));
  await page.mouse.move(cv.x + cv.width * 0.3, cv.y + cv.height + 95, { steps: 12 }); await page.waitForTimeout(350); // below the canvas, past the 60 px grace
  off = await page.evaluate(() => ({ ph: !!document.querySelector('#cv-tabs .axdb-ph'), dim: !!document.querySelector('.axdb-tab-chip.axdb-out'), join: !!document.querySelector('#cv-tabs .axdb-join') }));
  await shot('tabs', 'held-above-the-canvas');
  await page.mouse.up(); await page.waitForTimeout(700);
  const born = await page.evaluate(() => window.__lab.tabs.handle.widget('pg-c__group')?.cell ?? null);
  const strips1 = await page.evaluate(() => [...document.querySelectorAll('#cv-tabs .axdb-tabs[data-tabs-id="panel"] .axdb-tab')].map((t) => t.textContent));
  const sane = await sanity('tabs');
  await shot('tabs', 'released-outside-nothing-landed');
  if (born) await undoAll('tabs', 1); // never leave a stray group behind for the scenarios after
  verdict(onBoard?.ph === true && !onBoard?.dim && off?.ph === false && off?.dim === true && !off?.join && born === null && strips1.join(',') === strips0.join(',') && sane.overlaps === 0,
    `on the board ${JSON.stringify(onBoard)} · outside ${JSON.stringify(off)} · released: group ${JSON.stringify(born)}, strip ${strips1.join(',')} ${JSON.stringify(sane)}`);
}
{
  begin('L76-side-and-bottom-docks-measure-the-board-as-it-was-and-leave-no-overlay');
  await scrollTo('tabs');
  const cv = await page.evaluate(() => document.getElementById('cv-tabs').getBoundingClientRect().toJSON());
  const tab = await page.evaluate(() => document.querySelector('#cv-tabs .axdb-tab[data-tab-id="pg-c"]').getBoundingClientRect().toJSON());
  const left = await rect('tabs', 't-left');
  const rowsPx = 4 * 60 + 3 * 10; // the tabs board: 4 rows of 60, 10 px gaps
  const overlay = () => page.evaluate(() => { const j = document.querySelector('#cv-tabs .axdb-join'); if (!j) return null; const r = j.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; });
  await page.mouse.move(tab.x + tab.width / 2, tab.y + tab.height / 2); await page.mouse.down(); await page.mouse.move(tab.x + tab.width / 2 - 8, tab.y + tab.height / 2 + 8);
  // park on the board first (the ghost enters and pushes), THEN the bands
  await page.mouse.move(left.x + left.w / 2, left.y + left.h / 2, { steps: 12 }); await page.waitForTimeout(350);
  await page.mouse.move(cv.x + 14, cv.y + cv.height * 0.45, { steps: 12 }); await page.waitForTimeout(400); const leftBand = await overlay();
  await shot('tabs', 'left-band-after-parking');
  await page.mouse.move(cv.x + cv.width * 0.4, cv.y + cv.height - 8, { steps: 12 }); await page.waitForTimeout(400); const bottomBand = await overlay();
  await shot('tabs', 'bottom-band-after-parking');
  await page.mouse.up(); await page.waitForTimeout(700);
  const born = await page.evaluate(() => window.__lab.tabs.handle.widget('pg-c__group')?.cell ?? null);
  const j1 = await overlay(); const sane = await sanity('tabs');
  await shot('tabs', 'docked-at-the-bottom');
  await undoAll('tabs', 1);
  const j2 = await overlay(); const panel = await page.evaluate(() => window.__lab.tabs.handle.widget('panel')?.cell ?? null);
  verdict(!!leftBand && leftBand.h <= rowsPx + 12 && leftBand.y >= cv.y && !!bottomBand && bottomBand.y <= cv.y + rowsPx + 30 && bottomBand.w >= cv.width - 40 && !!born && born.y === 4 && born.w === 12 && j1 === null && j2 === null && panel?.y === 0 && sane.overlaps === 0,
    `left band ${JSON.stringify(leftBand)} (board rows = ${rowsPx} px) · bottom band ${JSON.stringify(bottomBand)} · docked ${JSON.stringify(born)} overlay after ${JSON.stringify(j1)} · undo overlay ${JSON.stringify(j2)} panel y ${panel?.y} ${JSON.stringify(sane)}`);
}
{
  begin('L77-a-page-travels-at-most-half-the-board-tall-and-never-lands-out-of-sight');
  await scrollTo('tear');
  const cv = await page.evaluate(() => document.getElementById('cv-tear').getBoundingClientRect().toJSON());
  const tab = await page.evaluate(() => document.querySelector('#cv-tear .axdb-tab[data-tab-id="te-p1"]').getBoundingClientRect().toJSON());
  const a = await rect('tear', 'te-a'); const wall = await rect('tear', 'te-w1');
  const ph = () => page.evaluate(() => { const p = document.querySelector('#cv-tear .axdb-ph'); if (!p) return null; const r = p.getBoundingClientRect(); return { y: Math.round(r.y), h: Math.round(r.height) }; });
  const dim = () => page.evaluate(() => !!document.querySelector('.axdb-tab-chip.axdb-out'));
  await page.mouse.move(tab.x + tab.width / 2, tab.y + tab.height / 2); await page.mouse.down(); await page.mouse.move(tab.x + tab.width / 2 - 8, tab.y + tab.height / 2 + 8);
  await page.mouse.move(a.x + a.w / 2, a.y + a.h / 2, { steps: 12 }); await page.waitForTimeout(400); const overA = await ph(); const dimA = await dim();
  await shot('tear', 'over-A-half-the-board-tall');
  // over the locked wall: no cell there, the only room is below the canvas — the chip dims, nothing lands
  await page.mouse.move(wall.x + wall.w / 2, wall.y + wall.h / 2, { steps: 12 }); await page.waitForTimeout(400); const overWall = await ph(); const dimWall = await dim();
  await shot('tear', 'over-the-wall-dimmed');
  await page.mouse.up(); await page.waitForTimeout(700);
  const born = await page.evaluate(() => window.__lab.tear.handle.widget('te-p1__group')?.cell ?? null);
  const strips = await page.evaluate(() => [...document.querySelectorAll('#cv-tear .axdb-tabs[data-tabs-id="te-side"] .axdb-tab')].map((t) => t.textContent));
  const half = 4 * 50 + 3 * 10; // 8 rows of 50 → half = 4 rows
  verdict(!!overA && overA.h <= half + 12 && !dimA && dimWall === true && born === null && strips.join(',') === 'Filters,Alerts',
    `over A: ghost ${JSON.stringify(overA)} (half the board = ${half} px) dim ${dimA} · over the wall: ghost ${JSON.stringify(overWall)} dim ${dimWall} · released: group ${JSON.stringify(born)}, strip ${strips.join(',')}`);
}
{
  begin('L78-a-section-slides-along-its-row-and-shows-a-refused-cell');
  await scrollTo('deep');
  await page.click('#cv-deep .axdb-tabs[data-tabs-id="dp"] .axdb-tab[data-tab-id="dp-grid"]'); await page.waitForTimeout(300);
  const cell = (id) => page.evaluate((id) => window.__lab.deep.handle.widget(id)?.cell ?? null, id);
  const band = await page.evaluate(() => document.querySelector('#cv-deep .axdb-slab[data-slab-id="dp-out"] > .axdb-slab-h').getBoundingClientRect().toJSON());
  const dp = await groupRect('deep', 'dp'); const cvd = await page.evaluate(() => document.getElementById('cv-deep').getBoundingClientRect().toJSON());
  const s0 = await cell('dp-out');
  const refused = () => page.evaluate(() => !!document.querySelector('#cv-deep .axdb-ph--no'));
  // RIGHT onto the locked Deep tabs container: no legal cell on its row → the wanted cell is painted refused, the section stays
  await page.mouse.move(band.x + band.width / 2, band.y + band.height / 2); await page.mouse.down(); await page.mouse.move(band.x + band.width / 2 + 8, band.y + band.height / 2 + 4);
  await page.mouse.move(cvd.x + dp.x + dp.w * 0.5, band.y + band.height / 2, { steps: 14 }); await page.waitForTimeout(400);
  const r1 = await refused(); const s1 = await cell('dp-out');
  await shot('deep', 'section-onto-the-locked-container-refused');
  await page.mouse.up(); await page.waitForTimeout(600);
  const s2 = await cell('dp-out'); const r2 = await refused();
  // DOWN into free space: it moves
  const band2 = await page.evaluate(() => document.querySelector('#cv-deep .axdb-slab[data-slab-id="dp-out"] > .axdb-slab-h').getBoundingClientRect().toJSON());
  await drag(band2.x + band2.width / 2, band2.y + band2.height / 2, band2.x + band2.width / 2, band2.y + band2.height / 2 + 160, { steps: 14, mid: async () => shot('deep', 'section-carried-down') });
  const s3 = await cell('dp-out'); const sane = await sanity('deep');
  await shot('deep', 'section-moved-down');
  await undoAll('deep', 1);
  const s4 = await cell('dp-out');
  verdict(!!s0 && r1 === true && JSON.stringify(s1) === JSON.stringify(s0) && JSON.stringify(s2) === JSON.stringify(s0) && r2 === false && !!s3 && s3.y > s0.y && s3.x === 0 && sane.overlaps === 0 && JSON.stringify(s4) === JSON.stringify(s0),
    `onto the container: refused-marker ${r1}, cell ${JSON.stringify(s0)} -> ${JSON.stringify(s1)}, after release ${JSON.stringify(s2)} marker gone ${!r2} · down: ${JSON.stringify(s3)} ${JSON.stringify(sane)} · undo ${JSON.stringify(s4)}`);
}
{
  begin('L79-a-widget-out-of-an-inner-tab-page-keeps-its-gesture-and-leaves-no-placeholder');
  await scrollTo('deep');
  await page.click('#cv-deep .axdb-tabs[data-tabs-id="dp"] .axdb-tab[data-tab-id="dp-nested"]'); await page.waitForTimeout(400);
  const pathOf = (id) => page.evaluate((id) => { const walk = (ws, path) => { for (const w of ws ?? []) { if (w.id === id) return [...path, w.id].join(' > '); const r = walk(w.widgets, [...path, w.id]); if (r) return r; } return null; }; return walk(window.__lab.deep.handle.toJSON().views[0].widgets, ['main']); }, id);
  const ia = await rect('deep', 'dp-ia'); const i1 = await rect('deep', 'dp-i1'); const w1 = await rect('deep', 'dp-w1');
  const st = () => page.evaluate(() => ({ ghost: !!document.querySelector('#cv-deep .axdb-ghost[data-node-id="dp-ia"]'), ph: document.querySelectorAll('#cv-deep .axdb-ph').length, dim: !!document.querySelector('#cv-deep .axdb-ghost.axdb-out') }));
  await page.mouse.move(ia.x + ia.w / 2, ia.y + ia.h / 2); await page.mouse.down(); await page.mouse.move(ia.x + ia.w / 2 + 8, ia.y + ia.h / 2 + 8);
  await page.mouse.move(i1.x + i1.w / 2, i1.y + i1.h / 2, { steps: 12 }); await page.waitForTimeout(400); const overSection = await st();
  await shot('deep', 'IA-over-the-sibling-section-gesture-alive');
  await page.mouse.move(w1.x + w1.w / 2, w1.y + w1.h / 2, { steps: 12 }); await page.waitForTimeout(400); const overW1 = await st();
  await shot('deep', 'IA-over-W1-on-the-main-board');
  await page.mouse.up(); await page.waitForTimeout(700);
  const p1 = await pathOf('dp-ia'); const after = await st(); const sane = await sanity('deep');
  await shot('deep', 'IA-landed-on-the-main-board');
  await undoAll('deep', 1);
  const p2 = await pathOf('dp-ia'); const afterUndo = await st();
  verdict(overSection.ghost === true && overW1.ghost === true && overW1.ph === 1 && p1 === 'main > dp-ia' && after.ph === 0 && sane.overlaps === 0 && p2 === 'main > dp > dp-nested > dp-intabs > dp-ip1 > dp-ia' && afterUndo.ph === 0,
    `over the section ${JSON.stringify(overSection)} · over W1 ${JSON.stringify(overW1)} · dropped: ${p1} ${JSON.stringify(after)} ${JSON.stringify(sane)} · undo: ${p2} ${JSON.stringify(afterUndo)}`);
}
{
  begin('L80-an-inner-tab-torn-out-lands-on-the-main-board');
  await scrollTo('deep');
  await page.click('#cv-deep .axdb-tabs[data-tabs-id="dp"] .axdb-tab[data-tab-id="dp-nested"]'); await page.waitForTimeout(400);
  const pathOf = (id) => page.evaluate((id) => { const walk = (ws, path) => { for (const w of ws ?? []) { if (w.id === id) return [...path, w.id].join(' > '); const r = walk(w.widgets, [...path, w.id]); if (r) return r; } return null; }; return walk(window.__lab.deep.handle.toJSON().views[0].widgets, ['main']); }, id);
  const strips = () => page.evaluate(() => [...document.querySelectorAll('#cv-deep .axdb-tabs[data-tabs-id="dp-intabs"] .axdb-tab')].map((t) => t.textContent));
  const tab = await page.evaluate(() => document.querySelector('#cv-deep .axdb-tab[data-tab-id="dp-ip1"]').getBoundingClientRect().toJSON());
  const w1 = await rect('deep', 'dp-w1');
  let mid = null;
  await drag(tab.x + tab.width / 2, tab.y + tab.height / 2, w1.x + w1.w * 0.6, w1.y + w1.h * 0.4, { steps: 16, mid: async () => {
    mid = await page.evaluate(() => { const p = document.querySelector('#cv-deep .axdb-ph'); const cv = document.getElementById('cv-deep').getBoundingClientRect(); const r = p?.getBoundingClientRect(); return { ph: r ? { x: Math.round(r.x - cv.x), y: Math.round(r.y - cv.y), w: Math.round(r.width), h: Math.round(r.height) } : null, dim: !!document.querySelector('.axdb-tab-chip.axdb-out') }; });
    await shot('deep', 'inner-tab-held-over-the-main-board');
  } });
  const p1 = await pathOf('dp-ip1__group'); const s1 = await strips(); const born = await page.evaluate(() => window.__lab.deep.handle.widget('dp-ip1__group')?.cell ?? null); const sane = await sanity('deep');
  await shot('deep', 'inner-page-now-a-group-on-the-main-board');
  await undoAll('deep', 1);
  const p2 = await pathOf('dp-ip1__group'); const s2 = await strips();
  // row 0 holds W1+W2 across the six columns the page needs: the nearest room is under the Outside section
  verdict(!!mid?.ph && !mid.dim && p1 === 'main > dp-ip1__group' && s1.join(',') === 'Inner B' && !!born && born.x === 0 && born.y >= 0 && sane.overlaps === 0 && p2 === null && s2.join(',') === 'Inner A,Inner B',
    `held: ${JSON.stringify(mid)} · dropped: ${p1}, inner strip ${s1.join(',')}, cell ${JSON.stringify(born)} ${JSON.stringify(sane)} · undo: group ${p2}, strip ${s2.join(',')}`);
}
{
  begin('L81-a-section-pulled-up-by-its-top-edge-grows-by-the-rows-travelled');
  await scrollTo('movesec');
  const cell = (id) => page.evaluate((id) => window.__lab.movesec.handle.widget(id)?.cell ?? null, id);
  // move the section under B first so it has rows above it to grow into
  const band0 = await page.evaluate(() => document.querySelector('#cv-movesec .axdb-slab[data-slab-id="ms-sec"] > .axdb-slab-h').getBoundingClientRect().toJSON());
  const b = await rect('movesec', 'ms-b');
  await drag(band0.x + band0.width / 2, band0.y + band0.height / 2, band0.x + band0.width / 2, b.y + b.h + 40, { steps: 14 });
  const s0 = await cell('ms-sec');
  const band = await page.evaluate(() => document.querySelector('#cv-movesec .axdb-slab[data-slab-id="ms-sec"] > .axdb-slab-h').getBoundingClientRect().toJSON());
  // press the band's top 3 px (the north edge) and pull up ONE row (60 px rows, 10 px gaps)
  await page.mouse.move(band.x + band.width / 2, band.y + 3); await page.mouse.down(); await page.mouse.move(band.x + band.width / 2, band.y - 5);
  for (let i = 1; i <= 8; i++) { await page.mouse.move(band.x + band.width / 2, band.y + 3 - 9 * i); await page.waitForTimeout(40); }
  await page.waitForTimeout(350); const held = await cell('ms-sec');
  await shot('movesec', 'section-top-edge-pulled-up-one-row');
  await page.mouse.up(); await page.waitForTimeout(600);
  const s1 = await cell('ms-sec'); const sane = await sanity('movesec');
  await shot('movesec', 'section-one-row-taller-from-the-top');
  await undoAll('movesec', 2);
  const s2 = await cell('ms-sec');
  verdict(!!s0 && !!s1 && s1.h === s0.h + 1 && s1.y === s0.y - 1 && s1.w === s0.w && sane.overlaps === 0 && !!s2 && s2.y === 0 && s2.h === 2,
    `before ${JSON.stringify(s0)} · held ${JSON.stringify(held)} · after ${JSON.stringify(s1)} (one row taller, top one row higher) ${JSON.stringify(sane)} · undo ×2 ${JSON.stringify(s2)}`);
}
{
  begin('L53-a-caption-reserves-only-where-something-paints-it');
  await scrollTo('cap-split');
  const r = await page.evaluate(() => {
    const m = window.__lab['cap-split'].api.getModel();
    const out = [];
    for (const sid of ['sp-a', 'sp-b']) {
      const g = m.getGroup(sid);
      const kids = [...(g.members ?? [])].map((k) => m.getNode(k)).filter(Boolean);
      out.push({ id: sid, gap: Math.round(Math.min(...kids.map((k) => k.position.y)) - g.position.y), band: !!document.querySelector(`#cv-cap-split .axdb-slab[data-slab-id="${sid}"] > .axdb-slab-h`) });
    }
    return out;
  });
  const sane = await sanity('cap-split');
  await shot('cap-split', 'captions-on-a-split-board');
  verdict(r.every((x) => x.band === false && x.gap === 0) && sane.overlaps === 0 && sane.overflow === 0,
    `a split board paints no section chrome, so its captioned sections reserve nothing: ${r.map((x) => `${x.id} band=${x.band} gap=${x.gap}px`).join(' · ')} ${JSON.stringify(sane)}`);
}
{
  begin('L56-a-grid-resize-changes-only-the-tile-under-the-pointer');
  await scrollTo('strip');
  const ids = ['s-rev', 's-cust', 's-win', 's-nps'];
  const rowsOf = () => page.evaluate((ids) => { const b = window.__lab['strip'].handle.binderOf('kpis'); return ids.map((id) => b.cellOf(id).h); }, ids);
  const pxOf = () => page.evaluate((ids) => ids.map((id) => Math.round(document.querySelector(`#cv-strip .grafloria-node-host[data-node-id="${id}"]`).getBoundingClientRect().height)), ids);
  const bad = [];
  // TWO defects live here, and BOTH were distance-dependent — one pull length
  // would have missed either, so sweep several. (1) Pulling one tile by
  // 60-80 px used to grow its NEIGHBOURS a row and leave the dragged tile
  // behind. (2) Every full-height tile then grew together, so a grid resize
  // silently resized the widget next to the one you grabbed.
  const dragged = 1; // s-cust
  for (const dy of [40, 60, 70, 80, 90, 130]) {
    const before = await rowsOf();
    await pullBottom('strip', 's-cust', dy, { steps: 12 });
    const after = await rowsOf();
    const others = after.filter((_, i) => i !== dragged);
    const grew = after[dragged] > before[dragged];
    const othersHeld = others.every((r, i) => r === before.filter((_, j) => j !== dragged)[i]);
    // Below the half-row threshold nothing moves; above it, ONLY the dragged tile does.
    const ok = othersHeld && (dy >= 60 ? grew : true); // the half-row threshold depends on the row height
    if (!ok) bad.push(`+${dy}: rows ${before} -> ${after}`);
    if (dy === 70) await shot('strip', 'only-the-dragged-tile-grew');
    await undoAll('strip', 3);
    await page.waitForTimeout(150);
  }
  const sane = await sanity('strip');
  verdict(bad.length === 0 && sane.overlaps === 0,
    `six pull distances on a 4-tile strip · only the tile under the pointer changes rows: ${bad.length ? 'WRONG — ' + bad.join(' | ') : 'every distance correct'} ${JSON.stringify(sane)}`);
}
{
  begin('L55-a-widget-still-drags-INTO-a-captioned-section-and-lands-under-the-band');
  await scrollTo('cap-default');
  const before = await page.evaluate(() => ({
    members: [...(window.__lab['cap-default'].api.getModel().getGroup('sec-controls')?.members ?? [])].length,
    outside: !!window.__lab['cap-default'].api.getModel().getGroup('main')?.members?.has('sec-outside'),
  }));
  const b = await band('cap-default', 'sec-controls');
  const src = await rect('cap-default', 'ctl-caption');
  // drag the section's own first control DOWN inside the section, then check
  // nothing ever lands above the band
  await drag(src.x + src.w / 2, src.y + src.h / 2, src.x + src.w / 2, src.y + src.h / 2 + 120, { steps: 14 });
  const after = await page.evaluate(() => {
    const m = window.__lab['cap-default'].api.getModel();
    const g = m.getGroup('sec-controls');
    const tops = [...(g.members ?? [])].map((id) => document.querySelector(`#cv-cap-default .grafloria-node-host[data-node-id="${id}"]`)?.getBoundingClientRect().top).filter((t) => t != null);
    return { members: [...(g.members ?? [])].length, minTop: Math.min(...tops) };
  });
  const sane = await sanity('cap-default');
  await shot('cap-default', 'reordered-under-the-band');
  await undoAll('cap-default', 2);
  const restored = await page.evaluate(() => [...(window.__lab['cap-default'].api.getModel().getGroup('sec-controls')?.members ?? [])].length);
  verdict(after.members === before.members && after.minTop >= b.band.y + b.band.height - 0.5 && restored === before.members && sane.overlaps === 0,
    `moving a control inside a captioned section keeps ${after.members} members (was ${before.members}); the topmost child stays at ${Math.round(after.minTop)}, below the band's ${Math.round(b.band.y + b.band.height)}; undo restores ${restored} ${JSON.stringify(sane)}`);
}
{
  begin('L54-a-live-parent-layout-switch-takes-the-band-and-its-reserve-with-it');
  await scrollTo('cap-fit');
  const state = async () => ({
    band: await band('cap-fit', 'sec-controls'),
    gap: await page.evaluate(() => { const m = window.__lab['cap-fit'].api.getModel(); const g = m.getGroup('sec-controls'); const ys = [...(g.members ?? [])].map((k) => m.getNode(k)?.position.y).filter((y) => y != null); return Math.round(Math.min(...ys) - g.position.y); }),
  });
  const s0 = await state();
  await page.evaluate(() => window.__lab['cap-fit'].handle.setLayout('split')); await page.waitForTimeout(600);
  const s1 = await state();
  const sane1 = await sanity('cap-fit');
  await shot('cap-fit', 'parent-split-no-band-no-reserve');
  await page.evaluate(() => window.__lab['cap-fit'].handle.setLayout('grid')); await page.waitForTimeout(600);
  const s2 = await state();
  const sane2 = await sanity('cap-fit');
  await shot('cap-fit', 'parent-grid-band-and-reserve-back');
  verdict(!!s0.band && s0.gap >= 28 && s1.band === null && s1.gap === 0 && !!s2.band && s2.gap >= 28
    && sane1.overlaps === 0 && sane2.overlaps === 0,
    `grid: band=${!!s0.band} reserve=${s0.gap}px · split (no section chrome): band=${s1.band} reserve=${s1.gap}px ${JSON.stringify(sane1)} · grid again: band=${!!s2.band} reserve=${s2.gap}px ${JSON.stringify(sane2)}`);
}
{
  begin('L50-a-short-section-clamps-its-band-and-keeps-its-children');
  await scrollTo('cap-edge');
  const one = await band('cap-edge', 'one');
  const two = await band('cap-edge', 'two');
  const all = await band('cap-edge', 'all');
  const oneChild = await page.evaluate(() => document.querySelector('#cv-cap-edge .grafloria-node-host[data-node-id="o1"]').getBoundingClientRect().toJSON());
  const allText = await page.evaluate(() => { const t = document.querySelector('#cv-cap-edge .axdb-slab[data-slab-id="all"] .axdb-slab-h-text'); const cs = getComputedStyle(t); return { clipped: t.scrollWidth > t.clientWidth + 1, ellipsis: cs.textOverflow === 'ellipsis' && cs.whiteSpace === 'nowrap', title: t.getAttribute('title')?.slice(0, 20), right: t.getBoundingClientRect().right }; });
  const allActions = await page.evaluate(() => { const a = document.querySelector('#cv-cap-edge .axdb-slab[data-slab-id="all"] .axdb-slab-h-actions'); const r = a.getBoundingClientRect(); const br = a.parentElement.getBoundingClientRect(); return { left: r.left, bandRight: br.right, right: r.right }; });
  verdict(Math.round(one.band.height) === 16 && oneChild.height >= 16 && oneChild.top >= one.band.y + one.band.height - 0.5
    && Math.round(two.band.height) === 22 && Math.round(all.band.height) === 44
    && allText.clipped && allText.ellipsis && allText.title === 'Quarterly revenue by' && allText.right <= allActions.left + 0.5 && allActions.right <= allActions.bandRight + 0.5,
    `1-row 34 px section: band ${one.band?.height}px (clamped from 22) child ${Math.round(oneChild.height)}px at ${Math.round(oneChild.top)} · 2-row: ${two.band?.height}px · narrow-all: ${all.band?.height}px text clipped=${allText.clipped} ellipsis=${allText.ellipsis} tooltip="${allText.title}" ends ${Math.round(allText.right)} before actions ${Math.round(allActions.left)} which end ${Math.round(allActions.right)} inside ${Math.round(allActions.bandRight)}`);
}
{
  begin('L51-a-hover-caption-takes-no-pointer-until-it-shows-and-paints-opaque');
  await scrollTo('cap-styled');
  const read = () => page.evaluate(() => { const s = document.querySelector('#cv-cap-styled .axdb-slab[data-slab-id="st-c"]'); const b = s.querySelector(':scope > .axdb-slab-h'); const cs = getComputedStyle(b); return { hot: s.classList.contains('axdb-slab--hot'), op: cs.opacity, pe: cs.pointerEvents, alpha: cs.backgroundColor }; });
  const slabC = await page.evaluate(() => document.querySelector('#cv-cap-styled .axdb-slab[data-slab-id="st-c"]').getBoundingClientRect().toJSON());
  await page.mouse.move(5, 5); await page.waitForTimeout(200);
  const rest = await read();
  // a press where the hidden band sits reaches the CHILD, not the section
  await page.evaluate(() => window.__lab['cap-styled'].handle.selectWidget(undefined));
  await page.mouse.click(slabC.x + slabC.width / 2, slabC.y + 10); await page.waitForTimeout(300);
  const selUnder = await page.evaluate(() => window.__lab['cap-styled'].handle.getSelectedWidget());
  await page.mouse.move(slabC.x + slabC.width / 2, slabC.y + slabC.height - 12); await page.waitForTimeout(300);
  const shown = await read();
  await shot('cap-styled', 'hover-caption-opaque');
  await page.mouse.move(5, 5); await page.waitForTimeout(300);
  const gone = await read();
  const opaque = /^rgb\(/.test(shown.alpha); // rgb(), not rgba(… , .05)
  verdict(rest.op === '0' && rest.pe === 'none' && !rest.hot && selUnder === 'sc1'
    && shown.hot && shown.op === '1' && shown.pe === 'auto' && opaque && !gone.hot && gone.op === '0',
    `at rest: opacity ${rest.op} pointer-events ${rest.pe} · a press in the band's area selected ${selUnder} (the child, not the section) · pointer in the section: hot=${shown.hot} opacity ${shown.op} pe ${shown.pe} bg ${shown.alpha} opaque=${opaque} · pointer away: hot=${gone.hot} opacity ${gone.op}`);
}
{
  begin('L52-an-rtl-tab-mirrors-to-the-trailing-edge');
  await scrollTo('cap-rtl');
  const a = await band('cap-rtl', 'sec-controls');
  const inner = await childTop('cap-rtl', 'sec-controls');
  const sane = await sanity('cap-rtl');
  await shot('cap-rtl', 'rtl-tab-mirrored');
  verdict(a.band && a.cls.includes('--tab') && a.dir === 'rtl'
    && Math.abs((a.band.x + a.band.width) - (a.slab.x + a.slab.width)) < 1 && a.band.x > a.slab.x + 40
    && inner >= a.band.y + a.band.height - 0.5 && sane.overlaps === 0,
    `rtl tab: band ${Math.round(a.band?.x)}..${Math.round(a.band?.x + a.band?.width)} in slab ${Math.round(a.slab.x)}..${Math.round(a.slab.x + a.slab.width)} (hugs the right) · child top ${inner} vs band bottom ${Math.round(a.band?.y + a.band?.height)} ${JSON.stringify(sane)}`);
}
{
  begin('L43-alignment-typography-box-hover-and-design-captions');
  await scrollTo('cap-styled');
  const a = await band('cap-styled', 'st-a');
  const b = await band('cap-styled', 'st-b');
  const c0 = await band('cap-styled', 'st-c');
  const d0 = await band('cap-styled', 'st-d');
  const bTop = await childTop('cap-styled', 'st-b');
  const cTop = await childTop('cap-styled', 'st-c');
  const dTop0 = await childTop('cap-styled', 'st-d');
  await shot('cap-styled', 'styled-at-rest');
  // the pointer anywhere in the section shows the 'hover' band (the binder
  // marks the section — the overlay takes no pointer of its own)
  await page.mouse.move(c0.slab.x + c0.slab.width / 2, c0.slab.y + c0.slab.height - 12); await page.waitForTimeout(300);
  const c1 = await band('cap-styled', 'st-c');
  await shot('cap-styled', 'hover-caption-shown');
  await page.mouse.move(10, 10); await page.waitForTimeout(300);
  const c2 = await band('cap-styled', 'st-c');
  // static: the 'design' band leaves and its rows come back; the others stay
  await page.evaluate(() => window.__lab['cap-styled'].handle.setStatic(true)); await page.waitForTimeout(300);
  const d1 = await band('cap-styled', 'st-d');
  const dTop1 = await childTop('cap-styled', 'st-d');
  const a1 = await band('cap-styled', 'st-a');
  await shot('cap-styled', 'static-design-caption-gone');
  await page.evaluate(() => window.__lab['cap-styled'].handle.setStatic(false)); await page.waitForTimeout(300);
  const d2 = await band('cap-styled', 'st-d');
  const dTop2 = await childTop('cap-styled', 'st-d');
  const sane = await sanity('cap-styled');
  const centred = a.textRect && Math.abs((a.textRect.x + a.textRect.width / 2) - (a.band.x + a.band.width / 2)) < 3;
  const ended = b.textRect && Math.abs((b.textRect.x + b.textRect.width) - (b.band.x + b.band.width - 14)) < 3;
  verdict(centred && a.transform === 'uppercase' && a.fontWeight === '700' && a.fontSize === '11px' && a.bg === 'rgb(232, 236, 251)' && a.borderBottom === '1px'
    && ended && Math.round(b.band.height) === 40 && b.alignItems === 'flex-end' && b.textRect.y + b.textRect.height > b.band.y + b.band.height - 8 && b.fontSize === '15px' && /Georgia/.test(b.fontFamily) && b.color === 'rgb(124, 94, 0)' && Math.abs(b.band.y - b.slab.y - 4) < 1 && Math.abs(b.band.x - b.slab.x - 6) < 1 && bTop >= b.slab.y + 48 - 0.5
    && c0.opacity === 0 && Math.abs(cTop - c0.slab.y) < 1 && c1.opacity === 1 && c2.opacity === 0
    && d0.band && dTop0 >= d0.slab.y + 28 - 0.5 && d1.band === null && Math.abs(dTop1 - d1.slab.y) < 1 && a1.band && d2.band && dTop2 >= d2.slab.y + 28 - 0.5 && sane.overlaps === 0,
    `A centred=${centred} ${a.transform} ${a.fontWeight} ${a.fontSize} bg=${a.bg} border=${a.borderBottom} · B end=${ended} h=${b.band?.height} align=${b.alignItems} text bottom ${b.textRect?.y + b.textRect?.height} of band bottom ${b.band?.y + b.band?.height} font ${b.fontSize} ${b.fontFamily} ${b.color} margin dy=${b.band?.y - b.slab.y} dx=${b.band?.x - b.slab.x} child top ${bTop} vs ${b.slab.y + 48} · C hover op ${c0.opacity}→${c1.opacity}→${c2.opacity} child top ${cTop} slab ${c0.slab.y} · D design: band ${!!d0.band}/${!!d1.band}/${!!d2.band} child top ${dTop0}/${dTop1}/${dTop2} slab ${d0.slab.y} static-A band ${!!a1.band} ${JSON.stringify(sane)}`);
}
{
  begin('L44-renderCaption-paints-the-band-a-button-passes-through-a-badge-selects');
  await scrollTo('cap-custom');
  await page.evaluate(() => { window.__labClicks['cap-custom'] = 0; });
  const b = await band('cap-custom', 'sec-controls');
  const parts = await page.evaluate(() => { const h = document.querySelector('#cv-cap-custom .axdb-slab[data-slab-id="sec-controls"] > .axdb-slab-h'); return { brand: h.classList.contains('brand'), badge: h.querySelector('.cap-badge')?.getBoundingClientRect().toJSON(), btn: h.querySelector('.cap-btn')?.getBoundingClientRect().toJSON(), kitText: !!h.querySelector('.axdb-slab-h-text') }; });
  await page.mouse.click(parts.btn.x + parts.btn.width / 2, parts.btn.y + parts.btn.height / 2); await page.waitForTimeout(250);
  const clicks = await page.evaluate(() => window.__labClicks['cap-custom']);
  const sel1 = await page.evaluate(() => window.__lab['cap-custom'].handle.getSelectedWidget());
  await page.mouse.click(parts.badge.x + parts.badge.width / 2, parts.badge.y + parts.badge.height / 2); await page.waitForTimeout(250);
  const sel2 = await page.evaluate(() => window.__lab['cap-custom'].handle.getSelectedWidget());
  const b2 = await band('cap-custom', 'sec-controls');
  const top = await childTop('cap-custom', 'sec-controls');
  const sane = await sanity('cap-custom');
  await shot('cap-custom', 'custom-caption-selected');
  verdict(b.band && parts.brand && !parts.kitText && parts.badge && parts.btn && clicks === 1 && sel1 === undefined && sel2 === 'sec-controls' && b2.selected && top >= b.band.y + b.band.height - 0.5 && sane.overlaps === 0,
    `brand=${parts.brand} kit text=${parts.kitText} · button: clicks=${clicks} sel=${sel1} · badge: sel=${sel2} ring=${b2.selected} · child top ${top} vs band bottom ${b.band?.y + b.band?.height} ${JSON.stringify(sane)}`);
}
{
  begin('L45-rtl-captions-mirror');
  await scrollTo('cap-rtl');
  const a = await band('cap-rtl', 'sec-out'); // a plain string caption: no icon, no tab
  const b = await band('cap-rtl', 'sec-paid');
  await page.mouse.move(b.band.x + 30, b.band.y + 20); await page.waitForTimeout(300);
  const b1 = await band('cap-rtl', 'sec-paid');
  const sane = await sanity('cap-rtl');
  await shot('cap-rtl', 'rtl-captions');
  const textAtEnd = a.textRect && a.textRect.x + a.textRect.width > a.band.x + a.band.width - 14;
  const actionsAtStart = b1.actionsRect && b1.actionsRect.x < b1.band.x + 40 && b1.actionsRect.x < b1.textRect.x;
  verdict(a.dir === 'rtl' && textAtEnd && actionsAtStart && b1.actionsOp === 1 && sane.overlaps === 0,
    `dir=${a.dir} · text right edge ${a.textRect?.x + a.textRect?.width} of band right ${a.band?.x + a.band?.width} · actions x ${b1.actionsRect?.x} band x ${b1.band?.x} text x ${b1.textRect?.x} op=${b1.actionsOp} ${JSON.stringify(sane)}`);
}
{
  begin('L46-the-tight-tier-and-a-live-tier-switch-by-resize');
  await scrollTo('cap-tight');
  const t0 = await band('cap-tight', 'tight');
  const r0 = await band('cap-tight', 'roomy');
  const tTop0 = await childTop('cap-tight', 'tight');
  await shot('cap-tight', 'tight-and-roomy');
  // select the tight section by its band, pull its handle 3 rows down: it leaves the tight tier
  await page.mouse.click(t0.textRect.x + 4, t0.textRect.y + t0.textRect.height / 2); await page.waitForTimeout(250);
  const hnd = await page.evaluate(() => document.querySelector('#cv-cap-tight .axdb-slab[data-slab-id="tight"] > .axdb-rs').getBoundingClientRect().toJSON());
  await drag(hnd.x + 12, hnd.y + 12, hnd.x + 12, hnd.y + 12 + 132, { steps: 12 });
  const t1 = await band('cap-tight', 'tight');
  const tTop1 = await childTop('cap-tight', 'tight');
  const cell1 = await page.evaluate(() => window.__lab['cap-tight'].handle.widget('tight').cell);
  await shot('cap-tight', 'tight-grown-out-of-the-tier');
  await undoAll('cap-tight', 2);
  const t2 = await band('cap-tight', 'tight');
  const sane = await sanity('cap-tight');
  verdict(t0.band && Math.round(t0.band.height) === 22 && t0.cls.includes('--tight') && t0.subShown === false && t0.actionsShown === false && tTop0 >= t0.band.y + 22 - 0.5
    && r0.band && Math.round(r0.band.height) === 44 && r0.subShown === true && r0.actionsShown === true
    && cell1.h >= 4 && Math.round(t1.band.height) === 44 && !t1.cls.includes('--tight') && t1.subShown === true && tTop1 >= t1.band.y + 44 - 0.5
    && Math.round(t2.band.height) === 22 && sane.overlaps === 0,
    `tight: ${t0.band?.height}px sub=${t0.subShown} actions=${t0.actionsShown} child top ${tTop0} · roomy: ${r0.band?.height}px sub=${r0.subShown} · after +3 rows: cell h=${cell1.h} band ${t1.band?.height}px tight=${t1.cls?.includes('--tight')} child top ${tTop1} · undo: ${t2.band?.height}px ${JSON.stringify(sane)}`);
}
{
  begin('L47-nested-captions-setCaption-live-undo-and-persistence');
  await scrollTo('cap-nested');
  const o = await band('cap-nested', 'outer');
  const i0 = await band('cap-nested', 'inner');
  const kTop0 = await childTop('cap-nested', 'inner');
  const iTop = await childTop('cap-nested', 'outer');
  await shot('cap-nested', 'two-levels');
  const r1 = await page.evaluate(() => { const H = window.__lab['cap-nested'].handle; const ok = H.setCaption('inner', { text: 'Renamed', subtitle: 'live', align: 'center' }); return { ok, get: H.getCaption('inner'), json: H.toJSON().views[0].widgets[0].widgets.find((w) => w.id === 'inner').caption }; });
  await page.waitForTimeout(300);
  const i1 = await band('cap-nested', 'inner');
  const kTop1 = await childTop('cap-nested', 'inner');
  await shot('cap-nested', 'inner-renamed-live');
  await undoAll('cap-nested', 1);
  const i2 = await band('cap-nested', 'inner');
  const kTop2 = await childTop('cap-nested', 'inner');
  const r2 = await page.evaluate(() => window.__lab['cap-nested'].handle.getCaption('inner'));
  // the outer caption removed, then back by redo
  await page.evaluate(() => window.__lab['cap-nested'].handle.setCaption('outer', false)); await page.waitForTimeout(250);
  const o1 = await band('cap-nested', 'outer');
  const iTop1 = await childTop('cap-nested', 'outer');
  await page.evaluate(async () => { const cm = window.__lab['cap-nested'].api.getEngine().commandManager; await cm.undo(); }); await page.waitForTimeout(250);
  const o2 = await band('cap-nested', 'outer');
  // a layout switch of the inner section keeps its band
  await page.evaluate(() => window.__lab['cap-nested'].handle.setLayout('split', 'inner')); await page.waitForTimeout(300);
  const i3 = await band('cap-nested', 'inner');
  const kTop3 = await childTop('cap-nested', 'inner');
  await shot('cap-nested', 'inner-split-keeps-band');
  await page.evaluate(() => window.__lab['cap-nested'].handle.setLayout('grid', 'inner')); await page.waitForTimeout(300);
  const sane = await sanity('cap-nested');
  verdict(o.band && o.text === 'Outer section' && i0.band && i0.text === 'Inner' && i0.info === 'two levels down' && i0.slab.y >= o.band.y + 28 - 0.5 && kTop0 >= i0.band.y + 28 - 0.5 && Math.abs(iTop - (o.band.y + 28)) < 1
    && r1.ok && r1.get.text === 'Renamed' && r1.json.subtitle === 'live' && i1.text === 'Renamed' && Math.round(i1.band.height) === 44 && i1.justify === 'center' && kTop1 >= i1.band.y + 44 - 0.5
    && i2.text === 'Inner' && Math.round(i2.band.height) === 28 && kTop2 >= i2.band.y + 28 - 0.5 && r2.text === 'Inner'
    && o1.band === null && Math.abs(iTop1 - o1.slab.y) < 1 && o2.band
    && i3.band && i3.text === 'Inner' && kTop3 >= i3.band.y + 28 - 0.5 && sane.overlaps === 0,
    `outer "${o.text}" inner "${i0.text}" info="${i0.info}" inner slab y ${i0.slab.y} vs outer band bottom ${o.band?.y + 28} child top ${kTop0} · setCaption: ${JSON.stringify(r1)} band ${i1.band?.height}px justify=${i1.justify} child top ${kTop1} · undo: "${i2.text}" ${i2.band?.height}px get=${JSON.stringify(r2)} · outer off: band=${o1.band} child top ${iTop1} slab ${o1.slab.y} · undo: band=${!!o2.band} · split: "${i3.text}" child top ${kTop3} ${JSON.stringify(sane)}`);
}
{
  begin('L48-captions-on-a-fit-board-inner-and-section-resizes-stay-under-the-band');
  await scrollTo('cap-fit');
  const a0 = await band('cap-fit', 'sec-controls');
  const hs0 = await heights('cap-fit');
  const top0 = await childTop('cap-fit', 'sec-controls');
  const sane0 = await sanity('cap-fit');
  await shot('cap-fit', 'fit-captions-at-rest');
  // a. a full fit board has no row to give: a child shrinks (its bottom pulled up), still under the band
  await pullBottom('cap-fit', 'ctl-amount', -80, { steps: 10 });
  const hs1 = await heights('cap-fit');
  const top1 = await childTop('cap-fit', 'sec-controls');
  const a1 = await band('cap-fit', 'sec-controls');
  await shot('cap-fit', 'fit-child-shrunk-under-band');
  // b. the section by its band + handle: a column narrower; the band follows the frame
  await page.mouse.click(a1.textRect.x + 4, a1.textRect.y + a1.textRect.height / 2); await page.waitForTimeout(250);
  const hnd = await page.evaluate(() => document.querySelector('#cv-cap-fit .axdb-slab[data-slab-id="sec-controls"] > .axdb-rs').getBoundingClientRect().toJSON());
  const cellA = await page.evaluate(() => window.__lab['cap-fit'].handle.widget('sec-controls').cell);
  await drag(hnd.x + 12, hnd.y + 12, hnd.x + 12 - 115, hnd.y + 12, { steps: 12 });
  const cellB = await page.evaluate(() => window.__lab['cap-fit'].handle.widget('sec-controls').cell);
  const a2 = await band('cap-fit', 'sec-controls');
  const top2 = await childTop('cap-fit', 'sec-controls');
  const sane2 = await sanity('cap-fit');
  await shot('cap-fit', 'fit-section-narrower-band-follows');
  await undoAll('cap-fit', 3);
  const a3 = await band('cap-fit', 'sec-controls');
  const hs3 = await heights('cap-fit');
  const sane3 = await sanity('cap-fit');
  verdict(a0.band && Math.round(a0.band.height) === 28 && top0 >= a0.band.y + 28 - 0.5 && sane0.overlaps === 0 && sane0.overflow === 0
    && hs1['ctl-amount'] < hs0['ctl-amount'] - 40 && top1 >= a1.band.y + 28 - 0.5 && Math.abs(a1.band.height - 28) < 1
    && cellB.w === cellA.w - 1 && Math.abs(a2.band.width - a2.slab.width) < 1 && a2.band.width < a1.band.width - 40 && a2.selected && top2 >= a2.band.y + 28 - 0.5 && sane2.overlaps === 0
    && Math.abs(a3.band.width - a1.band.width) < 1 && hs3['ctl-amount'] === hs0['ctl-amount'] && sane3.overlaps === 0,
    `rest: band ${a0.band?.height}px child top ${top0} ${JSON.stringify(sane0)} · amount ${hs0['ctl-amount']}→${hs1['ctl-amount']} child top ${top1} vs ${a1.band?.y + 28} · section ${cellA.w}→${cellB.w} cols, band ${a1.band?.width}→${a2.band?.width} slab ${a2.slab.width} selected=${a2.selected} child top ${top2} ${JSON.stringify(sane2)} · undo band ${a3.band?.width} amount ${hs3['ctl-amount']} ${JSON.stringify(sane3)}`);
}

{
  begin('L82-on-a-SPLIT-board-a-tab-torn-out-becomes-a-PANE-at-the-edge-under-the-pointer');
  await scrollTo('sptabs');
  const state = () => page.evaluate(() => {
    const tabsOf = (id) => [...document.querySelectorAll(`#cv-sptabs .axdb-tabs[data-tabs-id="${id}"] .axdb-tab`)].map((t) => t.textContent);
    const leaves = (t) => (!t ? [] : t.id ? [t.id] : t.children.flatMap(leaves));
    const m = window.__lab.sptabs.api.getModel();
    const g = m.getGroup('st-a2__group');
    const w = m.getNode('st-w');
    return { a: tabsOf('st-a'), b: tabsOf('st-b'), born: tabsOf('st-a2__group'), bornX: g ? Math.round(g.position.x) : null, bornW: g ? Math.round(g.size.width) : null, wX: Math.round(w.position.x), wW: Math.round(w.size.width), leaves: leaves(window.__lab.sptabs.handle.toJSON().views[0].tree ?? null) };
  });
  const before = await state();
  const tab = await page.evaluate(() => document.querySelector('#cv-sptabs .axdb-tab[data-tab-id="st-a2"]').getBoundingClientRect().toJSON());
  const w = await rect('sptabs', 'st-w');
  const board = await page.evaluate(() => document.getElementById('cv-sptabs').getBoundingClientRect().toJSON());
  let mid = null;
  // 1. the MARGIN tab carried onto the widget's left edge, clear of the board's outer band: the page takes HALF THE WIDGET'S slot
  await drag(tab.x + tab.width / 2, tab.y + tab.height / 2, w.x + 40, w.y + w.h / 2, { steps: 16, mid: async () => {
    mid = await page.evaluate(() => { const ins = document.querySelector('#cv-sptabs .axdb-ins'); const r = ins?.getBoundingClientRect(); return { chip: document.querySelector('.axdb-tab-chip')?.textContent ?? null, out: document.querySelector('.axdb-tab-chip')?.classList.contains('axdb-out') ?? null, ins: r ? { x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height) } : null }; });
    await shot('sptabs', 'chip-and-insertion-line-at-the-widget-left-edge');
  } });
  const after = await state();
  const sane = await sanity('sptabs');
  await shot('sptabs', 'the-page-is-a-pane-taking-half-the-widget-slot');
  await undoAll('sptabs', 1);
  const undone = await state();
  const sane2 = await sanity('sptabs');
  // 2. the same tab carried into the board's OUTER band (18 px): the page takes a half of the WHOLE board — DevExpress's group edge, the widget drop's own rule
  let mid2 = null;
  await drag(tab.x + tab.width / 2, tab.y + tab.height / 2, w.x + 6, w.y + w.h / 2, { steps: 16, mid: async () => {
    mid2 = await page.evaluate(() => { const ins = document.querySelector('#cv-sptabs .axdb-ins'); const r = ins?.getBoundingClientRect(); return r ? { x: Math.round(r.x), h: Math.round(r.height) } : null; });
    await shot('sptabs', 'held-in-the-boards-outer-band');
  } });
  const after2 = await state();
  const sane3 = await sanity('sptabs');
  await shot('sptabs', 'the-page-took-half-the-whole-board');
  await undoAll('sptabs', 1);
  const undone2 = await state();
  const halfWidget = after.bornW !== null && after.bornW > before.wW * 0.4 && after.bornW < before.wW * 0.6;
  const halfBoard = after2.bornW !== null && after2.bornW > board.width * 0.4 && after2.bornW < board.width * 0.55;
  verdict(before.a.join(',') === 'Sales,Margin' && before.leaves.join(',') === 'st-w,st-a,st-b'
    && mid?.chip === 'Margin' && mid?.out === false && !!mid?.ins && mid.ins.w <= 6 && mid.ins.h > 100 && Math.abs(mid.ins.x - w.x) < 8
    && after.a.join(',') === 'Sales' && after.born.join(',') === 'Margin' && after.leaves.join(',') === 'st-a2__group,st-w,st-a,st-b'
    && after.bornX !== null && after.bornX < after.wX && halfWidget && sane.overlaps === 0 && sane.overflow === 0
    && undone.a.join(',') === 'Sales,Margin' && undone.born.length === 0 && undone.leaves.join(',') === 'st-w,st-a,st-b' && sane2.overlaps === 0
    && !!mid2 && mid2.h > 100 && after2.leaves.join(',') === 'st-a2__group,st-w,st-a,st-b' && halfBoard && sane3.overlaps === 0
    && undone2.a.join(',') === 'Sales,Margin' && undone2.leaves.join(',') === 'st-w,st-a,st-b',
    `rest: A ${before.a.join('/')} leaves ${before.leaves.join('/')} widget ${before.wW} px wide · held 40 px inside the widget's left edge: chip ${mid?.chip} dimmed ${mid?.out} insertion line ${JSON.stringify(mid?.ins)} (widget at x=${Math.round(w.x)}) · released: A ${after.a.join('/')}, born group ${after.born.join('/')} at x=${after.bornX}, ${after.bornW} px wide = half the widget's slot (${halfWidget}), left of the widget at ${after.wX}, leaves ${after.leaves.join('/')} ${JSON.stringify(sane)} · undo: A ${undone.a.join('/')} leaves ${undone.leaves.join('/')} · held 6 px inside the board's edge: line ${JSON.stringify(mid2)} → born ${after2.bornW} px wide of a ${Math.round(board.width)} px board = half the board (${halfBoard}), leaves ${after2.leaves.join('/')} ${JSON.stringify(sane3)} · undo: leaves ${undone2.leaves.join('/')}`);
}
{
  begin('L83-on-a-SPLIT-board-a-tab-REORDERS-along-its-own-strip-and-JOINS-another-group-over-its-body');
  await scrollTo('sptabs');
  const tabsOf = (id) => page.evaluate((id) => [...document.querySelectorAll(`#cv-sptabs .axdb-tabs[data-tabs-id="${id}"] .axdb-tab`)].map((t) => t.textContent), id);
  const leaves = () => page.evaluate(() => { const leaves = (t) => (!t ? [] : t.id ? [t.id] : t.children.flatMap(leaves)); return leaves(window.__lab.sptabs.handle.toJSON().views[0].tree ?? null); });
  const a0 = await tabsOf('st-a'); const b0 = await tabsOf('st-b'); const l0 = await leaves();
  // 1. REORDER: Margin dragged to the left of Sales along Group A's strip
  const t1 = await page.evaluate(() => document.querySelector('#cv-sptabs .axdb-tab[data-tab-id="st-a1"]').getBoundingClientRect().toJSON());
  const t2 = await page.evaluate(() => document.querySelector('#cv-sptabs .axdb-tab[data-tab-id="st-a2"]').getBoundingClientRect().toJSON());
  let held1 = null;
  await drag(t2.x + t2.width / 2, t2.y + t2.height / 2, t1.x + 4, t1.y + t1.height / 2, { steps: 12, mid: async () => {
    held1 = await page.evaluate(() => ({ chip: document.querySelector('.axdb-tab-chip')?.textContent ?? null, mark: !!document.querySelector('#cv-sptabs .axdb-tabs .axdb-tab-drop, #cv-sptabs .axdb-tabs .axdb-drop-mark, #cv-sptabs .axdb-tabs [data-drop]') }));
    await shot('sptabs', 'margin-held-before-sales-on-its-own-strip');
  } });
  const a1 = await tabsOf('st-a'); const l1 = await leaves();
  await shot('sptabs', 'reordered');
  // 2. JOIN: Group B's Notes tab released over the CENTRE of Group A's body
  const ga = await groupRect('sptabs', 'st-a');
  const cv = await page.evaluate(() => document.getElementById('cv-sptabs').getBoundingClientRect().toJSON());
  const tb = await page.evaluate(() => document.querySelector('#cv-sptabs .axdb-tab[data-tab-id="st-b2"]').getBoundingClientRect().toJSON());
  let held2 = null;
  await drag(tb.x + tb.width / 2, tb.y + tb.height / 2, cv.x + ga.x + ga.w / 2, cv.y + ga.y + 30 + (ga.h - 30) / 2, { steps: 16, mid: async () => {
    held2 = await page.evaluate(() => ({ chip: document.querySelector('.axdb-tab-chip')?.textContent ?? null, join: !!document.querySelector('#cv-sptabs .axdb-join'), ins: !!document.querySelector('#cv-sptabs .axdb-ins') }));
    await shot('sptabs', 'notes-held-over-group-a-body-centre');
  } });
  const a2 = await tabsOf('st-a'); const b2 = await tabsOf('st-b'); const l2 = await leaves();
  const sane = await sanity('sptabs');
  await shot('sptabs', 'notes-joined-group-a');
  await undoAll('sptabs', 2);
  const a3 = await tabsOf('st-a'); const b3 = await tabsOf('st-b'); const l3 = await leaves();
  verdict(a0.join(',') === 'Sales,Margin' && b0.join(',') === 'Filters,Notes' && l0.join(',') === 'st-w,st-a,st-b'
    && held1?.chip === 'Margin' && a1.join(',') === 'Margin,Sales' && l1.join(',') === l0.join(',')
    && held2?.chip === 'Notes' && held2?.join === true && held2?.ins === false
    && a2.join(',') === 'Margin,Sales,Notes' && b2.join(',') === 'Filters' && l2.join(',') === l0.join(',') && sane.overlaps === 0
    && a3.join(',') === 'Sales,Margin' && b3.join(',') === 'Filters,Notes' && l3.join(',') === l0.join(','),
    `rest A ${a0.join('/')} B ${b0.join('/')} · Margin carried before Sales: chip ${held1?.chip} → A ${a1.join('/')} (tree unchanged ${l1.join('/')}) · Notes held over A's body centre: chip ${held2?.chip} join overlay ${held2?.join} insertion line ${held2?.ins} → A ${a2.join('/')} B ${b2.join('/')} leaves ${l2.join('/')} ${JSON.stringify(sane)} · two undos: A ${a3.join('/')} B ${b3.join('/')}`);
}

{
  begin('L84-sizing-is-the-VIEW-s-a-tall-page-torn-out-after-setSizing-grow-stays-inside-its-pane');
  await scrollTo('sptabs');
  await page.evaluate(() => window.__lab.sptabs.handle.setSizing('grow')); await page.waitForTimeout(300);
  const before = await page.evaluate(() => { const m = window.__lab.sptabs.api.getModel(); const pg = m.getGroup('st-a2'); const k = m.getNode('st-ka2'); return { pageH: Math.round(pg.size.height), kH: Math.round(k.size.height), sizing: window.__lab.sptabs.handle.getSizing() }; });
  const tab = await page.evaluate(() => document.querySelector('#cv-sptabs .axdb-tab[data-tab-id="st-a2"]').getBoundingClientRect().toJSON());
  const w = await rect('sptabs', 'st-w');
  await drag(tab.x + tab.width / 2, tab.y + tab.height / 2, w.x + 40, w.y + w.h / 2, { steps: 16 });
  const geo = await page.evaluate(() => { const m = window.__lab.sptabs.api.getModel(); const g = m.getGroup('st-a2__group'); const k = m.getNode('st-ka2'); return g && k ? { gTop: Math.round(g.position.y), gBottom: Math.round(g.position.y + g.size.height), kTop: Math.round(k.position.y), kBottom: Math.round(k.position.y + k.size.height), gH: Math.round(g.size.height), kH: Math.round(k.size.height) } : null; });
  const host = await rect('sptabs', 'st-ka2');
  const cv = await page.evaluate(() => document.getElementById('cv-sptabs').getBoundingClientRect().toJSON());
  const sane = await sanity('sptabs');
  await shot('sptabs', 'tall-page-inside-its-pane-after-grow');
  await undoAll('sptabs', 1);
  await page.evaluate(() => window.__lab.sptabs.handle.setSizing('fit')); await page.waitForTimeout(200);
  const after = await page.evaluate(() => ({ sizing: window.__lab.sptabs.handle.getSizing(), born: !!window.__lab.sptabs.api.getModel().getGroup('st-a2__group') }));
  // a SPLIT view reports fit whatever it was asked (the board is always covered) — the point is the PAGE's binder was not switched
  verdict(before.kH <= before.pageH + 1
    && !!geo && geo.kBottom <= geo.gBottom + 1 && geo.kTop >= geo.gTop - 1 && geo.gH < 400
    && !!host && host.bottom <= cv.bottom + 1 && sane.overlaps === 0 && sane.overflow === 0
    && after.sizing === 'fit' && !after.born,
    `setSizing('grow') on the (split, always-fit: ${before.sizing}) view: the 12-row page still ${before.kH} px inside its ${before.pageH} px page · torn out at the widget's edge: page ${geo?.kTop}→${geo?.kBottom} inside its pane ${geo?.gTop}→${geo?.gBottom} (${geo?.gH} px tall, not the base 12 rows) · host bottom ${Math.round(host?.bottom ?? 0)} vs canvas ${Math.round(cv.bottom)} ${JSON.stringify(sane)} · undo + fit: ${after.sizing}, born ${after.born}`);
}

{
  begin('L85-torn-out-TWICE-a-page-leaving-the-group-born-from-it-lands-above-another-group');
  await scrollTo('tabs');
  const strips = () => page.evaluate(() => [...document.querySelectorAll('#cv-tabs .axdb-tabs')].map((s) => s.getAttribute('data-tabs-id') + ':' + [...s.querySelectorAll('.axdb-tab')].map((t) => t.textContent).join('/')));
  const cell = (id) => page.evaluate((id) => window.__lab.tabs.handle.widget(id)?.cell ?? null, id);
  const before = await strips();
  // 1. Notes out of the panel onto the left column (L61's move)
  const tab = await page.evaluate(() => document.querySelector('#cv-tabs .axdb-tab[data-tab-id="pg-c"]').getBoundingClientRect().toJSON());
  const left = await rect('tabs', 't-left');
  await drag(tab.x + tab.width / 2, tab.y + tab.height / 2, left.x + left.w / 2, left.y + left.h - 30, { steps: 16 });
  const mid = await strips(); const panel0 = await cell('panel');
  // 2. the SAME tab again, now from its own one-tab group, onto the TOP third of the panel it came from
  const tab2 = await page.evaluate(() => document.querySelector('#cv-tabs .axdb-tabs[data-tabs-id="pg-c__group"] .axdb-tab')?.getBoundingClientRect().toJSON() ?? null);
  const panelRect = await page.evaluate(() => { const s = document.querySelector('#cv-tabs .axdb-tabs[data-tabs-id="panel"]').getBoundingClientRect(); const g = window.__lab.tabs.api.getModel().getGroup('panel'); return { x: s.x, w: s.width, bodyTop: s.bottom, bodyH: g.size.height - s.height }; });
  let held = null;
  if (tab2) await drag(tab2.x + tab2.width / 2, tab2.y + tab2.height / 2, panelRect.x + panelRect.w / 2, panelRect.bodyTop + panelRect.bodyH * 0.12, { steps: 16, mid: async () => { held = await page.evaluate(() => ({ chip: document.querySelector('.axdb-tab-chip')?.textContent ?? null, overlay: !!document.querySelector('#cv-tabs .axdb-join') })); await shot('tabs', 'notes-held-above-the-panel-it-came-from'); } });
  const after = await strips(); const panel1 = await cell('panel');
  const born = after.map((s) => s.split(':')[0]).filter((id) => id !== 'panel');
  const bornCell = born.length === 1 ? await cell(born[0]) : null;
  const chipLeft = await page.evaluate(() => !!document.querySelector('.axdb-tab-chip'));
  const sane = await sanity('tabs');
  await shot('tabs', 'notes-is-a-fresh-group-above-the-panel');
  await undoAll('tabs', 2);
  const undone = await strips(); const panel2 = await cell('panel');
  verdict(before.join(' ') === 'panel:Filters/Alerts/Notes' && mid.join(' ') === 'panel:Filters/Alerts pg-c__group:Notes'
    && held?.chip === 'Notes' && held?.overlay === true
    && born.length === 1 && after.includes(`${born[0]}:Notes`) && after.includes('panel:Filters/Alerts')
    && !!panel0 && !!panel1 && !!bornCell && panel1.h < panel0.h && bornCell.y < panel1.y && bornCell.x === panel1.x && bornCell.w === panel1.w
    && !chipLeft && sane.overlaps === 0
    && undone.join(' ') === 'panel:Filters/Alerts/Notes' && !!panel2 && panel2.h === panel0.h && panel2.y === panel0.y,
    `rest ${before.join(' ')} · Notes torn out: ${mid.join(' ')} panel ${JSON.stringify(panel0)} · its only tab held over the panel's top third: chip ${held?.chip} overlay ${held?.overlay} · released: ${after.join(' ')} — born ${born.join('/')} at ${JSON.stringify(bornCell)} above panel ${JSON.stringify(panel1)}, chip left ${chipLeft} ${JSON.stringify(sane)} · two undos: ${undone.join(' ')} panel ${JSON.stringify(panel2)}`);
}

if (errs.length) verdict(false, `uncaught page errors: ${errs.join(' | ')}`);
} finally {
  await browser.close();
  server.close();
}

const pass = results.filter((r) => r.ok).length;
console.log(`\nkit lab: ${pass}/${results.length} pass · shots in ${OUT}`);
if (failures.length) { console.log('FAILURES:\n  ' + failures.join('\n  ')); process.exit(1); }
console.log('THE 0.4.12 SWITCHES, DRIVEN BY A REAL MOUSE AND LOOKED AT.');
