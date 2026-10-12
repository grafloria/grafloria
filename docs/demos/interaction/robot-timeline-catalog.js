// Robot cell programmer — what a command is.
//
// Framework-free: the devices of the cell, the commands each one can run, how
// long a command takes, what its card says, the Fieldia page its settings
// popup shows, the two sample programs, and the check that walks a program
// through one cycle of the cell and says where it would go wrong (a Place with
// an empty gripper, an Insert with no box on the work pallet…). The page owns
// the canvas; this module only describes.

// ---- the cell --------------------------------------------------------------------
/** Where things are picked from and put down. `kind` is what a Pick there lifts. */
export const STATIONS = {
  infeedA: { label: 'Infeed A — box bases', short: 'Infeed A', kind: 'base' },
  infeedB: { label: 'Infeed B — inserts', short: 'Infeed B', kind: 'insert' },
  lids: { label: 'Lid stack', short: 'Lid stack', kind: 'lid' },
  belt: { label: 'Conveyor stop', short: 'Conveyor', kind: 'base' },
  work: { label: 'Work pallet', short: 'Work pallet', kind: 'box' },
  outfeed: { label: 'Outfeed pallet', short: 'Outfeed', kind: null },
  reject: { label: 'Reject bin', short: 'Reject bin', kind: null },
};
export const OUTFEED_SLOTS = 6;
export const THINGS = { base: 'box base', insert: 'insert', lid: 'lid', box: 'box' };

/** A lane is one device. `arm` lanes hold things; the others only run their own commands. */
export const DEVICES = {
  arm: { label: 'Robot arm', icon: 'arm' },
  armA: { label: 'Arm A — loader', icon: 'arm', arm: true },
  armB: { label: 'Arm B — closer', icon: 'arm', arm: true },
  belt: { label: 'Conveyor', icon: 'belt' },
  camera: { label: 'Vision camera', icon: 'camera' },
};
export const isArm = (device) => device === 'arm' || !!DEVICES[device]?.arm;

// ---- commands --------------------------------------------------------------------
const opts = (rec) => Object.entries(rec).map(([value, label]) => ({ value, label }));
const PICK_FROM = { infeedA: STATIONS.infeedA.label, infeedB: STATIONS.infeedB.label, lids: STATIONS.lids.label, work: STATIONS.work.label, belt: STATIONS.belt.label };
const PLACE_ON = { work: STATIONS.work.label, outfeed: STATIONS.outfeed.label, reject: STATIONS.reject.label };
const GRIP = { soft: 'Soft (cardboard)', normal: 'Normal', firm: 'Firm (heavy parts)' };
const SPEED = { type: 'integer', label: 'Speed', min: 20, max: 100, step: 5, default: 80, help: 'Per cent of the arm\'s top speed.' };

/**
 * One entry per command. `base` is seconds at 100 % speed; `devices` are the lanes it may sit
 * in; `fields` is its settings page (Fieldia). `summary` is the card's second line.
 */
