// Wave 8 — Card 3: the lazy-mount benchmark + its correctness gate.
//
// Drives the real engine, the real SVG renderer and the real VNode patcher against real
// DOM in headless Chromium, at the same 1k/5k/10k scenes the baseline was taken on.
//
// Prints the before/after, and FAILS if the progressively-mounted DOM is not identical
// to the blocking one. A fast first paint that loses entities is not a win.
//
//   node libs/renderer/e2e/lazy-run.mjs

import { build } from 'esbuild';
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..', '..');
const outDir = join(here, 'out');
mkdirSync(outDir, { recursive: true });

await build({
  entryPoints: [join(here, 'lazy-harness.ts')],
  bundle: true,
  format: 'iife',
  globalName: 'GrafloriaLazyNS',
  outfile: join(here, 'lazy-bundle.js'),
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

writeFileSync(
  join(here, 'lazy-index.html'),
  `<!doctype html><meta charset="utf-8"><title>grafloria lazy mount</title><div id="stage"></div><script src="./lazy-bundle.js"></script>`
);

const counts = [1000, 5000, 10000];

const browser = await chromium.launch();
const pageErrors = [];

/**
 * One scene, one mode, in a page that has rendered nothing else.
 *
 * The routing engine and the JIT both warm up, so measuring "before" and "after" back
 * to back in one context makes the second one look good for free. A fresh page per
 * measurement is the only version of this comparison that is worth printing.
 */
async function measure(count, mode) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', (e) => pageErrors.push(`${mode}@${count}: ${e}`));
  // A real file:// origin, not about:blank — the renderer's AnimationService touches
  // localStorage, which throws SecurityError on an opaque origin.
  await page.goto('file://' + join(here, 'lazy-index.html'));
  const result = await page.evaluate(
    ([count, mode]) => window.GrafloriaLazy.runLazyScene(document.getElementById('stage'), count, mode),
    [count, mode]
  );
  await page.close();
  return result;
}

const samples = [];
for (const count of counts) {
  const blocking = await measure(count, 'blocking');
  const progressive = await measure(count, 'progressive');
  samples.push({ count, blocking, progressive });
}

writeFileSync(join(outDir, 'lazy-samples.json'), JSON.stringify(samples, null, 2));

const pad = (v, n) => String(v).padStart(n);
const ms = (v) => v.toFixed(1) + 'ms';

console.log('');
console.log('TIME TO FIRST PAINT — "I opened the file" (fresh page per measurement)');
console.log('');
console.log(
  'nodes'.padEnd(8) +
    pad('blocking', 13) +
    pad('progressive', 13) +
    pad('speedup', 10) +
    pad('CPU work', 12) +
    pad('mount done', 13) +
    pad('worst slice', 13) +
    pad('slices', 8)
);
console.log('─'.repeat(90));
for (const { count, blocking, progressive } of samples) {
  const speedup = blocking.firstPaintMs / Math.max(progressive.firstPaintMs, 0.01);
  console.log(
    String(count).padEnd(8) +
      pad(ms(blocking.firstPaintMs), 13) +
      pad(ms(progressive.firstPaintMs), 13) +
      pad(speedup.toFixed(0) + 'x', 10) +
      pad(ms(progressive.cpuMs), 12) +
      pad(ms(progressive.completeMs), 13) +
      pad(ms(progressive.worstSliceMs), 13) +
      pad(progressive.slices, 8)
  );
}
console.log('');
console.log('CPU work = what the mount actually COSTS (sum of slices). Compare it to `blocking`:');
console.log('slicing must not do MORE work, only spread it. `mount done` is wall clock, and it');
console.log('is larger by design — each rAF yield hands ~16.7ms back to the browser to paint.');
console.log('');

// ---- the gate: nothing may be lost --------------------------------------------
//
// Compares the ENTITY-ID SETS, not the counts — "56 nodes either way" would pass a
// count check while drawing a different 56.
const failures = [];
for (const { count, blocking, progressive } of samples) {
  const want = new Set(blocking.entityIds);
  const got = new Set(progressive.entityIds);
  const missing = [...want].filter((id) => !got.has(id));
  const extra = [...got].filter((id) => !want.has(id));
  const identical = missing.length === 0 && extra.length === 0;

  if (!identical) {
    failures.push(
      `${count} nodes: mounted DOM != blocking DOM — ` +
        `missing [${missing.slice(0, 8).join(', ')}] extra [${extra.slice(0, 8).join(', ')}]`
    );
  }
  console.log(
    `parity @ ${pad(count, 5)}: ${pad(progressive.domNodes, 3)}/${blocking.domNodes} nodes, ` +
      `${pad(progressive.domLinks, 3)}/${blocking.domLinks} links — ` +
      (identical ? 'IDENTICAL entity sets' : 'MISMATCH')
  );
}
console.log('');

for (const f of failures) console.log(`PARITY FAILURE: ${f}`);
for (const e of pageErrors) console.log(`PAGE ERROR: ${e}`);
console.log(`lazy: ${samples.length} scenes, ${failures.length} parity failures`);
console.log('page errors:', pageErrors.length);

await browser.close();
process.exit(failures.length || pageErrors.length ? 1 : 0);
