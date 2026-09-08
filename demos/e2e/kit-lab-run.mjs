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
  // Status spans all 14 rows of Paid business: pulling it past the section grows the section (the strip model)
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
  verdict(c1['sec-paid'].h > c0['sec-paid'].h && f1.h > f0.h + 60 && ch1.h > ch0.h + 60 && c2['sec-paid'].h === 14 && s.overlaps === 0,
    `paid rows ${c0['sec-paid'].h}→${c1['sec-paid'].h}→${c2['sec-paid'].h} · filter px ${Math.round(f0.h)}→${Math.round(f1.h)} chart px ${Math.round(ch0.h)}→${Math.round(ch1.h)} ${JSON.stringify(s)}`);
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
  begin('L31-kpi-strip-grows-as-a-row-and-comes-back');
  await scrollTo('strip');
  const cellsOf = () => page.evaluate(() => { const H = window.__lab.strip.handle; const b = H.binderOf('kpis'); return { slab: H.widget('kpis').cell.h, kpis: ['s-rev', 's-cust', 's-win', 's-nps'].map((id) => b.cellOf(id).h), trendY: H.widget('s-trend').cell.y }; });
  const c0 = await cellsOf(); const k0 = await rect('strip', 's-cust');
  const rs = await page.evaluate(() => document.querySelector('#cv-strip .grafloria-node-host[data-node-id="s-rev"] .axdb-rs').getBoundingClientRect().toJSON());
  await drag(rs.x + rs.width / 2, rs.y + rs.height / 2, rs.x + rs.width / 2, rs.y + rs.height / 2 + 75, { steps: 16, mid: async () => shot('strip', 'pull-mid') });
  const c1 = await cellsOf(); const k1 = await rect('strip', 's-cust');
  await shot('strip', 'row-grew-together');
  const rs2 = await page.evaluate(() => document.querySelector('#cv-strip .grafloria-node-host[data-node-id="s-rev"] .axdb-rs').getBoundingClientRect().toJSON());
  await drag(rs2.x + rs2.width / 2, rs2.y + rs2.height / 2, rs2.x + rs2.width / 2, rs2.y + rs2.height / 2 - 90, { steps: 16 });
  const c2 = await cellsOf();
  await shot('strip', 'row-back');
  const s = await sanity('strip');
  verdict(c0.slab === 1 && c1.slab === 2 && c1.kpis.every((h) => h === 2) && c1.trendY === c0.trendY + 1 && k1.h > k0.h + 40 && c2.slab === 1 && c2.kpis.every((h) => h === 1) && c2.trendY === c0.trendY && s.overlaps === 0,
    `slab ${c0.slab}→${c1.slab}→${c2.slab} · kpi rows ${c1.kpis}→${c2.kpis} · trend y ${c0.trendY}→${c1.trendY}→${c2.trendY} · sibling px ${Math.round(k0.h)}→${Math.round(k1.h)} ${JSON.stringify(s)}`);
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

if (errs.length) verdict(false, `uncaught page errors: ${errs.join(' | ')}`);
} finally {
  await browser.close();
  server.close();
}

const pass = results.filter((r) => r.ok).length;
console.log(`\nkit lab: ${pass}/${results.length} pass · shots in ${OUT}`);
if (failures.length) { console.log('FAILURES:\n  ' + failures.join('\n  ')); process.exit(1); }
console.log('THE 0.4.12 SWITCHES, DRIVEN BY A REAL MOUSE AND LOOKED AT.');
