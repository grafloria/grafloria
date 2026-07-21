// GATE — does an exported dashboard actually contain its widgets?
//
// THE REGRESSION THIS GUARDS
// --------------------------
// A dashboard widget is a CUSTOM NODE: the renderer emits an empty `<g>` for it and the
// page paints a raw HTML host in `.grafloria-html-layer`, a SIBLING of the SVG. So every
// export path used to emit the node's group and nothing inside it. A six-widget board
// exported as six blank boxes — and, because the content fit had no geometry to measure,
// often as a 40x40 empty square instead of a board. Silently, with no diagnostic.
//
// Unit tests cover the capture and the placement in isolation. Only this can prove the
// whole chain: the REAL page, the REAL dashboard kit, the REAL widget DOM, exported
// through the shipped `exportSvgString()` and asserted on the resulting bytes.
//
// It runs against the page's OWN live instance (`window.__demoCtx.instance`), so there
// is no second mounting path to drift from what a user sees.
//
// Needs: the demo server on :4321, and a `demos/shell/grafloria.js` built from current libs
// (`node demos/build.mjs`) — the same standing requirement every demo gate has.

import { chromium } from 'playwright';

const checks = [];
const check = (name, ok, detail) => {
  checks.push(ok);
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
};

const b = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
const pageErrors = [];
p.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 200)));

await p.goto('http://127.0.0.1:4321/dashboard/dashboard-builder.html', { waitUntil: 'networkidle' });
await p.waitForFunction(() => window.__demoReady === true, { timeout: 20000 });
await p.waitForTimeout(500);

console.log('--- custom-node export: the real dashboard, exported by its own instance ---');

const out = await p.evaluate(() => {
  const instance = window.__demoCtx.instance;

  // THE VISIBLE VIEW ONLY. Tabs park inactive views at x ≈ -20000, so an unscoped
  // export of a tabbed board writes a ~21,000px document that is almost all empty.
  // That is real model geometry rather than a rendering fault — but a developer who
  // calls export() and gets that has still been failed, so the kit now names the
  // scope itself. This asks the LIVE handle; the literal below is only the expected
  // answer, so a wrong set fails loudly instead of quietly agreeing with itself.
  const overview = [...window.__demoCtx.dashboard.exportIds()];
  const expected = ['overview', 'kpi-revenue', 'kpi-customers', 'kpi-avgdeal', 'kpi-winrate', 'trend', 'mix', 'reps'];

  const full = instance.exportSvgString();
  // `customNodes: []` is the documented opt-out — and it reproduces, exactly, what every
  // export did before this seam existed. It is the BEFORE picture, on demand.
  const before = instance.exportSvgString({ customNodes: [] });
  const scoped = instance.exportSvgString({ includeIds: overview });

  return {
    svg: full.svg,
    warnings: full.warnings,
    hosts: document.querySelectorAll('.grafloria-html-layer .grafloria-node-host').length,
    before: { viewBox: before.viewBox, svg: before.svg },
    scoped: { viewBox: scoped.viewBox, svg: scoped.svg },
    ids: { got: overview.sort(), expected: expected.sort() },
    fullWidth: full.viewBox.width,
  };
});

const svg = out.svg;
const groups = (svg.match(/class="grafloria-custom-node"/g) || []).length;
const placeholders = (svg.match(/grafloria-custom-node-placeholder/g) || []).length;

if (groups === 0) {
  console.log(
    '\n  NOTE: no custom-node groups at all. If this is the only failure, demos/shell/grafloria.js\n' +
      '        predates the custom-node export seam — rebuild it with `node demos/build.mjs`.'
  );
}

check('the board mounted custom-node hosts', out.hosts > 0, `hosts=${out.hosts}`);
check(
  'every widget produced a custom-node group in the export',
  groups === out.hosts && groups > 0,
  `groups=${groups} hosts=${out.hosts}`
);
check('no widget fell back to a placeholder box', placeholders === 0, `placeholders=${placeholders}`);

// -- the content itself ------------------------------------------------------
// KPI headline numbers are plain HTML <div> text with no SVG anywhere near them. An
// export that only lifted inline <svg> would be missing every one of these.
for (const value of ['$6.81M', '1,284', '$18.6K', '27.4%']) {
  check(`KPI value "${value}" is in the exported document`, svg.includes(value));
}

// The donut's ring is stroked arc paths — `arcPath()` in the kit emits `A66,66 …`.
const arcs = (svg.match(/d="M[^"]*A66,66[^"]*"/g) || []).length;
check('donut arc paths are in the exported document', arcs >= 4, `arcs=${arcs}`);
check('donut centre figure "$6.73M" is present', svg.includes('$6.73M'));
check('donut legend labels are present', svg.includes('North America'));
check('line-chart polylines are present', /<polyline[^>]+points="[^"]{40,}"/.test(svg));
check('table cell text is present', svg.includes('A. Farouk') && svg.includes('J. Okonkwo'));

// text-transform is applied by the RENDERER and never written back to the DOM: the text
// node says 'Quota', the screen says 'QUOTA'. Capturing nodeValue verbatim would make
// every widget title in the file subtly but visibly wrong.
check('headers carry their text-transform', svg.includes('QUOTA') && svg.includes('TOTAL REVENUE'));

// -- fidelity of the file ----------------------------------------------------
check(
  'no unresolved CSS custom properties survived into the file',
  !svg.includes('var(--'),
  'the kit paints grid/ink with var(--axdb-*); computed style must resolve them'
);
check(
  'the built-in widgets needed no foreignObject — this is true vector',
  !svg.includes('<foreignObject'),
  'so it survives PDF and standalone rasterizers, not just browsers'
);

