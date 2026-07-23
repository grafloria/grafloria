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
if (!['angular', 'react', 'vue'].includes(FW)) throw new Error('usage: variant-run.mjs <angular|react|vue>');
// Angular (devkit) nests under browser/; the esbuild apps output flat.
const READY = { angular: '__ngDemoReady', react: '__reactDemoReady', vue: '__vueDemoReady' }[FW];
const PORT = { angular: 4327, react: 4328, vue: 4329 }[FW];
const here = dirname(fileURLToPath(import.meta.url));
const APP = join(here, '..', '..', 'apps', `demos-${FW}`);
const DIST = FW === 'angular'
  ? join(here, '..', '..', 'dist', 'apps', 'demos-angular', 'browser')
  : join(here, '..', '..', 'dist', 'apps', `demos-${FW}`);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

// The routes ARE the app's route table — keep in lockstep with app.routes.ts.
// (A route added there but not here still gates via the count check below.)
const routesFile = FW === 'angular'
  ? join(APP, 'src', 'app', 'app.routes.ts')
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
await new Promise((r) => server.listen(PORT, r));

const browser = await chromium.launch();
let failed = 0;
for (const route of ROUTES) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 140)));
  let painted = 0;
  try {
    await page.goto(`http://localhost:${PORT}/#/${route}`, { waitUntil: 'networkidle' });
    await page.waitForFunction((flag) => window[flag] === true, READY, { timeout: 15000 });
    await page.waitForTimeout(400);
    painted = await page.evaluate(
      () => document.querySelectorAll('svg g, svg rect, svg path, foreignObject').length
    );
  } catch (e) {
    errs.push(String(e).slice(0, 140));
  }
  const ok = painted > 2 && errs.length === 0;
  console.log(`${ok ? '✓' : '✗'} ${route}  painted=${painted}${errs.length ? '  ' + errs[0] : ''}`);
  if (!ok) failed++;
  await page.close();
}
await browser.close();
server.close();

console.log(`\n${FW}: ${ROUTES.length - failed}/${ROUTES.length} routes pass`);
process.exit(failed ? 1 : 0);
