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
