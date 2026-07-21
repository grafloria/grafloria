// GATE — do external-URL images in PANEL-type DIAGRAM nodes reach the PDF?
//
// THE FEATURE THIS GUARDS (the tree pass; companion to export-fetch-run.mjs)
// --------------------------------------------------------------------------
// a0ddecfac fetched a WIDGET capture's external images and its report named the gap:
// a panel node (`metadata.panel.image.href` — an ERD avatar, a logo) emits
// `<image href="https://…">` inside the renderer's OWN VNode tree, built by the SYNC
// export path, so the async fetch pass never saw it. Now `await export(…)` enumerates
// the tree's URLs up front (`collectExportImageUrls`), fetches the UNION of tree and
// widget URLs through the same three tiers, and hands the resolved map down
// `ExportOptions.resolvedAssets` for the sync path's pure substitution.
//
// WHAT KEEPS THE TEETH SHARP
// --------------------------
//   - the success fixtures hold exactly ONE image, on a PANEL node, referenced by URL
//     only — NO widget anywhere on the board — so an image XObject in the PDF can have
//     no source but the tree pass ("what else could make this green?" — a widget
//     image could; there is none);
//   - the pixels are read back (pdftoppm): the SERVED color must paint;
//   - the DEDUPE case counts requests SERVER-SIDE inside an explicit window (counter
//     reset after mount, one export) with Cache-Control: no-store, so a broken dedupe
//     is observable as a second hit.
//
// Needs `demos/shell/grafloria.js` built from current libs (`node demos/build.mjs`).
// Serves demos/ on an EPHEMERAL port plus a second ephemeral origin for the
// CORS-blocked case (the user's demo server owns :4321 and is not touched).

import { chromium } from 'playwright';
import { createServer } from 'http';
import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { dirname, extname, join } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

const here = dirname(fileURLToPath(import.meta.url));
const demosRoot = join(here, '..');

const checks = [];
const check = (name, ok, detail) => {
  checks.push(ok);
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
};

// ---------------------------------------------------------------------------
// Servers.
//   MAIN     demos/ static files + same-origin asset routes, with a HIT COUNTER
//            (no-store, so every consumer must come to the server)
//   REMOTE   a second origin whose /cors-blocked/* sends no CORS header
// ---------------------------------------------------------------------------

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml' };

/** name → Buffer, filled once the page has generated the canvas PNGs. */
const assets = new Map();
/** name → how many times the MAIN server actually served it. */
const hits = new Map();

