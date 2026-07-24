<script setup lang="ts">
import { ref, shallowRef, onMounted, onBeforeUnmount } from 'vue';
import { GrafloriaDiagram } from '@grafloria/vue';
import type { DiagramInstance } from '@grafloria/vue';
import { markReady } from '../ready';
import {
  buildSpec, card, evalIf, aiStyle, mainStyle,
  KIND, META, TITLES0, DEFAULT_PARAMS, SIM_MS, PALETTE, kindLabel, CAT_BG,
  YES, NO,
} from './n8n-spec';

/**
 * The flagship n8n-style workflow builder, on the Grafloria engine — with n8n's
 * EXECUTION model, not just its looks. Press "▶ Test workflow" and a topological
 * walk sweeps the graph from the Trigger: the running node spins, finished nodes
 * get green ✓ badges, a failing one a red ! that halts the run; wires grow
 * "n items" pills; the AI Agent's model/memory/tool sub-nodes flash on animated
 * dashed wires while it thinks; the If node routes items down ONE branch by a
 * real condition. Pause / step / continue a live run, read the execution log,
 * and double-click any node for the Node Details View (input items | a per-type
 * Parameters form + Settings tab | output items, plus "Execute step").
 *
 * The imperative machinery is the same as the execute-flow demo — node metadata
 * re-render for status, link.updateStyle({ animation }) for wire flow, a graph
 * walk executor — reached through the Vue wrapper's getEngine()/getModel().
 */

interface LogRow { title: string; sub: string; status: string; ms: number; nIn: number; nOut: number; note: string; }
interface Field { type: string; key?: string; label?: string; options?: string[]; code?: boolean; text?: string; }
type Pane = { items?: any[]; count: string; hint?: string; prevBtn?: boolean };

// The spec DATA, verbatim from the JS source. Mounted through <GrafloriaDiagram>
// (the element render() path) — the same entry point the JS demo uses, which
// paints the nodes' metadata.html cards as foreignObjects. (GrafloriaFlow's
// createDiagram path does not render metadata.html bodies for these nodes.)
const spec = buildSpec();
const diagramOptions = { interaction: { portVisibility: 'always' as never } };

// ---- imperative (non-reactive) state ------------------------------------
let api!: DiagramInstance;
let model: any;
let engine: any;

const titles: Record<string, string> = { ...TITLES0 };
const PARAMS: Record<string, any> = {};
const SETTINGS: Record<string, any> = {};
const flash = new Set<string>();

const RS = {
  seq: 0,
  status: new Map<string, string>(),
  data: new Map<string, { input: any[]; output: any[]; ms: number }>(),
  branchOut: new Map<string, Record<string, any[]>>(),
  executed: [] as string[],
  log: [] as LogRow[],
  running: null as string | null,
};

let runToken = 0;
let pauseWaiters: Array<() => void> = [];
let pendingSteps = 0;
let wakeSleep: (() => void) | null = null;
let added = 0;
const DARK_MQ = window.matchMedia('(prefers-color-scheme: dark)');
let darkListener: (() => void) | null = null;

// ---- reactive UI state --------------------------------------------------
const hudText = ref('');
const readout = ref('idle');
const logsOpen = ref(false);
const logRows = ref<LogRow[]>([]);
const logStatusText = ref('idle');
const logStatusCls = ref('');
const failArmed = ref(false);
const runActive = ref(false);
const paused = ref(false);

const ndvOpen = ref(false);
const ndvOpenId = ref<string | null>(null);
const ndvBadge = ref('⚙');
const ndvBadgeBg = ref('#667');
const ndvName = ref('');
const ndvKind = ref('');
const ndvTab = ref<'params' | 'settings'>('params');
const ndvFields = ref<Field[]>([]);
const ndvInput = ref<Pane>({ count: '' });
const ndvOutput = ref<Pane>({ count: '' });
const formBump = ref(0);

const canvasHost = ref<HTMLElement | null>(null);

const palItems = ['http', 'set', 'code', 'if', 'merge', 'ai'].map((kind) => ({
  kind, glyph: PALETTE[kind].glyph, sub: PALETTE[kind].sub, mono: !!PALETTE[kind].mono, bg: CAT_BG[kind],
}));

function defSettings() { return { notes: '', retryOnFail: false, continueOnFail: false, executeOnce: false }; }

// ---- link helpers -------------------------------------------------------
function isMain(l: any) { return !/agent_(model|memory|tool)|_aiout/.test(`${l.sourcePortId} ${l.targetPortId}`); }
function srcOf(l: any) { return model.getNodeByPortId(l.sourcePortId)?.id; }
function tgtOf(l: any) { return model.getNodeByPortId(l.targetPortId)?.id; }
function styleFor(l: any) {
  return l.sourcePortId === 'if_true' ? { stroke: YES, strokeWidth: 2, arrowHead: { type: 'arrow', size: 8, filled: true } }
    : l.sourcePortId === 'if_false' ? { stroke: NO, strokeWidth: 2, arrowHead: { type: 'arrow', size: 8, filled: true } }
      : !isMain(l) ? aiStyle() : mainStyle();
}
function baseLabel(l: any) { return l.sourcePortId === 'if_true' ? 'true' : l.sourcePortId === 'if_false' ? 'false' : ''; }

const PILL = 'wire-pill';
function pillStyle() {
  return DARK_MQ.matches
    ? { fontSize: 11, fontWeight: '600', color: '#e7e9f0', background: '#262733', border: '#3a3c49', padding: 5, borderRadius: 9 }
    : { fontSize: 11, fontWeight: '600', color: '#3c4254', background: '#ffffff', border: '#d6dae4', padding: 5, borderRadius: 9 };
}
function setWirePill(l: any, text: string) {
  const i = l.labels.findIndex((x: any) => x.id === PILL);
  if (!text) { if (i !== -1) l.removeLabel(PILL); return; }
  if (i !== -1) l.updateLabel(i, { text, style: pillStyle() });
  else l.addLabel({ id: PILL, text, position: 0.5, offset: { x: 0, y: 0 }, style: pillStyle() });
}
function setPill(l: any, n: number) {
  const b = baseLabel(l);
  setWirePill(l, n > 0 ? (b ? b + ' · ' : '') + n + (n === 1 ? ' item' : ' items') : b);
}
function clearPill(l: any) { setWirePill(l, baseLabel(l)); }
function pillsFrom(id: string) {
  const d = RS.data.get(id);
  if (!d) return;
  const b = RS.branchOut.get(id);
  for (const l of model.getLinks()) {
    if (!isMain(l) || srcOf(l) !== id) continue;
    setPill(l, b ? (b[l.sourcePortId] ?? []).length : d.output.length);
  }
}
function setEdgesRun(id: string, on: boolean) {
  for (const l of model.getLinks()) {
    if (!isMain(l) || tgtOf(l) !== id) continue;
    l.updateStyle({ ...styleFor(l), animation: on ? { type: 'flow', speed: 'fast', direction: 'forward' } : { type: 'none' } });
  }
}
function setAgentFlash(id: string, on: boolean) {
  if (!/^agent$/.test(id)) return;
  for (const sid of ['model', 'memory', 'tool']) { on ? flash.add(sid) : flash.delete(sid); paintNode(sid); }
  for (const l of model.getLinks()) {
    if (isMain(l)) continue;
    l.updateStyle({ ...aiStyle(), animation: on ? { type: 'dash-flow', speed: 'fast', direction: 'forward' } : { type: 'none' } });
  }
}

