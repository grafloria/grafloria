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
import { ensureDashboardKitStyles, DASHBOARD_KIT_STYLE_ID } from './styles';

/** Give a jsdom element a measurable box (jsdom lays nothing out). */
function sizeElement(el: HTMLElement, w: number, h: number): void {
  Object.defineProperty(el, 'clientWidth', { value: w, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: h, configurable: true });
}

/** The slice of a DiagramInstance `finalize()` uses, over a real model. */
function makeApi(model: DiagramModel, size?: { w: number; h: number }) {
  const bus = new EventBus();
  const manager = new CommandManager({ diagram: model, eventBus: bus });
  const container = document.createElement('div');
  document.body.appendChild(container);
  if (size) sizeElement(container, size.w, size.h);
  const layer = document.createElement('div');
  layer.className = 'grafloria-html-layer';
  container.appendChild(layer);
  // A camera that REMEMBERS what it was asked, so a test can tell a fit from a pin.
  const camera = { fits: 0, zooms: [] as number[], rect: { x: 0, y: 0, width: size?.w ?? 800, height: size?.h ?? 600 } };
  return {
    getModel: () => model,
    getEngine: () => ({ commandManager: manager, eventBus: bus }),
    container,
    render: () => undefined,
    renderNow: () => undefined,
    camera,
    viewport: {
      fitToBounds: () => {
        camera.fits++;
      },
      clientToWorld: () => ({ x: 0, y: 0 }),
      setZoom: (z: number) => {
        camera.zooms.push(z);
        return z;
      },
      getViewport: () => ({ ...camera.rect }),
      setViewport: (r: { x: number; y: number; width: number; height: number }) => {
        camera.rect = { ...r };
      },
    },
  };
}

/** Mount a spec the way `render()` does: build nodes, then run finalize. */
function mount(spec: DashboardSpec, size?: { w: number; h: number }) {
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
  const api = makeApi(model, size);
  spec.finalize(api);
  return { model, api, handle: spec.handle };
}

/** The handle's commands are fire-and-forget (execute() is async with two
 *  awaits inside); a test that reads the model right after must let them land. */
