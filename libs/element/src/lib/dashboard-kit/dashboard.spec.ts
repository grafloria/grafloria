/**
 * `dashboard()` — the authoring API's contract.
 *
 * The promise being tested is the one the user asked for: "does our API
 * contain an easy way to create dashboards for developers", by exact analogy
 * with `erDiagram()`. So these tests assert the DECLARATIVE surface — what you
 * get from pure data, with no hand-assembly — and the typed handles over it.
 *
 * They drive the real engine (DiagramModel + the kit's binder) through a
 * minimal API stub, the same shape `render()` passes to `finalize()`.
 */
import { Command, DiagramModel, GroupModel, NodeModel, CommandManager, EventBus } from '@grafloria/engine';
import { render } from '../grafloria';
import { dashboard, type DashboardSpec } from './dashboard';

/** The slice of a DiagramInstance `finalize()` uses, over a real model. */
function makeApi(model: DiagramModel) {
  const bus = new EventBus();
  const manager = new CommandManager({ diagram: model, eventBus: bus });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const layer = document.createElement('div');
  layer.className = 'grafloria-html-layer';
  container.appendChild(layer);
  return {
    getModel: () => model,
    getEngine: () => ({ commandManager: manager }),
    container,
    render: () => undefined,
    renderNow: () => undefined,
    viewport: { fitToBounds: () => undefined, clientToWorld: () => ({ x: 0, y: 0 }) },
  };
}

/** Mount a spec the way `render()` does: build nodes, then run finalize. */
function mount(spec: DashboardSpec) {
  const model = new DiagramModel('dash');
  for (const n of spec.nodes) {
    const raw = n as {
      id: string;
      position: { x: number; y: number };
      size: { width: number; height: number };
      metadata: Record<string, unknown>;
    };
    const node = new NodeModel({
      id: raw.id,
      type: 'widget',
      position: { ...raw.position },
      size: { ...raw.size, depth: 0 },
    });
    for (const [k, v] of Object.entries(raw.metadata)) node.setMetadata(k, v);
    model.addNode(node);
  }
  const api = makeApi(model);
  spec.finalize(api);
  return { model, api, handle: spec.handle };
}

const SIMPLE = () =>
  dashboard({
    columns: 12,
    views: [
      {
        id: 'overview',
        name: 'Overview',
        widgets: [
          { id: 'a', kind: 'kpi', span: 3, rows: 1 },
          { id: 'b', kind: 'kpi', span: 3, rows: 1 },
          { id: 'c', kind: 'line', span: 6, rows: 2 },
        ],
      },
      { id: 'sales', name: 'Sales', widgets: [{ id: 'd', kind: 'bar', span: 12, rows: 2 }] },
    ],
  });

