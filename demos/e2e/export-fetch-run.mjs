// GATE — do EXTERNAL-URL widget images actually reach the PDF?
//
// THE FEATURE THIS GUARDS (a0ddecfac)
// -----------------------------------
// A widget's <img src="https://…"> captures as <image href="…"> and a PDF cannot fetch
// a URL. But `await export(…)` runs IN A BROWSER, which can: tier 1 is the environment's
// own fetch (same-origin, or a server that allows CORS), tier 2 is the caller's
// ExportOptions.assetFetcher (their proxy), tier 3 is the honest residue warning naming
// both escape hatches. Unit tests stub the network; only this drives the REAL fetch, in
// a REAL browser, over REAL origins — including a genuine cross-origin request, which no
// jsdom test can produce.
//
// WHAT KEEPS THE TEETH SHARP: every fixture holds exactly ONE image, referenced by URL
// only — no data: URI anywhere in the board — so an image XObject in the PDF can have no
// source but the fetch. And the pixels are read back (pdftoppm): the SERVED color must
// paint, which "an XObject exists" alone does not prove.
//
// Needs `demos/shell/grafloria.js` built from current libs (`node demos/build.mjs`) — the
// same standing requirement every demo gate has. Serves demos/ on an EPHEMERAL port and
// runs a SECOND ephemeral origin for the cross-origin cases (the user's demo server owns
// :4321 and is not touched).

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
//   MAIN     demos/ static files + same-origin asset routes (tier 1, same-origin)
//   REMOTE   a second origin: /cors-open/* sends Access-Control-Allow-Origin,
//            /cors-blocked/* does not (tier 1 cross-origin vs tier 2/3)
// The asset bytes are canvas-generated PNGs (what production actually produces),
// filled in after the browser is up — the `assets` map is consulted per request.
// ---------------------------------------------------------------------------

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml' };

/** name → Buffer, filled once the page has generated the canvas PNGs. */
const assets = new Map();

const mainServer = createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url.startsWith('/e2e-assets/')) {
    const body = assets.get(url.slice('/e2e-assets/'.length));
    if (!body) return void res.writeHead(404).end();
    return void res.writeHead(200, { 'Content-Type': 'image/png' }).end(body);
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
  if (!body || (zone !== 'cors-open' && zone !== 'cors-blocked')) return void res.writeHead(404).end();
  const headers = { 'Content-Type': 'image/png' };
  if (zone === 'cors-open') headers['Access-Control-Allow-Origin'] = '*';
  res.writeHead(200, headers).end(body);
});
await new Promise((resolve) => remoteServer.listen(0, '127.0.0.1', resolve));
const remoteOrigin = `http://127.0.0.1:${remoteServer.address().port}`;

// ---------------------------------------------------------------------------
// Rasterization — poppler when present; otherwise say so PLAINLY and skip pixels.
// ---------------------------------------------------------------------------

const havePdftoppm = spawnSync('pdftoppm', ['-v']).status !== null;

