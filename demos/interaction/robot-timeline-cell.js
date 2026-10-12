// Robot cell programmer — the cell seen from above, playing the run.
//
// Plain SVG. drawCell(host, program) lays out the stations for the program's
// mode (one arm, or two arms with a conveyor and a camera); update(cell,
// running) moves each arm towards the station its running step works at and
// draws what the grippers hold, the box on the work pallet (base, inserts,
// lid, stamp), the box at the conveyor stop and the outfeed pallet's slots.

import { OUTFEED_SLOTS, isArm } from './robot-timeline-catalog.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
};

/** Station centres in the 320 × 230 scene, per mode. */
const LAYOUT = {
  simple: {
    arms: { arm: { x: 160, y: 122 } },
    st: { infeedA: { x: 46, y: 46 }, infeedB: { x: 34, y: 122 }, lids: { x: 46, y: 198 }, work: { x: 160, y: 30 }, outfeed: { x: 272, y: 96 }, reject: { x: 272, y: 196 }, home: { x: 160, y: 176 }, safe: { x: 210, y: 176 }, camera: { x: 220, y: 40 } },
  },
  advanced: {
    arms: { armA: { x: 112, y: 128 }, armB: { x: 210, y: 128 } },
    st: { belt: { x: 66, y: 192 }, infeedB: { x: 30, y: 110 }, lids: { x: 292, y: 196 }, work: { x: 160, y: 40 }, outfeed: { x: 284, y: 92 }, reject: { x: 30, y: 36 }, home: { x: 232, y: 196 }, safe: { x: 112, y: 196 }, camera: { x: 160, y: 40 } },
  },
};

/** Where a step makes its arm reach. */
function targetOf(step) {
  const p = step.props ?? {};
  switch (step.cmd) {
    case 'pick': return p.from;
    case 'place': return p.on;
    case 'insert': case 'close': case 'stamp': return 'work';
    case 'move': return p.to === 'camera' ? 'camera' : p.to;
    default: return null;
  }
}

