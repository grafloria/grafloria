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
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const work = mkdtempSync(join(tmpdir(), 'grafloria-packaging-'));
let failures = 0;

/**
 * Run a command, and if it fails SAY WHY.
 *
 * execSync's own error message is just the command line and an exit code; the
 * actual cause is in the child's stderr, which it captures and then buries. A
 * gate whose CI failure reads "Process completed with exit code 1" costs an
 * entire round-trip to diagnose — this one prints the output it already has.
 */
const run = (cmd, cwd) => {
  try {
    return execSync(cmd, { cwd, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
  } catch (error) {
    console.error(`\npackaging: command FAILED in ${cwd}\n  $ ${cmd}`);
    const tail = (label, text) => {
      const t = (text ?? '').toString().trim();
      if (t) console.error(`  --- ${label} ---\n${t.split('\n').slice(-25).map((l) => '  ' + l).join('\n')}`);
    };
    tail('stdout', error.stdout);
    tail('stderr', error.stderr);
    throw error;
  }
};

function check(name, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : `  — expected ${expected}, got ${actual}`}`);
}

try {
  // -- build + pack every package a consumer would install ---------------------
  //
  // IN PLACE, and ENGINE FIRST, because that is what publishing actually does and
  // the order is load-bearing: `libs/renderer/tsconfig.release.json` maps
  // `@grafloria/engine` to `../engine/src/index.d.ts` — a file that only exists
  // once the engine has been built, and one that `.gitignore` excludes. Build
  // renderer into a staging dir against a clean checkout and that mapping
  // resolves to nothing, the emit is quietly wrong, and the tarball you test is
  // not the tarball you ship. (This gate did exactly that and passed on a
  // developer machine — where a stale `index.d.ts` from an earlier release was
  // still lying around — while failing on CI.)
  console.log('packaging: building and packing…');
  const PACKAGES = ['engine', 'renderer'];

  // ALL the compiling first, THEN all the extension-fixing, THEN all the packing.
  // The three passes must not interleave, and this is not tidiness — it is the
  // only order that produces a correct package.
  //
  // The renderer's release build pulls engine `.ts` sources into its program
  // (that is what its TS6059 errors are) and RE-EMITS engine's `.js` alongside
  // its own — without extensions, undoing the fixer that had already run over
  // engine. Build-fix-pack per package therefore packs a correct engine and then
  // silently corrupts it on the next iteration, and anything that inspects the
  // working tree afterwards is looking at the corrupted version. That is exactly
  // how `@grafloria/engine@0.3.4` shipped with 668 unresolvable specifiers: the
  // gate packed engine before the clobber and passed, and `npm publish` ran after
  // it and shipped the clobber.
  for (const pkg of PACKAGES) {
    const src = join(REPO, 'libs', pkg);
    // tsc's EXIT CODE is not the verdict here, and deliberately so: the release
    // configs set `noEmitOnError: false`, and the renderer's build reports TS6059
    // against engine sources while still emitting a perfectly good package. That
    // is how every release has been cut. So the build is allowed to complain —
    // what it is not allowed to do is produce output that fails the end-to-end
    // checks below, which is where the real verdict lives.
    try {
      run('npx tsc -p tsconfig.release.json', src);
    } catch {
      console.log(`  (${pkg}: tsc reported errors; continuing, since the emit is what is under test)`);
    }
  }
  for (const pkg of PACKAGES) {
    run(`node ${join(REPO, 'tools', 'fix-esm-extensions.mjs')} ${join(REPO, 'libs', pkg, 'src')}`, REPO);
  }
  const tarballs = [];
  for (const pkg of PACKAGES) {
    const out = run('npm pack --pack-destination ' + work, join(REPO, 'libs', pkg));
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
    `// Importing BOTH entries matters: Node ESM does not guess extensions, so a
// package with \`from './types'\` anywhere on its import graph is a hard
// ERR_MODULE_NOT_FOUND for anyone not using a bundler — while every bundled
// check stays green. engine@0.3.4 shipped 668 of those. Loading each entry for
// real is the only check that cannot be fooled, and it is why this line imports
// the engine directly rather than relying on renderer to pull it in.
import '@grafloria/engine';
import { renderToStaticSVG, hasShape } from '@grafloria/renderer';
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

  // -- 1b. the declarations resolve under nodenext ----------------------------
  // tsc emits `import("..")` when it infers a type through a barrel. That is a
  // bare DIRECTORY specifier, which `moduleResolution: nodenext` cannot resolve
  // — so the consumer's build fails on our declaration file, with nothing they
  // can do from their side. Four of these shipped in engine 0.3.3.
  console.log('\npackaging: declaration files resolve under nodenext');
  // Walked in Node rather than shelled out to grep: the pattern needs three
  // levels of quoting to survive a shell, and GNU and BSD grep do not agree on
  // all of it. This is the same check with nothing between it and the files.
  const bareHits = [];
  const walkDts = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) walkDts(p);
      else if (entry.name.endsWith('.d.ts')) {
        const text = readFileSync(p, 'utf8');
        for (const m of text.matchAll(/(?:from|import\()\s*(['"])(\.\.?)\1/g)) {
          bareHits.push(`${p.slice(consumer.length + 1)}: ${m[0]}`);
        }
      }
    }
  };
  walkDts(join(consumer, 'node_modules', '@grafloria'));
  const bare = bareHits.join('\n');
  check('no bare directory specifiers in any .d.ts', bare === '' ? 'none' : 'found', 'none');
  if (bare) console.log('    ' + bare.split('\n').slice(0, 5).join('\n    '));

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
