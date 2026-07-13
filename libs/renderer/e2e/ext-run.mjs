// E2E runner for the WAVE-6 EXTENSION LAYER (Cards 0/2/5/6/7).
//
// Bundles the real @grafloria/engine + @grafloria/renderer and drives Background, MiniMap,
// Controls, portals and the ExtensionHost in headless Chromium — real layout, real
// getBoundingClientRect, real pointer events, real rendered <path> DOM. These are
// the assertions jsdom structurally cannot make (the minimap's click→pan depends on
// a real letterboxed SVG viewBox inversion).
//
// Deliberately SEPARATE from run.mjs (185 fixed line-algorithm expectations) and
// canvas-run.mjs (27): those are fixed contracts and this must not perturb them.
//
// Usage:  node libs/renderer/e2e/ext-run.mjs

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
  entryPoints: [join(here, 'ext-harness.ts')],
  bundle: true,
  format: 'iife',
  outfile: join(here, 'ext-bundle.js'),
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
  viewport: { width: 1100, height: 900 },
});

const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));

await page.goto('file://' + join(here, 'ext-index.html'));
await page.waitForFunction(() => window.__DONE__ === true, null, { timeout: 60000 });

const expectations = await page.evaluate(() => window.__EXPECTATIONS__ || []);
writeFileSync(join(outDir, 'ext-expectations.json'), JSON.stringify(expectations, null, 2));
writeFileSync(join(outDir, 'ext-page-errors.json'), JSON.stringify(pageErrors, null, 2));

await page.screenshot({ path: join(outDir, 'ext-stage.png'), fullPage: true });

const failed = expectations.filter((e) => !e.pass);
for (const e of failed) console.log(`EXPECTATION FAILED: ${e.name}${e.detail ? ` — ${e.detail}` : ''}`);
for (const err of pageErrors) console.log(`PAGE ERROR: ${err}`);

console.log(`ext expectations: ${expectations.length - failed.length}/${expectations.length} passed`);
console.log('page errors:', pageErrors.length);

await browser.close();
process.exit(failed.length || pageErrors.length ? 1 : 0);
