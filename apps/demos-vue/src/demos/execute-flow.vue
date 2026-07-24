<script setup lang="ts">
import { ref, shallowRef } from 'vue';
import { GrafloriaFlow } from '@grafloria/vue';
import type { DiagramInstance } from '@grafloria/vue';
import { markReady } from '../ready';

// n8n-style flow execution over the SHIPPED status machinery: every node carries
// state.status ('idle'|'pending'|'running'|'completed'|'error'|'warning') and
// state.animateStatus; the renderer turns them into node-status-* classes with a
// pulsing highlight for 'running'. The active wire animates in the chosen style
// (marching-ants / flow / pulse / dash-flow, any speed, either direction). A
// failure halts the run n8n-style, a warning does not, a live run can be paused,
// stepped while paused, and continued; reduced motion stills all animation while
// the static affordances survive.
const SPEC = {
  nodes: [
    { id: 'trigger',   position: { x: 60,  y: 180 }, size: { width: 130, height: 54 }, label: 'Trigger' },
    { id: 'fetch',     position: { x: 260, y: 180 }, size: { width: 130, height: 54 }, label: 'Fetch data' },
    { id: 'transform', position: { x: 460, y: 180 }, size: { width: 130, height: 54 }, label: 'Transform' },
    { id: 'validate',  position: { x: 660, y: 100 }, size: { width: 130, height: 54 }, label: 'Validate' },
    { id: 'enrich',    position: { x: 660, y: 260 }, size: { width: 130, height: 54 }, label: 'Enrich' },
    { id: 'save',      position: { x: 860, y: 180 }, size: { width: 130, height: 54 }, label: 'Save' },
    { id: 'notify',    position: { x: 1060, y: 180 }, size: { width: 130, height: 54 }, label: 'Notify' },
  ],
  edges: [
    { id: 'e1', source: 'trigger',   target: 'fetch' },
    { id: 'e2', source: 'fetch',     target: 'transform' },
    { id: 'e3', source: 'transform', target: 'validate' },
    { id: 'e4', source: 'transform', target: 'enrich' },
    { id: 'e5', source: 'validate',  target: 'save' },
    { id: 'e6', source: 'enrich',    target: 'save' },
    { id: 'e7', source: 'save',      target: 'notify' },
  ],
};
const ORDER = ['trigger', 'fetch', 'transform', 'validate', 'enrich', 'save', 'notify'];

const readout = ref('idle');
const selType = ref('marching-ants');
const selSpeed = ref('fast');
const selDir = ref('forward');
const chkPulse = ref(true);
const chkRm = ref(false);
const pauseLabel = ref('⏸ pause');
const pauseDisabled = ref(true);
const stepDisabled = ref(false);
const launchDisabled = ref(false);

const ctl = shallowRef<any>({});

