// Reproducible side-by-side benchmark: Grafloria vs @xyflow/react on ONE
// deterministic scene, driven identically in headless Chromium.
// Methodology and caveats: see README.md in this directory. Honest numbers
// only — both libraries run their DEFAULTS, no per-library tuning.
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const { chromium } = await import(join(HERE, '..', 'node_modules', 'playwright', 'index.mjs'));

// -- build both bundles from the pinned node_modules --------------------------
mkdirSync(join(HERE, 'dist'), { recursive: true });
execSync(`npx esbuild pages/grafloria-app.js --bundle --format=esm --outfile=dist/grafloria.js --log-level=silent`, { cwd: HERE });
execSync(`npx esbuild pages/reactflow-app.jsx --bundle --format=esm --outfile=dist/reactflow.js --loader:.css=css --log-level=silent`, { cwd: HERE });
const meter = readFileSync(join(HERE, 'pages', 'frame-meter.js'), 'utf8');
for (const lib of ['grafloria', 'reactflow']) {
  const css = lib === 'reactflow' ? '<link rel="stylesheet" href="reactflow.css">' : '';
  writeFileSync(join(HERE, 'dist', `${lib}.html`),
    `<!doctype html><meta charset="utf-8">${css}<style>html,body,#root{margin:0;height:100%}</style>
<div id="root"></div><script>${meter}</script><script type="module" src="${lib}.js"></script>`);
}

const server = createServer((req, res) => {
  try {
    const p = join(HERE, 'dist', decodeURIComponent(req.url.split('?')[0].slice(1) || 'index.html'));
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[extname(p)] ?? 'text/plain';
    res.setHeader('content-type', mime);
    res.end(readFileSync(p));
  } catch { res.statusCode = 404; res.end(); }
});
await new Promise((r) => server.listen(4491, r));

// -- scenarios ---------------------------------------------------------------
const browser = await chromium.launch();
const results = [];
for (const n of [500, 2000]) {
  for (const lib of ['grafloria', 'reactflow']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(`http://localhost:4491/${lib}.html?n=${n}`);
    await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });
    const mountMs = await page.evaluate('window.__mountMs');

    // PAN: continuous mouse-drag pan across the canvas for ~4s
    await page.mouse.move(640, 400);
    await page.evaluate('__meterStart()');
    for (let rep = 0; rep < 4; rep++) {
      await page.mouse.move(1000, 500);
      await page.mouse.down();
      for (let i = 0; i < 25; i++) { await page.mouse.move(1000 - i * 24, 500 - i * 8); await page.waitForTimeout(16); }
      await page.mouse.up();
      await page.mouse.move(1000, 500);
    }
    const pan = await page.evaluate('__meterStop()');

    // DRAG one node for ~2.5s (grab the topmost node near a known position)
    // Both scenes place n0 at world (0,0); after fitView it is at the top-left
    // region. Find its client point via elementFromPoint scan is brittle —
    // instead drag from the canvas center after zooming to 1 is skipped;
    // we drag whatever node is under the first node's DOM box.
    const nodeBox = await page.evaluate((lib2) => {
      if (lib2 === 'reactflow') {
        const el = document.querySelector('.react-flow__node');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }
      // grafloria: ask the API where node n0 is on screen (default nodes are SVG)
      const api = window.__api;
      const node = api.getModel().getNode('n0');
      const host = api.container.getBoundingClientRect();
      const c = api.viewport.worldToClient(node.position.x + node.size.width / 2, node.position.y + node.size.height / 2, host);
      return { x: c.x, y: c.y };
    }, lib);
    let drag = null;
    if (nodeBox) {
      await page.evaluate('__meterStart()');
      await page.mouse.move(nodeBox.x, nodeBox.y);
      await page.mouse.down();
      for (let i = 0; i < 60; i++) { await page.mouse.move(nodeBox.x + i * 4, nodeBox.y + Math.sin(i / 6) * 40); await page.waitForTimeout(16); }
      await page.mouse.up();
      drag = await page.evaluate('__meterStop()');
    }
    results.push({ lib, n, mountMs: +mountMs.toFixed(0), pan, drag });
    await page.close();
  }
}
await browser.close(); server.close();

// -- report ------------------------------------------------------------------
const meta = { date: new Date().toISOString().slice(0, 10), machine: `${os.type()} ${os.arch()}, ${os.cpus()[0]?.model ?? ''}, ${Math.round(os.totalmem() / 2 ** 30)}GB` };
writeFileSync(join(HERE, 'results.json'), JSON.stringify({ meta, results }, null, 2));
console.log(`\n${meta.machine} — ${meta.date}`);
console.log('lib        | nodes | mount ms | pan avg/p95 ms | drag avg/p95 ms');
for (const r of results) {
  console.log(`${r.lib.padEnd(10)} | ${String(r.n).padStart(5)} | ${String(r.mountMs).padStart(8)} | ${String(r.pan.avgMs).padStart(6)} / ${String(r.pan.p95Ms).padStart(5)} | ${r.drag ? `${String(r.drag.avgMs).padStart(6)} / ${String(r.drag.p95Ms).padStart(5)}` : '   n/a'}`);
}
