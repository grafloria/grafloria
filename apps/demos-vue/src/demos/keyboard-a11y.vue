<script setup lang="ts">
import { ref } from 'vue';
import { GrafloriaFlow } from '@grafloria/vue';
import type { DiagramInstance } from '@grafloria/vue';
import { Replica } from '@grafloria/element';
import { markReady } from '../ready';

// Keyboard + screen-reader a11y, all on the public model: Tab / Shift+Tab move a
// focus ring (aria-activedescendant), arrows nudge (undoable to the exact pixel
// via the op log), C+Tab+Enter connects, and a visually-hidden live-region
// outline mirrors every node and edge for a screen reader.
const SPEC = {
  nodes: ['ingest', 'clean', 'model', 'serve'].map((id, i) => ({
    id, position: { x: 80 + i * 200, y: 160 }, size: { width: 140, height: 56 }, label: id,
  })),
  edges: [
    { id: 'e1', source: 'ingest', target: 'clean' },
    { id: 'e2', source: 'clean', target: 'model' },
  ],
};
const STEP = 16;
const readout = ref('ready — keyboard only');
const outlineHtml = ref('');
const activeDescendant = ref('');
const kbd = ref<HTMLElement | null>(null);

function onInit(api: DiagramInstance) {
  try {
    const diagram: any = api.getModel();
    const replica = new Replica(diagram, { actor: 'kbd', onLocalOp: () => {} });
    let focusIndex = 0;
    let connectFrom: string | null = null;
    const order = () => diagram.getNodes().map((n: any) => n.id).sort();
    const focusedId = () => order()[focusIndex];

    const paintFocus = () => {
      const id = focusedId();
      activeDescendant.value = `node-${id}`;
      for (const n of diagram.getNodes()) n.setSelected(n.id === id);
      api.renderNow();
    };
    const syncOutline = () => {
      outlineHtml.value = diagram.getNodes().map((n: any) => {
        const outs = diagram.getLinks().filter((l: any) => l.sourceNodeId === n.id).map((l: any) => l.targetNodeId);
        const label = n.getMetadata('label') ?? n.id;
        return `<li id="node-${n.id}" role="listitem">${label} at ${Math.round(n.position.x)},${Math.round(n.position.y)}${outs.length ? ' → connects to ' + outs.join(', ') : ''}</li>`;
      }).join('');
    };
    const report = (m: string) => {
      readout.value = `focused: ${focusedId()}${connectFrom ? `  connecting from ${connectFrom}` : ''}\n${m}`;
    };

    const handleKey = (key: string, shift = false, meta = false) => {
      const ids = order();
      if (key === 'Tab') { focusIndex = (focusIndex + (shift ? -1 : 1) + ids.length) % ids.length; paintFocus(); report('Tab moved focus'); return; }
      if (key === 'z' && meta) { replica.undo(); api.renderNow(); syncOutline(); report('⌘Z undo'); return; }
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(key)) {
        const n = diagram.getNode(focusedId());
        const dx = key === 'ArrowLeft' ? -STEP : key === 'ArrowRight' ? STEP : 0;
        const dy = key === 'ArrowUp' ? -STEP : key === 'ArrowDown' ? STEP : 0;
        n.setPosition(n.position.x + dx, n.position.y + dy);
        api.renderNow(); syncOutline(); report(`nudged ${key.replace('Arrow', '').toLowerCase()}`);
        return;
      }
      if (key === 'c') { connectFrom = focusedId(); report('connect mode: Tab to a target, Enter to link'); return; }
      if (key === 'Enter' && connectFrom) {
        const target = focusedId();
        if (target !== connectFrom) {
          const s = diagram.getNode(connectFrom).getPortBySide('right');
          const t = diagram.getNode(target).getPortBySide('left');
          const csm = api.getEngine().getConnectionStateManager();
          csm.startConnection(s, { x: 0, y: 0 });
          csm.completeConnection(t);
        }
        connectFrom = null;
        api.renderNow(); syncOutline(); report('linked by keyboard');
        return;
      }
    };

    kbd.value!.addEventListener('keydown', (e: KeyboardEvent) => {
      const handled = ['Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', 'c', 'z'];
      if (handled.includes(e.key)) { e.preventDefault(); handleKey(e.key, e.shiftKey, e.metaKey || e.ctrlKey); }
    });
    api.on('connect', () => syncOutline());
    api.on('edges:change', () => syncOutline());
    api.on('nodes:change', () => syncOutline());

    paintFocus();
    syncOutline();
    report('ready — keyboard only');
  } catch { /* keyboard wiring optional; canvas still paints */ }
  markReady();
}
</script>

<template>
  <div style="display:flex; flex-direction:column; height:100vh">
    <div style="padding:8px 24px; font:12px/1.5 ui-monospace,monospace; opacity:.85; border-bottom:1px solid rgba(127,127,127,.25); white-space:pre">{{ readout }}</div>
    <div style="position:relative; flex:1">
      <GrafloriaFlow :default-nodes="SPEC.nodes" :default-edges="SPEC.edges" @init="onInit" />
      <div ref="kbd" tabindex="0" role="application"
        aria-label="Diagram editor. Tab to move between nodes, arrow keys to nudge, C then a node to connect."
        :aria-activedescendant="activeDescendant"
        style="position:absolute; inset:0; outline:none"></div>
      <ul role="list" aria-live="polite" aria-label="Diagram outline"
        style="position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap"
        v-html="outlineHtml"></ul>
      <div style="position:absolute; left:12px; bottom:10px; font:12px system-ui; opacity:.6">Tab / ⇧Tab · arrows nudge · ⌘Z undo · C+Tab+Enter connect</div>
    </div>
  </div>
</template>
