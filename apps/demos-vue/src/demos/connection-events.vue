<script setup lang="ts">
import { ref } from 'vue';
import { GrafloriaFlow } from '@grafloria/vue';
import type { DiagramInstance } from '@grafloria/vue';
import { markReady } from '../ready';

// A live log of the connection lifecycle the engine fires as you drag a wire:
// start → per-move update → port enter/leave → complete (valid) OR cancel
// (abandoned/refused). The stream splits the "end" by outcome.
const nodes = [
  { id: 'src', position: { x: 80,  y: 70 }, size: { width: 150, height: 60 }, label: 'source',
    ports: [{ id: 'src.out', side: 'right' as const, type: 'output' }] },
  { id: 'dst', position: { x: 430, y: 70 }, size: { width: 150, height: 60 }, label: 'target',
    ports: [{ id: 'dst.in', side: 'left' as const, type: 'input' }] },
];
const edges: never[] = [];

const EVENTS: Array<[string, (p: any) => string]> = [
  ['connection:start',      (p) => p?.sourcePort?.id ?? '?'],
  ['connection:update',     (p) => `${p?.targetPort?.id ?? '(none)'} ${p?.isValid ? 'ok' : 'no'}`],
  ['connection:port-enter', (p) => `${p?.port?.id ?? '?'} ${p?.isValid ? 'ok' : '✗ ' + (p?.rejectionReason ?? '')}`],
  ['connection:port-leave', (p) => p?.port?.id ?? '?'],
  ['connection:complete',   (p) => `${p?.sourcePortId ?? '?'} → ${p?.targetPortId ?? '?'}`],
  ['connection:cancel',     (p) => `${p?.sourcePort?.id ?? '?'} (abandoned / refused)`],
];

const lit = ref<Record<string, boolean>>({});
const log = ref<Array<{ name: string; detail: string; kind: string }>>([]);
let disposers: Array<() => void> = [];

function onInit(api: DiagramInstance) {
  try {
    const engine = api.getEngine() as any;
    const summaryOf = new Map(EVENTS);
    const record = (name: string, payload: any) => {
      lit.value = { ...lit.value, [name]: true };
      setTimeout(() => { lit.value = { ...lit.value, [name]: false }; }, 1100);
      const kind = name === 'connection:complete' ? 'connect' : name === 'connection:cancel' ? 'cancel' : '';
      const detail = (summaryOf.get(name) || (() => ''))(payload);
      log.value = [{ name, detail, kind }, ...log.value].slice(0, 12);
    };
    disposers = EVENTS.map(([name]) => engine.eventBus.on(name, (payload: any) => record(name, payload)));
  } catch { /* lifecycle wiring optional; canvas still paints */ }
  markReady();
}

function clearLog() { log.value = []; }
import { onBeforeUnmount } from 'vue';
onBeforeUnmount(() => { for (const d of disposers) d?.(); });
</script>

<template>
  <div style="display:flex; flex-direction:column; height:100vh">
    <div style="padding:8px 24px 10px; border-bottom:1px solid rgba(127,127,127,.25); font:12px/1.4 ui-monospace,monospace">
      <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center">
        <span v-for="[name] in EVENTS" :key="name"
          :style="{ padding:'2px 9px', border:'1px solid rgba(127,127,127,.4)', borderRadius:'999px', opacity: lit[name] ? 1 : .32, fontWeight: lit[name] ? 600 : 400 }">
          {{ name.replace('connection:', '') }}
        </span>
        <button @click="clearLog" style="font:inherit; padding:2px 9px; border:1px solid rgba(127,127,127,.4); border-radius:6px; background:transparent; color:inherit; cursor:pointer">clear</button>
      </div>
      <div style="margin-top:8px; height:88px; overflow-y:auto; white-space:pre; opacity:.9">
        <span v-if="!log.length" style="opacity:.5">drag from the source's right port to see the connection lifecycle fire…</span>
        <div v-for="(row, i) in log" :key="i" style="padding:1px 0">
          <span style="display:inline-block; min-width:168px; font-weight:600"
            :style="{ color: row.kind === 'connect' ? '#16a34a' : row.kind === 'cancel' ? '#dc2626' : 'inherit' }">{{ row.name }}</span><span>{{ row.detail }}</span>
        </div>
      </div>
    </div>
    <div style="flex:1; position:relative">
      <GrafloriaFlow :default-nodes="nodes" :default-edges="edges" @init="onInit" />
    </div>
  </div>
</template>
