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

async function freshPage() {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`${origin}/dashboard/dashboard-builder.html`, { waitUntil: 'networkidle' });
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

const undoEnabled = (page) => page.evaluate(() => !document.getElementById('t-undo').disabled);
const clickUndo = async (page) => { await page.evaluate(() => document.getElementById('t-undo').click()); await page.waitForTimeout(500); };

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

// ---- S4 · THE USER'S GESTURE: KPI dragged under the table CROSSES boards ---
{
  begin('s04-kpi-under-table-crosses');
  const page = await freshPage();
  const tr0 = await host(page, 'Total revenue');
  const table = await host(page, 'Top reps');
  await shot(page, 'boot');
  await page.mouse.move(tr0.x + tr0.w / 2, tr0.y + 14);
  await page.mouse.down();
  await page.mouse.move(table.x + table.w / 2, table.y + table.h + 40, { steps: 16 });
  await page.waitForTimeout(500);
  const trMid = await host(page, 'Total revenue');
  await shot(page, 'mid-under-table');
  await page.mouse.up();
  await page.waitForTimeout(700);
  const trAfter = await host(page, 'Total revenue');
  await shot(page, 'dropped');
  const st = await boardState(page);
  const movedToMainBoard = trAfter && trAfter.y > table.y && trAfter.h > 60; // below the table, full-height
  const committed = await undoEnabled(page);
  // …and one undo brings it back into the KPI strip
  await clickUndo(page);
  const trUndone = await host(page, 'Total revenue');
  await shot(page, 'after-undo');
  const backHome = trUndone && Math.abs(trUndone.x - tr0.x) < 5 && Math.abs(trUndone.y - tr0.y) < 5;
  verdict(
    !!movedToMainBoard && committed && !!backHome && st.overlaps === 0 && trMid.h > 60,
    `crossed=${!!movedToMainBoard} committed=${committed} undo-restores=${!!backHome} overlaps=${st.overlaps} ghost-full-size=${trMid.h > 60}`
  );
  await page.close();
}

// ---- S5 · main-board tile dragged INTO the KPI strip (reverse crossing) ----
{
  begin('s05-tile-into-kpi-strip');
  const page = await freshPage();
  // The strip is FULL (4 KPIs, maxRows 1) — entry must be REFUSED, snap home.
  const donut0 = await host(page, 'Revenue by region');
  const kpi = await host(page, 'New customers');
  await page.mouse.move(donut0.x + donut0.w / 2, donut0.y + 12);
  await page.mouse.down();
  await page.mouse.move(kpi.x + kpi.w / 2, kpi.y + kpi.h / 2, { steps: 14 });
  await page.waitForTimeout(450);
  await shot(page, 'over-full-strip');
  await page.mouse.up();
  await page.waitForTimeout(600);
  const donutA = await host(page, 'Revenue by region');
  const snapHome = Math.abs(donutA.x - donut0.x) < 5 && Math.abs(donutA.y - donut0.y) < 5;
  const noCommit = !(await undoEnabled(page));
  await shot(page, 'refused-snap-home');
  // Now make room: remove one KPI, then the donut CAN cross in.
  await page.mouse.click(kpi.x + kpi.w / 2, kpi.y + 12);
  await page.waitForTimeout(250);
  await page.evaluate(() => document.getElementById('t-remove').click());
  await page.waitForTimeout(600);
  const donutB0 = await host(page, 'Revenue by region');
  await page.mouse.move(donutB0.x + donutB0.w / 2, donutB0.y + 12);
  await page.mouse.down();
  const strip = await host(page, 'Total revenue');
  await page.mouse.move(strip.x + strip.w + 80, strip.y + strip.h / 2, { steps: 14 });
  await page.waitForTimeout(450);
  await shot(page, 'entering-with-room');
  await page.mouse.up();
  await page.waitForTimeout(700);
  const donutB = await host(page, 'Revenue by region');
  const inStrip = donutB && Math.abs(donutB.y - strip.y) < 8; // same row as the KPIs
  await shot(page, 'joined-strip');
  const st = await boardState(page);
  verdict(
    snapHome && noCommit && !!inStrip && st.overlaps === 0,
    `full-strip-refused=${snapHome} no-commit=${noCommit} joined-when-room=${!!inStrip} overlaps=${st.overlaps}`
  );
  await page.close();
}

