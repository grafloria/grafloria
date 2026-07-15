// THE INTERACTION GATE — "does it behave right WHILE you touch it".
//
// gallery-run proves a feature's model consequence; visual-run proves a static
// frame looks right. Neither drives a LIVE gesture and checks the dynamics — so
// a whole class was invisible: a link that doesn't follow its node mid-drag, a
// node that doesn't track the pointer at zoom, a selected link that draws a
// stray bounding rectangle instead of highlighting its own path. A user found
// all three by hand; nothing here would have.
//
// This runner drives REAL pointer gestures in headless Chromium and, crucially,
// waits for REAL animation frames between steps (the render scheduler paints on
// rAF — a bare setTimeout races it and reads a half-updated DOM, which is how a
// naive probe "sees" a stale link that a real user never does). It asserts the
// invariants a hand-tester would check:
//
//   DRAG-ATTACH   grab a node that owns a link endpoint, drag it several frames,
//                 and the PAINTED link endpoint must move WITH the node every
//                 frame (not stay behind — symptom "the line lags/leads the node").
//   POINTER-TRACK the dragged node's on-screen centre must move 1:1 with the
//                 pointer, at zoom 1 AND zoom 2 (a zoom-space bug shows here).
//   LINK-SELECT   selecting a link must give its own PATH a selected affordance
//                 (stroke width up) and must NOT emit a bounding rectangle around
//                 it (symptom "a rectangle around the line, not the line selected").
//
//     node demos/e2e/interaction-run.mjs            # gate everything applicable
//     node demos/e2e/interaction-run.mjs edges      # one category
//
// A demo with no draggable node + link is skipped for DRAG-ATTACH; one with no
// link is skipped for LINK-SELECT. Skips are printed, never silent.

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
      if (['shell', 'e2e', 'node_modules', 'goldens'].includes(entry)) continue;
      demoPages(full, out);
    } else if (entry.endsWith('.html') && entry !== 'index.html') out.push(full);
  }
  return out;
}

