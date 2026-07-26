// Master-sheet gate — EVERY master in the palette, placed on one grid and
// measured as PAINTED, not as declared.
//
// The stencil-fidelity audit found a whole class of masters that passed every
// unit test and still rendered garbage: "onnect" clipped inside an 18px
// connector circle, "xclusiv iatewa" crammed into a gateway diamond, a caption
// struck through an 8px fork bar, a «signal» card's rows escaping its
// silhouette. Nothing asserted the RENDERED text against the RENDERED shape —
// this runner does, for all masters at once:
//
//   (a) INK      — the node's group exists, has children, and paints a body
//                  bigger than 2px in both dimensions;
//   (b) CAPTION  — the caption is visible and UNCLIPPED: its bbox fits fully
//                  inside the silhouette (inside labels honour their clip
//                  rect), or fully BELOW it (labelPlacement 'below'), never
//                  straddling the edge; and its rendered width is >= 60% of
//                  what the same string measures off-DOM (not truncated);
//   (c) OVERFLOW — no child ink paints outside the node's declared bounds by
//                  more than 2px (the signal-overflow class).
//
//     node demos/e2e/master-sheet-run.mjs [--shots <dir>]

import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, extname } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const shotsArg = process.argv.indexOf('--shots');
const SHOTS = shotsArg > -1 ? process.argv[shotsArg + 1] : join(here, 'out', 'master-sheet');
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

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1680, height: 950 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 200)));
await page.goto(`${origin}/diagrams/visio-editor.html`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__demoReady === true, { timeout: 30000 });
await page.waitForTimeout(200);

// The palette rail itself is part of what ships — keep its picture.
await page.locator('#vs-rail').screenshot({ path: join(SHOTS, 'palette-rail.png') });

// ── 1. clear the seeded scenario, place EVERY master on a grid ──────────────
const placed = await page.evaluate(async () => {
  const c = window.__demoCtx, m = c.diagram;
  for (const l of [...m.getLinks()]) m.removeLink(l.id);
  for (const n of [...m.getNodes()]) m.removeNode(n.id);
  for (const g of [...m.getGroups()]) m.removeGroup(g.id);
  c.instance.renderNow();
  // Every master the rail advertises — collapsed sections keep their items in
  // the DOM, so this enumerates the FULL set, and grows with the stencils.
  const ids = [...document.querySelectorAll('#vs-rail .gf-stencil-item')]
    .map((el) => el.dataset['masterId'])
    .filter(Boolean);
  const out = [];
  const COLS = 8, DX = 230, DY = 180;
  for (let i = 0; i < ids.length; i++) {
    const nodeId = await c.palette.place(ids[i], { x: 120 + (i % COLS) * DX, y: 100 + Math.floor(i / COLS) * DY });
    out.push({ master: ids[i], nodeId });
  }
  c.instance.renderNow();
  // The renderer CULLS off-viewport nodes — fit BEFORE any DOM assertion.
  c.instance.fitView(40);
  c.instance.renderNow();
  return out;
});
await page.waitForTimeout(500);

if (placed.length < 80) {
  console.log(`only ${placed.length} masters on the rail (expected >= 80)`);
  process.exit(1);
}

