// Query-builder gate — the Query Studio story, driven with REAL gestures and
// captured as a PNG per case (modeled on table-editing-run.mjs, but FRESH PAGE
// PER SECTION: undo-stack contamination between probes has produced false
// audit results in this repo twice).
//
// What only a gesture gate can prove here: the rail chip's native HTML5 drag
// actually lands a card at the drop point; a held port drag actually paints
// the join-guidance tiers (gold ★ BEST included — asserted by CLASS and by
// PIXEL); an aborted drag clears them; a drop actually draws the 2px accent
// join with its INNER pill; a refused join stays refused; the pill click
// selects; Delete deletes; undo restores — all through the same pointer and
// keyboard a visitor uses.
//
//     node demos/e2e/query-builder-run.mjs [--shots <dir>]

import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, extname } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const shotsArg = process.argv.indexOf('--shots');
const SHOTS = shotsArg > -1 ? process.argv[shotsArg + 1] : join(here, 'out', 'query-builder');
mkdirSync(SHOTS, { recursive: true });

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  try {
    const body = readFileSync(join(root, url === '/' ? 'index.html' : url));
    res.writeHead(200, { 'Content-Type': MIME[extname(url)] ?? 'application/octet-stream' }).end(body);
  } catch { res.writeHead(404).end('not found'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const results = [];
const check = (name, ok, detail) => { results.push({ name, ok, detail }); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
const pageErrors = [];

/** Fresh page per section — no state bleeds between probes. */
async function openPage() {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 160)));
  await page.goto(`${origin}/diagrams/query-builder.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__demoReady === true, { timeout: 30000 });
  await page.waitForTimeout(150);
  return page;
}
const shot = async (page, name) => { await page.screenshot({ path: join(SHOTS, `${name}.png`) }); };

/** Real pointer drag from one port glyph to another (client space, live rects). */
async function wire(page, fromId, toId, { drop = true } = {}) {
  const from = await page.evaluate((id) => window.__demoCtx.portCenter(id), fromId);
  const to = await page.evaluate((id) => window.__demoCtx.portCenter(id), toId);
  await page.mouse.move(from.x, from.y);
  await page.waitForTimeout(140);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 6 });
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.waitForTimeout(140);
  if (drop) { await page.mouse.up(); await page.waitForTimeout(450); }
  return { from, to };
}

/**
 * Sample a 5×5 patch of PAINTED pixels around a client-space point and report
 * whether ANY pixel is within `tol` per channel of `want` — geometry math can
 * land a rounding pixel beside a 2px stroke, so the patch is the honest probe.
 */
async function paintedNear(page, x, y, want, tol = 14) {
  const b64 = (await page.screenshot()).toString('base64');
  return page.evaluate(async ({ b64, x, y, want, tol }) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = 'data:image/png;base64,' + b64; });
    const dsf = img.width / innerWidth;
    const c = new OffscreenCanvas(img.width, img.height).getContext('2d', { willReadFrequently: true });
    c.drawImage(img, 0, 0);
    const cx = Math.round(x * dsf), cy = Math.round(y * dsf);
    const d = c.getImageData(cx - 2, cy - 2, 5, 5).data;
    let best = null;
    for (let i = 0; i < d.length; i += 4) {
      const px = [d[i], d[i + 1], d[i + 2]];
      const hit = Math.abs(px[0] - want[0]) <= tol && Math.abs(px[1] - want[1]) <= tol && Math.abs(px[2] - want[2]) <= tol;
      if (hit) return { hit: true, px };
      if (!best) best = px;
    }
    return { hit: false, px: best };
  }, { b64, x, y, want, tol });
}

// ── 1. TABLE-DRAG-IN — real HTML5 dnd from the rail chip ────────────────────
{
  const page = await openPage();
  const chip = await page.locator('.qb-chip[data-table="products"]').boundingBox();
  const canvas = await page.locator('#qb-canvas').boundingBox();
  const tx = canvas.x + canvas.width * 0.55, ty = canvas.y + canvas.height * 0.72;
  await page.mouse.move(chip.x + chip.width / 2, chip.y + chip.height / 2);
  await page.mouse.down();
  await page.mouse.move(tx, ty, { steps: 4 });
  await page.mouse.move(tx, ty);   // HTML5 dnd needs the second move
  await page.mouse.up();
  await page.waitForTimeout(300);
  const r = await page.evaluate(({ tx, ty }) => {
    const c = window.__demoCtx;
    const node = c.diagram.getNode('products');
    const world = c.instance.viewport.clientToWorld(tx, ty, document.getElementById('qb-canvas').getBoundingClientRect());
    const chipEl = document.querySelector('.qb-chip[data-table="products"]');
    return {
      placed: !!node,
      pos: node && { x: Math.round(node.position.x), y: Math.round(node.position.y) },
      expected: { x: Math.round(world.x - 110), y: Math.round(world.y - 17) },
      dimmed: chipEl.classList.contains('placed'),
      draggable: chipEl.draggable,
      rows: document.querySelectorAll('[data-node-id="products"] .axk-row').length,
    };
  }, { tx, ty });
  const landed = r.placed && Math.abs(r.pos.x - r.expected.x) <= 2 && Math.abs(r.pos.y - r.expected.y) <= 2;
  check('TABLE-DRAG-IN', landed && r.dimmed && !r.draggable && r.rows === 4,
    `placed=${r.placed} pos=${JSON.stringify(r.pos)} expected=${JSON.stringify(r.expected)} chipDimmed=${r.dimmed} rows=${r.rows}`);
  await shot(page, '01-table-drag-in');
  await page.close();
}

// ── 2. WIRE-GUIDANCE + GUIDANCE-CLEARS — one held drag, then the abort ──────
{
  const page = await openPage();
  await page.evaluate(async () => {
    const c = window.__demoCtx;
    c.placeTable('order_items', { x: 430, y: 480 });
    c.instance.fitView?.(40); c.instance.renderNow();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
  // hold a REAL drag from orders.customer_id mid-air
  await wire(page, 'orders.customer_id-out', 'customers.id-in', { drop: false });
  const g = await page.evaluate(() => {
    const rows = (id) => [...document.querySelectorAll(`[data-node-id="${id}"] .axk-row`)];
    const cls = (el) => [...el.classList].filter((c) => c.startsWith('axk-match')).join(',');
    const cust = rows('customers'), oi = rows('order_items'), src = rows('orders');
    const goldBox = cust[0].getBoundingClientRect();
    const portEl = document.querySelector('[data-port-id="customers.id-in"]');
    return {
      gold: cls(cust[0]), chip: cust[0].querySelector('.axk-match-chip')?.textContent ?? '',
      goldPort: portEl ? getComputedStyle(portEl).fill : '',
      good: cls(oi[0]), ok: cls(oi[1]), dim: cls(cust[2]),
      srcTinted: src.some((r) => cls(r) !== ''),
      goldSample: { x: goldBox.x + goldBox.width * 0.45, y: goldBox.y + goldBox.height / 2 },
    };
  });
  await shot(page, '02-wire-guidance');
  check('WIRE-GUIDANCE', g.gold === 'axk-match-top' && g.chip === '★ BEST' && g.good === 'axk-match-good'
    && g.ok === 'axk-match-ok' && g.dim === 'axk-match-none' && !g.srcTinted,
    `gold=${g.gold} chip="${g.chip}" good=${g.good} ok=${g.ok} dim=${g.dim} srcTinted=${g.srcTinted}`);
  // the gold port wears the gold GLOW fill (the per-drag stylesheet, computed)
  check('WIRE-GUIDANCE-PORT', g.goldPort === 'rgb(245, 158, 11)', `top port fill=${g.goldPort}`);
  // …and the gold row BG is PAINTED #fffbeb, not just classed
  const gold = await paintedNear(page, g.goldSample.x, g.goldSample.y, [255, 251, 235], 10);
  check('WIRE-GUIDANCE-PIXEL', gold.hit, `sampled ${JSON.stringify(gold.px)} at the gold row (want ~255,251,235)`);

  // abort MID-AIR: release over empty canvas — every tint must clear
  const canvas = await page.locator('#qb-canvas').boundingBox();
  await page.mouse.move(canvas.x + canvas.width * 0.5, canvas.y + 60, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  const cleared = await page.evaluate(() => ({
    tints: document.querySelectorAll('[class*="axk-match-"]').length,
    chips: document.querySelectorAll('.axk-match-chip').length,
    portCss: !!document.getElementById('grafloria-join-guidance-ports'),
    links: window.__demoCtx.diagram.getLinks().length,
  }));
  check('GUIDANCE-CLEARS', cleared.tints === 0 && cleared.chips === 0 && !cleared.portCss && cleared.links === 1,
    `tints=${cleared.tints} chips=${cleared.chips} portCss=${cleared.portCss} links=${cleared.links}`);
  await shot(page, '03-guidance-clears');
  await page.close();
}

// ── 3. CONNECT-JOIN — the drop paints a 2px accent edge with an INNER pill ──
{
  const page = await openPage();
  await page.evaluate(async () => {
    const c = window.__demoCtx;
    c.placeTable('order_items', { x: 430, y: 480 });
    c.instance.fitView?.(40); c.instance.renderNow();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
  await wire(page, 'orders.id-out', 'order_items.order_id-in');
  const j = await page.evaluate(() => {
    const c = window.__demoCtx;
    const link = c.diagram.getLinks().find((l) => l.targetPortId === 'order_items.order_id-in');
    const gEl = link && document.querySelector(`[data-link-id="${link.id}"]`);
    const path = gEl?.querySelector('path:not(.link-hit-area)');
    let strokePoint = null;
    if (path) {
      const p = path.getPointAtLength(path.getTotalLength() * 0.18);
      const m = path.getScreenCTM();
      strokePoint = { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
    }
    const pill = [...(gEl?.querySelectorAll('.link-label-group text') ?? [])].map((t) => t.textContent).join('');
    return {
      created: !!link, painted: !!path,
      stroke: path?.getAttribute('stroke'), width: path ? getComputedStyle(path).strokeWidth : '',
      pill, strokePoint,
      routed: (link?.points?.length ?? 0) >= 3,
      sql: document.getElementById('qb-sql-text').value,
    };
  });
  check('CONNECT-JOIN', j.created && j.painted && j.stroke === '#2080e8' && j.width === '2px' && j.pill === 'INNER' && j.routed,
    `painted=${j.painted} stroke=${j.stroke}/${j.width} pill="${j.pill}" routed=${j.routed}`);
  const ink = j.strokePoint ? await paintedNear(page, j.strokePoint.x, j.strokePoint.y, [32, 128, 232], 22) : { hit: false, px: null };
  check('CONNECT-JOIN-PIXEL', ink.hit, `sampled ${JSON.stringify(ink.px)} on the edge (want ~32,128,232)`);
  check('CONNECT-JOIN-SQL', j.sql.includes('INNER JOIN order_items ON orders.id = order_items.order_id'), j.sql.split('\n').pop());
  await shot(page, '04-connect-join');
  await page.close();
}

// ── 4. SELF-JOIN-REFUSED + DUPLICATE-REFUSED — no edge, no errors, a toast ──
{
  const page = await openPage();
  const errsBefore = pageErrors.length;
  await wire(page, 'orders.id-out', 'orders.total-in');           // same table
  const self = await page.evaluate(() => ({
    links: window.__demoCtx.diagram.getLinks().length,
    toast: document.getElementById('qb-toast')?.classList.contains('show'),
  }));
  check('SELF-JOIN-REFUSED', self.links === 1 && self.toast === true,
    `links=${self.links} toastShown=${self.toast}`);
  await shot(page, '05-self-join-refused');
  await page.waitForTimeout(2400);                                 // let the toast fade
  await wire(page, 'customers.name-out', 'orders.order_date-in'); // pair already joined
  const dup = await page.evaluate(() => ({
    links: window.__demoCtx.diagram.getLinks().length,
    toast: document.getElementById('qb-toast')?.classList.contains('show'),
    msg: document.getElementById('qb-toast')?.textContent ?? '',
  }));
  check('DUPLICATE-REFUSED', dup.links === 1 && dup.toast === true && /already joined/.test(dup.msg),
    `links=${dup.links} toast="${dup.msg}"`);
  check('REFUSALS-NO-ERRORS', pageErrors.length === errsBefore, pageErrors.slice(errsBefore).join(' | ') || 'clean');
  await shot(page, '06-duplicate-refused');
  await page.close();
}

// ── 5. PILL-SELECTS — click the pill; the inspector edits the join type ─────
{
  const page = await openPage();
  const pill = await page.locator('#qb-canvas .link-label-group text').first().boundingBox();
  await page.mouse.click(pill.x + pill.width / 2, pill.y + pill.height / 2);
  await page.waitForTimeout(250);
  const sel = await page.evaluate(() => ({
    selected: window.__demoCtx.diagram.getLinks().filter((l) => l.state === 'selected').map((l) => l.id),
    eq: document.querySelector('#qb-inspector .qb-join-eq')?.textContent ?? '',
    types: [...document.querySelectorAll('#qb-inspector .qb-type')].map((b) => b.textContent + (b.classList.contains('on') ? '*' : '')),
  }));
  check('PILL-SELECTS', sel.selected.length === 1 && sel.eq === 'customers.id = orders.customer_id'
    && sel.types.join(',') === 'INNER*,LEFT,RIGHT,FULL',
    `selected=${sel.selected} eq="${sel.eq}" types=${sel.types.join(',')}`);
  await shot(page, '07-pill-selected');
  await page.locator('#qb-inspector .qb-type', { hasText: 'LEFT' }).click();
  await page.waitForTimeout(300);
  const left = await page.evaluate(() => ({
    pill: [...document.querySelectorAll('#qb-canvas .link-label-group text')].map((t) => t.textContent).join(''),
    sql: document.getElementById('qb-sql-text').value,
  }));
  check('PILL-TYPE-LEFT', left.pill === 'LEFT' && left.sql.includes('LEFT JOIN orders'),
    `pill="${left.pill}" sqlHasLeft=${left.sql.includes('LEFT JOIN orders')}`);
  await shot(page, '08-pill-left');
  await page.keyboard.press('ControlOrMeta+z');                    // ONE undo
  await page.waitForTimeout(350);
  const undone = await page.evaluate(() => ({
    pill: [...document.querySelectorAll('#qb-canvas .link-label-group text')].map((t) => t.textContent).join(''),
    sql: document.getElementById('qb-sql-text').value,
  }));
  check('PILL-TYPE-UNDO', undone.pill === 'INNER' && undone.sql.includes('INNER JOIN orders'),
    `pill="${undone.pill}"`);
  await page.close();
}

// ── 6. SQL-PREVIEW — checkboxes and join type write the SQL (canonical ta) ──
{
  const page = await openPage();
  const seed = await page.evaluate(() => document.getElementById('qb-sql-text').value);
  check('SQL-SEED', seed.includes('customers.name') && seed.includes('INNER JOIN orders ON customers.id = orders.customer_id'),
    seed.replace(/\n/g, ' ⏎ '));
  // tick customers.email with a REAL click on its checkbox
  await page.locator('[data-node-id="customers"] .axk-row', { hasText: 'email' }).locator('.qb-check').click();
  await page.waitForTimeout(250);
  const afterTick = await page.evaluate(() => document.getElementById('qb-sql-text').value);
  check('SQL-PREVIEW-TICK', afterTick.includes('customers.email'), afterTick.split('\n').slice(0, 4).join(' ⏎ '));
  // change the join type through the pill → inspector
  const pill = await page.locator('#qb-canvas .link-label-group text').first().boundingBox();
  await page.mouse.click(pill.x + pill.width / 2, pill.y + pill.height / 2);
  await page.waitForTimeout(200);
  await page.locator('#qb-inspector .qb-type', { hasText: 'LEFT' }).click();
  await page.waitForTimeout(300);
  const afterType = await page.evaluate(() => document.getElementById('qb-sql-text').value);
  check('SQL-PREVIEW-JOINTYPE', afterType.includes('LEFT JOIN orders'), afterType.split('\n').pop());
  await shot(page, '09-sql-preview');
  await page.close();
}

// ── 7. DELETE-JOIN — select the pill, Delete; SQL follows; undo restores ────
{
  const page = await openPage();
  const pill = await page.locator('#qb-canvas .link-label-group text').first().boundingBox();
  await page.mouse.click(pill.x + pill.width / 2, pill.y + pill.height / 2);
  await page.waitForTimeout(200);
  await page.keyboard.press('Delete');
  await page.waitForTimeout(400);
  const gone = await page.evaluate(() => ({
    links: window.__demoCtx.diagram.getLinks().length,
    paths: document.querySelectorAll('#qb-canvas [data-link-id]').length,
    sql: document.getElementById('qb-sql-text').value,
  }));
  check('DELETE-JOIN', gone.links === 0 && gone.paths === 0 && !gone.sql.includes('JOIN'),
    `links=${gone.links} paths=${gone.paths} sqlHasJoin=${gone.sql.includes('JOIN')}`);
  await shot(page, '10-delete-join');
  await page.keyboard.press('ControlOrMeta+z');
  await page.waitForTimeout(450);
  const back = await page.evaluate(() => ({
    links: window.__demoCtx.diagram.getLinks().length,
    pill: [...document.querySelectorAll('#qb-canvas .link-label-group text')].map((t) => t.textContent).join(''),
    sql: document.getElementById('qb-sql-text').value,
  }));
  check('DELETE-JOIN-UNDO', back.links === 1 && back.pill === 'INNER' && back.sql.includes('INNER JOIN orders'),
    `links=${back.links} pill="${back.pill}"`);
  await shot(page, '11-delete-undone');
  await page.close();
}

await browser.close();
server.close();

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.name.padEnd(24)} ${r.detail}`);
if (pageErrors.length) console.log(`\npage errors: ${pageErrors.slice(0, 4).join(' | ')}`);
console.log(`\nquery-builder: ${results.length - failed.length}/${results.length} cases pass · shots → ${SHOTS}`);
if (failed.length || pageErrors.length) {
  console.log('\nA QUERY BUILDER THAT MISBEHAVES UNDER A REAL GESTURE is a bug no model assertion can see. This is the gate.');
  process.exit(1);
}
