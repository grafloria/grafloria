/** <GrafloriaDiagram> (Vue) — the generic kit host, proven with ER + UML kits. */
import { createApp, defineComponent, h, ref } from 'vue';
import { GrafloriaDiagram } from './grafloria-diagram';
import { erDiagram, umlDiagram } from '@grafloria/element';

const flush = () => new Promise((r) => setTimeout(r, 50));

/**
 * jsdom lays nothing out — give every element a real box so the camera is not 0x0.
 */
beforeAll(() => {
  Element.prototype.getBoundingClientRect = function () {
    return { left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  };
});

describe('<GrafloriaDiagram> (Vue)', () => {
  it('renders ER and UML kits from pure data', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const instances: any[] = [];
    const app = createApp(
      defineComponent({
        setup() {
          return () =>
            h('div', [
              h(GrafloriaDiagram, { onReady: (i: any) => instances.push(i), spec: erDiagram({
                entities: [{ id: 'PRODUCTS', name: 'Products', position: { x: 40, y: 40 }, columns: [
                  { name: 'id', type: 'int', pk: true }] }],
                relationships: [],
              }) }),
              h(GrafloriaDiagram, { onReady: (i: any) => instances.push(i), spec: umlDiagram({
                classes: [{ id: 'Animal', position: { x: 100, y: 40 }, attributes: ['# name: String'], methods: ['+ speak(): void'] }],
                relationships: [],
              }) }),
            ]);
        },
      })
    );
    app.mount(host);
    await flush();
    for (const i of instances) i.renderNow(); // paint is rAF-scheduled
    expect(host.textContent).toContain('Products');
    expect(host.textContent).toContain('Animal');
    expect(host.textContent).toContain('+ speak(): void');
    app.unmount();
    host.remove();
  });

  const table = (name: string) => erDiagram({
    entities: [{ id: 'T', name, position: { x: 40, y: 40 }, columns: [{ name: 'id', type: 'int', pk: true }] }],
    relationships: [],
  });
  const mountWith = (name: ReturnType<typeof ref<string>>, tick: ReturnType<typeof ref<number>>, ready: jest.Mock) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp(defineComponent({
      // `tick` re-renders the parent, building an equal spec again
      setup: () => () => (void tick.value, h(GrafloriaDiagram, { onReady: ready, spec: table(name.value!) })),
    }));
    app.mount(host);
    return { host, done: () => { app.unmount(); host.remove(); } };
  };

  it('follows a CHANGED spec: the new diagram replaces the old one', async () => {
    const name = ref('Products'), tick = ref(0), ready = jest.fn();
    const { host, done } = mountWith(name, tick, ready);
    await flush();
    expect(ready).toHaveBeenCalledTimes(1);
    name.value = 'Orders';
    await flush();
    expect(ready).toHaveBeenCalledTimes(2);
    ready.mock.calls[1][0].renderNow();
    expect(host.textContent).toContain('Orders');
    expect(host.textContent).not.toContain('Products');
    done();
  });

  it('an equal spec built again on a re-render does NOT remount', async () => {
    const name = ref('Products'), tick = ref(0), ready = jest.fn();
    const { done } = mountWith(name, tick, ready);
    await flush();
    tick.value++;
    await flush();
    tick.value++;
    await flush();
    expect(ready).toHaveBeenCalledTimes(1);
    done();
  });

  it('colorMode: applies at mount and follows the prop live, without remounting', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const ready: any[] = [];
    const mode = ref<'light' | 'dark'>('dark');
    const spec = erDiagram({ entities: [{ id: 'T', name: 'T', position: { x: 40, y: 40 }, columns: [{ name: 'id', type: 'int', pk: true }] }], relationships: [] });
    const app = createApp(defineComponent({
      setup: () => () => h(GrafloriaDiagram, { spec, colorMode: mode.value, onReady: (i: any) => ready.push(i) }),
    }));
    app.mount(host);
    await flush();
    expect(ready[0].getColorMode()).toBe('dark');
    mode.value = 'light';
    await flush();
    expect(ready[0].getColorMode()).toBe('light');
    expect(ready).toHaveLength(1);
    app.unmount();
    host.remove();
  });
});
