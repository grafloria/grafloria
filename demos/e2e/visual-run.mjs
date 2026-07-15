// THE VISUAL GATE — "does it still LOOK right", as CI.
//
// gallery-run.mjs proves every demo's feature still WORKS. It is blind to what the
// page paints: the screenshot audit of 2026-07-15 found 47 visual defects — fish-hook
// edges, labels hidden behind nodes, a blank canvas over true status text — sitting
// behind 89 green asserts. This runner closes that class: it re-captures every demo
// (boot / after / showcase) and pixel-diffs each frame against a blessed golden.
//
//     node demos/e2e/visual-run.mjs             # gate: shoot → diff vs goldens
//     node demos/e2e/visual-run.mjs --update    # re-bless: shoot TWICE, measure each
//                                               # demo's own jitter, write goldens +
//                                               # tolerances.json derived from evidence
//
// DESIGN NOTES
//  - The diff runs INSIDE headless Chromium (canvas getImageData): the repo already
//    ships a browser with every gate, so the differ adds zero dependencies. Images
//    are served over HTTP because a file:// image taints the canvas.
//  - Tolerances are MEASURED, not guessed: --update captures twice and derives each
//    frame's tolerance from its own run-to-run jitter (animations, live counters).
//    A frame whose jitter exceeds EXCLUDE_PCT is excluded — loudly, with its number,
//    in tolerances.json and in every run's output. No silent caps.
//  - Goldens are per-platform (font rasterization differs across OSes). Re-bless
//    with --update when adopting a new platform or after a DELIBERATE visual change.
//  - A failing frame writes <name>.diff.png (magenta = changed pixels) next to the
//    fresh capture so the regression is inspectable, not just counted.

import { chromium } from 'playwright';
import { spawnSync } from 'child_process';
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync } from 'fs';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join, extname } from 'path';
import { tmpdir } from 'os';

const here = dirname(fileURLToPath(import.meta.url));
const GOLDENS = join(here, 'goldens');
const TOLERANCES = join(GOLDENS, 'tolerances.json');

// Per-channel delta below this is "the same pixel" (antialiasing wobble).
const CHANNEL_THRESHOLD = 25;
// Floor for every frame: even a byte-stable page gets this much slack. Kept
// TIGHT (0.02% ≈ 200px at 1280×800) because the bless run measures real
// run-to-run jitter and 182/186 frames measured ~zero — a mutation test proved
// a 0.15% floor swallows a real label change (~500px), which is exactly the
// size of bug this gate exists to catch.
const MIN_TOLERANCE_PCT = 0.02;
// Jitter → tolerance headroom: a frame that wobbles by J% on identical code may
// wobble a bit more next run without that being a regression.
const JITTER_MARGIN = 3;
// A frame this unstable cannot gate — excluded, loudly.
const EXCLUDE_PCT = 5;

const update = process.argv.includes('--update');

