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

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await b.close();
const failed = checks.filter((c) => !c).length;
console.log(
  failed === 0
    ? `\nwidget export gate: ${checks.length}/${checks.length} checks pass`
    : `\nwidget export gate: ${failed} FAILED`
);
process.exit(failed === 0 ? 0 : 1);
