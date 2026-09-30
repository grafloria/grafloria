// THE ANGULAR MATRIX — every Angular major @grafloria/angular's peer range
// CLAIMS is installed, built and driven. A peer range is a promise to a
// stranger's `npm install`; this is what keeps it.
//
// GitHub issue #2: the range stopped at Angular 20, so a project on 22 could only
// install with --legacy-peer-deps — while the package worked there. Widening the
// range without proof would trade one wrong claim for another, so for each major:
//
//   1. a fresh workspace is made from this conformance app, on THAT Angular, with
//      the TypeScript and builder that Angular itself requires
//   2. `npm install` runs with NO --legacy-peer-deps / --force: an ERESOLVE fails
//   3. `ng build` builds it (the partial-Ivy library linked by that Angular)
//   4. the built app is served and DRIVEN in a real browser: custom node
//      templates, a zoneless click mutating bound data, the lazy ELK chunk,
//      a snapshot round trip, the dashboard and its live layout switch
//
//   node tools/conformance/angular/matrix.mjs                      # every major in the peer range, the LOCAL build
//   node tools/conformance/angular/matrix.mjs 21 22                # just these
//   node tools/conformance/angular/matrix.mjs --published 0.13.4   # a version from npm instead of the local build
//
// The local build is dist/libs/renderer-angular/renderer-angular (make it first:
// `npx nx build renderer-angular-renderer-angular --configuration production`).

