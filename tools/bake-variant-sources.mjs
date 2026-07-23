// Bake a framework demo app's REAL source files into docs/demos-<fw>/sources.json,
// keyed by route. The gallery shell's framework tab shows these files — generated
// from the same files the compiler built, so the drawer can never drift from
// what actually runs.
//
//     node tools/bake-variant-sources.mjs <angular|react|vue>   (after building)

import { readFileSync, readdirSync, writeFileSync, mkdirSync, cpSync, rmSync, existsSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const FW = process.argv[2];
if (!['angular', 'react', 'vue'].includes(FW)) throw new Error('usage: bake-variant-sources.mjs <angular|react|vue>');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = join(root, 'apps', `demos-${FW}`);
const DIST = FW === 'angular'
  ? join(root, 'dist', 'apps', 'demos-angular', 'browser')
  : join(root, 'dist', 'apps', `demos-${FW}`);
const OUT = join(root, 'docs', `demos-${FW}`);

// route → demo folder/file, from each app's route table.
let pairs;
if (FW === 'angular') {
  const rc = readFileSync(join(APP, 'src', 'app', 'app.routes.ts'), 'utf8');
  pairs = [...rc.matchAll(/path: '([^']+)',\s*loadComponent: \(\) => import\('\.\/demos\/([^/]+)\//g)]
    .map((m) => ({ route: m[1], dir: join(APP, 'src', 'app', 'demos', m[2]) }));
} else {
  const rc = readFileSync(join(APP, 'src', 'routes.ts'), 'utf8');
  // 'cat/name': () => import('./demos/<file>')  — file may be .tsx or .vue
  pairs = [...rc.matchAll(/'([\w-]+\/[\w-]+)':\s*\(\) => import\('\.\/demos\/([\w.-]+)'\)/g)]
    .map((m) => ({ route: m[1], file: m[2] }));
}
if (!pairs.length) throw new Error(`bake: no routes parsed for ${FW}`);

const sources = {};
for (const p of pairs) {
  if (FW === 'angular') {
    sources[p.route] = readdirSync(p.dir).sort().map((name) => ({ name, text: readFileSync(join(p.dir, name), 'utf8') }));
  } else {
    // react/vue: one file per demo (a .tsx or a .vue SFC). Resolve the exact name.
    const base = join(APP, 'src', 'demos');
    let file = p.file;
    if (!existsSync(join(base, file))) {
      for (const ext of ['.tsx', '.ts', '.vue']) { if (existsSync(join(base, file + ext))) { file = file + ext; break; } }
    }
    sources[p.route] = [{ name: file, text: readFileSync(join(base, file), 'utf8') }];
  }
}

if (!existsSync(join(DIST, 'index.html'))) throw new Error(`bake: dist missing — build demos-${FW} first`);
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
cpSync(DIST, OUT, { recursive: true });
writeFileSync(join(OUT, 'sources.json'), JSON.stringify({ routes: sources }));
console.log(`baked ${pairs.length} ${FW} routes (${Object.values(sources).reduce((n, f) => n + f.length, 0)} files) → docs/demos-${FW}/`);
