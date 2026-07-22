/**
 * <GrafloriaFlow> — the Vue 3 wrapper, proven with the plain Vue runtime in
 * jsdom (no test-utils): mount, v-model round-trip, slot-based custom nodes
 * with the auto-`custom` opt-in, declarative layout, and exposed API.
 */
import { createApp, defineComponent, h, nextTick, ref, type App } from 'vue';
import { GrafloriaFlow } from './grafloria-flow';
import type { NodeSpec, EdgeSpec } from '@grafloria/renderer';

const flush = () => new Promise((r) => setTimeout(r, 50));

describe('GrafloriaFlow (Vue)', () => {
  let host: HTMLElement;
  let app: App | null = null;

  beforeEach(() => {
    host = document.createElement('div');
    host.style.width = '800px';
    host.style.height = '600px';
    document.body.appendChild(host);
  });

  afterEach(() => {
    app?.unmount();
    app = null;
    host.remove();
  });

  it('mounts, creates an instance, and renders the diagram SVG', async () => {
    let instance: any = null;
    app = createApp(
      defineComponent({
        setup() {
          return () =>
            h(GrafloriaFlow, {
              defaultNodes: [
                { id: 'a', position: { x: 0, y: 0 }, size: { width: 100, height: 50 }, label: 'A' },
              ] as NodeSpec[],
              onInit: (i: unknown) => (instance = i),
            });
        },
      })
    );
    app.mount(host);
    await flush();
    expect(instance).toBeTruthy();
    expect(host.querySelector('svg')).toBeTruthy();
    expect(instance.getModel().getNodes()).toHaveLength(1);
  });

  it('#node-<type> slots render custom nodes — declaring the slot is the opt-in', async () => {
    app = createApp(
      defineComponent({
        setup() {
          return () =>
            h(
              GrafloriaFlow,
              {
                defaultNodes: [
                  { id: 'j1', type: 'job', position: { x: 10, y: 10 }, size: { width: 150, height: 60 }, data: { title: 'Extract' } },
                  { id: 'p1', position: { x: 300, y: 10 }, size: { width: 100, height: 50 }, label: 'Plain' },
                ] as NodeSpec[],
              },
              {
                'node-job': (p: any) => [h('div', { class: 'vue-job' }, String(p.data['title']))],
              }
            );
        },
      })
    );
    app.mount(host);
    await flush();
    const card = host.querySelector('.vue-job');
    expect(card).toBeTruthy();
    expect(card!.textContent).toBe('Extract');
  });

  it('v-model:nodes round-trips: prop changes reach the model, model edits emit specs', async () => {
    const nodes = ref<NodeSpec[]>([
      { id: 'a', position: { x: 0, y: 0 }, size: { width: 100, height: 50 }, label: 'A' },
    ]);
    let instance: any = null;
    const emitted: NodeSpec[][] = [];
    app = createApp(
      defineComponent({
        setup() {
          return () =>
            h(GrafloriaFlow, {
              nodes: nodes.value,
              'onUpdate:nodes': (v: NodeSpec[]) => {
                emitted.push(v);
                nodes.value = v;
              },
              onInit: (i: unknown) => (instance = i),
            });
        },
      })
    );
    app.mount(host);
    await flush();

    // prop → model
    nodes.value = [...nodes.value, { id: 'b', position: { x: 200, y: 0 }, size: { width: 100, height: 50 }, label: 'B' }];
    await nextTick();
    await flush();
    expect(instance.getModel().getNodes()).toHaveLength(2);

    // model → emit (the instance contract: nodes:change fires on add/remove)
    const before = emitted.length;
    instance.getModel().removeNode('b');
    await flush();
    expect(emitted.length).toBeGreaterThan(before);
    const last = emitted[emitted.length - 1];
    expect(last.map((n) => n.id)).toEqual(['a']);
  });

  it('declarative layout separates stacked nodes and emits layoutDone', async () => {
    let instance: any = null;
    let layoutDone = 0;
    app = createApp(
      defineComponent({
        setup() {
          return () =>
            h(GrafloriaFlow, {
              defaultNodes: [
                { id: 'a', position: { x: 0, y: 0 }, size: { width: 100, height: 50 } },
                { id: 'b', position: { x: 0, y: 0 }, size: { width: 100, height: 50 } },
                { id: 'c', position: { x: 0, y: 0 }, size: { width: 100, height: 50 } },
              ] as NodeSpec[],
              defaultEdges: [{ source: 'a', target: 'b' }, { source: 'b', target: 'c' }] as EdgeSpec[],
              layout: 'grid',
              onInit: (i: unknown) => (instance = i),
              onLayoutDone: () => layoutDone++,
            });
        },
      })
    );
    app.mount(host);
    for (let i = 0; i < 100 && layoutDone === 0; i++) await flush();
    expect(layoutDone).toBeGreaterThanOrEqual(1);
    const distinct = new Set(
      instance.getModel().getNodes().map((n: any) => `${n.position.x},${n.position.y}`)
    );
    expect(distinct.size).toBe(3);
  });
});

describe('canvas plugins prop', () => {
  it('plugins: true mounts the minimap; unmount disposes it', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp(
      defineComponent({
        setup() {
          return () =>
            h(GrafloriaFlow, {
              defaultNodes: [
                { id: 'a', position: { x: 0, y: 0 }, size: { width: 100, height: 50 }, label: 'A' },
              ] as NodeSpec[],
              plugins: true,
            });
        },
      })
    );
    app.mount(host);
    await flush();
    expect(host.querySelector('.grafloria-minimap')).toBeTruthy();
    app.unmount();
    expect(document.querySelector('.grafloria-minimap')).toBeNull();
    host.remove();
  });
});