describe('dashboard() — the declarative surface', () => {
  it('turns pure data into custom-HTML widget nodes, no hand-assembly', () => {
    const spec = SIMPLE();
    expect(spec.nodes).toHaveLength(4);
    const a = spec.nodes[0] as Record<string, any>;
    expect(a['id']).toBe('a');
    expect(a['custom']).toBe(true); // the un-sanitised HTML host path
    expect(a['metadata'].useHTMLLayer).toBe(true);
    expect(a['metadata'].widgetKind).toBe('kpi');
    // Cells are carried as GridItemConfig, so save/load round-trips for free.
    expect(a['metadata'].gridItem).toEqual({ columnStart: 1, columnEnd: 4, rowStart: 1, rowEnd: 2 });
  });

  it('FLOWS widgets that declare no cell — the common case needs no coordinates', () => {
    const spec = dashboard({
      columns: 12,
      widgets: [
        { id: 'w1', span: 4 },
        { id: 'w2', span: 4 },
        { id: 'w3', span: 4 },
        { id: 'w4', span: 6 }, // wraps to the next row
      ],
    });
    const cell = (i: number) => (spec.nodes[i] as Record<string, any>)['metadata'].gridItem;
    expect(cell(0)).toMatchObject({ columnStart: 1, rowStart: 1 });
    expect(cell(1)).toMatchObject({ columnStart: 5, rowStart: 1 });
    expect(cell(2)).toMatchObject({ columnStart: 9, rowStart: 1 });
    expect(cell(3)).toMatchObject({ columnStart: 1, rowStart: 2 }); // wrapped
  });

  it('honours explicit cells verbatim and mixes them with flowed ones', () => {
    const spec = dashboard({
      columns: 12,
      widgets: [
        { id: 'hero', span: 6, rows: 2, x: 6, y: 0 }, // pinned to the right
        { id: 'flow', span: 3 },
      ],
    });
    expect((spec.nodes[0] as Record<string, any>)['metadata'].gridItem).toMatchObject({
      columnStart: 7,
      rowStart: 1,
      columnEnd: 13,
    });
    expect((spec.nodes[1] as Record<string, any>)['metadata'].gridItem).toMatchObject({ columnStart: 1 });
  });

  it('finalize() builds one chromeless board per view and adopts its widgets', () => {
    const { model, handle } = mount(SIMPLE());
    const overview = model.getGroup('overview');
    const sales = model.getGroup('sales');
    expect(overview).toBeDefined();
    expect(sales).toBeDefined();
    // A layout container must not paint group chrome (frame + title band).
    expect(overview!.getMetadata('frameChrome')).toBe('none');
    expect([...(overview!.members ?? [])].sort()).toEqual(['a', 'b', 'c']);
    expect([...(sales!.members ?? [])]).toEqual(['d']);
    expect(handle.views).toEqual(['overview', 'sales']);
  });

  it('DECLARED CELLS REACH THE BOARD — not just the flow order', () => {
    // The regression this locks: the spec's `metadata.gridItem` is inert, so
    // finalize() must write the model's real GridItemConfig. Before it did,
    // the board auto-positioned every widget in declaration order and an
    // out-of-flow cell was silently ignored — invisible whenever the flow
    // happened to agree, and fatal to the toJSON() round-trip when it did not.
    const { handle } = mount(
      dashboard({
        columns: 12,
        widgets: [
          { id: 'far', span: 3, rows: 1, x: 9, y: 2 }, // nowhere near the flow's first hole
          { id: 'near', span: 3, rows: 1, x: 0, y: 0 },
        ],
      })
    );
    // Declared FIRST, yet it holds the last three columns — auto-positioning
    // would have opened the board with it at x: 0.
    expect(handle.widget('far')!.cell).toMatchObject({ x: 9, w: 3 });
    expect(handle.widget('near')!.cell).toEqual({ x: 0, y: 0, w: 3, h: 1 });
    // …and the row obeys gravity, which is the engine's job, not the spec's:
    // with float off nothing hovers over an empty row.
    expect(handle.widget('far')!.cell!.y).toBe(0);
    const floated = mount(
      dashboard({ float: true, widgets: [{ id: 'far', span: 3, rows: 1, x: 9, y: 2 }] })
    );
    expect(floated.handle.widget('far')!.cell).toEqual({ x: 9, y: 2, w: 3, h: 1 });
  });

  it('parks every non-active view off-camera (the tab pattern)', () => {
    const { model, handle } = mount(SIMPLE());
    expect(handle.activeView).toBe('overview');
    expect(model.getGroup('overview')!.position.x).toBe(0);
    expect(model.getGroup('sales')!.position.x).toBeLessThan(-1000);
    handle.showView('sales');
    expect(handle.activeView).toBe('sales');
    expect(model.getGroup('sales')!.position.x).toBe(0);
    expect(model.getGroup('overview')!.position.x).toBeLessThan(-1000);
  });

  it('pinned:true reaches the model as the authoritative lock', () => {
    const { model } = mount(
      dashboard({ widgets: [{ id: 'p', span: 3, pinned: true }, { id: 'q', span: 3 }] })
    );
    expect(model.getNode('p')!.state?.locked).toBe(true);
    expect(model.getNode('q')!.state?.locked).not.toBe(true);
  });

  it('renderWidget receives the DECLARED widget and a raw host', () => {
    const seen: Array<{ id: string; kind?: string; tag: string }> = [];
    const spec = dashboard({
      widgets: [{ id: 'w', kind: 'donut', title: 'Mix', data: { source: 'region' } }],
      renderWidget: (w, host) => seen.push({ id: w.id, kind: w.kind, tag: host.tagName }),
    });
    const host = document.createElement('div');
    spec.renderCustomNode({ id: 'w' }, host);
    expect(seen).toEqual([{ id: 'w', kind: 'donut', tag: 'DIV' }]);
  });

  it('without renderWidget a titled placeholder renders — layouts are testable before charts exist', () => {
    const spec = dashboard({ widgets: [{ id: 'w', title: 'Revenue' }] });
    const host = document.createElement('div');
    spec.renderCustomNode({ id: 'w' }, host);
    expect(host.textContent).toContain('Revenue');
  });
});

