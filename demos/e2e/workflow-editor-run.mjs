// Workflow-editor gate — the library's workflow-editor surface, driven with a
// REAL mouse and keyboard on demos/interaction/workflow-editor.html, a
// screenshot per case, light and dark.
//
// The page's own checks (gallery-run) prove the APIs through the API. This
// proves what only a hand can: that the "+" on a port is pressable and opens the
// host's menu, that a link's buttons survive the pointer moving off the line,
// that a refused drag shows its reason where the hand is, that read-only stops
// a real drag while double-click still works, and that zooming out with the
// wheel swaps cards to their compact form.
//
//     node demos/e2e/workflow-editor-run.mjs [--shots <dir>]

import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, extname } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const shotsArg = process.argv.indexOf('--shots');
const SHOTS = shotsArg > -1 ? process.argv[shotsArg + 1] : join(here, 'out', 'workflow-editor');
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
const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail });
const browser = await chromium.launch();
const pageErrors = [];

async function open(colorScheme) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 160)));
  await page.goto(`${origin}/interaction/workflow-editor.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__demoReady === true && !!window.__we, { timeout: 30000 });
  await page.waitForTimeout(300);
  return { ctx, page };
}

const { ctx, page } = await open('light');
const shot = (name) => page.screenshot({ path: join(SHOTS, `${name}.png`) });
const settle = (ms = 350) => page.waitForTimeout(ms);
const nodeBox = (id) => page.evaluate((id) => {
  const r = document.querySelector(`.grafloria-node-host[data-node-id="${id}"]`).getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}, id);
const model = (fn, arg) => page.evaluate(fn, arg);
/** The screen point halfway along a link's drawn path. */
const linkMid = (id) => page.evaluate((id) => {
  const path = document.querySelector(`[data-link-id="${id}"] path.diagram-link, [data-link-id="${id}"] path`);
  const len = path.getTotalLength();
  const p = path.getPointAtLength(len / 2);
  const m = path.getScreenCTM();
  return { x: p.x * m.a + p.y * m.c + m.e, y: p.x * m.b + p.y * m.d + m.f };
}, id);

await shot('01-boot');

// ── 1. "+" on a free output → the HOST's menu → the step is added AND placed ──
{
  const plus = page.locator('.grafloria-port-add[data-port-id="route:r2"]');
  const box = await plus.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
  await page.mouse.down();
  await page.mouse.up();
  await settle(150);
  const menuOpen = await page.locator('.we-menu').isVisible();
  await shot('02-port-plus-menu');
  check('PORT-PLUS-MENU', menuOpen, 'the "+" on route:r2 opens the page\'s own menu');
  await page.locator('.we-menu [data-kind="http"]').click({ timeout: 2000 }).catch(() => {}); // no menu = the case above is already red
  await settle(500);
  const r = await model(() => {
    const m = window.__we.api.getModel();
    const added = m.getNodes().find((n) => n.type === 'http');
    const link = added && m.getLinks().find((l) => l.targetPortId === `${added.id}:in`);
    const route = m.getNode('route');
    const others = m.getNodes().filter((n) => n !== added);
    const hit = added && others.find((o) => added.position.x < o.position.x + o.size.width && o.position.x < added.position.x + added.size.width && added.position.y < o.position.y + o.size.height && o.position.y < added.position.y + added.size.height);
    return { id: added?.id, from: link?.sourcePortId, rightOf: added && added.position.x >= route.position.x + route.size.width, below: added && added.position.y > m.getNode('agent').position.y, overlap: hit?.id ?? null };
  });
  check('PORT-PLUS-ADDS-AND-PLACES', r.from === 'route:r2' && r.rightOf && r.below && !r.overlap, JSON.stringify(r));
  await shot('03-added-and-placed');
}

// ── 2. hover a wire → "+" and × at its middle; they survive the move onto them ──
{
  const mid = await linkMid('e3');
  await page.mouse.move(mid.x - 40, mid.y - 40, { steps: 5 });
  await page.mouse.move(mid.x, mid.y, { steps: 10 });
  await settle(200);
  const shown = await page.locator('.grafloria-link-add').isVisible().catch(() => false);
  const add = await page.locator('.grafloria-link-add').boundingBox();
  if (add) await page.mouse.move(add.x + add.width / 2, add.y + add.height / 2, { steps: 6 });
  await settle(200);
  const stays = await page.locator('.grafloria-link-add').isVisible().catch(() => false);
  await shot('04-link-hover');
  check('LINK-HOVER-BUTTONS', shown && stays && (await page.locator('.grafloria-link-delete').isVisible()), `shown=${shown} staysOnMove=${stays}`);
  await page.mouse.down();
  await page.mouse.up();
  await settle(150);
  await page.locator('.we-menu [data-kind="set"]').click({ timeout: 2000 }).catch(() => {});
  await settle(500);
  const r = await model(() => {
    const m = window.__we.api.getModel();
    const set = m.getNodes().find((n) => n.type === 'set');
    return { e3: !!m.getLink('e3'), set: !!set, into: set && m.getLinks().some((l) => l.sourcePortId === 'urgent:false' && l.targetPortId === `${set.id}:in`), out: set && m.getLinks().some((l) => l.sourcePortId === `${set.id}:out` && l.targetPortId === 'mail:in') };
  });
  check('LINK-PLUS-INSERTS', !r.e3 && r.set && r.into && r.out, JSON.stringify(r));
  await shot('05-inserted');
  await page.mouse.click(700, 860); // a blank spot, so the keys reach the canvas
  await page.keyboard.press('Control+z');
  await settle(300);
  const back = await model(() => ({ e3: !!window.__we.api.getModel().getLink('e3'), set: window.__we.api.getModel().getNodes().some((n) => n.type === 'set') }));
  check('INSERT-ONE-UNDO', back.e3 && !back.set, JSON.stringify(back));
}

// ── 3. "+ rule" on the Switch: a row, an output level with it, one undo ────────
{
  await page.locator('.grafloria-node-host[data-node-id="route"] [data-act="add-rule"]').click();
  await settle(350);
  const r = await model(() => {
    const api = window.__we.api, m = api.getModel(), node = m.getNode('route');
    const host = document.querySelector('.grafloria-node-host[data-node-id="route"]');
    const rows = [...host.querySelectorAll('.we-row')];
    const hr = host.getBoundingClientRect(), scale = hr.width / node.size.width;
    const offs = rows.map((row, i) => {
      const rr = row.getBoundingClientRect();
      const y = node.getPort(`route:r${i}`)?.layout?.args?.y;
      return Math.abs(hr.top + y * scale - (rr.top + rr.height / 2));
    });
    return { rows: rows.length, outs: [...node.ports.values()].filter((p) => p.type === 'output').length, worst: Math.max(...offs) };
  });
  await shot('06-rule-added');
  check('RULE-ADD-PORT-LEVEL', r.rows === 4 && r.outs === 4 && r.worst <= 1.5, JSON.stringify(r));
  await page.mouse.click(700, 860);
  await page.keyboard.press('Control+z');
  await settle(300);
  const after = await model(() => [...window.__we.api.getModel().getNode('route').ports.values()].filter((p) => p.type === 'output').length);
  check('RULE-ONE-UNDO', after === 3, `outputs after undo: ${after}`);
}

// ── 4. a REAL drag into a slot that refuses: the reason, beside the slot ───────
{
  const from = await nodeBox('mail');
  const agent = await nodeBox('agent');
  const memory = await page.evaluate(() => {
    const r = document.querySelector('.grafloria-node-host[data-node-id="agent"] [data-port="agent:memory"]').getBoundingClientRect();
    return r.left + r.width / 2;
  });
  await page.mouse.move(from.x + from.w, from.y + from.h / 2, { steps: 4 });
  await page.mouse.down();
  await page.mouse.move(memory, agent.y + agent.h - 30, { steps: 18 });
  await page.mouse.move(memory, agent.y + agent.h, { steps: 6 });
  await settle(120);
  const reason = await page.locator('.grafloria-connect-reason').textContent().catch(() => null);
  const inside = await page.evaluate(() => {
    const l = document.querySelector('.grafloria-connect-reason')?.getBoundingClientRect();
    const c = document.getElementById('canvas').getBoundingClientRect();
    return !!l && l.left >= c.left && l.right <= c.right && l.top >= c.top && l.bottom <= c.bottom;
  });
  check('REASON-STAYS-ON-CANVAS', inside, 'the reason label is fully inside the canvas (it flips near the right edge)');
  await shot('07-refused-with-reason');
  await page.mouse.up();
  await settle(150);
  const links = await model(() => window.__we.api.getModel().getLinks().filter((l) => l.targetPortId === 'agent:memory').length);
  const gone = (await page.locator('.grafloria-connect-reason').count()) === 0;
  check('REFUSED-SAYS-WHY', reason === 'Only a window memory plugs into the Memory slot' && links === 0 && gone, `reason="${reason}" links=${links} goneAfter=${gone}`);
}

// ── 5. a run streams over the flow; the document never changes ─────────────────
{
  const before = await model(() => ({ doc: JSON.stringify(window.__we.api.getModel().serialize()), undo: window.__we.api.getEngine().commandManager.canUndo() }));
  await page.locator('#btn-run').click();
  await settle(1000);
  const mid = await model(() => [...document.querySelectorAll('.grafloria-run-frame')].map((f) => f.getAttribute('data-status')));
  await shot('08-run-mid');
  await page.waitForFunction(() => /run finished/.test(document.getElementById('readout').textContent), { timeout: 15000 });
  const end = await model(() => ({
    statuses: [...document.querySelectorAll('.grafloria-run-frame')].map((f) => f.getAttribute('data-status')),
    labels: [...document.querySelectorAll('.grafloria-run-label')].map((l) => l.textContent),
    doc: JSON.stringify(window.__we.api.getModel().serialize()),
    undo: window.__we.api.getEngine().commandManager.canUndo(),
  }));
  await shot('09-run-done');
  check('RUN-STREAMS', mid.includes('running') && mid.includes('completed') && end.statuses.every((s) => s === 'completed') && end.labels.length >= 4, `mid=[${[...new Set(mid)]}] end=[${[...new Set(end.statuses)]}] labels=${end.labels.length}`);
  check('RUN-NOT-IN-DOCUMENT', end.doc === before.doc && end.undo === before.undo, 'serialized document and undo stack unchanged');
}

// ── 5b. editable: a real drag on a card (even on one of its rows) moves it, and the overlay follows ──
{
  await page.locator('#btn-run').click();
  await page.waitForFunction(() => /run finished/.test(document.getElementById('readout').textContent), { timeout: 15000 });
  const b = await nodeBox('urgent');
  const x0 = await model(() => window.__we.api.getModel().getNode('urgent').position.x);
  await page.mouse.move(b.x + b.w / 2, b.y + b.h - 20, { steps: 3 }); // on the "false" row
  await page.mouse.down();
  await page.mouse.move(b.x + b.w / 2 + 50, b.y + b.h - 20, { steps: 12 });
  await page.mouse.up();
  await settle(150);
  const r = await model(() => {
    const n = window.__we.api.getModel().getNode('urgent');
    const f = document.querySelector('.grafloria-run-frame[data-node-id="urgent"]');
    return { x: n.position.x, frameLeft: f ? parseFloat(f.style.left) : null };
  });
  check('DRAG-MOVES-CARD', Math.abs(r.x - x0 - 50) <= 2 && r.frameLeft !== null && Math.abs(r.frameLeft - (r.x - 3)) < 0.5, `moved ${Math.round(r.x - x0)} px, run frame at ${r.frameLeft} for card x ${r.x}`);
  await page.keyboard.press('Control+z');
  await settle(200);
}

// ── 6. read-only: no "+", a real drag moves nothing, double-click still opens ──
{
  await page.locator('#btn-ro').click();
  await settle(200);
  const plus = await page.locator('.grafloria-port-add').count();
  const b = await nodeBox('mail');
  const x0 = await model(() => window.__we.api.getModel().getNode('mail').position.x);
  await page.mouse.move(b.x + 40, b.y + 20, { steps: 3 });
  await page.mouse.down();
  await page.mouse.move(b.x + 160, b.y + 80, { steps: 12 });
  await page.mouse.up();
  const x1 = await model(() => window.__we.api.getModel().getNode('mail').position.x);
  await page.mouse.dblclick(b.x + 40, b.y + 20);
  await settle(150);
  const details = await page.locator('#details').isVisible();
  await shot('10-read-only');
  check('READ-ONLY', plus === 0 && x0 === x1 && details, `plus=${plus} moved=${x1 - x0} details=${details}`);
  if (await page.locator('#details').isVisible()) await page.locator('#details .close').click();
  await page.locator('#btn-ro').click();
}

// ── 6b. the page owns its keys: Delete on the trigger is refused by beforeKey ──
{
  const t = await nodeBox('trigger');
  await page.mouse.click(t.x + 30, t.y + 20);
  await page.keyboard.press('Delete');
  await settle(200);
  const r = await model(() => ({ exists: !!window.__we.api.getModel().getNode('trigger'), said: document.getElementById('readout').textContent }));
  check('BEFOREKEY-REFUSES', r.exists && /trigger stays/.test(r.said), JSON.stringify(r));
  await page.mouse.click(700, 860);
}

// ── 7. the wheel zooms far out → compact cards ─────────────────────────────────
{
  await page.mouse.move(720, 500);
  for (let i = 0; i < 12; i++) {
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, 240);
    await page.keyboard.up('Control');
    await page.waitForTimeout(40);
  }
  await settle(250);
  const r = await model(() => ({ zoom: window.__we.api.viewport.getZoom(), lod: document.querySelector('.grafloria-node-host[data-node-id="route"]').getAttribute('data-lod'), mini: !!document.querySelector('.grafloria-node-host[data-node-id="route"] .we-mini') }));
  await shot('11-compact');
  check('COMPACT-BELOW', r.zoom < 0.6 && r.lod === 'compact' && r.mini, JSON.stringify(r));
}

// ── 8. Tidy keeps port order ───────────────────────────────────────────────────
{
  await page.evaluate(() => window.__we.api.fitView?.({ padding: 48 }));
  await page.locator('#btn-tidy').click();
  await settle(700);
  const r = await model(() => {
    const m = window.__we.api.getModel(), y = (id) => m.getNode(id).position.y;
    return { trueAboveFalse: y('route') < y('mail'), rulesInOrder: y('notify') < y('agent') };
  });
  await shot('12-tidy');
  check('TIDY-PORT-ORDER', r.trueAboveFalse && r.rulesInOrder, JSON.stringify(r));
}
await ctx.close();

// ── 9. dark: the same page, the same run, its own palette ──────────────────────
{
  const dark = await open('dark');
  await dark.page.screenshot({ path: join(SHOTS, '13-dark-boot.png') });
  await dark.page.locator('#btn-run').click();
  await dark.page.waitForTimeout(1300);
  await dark.page.screenshot({ path: join(SHOTS, '14-dark-run.png') });
  const bg = await dark.page.evaluate(() => getComputedStyle(document.querySelector('.we-card')).backgroundColor);
  check('DARK-PALETTE', bg !== 'rgb(255, 255, 255)', `card background ${bg}`);
  await dark.ctx.close();
}

await browser.close();
server.close();

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.name.padEnd(26)} ${r.detail}`);
if (pageErrors.length) console.log(`\npage errors: ${pageErrors.slice(0, 3).join(' | ')}`);
console.log(`\nworkflow-editor: ${results.length - failed.length}/${results.length} cases pass · shots → ${SHOTS}`);
if (failed.length || pageErrors.length) {
  console.log('\nA FLOW EDITOR THAT WORKS THROUGH THE API BUT NOT UNDER A HAND is broken. This is the gate.');
  process.exit(1);
}
