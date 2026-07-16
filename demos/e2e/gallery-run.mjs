// THE GALLERY GATE.
//
// Loads every demo page in headless Chromium, calls its in-page `assert()`, and fails if the
// feature it advertises does not actually work.
//
// WHY THIS EXISTS, and it is not to look nice in a README:
//
// Every wave of this project has found features that existed, had passing unit tests, and
// were WIRED TO NOTHING — a layout service nothing ever called; 17 LOD presets that were all
// no-ops; a worker stack whose 28 tests all forced `useWorker:false`; an entire touch stack
// in the engine's public API that was UNWIREABLE against the real engine. All green. All
// unreachable. And most recently the library itself DID NOT BUILD while 2,847 unit tests
// passed, because every gate anyone ran was `nx test` and none was `nx build`.
//
// A unit test proves a unit works. It never proves anything CALLS it. This harness drives
// the public entry point in a real browser, with real events, and asserts the feature does
// something real. It is the reachability gate this repository has never had.
//
//     node demos/e2e/gallery-run.mjs           # gate everything
//     node demos/e2e/gallery-run.mjs nodes     # just one category

import { chromium } from 'playwright';
import { readdirSync, statSync, readFileSync } from 'fs';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join, relative, extname, sep } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

/** Every .html in the gallery except the index and the shell. */
function demoPages(dir = root, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'shell' || entry === 'e2e' || entry === 'node_modules') continue;
      demoPages(full, out);
    } else if (entry.endsWith('.html') && entry !== 'index.html') {
      out.push(full);
    }
  }
  return out;
}

const filter = process.argv[2];
const pages = demoPages().filter((p) => !filter || relative(root, p).startsWith(filter));

if (pages.length === 0) {
  console.log(`no demos found${filter ? ` under "${filter}"` : ''}`);
  process.exit(1);
}

// SERVED OVER HTTP, NOT file://. ES modules are blocked cross-origin on file://, which is
// correct browser behaviour and not something to hack around — a real gallery is a static
// site served over HTTP, so the harness serves it the same way a visitor would get it. This
// also means the gallery is deployable as-is.
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
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
const results = [];

for (const page of pages) {
  const rel = relative(root, page);
  const tab = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  const pageErrors = [];
  tab.on('pageerror', (e) => pageErrors.push(String(e)));
  tab.on('console', (m) => {
    if (m.type() === 'error') pageErrors.push(`console: ${m.text()}`);
  });

  let result = { rel, ok: false, failures: [], pageErrors, reactflow: null, pro: false };

  try {
    await tab.goto(origin + '/' + relative(root, page).split(sep).join('/'));
    // The demo boots asynchronously (it may await a layout, a worker, a font). Wait for the
    // contract, not for a magic number of milliseconds.
    await tab.waitForFunction(() => window.__demoReady === true, { timeout: 15000 });

    const meta = await tab.evaluate(() => ({
      name: window.__demo.name,
      reactflow: window.__demo.reactflow,
      pro: window.__demo.pro,
      howToSteps: window.__demo.howToSteps ?? 0,
    }));
    result.reactflow = meta.reactflow;
    result.pro = meta.pro;

    // The assertion runs IN THE PAGE — where the DOM, the events and the renderer are.
    const run = await tab.evaluate(async () => {
      try {
        return await window.__demo.run();
      } catch (e) {
        return { ok: false, failures: [e && e.message ? e.message : String(e)] };
      }
    });

    result.ok = run.ok && pageErrors.length === 0;
    result.failures = run.failures ?? [];
    // A feature a visitor cannot FIND is a feature that does not work for them:
    // every page must carry "How to test" steps (rendered as the right-side
    // panel; live report asked for it on every example page).
    if (meta.howToSteps < 3) {
      result.ok = false;
      result.failures.push(`declares ${meta.howToSteps} howTo steps — every demo needs at least 3 ("How to test" panel)`);
    }
  } catch (e) {
    result.failures = [`harness: ${e.message}`];
  }

  await tab.close();
  results.push(result);

  const mark = result.ok ? '✓' : '✗';
  console.log(`${mark} ${rel}${result.pro ? '   [React Flow: Pro/paid]' : ''}`);
  for (const f of result.failures) console.log(`    ${f.split('\n').join('\n    ')}`);
  for (const e of result.pageErrors) console.log(`    PAGE ERROR: ${e}`);
}

await browser.close();
server.close();

const failed = results.filter((r) => !r.ok);
const proCovered = results.filter((r) => r.ok && r.pro).length;

console.log('');
console.log(`gallery: ${results.length - failed.length}/${results.length} demos pass`);
if (proCovered) {
  console.log(`         ${proCovered} of them are features React Flow charges for`);
}
if (failed.length) {
  console.log('');
  console.log('A DEMO THAT DOES NOT WORK IS A FEATURE THAT DOES NOT WORK. This is the gate.');
}
process.exit(failed.length ? 1 : 0);
