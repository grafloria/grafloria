// THUMBNAILS — every card in the gallery shows its demo, or the gate is red.
//
// The gallery's thumbnails were cropped by hand from full-page shots, once, and
// drifted: four whiteboard demos, drag-and-drop and shape-data showed an EMPTY
// canvas; uml-relationships showed stray line ends; a dozen more were a tiny box
// on a sea of white. Every one of them "loaded", so nothing noticed.
//
//   node demos/e2e/thumbs-run.mjs                 CHECK: every demo has a thumbnail
//                                                 and it shows something
//   node demos/e2e/thumbs-run.mjs --write [cat]   (re)make them: each demo driven
//                                                 to its showcase() state (else its
//                                                 first render), the DRAWN content
//                                                 found in its canvas, framed 5:3,
//                                                 written 1200×720 to demos/thumbs/
//
// Pixels are read in the browser (canvas getImageData) — no image library.

import { chromium } from 'playwright';
import { readdirSync, statSync, readFileSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join, relative, extname, sep } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const thumbsDir = join(root, 'thumbs');

const argv = process.argv.slice(2);
const write = argv.includes('--write');
const filter = argv.find((a) => !a.startsWith('--'));

// Thumbnail geometry: the card shows 600×360 (5:3); written at 2× for sharpness.
const OUT_W = 1200, OUT_H = 720;
// A thumbnail must SHOW its demo: drawn blocks over this share of the picture,
// and the drawing spanning at least this much of it ACROSS or DOWN (a chain of
// boxes is a wide strip — fine; a lone box in a sea of white is not a picture).
const MIN_INK = 0.015;
const MIN_SPREAD = 0.55;

function demoPages(dir = root, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (['shell', 'e2e', 'node_modules', 'thumbs'].includes(entry)) continue;
      demoPages(full, out);
    } else if (entry.endsWith('.html') && entry !== 'index.html') {
      out.push(full);
    }
  }
  return out;
}
const pages = demoPages().filter((p) => !filter || relative(root, p).startsWith(filter)).sort();
const thumbOf = (page) => join(thumbsDir, relative(root, page).replace(/\.html$/, '.png'));

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
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

/**
 * In-page pixel work on a PNG (base64): the background (the commonest colour),
 * the INK — 8×8 blocks with enough pixels off the background to be drawing, not
 * a grid dot — its bounding box, and, when asked, the 5:3 crop around it drawn
 * to OUT_W×OUT_H.
 */
async function analyse(tab, b64, { crop = false, minCrop = null } = {}) {
  return tab.evaluate(async ({ b64, crop, minCrop, OUT_W, OUT_H }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const W = img.naturalWidth, H = img.naturalHeight;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const px = g.getImageData(0, 0, W, H).data;
    const counts = new Map();
    for (let i = 0; i < px.length; i += 4 * 7) {
      const k = ((px[i] >> 3) << 10) | ((px[i + 1] >> 3) << 5) | (px[i + 2] >> 3);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    let bgKey = 0, best = -1;
    for (const [k, n] of counts) if (n > best) { best = n; bgKey = k; }
    const bg = [((bgKey >> 10) & 31) * 8 + 4, ((bgKey >> 5) & 31) * 8 + 4, (bgKey & 31) * 8 + 4];
    const B = 8, bw = Math.ceil(W / B), bh = Math.ceil(H / B);
    let inkBlocks = 0, x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
      let n = 0;
      for (let y = by * B; y < Math.min(H, by * B + B); y++) for (let x = bx * B; x < Math.min(W, bx * B + B); x++) {
        const i = (y * W + x) * 4;
        if (Math.abs(px[i] - bg[0]) + Math.abs(px[i + 1] - bg[1]) + Math.abs(px[i + 2] - bg[2]) > 90) n++;
      }
      if (n >= 6) {
        inkBlocks++;
        x0 = Math.min(x0, bx * B); y0 = Math.min(y0, by * B);
        x1 = Math.max(x1, bx * B + B); y1 = Math.max(y1, by * B + B);
      }
    }
    const ink = inkBlocks / (bw * bh);
    const spread = x1 < 0 ? 0 : Math.max((x1 - x0) / W, (y1 - y0) / H);
    const out = { W, H, ink, spread, bg };
    if (!crop || x1 < 0) return out;
    // the crop: the ink plus a margin, grown to 5:3 about its middle, never
    // smaller than minCrop (no blowing a lone box up), clamped to the shot
    const pad = Math.round(Math.min(W, H) * 0.04);
    let cx0 = x0 - pad, cy0 = y0 - pad, cx1 = x1 + pad, cy1 = y1 + pad;
    let cw = Math.max(cx1 - cx0, minCrop?.w ?? 0), ch = Math.max(cy1 - cy0, minCrop?.h ?? 0);
    if (cw / ch > OUT_W / OUT_H) ch = cw * OUT_H / OUT_W; else cw = ch * OUT_W / OUT_H;
    cw = Math.min(cw, W); ch = Math.min(ch, H);
    const mx = (cx0 + cx1) / 2, my = (cy0 + cy1) / 2;
    const sx = Math.max(0, Math.min(W - cw, mx - cw / 2)), sy = Math.max(0, Math.min(H - ch, my - ch / 2));
    const o = document.createElement('canvas');
    o.width = OUT_W; o.height = OUT_H;
    const og = o.getContext('2d');
    og.fillStyle = `rgb(${bg.join(',')})`;
    og.fillRect(0, 0, OUT_W, OUT_H);
    og.imageSmoothingQuality = 'high';
    const s = Math.min(OUT_W / cw, OUT_H / ch);
    og.drawImage(c, sx, sy, cw, ch, (OUT_W - cw * s) / 2, (OUT_H - ch * s) / 2, cw * s, ch * s);
    out.png = o.toDataURL('image/png').split(',')[1];
    return out;
  }, { b64, crop, minCrop, OUT_W, OUT_H });
}

