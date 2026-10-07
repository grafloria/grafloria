/**
 * <GrafloriaFlow> — the Vue 3 wrapper, proven with the plain Vue runtime in
 * jsdom (no test-utils): mount, v-model round-trip, slot-based custom nodes
 * with the auto-`custom` opt-in, declarative layout, and exposed API.
 */
import { createApp, defineComponent, h, nextTick, onUnmounted, ref, type App } from 'vue';
import { GrafloriaFlow } from './grafloria-flow';
import type { NodeSpec, EdgeSpec } from '@grafloria/renderer';

const flush = () => new Promise((r) => setTimeout(r, 50));

/** jsdom lays nothing out — give every element a real box so the camera is not 0x0. */
beforeAll(() => {
  Element.prototype.getBoundingClientRect = function () {
    return { left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  };
});

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

  const TWO: NodeSpec[] = [
    { id: 'a', position: { x: 100, y: 100 }, size: { width: 120, height: 60 }, label: 'A' },
    { id: 'b', position: { x: 400, y: 100 }, size: { width: 120, height: 60 }, label: 'B' },
  ];

  /** The CSS block THIS instance injected; it names its theme (`Theme: Dark (instance …)`). */
  const themeCss = (): string => {
    const id = host.querySelector('svg')?.getAttribute('data-grafloria-instance');
    return (id && document.head.querySelector(`style[id$="${id}"]`)?.textContent) || '';
  };

  it('colorMode: applies at mount and follows the prop live, without remounting', async () => {
    const instances: any[] = [];
    const mode = ref<'light' | 'dark' | 'system'>('dark');
    app = createApp(defineComponent({
      setup: () => () => h(GrafloriaFlow, { defaultNodes: TWO, colorMode: mode.value, onInit: (i: unknown) => instances.push(i) }),
    }));
    app.mount(host);
    await flush();
    expect(instances[0].getColorMode()).toBe('dark');
    expect(themeCss()).toContain('Theme: Dark');
    mode.value = 'light';
    await flush();
    expect(instances[0].getColorMode()).toBe('light');
    expect(themeCss()).toContain('Theme: Light');
    mode.value = 'system';
    await flush();
    expect(instances[0].getColorMode()).toBe('system');
    expect(instances).toHaveLength(1);
  });

  it('colorMode: a theme prop does not fight it', async () => {
    const { LIGHT_THEME } = require('@grafloria/renderer');
    app = createApp(defineComponent({
      setup: () => () => h(GrafloriaFlow, { defaultNodes: TWO, theme: LIGHT_THEME, colorMode: 'dark' }),
    }));
    app.mount(host);
    await flush();
    expect(themeCss()).toContain('Theme: Dark');
  });

  it('highlightConnected: goes in at mount and follows the prop live', async () => {
    let instance: any = null;
    const hc = ref<unknown>(true);
    app = createApp(defineComponent({
      setup: () => () => h(GrafloriaFlow, { defaultNodes: TWO, highlightConnected: hc.value as never, onInit: (i: unknown) => (instance = i) }),
    }));
    app.mount(host);
    await flush();
    expect(instance.getHighlightConnected()).toBeTruthy();
    hc.value = { depth: 2 };
    await flush();
    expect(instance.getHighlightConnected()).toEqual(expect.objectContaining({ depth: 2 }));
    hc.value = { depth: Infinity }; // must arrive as Infinity — JSON would make it null
    await flush();
    expect(instance.getHighlightConnected().depth).toBe(Infinity);
    hc.value = false;
    await flush();
    expect(instance.getHighlightConnected()).toBe(false);
  });

  it('groups: zones go in at mount (a loaded document keeps them) and follow the prop', async () => {
    let instance: any = null;
    const zone = { id: 'zone', label: 'Zone', children: ['a', 'b'] };
    const groups = ref<unknown[]>([zone]);
    app = createApp(defineComponent({
      setup: () => () => h(GrafloriaFlow, { nodes: TWO, groups: groups.value as never, onInit: (i: unknown) => (instance = i) }),
    }));
    app.mount(host);
    await flush();
    expect(instance.getModel().getGroup('zone')?.members.has('b')).toBe(true);
    groups.value = [{ ...zone, children: ['a'] }];
    await flush();
    expect(instance.getModel().getGroup('zone')?.members.has('b')).toBe(false);
    groups.value = [];
    await flush();
    expect(instance.getModel().getGroup('zone')).toBeUndefined();
  });

  it('defaultGroups: zones go in once; the instance owns them after', async () => {
    let instance: any = null;
    app = createApp(defineComponent({
      setup: () => () => h(GrafloriaFlow, { defaultNodes: TWO, defaultGroups: [{ id: 'zone', children: ['a'] }] as never, onInit: (i: unknown) => (instance = i) }),
    }));
    app.mount(host);
    await flush();
    expect(instance.getModel().getGroup('zone')?.members.has('a')).toBe(true);
  });

  it('highlighterConfig: off unless set; on, it outlines the selection; it follows the prop live', async () => {
    let instance: any = null;
    const cfg = ref<boolean | Record<string, boolean> | undefined>(undefined);
    app = createApp(
      defineComponent({
        setup() {
          return () =>
            h(GrafloriaFlow, {
              // A type with no shape: the validation outline flags it (built-in
              // shapes such as `rect` are never flagged as unregistered).
              defaultNodes: [
                { id: 'a', type: 'no-such-node-type', position: { x: 100, y: 100 }, size: { width: 120, height: 60 }, label: 'A' },
                { id: 'b', type: 'no-such-node-type', position: { x: 400, y: 100 }, size: { width: 120, height: 60 }, label: 'B' },
              ] as NodeSpec[],
              highlighterConfig: cfg.value,
              onInit: (i: unknown) => (instance = i),
            });
        },
      })
    );
    app.mount(host);
    await flush();
    const outlines = (kind: string) => host.querySelectorAll(`.grafloria-highlighter-${kind}`).length;
    instance.getModel().selectNode(instance.getModel().getNode('a'));
    await flush();
    expect(outlines('selection')).toBe(0); // unset: no outline layer, as before
    cfg.value = true;
    await nextTick();
    await flush();
    expect(outlines('selection')).toBe(1);
    cfg.value = { showSelection: false };
    await nextTick();
    await flush();
    expect(outlines('selection')).toBe(0);
    expect(outlines('validation')).toBeGreaterThan(0); // the other kinds stay on
    cfg.value = false;
    await nextTick();
    await flush();
    expect(host.querySelectorAll('.grafloria-highlighter').length).toBe(0);
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

  it('a deleted custom node unmounts its slot content', async () => {
    let instance: any = null;
    let unmounted = 0;
    const Card = defineComponent({
      props: { title: String },
      setup(p) {
        onUnmounted(() => unmounted++);
        return () => h('div', { class: 'vue-job' }, p.title);
      },
    });
    app = createApp(
      defineComponent({
        setup() {
          return () =>
            h(
              GrafloriaFlow,
              {
                defaultNodes: [
                  { id: 'j1', type: 'job', position: { x: 10, y: 10 }, size: { width: 150, height: 60 }, data: { title: 'Extract' } },
                  { id: 'j2', type: 'job', position: { x: 300, y: 10 }, size: { width: 150, height: 60 }, data: { title: 'Load' } },
                ] as NodeSpec[],
                onInit: (i: unknown) => (instance = i),
              },
              { 'node-job': (p: any) => [h(Card, { title: String(p.data['title']) })] }
            );
        },
      })
    );
    app.mount(host);
    await flush();
    expect(host.querySelectorAll('.vue-job')).toHaveLength(2);

    instance.getModel().removeNode('j1');
    await flush();

    expect(unmounted).toBe(1);
    expect(Array.from(host.querySelectorAll('.vue-job'), (e) => e.textContent)).toEqual(['Load']);
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

describe('comments (Vue)', () => {
  it('comments prop wires a store and a thread renders its pin', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    let instance: any = null;
    const app = createApp(
      defineComponent({
        setup() {
          return () =>
            h(GrafloriaFlow, {
              defaultNodes: [{ id: 'a', position: { x: 50, y: 50 }, size: { width: 100, height: 50 } }] as NodeSpec[],
              comments: true,
              onInit: (i: unknown) => (instance = i),
            });
        },
      })
    );
    app.mount(host);
    await flush();
    const store = instance.getCommentStore();
    expect(store).toBeTruthy();
    const threadId = store.createThread({ kind: 'node', id: 'a' }, 'hm');
    instance.renderNow();
    expect(host.querySelector(`[data-comment-thread-id="${threadId}"]`)).toBeTruthy();
    app.unmount();
    host.remove();
  });
});

describe('in-place changes to the controlled arrays reach the canvas (Vue)', () => {
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

  const spec = (id: string, x: number, label = id.toUpperCase()): NodeSpec => ({
    id,
    position: { x, y: 100 },
    size: { width: 100, height: 50 },
    label,
  });

  /**
   * Mounts a flow over `nodes`, one-way (`:nodes`) or two-way (`v-model:nodes`), and
   * counts what crosses the boundary: every setNodes the wrapper makes, every emit.
   */
  const mountFlow = async (nodes: { value: NodeSpec[] }, vModel: boolean, extra: Record<string, unknown> = {}) => {
    const counts = { setNodes: 0, emits: 0 };
    let instance: any = null;
    app = createApp(
      defineComponent({
        setup: () => () =>
          h(GrafloriaFlow, {
            nodes: nodes.value,
            ...(vModel
              ? {
                  'onUpdate:nodes': (v: NodeSpec[]) => {
                    counts.emits++;
                    nodes.value = v;
                  },
                }
              : {}),
            onInit: (i: any) => {
              instance = i;
              const original = i.setNodes.bind(i);
              i.setNodes = (next: unknown) => {
                counts.setNodes++;
                return original(next);
              };
            },
            ...extra,
          }),
      })
    );
    app.mount(host);
    await flush();
    return { counts, instance: () => instance };
  };

  it('push: a node pushed onto the array appears', async () => {
    const nodes = ref<NodeSpec[]>([spec('a', 0), spec('b', 200)]);
    const { instance } = await mountFlow(nodes, false);
    nodes.value.push(spec('c', 400));
    await nextTick();
    await flush();
    expect(instance().getModel().getNodes().map((n: any) => n.id)).toEqual(['a', 'b', 'c']);
    expect(host.querySelector('[data-node-id="c"]')).toBeTruthy();
  });

  it('splice: a node removed from the array in place disappears', async () => {
    const nodes = ref<NodeSpec[]>([spec('a', 0), spec('b', 200)]);
    const { instance } = await mountFlow(nodes, false);
    nodes.value.splice(1, 1);
    await nextTick();
    await flush();
    expect(instance().getModel().getNodes().map((n: any) => n.id)).toEqual(['a']);
  });

  it('mutating an item: a label changed in place updates the node', async () => {
    const nodes = ref<NodeSpec[]>([spec('a', 0), spec('b', 200)]);
    const { instance } = await mountFlow(nodes, false);
    nodes.value[0].label = 'Renamed';
    await nextTick();
    await flush();
    expect(instance().getModel().getNode('a').getLabel()).toBe('Renamed');
    nodes.value[1].position!.x = 333;
    await nextTick();
    await flush();
    expect(instance().getModel().getNode('b').position.x).toBe(333);
  });

  it('a drag the array never heard of survives a push (one-way :nodes)', async () => {
    const nodes = ref<NodeSpec[]>([spec('a', 0), spec('b', 200)]);
    const { instance } = await mountFlow(nodes, false);
    instance().getModel().getNode('a').setPosition(55, 66); // the user dragged it
    nodes.value.push(spec('c', 400));
    await nextTick();
    await flush();
    const a = instance().getModel().getNode('a');
    expect({ x: a.position.x, y: a.position.y }).toEqual({ x: 55, y: 66 });
    expect(instance().getModel().getNode('c')).toBeTruthy();
  });

  it('v-model:nodes: a push applies once, the echo is not reapplied, nothing loops', async () => {
    const nodes = ref<NodeSpec[]>([spec('a', 0), spec('b', 200)]);
    const { counts, instance } = await mountFlow(nodes, true);
    const base = { ...counts };
    nodes.value.push(spec('c', 400));
    await nextTick();
    await flush();
    await flush();
    expect(instance().getModel().getNodes().map((n: any) => n.id)).toEqual(['a', 'b', 'c']);
    expect(counts.setNodes - base.setNodes).toBe(1); // the push — never the echo
    expect(counts.emits - base.emits).toBe(1); // node:added → one update:nodes
    expect(nodes.value.map((n) => n.id)).toEqual(['a', 'b', 'c']);
    // …and it stays quiet.
    const settled = { ...counts };
    await flush();
    await flush();
    expect(counts).toEqual(settled);
  });

  it('v-model:nodes: a canvas change writes back and is not reapplied; a later push keeps it', async () => {
    const nodes = ref<NodeSpec[]>([spec('a', 0), spec('b', 200)]);
    const { counts, instance } = await mountFlow(nodes, true);
    // A canvas-side change that emits (removal does; so does a drag's end).
    const before = { ...counts };
    instance().getModel().getNode('a').setPosition(77, 88);
    instance().getModel().removeNode('b');
    await nextTick();
    await flush();
    expect(nodes.value.map((n) => n.id)).toEqual(['a']);
    expect(nodes.value[0].position).toEqual({ x: 77, y: 88 });
    expect(counts.emits - before.emits).toBe(1);
    expect(counts.setNodes - before.setNodes).toBe(0); // its own value is not applied back
    const base = { ...counts };
    nodes.value.push(spec('c', 400));
    await nextTick();
    await flush();
    expect(counts.setNodes - base.setNodes).toBe(1);
    const a = instance().getModel().getNode('a');
    expect({ x: a.position.x, y: a.position.y }).toEqual({ x: 77, y: 88 });
    expect(instance().getModel().getNode('c')).toBeTruthy();
  });

  it('v-model:nodes: a selection change is not applied back and does not loop', async () => {
    const nodes = ref<NodeSpec[]>([spec('a', 0), spec('b', 200)]);
    const { counts, instance } = await mountFlow(nodes, true);
    const base = { ...counts };
    const model = instance().getModel();
    model.selectNode(model.getNode('b'));
    await nextTick();
    await flush();
    await flush();
    expect(counts.setNodes - base.setNodes).toBe(0);
    expect(counts.emits - base.emits).toBeLessThanOrEqual(1);
    expect(model.getSelectedNodes().map((n: any) => n.id)).toEqual(['b']);
  });

  it('replacing the array still applies the whole of it, as before', async () => {
    const nodes = ref<NodeSpec[]>([spec('a', 0), spec('b', 200)]);
    const { instance } = await mountFlow(nodes, false);
    instance().getModel().getNode('a').setPosition(55, 66);
    nodes.value = [spec('a', 10), spec('b', 200)];
    await nextTick();
    await flush();
    expect(instance().getModel().getNode('a').position.x).toBe(10);
  });

  it('edges and groups: in-place pushes reach the canvas', async () => {
    const nodes = ref<NodeSpec[]>([spec('a', 0), spec('b', 200), spec('c', 400)]);
    const edges = ref<EdgeSpec[]>([{ id: 'e1', source: 'a', target: 'b' }]);
    const groups = ref<any[]>([{ id: 'zone', children: ['a'] }]);
    let instance: any = null;
    app = createApp(
      defineComponent({
        setup: () => () =>
          h(GrafloriaFlow, {
            nodes: nodes.value,
            edges: edges.value,
            groups: groups.value as never,
            onInit: (i: unknown) => (instance = i),
          }),
      })
    );
    app.mount(host);
    await flush();
    edges.value.push({ id: 'e2', source: 'b', target: 'c' });
    groups.value[0].children.push('b');
    await nextTick();
    await flush();
    expect(instance.getModel().getLinks().map((l: any) => l.id).sort()).toEqual(['e1', 'e2']);
    expect(instance.getModel().getGroup('zone')?.members.has('b')).toBe(true);
  });

  it('theme: a token changed in place is applied', async () => {
    const { LIGHT_THEME } = require('@grafloria/renderer');
    const theme = ref<any>(JSON.parse(JSON.stringify(LIGHT_THEME)));
    let instance: any = null;
    const applied: unknown[] = [];
    app = createApp(
      defineComponent({
        setup: () => () =>
          h(GrafloriaFlow, {
            defaultNodes: [spec('a', 0)],
            theme: theme.value,
            onInit: (i: any) => {
              instance = i;
              const original = i.setTheme.bind(i);
              i.setTheme = (t: unknown) => {
                applied.push(t);
                return original(t);
              };
            },
          }),
      })
    );
    app.mount(host);
    await flush();
    expect(instance).toBeTruthy();
    theme.value.name = 'Tweaked in place';
    await nextTick();
    await flush();
    expect(applied).toHaveLength(1);
    expect((applied[0] as any).name).toBe('Tweaked in place');
  });
});
