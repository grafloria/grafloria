// Reproducible side-by-side benchmark: Grafloria vs @xyflow/react on ONE
// deterministic scene, driven identically in headless Chromium.
// Methodology and caveats: see README.md in this directory. Honest numbers
// only — both libraries run their DEFAULTS, no per-library tuning.
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const { chromium } = await import(join(HERE, '..', 'node_modules', 'playwright', 'index.mjs'));

// -- build both bundles -------------------------------------------------------
// WHICH Grafloria is being measured is a decision, not a detail. esbuild walks
// up from this directory, finds the repo's own tsconfig.json, and applies its
// `paths` — which point @grafloria/* at libs/*/src. Left alone it therefore
// bundles the WORKING TREE while this file's own comments claimed it was
// measuring the pinned, published packages. `--tsconfig-raw={}` switches that
// discovery off so resolution falls through to ./node_modules, i.e. the
// versions in package.json that anyone else would install.
//
//   node run.mjs            → published packages (reproducible off this repo)
//   node run.mjs --source   → the working tree (what a fix in progress does)
const useSource = process.argv.includes('--source');
const resolveFlag = useSource ? '' : `--tsconfig-raw={}`;
mkdirSync(join(HERE, 'dist'), { recursive: true });
execSync(`npx esbuild pages/grafloria-app.js --bundle --format=esm --outfile=dist/grafloria.js --log-level=silent ${resolveFlag}`, { cwd: HERE });
execSync(`npx esbuild pages/reactflow-app.jsx --bundle --format=esm --outfile=dist/reactflow.js --loader:.css=css --log-level=silent`, { cwd: HERE });
console.log(`grafloria build: ${useSource ? 'WORKING TREE (libs/*/src)' : 'published packages from ./node_modules'}`);
const meter = readFileSync(join(HERE, 'pages', 'frame-meter.js'), 'utf8');
for (const lib of ['grafloria', 'reactflow']) {
  const css = lib === 'reactflow' ? '<link rel="stylesheet" href="reactflow.css">' : '';
  writeFileSync(join(HERE, 'dist', `${lib}.html`),
    `<!doctype html><meta charset="utf-8">${css}<style>html,body,#root{margin:0;height:100%}</style>
<div id="root"></div><script>${meter}</script><script type="module" src="${lib}.js"></script>`);
}

const server = createServer((req, res) => {
  try {
    const p = join(HERE, 'dist', decodeURIComponent(req.url.split('?')[0].slice(1) || 'index.html'));
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[extname(p)] ?? 'text/plain';
    res.setHeader('content-type', mime);
    res.end(readFileSync(p));
  } catch { res.statusCode = 404; res.end(); }
});
await new Promise((r) => server.listen(4491, r));

/**
 * A client point where the EMPTY canvas is on top — no node, no edge.
 *
 * This is not a nicety. A drag that starts on an entity is not a pan in either
 * library: react-flow's pane handler never sees it, and Grafloria treats it as
 * a link/node interaction. The first version of this harness started its "pan"
 * at a fixed (1000,500), which happened to be empty pane in react-flow and a
 * link in Grafloria — so it timed one library panning against the other
 * hit-testing, and reported the difference as a pan result. Hence findEmpty()
 * plus the camera assertion below: a gesture that does not move the camera is
 * now a hard failure, not a number.
 */
const findEmpty = (page) => page.evaluate(`(() => {
  const isEmpty = (x, y) => {
    const el = document.elementFromPoint(x, y);
    if (!el) return false;
    if (el.closest('.react-flow__node, .react-flow__edge')) return false;
    if (el.closest('[data-vnode-key^="node-"], [data-vnode-key^="link-"]')) return false;
    return true;
  };
  for (let y = 120; y <= 680; y += 20)
    for (let x = 120; x <= 1160; x += 20)
      if (isEmpty(x, y)) return { x, y };
  return null;
})()`);

/** The camera, as a string, for both libraries — compared before/after a pan. */
const camera = (page) => page.evaluate(`(() => {
  const rf = document.querySelector('.react-flow__viewport');
  if (rf) return rf.style.transform;
  const svg = document.querySelector('svg.grafloria-diagram') || document.querySelector('svg');
  return svg ? svg.getAttribute('viewBox') : 'none';
})()`);

