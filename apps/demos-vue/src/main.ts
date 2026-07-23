import { createApp, defineComponent, h, ref, shallowRef, onMounted, onUnmounted, type Component } from 'vue';
import { ROUTES } from './routes';

// Tiny hash router — no router dependency: load the matching demo SFC, swap on
// hashchange. Each route IS a demo; the gallery shell provides all chrome.
const App = defineComponent({
  setup() {
    const comp = shallowRef<Component | null>(null);
    const missing = ref('');
    const load = async () => {
      const route = location.hash.replace(/^#\/?/, '');
      const loader = ROUTES[route];
      if (!loader) { comp.value = null; missing.value = route; return; }
      comp.value = (await loader()).default;
    };
    onMounted(() => { addEventListener('hashchange', load); void load(); });
    onUnmounted(() => removeEventListener('hashchange', load));
    return () => comp.value ? h(comp.value) : h('div', { style: 'padding:24px' }, `No demo at #/${missing.value}`);
  },
});

createApp(App).mount('#app');