// ---- painting: the card IS the status display ---------------------------
function paintNode(id: string) {
  const n = model.getNode(id), m = META[id];
  if (!n || !m) return;
  const st = RS.status.get(id) || 'idle';
  const dangling = id === 'slack' && !model.getLinks().some((l: any) => isMain(l) && tgtOf(l) === 'slack');
  n.setMetadata('html', {
    content: card(m.cat, m.glyph, titles[id] ?? id, dangling ? 'drag a wire to me' : m.sub,
      { mono: m.mono, dangling, status: st, flash: flash.has(id) }),
    padding: 0,
  });
}
function paintStatus(id: string, st: string) { RS.status.set(id, st); paintNode(id); }

function restyleLinks() {
  for (const l of model.getLinks()) l.updateStyle(styleFor(l));
  paintNode('slack');
}

function updateHud() { hudText.value = `${model.getNodes().length} nodes · ${model.getLinks().length} wires`; }

// ---- the execution log --------------------------------------------------
function setLogStatus(text: string, cls = '') { logStatusText.value = text; logStatusCls.value = cls; }
function pushLog(id: string, status: string, ms: number, nIn: number, nOut: number, note = '') {
  RS.log.push({ title: titles[id] ?? id, sub: (META[id] || {}).sub || '', status, ms, nIn, nOut, note });
  logRows.value = [...RS.log];
}

// ---- the walk: topological over MAIN edges ------------------------------
function buildWalk(upTo: string | null = null, exclusive = false): string[] {
  const links = model.getLinks().filter((l: any) => isMain(l));
  const out = new Map<string, string[]>(), rin = new Map<string, string[]>();
  for (const l of links) {
    const s = srcOf(l), t = tgtOf(l);
    if (!s || !t) continue;
    (out.get(s) ?? out.set(s, []).get(s)!).push(t);
    (rin.get(t) ?? rin.set(t, []).get(t)!).push(s);
  }
  const seen = new Set<string>();
  const q = model.getNode('start') ? ['start'] : [];
  while (q.length) {
    const id = q.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const t of out.get(id) || []) q.push(t);
  }
  let keep: Set<string> = seen;
  if (upTo) {
    keep = new Set();
    const q2 = [upTo];
    while (q2.length) {
      const id = q2.shift()!;
      if (keep.has(id) || !seen.has(id)) continue;
      keep.add(id);
      for (const s of rin.get(id) || []) q2.push(s);
    }
    if (exclusive) keep.delete(upTo);
  }
  const deg = new Map<string, number>();
  for (const id of keep) deg.set(id, 0);
  for (const l of links) {
    const s = srcOf(l), t = tgtOf(l);
    if (keep.has(s) && keep.has(t)) deg.set(t, (deg.get(t) || 0) + 1);
  }
  const order: string[] = [], q3 = [...keep].filter((id) => deg.get(id) === 0);
  while (q3.length) {
    const id = q3.shift()!;
    order.push(id);
    for (const t of out.get(id) || []) {
      if (!keep.has(t)) continue;
      deg.set(t, deg.get(t)! - 1);
      if (deg.get(t) === 0) q3.push(t);
    }
  }
  return order;
}

function gatherInputs(id: string): any[] {
  const items: any[] = [];
  for (const l of model.getLinks()) {
    if (!isMain(l) || tgtOf(l) !== id) continue;
    const up = srcOf(l);
    if (!up || !RS.data.has(up)) continue;
    const b = RS.branchOut.get(up);
    items.push(...(b ? (b[l.sourcePortId] ?? []) : RS.data.get(up)!.output));
  }
  return items;
}

// ---- the simulators: items in → items out, per node ---------------------
function simOutput(id: string, input: any[]): any[] {
  const p = PARAMS[id] || {};
  switch (id) {
    case 'start': return [{ trigger: 'manual', run: RS.seq }];
    case 'login': return [{ token: 'pams.7f3d1c', expiresIn: 3600 }];
    case 'setToken': return input.map((it) => ({ ...it, authorization: 'Bearer pams.7f3d1c' }));
    case 'getBranches': return ['Cairo HQ', 'Alexandria', 'Giza Plant', 'Mansoura'].map((name, i) => ({ branchId: 101 + i, name }));
    case 'getVendors': {
      const pend = RS.seq % 2 === 1 ? 0 : 2;
      return [
        { vendorId: 'V-201', vendor: 'Nile Supplies', pendingInquiries: 0 },
        { vendorId: 'V-202', vendor: 'Delta Tools', pendingInquiries: pend },
        { vendorId: 'V-203', vendor: 'Suez Freight', pendingInquiries: 0 },
      ];
    }
    case 'store': return input.map((it) => ({ ...it, storedAt: 'lookup_cache' }));
    case 'agent': {
      const open = input.reduce((n, it) => n + (it.pendingInquiries || 0), 0);
      return [{ verdict: open === 0 ? 'all inquiries resolved' : `${open} inquiries still open`, openInquiries: open, allDone: open === 0 }];
    }
    case 'excel': return [{ file: p.file || 'summary.xlsx', rows: input.length, written: true }];
    case 'slack': return [{ channel: p.channel || '#it-ops', sent: true }];
    default: break;
  }
  switch (KIND[id]) {
    case 'http': return [{ status: 200, url: p.url }, { status: 200, page: 2 }];
    case 'ai': return [{ response: 'ok' }];
    default: return input.length ? input : [{}];
  }
}

// ---- pause/step gate ----------------------------------------------------
function gateSleep(ms: number): Promise<void> {
  return new Promise((res) => {
    const t = setTimeout(() => { wakeSleep = null; res(); }, ms);
    wakeSleep = () => { clearTimeout(t); wakeSleep = null; res(); };
  });
}
function pokeGate() { if (wakeSleep) wakeSleep(); }
function releaseGate(all: boolean) {
  if (all) {
    pendingSteps = 0;
    for (const res of pauseWaiters.splice(0)) res();
    return;
  }
  const parked = pauseWaiters.splice(0, 1);
  if (parked.length) parked[0]();
  else { pendingSteps += 1; pokeGate(); }
}
async function stepGate(stepMs: number) {
  if (!paused.value) await gateSleep(stepMs);
  if (!paused.value) return;
  if (pendingSteps > 0) { pendingSteps -= 1; return; }
  await new Promise<void>((res) => pauseWaiters.push(res));
}

function setPaused(on: boolean) {
  if (!runActive.value) return;
  paused.value = on;
  const held = RS.running;
  if (on) readout.value = `paused at: ${held ? titles[held] : '—'} — ▶ continue or step ▸`;
  else {
    if (held) readout.value = `running: ${titles[held]}`;
    releaseGate(true);
  }
}

function reset() {
  runToken += 1;
  paused.value = false;
  runActive.value = false;
  releaseGate(true);
  pokeGate();
  RS.status.clear(); RS.data.clear(); RS.branchOut.clear();
  RS.executed = []; RS.log = []; RS.running = null;
  flash.clear();
  logRows.value = [];
  for (const id of Object.keys(META)) paintNode(id);
  for (const l of model.getLinks()) {
    clearPill(l);
    l.updateStyle({ ...styleFor(l), animation: { type: 'none' } });
  }
  setLogStatus('idle', '');
  readout.value = 'idle';
  if (ndvOpenId.value) refreshNDVData();
}

