// Release step: make a package's PUBLISHED JavaScript browser-clean ESM by shipping
// ESM copies of the CommonJS/UMD packages it imports.
//
//     node tools/vendor-esm-deps.mjs libs/engine          # vendor + rewrite
//     node tools/vendor-esm-deps.mjs libs/engine --check  # verify only
//
// WHY. A browser loads ES modules and nothing else. @grafloria/engine imported
// eventemitter3 (whose `index.mjs` is a two-line wrapper around a CommonJS file),
// @dagrejs/dagre (CommonJS), lemonadejs and elkjs (UMD). Every bundler converts
// those on the way through, so nobody noticed — until something served the engine
// WITHOUT bundling it: Vite's dev server does exactly that for a dependency it does
// not pre-bundle (any package imported only from inside node_modules, e.g. by the
// Qwik library @grafloria/qwik), and the page died on `module is not defined` /
// "does not provide an export named 'default'". An import map or a CDN `+esm` URL
// hits the same wall.
//
// WHAT. For each vendored dependency this
//   1. bundles it with esbuild into `<pkg>/vendor/<name>.js` — one self-contained
//      ES module with no imports, its licence text kept as a header comment;
//   2. copies its type declarations beside it (only those our .d.ts reference);
//   3. rewrites every reference to it in the emitted `src/**/*.js` and
//      `src/**/*.d.ts` — static imports, `export … from`, `import()` (elkjs stays a
//      DYNAMIC import, so bundlers keep splitting it into its own lazy chunk) and
//      `import("…")` types — to a relative path into `vendor/`;
//   4. fails if any emitted file still names a vendored package.
// The TypeScript SOURCES keep their bare imports: tests, demos and type-checking run
// against node_modules exactly as before. Only the packed artifact changes.
//
// WHEN. After EVERY tsc emit of the package and after tools/fix-esm-extensions.mjs:
// the renderer's and element's release builds RE-EMIT engine's .js (the "clobber"
// in demos/e2e/packaging-run.mjs), which would silently undo step 3. That is why
// libs/engine/package.json also runs this as `prepack`: `npm pack` and
// `npm publish` cannot ship an engine that skipped it.
//
// The copies are built from the versions in the repository's node_modules — the
// versions every unit test, demo and visual golden here runs against.
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * What each package vendors. `specifiers` are every spelling the emitted code uses;
 * `pkg` is the npm package (for its version and licence); `types` are declaration
 * files copied into vendor/ (the first one becomes `<name>.d.ts`).
 */
const VENDOR = {
  '@grafloria/engine': [
    { name: 'eventemitter3', pkg: 'eventemitter3', specifiers: ['eventemitter3'], types: ['index.d.ts'] },
    { name: 'dagre', pkg: '@dagrejs/dagre', specifiers: ['@dagrejs/dagre'], types: [], extraLicences: ['@dagrejs/graphlib'] },
    { name: 'lemonade', pkg: 'lemonadejs', specifiers: ['lemonadejs'], types: ['dist/lemonade.d.ts'] },
    {
      name: 'elk',
      pkg: 'elkjs',
      entry: 'elkjs/lib/elk.bundled.js',
      specifiers: ['elkjs/lib/elk.bundled.js', 'elkjs/lib/elk.bundled'],
      types: ['lib/elk.bundled.d.ts', 'lib/elk-api.d.ts'],
      // elkjs ships GWT output that is already minified; re-printed readable it doubles.
      minify: true,
    },
  ],
};

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const pkgDir = resolve(args.find((a) => !a.startsWith('--')) ?? '.');
const pkgJson = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
const deps = VENDOR[pkgJson.name];
if (!deps) {
  console.error(`vendor-esm-deps: nothing is configured for ${pkgJson.name}`);
  process.exit(1);
}
const srcDir = join(pkgDir, 'src');
const vendorDir = join(pkgDir, 'vendor');
const requireFromRepo = createRequire(join(REPO, 'package.json'));

function* walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (p.endsWith('.js') || p.endsWith('.d.ts')) yield p;
  }
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
// Longest spelling first, so `elkjs/lib/elk.bundled.js` is not half-matched as `elkjs`.
const bySpecifier = deps
  .flatMap((d) => d.specifiers.map((s) => [s, d]))
  .sort((a, b) => b[0].length - a[0].length);
