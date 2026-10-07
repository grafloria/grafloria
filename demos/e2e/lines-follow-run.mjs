// THE LINES-FOLLOW GATE.
//
// Drags boxes in every demo with a real mouse and checks that every line touching a
// dragged box still starts / ends on it, is still drawn, and keeps its labels on it.
//
// WHY THIS EXISTS: the AI-style demo shipped with every gate green and was never once
// DRAGGED. The first person to drag "Our API" out of its zone found a hand-bent line
// hanging where the box used to be (its render was cached and never re-run), labels
// floating in open space (they sat on the chord between a bent line's ends), and a line
// detouring round a note's invisible box. The visual gate compares still frames; the
// gallery gate runs each page's own assert, which only checks what its author thought
// of. Neither moves anything the author did not. This one moves the busiest boxes of
// EVERY page and holds the lines to them — so a line that stops following its box cannot
// pass anywhere, not only on the page where someone happened to notice.
//
// Each check is RELATIVE to the same line before the drag (arrowheads stop short of a
// box; some pages draw lines from ports that stand off the outline; some labels are
// offset on purpose): a line must be as attached, and a label as close, after the drag
// as before it.
//
//     node demos/e2e/lines-follow-run.mjs            # every demo
//     node demos/e2e/lines-follow-run.mjs diagrams   # one category

import { chromium } from 'playwright';
import { readdirSync, statSync, readFileSync } from 'fs';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join, relative, extname, sep } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

function demoPages(dir = root, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'shell' || entry === 'e2e' || entry === 'node_modules') continue;
      demoPages(full, out);
    } else if (entry.endsWith('.html') && entry !== 'index.html') {
      out.push(full);
    }
  }
  return out;
}

const filter = process.argv[2];
const pages = demoPages().filter((p) => !filter || relative(root, p).startsWith(filter)).sort();
if (pages.length === 0) {
  console.log(`no demos found${filter ? ` under "${filter}"` : ''}`);
  process.exit(1);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};
const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  const file = join(root, url === '/' ? 'index.html' : url);
  try {
    const body = readFileSync(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const MAX_BOXES = 3; // the busiest boxes of each page
const DRAG = { dx: 40, dy: 30, steps: 8 }; // a hand's move, not a crawl
const ATTACH_SLACK = 8; // world px a line end may drift further from its box than before
const LABEL_SLACK = 12; // world px a label may drift further from its line than before

/** In the page: the model, whatever the demo named it. */
const MODEL = `(() => { const c = window.__demoCtx || {}; return c.diagram || (c.instance && c.instance.getModel && c.instance.getModel()) || (c.engine && c.engine.getDiagram && c.engine.getDiagram()) || null; })()`;

/** In the page: the boxes worth dragging — the most lines, visible, movable, not a note. */
async function candidates(tab) {
  return tab.evaluate(({ MODEL, MAX_BOXES }) => {
    const m = (0, eval)(MODEL);
    if (!m || !m.getLinks || !m.getNodes) return null;
    const count = new Map();
    for (const l of m.getLinks()) {
      for (const id of [l.sourceNodeId, l.targetNodeId]) if (id) count.set(id, (count.get(id) ?? 0) + 1);
    }
    const out = [];
    for (const n of m.getNodes()) {
      if (!count.get(n.id)) continue;
      if (n.state && n.state.locked) continue;
      if ((n.getMetadata('shape') || {}).type === 'text') continue;
      const el = document.querySelector(`[data-node-id="${CSS.escape(n.id)}"]`);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) continue;
      if (r.left < 0 || r.top < 0 || r.right > innerWidth - 60 || r.bottom > innerHeight - 50) continue;
      // the press point must land on THIS box, not on something drawn over it
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const hit = document.elementFromPoint(cx, cy);
      if (!hit || !hit.closest || hit.closest('[data-node-id]') !== el) continue;
      out.push({ id: n.id, links: count.get(n.id), cx, cy });
    }
    out.sort((a, b) => b.links - a.links || (a.id < b.id ? -1 : 1));
    return out.slice(0, MAX_BOXES);
  }, { MODEL, MAX_BOXES });
}

/** In the page: for every line touching `id`, how far its end is from the box and its labels from the line. */
async function measure(tab, id) {
  return tab.evaluate(({ MODEL, id }) => {
    const m = (0, eval)(MODEL);
    const n = m.getNode(id);
    const rect = { x: n.position.x, y: n.position.y, w: n.size.width, h: n.size.height };
    const off = (p) => {
      const dx = Math.max(rect.x - p.x, 0, p.x - (rect.x + rect.w));
      const dy = Math.max(rect.y - p.y, 0, p.y - (rect.y + rect.h));
      return Math.hypot(dx, dy);
    };
    const out = {};
    for (const l of m.getLinks()) {
      const end = l.sourceNodeId === id ? 'start' : l.targetNodeId === id ? 'end' : null;
      if (!end) continue;
      const g = document.querySelector(`[data-link-id="${CSS.escape(l.id)}"]`);
      const paths = g ? Array.from(g.querySelectorAll('path')).filter((p) => !p.closest('.link-hit-area, .link-state-casing, .arrow, marker, defs') && !p.classList.contains('link-hit-area') && !p.classList.contains('arrow') && p.getAttribute('d')) : [];
      let path = null, best = -1;
      for (const p of paths) { try { const L = p.getTotalLength(); if (L > best) { best = L; path = p; } } catch { /* not measurable */ } }
      if (!path || best <= 0) { out[l.id] = { drawn: false }; continue; }
      const L = path.getTotalLength();
      const at = path.getPointAtLength(end === 'start' ? 0 : L);
      const samples = [];
      for (let i = 0; i <= 64; i++) { const q = path.getPointAtLength((L * i) / 64); samples.push({ x: q.x, y: q.y }); }
      const labels = [];
      for (const lg of g.querySelectorAll('.link-label-group')) {
        const t = /translate\(\s*([-\d.e]+)[ ,]+([-\d.e]+)/.exec(lg.getAttribute('transform') || '');
        if (!t) continue;
        const p = { x: Number(t[1]), y: Number(t[2]) };
        let d = Infinity;
        for (let i = 0; i < samples.length - 1; i++) {
          const a = samples[i], b = samples[i + 1];
          const dx = b.x - a.x, dy = b.y - a.y, LL = dx * dx + dy * dy || 1;
          const u = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / LL));
          d = Math.min(d, Math.hypot(a.x + u * dx - p.x, a.y + u * dy - p.y));
        }
        labels.push({ key: lg.getAttribute('data-label-id') || String(labels.length), text: (lg.textContent || '').trim().slice(0, 30), d });
      }
      out[l.id] = { drawn: true, end, off: off(at), labels };
    }
    return { pos: { ...n.position }, links: out };
  }, { MODEL, id });
}

