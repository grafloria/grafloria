// PACKAGING GATE — does the package a CONSUMER installs still work after their
// bundler has finished with it?
//
// This exists because of a bug no other gate in this repo could see. The renderer
// registers its notation shapes with a top-level call in src/index.ts, and the
// package declared `"sideEffects": false`, which tells every bundler that
// dropping such a call is safe. It is not. esbuild, rollup/Vite and webpack all
// removed it in a production build, and 13 shape types silently degraded to a
// plain <rect> in the consumer's app — with no error, and with every unit test
// and the whole demo gallery still green.
//
// They stayed green for a STRUCTURAL reason worth stating: the unit tests import
// TypeScript source, and demos/build.mjs bundles element's SOURCE entry. Neither
// path goes anywhere near the packed tarball, so neither can observe a
// package.json field that only applies to the published artifact. A gate that
// tests the source can never catch a packaging bug. This one packs, installs and
// bundles for real.
//
//   node demos/e2e/packaging-run.mjs
//
// Runs in ~1-2 minutes: it builds each package the way the release does, packs
// it, installs the tarballs into a throwaway project, then bundles an entry with
// esbuild in production mode and checks the behaviour survived.

import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, cpSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const work = mkdtempSync(join(tmpdir(), 'grafloria-packaging-'));
let failures = 0;

const run = (cmd, cwd) =>
  execSync(cmd, { cwd, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });

function check(name, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : `  — expected ${expected}, got ${actual}`}`);
}

try {
  // -- build + pack every package a consumer would install ---------------------
  console.log('packaging: building and packing…');
  const tarballs = [];
  for (const pkg of ['engine', 'renderer']) {
    const src = join(REPO, 'libs', pkg);
    const staged = join(work, 'staged', pkg);
    mkdirSync(staged, { recursive: true });
    // Build the release output into the staging dir, exactly as publishing does:
    // tsc with the release config, then the extension fixer that makes the emitted
    // relative specifiers valid pure-Node ESM.
    run(`npx tsc -p tsconfig.release.json --outDir ${staged} --rootDir . || true`, src);
    run(`node ${join(REPO, 'tools', 'fix-esm-extensions.mjs')} ${staged}`, REPO);
    cpSync(join(src, 'package.json'), join(staged, 'package.json'));
    const out = run('npm pack --pack-destination ' + work, staged);
    tarballs.push(join(work, out.trim().split('\n').pop()));
  }

  // -- a throwaway consumer, installing those tarballs ------------------------
  const consumer = join(work, 'consumer');
  mkdirSync(consumer, { recursive: true });
  writeFileSync(
    join(consumer, 'package.json'),
    JSON.stringify({ name: 'consumer', version: '1.0.0', type: 'module', private: true }, null, 2)
  );
  run(`npm i --no-audit --no-fund ${tarballs.map((t) => JSON.stringify(t)).join(' ')}`, consumer);

  // -- 1. the shape registry survives bundling --------------------------------
  // Assert on the PICTURE, not on a registry flag: a registry lookup could be
  // satisfied by a fallback, whereas the path data is the shape or it is not.
  writeFileSync(
    join(consumer, 'entry.mjs'),
    `import { renderToStaticSVG, hasShape } from '@grafloria/renderer';
const NOTATION = ['delay', 'display', 'summing-junction', 'sync-bar', 'final-node'];
const missing = NOTATION.filter((s) => !hasShape(s));
const out = renderToStaticSVG(
  { nodes: [{ id: 'a', position: { x: 0, y: 0 }, size: { width: 140, height: 60 }, label: 'D', shape: { type: 'delay' } }], edges: [] },
  { width: 300, height: 220 }
);
const html = typeof out === 'string' ? out : out.html;
// The Delay silhouette is a <path> with the ISO 5807 half-round cap. A <rect>
// here means the shape was dropped and the node fell back to a plain box.
const drew = /<path[^>]*class="diagram-node"/.test(html) ? 'path' : /<rect[^>]*class="diagram-node"/.test(html) ? 'rect' : 'none';
console.log(JSON.stringify({ missing, drew }));
`
  );

  console.log('\npackaging: raw Node ESM (no bundler)');
  const raw = JSON.parse(run('node entry.mjs', consumer).trim());
  check('every notation shape registered', raw.missing.length, 0);
  check('delay draws its silhouette', raw.drew, 'path');

  console.log('\npackaging: esbuild, production settings (respects sideEffects)');
  run(
    'npx esbuild entry.mjs --bundle --format=esm --platform=node --minify --outfile=bundled.mjs',
    consumer
  );
  const bundled = JSON.parse(run('node bundled.mjs', consumer).trim());
  check('every notation shape survives bundling', bundled.missing.length, 0);
  check('delay still draws its silhouette', bundled.drew, 'path');

  // -- 2. the sideEffects/top-level-call invariant, for every package ---------
  // The bug above is a CLASS: any package whose entry has a top-level statement
  // executed for its effect must not claim `sideEffects: false`. Check the rule
  // rather than the one instance, so the next registration cannot ship broken.
  console.log('\npackaging: sideEffects honesty across packages');
  for (const pkg of ['engine', 'renderer', 'element', 'react', 'vue']) {
    const dir = join(REPO, 'libs', pkg);
    let pkgJson, entry;
    try {
      pkgJson = JSON.parse(run(`cat package.json`, dir));
      entry = run(`cat src/index.ts`, dir);
    } catch {
      continue;
    }
    // A bare call statement at column 0 — `foo();` — is a side effect by
    // definition: its value is discarded, so it is there for what it DOES.
    const hasTopLevelCall = /^[A-Za-z_$][\w$.]*\([^)]*\);\s*$/m.test(entry);
    const claimsNone = pkgJson.sideEffects === false;
    check(
      `${pkg}: ${hasTopLevelCall ? 'has a top-level call, so must not claim sideEffects:false' : 'no top-level call'}`,
      hasTopLevelCall && claimsNone,
      false
    );
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

console.log('');
if (failures > 0) {
  console.error(`packaging: ${failures} check(s) FAILED — the published package is broken for bundler users`);
  process.exit(1);
}
console.log('packaging: all checks pass — the packed tarballs survive a production bundle');