// -- the before/after, from the same live instance ---------------------------
check(
  'BEFORE (customNodes: []) the whole board collapses to an empty 40x40 square',
  out.before.viewBox.width === 40 && out.before.viewBox.height === 40,
  `${out.before.viewBox.width}x${out.before.viewBox.height}`
);
check(
  'BEFORE the document contains no widget content at all',
  !out.before.svg.includes('$6.81M') && !out.before.svg.includes('A66,66'),
  `${out.before.svg.length} bytes of nothing`
);
check('AFTER the document is an order of magnitude larger', svg.length > out.before.svg.length * 10);

// -- scoping -----------------------------------------------------------------
check(
  'includeIds scopes widgets exactly as it prunes nodes',
  out.scoped.viewBox.width > 1100 && out.scoped.viewBox.width < 1300 && out.scoped.viewBox.height < 800,
  `${Math.round(out.scoped.viewBox.width)}x${Math.round(out.scoped.viewBox.height)}`
);
check('the scoped export still carries its widget content', out.scoped.svg.includes('$6.81M'));
check('the scoped export excludes the other views', !out.scoped.svg.includes('data-node-id="pipe-funnel"'));

// -- the kit names its own scope --------------------------------------------
check(
  'handle.exportIds() names the visible view — group included, parked views out',
  JSON.stringify(out.ids.got) === JSON.stringify(out.ids.expected),
  out.ids.got.join(',')
);
// The reason exportIds() exists, stated as a number: this is what a developer who
// does NOT scope gets today, and it is not a document anyone wanted.
check(
  'and the unscoped export really is the runaway it protects against',
  out.fullWidth > 15000,
  `unscoped ${Math.round(out.fullWidth)}px vs scoped ${Math.round(out.scoped.viewBox.width)}px`
);

// -- the fidelity channel ----------------------------------------------------
check('warnings is a real array a caller can read', Array.isArray(out.warnings));
check(
  'a fully vector board reports NO custom-node warnings',
  !out.warnings.some((w) => w.includes('custom node')),
  out.warnings.filter((w) => w.includes('custom node')).join(' | ') || 'none'
);

// ===========================================================================
// THE BOARD THE CAMERA HAS NEVER VISITED.
//
// Everything above runs with `cullCustomNodes` OFF, which is the default, so every host
// has been in the document since mount and the export had something to read for all of
// them. Switch culling on and the widget layer becomes lazy: a tile the camera has never
// reached has never been PAINTED, so there is nothing in the document to capture, and one
// culling detached has an element with no layout box — every rect reads zero. Both used
// to export as a blank, and the option's own docs told you to "pan or fitView() first",
// which is no answer for a headless print job.
//
// This drives the REAL kit — `dashboard()`'s own widget renderers, real inline SVG, real
// KPI text — into a 320x220 camera on a ~1160x1050 board, so 16 of 20 tiles are never
// visited by any frame. The board is laid out explicitly rather than through the grid
// binder for ONE reason: the binder's finalize() ends in fitToBounds(), which frames the
// whole board and would mount every tile before the first assertion could run.
//
// WHAT MAKES THIS A TEST AND NOT A COINCIDENCE: each tile's headline value is a string
// only that tile can produce, and the preconditions below prove the far ones were unpainted
// BEFORE the export. "The file contains widget text" would have been green all along.
// ===========================================================================
console.log('\n--- culling ON: widgets the camera has never reached ---');

const lazy = await p.evaluate(async () => {
  const { render, dashboard } = await import('/shell/grafloria.js');

  const COLS = 4;
  const ROWS = 5;
  const TILE = { w: 280, h: 200, gap: 12 };

  const widgets = [];
  for (let i = 0; i < COLS * ROWS; i++) {
    widgets.push({
      id: `t${i}`,
      kind: 'kpi',
      data: { label: `Tile ${i}`, value: `CULLPROOF-${i}`, delta: 4.2, spark: [3, 9, 5, 12, 8] },
    });
  }
  // dashboard() for the PAINTER and the widget specs; the geometry is ours, so no
  // finalize() runs and no camera fit mounts the board out from under the test.
  const spec = dashboard({ widgets });
  const nodes = spec.nodes.map((n, i) => ({
    ...n,
    position: { x: (i % COLS) * (TILE.w + TILE.gap), y: Math.floor(i / COLS) * (TILE.h + TILE.gap) },
    size: { width: TILE.w, height: TILE.h },
  }));

  const mount = (cull) => {
    const host = document.createElement('div');
    host.style.cssText =
      'position:fixed;left:0;bottom:0;width:320px;height:220px;overflow:hidden;z-index:-1;background:#fff';
    document.body.appendChild(host);
    const painted = [];
    const instance = render(
      { nodes, edges: [] },
      host,
      {
        renderCustomNode: (n, el) => {
          painted.push(n.id);
          spec.renderCustomNode(n, el);
        },
        ...(cull ? { cullCustomNodes: true } : {}),
      }
    );
    instance.renderNow();
    const hosts = () => host.querySelectorAll('.grafloria-html-layer > .grafloria-node-host').length;
    return { host, instance, painted, hosts };
  };

  // -- the culled board ------------------------------------------------------
  const culled = mount(true);
  const before = {
    hosts: culled.hosts(),
    painted: [...culled.painted],
    // The far corner tile, straight out of the live DOM: proof it was never painted.
    farInDom: culled.host.textContent.includes(`CULLPROOF-${COLS * ROWS - 1}`),
  };

  const exported = culled.instance.exportSvgString();

  const after = {
    hosts: culled.hosts(),
    painted: [...culled.painted],
    farInDom: culled.host.textContent.includes(`CULLPROOF-${COLS * ROWS - 1}`),
  };

  // -- the same board with culling OFF, for the identity claim ---------------
  const plain = mount(false);
  const plainExported = plain.instance.exportSvgString();

  const strip = (s) => s.replace(/grafloria-\d+/g, 'grafloria-N');
  const result = {
    total: COLS * ROWS,
    before,
    after,
    warnings: exported.warnings,
    svgLen: exported.svg.length,
    placeholders: (exported.svg.match(/grafloria-custom-node-placeholder/g) || []).length,
    groups: (exported.svg.match(/class="grafloria-custom-node"/g) || []).length,
    missing: widgets.map((w) => w.data.value).filter((v) => !exported.svg.includes(v)),
    identical: strip(exported.svg) === strip(plainExported.svg),
    plainHosts: plain.hosts(),
  };

  culled.instance.dispose();
  culled.host.remove();
  plain.instance.dispose();
  plain.host.remove();
  return result;
});