function onInit(api: DiagramInstance) {
  try {
    const diagram: any = api.getModel();
    api.animations.updateConfig({ respectBatteryStatus: false, batterySavingMode: false });
    api.fitView(40);

    const wireAnim = () => ({ type: selType.value, speed: selSpeed.value, direction: selDir.value });
    const activeEdges = new Set<string>();
    const setStatus = (id: string, status: string) => {
      const n = diagram.getNode(id);
      if (n) n.setState({ status, animateStatus: chkPulse.value });
    };
    const setEdgeActive = (id: string, active: boolean) => {
      const l = diagram.getLink(id);
      if (!l) { activeEdges.delete(id); return; }
      if (active) { activeEdges.add(id); l.updateStyle({ animation: wireAnim() }); }
      else { activeEdges.delete(id); l.updateStyle({ animation: { type: 'none' } }); }
    };
    const aliveOrder = () => ORDER.filter((id) => diagram.getNode(id));
    const beginNode = (id: string) => { for (const e of SPEC.edges) if (e.target === id) setEdgeActive(e.id, true); setStatus(id, 'running'); };
    const endNode = (id: string, status: string) => { for (const e of SPEC.edges) if (e.target === id) setEdgeActive(e.id, false); setStatus(id, status); };

    let stepIndex = -1;
    let runActive = false;
    let paused = false;
    let runToken = 0;
    let pauseWaiters: Array<() => void> = [];
    let pendingSteps = 0;
    let wakeSleep: (() => void) | null = null;

    const syncButtons = () => {
      pauseDisabled.value = !runActive;
      pauseLabel.value = paused ? '▶ continue' : '⏸ pause';
      stepDisabled.value = runActive && !paused;
    };
    const gateSleep = (ms: number) => new Promise<void>((res) => {
      const t = setTimeout(() => { wakeSleep = null; res(); }, ms);
      wakeSleep = () => { clearTimeout(t); wakeSleep = null; res(); };
    });
    const pokeGate = () => { if (wakeSleep) wakeSleep(); };
    const releaseGate = (all: boolean) => {
      if (all) { pendingSteps = 0; for (const res of pauseWaiters.splice(0)) res(); return; }
      const parked = pauseWaiters.splice(0, 1);
      if (parked.length) parked[0]();
      else { pendingSteps += 1; pokeGate(); }
    };
    const stepGate = async (stepMs: number) => {
      if (!paused) await gateSleep(stepMs);
      if (!paused) return;
      if (pendingSteps > 0) { pendingSteps -= 1; return; }
      await new Promise<void>((res) => pauseWaiters.push(res));
    };
    const setPaused = (on: boolean) => {
      if (!runActive) return;
      paused = on; syncButtons();
      const held = ORDER.find((id) => diagram.getNode(id)?.state.status === 'running');
      if (on) readout.value = `paused at: ${held ?? '—'} — ▶ continue or step ▸`;
      else { if (held) readout.value = `running: ${held}`; releaseGate(true); }
    };
    const reset = () => {
      runToken += 1; paused = false; runActive = false; syncButtons();
      releaseGate(true); pokeGate(); stepIndex = -1;
      for (const id of ORDER) setStatus(id, 'idle');
      for (const e of SPEC.edges) setEdgeActive(e.id, false);
      api.renderNow(); readout.value = 'idle';
    };
    const execute = async ({ failAt = null as string | null, warnAt = null as string | null, stepMs = 550 } = {}) => {
      reset();
      const token = runToken; runActive = true; syncButtons();
      try {
        const walk = aliveOrder();
        for (const id of walk) setStatus(id, 'pending');
        api.renderNow();
        let warned: string | null = null;
        for (const id of walk) {
          beginNode(id);
          readout.value = paused ? `paused at: ${id} — ▶ continue or step ▸` : `running: ${id}`;
          api.renderNow();
          await stepGate(stepMs);
          if (token !== runToken) return { completed: [], failed: null, warned: null, aborted: true };
          if (failAt === id) { endNode(id, 'error'); readout.value = `failed at: ${id} — downstream never ran`; api.renderNow(); return { completed: walk.slice(0, walk.indexOf(id)), failed: id, warned }; }
          if (warnAt === id) { warned = id; endNode(id, 'warning'); readout.value = `warning at: ${id} — flow continues`; }
          else endNode(id, 'completed');
          api.renderNow();
        }
        readout.value = warned ? `flow completed with a warning at ${warned} ⚠` : 'flow completed ✓';
        return { completed: walk.filter((id) => id !== warned), failed: null, warned };
      } finally {
        if (token === runToken) { runActive = false; paused = false; syncButtons(); }
      }
    };
    const step = () => {
      const walk = aliveOrder();
      if (!walk.length) return;
      if (stepIndex < 0) { reset(); for (const id of walk) setStatus(id, 'pending'); stepIndex = 0; beginNode(walk[0]); readout.value = `step 1/${walk.length}: running ${walk[0]}`; }
      else {
        endNode(walk[Math.min(stepIndex, walk.length - 1)], 'completed');
        stepIndex += 1;
        if (stepIndex < walk.length) { beginNode(walk[stepIndex]); readout.value = `step ${stepIndex + 1}/${walk.length}: running ${walk[stepIndex]}`; }
        else { stepIndex = -1; readout.value = 'flow completed ✓'; }
      }
      api.renderNow();
    };
    const applyWire = () => { for (const id of activeEdges) diagram.getLink(id)?.updateStyle({ animation: wireAnim() }); if (activeEdges.size) api.renderNow(); };
    const applyPulse = () => { for (const id of aliveOrder()) { const n = diagram.getNode(id); if (n.state.status && n.state.status !== 'idle') n.setState({ animateStatus: chkPulse.value }); } api.renderNow(); };
    const applyRm = () => { api.animations.updateConfig({ reducedMotion: chkRm.value }); };
    const busy = async (fn: () => Promise<unknown>) => { launchDisabled.value = true; try { await fn(); } finally { launchDisabled.value = false; } };

    ctl.value = {
      run: () => busy(() => execute()),
      fail: () => busy(() => execute({ failAt: 'transform' })),
      warn: () => busy(() => execute({ warnAt: 'enrich' })),
      pauseToggle: () => setPaused(!paused),
      step: () => { if (runActive && paused) releaseGate(false); else if (!runActive) step(); },
      reset,
      applyWire, applyPulse, applyRm,
    };
    syncButtons();
  } catch { /* executor optional; canvas still paints */ }
  markReady();
}
</script>