// A module specifier in an import/export/import() position — never a bare word in a comment.
const LEAD = String.raw`(\bfrom\s*|\bimport\s*\(\s*|^\s*import\s+)(['"])`;
const SPEC = new RegExp(String.raw`${LEAD}(${bySpecifier.map(([s]) => escape(s)).join('|')})\2`, 'gm');
// The verdict is broader than the rewrite: ANY specifier naming a vendored package —
// a subpath nobody listed above included — means the browser graph is not clean.
const ANY = new RegExp(String.raw`${LEAD}((?:${deps.map((d) => escape(d.pkg)).join('|')})(?:/[^'"]*)?)\2`, 'gm');

function pkgRoot(name) {
  return dirname(requireFromRepo.resolve(`${name}/package.json`));
}

function licenceText(name) {
  const root = pkgRoot(name);
  const file = readdirSync(root).find((f) => /^licen[cs]e(\.md|\.txt)?$/i.test(f));
  const meta = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const text = file ? readFileSync(join(root, file), 'utf8').trim() : '(no licence file shipped)';
  // lemonadejs's package.json has no `license` field; its LICENSE.md is the MIT text.
  const licence = meta.license ?? (/^\s*(the )?mit license/i.test(text) ? 'MIT' : 'see the licence text');
  return { version: meta.version, licence, text, repo: meta.repository?.url ?? meta.repository ?? meta.homepage ?? '' };
}

/**
 * Two comments. A one-line `/*!` notice per package — name, version, licence,
 * copyright, source — which minifiers keep, so the attribution travels into every
 * app bundle for a few hundred bytes; then the FULL licence texts in a plain comment,
 * kept in the vendored file itself and dropped by minifiers.
 */