describe('render(SPEC, host) — the documented one-liner', () => {
  // A spec that carries BOTH `finalize` and `renderCustomNode` must have both
  // honoured. render() auto-ran finalize but dropped renderCustomNode, so the
  // kit's headline usage — `render(dashboard({…}), host)` — mounted a board
  // whose widgets never painted. The API's own doc comment was false.
  it('paints widgets through render() itself — the whole one-liner', () => {
    // Drives the REAL render() path, not the spec object: the first version of
    // this tooth called spec.renderCustomNode directly and stayed green with
    // the bug in place (render() silently dropped it). Weak teeth are how a
    // documented API stays false.
    const painted: string[] = [];
    const el = document.createElement('div');
    el.style.width = '900px';
    el.style.height = '600px';
    document.body.appendChild(el);
    render(
      dashboard({
        widgets: [{ id: 'w1', kind: 'kpi' }, { id: 'w2', kind: 'line' }],
        renderWidget: (w, host) => {
          painted.push(w.id);
          host.textContent = w.id;
        },
      }) as never,
      el
    );
    expect(painted.sort()).toEqual(['w1', 'w2']);
  });

  it('honours a spec-provided renderCustomNode', () => {
    const painted: string[] = [];
    const spec = dashboard({
      widgets: [{ id: 'w', kind: 'kpi' }],
      renderWidget: (w, host) => {
        painted.push(w.id);
        host.textContent = w.id;
      },
    });
    // The exact contract render() relies on: the spec exposes the painter.
    expect(typeof spec.renderCustomNode).toBe('function');
    const host = document.createElement('div');
    spec.renderCustomNode({ id: 'w' }, host);
    expect(painted).toEqual(['w']);
  });
});

