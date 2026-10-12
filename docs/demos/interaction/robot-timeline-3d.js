// Robot cell programmer — the cell in 3D: six-axis cobots that actually reach, grip and press.
//
// three.js (vendored, demos/vendor/three-0.170.0). createCell3D(host, program) builds the
// floor, the stations and one arm per arm lane; update({ cell, running, events, t }) poses
// every arm for that moment of the run and shows what each gripper holds, what lies on
// the work pallet (base, inserts, lid, stamp) and which outfeed slots are full.
//
// A pose is a PURE function of the run's events and the time: where the arm's last step
// left it, then the running step's profile (reach above the station, descend, close or
// open the fingers, rise). So Step, seeking and a reload all show the same arm. The arm
// is a chain of groups A1…A6 with a small closed-form inverse kinematics: base yaw, a
// two-link shoulder/elbow solve in the arm's plane, and a wrist that keeps the tool
// pointing straight down.

import * as THREE from '../vendor/three-0.170.0/three.module.min.js';
import { OUTFEED_SLOTS } from './robot-timeline-catalog.js';

const L1 = 0.46, L2 = 0.40, LT = 0.17;           // upper arm, forearm, wrist → finger tips (m)
const BASE_H = 0.17, SHOULDER = 0.30;            // base column; shoulder axis above the floor = BASE_H + SHOULDER
const PALLET_TOP = 0.09;                          // stations stand on low pallets
const PART_H = { base: 0.075, insert: 0.04, lid: 0.022, box: 0.085 };

/** Station layouts (metres; the floor is y = 0) per mode, and where each arm stands. */
const LAYOUT = {
  simple: {
    arms: { arm: { x: 0, z: 0 } },
    st: { infeedA: [-0.32, 0.52], infeedB: [-0.58, 0.02], lids: [-0.36, -0.48], work: [0.56, 0.02], outfeed: [0.22, -0.6], reject: [0.3, 0.6] },
    poses: { arm: { home: [0.32, 0.62, 0.0], safe: [0.16, 0.66, 0.34], camera: [0.42, 0.55, 0.0] } },
  },
  advanced: {
    arms: { armA: { x: -0.5, z: 0.1 }, armB: { x: 0.5, z: 0.1 } },
    st: { belt: [-0.55, 0.62], infeedB: [-1.02, 0.04], outfeed: [-0.78, -0.46], work: [0, -0.27], lids: [1.0, -0.12], reject: [-1.0, 0.55] },
    poses: {
      armA: { home: [-0.3, 0.62, -0.08], safe: [-0.78, 0.6, 0.4], camera: [-0.12, 0.56, -0.2] },
      armB: { home: [0.3, 0.62, -0.08], safe: [0.78, 0.6, 0.4], camera: [0.12, 0.56, -0.2] },
    },
  },
};

const deg = (r) => (r * 180) / Math.PI;
const ease = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);

/** Closed-form IK: the joints that put the finger tips at world (x, y, z), tool pointing down. */
function solve(base, x, y, z, roll = 0) {
  const dx = x - base.x, dz = z - base.z;
  const a1 = Math.atan2(-dz, dx);
  const r = Math.hypot(dx, dz);
  const h = y + LT - (BASE_H + SHOULDER);         // the wrist sits LT above the tips
  let d = Math.hypot(r, h);
  d = Math.min(L1 + L2 - 1e-3, Math.max(Math.abs(L1 - L2) + 1e-3, d));
  const cosE = (d * d - L1 * L1 - L2 * L2) / (2 * L1 * L2);
  const e = Math.acos(Math.max(-1, Math.min(1, cosE)));
  const s = Math.atan2(h, r) + Math.atan2(L2 * Math.sin(e), L1 + L2 * Math.cos(e));   // elbow up
  const a2 = s, a3 = -e, a5 = -Math.PI / 2 - (s - e);
  return [a1, a2, a3, 0, a5, roll];
}

