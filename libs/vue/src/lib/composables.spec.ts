/**
 * TDD — the Vue composables, written BEFORE the implementation. Mirrors the
 * React hooks contract: everything is a subscription to the headless
 * instance; no diagram state lives in Vue.
 *
 * - GrafloriaProvider + useGrafloria(): a SIBLING of <GrafloriaFlow> (a
 *   toolbar, an inspector) reaches the live instance.
 * - useSelection(): reactive selection, updates on model.selectNode.
 * - useViewport(): reactive camera state.
 * - useOnSelectionChange(): callback wiring with automatic teardown.
 */
import { createApp, defineComponent, h, inject, resolveComponent, getCurrentInstance, provide, type App } from 'vue';
import { GrafloriaFlow } from './grafloria-flow';
import { GrafloriaProvider, useGrafloria, useSelection, useViewport, useOnSelectionChange } from './composables';
import type { NodeSpec } from '@grafloria/renderer';

const flush = () => new Promise((r) => setTimeout(r, 50));

const NODES: NodeSpec[] = [
  { id: 'a', position: { x: 0, y: 0 }, size: { width: 100, height: 50 }, label: 'A' },
  { id: 'b', position: { x: 200, y: 0 }, size: { width: 100, height: 50 }, label: 'B' },
];

describe('Vue composables', () => {
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

  it('a composable used outside any provider warns ONCE in development, naming the provider', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const Lost = defineComponent({
        setup() {
          useViewport();
          return () => h('div');
        },
      });
      app = createApp(defineComponent({ setup: () => () => h('div', [h(Lost), h(Lost)]) }));
      app.mount(host);
      await flush();
      const ours = warn.mock.calls.map((c) => String(c[0])).filter((m) => m.includes('useViewport()'));
      expect(ours).toHaveLength(1);
      expect(ours[0]).toContain('<GrafloriaProvider>');
      expect(ours[0]).toContain('@grafloria/vue');
    } finally {
      warn.mockRestore();
    }
  });

  it('no warning inside a GrafloriaProvider', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const Toolbar = defineComponent({
        setup() {
          useSelection();
          useOnSelectionChange(() => undefined);
          return () => h('div');
        },
      });
      app = createApp(defineComponent({
        setup: () => () => h(GrafloriaProvider, null, { default: () => [h(Toolbar), h(GrafloriaFlow, { defaultNodes: NODES })] }),
      }));
      app.mount(host);
      await flush();
      expect(warn.mock.calls.filter((c) => String(c[0]).includes('GrafloriaProvider'))).toEqual([]);
    } finally {
      warn.mockRestore();
    }
  });

  it('useGrafloria() reaches the instance from a SIBLING inside GrafloriaProvider', async () => {
    let sawInstance: unknown = null;
    const Toolbar = defineComponent({
      setup() {
        const grafloria = useGrafloria();
        return () => {
          sawInstance = grafloria.value;
          return h('div', { class: 'toolbar' }, grafloria.value ? 'ready' : 'waiting');
        };
      },
    });
    app = createApp(
      defineComponent({
        setup() {
          return () =>
            h(GrafloriaProvider, null, {
              default: () => [h(Toolbar), h(GrafloriaFlow, { defaultNodes: NODES })],
            });
        },
      })
    );
    app.mount(host);
    await flush();
    expect(host.querySelector('.toolbar')!.textContent).toBe('ready');
    expect(sawInstance).toBeTruthy();
    expect((sawInstance as any).getModel().getNodes()).toHaveLength(2);
  });

  it('useSelection() is reactive to model selection', async () => {
    let selectionText = '';
    const Inspector = defineComponent({
      setup() {
        const selection = useSelection();
        return () => {
          selectionText = selection.value.nodes.map((n) => n.id).join(',');
          return h('div', { class: 'inspector' }, selectionText || 'none');
        };
      },
    });
    let instance: any = null;
    app = createApp(
      defineComponent({
        setup() {
          return () =>
            h(GrafloriaProvider, null, {
              default: () => [
                h(Inspector),
                h(GrafloriaFlow, { defaultNodes: NODES, onInit: (i: unknown) => (instance = i) }),
              ],
            });
        },
      })
    );
    app.mount(host);
    await flush();
    expect(host.querySelector('.inspector')!.textContent).toBe('none');

    const model = instance.getModel();
    model.selectNode(model.getNode('b'));
    await flush();
    expect(host.querySelector('.inspector')!.textContent).toBe('b');
  });

  it('useViewport() reads the live camera', async () => {
    let seen: any = null;
    const Badge = defineComponent({
      setup() {
        const viewport = useViewport();
        return () => {
          seen = viewport.value;
          return h('span', { class: 'zoom' }, String(viewport.value.zoom));
        };
      },
    });
    app = createApp(
      defineComponent({
        setup() {
          return () =>
            h(GrafloriaProvider, null, {
              default: () => [h(Badge), h(GrafloriaFlow, { defaultNodes: NODES })],
            });
        },
      })
    );
    app.mount(host);
    await flush();
    expect(seen).toEqual({ zoom: 1, x: expect.any(Number), y: expect.any(Number) });
  });

  it('useOnSelectionChange() fires with the new selection', async () => {
    const seen: string[][] = [];
    const Listener = defineComponent({
      setup() {
        useOnSelectionChange((change) => seen.push(change.nodes.map((n) => n.id)));
        return () => h('i');
      },
    });
    let instance: any = null;
    app = createApp(
      defineComponent({
        setup() {
          return () =>
            h(GrafloriaProvider, null, {
              default: () => [
                h(Listener),
                h(GrafloriaFlow, { defaultNodes: NODES, onInit: (i: unknown) => (instance = i) }),
              ],
            });
        },
      })
    );
    app.mount(host);
    await flush();
    const model = instance.getModel();
    model.selectNode(model.getNode('a'));
    await flush();
    expect(seen.some((ids) => ids.includes('a'))).toBe(true);
  });

  describe('the instance reaches what GrafloriaFlow renders', () => {
    const Probe = (seen: { instance: unknown; warned?: boolean }) =>
      defineComponent({
        setup() {
          const grafloria = useGrafloria();
          return () => {
            seen.instance = grafloria.value;
            return h('div', { class: 'child-toolbar' }, grafloria.value ? 'ready' : 'waiting');
          };
        },
      });

    it('a child in the default slot gets the instance with no provider, and no warning', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      try {
        const seen: { instance: any } = { instance: null };
        let instance: unknown = null;
        app = createApp(defineComponent({
          setup: () => () =>
            h(GrafloriaFlow, { defaultNodes: NODES, class: 'my-flow', onInit: (i: unknown) => (instance = i) }, {
              default: () => [h(Probe(seen))],
            }),
        }));
        app.mount(host);
        await flush();
        expect(host.querySelector('.child-toolbar')?.textContent).toBe('ready');
        expect(seen.instance).toBe(instance);
        // The canvas element keeps the attributes given to <GrafloriaFlow>.
        expect(host.querySelector('.grafloria-flow')?.classList.contains('my-flow')).toBe(true);
        expect(warn.mock.calls.filter((c) => String(c[0]).includes('GrafloriaProvider'))).toEqual([]);
      } finally {
        warn.mockRestore();
      }
    });

    it('inside a GrafloriaProvider the flow feeds the outer store: a sibling and a child both see it', async () => {
      const sibling: { instance: any } = { instance: null };
      const child: { instance: any } = { instance: null };
      let instance: unknown = null;
      app = createApp(defineComponent({
        setup: () => () =>
          h(GrafloriaProvider, null, {
            default: () => [
              h(Probe(sibling)),
              h(GrafloriaFlow, { defaultNodes: NODES, onInit: (i: unknown) => (instance = i) }, { default: () => [h(Probe(child))] }),
            ],
          }),
      }));
      app.mount(host);
      await flush();
      expect(instance).toBeTruthy();
      expect(sibling.instance).toBe(instance);
      expect(child.instance).toBe(instance);
    });

    it('a custom-node slot keeps the app context: the instance, app and parent provides, global components', async () => {
      const seen: Record<string, unknown> = {};
      const GlobalBadge = defineComponent({ setup: () => () => h('b', { class: 'global-badge' }, 'global') });
      const Card = defineComponent({
        props: { title: String },
        setup(props) {
          const grafloria = useGrafloria();
          seen['appValue'] = inject('app-value', 'missing');
          seen['parentValue'] = inject('parent-value', 'missing');
          seen['greet'] = (getCurrentInstance()?.appContext.config.globalProperties as any).$greet?.('card');
          return () => {
            seen['instance'] = grafloria.value;
            return h('div', { class: 'card' }, [props.title, h(resolveComponent('GlobalBadge') as any)]);
          };
        },
      });
      let instance: unknown = null;
      const Page = defineComponent({
        setup() {
          provide('parent-value', 'from the page');
          return () =>
            h(GrafloriaFlow, {
              defaultNodes: [{ id: 'j', type: 'job', position: { x: 0, y: 0 }, size: { width: 150, height: 60 }, data: { title: 'Extract' } }],
              onInit: (i: unknown) => (instance = i),
            }, {
              'node-job': (p: any) => [h(Card, { title: String(p.data['title']) })],
            });
        },
      });
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      try {
        app = createApp(Page);
        app.provide('app-value', 'from the app');
        app.component('GlobalBadge', GlobalBadge);
        app.config.globalProperties['$greet'] = (who: string) => `hello ${who}`;
        app.mount(host);
        await flush();
        expect(host.querySelector('.card')?.textContent).toContain('Extract');
        expect(host.querySelector('.card .global-badge')).toBeTruthy();
        expect(seen['appValue']).toBe('from the app');
        expect(seen['parentValue']).toBe('from the page');
        expect(seen['greet']).toBe('hello card');
        expect(seen['instance']).toBe(instance);
        expect(warn.mock.calls.map((c) => String(c[0])).filter((m) => /Failed to resolve|GrafloriaProvider|injection/.test(m))).toEqual([]);
      } finally {
        warn.mockRestore();
      }
    });
  });
});