function shoot(outDir) {
  rmSync(outDir, { recursive: true, force: true });
  const r = spawnSync('node', [join(here, 'shoot.mjs'), '--out', outDir], {
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  if (r.status !== 0) {
    console.error('shoot.mjs failed — cannot proceed');
    process.exit(1);
  }
}

const pngsIn = (dir) =>
  readdirSync(dir).filter((f) => f.endsWith('.png') && !f.endsWith('.diff.png')).sort();

/** Serve two directories as /a/* and /b/* so the comparator page can load both. */
function serve(dirA, dirB) {
  const server = createServer((req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    const m = url.match(/^\/(a|b)\/(.+)$/);
    if (!m) return void res.writeHead(404).end();
    try {
      const body = readFileSync(join(m[1] === 'a' ? dirA : dirB, m[2]));
      res.writeHead(200, { 'Content-Type': extname(m[2]) === '.png' ? 'image/png' : 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

/**
 * Pixel-diff a list of same-named PNGs in dirA vs dirB inside one Chromium page.
 * Returns [{ file, pct, diffDataUrl? }] — diffDataUrl only when wantDiffImage.
 */
async function diffDirs(dirA, dirB, files, { wantDiffImage = false } = {}) {
  const server = await serve(dirA, dirB);
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`${origin}/a/${files[0] ?? ''}`).catch(() => {});
  const results = await page.evaluate(
    async ({ files, origin, threshold, wantDiffImage }) => {
      const load = (url) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => resolve(null);
          img.src = url;
        });
      const out = [];
      for (const file of files) {
        const [a, b] = await Promise.all([load(`${origin}/a/${file}`), load(`${origin}/b/${file}`)]);
        if (!a || !b) { out.push({ file, pct: 100, missing: !a ? 'golden' : 'capture' }); continue; }
        if (a.width !== b.width || a.height !== b.height) { out.push({ file, pct: 100, sizeMismatch: true }); continue; }
        const w = a.width, h = a.height;
        const ca = new OffscreenCanvas(w, h).getContext('2d', { willReadFrequently: true });
        const cb = new OffscreenCanvas(w, h).getContext('2d', { willReadFrequently: true });
        ca.drawImage(a, 0, 0); cb.drawImage(b, 0, 0);
        const da = ca.getImageData(0, 0, w, h).data;
        const db = cb.getImageData(0, 0, w, h).data;
        let diff = 0;
        let diffImage = null;
        const mark = wantDiffImage ? new Uint8ClampedArray(da.length) : null;
        for (let i = 0; i < da.length; i += 4) {
          const changed =
            Math.abs(da[i] - db[i]) > threshold ||
            Math.abs(da[i + 1] - db[i + 1]) > threshold ||
            Math.abs(da[i + 2] - db[i + 2]) > threshold;
          if (changed) {
            diff++;
            if (mark) { mark[i] = 255; mark[i + 1] = 0; mark[i + 2] = 255; mark[i + 3] = 255; }
          } else if (mark) {
            // faded original for context
            mark[i] = 235 + (da[i] >> 4); mark[i + 1] = 235 + (da[i + 1] >> 4); mark[i + 2] = 235 + (da[i + 2] >> 4); mark[i + 3] = 255;
          }
        }
        const pct = (diff / (w * h)) * 100;
        if (mark && diff > 0) {
          const dc = new OffscreenCanvas(w, h);
          dc.getContext('2d').putImageData(new ImageData(mark, w, h), 0, 0);
          const blob = await dc.convertToBlob({ type: 'image/png' });
          diffImage = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
        }
        out.push({ file, pct, diffDataUrl: diffImage });
      }
      return out;
    },
    { files, origin, threshold: CHANNEL_THRESHOLD, wantDiffImage }
  );
  await browser.close();
  server.close();
  return results;
}

if (update) {
  // ---- BLESS: capture THREE times, measure jitter across all pairs ----
  // Two shots under-sample a frame that only occasionally wobbles (turbo-flow's
  // glow filter renders identically most pairs, then differs ~0.04% on one) —
  // so a 2-shot bless hands it the tight floor and it flakes at gate time. Three
  // rounds and the MAX pairwise diff catch the real worst-case jitter, so an
  // inherently noisy frame earns a realistic tolerance while stable frames keep
  // the 0.02% floor.
  const runA = join(tmpdir(), 'grafloria-visual-a');
  const runB = join(tmpdir(), 'grafloria-visual-b');
  const runC = join(tmpdir(), 'grafloria-visual-c');
  console.log('capturing run 1/3…'); shoot(runA);
  console.log('capturing run 2/3 (jitter)…'); shoot(runB);
  console.log('capturing run 3/3 (jitter)…'); shoot(runC);

  const files = pngsIn(runA);
  const [jAB, jAC, jBC] = await Promise.all([diffDirs(runA, runB, files), diffDirs(runA, runC, files), diffDirs(runB, runC, files)]);
  const worstJitter = new Map();
  for (const set of [jAB, jAC, jBC]) for (const { file, pct } of set) worstJitter.set(file, Math.max(worstJitter.get(file) ?? 0, pct));

  const tolerances = {};
  const excluded = [];
  for (const [file, pct] of worstJitter) {
    if (pct > EXCLUDE_PCT) {
      tolerances[file] = { excluded: true, measuredJitterPct: +pct.toFixed(3) };
      excluded.push(`${file} (jitter ${pct.toFixed(2)}%)`);
    } else {
      tolerances[file] = {
        tolerancePct: +Math.max(MIN_TOLERANCE_PCT, pct * JITTER_MARGIN).toFixed(3),
        measuredJitterPct: +pct.toFixed(4),
      };
    }
  }

  rmSync(GOLDENS, { recursive: true, force: true });
  mkdirSync(GOLDENS, { recursive: true });
  for (const f of files) cpSync(join(runA, f), join(GOLDENS, f));
  cpSync(join(runA, 'manifest.json'), join(GOLDENS, 'manifest.json'));
  writeFileSync(TOLERANCES, JSON.stringify(tolerances, null, 1));

  console.log(`\nblessed ${files.length} goldens → ${GOLDENS}`);
  if (excluded.length) {
    console.log(`\nEXCLUDED (too jittery to gate — every run will re-print this list):`);
    for (const e of excluded) console.log(`  ~ ${e}`);
  }
  process.exit(0);
}

// ---- GATE: capture once, diff vs goldens ----
if (!existsSync(TOLERANCES)) {
  console.error('no goldens — run `node demos/e2e/visual-run.mjs --update` first');
  process.exit(1);
}
const tolerances = JSON.parse(readFileSync(TOLERANCES, 'utf8'));
const current = join(tmpdir(), 'grafloria-visual-current');
console.log('capturing…'); shoot(current);

const goldenFiles = pngsIn(GOLDENS);
const currentFiles = new Set(pngsIn(current));
const gated = goldenFiles.filter((f) => !tolerances[f]?.excluded);
const excludedList = goldenFiles.filter((f) => tolerances[f]?.excluded);

// A demo added since the last bless has no golden: fail — bless it in.
const newFrames = [...currentFiles].filter((f) => !goldenFiles.includes(f));

const results = await diffDirs(GOLDENS, current, gated, { wantDiffImage: true });
let failures = 0;
for (const r of results) {
  const tol = tolerances[r.file]?.tolerancePct ?? MIN_TOLERANCE_PCT;
  const ok = !r.missing && !r.sizeMismatch && r.pct <= tol;
  if (!ok) {
    failures++;
    const why = r.missing ? `missing ${r.missing}` : r.sizeMismatch ? 'size mismatch' : `diff ${r.pct.toFixed(3)}% > ${tol}%`;
    console.log(`✗ ${r.file}  (${why})`);
    if (r.diffDataUrl) {
      writeFileSync(join(current, r.file.replace(/\.png$/, '.diff.png')),
        Buffer.from(r.diffDataUrl.split(',')[1], 'base64'));
    }
  }
}

console.log('');
console.log(`visual: ${gated.length - failures}/${gated.length} frames match their goldens`);
if (excludedList.length) console.log(`        ${excludedList.length} excluded as jittery: ${excludedList.join(', ')}`);
if (newFrames.length) {
  failures += newFrames.length;
  console.log(`        ${newFrames.length} NEW frames have no golden (bless with --update): ${newFrames.join(', ')}`);
}
if (failures) {
  console.log(`\nfailures leave <name>.diff.png next to the capture in ${current}`);
  console.log('A PICTURE THAT CHANGED WITHOUT A BLESS IS A REGRESSION. This is the gate.');
}
process.exit(failures ? 1 : 0);
