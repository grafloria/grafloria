// The demo contract.
//
// Every page in this gallery declares itself through `defineDemo()`. That gives us three
// things at once, and the third is the one that matters:
//
//   1. a consistent page shell (title, description, source link) with no framework;
//   2. a mounted diagram, driven through the SAME public entry point an embedder uses —
//      so if the public API is broken, the gallery is broken, which is the point;
//   3. AN ASSERTION THE HARNESS CAN RUN. `assert()` executes IN THE PAGE, drives the
//      feature with real events, and throws if it did not work.
//
// That third one is why this gallery exists. A unit test proves a unit works; it never
// proves anything CALLS it. This project has shipped, in every single wave, elaborate
// machinery that was wired to nothing and fully green: a layout service nothing called, 17
// LOD presets that were all no-ops, a worker stack whose tests all forced it off, an entire
// touch stack in the public API that was unwireable. A demo you can drive in a browser is
// the only artefact that proves REACHABILITY.
//
// So a broken demo is a red gate. See demos/e2e/gallery-run.mjs.

/**
 * @typedef {Object} DemoSpec
 * @property {string} name         Short title.
 * @property {string} blurb        One line: what this proves.
 * @property {string} [reactflow]  The equivalent reactflow.dev example, if there is one.
 * @property {boolean} [pro]       True when React Flow puts the equivalent behind its paywall.
 * @property {(ctx: DemoContext) => void|Promise<void>} setup   Build the diagram.
 * @property {(ctx: DemoContext) => void|Promise<void>} assert  Drive it. THROW if it failed.
 */

/**
 * @typedef {Object} DemoContext
 * @property {HTMLElement} host        The mount point.
 * @property {any} engine
 * @property {any} diagram
 * @property {any} instance           Whatever the public entry point returned.
 * @property {(ms?: number) => Promise<void>} tick   Let a frame (or n ms) pass.
 */

const failures = [];

/** Assert, with a message that will actually help whoever sees it go red at 3am. */
export function check(condition, message) {
  if (!condition) {
    const err = new Error(message);
    failures.push(message);
    throw err;
  }
}

/** Assert two things are equal, printing both — a bare `false` teaches nobody anything. */
export function checkEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  check(a === e, `${message}\n    expected: ${e}\n    actual:   ${a}`);
}

/** Assert a number moved. The commonest real assertion, and the commonest place to be vague. */
export function checkChanged(before, after, message) {
  check(
    JSON.stringify(before) !== JSON.stringify(after),
    `${message}\n    it did not change: still ${JSON.stringify(before)}`
  );
}

/**
 * The gallery side menu — one drawer, injected on every page from the generated
 * manifest so it can never drift from the demos that exist. Switch demos without
 * bouncing back to the index; the current page is highlighted; a filter box
 * cuts 89 items down fast. Fixed + slide-in, so it overlays without disturbing
 * the canvas; the screenshot tooling hides it, so goldens stay about the demo.
 */