// -- preconditions: the far tiles really were unreachable --------------------
check(
  'culling left most of the board unmounted',
  lazy.before.hosts > 0 && lazy.before.hosts < lazy.total,
  `${lazy.before.hosts}/${lazy.total} hosts mounted`
);
check(
  'and unPAINTED — the far tile is nowhere in the live DOM before the export',
  lazy.before.farInDom === false && lazy.before.painted.length === lazy.before.hosts,
  `painter ran ${lazy.before.painted.length}x`
);
check(
  'culling OFF mounts the whole board, which is what makes the two comparable',
  lazy.plainHosts === lazy.total,
  `${lazy.plainHosts}/${lazy.total}`
);

// -- the fix -----------------------------------------------------------------
check(
  'EVERY widget is in the export, including the 16 no frame ever drew',
  lazy.missing.length === 0,
  lazy.missing.length ? `missing ${lazy.missing.join(', ')}` : `all ${lazy.total} present`
);
check(
  'each one is a real group, not a placeholder box',
  lazy.groups === lazy.total && lazy.placeholders === 0,
  `groups=${lazy.groups} placeholders=${lazy.placeholders}`
);
check(
  'and nothing was reported as unreadable',
  !lazy.warnings.some((w) => w.includes('custom node')),
  lazy.warnings.filter((w) => w.includes('custom node')).join(' | ') || 'none'
);

// -- the export is non-destructive -------------------------------------------
check(
  'the document is the SAME SIZE after the export as before it',
  lazy.after.hosts === lazy.before.hosts,
  `${lazy.before.hosts} → ${lazy.after.hosts} hosts`
);
check(
  'the far tile is re-culled, not left mounted',
  lazy.after.farInDom === false
);
check(
  'and every widget was painted exactly once — mount-once survives the export',
  lazy.after.painted.length === lazy.total &&
    new Set(lazy.after.painted).size === lazy.total,
  `${lazy.after.painted.length} paints, ${new Set(lazy.after.painted).size} distinct`
);

// -- the governing claim -----------------------------------------------------
check(
  'THE FILE IS IDENTICAL WITH CULLING ON AND OFF — a perf knob that cannot lose data',
  lazy.identical,
  `${lazy.svgLen} bytes`
);

// ===========================================================================
// THE WIDGET THAT DRAWS LATER.
//
// Everything above paints INLINE: `renderCustomNode` returns and the pixels are already
// there, so a synchronous capture reads them. A painter that DEFERS — a rAF, a fetch, a
// framework's async render, a web font — has drawn nothing when the capture looks, and
// its widget came out as a marked box. Honest, and still blank in the customer's PDF.
//
// THE MECHANISM: `renderCustomNode` may RETURN A PROMISE. `export()` has always returned
// one, so it is the async entry point and there is no new public method. It waits for
// exactly the painters that said they were not finished, and for nothing else.
//
// WHAT MAKES THIS A TEST AND NOT A COINCIDENCE: every tile's headline value is a string
// only that tile's painter can produce, and the SAME board is exported SYNCHRONOUSLY
// first — that export must contain none of them. If it did, the widget had drawn inline
// and the async round trip would be proving nothing. Real rAFs, in a real browser, with
// the real dashboard kit doing the drawing.
// ===========================================================================
console.log('\n--- an ASYNC renderCustomNode: the widget that draws later ---');

