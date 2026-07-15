// SCREENSHOT CAPTURE — the visual companion to gallery-run.mjs.
//
// gallery-run proves each demo's feature is REACHABLE (a consequence happens). It cannot
// prove the page LOOKS right: a node that moved 40px passes even if it rendered off-canvas,
// the edges overlapped into mush, or the palette is unreadable. This script captures what the
// page actually paints so a human — or a vision-capable agent — can judge it.
//
// Two stages per demo, because "does it look good" has two answers:
//   <name>.boot.png   — after window.__demoReady, before any scripted interaction (initial render)
//   <name>.after.png   — after window.__demo.run() (the post-interaction state the assert checks)
//
// Usage:
//   node demos/e2e/shoot.mjs                 # shoot everything into demos/e2e/shots/
//   node demos/e2e/shoot.mjs nodes           # one category
//   node demos/e2e/shoot.mjs --out /some/dir # custom output dir (used by the visual workflow)

import { chromium } from 'playwright';
import { readdirSync, statSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join, relative, extname, sep } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const argv = process.argv.slice(2);
const outIdx = argv.indexOf('--out');
const outDir = outIdx >= 0 ? argv[outIdx + 1] : join(here, 'shots');
const filter = argv.find((a, i) => !a.startsWith('--') && i !== outIdx + 1);

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

const pages = demoPages().filter((p) => !filter || relative(root, p).startsWith(filter));
if (pages.length === 0) {
  console.log(`no demos found${filter ? ` under "${filter}"` : ''}`);
  process.exit(1);
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml',
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

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const manifest = [];

for (const page of pages) {
  const rel = relative(root, page);
  const slug = rel.replace(/[\\/]/g, '__').replace(/\.html$/, '');
  const tab = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const pageErrors = [];
  tab.on('pageerror', (e) => pageErrors.push(String(e)));
  tab.on('console', (m) => { if (m.type() === 'error') pageErrors.push(`console: ${m.text()}`); });

  const rec = { rel, slug, boot: null, after: null, reactflow: null, pro: false, pageErrors, error: null };
  try {
    await tab.goto(origin + '/' + rel.split(sep).join('/'));
    await tab.waitForFunction(() => window.__demoReady === true, { timeout: 15000 });
    const meta = await tab.evaluate(() => ({ reactflow: window.__demo.reactflow, pro: window.__demo.pro }));
    rec.reactflow = meta.reactflow; rec.pro = meta.pro;

    const bootPath = join(outDir, `${slug}.boot.png`);
    await tab.screenshot({ path: bootPath });
    rec.boot = bootPath;

    // Drive the demo's own interaction, then shoot the resulting state.
    await tab.evaluate(async () => { try { await window.__demo.run(); } catch { /* captured below */ } });
    await tab.waitForTimeout(50); // let the last commit/render land
    const afterPath = join(outDir, `${slug}.after.png`);
    await tab.screenshot({ path: afterPath });
    rec.after = afterPath;
  } catch (e) {
    rec.error = e.message;
  }
  await tab.close();
  manifest.push(rec);
  console.log(`${rec.error ? '✗' : '📷'} ${rel}${rec.pageErrors.length ? `  (${rec.pageErrors.length} page errors)` : ''}`);
}

await browser.close();
server.close();
writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`\n${manifest.length} demos → ${outDir}`);
console.log(`manifest: ${join(outDir, 'manifest.json')}`);