const browser = await chromium.launch();
const results = [];
let drags = 0, lines = 0, noBoxes = 0;

for (const page of pages) {
  const rel = relative(root, page);
  const tab = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const pageErrors = [];
  tab.on('pageerror', (e) => pageErrors.push(String(e)));
  const res = { rel, ok: true, failures: [], dragged: 0, checked: 0, skipped: [] };

  try {
    await tab.goto(origin + '/' + rel.split(sep).join('/'));
    await tab.waitForFunction(() => window.__demoReady === true, { timeout: 15000 });
    await tab.waitForTimeout(250);
    const boxes = await candidates(tab);
    if (!boxes || boxes.length === 0) {
      noBoxes++;
      res.none = true;
    } else {
      for (const b of boxes) {
        // re-read the press point: an earlier drag may have moved things
        const fresh = (await candidates(tab))?.find((c) => c.id === b.id) ?? null;
        if (!fresh) { res.skipped.push(`${b.id} (covered or out of view after an earlier drag)`); continue; }
        const before = await measure(tab, b.id);
        await tab.mouse.move(fresh.cx, fresh.cy);
        await tab.mouse.down();
        await tab.mouse.move(fresh.cx + DRAG.dx, fresh.cy + DRAG.dy, { steps: DRAG.steps });
        await tab.mouse.up();
        await tab.mouse.move(5, 795); // park the pointer off the canvas
        await tab.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        await tab.waitForTimeout(250);
        const after = await measure(tab, b.id);
        const moved = Math.hypot(after.pos.x - before.pos.x, after.pos.y - before.pos.y);
        if (moved < 10) { res.skipped.push(`${b.id} (did not move — not draggable here)`); continue; }
        res.dragged++; drags++;
        for (const [lid, a0] of Object.entries(before.links)) {
          const a1 = after.links[lid];
          if (!a0.drawn) continue;
          res.checked++; lines++;
          if (!a1 || !a1.drawn) { res.failures.push(`dragging "${b.id}": line ${lid} is no longer drawn`); continue; }
          if (a1.off > a0.off + ATTACH_SLACK) {
            res.failures.push(`dragging "${b.id}": line ${lid} no longer ${a1.end === 'start' ? 'starts' : 'ends'} on it — ${a1.off.toFixed(0)} px off (was ${a0.off.toFixed(0)})`);
          }
          for (const lab of a1.labels) {
            const was = a0.labels.find((x) => x.key === lab.key);
            if (was && lab.d > was.d + LABEL_SLACK) {
              res.failures.push(`dragging "${b.id}": the label "${lab.text}" of line ${lid} drifted ${lab.d.toFixed(0)} px off its line (was ${was.d.toFixed(0)})`);
            }
          }
        }
      }
    }
  } catch (e) {
    res.failures.push(`harness: ${e.message.split('\n')[0]}`);
  }
  for (const e of pageErrors) res.failures.push(`PAGE ERROR: ${e}`);
  res.ok = res.failures.length === 0;
  await tab.close();
  results.push(res);

  const mark = res.ok ? (res.none ? '·' : '✓') : '✗';
  const what = res.none ? 'no draggable box with lines' : `${res.dragged} box(es) dragged, ${res.checked} line(s) held`;
  console.log(`${mark} ${rel}  (${what})`);
  for (const f of res.failures) console.log(`    ${f}`);
}

await browser.close();
server.close();

const failed = results.filter((r) => !r.ok);
console.log('');
console.log(`lines-follow: ${results.length - failed.length}/${results.length} demos pass · ${drags} boxes dragged · ${lines} lines held · ${noBoxes} demos had no box with lines to drag`);
if (failed.length) {
  console.log('A LINE THAT DOES NOT FOLLOW ITS BOX IS BROKEN, WHATEVER THE STILL FRAME SAYS.');
  process.exit(1);
}
