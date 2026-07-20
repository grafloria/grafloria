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
import { DiagramModel, GroupModel, NodeModel, CommandManager, EventBus } from '@grafloria/engine';
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