// ── 2. measure every master's painted geometry ──────────────────────────────
// One master at a time, camera fitted to IT at zoom 1: the renderer's LOD
// tiers drop labels at far zoom (correctly — 80 tiny captions are noise), so
// a whole-sheet measurement sees no captions at all. The audit's own contract
// is "legible at 100% zoom", and zoom 1 is where these assertions run.
const report = await page.evaluate(async (placed) => {
  const c = window.__demoCtx;
  const registry = c.instance.getEngine().templateRegistry;
  const meas = document.createElement('canvas').getContext('2d');
  const norm = (s) => String(s ?? '').replace(/\s+/g, '').toLowerCase();
  const raf2 = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const out = [];

  for (const { master, nodeId } of placed) {
    const row = { master, checks: {}, notes: [] };
    out.push(row);
    const fail = (k, why) => { row.checks[k] = false; row.notes.push(`${k}: ${why}`); };
    const pass = (k) => { row.checks[k] = row.checks[k] !== false; };

    if (!nodeId) { fail('placed', 'palette.place returned null'); continue; }
    pass('placed');
    const n = c.diagram.getNode(nodeId);
    const w = n.size.width, h = n.size.height;
    // Camera on THIS master, zoom capped at 1 (fitToBounds would blow a 20px
    // dot up past it); margin holds the below-label in frame too.
    const p = n.getWorldPosition ? n.getWorldPosition() : n.position;
    c.instance.viewport.fitToBounds(
      { x: p.x - 60, y: p.y - 60, width: w + 120, height: h + 120 }, 20, { maxZoom: 1 });
    c.instance.renderNow();
    await raf2();
    const g = document.querySelector(`[data-node-id="${nodeId}"]`);

    // (a) INK — group exists, has children, paints a body.
    if (!g) { fail('ink', 'no DOM group'); continue; }
    if (g.querySelectorAll('*').length === 0) { fail('ink', 'group is empty'); continue; }
    const isFurniture = (el) =>
      /port|handle|selection|shadow/i.test(String(el.getAttribute('class') || '')) ||
      !!el.closest('clipPath') || !!el.closest('.gf-label-below') ||
      !!el.closest('.diagram-label') || el.tagName === 'text';
    let ink = null;
    for (const el of g.querySelectorAll('path,rect,circle,ellipse,polygon,polyline,line,image,foreignObject')) {
      if (isFurniture(el)) continue;
      const b = el.getBBox();
      if (b.width === 0 && b.height === 0) continue;
      ink = ink
        ? { x: Math.min(ink.x, b.x), y: Math.min(ink.y, b.y), r: Math.max(ink.r, b.x + b.width), b: Math.max(ink.b, b.y + b.height) }
        : { x: b.x, y: b.y, r: b.x + b.width, b: b.y + b.height };
    }
    if (!ink || ink.r - ink.x <= 2 || ink.b - ink.y <= 2) {
      fail('ink', ink ? `body only ${(ink.r - ink.x).toFixed(1)}x${(ink.b - ink.y).toFixed(1)}` : 'no painted body');
    } else pass('ink');

    // (c) OVERFLOW — ink stays inside the declared bounds (±2 local px).
    if (ink) {
      const over = Math.max(-2 - ink.x, -2 - ink.y, ink.r - w - 2, ink.b - h - 2);
      if (over > 0) fail('overflow', `ink [${ink.x.toFixed(1)},${ink.y.toFixed(1)}..${ink.r.toFixed(1)},${ink.b.toFixed(1)}] vs ${w}x${h} (+${over.toFixed(1)}px)`);
      else pass('overflow');
    }

    // (b) CAPTION — visible, unclipped, not truncated.
    const label = String(n.getLabel?.() ?? '') || String(registry.get(master)?.meta?.name ?? '');
    const belowEl = g.querySelector('.gf-label-below');
    let cap = belowEl;
    if (!cap) {
      cap = [...g.querySelectorAll('text')].find((t) => label && norm(t.textContent).includes(norm(label))) ?? null;
    }
    let htmlCap = null;
    if (!cap) {
      // Kit cards paint their caption as sanitized HTML inside a foreignObject.
      htmlCap = [...g.querySelectorAll('foreignObject *')]
        .filter((el) => el.children.length === 0 && label && norm(el.textContent).includes(norm(label)))[0] ?? null;
    }
    if (!cap && !htmlCap) { fail('caption', `no rendered caption for label "${label}"`); continue; }

    if (htmlCap) {
      // HTML caption: the browser's own truncation signals beat any estimate.
      const cs = getComputedStyle(htmlCap);
      if (cs.display === 'none' || cs.visibility === 'hidden') fail('caption', 'html caption hidden');
      else if (htmlCap.scrollWidth > htmlCap.clientWidth + 2 || htmlCap.scrollHeight > htmlCap.clientHeight + 4) {
        fail('caption', `html caption truncated (scroll ${htmlCap.scrollWidth}x${htmlCap.scrollHeight} vs client ${htmlCap.clientWidth}x${htmlCap.clientHeight})`);
      } else pass('caption');
      continue;
    }

    const cs = getComputedStyle(cap);
    if (cs.display === 'none' || cs.visibility === 'hidden') { fail('caption', 'caption hidden'); continue; }
    const cb = cap.getBBox();
    if (cb.width <= 0 || cb.height <= 0) { fail('caption', 'caption has no ink'); continue; }

    // Placement: fully inside the silhouette (honouring the label's clip rect,
    // the thing that actually shears glyphs — getBBox ignores clipping), or
    // fully below it. Never straddling the edge.
    if (cap === belowEl) {
      if (cb.y < h - 2) { fail('caption', `below-label straddles the edge (top ${cb.y.toFixed(1)} vs h ${h})`); continue; }
    } else {
      let box = { x: -2, y: -2, r: w + 2, b: h + 2 };
      const clipRef = String(cap.getAttribute('clip-path') || '').match(/url\(["']?#([^"')]+)/);
      const clipRect = clipRef ? g.querySelector(`clipPath[id="${clipRef[1]}"] rect`) : null;
      if (clipRect) {
        const r = clipRect.getBBox();
        box = { x: r.x - 2, y: r.y - 2, r: r.x + r.width + 2, b: r.y + r.height + 2 };
      }
      if (cb.x < box.x || cb.y < box.y || cb.x + cb.width > box.r || cb.y + cb.height > box.b) {
        fail('caption', `inside-label escapes its box: text [${cb.x.toFixed(1)},${cb.y.toFixed(1)} ${cb.width.toFixed(1)}x${cb.height.toFixed(1)}] vs [${box.x.toFixed(1)},${box.y.toFixed(1)}..${box.r.toFixed(1)},${box.b.toFixed(1)}]`);
        continue;
      }
    }

    // Truncation: the rendered glyph run must measure >= 60% of the same
    // string off-DOM at the same font (an ellipsised/clipped caption cannot).
    const spans = cap.querySelectorAll('tspan');
    const rendered = spans.length
      ? [...spans].reduce((s, t) => s + t.getComputedTextLength(), 0)
      : cap.getComputedTextLength();
    meas.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const offDom = meas.measureText(label).width;
    if (offDom > 0 && rendered < offDom * 0.6) {
      fail('caption', `caption measures ${rendered.toFixed(0)}px rendered vs ${offDom.toFixed(0)}px off-DOM (<60%)`);
    } else pass('caption');
  }
  return out;
}, placed);

// ── 3. contact sheets: the full grid + two zoomed bands ─────────────────────
await page.evaluate(() => {
  const c = window.__demoCtx;
  c.instance.fitView(40);
  c.instance.renderNow();
});
await page.waitForTimeout(300);
await page.screenshot({ path: join(SHOTS, 'sheet-full.png') });
for (const [i, name] of [[0, 'sheet-band-top'], [1, 'sheet-band-bottom']].values()) {
  await page.evaluate((half) => {
    const c = window.__demoCtx;
    const nodes = c.diagram.getNodes();
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const n of nodes) {
      const p = n.getWorldPosition ? n.getWorldPosition() : n.position;
      x1 = Math.min(x1, p.x); y1 = Math.min(y1, p.y);
      x2 = Math.max(x2, p.x + n.size.width); y2 = Math.max(y2, p.y + n.size.height);
    }
    const bandH = (y2 - y1) / 2 + 60;
    c.instance.viewport.fitToBounds(
      { x: x1 - 40, y: y1 + half * (bandH - 120) - 40, width: x2 - x1 + 80, height: bandH + 80 }, 20);
    c.instance.renderNow();
  }, i);
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(SHOTS, `${name}.png`) });
}

await browser.close();
server.close();

// ── 4. verdict ──────────────────────────────────────────────────────────────
let failures = 0;
for (const r of report) {
  const bad = Object.entries(r.checks).filter(([, ok]) => !ok);
  if (bad.length === 0) continue;
  failures++;
  console.log(`✗ ${r.master.padEnd(30)} ${r.notes.join(' · ')}`);
}
console.log(`\nmaster-sheet: ${report.length - failures}/${report.length} masters pass · shots → ${SHOTS}`);
if (pageErrors.length) console.log(`page errors: ${pageErrors.slice(0, 3).join(' | ')}`);
if (failures || pageErrors.length) {
  console.log('\nA MASTER THAT RENDERS GARBAGE fails the user in the first minute. This is the gate.');
  process.exit(1);
}
