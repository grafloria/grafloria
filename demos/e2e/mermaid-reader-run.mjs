/**
 * MERMAID IN A DOCUMENTATION READER — every word the author wrote, visible.
 *
 * A docs reader that swapped Mermaid for Grafloria measured its own manual and
 * found 13 of 32 diagrams losing or hiding text: edge labels under boxes and on
 * top of each other, node text cut with "…", a dark theme's labels black on
 * near-black, and figures fitted to a narrow column drawn as empty boxes (the
 * default level of detail shed their text). This gate is that measurement,
 * made permanent. Each fence is mounted the way a reader mounts it —
 * `createDiagram(host, { readonly: true, theme })`, `loadText`, `fitView` —
 * at the reader's column width (713 px), in light and in dark, at the DEFAULT
 * level of detail, and the live SVG must show:
 *
 *   - every node and every edge of the model drawn, with its text;
 *   - no edge label overlapping another label or a node box (links paint
 *     under nodes, so such a label is clipped);
 *   - no node label cut with "…", or shrunk to fit a box too narrow for a word;
 *   - edge-label text at a contrast of at least 4.5:1 against its box.
 *
 * Run: node demos/e2e/mermaid-reader-run.mjs [--corpus file.json] [--width 713] [--shots dir]
 *
 * The default corpus (mermaid-reader-fences.json) is shaped like a business
 * manual's fences — flowchart LR and stateDiagram-v2, branching lifecycles,
 * long labels, both directions of a pair. `--corpus` takes any JSON array of
 * { id, source } — a real manual's fences, kept outside this repo.
 *
 * WHY IT BUILDS ITS OWN BUNDLE: like the Mermaid oracle, it gates the SOURCE
 * (renderer + engine), and never rewrites the shared demo bundle.
 */
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : fallback;
};
const corpusFile = resolve(arg('--corpus', join(HERE, 'mermaid-reader-fences.json')));
const WIDTH = Number(arg('--width', '713'));
const SHOTS = arg('--shots', null);
const corpus = JSON.parse(readFileSync(corpusFile, 'utf8'));

// The surface a reader imports: parse, mount read-only, the two themes.
const ENTRY = join(tmpdir(), 'mermaid-reader-entry.js');
const BUNDLE = join(tmpdir(), 'mermaid-reader-grafloria.js');
writeFileSync(
  ENTRY,
  `import { importDiagramText } from '@grafloria/engine';
import { createDiagram, LIGHT_THEME, DARK_THEME } from '@grafloria/renderer';
window.GF = { importDiagramText, createDiagram, LIGHT_THEME, DARK_THEME };
`
);
await build({
  entryPoints: [ENTRY],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  outfile: BUNDLE,
  alias: {
    '@grafloria/engine': join(REPO, 'libs/engine/src/index.ts'),
    '@grafloria/renderer': join(REPO, 'libs/renderer/src/index.ts'),
    'fs/promises': join(REPO, 'libs/renderer/e2e/node-stubs.ts'),
    path: join(REPO, 'libs/renderer/e2e/node-stubs.ts'),
  },
  tsconfigRaw: { compilerOptions: { experimentalDecorators: true, emitDecoratorMetadata: false, useDefineForClassFields: false } },
  logLevel: 'warning',
});

