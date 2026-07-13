// Wave 8 — Card 5: is a canvas far-zoom tier worth anything on THIS engine?
//
//   node libs/renderer/e2e/tier-run.mjs
//
// Splits a zoomed-out frame into producer (build the VNode tree — identical in both
// tiers) and consumer (turn it into pixels — the ONLY thing a tier handoff changes), and
// times both in a real browser.
//
// Reports, and gates nothing. Its job is to keep the claim honest in both directions: if
// the consumer is the bottleneck, the handoff is worth building; if it is not, no amount
// of good canvas engineering will make it matter, and this table is what says so.

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
  entryPoints: [join(here, 'tier-harness.ts')],
  bundle: true,
  format: 'iife',
  globalName: 'GrafloriaTierNS',
  outfile: join(here, 'tier-bundle.js'),
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
  join(here, 'tier-index.html'),
  `<!doctype html><meta charset="utf-8"><title>grafloria tier</title><div id="stage"></div><script src="./tier-bundle.js"></script>`
);

// TWO families, and the pair is the whole point.
//
//   linked      the real scene. Shows what a zoomed-out frame ACTUALLY costs, and where.
//   nodes-only  the isolation. Same VNode counts, no router — so the two CONSUMERS can be
//               compared without a 30-second producer drowning the signal.
const scenes = [
  { nodes: 1000, zoom: 0.25, withLinks: true },
  { nodes: 2000, zoom: 0.25, withLinks: true },
  { nodes: 1000, zoom: 0.25, withLinks: false },
  { nodes: 5000, zoom: 0.25, withLinks: false },
  { nodes: 10000, zoom: 0.25, withLinks: false },
];

const browser = await chromium.launch();
const pageErrors = [];
const samples = [];

for (const { nodes, zoom, withLinks } of scenes) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', (e) => pageErrors.push(`${nodes}@${zoom}: ${e}`));
  await page.goto('file://' + join(here, 'tier-index.html'));
  samples.push(
    await page.evaluate(
      ([n, z, l]) => window.GrafloriaTier.runTierScene(document.getElementById('stage'), n, z, l),
      [nodes, zoom, withLinks]
    )
  );
  await page.close();
}

writeFileSync(join(outDir, 'tier-samples.json'), JSON.stringify(samples, null, 2));

const pad = (v, n) => String(v).padStart(n);
const ms = (v) => v.toFixed(1) + 'ms';

const row = (s) =>
  String(s.nodes).padEnd(7) +
  pad(s.vnodes, 8) +
  pad(ms(s.producerMs), 12) +
  pad(ms(s.svgMountMs), 11) +
  pad(ms(s.svgRepatchMs), 13) +
  pad(ms(s.canvasPaintMs), 14) +
  pad((s.consumerShareOfFrame * 100).toFixed(1) + '%', 10);

const header =
  'nodes'.padEnd(7) +
  pad('vnodes', 8) +
  pad('PRODUCER', 12) +
  pad('svg mount', 11) +
  pad('svg repatch', 13) +
  pad('canvas paint', 14) +
  pad('consumer', 10);

console.log('');
console.log('1. THE REAL SCENE (with links) — where a zoomed-out frame actually goes');
console.log('');
console.log(header);
console.log('─'.repeat(75));
for (const s of samples.filter((s) => s.withLinks)) console.log(row(s));
console.log('');
console.log('   "consumer" = the share of an SVG frame a tier handoff can address AT ALL.');
console.log('   The rest is the PRODUCER — which canvas mode pays too, identically.');

console.log('');
console.log('2. THE ISOLATION (no links, so the router cannot drown the signal)');
console.log('   The one question Card 5 rests on: at N VNodes, which CONSUMER is faster?');
console.log('');
console.log(header);
console.log('─'.repeat(75));
for (const s of samples.filter((s) => !s.withLinks)) console.log(row(s));
console.log('');
for (const s of samples.filter((s) => !s.withLinks)) {
  const verdict =
    s.canvasPaintMs < s.svgRepatchMs
      ? `canvas WINS by ${(s.svgRepatchMs / Math.max(s.canvasPaintMs, 0.01)).toFixed(1)}x`
      : `SVG wins by ${(s.canvasPaintMs / Math.max(s.svgRepatchMs, 0.01)).toFixed(1)}x`;
  console.log(`   ${pad(s.vnodes, 6)} vnodes: ${verdict}`);
}
console.log('');

for (const e of pageErrors) console.log(`PAGE ERROR: ${e}`);
console.log('page errors:', pageErrors.length);

await browser.close();
process.exit(pageErrors.length ? 1 : 0);