const mainServer = createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url.startsWith('/e2e-assets/')) {
    const name = url.slice('/e2e-assets/'.length);
    const body = assets.get(name);
    if (!body) return void res.writeHead(404).end();
    hits.set(name, (hits.get(name) ?? 0) + 1);
    // no-store: an HTTP cache serving the second consumer would hide a broken dedupe.
    return void res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' }).end(body);
  }
  const path = join(demosRoot, url === '/' ? 'index.html' : url.slice(1));
  try {
    const body = readFileSync(path);
    res.writeHead(200, { 'Content-Type': MIME[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => mainServer.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${mainServer.address().port}`;

const remoteServer = createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  const [, zone, name] = url.split('/');
  const body = assets.get(name);
  if (!body || zone !== 'cors-blocked') return void res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' }).end(body);
});
await new Promise((resolve) => remoteServer.listen(0, '127.0.0.1', resolve));
const remoteOrigin = `http://127.0.0.1:${remoteServer.address().port}`;

// ---------------------------------------------------------------------------
// Rasterization — poppler when present; otherwise say so PLAINLY and skip pixels.
// ---------------------------------------------------------------------------

const havePdftoppm = spawnSync('pdftoppm', ['-v']).status !== null;

function rasterize(bytes, tag) {
  if (!havePdftoppm) return null;
  const dir = mkdtempSync(join(tmpdir(), `grafloria-tree-${tag}-`));
  const pdfPath = join(dir, 'page.pdf');
  writeFileSync(pdfPath, bytes);
  const run = spawnSync('pdftoppm', ['-r', '100', '-f', '1', '-l', '1', pdfPath, join(dir, 'out')]);
  const ppmName = run.status === 0 ? readdirSync(dir).find((f) => f.endsWith('.ppm')) : null;
  if (!ppmName) {
    rmSync(dir, { recursive: true, force: true });
    return null;
  }
  const ppm = readFileSync(join(dir, ppmName));
  rmSync(dir, { recursive: true, force: true });
  let pos = 0;
  const token = () => {
    while (/\s/.test(String.fromCharCode(ppm[pos]))) pos++;
    let start = pos;
    while (pos < ppm.length && !/\s/.test(String.fromCharCode(ppm[pos]))) pos++;
    return ppm.toString('latin1', start, pos);
  };
  if (token() !== 'P6') return null;
  const width = Number(token());
  const height = Number(token());
  token(); // maxval
  pos++;
  return { width, height, data: ppm.subarray(pos) };
}

/** How many pixels sit within tolerance of an (r,g,b) target. */
function countColor(img, [r, g, b], tol = 60) {
  let n = 0;
  for (let i = 0; i + 2 < img.data.length; i += 3) {
    if (Math.abs(img.data[i] - r) < tol && Math.abs(img.data[i + 1] - g) < tol && Math.abs(img.data[i + 2] - b) < tol) n++;
  }
  return n;
}

const latin1 = (bytes) => {
  let out = '';
  for (let i = 0; i < bytes.length; i += 65536) out += String.fromCharCode(...bytes.subarray(i, i + 65536));
  return out;
};

const pdfBytes = (href) => Buffer.from(href.split(',')[1], 'base64');
const hasImageXObject = (body) => body.includes('/Subtype /Image') && /\/Im\d+ Do/.test(body);

// ---------------------------------------------------------------------------
// The page, and one shared scenario runner.
// ---------------------------------------------------------------------------

const b = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
const p = await b.newPage({ viewport: { width: 1200, height: 800 } });
const pageErrors = [];
p.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 200)));

await p.goto(`${origin}/misc/pdf-export.html`, { waitUntil: 'networkidle' });
await p.waitForFunction(() => window.__demoReady === true, { timeout: 20000 });

// The asset PNG — REAL canvas.toDataURL output, the thing production serves.
const generated = await p.evaluate(() => {
  const cv = document.createElement('canvas');
  cv.width = 16;
  cv.height = 16;
  const c = cv.getContext('2d');
  c.fillStyle = 'rgb(0,200,80)';
  c.fillRect(0, 0, 16, 16);
  return cv.toDataURL('image/png').split(',')[1];
});
assets.set('green.png', Buffer.from(generated, 'base64'));
assets.set('shared.png', Buffer.from(generated, 'base64'));

/**
 * MOUNT a board whose only image is on a PANEL node (`metadata.panel.image.href`) —
 * not a widget — optionally plus ONE widget referencing the SAME URL (the dedupe
 * board). The api parks on `window.__api` so the export can run in a separate,
 * counter-scoped evaluate.
 */
const mount = (args) =>
  p.evaluate(async ({ imgUrl, withWidget }) => {
    const { render } = await import('/shell/grafloria.js');
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:0;top:0;width:760px;height:420px;background:#fff;z-index:99';
    document.body.appendChild(host);

    const nodes = [
      {
        id: 'erd',
        label: 'Customer',
        position: { x: 40, y: 40 },
        size: { width: 220, height: 150 },
        metadata: { panel: { header: { text: 'Customer' }, image: { href: imgUrl, height: 80 } } },
      },
    ];
    if (withWidget) nodes.push({ id: 'w', custom: true, position: { x: 340, y: 40 }, size: { width: 160, height: 100 } });

    const api = render({ nodes, edges: [] }, host, {
      renderCustomNode: async (node, el) => {
        const img = document.createElement('img');
        img.src = imgUrl;
        img.width = 160;
        img.height = 100;
        el.appendChild(img);
        await img.decode().catch(() => undefined);
      },
    });
    api.renderNow();
    // Let the panel <image> display-load settle so mount traffic cannot bleed into
    // the export-scoped request counter.
    await new Promise((r) => setTimeout(r, 150));
    window.__api = api;
    window.__host = host;
  }, args);

/** Export through the SHIPPED await api.export(…) and tear the board down. */
const exportAll = () =>
  p.evaluate(async () => {
    const api = window.__api;
    const syncOut = api.exportSvgString();
    const svgWarnings = [];
    const svg = await api.export('svg', { onWarnings: (w) => svgWarnings.push(...[].concat(w)) });
    const pdfWarnings = [];
    const pdf = await api.export('pdf', { onWarnings: (w) => pdfWarnings.push(...[].concat(w)) });
    api.destroy?.();
    window.__host.remove();
    return { syncSvg: syncOut.svg, syncWarnings: syncOut.warnings, svg, svgWarnings, pdf, pdfWarnings };
  });

// ===========================================================================
// 1 — SAME-ORIGIN panel image: the tree pass fetches and embeds. NO widget on
//     the board, so the XObject has no possible source but the panel.
// ===========================================================================

console.log('--- panel node, same-origin URL image — the tree pass ---');

await mount({ imgUrl: `${origin}/e2e-assets/green.png`, withWidget: false });
const same = await exportAll();

check('CONTROL: the sync exportSvgString keeps the external href', same.syncSvg.includes('/e2e-assets/green.png'));
check('await export("svg") embeds the bytes — the URL is GONE from the file', !same.svg.includes('/e2e-assets/green.png'));
check('…and a data:image/png took its place (self-contained SVG)', same.svg.includes('href="data:image/png;base64,'));
check(
  'the awaited export carries NO image warning — the problem no longer exists',
  !same.svgWarnings.some((w) => /image/i.test(w)) && !same.pdfWarnings.some((w) => /image/i.test(w)),
  [...same.svgWarnings, ...same.pdfWarnings].find((w) => /image/i.test(w))?.slice(0, 120) || 'clean'
);

const sameBody = latin1(pdfBytes(same.pdf));
check('the PDF holds an image XObject and INVOKES it — only the PANEL could supply it', hasImageXObject(sameBody));

{
  const img = rasterize(pdfBytes(same.pdf), 'same');
  if (!img) check('panel PDF rasterized for pixel proof', false, 'pdftoppm unavailable — PIXELS NOT CHECKED');
  else check('the SERVED green actually paints on the page', countColor(img, [0, 200, 80]) > 50, `${countColor(img, [0, 200, 80])} green px`);
}

// ===========================================================================
// 2 — CORS-BLOCKED panel image, no fetcher: the honest residue.
// ===========================================================================

console.log('--- panel node, CORS-blocked URL — the residue warning ---');

await mount({ imgUrl: `${remoteOrigin}/cors-blocked/green.png`, withWidget: false });
const blocked = await exportAll();

check('the URL stays in the awaited SVG — broken-but-visible beats silently blanked', blocked.svg.includes('/cors-blocked/green.png'));
check('the PDF holds NO image XObject — nothing was fetched', !hasImageXObject(latin1(pdfBytes(blocked.pdf))));
{
  const w = blocked.pdfWarnings.filter((x) => /image/i.test(x)).join(' ');
  check('the residue warning names the failing URL', w.includes('/cors-blocked/green.png'), w.slice(0, 140) || 'NO WARNING AT ALL');
  check('…and the CORS escape hatch', /CORS/.test(w));
  check('…and the assetFetcher escape hatch', /assetFetcher/.test(w));
}

// ===========================================================================
// 3 — DEDUPE across kinds: ONE URL on BOTH a panel node and a widget; the
//     server counts requests inside an export-scoped window.
// ===========================================================================

console.log('--- dedupe: panel + widget share one URL — one fetch, counted server-side ---');

await mount({ imgUrl: `${origin}/e2e-assets/shared.png`, withWidget: true });
hits.set('shared.png', 0); // mount/display traffic is over; count ONLY the export's fetches
const deduped = await p.evaluate(async () => {
  const api = window.__api;
  const svg = await api.export('svg');
  api.destroy?.();
  window.__host.remove();
  return { svg };
});

check('one export fetched the shared URL exactly ONCE (server-counted, no-store)', hits.get('shared.png') === 1, `${hits.get('shared.png')} hits`);
check('…and BOTH references were substituted — the URL is gone from the file', !deduped.svg.includes('/e2e-assets/shared.png'));
check('…with embedded bytes in its place', deduped.svg.includes('href="data:image/png;base64,'));

// ===========================================================================

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await b.close();
mainServer.close();
remoteServer.close();

const passed = checks.filter(Boolean).length;
console.log(`\n${passed}/${checks.length} checks passed`);
process.exit(passed === checks.length ? 0 : 1);