const PAGE = `<!doctype html><meta charset="utf-8">
<style>
  html, body { margin: 0; font-family: system-ui, sans-serif; }
  body.light { background: #ffffff; } body.dark { background: #0b1020; }
  #host { position: relative; }
</style>
<div id="host"></div>
<script type="module">import '/grafloria.js'; window.__ready = true;</script>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: WIDTH + 40, height: 1000 } });
await page.route('http://reader/**', (route) => {
  const path = new URL(route.request().url()).pathname;
  if (path === '/grafloria.js') return route.fulfill({ path: BUNDLE, contentType: 'text/javascript' });
  return route.fulfill({ body: PAGE, contentType: 'text/html' });
});
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

let failed = 0;
for (const fence of corpus) {
  for (const theme of ['light', 'dark']) {
    const errors = [];
    page.removeAllListeners('pageerror');
    page.on('pageerror', (e) => errors.push(`page error: ${String(e).slice(0, 160)}`));
    await page.goto('http://reader/');
    await page.waitForFunction(() => window.__ready && window.GF);
    const r = await page.evaluate(
      async ({ source, theme, width }) => {
        document.body.className = theme;
        const host = document.getElementById('host');
        const parsed = GF.importDiagramText(source);
        if (parsed.unsupported || parsed.errors?.length) {
          return { refused: parsed.unsupported ? `unsupported ${parsed.unsupported}` : parsed.errors[0] };
        }
        // Height from the content's aspect ratio, as a reader sizes a figure.
        const nodes = parsed.diagram.getNodes();
        let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
        for (const n of nodes) {
          minx = Math.min(minx, n.position.x); miny = Math.min(miny, n.position.y);
          maxx = Math.max(maxx, n.position.x + n.size.width); maxy = Math.max(maxy, n.position.y + n.size.height);
        }
        const height = Math.max(140, Math.min(900, Math.round((width * (maxy - miny + 80)) / (maxx - minx + 80))));
        host.style.width = width + 'px';
        host.style.height = height + 'px';
        const inst = GF.createDiagram(host, { readonly: true, theme: theme === 'dark' ? GF.DARK_THEME : GF.LIGHT_THEME });
        inst.loadText(source);
        inst.fitView(16);
        inst.renderNow();
        await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
        const svg = host.querySelector('svg');
        const model = inst.getEngine().getDiagram();
        const box = (el) => { const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; };
        const overlap = (a, b) =>
          Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) - 1) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) - 1);
        const problems = [];

        // Every node and edge drawn — and every labelled node shows its words.
        const nodeGroups = [...svg.querySelectorAll('g.node-group')];
        const linkGroups = [...svg.querySelectorAll('g.link-group')];
        if (nodeGroups.length < model.getNodes().length) problems.push(`${model.getNodes().length - nodeGroups.length} node(s) not drawn`);
        if (linkGroups.length < model.getLinks().length) problems.push(`${model.getLinks().length - linkGroups.length} edge(s) not drawn`);
        const linksWithPath = linkGroups.filter((g) => g.querySelector('path.diagram-link'));
        if (linksWithPath.length < model.getLinks().length) problems.push('an edge has no line');
        const labelled = model.getNodes().filter((n) => String(n.getLabel?.() ?? '').trim()).length;
        const texts = [...svg.querySelectorAll('text.diagram-label')].filter((t) => t.textContent.trim());
        if (texts.length < labelled) problems.push(`${labelled - texts.length} node label(s) not shown`);
        const edgeLabels = model.getLinks().filter((l) => l.labels?.[0]?.text || l.getMetadata('label')).length;
        const labelGroups = [...svg.querySelectorAll('g.link-label-group')].filter((g) => g.textContent.trim());
        if (labelGroups.length < edgeLabels) problems.push(`${edgeLabels - labelGroups.length} edge label(s) not shown`);

        // No "…", and no label shrunk to fit a box too narrow for one of its words.
        for (const t of texts) if (t.textContent.includes('…')) problems.push(`cut: "${t.textContent.trim()}"`);
        for (const t of texts) {
          const px = parseFloat(getComputedStyle(t).fontSize);
          if (px < 12) problems.push(`shrunk to ${px}px: "${t.textContent.trim()}"`);
        }

        // No edge label under a node or another label. Links paint under nodes,
        // so a box hides a label only where it paints: a see-through container
        // (a composite state's body, a region's band) hides nothing.
        const paints = (el) => {
          const cs = getComputedStyle(el);
          if (cs.fill === 'none' || Number(cs.fillOpacity) === 0 || Number(cs.opacity) === 0) return false;
          const alpha = cs.fill.match(/rgba\([^)]*,\s*([\d.]+)\)/);
          return !(alpha && Number(alpha[1]) === 0);
        };
        const nodeBoxes = nodeGroups
          .map((g) => g.querySelector('.diagram-node') ?? g)
          .filter(paints)
          .map(box);
        const labelBoxes = labelGroups.map((g) => ({ text: g.textContent.trim(), b: box(g.querySelector('rect.link-label-bg') ?? g) }));
        for (const l of labelBoxes) if (nodeBoxes.some((n) => overlap(l.b, n) > 4)) problems.push(`label under a box: "${l.text}"`);
        for (let i = 0; i < labelBoxes.length; i++)
          for (let j = i + 1; j < labelBoxes.length; j++)
            if (overlap(labelBoxes[i].b, labelBoxes[j].b) > 4) problems.push(`labels overlap: "${labelBoxes[i].text}" / "${labelBoxes[j].text}"`);

        // Edge-label contrast (WCAG), from the painted colours.
        const lum = (c) => {
          const m = (c.match(/\d+(\.\d+)?/g) || [0, 0, 0]).map(Number);
          const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
          return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]);
        };
        for (const g of labelGroups) {
          const t = g.querySelector('text');
          const b = g.querySelector('rect');
          if (!t || !b) continue;
          const a = lum(getComputedStyle(t).fill);
          const c = lum(getComputedStyle(b).fill);
          const ratio = (Math.max(a, c) + 0.05) / (Math.min(a, c) + 0.05);
          if (ratio < 4.5) problems.push(`label contrast ${ratio.toFixed(2)}:1 "${g.textContent.trim()}"`);
        }
        return { problems, zoom: +inst.viewport.getZoom().toFixed(2), nodes: nodeGroups.length, edges: linkGroups.length };
      },
      { source: fence.source, theme, width: WIDTH }
    );
    const id = `${fence.id} (${theme})`;
    if (SHOTS) await page.locator('#host').screenshot({ path: join(SHOTS, `${fence.id.replace(/[^a-z0-9-]+/gi, '_')}.${theme}.png`) });
    const problems = [...(r.problems ?? []), ...errors];
    if (r.refused) {
      // A fence Mermaid accepts must draw; one it refuses (expected: false) must be refused.
      if (fence.expected === 'refused') console.log(`✓ ${id}  refused as expected: ${r.refused.slice(0, 90)}`);
      else { failed++; console.log(`✗ ${id}  refused: ${r.refused.slice(0, 140)}`); }
      continue;
    }
    if (fence.expected === 'refused') { failed++; console.log(`✗ ${id}  drew a fence that must be refused`); continue; }
    if (problems.length) { failed++; console.log(`✗ ${id}  zoom ${r.zoom}: ${[...new Set(problems)].slice(0, 6).join('; ')}`); }
    else console.log(`✓ ${id}  ${r.nodes} nodes, ${r.edges} edges at zoom ${r.zoom}`);
  }
}
await browser.close();
console.log(`mermaid reader: ${corpus.length * 2 - failed}/${corpus.length * 2} renders show every word, clear and legible`);
process.exit(failed === 0 ? 0 : 1);