import { chromium } from 'playwright';
import { execFileSync, execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..', '..');
const libDir = join(repo, 'libs', 'renderer-angular', 'renderer-angular');
const distDir = join(repo, 'dist', 'libs', 'renderer-angular', 'renderer-angular');
const WORK = join(tmpdir(), 'gf-ng-matrix');

const argv = process.argv.slice(2);
const pubIdx = argv.indexOf('--published');
const published = pubIdx >= 0 ? argv[pubIdx + 1] : null;
const asked = argv.filter((a, i) => /^\d+$/.test(a) && (pubIdx < 0 || i !== pubIdx + 1)).map(Number);

const libPkg = JSON.parse(readFileSync(join(libDir, 'package.json'), 'utf8'));
/** The majors the package CLAIMS: every `^N.` in its @angular/core peer range. */
const claimed = [...String(libPkg.peerDependencies['@angular/core']).matchAll(/\^(\d+)\./g)].map((m) => Number(m[1]));
const majors = asked.length ? asked : claimed;

const semver = createRequire(import.meta.url)('semver');

/**
 * `ng build` under a Node the workspace's Angular CLI accepts. A newer Angular
 * can require a newer Node than this machine runs (CLI 22 refuses 24.10); then
 * npm's own `node` package lends one for that single command — nothing is
 * installed and the machine's Node is not touched.
 */
function ngBuild(dir) {
  const wants = JSON.parse(readFileSync(join(dir, 'node_modules', '@angular', 'cli', 'package.json'), 'utf8')).engines?.node ?? '*';
  const env = { ...process.env, NG_CLI_ANALYTICS: 'false', CI: 'true' };
  const opts = { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', env, maxBuffer: 64 * 1024 * 1024 };
  if (semver.satisfies(process.versions.node, wants)) {
    execFileSync('npx', ['ng', 'build'], opts);
    return `Node ${process.versions.node}`;
  }
  const all = JSON.parse(sh('npm view node versions --json', repo));
  const pick = semver.maxSatisfying(all, wants);
  if (!pick) throw new Error(`no Node satisfies the CLI's engines.node (${wants})`);
  execFileSync('npx', ['-y', '-p', `node@${pick}`, 'node', join('node_modules', '@angular', 'cli', 'bin', 'ng.js'), 'build'], opts);
  return `Node ${pick} (borrowed: the CLI wants ${wants}, this machine runs ${process.versions.node})`;
}

const sh = (cmd, cwd) => execSync(cmd, { cwd, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const view = (spec, field) => {
  const out = JSON.parse(sh(`npm view ${spec} ${field} --json`, repo));
  return Array.isArray(out) ? out[out.length - 1] : out;
};
const latest = (pkg) => view(pkg, 'version');

/** What is installed as @grafloria/angular: a published version, or the local build packed. */
function subject() {
  if (published) return { spec: published, label: `@grafloria/angular@${published} from npm` };
  if (!existsSync(join(distDir, 'package.json'))) throw new Error(`no local build at ${distDir} — run: npx nx build renderer-angular-renderer-angular --configuration production`);
  mkdirSync(WORK, { recursive: true });
  const name = sh('npm pack --silent --pack-destination ' + JSON.stringify(WORK), distDir).trim().split('\n').pop();
  const built = JSON.parse(readFileSync(join(distDir, 'package.json'), 'utf8'));
  return { spec: `file:${join(WORK, name)}`, label: `the local build ${built.version} (peers: @angular/core ${built.peerDependencies['@angular/core']})` };
}

function workspace(major, grafloriaAngular) {
  const dir = join(WORK, `ng${major}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const f of ['angular.json', 'tsconfig.json', 'tsconfig.app.json']) cpSync(join(here, f), join(dir, f));
  cpSync(join(here, 'src'), join(dir, 'src'), { recursive: true });
  const core = latest(`@angular/core@${major}`);
  const corePeers = view(`@angular/core@${core}`, 'peerDependencies');
  const ts = view(`@angular/compiler-cli@${latest(`@angular/compiler-cli@${major}`)}`, 'peerDependencies').typescript;
  const ng = `^${major}.0.0`;
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    name: `gf-ng-proof-${major}`,
    version: '0.0.0',
    private: true,
    dependencies: {
      '@angular/common': ng, '@angular/compiler': ng, '@angular/core': ng, '@angular/forms': ng,
      '@angular/platform-browser': ng, '@angular/router': ng,
      '@grafloria/angular': grafloriaAngular,
      '@grafloria/element': latest('@grafloria/element'),
      '@grafloria/engine': latest('@grafloria/engine'),
      '@grafloria/renderer': latest('@grafloria/renderer'),
      rxjs: '~7.8.0', tslib: '^2.3.0',
      'zone.js': corePeers['zone.js'] ?? '~0.15.0',
    },
    devDependencies: { '@angular-devkit/build-angular': ng, '@angular/cli': ng, '@angular/compiler-cli': ng, typescript: ts },
  }, null, 2));
  // The app's own code follows Angular's own changes; the LIBRARY is what is on trial.
  // Before 19 a component is not standalone unless it says so.
  if (major < 19) {
    for (const f of ['app.component.ts', 'dashboard-page.component.ts']) {
      const file = join(dir, 'src', 'app', f);
      writeFileSync(file, readFileSync(file, 'utf8').replace(/(\n\s*selector: '[^']+',)/, '$1\n  standalone: true,'));
    }
  }
  if (major >= 20) {
    const cfg = join(dir, 'src', 'app', 'app.config.ts');
    writeFileSync(cfg, readFileSync(cfg, 'utf8').replaceAll('provideExperimentalZonelessChangeDetection', 'provideZonelessChangeDetection'));
  }
  return { dir, core, ts };
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.map': 'application/json' };
function serve(root) {
  const server = createServer((req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    let file = join(root, url === '/' ? 'index.html' : url);
    if (!existsSync(file)) file = join(root, 'index.html');
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ server, origin: `http://127.0.0.1:${server.address().port}` })));
}

/** The README's acceptance drive. Returns the failed checks (empty = pass). */
async function drive(origin, browser) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 1100 } });
  const errors = [];
  const requests = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', (r) => requests.push(r.url()));
  const failed = [];
  const check = (ok, what) => { if (!ok) failed.push(what); };
  await page.goto(origin, { waitUntil: 'networkidle' });
  await page.waitForSelector('.job-card', { timeout: 20000 }).catch(() => undefined);
  const cards = () => page.$$eval('.job-card', (els) => els.map((e) => ({ id: e.getAttribute('data-node'), text: e.textContent.replace(/\s+/g, ' ').trim(), x: Math.round(e.getBoundingClientRect().x), y: Math.round(e.getBoundingClientRect().y) })));
  const c0 = await cards();
  check(c0.length === 2 && c0.some((c) => /Extract.*running · 40%/.test(c.text)), `custom node templates must render (got ${JSON.stringify(c0.map((c) => c.text))})`);
  // ELK is LAZY: its code is in nothing loaded at boot and in something fetched
  // by the first layout. Judged by CONTENT — builders name their chunks as they
  // please (Angular 22's carry no "elk" in the file name).
  const hasElk = async (urls) => {
    for (const u of urls.filter((x) => /\.js(\?|$)/.test(x))) if ((await (await fetch(u)).text()).includes('org.eclipse.elk')) return true;
    return false;
  };
  const atBoot = [...requests];
  check(!(await hasElk(atBoot)), 'ELK must NOT be loaded at boot');
  // zoneless: a click in a template mutates bound data and the view follows.
  // The nodes start STACKED, so the card a hand can reach is the one on top.
  const top = await page.evaluate(() => {
    const b = document.querySelector('.job-card button').getBoundingClientRect();
    const card = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)?.closest('.job-card');
    return card ? { id: card.getAttribute('data-node'), pct: Number(/(\d+)%/.exec(card.textContent)?.[1]) } : null;
  });
  if (top) await page.click(`.job-card[data-node="${top.id}"] button`);
  await page.waitForTimeout(250);
  check(!!top && (await cards()).some((c) => c.id === top.id && new RegExp(`${top.pct + 10}%`).test(c.text)), 'a click in a node template must update the bound data (zoneless)');
  // snapshot the stacked layout, lay out with ELK, restore
  await page.click('#save');
  const stacked = await cards();
  await page.click('#run-elk');
  await page.waitForFunction(() => document.getElementById('status')?.textContent === 'layout done', null, { timeout: 30000 }).catch(() => undefined);
  await page.waitForTimeout(400);
  const laid = await cards();
  const sep = (cs) => Math.abs((cs.find((c) => c.id === 'j1')?.x ?? 0) - (cs.find((c) => c.id === 'j2')?.x ?? 0)) + Math.abs((cs.find((c) => c.id === 'j1')?.y ?? 0) - (cs.find((c) => c.id === 'j2')?.y ?? 0));
  check((await page.textContent('#status')) === 'layout done', '(layoutDone) must fire after applyLayout');
  check(await hasElk(requests.filter((u) => !atBoot.includes(u))), 'ELK must be fetched by the first layout, as a lazy chunk');
  check(sep(stacked) < 5 && sep(laid) > 80, `ELK must separate the stacked nodes (before ${sep(stacked)} px, after ${sep(laid)} px)`);
  await page.click('#restore');
  await page.waitForTimeout(500);
  check(sep(await cards()) < 5, 'loadSnapshot must put the nodes back where the snapshot had them');
  // the dashboard kit, its ng-template widget and a live layout switch
  check((await page.$$('.tpl-deploys')).length === 1, 'the dashboard must render its ng-template widget');
  check((await page.$$('grafloria-dashboard .grafloria-node-host')).length >= 4, 'the dashboard must mount its widgets');
  await page.click('#layout-split');
  await page.waitForTimeout(500);
  check(/^split/.test((await page.textContent('#switch-status')) ?? ''), 'the [layout] input must switch the live board');
  check((await page.$$('grafloria-dashboard .axdb-div')).length > 0, 'a split board must show its dividers');
  check(errors.length === 0, `no page errors (got: ${errors.slice(0, 2).join(' | ')})`);
  await page.close();
  return failed;
}

