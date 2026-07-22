/**
 * TDD — the Vue <GrafloriaDashboard>, written BEFORE the implementation.
 * The kit's data-first board with `#widget-<kind>` slots — the same idiom as
 * `#node-<type>` on the flow, applied to dashboards.
 */
import { createApp, defineComponent, h, ref, type App } from 'vue';
import { GrafloriaDashboard } from './grafloria-dashboard';
import type { DashboardViewSpec } from '@grafloria/element';

const flush = () => new Promise((r) => setTimeout(r, 50));

const VIEWS: DashboardViewSpec[] = [
  {
    id: 'sales',
    widgets: [
      { id: 'rev', kind: 'kpi', span: 3, data: { label: 'Revenue', value: '$6.8M' } },
      { id: 'note', kind: 'custom', span: 4, data: { title: 'Hello widget' } },
    ],
  },
  { id: 'ops', widgets: [{ id: 'cpu', kind: 'kpi', span: 3, data: { label: 'CPU', value: '42%' } }] },
];

describe('<GrafloriaDashboard> (Vue)', () => {
  let host: HTMLElement;
  let app: App | null = null;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
  });
  afterEach(() => {
    app?.unmount();
    app = null;
    host.remove();
  });

  it('mounts the board, paints built-ins, renders #widget-<kind> slots, hands out the handle', async () => {
    let handle: any = null;
    const activeView = ref<string | undefined>(undefined);
    app = createApp(
      defineComponent({
        setup() {
          return () =>
            h(
              GrafloriaDashboard,
              {
                views: VIEWS,
                activeView: activeView.value,
                onReady: (h_: unknown) => (handle = h_),
              },
              {
                'widget-custom': (p: any) => [
                  h('div', { class: 'vue-widget', 'data-widget': p.widget.id }, String(p.data['title'])),
                ],
              }
            );
        },
      })
    );
    app.mount(host);
    await flush();

    // built-in painter
    expect(host.textContent).toContain('Revenue');
    expect(host.textContent).toContain('$6.8M');
    // slot widget
    const w = host.querySelector('.vue-widget[data-widget="note"]');
    expect(w).toBeTruthy();
    expect(w!.textContent).toBe('Hello widget');
    // handle
    expect(handle.views).toEqual(['sales', 'ops']);
    expect(handle.toJSON().views.map((v: { id?: string }) => v.id)).toEqual(['sales', 'ops']);

    // the tab pattern
    activeView.value = 'ops';
    await flush();
    expect(handle.activeView).toBe('ops');
  });
});
