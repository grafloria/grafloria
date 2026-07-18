/**
 * Layout benchmark gate — every engine, every pathological graph family, hard
 * time caps, geometry sanity. Through the REAL bundle in a REAL browser.
 *
 * Why it exists: stress-testing the layouts found auto hanging at 300 nodes,
 * force collapsing every graph into a horizontal wedge, dagre exploding on a
 * 2000-rank chain, and layered exploding on one sparse-DAG family — all while
 * every unit suite was green. Only a matrix of real runs catches this class.
 *
 * Layout is SYNCHRONOUS on the page's main thread: a hung engine cannot be
 * Promise.race'd from inside the page. Each cell therefore runs in its own
 * browser, and the node side closes the whole browser on timeout.
 *
 * Run: node demos/e2e/layout-bench-run.mjs           (needs the server on :4321)
 *      node demos/e2e/layout-bench-run.mjs --quick   (halves the matrix for local runs)
 */
import { chromium } from 'playwright';

const QUICK = process.argv.includes('--quick');

// The CONTRACT: engine × graph family × size → completes under capMs, spreads
// in 2D where required. Caps are generous (CI-safe) but fail the pathologies
// this gate was born from (>25s hangs). aspect: bbox w/h must land inside
// [1/limit, limit] — the force-wedge detector.
const MATRIX = [
  // engine    shape    n     capMs   aspect-limit
  ['layered', 'mesh',   30,   4000,   0],
  ['layered', 'dag',    2000, 6000,   0],   // the sparse DAG that killed it
  ['layered', 'chain',  2000, 6000,   0],
  ['elk',     'mesh',   30,   6000,   0],
  ['elk',     'tree',   2000, 8000,   0],
  ['dagre',   'chain',  2000, 6000,   0],   // the 2000-rank pathology
  ['dagre',   'mesh',   30,   8000,   0],
  ['dagre',   'tree',   2000, 6000,   0],
  ['force',   'mesh',   15,   4000,   3],   // wedge detector: must spread 2D
  ['force',   'tree',   300,  4000,   3],   // (broken force shows aspect ~4.5-5)
  ['auto',    'tree',   300,  5000,   0],   // was 16s
  ['auto',    'mesh',   30,   8000,   0],   // was a >22s hang
  ['tree',    'tree',   2000, 4000,   0],
  // cheap robustness rows
  ['layered', 'star',   500,  4000,   0],
  ['force',   'components', 200, 4000, 6],
  ['auto',    'components', 200, 5000, 0],
];

const rows = QUICK ? MATRIX.filter((_, i) => i % 2 === 0) : MATRIX;

async function cell([engine, shape, n, capMs, aspectLimit]) {
  const b = await chromium.launch();
  const kill = setTimeout(() => b.close().catch(() => {}), capMs + 8000); // absolute backstop
  try {
    const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
    await p.goto(`http://127.0.0.1:4321/e2e/layout-bench.html?shape=${shape}&n=${n}`);
    await p.waitForFunction(() => window.__ready === true, { timeout: 20000 });
    const run = p.evaluate(async (name) => window.__bench.run(name), engine);
    const timeout = new Promise((resolve) => setTimeout(() => resolve({ timedOut: true }), capMs));
    const r = await Promise.race([run, timeout]);
    if (r.timedOut) return { ok: false, detail: `TIMEOUT >${capMs}ms (engine hung — browser killed)` };
    const problems = [];
    if (r.ms > capMs) problems.push(`${r.ms}ms > cap ${capMs}ms`);
    if (r.distinct < r.nodes * 0.9) problems.push(`nodes stack: ${r.distinct}/${r.nodes} distinct positions`);
    if (aspectLimit > 0) {
      const aspect = r.h > 0 ? r.w / r.h : Infinity;
      if (!(aspect >= 1 / aspectLimit && aspect <= aspectLimit))
        problems.push(`wedge: bbox ${r.w}x${r.h} (aspect ${aspect.toFixed(1)}, limit ${aspectLimit})`);
    }
    return { ok: problems.length === 0, detail: `${r.ms}ms bbox ${r.w}x${r.h}${problems.length ? '  ← ' + problems.join('; ') : ''}` };
  } catch (e) {
    return { ok: false, detail: 'ERROR ' + String(e.message || e).slice(0, 120) };
  } finally {
    clearTimeout(kill);
    await b.close().catch(() => {});
  }
}

console.log(`--- layout benchmark gate (${rows.length} cells${QUICK ? ', quick' : ''}) ---`);
let failed = 0;
for (const row of rows) {
  const [engine, shape, n] = row;
  const r = await cell(row);
  if (!r.ok) failed++;
  console.log(`  ${r.ok ? 'OK  ' : 'FAIL'} ${engine.padEnd(8)} ${shape.padEnd(11)} n=${String(n).padEnd(5)} ${r.detail}`);
}
console.log(failed === 0
  ? `\nlayout bench: ${rows.length}/${rows.length} cells pass`
  : `\nlayout bench: ${failed} FAILED\nAN ENGINE THAT HANGS OR COLLAPSES AT SCALE IS A BROKEN FEATURE. This is the gate.`);
process.exit(failed === 0 ? 0 : 1);