async function buildNav() {
  if (document.getElementById('grafloria-nav')) return;
  // The menu is gallery CHROME, not part of any demo. Every gate drives these
  // pages under automation (navigator.webdriver), and an open drawer shifts the
  // canvas + its async build perturbs timing-sensitive asserts — so it must be
  // invisible to the harness. A real visitor (webdriver false/undefined) always
  // gets it. (A dedicated nav test can exercise it directly if it ever needs one.)
  if (navigator.webdriver) return;
  let mod;
  try {
    mod = await import('./demos-manifest.js');
  } catch {
    return; // no manifest (run index-gen) → page still works, just no menu
  }
  const { DEMOS, CATEGORY_LABEL, CATEGORY_ORDER } = mod;
  const here = location.pathname.replace(/.*\/([^/]+\/[^/]+\.html)$/, '$1'); // <cat>/<file>.html

  const byCat = new Map();
  for (const d of DEMOS) {
    if (!byCat.has(d.cat)) byCat.set(d.cat, []);
    byCat.get(d.cat).push(d);
  }
  const cats = [...byCat.keys()].sort(
    (a, b) => ((CATEGORY_ORDER.indexOf(a) + 1 || 99) - (CATEGORY_ORDER.indexOf(b) + 1 || 99))
  );

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const list = cats
    .map((cat) => {
      const items = byCat
        .get(cat)
        .map((d) => {
          const current = d.rel === here;
          return `<a class="an-item${current ? ' current' : ''}${d.isNew ? ' an-is-new' : ''}" href="../${esc(d.rel)}"${current ? ' aria-current="page"' : ''} data-name="${esc(d.name.toLowerCase())}${d.isNew ? ' new' : ''}">${d.isNew ? '<span class="an-new" title="Added or reworked in the latest wave">New</span>' : ''}${esc(d.name)}</a>`;
        })
        .join('');
      return `<div class="an-group"><div class="an-cat">${esc(CATEGORY_LABEL[cat] ?? cat)}</div>${items}</div>`;
    })
    .join('');

  const nav = document.createElement('nav');
  nav.id = 'grafloria-nav';
  nav.setAttribute('aria-label', 'Demo gallery');
  nav.innerHTML =
    `<div class="an-head"><a class="an-home" href="../index.html"><img src="../shell/logo.svg" alt="">Grafloria demos</a>` +
    `<button class="an-close" aria-label="Close menu" title="Close (Esc)">×</button></div>` +
    `<input class="an-search" type="search" placeholder="Filter demos…  ( / )" aria-label="Filter demos" autocomplete="off">` +
    `<div class="an-list">${list}</div>` +
    `<div class="an-foot">${DEMOS.length} demos · every one MIT · <a href="https://grafloria.com">grafloria.com</a></div>`;

  const toggle = document.createElement('button');
  toggle.id = 'grafloria-nav-toggle';
  toggle.setAttribute('aria-label', 'Open demo menu');
  toggle.innerHTML = '☰';

  document.body.append(toggle, nav);

  const setOpen = (open) => {
    document.body.classList.toggle('nav-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    try { localStorage.setItem('grafloria-nav-open', open ? '1' : '0'); } catch { /* private mode */ }
  };
  const stored = (() => { try { return localStorage.getItem('grafloria-nav-open'); } catch { return null; } })();
  setOpen(stored === null ? window.innerWidth >= 1100 : stored === '1');

  toggle.addEventListener('click', () => setOpen(!document.body.classList.contains('nav-open')));
  nav.querySelector('.an-close').addEventListener('click', () => setOpen(false));

  const search = nav.querySelector('.an-search');
  const applyFilter = () => {
    const q = search.value.trim().toLowerCase();
    for (const group of nav.querySelectorAll('.an-group')) {
      let any = false;
      for (const item of group.querySelectorAll('.an-item')) {
        const hit = !q || item.dataset.name.includes(q);
        item.style.display = hit ? '' : 'none';
        any = any || hit;
      }
      group.style.display = any ? '' : 'none';
    }
  };
  search.addEventListener('input', applyFilter);

  // Scroll the current item into view so you land oriented.
  nav.querySelector('.an-item.current')?.scrollIntoView({ block: 'center' });

  document.addEventListener('keydown', (e) => {
    // Escape is a CANVAS gesture too (cancel a connection, abandon a resize):
    // only close the drawer when the user is actually IN it, or a visitor
    // abandoning a wire loses their menu for every future page (live audit).
    if (e.key === 'Escape' && nav.contains(document.activeElement)) setOpen(false);
    else if (e.key === '/' && document.activeElement !== search && !/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || '')) {
      e.preventDefault(); setOpen(true); search.focus();
    }
  });
}

