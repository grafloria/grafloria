// Robot cell programmer — the landing page's live story.
//
// The same modules the demo runs on, cut down to a showcase: the Simple sample on a
// docked Grafloria timeline (a real canvas: drag it), the 3D cobot above it doing each
// step, played on a loop. It starts when it scrolls into view, pauses when it leaves
// (or the tab hides), and does not autoplay for a reader who prefers reduced motion —
// they get a still, mid-run frame and a Play button.
//
//   mountRobotStory(host, k)   host: an empty element; k: the grafloria bundle module

import { sampleSimple, allSteps, COMMANDS } from './robot-timeline-catalog.js';
import { schedule, runEvents, cellAt, effect } from './robot-timeline-schedule.js';
import { layout } from './robot-timeline-layout.js';
import { cardTree, frameTree, iconCss, icon, esc, SIMPLE } from './robot-timeline-cards.js';
import { createCell3D } from './robot-timeline-3d.js';

const here = new URL('.', import.meta.url).href;
const SPEED = 5;                                   // seconds of cell time per second shown

function ensureStyles() {
  if (!document.querySelector('link[data-rt-css]')) {
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = `${here}robot-timeline.css`; l.dataset.rtCss = '';
    document.head.appendChild(l);
  }
  if (!document.querySelector('style[data-rt-icons]')) {
    const s = document.createElement('style');
    s.dataset.rtIcons = ''; s.textContent = iconCss();
    document.head.appendChild(s);
  }
}

