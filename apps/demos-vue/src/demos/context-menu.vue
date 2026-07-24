<script setup lang="ts">
import { ref } from 'vue';
import { GrafloriaFlow } from '@grafloria/vue';
import type { DiagramInstance } from '@grafloria/vue';
import { markReady } from '../ready';

// Right-click a node → a menu opens ANCHORED to that node, and every item
// actually mutates the RIGHT node. Driven by a real contextmenu event.
const nodes = [
  { id: 'a', position: { x: 120, y: 120 }, size: { width: 120, height: 48 }, label: 'Alpha' },
  { id: 'b', position: { x: 380, y: 120 }, size: { width: 120, height: 48 }, label: 'Beta' },
];
const edges = [{ id: 'e', source: 'a', target: 'b' }];

const wrap = ref<HTMLElement | null>(null);
const menuOpen = ref(false);
const menuX = ref(0);
const menuY = ref(0);
let apiRef: any = null;
let menuTarget: string | null = null;

function onInit(api: DiagramInstance) {
  try {
    apiRef = api;
    const host = wrap.value!;
    host.addEventListener('contextmenu', (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest('[data-node-id]');
      if (!el) return;
      e.preventDefault();
      menuTarget = el.getAttribute('data-node-id');
      const rect = host.getBoundingClientRect();
      menuX.value = e.clientX - rect.left;
      menuY.value = e.clientY - rect.top;
      menuOpen.value = true;
    });
    document.addEventListener('pointerdown', (e) => {
      const menu = host.querySelector('.ctx-menu');
      if (menu && !menu.contains(e.target as Node)) menuOpen.value = false;
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') menuOpen.value = false; });
  } catch { /* menu wiring optional; canvas still paints */ }
  markReady();
}

async function act(action: string) {
  try {
    const api = apiRef; const id = menuTarget;
    if (!api || !id) return;
    const model: any = api.getModel();
    const engine: any = api.getEngine();
    if (action === 'rename') model.getNode(id).setMetadata('label', 'RENAMED');
    if (action === 'delete') model.removeNode(id);
    if (action === 'duplicate') {
      const src = model.getNode(id);
      const copy = await engine.addNode({ type: 'rect', position: { x: src.position.x + 30, y: src.position.y + 60 }, size: { ...src.size } });
      copy.setMetadata('label', (src.getMetadata('label') ?? '') + ' copy');
    }
    menuOpen.value = false;
    api.renderNow();
  } catch { menuOpen.value = false; }
}
</script>

<template>
  <div ref="wrap" style="position:relative; height:100vh">
    <GrafloriaFlow :default-nodes="nodes" :default-edges="edges" @init="onInit" />
    <div v-show="menuOpen" class="ctx-menu"
      :style="{ position:'absolute', left: menuX + 'px', top: menuY + 'px', zIndex:10, minWidth:'160px', background:'var(--mbg,#1a1a1a)', color:'inherit', border:'1px solid rgba(127,127,127,.35)', borderRadius:'8px', boxShadow:'0 8px 30px rgba(0,0,0,.18)', padding:'4px', font:'13px system-ui,sans-serif' }">
      <button @click="act('rename')" class="ctx-btn">Rename</button>
      <button @click="act('duplicate')" class="ctx-btn">Duplicate</button>
      <button @click="act('delete')" class="ctx-btn">Delete</button>
    </div>
  </div>
</template>

<style scoped>
.ctx-btn { display:block; width:100%; text-align:left; padding:7px 10px; border:0; background:transparent; color:inherit; border-radius:5px; cursor:pointer; }
.ctx-btn:hover { background:rgba(127,127,127,.15); }
</style>