/**
 * The right-hand "How to test" panel — the steps a HUMAN follows to see the
 * feature with their own hands (live report: "every example page should have
 * a side bar that describes what is there and how we can test it in steps").
 * Chrome like the nav: invisible to the gates (navigator.webdriver), always
 * there for a visitor. Collapsible; remembers its state per browser.
 */
function buildHowTo(spec) {
  if (navigator.webdriver) return;
  if (!Array.isArray(spec.howTo) || spec.howTo.length === 0) return;
  if (document.getElementById('grafloria-howto')) return;

  const panel = document.createElement('aside');
  panel.id = 'grafloria-howto';
  panel.innerHTML = `
    <div class="ht-head">
      <span>How to test</span>
      <button id="grafloria-howto-toggle" title="collapse">×</button>
    </div>
    <ol>${spec.howTo.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ol>
    <div class="ht-run">
      <button id="grafloria-howto-run">▶ run the scripted checks</button>
      <span id="grafloria-howto-run-out"></span>
    </div>`;
  document.body.appendChild(panel);

  // Every page ships an in-page assertion suite (the same one the gallery gate
  // drives). Surfacing it as a button gives EVERY demo a visible action — some
  // features' payoff only shows under the scripted gestures.
  //
  // The button RELOADS with ?run=1 and the fresh page auto-runs: the checks
  // assume the boot state, and running them over whatever the visitor already
  // dragged/clicked produced false ✗s (live audit: named-style-classes red
  // after following its own steps; a real pointer event also permanently mutes
  // the synthetic-event path some pages' checks drive).
  panel.querySelector('#grafloria-howto-run').addEventListener('click', () => {
    const url = new URL(location.href);
    url.searchParams.set('run', '1');
    location.href = url.toString();
  });

  const opener = document.createElement('button');
  opener.id = 'grafloria-howto-open';
  opener.textContent = '?';
  opener.title = 'How to test this page';
  document.body.appendChild(opener);

  const setOpen = (open) => {
    panel.style.display = open ? '' : 'none';
    opener.style.display = open ? 'none' : '';
    // Reserve real layout space on wide screens (mirrors the nav drawer):
    // an OVERLAY hid readouts, two-pane peers and whole side panels — and ate
    // the very drags the steps described (live audit, 8+ pages).
    document.body.classList.toggle('howto-open', open);
    try { localStorage.setItem('grafloria-howto-open', open ? '1' : '0'); } catch { /* private mode */ }
  };
  panel.querySelector('#grafloria-howto-toggle').addEventListener('click', () => setOpen(false));
  opener.addEventListener('click', () => setOpen(true));
  let open = true;
  try { open = localStorage.getItem('grafloria-howto-open') !== '0'; } catch { /* private mode */ }
  setOpen(open);
}


/**
 * The code drawer — DevExtreme-style framework tabs plus an ECharts-style live
 * editor, on EVERY demo page with zero per-demo authoring:
 *
 *  - The JavaScript tab is the page's OWN module source (extracted from the DOM,
 *    true by construction) in an editable pane. "Run" rebuilds the entire page
 *    inside a sandboxed iframe with the edited source — full fidelity for all
 *    demos, because what runs IS the page. "Reset" discards the iframe; the
 *    original live demo underneath was never touched.
 *  - Angular / React / Vue tabs show the verified mount dialect for the same
 *    engine. A demo can override any tab with hand-written code via
 *    defineDemo({ code: { angular: '...', react: '...', vue: '...' } }).
 *  - Chrome like the nav: invisible under webdriver, so gates and goldens
 *    never see it.
 */
