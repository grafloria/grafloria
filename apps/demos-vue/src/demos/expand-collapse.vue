<script setup lang="ts">
import { ref } from 'vue';
import { GrafloriaFlow } from '@grafloria/vue';
import type { DiagramInstance } from '@grafloria/vue';
import { GroupModel, GroupCollapseService } from '@grafloria/element';
import { markReady } from '../ready';

// A container of three members, plus an external node wired across the boundary.
// Collapse hides the members, shrinks the group to a placeholder, and re-homes
// the boundary edges onto an aggregated proxy; expand restores it losslessly —
// driven through the real GroupCollapseService.
const nodes = [
  { id: 'ext', position: { x: 480, y: 60 }, size: { width: 100, height: 44 }, label: 'external' },
  { id: 'c1', position: { x: 60, y: 40 }, size: { width: 90, height: 40 }, label: 'c1' },
  { id: 'c2', position: { x: 60, y: 110 }, size: { width: 90, height: 40 }, label: 'c2' },
  { id: 'c3', position: { x: 60, y: 180 }, size: { width: 90, height: 40 }, label: 'c3' },
];
const edges = [
  { id: 'e1', source: 'c1', target: 'c2' },
  { id: 'e2', source: 'c1', target: 'ext' },
  { id: 'e3', source: 'c2', target: 'ext' },
  { id: 'e4', source: 'ext', target: 'c3' },
];

let instance: DiagramInstance | null = null;
let collapser: any = null;
let group: any = null;
const readout = ref('');

function refresh() {
  const model: any = instance!.getModel();
  instance!.renderNow();
  const visible = model.getNodes().filter((n: any) => n.state.visible !== false).length;
  readout.value = `visible=${visible}  nodes=${model.getNodes().length}  links=${model.getLinks().length}  collapsed=${group.isCollapsed}`;
}
function collapse() { collapser.collapse(group); refresh(); }
function expand() { collapser.expand(group); refresh(); }

async function onInit(inst: DiagramInstance) {
  instance = inst;
  try {
    const model: any = inst.getModel();
    group = new GroupModel({ id: 'box', name: 'Service' });
    model.addGroup(group);
    group.padding = 14;
    for (const id of ['c1', 'c2', 'c3']) group.addMember(id, model);
    collapser = new GroupCollapseService(model);
    await inst.getEngine().layout('dagre', { direction: 'TB', nodeSpacing: 30, rankSpacing: 50 });
    inst.renderNow();
    inst.fitView(60);
    refresh();
  } catch { /* canvas still paints */ }
  markReady();
}
</script>

<template>
  <div style="display:flex; flex-direction:column; height:100vh">
    <div style="display:flex; gap:8px; align-items:center; padding:10px 24px; border-bottom:1px solid rgba(127,127,127,.25); font:13px system-ui, sans-serif">
      <button @click="collapse" style="padding:5px 12px; border-radius:6px; border:1px solid rgba(127,127,127,.4); background:transparent; color:inherit; cursor:pointer">collapse</button>
      <button @click="expand" style="padding:5px 12px; border-radius:6px; border:1px solid rgba(127,127,127,.4); background:transparent; color:inherit; cursor:pointer">expand</button>
      <output style="font:12px ui-monospace, monospace">{{ readout }}</output>
    </div>
    <div style="flex:1">
      <GrafloriaFlow :default-nodes="nodes" :default-edges="edges" @init="onInit" />
    </div>
  </div>
</template>