/** THE EXECUTOR — walks the live graph topologically from the trigger. */
async function execute({ stepMs = 480, upTo = null as string | null, exclusive = false, startPaused = false } = {}) {
  reset();
  const token = runToken;
  RS.seq += 1;
  runActive.value = true;
  paused.value = !!startPaused;
  logsOpen.value = true;
  setLogStatus('Running…', '');
  try {
    const walk = buildWalk(upTo, exclusive);
    if (!walk.length) {
      readout.value = upTo ? 'not connected to the trigger' : 'no trigger node';
      setLogStatus(readout.value, 'err');
      return { executed: [] as string[], failed: null as string | null, aborted: false };
    }
    for (const id of walk) if (model.getNode(id)) paintStatus(id, 'pending');

    let failedAt: string | null = null, totalMs = 0;
    for (const id of walk) {
      if (!model.getNode(id)) continue;
      const hasIncoming = model.getLinks().some((l: any) => isMain(l) && tgtOf(l) === id);
      const input = gatherInputs(id);
      if (hasIncoming && input.length === 0) continue;

      RS.running = id;
      paintStatus(id, 'running');
      setEdgesRun(id, true);
      setAgentFlash(id, true);
      readout.value = paused.value ? `paused at: ${titles[id]} — ▶ continue or step ▸` : `running: ${titles[id]}`;
      await stepGate(stepMs);
      if (token !== runToken) return { executed: [] as string[], failed: null as string | null, aborted: true };
      if (paused.value) readout.value = `paused at: ${titles[id]} — ▶ continue or step ▸`;

      const s = SETTINGS[id] || defSettings();
      const inWork = s.executeOnce ? input.slice(0, 1) : input;
      let failing = failArmed.value && id === 'getVendors';
      let ms = SIM_MS[id] ?? 45, note = '', status = 'completed', output: any[];
      if (failing && s.retryOnFail) { failing = false; ms = ms * 2 + 210; note = ' · retried ×1'; }
      if (failing) {
        status = 'error';
        output = s.continueOnFail ? [{ error: 'PAMS vendor API: 502 Bad Gateway' }] : [];
        if (s.continueOnFail) note = ' · continued';
        else failedAt = id;
      } else {
        output = simOutput(id, inWork);
      }
      if (id === 'ifNode' && status === 'completed') {
        const parts = evalIf(output, PARAMS.ifNode || {});
        RS.branchOut.set(id, { if_true: parts.t, if_false: parts.f });
      }
      RS.data.set(id, { input: inWork, output, ms });
      RS.executed.push(id);
      totalMs += ms;

      setEdgesRun(id, false);
      setAgentFlash(id, false);
      paintStatus(id, status);
      pillsFrom(id);
      pushLog(id, status, ms, inWork.length, output.length, note);
      if (failedAt) break;
    }
    RS.running = null;
    for (const id of walk) if (RS.status.get(id) === 'pending') paintStatus(id, 'idle');
    const secs = (totalMs / 1000).toFixed(2);
    if (failedAt) {
      readout.value = `✗ failed at: ${titles[failedAt]} — downstream never ran`;
      setLogStatus(`Error after ${secs}s — halted at ${titles[failedAt]}`, 'err');
    } else {
      readout.value = upTo ? `✓ ran up to: ${titles[upTo] ?? upTo}` : '✓ workflow ran successfully';
      setLogStatus(`Success in ${secs}s · ${RS.executed.length} nodes`, 'ok');
    }
    if (ndvOpenId.value) refreshNDVData();
    return { executed: [...RS.executed], failed: failedAt, aborted: false };
  } finally {
    if (token === runToken) {
      runActive.value = false;
      paused.value = false;
      RS.running = null;
    }
  }
}

// ---- run-bar wiring -----------------------------------------------------
function onRun() { if (!runActive.value) execute(); }
function onPause() { setPaused(!paused.value); }
function onStep() {
  if (runActive.value && paused.value) releaseGate(false);
  else if (!runActive.value) execute({ startPaused: true, stepMs: 250 });
}
function onReset() { reset(); }
function onToggleLogs() { logsOpen.value = !logsOpen.value; }
function onCloseLogs() { logsOpen.value = false; }
function onToggleFail() { failArmed.value = !failArmed.value; }
const stepDisabled = () => runActive.value && !paused.value;

// ---- the NDV ------------------------------------------------------------
function paramFields(id: string): Field[] {
  switch (KIND[id]) {
    case 'trigger': return [{ type: 'note', text: 'When you press "▶ Test workflow", this trigger emits one item and the run begins. Triggers have no parameters here.' }];
    case 'http': return [
      { type: 'select', key: 'method', label: 'Method', options: ['GET', 'POST', 'PUT', 'DELETE'] },
      { type: 'text', key: 'url', label: 'URL' },
      { type: 'select', key: 'auth', label: 'Authentication', options: ['None', 'Basic Auth', 'Header Auth', 'Bearer Token'] },
    ];
    case 'set': return [{ type: 'set-fields' }];
    case 'code': return [
      { type: 'select', key: 'mode', label: 'Mode', options: ['Run Once for All Items', 'Run Once for Each Item'] },
      { type: 'textarea', key: 'code', label: 'JavaScript', code: true },
    ];
    case 'merge': return [
      { type: 'select', key: 'mode', label: 'Mode', options: ['Append', 'Combine', 'Choose Branch'] },
      { type: 'number', key: 'inputs', label: 'Number of inputs' },
    ];
    case 'if': return [
      { type: 'text', key: 'value1', label: 'Value 1' },
      { type: 'select', key: 'operation', label: 'Operation', options: ['is true', 'is false', 'equals', 'not equals', 'larger'] },
      { type: 'text', key: 'value2', label: 'Value 2' },
    ];
    case 'ai': return [
      { type: 'textarea', key: 'prompt', label: 'Prompt (system message)' },
      { type: 'select', key: 'model', label: 'Model', options: ['gpt-5.5', 'gpt-4.1', 'o4-mini'] },
      { type: 'number', key: 'temperature', label: 'Temperature' },
    ];
    case 'ai-model': return [
      { type: 'text', key: 'deployment', label: 'Deployment' },
      { type: 'text', key: 'apiVersion', label: 'API version' },
    ];
    case 'ai-memory': return [
      { type: 'text', key: 'collection', label: 'Collection' },
      { type: 'number', key: 'contextWindow', label: 'Context window' },
    ];
    case 'ai-tool': return [{ type: 'textarea', key: 'description', label: 'Tool description' }];
    case 'sheet': return [
      { type: 'select', key: 'operation', label: 'Operation', options: ['Write to file', 'Append to file'] },
      { type: 'text', key: 'file', label: 'File name' },
    ];
    case 'noop': return [
      { type: 'number', key: 'amount', label: 'Wait amount' },
      { type: 'select', key: 'unit', label: 'Unit', options: ['seconds', 'minutes', 'hours'] },
    ];
    case 'notify': return [
      { type: 'text', key: 'channel', label: 'Channel' },
      { type: 'textarea', key: 'text', label: 'Message' },
    ];
    default: return [{ type: 'note', text: 'This node has no parameters.' }];
  }
}

