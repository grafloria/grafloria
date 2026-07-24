<script setup lang="ts">
import { ref, onBeforeUnmount } from 'vue';
import { GrafloriaFlow } from '@grafloria/vue';
import type { DiagramInstance } from '@grafloria/vue';
import { markReady } from '../ready';

// Copy a selected node, paste it — independent copies, each with its own id and
// a cascading position, and mutating one touches neither the other nor the
// original. ⌘C / ⌘V drive the engine's serialized clipboard.
const nodes = [{ id: 'orig', position: { x: 120, y: 120 }, size: { width: 130, height: 50 }, label: 'Original' }];
const edges: never[] = [];
const readout = ref('one node; select + copy + paste (⌘C / ⌘V)');
let keyHandler: ((e: KeyboardEvent) => void) | null = null;
let pasteCount = 0;

function onInit(api: DiagramInstance) {
  try {
    const engine: any = api.getEngine();
    const model: any = api.getModel();
    keyHandler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      if (e.key === 'c') {
        if (model.getSelectedNodes?.().length) { void engine.copy(); }
      } else if (e.key === 'v') {
        pasteCount += 1;
        void engine.paste({ offset: { x: 20 * pasteCount, y: 20 * pasteCount } }).then(() => {
          api.renderNow();
          readout.value = `${model.getNodes().length} nodes — each paste cascades to a new spot`;
        });
      }
    };
    window.addEventListener('keydown', keyHandler);
    // Select the original so ⌘C copies it immediately.
    engine.selectNodes(['orig']);
    api.renderNow();
  } catch { /* clipboard wiring optional; canvas still paints */ }
  markReady();
}

onBeforeUnmount(() => { if (keyHandler) window.removeEventListener('keydown', keyHandler); });
</script>

<template>
  <div style="display:flex; flex-direction:column; height:100vh">
    <div style="padding:8px 24px; font:12px/1.5 ui-monospace,monospace; opacity:.8; border-bottom:1px solid rgba(127,127,127,.25); white-space:pre">{{ readout }}</div>
    <div style="flex:1; position:relative">
      <GrafloriaFlow :default-nodes="nodes" :default-edges="edges" @init="onInit" />
    </div>
  </div>
</template>