function rasterize(bytes, tag) {
  if (!havePdftoppm) return null;
  const dir = mkdtempSync(join(tmpdir(), `grafloria-fetch-${tag}-`));
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

// The asset PNGs — REAL canvas.toDataURL output, the thing production serves.
const generated = await p.evaluate(() => {
  const make = (r, g, bl) => {
    const cv = document.createElement('canvas');
    cv.width = 16;
    cv.height = 16;
    const c = cv.getContext('2d');
    c.fillStyle = `rgb(${r},${g},${bl})`;
    c.fillRect(0, 0, 16, 16);
    return cv.toDataURL('image/png').split(',')[1];
  };
  return { green: make(0, 200, 80), blue: make(20, 60, 220) };
});
assets.set('green.png', Buffer.from(generated.green, 'base64'));
assets.set('blue.png', Buffer.from(generated.blue, 'base64'));

/**
 * Mount ONE widget whose only paint is the given image reference, export through the
 * SHIPPED `await instance.export(…)`, and report everything the asserts need.
 * `imageHtml` builds the widget's innerHTML from the URL; `exportOptions` may carry an
 * assetFetcher marker consumed in-page (functions cannot cross evaluate()).
 */
const scenario = (args) =>
  p.evaluate(async ({ imgUrl, asImg, proxyUrl }) => {
    const { render } = await import('/shell/grafloria.js');
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:0;top:0;width:700px;height:400px;background:#fff;z-index:99';
    document.body.appendChild(host);

    const spec = {
      nodes: [{ id: 'w', custom: true, position: { x: 40, y: 40 }, size: { width: 160, height: 100 } }],
      edges: [],
    };
    const api = render(spec, host, {
      renderCustomNode: async (node, el) => {
        if (asImg) {
          const img = document.createElement('img');
          img.src = imgUrl;
          img.width = 160;
          img.height = 100;
          el.appendChild(img);
          await img.decode().catch(() => undefined); // loaded or not, the capture must cope
        } else {
          // NOTE the quoting: the url() sits inside a double-quoted style attribute,
          // so the URL itself must be unquoted (it carries no spaces or parens).
          el.innerHTML = `<div style="width:160px;height:100px;background-image:url(${imgUrl})"></div>`;
        }
      },
    });
    api.renderNow();

    // The tier-2 proxy: fetch a SAME-ORIGIN stand-in and hand the bytes over — exactly
    // what an embedding app's /proxy?url=… endpoint does.
    const assetFetcher = proxyUrl
      ? async () => {
          const res = await fetch(proxyUrl);
          if (!res.ok) throw new Error(`proxy HTTP ${res.status}`);
          return { data: new Uint8Array(await res.arrayBuffer()), mimeType: 'image/png' };
        }
      : undefined;

    const syncOut = api.exportSvgString(); // the control: sync cannot fetch
    const svgWarnings = [];
    const svg = await api.export('svg', { assetFetcher, onWarnings: (w) => svgWarnings.push(...[].concat(w)) });
    const pdfWarnings = [];
    const pdf = await api.export('pdf', { assetFetcher, onWarnings: (w) => pdfWarnings.push(...[].concat(w)) });

    api.destroy?.();
    host.remove();
    return {
      syncSvg: syncOut.svg,
      syncWarnings: syncOut.warnings,
      svg,
      svgWarnings,
      pdf,
      pdfWarnings,
    };
  }, args);

// ===========================================================================
// Tier 1a — SAME ORIGIN. The plainest case: the page's own server has the image.
// ===========================================================================

console.log('--- tier 1: same-origin URL image, fetched by the export itself ---');

const same = await scenario({ imgUrl: `${origin}/e2e-assets/green.png`, asImg: false });

check(
  'CONTROL: the sync export keeps the URL and carries the EXTERNAL URL warning',
  same.syncSvg.includes('/e2e-assets/green.png') && same.syncWarnings.some((w) => /EXTERNAL URL/.test(w)),
  same.syncWarnings.find((w) => /image/i.test(w))?.slice(0, 90) || 'no warning'
);
check('await export("svg") embeds the bytes — the URL is GONE from the file', !same.svg.includes('/e2e-assets/green.png'));
check('…and a data:image/png took its place (offline-proof SVG)', same.svg.includes('href="data:image/png;base64,'));
check(
  'the awaited export carries NO image warning — the problem no longer exists',
  !same.svgWarnings.some((w) => /image/i.test(w)) && !same.pdfWarnings.some((w) => /image/i.test(w)),
  [...same.svgWarnings, ...same.pdfWarnings].find((w) => /image/i.test(w))?.slice(0, 120) || 'clean'
);

const sameBody = latin1(pdfBytes(same.pdf));
check('the PDF holds an image XObject and INVOKES it — its only possible source is the fetch', hasImageXObject(sameBody));

{
  const img = rasterize(pdfBytes(same.pdf), 'same');
  if (!img) check('same-origin PDF rasterized for pixel proof', false, 'pdftoppm unavailable — PIXELS NOT CHECKED');
  else check('the SERVED green actually paints on the page', countColor(img, [0, 200, 80]) > 50, `${countColor(img, [0, 200, 80])} green px`);
}

// ===========================================================================
// Tier 1b — CROSS-ORIGIN with CORS allowed. A real second origin; the <img> is
// canvas-TAINTED (no crossorigin attr), so capture-time inlining cannot have done
// this — only the export's own fetch can.
// ===========================================================================

console.log('--- tier 1: cross-origin URL (CORS allowed) — a genuinely foreign server ---');

const cors = await scenario({ imgUrl: `${remoteOrigin}/cors-open/green.png`, asImg: true });

check(
  'CONTROL: the tainted <img> could not be canvas-inlined — the sync export keeps the URL',
  cors.syncSvg.includes('/cors-open/green.png'),
  'without this the async result would prove nothing'
);
check('await export("svg") embedded the cross-origin image', !cors.svg.includes('/cors-open/green.png') && cors.svg.includes('href="data:image/png;base64,'));
check('no image warning survives on the awaited export', !cors.pdfWarnings.some((w) => /image/i.test(w)), cors.pdfWarnings.find((w) => /image/i.test(w))?.slice(0, 120) || 'clean');
check('the PDF embeds and invokes the XObject', hasImageXObject(latin1(pdfBytes(cors.pdf))));

{
  const img = rasterize(pdfBytes(cors.pdf), 'cors');
  if (!img) check('cross-origin PDF rasterized for pixel proof', false, 'pdftoppm unavailable — PIXELS NOT CHECKED');
  else check('the cross-origin green paints', countColor(img, [0, 200, 80]) > 50, `${countColor(img, [0, 200, 80])} green px`);
}

// ===========================================================================
// Tier 3 — CORS BLOCKED, no fetcher: the residue. The warning must be accurate
// and must name both escape hatches.
// ===========================================================================

console.log('--- tier 3: CORS-blocked, no assetFetcher — the honest residue ---');

const blocked = await scenario({ imgUrl: `${remoteOrigin}/cors-blocked/blue.png`, asImg: false });

check('the URL stays in the SVG — broken-but-visible beats silently blanked', blocked.svg.includes('/cors-blocked/blue.png'));
check('the PDF holds NO image XObject — nothing was fetched', !hasImageXObject(latin1(pdfBytes(blocked.pdf))));
{
  const w = blocked.pdfWarnings.filter((x) => /image/i.test(x)).join(' ');
  check('the warning names the failing URL', w.includes('/cors-blocked/blue.png'), w.slice(0, 140) || 'NO WARNING AT ALL');
  check('…and the CORS escape hatch', /CORS/.test(w));
  check('…and the assetFetcher escape hatch', /assetFetcher/.test(w));
}

// A plain 404 is residue too — different reason, same honesty.
const missing = await scenario({ imgUrl: `${origin}/e2e-assets/missing.png`, asImg: false });
check(
  'a 404 asset warns with the URL and stays external',
  missing.svg.includes('/e2e-assets/missing.png') &&
    missing.pdfWarnings.some((w) => w.includes('/e2e-assets/missing.png')),
  missing.pdfWarnings.find((w) => /image/i.test(w))?.slice(0, 140) || 'NO WARNING'
);

// ===========================================================================
// Tier 2 — CORS BLOCKED, WITH an assetFetcher: the escape hatch works.
// ===========================================================================

console.log('--- tier 2: CORS-blocked, assetFetcher proxies the bytes ---');

const proxied = await scenario({
  imgUrl: `${remoteOrigin}/cors-blocked/blue.png`,
  asImg: false,
  proxyUrl: `${origin}/e2e-assets/blue.png`,
});

check('the assetFetcher rescued the blocked image — URL gone, data: URI in', !proxied.svg.includes('/cors-blocked/blue.png') && proxied.svg.includes('href="data:image/png;base64,'));
check('no image warning — the escape hatch closed the gap', !proxied.pdfWarnings.some((w) => /image/i.test(w)), proxied.pdfWarnings.find((w) => /image/i.test(w))?.slice(0, 120) || 'clean');
check('the PDF embeds and invokes the proxied XObject', hasImageXObject(latin1(pdfBytes(proxied.pdf))));

{
  const img = rasterize(pdfBytes(proxied.pdf), 'proxied');
  if (!img) check('proxied PDF rasterized for pixel proof', false, 'pdftoppm unavailable — PIXELS NOT CHECKED');
  else {
    // BLUE, not green: the pixels prove the bytes came from THIS asset — a green result
    // would mean some other scenario's image leaked into this board.
    check('the PROXIED blue paints (scoped to this asset, not any image)', countColor(img, [20, 60, 220]) > 50, `${countColor(img, [20, 60, 220])} blue px`);
  }
}

// ===========================================================================

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await b.close();
mainServer.close();
remoteServer.close();

const passed = checks.filter(Boolean).length;
console.log(`\n${passed}/${checks.length} checks passed`);
process.exit(passed === checks.length ? 0 : 1);
