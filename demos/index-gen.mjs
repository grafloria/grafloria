// Generate demos/index.html from the demo pages themselves.
//
// AUTO-DISCOVERING BY DESIGN. The index must never be a hand-maintained list that drifts
// from what actually exists — a gallery whose index claims a demo that 404s, or omits one
// that works, is exactly the "the docs say X, the code does Y" gap this whole gallery was
// built to kill. So the index is GENERATED from each page's own `defineDemo({...})` header:
// the single source of truth is the demo, and this file only reformats it.
//
//     node demos/index-gen.mjs
//
// It reads name / blurb / reactflow / pro out of each page. Those are plain string literals
// in a format we control, so a light parse is honest here (a full JS parse would be
// overkill for four fields). If a demo ever fails to parse, this fails LOUDLY rather than
// silently dropping the card — an index that quietly omits a demo is the failure mode.

import { readdirSync, statSync, readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, relative, sep } from 'path';

const here = dirname(fileURLToPath(import.meta.url));

/** Every demo page, grouped by its top-level directory (= category). */
function collect() {
  const byCat = {};
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (['shell', 'e2e', 'node_modules', 'out'].includes(entry)) continue;
        walk(full);
      } else if (entry.endsWith('.html') && entry !== 'index.html') {
        const rel = relative(here, full);
        const cat = rel.split('/')[0];
        (byCat[cat] ??= []).push({ rel, isNew: isNewDemo(rel), ...parse(full, rel) });
      }
    }
  };
  walk(here);
  return byCat;
}

