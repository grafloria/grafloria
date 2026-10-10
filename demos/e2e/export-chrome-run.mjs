// GATE — an export is a picture of the DIAGRAM, not of the editor (B6).
//
// After any drag the node is still selected and the pointer still hovers it, and
// every format used to carry the dashed selection ring, the resize dots and the
// hover-only port circles. This drives the REAL gesture (a hand-speed mouse drag,
// pointer left on the node, a link clicked too), then exports SVG, PNG and PDF
// and holds each to two promises:
//   1. no chrome markup in the SVG (selection ring, handles, ports overlay, …);
//   2. byte-identical to the same diagram exported once the selection is cleared
//      and the pointer has left — SVG, PNG and PDF alike.
// …and the screen must still show its selection afterwards.
//
// Needs `demos/shell/grafloria.js` built from current libs (`node demos/build.mjs`).

import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { dirname, extname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const demosRoot = join(here, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  try {
    const path = join(demosRoot, url.slice(1));
    const body = readFileSync(path);
    res.writeHead(200, { 'Content-Type': MIME[extname(path)] ?? 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const checks = [];
const check = (name, ok, detail) => {
  checks.push(ok);
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
};

const CHROME = /selection-highlight|resize-handle|resize-edge|resize-tool-layer|node-ports-overlay|class="port |link-endpoint-handle|connection-preview|snap-guide|class="[^"]*\b(selected|hovered)\b|data-selected="true"|data-focused/g;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
  await page.goto(`${origin}/e2e/export-chrome.html`);
  await page.waitForFunction(() => window.ready === true);
  await page.waitForTimeout(400);

  const box = async (id) => page.evaluate((id) => {
    const r = document.querySelector(`svg.grafloria-diagram [data-node-id="${id}"]`).getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }, id);

  // Drag "Design" 80 px down at hand speed (50 px steps, 16 ms apart) and LEAVE the
  // pointer on it — exactly the state a "Download" click right after a drag sees.
  const b = await box('b');
  const from = { x: b.x + b.w * 0.3, y: b.y + b.h / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 2; i++) {
    await page.mouse.move(from.x, from.y + 40 * i);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  await page.waitForTimeout(400);
  const after = await box('b');
  check('the drag moved the node', Math.abs(after.y - b.y - 80) < 6, `dy=${Math.round(after.y - b.y)}`);

  const onScreen = await page.evaluate(() => ({
    ring: document.querySelectorAll('svg.grafloria-diagram .selection-highlight').length,
    handles: document.querySelectorAll('svg.grafloria-diagram .resize-tool-layer').length,
  }));
  check('the screen shows the selection chrome (so the gate can bite)', onScreen.ring > 0 && onScreen.handles > 0, JSON.stringify(onScreen));

  const exportAll = () => page.evaluate(async () => {
    const i = window.instance;
    const svg = await i.export('svg', { padding: 24 });
    const png = await i.export('png', { padding: 24, scale: 2, backgroundColor: '#ffffff' });
    const pdf = await i.export('pdf', { padding: 24 });
    return { svg, png, pdf };
  });

  const chromed = await exportAll();
  const hits = [...new Set(chromed.svg.match(CHROME) ?? [])];
  check('SVG after a drag carries no selection/handle/port chrome', hits.length === 0, hits.join(', ') || 'clean');

  const still = await page.evaluate(() => ({
    selected: window.instance.getModel().getSelectedNodes().map((n) => n.id),
    ring: document.querySelectorAll('svg.grafloria-diagram .selection-highlight').length,
  }));
  check('the screen keeps its selection after the export', still.selected.includes('b') && still.ring > 0, JSON.stringify(still));

  // The clean reference: nothing selected, pointer off the canvas.
  await page.mouse.move(980, 580);
  await page.evaluate(() => window.instance.getModel().clearSelection());
  await page.waitForTimeout(300);
  const clean = await exportAll();
  check('SVG is byte-identical to the unselected export', chromed.svg === clean.svg, `${chromed.svg.length} vs ${clean.svg.length} chars`);
  check('PNG is byte-identical to the unselected export', chromed.png === clean.png, `${chromed.png.length} vs ${clean.png.length} chars`);
  check('PDF is byte-identical to the unselected export', chromed.pdf === clean.pdf, `${chromed.pdf.length} vs ${clean.pdf.length} chars`);
} finally {
  await browser.close();
  server.close();
}

const failed = checks.filter((c) => !c).length;
console.log(failed ? `\nexport-chrome: ${failed} of ${checks.length} checks FAILED` : `\nexport-chrome: all ${checks.length} checks passed`);
process.exit(failed ? 1 : 0);
