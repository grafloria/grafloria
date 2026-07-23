// The Angular-variant gate — the demos-angular app under the same covenant as
// the JS gallery: every route is DRIVEN headless and must paint, or the build
// is red. Run after `npx nx build demos-angular`:
//
//     node demos/e2e/angular-run.mjs
//
// A route that 404s, throws, or paints nothing is a framework claim the site
// must not make.

import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { dirname, join, extname } from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const DIST = join(here, '..', '..', 'dist', 'apps', 'demos-angular', 'browser');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

// The routes ARE the app's route table — keep in lockstep with app.routes.ts.
// (A route added there but not here still gates via the count check below.)
const routesSrc = await readFile(join(here, '..', '..', 'apps', 'demos-angular', 'src', 'app', 'app.routes.ts'), 'utf8');
const ROUTES = [...routesSrc.matchAll(/path: '([^']+)'/g)].map((m) => m[1]);
if (ROUTES.length === 0) throw new Error('angular-run: no routes parsed from app.routes.ts');

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
await new Promise((r) => server.listen(4327, r));

const browser = await chromium.launch();
let failed = 0;
for (const route of ROUTES) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 140)));
  let painted = 0;
  try {
    await page.goto(`http://localhost:4327/#/${route}`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__ngDemoReady === true, { timeout: 15000 });
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

console.log(`\nangular: ${ROUTES.length - failed}/${ROUTES.length} routes pass`);
process.exit(failed ? 1 : 0);