/** Pull the four declared fields out of a page's defineDemo header. */
function parse(file, rel) {
  const full = readFileSync(file, 'utf8');
  // SCOPE the parse to the defineDemo({...}) call. A page may declare `name:`
  // BEFORE the demo header — typed-ports registers a `{ name: 'number' }` port
  // data type — and a file-wide "first name:" grab reads that instead of the
  // demo's, listing a demo called "number". The single source of truth is the
  // demo header, so parse only from `defineDemo(` onward.
  const at = full.indexOf('defineDemo(');
  if (at === -1) {
    throw new Error(`index-gen: ${rel} has no defineDemo() call`);
  }
  const src = full.slice(at);
  const str = (key) => {
    // name: 'x'  |  name: "x"  — the value is a single- or double-quoted literal.
    const m = src.match(new RegExp(`${key}\\s*:\\s*(['"])((?:\\\\.|(?!\\1).)*)\\1`));
    return m ? m[2].replace(/\\(['"])/g, '$1') : null;
  };
  const name = str('name');
  if (!name) {
    // Loud, not silent. A demo the index cannot describe is a demo the index must not hide.
    throw new Error(`index-gen: ${rel} has no parseable name: in its defineDemo() header`);
  }
  return {
    name,
    blurb: str('blurb') ?? '',
    reactflow: str('reactflow'),
    pro: /\bpro\s*:\s*true\b/.test(src),
  };
}

const CATEGORY_LABEL = {
  nodes: 'Nodes',
  edges: 'Edges',
  ports: 'Ports & handles',
  interaction: 'Interaction',
  layout: 'Layout',
  grouping: 'Grouping & subflows',
  dashboard: 'Dashboards',
  styling: 'Styling & theming',
  collab: 'Collaboration',
  whiteboard: 'Whiteboard',
  misc: 'Export & misc',
};
// The order the sections appear in — roughly React Flow's own, so a visitor can scan across.
const CATEGORY_ORDER = Object.keys(CATEGORY_LABEL);

// NEW badge — a DATED, curatorial overlay, not part of the auto-discovery. These
// are the pages created or reworked in the 2026-07 React-Flow-parity wave; the
// badge just helps a visitor find them. Clear this set once the wave is old news.
const NEW_DEMOS = new Set([
  'nodes/delete-middle-node.html',
  'nodes/drag-handle.html',
  'nodes/intersections.html',
  'nodes/node-resizer.html',
  'nodes/node-resize-gesture.html',
  'nodes/node-toolbar.html',
  'nodes/proximity-connect.html',
  'nodes/node-position-animation.html',
  'nodes/stress-test.html',
  'nodes/updating-nodes.html',
  'edges/animating-edges.html',
  'interaction/computing-flows.html',
  'interaction/connection-events.html',
  'grouping/parent-child.html',
  'diagrams/scrollable-cards.html',
  'interaction/n8n-workflow.html',
  'collab/conflict-resolution.html',
  'diagrams/erd-editor.html',
  'dashboard/dashboard-builder.html',
  'dashboard/grid-options.html',
]);
const isNewDemo = (rel) => NEW_DEMOS.has(rel.split(sep).join('/'));

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function render(byCat) {
  const cats = Object.keys(byCat).sort(
    (a, b) => (CATEGORY_ORDER.indexOf(a) + 1 || 99) - (CATEGORY_ORDER.indexOf(b) + 1 || 99)
  );
  const total = Object.values(byCat).reduce((n, xs) => n + xs.length, 0);
  const sections = cats
    .map((cat) => {
      const cards = byCat[cat]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(
          (d) => `
        <a class="card${d.isNew ? ' is-new' : ''}" href="${esc(d.rel)}">
          <div class="card-name">${d.isNew ? '<span class="badge new">New</span>' : ''}${esc(d.name)}</div>
          <div class="card-blurb">${esc(d.blurb)}</div>
        </a>`
        )
        .join('');
      return `
      <section>
        <h2>${esc(CATEGORY_LABEL[cat] ?? cat)} <span class="count">${byCat[cat].length}</span></h2>
        <div class="grid">${cards}
        </div>
      </section>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<title>Grafloria — demo gallery</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="Over 100 live, clickable Grafloria demos — every one executed in CI as a test. Nodes, edges, layouts, dashboards, collaboration, exports.">
<link rel="icon" href="shell/logo.svg" type="image/svg+xml">
<style>
  :root {
    color-scheme: light dark;
    --gf-accent:#3B52D9; --gf-deep:#2A3CA8; --gf-soft:#94A5F0; --gf-wash:#EEF1FE;
    --gf-bg:#FCFCFF; --gf-panel:#FFFFFF; --gf-ink:#232A3D; --gf-mut:#5A6478; --gf-line:#E3E7F2;
  }
  @media (prefers-color-scheme: dark) {
    :root { --gf-accent:#8B9CF2; --gf-deep:#A9B6F5; --gf-soft:#5A6EE0; --gf-wash:rgba(139,156,242,.13);
            --gf-bg:#0E1118; --gf-panel:#141927; --gf-ink:#E6EAF6; --gf-mut:#9AA3BC; --gf-line:rgba(255,255,255,.1); }
  }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--gf-bg); color:var(--gf-ink);
         font:15px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
         -webkit-font-smoothing: antialiased; }
  a { color:var(--gf-accent); }
  .topbar { padding:16px 28px; border-bottom:1px solid var(--gf-line); background:var(--gf-panel);
            display:flex; align-items:center; gap:10px; }
  .topbar img { width:28px; height:28px; }
  .topbar .name { font-weight:700; font-size:18px; letter-spacing:-.3px; color:var(--gf-ink); text-decoration:none; }
  .topbar .name:hover { color:var(--gf-accent); }
  .topbar nav { margin-left:auto; display:flex; gap:20px; font-size:14px; font-weight:500; }
  .topbar nav a { text-decoration:none; }
  .topbar nav a:hover { text-decoration:underline; }
  header.hero { padding:40px 28px 26px; border-bottom:1px solid var(--gf-line); }
  h1 { margin:0 0 8px; font-size:30px; letter-spacing:-.5px; }
  .lede { margin:0; max-width:70ch; color:var(--gf-mut); }
  .lede b { color:var(--gf-ink); }
  .scoreboard { margin:18px 0 0; display:flex; flex-wrap:wrap; gap:10px; }
  .stat { padding:6px 12px; border:1px solid var(--gf-line); border-radius:999px; font-size:13px;
          background:var(--gf-panel); }
  .stat b { color:var(--gf-accent); }
  a.stat.link { text-decoration:none; color:var(--gf-accent); border-color:var(--gf-soft); font-weight:600; }
  a.stat.link:hover { background:var(--gf-wash); }
  main { padding:8px 28px 60px; }
  section { margin:30px 0 0; }
  h2 { font-size:15px; text-transform:uppercase; letter-spacing:.06em; color:var(--gf-mut);
       border-bottom:1px solid var(--gf-line); padding-bottom:8px; }
  h2 .count { color:var(--gf-ink); opacity:.5; margin-left:6px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:12px; margin-top:14px; }
  .card { display:block; padding:14px 15px; border:1px solid var(--gf-line); border-radius:12px;
          background:var(--gf-panel); text-decoration:none; color:inherit;
          transition:border-color .12s, transform .12s, box-shadow .12s; }
  .card:hover { border-color:var(--gf-accent); transform:translateY(-1px);
                box-shadow:0 6px 20px rgba(59,82,217,.1); }
  .card-name { font-weight:640; }
  .card-blurb { margin-top:4px; font-size:13px; color:var(--gf-mut); }
  .badge.new { padding:1px 7px; border-radius:999px; background:#16a34a; color:#fff; font-weight:600;
               margin-right:7px; font-size:10.5px; text-transform:uppercase; letter-spacing:.04em; vertical-align:middle; }
  .card.is-new { border-left:3px solid #16a34a; }
  footer { padding:22px 28px 50px; border-top:1px solid var(--gf-line); color:var(--gf-mut); font-size:13px; }
  footer .row { max-width:80ch; }
  code { padding:1px 5px; border-radius:4px; background:var(--gf-wash); font-size:.9em; }
</style>
<div class="topbar">
  <img src="shell/logo.svg" alt="">
  <a class="name" href="https://grafloria.com">grafloria</a>
  <nav>
    <a href="https://github.com/grafloria/grafloria">GitHub</a>
    <a href="https://www.npmjs.com/org/grafloria">npm</a>
    <a href="https://grafloria.com/compare/">Compare</a>
    <a href="https://grafloria.com">grafloria.com</a>
  </nav>
</div>
<header class="hero">
  <h1>Demo gallery</h1>
  <p class="lede"><b>Every demo here is a test.</b> Each page drives the engine through its
  public embed with real pointer events and asserts a consequence; a broken demo fails CI.
  If it's in the gallery, it works.</p>
  <div class="scoreboard">
    <span class="stat"><b>${total}</b> demos</span>
    <span class="stat"><b>${cats.length}</b> categories</span>
    <span class="stat"><b>MIT</b> — every one of them</span>
    <a class="stat link" href="https://grafloria.com/compare/">how Grafloria compares →</a>
  </div>
</header>
<main>
${sections}
</main>
<footer>
  <div class="row">
  Run the gate: <code>node demos/build.mjs &amp;&amp; node demos/e2e/gallery-run.mjs</code>.
  A demo that does not work is a feature that does not work — that is the whole point of the gallery.
  This index is generated from the pages themselves (<code>node demos/index-gen.mjs</code>); it cannot drift from what exists.
  </div>
</footer>
`;
}

const byCat = collect();
writeFileSync(join(here, 'index.html'), render(byCat));

// The side-menu manifest — the SAME source of truth the index uses, emitted as a
// JS module so the shell can `import` it wherever ES modules work (which is
// everywhere these demos already run, since they import the engine bundle the
// same way). A generated manifest cannot drift from the pages that exist.
const cats = Object.keys(byCat).sort(
  (a, b) => (CATEGORY_ORDER.indexOf(a) + 1 || 99) - (CATEGORY_ORDER.indexOf(b) + 1 || 99)
);
const flat = cats.flatMap((cat) =>
  byCat[cat]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((d) => ({ cat, name: d.name, rel: d.rel.split(sep).join('/'), isNew: d.isNew }))
);
writeFileSync(
  join(here, 'shell', 'demos-manifest.js'),
  `// AUTO-GENERATED by demos/index-gen.mjs — do not edit by hand.\n` +
    `export const DEMOS = ${JSON.stringify(flat)};\n` +
    `export const CATEGORY_LABEL = ${JSON.stringify(CATEGORY_LABEL)};\n` +
    `export const CATEGORY_ORDER = ${JSON.stringify(CATEGORY_ORDER)};\n`
);

const total = Object.values(byCat).reduce((n, xs) => n + xs.length, 0);
console.log(`index: ${total} demos across ${Object.keys(byCat).length} categories`);
console.log(`manifest: shell/demos-manifest.js (${flat.length} demos for the side menu)`);
