/**
 * TDD — the Vue <GrafloriaDashboard>, written BEFORE the implementation.
 * The kit's data-first board with `#widget-<kind>` slots — the same idiom as
 * `#node-<type>` on the flow, applied to dashboards.
 */
import { createApp, defineComponent, h, onMounted, onUnmounted, ref, type App } from 'vue';
import { GrafloriaDashboard } from './grafloria-dashboard';
import type { DashboardViewSpec } from '@grafloria/element';
import { listTools } from '@grafloria/renderer';

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

describe('<GrafloriaDashboard> (Vue) live switches', () => {
  let host: HTMLElement;
  let app: App | null = null;
  beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); });
  afterEach(() => { app?.unmount(); app = null; host.remove(); });
  const W: DashboardViewSpec[] = [
    { id: 'main', widgets: [{ id: 'a', kind: 'kpi', span: 6 }, { id: 'b', kind: 'kpi', span: 6 }, { id: 'c', kind: 'line', span: 12, rows: 2 }] },
  ];
  it('layout / sizing / static boot from the props and switch live through the same handle', async () => {
    let handle: any = null;
    let ready = 0;
    const layout = ref<'grid' | 'split'>('split');
    const sizing = ref<'fit' | 'grow'>('fit');
    app = createApp(defineComponent({
      setup() {
        return () => h(GrafloriaDashboard, { views: W, options: { width: 1200, height: 600 }, layout: layout.value, sizing: sizing.value, static: true, onReady: (h_: unknown) => { handle = h_; ready++; } });
      },
    }));
    app.mount(host);
    await flush();
    expect(handle.getLayout()).toBe('split');
    expect(handle.getStatic()).toBe(true);
    const first = handle;
    layout.value = 'grid';
    sizing.value = 'grow';
    await flush();
    expect(first.getLayout()).toBe('grid');
    expect(first.getSizing()).toBe('grow');
    expect(ready).toBe(1);
    expect(handle).toBe(first);
  });
});

describe('<GrafloriaDashboard> (Vue) teardown', () => {
  it('unmount unregisters the board\'s tools, so a re-mount in the page owns one set', async () => {
    const dashTools = () => listTools().filter((id) => id.startsWith('dashboard-'));
    const before = dashTools().length;
    const perBoard: number[] = [];
    for (let round = 0; round < 2; round++) {
      const host = document.createElement('div');
      document.body.appendChild(host);
      const app = createApp(defineComponent({ setup: () => () => h(GrafloriaDashboard, { views: VIEWS }) }));
      app.mount(host);
      await flush();
      perBoard.push(dashTools().length - before); // one tool per view board
      app.unmount();
      host.remove();
      expect(dashTools().length).toBe(before);
    }
    expect(perBoard).toEqual([VIEWS.length, VIEWS.length]);
  });
});

// A removed widget's host leaves the board, and what its slot rendered must go
// with it: unmounted, its hooks run, not left alive in a detached element until
// the whole board goes. No other card remounts, and a caller's own
// `options.unmountWidget` still hears the host.
describe('<GrafloriaDashboard> (Vue) removing a card', () => {
  let host: HTMLElement;
  let app: App | null = null;
  beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); });
  afterEach(() => { app?.unmount(); app = null; host.remove(); });

  it("unmounts the removed card's component; the other cards stay mounted", async () => {
    const life: string[] = [];
    const heard: Array<[string, HTMLElement]> = [];
    const Tracked = defineComponent({
      props: { id: { type: String, required: true } },
      setup(p) {
        const clicks = ref(0);
        onMounted(() => life.push(`mount ${p.id}`));
        onUnmounted(() => life.push(`unmount ${p.id}`));
        return () => h('div', { class: 'card', 'data-card': p.id, onClick: () => clicks.value++ }, `${p.id} (${clicks.value})`);
      },
    });
    let handle: any = null;
    app = createApp(defineComponent({
      setup: () => () =>
        h(
          GrafloriaDashboard,
          {
            widgets: [{ id: 'a', kind: 'card', span: 6 }, { id: 'b', kind: 'card', span: 6 }],
            options: { unmountWidget: (id: string, el: HTMLElement) => heard.push([id, el]) },
            onReady: (h_: unknown) => (handle = h_),
          },
          { 'widget-card': (p: any) => [h(Tracked, { id: p.widget.id })] }
        ),
    }));
    app.mount(host);
    await flush();
    const card = (id: string) => host.querySelector(`[data-card="${id}"]`) as HTMLElement | null;
    card('b')!.click();
    await flush();
    expect(card('b')!.textContent).toBe('b (1)');
    expect([...new Set(life)].sort()).toEqual(['mount a', 'mount b']);
    const a = host.querySelector('.grafloria-node-host[data-node-id="a"]') as HTMLElement;
    const cardA = card('a')!;
    expect(a.contains(cardA)).toBe(true);

    const mountsBefore = life.filter((e) => e.startsWith('mount')).length;
    handle.widget('a').remove();
    await flush();
    expect(life).toContain('unmount a');
    expect(life).not.toContain('unmount b');
    expect(life.filter((e) => e.startsWith('mount')).length).toBe(mountsBefore); // nothing remounted
    expect(a.isConnected).toBe(false);
    expect(a.contains(cardA)).toBe(false); // Vue took its card out of the host
    expect(card('b')!.textContent).toBe('b (1)'); // b's state survives
    expect(heard).toEqual([['a', a]]);
  });
});
