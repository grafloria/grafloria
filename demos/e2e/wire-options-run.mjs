// GATE — three wire options a flow editor asked for, under a real mouse.
//
//  6. `affordances.linkButtons: 'selected'`: on a short (88 px) link no button
//     covers the line, so a click ANYWHERE along it selects the link and presses
//     nothing; the buttons come once it is selected.
//  7. `data-port-anchor="element"`: a right port on a card that draws past its
//     edge sits AT its element, and the wire starts there (not on the box edge).
//  8. `affordances.portAddOffset`: the free output's "+" sits 70 px from its port.
//
// Needs `demos/shell/grafloria.js` built from current libs (`node demos/build.mjs`).
// `WIRE_ROOT=<dir>` serves another root holding the same page and a `shell/` —
// how the gate is shown failing on an older build.

import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { dirname, extname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const demosRoot = process.env.WIRE_ROOT ?? join(here, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  try {
    const path = join(demosRoot, url.slice(1));
    res.writeHead(200, { 'Content-Type': MIME[extname(path)] ?? 'application/octet-stream' }).end(readFileSync(path));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const checks = [];
const check = (name, ok, detail) => {
  checks.push(ok);
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 1100 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
await page.goto(`${origin}/e2e/wire-options.html`);
await page.waitForFunction(() => window.ready === true, { timeout: 30000 });
await page.waitForTimeout(400);

/** The screen point at fraction `t` along a link's drawn path. */
const along = (host, id, t) => page.evaluate(([host, id, t]) => {
  const el = document.querySelector(`#${host} [data-link-id="${id}"] path.diagram-link, #${host} [data-link-id="${id}"] path:not(.link-hit-area)`);
  const q = el.getPointAtLength(el.getTotalLength() * t), m = el.getScreenCTM();
  return { x: q.x * m.a + q.y * m.c + m.e, y: q.x * m.b + q.y * m.d + m.f, len: el.getTotalLength() };
}, [host, id, t]);

// ── 6. a click anywhere along an 88 px link selects it and presses nothing ───────
{
  const empty = await page.locator('#c6').boundingBox();
  const { len } = await along('c6', 'ab', 0.5);
  const misses = [];
  for (const t of [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]) {
    await page.mouse.click(empty.x + 700, empty.y + 220); // clear the selection
    await page.evaluate(() => (window.asked = []));
    const p = await along('c6', 'ab', t);
    await page.mouse.move(p.x, p.y - 30, { steps: 2 });
    await page.mouse.move(p.x, p.y, { steps: 3 }); // hover first, as a hand does
    await page.waitForTimeout(60);
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(80);
    const r = await page.evaluate(() => ({ state: window.c6.getModel().getLink('ab').state, asked: window.asked.length }));
    if (r.state !== 'selected' || r.asked) misses.push(`${t}:${r.state}/${r.asked}`);
  }
  check('SHORT-LINK-CLICK-SELECTS', misses.length === 0, `link ${Math.round(len)} px; misses ${misses.join(' ') || 'none'}`);
  const buttons = await page.locator('#c6 .grafloria-link-add, #c6 .grafloria-link-delete').count();
  check('SELECTED-LINK-SHOWS-BUTTONS', buttons === 2, `${buttons} buttons once selected`);
  await page.mouse.click(empty.x + 700, empty.y + 220);
  const p = await along('c6', 'ab', 0.5);
  await page.mouse.move(p.x, p.y, { steps: 4 });
  await page.waitForTimeout(120);
  const onHover = await page.locator('#c6 .grafloria-link-add').count();
  check('NO-BUTTONS-ON-HOVER', onHover === 0, `${onHover} on hover`);
}

// ── 7. the port sits at its element; the wire starts there ────────────────────
{
  const dot = await page.locator('#c7 .dot').boundingBox();
  const cx = dot.x + dot.width / 2, cy = dot.y + dot.height / 2;
  const start = await along('c7', 'w', 0);
  const dx = Math.abs(start.x - cx), dy = Math.abs(start.y - cy);
  check('PORT-AT-ELEMENT', dx <= 1.5 && dy <= 1.5, `wire start ${start.x.toFixed(1)},${start.y.toFixed(1)} vs element ${cx.toFixed(1)},${cy.toFixed(1)}`);
  // The target sits level with it: the wire runs STRAIGHT, under the name — the
  // card's own box is not an obstacle for its inside port.
  const box = await page.evaluate(() => { const b = document.querySelector('#c7 [data-link-id="w"] path:not(.link-hit-area)').getBBox(); return { height: b.height }; });
  check('WIRE-RUNS-UNDER-THE-NAME', box.height <= 2, `wire bbox height ${box.height.toFixed(1)} px`);
  // …and the stretch under the name is the link's own: a click there selects it.
  await page.mouse.click(cx + 24, cy);
  await page.waitForTimeout(120);
  const state = await page.evaluate(() => window.c7.getModel().getLink('w').state);
  check('NAME-STRETCH-SELECTS-THE-LINK', state === 'selected', `state after a click 24 px past the port: ${state}`);
}

// ── 8. portAddOffset 70: the "+" is 44 px further out than the default 26 ──────
{
  const centre = async (host) => {
    const b = await page.locator(`#${host} .grafloria-port-add`).boundingBox();
    const h = await page.locator(`#${host}`).boundingBox();
    return b.x + b.width / 2 - h.x;
  };
  const base = await centre('c8a'), seventy = await centre('c8b');
  const zoom = await page.evaluate(() => window.c8b.viewport.getZoom());
  const gap = (seventy - base) / zoom;
  check('PORT-ADD-OFFSET-70', Math.abs(gap - 44) <= 1, `"+" ${gap.toFixed(1)} px further out than the default (want 44 = 70 − 26)`);
}

await page.screenshot({ path: join(here, 'out', 'wire-options.png') }).catch(() => {});
await browser.close();
server.close();
if (errors.length) console.log(`  page errors: ${errors.join(' | ')}`);
const passed = checks.filter(Boolean).length;
console.log(passed === checks.length && !errors.length ? `wire-options: all ${passed} checks passed` : `wire-options: ${passed}/${checks.length} checks passed`);
if (passed !== checks.length || errors.length) process.exit(1);