// template accessors for the NDV params/settings forms
function paramVal(key: string) { return ndvOpenId.value ? (PARAMS[ndvOpenId.value]?.[key] ?? '') : ''; }
function onParamInput(key: string, value: string, isNumber = false) {
  if (!ndvOpenId.value) return;
  PARAMS[ndvOpenId.value][key] = isNumber ? Number(value) : value;
}
function setFields(): Array<{ name: string; value: string }> {
  formBump.value;
  return ndvOpenId.value ? (PARAMS[ndvOpenId.value]?.fields ?? []) : [];
}
function onSetFieldName(i: number, v: string) { setFields()[i].name = v; }
function onSetFieldValue(i: number, v: string) { setFields()[i].value = v; }
function addSetField() {
  const f = setFields();
  f.push({ name: 'field_' + (f.length + 1), value: '' });
  formBump.value += 1;
}
function settingVal(key: string) { return ndvOpenId.value ? !!SETTINGS[ndvOpenId.value]?.[key] : false; }
function notesVal() { return ndvOpenId.value ? (SETTINGS[ndvOpenId.value]?.notes ?? '') : ''; }
function onSettingToggle(key: string, checked: boolean) { if (ndvOpenId.value) SETTINGS[ndvOpenId.value][key] = checked; }
function onNotesInput(v: string) { if (ndvOpenId.value) SETTINGS[ndvOpenId.value].notes = v; }

function renderPaneView(which: 'input' | 'output'): Pane {
  const id = ndvOpenId.value;
  const empty: Pane = { count: '' };
  if (!id) return empty;
  if (['ai-model', 'ai-memory', 'ai-tool'].includes(KIND[id])) {
    return { count: '', hint: which === 'input'
      ? 'This sub-node is invoked BY its AI Agent while the agent step runs — it takes no items of its own.'
      : "Sub-nodes produce no items; they answer the agent's calls." };
  }
  const d = RS.data.get(id);
  let items: any[] | null = d ? (d as any)[which] : null;
  if (!items && which === 'input') {
    const fromUpstream = gatherInputs(id);
    if (fromUpstream.length) items = fromUpstream;
  }
  if (!items) {
    if (which === 'output') return { count: '', hint: 'No output data yet — press "▶ Execute step" above to run up to this node.' };
    if (KIND[id] === 'trigger') return { count: '', hint: 'The trigger starts the run — it consumes no input items.' };
    if (!model.getLinks().some((l: any) => isMain(l) && tgtOf(l) === id))
      return { count: '', hint: 'Wire an input into this node first — it has no incoming connection.' };
    return { count: '', hint: 'No input data yet.', prevBtn: true };
  }
  return { items, count: `${items.length} item${items.length === 1 ? '' : 's'}` };
}
function refreshNDVData() {
  ndvInput.value = renderPaneView('input');
  ndvOutput.value = renderPaneView('output');
}
function json(it: any) { return JSON.stringify(it, null, 1); }

function openNDV(id: string) {
  if (!META[id] || !model.getNode(id)) return;
  ndvOpenId.value = id;
  const m = META[id];
  ndvBadge.value = m.glyph;
  ndvBadgeBg.value = CAT_BG[m.cat] || '#667';
  ndvName.value = titles[id] ?? id;
  ndvKind.value = kindLabel[KIND[id]] || m.sub;
  ndvTab.value = 'params';
  ndvFields.value = paramFields(id);
  formBump.value += 1;
  refreshNDVData();
  ndvOpen.value = true;
}
function closeNDV() { ndvOpenId.value = null; ndvOpen.value = false; }
function onNdvName(v: string) {
  if (!ndvOpenId.value) return;
  ndvName.value = v;
  titles[ndvOpenId.value] = v;
  paintNode(ndvOpenId.value);
}
function onNdvExec() { if (ndvOpenId.value && !runActive.value) execute({ upTo: ndvOpenId.value, stepMs: 140 }); }
function onExecutePrev() { if (ndvOpenId.value && !runActive.value) execute({ upTo: ndvOpenId.value, exclusive: true, stepMs: 140 }); }
function setTab(t: 'params' | 'settings') { ndvTab.value = t; }

function onKeydown(e: KeyboardEvent) { if (e.key === 'Escape' && ndvOpen.value) closeNDV(); }

// Double-click a node card → its NDV. DOM bbox hit-test (the card is not
// itself clickable — its foreignObject passes pointer events to the shape).
function onDblClick(e: MouseEvent) {
  const host = canvasHost.value;
  if (!host) return;
  let hitId: string | null = null, best = Infinity;
  for (const cardEl of Array.from(host.querySelectorAll<HTMLElement>('.n8n-card'))) {
    const r = cardEl.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) continue;
    const area = r.width * r.height;
    if (area >= best) continue;
    const g = cardEl.closest<Element>('[data-node-id]');
    if (g) { hitId = g.getAttribute('data-node-id'); best = area; }
  }
  if (hitId) openNDV(hitId);
}

// ---- palette ------------------------------------------------------------
async function addNode(kind: string) {
  const meta = PALETTE[kind];
  const x = 60 + (added % 3) * 46, y = 470 + Math.floor(added / 3) * 24;
  added++;
  const node = await engine.addNode({ type: 'rect', position: { x, y }, size: { width: 200, height: 64 } });
  node.setMetadata('shape', { type: 'rect', fill: 'none', stroke: 'none' });
  KIND[node.id] = kind;
  META[node.id] = { cat: kind, glyph: meta.glyph, sub: meta.sub, mono: meta.mono };
  titles[node.id] = meta.sub;
  PARAMS[node.id] = (DEFAULT_PARAMS[kind] || (() => ({})))(node.id);
  SETTINGS[node.id] = defSettings();
  paintNode(node.id);
  updateHud();
  return node;
}

// ---- boot ---------------------------------------------------------------
function onInit(instance: DiagramInstance) {
  api = instance;
  engine = api.getEngine();
  model = api.getModel();
  if (!model) { markReady(); return; }

  engine.setInteractionConfig?.({ portVisibility: 'always' as never });

  // Keep the n8n CARDS painted at every zoom (LOD widening).
  try {
    const cfg = model.getLODConfig();
    const full = new Set<any>();
    for (const t of cfg.tiers) for (const f of t.features) full.add(f);
    for (const t of cfg.tiers) for (const f of full) t.features.add(f);
    model.setLODConfig(cfg);
  } catch { /* older engine without LOD config — the demo still runs */ }

  // registry defaults
  for (const id of Object.keys(KIND)) {
    PARAMS[id] = DEFAULT_PARAMS[KIND[id]](id);
    SETTINGS[id] = defSettings();
  }

  // Boot the wire labels as pills (If branches show true/false).
  for (const l of model.getLinks()) clearPill(l);
  updateHud();

  api.fitView(46);

  // A live scheme flip repaints the chips (they are model styles, not CSS).
  darkListener = () => {
    for (const l of model.getLinks()) {
      const i = l.labels.findIndex((x: any) => x.id === PILL);
      if (i !== -1) l.updateLabel(i, { style: pillStyle() });
    }
  };
  DARK_MQ.addEventListener?.('change', darkListener);

  // connect-by-drag restyles the new wire (main/ai/branch) + resolves slack.
  model.on?.('link:added', () => setTimeout(() => { restyleLinks(); updateHud(); }, 0));

  markReady();
}

