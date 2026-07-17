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
  // The binder listens on the container the page passed to render() — which is
  // NOT always #canvas (mermaid-text mounts into #stage inside it; comments
  // splits canvas + panel). Derive the true container from the mounted svg:
  // events dispatched anywhere else never reach the binder and every gesture
  // silently no-ops.
  const svgRoot = document.querySelector('svg.grafloria-diagram');
  const host = (svgRoot && svgRoot.closest('.grafloria-diagram-root') && svgRoot.closest('.grafloria-diagram-root').parentElement)
    || document.getElementById('canvas') || document.querySelector('[id^="pane"]') || document.body;
  const out = { checks: [], skipped: [] };
  if (!inst || !inst.getModel) { out.skipped.push('no __demoCtx.instance'); return Promise.resolve(out); }
  const model = inst.getModel();
  const rectOf = () => host.getBoundingClientRect();
  const wc = (wx, wy) => inst.viewport.worldToClient(wx, wy, rectOf());
  let buttonDown = false;
  const fire = (t, cx, cy) => {
    if (t === 'pointerdown') buttonDown = true;
    // buttons must mirror REALITY: a browser never sends a pressed-button
    // pointermove without a preceding pointerdown, and a phantom buttons=1
    // move can arm drags/selections that pollute later checks on the page.
    const buttons = t === 'pointerup' ? 0 : t === 'pointerdown' ? 1 : buttonDown ? 1 : 0;
    if (t === 'pointerup') buttonDown = false;
    host.dispatchEvent(new PointerEvent(t, { clientX: cx, clientY: cy, bubbles: true, cancelable: true, button: 0, buttons, pointerId: 1, pointerType: 'mouse' }));
  };
  const raf2 = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  // ---- PAINT-CONSISTENT sampler (verdict reported at the end) ----
  // Every painted frame, every node the MODEL says intersects the viewport must
  // have a painted DOM group — judged against the PAINTED camera (the layer's
  // own CTM), never live viewport state: reading the model's newer camera
  // against the previous paint manufactures phantom misses (that skew fooled
  // the first live-report probe). One missing frame is legal — a model
  // mutation paints on the NEXT scheduled frame — so only a node missing on
  // 2+ CONSECUTIVE painted frames while on-screen is a defect ("nodes
  // disappear and come back while scrolling", live report).
  const sampler = { frames: 0, hits: [], stop: false, streaks: new Map() };
  if ((model.getNodes?.() || []).length > 120) {
    sampler.skip = 'PAINT-CONSISTENT (>120 nodes — per-frame sampling too heavy)';
  } else {
    const tick = () => {
      if (sampler.stop) return;
      sampler.frames++;
      try {
        const svg = host.querySelector('svg.grafloria-diagram');
        const layer = svg && (svg.querySelector('g.nodes-layer') || svg.querySelector('g'));
        const m = layer && layer.getScreenCTM && layer.getScreenCTM();
        if (svg && m) {
          const rect = svg.getBoundingClientRect();
          for (const n of model.getNodes()) {
            // Model-sanctioned invisibility (collapsed-group members set
            // state.visible=false) is not a paint defect.
            if (n.state && n.state.visible === false) { sampler.streaks.set(n.id, 0); continue; }
            const xs = [m.a * n.position.x + m.c * n.position.y + m.e,
                        m.a * (n.position.x + n.size.width) + m.c * (n.position.y + n.size.height) + m.e];
            const ys = [m.b * n.position.x + m.d * n.position.y + m.f,
                        m.b * (n.position.x + n.size.width) + m.d * (n.position.y + n.size.height) + m.f];
            const on = Math.max(...xs) > rect.x + 6 && Math.min(...xs) < rect.x + rect.width - 6
                    && Math.max(...ys) > rect.y + 6 && Math.min(...ys) < rect.y + rect.height - 6;
            if (!on) { sampler.streaks.set(n.id, 0); continue; }
            const el = host.querySelector(`[data-node-id="${n.id}"]`);
            const painted = el && getComputedStyle(el).display !== 'none';
            if (!painted) {
              const c = (sampler.streaks.get(n.id) || 0) + 1;
              sampler.streaks.set(n.id, c);
              if (c === 2 && sampler.hits.length < 8) sampler.hits.push(`${n.id}@f${sampler.frames}`);
            } else sampler.streaks.set(n.id, 0);
          }
        }
      } catch { /* a mid-mutation frame must not kill the sampler */ }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

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

    // ---- PORT-WIRE: pressing a port on a SELECTED node draws a wire, never resizes ----
    // The side resize handles sit at the edge midpoints — the exact anchors of
    // the default side ports — and the resize rung used to win the press: a user
    // aiming at the port glyph they could see got a 40px-wider node instead of a
    // wire. Select, hover the side port, press, pull: the node's SIZE must not
    // change and a connection must be live.
    const wireNode = model.getNodes().find((n) => n.behavior?.draggable !== false && !n.state?.locked && n.getPortBySide && n.getPortBySide('right'));
    if (!wireNode) out.skipped.push('PORT-WIRE (no node with a right port)');
    else {
      inst.viewport.setZoom(1);
      if (inst.viewport.centerOn) { const wp = wireNode.getWorldPosition ? wireNode.getWorldPosition() : wireNode.position; inst.viewport.centerOn(wp.x + wireNode.size.width / 2, wp.y + wireNode.size.height / 2); }
      inst.renderNow(); await raf2();
      const wp = wireNode.getWorldPosition ? wireNode.getWorldPosition() : wireNode.position;
      const centre = wc(wp.x + wireNode.size.width / 2, wp.y + wireNode.size.height / 2);
      // select
      fire('pointermove', centre.x, centre.y); fire('pointerdown', centre.x, centre.y); fire('pointerup', centre.x, centre.y); await raf2();
      const sizeBefore = { w: wireNode.size.width, h: wireNode.size.height };
      // hover the RIGHT port (edge midpoint), then press and pull away
      const portC = wc(wp.x + wireNode.size.width, wp.y + wireNode.size.height / 2);
      fire('pointermove', portC.x, portC.y); await raf2();
      const hovered = !!inst.interaction.getState().hoveredPort;
      if (!hovered || !wireNode.isSelected?.()) {
        // Ports hidden/custom hit areas, or selection intercepted — can't stage
        // the coincidence this check exists for.
        fire('pointerup', portC.x, portC.y);
        out.skipped.push('PORT-WIRE (could not stage selected-node + hovered-port)');
      } else {
        fire('pointerdown', portC.x, portC.y);
        fire('pointermove', portC.x + 60, portC.y + 30); await raf2();
        const connecting = !!inst.interaction.getState().isConnecting || !!inst.interaction.getState().isReconnectingLink;
        const grewW = Math.abs(wireNode.size.width - sizeBefore.w);
        const grewH = Math.abs(wireNode.size.height - sizeBefore.h);
        fire('pointerup', portC.x + 60, portC.y + 30); await raf2();
        // Whatever gesture won, it must NOT be a resize; and it should be a wire.
        out.checks.push({ name: 'PORT-WIRE', ok: connecting && grewW < 1 && grewH < 1, detail: `connecting=${connecting} sizeΔ=${Math.round(grewW)}×${Math.round(grewH)} (a resize here means the side handle swallowed the port press)` });
      }
    }

    // ---- LINK-SELECT ----
    const link = links[0];
    if (!link) out.skipped.push('LINK-SELECT (no links)');
    else {
      const pathBefore = visiblePath(link.id);
      const swBefore = pathBefore ? parseFloat(getComputedStyle(pathBefore).strokeWidth) || 0 : 0;
      // Sample the SAME element before and after — selection INSERTS a casing
      // path, which would shift a "first visible path" pick and corrupt the
      // comparison. The core stroke is `.diagram-link`.
      const corePath = () => host.querySelector(`[data-link-id="${link.id}"] path.diagram-link`) || visiblePath(link.id);
      const pathEl0 = corePath();
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
        // Self-contained: earlier checks may have left ANY selection state
        // behind; this check owns the default→selected transition.
        if (link.state !== 'default') link.setState('default');
        if (model.clearSelection) model.clearSelection();
        inst.renderNow(); await raf2();
        const stateBeforeClick = link.state;
        if (c) { fire('pointermove', c.x, c.y); fire('pointerdown', c.x, c.y); fire('pointerup', c.x, c.y); await raf2(); }
        // This check judges the AFFORDANCE, not the scheduler (RENDER-TRACK owns
        // timing) — force the paint so a coalesced frame can't fake "unchanged".
        inst.renderNow(); await raf2();
        const selected = link.state === 'selected';
        if (!selected) {
          out.skipped.push('LINK-SELECT (click did not land on the link path — setup)');
        } else {
          const pathAfter = corePath();
          const swAfter = pathAfter ? parseFloat(getComputedStyle(pathAfter).strokeWidth) || 0 : 0;
          const casing = !!host.querySelector(`[data-link-id="${link.id}"] .link-state-casing-selected`);
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
          const hasAffordance = styleChanged || casing || (pathAfter && /select/.test(pathAfter.getAttribute('class') || ''));
          const dump = [...host.querySelectorAll(`[data-link-id="${link.id}"] path`)].map((e) => e.getAttribute('class')).join(' + ');
          out.checks.push({ name: 'LINK-SELECT', ok: hasAffordance && !strayRect, detail: `sig ${styleChanged ? 'changed' : 'UNCHANGED'} casing=${casing} state=${stateBeforeClick}→${link.state} paths=[${dump}] (${sigBefore} → ${sigAfter})` });
        }
      }
    }
    // ---- LINK-SELECT-SPAN: the link is clickable along its RUN, not just at
    // its midpoint. The dagre-tree report ("not always easy to select the line
    // on all its points") survived every existing gate because LINK-SELECT
    // sampled exactly one point — the arc midpoint, the one place a bowed
    // smooth curve still touches its chord. Clicks at t≈0.3/0.7 on the PAINTED
    // path must select the same link. Samples inside the port grab core
    // (≤12px of the path ends) or under a node are setup, not defect → skipped.
    if (link) {
      // Resolved FRESH per sample: the first span click can re-render the page
      // (LOD demos re-tier on interaction) and replace the path element — a
      // stale element would sample the geometry of a picture no longer there.
      const freshSpanPath = () => host.querySelector(`[data-link-id="${link.id}"] path.diagram-link`) || visiblePath(link.id);
      if (!freshSpanPath()) out.skipped.push('LINK-SELECT-SPAN (no drawable path)');
      else {
        let L = 0;
        try { L = freshSpanPath().getTotalLength(); } catch { L = 0; }
        if (L < 60) out.skipped.push('LINK-SELECT-SPAN (link too short to span-sample)');
        else {
          const fails = [];
          let sampled = 0;
          for (const t of [0.3, 0.7]) {
            const spanPath = freshSpanPath();
            if (!spanPath) continue;
            let pt;
            try { L = spanPath.getTotalLength(); pt = spanPath.getPointAtLength(L * t); } catch { pt = null; }
            if (!pt) continue;
            const endA = spanPath.getPointAtLength(0), endB = spanPath.getPointAtLength(L);
            const distEnd = Math.min(Math.hypot(pt.x - endA.x, pt.y - endA.y), Math.hypot(pt.x - endB.x, pt.y - endB.y));
            if (distEnd <= 12) continue; // port grab core — wiring owns it by design
            if (model.getNodeAtPosition && model.getNodeAtPosition(pt.x, pt.y)) continue; // occluded by a node
            if (link.state !== 'default') link.setState('default');
            if (model.clearSelection) model.clearSelection();
            for (const l of model.getLinks()) if (l.state === 'selected') l.setState('default');
            inst.renderNow(); await raf2();
            const c = wc(pt.x, pt.y);
            fire('pointermove', c.x, c.y);
            // Earlier gate gestures may have MOVED nodes; if this sample now
            // sits inside a port's hover halo, the press is (by design) wiring
            // territory near the core — setup interference, not the defect
            // this check hunts (mid-path unselectable ink has no hovered port).
            if (inst.interaction.getState().hoveredPort) continue;
            fire('pointerdown', c.x, c.y); fire('pointerup', c.x, c.y); await raf2();
            sampled++;
            if (link.state !== 'selected') {
              const thief = model.getLinks().find((l) => l.id !== link.id && l.state === 'selected');
              const hovered = inst.interaction.getState().hoveredLink?.id ?? 'none';
              fails.push(`t=${t}@(${Math.round(pt.x)},${Math.round(pt.y)}): ${thief ? `sibling ${thief.id} stole the click` : `nothing selected (hoveredLink=${hovered})`}`);
            }
          }
          if (!sampled) out.skipped.push('LINK-SELECT-SPAN (all span samples occluded/near ends)');
          else out.checks.push({ name: 'LINK-SELECT-SPAN', ok: fails.length === 0, detail: fails.length ? fails.join('; ') : `${sampled} span clicks selected the link` });
        }
      }
    }

    // ---- ESC-CANCEL: Escape abandons a live connection drag ----
    // The user's bug pattern is GESTURE LIFECYCLE: starting is tested everywhere,
    // cancelling nowhere. A dangling preview line after Escape is the symptom.
    {
      const n = model.getNodes().find((x) => x.getPortBySide && x.getPortBySide('right') && x.behavior?.dragHandler?.isDragHandler !== true);
      if (!n) out.skipped.push('ESC-CANCEL (no ported node)');
      else {
        const wp = n.getWorldPosition ? n.getWorldPosition() : n.position;
        const pc = wc(wp.x + n.size.width, wp.y + n.size.height / 2);
        const linksBefore = model.getLinks().length;
        fire('pointermove', pc.x, pc.y); await raf2();
        if (!inst.interaction.getState().hoveredPort) {
          out.skipped.push('ESC-CANCEL (port not hoverable here)');
        } else {
          fire('pointerdown', pc.x, pc.y);
          fire('pointermove', pc.x + 80, pc.y + 40); await raf2();
          const wasConnecting = inst.interaction.getState().isConnecting;
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          await raf2(); inst.renderNow(); await raf2();
          const stillConnecting = inst.interaction.getState().isConnecting;
          const ghost = host.querySelector('.connection-preview-line');
          fire('pointerup', pc.x + 80, pc.y + 40); await raf2();
          const leaked = model.getLinks().length - linksBefore;
          if (!wasConnecting) out.skipped.push('ESC-CANCEL (press did not start a connection)');
          else out.checks.push({ name: 'ESC-CANCEL', ok: !stillConnecting && !ghost && leaked === 0, detail: `connecting after Esc=${stillConnecting} ghostPreview=${!!ghost} leakedLinks=${leaked}` });
        }
      }
    }

    // ---- HOVER-PORTS: on-hover visibility actually surfaces and hides ----
    {
      const cfgVis = String(inst.getEngine?.().getInteractionConfig?.().portVisibility ?? '').toLowerCase();
      const candidates = model.getNodes().filter((x) => x.getPorts && x.getPorts().length > 0 && x.behavior?.dragHandler?.isDragHandler !== true).slice(0, 5);
      if (candidates.length === 0 || (cfgVis && cfgVis !== 'on-hover' && cfgVis !== 'hover')) {
        out.skipped.push(`HOVER-PORTS (visibility=${cfgVis || 'n/a'} or no ported node)`);
      } else {
        // Stage honestly: the node must actually BE hovered at its centre (in a
        // dense cluster or under a frame, another element owns that pixel — a
        // staging miss, not a product verdict).
        let staged = null;
        for (const n of candidates) {
          if (inst.viewport.centerOn) { const wp0 = n.getWorldPosition ? n.getWorldPosition() : n.position; inst.viewport.centerOn(wp0.x + n.size.width / 2, wp0.y + n.size.height / 2); inst.renderNow(); await raf2(); }
          const wp = n.getWorldPosition ? n.getWorldPosition() : n.position;
          const c = wc(wp.x + n.size.width / 2, wp.y + n.size.height / 2);
          const r = rectOf();
          if (c.x < r.left + 5 || c.y < r.top + 5 || c.x > r.left + r.width - 5 || c.y > r.top + r.height - 5) continue;
          fire('pointermove', c.x, c.y); await raf2(); inst.renderNow(); await raf2();
          if (!n.state?.hovered) continue;
          staged = n; break;
        }
        if (!staged) out.skipped.push('HOVER-PORTS (no candidate node was hoverable at its centre)');
        else {
          const shown = host.querySelectorAll(`[data-ports-for="${staged.id}"] [data-port-id]`).length;
          // Unhover: a world point far from every node (query the model, not a guess).
          const r = rectOf();
          let off = { x: r.left + r.width - 6, y: r.top + r.height - 6 };
          fire('pointermove', off.x, off.y); await raf2(); inst.renderNow(); await raf2();
          const stillHovered = staged.state?.hovered === true;
          const hidden = host.querySelectorAll(`[data-ports-for="${staged.id}"] [data-port-id]`).length;
          if (stillHovered) out.skipped.push('HOVER-PORTS (could not unhover — canvas corner occupied)');
          else out.checks.push({ name: 'HOVER-PORTS', ok: shown > 0 && hidden === 0, detail: `hover shows ${shown} glyphs, unhover leaves ${hidden}` });
        }
      }
    }

    // ---- WHEEL-ANCHOR: ctrl+wheel zooms around the CURSOR ----
    {
      const n = model.getNodes()[0];
      if (!n) out.skipped.push('WHEEL-ANCHOR (no nodes)');
      else {
        inst.viewport.setZoom(1); inst.renderNow(); await raf2();
        const wp = n.getWorldPosition ? n.getWorldPosition() : n.position;
        const c0 = wc(wp.x + n.size.width / 2, wp.y + n.size.height / 2);
        host.dispatchEvent(new WheelEvent('wheel', { clientX: c0.x, clientY: c0.y, deltaY: -100, ctrlKey: true, bubbles: true, cancelable: true }));
        await raf2(); inst.renderNow(); await raf2();
        const z = inst.viewport.getZoom();
        const c1 = wc(wp.x + n.size.width / 2, wp.y + n.size.height / 2);
        inst.viewport.setZoom(1); inst.renderNow();
        if (z === 1) out.skipped.push('WHEEL-ANCHOR (ctrl+wheel zoom disabled here)');
        else out.checks.push({ name: 'WHEEL-ANCHOR', ok: Math.hypot(c1.x - c0.x, c1.y - c0.y) <= 4, detail: `zoom ${z.toFixed(2)}, point under cursor drifted ${Math.round(Math.hypot(c1.x - c0.x, c1.y - c0.y))}px` });
      }
    }

    // ---- EMPTY-DESELECT: clicking the void clears the selection ----
    {
      const n = model.getNodes().find((x) => x.behavior?.selectable !== false);
      if (!n || !model.selectNode) out.skipped.push('EMPTY-DESELECT (no selectable node)');
      else {
        // Find a click point that is (a) empty in the MODEL and (b) actually the
        // CANVAS under the pointer — side panels overlay the canvas on some
        // pages, and a click eaten by a panel proves nothing.
        const r = rectOf();
        const candidates = [
          { x: r.left + r.width - 8, y: r.top + r.height - 8 },
          { x: r.left + 8, y: r.top + r.height - 8 },
          { x: r.left + r.width - 8, y: r.top + 8 },
          { x: r.left + r.width / 2, y: r.top + r.height - 8 },
        ];
        let spot = null;
        for (const cnd of candidates) {
          const el = document.elementFromPoint(cnd.x, cnd.y);
          if (!el || !el.closest || !el.closest('svg.grafloria-diagram')) continue;
          if (el.closest('[data-node-id]') || el.closest('[data-link-id]')) continue;
          spot = cnd; break;
        }
        if (!spot) out.skipped.push('EMPTY-DESELECT (no reachable empty canvas point — panels cover it)');
        else {
          model.selectNode(n); inst.renderNow(); await raf2();
          fire('pointermove', spot.x, spot.y); fire('pointerdown', spot.x, spot.y); fire('pointerup', spot.x, spot.y); await raf2();
          const left = model.getSelectedNodes ? model.getSelectedNodes().length : -1;
          out.checks.push({ name: 'EMPTY-DESELECT', ok: left === 0, detail: `selection after void click: ${left}` });
        }
      }
    }

    // ---- DEL-RESTORE: keyboard Delete removes, undo restores (runs LAST) ----
    {
      const cm = inst.getEngine?.().commandManager;
      const n = model.getNodes().find((x) => x.behavior?.selectable !== false && !x.state?.locked && x.behavior?.dragHandler?.isDragHandler !== true);
      if (!n || !cm) out.skipped.push('DEL-RESTORE (no deletable node or command manager)');
      else {
        const id = n.id;
        const attached = model.getLinks().filter((l) => l.sourceNodeId === id || l.targetNodeId === id).length;
        model.selectNode(n); inst.renderNow(); await raf2();
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
        // The delete commits through async commands — poll briefly for it to land.
        let gone = false;
        for (let i = 0; i < 20 && !gone; i++) { await new Promise((r2) => setTimeout(r2, 10)); gone = !model.getNode(id); }
        await raf2();
        const dangling = model.getLinks().filter((l) => l.sourceNodeId === id || l.targetNodeId === id).length;
        let restored = false, undoError = '';
        try {
          if (gone && cm.canUndo()) { await cm.undo(); await raf2(); restored = !!model.getNode(id); }
        } catch (e) { undoError = String(e && e.message || e); }
        out.checks.push({ name: 'DEL-RESTORE', ok: gone && dangling === 0 && restored, detail: `deleted=${gone} danglingLinks=${dangling} (had ${attached}) undoRestored=${restored}${undoError ? ` undoThrew=${undoError}` : ''}` });
      }
    }

    // ---- HANDLE-TRACK: a dragged waypoint handle rides the pointer 1:1 ----
    // The wave15d bug shape on a different element: a stylesheet
    // `transition: all` on the handle eased its cx/cy 200ms behind the cursor
    // — "the line moves, then the point runs after it" (live report). Runs
    // LAST: it inserts a waypoint on an editable link and leaves the route
    // bent, which is residue no earlier check may inherit.
    {
      const link = model.getLinks().find((l) => l.points && l.points.length >= 2);
      if (!link) out.skipped.push('HANDLE-TRACK (no links)');
      else {
        link.setState('selected'); inst.renderNow(); await raf2();
        let handle = host.querySelector('circle.waypoint-handle');
        if (!handle) {
          // Editable links grow a waypoint where the selected body is clicked.
          const hitPath = host.querySelector(`[data-link-id="${link.id}"] path`);
          let mid = null;
          try { const L = hitPath.getTotalLength(); mid = hitPath.getPointAtLength(L / 2); } catch { /* no path */ }
          if (mid) {
            const c = wc(mid.x, mid.y);
            fire('pointerdown', c.x, c.y); fire('pointerup', c.x, c.y); await raf2();
            inst.renderNow(); await raf2();
            handle = host.querySelector('circle.waypoint-handle');
          }
        }
        if (!handle) out.skipped.push('HANDLE-TRACK (link is not waypoint-editable here)');
        else {
          const hb = handle.getBoundingClientRect();
          const start = { x: hb.x + hb.width / 2, y: hb.y + hb.height / 2 };
          const end = { x: start.x + 60, y: start.y + 40 };
          fire('pointermove', start.x, start.y);
          fire('pointerdown', start.x, start.y);
          fire('pointermove', start.x + 10, start.y + 6);
          fire('pointermove', end.x, end.y);
          await raf2();
          // Mid-drag, PAINTED handle centre vs the pointer — same element,
          // client space both sides, so easing shows up as raw pixels.
          const h2 = (host.querySelector('circle.waypoint-handle') || handle).getBoundingClientRect();
          const gap = Math.hypot((h2.x + h2.width / 2) - end.x, (h2.y + h2.height / 2) - end.y);
          fire('pointerup', end.x, end.y); await raf2();
          if (!inst.interaction.getState || gap === null) out.skipped.push('HANDLE-TRACK (no interaction state)');
          else out.checks.push({ name: 'HANDLE-TRACK', ok: gap <= 6, detail: `mid-drag the painted handle sat ${Math.round(gap)}px behind the pointer (an eased cx/cy trails the drag)` });
        }
      }
    }

    // ---- DEAD-BUTTON: every page button must DO something when clicked ----
    // layout-portfolio rendered five layout buttons and wired NONE of them (the
    // assert drove its own helper — live report: "i can't switch between the
    // options"). A button is judged by consequence: within a few frames of a
    // real click, SOMETHING observable changes (DOM mutation anywhere, or a
    // model change). Buttons that navigate or open pickers can opt out with
    // data-gate-inert.
    {
      const buttons = [...document.querySelectorAll('button')]
        .filter((b) => !b.closest('#grafloria-nav') && !b.closest('svg') && !b.hasAttribute('data-gate-inert'))
        .filter((b) => b.offsetParent !== null); // visible only
      if (buttons.length === 0) out.skipped.push('DEAD-BUTTON (no page buttons)');
      else {
        const dead = [];
        for (const b of buttons.slice(0, 12)) {
          // A DISABLED button is an expected no-op (execute-flow disables its
          // bar while a run is in flight) — skip, don't judge.
          if (b.disabled) continue;
          let mutated = false;
          const mo = new MutationObserver(() => { mutated = true; });
          mo.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
          const modelSig = JSON.stringify([model.getNodes().length, model.getLinks().length]);
          b.click();
          for (let i = 0; i < 20 && !mutated; i++) await new Promise((r) => setTimeout(r, 15));
          await raf2();
          mo.disconnect();
          const modelChanged = JSON.stringify([model.getNodes().length, model.getLinks().length]) !== modelSig;
          if (!mutated && !modelChanged) dead.push(b.textContent.trim().slice(0, 20) || '(unlabelled)');
        }
        out.checks.push({ name: 'DEAD-BUTTON', ok: dead.length === 0, detail: dead.length ? `buttons with no observable effect: ${dead.join(', ')}` : `${Math.min(buttons.length, 12)} buttons all cause a change` });
      }
    }

    // ---- PAINT-CONSISTENT: collect the sampler's verdict (covers ALL checks) ----
    {
      sampler.stop = true;
      if (sampler.skip) out.skipped.push(sampler.skip);
      else if (sampler.frames < 30) out.skipped.push(`PAINT-CONSISTENT (only ${sampler.frames} frames sampled)`);
      else out.checks.push({ name: 'PAINT-CONSISTENT', ok: sampler.hits.length === 0, detail: sampler.hits.length ? `on-screen nodes unpainted 2+ consecutive frames: ${sampler.hits.join(', ')} (${sampler.frames} frames)` : `${sampler.frames} frames clean` });
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

    // ---- FOCUS-RING (needs TRUSTED input — runs in the runner, not in-page) ----
    // Node/link groups carry tabindex=-1 for keyboard nav, and browsers MOUSE-
    // focus those on click: the UA then painted its focus ring around the
    // group's bbox — "a rectangle around the line" (live report, twice: first
    // the root svg, then the per-link group). Synthetic events are untrusted
    // and never move native focus, so the in-page harness physically cannot
    // see this; only a real Playwright click can. Keyboard focus must KEEP its
    // ring — that is what :focus-visible is for — so a click whose focus reads
    // keyboard-modality is skipped, never judged.
    try {
      const spots = await tab.evaluate(() => {
        const svg = document.querySelector('svg.grafloria-diagram');
        if (!svg) return [];
        const spots = [];
        const hit = svg.querySelector('path.link-hit-area') || svg.querySelector('[data-link-id] path');
        if (hit) {
          try {
            const L = hit.getTotalLength(); const pt = hit.getPointAtLength(L / 2);
            const m = hit.getScreenCTM();
            spots.push({ kind: 'link', x: m.a * pt.x + m.c * pt.y + m.e, y: m.b * pt.x + m.d * pt.y + m.f });
          } catch { /* zero-length path — nothing to click */ }
        }
        const ng = svg.querySelector('g.node-group[tabindex]');
        if (ng) {
          const bb = ng.getBoundingClientRect();
          spots.push({ kind: 'node', x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 });
        }
        // Empty canvas: the root svg is tabindex=0, and clicks the binder does
        // NOT claim leave native focus on it — the original "rectangle around
        // the whole canvas" report. Probe a few candidate points and keep one
        // that genuinely hits the canvas background, not an entity.
        const sb = svg.getBoundingClientRect();
        for (const [fx, fy] of [[0.9, 0.9], [0.1, 0.9], [0.9, 0.1], [0.5, 0.92]]) {
          const x = sb.x + sb.width * fx, y = sb.y + sb.height * fy;
          const el = document.elementFromPoint(x, y);
          if (el && el.closest('svg.grafloria-diagram') === svg && !el.closest('[data-node-id],[data-link-id]')) {
            spots.push({ kind: 'canvas', x, y });
            break;
          }
        }
        return spots.filter((s) => s.x > 0 && s.y > 0 && s.x < innerWidth && s.y < innerHeight);
      });
      if (spots.length === 0) rec.skipped.push('FOCUS-RING (nothing clickable in-viewport)');
      else {
        const verdicts = [];
        for (const spot of spots) {
          await tab.mouse.click(spot.x, spot.y);
          const v = await tab.evaluate((kind) => {
            const ae = document.activeElement;
            // Only judge diagram internals: a click that landed focus on a real
            // form control (mermaid textarea, comment input) is out of scope.
            if (!ae || !ae.closest('svg.grafloria-diagram')) return { kind, skip: 'focus not in diagram' };
            if (ae.matches(':focus-visible')) return { kind, skip: 'keyboard modality' };
            const cs = getComputedStyle(ae);
            return { kind, ok: cs.outlineStyle === 'none', detail: `${ae.tagName.toLowerCase()}.${(ae.getAttribute('class') || '').split(' ')[0]} outline=${cs.outlineStyle} ${cs.outlineWidth}` };
          }, spot.kind);
          verdicts.push(v);
        }
        const judged = verdicts.filter((v) => !v.skip);
        if (judged.length === 0) rec.skipped.push(`FOCUS-RING (${verdicts.map((v) => `${v.kind}: ${v.skip}`).join('; ')})`);
        else rec.checks.push({ name: 'FOCUS-RING', ok: judged.every((v) => v.ok), detail: judged.map((v) => `${v.kind} click → ${v.detail}`).join('; ') });
      }
    } catch (e) { rec.skipped.push(`FOCUS-RING (harness: ${e.message})`); }
  } catch (e) { rec.error = e.message; }
  await tab.close();
  results.push(rec);

  const failed = rec.checks.filter((c) => !c.ok);
  const mark = rec.error ? '✗' : failed.length ? '✗' : '✓';
  const summary = rec.error ? `harness: ${rec.error}` : rec.checks.map((c) => `${c.ok ? '·' : '✗'}${c.name}`).join(' ');
  console.log(`${mark} ${rel}   ${summary}`);
  for (const c of failed) console.log(`      ${c.name}: ${c.detail}`);
  // Skips are part of the contract ("skip loudly"): a check that silently
  // stopped running looks exactly like a check that passes.
  for (const s of rec.skipped) console.log(`      ~ skip ${s}`);
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