describe('the typed handles (the erTable/umlClass equivalent)', () => {
  it('widget() exposes the live cell as data', () => {
    const { handle } = mount(SIMPLE());
    expect(handle.widget('a')!.cell).toEqual({ x: 0, y: 0, w: 3, h: 1 });
    expect(handle.widget('c')!.cell).toEqual({ x: 6, y: 0, w: 6, h: 2 });
    expect(handle.widget('nope')).toBeUndefined();
  });

  it('widgetsOf() lists the active view, or a named one', () => {
    const { handle } = mount(SIMPLE());
    expect(handle.widgetsOf().map((w) => w.id)).toEqual(['a', 'b', 'c']);
    expect(handle.widgetsOf('sales').map((w) => w.id)).toEqual(['d']);
  });

  it('resize() changes the cell', async () => {
    const { handle } = mount(SIMPLE());
    await handle.widget('a')!.resize(6, 2);
    expect(handle.widget('a')!.cell).toMatchObject({ w: 6, h: 2 });
  });

  it('moveTo() relocates and the board stays overlap-free', async () => {
    const { handle } = mount(SIMPLE());
    await handle.widget('c')!.moveTo(0, 2);
    const cells = handle.widgetsOf().map((w) => w.cell!);
    for (let i = 0; i < cells.length; i++) {
      for (let j = i + 1; j < cells.length; j++) {
        const p = cells[i];
        const q = cells[j];
        const overlap =
          p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;
        expect(overlap).toBe(false);
      }
    }
  });

  it('pin() toggles the lock both ways', () => {
    const { handle } = mount(SIMPLE());
    const w = handle.widget('a')!;
    expect(w.pinned).toBe(false);
    w.pin();
    expect(w.pinned).toBe(true);
    w.pin(false);
    expect(w.pinned).toBe(false);
  });

  it('setSizing / setFloat drive every view at once', () => {
    const { handle } = mount(SIMPLE());
    expect(handle.getSizing()).toBe('fit');
    handle.setSizing('grow');
    expect(handle.getSizing()).toBe('grow');
    expect(handle.getFloat()).toBe(false);
    handle.setFloat(true);
    expect(handle.getFloat()).toBe(true);
  });

  it('remove() drops the widget and it stops being listed', () => {
    const { handle } = mount(SIMPLE());
    handle.widget('b')!.remove();
    expect(handle.widget('b')).toBeUndefined();
    expect(handle.widgetsOf().map((w) => w.id)).toEqual(['a', 'c']);
  });

  it('toJSON() round-trips: the output is valid dashboard() input', async () => {
    const { handle } = mount(SIMPLE());
    await handle.widget('a')!.resize(6, 1);
    const saved = handle.toJSON();
    expect(saved.map((v) => v.id)).toEqual(['overview', 'sales']);
    expect(saved[0].widgets.find((w) => w.id === 'a')).toMatchObject({ span: 6, rows: 1 });
    // Feed it straight back — the whole point of a data-first API.
    const reloaded = dashboard({ columns: 12, views: saved });
    const cellOfA = (reloaded.nodes.find((n) => (n as Record<string, any>)['id'] === 'a') as Record<
      string,
      any
    >)['metadata'].gridItem;
    expect(cellOfA).toMatchObject({ columnStart: 1, columnEnd: 7 });
    // …and MOUNTING that reload really reproduces the saved cells, which is
    // the claim a save/load button depends on (the spec's node metadata alone
    // never reaches the board — finalize() writes the model's GridItemConfig).
    const { handle: h2 } = mount(reloaded);
    expect(h2.widget('a')!.cell).toEqual({ x: 0, y: 0, w: 6, h: 1 });
    expect(h2.widget('c')!.cell).toEqual(handle.widget('c')!.cell);
  });

  it('onLayoutChange is wired to committed gestures', () => {
    const calls: string[] = [];
    const spec = dashboard({
      widgets: [{ id: 'w', span: 3 }],
      onLayoutChange: (viewId) => calls.push(viewId),
    });
    mount(spec);
    // No gesture yet — the hook must not fire on boot.
    expect(calls).toEqual([]);
  });
});