/**
 * The world rect actually on screen. The harness compares this ACROSS libraries
 * and refuses to report a comparison where the two disagree — otherwise one can
 * be drawing the whole mesh while the other draws a quarter of it, and the
 * difference gets written down as a performance result. (React Flow's default
 * minZoom did exactly that here until the app lowered it.)
 */
const visibleWorldRect = (page) => page.evaluate(`(() => {
  if (window.__api) { const b = window.__api.viewport.getViewBox(); return { x: b.x, y: b.y, width: b.width, height: b.height }; }
  const vp = window.__rf.getViewport();
  return { x: -vp.x / vp.zoom, y: -vp.y / vp.zoom, width: window.innerWidth / vp.zoom, height: window.innerHeight / vp.zoom };
})()`);

/** Frame the scene the same way in both libraries: whole mesh, or a 1:1 slice. */
const frame = async (page, mode) => {
  await page.evaluate(`(() => {
    const b = window.__sceneBounds;
    const W = window.innerWidth, H = window.innerHeight;
    const zoom = ${JSON.stringify(mode)} === 'fit'
      ? Math.min(W / (b.width + 80), H / (b.height + 80))
      : 1;
    // 'fit' frames the whole mesh from its top-left corner; 'slice' sits at 1:1
    // over the middle of it — the regime where a viewport-culling renderer has
    // something to cull and the camera fast path has an edge to fall off.
    const x = ${JSON.stringify(mode)} === 'fit' ? b.x - 40 : b.x + b.width / 2 - W / 2;
    const y = ${JSON.stringify(mode)} === 'fit' ? b.y - 40 : b.y + b.height / 2 - H / 2;
    window.__setCamera({ x, y, zoom });
  })()`);
  await page.waitForTimeout(250);
};

// -- scenarios ---------------------------------------------------------------
const browser = await chromium.launch();
const results = [];
/** `lib/n/mode` → the world rect that library actually had on screen. */
const framings = {};
for (const n of [500, 2000]) {
  for (const lib of ['grafloria', 'reactflow']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(`http://localhost:4491/${lib}.html?n=${n}`);
    await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });
    const mountMs = await page.evaluate('window.__mountMs');

    // PAN, in two framings: the whole mesh on screen, and a 1:1 slice of it.
    const pans = {};
    for (const mode of ['fit', 'slice']) {
      await frame(page, mode);
      framings[`${lib}/${n}/${mode}`] = await visibleWorldRect(page);

      const start = await findEmpty(page);
      if (!start) throw new Error(`${lib} n=${n} ${mode}: no empty canvas point to start a pan from`);
      const camBefore = await camera(page);
      await page.mouse.move(640, 400);
      await page.evaluate('__meterStart()');
      for (let rep = 0; rep < 4; rep++) {
        await page.mouse.move(start.x, start.y);
        await page.mouse.down();
        for (let i = 0; i < 25; i++) { await page.mouse.move(start.x + i * 24, start.y + i * 8); await page.waitForTimeout(16); }
        await page.mouse.up();
        await page.mouse.move(start.x, start.y);
      }
      pans[mode] = await page.evaluate('__meterStop()');
      if ((await camera(page)) === camBefore) {
        throw new Error(`${lib} n=${n} ${mode}: the pan gesture did not move the camera (${camBefore}) — this is not a pan measurement`);
      }
    }

    // Re-frame before the drag. The pan above left the camera 2400px away, which
    // puts node n0 off-screen — the first version of this harness went straight
    // into the drag from there, pressed the mouse on empty space, and reported
    // the resulting do-nothing frames as a drag result. Not measured.
    await frame(page, 'fit');

    // DRAG one node for ~2.5s. Both scenes place n0 at world (0,0); each library
    // is asked where IT thinks that node is on screen, so the press lands on the
    // node itself rather than on whatever happens to sit at a fixed coordinate.
    const nodeBox = await page.evaluate(`(() => {
      if (window.__api) {
        const api = window.__api, node = api.getModel().getNode('n0');
        const host = api.container.getBoundingClientRect();
        const c = api.viewport.worldToClient(node.position.x + node.size.width / 2, node.position.y + node.size.height / 2, host);
        return { x: c.x, y: c.y, id: 'n0' };
      }
      const el = document.querySelector('.react-flow__node[data-id="n0"]') || document.querySelector('.react-flow__node');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, id: el.getAttribute('data-id') };
    })()`);
    /**
     * Where the dragged node sits — read BY ID, never "the first node element".
     * react-flow re-orders node DOM while dragging (the dragged one is lifted),
     * so a positional query can hand back a different, motionless node and make
     * a working drag look broken.
     */
    const nodePos = (id) => page.evaluate(`(() => {
      if (window.__api) { const p = window.__api.getModel().getNode(${JSON.stringify(id)}).position; return p.x + ',' + p.y; }
      const el = document.querySelector('.react-flow__node[data-id=' + JSON.stringify(${JSON.stringify(id)}) + ']');
      return el ? el.style.transform : 'none';
    })()`);

    let drag = null;
    if (nodeBox) {
      const posBefore = await nodePos(nodeBox.id);
      await page.evaluate('__meterStart()');
      await page.mouse.move(nodeBox.x, nodeBox.y);
      await page.mouse.down();
      for (let i = 0; i < 60; i++) { await page.mouse.move(nodeBox.x + i * 4, nodeBox.y + Math.sin(i / 6) * 40); await page.waitForTimeout(16); }
      await page.mouse.up();
      drag = await page.evaluate('__meterStop()');
      // Same discipline as the pan: a "drag" that moved nothing is not a result.
      if ((await nodePos(nodeBox.id)) === posBefore) {
        throw new Error(`${lib} n=${n}: the drag gesture did not move the node (${posBefore}) — this is not a drag measurement`);
      }
    }
    results.push({ lib, n, mountMs: +mountMs.toFixed(0), panFit: pans.fit, panSlice: pans.slice, drag });
    await page.close();
  }
}
await browser.close(); server.close();