const deferred = await p.evaluate(async () => {
  const { render, dashboard } = await import('/shell/grafloria.js');

  const unhandled = [];
  addEventListener('unhandledrejection', (e) => unhandled.push(String(e.reason)));

  const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

  const board = (n, tag) => {
    const widgets = [];
    for (let i = 0; i < n; i++) {
      widgets.push({
        id: `${tag}${i}`,
        kind: 'kpi',
        data: { label: `Async ${i}`, value: `${tag.toUpperCase()}PROOF-${i}`, delta: 3.1, spark: [2, 7, 4, 9, 6] },
      });
    }
    const spec = dashboard({ widgets });
    const nodes = spec.nodes.map((node, i) => ({
      ...node,
      position: { x: (i % 3) * 292, y: Math.floor(i / 3) * 212 },
      size: { width: 280, height: 200 },
    }));
    return { spec, nodes, values: widgets.map((w) => w.data.value) };
  };

  const mount = (nodes, renderCustomNode) => {
    const host = document.createElement('div');
    host.style.cssText =
      'position:fixed;left:0;bottom:0;width:900px;height:460px;overflow:hidden;z-index:-1;background:#fff';
    document.body.appendChild(host);
    const instance = render({ nodes, edges: [] }, host, { renderCustomNode });
    instance.renderNow();
    const hosts = () => host.querySelectorAll('.grafloria-html-layer > .grafloria-node-host').length;
    return { host, instance, hosts };
  };

  // -- the round trip --------------------------------------------------------
  const main = board(6, 'a');
  const painted = [];
  const late = mount(main.nodes, async (node, el) => {
    painted.push(node.id);
    // A REAL deferral. Two animation frames is what a charting library that measures its
    // own container actually does, and it is the case a synchronous capture cannot see.
    await nextFrame();
    await nextFrame();
    main.spec.renderCustomNode(node, el);
  });

  // SYNCHRONOUS, taken with no await in between, so not one frame has passed.
  const sync = late.instance.exportSvgString();
  const hostsBefore = late.hosts();

  // ASYNCHRONOUS: the identical board, waited for.
  let asyncWarnings = [];
  const startedFast = Date.now();
  const asyncSvg = await late.instance.export('svg', { onWarnings: (w) => (asyncWarnings = w) });
  const fastMs = Date.now() - startedFast;
  const hostsAfter = late.hosts();
  const paintedAfter = [...painted];

  // -- the bound: a painter that never settles -------------------------------
  const stuck = board(3, 'n');
  const hung = mount(stuck.nodes, () => new Promise(() => undefined));
  let hungWarnings = [];
  const startedHung = Date.now();
  const hungSvg = await hung.instance.export('svg', {
    customNodeTimeout: 200,
    onWarnings: (w) => (hungWarnings = w),
  });
  const hungMs = Date.now() - startedHung;

  // -- a painter that REJECTS ------------------------------------------------
  const mixed = board(3, 'r');
  const broke = mount(mixed.nodes, async (node, el) => {
    if (node.id === 'r1') throw new Error('feed unavailable');
    await nextFrame();
    mixed.spec.renderCustomNode(node, el);
  });
  let brokeWarnings = [];
  const brokeHostsBefore = broke.hosts();
  const brokeSvg = await broke.instance.export('svg', { onWarnings: (w) => (brokeWarnings = w) });

  const result = {
    values: main.values,
    sync: {
      leaked: main.values.filter((v) => sync.svg.includes(v)),
      placeholders: (sync.svg.match(/grafloria-custom-node-placeholder/g) || []).length,
      warnedAsync: sync.warnings.filter((w) => /still painting/i.test(w)).length,
    },
    async: {
      missing: main.values.filter((v) => !asyncSvg.includes(v)),
      placeholders: (asyncSvg.match(/grafloria-custom-node-placeholder/g) || []).length,
      groups: (asyncSvg.match(/class="grafloria-custom-node"/g) || []).length,
      warnings: asyncWarnings.filter((w) => w.includes('custom node')),
      ms: fastMs,
      hostsBefore,
      hostsAfter,
      paints: paintedAfter.length,
      distinct: new Set(paintedAfter).size,
      foreignObject: asyncSvg.includes('<foreignObject'),
    },
    hung: {
      ms: hungMs,
      timedOut: hungWarnings.filter((w) => /did not finish painting within 200ms/.test(w)).length,
      placeholders: (hungSvg.match(/grafloria-custom-node-placeholder/g) || []).length,
    },
    rejected: {
      survivors: ['RPROOF-0', 'RPROOF-2'].filter((v) => brokeSvg.includes(v)),
      warned: brokeWarnings.some((w) => w.includes('"r1"') && /reject/i.test(w) && w.includes('feed unavailable')),
      hostsBefore: brokeHostsBefore,
      hostsAfter: broke.hosts(),
    },
    unhandled,
  };

  for (const m of [late, hung, broke]) {
    m.instance.dispose();
    m.host.remove();
  }
  return result;
});

// -- the precondition: synchronously, this board really is blank -------------
check(
  'SYNC: not one of the six deferred widgets had drawn when exportSvgString() read them',
  deferred.sync.leaked.length === 0 && deferred.sync.placeholders === 6,
  `leaked=${deferred.sync.leaked.join(',') || 'none'} placeholders=${deferred.sync.placeholders}`
);
// …and it SAYS so, in words that name the cause and the fix. The generic "empty box"
// warning would have been green all along, so this asserts the async-specific sentence.
check(
  'SYNC: and each one is reported as still painting, not merely as empty',
  deferred.sync.warnedAsync === 6,
  `${deferred.sync.warnedAsync}/6 warned`
);

// -- the fix -----------------------------------------------------------------
check(
  'ASYNC: await export() has every deferred widget, drawn by the real kit',
  deferred.async.missing.length === 0 && deferred.async.groups === 6,
  deferred.async.missing.length ? `missing ${deferred.async.missing.join(', ')}` : `groups=${deferred.async.groups}`
);
check(
  'ASYNC: none of them fell back to a placeholder box',
  deferred.async.placeholders === 0,
  `placeholders=${deferred.async.placeholders}`
);
check(
  'ASYNC: and nothing was reported as unreadable',
  deferred.async.warnings.length === 0,
  deferred.async.warnings.join(' | ') || 'none'
);
check(
  'ASYNC: still true vector — no foreignObject, so it survives PDF',
  deferred.async.foreignObject === false
);
// The PROMISE is the signal, not the clock. Waiting out the 5s default instead of the
// painter's two frames would be the fixed-timeout guess this design exists to avoid.
check(
  'the wait ends when the painter settles, not when the deadline expires',
  deferred.async.ms < 2000,
  `${deferred.async.ms}ms, default deadline 5000ms`
);