export const COMMANDS = {
  pick: {
    label: 'Pick', icon: 'pick', group: 'Arm', devices: ['arm', 'armA', 'armB'], base: 2.4,
    fields: {
      from: { type: 'selection', label: 'Pick from', required: true, options: opts(PICK_FROM), default: 'infeedA' },
      grip: { type: 'selection', label: 'Grip', options: opts(GRIP), default: 'normal', widget: 'radio' },
      speed: SPEED,
    },
    summary: (p) => `from ${STATIONS[p.from]?.short ?? '—'}`,
  },
  place: {
    label: 'Place', icon: 'place', group: 'Arm', devices: ['arm', 'armA', 'armB'], base: 2.0,
    fields: {
      on: { type: 'selection', label: 'Put it on', required: true, options: opts(PLACE_ON), default: 'work' },
      slot: { type: 'selection', label: 'Slot', options: [{ value: 'next', label: 'Next free slot' }, ...Array.from({ length: OUTFEED_SLOTS }, (_, i) => ({ value: String(i + 1), label: `Slot ${i + 1}` }))], default: 'next', help: 'Only the outfeed pallet has slots.' },
      speed: SPEED,
    },
    summary: (p) => `on ${STATIONS[p.on]?.short ?? '—'}${p.on === 'outfeed' && p.slot && p.slot !== 'next' ? `, slot ${p.slot}` : ''}`,
  },
  insert: {
    label: 'Insert into', icon: 'insert', group: 'Arm', devices: ['arm', 'armA', 'armB'], base: 3.2,
    fields: {
      depth: { type: 'integer', label: 'Depth (mm)', min: 5, max: 120, default: 40 },
      force: { type: 'integer', label: 'Push force (N)', min: 5, max: 150, default: 30 },
      speed: SPEED,
    },
    summary: (p) => `the box, ${p.depth ?? 40} mm deep`,
  },
  close: {
    label: 'Close lid', icon: 'close', group: 'Arm', devices: ['arm', 'armA', 'armB'], base: 2.6,
    fields: {
      force: { type: 'integer', label: 'Press force (N)', min: 10, max: 200, default: 60 },
      hold: { type: 'float', label: 'Hold (s)', min: 0, max: 5, step: 0.1, default: 0.5 },
    },
    summary: (p) => `press ${p.force ?? 60} N`,
  },
  stamp: {
    label: 'Stamp', icon: 'stamp', group: 'Arm', devices: ['arm', 'armA', 'armB'], base: 3.0,
    fields: {
      text: { type: 'char', label: 'Stamp text', required: true, default: 'LOT {date}', placeholder: 'LOT {date}', help: '{date} prints the day, {n} the box number.' },
      pressure: { type: 'selection', label: 'Pressure', options: opts({ light: 'Light', normal: 'Normal', hard: 'Hard' }), default: 'normal', widget: 'radio' },
    },
    summary: (p) => `“${String(p.text ?? '').slice(0, 18)}”`,
  },
  move: {
    label: 'Move to', icon: 'move', group: 'Arm', devices: ['arm', 'armA', 'armB'], base: 1.6,
    fields: {
      to: { type: 'selection', label: 'Go to', options: opts({ home: 'Home', safe: 'Safe position', camera: 'In front of the camera' }), default: 'home' },
      speed: SPEED,
    },
    summary: (p) => ({ home: 'home', safe: 'safe position', camera: 'the camera' })[p.to] ?? 'home',
  },
  advance: {
    label: 'Advance belt', icon: 'belt', group: 'Conveyor', devices: ['belt'], base: 2.0,
    fields: {
      distance: { type: 'integer', label: 'Distance (mm)', min: 50, max: 2000, step: 50, default: 600 },
      speed: { type: 'integer', label: 'Belt speed (mm/s)', min: 50, max: 600, step: 10, default: 300 },
    },
    summary: (p) => `${p.distance ?? 600} mm`,
    seconds: (p) => (p.distance ?? 600) / (p.speed || 300),
  },
  sense: {
    label: 'Wait for box', icon: 'sense', group: 'Conveyor', devices: ['belt'], base: 0.8,
    fields: { sensor: { type: 'selection', label: 'Sensor', options: opts({ stop: 'Box at the stop', clear: 'Belt clear' }), default: 'stop' } },
    summary: (p) => (p.sensor === 'clear' ? 'belt clear' : 'box at the stop'),
  },
  inspect: {
    label: 'Inspect', icon: 'camera', group: 'Camera', devices: ['camera'], base: 1.4,
    fields: {
      check: { type: 'selection', label: 'Check', options: opts({ both: 'Lid closed and stamp readable', lid: 'Lid closed', stamp: 'Stamp readable' }), default: 'both' },
      fail: { type: 'selection', label: 'When it fails', options: opts({ reject: 'Send the box to the reject bin', stop: 'Stop the cell' }), default: 'reject', widget: 'radio' },
    },
    summary: (p) => ({ both: 'lid + stamp', lid: 'lid closed', stamp: 'stamp readable' })[p.check] ?? 'lid + stamp',
  },
  wait: {
    label: 'Wait', icon: 'wait', group: 'Flow', devices: ['arm', 'armA', 'armB', 'belt', 'camera'], base: 1,
    fields: { seconds: { type: 'float', label: 'Seconds', min: 0.2, max: 30, step: 0.1, default: 1 } },
    summary: (p) => `${fmt(p.seconds ?? 1)} s`,
    seconds: (p) => Number(p.seconds ?? 1),
  },
};
/** The loop. Not a step: it holds steps of one lane and runs them `times` times. */
export const REPEAT = {
  label: 'Repeat', icon: 'repeat', group: 'Flow',
  fields: {
    times: { type: 'integer', label: 'Times', required: true, min: 1, max: 24, default: 3 },
    note: { type: 'char', label: 'What for', placeholder: 'e.g. one per outfeed slot', default: '' },
  },
};

export const fmt = (s) => (Math.round(s * 10) / 10).toFixed(1);
export const defaultsOf = (fields) => Object.fromEntries(Object.entries(fields).map(([k, f]) => [k, f.default ?? '']));
export const newProps = (cmd) => defaultsOf(cmd === 'repeat' ? REPEAT.fields : COMMANDS[cmd].fields);
export const canRun = (cmd, device) => cmd === 'repeat' || !!COMMANDS[cmd]?.devices.includes(device);

/** Seconds one run of a step takes: its own rule, else base scaled by speed. */
export function durationOf(step) {
  const c = COMMANDS[step.cmd];
  if (!c) return 1;
  const raw = c.seconds ? c.seconds(step.props ?? {}) : c.base * (100 / Number(step.props?.speed || 100));
  return Math.max(0.5, Math.round(raw * 10) / 10);
}
export const summaryOf = (step) => {
  try { return COMMANDS[step.cmd]?.summary(step.props ?? {}) ?? ''; } catch { return ''; }
};

