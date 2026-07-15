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
import { dirname, join, relative } from 'path';

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
        (byCat[cat] ??= []).push({ rel, ...parse(full, rel) });
      }
    }
  };
  walk(here);
  return byCat;
}

/** Pull the four declared fields out of a page's defineDemo header. */
function parse(file, rel) {
  const src = readFileSync(file, 'utf8');
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
  styling: 'Styling & theming',
  collab: 'Collaboration',
  whiteboard: 'Whiteboard',
  misc: 'Export & misc',
};
// The order the sections appear in — roughly React Flow's own, so a visitor can scan across.
const CATEGORY_ORDER = Object.keys(CATEGORY_LABEL);

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function render(byCat) {
  const cats = Object.keys(byCat).sort(
    (a, b) => (CATEGORY_ORDER.indexOf(a) + 1 || 99) - (CATEGORY_ORDER.indexOf(b) + 1 || 99)
  );
  const total = Object.values(byCat).reduce((n, xs) => n + xs.length, 0);
  const proCount = Object.values(byCat)
    .flat()
    .filter((d) => d.pro).length;

  const sections = cats
    .map((cat) => {
      const cards = byCat[cat]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(
          (d) => `
        <a class="card${d.pro ? ' pro' : ''}" href="${esc(d.rel)}">
          <div class="card-name">${esc(d.name)}</div>
          <div class="card-blurb">${esc(d.blurb)}</div>
          <div class="card-foot">
            ${d.reactflow ? `<span class="rf">React Flow: ${esc(d.reactflow)}</span>` : '<span class="rf none">no React Flow equivalent</span>'}
            ${d.pro ? '<span class="badge" title="React Flow puts the equivalent behind its paywall">Pro / paid there</span>' : ''}
          </div>
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
<meta charset="utf-8">
<title>Grafloria — demo gallery</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root { color-scheme: light dark; --bg:#fff; --fg:#111; --mut:#666; --line:rgba(127,127,127,.22);
          --card:rgba(127,127,127,.05); --accent:#2563eb; --pro:#b45309; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#0d1117; --fg:#e6edf3; --mut:#8b949e; --line:rgba(255,255,255,.12); --card:rgba(255,255,255,.03); --accent:#4c8dff; }
  }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--fg);
         font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif; }
  header { padding:40px 28px 26px; border-bottom:1px solid var(--line); }
  h1 { margin:0 0 8px; font-size:30px; letter-spacing:-.02em; }
  .lede { margin:0; max-width:70ch; color:var(--mut); }
  .lede b { color:var(--fg); }
  .scoreboard { margin:18px 0 0; display:flex; flex-wrap:wrap; gap:10px; }
  .stat { padding:6px 12px; border:1px solid var(--line); border-radius:999px; font-size:13px; }
  .stat b { color:var(--accent); }
  .stat.pro b { color:var(--pro); }
  main { padding:8px 28px 60px; }
  section { margin:30px 0 0; }
  h2 { font-size:15px; text-transform:uppercase; letter-spacing:.06em; color:var(--mut);
       border-bottom:1px solid var(--line); padding-bottom:8px; }
  h2 .count { color:var(--fg); opacity:.5; margin-left:6px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:12px; margin-top:14px; }
  .card { display:block; padding:14px 15px; border:1px solid var(--line); border-radius:10px;
          background:var(--card); text-decoration:none; color:inherit; transition:border-color .12s, transform .12s; }
  .card:hover { border-color:var(--accent); transform:translateY(-1px); }
  .card.pro { border-left:3px solid var(--pro); }
  .card-name { font-weight:640; }
  .card-blurb { margin-top:4px; font-size:13px; color:var(--mut); }
  .card-foot { margin-top:10px; display:flex; flex-wrap:wrap; gap:8px; align-items:center; font-size:11.5px; }
  .rf { color:var(--mut); }
  .rf.none { opacity:.6; font-style:italic; }
  .badge { padding:1px 7px; border-radius:999px; background:var(--pro); color:#fff; font-weight:600; }
  footer { padding:22px 28px 50px; border-top:1px solid var(--line); color:var(--mut); font-size:13px; max-width:80ch; }
  code { padding:1px 5px; border-radius:4px; background:rgba(127,127,127,.16); font-size:.9em; }
</style>
<header>
  <h1>Grafloria — demo gallery</h1>
  <p class="lede"><b>Every demo here is a test.</b> Each page drives the engine through its
  public embed with real pointer events and asserts a consequence; a broken demo fails CI.
  Where React Flow ships the same example only in its paid <b>Pro</b> tier, it is marked.</p>
  <div class="scoreboard">
    <span class="stat"><b>${total}</b> demos</span>
    <span class="stat pro"><b>${proCount}</b> are features React Flow charges for</span>
    <span class="stat"><b>${cats.length}</b> categories</span>
  </div>
</header>
<main>
${sections}
</main>
<footer>
  Run the gate: <code>node demos/build.mjs &amp;&amp; node demos/e2e/gallery-run.mjs</code>.
  A demo that does not work is a feature that does not work — that is the whole point of the gallery.
  This index is generated from the pages themselves (<code>node demos/index-gen.mjs</code>); it cannot drift from what exists.
</footer>
`;
}

const byCat = collect();
writeFileSync(join(here, 'index.html'), render(byCat));
const total = Object.values(byCat).reduce((n, xs) => n + xs.length, 0);
const pro = Object.values(byCat).flat().filter((d) => d.pro).length;
console.log(`index: ${total} demos across ${Object.keys(byCat).length} categories, ${pro} React-Flow-Pro-equivalents`);