// ---- S6 · resize a FIRST-ROW KPI: width pushes siblings, height is clamped -
{
  begin('s06-kpi-resize-strip-integrity');
  const page = await freshPage();
  const tr = await host(page, 'Total revenue');
  const nc0 = await host(page, 'New customers');
  await page.mouse.click(tr.x + tr.w / 2, tr.y + 12);
  await page.waitForTimeout(300);
  const rs = await resizeHandleOf(page, 'Total revenue');
  if (!rs) { verdict(false, 'no resize handle on KPI'); await page.close(); }
  else {
    await shot(page, 'before');
    // 1) HEIGHT growth: the strip is one row BY DESIGN — the ghost preview is
    //    clamped and the released tile keeps its height; siblings untouched.
    await page.mouse.move(rs.x, rs.y);
    await page.mouse.down();
    await page.mouse.move(rs.x, rs.y + 160, { steps: 10 });
    await page.waitForTimeout(400);
    const trTall = await host(page, 'Total revenue');
    const ncMid = await host(page, 'New customers');
    await shot(page, 'height-attempt');
    await page.mouse.up();
    await page.waitForTimeout(500);
    const heightClamped = (await host(page, 'Total revenue')).h <= tr.h + 6;
    const ghostClamped = trTall.h <= tr.h + 26; // preview may not balloon either
    const siblingsIntact = Math.abs(ncMid.h - nc0.h) < 6 && Math.abs(ncMid.y - nc0.y) < 6;
    // 2) WIDTH growth on a FULL 4/4 strip must be REFUSED — there is nowhere
    //    for a sibling to go, and refusing IS the design staying intact.
    const rs2 = await resizeHandleOf(page, 'Total revenue');
    await page.mouse.move(rs2.x, rs2.y);
    await page.mouse.down();
    await page.mouse.move(rs2.x + 180, rs2.y, { steps: 10 });
    await page.waitForTimeout(450);
    await shot(page, 'width-attempt-full-strip');
    await page.mouse.up();
    await page.waitForTimeout(500);
    const ncFull = await host(page, 'New customers');
    const fullRefused = Math.abs(ncFull.x - nc0.x) < 6 &&
      Math.abs((await host(page, 'Total revenue')).w - tr.w) < 10;
    // 3) Make ROOM (remove the last KPI), then width growth pushes the row
    //    sideways and shrink-back restores it.
    const wr = await host(page, 'Win rate');
    await page.mouse.click(wr.x + wr.w / 2, wr.y + 12);
    await page.waitForTimeout(250);
    await page.evaluate(() => document.getElementById('t-remove').click());
    await page.waitForTimeout(600);
    const nc1 = await host(page, 'New customers');
    const rs3 = await resizeHandleOf(page, 'Total revenue');
    await page.mouse.move(rs3.x, rs3.y);
    await page.mouse.down();
    await page.mouse.move(rs3.x + 200, rs3.y, { steps: 10 });
    await page.waitForTimeout(450);
    const ncPushed = await host(page, 'New customers');
    await shot(page, 'width-grown-with-room');
    await page.mouse.move(rs3.x, rs3.y, { steps: 10 });
    await page.waitForTimeout(500);
    await page.mouse.up();
    await page.waitForTimeout(400);
    const ncBack = await host(page, 'New customers');
    await shot(page, 'width-restored');
    const st = await boardState(page);
    const widthPushed = ncPushed.x > nc1.x + 20 && Math.abs(ncPushed.y - nc1.y) < 6; // slid RIGHT, same row
    const widthRestored = Math.abs(ncBack.x - nc1.x) < 6;
    verdict(
      heightClamped && ghostClamped && siblingsIntact && fullRefused && widthPushed && widthRestored && st.overlaps === 0,
      `h-clamped=${heightClamped} ghost-clamped=${ghostClamped} siblings-intact=${siblingsIntact} full-strip-refused=${fullRefused} w-pushes-right=${widthPushed} w-restores=${widthRestored} overlaps=${st.overlaps}`
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
  verdict(
    afterRemove === before - 1 && afterUndo === before,
    `removed=${afterRemove === before - 1} undo-restored=${afterUndo === before}`
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
