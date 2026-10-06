// THE RELEASE BUILD of @grafloria/qwik — run from anywhere:
//
//     node libs/qwik/build-release.mjs
//
//   1. the Qwik optimizer, in library mode, writes lib/index.qwik.mjs — the file
//      package.json's `main`, `module`, `exports` and `qwik` fields point at;
//   2. tsc writes the declarations OUTSIDE the tree (dist/qwik-types — see
//      tsconfig.release.json for why), and only this package's are copied back
//      beside their sources (src/**/*.d.ts). Nothing in engine/renderer/element is
//      touched, so this can run before or after their builds;
//   3. tools/fix-esm-extensions.mjs gives those declarations' relative imports a
//      `.js`, which `moduleResolution: nodenext` consumers need.
//
// Unlike the other packages there is no `tsc -p tsconfig.release.json` JavaScript
// here: plain tsc output keeps raw `component$`/`$()` calls under a name the
// consumer's Qwik optimizer never transforms, and their Vite dev server fails with
// "Optimizer should replace all usages of $()".
import { execSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const run = (cmd) => execSync(cmd, { cwd: repo, stdio: 'inherit' });

run('npx vite build --config libs/qwik/vite.config.lib.mts --mode lib --logLevel warn');

const typesOut = join(repo, 'dist', 'qwik-types');
rmSync(typesOut, { recursive: true, force: true });
// tsc's exit code is not the verdict (noEmitOnError is off, as in every release
// config here); the declarations it writes are, and step 4 below checks them.
try {
  run('npx tsc -p libs/qwik/tsconfig.release.json');
} catch {
  console.log('build-release: tsc reported errors; continuing — the declarations are checked below');
}
cpSync(join(typesOut, 'qwik', 'src'), join(here, 'src'), {
  recursive: true,
  filter: (src) => !src.includes('__mocks__') && (!/\.[a-z]+$/.test(src) || src.endsWith('.d.ts')),
});
rmSync(typesOut, { recursive: true, force: true });
run(`node ${join('tools', 'fix-esm-extensions.mjs')} ${join('libs', 'qwik', 'src')}`);
if (!existsSync(join(here, 'src', 'index.d.ts'))) {
  console.error('build-release: no src/index.d.ts was written');
  process.exit(1);
}

// The entry must be what the optimizer wrote, under the name a consumer's qwikVite()
// transforms — anything else is the 0.10.6 bug again.
const pkg = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8'));
const entry = join(here, pkg.qwik ?? '');
if (!pkg.qwik || !/\.qwik\.[mc]?js$/.test(pkg.qwik) || !existsSync(entry)) {
  console.error(`build-release: package.json "qwik" (${pkg.qwik}) does not name a built *.qwik.mjs file`);
  process.exit(1);
}
console.log(`@grafloria/qwik built → ${pkg.qwik} + src/**/*.d.ts`);