export async function mountRobotStory(host, k) {
  ensureStyles();
  host.innerHTML = `<div class="rt-mini rt-scope rt-light">
      <div class="rt-mini-3d"></div>
      <div class="rt-mini-tl"><div class="rt-mini-cv"></div></div>
      <div class="rt-mini-hud" aria-live="off"></div>
      <button class="rt-mini-play" type="button" hidden>▶ Play</button>
    </div>`;
  const root = host.firstElementChild;
  const cv = root.querySelector('.rt-mini-cv'), hud = root.querySelector('.rt-mini-hud'), play = root.querySelector('.rt-mini-play');

  const prog = sampleSimple();
  const sched = schedule(prog);
  const L = layout(prog, sched);
  const events = runEvents(prog, sched);
  const total = events.reduce((m, e) => Math.max(m, e.end), 0);
  const numbers = new Map(allSteps(prog).map(({ step }, i) => [step.id, i + 1]));
  const loop = prog.lanes[0].items[0];

  // the landing page is light-only: the story is too; a closer camera for a wide, short stage
  const cell3d = createCell3D(root.querySelector('.rt-mini-3d'), prog, { dark: false, view: { dist: 2.1, pitch: 0.4, yaw: 0.7 }, target: [0, 0.4, 0] });

  // the timeline: a real Grafloria canvas, cards painted from the program
  const api = k.render({ nodes: [], edges: [] }, cv, { interaction: { portVisibility: 'never' } });
  const model = api.getModel();
  try {
    model.setLODConfig?.({ tiers: [{ name: 'all', minZoom: 0, features: new Set(['labels', 'icons', 'borders', 'shadows', 'decorations', 'link-detail', 'gradients']) }] });
  } catch { /* draws everything anyway */ }
  for (const [id, b] of L.boxes) {
    const n = new k.NodeModel({ id, type: 'rect', position: { x: b.x, y: b.y }, size: { width: b.w, height: b.h } });
    n.ports.clear();
    n.setMetadata('shape', { type: 'rect' });
    n.behavior = { ...n.behavior, draggable: false, selectable: false, resizable: false, deletable: false, connectable: false };
    n.zIndex = b.kind === 'loop' ? 0 : 2;
    model.addNode(n);
  }
  const painted = new Map();
  const paint = (id, opts) => {
    const n = model.getNode(id);
    const item = id === loop.id ? loop : loop.steps.find((s) => s.id === id);
    if (!n || !item) return;
    const tree = item.loop ? frameTree(item, { mode: 'simple', ...opts }) : cardTree(item, { mode: 'simple', n: numbers.get(id), ...opts });
    const key = JSON.stringify(tree);
    if (painted.get(id) === key) return;
    painted.set(id, key);
    n.setMetadata('html', { content: tree, padding: 0, style: { overflow: 'visible' } });
  };
  for (const id of L.boxes.keys()) paint(id, {});

  // arrows and the loop's way back, port to port, on a layer under the cards
  const under = document.createElement('div');
  under.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;transform-origin:0 0;pointer-events:none';
  const droot = cv.querySelector('.grafloria-diagram-root') || cv;
  droot.insertBefore(under, droot.firstChild);
  const arrows = L.arrows.map((a) => `<path d="M${a.x1 + 5} ${a.y1} H${a.x2 - 6}" stroke="var(--rt-faint)"/><path d="M${a.x2 - 12} ${a.y2 - 4.5} L${a.x2 - 5} ${a.y2} L${a.x2 - 12} ${a.y2 + 4.5}" stroke="var(--rt-faint)"/>`).join('');
  const lp = L.loops[0], f = L.boxes.get(lp.first), l = L.boxes.get(lp.last), y = f.y + f.h / 2;
  const way = `<path class="rt-wb" d="M${l.x + l.w} ${y} H${l.x + l.w + 4} Q${l.x + l.w + 12} ${y} ${l.x + l.w + 12} ${y + 8} V${lp.below - 8} Q${l.x + l.w + 12} ${lp.below} ${l.x + l.w + 4} ${lp.below} H${f.x - 4} Q${f.x - 12} ${lp.below} ${f.x - 12} ${lp.below - 8} V${y + 8} Q${f.x - 12} ${y} ${f.x - 4} ${y} H${f.x - 6}"/><path class="rt-wb rt-wbh" d="M${f.x - 7} ${y - 4.5} L${f.x} ${y} L${f.x - 7} ${y + 4.5}"/>`;
  under.innerHTML = `<svg style="position:absolute;left:0;top:0;overflow:visible" width="1" height="1"><g fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${arrows}${way}</g></svg>`;
  const syncLayer = () => { under.style.transform = api.viewport.getHtmlLayerTransform(); };
  api.on?.('viewport:change', syncLayer);

  // the view: the frame fills the timeline's height; it follows the running card
  const ext = { x0: SIMPLE.X0 - 24, y0: L.boxes.get(loop.id).y - 6, y1: lp.below + 16 };
  const fitHeight = () => {
    const r = cv.getBoundingClientRect();
    if (!r.height) return;
    api.viewport.setZoom(Math.max(0.4, Math.min(0.9, (r.height - 16) / (ext.y1 - ext.y0))));
  };
  const showAt = (wx, fx) => {
    const b = api.viewport.getViewBox(), v = api.viewport.getViewport();
    const minX = ext.x0, maxX = L.width + 24 - b.width;
    const want = Math.max(minX, Math.min(Math.max(minX, maxX), wx - b.width * fx));
    api.viewport.setViewport({ ...v, x: v.x + (want - b.x), y: v.y + ((ext.y0 + ext.y1) / 2 - (b.y + b.height / 2)) });
    syncLayer();
  };
  /** Fit the timeline's height, keep the place left to right, centre it top to bottom. */
  const refit = () => { fitHeight(); showAt(api.viewport.getViewBox().x, 0); };
  fitHeight();
  showAt(ext.x0, 0);
  api.renderNow();

  // the run, on a loop
  let t = 0, last = 0, raf = 0, visible = false, playing = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  let status = new Map();
  function frameAt(time) {
    const { cell, running } = cellAt(prog, events, time);
    const seen = JSON.parse(JSON.stringify(cell));
    for (const r of running) if (r.k >= 0.7) effect(seen, r);
    cell3d.update({ cell: seen, running, events, t: time });
    const next = new Map();
    const cur = running.find((r) => r.loop) ?? running[0];
    const pass = cur?.pass ?? 0;
    for (const e of events) if (e.end <= time && e.pass === pass) next.set(e.step.id, { status: 'done' });
    for (const r of running) next.set(r.step.id, { status: 'running', k: r.k });
    if (cur) next.set(loop.id, { status: 'running', pass });
    for (const id of new Set([...next.keys(), ...status.keys()])) paint(id, next.get(id) ?? {});
    status = next;
    if (cur) {
      const b = L.boxes.get(cur.step.id), vb = api.viewport.getViewBox();
      if (b && (b.x < vb.x + vb.width * 0.08 || b.x + b.w > vb.x + vb.width * 0.92)) showAt(b.x, 0.25);
      hud.innerHTML = `${icon(COMMANDS[cur.step.cmd].icon, 14)}<span>#${numbers.get(cur.step.id)} · <b>${esc(COMMANDS[cur.step.cmd].label)}</b> ${esc(COMMANDS[cur.step.cmd].summary(cur.step.props))} <span style="color:var(--rt-mut)">· box ${pass + 1} of ${Number(loop.props.times)}</span></span>`;
    }
    api.renderNow();
  }
  function tick(now) {
    raf = 0;
    if (!playing || !visible || document.hidden) return;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    t += dt * SPEED;
    if (t >= total + 2) { t = 0; showAt(ext.x0, 0); }   // a short beat on the finished pallet, then again
    frameAt(Math.min(t, total));
    raf = requestAnimationFrame(tick);
  }
  const resume = () => { if (!raf && playing && visible && !document.hidden) { last = 0; raf = requestAnimationFrame(tick); } };
  new IntersectionObserver((es) => { visible = es.some((e) => e.isIntersecting); resume(); }, { threshold: 0.15 }).observe(root);
  document.addEventListener('visibilitychange', resume);
  new ResizeObserver(() => { refit(); frameAt(Math.min(t, total)); }).observe(cv);

  if (!playing) {                                  // reduced motion: a still frame and a Play button
    t = total * 0.37;
    frameAt(t);
    play.hidden = false;
    play.addEventListener('click', () => { playing = true; play.hidden = true; resume(); });
  } else frameAt(0);

  return { api, cell3d, seek: (s) => { t = s; frameAt(Math.min(t, total)); }, total };
}
