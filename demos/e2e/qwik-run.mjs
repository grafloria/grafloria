// THE QWIK GATE — `@grafloria/qwik` driven in a real browser, through a real
// Qwik build.
//
// The Qwik binding cannot go through demos/build.mjs like the others: Qwik's
// optimizer is what turns `component$`, `$()` and every QRL into loadable
// segments, so the library has to pass through the Qwik Vite plugin — which
// is exactly what a consumer's app does. This gate starts the SSR demo app
// (apps/demos-qwik, Vite in `--mode ssr`) and drives every page:
//
//   PAINT        the canvas draws the nodes and lines the page declares
//   NO-ERRORS    no page error, no console error
//   DRAG-1:1     a node follows the pointer at full speed
//   CUSTOM       Qwik components render as the custom nodes, wired to lines
//   HOOKS        the toolbar drives the canvas through the provider and hooks
//   ZONES/LINES  `groups` and `highlightConnected` go in at mount and follow live
//   SPEC         <GrafloriaDiagram> replaces its diagram on a changed spec, not an equal one
//   SSR          the server's HTML already contains the laid-out diagram, and
//                the adopted <svg> leaves its size to the container (a fixed
//                server size made every drag run at half speed — the bug the
//                first Qwik PR uncovered)
//
//     node demos/e2e/qwik-run.mjs

import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { createServer } from 'net';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const freePort = () => new Promise((resolve) => {
  const s = createServer();
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
});
const port = await freePort();
const origin = `http://localhost:${port}`;

