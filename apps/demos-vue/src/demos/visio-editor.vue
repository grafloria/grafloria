<script setup lang="ts">
import { onBeforeUnmount, reactive, ref } from 'vue';
import { GrafloriaFlow } from '@grafloria/vue';
import type { DiagramInstance } from '@grafloria/vue';
import { markReady } from '../ready';
import {
  BAR, VISIO_NODES, VISIO_EDGES, VisioEditor, barDisabled, initialUi, type VisioUi,
} from './visio-editor-controller';

// Visio-style editor — the whole authoring surface: a page grid with snap, zoom
// controls and a minimap, drop a shape OR a real database table, group, align,
// drop into containers — every edit undoable.
//
//   T4/T5  stencil registry + 8 categorized stencils
//   T6/T7  the palette, and drag-from-palette to place a master
//   T3     align & distribute over the selection
//   T8     drop a shape in a container and it joins it
//   T9     the shape-data panel, driven by each master's dataSchema
//   T10    double-click to rename
//   T1/T2  snap guides on drag AND on resize (switched on HERE, not globally)
//
// The engine wiring lives in VisioEditor (visio-editor-controller.ts, shared by
// the four framework versions); this component renders the chrome — toolbar,
// zoom cluster, context menu — from the controller's state.
const ui = reactive<VisioUi>(initialUi());
const rail = ref<HTMLElement | null>(null);
const canvas = ref<HTMLElement | null>(null);
const panel = ref<HTMLElement | null>(null);
let ctl: VisioEditor | null = null;

function onInit(instance: DiagramInstance) {
  ctl = new VisioEditor(instance, { canvas: canvas.value!, rail: rail.value!, panel: panel.value! },
    (next) => Object.assign(ui, next));
  void ctl.init().then(() => markReady());
}

function onContextMenu(e: MouseEvent) {
  e.preventDefault();
  ctl?.openMenuAt(e.clientX, e.clientY);
}

onBeforeUnmount(() => { ctl?.dispose(); ctl = null; });
</script>

<template>
  <div id="vs-shell">
    <div id="vs-bar">
      <template v-for="(item, i) in BAR" :key="i">
        <span v-if="item.kind === 'sep'" class="sep" />
        <button v-else-if="item.kind === 'toggle'" class="toggle" :title="item.title"
          :aria-pressed="ui[item.toggle] ? 'true' : 'false'" @click="ctl?.toggle(item.toggle)">{{ item.label }}</button>
        <button v-else :title="item.title" :disabled="barDisabled(item, ui)"
          @click="ctl?.run(item.action)">{{ item.label }}</button>
      </template>
      <span class="hint">drag a shape from the rail →</span>
    </div>

    <div id="vs-body">
      <div id="vs-rail" ref="rail" />
      <div id="vs-canvas" ref="canvas" @contextmenu="onContextMenu">
        <GrafloriaFlow :default-nodes="VISIO_NODES" :default-edges="VISIO_EDGES" @init="onInit" />

        <!-- ZOOM CLUSTER — bottom-right, the Visio/Figma convention: − % + fit.
             The % readout doubles as reset-to-100%. -->
        <div id="vs-zoom">
          <button title="Zoom out (Ctrl/⌘ −)" @click="ctl?.zoomOut()">−</button>
          <button id="vs-zoom-pct" title="Zoom level — click to reset to 100% (Ctrl/⌘ 0)"
            @click="ctl?.zoomReset()">{{ ui.zoomPct }}</button>
          <button title="Zoom in (Ctrl/⌘ =)" @click="ctl?.zoomIn()">＋</button>
          <button title="Fit the diagram in view (Ctrl/⌘+Shift+F)" @click="ctl?.fit()">⤢</button>
        </div>

        <!-- CONTEXT MENU — whatever is under the pointer: node / edge / canvas. -->
        <div id="vs-menu" :class="{ open: !!ui.menu }"
          :style="ui.menu ? { left: ui.menu.x + 'px', top: ui.menu.y + 'px' } : undefined">
          <button v-for="(m, i) in ui.menu?.items ?? []" :key="m.label" :disabled="!m.enabled"
            @click="ctl?.runMenuItem(i)">{{ m.label }}</button>
        </div>
      </div>
      <div id="vs-panel" ref="panel" />
    </div>
  </div>
</template>

<style>
#vs-shell { display: flex; flex-direction: column; height: 100vh; min-height: 0; }
#vs-bar {
  display: flex; align-items: center; gap: 6px; padding: 6px 10px; flex: none;
  border-bottom: 1px solid var(--gf-line, #e5e7eb); background: var(--gf-panel, #fff);
  font: 12px ui-sans-serif, system-ui, sans-serif;
}
#vs-bar button {
  padding: 5px 10px; border-radius: 7px; border: 1px solid var(--gf-line, #e5e7eb);
  background: var(--gf-bg, #fff); color: var(--gf-ink, #1e2436); cursor: pointer; font: inherit;
}
#vs-bar button:hover:not(:disabled) { border-color: #3B52D9; color: #3B52D9; }
#vs-bar button:disabled { opacity: .45; cursor: default; }
#vs-bar button.toggle[aria-pressed="true"] {
  background: rgba(59,82,217,.12); border-color: #3B52D9; color: #3B52D9;
}
#vs-bar .sep { width: 1px; height: 18px; background: var(--gf-line, #e5e7eb); margin: 0 4px; }
#vs-bar .hint { margin-left: auto; color: var(--gf-mut, #6b7280); }
#vs-body { display: flex; flex: 1; min-height: 0; }
/* The rails must never crush the canvas: they shrink first, and the data panel
   drops out entirely when narrow. */
#vs-rail { flex: 0 1 200px; min-width: 128px; }
#vs-canvas { flex: 1 1 auto; min-width: 260px; position: relative; }
#vs-panel { flex: 0 1 200px; min-width: 150px; }
@media (max-width: 1500px) { #vs-panel { display: none; } }
@media (max-width: 1180px) { #vs-rail { flex-basis: 150px; } }
#vs-menu {
  position: absolute; z-index: 30; min-width: 170px; display: none;
  background: var(--gf-panel, #fff); border: 1px solid var(--gf-line, #e5e7eb);
  border-radius: 8px; box-shadow: 0 8px 30px rgba(0,0,0,.15); padding: 4px;
  font: 12px ui-sans-serif, system-ui, sans-serif;
}
#vs-menu.open { display: block; }
#vs-menu button {
  display: block; width: 100%; text-align: left; padding: 6px 10px; border: 0;
  background: transparent; color: var(--gf-ink, #1e2436); border-radius: 5px;
  cursor: pointer; font: inherit;
}
#vs-menu button:hover:not(:disabled) { background: rgba(59,82,217,.1); color: #3B52D9; }
#vs-menu button:disabled { opacity: .45; cursor: default; }
#vs-zoom {
  position: absolute; right: 10px; bottom: 34px; z-index: 25;
  display: flex; align-items: center; gap: 2px; padding: 3px;
  background: var(--gf-panel, #fff); border: 1px solid var(--gf-line, #e5e7eb);
  border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,.08);
  font: 12px ui-sans-serif, system-ui, sans-serif;
}
#vs-zoom button {
  padding: 4px 8px; border: 0; border-radius: 6px; background: transparent;
  color: var(--gf-ink, #1e2436); cursor: pointer; font: inherit;
}
#vs-zoom button:hover { background: rgba(59,82,217,.1); color: #3B52D9; }
#vs-zoom #vs-zoom-pct { min-width: 44px; text-align: center; font-variant-numeric: tabular-nums; }
</style>
