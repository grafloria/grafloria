// Robot cell programmer — where everything sits on the canvas.
//
// Simple mode: one line. Steps sit side by side; a loop's frame wraps its steps
// on the same line, with its header above and its way back below.
// Advanced mode: one lane per device, time running left to right (ADV.PPS pixels
// a second). A step starts where the schedule says; its width is its duration;
// a loop's frame wraps its first pass and a striped tail shows the passes after.
//
// Pure: (program, schedule) → boxes, arrows, gaps and the drop slots the page's
// drag uses. World coordinates.

import { durationOf } from './robot-timeline-catalog.js';
import { SIMPLE, ADV } from './robot-timeline-cards.js';

const bodySeconds = (loop) => loop.steps.reduce((t, s) => t + durationOf(s), 0);

/**
 * { boxes: Map(id → { x, y, w, h, kind: 'step' | 'loop', lane, loop }), arrows: [{ x1, y1, x2, y2 }],
 *   lanes: [{ id, y, h }], slots: [{ lane, loop, index, x, y, h }], tails, gaps, width, height }
 */
export function layout(program, sched) {
  return program.mode === 'advanced' ? layoutAdvanced(program, sched) : layoutSimple(program);
}

function layoutSimple(program) {
  const { W, H, GAP, LANE_Y, FRAME_PAD, FRAME_HEAD, FRAME_FOOT, X0 } = SIMPLE;
  const boxes = new Map(), arrows = [], slots = [];
  const lane = program.lanes[0];
  let x = X0;
  const y = LANE_Y;
  const edges = [];   // [left, right] of each top-level item, for the arrows and slots
  lane.items.forEach((it, i) => {
    if (!it.loop) {
      boxes.set(it.id, { x, y, w: W, h: H, kind: 'step', lane: lane.id, loop: null });
      edges.push({ l: x, r: x + W, id: it.id });
      x += W + GAP;
      return;
    }
    const n = it.steps.length;
    const w = n ? FRAME_PAD * 2 + n * W + (n - 1) * GAP : 200;
    boxes.set(it.id, { x, y: y - FRAME_HEAD, w, h: FRAME_HEAD + H + FRAME_FOOT, kind: 'loop', lane: lane.id, loop: null });
    let sx = x + FRAME_PAD;
    it.steps.forEach((s, j) => {
      boxes.set(s.id, { x: sx, y, w: W, h: H, kind: 'step', lane: lane.id, loop: it.id });
      if (j > 0) arrows.push({ x1: sx - GAP + 4, y1: y + H / 2, x2: sx - 4, y2: y + H / 2 });
      slots.push({ lane: lane.id, loop: it.id, index: j, x: sx - (j ? GAP / 2 : FRAME_PAD / 2), y, h: H });
      sx += W + GAP;
    });
    slots.push({ lane: lane.id, loop: it.id, index: n, x: n ? sx - GAP + FRAME_PAD / 2 : x + w / 2, y, h: H });
    edges.push({ l: x, r: x + w, id: it.id });
    x += w + GAP;
  });
  for (let i = 1; i < edges.length; i++) arrows.push({ x1: edges[i - 1].r + 4, y1: y + H / 2, x2: edges[i].l - 4, y2: y + H / 2 });
  for (let i = 0; i <= edges.length; i++) {
    const sx = i === 0 ? (edges[0]?.l ?? X0) - GAP / 2 : edges[i - 1].r + GAP / 2;
    slots.push({ lane: lane.id, loop: null, index: i, x: sx, y, h: H });
  }
  return { boxes, arrows, slots, lanes: [{ id: lane.id, y: y - FRAME_HEAD - 20, h: H + FRAME_HEAD + FRAME_FOOT + 40 }], tails: [], gaps: [], width: Math.max(x, 600), height: LANE_Y + H + FRAME_FOOT + 20 };
}

function layoutAdvanced(program, sched) {
  const { PPS, H, LANE_H, RULER, FRAME_HEAD, FRAME_PAD } = ADV;
  const boxes = new Map(), slots = [], tails = [], lanes = [];
  const tx = (t) => t * PPS;
  program.lanes.forEach((lane, li) => {
    const ly = RULER + li * LANE_H, cy = ly + 34;
    lanes.push({ id: lane.id, y: ly, h: LANE_H });
    const ranges = [];
    for (const it of lane.items) {
      const t = sched.at.get(it.id);
      if (!t) continue;                                  // stuck: drawn by the page at the lane's end
      if (!it.loop) {
        const w = Math.max(30, tx(durationOf(it)) - 4);
        boxes.set(it.id, { x: tx(t.start), y: cy, w, h: H, kind: 'step', lane: lane.id, loop: null });
        ranges.push({ l: tx(t.start), r: tx(t.start) + w, id: it.id });
        continue;
      }
      const body = bodySeconds(it), times = Number(it.props.times) || 1;
      const fx = tx(t.start) - FRAME_PAD, fw = Math.max(tx(body), it.steps.length ? 0 : 120) + FRAME_PAD * 2 - 4;
      boxes.set(it.id, { x: fx, y: cy - FRAME_HEAD - 4, w: fw, h: FRAME_HEAD + H + 4 + FRAME_PAD, kind: 'loop', lane: lane.id, loop: null });
      let s0 = t.start;
      it.steps.forEach((s, j) => {
        const w = Math.max(30, tx(durationOf(s)) - 4);
        boxes.set(s.id, { x: tx(s0), y: cy, w, h: H, kind: 'step', lane: lane.id, loop: it.id });
        slots.push({ lane: lane.id, loop: it.id, index: j, x: tx(s0) - 2, y: cy, h: H });
        s0 += durationOf(s);
      });
      slots.push({ lane: lane.id, loop: it.id, index: it.steps.length, x: it.steps.length ? tx(s0) - 2 : fx + fw / 2, y: cy, h: H });
      if (times > 1 && body > 0) tails.push({ loop: it.id, x: fx + fw, y: cy - FRAME_HEAD - 4, w: tx(body * (times - 1)), h: FRAME_HEAD + H + 4 + FRAME_PAD, passes: times - 1, seconds: body * (times - 1) });
      ranges.push({ l: fx, r: tx(t.start + body * times), id: it.id });
    }
    for (let i = 0; i <= ranges.length; i++) {
      const sx = i === 0 ? (ranges[0] ? ranges[0].l - 8 : 8) : i === ranges.length ? ranges[i - 1].r + 10 : (ranges[i - 1].r + ranges[i].l) / 2;
      slots.push({ lane: lane.id, loop: null, index: i, x: sx, y: cy, h: H });
    }
  });
  const gaps = sched.gaps.map((g) => {
    const li = program.lanes.findIndex((l) => l.id === g.lane);
    return { ...g, x: tx(g.start), w: tx(g.end - g.start), y: RULER + li * LANE_H + 34 + H + 8 };
  });
  const width = tx(sched.seconds) + 120;
  return { boxes, arrows: [], slots, lanes, tails, gaps, width, height: RULER + program.lanes.length * LANE_H };
}