// -- the standing guarantees survive the await -------------------------------
check(
  'the document is the same size after the async export as before it',
  deferred.async.hostsAfter === deferred.async.hostsBefore,
  `${deferred.async.hostsBefore} → ${deferred.async.hostsAfter} hosts`
);
check(
  'mount-once survives: one paint per widget across a sync AND an async export',
  deferred.async.paints === 6 && deferred.async.distinct === 6,
  `${deferred.async.paints} paints, ${deferred.async.distinct} distinct`
);

// -- the bound ---------------------------------------------------------------
check(
  'a painter that NEVER settles cannot hang an export',
  deferred.hung.ms >= 150 && deferred.hung.ms < 3000,
  `returned in ${deferred.hung.ms}ms against a 200ms deadline`
);
check(
  'and every widget it gave up on is named, with the deadline it missed',
  deferred.hung.timedOut === 3 && deferred.hung.placeholders === 3,
  `warned=${deferred.hung.timedOut} placeholders=${deferred.hung.placeholders}`
);

// -- a painter that rejects --------------------------------------------------
check(
  'a REJECTING painter does not abort the export — its neighbours are still in the file',
  deferred.rejected.survivors.length === 2,
  deferred.rejected.survivors.join(',') || 'none survived'
);
check(
  'and the rejection is reported by node id, with the error it threw',
  deferred.rejected.warned
);
check(
  'and it strands nothing',
  deferred.rejected.hostsAfter === deferred.rejected.hostsBefore,
  `${deferred.rejected.hostsBefore} → ${deferred.rejected.hostsAfter} hosts`
);
// We asked for the promise, so we own its failure. Leaking it would put a red
// "Uncaught (in promise)" in every embedder's console for a case we already handle.
check(
  'no unhandled promise rejection reached the page',
  deferred.unhandled.length === 0,
  deferred.unhandled.join(' | ')
);

// ===========================================================================
// CSS PAINT → TRUE VECTOR: gradients, shadows and images.
//
// A widget card is rarely a flat fill. It is a linear-gradient header, a drop shadow, a
// logo. Those used to be dropped silently by the transcriber — the card degraded to a
// <foreignObject>, which browsers render and PDF / resvg / librsvg leave BLANK. This drives
// the real capture over three widgets built from exactly that CSS, exports through the
// live instance to BOTH targets, and asserts the honest per-format outcome: SVG carries a
// real <linearGradient>/<feDropShadow>/<image>; PDF flattens the gradient to a solid (with
// a warning), keeps the shadowed box (minus the blur), and REPORTS the image it cannot draw.
//
// WHAT MAKES THIS A TEST AND NOT A COINCIDENCE: "the file contains a <linearGradient>" can
// be green from a DIFFERENT node, and "no foreignObject" says nothing about the paint. So
// the gradient's stops are pinned to the authored red→blue, the box's fill is asserted to
// reference THAT gradient's id, and the 90deg endpoints are checked to be a HORIZONTAL line
// — a wrong-angle gradient still contains a <linearGradient>.
// ===========================================================================
console.log('\n--- CSS paint → true vector: gradients, shadows, images ---');

const paint = await p.evaluate(async () => {
  const { render } = await import('/shell/grafloria.js');

  const host = document.createElement('div');
  host.style.cssText =
    'position:fixed;left:0;bottom:0;width:920px;height:240px;overflow:hidden;z-index:-1;background:#fff';
  document.body.appendChild(host);

  // A REAL canvas PNG (8x8 opaque red) — generated the way production images arrive
  // (canvas.toDataURL). The previous hand-pasted 1x1 base64 was TRUNCATED: its zlib
  // Adler-32 tail was cut short, which browsers tolerate and strict decoders refuse —
  // so the PDF's PNG parser (correctly) rejected it and the "XObject embedded" check
  // could never pass. A fixture must be the thing production produces, not a minified
  // approximation of it.
  const cv = document.createElement('canvas');
  cv.width = 8; cv.height = 8;
  const c2 = cv.getContext('2d');
  c2.fillStyle = 'rgb(255,0,0)'; c2.fillRect(0, 0, 8, 8);
  const IMG = cv.toDataURL('image/png');

  const node = (id, x) => ({
    id,
    position: { x, y: 0 },
    size: { width: 280, height: 200 },
    metadata: { useHTMLLayer: true },
  });
  const nodes = [node('grad', 0), node('shadow', 320), node('img', 640)];

  const renderCustomNode = (n, el) => {
    if (n.id === 'grad') {
      el.innerHTML =
        '<div style="width:100%;height:100%;background-image:' +
        'linear-gradient(90deg, rgb(255,0,0) 0%, rgb(0,0,255) 100%)"></div>';
    } else if (n.id === 'shadow') {
      el.innerHTML =
        '<div style="width:100%;height:100%;background-color:rgb(255,255,255);' +
        'box-shadow: rgba(0,0,0,0.3) 3px 5px 12px 0px"></div>';
    } else {
      el.innerHTML = `<img src="${IMG}" style="width:100%;height:100%">`;
    }
  };

  const instance = render({ nodes, edges: [] }, host, { renderCustomNode });
  instance.renderNow();

  const svgOut = instance.exportSvgString();
  const pdfOut = instance.exportPdf();

  instance.dispose();
  host.remove();

  return {
    svg: svgOut.svg,
    svgWarnings: svgOut.warnings,
    pdfWarnings: pdfOut.warnings,
    pdfBytes: pdfOut.pdf.length,
    pdfHeader: String.fromCharCode(...pdfOut.pdf.slice(0, 5)),
    pdfHasAxialShading: new TextDecoder('latin1').decode(pdfOut.pdf).includes('/ShadingType 2'),
    pdfHasImageXObject: (() => { const t = new TextDecoder('latin1').decode(pdfOut.pdf); return t.includes('/Subtype /Image') && / Do\b/.test(t); })(),
  };
});