/** The Fieldia page a step's popup shows: its fields, two to a row. */
export function settingsPage(cmd) {
  const isLoop = cmd === 'repeat';
  const spec = isLoop ? REPEAT : COMMANDS[cmd];
  const fields = Object.fromEntries(Object.entries(spec.fields).map(([k, f]) => { const { widget, ...rest } = f; return [k, rest]; }));
  const wide = (k, f) => f.type === 'selection' && (f.widget === 'radio' || f.options.length > 4) || k === 'text' || k === 'note';
  return {
    fieldia: '0.1', id: `robot-${cmd}`, title: spec.label, data: { kind: 'responses' },
    fields,
    layout: { type: 'sections', id: 'settings', children: [{ type: 'section', id: 'main', columns: 2, children:
      Object.entries(spec.fields).map(([k, f]) => ({ type: 'field', id: `f-${k}`, field: k, ...(f.widget ? { widget: f.widget } : {}), ...(wide(k, f) ? { colspan: 2 } : {}) })) }] },
  };
}

// ---- programs ---------------------------------------------------------------------
// A program: { mode, cycles, lanes: [{ id, device, items }], syncs: [{ id, from, to }] }.
// An item is a step { id, cmd, props } or a loop { id, loop: true, props: { times, note }, steps: [step…] }.
// A sync makes `to` start only once `from` has finished (Advanced only).
const S = (id, cmd, props = {}) => ({ id, cmd, props: { ...newProps(cmd), ...props } });

export function sampleSimple() {
  return {
    mode: 'simple', cycles: 1, syncs: [],
    lanes: [{ id: 'arm', device: 'arm', items: [
      { id: 'cycle', loop: true, props: { times: OUTFEED_SLOTS, note: 'one box per outfeed slot' }, steps: [
        S('p1', 'pick', { from: 'infeedA' }),
        S('p2', 'place', { on: 'work' }),
        S('p3', 'pick', { from: 'infeedB', grip: 'soft' }),
        S('p4', 'insert', { depth: 40 }),
        S('p5', 'pick', { from: 'lids', grip: 'soft' }),
        S('p6', 'close', { force: 60 }),
        S('p7', 'stamp', { text: 'LOT {date}' }),
        S('p8', 'pick', { from: 'work' }),
        S('p9', 'place', { on: 'outfeed', slot: 'next' }),
      ] },
    ] }],
  };
}

export function sampleAdvanced() {
  return {
    mode: 'advanced', cycles: OUTFEED_SLOTS,
    lanes: [
      { id: 'belt', device: 'belt', items: [
        S('b1', 'advance', { distance: 600 }),
        S('b2', 'sense', { sensor: 'stop' }),
      ] },
      { id: 'armA', device: 'armA', items: [
        S('a1', 'pick', { from: 'belt' }),
        S('a2', 'place', { on: 'work' }),
        { id: 'fill', loop: true, props: { times: 3, note: 'three inserts per box' }, steps: [
          S('a3', 'pick', { from: 'infeedB', grip: 'soft', speed: 100 }),
          S('a4', 'insert', { depth: 35, speed: 100 }),
        ] },
        S('a5', 'move', { to: 'safe', speed: 100 }),
        S('a6', 'pick', { from: 'work' }),
        S('a7', 'place', { on: 'outfeed', slot: 'next' }),
      ] },
      { id: 'armB', device: 'armB', items: [
        S('c1', 'pick', { from: 'lids', grip: 'soft' }),
        S('c2', 'close', { force: 60 }),
        S('c3', 'stamp', { text: 'LOT {date} #{n}' }),
        S('c4', 'move', { to: 'home' }),
      ] },
      { id: 'camera', device: 'camera', items: [
        S('v1', 'inspect', { check: 'both', fail: 'reject' }),
      ] },
    ],
    syncs: [
      { id: 'w1', from: 'b2', to: 'a1' },     // the arm picks the box once it is at the stop
      { id: 'w2', from: 'fill', to: 'c2' },   // Arm B closes once all three inserts are in
      { id: 'w3', from: 'a5', to: 'c2' },     // …and Arm A is out of the way
      { id: 'w4', from: 'c3', to: 'v1' },     // the camera reads the stamp once it is printed
      { id: 'w5', from: 'v1', to: 'a6' },     // Arm A takes the box away once it passed
    ],
  };
}

// ---- walking a program ---------------------------------------------------------------
export const itemsOf = (lane) => lane.items;
/** Every step of a program (loop bodies included), with its lane and loop. */
export function allSteps(program) {
  const out = [];
  for (const lane of program.lanes) for (const it of lane.items) {
    if (it.loop) for (const s of it.steps) out.push({ step: s, lane, loop: it });
    else out.push({ step: it, lane, loop: null });
  }
  return out;
}
export function findItem(program, id) {
  for (const lane of program.lanes) for (const it of lane.items) {
    if (it.id === id) return { item: it, lane, loop: null };
    if (it.loop) for (const s of it.steps) if (s.id === id) return { item: s, lane, loop: it };
  }
  return null;
}
/** Seconds one run of an item takes (a loop: all its passes). */
export const itemSeconds = (it) => (it.loop ? (Number(it.props.times) || 1) * it.steps.reduce((t, s) => t + durationOf(s), 0) : durationOf(it));
