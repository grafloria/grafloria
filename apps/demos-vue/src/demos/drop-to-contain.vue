<script setup lang="ts">
import { GrafloriaFlow } from '@grafloria/vue';
import type { DiagramInstance } from '@grafloria/vue';
import { markReady } from '../ready';

// T8/visio — Visio containment: DROPPING a shape inside a container makes it a
// member, so it then travels with the container. GroupMembershipService always
// held the whole policy (innermost hit-test, per-group veto, coordinate
// translation, undoable Add/RemoveFromGroupCommand); nothing called it, so a
// drag into a frame used to change x/y and nothing else.
// Drag "invoice" into "Billing" and it joins; drag the frame and it follows;
// drop it into "Archive" and it moves over in one gesture; drop it on empty
// canvas and it unembeds. One Ctrl/⌘+Z takes back a whole drop — the
// move and the change of container together.
const nodes = [
  { id: 'inv',  position: { x: 760, y: 420 }, size: { width: 130, height: 56 }, label: 'invoice' },
  { id: 'paid', position: { x: 150, y: 150 }, size: { width: 130, height: 56 }, label: 'paid' },
  { id: 'old',  position: { x: 520, y: 150 }, size: { width: 130, height: 56 }, label: '2024 ledger' },
];
const edges: never[] = [];

async function onInit(api: DiagramInstance) {
  const engine: any = api.getEngine();
  // The gesture under test — opt-in, like every other interaction flag.
  engine.setInteractionConfig({ enableGroupMembershipOnDrop: true, enableGroupDrag: true });

  const billing = await engine.addGroup({ name: 'Billing' });
  billing.setFrame({ x: 110, y: 100, width: 320, height: 220 });
  await engine.addToGroup(billing.id, 'paid');

  const archive = await engine.addGroup({ name: 'Archive' });
  archive.setFrame({ x: 480, y: 100, width: 320, height: 220 });
  await engine.addToGroup(archive.id, 'old');

  api.renderNow();
  markReady();
}
</script>

<template>
  <div style="height:100vh">
    <GrafloriaFlow :default-nodes="nodes" :default-edges="edges" @init="onInit" />
  </div>
</template>