export function drawCell(host, program) {
  const mode = program.mode === 'advanced' ? 'advanced' : 'simple';
  const L = LAYOUT[mode];
  host.innerHTML = '';
  const svg = el('svg', { viewBox: '0 0 320 230', class: 'rt-cellsvg', role: 'img', 'aria-label': 'The robot cell seen from above' }, host);
  const floor = el('g', {}, svg);
  el('rect', { x: 4, y: 4, width: 312, height: 222, rx: 12, class: 'cs-floor' }, floor);
  const station = (key, label, w = 46, h = 34) => {
    const s = L.st[key];
    if (!s) return null;
    const g = el('g', { class: `cs-st cs-${key}`, transform: `translate(${s.x} ${s.y})` }, floor);
    el('rect', { x: -w / 2, y: -h / 2, width: w, height: h, rx: 6, class: 'cs-pad' }, g);
    const t = el('text', { x: 0, y: h / 2 + 11, class: 'cs-label', 'text-anchor': 'middle' }, g);
    t.textContent = label;
    return g;
  };
  const stacks = {};
  for (const [key, label] of mode === 'simple' ? [['infeedA', 'A · bases'], ['infeedB', 'B · inserts'], ['lids', 'lids']] : [['infeedB', 'inserts'], ['lids', 'lids']]) {
    const g = station(key, label);
    for (let i = 0; i < 3; i++) el('rect', { x: -12 + i * 3, y: -9 - i * 3, width: 18, height: 14, rx: 2, class: `cs-item cs-${key === 'lids' ? 'lid' : key === 'infeedB' ? 'insert' : 'base'}` }, g);
    stacks[key] = g;
  }
  const work = station('work', mode === 'advanced' ? 'work pallet · camera' : 'work pallet', 56, 40);
  const box = el('g', { class: 'cs-box' }, work);
  el('rect', { x: -14, y: -12, width: 28, height: 24, rx: 3, class: 'cs-base' }, box);
  const dots = [-7, 0, 7].map((x) => el('circle', { cx: x, cy: 0, r: 3, class: 'cs-insertdot' }, box));
  const lid = el('rect', { x: -16, y: -14, width: 32, height: 28, rx: 4, class: 'cs-lidon' }, box);
  const stampMark = el('rect', { x: -7, y: -4, width: 14, height: 8, rx: 1.5, class: 'cs-stampmark' }, box);
  const flash = mode === 'advanced' ? el('circle', { cx: 0, cy: 0, r: 30, class: 'cs-flash' }, work) : null;
  const out = station('outfeed', 'outfeed', 56, 82);
  const slots = [];
  for (let i = 0; i < OUTFEED_SLOTS; i++) {
    const g = el('g', { transform: `translate(${-12 + (i % 2) * 24} ${-26 + Math.floor(i / 2) * 26})` }, out);
    el('rect', { x: -10, y: -10, width: 20, height: 20, rx: 3, class: 'cs-slot' }, g);
    const b = el('rect', { x: -8, y: -8, width: 16, height: 16, rx: 2.5, class: 'cs-done' }, g);
    const s = el('rect', { x: -4, y: -2.5, width: 8, height: 5, rx: 1, class: 'cs-stampmark' }, g);
    slots.push({ b, s });
  }
  const reject = station('reject', 'reject bin', 40, 30);
  const rejectN = el('text', { x: 0, y: 4, class: 'cs-count', 'text-anchor': 'middle' }, reject);
  let beltBox = null;
  if (L.st.belt) {
    const s = L.st.belt;
    const g = el('g', { class: 'cs-belt', transform: `translate(${s.x} ${s.y})` }, floor);
    el('rect', { x: -56, y: -12, width: 112, height: 24, rx: 12, class: 'cs-beltbody' }, g);
    for (let i = -44; i <= 44; i += 14) el('line', { x1: i, y1: -12, x2: i, y2: 12, class: 'cs-beltline' }, g);
    beltBox = el('rect', { x: 26, y: -9, width: 22, height: 18, rx: 2.5, class: 'cs-base' }, g);
    const t = el('text', { x: 0, y: 25, class: 'cs-label', 'text-anchor': 'middle' }, g);
    t.textContent = 'conveyor';
  }
  // the arms, on top
  const arms = {};
  for (const [lane, b] of Object.entries(L.arms)) {
    const g = el('g', { class: 'cs-arm', transform: `translate(${b.x} ${b.y})` }, svg);
    el('circle', { r: 15, class: 'cs-armbase' }, g);
    const rot = el('g', {}, g);
    const upper = el('line', { x1: 0, y1: 0, x2: 0, y2: -40, class: 'cs-link' }, rot);
    const elbow = el('circle', { cx: 0, cy: -40, r: 5, class: 'cs-joint' }, rot);
    const fore = el('line', { x1: 0, y1: -40, x2: 0, y2: -70, class: 'cs-link cs-fore' }, rot);
    const hand = el('g', { transform: 'translate(0 -74)' }, rot);
    el('path', { d: 'M-7 0 V6 M7 0 V6 M-7 0 H7', class: 'cs-claw' }, hand);
    const held = el('rect', { x: -6, y: -5, width: 12, height: 10, rx: 2, class: 'cs-held' }, hand);
    const name = el('text', { x: 0, y: 28, class: 'cs-label', 'text-anchor': 'middle' }, g);
    name.textContent = lane === 'arm' ? 'arm' : lane === 'armA' ? 'arm A' : 'arm B';
    arms[lane] = { base: b, rot, upper, elbow, fore, hand, held, angle: angleTo(b, L.st.home ?? { x: b.x, y: b.y + 60 }), reach: 70 };
  }
  function angleTo(from, to) { return (Math.atan2(to.x - from.x, -(to.y - from.y)) * 180) / Math.PI; }
  const lerpAngle = (a, b, k) => { let d = ((b - a + 540) % 360) - 180; return a + d * k; };
  const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

  function update(cell, running = []) {
    // the arms: towards the running step's station (reach, then work)
    for (const [lane, a] of Object.entries(arms)) {
      const ev = running.find((r) => r.lane === lane);
      const key = ev ? targetOf(ev.step) : null;
      const to = key && (L.st[key] ?? null);
      let angle = a.angle, reach = 58;
      if (to) {
        const want = angleTo(a.base, to), dist = Math.min(96, Math.hypot(to.x - a.base.x, to.y - a.base.y) - 4);
        const k = ease(Math.min(1, ev.k / 0.55));
        angle = lerpAngle(a.angle, want, k);
        reach = 58 + (dist - 58) * k;
        if (ev.k >= 0.999) a.angle = want;
      } else if (!ev) {
        reach = 58;
      }
      if (ev && ev.k >= 0.55 && to) a.settle = angleTo(a.base, to);
      if (!ev && a.settle != null) { a.angle = a.settle; a.settle = null; angle = a.angle; }
      a.rot.setAttribute('transform', `rotate(${angle.toFixed(1)})`);
      const elbowY = -reach * 0.55;
      a.upper.setAttribute('y2', elbowY.toFixed(1));
      a.elbow.setAttribute('cy', elbowY.toFixed(1));
      a.fore.setAttribute('y1', elbowY.toFixed(1));
      a.fore.setAttribute('y2', (-reach + 4).toFixed(1));
      a.hand.setAttribute('transform', `translate(0 ${(-reach).toFixed(1)})`);
      const h = cell.hold?.[lane];
      a.held.setAttribute('class', `cs-held ${h ? `cs-h-${h.kind}` : 'cs-h-none'}`);
    }
    // the work pallet
    const w = cell.work;
    box.style.display = w ? '' : 'none';
    if (w) {
      dots.forEach((d, i) => d.style.display = w.inserts > i ? '' : 'none');
      lid.style.display = w.lid ? '' : 'none';
      stampMark.style.display = w.stamped ? '' : 'none';
    }
    if (flash) {
      const cam = running.find((r) => r.step.cmd === 'inspect');
      flash.style.opacity = cam ? String(0.5 * Math.sin(Math.PI * cam.k)) : '0';
    }
    // outfeed
    slots.forEach((s, i) => {
      const b = (cell.outfeed ?? []).find((x) => x.slot === i + 1);
      s.b.style.display = b ? '' : 'none';
      s.s.style.display = b?.stamped ? '' : 'none';
    });
    rejectN.textContent = cell.rejects ? String(cell.rejects) : '';
    if (beltBox) {
      const adv = running.find((r) => r.step.cmd === 'advance');
      beltBox.style.display = cell.belt || adv ? '' : 'none';
      beltBox.setAttribute('x', adv ? String(-60 + 86 * adv.k) : '26');
    }
  }
  update({ hold: {}, work: null, outfeed: [], belt: false, rejects: 0 }, []);
  return { update, svg, isArm };
}
