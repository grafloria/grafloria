// WCAG 2.2 AA conformance harness — wave 6, a11y card 7.
//
//   node libs/renderer/e2e/a11y-run.mjs
//
// Bundles the real @grafloria/engine + @grafloria/renderer, renders real diagrams in
// headless Chromium, and runs axe-core over the LIVE SVG. Exits non-zero on any
// violation, so an a11y regression fails CI exactly like a broken unit test.
//
// Why a browser and not jsdom: contrast, :focus-visible, forced-colors, computed
// styles and "is this actually on screen" do not exist in jsdom. An a11y harness
// running in jsdom is a harness that cannot see the failures that matter.
//
// THE CONTROL. The last cell rebuilds the precise ARIA bug this wave fixed
// (`role="group"` + `aria-selected`, which is invalid and which every node used
// to emit). We assert axe FINDS it. A harness that reports everything clean is
// worthless unless you have proved it can go red — so if the control comes back
// clean, this run FAILS.
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..', '..');
const outDir = join(here, 'out');
mkdirSync(outDir, { recursive: true });

await build({
  entryPoints: [join(here, 'a11y-harness.ts')],
  bundle: true,
  format: 'iife',
  outfile: join(here, 'a11y-bundle.js'),
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
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));

await page.goto('file://' + join(here, 'a11y-index.html'));
await page.waitForFunction(() => window.__DONE__ === true, null, { timeout: 60000 });

// Inject axe-core into the page.
await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });

// --- the real scan: WCAG 2.0/2.1/2.2 A + AA, over the rendered diagram --------
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const mainResults = await page.evaluate(async (tags) => {
  const r = await window.axe.run('#a11y-main', { runOnly: { type: 'tag', values: tags } });
  return {
    violations: r.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.map((n) => n.html).slice(0, 3),
    })),
    passes: r.passes.length,
  };
}, AXE_TAGS);

// --- the control: axe MUST still catch the bug we fixed ----------------------
const controlResults = await page.evaluate(async () => {
  const r = await window.axe.run('#a11y-control', {
    runOnly: { type: 'rule', values: ['aria-allowed-attr'] },
  });
  return r.violations.map((v) => ({ id: v.id, nodes: v.nodes.length }));
}, null);

const expectations = await page.evaluate(() => window.__EXPECTATIONS__ || []);

// The control is inverted: a clean result means the harness has gone blind.
const controlCaught = controlResults.some((v) => v.id === 'aria-allowed-attr');
expectations.push({
  name: 'card7 CONTROL: axe still catches the pre-wave-6 role=group + aria-selected bug',
  pass: controlCaught,
  detail: controlCaught
    ? 'axe flagged it — the harness has teeth'
    : 'axe reported the KNOWN-BAD markup as clean; the harness is blind and cannot be trusted',
});

expectations.push({
  name: 'card7: axe-core reports ZERO WCAG A/AA violations on the rendered diagram',
  pass: mainResults.violations.length === 0,
  detail:
    mainResults.violations.length === 0
      ? `${mainResults.passes} axe checks passed`
      : mainResults.violations
          .map((v) => `${v.id} (${v.impact}): ${v.help} → ${v.nodes.join(' ; ')}`)
          .join(' | '),
});

writeFileSync(
  join(outDir, 'a11y-axe.json'),
  JSON.stringify({ main: mainResults, control: controlResults }, null, 2)
);
writeFileSync(join(outDir, 'a11y-expectations.json'), JSON.stringify(expectations, null, 2));
writeFileSync(join(outDir, 'a11y-page-errors.json'), JSON.stringify(pageErrors, null, 2));
await page.screenshot({ path: join(outDir, 'a11y-stage.png'), fullPage: true });

const failed = expectations.filter((e) => !e.pass);
for (const e of failed) {
  console.log(`EXPECTATION FAILED: ${e.name}${e.detail ? ` — ${e.detail}` : ''}`);
}
for (const err of pageErrors) console.log(`PAGE ERROR: ${err}`);

for (const v of mainResults.violations) {
  console.log(`AXE VIOLATION [${v.impact}] ${v.id}: ${v.help}`);
  for (const n of v.nodes) console.log(`    ${n}`);
}

console.log(`a11y expectations: ${expectations.length - failed.length}/${expectations.length} passed`);
console.log(`axe violations: ${mainResults.violations.length} (axe passes: ${mainResults.passes})`);
console.log('page errors:', pageErrors.length);

await browser.close();
process.exit(failed.length || pageErrors.length ? 1 : 0);
