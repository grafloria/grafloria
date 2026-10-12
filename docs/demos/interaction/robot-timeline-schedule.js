// Robot cell programmer — when each step runs, and what the cell looks like then.
//
// schedule(program) times one cycle: an item starts once the item before it in
// its lane has finished AND every item it waits for (a sync) has finished; a
// loop runs its steps `times` times in a row. Waits that wait for each other
// can never start: those are reported, not looped over.
//
// runEvents() lays the cycles end to end; cellAt() replays them up to a moment
// and answers what is in each gripper, on the work pallet, at the conveyor stop
// and on the outfeed pallet — the same replay check() uses to find the step
// where the program goes wrong (a Place with an empty gripper…).

import { STATIONS, THINGS, OUTFEED_SLOTS, COMMANDS, durationOf, itemSeconds, isArm, findItem } from './robot-timeline-catalog.js';

const EPS = 1e-6;

/** The top-level item a sync end names (a step inside a loop stands for its loop). */
export function topOf(program, id) {
  const f = findItem(program, id);
  return f ? (f.loop ? f.loop.id : f.item.id) : null;
}

/**
 * One cycle: `at` maps every item id (loops and their steps' first pass) to { start, end, lane };
 * `gaps` are the idle stretches in a lane while it waits; `seconds` is the cycle time.
 */
export function schedule(program) {
  const at = new Map(), gaps = [], stuck = new Set();
  const laneOf = new Map(), prevOf = new Map(), waitsOf = new Map();
  for (const lane of program.lanes) {
    let prev = null;
    for (const it of lane.items) { laneOf.set(it.id, lane); prevOf.set(it.id, prev); prev = it.id; }
  }
  for (const s of program.syncs ?? []) {
    const from = topOf(program, s.from), to = topOf(program, s.to);
    if (!from || !to || from === to) continue;
    if (!waitsOf.has(to)) waitsOf.set(to, []);
    waitsOf.get(to).push({ from, sync: s.id });
  }
  const visiting = new Set();
  const endOf = (id) => {
    if (at.has(id)) return at.get(id).end;
    if (stuck.has(id)) return Infinity;
    if (visiting.has(id)) { stuck.add(id); return Infinity; }
    visiting.add(id);
    const lane = laneOf.get(id), it = lane.items.find((x) => x.id === id);
    const prev = prevOf.get(id);
    let start = prev ? endOf(prev) : 0, waitFor = null;
    const laneReady = start;
    for (const w of waitsOf.get(id) ?? []) {
      const e = endOf(w.from);
      if (e > start + EPS) { start = e; waitFor = w.from; }
    }
    visiting.delete(id);
    if (!Number.isFinite(start)) { stuck.add(id); return Infinity; }
    const end = start + itemSeconds(it);
    at.set(id, { start, end, lane: lane.id });
    if (start > laneReady + 0.05) gaps.push({ lane: lane.id, start: laneReady, end: start, item: id, waitFor });
    if (it.loop) {
      let t = start;
      for (const s of it.steps) { const d = durationOf(s); at.set(s.id, { start: t, end: t + d, lane: lane.id }); t += d; }
    }
    return end;
  };
  for (const lane of program.lanes) for (const it of lane.items) endOf(it.id);
  let seconds = 0;
  for (const v of at.values()) seconds = Math.max(seconds, v.end);
  return { at, gaps, seconds, stuck: [...stuck] };
}

/**
 * Every run of every step over `cycles` cycles, in time order:
 * { step, lane, loop, pass, cycle, start, end }. A stuck item never runs.
 */
export function runEvents(program, sched = schedule(program), cycles = program.cycles || 1) {
  const one = [];
  const laneIx = new Map(program.lanes.map((l, i) => [l.id, i]));
  for (const lane of program.lanes) for (const it of lane.items) {
    const t = sched.at.get(it.id);
    if (!t) continue;
    if (!it.loop) { one.push({ step: it, lane: lane.id, loop: null, pass: 0, start: t.start, end: t.end }); continue; }
    const body = it.steps.reduce((s, x) => s + durationOf(x), 0);
    const times = Number(it.props.times) || 1;
    for (let p = 0; p < times; p++) {
      let s0 = t.start + p * body;
      for (const s of it.steps) { const d = durationOf(s); one.push({ step: s, lane: lane.id, loop: it.id, pass: p, start: s0, end: s0 + d }); s0 += d; }
    }
  }
  one.sort((a, b) => a.start - b.start || laneIx.get(a.lane) - laneIx.get(b.lane));
  const out = [];
  for (let c = 0; c < cycles; c++) for (const e of one) out.push({ ...e, cycle: c, start: e.start + c * sched.seconds, end: e.end + c * sched.seconds });
  return out;
}