const psvg = paint.svg;

// -- the gradient, faithful in SVG -------------------------------------------
const gradMatch = psvg.match(/<linearGradient id="(grafloria-def-[^"]+)"[^>]*gradientUnits="userSpaceOnUse"[^>]*>/);
check('the linear-gradient became a userSpaceOnUse <linearGradient>', !!gradMatch, gradMatch ? gradMatch[1] : 'none');
if (gradMatch) {
  const gid = gradMatch[1];
  // The gradient body — its stops must be the authored red → blue, not an empty gradient.
  const body = psvg.slice(psvg.indexOf(gradMatch[0]));
  const grad = body.slice(0, body.indexOf('</linearGradient>'));
  check(
    'its stops are the authored red → blue (an empty gradient would still be a <linearGradient>)',
    /stop-color="rgb\(255, ?0, ?0\)"/.test(grad) && /stop-color="rgb\(0, ?0, ?255\)"/.test(grad),
    grad.replace(/\s+/g, ' ').slice(0, 160)
  );
  // 90deg is a HORIZONTAL line: y1 === y2. A wrong-angle gradient is still a gradient, so
  // this is the assertion that actually proves the maths.
  const x1 = Number(gradMatch[0].match(/x1="([-\d.]+)"/)?.[1]);
  const y1 = Number(gradMatch[0].match(/y1="([-\d.]+)"/)?.[1]);
  const x2 = Number(gradMatch[0].match(/x2="([-\d.]+)"/)?.[1]);
  const y2 = Number(gradMatch[0].match(/y2="([-\d.]+)"/)?.[1]);
  check('90deg is a horizontal gradient line — y1 === y2, x1 < x2', y1 === y2 && x1 < x2, `(${x1},${y1})→(${x2},${y2})`);
  // The box FILLS with this exact gradient — not merely "a gradient exists somewhere".
  check('the widget box fills with THIS gradient', psvg.includes(`fill="url(#${gid})"`));
}

// -- the shadow, faithful in SVG ---------------------------------------------
const shadowFilter = psvg.match(/<filter id="(grafloria-def-[^"]+)"[^>]*>\s*<feDropShadow[^>]*dx="3"[^>]*dy="5"[^>]*stdDeviation="6"/);
check('the box-shadow became an feDropShadow filter (12px blur → std-deviation 6)', !!shadowFilter, shadowFilter ? shadowFilter[1] : 'none');
if (shadowFilter) {
  check('and the shadowed box wears that filter', psvg.includes(`filter="url(#${shadowFilter[1]})"`));
}

