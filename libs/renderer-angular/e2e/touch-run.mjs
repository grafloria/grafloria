// wave14/ng-touch — REAL-browser touch proof for the ANGULAR host.
//
//   node libs/renderer-angular/e2e/touch-run.mjs
//
// Drives REAL touch input at the REAL DiagramCanvasComponent in headless
// Chromium (`hasTouch: true`), using CDP `Input.dispatchTouchEvent` so the
// pinch is genuine multi-touch (two independently-moving points in one event —
// `page.touchscreen` cannot express that). Mirrors the framework-free
// renderer's `libs/renderer/e2e/touch-run.mjs`, because jsdom cannot answer
// the questions that matter here:
//   - jsdom has no PointerEvent, so the pipeline under test does not exist there;
//   - jsdom has no `touch-action`, so the single most important line in the
//     feature is invisible to it;
//   - jsdom never synthesizes compatibility mouse events, so the dedupe can
//     only be proven against a browser that does.
//
// THE CONTROL. Assertions that can only go green are worthless: this run
// re-enables native touch handling (`touch-action: auto` on the container),
// repeats the pan, and asserts the canvas DOES NOT pan — then restores `none`
// and asserts panning works again. If the control ever "pans", the harness is
// not at the mercy of touch-action and every other verdict here means nothing.
//
// ANGULAR-SPECIFIC BUILD NOTES (vs the renderer's runner):
//   - the component is JIT-compiled in the page (`@angular/compiler` bundled);
//   - the library's .ts files are emitted through Angular's OWN
//     `angularJitApplicationTransform` (the same transform jest-preset-angular
//     applies) — WITHOUT it, signal-based `input()`/`model()` members are
//     invisible to the JIT compiler and every template binding dies with
//     NG0303 "Can't bind to 'engine'". The transform also downlevels
//     constructor parameters into static `ctorParameters`, so DI works with no
//     `design:paramtypes` metadata;
//   - `templateUrl:`/`styleUrls:` are inlined into the emitted JS (JIT has no
//     ResourceLoader wired for file:// URLs).
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { createRequire } from 'module';
import ts from 'typescript';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..', '..');
const require = createRequire(import.meta.url);
const { angularJitApplicationTransform } = require('@angular/compiler-cli');

// --- a ts.Program over the Angular lib, for the JIT transform ---------------
const libSrc = join(repo, 'libs/renderer-angular/renderer-angular/src');
const libFiles = readdirSync(libSrc, { recursive: true })
  .map(String)
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts') && !f.endsWith('.stories.ts'))
  .map((f) => join(libSrc, f));

const tsOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.NodeJs,
  experimentalDecorators: true,
  emitDecoratorMetadata: false,
  useDefineForClassFields: false,
  skipLibCheck: true,
  esModuleInterop: true,
  sourceMap: false,
  baseUrl: repo,
  paths: {
    '@grafloria/engine': ['libs/engine/src/index.ts'],
    '@grafloria/renderer': ['libs/renderer/src/index.ts'],
  },
};
const program = ts.createProgram(libFiles, tsOptions);
const ngJitTransform = angularJitApplicationTransform(program);

/** Emit one lib file through Angular's JIT transform. Cached per path. */
const emittedCache = new Map();
function emitThroughNgTransform(path) {
  if (emittedCache.has(path)) return emittedCache.get(path);
  const sourceFile = program.getSourceFile(path);
  let output = null;
  if (sourceFile) {
    program.emit(
      sourceFile,
      (fileName, text) => {
        if (fileName.endsWith('.js')) output = text;
      },
      undefined,
      false,
      { before: [ngJitTransform] }
    );
  }
  emittedCache.set(path, output);
  return output;
}

/** Inline templateUrl / styleUrls / styleUrl so JIT never needs a ResourceLoader. */
function inlineNgResources(source, dir) {
  source = source.replace(
    /templateUrl\s*:\s*['"]([^'"]+)['"]/g,
    (_m, rel) => `template: ${JSON.stringify(readFileSync(join(dir, rel), 'utf8'))}`
  );
  source = source.replace(/styleUrls\s*:\s*\[([^\]]*)\]/g, (_m, list) => {
    const files = [...list.matchAll(/['"]([^'"]+)['"]/g)].map((m) =>
      readFileSync(join(dir, m[1]), 'utf8')
    );
    return `styles: ${JSON.stringify(files)}`;
  });
  source = source.replace(
    /styleUrl\s*:\s*['"]([^'"]+)['"]/g,
    (_m, rel) => `styles: [${JSON.stringify(readFileSync(join(dir, rel), 'utf8'))}]`
  );
  return source;
}

