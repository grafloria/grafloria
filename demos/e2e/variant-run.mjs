// The framework-variant gate — a demos-<fw> app under the same covenant as the
// JS gallery: every route is DRIVEN headless and must paint, or the build is
// red. Run after building the app:
//
//     node demos/e2e/variant-run.mjs angular   (or react | vue)
//
// A route that 404s, throws, or paints nothing is a framework claim the site
// must not make.

import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { dirname, join, extname } from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const FW = process.argv[2];
if (!['angular', 'react', 'vue', 'qwik'].includes(FW)) throw new Error('usage: variant-run.mjs <angular|react|vue|qwik> [--origin https://grafloria.com]');
// `--origin <site>` drives the DEPLOYED variant (<site>/demos-<fw>/) against the
// deployed JS gallery (<site>/demos/) instead of the local builds: what the host
// serves is not always what was built (see gallery-run.mjs --origin).
const originIdx = process.argv.indexOf('--origin');
const LIVE = originIdx >= 0 ? String(process.argv[originIdx + 1] ?? '').replace(/\/$/, '') : null;
// Angular (devkit) nests under browser/; the esbuild apps output flat.
const READY = { angular: '__ngDemoReady', react: '__reactDemoReady', vue: '__vueDemoReady', qwik: '__qwikDemoReady' }[FW];
const PORT = { angular: 4327, react: 4328, vue: 4329, qwik: 4330 }[FW];
const here = dirname(fileURLToPath(import.meta.url));
const APP = join(here, '..', '..', 'apps', `demos-${FW}`);
const DIST = FW === 'angular'
  ? join(here, '..', '..', 'dist', 'apps', 'demos-angular', 'browser')
  : join(here, '..', '..', 'dist', 'apps', `demos-${FW}`);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

// The routes ARE the app's route table — keep in lockstep with app.routes.ts.
// (A route added there but not here still gates via the count check below.)
// (The Qwik app's gallery lives in apps/demos-qwik/gallery/ — the folder's src/
// is its server-rendered showcase.)
const routesFile = FW === 'angular'
  ? join(APP, 'src', 'app', 'app.routes.ts')
  : FW === 'qwik'
    ? join(APP, 'gallery', 'routes.ts')
    : join(APP, 'src', 'routes.ts');
const routesSrc = await readFile(routesFile, 'utf8');
const ROUTES = FW === 'angular'
  ? [...routesSrc.matchAll(/path: '([^']+)'/g)].map((m) => m[1])
  : [...routesSrc.matchAll(/'([\w-]+\/[\w-]+)':/g)].map((m) => m[1]);
if (ROUTES.length === 0) throw new Error(`variant-run: no routes parsed for ${FW}`);

