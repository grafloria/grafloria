import { createApp, defineComponent, h, ref, shallowRef, onMounted, onUnmounted, type Component } from 'vue';
import { ROUTES } from './routes';

// The app's front door (/demos-vue/ with no route): every demo, by category.
// It used to say "No demo at #/" — where the Vue page's "Open the demos" led.
const title = (route: string) => {
  const name = route.split('/')[1] ?? route;
  return name.charAt(0).toUpperCase() + name.slice(1).replace(/-/g, ' ');
};
const DemoIndex = defineComponent({
  setup() {
    const groups = new Map<string, string[]>();
    for (const r of Object.keys(ROUTES)) {
      const cat = r.split('/')[0]!;
      groups.set(cat, [...(groups.get(cat) ?? []), r]);
    }
    return () => h('main', { style: 'padding:28px 32px;max-width:1040px' }, [
      h('h1', { style: 'font:700 22px/1.3 system-ui,sans-serif;margin:0 0 6px' }, 'Grafloria — Vue demos'),
      h('p', { style: 'margin:0 0 18px;color:#5A6478' }, [
        'Every gallery demo as a real Vue component. Pick one here, or open the ',
        h('a', { href: '../demos/' }, 'gallery'), ' and press Vue on any page.',
      ]),
      ...[...groups].map(([cat, routes]) => h('section', { style: 'margin-bottom:18px' }, [
        h('h2', { style: 'font:600 13px/1.4 system-ui,sans-serif;text-transform:uppercase;letter-spacing:.06em;color:#5A6478;margin:0 0 6px' }, cat),
        h('ul', { style: 'margin:0;padding:0;list-style:none;display:flex;flex-wrap:wrap;gap:6px 18px' },
          routes.map((r) => h('li', [h('a', { href: '#/' + r }, title(r))]))),
      ])),
    ]);
  },
});

// Tiny hash router — no router dependency: load the matching demo SFC, swap on
// hashchange. Each route IS a demo; the gallery shell provides all chrome.
const App = defineComponent({
  setup() {
    const comp = shallowRef<Component | null>(null);
    const missing = ref('');
    const home = ref(false);
    const load = async () => {
      const route = location.hash.replace(/^#\/?/, '');
      home.value = !route;
      const loader = ROUTES[route];
      if (!loader) { comp.value = null; missing.value = route; return; }
      comp.value = (await loader()).default;
    };
    onMounted(() => { addEventListener('hashchange', load); void load(); });
    onUnmounted(() => removeEventListener('hashchange', load));
    return () => home.value ? h(DemoIndex) : comp.value ? h(comp.value) : h('div', { style: 'padding:24px' }, `No demo at #/${missing.value}`);
  },
});

createApp(App).mount('#app');
