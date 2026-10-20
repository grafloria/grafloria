/**
 * MERMAID IN A DOCUMENTATION READER — every word the author wrote, visible.
 *
 * A docs reader that swapped Mermaid for Grafloria measured its own manual and
 * found 13 of 32 diagrams losing or hiding text: edge labels under boxes and on
 * top of each other, node text cut with "…", a dark theme's labels black on
 * near-black, and figures fitted to a narrow column drawn as empty boxes (the
 * default level of detail shed their text). This gate is that measurement,
 * made permanent. Each fence is mounted the way a reader mounts it —
 * `createDiagram(host, { readonly: true, theme, lod: 'document' })` (a figure
 * nobody can zoom sheds nothing), `loadText`, `fitView` — at the reader's
 * column width (713 px), in light and in dark, and the live SVG must show:
 *
 *   - every node and every edge of the model drawn, with its text;
 *   - no edge label overlapping another label or a node box (links paint
 *     under nodes, so such a label is clipped);
 *   - no node label cut with "…", clipped by its box, or shrunk to fit a box too narrow for a word;
 *   - edge-label text at a contrast of at least 4.5:1 against its box;
 *   - every box and every edge label inside the figure, none cut by its edge;
 *   - no line drawn OVER another edge's label (Mermaid paints every label
 *     above every line; a line passing under a label's chip is hidden by it);
 *   - no edge end that hooks back: a line overshooting its arrowhead and
 *     curling into it turns more than 120° within its first or last 14 px;
 *   - text as big on screen as Mermaid's: the smallest text (its font size ×
 *     the scale the figure was fitted at) never both under 10 px and under
 *     0.8× the smallest in Mermaid's own drawing of the fence at that width
 *     (Mermaid 11, `useMaxWidth`, as a reader embeds it). Long edge labels
 *     kept on one line widen the figure, and the fit shrinks everything.
 *
 * Run: node demos/e2e/mermaid-reader-run.mjs [--corpus file.json] [--width 713] [--shots dir]
 *        [--report file.json]  each render's numbers (zoom, smallest text on screen, Mermaid's, problems)
 *        [--face "font stack"] draw Grafloria in another face (to tell layout from font)
 *        [--fit 16]            the margin fitView leaves (the reader's 16; Mermaid pads 8)
 *        [--server]            the SERVER path instead of the live canvas: importDiagramText, then
 *                              renderToStaticSVG with no measure, sized to its label-inclusive bounds
 *                              plus the margin and shown at most column-wide (as a publish-time renderer)
 *        [--mermaid file.js]   another Mermaid build (Atloria pins 11.12.2)
 *        [--mermaid-face page] draw Mermaid in the page's font, as a reader embedding it does
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
const REPORT = arg('--report', null);
const FACE = arg('--face', null);
const FIT = Number(arg('--fit', '16'));
const SERVER = argv.includes('--server');
const MERMAID_FACE = arg('--mermaid-face', null);
const corpus = JSON.parse(readFileSync(corpusFile, 'utf8'));

// The surface a reader imports: parse, mount read-only, the two themes.
const ENTRY = join(tmpdir(), 'mermaid-reader-entry.js');
const BUNDLE = join(tmpdir(), 'mermaid-reader-grafloria.js');
writeFileSync(
  ENTRY,
  `import { importDiagramText, runDeterministic } from '@grafloria/engine';
import { createDiagram, renderToStaticSVG, LIGHT_THEME, DARK_THEME } from '@grafloria/renderer';
import { contentBounds } from ${JSON.stringify(join(REPO, 'libs/renderer/src/instance/content-bounds.ts'))};
window.GF = { importDiagramText, runDeterministic, createDiagram, renderToStaticSVG, contentBounds, LIGHT_THEME, DARK_THEME };
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
  #host, #mermaid { position: relative; }
</style>
<div id="host"></div>
<div id="mermaid"></div>
<script src="/mermaid.min.js"></script>
<script type="module">mermaid.initialize({ startOnLoad: false }); import '/grafloria.js'; window.__ready = true;</script>`;

const MERMAID_UMD = resolve(arg('--mermaid', join(REPO, 'node_modules/mermaid/dist/mermaid.min.js')));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: WIDTH + 40, height: 1000 } });
await page.route('http://reader/**', (route) => {
  const path = new URL(route.request().url()).pathname;
  if (path === '/grafloria.js') return route.fulfill({ path: BUNDLE, contentType: 'text/javascript' });
  if (path === '/mermaid.min.js') return route.fulfill({ path: MERMAID_UMD, contentType: 'text/javascript' });
  return route.fulfill({ body: PAGE, contentType: 'text/html' });
});
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

let failed = 0;
const report = [];
for (const fence of corpus) {
  for (const theme of ['light', 'dark']) {
    const errors = [];
    page.removeAllListeners('pageerror');
    page.on('pageerror', (e) => errors.push(`page error: ${String(e).slice(0, 160)}`));
    await page.goto('http://reader/');
    await page.waitForFunction(() => window.__ready && window.GF);
    const r = await page.evaluate(
      async ({ source, theme, width, face, fit, server, mermaidFace }) => {
        document.body.className = theme;
        const host = document.getElementById('host');
        // The size a word is drawn at on screen: its font size × the scale of
        // the drawing it sits in.
        const onScreen = (el) => {
          const scaled = el.closest('text, foreignObject') ?? el;
          const m = scaled.getScreenCTM?.();
          return parseFloat(getComputedStyle(el).fontSize) * (m ? Math.hypot(m.a, m.b) : 1);
        };
        const smallest = (els) => {
          const sizes = els.filter((el) => el.textContent.trim() && el.getClientRects().length).map(onScreen);
          return sizes.length ? Math.min(...sizes) : undefined;
        };
        // Mermaid's own drawing of the fence at this width (when it accepts it).
        let mermaidPx;
        let mermaidBlind = false;
        try {
          // Mermaid in the page's font, as a reader embedding it is (or its own default face).
          const pageFont = getComputedStyle(document.body).fontFamily;
          mermaid.initialize(mermaidFace === 'page' ? { startOnLoad: false, fontFamily: pageFont, themeVariables: { fontFamily: pageFont } } : { startOnLoad: false });
          const out = await mermaid.render('mm' + Math.random().toString(36).slice(2), source);
          const holder = document.getElementById('mermaid');
          holder.style.width = width + 'px';
          holder.innerHTML = out.svg;
          // The innermost element that holds the words (Mermaid 11 wraps a
          // label as <span><p>…</p></span> inside a foreignObject).
          const words = [...holder.querySelectorAll('foreignObject *, text, tspan')].filter(
            (el) => ![...el.children].some((c) => c.textContent.trim())
          );
          mermaidPx = smallest(words);
          holder.innerHTML = '';
          // Mermaid drew it, so it has words to measure: none found means this
          // check is blind, which must not pass as "as big as Mermaid".
          mermaidBlind = mermaidPx === undefined && /[A-Za-z]/.test(source.replace(/^\s*\w+.*$/m, ''));
        } catch {
          mermaidPx = undefined; // Mermaid refuses this fence: nothing to compare with
        }
        const parsed = GF.importDiagramText(source);
        if (parsed.unsupported || parsed.errors?.length) {
          return { refused: parsed.unsupported ? `unsupported ${parsed.unsupported}` : parsed.errors[0] };
        }
        host.style.width = width + 'px';
        host.style.height = '400px';
        const base = theme === 'dark' ? GF.DARK_THEME : GF.LIGHT_THEME;
        const look = face ? { ...base, typography: { ...base.typography, fontFamily: { ...base.typography.fontFamily, default: face } } } : base;
        let svg, model, zoom;
        if (server) {
          // THE SERVER PATH: no canvas, nothing measured — the import estimates,
          // the SVG is made from the model and sized to what it draws, labels included.
          const made = GF.runDeterministic(() => {
            const d = GF.importDiagramText(source).diagram;
            const b = GF.contentBounds(d, look);
            const w = Math.ceil(b.width + 2 * fit);
            const h = Math.ceil(b.height + 2 * fit);
            const out = GF.renderToStaticSVG({ nodes: d.getNodes(), edges: d.getLinks(), groups: d.getGroups(), theme: look, width: w, height: h, zoom: 1, viewport: { x: b.x - fit, y: b.y - fit }, standalone: true, instanceId: 'gf-ssr', lod: 'document' });
            return { d, out, w };
          });
          host.style.height = 'auto';
          host.innerHTML = `<style>${made.out.css}</style>` + made.out.svg;
          svg = host.querySelector('svg');
          svg.setAttribute('width', made.w);
          svg.removeAttribute('height');
          svg.style.cssText = `display:block;max-width:100%;height:auto;width:${made.w}px`;
          model = made.d;
          await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
          zoom = svg.getBoundingClientRect().width / made.w;
        } else {
        const inst = GF.createDiagram(host, { readonly: true, lod: 'document', theme: look });
        inst.loadText(source);
        // Height from the DRAWN figure's aspect ratio, as a reader sizes it:
        // everything the canvas draws, labels included (getContentBounds) — the
        // canvas measured the words in the page, so the parsed-only model (which
        // estimates) has another shape. The canvas follows its container.
        const drawn = inst.getContentBounds?.() ?? (() => {
          // A build without getContentBounds: its boxes.
          let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
          for (const n of inst.getModel().getNodes()) {
            minx = Math.min(minx, n.position.x); miny = Math.min(miny, n.position.y);
            maxx = Math.max(maxx, n.position.x + n.size.width); maxy = Math.max(maxy, n.position.y + n.size.height);
          }
          return { width: maxx - minx, height: maxy - miny };
        })();
        host.style.height = Math.max(140, Math.min(900, Math.round((width * (drawn.height + 80)) / (drawn.width + 80)))) + 'px';
        await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
        inst.fitView(fit);
        inst.renderNow();
        await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
        svg = host.querySelector('svg');
        model = inst.getEngine().getDiagram();
        zoom = inst.viewport.getZoom();
        }
        const box = (el) => { const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; };
        const overlap = (a, b) =>
          Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) - 1) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) - 1);
        const problems = [];
        if (mermaidBlind) problems.push("Mermaid's text size could not be measured");

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
        // …and none cut by its clip box: the text as the browser lays it out, in
        // the real font, wider or taller than the box it is clipped to.
        for (const t of texts) {
          const id = t.getAttribute('clip-path')?.match(/#([^)]+)/)?.[1];
          const rect = id && document.getElementById(id)?.querySelector('rect');
          if (!rect) continue;
          const bb = t.getBBox();
          if (bb.width > +rect.getAttribute('width') + 1 || bb.height > +rect.getAttribute('height') + 1) problems.push(`clipped: "${t.textContent.trim()}"`);
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

        // Nothing cut by the figure's own edge: a label hanging past every box
        // was sliced by the fit ("deliver all active orders" → "ver all active orders").
        const frame = box(host);
        const outside = (b) => b.x < frame.x - 1 || b.y < frame.y - 1 || b.x + b.w > frame.x + frame.w + 1 || b.y + b.h > frame.y + frame.h + 1;
        for (const l of labelBoxes) if (outside(l.b)) problems.push(`label cut by the frame: "${l.text}"`);
        for (const g of nodeGroups) if (outside(box(g.querySelector('.diagram-node') ?? g))) problems.push(`box cut by the frame: "${g.textContent.trim()}"`);

        // No line drawn over another edge's label: sampled every ~3 px on screen,
        // a run of samples inside another label's chip (2 px in) is a crossing —
        // and it shows only when the line paints AFTER the label (SVG paints in
        // document order); a line under the chip is hidden, as in Mermaid.
        const chips = labelGroups.map((g) => ({ el: g, link: g.closest('g.link-group')?.getAttribute('data-link-id'), text: g.textContent.trim(), b: box(g.querySelector('rect.link-label-bg') ?? g) }));
        for (const g of linksWithPath) {
          const id = g.getAttribute('data-link-id');
          const path = g.querySelector('path.diagram-link');
          const m = path.getScreenCTM();
          const length = path.getTotalLength();
          if (!m || !length) continue;
          const step = 3 / Math.hypot(m.a, m.b);
          for (const chip of chips) {
            if (chip.link === id) continue;
            if (!(chip.el.compareDocumentPosition(path) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
            let run = 0;
            for (let at = 0; at <= length; at += step) {
              const q = path.getPointAtLength(at);
              const x = m.a * q.x + m.c * q.y + m.e;
              const y = m.b * q.x + m.d * q.y + m.f;
              const inside = x > chip.b.x + 2 && x < chip.b.x + chip.b.w - 2 && y > chip.b.y + 2 && y < chip.b.y + chip.b.h - 2;
              run = inside ? run + 1 : 0;
              if (run >= 3) {
                problems.push(`a line is drawn over the label "${chip.text}"`);
                break;
              }
            }
          }
        }

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

        // No edge end hooks back: the line's heading turns under 120° over its
        // first and last 14 px on screen (an overshoot curls straight back).
        const turning = (path, from, to) => {
          let total = 0;
          let heading = null;
          let last = path.getPointAtLength(from);
          for (let k = 1; k <= 28; k++) {
            const q = path.getPointAtLength(from + ((to - from) * k) / 28);
            const dx = q.x - last.x, dy = q.y - last.y;
            last = q;
            if (Math.hypot(dx, dy) < 1e-6) continue;
            const a = Math.atan2(dy, dx);
            if (heading !== null) {
              let d = Math.abs(a - heading);
              if (d > Math.PI) d = 2 * Math.PI - d;
              total += d;
            }
            heading = a;
          }
          return (total * 180) / Math.PI;
        };
        for (const g of linksWithPath) {
          const path = g.querySelector('path.diagram-link');
          const length = path.getTotalLength();
          const m = path.getScreenCTM();
          if (!length || !m) continue;
          const span = Math.min(length / 3, 14 / Math.hypot(m.a, m.b));
          const worst = Math.max(turning(path, 0, span), turning(path, length - span, length));
          if (worst > 120) problems.push(`an edge end hooks back (${Math.round(worst)}°) on ${g.getAttribute('data-link-id')}`);
        }

        // Text as big on screen as Mermaid draws it at the same width.
        const grafloriaPx = smallest([...texts, ...labelGroups.map((g) => g.querySelector('text')).filter(Boolean)]);
        if (grafloriaPx !== undefined && mermaidPx !== undefined && grafloriaPx < 10 && grafloriaPx < 0.8 * mermaidPx) {
          problems.push(`text ${grafloriaPx.toFixed(1)}px on screen, Mermaid's ${mermaidPx.toFixed(1)}px`);
        }
        return {
          problems,
          zoom: +zoom.toFixed(2),
          nodes: nodeGroups.length,
          edges: linkGroups.length,
          grafloriaPx,
          mermaidPx,
          px: grafloriaPx === undefined ? '' : ` · text ${grafloriaPx.toFixed(1)}px` + (mermaidPx === undefined ? '' : ` (Mermaid ${mermaidPx.toFixed(1)}px)`),
        };
      },
      { source: fence.source, theme, width: WIDTH, face: FACE, fit: FIT, server: SERVER, mermaidFace: MERMAID_FACE }
    );
    const id = `${fence.id} (${theme})`;
    report.push({ id: fence.id, theme, width: WIDTH, refused: r.refused ?? null, zoom: r.zoom ?? null, grafloriaPx: r.grafloriaPx ?? null, mermaidPx: r.mermaidPx ?? null, problems: [...new Set([...(r.problems ?? []), ...errors])] });
    // A refused fence draws nothing: there is no figure to photograph.
    if (SHOTS && !r.refused) await page.locator('#host').screenshot({ path: join(SHOTS, `${fence.id.replace(/[^a-z0-9-]+/gi, '_')}.${theme}.png`) });
    const problems = [...(r.problems ?? []), ...errors];
    if (r.refused) {
      // A fence Mermaid accepts must draw; one it refuses (expected: false) must be refused.
      if (fence.expected === 'refused') console.log(`✓ ${id}  refused as expected: ${r.refused.slice(0, 90)}`);
      else { failed++; console.log(`✗ ${id}  refused: ${r.refused.slice(0, 140)}`); }
      continue;
    }
    if (fence.expected === 'refused') { failed++; console.log(`✗ ${id}  drew a fence that must be refused`); continue; }
    if (problems.length) { failed++; console.log(`✗ ${id}  zoom ${r.zoom}: ${[...new Set(problems)].slice(0, 6).join('; ')}`); }
    else console.log(`✓ ${id}  ${r.nodes} nodes, ${r.edges} edges at zoom ${r.zoom}${r.px}`);
  }
}
await browser.close();
if (REPORT) writeFileSync(REPORT, JSON.stringify(report, null, 1));
console.log(`mermaid reader: ${corpus.length * 2 - failed}/${corpus.length * 2} renders show every word, clear and legible`);
process.exit(failed === 0 ? 0 : 1);
