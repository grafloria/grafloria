// DASHBOARD SCENARIO BATTERY — the agreed interaction model, driven for real.
//
// gallery-run proves the page's assert() passes; interaction-run proves generic
// gestures behave. NEITHER drives the specific dashboard model the user agreed
// on (the plan page + four review rounds) the way a hand does. This gate does:
// every scenario is a REAL pointer sequence on the live page, with the board
// state read back mid-gesture and after, and a SCREENSHOT captured at each
// stage — because two of the four defect reports ("not all the widget
// dragged", "design is destroyed") were VISIBLE truths that no functional
// assert was looking at.
//
// TWO PAGES since the flattening. dashboard-builder.html is now ONE flat
// 12-column grid per view (every widget a direct member, no nested section) —
// so the scenarios that exercise a bounded/nested strip moved to the page that
// still ships that construct, dashboard/grid-options.html. The behaviours are
// unchanged; only their address is. Scenarios tagged [OPTIONS] run there.
//
//   node demos/e2e/dashboard-scenarios-run.mjs             # run, shots to e2e/scenario-shots/
//   node demos/e2e/dashboard-scenarios-run.mjs --out DIR   # shots elsewhere
//
// Every scenario must pass. A scenario failure prints its geometry evidence.

import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, extname } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const argv = process.argv.slice(2);
const outIdx = argv.indexOf('--out');
const OUT = outIdx >= 0 ? argv[outIdx + 1] : join(here, 'scenario-shots');
mkdirSync(OUT, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml',
};
const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  try {
    const body = readFileSync(join(root, url === '/' ? 'index.html' : url));
    res.writeHead(200, { 'Content-Type': MIME[extname(url)] ?? 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, r));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
const results = [];
let scenario = null;
let step = 0;
const failures = [];

function begin(name) { scenario = name; step = 0; }
async function shot(page, label) {
  step++;
  await page.screenshot({ path: join(OUT, `${scenario}.${step}-${label}.png`) });
}
function verdict(ok, detail) {
  results.push({ scenario, ok, detail });
  if (!ok) failures.push(`${scenario}: ${detail}`);
  console.log(`${ok ? '✓' : '✗'} ${scenario}${ok ? '' : `   ${detail}`}`);
}

const DASH = '/dashboard/dashboard-builder.html';   // the plain, flat grid
const OPTS = '/dashboard/grid-options.html';        // the advanced constructs

async function freshPage(path = DASH) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`${origin}${path}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__demoReady === true, { timeout: 20000 });
  await page.waitForTimeout(500);
  page.__errs = errs;
  return page;
}

// -- board readers -----------------------------------------------------------
const host = (page, needle) => page.evaluate((needle) => {
  const h = [...document.querySelectorAll('.grafloria-node-host')]
    .find((x) => x.textContent.includes(needle) && x.getBoundingClientRect().x > -5000);
  if (!h) return null;
  const r = h.getBoundingClientRect();
  return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
}, needle);

/** On-screen hosts only; overlap count excludes a dragged ghost id by needle. */
const boardState = (page, excludeNeedle = null) => page.evaluate((excludeNeedle) => {
  const hosts = [...document.querySelectorAll('.grafloria-node-host')]
    .map((h) => ({ el: h, r: h.getBoundingClientRect(), t: h.textContent }))
    .filter((o) => o.r.x > -5000 && o.r.width > 4);
  const rects = hosts
    .filter((o) => !excludeNeedle || !o.t.includes(excludeNeedle))
    .map((o) => o.r);
  let overlaps = 0;
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], b = rects[j];
      if (a.x < b.x + b.width - 4 && b.x < a.x + a.width - 4 &&
          a.y < b.y + b.height - 4 && b.y < a.y + a.height - 4) overlaps++;
    }
  }
  return { count: hosts.length, overlaps };
}, excludeNeedle);

// Both pages carry the same toolbar affordances under their own id prefix
// (t- on the dashboard, o- on the options page) — resolve either.
const undoEnabled = (page) => page.evaluate(() => !document.querySelector('#t-undo, #o-undo').disabled);
const clickUndo = async (page) => { await page.evaluate(() => document.querySelector('#t-undo, #o-undo').click()); await page.waitForTimeout(500); };
const clickRemove = async (page) => { await page.evaluate(() => document.querySelector('#t-remove, #o-remove').click()); await page.waitForTimeout(600); };

/** The dashed placeholder's screen rect (null when hidden). */
const phRect = (page) => page.evaluate(() => {
  const p = document.querySelector('.axdb-ph');
  if (!p) return null;
  const r = p.getBoundingClientRect();
  return r.width > 6 ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null;
});

/** THE core invariant: after any drop, the tile sits where the placeholder
 *  last stood (±6px). Returns {ok, detail}. */
async function dragTo(page, needle, tx, ty, { steps = 12, settle = 600 } = {}) {
  const from = await host(page, needle);
  await page.mouse.move(from.x + from.w / 2, from.y + 12);
  await page.mouse.down();
  await page.mouse.move(tx, ty, { steps });
  await page.waitForTimeout(400);
  const ph = await phRect(page);
  await page.mouse.up();
  await page.waitForTimeout(settle);
  const after = await host(page, needle);
  if (!ph) return { ok: false, detail: 'no placeholder at release', after };
  const ok = after && Math.abs(after.x - ph.x) < 6 && Math.abs(after.y - ph.y) < 6 &&
             Math.abs(after.w - ph.w) < 6 && Math.abs(after.h - ph.h) < 6;
  return { ok, detail: ok ? 'landed-on-placeholder' : `tile=(${after?.x},${after?.y},${after?.w}x${after?.h}) ph=(${ph.x},${ph.y},${ph.w}x${ph.h})`, after };
}

async function resizeBy(page, needle, dx, dy, { settle = 600 } = {}) {
  const t = await host(page, needle);
  await page.mouse.click(t.x + t.w / 2, t.y + 10);
  await page.waitForTimeout(250);
  const rs = await resizeHandleOf(page, needle);
  if (!rs) return { ok: false, detail: 'no handle' };
  await page.mouse.move(rs.x, rs.y);
  await page.mouse.down();
  await page.mouse.move(rs.x + dx, rs.y + dy, { steps: 10 });
  await page.waitForTimeout(400);
  const ph = await phRect(page);
  await page.mouse.up();
  await page.waitForTimeout(settle);
  const after = await host(page, needle);
  if (!ph) return { ok: false, detail: 'no placeholder at release', after };
  const ok = after && Math.abs(after.x - ph.x) < 6 && Math.abs(after.y - ph.y) < 6 &&
             Math.abs(after.w - ph.w) < 6 && Math.abs(after.h - ph.h) < 6;
  return { ok, detail: ok ? 'landed-on-placeholder' : `tile=(${after?.x},${after?.y},${after?.w}x${after?.h}) ph=(${ph.x},${ph.y},${ph.w}x${ph.h})`, after };
}

const resizeHandleOf = (page, needle) => page.evaluate((needle) => {
  const h = [...document.querySelectorAll('.grafloria-node-host')]
    .find((x) => x.textContent.includes(needle) && x.getBoundingClientRect().x > -5000);
  const g = h && h.querySelector('[class*=axdb-rs],[class*=resize],[class*=handle]');
  if (!g) return null;
  const r = g.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}, needle);

// ============================================================================
try {

// ---- S1 · live push + placeholder BEFORE the drop --------------------------
{
  begin('s01-live-push-before-drop');
  const page = await freshPage();
  const line = await host(page, 'Revenue vs target');
  const donut0 = await host(page, 'Revenue by region');
  await shot(page, 'boot');
  await page.mouse.move(line.x + line.w / 2, line.y + 14);
  await page.mouse.down();
  await page.mouse.move(donut0.x + donut0.w * 0.7, donut0.y + 30, { steps: 14 });
  await page.waitForTimeout(450);
  const donutMid = await host(page, 'Revenue by region');
  const ph = await page.evaluate(() => {
    const p = document.querySelector('.axdb-ph');
    return p ? p.getBoundingClientRect().width > 10 : false;
  });
  await shot(page, 'mid-drag');
  await page.mouse.up();
  await page.waitForTimeout(600);
  await shot(page, 'dropped');
  const st = await boardState(page);
  verdict(
    (donutMid.x !== donut0.x || donutMid.y !== donut0.y) && ph && st.overlaps === 0,
    `neighbour moved mid-drag=${donutMid.x !== donut0.x || donutMid.y !== donut0.y} placeholder=${ph} overlaps=${st.overlaps}`
  );
  await page.close();
}

// ---- S2 · resize pushes live, shrink-back restores -------------------------
{
  begin('s02-resize-push-and-restore');
  const page = await freshPage();
  await page.mouse.click((await host(page, 'Revenue vs target')).x + 100, (await host(page, 'Revenue vs target')).y + 12);
  await page.waitForTimeout(300);
  const table0 = await host(page, 'Top reps');
  const rs = await resizeHandleOf(page, 'Revenue vs target');
  if (!rs) { verdict(false, 'no resize handle found'); await page.close(); }
  else {
    await shot(page, 'before');
    await page.mouse.move(rs.x, rs.y);
    await page.mouse.down();
    await page.mouse.move(rs.x, rs.y + 170, { steps: 10 });
    await page.waitForTimeout(400);
    const tableMid = await host(page, 'Top reps');
    await shot(page, 'grown');
    await page.mouse.move(rs.x, rs.y, { steps: 10 });
    await page.waitForTimeout(500);
    const tableBack = await host(page, 'Top reps');
    await shot(page, 'shrunk-back');
    await page.mouse.up();
    await page.waitForTimeout(400);
    const st = await boardState(page);
    verdict(
      tableMid.y > table0.y && Math.abs(tableBack.y - table0.y) < 5 && st.overlaps === 0,
      `pushed=${tableMid.y > table0.y} restored=${Math.abs(tableBack.y - table0.y) < 5} overlaps=${st.overlaps}`
    );
    await page.close();
  }
}

// ---- S3 · row swap both directions (big↔small) -----------------------------
{
  begin('s03-row-swap-both-directions');
  const page = await freshPage();
  const line0 = await host(page, 'Revenue vs target');
  const donut0 = await host(page, 'Revenue by region');
  // big onto small
  await page.mouse.move(line0.x + line0.w / 2, line0.y + 12);
  await page.mouse.down();
  await page.mouse.move(donut0.x + donut0.w * 0.7, donut0.y + 20, { steps: 12 });
  await page.waitForTimeout(400);
  await page.mouse.up();
  await page.waitForTimeout(600);
  const lineA = await host(page, 'Revenue vs target');
  const donutA = await host(page, 'Revenue by region');
  const firstSwap = donutA.x < lineA.x;
  await shot(page, 'after-big-onto-small');
  // small back onto big
  await page.mouse.move(donutA.x + donutA.w / 2, donutA.y + 12);
  await page.mouse.down();
  await page.mouse.move(lineA.x + lineA.w * 0.55, lineA.y + 20, { steps: 12 });
  await page.waitForTimeout(400);
  await page.mouse.up();
  await page.waitForTimeout(600);
  const lineB = await host(page, 'Revenue vs target');
  const donutB = await host(page, 'Revenue by region');
  await shot(page, 'after-small-onto-big');
  const st = await boardState(page);
  verdict(
    firstSwap && lineB.x < donutB.x && st.overlaps === 0,
    `big->small=${firstSwap} small->big=${lineB.x < donutB.x} overlaps=${st.overlaps}`
  );
  await page.close();
}

// ---- S4 · THE USER'S GESTURE: KPI dragged under the table lands there ------
// (Was a CROSSING while the KPI row was a nested section. On the flat grid it
//  is an ordinary in-board move — which is exactly the point of flattening.)
{
  begin('s04-kpi-under-table-lands');
  const page = await freshPage();
  const tr0 = await host(page, 'Total revenue');
  const table = await host(page, 'Top reps');
  await shot(page, 'boot');
  await page.mouse.move(tr0.x + tr0.w / 2, tr0.y + 14);
  await page.mouse.down();
  await page.mouse.move(table.x + table.w / 2, table.y + table.h + 40, { steps: 16 });
  await page.waitForTimeout(500);
  const trMid = await host(page, 'Total revenue');
  const ph = await phRect(page);          // the truthful drop preview
  await shot(page, 'mid-under-table');
  await page.mouse.up();
  await page.waitForTimeout(700);
  const trAfter = await host(page, 'Total revenue');
  const tableAfter = await host(page, 'Top reps');
  await shot(page, 'dropped');
  const st = await boardState(page);
  // Below the table it now IS (compare against where the table settled — the
  // board gained rows, so fit mode re-squeezed everything upward).
  const belowTable = !!trAfter && !!tableAfter && trAfter.y >= tableAfter.y + tableAfter.h - 4;
  const onPlaceholder = !!ph && Math.abs(trAfter.x - ph.x) < 6 && Math.abs(trAfter.y - ph.y) < 6;
  const ghostKeptItsSize = !!trMid && trMid.h > 60;   // the ghost tracks at full size
  const committed = await undoEnabled(page);
  // …and one undo brings it back to the top row
  await clickUndo(page);
  const trUndone = await host(page, 'Total revenue');
  await shot(page, 'after-undo');
  const backHome = trUndone && Math.abs(trUndone.x - tr0.x) < 5 && Math.abs(trUndone.y - tr0.y) < 5;
  verdict(
    belowTable && onPlaceholder && committed && !!backHome && st.overlaps === 0 && ghostKeptItsSize,
    `below-table=${belowTable} landed-on-placeholder=${onPlaceholder} committed=${committed} undo-restores=${!!backHome} overlaps=${st.overlaps} ghost-full-size=${ghostKeptItsSize}`
  );
  await page.close();
}

// ---- S5 [OPTIONS] · board tile dragged INTO the bounded section ------------
{
  begin('s05-tile-into-bounded-section');
  const page = await freshPage(OPTS);
  // The section is FULL (4 tiles, maxRows 1) — entry must be REFUSED, snap home.
  const share0 = await host(page, 'Share panel');
  const sB = await host(page, 'Strip B');
  await page.mouse.move(share0.x + share0.w / 2, share0.y + 12);
  await page.mouse.down();
  await page.mouse.move(sB.x + sB.w / 2, sB.y + sB.h / 2, { steps: 14 });
  await page.waitForTimeout(450);
  await shot(page, 'over-full-section');
  await page.mouse.up();
  await page.waitForTimeout(600);
  const shareA = await host(page, 'Share panel');
  const snapHome = Math.abs(shareA.x - share0.x) < 5 && Math.abs(shareA.y - share0.y) < 5;
  const noCommit = !(await undoEnabled(page));
  await shot(page, 'refused-snap-home');
  // Now make room: remove one strip tile, then the panel CAN cross in.
  await page.mouse.click(sB.x + sB.w / 2, sB.y + 12);
  await page.waitForTimeout(250);
  await clickRemove(page);
  const shareB0 = await host(page, 'Share panel');
  await page.mouse.move(shareB0.x + shareB0.w / 2, shareB0.y + 12);
  await page.mouse.down();
  const strip = await host(page, 'Strip A');
  await page.mouse.move(strip.x + strip.w + 80, strip.y + strip.h / 2, { steps: 14 });
  await page.waitForTimeout(450);
  await shot(page, 'entering-with-room');
  await page.mouse.up();
  await page.waitForTimeout(700);
  const shareB = await host(page, 'Share panel');
  const inStrip = shareB && Math.abs(shareB.y - strip.y) < 8; // same row as the strip tiles
  await shot(page, 'joined-section');
  const st = await boardState(page);
  verdict(
    snapHome && noCommit && !!inStrip && st.overlaps === 0,
    `full-section-refused=${snapHome} no-commit=${noCommit} joined-when-room=${!!inStrip} overlaps=${st.overlaps}`
  );
  await page.close();
}

// ---- S6 [OPTIONS] · width rules inside the bounded section -----------------
{
  begin('s06-section-resize-integrity');
  const page = await freshPage(OPTS);
  const tr = await host(page, 'Strip A');
  const nc0 = await host(page, 'Strip B');
  await page.mouse.click(tr.x + tr.w / 2, tr.y + 12);
  await page.waitForTimeout(300);
  const rs = await resizeHandleOf(page, 'Strip A');
  if (!rs) { verdict(false, 'no resize handle on the strip tile'); await page.close(); }
  else {
    await shot(page, 'before');
    // (HEIGHT growth is s21's contract: pulling past the section GROWS the
    //  section — all tiles together. This scenario owns the WIDTH rules.)
    // 1) WIDTH growth on a FULL 4/4 section must be REFUSED — there is nowhere
    //    for a sibling to go, and refusing IS the design staying intact.
    const rs2 = await resizeHandleOf(page, 'Strip A');
    await page.mouse.move(rs2.x, rs2.y);
    await page.mouse.down();
    await page.mouse.move(rs2.x + 180, rs2.y, { steps: 10 });
    await page.waitForTimeout(450);
    await shot(page, 'width-attempt-full-section');
    await page.mouse.up();
    await page.waitForTimeout(500);
    const ncFull = await host(page, 'Strip B');
    const fullRefused = Math.abs(ncFull.x - nc0.x) < 6 &&
      Math.abs((await host(page, 'Strip A')).w - tr.w) < 10;
    // 3) Make ROOM (remove the last strip tile), then width growth pushes the
    //    row sideways and shrink-back restores it.
    const wr = await host(page, 'Strip D');
    await page.mouse.click(wr.x + wr.w / 2, wr.y + 12);
    await page.waitForTimeout(250);
    await clickRemove(page);
    const nc1 = await host(page, 'Strip B');
    const rs3 = await resizeHandleOf(page, 'Strip A');
    await page.mouse.move(rs3.x, rs3.y);
    await page.mouse.down();
    await page.mouse.move(rs3.x + 200, rs3.y, { steps: 10 });
    await page.waitForTimeout(450);
    const ncPushed = await host(page, 'Strip B');
    await shot(page, 'width-grown-with-room');
    await page.mouse.move(rs3.x, rs3.y, { steps: 10 });
    await page.waitForTimeout(500);
    await page.mouse.up();
    await page.waitForTimeout(400);
    const ncBack = await host(page, 'Strip B');
    await shot(page, 'width-restored');
    const st = await boardState(page);
    const widthPushed = ncPushed.x > nc1.x + 20 && Math.abs(ncPushed.y - nc1.y) < 6; // slid RIGHT, same row
    const widthRestored = Math.abs(ncBack.x - nc1.x) < 6;
    verdict(
      fullRefused && widthPushed && widthRestored && st.overlaps === 0,
      `full-section-refused=${fullRefused} w-pushes-right=${widthPushed} w-restores=${widthRestored} overlaps=${st.overlaps}`
    );
    await page.close();
  }
}

// ---- S7 · pinned slab: tab tiles cannot land ON the strip's slab region ----
{
  begin('s07-esc-cancels-everything');
  const page = await freshPage();
  const line0 = await host(page, 'Revenue vs target');
  const donut0 = await host(page, 'Revenue by region');
  await page.mouse.move(line0.x + line0.w / 2, line0.y + 12);
  await page.mouse.down();
  await page.mouse.move(donut0.x + donut0.w * 0.7, donut0.y + 20, { steps: 12 });
  await page.waitForTimeout(400);
  await shot(page, 'mid-drag');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  const lineA = await host(page, 'Revenue vs target');
  const donutA = await host(page, 'Revenue by region');
  await shot(page, 'after-esc');
  const restored =
    Math.abs(lineA.x - line0.x) < 5 && Math.abs(lineA.y - line0.y) < 5 &&
    Math.abs(donutA.x - donut0.x) < 5 && Math.abs(donutA.y - donut0.y) < 5;
  const noCommit = !(await undoEnabled(page));
  verdict(restored && noCommit, `restored=${restored} no-commit=${noCommit}`);
  await page.close();
}

// ---- S8 · one undo per gesture --------------------------------------------
{
  begin('s08-one-undo-per-gesture');
  const page = await freshPage();
  const line0 = await host(page, 'Revenue vs target');
  const donut0 = await host(page, 'Revenue by region');
  await page.mouse.move(line0.x + line0.w / 2, line0.y + 12);
  await page.mouse.down();
  await page.mouse.move(donut0.x + donut0.w * 0.7, donut0.y + 20, { steps: 12 });
  await page.waitForTimeout(400);
  await page.mouse.up();
  await page.waitForTimeout(600);
  await clickUndo(page); // ONE undo
  const lineA = await host(page, 'Revenue vs target');
  const donutA = await host(page, 'Revenue by region');
  await shot(page, 'after-single-undo');
  const restored =
    Math.abs(lineA.x - line0.x) < 5 && Math.abs(donutA.x - donut0.x) < 5;
  const historyEmpty = !(await undoEnabled(page));
  verdict(restored && historyEmpty, `restored-by-ONE-undo=${restored} history-empty=${historyEmpty}`);
  await page.close();
}

// ---- S9 · fit vs grow sizing ----------------------------------------------
{
  begin('s09-fit-vs-grow');
  const page = await freshPage();
  const lineFit = await host(page, 'Revenue vs target');
  await shot(page, 'fit');
  await page.evaluate(() => document.getElementById('t-mode').click());
  await page.waitForTimeout(700);
  const lineGrow = await host(page, 'Revenue vs target');
  await shot(page, 'grow');
  const st = await boardState(page);
  // grow KEEPS the camera: 130px design rows render visibly taller on screen
  // (refitting would shrink the view back and make the modes identical).
  const taller = !!lineGrow && lineGrow.h > lineFit.h + 8;
  await page.evaluate(() => document.getElementById('t-mode').click());
  await page.waitForTimeout(700);
  const lineBack = await host(page, 'Revenue vs target');
  await shot(page, 'back-to-fit');
  const refit = !!lineBack && Math.abs(lineBack.h - lineFit.h) < 8;
  verdict(taller && refit && st.overlaps === 0,
    `grow-taller-on-screen=${taller} fit-refits=${refit} overlaps=${st.overlaps}`);
  await page.close();
}

// ---- S10 · drag-out removes (main board), undo restores --------------------
{
  begin('s10-drag-out-remove-undo');
  const page = await freshPage();
  const before = (await boardState(page)).count;
  const donut0 = await host(page, 'Revenue by region');
  await page.mouse.move(donut0.x + donut0.w / 2, donut0.y + 12);
  await page.mouse.down();
  await page.mouse.move(70, 420, { steps: 14 }); // over the palette = off-board
  await page.waitForTimeout(450);
  await shot(page, 'dimmed-outside');
  await page.mouse.up();
  await page.waitForTimeout(700);
  const afterRemove = (await boardState(page)).count;
  await shot(page, 'removed');
  await clickUndo(page);
  const afterUndo = (await boardState(page)).count;
  await shot(page, 'restored');
  // …and an ACCIDENTAL overshoot past the right frame edge must NOT delete:
  // deletion needs the palette (trash) — anywhere else snaps home. (Parity
  // review: the prototype clamps at its edges and cannot delete at all.)
  const line0 = await host(page, 'Revenue vs target');
  const canvasRight = await page.evaluate(() => document.querySelector('.grafloria-diagram-root').getBoundingClientRect().right);
  await page.mouse.move(line0.x + line0.w / 2, line0.y + 12);
  await page.mouse.down();
  await page.mouse.move(canvasRight - 8, line0.y + 12, { steps: 10 });
  await page.waitForTimeout(400);
  await page.mouse.up();
  await page.waitForTimeout(600);
  const lineA = await host(page, 'Revenue vs target');
  const survivedOvershoot = !!lineA;
  await shot(page, 'overshoot-snapped-home');
  verdict(
    afterRemove === before - 1 && afterUndo === before && survivedOvershoot,
    `removed-at-palette=${afterRemove === before - 1} undo-restored=${afterUndo === before} overshoot-survives=${survivedOvershoot}`
  );
  await page.close();
}

// ---- S11 · COMBOS on one tile: resize→move→resize→move ---------------------
{
  begin('s11-resize-move-combos');
  const page = await freshPage();
  const donut0 = await host(page, 'Revenue by region');
  const r1 = await resizeBy(page, 'Revenue by region', -120, 0);      // shrink width
  await shot(page, 'after-shrink');
  const line = await host(page, 'Revenue vs target');
  const m1 = await dragTo(page, 'Revenue by region', line.x + line.w * 0.6, line.y + 16); // move onto line → swap/push
  await shot(page, 'after-move');
  const r2 = await resizeBy(page, 'Revenue by region', 140, 60);       // grow both axes
  await shot(page, 'after-grow');
  const kpiRow = await host(page, 'New customers');
  const m2 = await dragTo(page, 'Revenue by region', kpiRow.x + 20, kpiRow.y + kpiRow.h + 200); // move again
  await shot(page, 'after-move2');
  const st = await boardState(page);
  verdict(r1.ok && m1.ok && r2.ok && m2.ok && st.overlaps === 0,
    `shrink=${r1.ok}(${r1.detail}) move=${m1.ok}(${m1.detail}) grow=${r2.ok}(${r2.detail}) move2=${m2.ok}(${m2.detail}) overlaps=${st.overlaps}`);
  await page.close();
}

// ---- S12 · other tabs: Sales swap + Pipeline drag/resize -------------------
{
  begin('s12-sales-and-pipeline-tabs');
  const page = await freshPage();
  await page.click('.db-tab[data-tab="sales"]');
  await page.waitForTimeout(700);
  const bar = await host(page, 'Revenue by region'); // bar chart on Sales
  const donut = await host(page, 'Region share');
  const m1 = await dragTo(page, 'Revenue by region', donut.x + donut.w * 0.6, donut.y + 16);
  await shot(page, 'sales-after-swap');
  const st1 = await boardState(page);
  await page.click('.db-tab[data-tab="pipeline"]');
  await page.waitForTimeout(700);
  const kpi = await host(page, 'Win rate');
  const funnel = await host(page, 'Conversion funnel');
  const m2 = await dragTo(page, 'Win rate', funnel.x + funnel.w * 0.6, funnel.y + funnel.h * 0.6);
  await shot(page, 'pipeline-after-drag');
  const r2 = await resizeBy(page, 'Pipeline by stage', 120, 80);
  await shot(page, 'pipeline-after-resize');
  const st2 = await boardState(page);
  verdict(m1.ok && m2.ok && r2.ok && st1.overlaps === 0 && st2.overlaps === 0,
    `sales-swap=${m1.ok}(${m1.detail}) pipeline-drag=${m2.ok}(${m2.detail}) pipeline-resize=${r2.ok}(${r2.detail}) overlaps=${st1.overlaps}/${st2.overlaps}`);
  await page.close();
}

// ---- S13 · gestures IN GROW MODE ------------------------------------------
{
  begin('s13-gestures-in-grow-mode');
  const page = await freshPage();
  await page.evaluate(() => document.getElementById('t-mode').click());
  await page.waitForTimeout(700);
  const donut = await host(page, 'Revenue by region');
  const line = await host(page, 'Revenue vs target');
  const m = await dragTo(page, 'Revenue vs target', donut.x + donut.w * 0.7, donut.y + 20);
  await shot(page, 'grow-after-swap');
  // (resize a MID-board tile: in grow mode the table's corner sits near the
  // canvas fold, and crossing the canvas edge triggers the binder's
  // leave-commit - a real behaviour, but not what this scenario measures)
  const r = await resizeBy(page, 'Revenue by region', 60, 70);
  await shot(page, 'grow-after-resize');
  const st = await boardState(page);
  verdict(m.ok && r.ok && st.overlaps === 0,
    `grow-swap=${m.ok}(${m.detail}) grow-resize=${r.ok}(${r.detail}) overlaps=${st.overlaps}`);
  await page.close();
}

// ---- S14 · gestures UNDER A DIFFERENT ZOOM --------------------------------
{
  begin('s14-gestures-under-zoom');
  const page = await freshPage();
  const c = await host(page, 'Revenue vs target');
  await page.mouse.move(c.x + c.w / 2, c.y + c.h / 2);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, 240); // zoom OUT
  await page.keyboard.up('Control');
  await page.waitForTimeout(500);
  const donut = await host(page, 'Revenue by region');
  const m = await dragTo(page, 'Revenue vs target', donut.x + donut.w * 0.7, donut.y + 14);
  await shot(page, 'zoomed-after-swap');
  const r = await resizeBy(page, 'Revenue vs target', 90, 50);
  await shot(page, 'zoomed-after-resize');
  const st = await boardState(page);
  verdict(m.ok && r.ok && st.overlaps === 0,
    `zoom-swap=${m.ok}(${m.detail}) zoom-resize=${r.ok}(${r.detail}) overlaps=${st.overlaps}`);
  await page.close();
}

// ---- S15 · grab POINT variations: corner grab + fast flick ----------------
{
  begin('s15-grab-corner-and-flick');
  const page = await freshPage();
  const line0 = await host(page, 'Revenue vs target');
  const donut0 = await host(page, 'Revenue by region');
  // grab near the BOTTOM-LEFT corner (not the header), drop on the donut
  await page.mouse.move(line0.x + 14, line0.y + line0.h - 14);
  await page.mouse.down();
  await page.mouse.move(donut0.x + donut0.w * 0.75, donut0.y + donut0.h - 20, { steps: 12 });
  await page.waitForTimeout(400);
  const ph1 = await phRect(page);
  await page.mouse.up();
  await page.waitForTimeout(600);
  const lineA = await host(page, 'Revenue vs target');
  const cornerOk = ph1 && lineA && Math.abs(lineA.x - ph1.x) < 6 && Math.abs(lineA.y - ph1.y) < 6;
  await shot(page, 'corner-grab-drop');
  // FAST FLICK: 3 huge steps back across the board
  const donutA = await host(page, 'Revenue by region');
  await page.mouse.move(lineA.x + lineA.w / 2, lineA.y + 12);
  await page.mouse.down();
  await page.mouse.move(donutA.x + donutA.w / 2, donutA.y + 16, { steps: 3 });
  await page.waitForTimeout(350);
  const ph2 = await phRect(page);
  await page.mouse.up();
  await page.waitForTimeout(600);
  const lineB = await host(page, 'Revenue vs target');
  const flickOk = ph2 && lineB && Math.abs(lineB.x - ph2.x) < 6 && Math.abs(lineB.y - ph2.y) < 6;
  await shot(page, 'flick-drop');
  const st = await boardState(page);
  verdict(!!cornerOk && !!flickOk && st.overlaps === 0,
    `corner-grab=${!!cornerOk} flick=${!!flickOk} overlaps=${st.overlaps}`);
  await page.close();
}

// ---- S16 · add a widget, then immediately drag + resize it -----------------
{
  begin('s16-add-then-manipulate');
  const page = await freshPage();
  await page.evaluate(() => document.querySelector('.pal-item[data-add="bar"]').click());
  await page.waitForTimeout(800);
  const added = await host(page, 'Revenue by region'); // the new bar chart shares the title
  const kpi = await host(page, 'Total revenue');
  const m = await dragTo(page, 'Revenue by region', kpi.x + 30, kpi.y + kpi.h + 120);
  await shot(page, 'added-then-moved');
  const r = await resizeBy(page, 'Top reps', 0, -60); // shrink the table
  await shot(page, 'then-shrunk-table');
  const st = await boardState(page);
  verdict(!!added && m.ok && r.ok && st.overlaps === 0,
    `added=${!!added} moved=${m.ok}(${m.detail}) shrunk=${r.ok}(${r.detail}) overlaps=${st.overlaps}`);
  await page.close();
}

// ---- S17 · undo/redo interleave across different gestures ------------------
{
  begin('s17-undo-redo-interleave');
  const page = await freshPage();
  const line0 = await host(page, 'Revenue vs target');
  const donut0 = await host(page, 'Revenue by region');
  await dragTo(page, 'Revenue vs target', donut0.x + donut0.w * 0.7, donut0.y + 16); // gesture 1: swap
  const r = await resizeBy(page, 'Top reps', 0, 90);                                  // gesture 2: resize
  await clickUndo(page);                                                              // undo resize
  await clickUndo(page);                                                              // undo swap
  const lineU = await host(page, 'Revenue vs target');
  const donutU = await host(page, 'Revenue by region');
  const undone = Math.abs(lineU.x - line0.x) < 5 && Math.abs(lineU.y - line0.y) < 5 &&
                 Math.abs(donutU.x - donut0.x) < 5 && Math.abs(donutU.y - donut0.y) < 5;
  await shot(page, 'after-2-undos');
  await page.evaluate(() => document.getElementById('t-redo').click());
  await page.waitForTimeout(500);
  await page.evaluate(() => document.getElementById('t-redo').click());
  await page.waitForTimeout(500);
  const st = await boardState(page);
  await shot(page, 'after-2-redos');
  verdict(r.ok && undone && st.overlaps === 0,
    `resize-ok=${r.ok} both-undone-exact=${undone} redo-clean-overlaps=${st.overlaps}`);
  await page.close();
}

// ---- S18 · save → mutate → load → gestures still work ----------------------
{
  begin('s18-save-load-then-gesture');
  const page = await freshPage();
  await page.evaluate(() => document.getElementById('t-save').click());
  await page.waitForTimeout(400);
  const donut0 = await host(page, 'Revenue by region');
  const line0 = await host(page, 'Revenue vs target');
  await dragTo(page, 'Revenue vs target', donut0.x + donut0.w * 0.7, donut0.y + 16); // mutate
  await page.evaluate(() => document.getElementById('t-load').click());
  await page.waitForTimeout(900);
  const lineL = await host(page, 'Revenue vs target');
  const restored = lineL && Math.abs(lineL.x - line0.x) < 6 && Math.abs(lineL.y - line0.y) < 6;
  await shot(page, 'loaded');
  const donutL = await host(page, 'Revenue by region');
  const m = await dragTo(page, 'Revenue vs target', donutL.x + donutL.w * 0.7, donutL.y + 16);
  await shot(page, 'gesture-after-load');
  const st = await boardState(page);
  verdict(!!restored && m.ok && st.overlaps === 0,
    `load-restored=${!!restored} gesture-after-load=${m.ok}(${m.detail}) overlaps=${st.overlaps}`);
  await page.close();
}

// ---- S19 · pin blocks, unpin releases --------------------------------------
{
  begin('s19-pin-refuses-unpin-allows');
  const page = await freshPage();
  const line0 = await host(page, 'Revenue vs target');
  await page.mouse.click(line0.x + line0.w / 2, line0.y + 10);
  await page.waitForTimeout(250);
  await page.evaluate(() => document.getElementById('t-pin').click());
  await page.waitForTimeout(400);
  const donut0 = await host(page, 'Revenue by region');
  // drag the donut ONTO the pinned line chart → refused, snaps home
  const before = await host(page, 'Revenue by region');
  await page.mouse.move(before.x + before.w / 2, before.y + 12);
  await page.mouse.down();
  await page.mouse.move(line0.x + line0.w * 0.5, line0.y + 20, { steps: 12 });
  await page.waitForTimeout(400);
  await page.mouse.up();
  await page.waitForTimeout(600);
  const donutA = await host(page, 'Revenue by region');
  const refused = Math.abs(donutA.x - before.x) < 6 && Math.abs(donutA.y - before.y) < 6;
  const lineStill = await host(page, 'Revenue vs target');
  const pinHeld = Math.abs(lineStill.x - line0.x) < 3 && Math.abs(lineStill.y - line0.y) < 3;
  await shot(page, 'pin-refused');
  // unpin → the same drag now swaps
  await page.mouse.click(lineStill.x + lineStill.w / 2, lineStill.y + 10);
  await page.waitForTimeout(250);
  await page.evaluate(() => document.getElementById('t-pin').click());
  await page.waitForTimeout(400);
  const m = await dragTo(page, 'Revenue by region', lineStill.x + lineStill.w * 0.55, lineStill.y + 20);
  await shot(page, 'unpinned-swaps');
  const st = await boardState(page);
  verdict(refused && pinHeld && m.ok && st.overlaps === 0,
    `pinned-refuses=${refused} pin-held=${pinHeld} unpin-swaps=${m.ok}(${m.detail}) overlaps=${st.overlaps}`);
  await page.close();
}

// ---- S20 · decrease size then move INTO the freed space --------------------
{
  begin('s20-shrink-then-move-into-gap');
  const page = await freshPage();
  const r = await resizeBy(page, 'Revenue vs target', -260, 0);  // free columns right of the line chart
  await shot(page, 'shrunk');
  const line = await host(page, 'Revenue vs target');
  // move the donut into the freed gap (right of the shrunken line chart)
  const m = await dragTo(page, 'Revenue by region', line.x + line.w + 80, line.y + 20);
  await shot(page, 'moved-into-gap');
  const donutA = await host(page, 'Revenue by region');
  const sameRow = Math.abs(donutA.y - line.y) < 8;
  const st = await boardState(page);
  verdict(r.ok && m.ok && sameRow && st.overlaps === 0,
    `shrink=${r.ok}(${r.detail}) move-into-gap=${m.ok}(${m.detail}) same-row=${sameRow} overlaps=${st.overlaps}`);
  await page.close();
}

// ---- S21 [OPTIONS] · height escalation: a pull grows the WHOLE section -----
{
  begin('s21-section-height-escalation');
  const page = await freshPage(OPTS);
  const tr0 = await host(page, 'Strip A');
  const nc0 = await host(page, 'Strip B');
  const line0 = await host(page, 'Trend panel');
  await shot(page, 'before');
  await page.mouse.click(tr0.x + tr0.w / 2, tr0.y + 10);
  await page.waitForTimeout(250);
  const rs = await resizeHandleOf(page, 'Strip A');
  if (!rs) { verdict(false, 'no strip-tile handle'); await page.close(); }
  else {
    await page.mouse.move(rs.x, rs.y);
    await page.mouse.down();
    await page.mouse.move(rs.x, rs.y + 130, { steps: 12 });   // pull well past the section
    await page.waitForTimeout(500);
    const trMid = await host(page, 'Strip A');
    const ncMid = await host(page, 'Strip B');
    await shot(page, 'pulled-taller');
    await page.mouse.up();
    await page.waitForTimeout(700);
    const trA = await host(page, 'Strip A');
    const ncA = await host(page, 'Strip B');
    await shot(page, 'committed');
    const st = await boardState(page);
    // The WHOLE section grew: the dragged tile and its siblings are both taller.
    const grewLive = trMid.h > tr0.h + 30 && ncMid.h > nc0.h + 30;
    const grewCommitted = trA.h > tr0.h + 30 && ncA.h > nc0.h + 30;
    // …and ONE undo restores the section exactly.
    await clickUndo(page);
    const trU = await host(page, 'Strip A');
    const ncU = await host(page, 'Strip B');
    const lineU = await host(page, 'Trend panel');
    await shot(page, 'after-undo');
    const undone = Math.abs(trU.h - tr0.h) < 6 && Math.abs(ncU.h - nc0.h) < 6 &&
                   Math.abs(lineU.y - line0.y) < 8;
    verdict(grewLive && grewCommitted && undone && st.overlaps === 0,
      `section-grew-live=${grewLive} committed=${grewCommitted} one-undo-restores=${undone} overlaps=${st.overlaps} (a ${tr0.h}->${trA.h}, b ${nc0.h}->${ncA.h})`);
    await page.close();
  }
}

// ---- S22 · grow-mode fold: pan down, then the bottom tile resizes ---------
{
  begin('s22-grow-pan-then-resize-bottom');
  const page = await freshPage();
  await page.evaluate(() => document.getElementById('t-mode').click());
  await page.waitForTimeout(600);
  // The table's corner sits near/below the fold in grow mode: wheel-pan down
  // first (that is the designed way to reach extended content), then resize.
  const c = await host(page, 'Revenue vs target');
  await page.mouse.move(c.x + c.w / 2, c.y + c.h / 2);
  await page.mouse.wheel(0, 160);
  await page.waitForTimeout(500);
  const table0 = await host(page, 'Top reps');
  const r = await resizeBy(page, 'Top reps', 0, 90);
  await shot(page, 'bottom-tile-grown');
  const st = await boardState(page);
  verdict(r.ok && st.overlaps === 0, `pan-then-resize=${r.ok}(${r.detail}) overlaps=${st.overlaps}`);
  await page.close();
}

// ---- S23 · FLOAT mode: place a widget ANYWHERE, gaps legal ----------------
{
  begin('s23-float-place-anywhere');
  const page = await freshPage();
  await page.evaluate(() => document.getElementById('t-float').click());
  await page.waitForTimeout(500);
  const table = await host(page, 'Top reps');
  const donut0 = await host(page, 'Revenue by region');
  // drop the donut into the EMPTY space below the table (extended band)
  const m = await dragTo(page, 'Revenue by region', table.x + 200, table.y + table.h + 30);
  await shot(page, 'float-placed-below');
  const donutA = await host(page, 'Revenue by region');
  const stayed = donutA.y > donut0.y + 100;           // did NOT gravity-climb
  // toggle float off → gravity packs it back up
  await page.evaluate(() => document.getElementById('t-float').click());
  await page.waitForTimeout(800);
  const donutB = await host(page, 'Revenue by region');
  await shot(page, 'gravity-repacked');
  const repacked = donutB.y < donutA.y - 60;
  const st = await boardState(page);
  verdict(m.ok && stayed && repacked && st.overlaps === 0,
    `placed=${m.ok}(${m.detail}) stays-in-float=${stayed} repacks-on-off=${repacked} overlaps=${st.overlaps}`);
  await page.close();
}

// ---- S24 [OPTIONS] · the nested section's columns sit ON the board's lines -
{
  begin('s24-section-board-alignment');
  const page = await freshPage(OPTS);
  const dev = await page.evaluate(() => {
    const D = window.__demoCtx.diagram;
    const f = D.getGroup('board-c');
    // Read the board's live geometry rather than hardcoding it, so a page
    // gap/padding change cannot silently invalidate this alignment check.
    const m = window.__opts.binders.c.metrics();
    const GAP = m.gap, PAD = m.padding, COLS = m.columns;
    const cu = (f.size.width - 2 * PAD - (COLS - 1) * GAP) / COLS;
    // Every tile of board C — INCLUDING the nested section's — must sit on a
    // 12-column line of the board grid (gap parity makes 1 section col = 3
    // board cols). Boards A/B run their own 6-column geometry: excluded.
    const ids = new Set([...(D.getGroup('board-c').members || []), ...(D.getGroup('sec-strip').members || [])]);
    const nodes = D.getNodes().filter((n) => ids.has(n.id));
    const devs = nodes.map((n) => {
      const rel = n.position.x - f.position.x - PAD;
      const c = rel / (cu + GAP);
      return Math.abs(c - Math.round(c)) * (cu + GAP);
    });
    return Math.round(Math.max(...devs) * 10) / 10;
  });
  await shot(page, 'aligned');
  verdict(dev <= 2, `max column-line deviation ${dev}px (must be ≤2px)`);
  await page.close();
}

// ---- S25 [OPTIONS] · the section is NOT a ratchet: grow, release, shrink ---
{
  begin('s25-section-shrinks-back-across-gestures');
  const page = await freshPage(OPTS);
  const tr0 = await host(page, 'Strip A');
  const nc0 = await host(page, 'Strip B');
  // GESTURE 1: grow the section via the tile corner, release (commit).
  await page.mouse.click(tr0.x + tr0.w / 2, tr0.y + 10);
  await page.waitForTimeout(250);
  let rs = await resizeHandleOf(page, 'Strip A');
  await page.mouse.move(rs.x, rs.y); await page.mouse.down();
  await page.mouse.move(rs.x, rs.y + 130, { steps: 12 });
  await page.waitForTimeout(450);
  await page.mouse.up(); await page.waitForTimeout(600);
  const trTall = await host(page, 'Strip A');
  const grew = trTall.h > tr0.h + 30;
  await shot(page, 'grown-committed');
  // GESTURE 2 (fresh): shrink it back up — the ratchet bug made this a no-op.
  rs = await resizeHandleOf(page, 'Strip A');
  await page.mouse.move(rs.x, rs.y); await page.mouse.down();
  await page.mouse.move(rs.x, rs.y - 200, { steps: 12 });
  await page.waitForTimeout(450);
  await page.mouse.up(); await page.waitForTimeout(600);
  const trBack = await host(page, 'Strip A');
  const ncBack = await host(page, 'Strip B');
  const shrank = Math.abs(trBack.h - tr0.h) < 8 && Math.abs(ncBack.h - nc0.h) < 8;
  await shot(page, 'shrunk-back-committed');
  const st = await boardState(page);
  // Undo walks: shrink-commit undone -> tall section; grow-commit undone -> original.
  await clickUndo(page);
  const trU1 = await host(page, 'Strip A');
  const undo1Tall = trU1.h > tr0.h + 30;
  await clickUndo(page);
  const trU2 = await host(page, 'Strip A');
  const undo2Orig = Math.abs(trU2.h - tr0.h) < 8;
  await shot(page, 'after-undos');
  verdict(grew && shrank && undo1Tall && undo2Orig && st.overlaps === 0,
    `grew=${grew} shrank-in-NEW-gesture=${shrank} undo1-tall=${undo1Tall} undo2-original=${undo2Orig} overlaps=${st.overlaps} (a ${tr0.h}->${trTall.h}->${trBack.h})`);
  await page.close();
}

// ---- S26 · THE USER'S REPORT: resizing ONE KPI changes ONLY that KPI ------
// Under the old nested strip a height pull grew the whole row — every sibling
// with it. On the flat grid a KPI is an ordinary member: its neighbours keep
// their place and are never dragged along.
{
  begin('s26-kpi-resize-affects-only-that-kpi');
  const page = await freshPage();
  const tr0 = await host(page, 'Total revenue');
  const nc0 = await host(page, 'New customers');
  const ad0 = await host(page, 'Avg deal size');
  const wr0 = await host(page, 'Win rate');
  await shot(page, 'before');
  await page.mouse.click(tr0.x + tr0.w / 2, tr0.y + 10);
  await page.waitForTimeout(250);
  const rs = await resizeHandleOf(page, 'Total revenue');
  if (!rs) { verdict(false, 'no KPI handle'); await page.close(); }
  else {
    await page.mouse.move(rs.x, rs.y); await page.mouse.down();
    await page.mouse.move(rs.x, rs.y + 130, { steps: 12 });   // grow it a row taller
    await page.waitForTimeout(450);
    await shot(page, 'mid-pull');
    await page.mouse.up(); await page.waitForTimeout(700);
    const trA = await host(page, 'Total revenue');
    const ncA = await host(page, 'New customers');
    const adA = await host(page, 'Avg deal size');
    const wrA = await host(page, 'Win rate');
    await shot(page, 'committed');
    // ONE tile got taller. The other three did NOT grow (fit-mode may squeeze
    // them a little as the board gains a row — never grow them along).
    const itGrew = trA.h > tr0.h + 25;
    const siblingsDidNotGrow = ncA.h <= nc0.h + 2 && adA.h <= ad0.h + 2 && wrA.h <= wr0.h + 2;
    const siblingsHeldTheirPlace =
      Math.abs(ncA.x - nc0.x) < 4 && Math.abs(ncA.y - nc0.y) < 4 &&
      Math.abs(adA.x - ad0.x) < 4 && Math.abs(wrA.x - wr0.x) < 4;
    await clickUndo(page);
    const trU = await host(page, 'Total revenue');
    const ncU = await host(page, 'New customers');
    await shot(page, 'after-undo');
    const undone = Math.abs(trU.h - tr0.h) < 6 && Math.abs(ncU.h - nc0.h) < 6;
    const st = await boardState(page);
    verdict(itGrew && siblingsDidNotGrow && siblingsHeldTheirPlace && undone && st.overlaps === 0,
      `only-it-grew=${itGrew} siblings-unchanged=${siblingsDidNotGrow} siblings-in-place=${siblingsHeldTheirPlace} one-undo=${undone} overlaps=${st.overlaps} (tr ${tr0.h}->${trA.h}, nc ${nc0.h}->${ncA.h})`);
    await page.close();
  }
}

// ---- S27 · THE USER'S REPORT: a KPI dragged INTO a big chart displaces it --
// "Total Revenue can't be switched with Revenue vs Target" — the anti-jitter
// gate was measuring overlap AREA, so a 3×1 tile could never cover >50% of an
// 8×2 one. With gridstack's directional-penetration rule (326690030) dragging
// the small tile more than halfway in pushes the big one.
{
  begin('s27-kpi-displaces-big-chart');
  const page = await freshPage();
  const tr0 = await host(page, 'Total revenue');
  const line0 = await host(page, 'Revenue vs target');
  await shot(page, 'before');
  await page.mouse.move(tr0.x + tr0.w / 2, tr0.y + 14);
  await page.mouse.down();
  await page.mouse.move(line0.x + line0.w * 0.45, line0.y + line0.h * 0.72, { steps: 16 });
  await page.waitForTimeout(450);
  const lineMid = await host(page, 'Revenue vs target');
  const ph = await phRect(page);
  await shot(page, 'mid-deep-inside-the-chart');
  await page.mouse.up();
  await page.waitForTimeout(700);
  const trA = await host(page, 'Total revenue');
  const lineA = await host(page, 'Revenue vs target');
  await shot(page, 'displaced');
  const displacedLive = !!lineMid && (lineMid.y !== line0.y || lineMid.x !== line0.x);
  const landedOnPh = !!ph && Math.abs(trA.x - ph.x) < 6 && Math.abs(trA.y - ph.y) < 6;
  const chartMoved = lineA.y !== line0.y || lineA.x !== line0.x;
  const st = await boardState(page);
  await clickUndo(page);
  const trU = await host(page, 'Total revenue');
  const lineU = await host(page, 'Revenue vs target');
  await shot(page, 'after-undo');
  const undone = Math.abs(trU.x - tr0.x) < 6 && Math.abs(trU.y - tr0.y) < 6 &&
                 Math.abs(lineU.y - line0.y) < 6 && Math.abs(lineU.x - line0.x) < 6;
  verdict(displacedLive && landedOnPh && chartMoved && undone && st.overlaps === 0,
    `chart-pushed-live=${displacedLive} landed-on-placeholder=${landedOnPh} chart-moved=${chartMoved} one-undo=${undone} overlaps=${st.overlaps}`);
  await page.close();
}

// ---- S28 [OPTIONS] · RESPONSIVE COLUMNS + the per-column layout CACHE ------
// Board D derives its column count from its own width. The load-bearing claim
// is not that narrowing re-lays out — it is that WIDENING BACK RESTORES THE
// ORIGINAL CELLS EXACTLY, because the layout it left was cached. A naive
// implementation re-derives 12 columns from the narrow layout and every tile
// comes home the wrong width.
{
  begin('s28-responsive-columns-and-layout-cache');
  const page = await freshPage(OPTS);
  const readD = () => page.evaluate(() => {
    const D = window.__demoCtx.diagram;
    const b = window.__opts.binders.d;
    const m = b.metrics();
    const cells = [...(D.getGroup('board-d').members || [])]
      .map((id) => ({ label: D.getNode(id)?.getMetadata('label'), cell: b.cellOf(id) }))
      .filter((r) => r.label)
      .sort((p, q) => p.label.localeCompare(q.label));
    const saved = b.saveLayout();
    return {
      columns: b.getColumns(), maxColumns: m.maxColumns, responsive: m.responsive,
      width: Math.round(window.__opts.boards.d.size.width),
      cells, savedColumns: saved.columns,
      savedCells: [...saved.cells.entries()]
        .map(([id, c]) => ({ label: D.getNode(id)?.getMetadata('label'), cell: c }))
        .filter((r) => r.label)
        .sort((p, q) => p.label.localeCompare(q.label)),
    };
  });
  const wide0 = await readD();
  await shot(page, 'authored-12-columns');

  // Narrow it with the page's own width control (two clicks: 540 -> 360 -> 270).
  await page.click('#o-width');
  await page.waitForTimeout(400);
  await page.click('#o-width');
  await page.waitForTimeout(600);
  const narrow = await readD();
  await shot(page, 'narrowed-to-6-columns');

  const countFollowedWidth = wide0.columns === 12 && narrow.columns === 6 && narrow.width === 270;
  const reLaidOut = JSON.stringify(narrow.cells) !== JSON.stringify(wide0.cells) &&
                    narrow.cells.every((r) => r.cell.x + r.cell.w <= 6);
  // SAVING WHILE NARROW STILL SAVES THE WIDE LAYOUT (gridstack's save()).
  const savedTheDesktop = narrow.savedColumns === 12 &&
    JSON.stringify(narrow.savedCells) === JSON.stringify(wide0.cells);

  // Widen back through the rest of the cycle (270 -> 180 -> 90 -> 45 -> 540).
  for (let i = 0; i < 4; i++) { await page.click('#o-width'); await page.waitForTimeout(320); }
  await page.waitForTimeout(500);
  const wide1 = await readD();
  await shot(page, 'widened-back-restored');
  const restoredExactly = JSON.stringify(wide1.cells) === JSON.stringify(wide0.cells) &&
                          wide1.columns === 12;

  const st = await boardState(page);
  verdict(
    countFollowedWidth && reLaidOut && savedTheDesktop && restoredExactly && st.overlaps === 0,
    `count-follows-width=${countFollowedWidth}(${wide0.columns}@${wide0.width}px -> ${narrow.columns}@${narrow.width}px) ` +
    `re-laid-out=${reLaidOut} save-while-narrow-keeps-desktop=${savedTheDesktop}(cols=${narrow.savedColumns}) ` +
    `widen-restores-exactly=${restoredExactly} overlaps=${st.overlaps}`
  );
  await page.close();
}

// ---- S29 [OPTIONS] · RTL: mirrored pixels, identical cells, truthful drop ---
// Board E is `rtl: true`. Two claims: the tiles MIRROR (cell x=0 renders at the
// board's right edge, and screen order runs opposite to cell order), while the
// CELLS are exactly what was declared — and a real drag still lands where the
// placeholder said, which is the bug RTL mapping usually introduces (the tile
// lands one span away from the preview).
{
  begin('s29-rtl-mirrors-pixels-not-cells');
  const page = await freshPage(OPTS);
  const readE = () => page.evaluate(() => {
    const D = window.__demoCtx.diagram;
    const b = window.__opts.binders.e;
    const g = window.__opts.boards.e;
    return {
      rtl: b.getRtl(),
      frame: { x: g.position.x, w: g.size.width },
      pad: b.metrics().padding,
      tiles: [...(g.members || [])]
        .map((id) => {
          const n = D.getNode(id);
          return { label: n?.getMetadata('label'), cell: b.cellOf(id), x: Math.round(n.position.x), w: Math.round(n.size.width) };
        })
        .filter((r) => r.label)
        .sort((p, q) => p.label.localeCompare(q.label)),
    };
  });
  const e0 = await readE();
  await shot(page, 'rtl-board');
  const at = (l) => e0.tiles.find((t) => t.label === l);
  const c0 = at('E · col 0'), c2 = at('E · col 2'), c4 = at('E · col 4');

  // CELLS are exactly as declared — direction changed nothing in the model.
  const cellsUnchanged =
    c0.cell.x === 0 && c2.cell.x === 2 && c4.cell.x === 4 &&
    c0.cell.y === 0 && c2.cell.y === 0 && c4.cell.y === 0;
  // PIXELS mirror: cell order 0,2,4 runs RIGHT to LEFT on screen…
  const screenOrderMirrored = c0.x > c2.x && c2.x > c4.x;
  // …and column 0's RIGHT edge is one padding in from the board's right edge.
  const rightAnchored = Math.abs((c0.x + c0.w) - (e0.frame.x + e0.frame.w - e0.pad)) < 2;
  // The last column hugs the LEFT edge.
  const lastAtLeft = Math.abs(c4.x - (e0.frame.x + e0.pad)) < 2;

  // A REAL DRAG in RTL must land exactly on the placeholder. Drag the rightmost
  // tile (cell x=0) leftwards onto the leftmost one (cell x=4): mirrored, that
  // is a move to a HIGHER cell x, and the two same-size tiles swap.
  const target = await host(page, 'E · col 4');
  const m = await dragTo(page, 'E · col 0', target.x + target.w / 2, target.y + target.h / 2, { steps: 14 });
  await shot(page, 'after-rtl-drag');
  const e1 = await readE();
  const moved = e1.tiles.find((t) => t.label === 'E · col 0');
  const movedRight = moved.cell.x > 0;          // cells advanced…
  const movedLeftOnScreen = moved.x < c0.x;     // …while the pixels went LEFT

  // THE INVARIANT THAT MUST SURVIVE A GESTURE: on every row, screen order is
  // still the exact reverse of cell order. If the drag had written a cell
  // through an unmirrored path, this is what would catch it.
  const stillMirrored = [0, 1].every((row) => {
    const inRow = e1.tiles.filter((t) => t.cell.y === row);
    const byCell = [...inRow].sort((p, q) => p.cell.x - q.cell.x).map((t) => t.label);
    const byScreen = [...inRow].sort((p, q) => q.x - p.x).map((t) => t.label);
    return JSON.stringify(byCell) === JSON.stringify(byScreen);
  });

  const st = await boardState(page);
  verdict(
    cellsUnchanged && screenOrderMirrored && rightAnchored && lastAtLeft &&
      m.ok && movedRight && movedLeftOnScreen && stillMirrored && st.overlaps === 0,
    `cells-unchanged=${cellsUnchanged} screen-order-mirrored=${screenOrderMirrored} ` +
    `col0-at-right-edge=${rightAnchored} col4-at-left-edge=${lastAtLeft} ` +
    `drag-landed-on-placeholder=${m.ok}(${m.detail}) cell-advanced=${movedRight}(x=${moved.cell.x}) ` +
    `pixels-went-left=${movedLeftOnScreen} still-mirrored-after-gesture=${stillMirrored} overlaps=${st.overlaps}`
  );
  await page.close();
}

// ---- S30 [OPTIONS] · THE ResizeObserver PATH, DRIVEN BY A REAL VIEWPORT -----
// S28 proves responsive columns through the page's explicit width CONTROL —
// deliberately, so this demo's goldens do not move with the browser window.
// That left the OTHER trigger untested end to end, and it is the one a real
// viewport-sized board actually rides on: the binder's own ResizeObserver on
// the canvas container. A board can only be "responsive" in the sense users
// mean — it reflows when the window does — through that observer.
//
// This drives it AND ISOLATES it, with a two-phase A/B:
//
//   A. Narrow board D's MODEL width by assigning `size.width` directly. That is
//      a deliberately SILENT write: it fires no `bounds:changed`, so the
//      binder's group subscription — the path S28 already covers — cannot see
//      it, and NOTHING may move. If the count changed here, everything below
//      would be proving the wrong trigger.
//   B. Resize the ACTUAL BROWSER VIEWPORT. `#canvas` is viewport-elastic
//      (`grid-template-columns: 214px 1fr`), so the container really does
//      resize, and the binder's ResizeObserver is now the ONLY code in the
//      system that can notice the width already sitting on the model.
//
// Then the same two steps in reverse, which is the per-column layout cache's
// round-trip guarantee reached through the OBSERVER instead of the control:
// restore the width and the viewport, and every cell must come back EXACTLY as
// authored — not merely "12 columns again".
//
// Determinism: the assertions are model reads (column count and cells), never
// pixels, so nothing here depends on the window size. The board width, the
// column count and the viewport are all restored before the page closes, and
// `freshPage()` re-pins 1400x900 for every scenario anyway — so neither the
// scenarios that follow nor the separate visual gate can see this.
{
  begin('s30-viewport-resizeobserver-drives-columns');
  const page = await freshPage(OPTS);
  const readD = () => page.evaluate(() => {
    const D = window.__demoCtx.diagram;
    const b = window.__opts.binders.d;
    return {
      columns: b.getColumns(),
      responsive: b.metrics().responsive,
      width: Math.round(window.__opts.boards.d.size.width),
      canvas: Math.round(document.getElementById('canvas').getBoundingClientRect().width),
      cells: [...(D.getGroup('board-d').members || [])]
        .map((id) => ({ label: D.getNode(id)?.getMetadata('label'), cell: b.cellOf(id) }))
        .filter((r) => r.label)
        .sort((p, q) => p.label.localeCompare(q.label)),
    };
  });
  // A model write with NO setFrame() behind it — the point is that it is silent.
  const silentWidth = (w) => page.evaluate((width) => {
    window.__opts.boards.d.size.width = width;
  }, w);

  const wide0 = await readD();
  await shot(page, 'authored-12-columns');

  // A — silent width write, viewport untouched. Nothing may move.
  await silentWidth(270);
  await page.waitForTimeout(400);
  const quiet = await readD();
  const stayedQuiet = quiet.columns === 12 && quiet.width === 270;

  // B — the real viewport change. Only the ResizeObserver can react to it.
  await page.setViewportSize({ width: 900, height: 900 });
  await page.waitForTimeout(800);
  const narrow = await readD();
  await shot(page, 'observer-narrowed-to-6-columns');

  const canvasShrank = narrow.canvas < wide0.canvas;
  const observerDroveColumns = narrow.columns === 6 && narrow.width === 270;
  const reLaidOut = JSON.stringify(narrow.cells) !== JSON.stringify(wide0.cells) &&
                    narrow.cells.every((r) => r.cell.x + r.cell.w <= 6);

  // C — restore both, and the cache must hand back the authored layout exactly.
  await silentWidth(540);
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.waitForTimeout(800);
  const wide1 = await readD();
  await shot(page, 'restored-12-columns');

  const restoredExactly = wide1.columns === 12 && wide1.width === 540 &&
                          JSON.stringify(wide1.cells) === JSON.stringify(wide0.cells);
  // A resize is DERIVED state: it must never pin the board out of responsive
  // mode the way an explicit setColumns() does.
  const stillResponsive = wide1.responsive === true;

  const st = await boardState(page);
  verdict(
    stayedQuiet && canvasShrank && observerDroveColumns && reLaidOut &&
      restoredExactly && stillResponsive && st.overlaps === 0,
    `silent-width-write-moved-nothing=${stayedQuiet}(cols=${quiet.columns}@${quiet.width}px) ` +
    `canvas-shrank=${canvasShrank}(${wide0.canvas}->${narrow.canvas}px) ` +
    `observer-drove-columns=${observerDroveColumns}(${wide0.columns}->${narrow.columns} @${narrow.width}px) ` +
    `re-laid-out=${reLaidOut} viewport-restore-restores-cells-exactly=${restoredExactly} ` +
    `still-responsive=${stillResponsive} overlaps=${st.overlaps}`
  );
  await page.close();
}

} finally {
  await browser.close();
  server.close();
}

// ---- report -----------------------------------------------------------------
const pass = results.filter((r) => r.ok).length;
console.log(`\nscenarios: ${pass}/${results.length} pass · shots in ${OUT}`);
if (failures.length) {
  console.log('FAILURES:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log('THE MODEL THE USER AGREED ON, DRIVEN BY A REAL MOUSE. This is the gate.');
