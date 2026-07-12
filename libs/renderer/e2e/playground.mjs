// Build + serve the interactive line playground.
//
//   node libs/renderer/e2e/playground.mjs          → build & serve on :4600
//   node libs/renderer/e2e/playground.mjs --build  → build only
import { build } from 'esbuild';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join, resolve, extname } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..', '..');

await build({
  entryPoints: [join(here, 'playground.ts')],
  bundle: true,
  format: 'iife',
  outfile: join(here, 'playground.bundle.js'),
  platform: 'browser',
  target: 'es2020',
  alias: {
    '@grafloria/engine': join(repo, 'libs/engine/src/index.ts'),
    '@grafloria/renderer': join(repo, 'libs/renderer/src/index.ts'),
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
console.log('built playground.bundle.js');

if (process.argv.includes('--build')) process.exit(0);

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  const path = req.url === '/' ? '/playground.html' : req.url.split('?')[0];
  try {
    const body = await readFile(join(here, path));
    res.writeHead(200, { 'Content-Type': MIME[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});
server.listen(4600, () => console.log('▶ open http://localhost:4600'));
