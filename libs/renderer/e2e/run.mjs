// E2E harness runner for the renderer line algorithms.
// Bundles the real @grafloria/engine + @grafloria/renderer sources, drives real
// SVGRenderer diagrams in headless Chromium, and writes screenshots +
// numeric probes to e2e/out/.
//
// Usage:  node libs/renderer/e2e/run.mjs
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
  entryPoints: [join(here, 'harness.ts')],
  bundle: true,
  format: 'iife',
  outfile: join(here, 'bundle.js'),
  platform: 'browser',
  target: 'es2020',
  alias: {
    '@grafloria/engine': join(repo, 'libs/engine/src/index.ts'),
    '@grafloria/renderer': join(repo, 'libs/renderer/src/index.ts'),
    // Real interaction service (deep import so the whole component lib stays out)
    '@grafloria/interaction-handler': join(repo, 'libs/renderer-angular/renderer-angular/src/lib/services/interaction-handler.service.ts'),
    'fs/promises': join(here, 'node-stubs.ts'),
    'path': join(here, 'node-stubs.ts'),
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
const page = await browser.newPage({ viewport: { width: 1500, height: 1200 }, deviceScaleFactor: 2 });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));

await page.goto('file://' + join(here, 'index.html'));
await page.waitForFunction(() => window.__DONE__ === true, null, { timeout: 30000 });

const probes = await page.evaluate(() => window.__PROBES__);
writeFileSync(join(outDir, 'probes.json'), JSON.stringify(probes, null, 2));

for (const cell of await page.locator('.cell').all()) {
  const id = await cell.getAttribute('id');
  await cell.screenshot({ path: join(outDir, `${id}.png`) });
}
writeFileSync(join(outDir, 'page-errors.json'), JSON.stringify(pageErrors, null, 2));

const expectations = await page.evaluate(() => window.__EXPECTATIONS__ || []);
writeFileSync(join(outDir, 'expectations.json'), JSON.stringify(expectations, null, 2));
const failedExpectations = expectations.filter((e) => !e.pass);
for (const e of failedExpectations) {
  console.log(`EXPECTATION FAILED: ${e.name}${e.detail ? ` — ${e.detail}` : ''}`);
}
console.log(`expectations: ${expectations.length - failedExpectations.length}/${expectations.length} passed`);

const failures = probes.__failures || [];
console.log('scenario failures:', failures.length, failures.map((f) => f.scenario));
console.log('page errors:', pageErrors.length);
await browser.close();
process.exit(failures.length || pageErrors.length || failedExpectations.length ? 1 : 0);