// ---- the cell, replayed ------------------------------------------------------------
const thing = (h) => (h ? (h.kind === 'box' ? 'box' : THINGS[h.kind]) : '');
const a = (w) => (/^[aeiou]/.test(w) ? `an ${w}` : `a ${w}`);
export const freshCell = () => ({ hold: {}, work: null, belt: false, outfeed: [], rejects: 0, stacks: { infeedA: 0, infeedB: 0, lids: 0 } });

/**
 * What a step needs before it starts. Returns null, or { level: 'error' | 'warn', msg }.
 * An error blocks Run; a warning only shows on the card.
 */
export function precheck(cell, ev) {
  const { step } = ev, p = step.props ?? {}, h = cell.hold[ev.lane];
  switch (step.cmd) {
    case 'pick':
      if (h) return { level: 'error', msg: `The gripper already holds ${a(thing(h))}. Put it down first.` };
      if (p.from === 'work' && !cell.work) return { level: 'error', msg: 'There is nothing on the work pallet to pick.' };
      if (p.from === 'belt' && !cell.belt) return { level: 'error', msg: 'No box has reached the conveyor stop yet: make the arm wait for the conveyor.' };
      return null;
    case 'place':
      if (!h) return { level: 'error', msg: 'The gripper is empty. Add a Pick before this Place.' };
      if (p.on === 'work') {
        if (h.kind === 'insert' || h.kind === 'lid') return { level: 'error', msg: `${a(thing(h))[0].toUpperCase()}${a(thing(h)).slice(1)} goes into the box: use ${h.kind === 'lid' ? 'Close lid' : 'Insert into'}.` };
        if (cell.work) return { level: 'error', msg: 'The work pallet is taken: pick that box off first.' };
      }
      if (p.on === 'outfeed') {
        if (h.kind !== 'box') return { level: 'error', msg: `Only finished boxes go on the outfeed pallet, not ${a(thing(h))}.` };
        if (!h.box.lid) return { level: 'error', msg: 'This box has no lid yet.' };
        if (cell.outfeed.length >= OUTFEED_SLOTS) return { level: 'error', msg: `The outfeed pallet is full (${OUTFEED_SLOTS} slots).` };
        if (p.slot && p.slot !== 'next' && cell.outfeed.some((b) => b.slot === Number(p.slot))) return { level: 'error', msg: `Slot ${p.slot} already has a box.` };
        if (!h.box.stamped) return { level: 'warn', msg: 'This box leaves without a stamp.' };
      }
      return null;
    case 'insert':
      if (!h) return { level: 'error', msg: 'The gripper is empty. Pick an insert first.' };
      if (h.kind !== 'insert') return { level: 'error', msg: `The gripper holds ${a(thing(h))}, not an insert.` };
      if (!cell.work || cell.work.lid) return { level: 'error', msg: 'There is no open box on the work pallet to insert into.' };
      if (cell.work.inserts >= 4) return { level: 'error', msg: 'The box is full: it takes four inserts.' };
      return null;
    case 'close':
      if (!h) return { level: 'error', msg: 'The gripper is empty. Pick a lid first.' };
      if (h.kind !== 'lid') return { level: 'error', msg: `The gripper holds ${a(thing(h))}, not a lid.` };
      if (!cell.work || cell.work.lid) return { level: 'error', msg: 'There is no open box on the work pallet to close.' };
      if (!cell.work.inserts) return { level: 'warn', msg: 'This closes an empty box.' };
      return null;
    case 'stamp':
      if (h) return { level: 'error', msg: `Put the ${thing(h)} down first: the stamp tool needs a free hand.` };
      if (!cell.work?.lid) return { level: 'error', msg: 'Stamp needs a closed box on the work pallet.' };
      return null;
    case 'inspect':
      if (!cell.work?.lid || (p.check !== 'lid' && !cell.work.stamped)) return { level: 'error', msg: 'Nothing is ready to inspect yet: make the camera wait for the stamp.' };
      return null;
    case 'advance':
      if (cell.belt) return { level: 'warn', msg: 'A box is already waiting at the stop.' };
      return null;
    default:
      return null;
  }
}

