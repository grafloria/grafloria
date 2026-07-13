// E2E runner for the CANVAS backend (Wave 4).
//
// Bundles the real @grafloria/engine + @grafloria/renderer sources and drives the real
// CanvasRenderer in headless Chromium at deviceScaleFactor 2 — a real 2D context,
// real getImageData, real devicePixelRatio. This is what proves the colour-keyed
// picking and the dirty-region redraw actually work; the jest suites run against
// a recording context and structurally cannot.
//
// Deliberately SEPARATE from run.mjs (the SVG line-algorithm suite): that suite's
// 107 expectations are a fixed contract and this must not perturb them.
//
// Usage:  node libs/renderer/e2e/canvas-run.mjs

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
  entryPoints: [join(here, 'canvas-harness.ts')],
  bundle: true,
  format: 'iife',
  outfile: join(here, 'canvas-bundle.js'),
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

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1000, height: 800 },
  deviceScaleFactor: 2, // exercise the high-DPI path for real
});

const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));

await page.goto('file://' + join(here, 'canvas-index.html'));
await page.waitForFunction(() => window.__DONE__ === true, null, { timeout: 60000 });

const expectations = await page.evaluate(() => window.__EXPECTATIONS__ || []);
writeFileSync(join(outDir, 'canvas-expectations.json'), JSON.stringify(expectations, null, 2));
writeFileSync(join(outDir, 'canvas-page-errors.json'), JSON.stringify(pageErrors, null, 2));

await page.screenshot({ path: join(outDir, 'canvas-stage.png'), fullPage: true });

const failed = expectations.filter((e) => !e.pass);
for (const e of failed) console.log(`EXPECTATION FAILED: ${e.name}${e.detail ? ` — ${e.detail}` : ''}`);
for (const err of pageErrors) console.log(`PAGE ERROR: ${err}`);

console.log(`canvas expectations: ${expectations.length - failed.length}/${expectations.length} passed`);
console.log('page errors:', pageErrors.length);

await browser.close();
process.exit(failed.length || pageErrors.length ? 1 : 0);