const vite = spawn('npx', ['vite', '--config', 'apps/demos-qwik/vite.config.ts', '--mode', 'ssr', '--port', String(port), '--strictPort'],
  { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
let viteLog = '';
vite.stdout.on('data', (d) => { viteLog += d; });
vite.stderr.on('data', (d) => { viteLog += d; });
const stop = () => { try { process.kill(-vite.pid, 'SIGTERM'); } catch { /* already gone */ } };
process.on('exit', stop);

const checks = [];
const check = (page, name, ok, detail = '') => checks.push({ page, name, ok: !!ok, detail });

try {
  // -- wait for the dev server ------------------------------------------------
  let up = false;
  for (let i = 0; i < 120 && !up; i++) {
    try { up = (await fetch(origin + '/')).ok; } catch { /* not yet */ }
    if (!up) await new Promise((r) => setTimeout(r, 500));
  }
  if (!up) throw new Error(`the Qwik demo server never answered on ${origin}\n${viteLog.slice(-2000)}`);

  const browser = await chromium.launch();

  const open = async (slug) => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.slice(0, 200)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
    const res = await page.goto(`${origin}/?demo=${slug}`, { waitUntil: 'networkidle' });
    const serverHtml = await res.text();
    await page.waitForFunction(() => document.querySelectorAll('svg [data-node-id]').length > 0, null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(400);
    return { page, errors, serverHtml };
  };
  const counts = (page) => page.evaluate(() => ({
    nodes: document.querySelectorAll('svg [data-node-id]').length,
    links: document.querySelectorAll('[data-link-id]').length,
  }));
  // Drag the first SVG node at hand speed; report how far it moved vs the pointer.
  const drag = async (page) => {
    const g = await page.$('svg [data-node-id]');
    if (!g) return null;
    const id = await g.getAttribute('data-node-id');
    const a = await g.boundingBox();
    const sx = a.x + a.width / 2, sy = a.y + a.height / 2;
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(sx + i * 10, sy + i * 4);
    await page.mouse.up();
    await page.waitForTimeout(250);
    const b = await (await page.$(`svg [data-node-id="${id}"]`)).boundingBox();
    return { dx: b.x - a.x, dy: b.y - a.y };
  };
  // 80×32 px of pointer travel; the drag threshold eats a few px at the start.
  const oneToOne = (m) => m && Math.abs(m.dx - 80) <= 8 && Math.abs(m.dy - 32) <= 8;

  const PAGES = [
    { slug: 'hello-flow', nodes: 4, links: 3 },
    { slug: 'editor-chrome', nodes: 4, links: 3, extra: async (page) => {
      const has = await page.evaluate(() => ({ minimap: !!document.querySelector('.grafloria-minimap'), controls: !!document.querySelector('.grafloria-controls') }));
      check('editor-chrome', 'PLUGINS', has.minimap && has.controls, `minimap ${has.minimap}, controls ${has.controls}`);
    } },
    { slug: 'auto-layout', nodes: 4, links: 3, extra: async (page) => {
      const spread = await page.evaluate(() => new Set([...document.querySelectorAll('svg [data-node-id]')].map((g) => Math.round(g.getBoundingClientRect().x / 10))).size);
      check('auto-layout', 'LAYOUT', spread >= 3, `${spread} distinct columns after the layout`);
    } },
    { slug: 'custom-nodes', nodes: 1, links: 3, extra: async (page) => {
      const cards = await page.evaluate(() => [...document.querySelectorAll('.grafloria-html-layer [data-node-id]')]
        .map((el) => el.textContent.trim()).filter(Boolean));
      check('custom-nodes', 'CUSTOM', cards.length >= 3, `${cards.length} Qwik custom nodes with content`);
    } },
    { slug: 'toolbar-and-hooks', nodes: 4, links: 3, extra: async (page) => {
      const readout = () => page.evaluate(() => [...document.querySelectorAll('.readout')].map((r) => r.textContent.trim()).join(' | '));
      const zoomOf = (t) => Number((/zoom ([\d.]+)/.exec(t) || [])[1]);
      const before = await readout();
      await page.getByRole('button', { name: 'Zoom in' }).click();
      await page.waitForTimeout(250);
      const after = await readout();
      check('toolbar-and-hooks', 'HOOKS-ZOOM', zoomOf(after) > zoomOf(before), `${before} → ${after}`);
      await page.locator('svg [data-node-id]').first().click();
      await page.waitForTimeout(250);
      const sel = await readout();
      check('toolbar-and-hooks', 'HOOKS-SELECTION', /selected 1 node/.test(sel), sel);
      await page.getByRole('button', { name: 'Export SVG' }).click();
      await page.waitForFunction(() => /bytes of SVG/.test(document.body.textContent), null, { timeout: 10000 }).catch(() => {});
      check('toolbar-and-hooks', 'HOOKS-EXPORT', /bytes of SVG/.test(await readout()), 'Export SVG through useGrafloria()');
    } },
    { slug: 'zones-and-highlight', nodes: 4, links: 3, extra: async (page) => {
      const frames = () => page.evaluate(() => document.querySelectorAll('[data-group-id="warehouse"]').length);
      const dimmed = () => page.evaluate(() => document.querySelectorAll('.link-dimmed').length);
      check('zones-and-highlight', 'GROUPS-IN', (await frames()) > 0, 'the groups prop drew its zone at mount');
      await page.locator('svg [data-node-id="order"]').click();
      await page.waitForTimeout(300);
      const lit = await dimmed();
      check('zones-and-highlight', 'HIGHLIGHT-ON', lit > 0, `${lit} lines faded with "Order placed" selected`);
      await page.locator('#toggle-highlight').click();
      await page.waitForTimeout(300);
      check('zones-and-highlight', 'HIGHLIGHT-LIVE', (await dimmed()) === 0, 'highlightConnected={false} restored every line');
      await page.locator('#toggle-zone').click();
      await page.waitForTimeout(300);
      check('zones-and-highlight', 'GROUPS-LIVE', (await frames()) === 0, 'groups={[]} removed the zone');
      await page.locator('#toggle-zone').click();
      await page.waitForTimeout(300);
    } },
    { slug: 'spec-swap', nodes: 3, links: 2, extra: async (page) => {
      const readies = async () => Number((/ready (\d+)/.exec(await page.locator('#ready-count').textContent()) || [])[1]);
      const labels = () => page.evaluate(() => [...document.querySelectorAll('svg [data-node-id] text')].map((t) => t.textContent).join(' '));
      const first = await readies();
      await page.locator('#swap-spec').click();
      await page.waitForTimeout(400);
      const swapped = await labels();
      check('spec-swap', 'SPEC-CHANGE', /Enrich/.test(swapped) && !/Clean/.test(swapped) && (await readies()) === first + 1,
        `labels after the swap: ${swapped.slice(0, 60)}; ready ${first} → ${await readies()}`);
      const before = await readies();
      await page.locator('#rerender').click();
      await page.locator('#rerender').click();
      await page.waitForTimeout(400);
      check('spec-swap', 'SPEC-EQUAL', (await readies()) === before, `an equal spec on re-render: ready ${before} → ${await readies()}`);
    } },
    { slug: 'ssr-resumable', nodes: 4, links: 3, extra: async (page, serverHtml) => {
      check('ssr-resumable', 'SSR-HTML', /data-node-id="/.test(serverHtml) && /<svg/.test(serverHtml), 'the diagram is in the server HTML, before any script');
      const svg = await page.evaluate(() => {
        const s = document.querySelector('.grafloria-flow svg');
        const c = s.closest('.grafloria-flow').getBoundingClientRect(), r = s.getBoundingClientRect();
        return { width: s.getAttribute('width'), height: s.getAttribute('height'), fills: Math.abs(r.width - c.width) < 2 && Math.abs(r.height - c.height) < 2 };
      });
      check('ssr-resumable', 'SSR-SIZE', svg.width === null && svg.height === null && svg.fills,
        `adopted svg width=${svg.width} height=${svg.height}, fills its container: ${svg.fills}`);
    } },
  ];

  for (const spec of PAGES) {
    const { page, errors, serverHtml } = await open(spec.slug);
    const c = await counts(page);
    check(spec.slug, 'PAINT', c.nodes >= spec.nodes && c.links >= spec.links, `${c.nodes} nodes, ${c.links} lines`);
    if (spec.extra) await spec.extra(page, serverHtml);
    const m = await drag(page);
    check(spec.slug, 'DRAG-1:1', oneToOne(m), m ? `pointer 80,32 → node ${Math.round(m.dx)},${Math.round(m.dy)}` : 'no SVG node to drag');
    check(spec.slug, 'NO-ERRORS', errors.length === 0, errors.slice(0, 3).join(' · '));
    await page.close();
  }
  await browser.close();
} catch (e) {
  check('(harness)', 'RUN', false, String(e && e.stack || e));
} finally {
  stop();
}

let page = '';
for (const c of checks) {
  if (c.page !== page) { page = c.page; console.log(`\n${page}`); }
  console.log(`  ${c.ok ? '✓' : '✗'} ${c.name}${c.detail ? '  — ' + c.detail : ''}`);
}
const failed = checks.filter((c) => !c.ok);
// A run that checked nothing is not a pass.
if (checks.length < 20) failed.push({ name: `only ${checks.length} checks ran` });
console.log(`\nqwik: ${checks.length - failed.length}/${checks.length} checks pass`);
process.exit(failed.length ? 1 : 0);
