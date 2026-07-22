import { createApp, defineComponent, h, ref } from 'vue';
import { GrafloriaFlow } from '@grafloria/vue';

const App = defineComponent({
  setup() {
    const nodes = ref([
      { id: 'j1', type: 'job', position: { x: 0, y: 0 }, size: { width: 180, height: 80 }, data: { title: 'Extract' } },
      { id: 'j2', type: 'job', position: { x: 0, y: 0 }, size: { width: 180, height: 80 }, data: { title: 'Transform' } },
      { id: 'p1', position: { x: 0, y: 0 }, size: { width: 120, height: 50 }, label: 'Load' },
    ]);
    const edges = ref([{ source: 'j1', target: 'j2' }, { source: 'j2', target: 'p1' }]);
    const status = ref('idle');
    return () =>
      h('div', [
        h('p', { id: 'status' }, status.value),
        h(
          GrafloriaFlow,
          {
            nodes: nodes.value, edges: edges.value,
            'onUpdate:nodes': (v) => (nodes.value = v),
            'onUpdate:edges': (v) => (edges.value = v),
            layout: 'grid',
            onLayoutDone: () => (status.value = 'layout done'),
            style: 'display:block;width:800px;height:400px;border:1px solid #ccc',
          },
          { 'node-job': (p) => [h('div', { class: 'vue-job', style: 'background:#243041;color:#fff;width:100%;height:100%;padding:8px;box-sizing:border-box;border-radius:8px' }, String(p.data.title))] }
        ),
      ]);
  },
});
createApp(App).mount('#app');
