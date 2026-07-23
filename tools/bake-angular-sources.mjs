// Bake the Angular demos' REAL source files into docs/demos-angular/sources.json,
// keyed by route. The gallery shell's Angular tab shows these files — generated
// from the same files the compiler built, so the drawer can never drift from
// what actually runs.
//
//     node tools/bake-angular-sources.mjs        (run AFTER nx build demos-angular)

import { readFileSync, readdirSync, writeFileSync, mkdirSync, cpSync, rmSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = join(root, 'apps', 'demos-angular', 'src', 'app');
const DIST = join(root, 'dist', 'apps', 'demos-angular', 'browser');
const OUT = join(root, 'docs', 'demos-angular');

// route ← folder mapping straight from the route table.
const routesSrc = readFileSync(join(APP, 'app.routes.ts'), 'utf8');
const pairs = [...routesSrc.matchAll(/path: '([^']+)',\s*loadComponent: \(\) => import\('\.\/demos\/([^/]+)\//g)]
  .map((m) => ({ route: m[1], folder: m[2] }));
if (!pairs.length) throw new Error('bake: no routes parsed');

const sources = {};
for (const { route, folder } of pairs) {
  const dir = join(APP, 'demos', folder);
  sources[route] = readdirSync(dir).sort().map((name) => ({
    name,
    text: readFileSync(join(dir, name), 'utf8'),
  }));
}

if (!existsSync(join(DIST, 'index.html'))) throw new Error('bake: dist missing — run nx build demos-angular first');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
cpSync(DIST, OUT, { recursive: true });
writeFileSync(join(OUT, 'sources.json'), JSON.stringify({ routes: sources }));
console.log(`baked ${pairs.length} routes (${Object.values(sources).reduce((n, f) => n + f.length, 0)} files) → docs/demos-angular/`);
