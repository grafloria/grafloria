import { createApp, defineComponent, h, ref } from 'vue';
import { GrafloriaDashboard } from '@grafloria/vue';

const VIEWS = [
  { id: 'sales', widgets: [
    { id: 'rev', kind: 'kpi', span: 3, data: { label: 'Revenue', value: '$6.8M', delta: 12.4 } },
    { id: 'ord', kind: 'kpi', span: 3, data: { label: 'Orders', value: '1,982', delta: -2.1 } },
    { id: 'trend', kind: 'line', span: 6, rows: 2, data: { series: [10, 14, 12, 19, 23, 21, 28], labels: ['M','T','W','T','F','S','S'] } },
    { id: 'mix', kind: 'donut', span: 3, data: { slices: [{ label: 'EU', value: 44 }, { label: 'US', value: 31 }, { label: 'APAC', value: 25 }] } },
    { id: 'deploys', kind: 'deploys', span: 3, data: { items: [{ name: 'api', state: 'live' }, { name: 'web', state: 'building' }] } },
  ]},
  { id: 'ops', widgets: [
    { id: 'cpu', kind: 'kpi', span: 4, data: { label: 'CPU', value: '42%' } },
    { id: 'errors', kind: 'bar', span: 8, rows: 2, data: { bars: [{ label: 'mon', value: 3 }, { label: 'tue', value: 7 }, { label: 'wed', value: 2 }] } },
  ]},
];

const App = defineComponent({
  setup() {
    const tab = ref('sales');
    return () =>
      h('div', [
        h('h2', 'Dashboard kit — the Vue way'),
        h('p', [
          h('button', { id: 'tab-sales', onClick: () => (tab.value = 'sales') }, 'sales'),
          h('button', { id: 'tab-ops', onClick: () => (tab.value = 'ops') }, 'ops'),
        ]),
        h(GrafloriaDashboard, {
          views: VIEWS, activeView: tab.value,
          'onUpdate:activeView': (v) => (tab.value = v),
          style: 'display:block;width:860px;height:430px;border:1px solid #ccc',
        }, {
          'widget-deploys': (p) => [h('div', {
            style: 'width:100%;height:100%;border-radius:8px;background:#1d3557;color:#f1faee;padding:10px;box-sizing:border-box;font:12px system-ui'
          }, [
            h('strong', 'Deploys (Vue slot)'),
            ...p.data.items.map((d) => h('div', `${d.name} — ${d.state}`)),
          ])],
        }),
      ]);
  },
});
createApp(App).mount('#app');