const sub = subject();
console.log(`Angular matrix: ${sub.label}\nmajors: ${majors.join(', ')}${asked.length ? '' : ' (every one the peer range claims)'}\n`);
const browser = await chromium.launch();
const results = [];
for (const major of majors) {
  const started = Date.now();
  let stage = 'workspace';
  let detail = '';
  try {
    const ws = workspace(major, sub.spec);
    detail = `Angular ${ws.core}, TypeScript ${ws.ts}`;
    stage = 'npm install';
    try {
      sh('npm install --no-audit --no-fund', ws.dir);
    } catch (e) {
      const text = `${e.stdout ?? ''}${e.stderr ?? ''}`;
      throw new Error(/ERESOLVE/.test(text) ? `ERESOLVE — ${(/peer [^\n]*@grafloria\/angular[^\n]*/.exec(text) ?? ['the peer range refuses this Angular'])[0].trim()}` : text.split('\n').filter(Boolean).slice(-4).join(' | '));
    }
    stage = 'ng build';
    try {
      detail += `, ${ngBuild(ws.dir)}`;
    } catch (e) {
      const text = `${e.stdout ?? ''}${e.stderr ?? ''}${e.stdout === undefined ? String(e.message ?? e) : ''}`;
      throw new Error(text.split('\n').filter((l) => /error|ERROR|✘|requires|refus/i.test(l)).slice(0, 4).join(' | ') || text.split('\n').filter(Boolean).slice(-3).join(' | ') || 'build failed');
    }
    stage = 'drive';
    const { server, origin } = await serve(join(ws.dir, 'dist', 'gf-ng-proof', 'browser'));
    const failed = await drive(origin, browser);
    server.close();
    if (failed.length) throw new Error(failed.join(' · '));
    results.push({ major, ok: true });
    console.log(`  ✓ Angular ${major}  (${detail}) — installs clean, builds, every check passes  [${Math.round((Date.now() - started) / 1000)}s]`);
  } catch (e) {
    results.push({ major, ok: false });
    console.log(`  ✗ Angular ${major}  ${detail ? `(${detail}) ` : ''}— ${stage}: ${String(e.message ?? e).slice(0, 600)}`);
  }
}
await browser.close();
const pass = results.filter((r) => r.ok).length;
console.log(`\nangular matrix: ${pass}/${results.length} majors pass`);
process.exit(pass === results.length ? 0 : 1);
