// EVERY POINT, DROPPED FOR REAL: inside the panel, outside it, all around it.
// At each point: what the kit SHOWS while held, then release, then what it DID,
// then undo. The invariant under test is that they agree, every time, and that
// no drop ever leaves an overlap or an escaped tile.
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
const arg = (k, d) => { const a = process.argv.find((s) => s.startsWith(k + '=')); return a ? Number(a.slice(k.length + 1)) : d; };
const origin = process.argv.includes('live') ? 'https://grafloria.com' : 'http://localhost:8123';
const out = process.argv.find((a) => a.startsWith('out='))?.slice(4) ?? '/tmp/dropmap.json';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1400 }, colorScheme: process.argv.includes('dark') ? 'dark' : 'light' });
const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(`${origin}/demos/dashboard/fluid-board.html`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1400);

const snap = () => page.evaluate(() => {
  const g = (q) => { const e = document.querySelector(q); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right), bottom: Math.round(r.bottom) }; };
  const hosts = [...document.querySelectorAll('.grafloria-node-host')].filter((h) => { const r = h.getBoundingClientRect(); return r.width > 4 && r.x > -5000; }); // parked tab pages sit at -20000
  let overlaps = 0;
  const rs = hosts.map((h) => h.getBoundingClientRect());
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
    const a = rs[i], c = rs[j];
    if (a.x < c.right - 4 && c.x < a.right - 4 && a.y < c.bottom - 4 && c.y < a.bottom - 4) overlaps++;
  }
  return {
    side: g('.axdb-slab[data-slab-id="side"]'), nps: g('.grafloria-node-host[data-node-id="nps"]'),
    strip: g('.axdb-tabs[data-tabs-id="side"]'),
    tabs: [...document.querySelectorAll('.axdb-tabs[data-tabs-id="side"] .axdb-tab')].map((t) => t.textContent.trim()),
    count: hosts.length, overlaps,
  };
});
const held = () => page.evaluate(() => {
  const slab = document.querySelector('.axdb-slab[data-slab-id="side"]');
  return {
    lanes: document.querySelectorAll('.axdb-lanes > .axdb-lane').length,
    mark: !!document.querySelector('.axdb-join'),
    tab: !!document.querySelector('.axdb-tabs[data-tabs-id="side"]')?.classList.contains('axdb-tabs--drop'),
    // the LEFT and RIGHT bands promise by sliding the panel, not by marking
    slabTop: Math.round(parseFloat(slab.style.top)),
    slabLeft: Math.round(parseFloat(slab.style.left)),
  };
});

const rest = await snap();
const S = rest.side, N0 = rest.nps;
console.log(`panel ${S.x}..${S.right} x ${S.y}..${S.bottom} · strip to ${rest.strip.bottom} · nps at ${N0.x},${N0.y} · ${rest.count} widgets · tabs [${rest.tabs}]`);
const restKey = JSON.stringify([rest.side, rest.nps, rest.tabs, rest.count]);
const restSlab = await page.evaluate(() => { const s = document.querySelector('.axdb-slab[data-slab-id="side"]'); return { top: Math.round(parseFloat(s.style.top)), left: Math.round(parseFloat(s.style.left)) }; });
console.log(`rest overlaps: ${rest.overlaps}`);

const x0 = arg('x0', S.x - 130), x1 = arg('x1', S.right + 8), dx = arg('dx', 44);
const y0 = arg('y0', S.y - 70), y1 = arg('y1', S.bottom + 70), dy = arg('dy', 70);
const rows = [];
let n = 0, bad = 0;
for (let y = y0; y <= y1; y += dy) {
  for (let x = x0; x <= x1; x += dx) {
    const before = await snap();
    await page.mouse.move(N0.x + N0.w / 2, N0.y + N0.h / 2);
    await page.mouse.down();
    await page.mouse.move(N0.x + N0.w / 2 + 22, N0.y + N0.h / 2 + 10, { steps: 2 });
    await page.mouse.move(x, y);
    await page.waitForTimeout(130);
    const shown = await held();
    shown.slid = shown.slabTop !== restSlab.top || shown.slabLeft !== restSlab.left;
    await page.mouse.up();
    await page.waitForTimeout(420);
    const after = await snap();
    // what actually happened
    const tabbed = after.tabs.length > before.tabs.length;
    const moved = !!after.nps && !!before.nps && (after.nps.x !== before.nps.x || after.nps.y !== before.nps.y);
    const panelMoved = after.side.y !== before.side.y || after.side.x !== before.side.x;
    let did = 'nothing';
    if (tabbed) did = 'tab';
    else if (!after.nps) did = 'gone';
    else if (after.nps.x >= after.side.x - 4 && after.nps.right <= after.side.right + 4 && after.nps.y > after.side.y + 30 && after.nps.bottom <= after.side.bottom + 4) did = 'page';
    // ABOVE and BELOW are geometry, not movement: a panel with free space under
    // it does not have to move for a widget to land below it.
    else if (after.nps.bottom <= after.side.y + 6 && after.nps.right > after.side.x + 6 && after.nps.x < after.side.right - 6) did = 'above';
    else if (after.nps.y >= after.side.bottom - 6 && after.nps.right > after.side.x + 6 && after.nps.x < after.side.right - 6) did = 'below';
    else if (panelMoved) did = 'beside';
    else if (moved) did = 'board';
    // WHAT WAS PROMISED, and whether the drop kept it
    const promised = shown.tab ? 'a new tab' : shown.mark ? 'above/below (marked)' : shown.slid ? 'beside (the panel slid)' : 'the page or the board';
    const agrees = shown.tab ? did === 'tab'
      : shown.mark ? (did === 'above' || did === 'below')  // the marked cell, taken
      : shown.slid ? did === 'beside'
      : (did === 'page' || did === 'board' || did === 'nothing');
    // put it back
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
    await page.waitForTimeout(420);
    let back = await snap();
    if (JSON.stringify([back.side, back.nps, back.tabs, back.count]) !== restKey) {
      await page.goto(`${origin}/demos/dashboard/fluid-board.html`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1100);
      back = await snap();
    }
    const restored = JSON.stringify([back.side, back.nps, back.tabs, back.count]) === restKey;
    if (!agrees || after.overlaps > 0 || !restored) bad++;
    rows.push({ x, y, shown, did, promised, agrees, overlaps: after.overlaps, restored, count: after.count });
    n++;
  }
  process.stdout.write(`\r  ${n} drops · row y=${y} · disagreements/overlaps/undo-failures so far: ${bad}   `);
}
console.log('');
writeFileSync(out, JSON.stringify({ rest, x0, x1, dx, y0, y1, dy, rows, errors: errs }, null, 1));
console.log(`${rows.length} real drops -> ${out} · page errors ${errs.length}`);
await browser.close();