onMounted(() => document.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown);
  if (darkListener) DARK_MQ.removeEventListener?.('change', darkListener);
});
</script>

<template>
  <div id="n8n-stage">
    <div id="n8n-palette">
      <div class="pal-title">Add node</div>
      <button v-for="p in palItems" :key="p.kind" class="pal-item" @click="addNode(p.kind)">
        <span class="pal-dot" :class="{ mono: p.mono }" :style="{ background: p.bg }">{{ p.glyph }}</span>{{ p.sub }}
      </button>
    </div>

    <div id="n8n-canvas" ref="canvasHost" :class="{ 'logs-open': logsOpen }" @dblclick="onDblClick">
      <GrafloriaDiagram :spec="spec" :options="diagramOptions" @ready="onInit" />

      <div id="n8n-hud">{{ hudText }}</div>

      <div id="n8n-legend">
        <b>Connections</b>
        <div class="row"><span class="swatch main"></span>data flow (main)</div>
        <div class="row"><span class="swatch ai"></span>ai · model / memory / tool</div>
        <div class="row"><span class="swatch yes"></span>if → true</div>
        <div class="row"><span class="swatch no"></span>if → false</div>
      </div>

      <div id="n8n-runbar">
        <button id="btn-run" title="Run the workflow from the trigger" :disabled="runActive" @click="onRun">▶ Test workflow</button>
        <button class="rb" :disabled="!runActive" @click="onPause">{{ paused ? '▶ continue' : '⏸ pause' }}</button>
        <button class="rb" title="Advance one node (starts a paused run when idle)" :disabled="stepDisabled()" @click="onStep">step ▸</button>
        <button class="rb" @click="onReset">reset</button>
        <button class="rb" :aria-pressed="logsOpen" @click="onToggleLogs">☰ logs</button>
        <button class="rb" :aria-pressed="failArmed" title="Simulate a 502 from the vendors API on the next run" @click="onToggleFail">⚡ fail vendors</button>
        <span id="run-readout">{{ readout }}</span>
      </div>

      <div id="n8n-runlog" :hidden="!logsOpen">
        <div class="rl-head">
          <span>Execution log</span>
          <span id="rl-status" :class="logStatusCls">{{ logStatusText }}</span>
          <button id="rl-close" title="close" @click="onCloseLogs">×</button>
        </div>
        <div class="rl-rows">
          <div v-for="(r, i) in logRows" :key="i" class="rl-row">
            <span class="rl-dot" :class="{ err: r.status === 'error' }"></span>
            <span class="rl-name">{{ r.title }}</span>
            <span class="rl-sub">{{ r.sub }}</span>
            <span>{{ r.nIn }} → {{ r.nOut }} items</span>
            <span class="rl-ms">{{ r.ms }} ms{{ r.note }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div id="n8n-ndv" :hidden="!ndvOpen">
    <div class="ndv-back" @click="closeNDV"></div>
    <div class="ndv-modal">
      <div class="ndv-head">
        <div class="hd-badge" :style="{ background: ndvBadgeBg }">{{ ndvBadge }}</div>
        <div>
          <input id="ndv-name" aria-label="Node name" :value="ndvName" @input="onNdvName(($event.target as HTMLInputElement).value)" />
          <div class="hd-kind">{{ ndvKind }}</div>
        </div>
        <button id="ndv-exec" :disabled="runActive" @click="onNdvExec">▶ Execute step</button>
        <button id="ndv-close" title="close (Esc)" @click="closeNDV">×</button>
      </div>

      <div class="ndv-body">
        <!-- INPUT pane -->
        <div class="ndv-pane">
          <div class="ndv-pane-head"><span>Input</span><span>{{ ndvInput.count }}</span></div>
          <div class="ndv-items">
            <template v-if="ndvInput.items">
              <div v-for="(it, i) in ndvInput.items" :key="i" class="ndv-item"><pre>{{ json(it) }}</pre></div>
            </template>
            <div v-else class="ndv-hint">
              {{ ndvInput.hint }}
              <button v-if="ndvInput.prevBtn" @click="onExecutePrev">▶ Execute previous nodes</button>
            </div>
          </div>
        </div>

        <!-- PARAMETERS / SETTINGS -->
        <div class="ndv-main">
          <div class="ndv-tabs">
            <button class="ndv-tab" :class="{ on: ndvTab === 'params' }" @click="setTab('params')">Parameters</button>
            <button class="ndv-tab" :class="{ on: ndvTab === 'settings' }" @click="setTab('settings')">Settings</button>
          </div>

          <div id="ndv-params" :style="{ display: ndvTab === 'params' ? '' : 'none' }">
            <template v-for="(f, i) in ndvFields" :key="i">
              <p v-if="f.type === 'note'" class="ndv-note">{{ f.text }}</p>
              <div v-else-if="f.type === 'select'" class="ndv-field">
                <label>{{ f.label }}</label>
                <select :data-param="f.key" @change="onParamInput(f.key!, ($event.target as HTMLSelectElement).value)">
                  <option v-for="o in f.options" :key="o" :value="o" :selected="o === paramVal(f.key!)">{{ o }}</option>
                </select>
              </div>
              <div v-else-if="f.type === 'text'" class="ndv-field">
                <label>{{ f.label }}</label>
                <input type="text" :data-param="f.key" :value="paramVal(f.key!)" @input="onParamInput(f.key!, ($event.target as HTMLInputElement).value)" />
              </div>
              <div v-else-if="f.type === 'number'" class="ndv-field">
                <label>{{ f.label }}</label>
                <input type="number" :data-param="f.key" :value="paramVal(f.key!)" @input="onParamInput(f.key!, ($event.target as HTMLInputElement).value, true)" />
              </div>
              <div v-else-if="f.type === 'textarea'" class="ndv-field">
                <label>{{ f.label }}</label>
                <textarea :class="{ code: f.code }" :data-param="f.key" :value="paramVal(f.key!)" @input="onParamInput(f.key!, ($event.target as HTMLTextAreaElement).value)"></textarea>
              </div>
              <template v-else-if="f.type === 'set-fields'">
                <div class="ndv-field"><label>Fields to set (name = value)</label></div>
                <div v-for="(kv, j) in setFields()" :key="j" class="ndv-kv">
                  <input type="text" :value="kv.name" @input="onSetFieldName(j, ($event.target as HTMLInputElement).value)" />
                  <input type="text" :value="kv.value" @input="onSetFieldValue(j, ($event.target as HTMLInputElement).value)" />
                </div>
                <button class="ndv-add" @click="addSetField">+ Add field</button>
              </template>
            </template>
          </div>

          <div id="ndv-settings" :style="{ display: ndvTab === 'settings' ? '' : 'none' }">
            <label class="ndv-check">
              <input type="checkbox" :checked="settingVal('retryOnFail')" @change="onSettingToggle('retryOnFail', ($event.target as HTMLInputElement).checked)" />
              <span>Retry on fail — one retry, then give up</span>
            </label>
            <label class="ndv-check">
              <input type="checkbox" :checked="settingVal('continueOnFail')" @change="onSettingToggle('continueOnFail', ($event.target as HTMLInputElement).checked)" />
              <span>Continue on fail — pass the error item downstream</span>
            </label>
            <label class="ndv-check">
              <input type="checkbox" :checked="settingVal('executeOnce')" @change="onSettingToggle('executeOnce', ($event.target as HTMLInputElement).checked)" />
              <span>Execute once — consume only the first input item</span>
            </label>
            <div class="ndv-field">
              <label>Notes</label>
              <textarea :value="notesVal()" @input="onNotesInput(($event.target as HTMLTextAreaElement).value)"></textarea>
            </div>
          </div>
        </div>

        <!-- OUTPUT pane -->
        <div class="ndv-pane out">
          <div class="ndv-pane-head"><span>Output</span><span>{{ ndvOutput.count }}</span></div>
          <div class="ndv-items">
            <template v-if="ndvOutput.items">
              <div v-for="(it, i) in ndvOutput.items" :key="i" class="ndv-item"><pre>{{ json(it) }}</pre></div>
            </template>
            <div v-else class="ndv-hint">{{ ndvOutput.hint }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
/* ---- the n8n canvas: a dotted grid ground ------------------------------ */
#n8n-stage { display: grid; grid-template-columns: 188px 1fr; height: 100vh; min-height: 460px; }
#n8n-palette { border-right: 1px solid rgba(127,127,127,.2); padding: 12px 12px 16px; overflow-y: auto;
  background: #fafbfd; }
#n8n-palette .pal-title { font: 600 10px/1.4 system-ui, sans-serif; letter-spacing: .8px; text-transform: uppercase;
  color: #8a91a2; margin: 2px 2px 10px; }
#n8n-palette .pal-item { display: flex; align-items: center; gap: 9px; width: 100%; margin: 0 0 8px; padding: 7px 9px;
  border: 1px solid #e4e7ee; border-radius: 9px; background: #fff; cursor: pointer; text-align: left;
  font: 500 12.5px/1.2 system-ui, sans-serif; color: #2d2e3a; box-shadow: 0 1px 1px rgba(16,24,40,.04); }
#n8n-palette .pal-item:hover { border-color: #c7ccd8; background: #f7f8fb; }
#n8n-palette .pal-dot { width: 24px; height: 24px; border-radius: 6px; flex: none; display: flex; align-items: center;
  justify-content: center; font-size: 14px; color: #fff; }
#n8n-palette .pal-dot.mono { font: 700 12px/1 ui-monospace, monospace; }
#n8n-canvas { height: 100%; position: relative; overflow: hidden;
  background-color: #f4f5f8;
  background-image: radial-gradient(circle, #d5d9e2 1.1px, transparent 1.1px);
  background-size: 22px 22px; }
#n8n-canvas > div:first-child { display: block; height: 100%; }
/* Status badges sit half-out of the card's top-right corner, n8n-style. */
#n8n-canvas foreignObject { overflow: visible; }

/* ---- the node card painted inside each node's foreignObject ------------- */
#n8n-canvas .n8n-card { display: flex; align-items: center; gap: 10px; width: 100%; height: 100%;
  box-sizing: border-box; padding: 0 12px; background: #fff; color: #2d2e3a; position: relative;
  border: 1px solid #dfe2ea; border-left-width: 3px; border-radius: 9px;
  box-shadow: 0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.05); font-family: system-ui, sans-serif; }