const settle = () => new Promise<void>((r) => setTimeout(r, 0));

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
    expect(handle.getSizing()).toBe('grow'); // a fluid board grows by default
    handle.setSizing('fit');
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
    expect(saved.views.map((v) => v.id)).toEqual(['overview', 'sales']);
    expect(saved.views[0].widgets.find((w) => w.id === 'a')).toMatchObject({ span: 6, rows: 1 });
    // Feed it straight back — the whole point of a data-first API.
    const reloaded = dashboard({ ...saved, columns: 12 });
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

  it('#5 widget nodes are NOT connectable and carry no ports — BOTH paths', () => {
    // The first version of this tooth only exercised addWidget(). Widgets
    // DECLARED in dashboard({views}) travel a different road: they become node
    // SPECS, and the render-input path ignores a spec-level `behavior` (the
    // same trap erDiagram documents for `resizable`), so finalize() has to set
    // it on the live model. Covering one path let the other ship connectable.
    const { model, handle } = mount(SIMPLE());
    for (const id of ['a', 'b', 'c']) {
      const declared = model.getNode(id)!;
      expect(declared.behavior?.connectable).toBe(false);
      expect([...declared.getPorts().values()]).toHaveLength(0);
    }
    handle.addWidget({ id: 'w5', kind: 'kpi' });
    const added = model.getNode('w5')!;
    expect(added.behavior?.connectable).toBe(false);
    expect([...added.getPorts().values()]).toHaveLength(0);
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

// ===========================================================================
// PHASE 4 — responsive column count and RTL, through the DATA-FIRST API.
//
// The engine spec proves the column-change semantics and the cache; these
// prove the authoring surface actually reaches them, which is the gap that
// made this phase's work "not only the binder".
// ===========================================================================

const BOARD = () =>
  dashboard({
    columns: 12,
    width: 1200,
    height: 400,
    views: [
      {
        id: 'main',
        widgets: [
          { id: 'w1', span: 3, rows: 1, x: 0, y: 0 },
          { id: 'w2', span: 3, rows: 1, x: 3, y: 0 },
          { id: 'w3', span: 6, rows: 1, x: 6, y: 0 },
        ],
      },
    ],
  });

describe('dashboard() — responsive column count', () => {
  it('setColumns re-lays the board out and metrics report the LIVE count', () => {
    const { handle } = mount(BOARD());
    expect(handle.getColumns()).toBe(12);
    expect(handle.metrics()!.columns).toBe(12);
    handle.setColumns(6);
    expect(handle.getColumns()).toBe(6);
    expect(handle.metrics()!.columns).toBe(6);
    expect(handle.metrics()!.maxColumns).toBe(12); // the authored width is remembered
    for (const w of handle.widgetsOf()) expect(w.cell!.x + w.cell!.w).toBeLessThanOrEqual(6);
  });

  it('shrinking then growing back restores every cell EXACTLY (the cache)', () => {
    const { handle } = mount(BOARD());
    const before = handle.widgetsOf().map((w) => ({ id: w.id, ...w.cell! }));
    handle.setColumns(1);
    expect(handle.widgetsOf().every((w) => w.cell!.w === 1)).toBe(true);
    handle.setColumns(12);
    expect(handle.widgetsOf().map((w) => ({ id: w.id, ...w.cell! }))).toEqual(before);
  });

  it('the column change writes cells through, so a refresh() cannot undo it', () => {
    const { handle } = mount(BOARD());
    handle.setColumns(4);
    const narrow = handle.widgetsOf().map((w) => ({ id: w.id, ...w.cell! }));
    handle.refresh(); // rebuilds every engine from the model
    expect(handle.widgetsOf().map((w) => ({ id: w.id, ...w.cell! }))).toEqual(narrow);
    // …and the cache still survived the rebuild, so growing back still restores.
    handle.setColumns(12);
    expect(handle.widgetsOf().find((w) => w.id === 'w3')!.cell!.w).toBe(6);
  });

  it('a responsive board derives its count from the board width', () => {
    const spec = dashboard({
      columns: 12,
      width: 600,
      height: 300,
      responsive: { columnWidth: 100 },
      widgets: [
        { id: 'a', span: 3, rows: 1, x: 0, y: 0 },
        { id: 'b', span: 3, rows: 1, x: 3, y: 0 },
      ],
    });
    const { handle } = mount(spec);
    // 600 / 100 = 6 columns, not the declared 12.
    expect(handle.getColumns()).toBe(6);
    expect(handle.metrics()!.responsive).toBe(true);
  });

  it('breakpoints pick the first step at least as wide as the board', () => {
    const make = (width: number) =>
      mount(
        dashboard({
          columns: 12,
          width,
          height: 300,
          responsive: { breakpoints: [{ w: 500, c: 1 }, { w: 900, c: 6 }] },
          widgets: [{ id: 'a', span: 6, rows: 1, x: 0, y: 0 }],
        })
      ).handle;
    expect(make(400).getColumns()).toBe(1); // <= 500
    expect(make(800).getColumns()).toBe(6); // <= 900
    expect(make(1200).getColumns()).toBe(12); // wider than every step -> the max
  });

  it('an explicit setColumns PINS the count against the width evaluator', () => {
    const { handle } = mount(
      dashboard({
        columns: 12,
        width: 600,
        height: 300,
        responsive: { columnWidth: 100 },
        widgets: [{ id: 'a', span: 3, rows: 1, x: 0, y: 0 }],
      })
    );
    expect(handle.getColumns()).toBe(6);
    handle.setColumns(12);
    expect(handle.getColumns()).toBe(12);
    expect(handle.metrics()!.responsive).toBe(false);
    handle.refresh(); // would re-evaluate width and snap back to 6 if not pinned
    expect(handle.getColumns()).toBe(12);
  });

  it('SAVING WHILE NARROW saves the wide layout — toJSON keeps the desktop', () => {
    const { handle } = mount(BOARD());
    const wide = handle.toJSON();
    handle.setColumns(1);
    const narrow = handle.toJSON();
    expect(narrow.views[0].columns).toBe(12); // the view records the widest count
    expect(narrow.views[0].widgets.map((w) => [w.x, w.y, w.span])).toEqual(
      wide.views[0].widgets.map((w) => [w.x, w.y, w.span])
    );
    // …while the board on screen really IS one column wide.
    expect(handle.getColumns()).toBe(1);
    expect(handle.widgetsOf().every((w) => w.cell!.w === 1)).toBe(true);
  });

  it('that saved JSON feeds straight back into dashboard() as the wide board', () => {
    const { handle } = mount(BOARD());
    handle.setColumns(1);
    const saved = handle.toJSON();
    const rebuilt = mount(dashboard({ ...saved, width: 1200, height: 400 }));
    expect(rebuilt.handle.getColumns()).toBe(12);
    expect(rebuilt.handle.widgetsOf().map((w) => ({ id: w.id, ...w.cell! }))).toEqual(
      handle.toJSON().views[0].widgets.map((w) => ({ id: w.id, x: w.x!, y: w.y!, w: w.span!, h: w.rows! }))
    );
  });
});

describe('dashboard() — RTL', () => {
  /** The same three-widget board, declared once, mounted in each direction. */
  const both = () => {
    const ltr = mount(BOARD());
    const rtlSpec = dashboard({
      columns: 12,
      width: 1200,
      height: 400,
      rtl: true,
      views: [
        {
          id: 'main',
          widgets: [
            { id: 'w1', span: 3, rows: 1, x: 0, y: 0 },
            { id: 'w2', span: 3, rows: 1, x: 3, y: 0 },
            { id: 'w3', span: 6, rows: 1, x: 6, y: 0 },
          ],
        },
      ],
    });
    return { ltr, rtl: mount(rtlSpec) };
  };

  it('is direction-agnostic in the MODEL: identical cells, mirrored pixels', () => {
    const { ltr, rtl } = both();
    for (const id of ['w1', 'w2', 'w3']) {
      expect(rtl.handle.widget(id)!.cell).toEqual(ltr.handle.widget(id)!.cell);
    }
    // Column 0 is at the LEFT in LTR and at the RIGHT in RTL.
    const l1 = ltr.handle.widget('w1')!.rect!;
    const r1 = rtl.handle.widget('w1')!.rect!;
    expect(r1.width).toBeCloseTo(l1.width, 5);
    expect(r1.y).toBeCloseTo(l1.y, 5);
    expect(r1.x).toBeGreaterThan(l1.x);
    // The mirror identity, on the frame the board actually has.
    const f = rtl.handle.metrics()!.frame;
    expect(f.x + f.width - (r1.x + r1.width)).toBeCloseTo(l1.x - f.x, 4);
  });

  it('the LAST column renders at the LEFT edge in RTL', () => {
    const { ltr, rtl } = both();
    const l3 = ltr.handle.widget('w3')!.rect!; // x=6, the right half in LTR
    const r3 = rtl.handle.widget('w3')!.rect!;
    expect(r3.x).toBeLessThan(l3.x);
    const f = rtl.handle.metrics()!.frame;
    expect(r3.x - f.x).toBeCloseTo(ltr.handle.metrics()!.frame.width - (l3.x + l3.width), 4);
  });

  it('a layout SAVED in one direction re-renders mirrored in the other, same cells', () => {
    const { ltr } = both();
    const saved = ltr.handle.toJSON();
    const mirrored = mount(dashboard({ ...saved, width: 1200, height: 400, rtl: true }));
    for (const id of ['w1', 'w2', 'w3']) {
      expect(mirrored.handle.widget(id)!.cell).toEqual(ltr.handle.widget(id)!.cell);
    }
    expect(mirrored.handle.widget('w1')!.rect!.x).toBeGreaterThan(
      ltr.handle.widget('w1')!.rect!.x
    );
  });

  it('toggles live without touching a single cell', () => {
    const { ltr } = both();
    const cells = ltr.handle.widgetsOf().map((w) => ({ id: w.id, ...w.cell! }));
    const xBefore = ltr.handle.widget('w1')!.rect!.x;
    ltr.handle.setRtl(true);
    expect(ltr.handle.getRtl()).toBe(true);
    expect(ltr.handle.widgetsOf().map((w) => ({ id: w.id, ...w.cell! }))).toEqual(cells);
    expect(ltr.handle.widget('w1')!.rect!.x).toBeGreaterThan(xBefore);
    ltr.handle.setRtl(false);
    expect(ltr.handle.widget('w1')!.rect!.x).toBeCloseTo(xBefore, 4);
  });

  it('RTL and responsive compose: mirrored AND width-derived at once', () => {
    const { handle } = mount(
      dashboard({
        columns: 12,
        width: 600,
        height: 300,
        rtl: true,
        responsive: { columnWidth: 100 },
        widgets: [
          { id: 'a', span: 3, rows: 1, x: 0, y: 0 },
          { id: 'b', span: 3, rows: 1, x: 3, y: 0 },
        ],
      })
    );
    expect(handle.getColumns()).toBe(6);
    expect(handle.getRtl()).toBe(true);
    const f = handle.metrics()!.frame;
    const a = handle.widget('a')!.rect!;
    // x=0 still hugs the RIGHT edge, whatever the column count became.
    expect(f.x + f.width - (a.x + a.width)).toBeCloseTo(handle.metrics()!.padding, 4);
  });
});

describe('dashboard() — exporting a TABBED board', () => {
  // THE BUG THIS PINS. Tabs are a kit feature: `showView()` parks the inactive
  // views at OFFSCREEN_X (-20000) so only one is on camera. That is invisible
  // on screen and catastrophic on export — `api.export()` frames the whole
  // MODEL, so a two-view board writes a ~21000px document that is 95% empty,
  // and the developer gets no signal that anything is wrong.
  //
  // The export layer already scopes correctly via `includeIds`; what was
  // missing is any way for the caller to KNOW which ids the visible board is.
  // Reaching for handle.toJSON() and mapping widget ids looks right and is
  // wrong — it misses the group, so the frame goes and the widgets export
  // unparented.
  it('exportIds() names exactly the visible view — group included', () => {
    const { handle } = mount(SIMPLE());
    const ids = handle!.exportIds();

    // The group is the frame the widgets live in. Omitting it is the mistake a
    // caller rolling their own set would make, so it is asserted first.
    expect(ids.has('overview')).toBe(true);
    for (const w of ['a', 'b', 'c']) expect(ids.has(w)).toBe(true);

    // And NOTHING from the parked view — this is the half that shrinks the
    // document. A set that simply returned every id would pass the asserts
    // above and fail here.
    expect(ids.has('sales')).toBe(false);
    expect(ids.has('d')).toBe(false);
    expect(ids.size).toBe(4);
  });

  it('follows the active view, so exporting after a tab switch is correct', () => {
    const { handle } = mount(SIMPLE());
    handle!.showView('sales');
    const ids = handle!.exportIds();
    expect([...ids].sort()).toEqual(['d', 'sales']);
  });

  it('takes an explicit view id — exporting a tab you are not looking at', () => {
    const { handle } = mount(SIMPLE());
    expect([...handle!.exportIds('sales')].sort()).toEqual(['d', 'sales']);
    expect(handle!.activeView).toBe('overview'); // asking must not switch tabs
  });

  it('returns an empty set for a view that does not exist', () => {
    const { handle } = mount(SIMPLE());
    expect(handle!.exportIds('nope').size).toBe(0);
  });
});

describe('handle.toJSON() — the round-trip promise, kept', () => {
  // THE BUG. Three places in this repo claim "toJSON() output IS dashboard()
  // input". It was true only of `views`. `DashboardOptions` also carries
  // columns/gap/sizing/rowHeight/width/height/float/rtl/responsive, and every
  // one of them was dropped — so a board authored in `grow` at a 10-column,
  // 6px-gap geometry came back as a 12-column, default-gap `fit` board. It
  // surfaced the moment anyone PERSISTED a board rather than just reading the
  // layout, which is exactly what a save feature does.
  //
  // `toJSON()` is also what `JSON.stringify(handle)` calls. A save API whose
  // stringify silently drops half the configuration is a permanent footgun, so
  // this is fixed at the source rather than by adding a second method beside it.
  const board = () =>
    dashboard({
      columns: 10,
      gap: 6,
      sizing: 'grow',
      rowHeight: 90,
      float: true,
      width: 1111,
      height: 555,
      responsive: { columnWidth: 100 },
      views: [{ id: 'v', name: 'V', widgets: [{ id: 'a', kind: 'kpi', span: 2, rows: 1 }] }],
    });

  it('carries the board options, not just the views', () => {
    const { handle } = mount(board());
    const saved = handle!.toJSON();

    expect(saved.gap).toBe(6);
    expect(saved.sizing).toBe('grow');
    expect(saved.rowHeight).toBe(90);
    expect(saved.float).toBe(true);
    // Asserted per-key rather than with one toEqual: a single object compare
    // would let a future field go missing without a word.
    expect(saved.views.map((v) => v.id)).toEqual(['v']);
  });

  it('carries the options it does NOT name explicitly', () => {
    // WEAK TOOTH, caught by mutation. The test above passes with the `...options`
    // spread DELETED, because gap/sizing/rowHeight/float are all re-stated by
    // name afterwards. Only width, height and responsive arrive purely through
    // the spread — so they are what actually proves it is there, and they are
    // what proves the Omit<> type's promise that a NEW DashboardOptions field
    // joins the snapshot for free instead of being silently dropped.
    const { handle } = mount(board());
    const saved = handle!.toJSON();

    expect(saved.width).toBe(1111);
    expect(saved.height).toBe(555);
    expect(saved.responsive).toEqual({ columnWidth: 100 });
  });

  it('reports the LIVE geometry, not the authored literal', () => {
    // The whole point is restoring what the user is looking at. Reading the
    // options back off the spec would pass the test above and still lose every
    // change the user made after mount.
    const { handle } = mount(board());
    handle!.setSizing('fit');
    handle!.setFloat(false);

    const saved = handle!.toJSON();
    expect(saved.sizing).toBe('fit');
    expect(saved.float).toBe(false);
  });

  it('feeds straight back into dashboard() — the documented claim', () => {
    const { handle } = mount(board());
    handle!.setSizing('fit');

    const rebuilt = mount(dashboard(handle!.toJSON()));
    const again = rebuilt.handle!.toJSON();

    expect(again.sizing).toBe('fit');
    expect(again.gap).toBe(6);
    expect(again.rowHeight).toBe(90);
    expect(again.views[0].widgets.map((w) => w.id)).toEqual(['a']);
  });
});

// ---------------------------------------------------------------------------
// STATE LEAKS — the authored spec, the engine cells and the model each hold a
// piece of the layout, and these are the places one copy moved while another
// did not. Every one was reproduced in a browser on the shipped builder demo
// before it was written down here (review of 2026-09-06, D2/D3/D5/D9).
// ---------------------------------------------------------------------------
describe('state leaks between the spec, the engine and the model', () => {
  it('D2: undo after remove() brings the widget back PAINTED and listed', async () => {
    const spec = SIMPLE();
    const { model, api, handle } = mount(spec);
    handle.widget('b')!.remove();
    await settle();
    expect(model.getNode('b')).toBeUndefined();

    await api.getEngine().commandManager.undo();
    // The node is back in the model AND the kit knows it again…
    expect(model.getNode('b')).toBeDefined();
    expect(handle.widget('b')).toBeDefined();
    expect(handle.widgetsOf().map((w) => w.id)).toEqual(['a', 'b', 'c']);
    // …so the painter, asked to paint it, actually paints (it used to return
    // early for an id the spec no longer knew — a blank host after undo).
    const host = document.createElement('div');
    spec.renderCustomNode({ id: 'b' }, host);
    expect(host.children.length).toBeGreaterThan(0);
    // And redo takes it away again, bookkeeping included.
    await api.getEngine().commandManager.redo();
    expect(model.getNode('b')).toBeUndefined();
    expect(handle.widget('b')).toBeUndefined();
  });

  it('D2b: undo after addWidget() un-lists the widget too', async () => {
    const { model, api, handle } = mount(SIMPLE());
    handle.addWidget({ id: 'z', kind: 'kpi', span: 3 });
    await settle();
    expect(model.getNode('z')).toBeDefined();
    await api.getEngine().commandManager.undo();
    expect(model.getNode('z')).toBeUndefined();
    expect(handle.widget('z')).toBeUndefined();
    expect(handle.widgetsOf().map((w) => w.id)).toEqual(['a', 'b', 'c']);
  });

  it('D5: pin() reaches toJSON() and is one undoable step', async () => {
    const { api, handle } = mount(SIMPLE());
    const a = handle.widget('a')!;
    expect(a.pinned).toBe(false);
    a.pin(true);
    expect(a.pinned).toBe(true);
    const saved = handle.toJSON().views[0].widgets.find((w) => w.id === 'a')!;
    expect(saved.pinned).toBe(true);
    await settle();
    await api.getEngine().commandManager.undo();
    expect(a.pinned).toBe(false);
    expect(handle.toJSON().views[0].widgets.find((w) => w.id === 'a')!.pinned).toBeFalsy();
  });

  it('D3: onLayoutChange fires for EVERY layout mutation, not only pointer gestures', async () => {
    const calls: string[] = [];
    const spec = dashboard({
      widgets: [
        { id: 'a', kind: 'kpi', span: 3 },
        { id: 'b', kind: 'kpi', span: 3 },
      ],
      onLayoutChange: (viewId) => calls.push(viewId),
    });
    const { api, handle } = mount(spec);
    const cm = api.getEngine().commandManager;
    const n = () => calls.length;
    expect(n()).toBe(0);

    await handle.widget('a')!.moveTo(6, 0);
    const afterMove = n();
    expect(afterMove).toBeGreaterThan(0);

    handle.addWidget({ id: 'z', kind: 'kpi', span: 3 });
    await settle();
    expect(n()).toBeGreaterThan(afterMove);
    const afterAdd = n();

    handle.widget('z')!.remove();
    await settle();
    expect(n()).toBeGreaterThan(afterAdd);
    const afterRemove = n();

    await cm.undo();
    expect(n()).toBeGreaterThan(afterRemove);
    const afterUndo = n();

    await cm.redo();
    expect(n()).toBeGreaterThan(afterUndo);
    const afterRedo = n();

    handle.widget('a')!.pin(true);
    await settle();
    expect(n()).toBeGreaterThan(afterRedo);
    const afterPin = n();

    // A responsive column change is NOT a layout change: toJSON() keeps
    // serialising the widest layout, so there is nothing new to save and the
    // hook stays quiet. (The binder's onColumnsChange is the hook for that.)
    handle.setColumns(6);
    expect(n()).toBe(afterPin);
  });

  it('D3b: after an undo the handle reads the undone cell WITHOUT a manual refresh()', async () => {
    const { api, handle } = mount(SIMPLE());
    const before = handle.widget('a')!.cell;
    await handle.widget('a')!.moveTo(3, 0); // same-size swap with b
    expect(handle.widget('a')!.cell).toMatchObject({ x: 3 });
    await api.getEngine().commandManager.undo();
    await settle();
    expect(handle.widget('a')!.cell).toEqual(before);
  });

  it('D9: dispose() takes the widget nodes it created, not only the boards', () => {
    const { model, handle } = mount(SIMPLE());
    expect(model.getNodes().length).toBe(4);
    handle.dispose();
    expect(model.getGroups().length).toBe(0);
    expect(model.getNodes().length).toBe(0);
  });
});

describe('a rebuild honours the persisted cells verbatim', () => {
  it('refresh() keeps the gap a drop left — gravity must not re-pack on rebuild', async () => {
    // A tile dropped below free space stays where the placeholder promised (the
    // mover is exempt from gravity during its own gesture). sync() rebuilt the
    // engine through add()+settle, which packed that gap away — so every
    // refresh, undo and history event moved a tile the user had just placed.
    const { handle } = mount(SIMPLE());
    expect(await handle.widget('a')!.moveTo(0, 4)).toBe(true);
    expect(handle.widget('a')!.cell).toMatchObject({ x: 0, y: 4 });
    handle.refresh();
    expect(handle.widget('a')!.cell).toMatchObject({ x: 0, y: 4 });
  });
});

// ---------------------------------------------------------------------------
// DIAGRAM OR LAYOUT — `mode` (review D1, decided 2026-09-06: both, fluid by
// default). A fluid board is 100% of its container at zoom 1; a fixed board is
// the authored world the camera frames.
// ---------------------------------------------------------------------------
describe('mode: fluid — the board is laid out at the container\'s own pixels', () => {
  const ROW = () => [{ id: 'a', kind: 'kpi', span: 3 }, { id: 'b', kind: 'kpi', span: 9 }];

  it('defaults to fluid without an authored width, and to fixed with one', () => {
    const fl = mount(dashboard({ widgets: ROW() }), { w: 900, h: 500 });
    expect(fl.handle.toJSON().mode).toBe('fluid');
    expect(fl.handle.metrics()!.frame).toMatchObject({ width: 900, height: 500 });
    expect(fl.handle.metrics()!.fluid).toBe(true);
    // The 9-wide tile really is laid out against 900 px, not 1180.
    expect(fl.handle.widget('b')!.rect!.width).toBeLessThan(900);
    expect(fl.handle.widget('b')!.rect!.x + fl.handle.widget('b')!.rect!.width).toBeLessThanOrEqual(900);

    const fx = mount(dashboard({ width: 1180, widgets: ROW() }), { w: 900, h: 500 });
    expect(fx.handle.toJSON().mode).toBe('fixed');
    expect(fx.handle.metrics()!.frame).toMatchObject({ width: 1180, height: 660 });
    expect(fx.handle.metrics()!.fluid).toBe(false);
  });

  it('an explicit mode wins over the width rule', () => {
    const fl = mount(dashboard({ mode: 'fluid', width: 1180, widgets: ROW() }), { w: 900, h: 500 });
    expect(fl.handle.metrics()!.frame.width).toBe(900);
    const fx = mount(dashboard({ mode: 'fixed', widgets: ROW() }), { w: 900, h: 500 });
    expect(fx.handle.metrics()!.frame.width).toBe(1180);
  });

  it('follows the container when it resizes — re-read on refresh()', () => {
    const { api, handle } = mount(dashboard({ widgets: ROW() }), { w: 900, h: 500 });
    sizeElement(api.container, 600, 400);
    handle.refresh();
    expect(handle.metrics()!.frame).toMatchObject({ width: 600, height: 400 });
    expect(handle.widget('b')!.rect!.x + handle.widget('b')!.rect!.width).toBeLessThanOrEqual(600);
  });

  it('a container that cannot be measured keeps the authored frame', () => {
    const { handle } = mount(dashboard({ widgets: ROW() }));
    expect(handle.metrics()!.frame).toMatchObject({ width: 1180, height: 660 });
  });

  it('pins the camera at zoom 1 on the board origin — never a fit', () => {
    const fl = mount(dashboard({ widgets: ROW() }), { w: 900, h: 500 });
    expect(fl.api.camera.fits).toBe(0);
    expect(fl.api.camera.zooms).toContain(1);
    expect(fl.api.camera.rect).toMatchObject({ x: 0, y: 0 });
    fl.handle.fit();
    expect(fl.api.camera.fits).toBe(0);

    const fx = mount(dashboard({ width: 1180, widgets: ROW() }), { w: 900, h: 500 });
    expect(fx.api.camera.fits).toBeGreaterThan(0);
  });

  it('asks render() to lock the zoom range, and a fixed board does not', () => {
    expect(dashboard({ widgets: ROW() }).renderOptions).toEqual({ minZoom: 1, maxZoom: 1 });
    expect(dashboard({ width: 1180, widgets: ROW() }).renderOptions).toBeUndefined();
  });

  it('toJSON() → dashboard() keeps the mode', () => {
    const fl = mount(dashboard({ widgets: ROW() }), { w: 900, h: 500 });
    const saved = fl.handle.toJSON();
    expect(saved.mode).toBe('fluid');
    const again = mount(dashboard(saved), { w: 700, h: 400 });
    expect(again.handle.toJSON().mode).toBe('fluid');
    expect(again.handle.metrics()!.frame.width).toBe(700);
  });
});

// ---------------------------------------------------------------------------
// FIT MEANS BOUNDED (review D6, decided 2026-09-06). A fit board never changes
// size; widgets do. The 28-px row floor is a CAPACITY, and past it the board
// refuses — visibly, at design time — instead of painting tiles past its edge.
// ---------------------------------------------------------------------------
describe('fit means bounded', () => {
  // 200 px tall, gap 8, row floor 28 → floor((200 - 16 + 8) / 36) = 5 rows.
  const rowsOf = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: 'r' + i, kind: 'kpi', span: 12, rows: 1 }));
  const board = (extra: Partial<Parameters<typeof dashboard>[0]> = {}, n = 5) =>
    dashboard({ width: 1180, height: 200, sizing: 'fit', widgets: rowsOf(n), ...extra });

  it('reports the capacity its height allows, and every widget that fits is there', () => {
    const { handle } = mount(board());
    expect(handle.metrics()!.capacity).toBe(5);
    expect(handle.widgetsOf().every((w) => w.cell !== undefined)).toBe(true);
    expect(handle.metrics()!.rows).toBe(5);
  });

  it('refuses the widget that would need one row too many — nothing is created', () => {
    const { model, handle } = mount(board());
    expect(handle.addWidget({ id: 'r5', kind: 'kpi', span: 12, rows: 1 })).toBeUndefined();
    expect(model.getNode('r5')).toBeUndefined();
    expect(handle.widgetsOf().map((w) => w.id)).not.toContain('r5');
    // …while one that fits in a free hole still lands.
    const { handle: h2 } = mount(board({}, 4));
    expect(h2.addWidget({ id: 'r4', kind: 'kpi', span: 6, rows: 1 })).toBeDefined();
  });

  it('refuses a resize past the capacity, and the board stays inside its frame', async () => {
    const { handle } = mount(board());
    expect(await handle.widget('r4')!.resize(12, 2)).toBe(false);
    expect(handle.widget('r4')!.cell).toMatchObject({ h: 1 });
    const frame = handle.metrics()!.frame;
    for (const w of handle.widgetsOf()) {
      expect(w.rect!.y + w.rect!.height).toBeLessThanOrEqual(frame.y + frame.height + 0.5);
    }
  });

  it('overflow: "scroll" lifts the bound and EXTENDS the frame so nothing paints past it', () => {
    const { handle } = mount(board({ overflow: 'scroll' }));
    expect(handle.metrics()!.capacity).toBeUndefined();
    expect(handle.addWidget({ id: 'r5', kind: 'kpi', span: 12, rows: 1 })).toBeDefined();
    const m = handle.metrics()!;
    expect(m.rows).toBe(6);
    // 6 rows at the 28-px floor: 2·8 + 6·28 + 5·8 = 224 > the 200 design height.
    expect(m.frame.height).toBe(224);
    for (const w of handle.widgetsOf()) {
      expect(w.rect!.y + w.rect!.height).toBeLessThanOrEqual(m.frame.y + m.frame.height + 0.5);
    }
  });

  it('a board holding MORE than its capacity keeps every tile and only refuses growth', () => {
    const { handle } = mount(board({}, 7));
    expect(handle.widgetsOf().every((w) => w.cell !== undefined)).toBe(true);
    expect(handle.metrics()!.capacity).toBe(7); // floored at the content
    expect(handle.metrics()!.frame.height).toBeGreaterThan(200); // extended, not overflowing
    expect(handle.addWidget({ id: 'r7', kind: 'kpi', span: 12, rows: 1 })).toBeUndefined();
  });

  it('grow mode is never bounded', () => {
    const { handle } = mount(board({ sizing: 'grow' }, 7));
    expect(handle.metrics()!.capacity).toBeUndefined();
    expect(handle.addWidget({ id: 'r7', kind: 'kpi', span: 12, rows: 1 })).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// PER-WIDGET CONSTRAINTS AND THE STATIC BOARD (plan step 4).
// ---------------------------------------------------------------------------
describe('per-widget limits, pointer flags and the static board', () => {
  it('limits reach the engine: a resize clamps to minSpan/maxSpan/minRows/maxRows', async () => {
    const { handle } = mount(
      dashboard({ widgets: [{ id: 'a', kind: 'kpi', span: 6, rows: 2, limits: { minSpan: 3, maxSpan: 8, minRows: 1, maxRows: 3 } }] })
    );
    expect(await handle.widget('a')!.resize(1, 1)).toBe(true);
    expect(handle.widget('a')!.cell).toMatchObject({ w: 3, h: 1 });
    expect(await handle.widget('a')!.resize(12, 9)).toBe(true);
    expect(handle.widget('a')!.cell).toMatchObject({ w: 8, h: 3 });
  });

  it('limits clamp the AUTHORED size too, and a column change honours them', () => {
    const { handle } = mount(
      dashboard({ widgets: [{ id: 'a', kind: 'kpi', span: 12, limits: { maxSpan: 6, minSpan: 4 } }] })
    );
    expect(handle.widget('a')!.cell).toMatchObject({ w: 6 });
    handle.setColumns(6); // 6 → 3 by ratio, but never under minSpan 4
    expect(handle.widget('a')!.cell!.w).toBe(4);
  });

  it('limits, movable and resizable reach the node on BOTH paths and round-trip through toJSON()', () => {
    const { model, handle } = mount(
      dashboard({ widgets: [{ id: 'a', kind: 'kpi', span: 3, limits: { maxSpan: 6 }, movable: false, resizable: false }] })
    );
    expect(model.getNode('a')!.getMetadata('widgetLimits')).toEqual({ maxSpan: 6 });
    expect(model.getNode('a')!.getMetadata('widgetMovable')).toBe(false);
    expect(model.getNode('a')!.getMetadata('widgetResizable')).toBe(false);
    handle.addWidget({ id: 'b', kind: 'kpi', span: 3, limits: { minRows: 2 }, movable: false });
    expect(model.getNode('b')!.getMetadata('widgetLimits')).toEqual({ minRows: 2 });
    expect(model.getNode('b')!.getMetadata('widgetMovable')).toBe(false);
    expect(model.getNode('b')!.getMetadata('widgetResizable')).toBeUndefined();
    const saved = handle.toJSON().views[0].widgets;
    expect(saved.find((w) => w.id === 'a')).toMatchObject({ limits: { maxSpan: 6 }, movable: false, resizable: false });
    expect(saved.find((w) => w.id === 'b')).toMatchObject({ limits: { minRows: 2 }, movable: false });
  });

  it('a static board reports so, round-trips, toggles live, and the API still edits it', async () => {
    const { handle } = mount(dashboard({ static: true, widgets: [{ id: 'a', kind: 'kpi', span: 3 }, { id: 'b', kind: 'kpi', span: 3 }] }));
    expect(handle.getStatic()).toBe(true);
    expect(handle.metrics()!.static).toBe(true);
    expect(handle.toJSON().static).toBe(true);
    // gridstack's staticGrid: the POINTER is off, the API is not.
    expect(await handle.widget('a')!.moveTo(3, 0)).toBe(true);
    expect(handle.widget('a')!.cell).toMatchObject({ x: 3 });
    handle.setStatic(false);
    expect(handle.getStatic()).toBe(false);
    expect(handle.toJSON().static).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ACCESSIBILITY (plan step 5, decided 2026-09-06: full — WCAG 2.1 AA). The
// harness mounts no renderer, so the hosts the renderer would create are
// made here by hand, exactly as the renderer names them.
// ---------------------------------------------------------------------------
describe('accessibility — name, role, keyboard, announcements', () => {
  function hostsFor(api: ReturnType<typeof makeApi>, ids: string[]): Map<string, HTMLElement> {
    const layer = api.container.querySelector('.grafloria-html-layer')!;
    const out = new Map<string, HTMLElement>();
    for (const id of ids) {
      const h = document.createElement('div');
      h.className = 'grafloria-node-host';
      h.setAttribute('data-node-id', id);
      layer.appendChild(h);
      out.set(id, h);
    }
    return out;
  }
  const liveText = (api: ReturnType<typeof makeApi>) =>
    Array.from(api.container.querySelectorAll('[aria-live]')).map((el) => el.textContent).join(' ');
  const key = (el: HTMLElement, k: string, shift = false) =>
    el.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey: shift, bubbles: true, cancelable: true }));

  const BOARD = () =>
    dashboard({
      width: 1180,
      widgets: [
        { id: 'a', kind: 'kpi', span: 3, title: 'Revenue' },
        { id: 'b', kind: 'kpi', span: 3, title: 'Customers' },
        { id: 'c', kind: 'line', span: 6, rows: 2 },
      ],
    });

  it('every widget host gets a role, a description, a label with its cell, and ONE tab stop per board', () => {
    const { api, handle } = mount(BOARD());
    const hosts = hostsFor(api, ['a', 'b', 'c']);
    handle.refresh();
    expect(hosts.get('a')!.getAttribute('role')).toBe('group');
    expect(hosts.get('a')!.getAttribute('aria-roledescription')).toBe('dashboard widget');
    expect(hosts.get('a')!.getAttribute('aria-label')).toBe('Revenue, column 1, row 1, 3 by 1');
    expect(hosts.get('c')!.getAttribute('aria-label')).toBe('line widget, column 7, row 1, 6 by 2');
    expect([...hosts.values()].map((h) => h.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
  });

  it('a pinned widget says so, and the roving tab stop follows focus', () => {
    const { api, handle } = mount(BOARD());
    const hosts = hostsFor(api, ['a', 'b', 'c']);
    handle.widget('b')!.pin(true);
    expect(hosts.get('b')!.getAttribute('aria-label')).toContain('pinned');
    expect(handle.binderOf()!.focusWidget('c')).toBe(true);
    expect([...hosts.values()].map((h) => h.getAttribute('tabindex'))).toEqual(['-1', '-1', '0']);
    expect(handle.binderOf()!.getFocusedWidget()).toBe('c');
  });

  it('arrows move the focused widget one cell — one undoable step, announced', async () => {
    const { api, handle } = mount(BOARD());
    const hosts = hostsFor(api, ['a', 'b', 'c']);
    handle.refresh();
    key(hosts.get('a')!, 'ArrowRight'); // onto b: a same-size swap
    await settle();
    await settle();
    expect(handle.widget('a')!.cell).toMatchObject({ x: 3, y: 0 });
    expect(handle.widget('b')!.cell).toMatchObject({ x: 0, y: 0 });
    expect(liveText(api)).toContain('Revenue moved to column 4, row 1, 3 by 1');
    expect(liveText(api)).toContain('Customers moved to column 1, row 1');
    await api.getEngine().commandManager.undo();
    await settle();
    expect(handle.widget('a')!.cell).toMatchObject({ x: 0, y: 0 });
  });

  it('Shift+arrows resize it, a refusal is announced, and a static board only reads', async () => {
    const { api, handle } = mount(BOARD());
    const hosts = hostsFor(api, ['a', 'b', 'c']);
    handle.refresh();
    key(hosts.get('c')!, 'ArrowDown', true);
    await settle();
    await settle();
    expect(handle.widget('c')!.cell).toMatchObject({ h: 3 });
    expect(liveText(api)).toContain('line widget resized to column 7, row 1, 6 by 3');
    key(hosts.get('a')!, 'ArrowLeft'); // column 0 already: nowhere to go
    await settle();
    await settle();
    expect(handle.widget('a')!.cell).toMatchObject({ x: 0 });
    expect(liveText(api)).toContain('Cannot move Revenue left');
    handle.setStatic(true);
    key(hosts.get('a')!, 'ArrowRight');
    await settle();
    await settle();
    expect(handle.widget('a')!.cell).toMatchObject({ x: 0 });
    // Still reachable, just not editable: the roving stop is where focus last
    // rested (the resize focused c), and the board keeps exactly one.
    expect([...hosts.values()].map((h) => h.getAttribute('tabindex')).filter((t) => t === '0')).toHaveLength(1);
    expect(hosts.get('c')!.getAttribute('tabindex')).toBe('0');
  });

  it('a fixed widget refuses the keyboard the way it refuses the pointer', async () => {
    const { api, handle } = mount(
      dashboard({ width: 1180, widgets: [{ id: 'a', kind: 'kpi', span: 3, title: 'Fixed', movable: false }] })
    );
    const hosts = hostsFor(api, ['a']);
    handle.refresh();
    key(hosts.get('a')!, 'ArrowRight');
    await settle();
    expect(handle.widget('a')!.cell).toMatchObject({ x: 0 });
    expect(liveText(api)).toContain('Fixed cannot be moved');
  });

  it('an arrow on the diagram root hands focus to the board\'s tab stop', () => {
    const { api, handle } = mount(BOARD());
    const hosts = hostsFor(api, ['a', 'b', 'c']);
    handle.refresh();
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'grafloria-diagram');
    api.container.appendChild(svg);
    svg.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    expect(handle.binderOf()!.getFocusedWidget()).toBe('a');
    expect(hosts.get('a')!.getAttribute('tabindex')).toBe('0');
  });

  it('the stylesheet carries the focus ring, the reduced-motion rule and the sr-only table class', () => {
    ensureDashboardKitStyles(document);
    const css = document.getElementById(DASHBOARD_KIT_STYLE_ID)!.textContent ?? '';
    expect(css).toContain('.grafloria-node-host:focus-visible');
    expect(css).toContain('prefers-reduced-motion: reduce');
    expect(css).toContain('.axdb-sr');
  });
});

describe('host observer (plan step 6, D10)', () => {
  it('re-syncs only the hosts a host-level mutation names, and ignores a chart\'s internal churn', async () => {
    const { api, handle } = mount(dashboard({ width: 1180, widgets: [{ id: 'a', kind: 'kpi', span: 3 }, { id: 'b', kind: 'kpi', span: 3 }] }));
    const layer = api.container.querySelector('.grafloria-html-layer')!;
    const mk = (id: string) => {
      const h = document.createElement('div');
      h.className = 'grafloria-node-host';
      h.setAttribute('data-node-id', id);
      layer.appendChild(h);
      return h;
    };
    const a = mk('a');
    const b = mk('b');
    handle.refresh();
    let calls = 0;
    const orig = api.container.querySelector.bind(api.container);
    (api.container as { querySelector: typeof orig }).querySelector = ((sel: string) => {
      calls++;
      return orig(sel);
    }) as typeof orig;
    // Deep churn inside a widget: nothing to re-sync.
    const inner = document.createElement('div');
    a.appendChild(inner);
    await new Promise((r) => setTimeout(r, 0));
    calls = 0;
    for (let i = 0; i < 20; i++) inner.appendChild(document.createElement('i'));
    await new Promise((r) => setTimeout(r, 0));
    expect(calls).toBe(0);
    // A repaint wipes a's handle: exactly a is looked up again, not b.
    a.querySelector('.axdb-rs')?.remove();
    await new Promise((r) => setTimeout(r, 0));
    expect(calls).toBeGreaterThan(0);
    expect(calls).toBeLessThanOrEqual(2);
    expect(a.querySelector('.axdb-rs')).toBeTruthy();
    expect(b.querySelector('.axdb-rs')).toBeTruthy();
  });
});
