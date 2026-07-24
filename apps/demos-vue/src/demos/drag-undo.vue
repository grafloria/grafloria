<script setup lang="ts">
import { GrafloriaFlow } from '@grafloria/vue';
import type { DiagramInstance } from '@grafloria/vue';
import { markReady } from '../ready';

// A pointer node-drag commits ONE undoable step: drag a node, press ⌘Z / Ctrl+Z
// and it returns to where the drag began; redo re-applies it. The drag now goes
// through the command history, so keyboard undo/redo reach it.
const nodes = [
  { id: 'n1', position: { x: 260, y: 200 }, size: { width: 120, height: 60 }, label: 'drag me' },
  { id: 'n2', position: { x: 520, y: 200 }, size: { width: 120, height: 60 }, label: 'and me' },
];
const edges: never[] = [];

function onInit(_api: DiagramInstance) {
  // The engine's shipped drag path already commits the undoable step and the
  // built-in keyboard bindings drive ⌘Z / ⌘⇧Z — nothing to wire host-side.
  markReady();
}
</script>

<template>
  <div style="height:100vh">
    <GrafloriaFlow :default-nodes="nodes" :default-edges="edges" @init="onInit" />
  </div>
</template>