#n8n-canvas .n8n-badge { width: 34px; height: 34px; border-radius: 8px; flex: none; display: flex;
  align-items: center; justify-content: center; font-size: 19px; line-height: 1; color: #fff; background: #667; }
#n8n-canvas .n8n-badge.mono { font: 700 15px/1 ui-monospace, monospace; }
#n8n-canvas .n8n-body { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
#n8n-canvas .n8n-title { font-weight: 600; font-size: 13.5px; line-height: 1.15; color: #262a35;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#n8n-canvas .n8n-sub { font-size: 10px; letter-spacing: .4px; text-transform: uppercase; color: #8a91a2;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* Trigger nodes: the signature n8n left-rounded "start" pill. */
#n8n-canvas .n8n-card.cat-trigger { border-radius: 28px 9px 9px 28px; padding-left: 15px; }

/* A half-wired "next step" node — dashed, inviting you to connect it. */
#n8n-canvas .n8n-card.dangling { border-style: dashed; border-color: #b794f4; background: #fbf8ff; }
#n8n-canvas .n8n-card.dangling .n8n-sub { color: #9b6bd6; }

/* Category accents: coloured icon badge + left border, n8n-style. */
#n8n-canvas .cat-trigger .n8n-badge { background: #10b981; } #n8n-canvas .cat-trigger { border-left-color: #10b981; }
#n8n-canvas .cat-http    .n8n-badge { background: #0ea5e9; } #n8n-canvas .cat-http    { border-left-color: #0ea5e9; }
#n8n-canvas .cat-set     .n8n-badge { background: #6366f1; } #n8n-canvas .cat-set     { border-left-color: #6366f1; }
#n8n-canvas .cat-code    .n8n-badge { background: #475569; } #n8n-canvas .cat-code    { border-left-color: #475569; }
#n8n-canvas .cat-merge   .n8n-badge { background: #06b6d4; } #n8n-canvas .cat-merge   { border-left-color: #06b6d4; }
#n8n-canvas .cat-if      .n8n-badge { background: #f97316; } #n8n-canvas .cat-if      { border-left-color: #f97316; }
#n8n-canvas .cat-ai      .n8n-badge { background: #8b5cf6; } #n8n-canvas .cat-ai      { border-left-color: #8b5cf6; }
#n8n-canvas .cat-sheet   .n8n-badge { background: #22a565; } #n8n-canvas .cat-sheet   { border-left-color: #22a565; }
#n8n-canvas .cat-notify  .n8n-badge { background: #ec4899; } #n8n-canvas .cat-notify  { border-left-color: #ec4899; }

/* ---- EXECUTION affordances (the n8n run language) ----------------------- */
#n8n-canvas .n8n-card.st-pending { opacity: .42; }
#n8n-canvas .n8n-card.st-running { border-color: #ff6d5a; border-left-color: #ff6d5a;
  box-shadow: 0 0 0 2.5px rgba(255,109,90,.28), 0 2px 8px rgba(255,109,90,.18); }
#n8n-canvas .n8n-card.st-error { border-color: #ea1f30; border-left-color: #ea1f30;
  box-shadow: 0 0 0 2px rgba(234,31,48,.18); }
#n8n-canvas .n8n-card.st-flash { border-color: #8b5cf6;
  box-shadow: 0 0 0 2.5px rgba(139,92,246,.3), 0 2px 10px rgba(139,92,246,.25); }
#n8n-canvas .n8n-status { position: absolute; top: -8px; right: -8px; width: 17px; height: 17px;
  border-radius: 50%; display: flex; align-items: center; justify-content: center;
  font: 700 10.5px/1 system-ui, sans-serif; color: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.28); }
#n8n-canvas .n8n-status.ok  { background: #2ea56e; }
#n8n-canvas .n8n-status.err { background: #ea1f30; }
#n8n-canvas .n8n-spin { position: absolute; top: -9px; right: -9px; width: 18px; height: 18px;
  box-sizing: border-box; border-radius: 50%; background: #fff;
  border: 3px solid rgba(255,109,90,.25); border-top-color: #ff6d5a;
  animation: n8nspin .7s linear infinite; }
@keyframes n8nspin { to { transform: rotate(360deg); } }