const angularJitPlugin = {
  name: 'angular-jit',
  setup(b) {
    // Every lib .ts file goes through Angular's JIT transform (signal inputs →
    // @Input({isSignal:true}), ctor params → static ctorParameters), then has
    // its external template/styles inlined into the emitted JS.
    b.onLoad({ filter: /libs\/renderer-angular\/renderer-angular\/src\/.*\.ts$/ }, (args) => {
      const js = emitThroughNgTransform(args.path);
      if (js !== null) {
        return { contents: inlineNgResources(js, dirname(args.path)), loader: 'js' };
      }
      // Not in the program (shouldn't happen) — fall back to raw TS + inlining.
      return {
        contents: inlineNgResources(readFileSync(args.path, 'utf8'), dirname(args.path)),
        loader: 'ts',
      };
    });
  },
};

await build({
  entryPoints: [join(here, 'touch-harness.ts')],
  bundle: true,
  format: 'iife',
  outfile: join(here, 'touch-ng-bundle.js'),
  platform: 'browser',
  target: 'es2022',
  plugins: [angularJitPlugin],
  alias: {
    '@grafloria/engine': join(repo, 'libs/engine/src/index.ts'),
    '@grafloria/renderer': join(repo, 'libs/renderer/src/index.ts'),
    'fs/promises': join(repo, 'libs/renderer/e2e/node-stubs.ts'),
    path: join(repo, 'libs/renderer/e2e/node-stubs.ts'),
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

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1200, height: 900 },
  hasTouch: true,
  isMobile: false,
});
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));

await page.goto('file://' + join(here, 'touch-index.html'));
await page.waitForFunction(
  () => window.__DONE__ === true || window.__BOOT_ERROR__ !== undefined,
  null,
  { timeout: 60000 }
);
const bootError = await page.evaluate(() => window.__BOOT_ERROR__ ?? null);
if (bootError) {
  console.error('BOOTSTRAP FAILED:', bootError);
  await browser.close();
  process.exit(1);
}

// --- CDP: genuine multi-touch -----------------------------------------------
const cdp = await context.newCDPSession(page);
const touchPoints = (pts) => pts.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y), id: p.id }));
const touchStart = (pts) =>
  cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touchPoints(pts) });
const touchMove = (pts) =>
  cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touchPoints(pts) });
const touchEnd = () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

const state = () => page.evaluate(() => window.__ngtouch.state());
const reset = async () => {
  await page.evaluate(() => window.__ngtouch.reset());
  await page.waitForTimeout(40);
};
const nodeCenter = (id) => page.evaluate((n) => window.__ngtouch.nodeCenterClient(n), id);

const EXPECT = [];
const expectThat = (name, pass, detail = '') => EXPECT.push({ name, pass: !!pass, detail });

async function oneFingerDrag(from, to, steps = 12, holdMs = 0) {
  await touchStart([{ ...from, id: 1 }]);
  if (holdMs) await page.waitForTimeout(holdMs);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await touchMove([{ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, id: 1 }]);
  }
  await touchEnd();
  await page.waitForTimeout(60);
}

async function pinch(center, startGap, endGap, steps = 14) {
  const at = (gap) => [
    { x: center.x - gap / 2, y: center.y, id: 1 },
    { x: center.x + gap / 2, y: center.y, id: 2 },
  ];
  await touchStart(at(startGap));
  for (let i = 1; i <= steps; i++) {
    const gap = startGap + (endGap - startGap) * (i / steps);
    await touchMove(at(gap));
  }
  await touchEnd();
  await page.waitForTimeout(60);
}

// =============================================================================
// 0. touch-action — the line the whole feature stands on
// =============================================================================
{
  const ta = await page.evaluate(() => window.__ngtouch.touchAction());
  expectThat(
    'ng-touch: the component CSS sets touch-action:none on .diagram-canvas-container',
    ta === 'none',
    `computed touch-action = ${ta}`
  );
}

// =============================================================================
// 1. One-finger pan on empty canvas
// =============================================================================
{
  await reset();
  const before = await state();
  await oneFingerDrag({ x: 850, y: 620 }, { x: 650, y: 470 });
  const after = await state();

  const dx = after.viewport.x - before.viewport.x;
  const dy = after.viewport.y - before.viewport.y;
  expectThat(
    'ng-touch: ONE-FINGER PAN moves the camera by the drag delta',
    Math.abs(dx - 200) < 30 && Math.abs(dy - 150) < 30,
    `viewport moved by (${dx.toFixed(1)}, ${dy.toFixed(1)}), expected ~(200, 150)`
  );
  expectThat(
    'ng-touch: a pan does NOT move any node',
    after.a.x === before.a.x && after.a.y === before.a.y,
    `node A ${JSON.stringify(before.a)} -> ${JSON.stringify(after.a)}`
  );
}

