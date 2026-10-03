// The code-colour gate — code text in a demo is COLOURED, on the JS page and in
// every framework version: Mermaid, SQL, XML and the native spec read as code,
// not as grey text. The gallery's editor (demos/shell/code-editor.js) loads
// Monaco from its CDN; a demo whose text box never became an editor, or whose
// Mermaid tokens all came out one colour, fails here.
//
//     node demos/e2e/code-colour-run.mjs            (after building the four apps)
//     node demos/e2e/code-colour-run.mjs --origin https://grafloria.com
//
// A text box that stays a plain textarea is exactly what a visitor saw in the
// Qwik Mermaid viewer before this gate (2026-10-03).

import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, join, extname } from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const originIdx = process.argv.indexOf('--origin');
const LIVE = originIdx >= 0 ? String(process.argv[originIdx + 1] ?? '').replace(/\/$/, '') : null;

// route → what holds its code, and (optionally) a click that shows more code.
const PAGES = [
  { route: 'misc/mermaid-viewer', kind: 'editor' },
  { route: 'misc/mermaid-text', kind: 'editor' },
  { route: 'diagrams/mermaid-architecture-block', kind: 'editor' },
  { route: 'diagrams/architecture-layout', kind: 'editor' },
  { route: 'diagrams/query-builder', kind: 'editor' },
  { route: 'misc/drawio-import', kind: 'editor' },
  { route: 'diagrams/ai-style-diagram', kind: 'block', then: /Mermaid/ },
];

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png' };
const serve = (dir, port) => new Promise((resolve) => {
  const s = createServer(async (req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    try {
      const data = await readFile(join(dir, p));
      res.writeHead(200, { 'content-type': MIME[extname(p)] ?? 'application/octet-stream' });
      res.end(data);
    } catch { res.writeHead(404); res.end(); }
  });
  s.listen(port, () => resolve(s));
});

const APPS = [
  { fw: 'js', dir: join(root, 'demos'), port: 4440, url: (b, r) => `${b}/${r}.html`, ready: '__demoReady', live: '/demos' },
  { fw: 'angular', dir: join(root, 'dist/apps/demos-angular/browser'), port: 4441, url: (b, r) => `${b}/#/${r}`, ready: '__ngDemoReady', live: '/demos-angular' },
  { fw: 'react', dir: join(root, 'dist/apps/demos-react'), port: 4442, url: (b, r) => `${b}/#/${r}`, ready: '__reactDemoReady', live: '/demos-react' },
  { fw: 'vue', dir: join(root, 'dist/apps/demos-vue'), port: 4443, url: (b, r) => `${b}/#/${r}`, ready: '__vueDemoReady', live: '/demos-vue' },
  { fw: 'qwik', dir: join(root, 'dist/apps/demos-qwik'), port: 4444, url: (b, r) => `${b}/#/${r}`, ready: '__qwikDemoReady', live: '/demos-qwik' },
];

const servers = [];
for (const app of APPS) {
  if (LIVE) { app.base = LIVE + app.live; continue; }
  if (!existsSync(app.dir)) throw new Error(`code-colour-run: ${app.dir} is missing — build the ${app.fw} app first`);
  servers.push(await serve(app.dir, app.port));
  app.base = `http://localhost:${app.port}`;
}

// Distinct token colours among the coloured text — plain text is ONE colour.
const COLOURS = (kind) => {
  const sel = kind === 'editor' ? '.monaco-editor .view-line span span' : 'pre span';
  return new Set([...document.querySelectorAll(sel)].map((e) => getComputedStyle(e).color)).size;
};

const browser = await chromium.launch();
let failed = 0, ran = 0;
for (const { route, kind, then } of PAGES) {
  for (const app of APPS) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e).slice(0, 140)));
    let colours = 0, note = '';
    try {
      await page.goto(app.url(app.base, route), { waitUntil: 'networkidle' });
      await page.waitForFunction((f) => window[f] === true, app.ready, { timeout: 20000 });
      if (then) await page.getByRole('button', { name: then }).first().click();
      await page.waitForFunction((k) => {
        const sel = k === 'editor' ? '.monaco-editor .view-line span span' : 'pre span';
        return document.querySelectorAll(sel).length > 3;
      }, kind, { timeout: 25000 });
      await page.waitForTimeout(300);
      colours = await page.evaluate(COLOURS, kind);
    } catch (e) {
      note = String(e.message ?? e).split('\n')[0].slice(0, 120);
    }
    ran++;
    const ok = colours >= 3 && errs.length === 0;
    if (!ok) failed++;
    console.log(`${ok ? '✓' : '✗'} ${app.fw.padEnd(7)} ${route}  colours=${colours}${note ? '  ' + note : ''}${errs.length ? '  ' + errs[0] : ''}`);
    await page.close();
  }
}
await browser.close();
servers.forEach((s) => s.close());
console.log(`\ncode colour: ${ran - failed}/${ran} pass`);
process.exit(failed ? 1 : 0);
