<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { GrafloriaFlow } from '@grafloria/vue';
import type { DiagramInstance } from '@grafloria/vue';
import { MemoryHub } from '@grafloria/engine';
import { markReady } from '../ready';

// Conflict resolution: two peers edit the SAME node at the SAME time — one moves
// it, the other renames it — offline from each other (batched with a huge
// interval so nothing crosses the wire until Exchange flushes both op logs).
// Both converge with BOTH edits intact, because a per-property CRDT keeps
// position and label as different registers.
const hub = new MemoryHub();
const nodesA = [{ id: 'n1', label: 'Draft', position: { x: 120, y: 120 }, size: { width: 160, height: 70 } }];
const edgesA: unknown[] = [];
const nodesB = [{ id: 'n1', label: 'Draft', position: { x: 120, y: 120 }, size: { width: 160, height: 70 } }];
const edgesB: unknown[] = [];
const collabA = { transport: hub.connect('ana'), actor: 'ana', batch: { intervalMs: 1_000_000 } } as never;
const collabB = { transport: hub.connect('bo'), actor: 'bo', batch: { intervalMs: 1_000_000 } } as never;

const name = ref('Final');
const statA = ref('');
const statB = ref('');
const verdict = ref('');

let instA: DiagramInstance | null = null;
let instB: DiagramInstance | null = null;
let sessionA: { flush: () => void } | null = null;
let sessionB: { flush: () => void } | null = null;

const nodeOf = (inst: DiagramInstance | null): any =>
  (inst?.getEngine().getDiagram() as any)?.getNode('n1');

const stateOf = (inst: DiagramInstance | null) => {
  const n = nodeOf(inst);
  return n ? { label: n.getMetadata('label'), x: Math.round(n.position.x), w: n.size.width } : { label: '?', x: 0, w: 0 };
};

function refresh() {
  const a = stateOf(instA);
  const b = stateOf(instB);
  const d = { lbl: a.label !== b.label, x: a.x !== b.x, w: a.w !== b.w };
  const chip = (s: { label: string; x: number; w: number }) =>
    `label <b${d.lbl ? ' style="color:#e0245e"' : ''}>"${s.label}"</b> · x <b${d.x ? ' style="color:#e0245e"' : ''}>${s.x}</b> · w <b${d.w ? ' style="color:#e0245e"' : ''}>${s.w}</b>`;
  statA.value = chip(a);
  statB.value = chip(b);
  const converged = !d.lbl && !d.x && !d.w;
  const edited = !(a.label === 'Draft' && a.x === 120 && a.w === 160);
  verdict.value = !converged
    ? '<span style="color:#b45309">● diverged — the peers hold different values until you Exchange</span>'
    : edited
      ? '<span style="color:#16a34a;font-weight:600">✓ converged — every edit survived on BOTH peers</span>'
      : 'in sync — both peers agree (boot state)';
}

function moveA() { nodeOf(instA)?.setPosition(360, 250); refresh(); }
function renameB() { nodeOf(instB)?.setMetadata('label', (name.value || 'Final').trim() || 'Final'); refresh(); }
function resizeA() { nodeOf(instA)?.setSize(220, 90); refresh(); }
function exchange() {
  sessionA?.flush();
  sessionB?.flush();
  requestAnimationFrame(() => { instA?.renderNow(); instB?.renderNow(); refresh(); });
}
function resetAll() {
  for (const inst of [instA, instB]) {
    const n = nodeOf(inst);
    if (n) { n.setPosition(120, 120); n.setSize(160, 70); n.setMetadata('label', 'Draft'); }
  }
  sessionA?.flush(); sessionB?.flush();
  requestAnimationFrame(() => { instA?.renderNow(); instB?.renderNow(); name.value = 'Final'; refresh(); });
}

const onInitA = (inst: DiagramInstance) => { instA = inst; refresh(); };
const onInitB = (inst: DiagramInstance) => { instB = inst; refresh(); };
const onReadyA = (s: { flush: () => void }) => { sessionA = s; };
const onReadyB = (s: { flush: () => void }) => { sessionB = s; };

onMounted(() => markReady());
</script>

<template>
  <div style="font-size:12px;opacity:.8;padding:10px 14px;border-bottom:1px solid rgba(127,127,127,.25)">
    Peer A moves n1, peer B renames it — offline. Their chips disagree until Exchange, then both converge with both edits intact.
  </div>
  <div style="display:flex; height:calc(100vh - 150px)">
    <div style="flex:1; min-width:0; display:flex; flex-direction:column; border-right:2px solid rgba(127,127,127,.35)">
      <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid rgba(127,127,127,.25)">
        <span style="font:11px ui-monospace,Menlo,monospace;background:rgba(37,99,235,.85);color:#fff;padding:2px 8px;border-radius:4px">peer A — moves it</span>
        <button @click="moveA" style="padding:5px 11px;border-radius:6px;border:1px solid rgba(127,127,127,.4);background:transparent;color:inherit;cursor:pointer;font-size:12px">⤢ Move node</button>
        <span style="margin-left:auto;font:12px ui-monospace,Menlo,monospace;opacity:.85" v-html="statA"></span>
      </div>
      <GrafloriaFlow style="flex:1" :default-nodes="nodesA" :default-edges="edgesA" :collab="collabA" @init="onInitA" @collab-ready="onReadyA" />
    </div>
    <div style="flex:1; min-width:0; display:flex; flex-direction:column">
      <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid rgba(127,127,127,.25)">
        <span style="font:11px ui-monospace,Menlo,monospace;background:rgba(37,99,235,.85);color:#fff;padding:2px 8px;border-radius:4px">peer B — renames it</span>
        <input v-model="name" style="font-size:12px;padding:4px 7px;width:90px;border:1px solid rgba(127,127,127,.4);border-radius:6px;background:transparent;color:inherit">
        <button @click="renameB" style="padding:5px 11px;border-radius:6px;border:1px solid rgba(127,127,127,.4);background:transparent;color:inherit;cursor:pointer;font-size:12px">✎ Rename</button>
        <span style="margin-left:auto;font:12px ui-monospace,Menlo,monospace;opacity:.85" v-html="statB"></span>
      </div>
      <GrafloriaFlow style="flex:1" :default-nodes="nodesB" :default-edges="edgesB" :collab="collabB" @init="onInitB" @collab-ready="onReadyB" />
    </div>
  </div>
  <div style="display:flex;align-items:center;gap:10px;padding:9px 14px;border-top:1px solid rgba(127,127,127,.3)">
    <button @click="exchange" style="padding:5px 11px;border-radius:6px;border:1px solid rgba(37,99,235,.6);background:transparent;color:inherit;cursor:pointer;font-size:12px;font-weight:600">⇄ Exchange / Sync</button>
    <button @click="resetAll" style="padding:5px 11px;border-radius:6px;border:1px solid rgba(127,127,127,.4);background:transparent;color:inherit;cursor:pointer;font-size:12px">↺ Reset</button>
    <button @click="resizeA" style="padding:5px 11px;border-radius:6px;border:1px solid rgba(127,127,127,.4);background:transparent;color:inherit;cursor:pointer;font-size:12px">＋ Resize n1</button>
    <span style="margin-left:8px;font-size:13px" v-html="verdict"></span>
  </div>
</template>