// -- the image, faithful in SVG ----------------------------------------------
check('the <img> became an <image> with an inlined data: URI', /<image[^>]+href="data:image\/png/.test(psvg));

// -- still true vector: no foreignObject, no unresolved vars -----------------
check('none of the three fell back to a foreignObject', !psvg.includes('<foreignObject'), 'so they survive resvg/librsvg, not just browsers');
check('and no CSS custom property leaked into the file', !psvg.includes('var(--'));

// -- the HONEST PDF degradation ----------------------------------------------
// The SAME capture, painted to PDF. The point of the subsystem is that the file does not
// LIE about a format: a gradient becomes a solid stop and SAYS so; an image cannot be drawn
// at all and SAYS so; the shadowed box still draws (minus the blur PDF has no way to make).
// The PDF is deliberately SMALL: all three widgets degrade (gradient → solid, shadow → a
// flat box, image → omitted), so there is little to draw — but it is a valid file.
check('PDF produced a real, well-formed file', paint.pdfHeader === '%PDF-' && paint.pdfBytes > 400, `${paint.pdfHeader} ${paint.pdfBytes} bytes`);
// RECONCILED (2026-07-21): the PDF painter landed REAL axial shadings (b2854b0a1 —
// linear gradients become /ShadingType 2 objects), so the old "gradient was flattened
// to a solid stop" warning no longer fires for a userSpace gradient fill, and asserting
// it would demand a lie. The check now asserts the STRONGER truth: the gradient is IN
// the PDF as a real shading object, which is why no flatten warning is needed.
check(
  'PDF carries the gradient as a REAL axial shading (/ShadingType 2) — nothing left to warn about',
  paint.pdfHasAxialShading === true &&
    !paint.pdfWarnings.some((w) => /gradient/i.test(w) && /flatten|first stop/i.test(w)),
  paint.pdfHasAxialShading ? '/ShadingType 2 present' : 'no shading object in the PDF'
);
// RECONCILED (2026-07-21): the PDF painter embeds data: images as XObjects (b2854b0a1),
// so "the image was omitted" is no longer true for this data: PNG — asserting the old
// warning would demand a lie. The stronger truth: the XObject is IN the PDF and invoked.
check(
  'PDF embeds the data: image as an XObject (and invokes it) — nothing to warn about',
  paint.pdfHasImageXObject === true &&
    !paint.pdfWarnings.some((w) => /image/i.test(w) && /MISSING from a PDF/.test(w)),
  paint.pdfHasImageXObject ? '/Subtype /Image present + Do' : 'no image XObject in the PDF'
);
// The image caveat is also surfaced on the SVG export's warnings, so a caller who never
// touches PDF is still told which widgets carry a PDF risk.
check(
  'the SVG export does NOT flag a data: image as a PDF risk any more — the PDF embeds it',
  !paint.svgWarnings.some((w) => /image/i.test(w) && /MISSING from a PDF/.test(w)),
  paint.svgWarnings.find((w) => /image/i.test(w)) || 'no image warning (correct)'
);

// -- render the exported SVG STANDALONE and prove it is not blank ------------
// The standing rule here: an export that serializes but renders wrong is not done. This
// rasterizes the gradient widget's SVG in a bare <img> (no page CSS, no kit) and reads the
// pixels back — a red-left / blue-right split is the gradient actually painting.
const standalone = await p.evaluate(async (svg) => {
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  const img = new Image();
  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = () => rej(new Error('standalone SVG failed to load'));
    img.src = url;
  });
  const c = document.createElement('canvas');
  c.width = img.naturalWidth || 920;
  c.height = img.naturalHeight || 240;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const at = (fx) => {
    const d = g.getImageData(Math.floor(c.width * fx), Math.floor(c.height * 0.4), 1, 1).data;
    return { r: d[0], g: d[1], b: d[2], a: d[3] };
  };
  // Sample inside the gradient widget: it occupies the left ~30% of the board.
  return { left: at(0.03), right: at(0.27), w: c.width, h: c.height };
}, psvg);

check(
  'STANDALONE render: the gradient widget paints red on the left',
  standalone.left.r > 150 && standalone.left.b < 100 && standalone.left.a > 0,
  JSON.stringify(standalone.left)
);
check(
  'STANDALONE render: and blue on the right — the gradient truly renders, not just serializes',
  standalone.right.b > 150 && standalone.right.r < 100,
  JSON.stringify(standalone.right)
);

// ===========================================================================
// PSEUDO-ELEMENTS AND CLIPPING.
//
// Two widgets no earlier capture could express:
//   • a ::before pseudo-element — decorative content that exists only in a stylesheet.
//     A pseudo has NO element to getBoundingClientRect(); its box is DERIVED from
//     computed style, and its content goes through the same text emission as real text
//     (the stylesheet says text-transform: uppercase over "beta flag" — the export must
//     say "BETA FLAG", positioned at the card's padding inset, not merely "somewhere").
//   • a rounded card with overflow:hidden and a child that bleeds 200% past it. The
//     REAL tooth is the NEGATIVE, read from pixels: a corner pixel that IS painted red
//     on the identical card without overflow:hidden must NOT be red on the clipped one.
//     "The export contains a clipPath" would pass off a lifted inline <svg>'s clip; so
//     the assertions scope to OUR generated clip's id and the group that wears it.
// ===========================================================================
console.log('\n--- pseudo-elements and clipping ---');

const clipOut = await p.evaluate(async () => {
  const { render } = await import('/shell/grafloria.js');

  const host = document.createElement('div');
  host.style.cssText =
    'position:fixed;left:0;bottom:0;width:1000px;height:240px;overflow:hidden;z-index:-1;background:#fff';
  document.body.appendChild(host);

  // The pseudo-element lives in a stylesheet — there is no inline way to author one.
  const styleEl = document.createElement('style');
  styleEl.textContent =
    '.wexp-pseudo::before{content:"beta flag";text-transform:uppercase;' +
    'color:rgb(0, 140, 60);font-size:16px;font-weight:700;}';
  document.head.appendChild(styleEl);

  const node = (id, x) => ({
    id,
    position: { x, y: 0 },
    size: { width: 280, height: 200 },
    metadata: { useHTMLLayer: true },
  });
  const nodes = [node('clipped', 0), node('unclipped', 320), node('pseudo', 640)];

  const renderCustomNode = (n, el) => {
    if (n.id === 'pseudo') {
      el.innerHTML =
        '<div class="wexp-pseudo" style="width:100%;height:100%;padding:12px;box-sizing:border-box"></div>';
    } else {
      // The same card twice: border-radius 48, a child bleeding to 200% — the ONLY
      // difference is overflow:hidden. Neither card has a background of its own, so
      // the corner pixel belongs to the bleeding child or to nobody.
      const overflow = n.id === 'clipped' ? 'overflow:hidden;' : '';
      el.innerHTML =
        `<div style="width:100%;height:100%;border-radius:48px;${overflow}">` +
        '<div style="width:200%;height:200%;background:rgb(220, 0, 0)"></div></div>';
    }
  };

  const instance = render({ nodes, edges: [] }, host, { renderCustomNode });
  instance.renderNow();
  const out = instance.exportSvgString();
  instance.dispose();
  host.remove();
  styleEl.remove();
  return { svg: out.svg, viewBox: out.viewBox, warnings: out.warnings };
});

const csvg = clipOut.svg;