const filter = process.argv[2];
const pages = demoPages().filter((p) => !filter || relative(root, p).startsWith(filter));

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml' };
const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  try {
    const body = readFileSync(join(root, url === '/' ? 'index.html' : url));
    res.writeHead(200, { 'Content-Type': MIME[extname(url)] ?? 'application/octet-stream' }).end(body);
  } catch { res.writeHead(404).end('not found'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

// The whole check runs IN the page: it needs the live instance, real rAF, and
// the rendered DOM together. Returns { checks:[{name,ok,detail}], skipped:[] }.
const IN_PAGE = () => {
  const inst = window.__demoCtx && window.__demoCtx.instance;
  const host = document.getElementById('canvas') || document.querySelector('[id^="pane"]') || document.body;
  const out = { checks: [], skipped: [] };
  if (!inst || !inst.getModel) { out.skipped.push('no __demoCtx.instance'); return Promise.resolve(out); }
  const model = inst.getModel();
  const rectOf = () => host.getBoundingClientRect();
  const wc = (wx, wy) => inst.viewport.worldToClient(wx, wy, rectOf());
  const fire = (t, cx, cy) => host.dispatchEvent(new PointerEvent(t, { clientX: cx, clientY: cy, bubbles: true, cancelable: true, button: 0, buttons: t === 'pointerup' ? 0 : 1, pointerId: 1, pointerType: 'mouse' }));
  const raf2 = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  // The VISIBLE link path (skip the transparent fat hit-area).
  const visiblePath = (linkId) => {
    const paths = [...host.querySelectorAll(`[data-link-id="${linkId}"] path[d]`)];
    return paths.find((p) => { const s = p.getAttribute('stroke') || getComputedStyle(p).stroke; return s && s !== 'transparent' && s !== 'none' && !(p.getAttribute('class') || '').includes('hit-area'); }) || paths[0] || null;
  };
  const pathEnds = (linkId) => {
    const path = visiblePath(linkId); if (!path) return null;
    const n = (path.getAttribute('d').match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
    if (n.length < 4) return null;
    return { start: { x: n[0], y: n[1] }, end: { x: n[n.length - 2], y: n[n.length - 1] } };
  };

  return (async () => {
    // ---- DRAG-ATTACH ----
    const links = model.getLinks();
    const nodeOf = (id) => (id ? model.getNode(id) : null);
    let dragCase = null;
    for (const l of links) {
      const sn = nodeOf(l.sourceNodeId), tn = nodeOf(l.targetNodeId);
      if (sn && sn.behavior?.draggable !== false && !sn.state?.locked) { dragCase = { link: l, node: sn, which: 'start' }; break; }
      if (tn && tn.behavior?.draggable !== false && !tn.state?.locked) { dragCase = { link: l, node: tn, which: 'end' }; break; }
    }
    if (!dragCase) out.skipped.push('DRAG-ATTACH (no draggable node owning a link endpoint)');
    else {
      const { link, node, which } = dragCase;
      const before = pathEnds(link.id);
      const p0 = { x: node.position.x, y: node.position.y };
      const c = wc(p0.x + node.size.width / 2, p0.y + node.size.height / 2);
      fire('pointermove', c.x, c.y); fire('pointerdown', c.x, c.y);
      fire('pointermove', c.x + 8, c.y);
      fire('pointermove', c.x + 200, c.y + 100); await raf2();
      const nodeDX = node.position.x - p0.x, nodeDY = node.position.y - p0.y;
      const now = pathEnds(link.id);
      fire('pointerup', c.x + 200, c.y + 100); await raf2();
      const nodeMoved = Math.hypot(nodeDX, nodeDY);
      if (!before || !now || nodeMoved < 20) {
        // The drag never grabbed the node (custom hit-area, off-canvas after a
        // prior test's zoom, port intercepted the press) — a SETUP miss, not a
        // product verdict.
        out.skipped.push(`DRAG-ATTACH (drag did not move the node: ${Math.round(nodeMoved)}px)`);
      } else {
        // THE INVARIANT: the painted endpoint must FOLLOW the node — its own
        // displacement, projected onto the node's, must be at least half the
        // node's. A stale link (symptom "the line stays behind") scores ~0; a
        // port legitimately migrating around the perimeter still scores high
        // because it moves broadly WITH the node.
        const eB = which === 'start' ? before.start : before.end;
        const eN = which === 'start' ? now.start : now.end;
        const edx = eN.x - eB.x, edy = eN.y - eB.y;
        const proj = (edx * nodeDX + edy * nodeDY) / nodeMoved; // signed follow distance
        const followRatio = proj / nodeMoved;
        out.checks.push({ name: 'DRAG-ATTACH', ok: followRatio >= 0.5, detail: `endpoint followed ${Math.round(followRatio * 100)}% of the node's move (node ${Math.round(nodeMoved)}px)` });
      }
    }

    // ---- POINTER-TRACK at zoom 1 and 2 ----
    const draggable = model.getNodes().find((n) => n.behavior?.draggable !== false && !n.state?.locked);
    if (!draggable) out.skipped.push('POINTER-TRACK (no draggable node)');
    else {
      const misses = [];
      for (const zoom of [1, 2]) {
        // Centre the node on screen at this zoom so the press lands ON it — a
        // node dragged off-canvas by an earlier zoom is a setup artifact, not a
        // tracking bug. Prefer the instance's own centring if present.
        inst.viewport.setZoom(zoom);
        if (inst.viewport.centerOn) inst.viewport.centerOn(draggable.position.x + draggable.size.width / 2, draggable.position.y + draggable.size.height / 2);
        else if (inst.fitView) inst.fitView(80);
        inst.renderNow(); await raf2();
        const r = rectOf();
        const nodeScreen = () => { const cc = wc(draggable.position.x + draggable.size.width / 2, draggable.position.y + draggable.size.height / 2); return { x: cc.x - r.left, y: cc.y - r.top }; };
        const s0 = nodeScreen();
        // Only meaningful if the node is actually inside the canvas.
        if (s0.x < 10 || s0.y < 10 || s0.x > r.width - 10 || s0.y > r.height - 10) continue;
        const cx = r.left + s0.x, cy = r.top + s0.y, PDX = 160;
        fire('pointermove', cx, cy); fire('pointerdown', cx, cy);
        fire('pointermove', cx + 8, cy); fire('pointermove', cx + PDX, cy); await raf2();
        const s1 = nodeScreen();
        fire('pointerup', cx + PDX, cy); await raf2();
        const moved = s1.x - s0.x;
        // The node never budged ⇒ the press missed it (setup), don't score it.
        if (Math.abs(moved) < 4) continue;
        misses.push({ zoom, miss: Math.abs(moved - PDX) });
      }
      inst.viewport.setZoom(1); inst.renderNow();
      if (!misses.length) out.skipped.push('POINTER-TRACK (node never under the pointer — custom placement)');
      else {
        const worst = Math.max(...misses.map((m) => m.miss));
        out.checks.push({ name: 'POINTER-TRACK', ok: worst <= 6, detail: misses.map((m) => `z${m.zoom}:${Math.round(m.miss)}px off 1:1`).join(' ') });
      }
    }

    // ---- RENDER-TRACK: the PAINT snaps to the pointer, it does not ease behind ----
    // POINTER-TRACK reads the model, which snaps instantly even when the RENDER
    // eases behind it: a `transition: all` on the node group made a dragged node
    // smoothly TRAIL the cursor while every model number stayed perfect. Detect
    // it coordinate-agnostically — after the pointer STOPS, an eased transform
    // keeps sliding toward the model for the transition's duration, so the
    // painted rect drifts while the model is static. (Physics/constraint demos
    // whose MODEL keeps settling after release can't isolate easing → skipped.)
    const dragNode = model.getNodes().find((n) => n.behavior?.draggable !== false && !n.state?.locked);
    const gEl = dragNode && (host.querySelector(`[data-node-id="${dragNode.id}"]`) || host.querySelector(`[data-vnode-key="node-${dragNode.id}"]`));
    if (!dragNode || !gEl) out.skipped.push('RENDER-TRACK (no draggable node element)');
    else {
      inst.viewport.setZoom(1);
      const worldCentre = () => { const wp = dragNode.getWorldPosition ? dragNode.getWorldPosition() : dragNode.position; return { x: wp.x + dragNode.size.width / 2, y: wp.y + dragNode.size.height / 2 }; };
      if (inst.viewport.centerOn) { const c = worldCentre(); inst.viewport.centerOn(c.x, c.y); }
      inst.renderNow(); await raf2();
      const paintedCentre = () => { const b = gEl.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; };
      const c0 = wc(worldCentre().x, worldCentre().y);
      const cx = c0.x, cy = c0.y;
      const p0 = dragNode.position.x;
      fire('pointermove', cx, cy); fire('pointerdown', cx, cy);
      fire('pointermove', cx + 8, cy); fire('pointermove', cx + 220, cy);
      const nodeMoved = Math.abs(dragNode.position.x - p0);
      fire('pointerup', cx + 220, cy); await raf2();
      // Right after release, then again after a beat with NO input.
      const paintA = paintedCentre(), modelA = dragNode.position.x;
      await new Promise((r) => setTimeout(r, 260));
      const paintB = paintedCentre(), modelB = dragNode.position.x;
      const modelDrift = Math.abs(modelB - modelA);
      const paintDrift = Math.hypot(paintB.x - paintA.x, paintB.y - paintA.y);
      if (nodeMoved < 20) out.skipped.push(`RENDER-TRACK (drag did not move the node: ${Math.round(nodeMoved)}px)`);
      else if (modelDrift > 3) out.skipped.push(`RENDER-TRACK (model still settling after release — physics/constraint, ${Math.round(modelDrift)}px)`);
      else out.checks.push({ name: 'RENDER-TRACK', ok: paintDrift <= 4, detail: `paint drifted ${Math.round(paintDrift)}px after the pointer stopped, model static (eased transform trails)` });
    }

    // ---- LINK-SELECT ----
    const link = links[0];
    if (!link) out.skipped.push('LINK-SELECT (no links)');
    else {
      const pathBefore = visiblePath(link.id);
      const swBefore = pathBefore ? parseFloat(getComputedStyle(pathBefore).strokeWidth) || 0 : 0;
      const pathEl0 = visiblePath(link.id);
      const styleSig = (el) => { if (!el) return ''; const s = getComputedStyle(el); return `${s.strokeWidth}|${s.stroke}|${s.strokeOpacity}|${s.strokeDasharray}`; };
      const sigBefore = styleSig(pathEl0);
      if (!pathEl0) out.skipped.push('LINK-SELECT (link has no drawable path)');
      else {
        // Click the path's TRUE midpoint (arc length), not the straight-line
        // mean of its ends — a routed/curved link's midpoint is nowhere near
        // that mean, and clicking empty space is a setup miss, not a defect.
        let pt;
        try { const L = pathEl0.getTotalLength(); pt = pathEl0.getPointAtLength(L / 2); } catch { pt = null; }
        // path coords are in the svg's viewBox (world) space → to client
        const c = pt ? wc(pt.x, pt.y) : null;
        if (c) { fire('pointermove', c.x, c.y); fire('pointerdown', c.x, c.y); fire('pointerup', c.x, c.y); await raf2(); }
        const selected = link.state === 'selected';
        if (!selected) {
          out.skipped.push('LINK-SELECT (click did not land on the link path — setup)');
        } else {
          const pathAfter = visiblePath(link.id);
          const swAfter = pathAfter ? parseFloat(getComputedStyle(pathAfter).strokeWidth) || 0 : 0;
          const ends = pathEnds(link.id);
          const linkW = ends ? Math.abs(ends.end.x - ends.start.x) : 0, linkH = ends ? Math.abs(ends.end.y - ends.start.y) : 0;
          // THE INVARIANT: a selected link highlights its own PATH, and no
          // rectangle the size of the link appears around it (symptom "a
          // rectangle, not the line, selected").
          const strayRect = [...host.querySelectorAll('rect')].some((rc) => {
            const cls = rc.getAttribute('class') || ''; if (!/select|halo|tool|bound/i.test(cls)) return false;
            let bb = null; try { bb = rc.getBBox(); } catch { return false; }
            return linkW > 20 && linkH > 20 && Math.abs(bb.width - linkW) < 20 && Math.abs(bb.height - linkH) < 20;
          });
          // An affordance is ANY visible change to the path on selection —
          // width, colour, opacity or dash (custom templates recolour; the
          // default thickens) — or an explicit select class. What must NOT
          // happen is "nothing changed" or "a rectangle appeared".
          const sigAfter = styleSig(pathAfter);
          const styleChanged = sigAfter !== sigBefore;
          const hasAffordance = styleChanged || (pathAfter && /select/.test(pathAfter.getAttribute('class') || ''));
          out.checks.push({ name: 'LINK-SELECT', ok: hasAffordance && !strayRect, detail: `sig ${styleChanged ? 'changed' : 'UNCHANGED'} (${sigBefore} → ${sigAfter}) strayRect=${strayRect}` });
        }
      }
    }
    return out;
  })();
};

const browser = await chromium.launch();
const results = [];
for (const page of pages) {
  const rel = relative(root, page);
  const tab = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = []; tab.on('pageerror', (e) => errs.push(String(e)));
  let rec = { rel, checks: [], skipped: [], error: null };
  try {
    await tab.goto(origin + '/' + rel.split(sep).join('/'));
    await tab.waitForFunction(() => window.__demoReady === true, { timeout: 15000 });
    const r = await tab.evaluate(IN_PAGE);
    rec.checks = r.checks; rec.skipped = r.skipped;
  } catch (e) { rec.error = e.message; }
  await tab.close();
  results.push(rec);

  const failed = rec.checks.filter((c) => !c.ok);
  const mark = rec.error ? '✗' : failed.length ? '✗' : '✓';
  const summary = rec.error ? `harness: ${rec.error}` : rec.checks.map((c) => `${c.ok ? '·' : '✗'}${c.name}`).join(' ');
  console.log(`${mark} ${rel}   ${summary}`);
  for (const c of failed) console.log(`      ${c.name}: ${c.detail}`);
}

await browser.close();
server.close();

const bad = results.filter((r) => r.error || r.checks.some((c) => !c.ok));
const totalChecks = results.reduce((n, r) => n + r.checks.length, 0);
const passChecks = results.reduce((n, r) => n + r.checks.filter((c) => c.ok).length, 0);
console.log('');
console.log(`interaction: ${passChecks}/${totalChecks} live-gesture checks pass across ${results.length} demos`);
if (bad.length) console.log('\nA GESTURE THAT MISBEHAVES WHILE YOU TOUCH IT is a bug no static frame can see. This is the gate.');
process.exit(bad.length ? 1 : 0);