function banner(dep) {
  const names = [dep.pkg, ...(dep.extraLicences ?? [])];
  const clean = (t) => t.replace(/\*\//g, '* /');
  const notices = names.map((name) => {
    const l = licenceText(name);
    const copyright = l.text.split('\n').find((line) => /copyright \(c\)/i.test(line))?.trim();
    const source = String(l.repo).replace(/^git\+/, '').replace(/^git:\/\//, 'https://').replace(/\.git$/, '');
    return `/*! ${clean([`${name}@${l.version}`, l.licence, copyright, source].filter(Boolean).join(' | '))} */`;
  });
  const body = [
    `Vendored by @grafloria's release build (tools/vendor-esm-deps.mjs): ${dep.entry ?? dep.pkg},`,
    `unchanged in behaviour, wrapped as an ES module${dep.minify ? ' (and re-minified)' : ''} by esbuild so a`,
    `browser can load this package without a bundler. The licence text follows.`,
    ...names.flatMap((name) => ['', `--- ${name} ---`, '', licenceText(name).text]),
  ].join('\n');
  return `${notices.join('\n')}\n/*\n${clean(body).split('\n').map((l) => ` * ${l}`.trimEnd()).join('\n')}\n */`;
}

async function vendor(dep) {
  const entry = dep.entry ?? dep.pkg;
  // The ES module's export list mirrors what Node gives an `import` of the CommonJS
  // package: a default (module.exports) plus each own property as a named export.
  const cjs = requireFromRepo(entry);
  const names = Object.keys(cjs).filter((k) => k !== 'default' && /^[A-Za-z_$][\w$]*$/.test(k));
  const contents = [
    `import m from ${JSON.stringify(entry)};`,
    'export default m;',
    ...names.map((k, i) => `const _${i} = m[${JSON.stringify(k)}]; export { _${i} as ${k} };`),
  ].join('\n');
  const out = join(vendorDir, `${dep.name}.js`);
  const result = await build({
    stdin: { contents, resolveDir: REPO, sourcefile: `vendor-${dep.name}.js` },
    bundle: true,
    format: 'esm',
    // `neutral`: no Node built-ins and no browser shims are assumed; the package's
    // `import` entry (eventemitter3's index.mjs) is preferred over `main`.
    platform: 'neutral',
    mainFields: ['module', 'main'],
    conditions: ['import', 'module', 'default'],
    target: 'es2020',
    minify: dep.minify === true,
    legalComments: 'none',
    banner: { js: banner(dep) },
    outfile: out,
    metafile: true,
    logLevel: 'warning',
  });
  // A wrapped module must not reach back out: no import, no require, of anything.
  const reaches = Object.values(result.metafile.outputs).flatMap((o) => o.imports);
  if (reaches.length) {
    throw new Error(`vendor/${dep.name}.js is not self-contained: ${reaches.map((i) => `${i.kind} ${i.path}`).join(', ')}`);
  }
  const code = readFileSync(out, 'utf8');
  const root = pkgRoot(dep.pkg);
  dep.types.forEach((t, i) => {
    const target = i === 0 ? `${dep.name}.d.ts` : t.split('/').pop();
    const text = readFileSync(join(root, t), 'utf8')
      // nodenext needs explicit extensions between the copied declaration files
      .replace(/(from\s*)(['"])\.\/([\w.-]+?)(\.js)?\2/g, (_m, lead, q, name) => `${lead}${q}./${name}.js${q}`);
    writeFileSync(join(vendorDir, target), `// Types of ${dep.pkg} (${licenceText(dep.pkg).licence}), copied by tools/vendor-esm-deps.mjs.\n${text}`);
  });
  return { name: dep.name, bytes: code.length, exports: ['default', ...names] };
}

function rewrite() {
  let files = 0, rewrites = 0;
  const missingTypes = [];
  for (const file of walk(srcDir)) {
    const isDts = file.endsWith('.d.ts');
    let changed = false;
    const text = readFileSync(file, 'utf8').replace(SPEC, (_m, lead, q, spec) => {
      const dep = bySpecifier.find(([s]) => s === spec)[1];
      if (isDts && dep.types.length === 0) missingTypes.push(`${relative(pkgDir, file)} → ${spec}`);
      let rel = relative(dirname(file), join(vendorDir, `${dep.name}.js`)).split(sep).join('/');
      if (!rel.startsWith('.')) rel = './' + rel;
      changed = true;
      rewrites++;
      return `${lead}${q}${rel}${q}`;
    });
    if (changed) {
      writeFileSync(file, text);
      files++;
    }
  }
  return { files, rewrites, missingTypes };
}

function verify() {
  const left = [];
  for (const file of walk(srcDir)) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(ANY)) left.push(`${relative(pkgDir, file)}: ${m[0].trim()}`);
  }
  const missing = deps.filter((d) => !existsSync(join(vendorDir, `${d.name}.js`))).map((d) => `vendor/${d.name}.js`);
  return { left, missing };
}

if (!checkOnly) {
  if (!existsSync(join(srcDir, 'index.js'))) {
    console.error(`vendor-esm-deps: ${relative(REPO, srcDir)}/index.js does not exist — run the release tsc build first`);
    process.exit(1);
  }
  rmSync(vendorDir, { recursive: true, force: true });
  mkdirSync(vendorDir, { recursive: true });
  const built = [];
  for (const dep of deps) built.push(await vendor(dep));
  const r = rewrite();
  if (r.missingTypes.length) {
    console.error(`vendor-esm-deps: these declarations reference a vendored package that has no copied types:\n  ${r.missingTypes.join('\n  ')}`);
    process.exit(1);
  }
  console.log(
    `vendor-esm-deps: ${built.map((b) => `${b.name}.js ${(b.bytes / 1024).toFixed(0)} KB`).join(', ')}; ` +
      `rewrote ${r.rewrites} specifiers in ${r.files} files under ${relative(REPO, srcDir)}`
  );
}
const { left, missing } = verify();
if (left.length || missing.length) {
  console.error(
    `vendor-esm-deps: ${pkgJson.name} is NOT browser-clean — run \`node tools/vendor-esm-deps.mjs ${relative(REPO, pkgDir)}\` after the tsc build:\n  ` +
      [...missing.map((m) => `missing ${m}`), ...left.slice(0, 20)].join('\n  ')
  );
  process.exit(1);
}
if (checkOnly) console.log(`vendor-esm-deps: ${pkgJson.name} is browser-clean (${deps.length} vendored modules present, no bare references left)`);