// -- the fairness gate -------------------------------------------------------
// Both libraries must have had the SAME world rect on screen for every scenario,
// or the numbers below are not a comparison. Nothing is reported until this
// passes: a framing mismatch is the single easiest way to publish a flattering
// benchmark by accident, and it is exactly what the first version of this file
// did.
for (const n of [500, 2000]) {
  for (const mode of ['fit', 'slice']) {
    const a = framings[`grafloria/${n}/${mode}`];
    const b = framings[`reactflow/${n}/${mode}`];
    for (const k of ['x', 'y', 'width', 'height']) {
      if (Math.abs(a[k] - b[k]) > Math.max(1, Math.abs(a[k]) * 0.01)) {
        throw new Error(
          `n=${n} ${mode}: the two libraries were not framing the same thing — ` +
          `grafloria ${JSON.stringify(a)} vs reactflow ${JSON.stringify(b)}`
        );
      }
    }
  }
}

// -- report ------------------------------------------------------------------
const meta = {
  date: new Date().toISOString().slice(0, 10),
  machine: `${os.type()} ${os.arch()}, ${os.cpus()[0]?.model ?? ''}, ${Math.round(os.totalmem() / 2 ** 30)}GB`,
  grafloriaBuild: useSource ? 'working-tree' : 'published',
};
writeFileSync(join(HERE, 'results.json'), JSON.stringify({ meta, results, framings }, null, 2));
console.log(`\n${meta.machine} — ${meta.date}`);
const cell = (m) => (m ? `${String(m.avgMs).padStart(5)} /${String(m.p95Ms).padStart(5)}` : '     n/a    ');
console.log('lib        | nodes | mount ms | pan fit avg/p95 | pan slice avg/p95 | drag avg/p95');
for (const r of results) {
  console.log(
    `${r.lib.padEnd(10)} | ${String(r.n).padStart(5)} | ${String(r.mountMs).padStart(8)} | ` +
    `${cell(r.panFit)}   | ${cell(r.panSlice)}     | ${cell(r.drag)}`
  );
}