/** What a step changes once it has finished. `n` numbers the boxes. */
export function effect(cell, ev) {
  const { step } = ev, p = step.props ?? {}, h = cell.hold[ev.lane];
  switch (step.cmd) {
    case 'pick':
      if (p.from === 'work') { cell.hold[ev.lane] = { kind: 'box', box: cell.work }; cell.work = null; }
      else if (p.from === 'belt') { cell.hold[ev.lane] = { kind: 'base' }; cell.belt = false; }
      else { cell.hold[ev.lane] = { kind: STATIONS[p.from]?.kind ?? 'base' }; cell.stacks[p.from] = (cell.stacks[p.from] ?? 0) + 1; }
      break;
    case 'place':
      if (!h) break;
      if (p.on === 'work') cell.work = h.kind === 'box' ? h.box : { inserts: 0, lid: false, stamped: false, n: ++cell.made };
      else if (p.on === 'outfeed') {
        const taken = new Set(cell.outfeed.map((b) => b.slot));
        const slot = p.slot && p.slot !== 'next' ? Number(p.slot) : [...Array(OUTFEED_SLOTS)].map((_, i) => i + 1).find((s) => !taken.has(s));
        if (slot) cell.outfeed.push({ ...(h.box ?? {}), slot });
      } else cell.rejects++;
      cell.hold[ev.lane] = null;
      break;
    case 'insert': if (cell.work) cell.work.inserts++; cell.hold[ev.lane] = null; break;
    case 'close': if (cell.work) cell.work.lid = true; cell.hold[ev.lane] = null; break;
    case 'stamp': if (cell.work) cell.work.stamped = true; break;
    case 'advance': cell.belt = true; break;
    default: break;
  }
}

/**
 * Replay a program and find where it goes wrong. Returns { problems: Map(stepId → { level, msg, cycle, pass }),
 * stuck } — the first problem each step meets; a stuck item (waits in a circle) is an error on it.
 */
export function check(program, sched = schedule(program)) {
  const problems = new Map();
  const note = (id, pr, ev) => { if (!problems.has(id) || (problems.get(id).level === 'warn' && pr.level === 'error')) problems.set(id, { ...pr, cycle: ev?.cycle ?? 0, pass: ev?.pass ?? 0 }); };
  for (const id of sched.stuck) note(id, { level: 'error', msg: 'This waits for something that waits for it: it can never start.' });
  const events = runEvents(program, sched);
  const cell = { ...freshCell(), made: 0 };
  const pending = [];
  const settle = (t) => {
    pending.sort((x, y) => x.end - y.end);
    while (pending.length && pending[0].end <= t + EPS) effect(cell, pending.shift());
  };
  // The cell stops at its first fault, so the replay does too: what follows an error
  // would only be its consequences (a gripper still holding the insert next pass…).
  let faulted = false;
  for (const ev of events) {
    settle(ev.start);
    const pr = precheck(cell, ev);
    if (pr) note(ev.step.id, pr, ev);
    if (pr?.level === 'error') { faulted = true; break; }
    pending.push(ev);
  }
  settle(Infinity);
  if (faulted) return { problems, stuck: sched.stuck };
  // Each arm must end its cycle with an empty gripper.
  for (const lane of program.lanes) {
    if (!isArm(lane.device) || !cell.hold[lane.id]) continue;
    const last = [...events].reverse().find((e) => e.lane === lane.id);
    if (last) note(last.step.id, { level: 'error', msg: `The cycle ends with the gripper holding ${a(thing(cell.hold[lane.id]))}.` }, last);
  }
  return { problems, stuck: sched.stuck };
}

/**
 * The cell at time `t` of a run: every step finished by `t` applied, plus the steps
 * running at `t` with how far along they are (0–1).
 */
export function cellAt(program, events, t) {
  const cell = { ...freshCell(), made: 0 };
  const running = [], pending = [];
  const settle = (u) => {
    pending.sort((x, y) => x.end - y.end);
    while (pending.length && pending[0].end <= u + EPS) effect(cell, pending.shift());
  };
  for (const ev of events) {
    if (ev.start > t + EPS) break;
    settle(ev.start);
    const pr = precheck(cell, ev);
    if (!pr || pr.level === 'warn') pending.push(ev);
    if (ev.end > t + EPS) running.push({ ...ev, k: Math.min(1, (t - ev.start) / (ev.end - ev.start)) });
  }
  settle(t);
  return { cell, running };
}

export const perHour = (seconds) => (seconds > 0 ? Math.floor(3600 / seconds) : 0);
export const clock = (s) => {
  const m = Math.floor(s / 60), r = s - m * 60;
  return m ? `${m} min ${Math.round(r)} s` : `${(Math.round(r * 10) / 10).toFixed(1)} s`;
};
export { COMMANDS };
