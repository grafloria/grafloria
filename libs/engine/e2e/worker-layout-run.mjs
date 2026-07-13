// Wave 7 (Auto-layout) — Card 3: live worker harness runner.
//
// Bundles the real @grafloria/engine + the real layout worker entry, then drives an
// ACTUAL `new Worker()` in headless Chromium. Unit tests use a fake port; this
// proves the thing itself.
//
// Usage:  node libs/engine/e2e/worker-layout-run.mjs

import { build } from 'esbuild';
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..', '..');

const esbuildOptions = {
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  alias: { '@grafloria/engine': join(repo, 'libs/engine/src/index.ts') },
  logLevel: 'warning',
};

// The worker script: layout.worker.ts is the real entry — it calls serveLayout(self).
await build({
  ...esbuildOptions,
  entryPoints: [join(repo, 'libs/engine/src/layout/layout.worker.ts')],
  outfile: join(here, 'layout.worker.bundle.js'),
});

await build({
  ...esbuildOptions,
  entryPoints: [join(here, 'worker-layout-harness.ts')],
  outfile: join(here, 'worker-layout.bundle.js'),
});

const workerSource = readFileSync(join(here, 'layout.worker.bundle.js'), 'utf8');
const harnessSource = readFileSync(join(here, 'worker-layout.bundle.js'), 'utf8');

const browser = await chromium.launch();
const page = await browser.newPage();

const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') pageErrors.push(m.text());
});

await page.goto('about:blank');
await page.evaluate((src) => {
  window.__LAYOUT_WORKER_SOURCE__ = src;
}, workerSource);
await page.addScriptTag({ content: harnessSource });

const results = await page.evaluate(() => window.__runWorkerLayout());

let passed = 0;
for (const r of results) {
  if (r.pass) passed++;
  const mark = r.pass ? 'ok  ' : 'FAIL';
  console.log(`${mark} ${r.name}${r.detail ? `  — ${r.detail}` : ''}`);
}

console.log(`\nlive worker expectations: ${passed}/${results.length} passed`);
console.log(`page errors: ${pageErrors.length}`);
for (const e of pageErrors) console.log(`  ${e}`);

await browser.close();

if (passed !== results.length || pageErrors.length > 0) process.exit(1);
