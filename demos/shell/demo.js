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
          // NB: no `pro` class on the item — demo.css has a global `.pro` (the
          // page header's "Pro — paid" pill) that would paint the whole row. The
          // Pro marker is the scoped `.an-pro` badge span only.
          return `<a class="an-item${current ? ' current' : ''}${d.isNew ? ' an-is-new' : ''}" href="../${esc(d.rel)}"${current ? ' aria-current="page"' : ''} data-name="${esc(d.name.toLowerCase())} ${esc((d.reactflow || '').toLowerCase())}${d.isNew ? ' new' : ''}">${d.isNew ? '<span class="an-new" title="Added or reworked in the latest wave">New</span>' : ''}${esc(d.name)}${d.pro ? '<span class="an-pro" title="React Flow charges for this">Pro</span>' : ''}</a>`;
        })
        .join('');
      return `<div class="an-group"><div class="an-cat">${esc(CATEGORY_LABEL[cat] ?? cat)}</div>${items}</div>`;
    })
    .join('');

  const nav = document.createElement('nav');
  nav.id = 'grafloria-nav';
  nav.setAttribute('aria-label', 'Demo gallery');
  nav.innerHTML =
    `<div class="an-head"><a class="an-home" href="../index.html">◆ Grafloria demos</a>` +
    `<button class="an-close" aria-label="Close menu" title="Close (Esc)">×</button></div>` +
    `<input class="an-search" type="search" placeholder="Filter demos…  ( / )" aria-label="Filter demos" autocomplete="off">` +
    `<div class="an-list">${list}</div>` +
    `<div class="an-foot">${DEMOS.length} demos · <span class="an-pro-dot">Pro</span> = React Flow charges for it</div>`;

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

export function defineDemo(spec) {
  const boot = async () => {
    buildNav(); // fire-and-forget: the menu must not block the demo booting
    const host = document.getElementById('canvas');
    const ctx = {
      host,
      tick: (ms = 0) =>
        new Promise((r) => requestAnimationFrame(() => (ms ? setTimeout(r, ms) : r()))),
    };

    // Header. Written by the shell so every page carries the same claim in the same place —
    // including, honestly, whether the equivalent is paid over at React Flow.
    const head = document.getElementById('demo-head');
    if (head) {
      head.innerHTML = `
        <h1>${escapeHtml(spec.name)}</h1>
        <p class="blurb">${escapeHtml(spec.blurb)}</p>
        ${
          spec.reactflow
            ? `<p class="rf">React Flow equivalent: <code>${escapeHtml(spec.reactflow)}</code>${
                spec.pro
                  ? ' <span class="pro" title="React Flow puts this behind its paywall">Pro — paid</span>'
                  : ''
              }</p>`
            : ''
        }`;
    }

    // Reserve the CHROME's layout space BEFORE the page fits itself: buildNav
    // resolves its manifest asynchronously, and pages that fitView on mount
    // were framed for the full width — then the drawer pushed in and clipped
    // the right edge (live audit: swimlanes' ticket, dynamic-layouting's n5,
    // a racy auto-layout boot). Same store, same default as buildNav's setOpen.
    if (!navigator.webdriver) {
      let navOpen = null;
      try { navOpen = localStorage.getItem('grafloria-nav-open'); } catch { /* private mode */ }
      document.body.classList.toggle('nav-open', navOpen === null ? window.innerWidth >= 1100 : navOpen === '1');
    }
    buildHowTo(spec); // right-side "how to test" panel (skipped under webdriver)

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
