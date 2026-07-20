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

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await b.close();
const failed = checks.filter((c) => !c).length;
console.log(
  failed === 0
    ? `\nwidget export gate: ${checks.length}/${checks.length} checks pass`
    : `\nwidget export gate: ${failed} FAILED`
);
process.exit(failed === 0 ? 0 : 1);
