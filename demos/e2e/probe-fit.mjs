// One-off probe: for the pages the audit flagged as clipped/over-zoomed, compare
// the model's content bounds against the viewport's visible world rect.
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join, extname } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  try {
    const body = readFileSync(join(root, url === '/' ? 'index.html' : url));
    res.writeHead(200, { 'Content-Type': MIME[extname(url)] ?? 'application/octet-stream' }).end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
const pages = process.argv.slice(2);
for (const rel of pages) {
  const tab = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await tab.goto(`${origin}/${rel}`);
  await tab.waitForFunction(() => window.__demoReady === true, { timeout: 15000 });
  const info = await tab.evaluate(() => {
    const inst = window.__demoCtx?.instance;
    if (!inst) return { error: 'no ctx.instance exposed' };
    const model = inst.getModel();
    const nodes = model.getNodes();
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    for (const n of nodes) {
      l = Math.min(l, n.position.x); t = Math.min(t, n.position.y);
      r = Math.max(r, n.position.x + (n.size?.width ?? 0));
      b = Math.max(b, n.position.y + (n.size?.height ?? 0));
    }
    const vb = inst.viewport.getViewBox();
    const host = document.getElementById('canvas')?.getBoundingClientRect();
    return {
      nodes: nodes.length,
      content: { l, t, r, b, w: r - l, h: b - t },
      viewBox: vb,
      zoom: inst.viewport.zoom,
      hostRect: host ? { w: Math.round(host.width), h: Math.round(host.height) } : null,
      contained: l >= vb.x && t >= vb.y && r <= vb.x + vb.width && b <= vb.y + vb.height,
    };
  });
  console.log(rel, JSON.stringify(info));
  await tab.close();
}
await browser.close();
server.close();