// =============================================================================
// 2. Tap to select + the COMPAT-MOUSE DEDUPE
// =============================================================================
{
  await reset();
  const centerA = await nodeCenter('A');
  await touchStart([{ ...centerA, id: 1 }]);
  await page.waitForTimeout(60);
  await touchEnd();
  // Compat mouse events (when not suppressed) arrive right after touchend —
  // give them room so the dedupe assertion below is actually exposed to them.
  await page.waitForTimeout(200);

  const s = await state();
  expectThat(
    'ng-touch: TAP selects the node under the finger',
    s.selected.includes('A'),
    `selected = [${s.selected.join(',')}]`
  );
  expectThat(
    'ng-touch: DEDUPE — the mouse ladder ran ZERO times for a touch tap ' +
      '(preventDefault on touch pointerdown + sawPointerEvent gate)',
    s.ladderMousedowns === 0,
    `onMouseDown ran ${s.ladderMousedowns} time(s) during the tap`
  );
}

// Tap on empty canvas clears the selection.
{
  const before = await state();
  await touchStart([{ x: 880, y: 640, id: 1 }]);
  await page.waitForTimeout(60);
  await touchEnd();
  await page.waitForTimeout(60);
  const s = await state();
  expectThat(
    'ng-touch: TAP on empty canvas clears the selection',
    before.selected.length > 0 && s.selected.length === 0,
    `${before.selected.length} selected -> ${s.selected.length}`
  );
}

// =============================================================================
// 3. One-finger node drag
// =============================================================================
{
  await reset();
  const centerA = await nodeCenter('A');
  const before = await state();
  await oneFingerDrag(centerA, { x: centerA.x + 180, y: centerA.y + 90 });
  const after = await state();

  const dx = after.a.x - before.a.x;
  const dy = after.a.y - before.a.y;
  expectThat(
    'ng-touch: ONE-FINGER DRAG on a node moves that node',
    Math.abs(dx - 180) < 30 && Math.abs(dy - 90) < 30,
    `node A moved (${dx.toFixed(1)}, ${dy.toFixed(1)}), expected ~(180, 90)`
  );
  expectThat(
    'ng-touch: dragging a node does NOT also pan the camera',
    Math.abs(after.viewport.x - before.viewport.x) < 2,
    `viewport.x ${before.viewport.x} -> ${after.viewport.x}`
  );
}

// =============================================================================
// 3.5 Touch RESIZE through the SHARED SelectionToolsController
// =============================================================================
{
  await reset();
  const centerA = await nodeCenter('A');
  await touchStart([{ ...centerA, id: 1 }]);
  await page.waitForTimeout(60);
  await touchEnd();
  await page.waitForTimeout(60);

  const before = await state();
  const se = await page.evaluate(() => window.__ngtouch.nodeSECornerClient('A'));
  await oneFingerDrag({ x: se.x, y: se.y }, { x: se.x + 120, y: se.y + 70 }, 14);
  const after = await state();

  expectThat(
    'ng-touch: a ONE-FINGER drag on the SE resize handle GROWS the node ' +
      '(the SHARED SelectionToolsController, not a dead handle component)',
    after.aSize.width - before.aSize.width > 80 && after.aSize.height - before.aSize.height > 40,
    `size ${before.aSize.width}x${before.aSize.height} -> ${after.aSize.width}x${after.aSize.height} (expected ~+120/+70)`
  );
  expectThat(
    'ng-touch: resizing anchors the NW corner and does not pan',
    Math.abs(after.a.x - before.a.x) < 2 && Math.abs(after.a.y - before.a.y) < 2,
    `node A ${JSON.stringify(before.a)} -> ${JSON.stringify(after.a)}`
  );
}

// =============================================================================
// 4. Two-finger pinch zoom (REAL multi-touch)
// =============================================================================
{
  await reset();
  const before = await state();
  await pinch({ x: 500, y: 350 }, 120, 320); // spread → zoom IN
  const zoomedIn = await state();

  expectThat(
    'ng-touch: PINCH OUT zooms in (finger gap 120 -> 320 ⇒ expect ~2.67x)',
    zoomedIn.zoom > before.zoom * 1.6,
    `zoom ${before.zoom.toFixed(3)} -> ${zoomedIn.zoom.toFixed(3)}`
  );

  await pinch({ x: 500, y: 350 }, 320, 120); // pinch → zoom OUT
  const zoomedOut = await state();
  expectThat(
    'ng-touch: PINCH IN zooms back out',
    zoomedOut.zoom < zoomedIn.zoom * 0.7,
    `zoom ${zoomedIn.zoom.toFixed(3)} -> ${zoomedOut.zoom.toFixed(3)}`
  );
  expectThat(
    'ng-touch: a pinch never mutates the model',
    zoomedOut.a.x === before.a.x && zoomedOut.a.y === before.a.y,
    `node A ${JSON.stringify(before.a)} -> ${JSON.stringify(zoomedOut.a)}`
  );
}