async function settle(tab) {
  await tab.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 60)))));
}

async function freeze(tab) {
  await tab.addStyleTag({
    content: `*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }
      #grafloria-nav, #grafloria-nav-toggle { display: none !important; }
      body.nav-open { padding-left: 0 !important; }`,
  });
}

/** Drive a demo to its best frame and shoot the part that is the DEMO: its canvas. */
async function shoot(tab, page) {
  const rel = relative(root, page).split(sep).join('/');
  await tab.goto(`${origin}/${rel}`);
  await tab.waitForFunction(() => window.__demoReady === true, { timeout: 20000 });
  await freeze(tab);
  await settle(tab);
  const hasShowcase = await tab.evaluate(() => !!window.__demo?.showcase);
  if (hasShowcase) await tab.evaluate(async () => { try { await window.__demo.showcase(); } catch { /* shoot anyway */ } });
  await settle(tab);
  await settle(tab);
  const region = await tab.evaluate(() => {
    const host = document.getElementById('canvas');
    host?.scrollIntoView({ block: 'nearest' });
    const r = host?.getBoundingClientRect();
    const head = document.getElementById('demo-head')?.getBoundingClientRect();
    // the canvas as it sits on screen (a page may put its header BELOW it)
    if (r && r.width > 200 && r.height > 150) {
      const y0 = Math.max(0, r.y), y1 = Math.min(innerHeight, r.bottom);
      return { x: Math.max(0, r.x), y: y0, width: Math.min(r.width, innerWidth - Math.max(0, r.x)), height: y1 - y0 };
    }
    const top = Math.max(0, head ? head.bottom : 0);
    return { x: 0, y: top, width: innerWidth, height: innerHeight - top };
  });
  const buf = await tab.screenshot({ clip: region });
  return { buf, hasShowcase };
}

const problems = [];
// 3× so the crop can close in on a small drawing and still be sharp at 1200×720
const tab = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 3 });
tab.on('pageerror', () => {});
if (write) mkdirSync(thumbsDir, { recursive: true });

for (const page of pages) {
  const rel = relative(root, page).split(sep).join('/');
  const file = thumbOf(page);
  try {
    if (write) {
      const { buf, hasShowcase } = await shoot(tab, page);
      // never smaller than a 400×240 CSS-px window (1200×720 at 3×): framed, never blown up
      const a = await analyse(tab, buf.toString('base64'), { crop: true, minCrop: { w: 1200, h: 720 } });
      if (!a.png) { problems.push(`${rel}: nothing drawn in its canvas${hasShowcase ? ' even after showcase()' : ' — give it a showcase()'}`); continue; }
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, Buffer.from(a.png, 'base64'));
    }
    if (!existsSync(file)) { problems.push(`${rel}: no thumbnail (demos/thumbs/${rel.replace(/\.html$/, '.png')})`); continue; }
    const a = await analyse(tab, readFileSync(file).toString('base64'));
    const ok = a.ink >= MIN_INK && a.spread >= MIN_SPREAD;
    if (!ok) problems.push(`${rel}: shows almost nothing (ink ${(a.ink * 100).toFixed(1)}%, spread ${(a.spread * 100).toFixed(0)}%)`);
    else console.log(`  ok  ${rel}  ink ${(a.ink * 100).toFixed(1)}% spread ${(a.spread * 100).toFixed(0)}%`);
  } catch (e) {
    problems.push(`${rel}: ${String(e).split('\n')[0]}`);
  }
}

await browser.close();
server.close();
for (const p of problems) console.log(`  FAIL ${p}`);
console.log(`\nthumbnails: ${pages.length - problems.length}/${pages.length} demos show their demo`);
process.exit(problems.length ? 1 : 0);