const server = createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  try {
    const data = await readFile(join(DIST, p));
    res.writeHead(200, { 'content-type': MIME[extname(p)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end();
  }
});
if (!LIVE) await new Promise((r) => server.listen(PORT, r));
const APP_BASE = LIVE ? `${LIVE}/demos-${FW}/` : `http://localhost:${PORT}/`;
const REF_BASE = LIVE ? `${LIVE}/demos` : `http://localhost:${PORT + 100}`;
if (LIVE) console.log(`${FW} against ${APP_BASE}\n`);

const browser = await chromium.launch();
let failed = 0;
// Second server: the JS gallery, the SOURCE OF TRUTH each variant must match.
// A variant that paints far fewer elements than the JS original is
// under-rendering (e.g. wires but no node cards) — a false-green the bare
// paint>2 threshold cannot see. So the gate compares against the reference.
const GALLERY = join(here, '..');
const galleryServer = createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  try {
    const data = await readFile(join(GALLERY, p));
    res.writeHead(200, { 'content-type': MIME[extname(p)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end();
  }
});
if (!LIVE) await new Promise((r) => galleryServer.listen(PORT + 100, r));

const COUNT = () => document.querySelectorAll('svg g, svg rect, svg path, foreignObject, .grafloria-html-layer *').length;
// The KIND of thing painted. A paint count cannot tell a dashboard from a
// diagram — a dashboard component wired under a diagram route sailed through
// on count alone (2026-09-07). Kit dashboards paint .axdb-widget; SVG diagrams
// paint svg text with an empty HTML layer; the hand-built grid pages are
// neither, so they are not judged.
const KIND = () => {
  const w = document.querySelectorAll('.axdb-widget').length;
  const html = document.querySelectorAll('.grafloria-html-layer > *').length;
  const txt = document.querySelectorAll('svg text').length;
  return w > 0 ? 'kit' : html === 0 && txt > 0 ? 'svg-diagram' : 'other';
};
const REF_FLOOR = 0.45; // a faithful variant paints at least this fraction of the JS original
/**
 * Screen chrome (minimap, controls, HUD buttons — the portals in .grafloria-screen-layer)
 * must be what the pointer hits at its own centre. Angular's 0.16.0 canvas stacked the
 * drawing ABOVE its screen layer, so the minimap and controls lost every click to it, and
 * this gate, which only counted what was painted, passed. Returns the covered pieces.
 */
const SCREEN_CHROME_COVERED = () => {
  const out = [];
  for (const layer of document.querySelectorAll('.grafloria-screen-layer')) {
    for (const el of layer.querySelectorAll(':scope > *, button')) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width < 16 || r.height < 16 || cs.pointerEvents === 'none' || cs.visibility === 'hidden' || cs.display === 'none') continue;
      const x = r.x + r.width / 2, y = r.y + r.height / 2;
      if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
      const hit = document.elementFromPoint(x, y);
      if (!hit || !el.contains(hit)) {
        const name = (el.getAttribute('class') || el.tagName).split(' ').filter(Boolean).slice(0, 2).join('.');
        out.push(`${name} under ${hit ? hit.tagName.toLowerCase() + '.' + (hit.getAttribute('class') || '').split(' ')[0] : 'nothing'}`);
      }
    }
  }
  return out;
};

for (const route of ROUTES) {
  const errs = [];
  // The JS reference paint count.
  let ref = 0, refKind = 'other';
  try {
    const rp = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await rp.goto(`${REF_BASE}/${route}.html`, { waitUntil: 'networkidle' });
    await rp.waitForFunction(() => window.__demoReady === true, { timeout: 15000 });
    await rp.waitForTimeout(400);
    ref = await rp.evaluate(COUNT);
    refKind = await rp.evaluate(KIND);
    await rp.close();
  } catch { /* no JS reference (rare) — fall back to the bare threshold */ }

  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 140)));
  let painted = 0, kind = 'other', covered = [];
  try {
    await page.goto(`${APP_BASE}#/${route}`, { waitUntil: 'networkidle' });
    await page.waitForFunction((flag) => window[flag] === true, READY, { timeout: 15000 });
    await page.waitForTimeout(400);
    painted = await page.evaluate(COUNT);
    kind = await page.evaluate(KIND);
    covered = await page.evaluate(SCREEN_CHROME_COVERED);
  } catch (e) {
    errs.push(String(e).slice(0, 140));
  }
  const floor = ref > 8 ? Math.floor(ref * REF_FLOOR) : 2;
  // Under-rendering = below the reference floor AND not a clearly-populated
  // canvas. 60+ painted elements means real content rendered (a culling/LOD
  // demo can legitimately paint far fewer than an extreme reference).
  const under = painted <= floor && painted < 60;
  // Same kind as the reference: a kit dashboard where the JS page is one, and
  // never a kit dashboard where the JS page is an SVG diagram.
  const wrongKind = ref > 0 && ((refKind === 'kit' && kind !== 'kit') || (refKind === 'svg-diagram' && kind === 'kit'));
  const ok = painted > 2 && !under && !wrongKind && errs.length === 0 && covered.length === 0;
  const note = covered.length ? `  SCREEN CHROME COVERED: ${covered.slice(0, 3).join('; ')}`
    : wrongKind ? `  WRONG KIND (reference ${refKind}, variant ${kind})`
    : under && errs.length === 0 ? `  UNDER-RENDERING (ref=${ref}, floor=${floor})` : errs.length ? '  ' + errs[0] : '';
  console.log(`${ok ? '✓' : '✗'} ${route}  painted=${painted}${ref ? ` ref=${ref}` : ''}${note}`);
  if (!ok) failed++;
  await page.close();
}
await browser.close();
if (!LIVE) {
  server.close();
  galleryServer.close();
}

console.log(`\n${FW}: ${ROUTES.length - failed}/${ROUTES.length} routes pass`);
process.exit(failed ? 1 : 0);