// -- the pseudo-element, positioned ------------------------------------------
const pseudoText = csvg.match(/<text([^>]*)>BETA FLAG<\/text>/);
check(
  '::before content is in the file, UPPERCASED by the pseudo’s own text-transform',
  !!pseudoText,
  pseudoText ? 'found' : 'no <text>BETA FLAG</text> — the DOM never contains this string, only the stylesheet does'
);
if (pseudoText) {
  const attr = (name) => Number(pseudoText[1].match(new RegExp(`${name}="([-\\d.]+)"`))?.[1]);
  const px = attr('x');
  const py = attr('y');
  // Derived box: the card's 12px padding inset, baseline inside the first line box —
  // a content string appearing "anywhere" is not proof of geometry, these numbers are.
  check('and it is POSITIONED at the card’s padding inset', px >= 10 && px <= 16, `x=${px}`);
  check('with a baseline inside the first line box', py >= 18 && py <= 36, `y=${py}`);
  check('and the pseudo’s own colour', pseudoText[1].includes('fill="rgb(0, 140, 60)"'));
  const idx = { pseudo: csvg.indexOf('data-node-id="pseudo"'), text: csvg.indexOf('>BETA FLAG<') };
  check('inside the pseudo widget’s group, not some other node', idx.text > idx.pseudo && idx.pseudo > 0);
}

// -- the clip, scoped to OUR generated def -----------------------------------
const clipDefMatch = csvg.match(/<clipPath id="(grafloria-def-[a-z0-9]+)"><rect[^>]*rx="48"[^>]*\/><\/clipPath>/);
check('the rounded card emitted OUR <clipPath> (a rounded 48px rect, paintDefId-stable)', !!clipDefMatch, clipDefMatch ? clipDefMatch[1] : 'none');
if (clipDefMatch) {
  const cid = clipDefMatch[1];
  const ref = csvg.indexOf(`clip-path="url(#${cid})"`);
  check('and a <g> wears THAT clip’s id', ref >= 0);
  const idxClipped = csvg.indexOf('data-node-id="clipped"');
  const idxUnclipped = csvg.indexOf('data-node-id="unclipped"');
  check(
    'inside the CLIPPED widget’s group',
    ref > idxClipped && ref < idxUnclipped,
    `ref@${ref} clipped@${idxClipped} unclipped@${idxUnclipped}`
  );
  const unclippedSegment = csvg.slice(idxUnclipped, csvg.indexOf('data-node-id="pseudo"'));
  check('while the overflow:visible twin carries NO clip', !unclippedSegment.includes('clip-path='));
}
// RECONCILED (2026-07-21): the PDF painter consumes the capture's clip contract (W n
// inside q/Q, proven by rasterizing an exported PDF — the rounded corners really clip),
// so the "may BLEED in a PDF" warning was removed with it.
check(
  'clipping carries NO stale PDF warning — the PDF painter applies these clips now',
  !clipOut.warnings.some((w) => /clip/i.test(w) && /BLEED in a PDF/.test(w)),
  clipOut.warnings.find((w) => /clip/i.test(w)) || 'no clip warning (correct)'
);

// -- the pixel proof: rasterize STANDALONE and read the corner ---------------
// Corner pixel at local (8,8): with a 48px radius the corner arc centre is (48,48), and
// distance((8,8),(48,48)) ≈ 56.6 > 48 — OUTSIDE the rounded corner, INSIDE the card box.
// The 200% child covers it. Clip honest ⇒ nothing paints there. Clip missing ⇒ red.
const clipPixels = await p.evaluate(async ({ svg, viewBox }) => {
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  const img = new Image();
  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = () => rej(new Error('standalone SVG failed to load'));
    img.src = url;
  });
  const c = document.createElement('canvas');
  c.width = img.naturalWidth || viewBox.width;
  c.height = img.naturalHeight || viewBox.height;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const at = (wx, wy) => {
    const x = Math.round(((wx - viewBox.x) * c.width) / viewBox.width);
    const y = Math.round(((wy - viewBox.y) * c.height) / viewBox.height);
    const d = g.getImageData(x, y, 1, 1).data;
    return { r: d[0], g: d[1], b: d[2], a: d[3] };
  };
  return {
    clippedCorner: at(8, 8), // outside the rounded corner of the CLIPPED card
    clippedCentre: at(140, 100), // well inside it
    unclippedCorner: at(328, 8), // the SAME corner pixel on the overflow:visible twin
  };
}, { svg: csvg, viewBox: clipOut.viewBox });

const isRed = (px) => px.a > 200 && px.r > 150 && px.g < 100 && px.b < 100;
check(
  'CONTROL: without the clip that exact corner pixel IS red — it would paint',
  isRed(clipPixels.unclippedCorner),
  JSON.stringify(clipPixels.unclippedCorner)
);
check(
  'NEGATIVE: the clipped card’s corner pixel is NOT red — the clip actually clips',
  !isRed(clipPixels.clippedCorner),
  JSON.stringify(clipPixels.clippedCorner)
);
check(
  'and the card’s interior still paints — the clip removes the bleed, not the widget',
  isRed(clipPixels.clippedCentre),
  JSON.stringify(clipPixels.clippedCentre)
);

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await b.close();
const failed = checks.filter((c) => !c).length;
console.log(
  failed === 0
    ? `\nwidget export gate: ${checks.length}/${checks.length} checks pass`
    : `\nwidget export gate: ${failed} FAILED`
);
process.exit(failed === 0 ? 0 : 1);