function buildCodePanel(spec) {
  if (navigator.webdriver) return;
  if (document.getElementById('gf-code')) return;

  const pageSource = (document.querySelector('script[type="module"]')?.textContent ?? '').replace(/^\n/, '');

  // ── Framework variants: a REAL Angular implementation may exist for this
  // demo (apps/demos-angular, baked to ../../demos-angular). When it does, the
  // Angular tab shows its actual source files and the Angular pill swaps the
  // running demo to it. Absent (404 / local-only serving), tabs degrade to the
  // generic dialect samples.
  const routeKey = location.pathname.replace(/.*\/([^/]+\/[^/]+)\.html$/, '$1');
  // Each framework may ship a REAL implementation of this demo under
  // ../../demos-<fw>/. The tab shows its actual source files; the pill runs it.
  const FW_APPS = { angular: '../../demos-angular/', react: '../../demos-react/', vue: '../../demos-vue/' };
  const fwFiles = { angular: null, react: null, vue: null };   // [{name,text}] per fw
  let fwFileIdx = 0;
  const variantReady = Promise.all(Object.keys(FW_APPS).map((fw) =>
    fetch(FW_APPS[fw] + 'sources.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { fwFiles[fw] = j?.routes?.[routeKey] ?? null; })
      .catch(() => { fwFiles[fw] = null; })
  ));

  const FW = [
    { key: 'js',      label: 'JavaScript' },
    { key: 'angular', label: 'Angular' },
    { key: 'react',   label: 'React' },
    { key: 'vue',     label: 'Vue' },
    { key: 'install', label: 'Install' },
  ];

  const samples = {
    js: pageSource,
    angular: spec.code?.angular ?? `// npm i @grafloria/renderer-angular
import { Component, viewChild } from '@angular/core';
import { GrafloriaDiagramCanvas } from '@grafloria/renderer-angular';

@Component({
  standalone: true,
  imports: [GrafloriaDiagramCanvas],
  template: \`
    <grafloria-diagram-canvas
      [(nodes)]="nodes" [(edges)]="edges"
      style="display:block; height:100%" />
  \`,
})
export class DemoComponent {
  // Use this demo's exact nodes/edges — copy them from the JavaScript tab.
  nodes = [/* ... */];
  edges = [/* ... */];

  // Need the instance? Grab the canvas by template ref — its public methods
  // (exportText, fitView, ...) and the engine API are identical to the
  // JavaScript tab: one engine underneath every framework.
  canvas = viewChild(GrafloriaDiagramCanvas);
}`,
    react: spec.code?.react ?? `// npm i @grafloria/react
import { GrafloriaFlow } from '@grafloria/react';

// Use this demo's exact nodes/edges — copy them from the JavaScript tab.
const nodes = [/* ... */];
const edges = [/* ... */];

export function Demo() {
  return (
    <GrafloriaFlow
      nodes={nodes}
      edges={edges}
      onInit={(instance) => {
        // \`instance\` is the same object the JavaScript tab drives —
        // every call there works identically here.
      }}
    />
  );
}`,
    vue: spec.code?.vue ?? `<!-- npm i @grafloria/vue -->
<script setup>
import { GrafloriaFlow } from '@grafloria/vue';
import { ref } from 'vue';

// Use this demo's exact nodes/edges — copy them from the JavaScript tab.
const nodes = ref([/* ... */]);
const edges = ref([/* ... */]);

// \`instance\` from @init is the same object the JavaScript tab drives.
const onInit = (instance) => {};
<\/script>

<template>
  <GrafloriaFlow v-model:nodes="nodes" v-model:edges="edges" @init="onInit" />
</template>`,
    install: `# pick your dialect — one engine underneath all of them
npm i @grafloria/element            # plain web component <grafloria-flow>
npm i @grafloria/renderer-angular   # Angular
npm i @grafloria/react              # React
npm i @grafloria/vue                # Vue 3

# headless (Node, workers, server-side export)
npm i @grafloria/engine @grafloria/renderer`,
  };

  const NOTES = {
    js: '<b>This exact code just ran on this page.</b> Edit it and press Run — the demo rebuilds with your code. <code>ctx.host</code> is the container element; <code>defineDemo</code> is gallery harness you can keep or drop.',
    angular: '<b>Same engine, Angular dialect.</b> The mount is Angular signals + banana-boxes; every instance call from the JavaScript tab works identically here.',
    react: '<b>Same engine, React dialect.</b> The mount is React; every instance call from the JavaScript tab works identically on the <code>onInit</code> instance.',
    vue: '<b>Same engine, Vue dialect.</b> The mount is Vue 3; every instance call from the JavaScript tab works identically on the <code>@init</code> instance.',
    install: '<b>All packages are MIT.</b> Dual CJS + ESM builds; the element registers <code>&lt;grafloria-flow&gt;</code> on import.',
  };

  const drawer = document.createElement('div');
  drawer.id = 'gf-code';
  drawer.innerHTML =
    `<div class="gfc-bar" role="tablist" aria-label="Code language">` +
    FW.map((f) => `<button class="gfc-tab" role="tab" data-tab="${f.key}">${f.label}</button>`).join('') +
    `<span class="gfc-badge" id="gfc-badge">&#9679; this page's live source — ran in CI</span>` +
    `<span class="gfc-actions">` +
    `<button class="gfc-run" id="gfc-run" title="Re-run the demo with your edited code">&#9654; Run</button>` +
    `<button class="gfc-reset" id="gfc-reset" title="Back to the live original">Reset</button>` +
    `<button class="gfc-copy" id="gfc-copy">Copy</button>` +
    `<button class="gfc-close" id="gfc-close" aria-label="Close">×</button>` +
    `</span></div>` +
    `<p class="gfc-note" id="gfc-note"></p>` +
    `<div class="gfc-body">` +
    `<textarea class="gfc-editor" id="gfc-editor" spellcheck="false" aria-label="Demo source"></textarea>` +
    `<pre class="gfc-view" id="gfc-view"></pre>` +
    `</div>`;
  document.body.appendChild(drawer);

  const editor = drawer.querySelector('#gfc-editor');
  const view = drawer.querySelector('#gfc-view');
  const note = drawer.querySelector('#gfc-note');
  const badge = drawer.querySelector('#gfc-badge');
  const runBtn = drawer.querySelector('#gfc-run');
  const resetBtn = drawer.querySelector('#gfc-reset');

  let tab = 'js';
  const setTab = (t) => {
    tab = t;
    drawer.querySelectorAll('.gfc-tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
    const editable = t === 'js';
    editor.style.display = editable ? '' : 'none';
    view.style.display = editable ? 'none' : '';
    badge.style.display = editable ? '' : 'none';
    runBtn.style.display = editable ? '' : 'none';
    resetBtn.style.display = editable ? '' : 'none';
    const realFw = fwFiles[t];
    if (editable) { if (!editor.value) editor.value = samples.js; }
    else if (realFw) renderFwFiles(t);
    else view.innerHTML = highlight(samples[t]);
    const fwLabel = { angular: 'Angular', react: 'React', vue: 'Vue' }[t];
    note.innerHTML = realFw
      ? '<b>This is a real ' + fwLabel + ' app.</b> The files below are the actual compiled-and-gated source of the ' + fwLabel + ' implementation running when the ' + fwLabel + ' pill is active. <a href="' + FW_APPS[t] + 'index.html#/' + routeKey + '" target="_blank" rel="noopener">Open it standalone ↗</a>'
      : NOTES[t];
    document.querySelectorAll('.fw-switch [data-fw]').forEach((p) => p.classList.toggle('on', p.dataset.fw === t));
  };

  const setOpen = (open) => {
    document.body.classList.toggle('code-open', open);
    try { localStorage.setItem('grafloria-code-open', open ? '1' : '0'); } catch { /* private mode */ }
  };

  drawer.querySelectorAll('.gfc-tab').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
  drawer.querySelector('#gfc-close').addEventListener('click', () => setOpen(false));
  drawer.querySelector('#gfc-copy').addEventListener('click', async () => {
    const text = tab === 'js' ? editor.value : samples[tab];
    try { await navigator.clipboard.writeText(text); } catch { /* clipboard denied */ }
    const c = drawer.querySelector('#gfc-copy');
    c.textContent = 'Copied'; setTimeout(() => { c.textContent = 'Copy'; }, 1200);
  });

  // Tab key inserts two spaces instead of leaving the editor.
  editor.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const { selectionStart: a, selectionEnd: b, value } = editor;
      editor.value = value.slice(0, a) + '  ' + value.slice(b);
      editor.selectionStart = editor.selectionEnd = a + 2;
    }
  });

  // Multi-file view for a real framework variant: file sub-tabs over one pre.
  const renderFwFiles = (fw) => {
    const files = fwFiles[fw];
    if (fwFileIdx >= files.length) fwFileIdx = 0;
    const tabs = files.map((f, i) =>
      `<button class="gfc-file${i === fwFileIdx ? ' on' : ''}" data-i="${i}">${escapeHtml(f.name)}</button>`).join('');
    view.innerHTML = `<div class="gfc-files">${tabs}</div>` +
      `<div class="gfc-filebody">${highlight(files[fwFileIdx].text)}</div>`;
    view.querySelectorAll('.gfc-file').forEach((b) =>
      b.addEventListener('click', () => { fwFileIdx = +b.dataset.i; renderFwFiles(fw); }));
  };

  // The variant overlay: a framework implementation RUNNING over the JS demo.
  let variantOverlay = null;
  let variantFw = null;
  const showVariant = (fw) => {
    if (!fwFiles[fw]) return;
    if (variantOverlay && variantFw !== fw) { variantOverlay.remove(); variantOverlay = null; }
    variantFw = fw;
    const label = { angular: 'Angular', react: 'React', vue: 'Vue' }[fw];
    if (!variantOverlay) {
      variantOverlay = document.createElement('div');
      variantOverlay.className = 'gfc-overlay gfc-variant';
      variantOverlay.innerHTML =
        `<div class="gfc-variant-banner">${label} implementation — live. Switch to <b>JS</b> to return.</div>` +
        `<iframe class="gfc-frame" title="${label} implementation" src="${FW_APPS[fw]}index.html#/${routeKey}"></iframe>`;
      document.body.appendChild(variantOverlay);
    }
    positionOverlays();
    document.body.classList.add('gfc-variant-on');
  };
  const hideVariant = () => {
    variantOverlay?.remove(); variantOverlay = null;
    document.body.classList.remove('gfc-variant-on');
  };

  // ── Run: rebuild the page in an iframe with the edited source ──
  let overlay = null;
  const positionOverlays = () => {
    const head = document.getElementById('demo-head');
    const top = (head ? head.getBoundingClientRect().bottom : 0) + 'px';
    if (overlay) overlay.style.top = top;
    if (variantOverlay) variantOverlay.style.top = top;
  };
  const positionOverlay = positionOverlays;
  runBtn.addEventListener('click', async () => {
    runBtn.textContent = '… running'; runBtn.disabled = true;
    try {
      const html = await (await fetch(location.pathname)).text();
      const edited = editor.value.replace(/<\/script/gi, '<\\/script');
      const at = html.indexOf('<script type="module">');
      const end = html.indexOf('</' + 'script>', at);
      const rebuilt =
        `<base href="${location.href}">` +
        `<script>window.__GRAFLORIA_EMBED = 1<\/script>` +
        html.slice(0, at) + '<script type="module">\n' + edited + '\n' + html.slice(end);
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'gfc-overlay';
        overlay.innerHTML = '<iframe class="gfc-frame" title="Your edited demo"></iframe>';
        document.body.appendChild(overlay);
      }
      overlay.querySelector('iframe').srcdoc = rebuilt;
      positionOverlay();
      document.body.classList.add('gfc-running');
    } finally {
      runBtn.textContent = '\u25B6 Run'; runBtn.disabled = false;
    }
  });
  resetBtn.addEventListener('click', () => {
    overlay?.remove(); overlay = null;
    document.body.classList.remove('gfc-running');
    editor.value = samples.js;
  });
  addEventListener('resize', positionOverlays);

  // Header wiring: the Code toggle + the framework pills.
  document.getElementById('gf-code-toggle')?.addEventListener('click', () => {
    setOpen(!document.body.classList.contains('code-open'));
  });
  document.querySelectorAll('.fw-switch [data-fw]').forEach((p) =>
    p.addEventListener('click', async () => {
      await variantReady;
      const fw = p.dataset.fw;
      fwFileIdx = 0;
      setTab(fw);
      setOpen(true);
      if (fw !== 'js' && fwFiles[fw]) showVariant(fw);
      else hideVariant();
      try { localStorage.setItem('grafloria-fw', fw); } catch { /* private mode */ }
    })
  );
  // Refresh the current tab once discovery lands, if a real variant appeared.
  variantReady.then(() => { if (tab !== 'js' && fwFiles[tab]) setTab(tab); });

  let fw = 'js';
  try { fw = localStorage.getItem('grafloria-fw') || 'js'; } catch { /* private mode */ }
  setTab(FW.some((f) => f.key === fw) ? fw : 'js');
  let open = false;
  try { open = localStorage.getItem('grafloria-code-open') === '1'; } catch { /* private mode */ }
  setOpen(open);
}