/* ---- the floating run bar (n8n's bottom-centre "Test workflow") --------- */
#n8n-runbar { position: absolute; left: 50%; transform: translateX(-50%); bottom: 14px; z-index: 6;
  display: flex; gap: 7px; align-items: center; background: rgba(255,255,255,.96);
  border: 1px solid #dfe2ea; border-radius: 12px; padding: 8px 10px;
  box-shadow: 0 6px 22px rgba(15,23,42,.16); }
#n8n-canvas.logs-open #n8n-runbar { bottom: 200px; }
#n8n-runbar #btn-run { background: #ff6d5a; color: #fff; border: none; font: 600 13px/1.2 system-ui, sans-serif;
  padding: 8px 14px; border-radius: 8px; cursor: pointer; }
#n8n-runbar #btn-run:hover { background: #f75e4a; }
#n8n-runbar #btn-run:disabled { opacity: .55; cursor: default; }
#n8n-runbar .rb { padding: 7px 10px; border: 1px solid #d6dae4; background: #fff; border-radius: 8px;
  cursor: pointer; font: 500 12px/1.2 system-ui, sans-serif; color: #3c4254; }
#n8n-runbar .rb:hover { border-color: #b9bfce; }
#n8n-runbar .rb:disabled { opacity: .45; cursor: default; }
#n8n-runbar .rb[aria-pressed="true"] { background: #fdece9; border-color: #ff6d5a; color: #c2402f; }
#n8n-runbar #run-readout { font: 11px/1.3 ui-monospace, monospace; color: #6a7183; min-width: 76px; max-width: 200px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* ---- the execution log panel (n8n's bottom Logs view) ------------------- */
#n8n-runlog { position: absolute; left: 0; right: 0; bottom: 0; height: 186px; z-index: 5;
  background: rgba(255,255,255,.97); border-top: 1px solid #dfe2ea; display: flex;
  flex-direction: column; box-shadow: 0 -8px 24px rgba(15,23,42,.09); }
#n8n-runlog[hidden] { display: none; }
#n8n-runlog .rl-head { display: flex; gap: 10px; align-items: center; padding: 7px 14px;
  border-bottom: 1px solid #eceef4; font: 600 10px/1.4 system-ui, sans-serif;
  letter-spacing: .7px; text-transform: uppercase; color: #7c8296; }
#n8n-runlog #rl-status { text-transform: none; letter-spacing: 0; font: 500 11.5px/1.3 system-ui, sans-serif; color: #6a7183; }
#n8n-runlog #rl-status.ok { color: #218358; } #n8n-runlog #rl-status.err { color: #c11626; }
#n8n-runlog #rl-close { margin-left: auto; border: none; background: transparent; color: #8a91a2;
  font-size: 15px; cursor: pointer; padding: 0 2px; }
#n8n-runlog .rl-rows { overflow: auto; flex: 1; }
#n8n-runlog .rl-row { display: grid; grid-template-columns: 14px minmax(140px,1.2fr) minmax(90px,1fr) 110px 110px;
  gap: 10px; align-items: center; padding: 4px 14px; border-bottom: 1px dashed #eef0f5;
  font: 11.5px/1.5 ui-monospace, monospace; color: #3c4254; }
#n8n-runlog .rl-dot { width: 8px; height: 8px; border-radius: 50%; background: #2ea56e; }
#n8n-runlog .rl-dot.err { background: #ea1f30; }
#n8n-runlog .rl-name { font-family: system-ui, sans-serif; font-weight: 600; font-size: 12px; color: #2d2e3a;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#n8n-runlog .rl-sub { color: #8a91a2; font-size: 10px; text-transform: uppercase; letter-spacing: .4px;
  font-family: system-ui, sans-serif; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#n8n-runlog .rl-ms { text-align: right; color: #6a7183; }

/* ---- the NDV (Node Details View) — n8n's input | parameters | output ---- */
#n8n-ndv { position: fixed; inset: 0; z-index: 40; display: flex; align-items: center; justify-content: center; }
#n8n-ndv[hidden] { display: none; }
#n8n-ndv .ndv-back { position: absolute; inset: 0; background: rgba(22,23,32,.62); }
#n8n-ndv .ndv-modal { position: relative; width: min(1150px, 94vw); height: min(660px, 88vh); background: #f4f5f9;
  border-radius: 12px; overflow: hidden; display: flex; flex-direction: column;
  box-shadow: 0 24px 80px rgba(0,0,0,.45); font-family: system-ui, sans-serif; }
#n8n-ndv .ndv-head { display: flex; align-items: center; gap: 10px; background: #2b2c39; color: #eceef4;
  padding: 9px 14px; flex: none; }
#n8n-ndv .ndv-head .hd-badge { width: 30px; height: 30px; border-radius: 7px; flex: none; display: flex;
  align-items: center; justify-content: center; font-size: 16px; color: #fff; background: #667; }
#n8n-ndv #ndv-name { background: transparent; border: 1px solid transparent; color: inherit;
  font: 600 15px/1.3 system-ui, sans-serif; padding: 4px 8px; border-radius: 6px; min-width: 240px; }
#n8n-ndv #ndv-name:hover, #n8n-ndv #ndv-name:focus { border-color: #4a4c5e; background: #232430; outline: none; }
#n8n-ndv .ndv-head .hd-kind { font-size: 10.5px; letter-spacing: .5px; text-transform: uppercase; color: #8a90a6; }
#n8n-ndv #ndv-exec { margin-left: auto; background: #ff6d5a; color: #fff; border: none; border-radius: 8px;
  padding: 8px 14px; font: 600 12.5px/1.2 system-ui, sans-serif; cursor: pointer; }
#n8n-ndv #ndv-exec:hover { background: #f75e4a; }
#n8n-ndv #ndv-exec:disabled { opacity: .5; cursor: default; }
#n8n-ndv #ndv-close { background: transparent; color: #9aa0b4; border: none; font-size: 20px; cursor: pointer; padding: 0 4px; }
#n8n-ndv #ndv-close:hover { color: #fff; }
#n8n-ndv .ndv-body { flex: 1; display: grid; grid-template-columns: 1fr 1.18fr 1fr; min-height: 0; }
#n8n-ndv .ndv-pane { display: flex; flex-direction: column; min-height: 0; background: #eef0f6; border-right: 1px solid #e0e3ec; }
#n8n-ndv .ndv-pane.out { border-right: none; border-left: 1px solid #e0e3ec; }
#n8n-ndv .ndv-pane-head { font: 600 10px/1.4 system-ui, sans-serif; letter-spacing: .7px; text-transform: uppercase;
  padding: 10px 12px 8px; color: #7c8296; display: flex; justify-content: space-between; }
#n8n-ndv .ndv-items { overflow: auto; padding: 0 10px 12px; flex: 1; display: flex; flex-direction: column; }
#n8n-ndv .ndv-item { background: #fff; border: 1px solid #e2e5ee; border-radius: 8px; margin: 0 0 8px; flex: none; }
#n8n-ndv .ndv-item pre { margin: 0; padding: 7px 10px; font: 10.5px/1.55 ui-monospace, monospace;
  white-space: pre-wrap; word-break: break-word; color: #34394a; }