// Pinch anchor: the world point under the pinch centre must stay put (<8px).
{
  await reset();
  const anchor = { x: 500, y: 350 };
  const worldBefore = await page.evaluate((p) => window.__ngtouch.clientToWorld(p.x, p.y), anchor);
  await pinch(anchor, 140, 300);
  const worldAfter = await page.evaluate((p) => window.__ngtouch.clientToWorld(p.x, p.y), anchor);

  const drift = Math.hypot(worldAfter.x - worldBefore.x, worldAfter.y - worldBefore.y);
  expectThat(
    'ng-touch: PINCH IS ANCHORED — world point under the fingers drifts <8px',
    drift < 8,
    `drift ${drift.toFixed(2)}px [(${worldBefore.x.toFixed(1)}, ${worldBefore.y.toFixed(1)}) -> ` +
      `(${worldAfter.x.toFixed(1)}, ${worldAfter.y.toFixed(1)})]`
  );
}

// =============================================================================
// 5. Two-finger pan (constant gap ⇒ pure pan, no zoom)
// =============================================================================
{
  await reset();
  const before = await state();
  const pair = (cx, cy) => [
    { x: cx - 60, y: cy, id: 1 },
    { x: cx + 60, y: cy, id: 2 },
  ];
  await touchStart(pair(500, 350));
  for (let i = 1; i <= 12; i++) {
    await touchMove(pair(500 - i * 10, 350 - i * 5));
  }
  await touchEnd();
  await page.waitForTimeout(60);
  const after = await state();

  const dx = after.viewport.x - before.viewport.x;
  expectThat(
    'ng-touch: TWO-FINGER PAN (constant gap) pans without zooming',
    dx > 80 && Math.abs(after.zoom - before.zoom) < 0.06,
    `viewport.x +${dx.toFixed(1)}, zoom ${before.zoom.toFixed(3)} -> ${after.zoom.toFixed(3)}`
  );
}

// =============================================================================
// 6. THE CONTROL — touch-action:auto must KILL the pan
// =============================================================================
{
  await reset();
  await page.evaluate(() => window.__ngtouch.setTouchAction('auto'));
  const before = await state();
  await oneFingerDrag({ x: 850, y: 620 }, { x: 650, y: 470 });
  const after = await state();

  const dx = Math.abs(after.viewport.x - before.viewport.x);
  const dy = Math.abs(after.viewport.y - before.viewport.y);
  // < 20, same as the renderer harness's control: Chromium delivers a few
  // pointermoves BEFORE its scroll-intent detection claims the gesture, so a
  // handful of px leak through even when touch-action is genuinely
  // load-bearing. The discriminating gap is wide: a broken touch-action would
  // deliver the whole ~200px drag.
  expectThat(
    'CONTROL: with touch-action:auto the browser steals the gesture — the 200px drag must be dead ' +
      '(if this pans, every other verdict in this run is meaningless)',
    dx < 20 && dy < 20,
    dx < 20
      ? `canvas stayed put (Δ${dx.toFixed(1)}, ${dy.toFixed(1)}px of a 200px drag) — touch-action is genuinely load-bearing`
      : `canvas panned (${dx.toFixed(1)}, ${dy.toFixed(1)})px ANYWAY — the control is blind`
  );

  // Restore, and prove the pan comes BACK (the control did not wedge the page).
  await page.evaluate(() => window.__ngtouch.setTouchAction('none'));
  await reset();
  const before2 = await state();
  await oneFingerDrag({ x: 850, y: 620 }, { x: 650, y: 470 });
  const after2 = await state();
  const dx2 = after2.viewport.x - before2.viewport.x;
  expectThat(
    'CONTROL: restoring touch-action:none brings the pan back',
    Math.abs(dx2 - 200) < 30,
    `viewport.x moved ${dx2.toFixed(1)}, expected ~200`
  );
}

// =============================================================================
// Verdict
// =============================================================================
let failed = 0;
for (const e of EXPECT) {
  const mark = e.pass ? 'PASS' : 'FAIL';
  if (!e.pass) failed++;
  console.log(`[${mark}] ${e.name}${e.detail ? ` — ${e.detail}` : ''}`);
}
if (pageErrors.length) {
  console.log('\nPAGE ERRORS:');
  for (const err of pageErrors) console.log('  ' + err);
  failed++;
}
console.log(`\n${EXPECT.length - failed}/${EXPECT.length} scenarios green`);

await browser.close();
process.exit(failed === 0 ? 0 : 1);
