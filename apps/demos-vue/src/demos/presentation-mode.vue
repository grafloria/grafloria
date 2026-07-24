<script setup lang="ts">
import { onMounted } from 'vue';
import { GrafloriaFlow } from '@grafloria/vue';
import type { DiagramInstance } from '@grafloria/vue';
import { InMemoryViewportChannel, presentTo, followPresenter, lockDocument } from '@grafloria/element';
import { markReady } from '../ready';

// Presentation mode: the presenter drives the camera and every follower's
// viewport follows — the same world region at the same zoom, each keeping its
// own canvas size. The follower is read-only from the moment it mounts (the
// document lock drives the engine's real mode), yet its camera gestures stay
// live, because following is camera work, not a document edit.
const spec = () => ([
  { id: 'a', label: 'A', position: { x: 60,  y: 80 },  size: { width: 130, height: 60 } },
  { id: 'b', label: 'B', position: { x: 320, y: 80 },  size: { width: 130, height: 60 } },
  { id: 'c', label: 'C', position: { x: 190, y: 240 }, size: { width: 130, height: 60 } },
]);
const nodesA = spec();
const edgesA = [{ id: 'e1', source: 'a', target: 'b' }, { id: 'e2', source: 'a', target: 'c' }];
const nodesB = spec();
const edgesB = [{ id: 'e1', source: 'a', target: 'b' }, { id: 'e2', source: 'a', target: 'c' }];

const channel = new InMemoryViewportChannel();
let instA: DiagramInstance | null = null;
let instB: DiagramInstance | null = null;

function wire() {
  if (!instA || !instB) return;
  const hostA = { viewport: (instA as any).viewport, render: () => instA!.renderNow() };
  const hostB = { viewport: (instB as any).viewport, render: () => instB!.renderNow() };
  presentTo(hostA as never, channel, { presenterId: 'ana', throttleMs: 0 });
  followPresenter(hostB as never, channel, { ignorePresenterId: 'bo' });

  // The follower mounts with the document lock ON — a real read-only mode.
  lockDocument(instB.getEngine(), true);

  // Frame the content in the presenter; the broadcast frames the follower.
  instA.fitView(60);
  markReady();
}

const onInitA = (inst: DiagramInstance) => { instA = inst; wire(); };
const onInitB = (inst: DiagramInstance) => { instB = inst; wire(); };

onMounted(() => { /* markReady fires from wire() once both instances mount */ });
</script>

<template>
  <div style="font-size:12px;opacity:.8;padding:10px 24px;border-bottom:1px solid rgba(127,127,127,.25)">
    The presenter drives the camera; the follower's viewport follows — read-only from the moment it mounts.
  </div>
  <div style="display:flex; height:calc(100vh - 45px)">
    <div style="flex:1; min-width:0; position:relative; border-right:2px solid rgba(127,127,127,.35)">
      <span style="position:absolute;top:8px;left:8px;z-index:2;font:11px ui-monospace,Menlo,monospace;background:rgba(220,38,38,.9);color:#fff;padding:2px 8px;border-radius:4px">presenter</span>
      <GrafloriaFlow :default-nodes="nodesA" :default-edges="edgesA" :plugins="true" @init="onInitA" />
    </div>
    <div style="flex:1; min-width:0; position:relative">
      <span style="position:absolute;top:8px;left:8px;z-index:2;font:11px ui-monospace,Menlo,monospace;background:rgba(37,99,235,.85);color:#fff;padding:2px 8px;border-radius:4px">follower (read-only)</span>
      <GrafloriaFlow :default-nodes="nodesB" :default-edges="edgesB" @init="onInitB" />
    </div>
  </div>
</template>