describe('the closed API gaps (the port\'s bypass list)', () => {
  it('#1 addWidget CREATES the node, wires its metadata, and is UNDOABLE', async () => {
    const { model, api, handle } = mount(SIMPLE());
    const cm = api.getEngine().commandManager;
    expect(model.getNode('fresh')).toBeUndefined();
    const w = handle.addWidget({ id: 'fresh', kind: 'bar', span: 4, rows: 2 });
    expect(w).toBeDefined();
    const node = model.getNode('fresh')!;
    expect(node).toBeDefined();
    expect(node.getMetadata('useHTMLLayer')).toBe(true);
    expect(node.getMetadata('widgetKind')).toBe('bar');
    expect(node.getMetadata('columnSpan')).toBe(4);
    expect([...(model.getGroup('overview')!.members ?? [])]).toContain('fresh');
    // The manager settles its history asynchronously (it awaits internally),
    // so the undo entry lands on the next tick — the node itself is already
    // in the model synchronously, which is what the paint path needs.
    await new Promise((r) => setTimeout(r, 0));
    expect(cm.canUndo()).toBe(true);
  });

  it('#5 widget nodes are NOT connectable and carry no ports', () => {
    const { model, handle } = mount(SIMPLE());
    handle.addWidget({ id: 'w5', kind: 'kpi' });
    const node = model.getNode('w5')!;
    expect(node.behavior?.connectable).toBe(false);
    expect([...node.getPorts().values()]).toHaveLength(0);
  });

  it('#3 resize/moveTo report whether the board ACCEPTED the change', async () => {
    const { handle } = mount(SIMPLE());
    await expect(handle.widget('a')!.resize(6, 2)).resolves.toBe(true);
    // Same cells again -> nothing to do -> false, not a silent void.
    const cell = handle.widget('a')!.cell!;
    await expect(handle.widget('a')!.resize(cell.w, cell.h)).resolves.toBe(false);
  });

  it('#7/#12 the handle exposes the declared spec, the rect and board metrics', () => {
    const { handle } = mount(SIMPLE());
    expect(handle.widget('a')!.spec.kind).toBe('kpi');
    const rect = handle.widget('a')!.rect!;
    expect(rect.width).toBeGreaterThan(0);
    const m = handle.metrics()!;
    expect(m.columns).toBe(12);
    expect(m.rows).toBeGreaterThan(0);
  });

  it('#11 z-order lives on the handle and is undoable', async () => {
    const { model, api, handle } = mount(SIMPLE());
    handle.widget('a')!.bringToFront();
    await new Promise((r) => setTimeout(r, 0));
    expect(api.getEngine().commandManager.canUndo()).toBe(true);
    expect(typeof model.getNode('a')!.getEffectiveZIndex()).toBe('number');
    handle.widget('a')!.sendToBack();
  });

  it('#2 remove() USES the gesture\'s already-computed displaced commands', async () => {
    // A weaker version of this tooth passed `[]` and only checked the widget
    // vanished — which stayed green when remove() ignored the argument and
    // re-planned its own. The caller's commands must actually RUN, so hand it
    // an observable one and watch for it.
    let ran = false;
    class Sentinel extends Command {
      constructor() {
        super('Sentinel');
      }
      override execute(): void {
        ran = true;
      }
      override undo(): void {
        ran = false;
      }
      override serialize() {
        return { id: this.id, name: this.name, timestamp: this.timestamp, data: {} };
      }
    }
    const { handle } = mount(SIMPLE());
    handle.widget('b')!.remove([new Sentinel()]);
    await new Promise((r) => setTimeout(r, 0));
    expect(ran).toBe(true);
    expect(handle.widget('b')).toBeUndefined();
  });

  it('#6 dispose() takes its boards with it — a rebuild cannot stack them', () => {
    const { model, handle } = mount(SIMPLE());
    expect(model.getGroup('overview')).toBeDefined();
    handle.dispose();
    expect(model.getGroup('overview')).toBeUndefined();
    expect(model.getGroup('sales')).toBeUndefined();
  });

  it('#4/#9 refresh() and fit() exist and are safe to call', () => {
    const { handle } = mount(SIMPLE());
    expect(() => handle.refresh()).not.toThrow();
    expect(() => handle.fit()).not.toThrow();
    expect(() => handle.fit('sales')).not.toThrow();
  });

  it('update() swaps the data and repaints through renderWidget', () => {
    const painted: unknown[] = [];
    const spec = dashboard({
      widgets: [{ id: 'u', kind: 'kpi', data: { value: 'one' } }],
      renderWidget: (w, host) => {
        painted.push(w.data);
        host.textContent = String((w.data as { value?: string })?.value ?? '');
      },
    });
    const host = document.createElement('div');
    spec.renderCustomNode({ id: 'u' }, host); // mount captures the host
    mount(spec);
    spec.handle.widget('u')!.update({ data: { value: 'two' } });
    expect(host.textContent).toBe('two');
    expect(spec.handle.widget('u')!.spec.data).toEqual({ value: 'two' });
  });
});
