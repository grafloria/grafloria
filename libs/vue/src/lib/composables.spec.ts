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
import { createApp, defineComponent, h, type App } from 'vue';
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
});
