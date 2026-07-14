// Wave 8 (Performance & scale) — the BENCHMARK runner.
//
// Drives the real engine + real SVG renderer + real VNode patcher against real DOM
// in headless Chromium at 1k / 5k / 10k nodes, and reports what a user actually
// feels: first paint, steady pan, zoom-out, a one-node drag, and an idle frame.
//
// TWO MODES:
//   node libs/renderer/e2e/perf-run.mjs              gate against BUDGETS (CI)
//   node libs/renderer/e2e/perf-run.mjs --baseline   print the table, gate nothing
//
// The budgets are deliberately generous — they are a REGRESSION FENCE, not a
// target. A CI gate that fails on a noisy shared runner gets disabled within a
// week, and a disabled gate protects nothing.

import { build } from 'esbuild';
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..', '..');
const outDir = join(here, 'out');
mkdirSync(outDir, { recursive: true });

await build({
  entryPoints: [join(here, 'perf-harness.ts')],
  bundle: true,
  format: 'iife',
  globalName: 'GrafloriaPerf',
  outfile: join(here, 'perf-bundle.js'),
  platform: 'browser',
  target: 'es2020',
  alias: {
    '@grafloria/engine': join(repo, 'libs/engine/src/index.ts'),
    '@grafloria/renderer': join(repo, 'libs/renderer/src/index.ts'),
    'fs/promises': join(here, 'node-stubs.ts'),
    path: join(here, 'node-stubs.ts'),
  },
  tsconfigRaw: {
    compilerOptions: {
      experimentalDecorators: true,
      emitDecoratorMetadata: false,
      useDefineForClassFields: false,
    },
  },
  logLevel: 'warning',
});

const argv = process.argv.slice(2);
const baselineOnly = argv.includes('--baseline');
const counts = [1000, 5000, 10000];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));

// A real file:// origin, NOT setContent(): an about:blank document has an opaque
// origin, and the renderer's AnimationService touches localStorage — which throws
// SecurityError there. (Worth knowing: any consumer embedding us in a sandboxed
// iframe would hit the same wall.)
await page.goto('file://' + join(here, 'perf-index.html'));

const samples = await page.evaluate((counts) => {
  const stage = document.getElementById('stage');
  return window.GrafloriaPerf.runPerfSuite(stage, counts);
}, counts);

writeFileSync(join(outDir, 'perf-samples.json'), JSON.stringify(samples, null, 2));
writeFileSync(join(outDir, 'perf-page-errors.json'), JSON.stringify(pageErrors, null, 2));

// ---- report -----------------------------------------------------------------
const byScenario = {};
for (const s of samples) (byScenario[s.scenario] ??= []).push(s);

const pad = (v, n) => String(v).padStart(n);
console.log('');
console.log('scenario              ' + counts.map((c) => pad(c + ' nodes', 13)).join(''));
console.log('─'.repeat(22 + 13 * counts.length));
for (const [scenario, rows] of Object.entries(byScenario)) {
  const cells = counts.map((c) => {
    const r = rows.find((x) => x.nodes === c);
    return pad(r ? r.ms.toFixed(1) + 'ms' : '—', 13);
  });
  console.log(scenario.padEnd(22) + cells.join(''));
}
console.log('');

// WHY the zoom-out number is what it is. A fast frame proves nothing on its own —
// it could be a cheap tier, or it could be the governor having quietly rescued a
// scene that blew the budget 4x. Printing the verdict is the difference between
// measuring the governor and merely believing in it.
const zoom = (byScenario['zoom-out-frame'] ?? []).filter((s) => s.tier);
if (zoom.length) {
  console.log('zoom-out @0.25 — the zoom asks for `sketch` (which routes); who could afford it:');
  for (const s of zoom) {
    const verdict =
      s.tier === 'sketch'
        ? 'afforded it — routes kept'
        : `governor stepped it down to '${s.tier}' (${s.governor})`;
    console.log(`  ${String(s.nodes).padStart(6)} nodes  →  ${verdict}`);
  }
  console.log('');
}

// ---- budgets ----------------------------------------------------------------
//
// A frame budget of 16.7ms is 60fps. These fences sit well above the numbers we
// intend to hit, because their job is to catch a REGRESSION (a 2x blow-up), not to
// police the last millisecond on a shared CI box.
const BUDGETS = [
  { scenario: 'first-paint',         nodes: 1000,  maxMs: 400 },
  { scenario: 'first-paint',         nodes: 10000, maxMs: 4000 },
  { scenario: 'pan-frame',           nodes: 1000,  maxMs: 60 },
  { scenario: 'pan-frame',           nodes: 10000, maxMs: 600 },
  { scenario: 'one-node-drag-frame', nodes: 1000,  maxMs: 60 },
  { scenario: 'one-node-drag-frame', nodes: 10000, maxMs: 600 },
  { scenario: 'idle-frame',          nodes: 10000, maxMs: 600 },
  // wave9/comments (Card 6). 200 anchored threads on the scene must not cost the scene
  // anything when nothing is happening. An overlay that keeps itself fresh by invalidating
  // every frame would silently disarm the frame gate — a 0.0ms idle frame would become a
  // whole-scene rebuild, and no functional test anywhere would notice. This fence does.
  { scenario: 'idle-frame+200-comments', nodes: 10000, maxMs: 1 },
  { scenario: 'pan-frame+200-comments',  nodes: 10000, maxMs: 600 },
  // wave9/sync (Card 5). An idle diagram with FOUR remote cursors moving at 60Hz over it
  // must cost the DIAGRAM exactly what an idle diagram with nobody on it costs. The
  // presence overlay is a separate DOM layer that never enters the VNode tree, so the
  // frame gate stays shut.
  //
  // BUDGET TIGHTENED 600ms -> 1ms AT MERGE, and the original number would have made this
  // fence useless: presence invalidating every frame costs a whole-scene rebuild, which is
  // ~15ms at 10k — comfortably INSIDE a 600ms budget. The fence would have passed while
  // the exact regression it exists to catch was happening. A gate that cannot fail is not
  // a gate. (wave9/comments got this right independently, with the same 1ms reasoning.)
  { scenario: 'idle-frame-presence', nodes: 10000, maxMs: 1 },
];

const failures = [];
if (!baselineOnly) {
  for (const b of BUDGETS) {
    const s = samples.find((x) => x.scenario === b.scenario && x.nodes === b.nodes);
    if (!s) continue;
    if (s.ms > b.maxMs) {
      failures.push(`${b.scenario} @ ${b.nodes}: ${s.ms.toFixed(1)}ms > budget ${b.maxMs}ms`);
    }
  }
}

for (const f of failures) console.log(`BUDGET EXCEEDED: ${f}`);
for (const e of pageErrors) console.log(`PAGE ERROR: ${e}`);

console.log(`perf: ${samples.length} samples, ${failures.length} budget failures`);
console.log('page errors:', pageErrors.length);

await browser.close();
process.exit(failures.length || pageErrors.length ? 1 : 0);