export function createCell3D(host, program) {
  const mode = program.mode === 'advanced' ? 'advanced' : 'simple';
  const L = LAYOUT[mode];
  host.innerHTML = '';
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
  } catch (e) {
    host.innerHTML = '<div class="rt-3d-off">The 3D view needs WebGL, which this browser has turned off. The timeline, the cell map and Run all still work.</div>';
    return { ok: false, update() {}, resize() {}, setTheme() {}, joints: () => ({}), dispose() {}, render() {} };
  }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);
  renderer.domElement.className = 'rt-3d-canvas';

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 40);
  const target = new THREE.Vector3(0, mode === 'advanced' ? 0.18 : 0.26, mode === 'advanced' ? 0.05 : 0);
  const orbit = { yaw: mode === 'advanced' ? 0.42 : 0.78, pitch: mode === 'advanced' ? 0.62 : 0.5, dist: mode === 'advanced' ? 2.9 : 2.4 };
  const placeCamera = () => {
    const cp = Math.cos(orbit.pitch);
    camera.position.set(target.x + orbit.dist * cp * Math.sin(orbit.yaw), target.y + orbit.dist * Math.sin(orbit.pitch), target.z + orbit.dist * cp * Math.cos(orbit.yaw));
    camera.lookAt(target);
  };

  // light, floor, grid
  const hemi = new THREE.HemisphereLight(0xffffff, 0x8a93a6, 1.15);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(1.6, 3.2, 1.9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: 0.5, far: 8 });
  scene.add(sun);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.ShadowMaterial({ opacity: 0.16 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  let grid = null;

  // materials (re-tinted by setTheme)
  const M = {
    shell: new THREE.MeshStandardMaterial({ color: 0xe9ecf1, roughness: 0.42, metalness: 0.05 }),
    joint: new THREE.MeshStandardMaterial({ color: 0xd4d9e1, roughness: 0.38, metalness: 0.08 }),
    accent: new THREE.MeshStandardMaterial({ color: 0x3654d1, roughness: 0.35, emissive: 0x16245e, emissiveIntensity: 0.25 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x3a404d, roughness: 0.55 }),
    bin: new THREE.MeshStandardMaterial({ color: 0x9aa3b4, roughness: 0.7, side: THREE.DoubleSide }),
    pallet: new THREE.MeshStandardMaterial({ color: 0xc9a77c, roughness: 0.85 }),
    table: new THREE.MeshStandardMaterial({ color: 0xbfc6d2, roughness: 0.7 }),
    base: new THREE.MeshStandardMaterial({ color: 0xc8a27a, roughness: 0.8 }),
    insert: new THREE.MeshStandardMaterial({ color: 0x5b8def, roughness: 0.5 }),
    lid: new THREE.MeshStandardMaterial({ color: 0x9b7bd8, roughness: 0.6 }),
    box: new THREE.MeshStandardMaterial({ color: 0x8a68c8, roughness: 0.6 }),
    stamp: new THREE.MeshStandardMaterial({ color: 0xe04848, roughness: 0.5 }),
    slot: new THREE.MeshStandardMaterial({ color: 0x9aa3b4, roughness: 0.9, transparent: true, opacity: 0.45 }),
    belt: new THREE.MeshStandardMaterial({ color: 0x4b5262, roughness: 0.6 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x4fd1c0, roughness: 0.2, emissive: 0x0f766e, emissiveIntensity: 0.0 }),
  };
  const shadowed = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };
  const mesh = (geo, mat) => shadowed(new THREE.Mesh(geo, mat));
  const cyl = (r, h, mat, seg = 28) => mesh(new THREE.CylinderGeometry(r, r, h, seg), mat);
  const boxM = (w, h, d, mat) => mesh(new THREE.BoxGeometry(w, h, d), mat);
  const partMesh = (kind) => {
    if (kind === 'insert') return boxM(0.04, PART_H.insert, 0.04, M.insert);
    if (kind === 'lid') return boxM(0.14, PART_H.lid, 0.14, M.lid);
    if (kind === 'box') return boxM(0.13, PART_H.box, 0.13, M.box);
    return boxM(0.13, PART_H.base, 0.13, M.base);
  };

  // ---- stations ---------------------------------------------------------------------------
  const st = {};
  const stationXZ = (key) => L.st[key];
  const pallet = (key, w = 0.3, d = 0.3) => {
    const [x, z] = stationXZ(key);
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const p = boxM(w, PALLET_TOP, d, M.pallet);
    p.position.y = PALLET_TOP / 2;
    g.add(p);
    scene.add(g);
    return g;
  };
  const stack = (key, kind, n) => {
    const g = pallet(key);
    for (let i = 0; i < n; i++) { const m = partMesh(kind); m.position.set(0, PALLET_TOP + PART_H[kind] * (i + 0.5), 0); g.add(m); }
    return g;
  };
  if (L.st.infeedA) st.infeedA = stack('infeedA', 'base', 3);
  st.infeedB = stack('infeedB', 'insert', 4);
  st.lids = stack('lids', 'lid', 5);
  // the work pallet: a fixture holding the box being built
  st.work = pallet('work', 0.32, 0.32);
  const work = { group: new THREE.Group(), base: partMesh('base'), inserts: [0, 1, 2].map(() => partMesh('insert')), lid: partMesh('lid'), stamp: boxM(0.06, 0.004, 0.035, M.stamp) };
  work.group.position.y = PALLET_TOP;
  work.base.position.y = PART_H.base / 2;
  work.inserts.forEach((m, i) => m.position.set(-0.035 + i * 0.035, PART_H.base - 0.012, 0));
  work.lid.position.y = PART_H.base + PART_H.lid / 2;
  work.stamp.position.y = PART_H.base + PART_H.lid + 0.002;
  work.group.add(work.base, ...work.inserts, work.lid, work.stamp);
  st.work.add(work.group);
  // outfeed: 2 × 3 slots
  st.outfeed = pallet('outfeed', 0.34, 0.5);
  const outSlots = [];
  for (let i = 0; i < OUTFEED_SLOTS; i++) {
    const sx = -0.08 + (i % 2) * 0.16, sz = -0.16 + Math.floor(i / 2) * 0.16;
    const mark = boxM(0.14, 0.004, 0.14, M.slot);
    mark.position.set(sx, PALLET_TOP + 0.002, sz);
    const b = partMesh('box'); b.position.set(sx, PALLET_TOP + PART_H.box / 2, sz);
    const s = boxM(0.06, 0.004, 0.035, M.stamp); s.position.set(sx, PALLET_TOP + PART_H.box + 0.002, sz);
    st.outfeed.add(mark, b, s);
    outSlots.push({ b, s });
  }
  // reject bin
  {
    const [x, z] = stationXZ('reject');
    const g = new THREE.Group(); g.position.set(x, 0, z);
    const bin = mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.2, 28, 1, true), M.bin);
    bin.position.y = 0.1; g.add(bin);
    const bottom = cyl(0.11, 0.01, M.bin, 28); bottom.position.y = 0.005; g.add(bottom);
    scene.add(g); st.reject = g;
  }
  // conveyor + camera (Advanced)
  let beltBox = null, camLight = null;
  if (L.st.belt) {
    const [x, z] = stationXZ('belt');
    const g = new THREE.Group(); g.position.set(x - 0.42, 0, z);
    const body = boxM(1.1, 0.07, 0.24, M.belt); body.position.y = PALLET_TOP - 0.035; g.add(body);
    for (const lx of [-0.5, 0.5]) for (const lz of [-0.1, 0.1]) { const leg = boxM(0.03, PALLET_TOP - 0.07, 0.03, M.dark); leg.position.set(lx, (PALLET_TOP - 0.07) / 2, lz); g.add(leg); }
    beltBox = partMesh('base'); beltBox.position.set(0.42, PALLET_TOP + PART_H.base / 2, 0); g.add(beltBox);
    scene.add(g); st.belt = g; st.beltOffset = 0.42;
    const [wx, wz] = stationXZ('work');
    const pole = cyl(0.015, 0.95, M.dark); pole.position.set(wx, 0.475, wz - 0.32); scene.add(pole);
    const arm = boxM(0.03, 0.03, 0.3, M.dark); arm.position.set(wx, 0.94, wz - 0.18); scene.add(arm);
    const head = boxM(0.08, 0.06, 0.08, M.dark); head.position.set(wx, 0.9, wz - 0.04); scene.add(head);
    camLight = cyl(0.025, 0.012, M.glass); camLight.position.set(wx, 0.866, wz - 0.04); scene.add(camLight);
  }

  // ---- the arms ------------------------------------------------------------------------------
  function buildArm(base) {
    const root = new THREE.Group(); root.position.set(base.x, 0, base.z); scene.add(root);
    const foot = mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.04, 36), M.joint); foot.position.y = 0.02; root.add(foot);
    const col = cyl(0.095, BASE_H - 0.04, M.shell, 36); col.position.y = 0.04 + (BASE_H - 0.04) / 2; root.add(col);
    const ring = cyl(0.097, 0.012, M.accent, 36); ring.position.y = BASE_H - 0.03; root.add(ring);
    const j1 = new THREE.Group(); j1.position.y = BASE_H; root.add(j1);
    const turret = cyl(0.088, SHOULDER - 0.06, M.shell, 36); turret.position.y = (SHOULDER - 0.06) / 2; j1.add(turret);
    const j2 = new THREE.Group(); j2.position.y = SHOULDER; j1.add(j2);
    const shoulder = cyl(0.085, 0.2, M.joint, 36); shoulder.rotation.x = Math.PI / 2; j2.add(shoulder);
    const sRing = cyl(0.087, 0.014, M.accent, 36); sRing.rotation.x = Math.PI / 2; sRing.position.z = 0.1; j2.add(sRing);
    const upper = mesh(new THREE.CapsuleGeometry(0.058, L1 - 0.06, 8, 24), M.shell); upper.rotation.z = -Math.PI / 2; upper.position.set(L1 / 2, 0, 0.06); j2.add(upper);
    const j3 = new THREE.Group(); j3.position.set(L1, 0, 0); j2.add(j3);
    const elbow = cyl(0.07, 0.17, M.joint, 32); elbow.rotation.x = Math.PI / 2; j3.add(elbow);
    const eRing = cyl(0.072, 0.012, M.accent, 32); eRing.rotation.x = Math.PI / 2; eRing.position.z = -0.085; j3.add(eRing);
    const j4 = new THREE.Group(); j4.position.set(0, 0, -0.05); j3.add(j4);
    const fore = mesh(new THREE.CapsuleGeometry(0.047, L2 - 0.07, 8, 24), M.shell); fore.rotation.z = -Math.PI / 2; fore.position.set(L2 / 2, 0, 0); j4.add(fore);
    const j5 = new THREE.Group(); j5.position.set(L2, 0, 0.05); j4.add(j5);
    const wrist = cyl(0.052, 0.12, M.joint, 28); wrist.rotation.x = Math.PI / 2; j5.add(wrist);
    const j6 = new THREE.Group(); j5.add(j6);
    const flange = cyl(0.042, 0.05, M.shell, 28); flange.rotation.z = -Math.PI / 2; flange.position.x = 0.045; j6.add(flange);
    const fRing = cyl(0.044, 0.01, M.accent, 28); fRing.rotation.z = -Math.PI / 2; fRing.position.x = 0.072; j6.add(fRing);
    const gripBody = boxM(0.05, 0.075, 0.09, M.dark); gripBody.position.x = 0.1; j6.add(gripBody);
    const fingers = [-1, 1].map((s) => { const f = boxM(0.045, 0.016, 0.012, M.joint); f.position.set(0.145, 0, s * 0.04); j6.add(f); return f; });
    const holder = new THREE.Group(); holder.position.set(LT - 0.005, 0, 0); j6.add(holder);
    const held = {};
    for (const k of ['base', 'insert', 'lid', 'box']) { const m = partMesh(k); m.rotation.z = Math.PI / 2; m.position.x = -PART_H[k] / 2 + 0.005; m.visible = false; holder.add(m); held[k] = m; }
    return { base, joints: [j1, j2, j3, j4, j5, j6], fingers, held, q: [0, 0, 0, 0, 0, 0], grip: 1 };
  }
  const arms = {};
  for (const [lane, b] of Object.entries(L.arms)) { arms[lane] = buildArm(b); arms[lane].lane = lane; }

  function setPose(arm, q, grip) {
    const [j1, j2, j3, j4, j5, j6] = arm.joints;
    j1.rotation.y = q[0]; j2.rotation.z = q[1]; j3.rotation.z = q[2]; j4.rotation.x = q[3]; j5.rotation.z = q[4]; j6.rotation.x = q[5];
    arm.q = q;
    arm.grip = grip;
    const gap = 0.012 + 0.03 * grip;               // 1 = open, 0 = closed on a part
    arm.fingers[0].position.z = -gap; arm.fingers[1].position.z = gap;
  }

  // ---- poses ---------------------------------------------------------------------------------
  const topAt = (key, kind) => {
    const xz = L.st[key];
    if (!xz) return null;
    const h = key === 'work' ? PALLET_TOP + PART_H.base + (kind === 'lid' ? PART_H.lid : 0) : key === 'outfeed' ? PALLET_TOP + PART_H.box : key === 'reject' ? 0.2 : key === 'belt' ? PALLET_TOP + PART_H.base : PALLET_TOP + 0.12;
    return [xz[0], h, xz[1]];
  };
  const stationOf = (step) => {
    const p = step.props ?? {};
    switch (step.cmd) {
      case 'pick': return p.from;
      case 'place': return p.on;
      case 'insert': case 'close': case 'stamp': return 'work';
      default: return null;
    }
  };
  const poseQ = (arm, name) => { const p = L.poses[arm.lane]?.[name] ?? L.poses[arm.lane].home; return solve(arm.base, p[0], p[1], p[2]); };
  const homeQ = (arm) => poseQ(arm, 'home');
  function hoverQ(arm, key) {
    const top = topAt(key);
    return top ? solve(arm.base, top[0], top[1] + 0.16, top[2]) : homeQ(arm);
  }
  function endQ(arm, ev) {
    if (!ev) return homeQ(arm);
    const s = ev.step;
    if (s.cmd === 'move') return poseQ(arm, s.props?.to ?? 'home');
    const key = stationOf(s);
    return key ? hoverQ(arm, key) : null;
  }
  /** The outfeed slot a Place lands in: the next free one (or the one it names). */
  const slotTop = (i) => {
    const [x, z] = L.st.outfeed;
    return [x - 0.08 + (i % 2) * 0.16, PALLET_TOP + PART_H.box, z - 0.16 + Math.floor(i / 2) * 0.16];
  };
  /** The arm's joints and grip at time t: where its last finished step left it, then the running step. */
  function poseAt(lane, arm, events, t, holding, cell) {
    let prev = null, run = null;
    for (const e of events) {
      if (e.lane !== lane) continue;
      if (e.end <= t) prev = e;
      else if (e.start <= t) { run = e; break; }
      else break;
    }
    // where it stands: the last step that moved it
    let startQ = homeQ(arm);
    if (prev) {
      for (let i = events.indexOf(prev); i >= 0; i--) { const e = events[i]; if (e.lane !== lane) continue; const q = endQ(arm, e); if (q) { startQ = q; break; } }
    }
    const openGrip = holding ? 0.15 : 1;
    if (!run) return { q: startQ, grip: openGrip };
    const k = (t - run.start) / (run.end - run.start);
    const s = run.step, key = stationOf(s);
    if (s.cmd === 'move') return { q: mix(startQ, endQ(arm, run) ?? startQ, ease(Math.min(1, k / 0.85))), grip: openGrip };
    if (!key) return { q: startQ, grip: openGrip };
    const kind = s.cmd === 'close' ? 'lid' : undefined;
    let top = topAt(key, kind);
    if (key === 'outfeed' && s.cmd === 'place') {
      const n = (cell?.outfeed ?? []).length, named = Number(s.props?.slot);
      top = slotTop(Number.isFinite(named) && named > 0 ? named - 1 : Math.min(OUTFEED_SLOTS - 1, k >= 0.7 ? n - 1 : n));
    }
    const hover = solve(arm.base, top[0], top[1] + 0.16, top[2]);
    const depth = s.cmd === 'insert' ? -0.035 : s.cmd === 'stamp' ? 0.004 : 0.012;
    const down = solve(arm.base, top[0], top[1] + depth, top[2]);
    let q, grip = openGrip;
    if (k < 0.45) q = mix(startQ, hover, ease(k / 0.45));
    else if (k < 0.6) q = mix(hover, down, ease((k - 0.45) / 0.15));
    else if (k < 0.72) {
      q = down;
      const g = ease((k - 0.6) / 0.12);
      if (s.cmd === 'pick') grip = 1 - 0.85 * g;
      else if (s.cmd === 'stamp') grip = openGrip;
      else grip = 0.15 + 0.85 * g;
    } else if (k < 0.9) {
      q = mix(down, hover, ease((k - 0.72) / 0.18));
      grip = s.cmd === 'pick' ? 0.15 : s.cmd === 'stamp' ? openGrip : 1;
    } else { q = hover; grip = s.cmd === 'pick' ? 0.15 : s.cmd === 'stamp' ? openGrip : 1; }
    if (s.cmd === 'stamp' && k >= 0.45 && k < 0.9) {   // two quick taps
      const tap = Math.abs(Math.sin(((k - 0.45) / 0.45) * Math.PI * 2));
      q = mix(hover, down, tap);
    }
    return { q, grip };
  }

  // ---- update --------------------------------------------------------------------------------
  let last = { cell: { hold: {}, work: null, outfeed: [], belt: false, rejects: 0 }, running: [], events: [], t: 0 };
  function update(state = last) {
    last = state;
    const { cell, running = [], events = [], t = 0 } = state;
    for (const [lane, arm] of Object.entries(arms)) {
      const hold = cell.hold?.[lane] ?? null;
      const { q, grip } = poseAt(lane, arm, events, t, hold, cell);
      setPose(arm, q, grip);
      for (const [k, m] of Object.entries(arm.held)) m.visible = !!hold && hold.kind === k;
    }
    const w = cell.work;
    work.group.visible = !!w;
    if (w) {
      work.inserts.forEach((m, i) => (m.visible = (w.inserts ?? 0) > i && !w.lid));
      work.lid.visible = !!w.lid;
      work.stamp.visible = !!w.stamped;
    }
    outSlots.forEach((s, i) => {
      const b = (cell.outfeed ?? []).find((x) => x.slot === i + 1);
      s.b.visible = !!b; s.s.visible = !!b?.stamped;
    });
    if (beltBox) {
      const adv = running.find((r) => r.step.cmd === 'advance');
      beltBox.visible = !!cell.belt || !!adv;
      beltBox.position.x = adv ? -0.5 + 0.92 * adv.k : 0.42;
    }
    if (camLight) {
      const cam = running.find((r) => r.step.cmd === 'inspect');
      camLight.material.emissiveIntensity = cam ? 1.6 * Math.sin(Math.PI * cam.k) : 0;
    }
    render();
  }

  // ---- camera, theme, size -------------------------------------------------------------------
  function setTheme(dark) {
    scene.background = new THREE.Color(dark ? 0x161a22 : 0xeef1f6);
    if (grid) scene.remove(grid);
    grid = new THREE.GridHelper(6, 30, dark ? 0x3a4250 : 0xc9cfda, dark ? 0x262c37 : 0xdde1e8);
    grid.position.y = 0.0005;
    scene.add(grid);
    M.shell.color.set(dark ? 0xc9ced8 : 0xe9ecf1);
    M.joint.color.set(dark ? 0xaab1bf : 0xd4d9e1);
    M.accent.color.set(dark ? 0x8ea0f5 : 0x3654d1);
    floor.material.opacity = dark ? 0.32 : 0.16;
    render();
  }
  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    render();
  }
  let frame = 0;
  function render() {
    if (frame) return;
    frame = requestAnimationFrame(() => { frame = 0; placeCamera(); renderer.render(scene, camera); });
  }
  // drag to orbit, wheel to zoom
  const el = renderer.domElement;
  let drag = null, moved = false;
  const api = {};
  const markMoved = (m) => { if (moved !== m) { moved = m; api.onView?.(m); } };
  el.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, yaw: orbit.yaw, pitch: orbit.pitch }; el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointermove', (e) => {
    if (!drag) return;
    orbit.yaw = drag.yaw - (e.clientX - drag.x) * 0.008;
    orbit.pitch = Math.max(0.12, Math.min(1.35, drag.pitch + (e.clientY - drag.y) * 0.006));
    if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 3) markMoved(true);
    render();
  });
  el.addEventListener('pointerup', () => { drag = null; });
  el.addEventListener('wheel', (e) => { e.preventDefault(); orbit.dist = Math.max(1.2, Math.min(7, orbit.dist * (1 + Math.sign(e.deltaY) * 0.08))); markMoved(true); render(); }, { passive: false });
  const resetView = () => { orbit.yaw = mode === 'advanced' ? 0.42 : 0.78; orbit.pitch = mode === 'advanced' ? 0.62 : 0.5; orbit.dist = mode === 'advanced' ? 2.9 : 2.4; markMoved(false); render(); };

  const ro = new ResizeObserver(resize);
  ro.observe(host);
  setTheme(matchMedia('(prefers-color-scheme: dark)').matches);
  resize();
  update(last);

  return Object.assign(api, {
    ok: true,
    update, resize, setTheme, render, resetView,
    /** True once the camera was turned or zoomed (the page shows "Reset view" only then). */
    moved: () => moved,
    /** Joint angles in degrees per arm lane (A1…A6), and the grip (1 open … 0 closed). */
    joints: () => Object.fromEntries(Object.entries(arms).map(([lane, a]) => [lane, { q: a.q.map((r) => Math.round(deg(r) * 10) / 10), grip: a.grip }])),
    /** Where an arm's finger tips are now (world, metres) — for the checks. */
    tip: (lane) => { const a = arms[lane]; if (!a) return null; a.joints[0].parent.updateMatrixWorld(true); const v = new THREE.Vector3(LT, 0, 0); a.joints[5].localToWorld(v); return { x: v.x, y: v.y, z: v.z }; },
    station: (key) => { const t = topAt(key); return t ? { x: t[0], y: t[1], z: t[2] } : null; },
    /** What an arm's gripper shows right now: 'base' | 'insert' | 'lid' | 'box' | null. */
    held: (lane) => Object.entries(arms[lane]?.held ?? {}).find(([, m]) => m.visible)?.[0] ?? null,
    canvas: el,
    dispose() { ro.disconnect(); cancelAnimationFrame(frame); renderer.dispose(); host.innerHTML = ''; },
  });
}