#n8n-ndv .ndv-hint { margin: auto; text-align: center; color: #8a91a2; font: 12.5px/1.6 system-ui, sans-serif; padding: 18px; }
#n8n-ndv .ndv-hint button { display: block; margin: 10px auto 0; border: 1px solid #ff6d5a; color: #d34a36;
  background: #fff; border-radius: 8px; padding: 7px 12px; font: 600 12px/1.2 system-ui, sans-serif; cursor: pointer; }
#n8n-ndv .ndv-hint button:hover { background: #fdece9; }
#n8n-ndv .ndv-main { background: #fff; display: flex; flex-direction: column; min-height: 0; }
#n8n-ndv .ndv-tabs { display: flex; gap: 2px; padding: 6px 12px 0; border-bottom: 1px solid #eceef4; flex: none; }
#n8n-ndv .ndv-tab { border: none; background: transparent; font: 600 12.5px/1.3 system-ui, sans-serif; color: #7c8296;
  padding: 8px 10px; cursor: pointer; border-bottom: 2px solid transparent; }
#n8n-ndv .ndv-tab.on { color: #ff6d5a; border-bottom-color: #ff6d5a; }
#n8n-ndv #ndv-params, #n8n-ndv #ndv-settings { overflow: auto; padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; }
#n8n-ndv .ndv-field label { display: block; font: 600 11px/1.4 system-ui, sans-serif; color: #5b6273; margin-bottom: 4px; }
#n8n-ndv .ndv-field input[type="text"], #n8n-ndv .ndv-field input[type="number"], #n8n-ndv .ndv-field select, #n8n-ndv .ndv-field textarea {
  width: 100%; box-sizing: border-box; font: 12.5px/1.4 system-ui, sans-serif; padding: 7px 9px;
  border: 1px solid #d9dde7; border-radius: 7px; background: #fbfcfe; color: #2d2e3a; }
#n8n-ndv .ndv-field textarea { min-height: 74px; resize: vertical; }
#n8n-ndv .ndv-field textarea.code { font: 11.5px/1.5 ui-monospace, monospace; min-height: 130px; }
#n8n-ndv .ndv-kv { display: grid; grid-template-columns: 1fr 1.4fr; gap: 6px; margin-bottom: 6px; }
#n8n-ndv .ndv-add { align-self: flex-start; border: 1px dashed #c3c9d6; background: transparent; color: #5b6273;
  border-radius: 7px; padding: 6px 10px; font: 600 11.5px/1.2 system-ui, sans-serif; cursor: pointer; }
#n8n-ndv .ndv-check { display: flex; gap: 8px; align-items: center; font: 12.5px/1.4 system-ui, sans-serif; color: #3c4254; }
#n8n-ndv .ndv-note { font: 12px/1.6 system-ui, sans-serif; color: #7c8296; }

/* HUD + legend — plain chrome, overlaid on the canvas (no model entities). */
#n8n-hud { position: absolute; right: 12px; top: 10px; z-index: 4; font: 12px/1.3 ui-monospace, monospace;
  color: #5b6273; background: rgba(255,255,255,.86); border: 1px solid #dfe2ea; border-radius: 8px;
  padding: 5px 10px; pointer-events: none; }
#n8n-legend { position: absolute; left: 12px; bottom: 12px; z-index: 4; pointer-events: none;
  font: 11px/1.5 system-ui, sans-serif; color: #4b5162; background: rgba(255,255,255,.92);
  border: 1px solid #dfe2ea; border-radius: 9px; padding: 9px 12px; box-shadow: 0 4px 14px rgba(15,23,42,.1); }
#n8n-legend b { display: block; font: 600 9.5px/1.4 system-ui; letter-spacing: .6px; text-transform: uppercase;
  color: #8a91a2; margin-bottom: 5px; }
#n8n-legend .row { display: flex; align-items: center; gap: 8px; margin: 2px 0; }
#n8n-legend .swatch { width: 30px; height: 0; flex: none; }
#n8n-legend .main  { border-top: 2.5px solid #9aa2b1; }
#n8n-legend .ai    { border-top: 2.5px dashed #8b5cf6; }
#n8n-legend .yes   { border-top: 2.5px solid #16a34a; }
#n8n-legend .no    { border-top: 2.5px solid #dc2626; }

/* The AI port labels (Model / Memory / Tool) sit exactly where their dashed
   wires dive into the agent's bottom ports — a canvas-coloured text HALO. */
#n8n-canvas text.ai-port-label { fill: #4b5162; paint-order: stroke; stroke: #f4f5f8;
  stroke-width: 5px; stroke-linejoin: round; }

@media (prefers-color-scheme: dark) {
  #n8n-canvas text.ai-port-label { fill: #b9becd; stroke: #16171d; }
  #n8n-palette { background: #191a22; border-right-color: rgba(255,255,255,.08); }
  #n8n-palette .pal-item { background: #23242f; border-color: #33353f; color: #e7e9f0; }
  #n8n-palette .pal-item:hover { background: #2b2c39; border-color: #45485a; }
  #n8n-palette .pal-title { color: #7b8194; }
  #n8n-canvas { background-color: #16171d; background-image: radial-gradient(circle, #2a2c38 1.1px, transparent 1.1px); }
  #n8n-canvas .n8n-card { background: #262733; color: #e7e9f0; border-color: #363845; }
  #n8n-canvas .n8n-title { color: #eceef4; }
  #n8n-canvas .n8n-sub { color: #9298ab; }
  #n8n-canvas .n8n-card.dangling { background: #241d33; border-color: #6d4fa0; }
  #n8n-canvas .n8n-spin { background: #262733; }
  #n8n-hud, #n8n-legend { background: rgba(30,31,42,.9); border-color: #363845; color: #b9becd; }
  #n8n-legend b { color: #838aa0; }
  #n8n-runbar { background: rgba(30,31,42,.95); border-color: #363845; }
  #n8n-runbar .rb { background: #23242f; border-color: #3a3c49; color: #c9cdda; }
  #n8n-runbar .rb[aria-pressed="true"] { background: #3a2320; border-color: #ff6d5a; color: #ff8d7d; }
  #n8n-runbar #run-readout { color: #9298ab; }
  #n8n-runlog { background: rgba(24,25,33,.97); border-top-color: #363845; }
  #n8n-runlog .rl-head { border-bottom-color: #2c2e3a; color: #838aa0; }
  #n8n-runlog .rl-row { border-bottom-color: #23242f; color: #c9cdda; }
  #n8n-runlog .rl-name { color: #e7e9f0; }
  #n8n-ndv .ndv-modal { background: #1d1e28; }
  #n8n-ndv .ndv-pane { background: #191a22; border-color: #2c2e3a; }
  #n8n-ndv .ndv-pane.out { border-left-color: #2c2e3a; }
  #n8n-ndv .ndv-main { background: #23242f; }
  #n8n-ndv .ndv-tabs { border-bottom-color: #2c2e3a; }
  #n8n-ndv .ndv-item { background: #262733; border-color: #363845; }
  #n8n-ndv .ndv-item pre { color: #c9cdda; }
  #n8n-ndv .ndv-field input[type="text"], #n8n-ndv .ndv-field input[type="number"], #n8n-ndv .ndv-field select, #n8n-ndv .ndv-field textarea {
    background: #1c1d26; border-color: #3a3c49; color: #e7e9f0; }
  #n8n-ndv .ndv-check { color: #c9cdda; }
  #n8n-ndv .ndv-hint button { background: #23242f; }
}
</style>
