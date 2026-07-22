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

describe('collab — two flows over a MemoryHub (Vue)', () => {
  it('an edit in flow A converges into flow B through the CRDT', async () => {
    const { MemoryHub } = require('@grafloria/engine');
    const hub = new MemoryHub();
    const host2 = document.createElement('div');
    document.body.appendChild(host2);
    let a: any = null;
    let b: any = null;
    const NODES: NodeSpec[] = [
      { id: 'n1', position: { x: 0, y: 0 }, size: { width: 100, height: 50 }, label: 'N1' },
    ];
    const mk = (target: HTMLElement, actor: string, onInit: (i: unknown) => void) => {
      const app = createApp(
        defineComponent({
          setup() {
            return () =>
              h(GrafloriaFlow, {
                defaultNodes: NODES,
                collab: { transport: hub.connect(actor), actor, batch: false },
                onInit,
              });
          },
        })
      );
      app.mount(target);
      return app;
    };
    const host1 = document.createElement('div');
    document.body.appendChild(host1);
    const app1 = mk(host1, 'actor-a', (i) => (a = i));
    const app2 = mk(host2, 'actor-b', (i) => (b = i));
    await flush();

    a.getModel().getNodes()[0].setPosition(444, 55);
    for (let i = 0; i < 40; i++) {
      const n = b.getModel().getNode('n1');
      if (n && n.position.x === 444) break;
      await flush();
    }
    const nb = b.getModel().getNode('n1');
    expect({ x: nb.position.x, y: nb.position.y }).toEqual({ x: 444, y: 55 });
    app1.unmount(); app2.unmount(); host1.remove(); host2.remove();
  });
});

describe('collab presence — live cursors (Vue)', () => {
  it("A's pointer appears as a remote cursor in B's presence layer", async () => {
    const { MemoryHub } = require('@grafloria/engine');
    const hub = new MemoryHub();
    const NODES: NodeSpec[] = [
      { id: 'n1', position: { x: 0, y: 0 }, size: { width: 100, height: 50 }, label: 'N1' },
    ];
    const mk = (target: HTMLElement, actor: string, name: string) => {
      const app = createApp(
        defineComponent({
          setup() {
            return () =>
              h(GrafloriaFlow, {
                defaultNodes: NODES,
                collab: { transport: hub.connect(actor), actor, batch: false,
                          awarenessThrottleMs: 0, presence: { name, smoothing: 0 } },
              });
          },
        })
      );
      app.mount(target);
      return app;
    };
    const hostA = document.createElement('div');
    const hostB = document.createElement('div');
    document.body.append(hostA, hostB);
    const app1 = mk(hostA, 'ana', 'Ana');
    const app2 = mk(hostB, 'ben', 'Ben');
    await flush();
    expect(hostA.querySelector('.grafloria-presence-layer')).toBeTruthy();
    expect(hostB.querySelector('.grafloria-presence-layer')).toBeTruthy();

    const rootA = hostA.querySelector('.grafloria-diagram-root') as HTMLElement;
    rootA.dispatchEvent(new MouseEvent('pointermove', { clientX: 120, clientY: 80, bubbles: true }));
    for (let i = 0; i < 40 && !hostB.querySelector('.grafloria-presence-cursor'); i++) await flush();
    expect(hostB.querySelector('.grafloria-presence-cursor')).toBeTruthy();
    app1.unmount(); app2.unmount(); hostA.remove(); hostB.remove();
  });
});