/**
 * Tiny single-pass highlighter for the read-only tabs — zero deps. ONE pass
 * over the RAW source, escaping per token: multi-pass replace() re-scans its
 * own injected markup (the `class` in `<span class=…>` matched the keyword
 * rule and shredded the HTML — caught by screenshot, not by tests).
 */
function highlight(src) {
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const re = /(\/\/[^\n]*|<!--[\s\S]*?-->|(?:^|\n)#[^\n]*)|('(?:[^'\\\n]|\\.)*')|\b(import|from|export|const|let|var|function|return|async|await|new|class|extends|if|else|for|of|this)\b/g;
  let out = '', last = 0, m;
  while ((m = re.exec(src))) {
    out += esc(src.slice(last, m.index));
    if (m[1]) {
      const nl = m[1].startsWith('\n') ? '\n' : '';
      out += nl + '<span class="tk-c">' + esc(nl ? m[1].slice(1) : m[1]) + '</span>';
    } else if (m[2]) {
      out += '<span class="tk-s">' + esc(m[2]) + '</span>';
    } else {
      out += '<span class="tk-k">' + m[3] + '</span>';
    }
    last = re.lastIndex;
  }
  return out + esc(src.slice(last));
}

export function defineDemo(spec) {
  const boot = async () => {
    // EMBED MODE: the code drawer's Run rebuilds this page inside an iframe with
    // the visitor's edited source. The iframe run gets NO chrome — just the demo.
    const embedded = !!window.__GRAFLORIA_EMBED;
    if (!embedded) buildNav(); // fire-and-forget: the menu must not block the demo booting
    const host = document.getElementById('canvas');
    const ctx = {
      host,
      tick: (ms = 0) =>
        new Promise((r) => requestAnimationFrame(() => (ms ? setTimeout(r, ms) : r()))),
    };

    // Header. Written by the shell so every page carries the same brand and the
    // same claim in the same place.
    const head = document.getElementById('demo-head');
    if (embedded) {
      // The iframe run: no header, full-height canvas.
      if (head) head.remove();
      document.body.classList.add('gf-embed');
    } else if (head) {
      // The fw pills + Code toggle are wired by buildCodePanel, which never
      // builds under webdriver — so under webdriver they must not RENDER
      // either. interaction-run's DEAD-BUTTON audit caught exactly this:
      // five chrome buttons with no observable effect. Chrome renders only
      // where its wiring does.
      const chrome = navigator.webdriver ? '' : `
          <div class="fw-switch" role="tablist" aria-label="Framework">
            <button data-fw="js" role="tab">JS</button>
            <button data-fw="angular" role="tab">Angular</button>
            <button data-fw="react" role="tab">React</button>
            <button data-fw="vue" role="tab">Vue</button>
          </div>`;
      const codeBtn = navigator.webdriver ? '' : `
            <button class="code-toggle" id="gf-code-toggle">&lsaquo;/&rsaquo; Code</button>`;
      head.innerHTML = `
        <div class="brand-row">
          <a class="brand" href="../index.html"><img src="../shell/logo.svg" alt=""><span>grafloria</span></a>
          <span class="crumb">demos</span>${chrome}
          <nav class="head-links">${codeBtn}
            <a href="../index.html">← All demos</a>
            <a href="https://github.com/grafloria/grafloria">GitHub</a>
            <a href="https://grafloria.com">grafloria.com</a>
          </nav>
        </div>
        <h1>${escapeHtml(spec.name)}</h1>
        <p class="blurb">${escapeHtml(spec.blurb)}</p>`;
    }

    // Reserve the CHROME's layout space BEFORE the page fits itself: buildNav
    // resolves its manifest asynchronously, and pages that fitView on mount
    // were framed for the full width — then the drawer pushed in and clipped
    // the right edge (live audit: swimlanes' ticket, dynamic-layouting's n5,
    // a racy auto-layout boot). Same store, same default as buildNav's setOpen.
    if (!navigator.webdriver && !embedded) {
      let navOpen = null;
      try { navOpen = localStorage.getItem('grafloria-nav-open'); } catch { /* private mode */ }
      document.body.classList.toggle('nav-open', navOpen === null ? window.innerWidth >= 1100 : navOpen === '1');
    }
    if (!embedded) buildHowTo(spec); // right-side "how to test" panel (skipped under webdriver)
    if (!embedded) buildCodePanel(spec); // bottom code drawer (skipped under webdriver)

    await spec.setup(ctx);

    // THE HANDLE THE HARNESS PULLS. Exposed on window so Playwright can call it in-page —
    // the assertion must run where the DOM, the events and the renderer actually are, not in
    // Node against a mock.
    window.__demo = {
      name: spec.name,
      reactflow: spec.reactflow ?? null,
      pro: !!spec.pro,
      // Coverage handle for the gallery gate: a page without "How to test"
      // steps is a feature a visitor cannot find (live report).
      howToSteps: Array.isArray(spec.howTo) ? spec.howTo.length : 0,
      run: async () => {
        failures.length = 0;
        await spec.assert(ctx);
        return { ok: failures.length === 0, failures: [...failures] };
      },
      // OPTIONAL money shot: drive the page to the state that shows the feature
      // OFF — a held drag with helper lines lit, the collapsed group, the dark
      // palette — and LEAVE it there. assert() round-trips (act, check, restore),
      // which is right for a gate and useless for a camera: boot and after come
      // out identical for any feature whose payoff is mid-interaction. The
      // screenshot tooling calls this on a fresh page load; it is NOT a gate.
      showcase: spec.showcase ? async () => spec.showcase(ctx) : null,
    };
    // Debug seam: probes (fit checks, screenshot tooling) reach the live
    // instance without each demo having to export it.
    window.__demoCtx = ctx;
    window.__demoReady = true;

    // ?run=1 (set by the How-to panel's ▶ button): run the scripted checks on
    // this FRESH page and show the verdict where the button was pressed.
    if (!navigator.webdriver && new URLSearchParams(location.search).get('run') === '1') {
      const out = document.getElementById('grafloria-howto-run-out');
      if (out) out.textContent = 'running…';
      try {
        const r = await window.__demo.run();
        if (out) {
          out.textContent = r.ok ? '✓ all checks passed' : `✗ ${r.failures.length} failed`;
          out.title = r.failures.join('\n');
        }
      } catch (e) {
        if (out) { out.textContent = '✗ threw'; out.title = String(e && e.message || e); }
      }
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
}

function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}
