// Post-emit fixer: append explicit extensions to relative import/export
// specifiers in compiled .js and .d.ts so the output is valid pure-Node ESM.
// tsc with module es2020 preserves the extensionless specifiers written in
// TS source; bundlers resolve those, Node does not.
import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

const root = process.argv[2];
if (!root) { console.error('usage: fix-esm-extensions.mjs <dir>'); process.exit(1); }

const SPEC = /(\bfrom\s*|\bimport\s*\(\s*|^\s*import\s+)(['"])(\.\.?\/[^'"]+)\2/gm;

function* walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (p.endsWith('.js') || p.endsWith('.d.ts')) yield p;
  }
}

let files = 0, rewrites = 0;
for (const file of walk(root)) {
  const dir = dirname(file);
  const isDts = file.endsWith('.d.ts');
  let changed = false;
  const out = readFileSync(file, 'utf8').replace(SPEC, (m, lead, q, spec) => {
    if (/\.(js|json|mjs|cjs|css)$/.test(spec)) return m;
    const base = resolve(dir, spec);
    const probe = isDts
      ? [[base + '.d.ts', spec + '.js'], [join(base, 'index.d.ts'), spec + '/index.js']]
      : [[base + '.js', spec + '.js'], [join(base, 'index.js'), spec + '/index.js']];
    for (const [candidate, fixed] of probe) {
      if (existsSync(candidate)) { changed = true; rewrites++; return `${lead}${q}${fixed}${q}`; }
    }
    console.warn(`UNRESOLVED: ${spec} in ${file}`);
    return m;
  });
  if (changed) { writeFileSync(file, out); files++; }
}
console.log(`fixed ${rewrites} specifiers in ${files} files under ${root}`);