<template>
  <div style="display:flex; flex-direction:column; height:100vh">
    <div style="display:flex; gap:8px; padding:8px 24px; border-bottom:1px solid rgba(127,127,127,.25); align-items:center; flex-wrap:wrap">
      <button :disabled="launchDisabled" @click="ctl.run?.()" class="ef-btn">▶ execute flow</button>
      <button :disabled="launchDisabled" @click="ctl.fail?.()" class="ef-btn">execute with a failure</button>
      <button :disabled="launchDisabled" @click="ctl.warn?.()" class="ef-btn">execute with a warning</button>
      <button :disabled="pauseDisabled" @click="ctl.pauseToggle?.()" class="ef-btn">{{ pauseLabel }}</button>
      <button :disabled="stepDisabled" @click="ctl.step?.()" class="ef-btn">step ▸</button>
      <button @click="ctl.reset?.()" class="ef-btn">reset</button>
      <span style="margin-left:auto; font:12px/1.4 ui-monospace,monospace; opacity:.8">{{ readout }}</span>
    </div>
    <div style="display:flex; gap:8px; padding:6px 24px; border-bottom:1px solid rgba(127,127,127,.25); align-items:center; flex-wrap:wrap; font:12px/1.6 system-ui">
      <label class="ef-lab">wire
        <select v-model="selType" @change="ctl.applyWire?.()" class="ef-sel">
          <option value="marching-ants">marching ants</option>
          <option value="flow">flow</option>
          <option value="pulse">pulse</option>
          <option value="dash-flow">dash flow</option>
        </select>
      </label>
      <label class="ef-lab">speed
        <select v-model="selSpeed" @change="ctl.applyWire?.()" class="ef-sel">
          <option value="slow">slow</option>
          <option value="normal">normal</option>
          <option value="fast">fast</option>
        </select>
      </label>
      <label class="ef-lab">direction
        <select v-model="selDir" @change="ctl.applyWire?.()" class="ef-sel">
          <option value="forward">forward</option>
          <option value="reverse">reverse</option>
        </select>
      </label>
      <label class="ef-lab"><input type="checkbox" v-model="chkPulse" @change="ctl.applyPulse?.()"> pulse the running node</label>
      <label class="ef-lab"><input type="checkbox" v-model="chkRm" @change="ctl.applyRm?.()"> reduced motion (statics only)</label>
    </div>
    <div style="flex:1; position:relative">
      <GrafloriaFlow :default-nodes="SPEC.nodes" :default-edges="SPEC.edges" @init="onInit" />
    </div>
  </div>
</template>

<style scoped>
.ef-btn { padding:5px 12px; border-radius:6px; border:1px solid rgba(127,127,127,.4); background:transparent; color:inherit; cursor:pointer; font:inherit; }
.ef-btn:disabled { opacity:.5; cursor:default; }
.ef-lab { display:inline-flex; gap:5px; align-items:center; opacity:.9; }
.ef-sel { font:inherit; color:inherit; background:transparent; border:1px solid rgba(127,127,127,.4); border-radius:5px; padding:2px 4px; }
</style>
