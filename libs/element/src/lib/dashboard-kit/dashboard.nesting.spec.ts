/**
 * CONTAINMENT in the data-first `dashboard()` API — a widget that holds other
 * widgets. The contract under test, in the consumer's own acceptance terms:
 * a container renders as a member group with a nested grid; the tree
 * round-trips through toJSON() → dashboard() → toJSON(); membership — not the
 * authored arrays — is what toJSON() reports; and reload rebuilds the nesting.
 */
import { DiagramModel, NodeModel, CommandManager, EventBus } from '@grafloria/engine';
import { DiagramSerializer } from '@grafloria/engine';
import { dashboard, type DashboardSpec, type DashboardWidgetSpec } from './dashboard';
import { fromDocument } from '../load';

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
    getEngine: () => ({ commandManager: manager, eventBus: bus }),
    container,
    render: () => undefined,
    renderNow: () => undefined,
    viewport: { fitToBounds: () => undefined, clientToWorld: () => ({ x: 0, y: 0 }) },
  };
}

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

const NESTED = () =>
  dashboard({
    columns: 12,
    views: [
      {
        id: 'main',
        widgets: [
          { id: 'free', kind: 'kpi', span: 3, rows: 1 },
          {
            id: 'section',
            title: 'KPI section',
            span: 9,
            rows: 2,
            columns: 3,
            widgets: [
              { id: 'k1', kind: 'kpi', span: 1, rows: 1 },
              { id: 'k2', kind: 'kpi', span: 1, rows: 1 },
              { id: 'k3', kind: 'kpi', span: 1, rows: 1 },
            ],
          },
        ],
      },
    ],
  });

describe('dashboard() containment', () => {
  it('a container contributes NO node; its children flatten into the render spec', () => {
    const spec = NESTED();
    const ids = spec.nodes.map((n) => (n as { id: string }).id);
    expect(ids).toEqual(['free', 'k1', 'k2', 'k3']);
  });

  it('mounts the container as a member group with its own bound grid', () => {
    const { model, handle } = mount(NESTED());
    const view = model.getGroup('main')!;
    const section = model.getGroup('section')!;
    expect(section).toBeDefined();
    expect(view.members?.has('section')).toBe(true);
    expect(view.members?.has('free')).toBe(true);
    // children belong to the SECTION, not the view
    expect(section.members?.has('k1')).toBe(true);
    expect(view.members?.has('k1')).toBe(false);
    // the section is a board: its own binder answers for its children
    expect(handle.binderOf('section')).toBeDefined();
    expect(handle.binderOf('section')!.cellOf('k1')).toBeDefined();
    // and it is a slab item in the PARENT's engine
    expect(handle.binderOf('main')!.cellOf('section')).toBeDefined();
    // frameless + reload-ready
    expect(section.getMetadata('frameChrome')).toBe('none');
    expect(section.getMetadata('dashboardBoard')).toBeDefined();
  });

  it('children lay out INSIDE the container frame; parking a view takes the container along', () => {
    const { model, handle } = mount(NESTED());
    handle.refresh();
    const section = model.getGroup('section')!;
    const k1 = model.getNode('k1')!;
    const inX = k1.position.x >= section.position.x - 1 && k1.position.x < section.position.x + (section.size?.width ?? 0);
    const inY = k1.position.y >= section.position.y - 1 && k1.position.y < section.position.y + (section.size?.height ?? 0);
    expect(inX && inY).toBe(true);
  });

  it('toJSON() reports the nested tree, and it is stable through a rebuild', () => {
    const { handle } = mount(NESTED());
    const snap = handle.toJSON();
    const main = snap.views.find((v) => v.id === 'main')!;
    const section = main.widgets.find((w) => w.id === 'section')!;
    expect(section.widgets?.map((w) => w.id).sort()).toEqual(['k1', 'k2', 'k3']);
    expect(main.widgets.find((w) => w.id === 'free')?.widgets).toBeUndefined();

    // round-trip: dashboard(toJSON()) → toJSON() keeps the tree
    const rebuilt = dashboard({ ...snap });
    const { handle: h2 } = mount(rebuilt);
    const snap2 = h2.toJSON();
    const section2 = snap2.views.find((v) => v.id === 'main')!.widgets.find((w) => w.id === 'section')!;
    expect(section2.widgets?.map((w) => w.id).sort()).toEqual(['k1', 'k2', 'k3']);
  });

  it('toJSON() derives from MEMBERSHIP: a reparented tile reports under its new board', () => {
    const { model, handle } = mount(NESTED());
    // move `free` into the section the way a committed cross-board drag does
    model.getGroup('main')!.removeMember?.('free');
    model.getGroup('section')!.addMember('free');
    handle.refresh();
    const main = handle.toJSON().views.find((v) => v.id === 'main')!;
    const section = main.widgets.find((w) => w.id === 'section')!;
    expect(section.widgets?.some((w) => w.id === 'free')).toBe(true);
    expect(main.widgets.some((w) => w.id === 'free' && !w.widgets)).toBe(false);
  });

  it('two levels of nesting mount and round-trip', () => {
    const spec = dashboard({
      columns: 12,
      views: [
        {
          id: 'v',
          widgets: [
            {
              id: 'outer',
              span: 12,
              rows: 4,
              columns: 2,
              widgets: [
                { id: 'w1', span: 1, rows: 1 },
                { id: 'inner', span: 1, rows: 2, columns: 2, widgets: [{ id: 'w2', span: 1, rows: 1 }] },
              ],
            },
          ],
        },
      ],
    });
    const { model, handle } = mount(spec);
    expect(model.getGroup('outer')!.members?.has('inner')).toBe(true);
    expect(model.getGroup('inner')!.members?.has('w2')).toBe(true);
    const snap = handle.toJSON();
    const outer = snap.views[0].widgets.find((w) => w.id === 'outer')!;
    const inner = outer.widgets!.find((w) => w.id === 'inner')!;
    expect(inner.widgets?.map((w) => w.id)).toEqual(['w2']);
  });

  it('exportIds includes the container and its whole subtree', () => {
    const { handle } = mount(NESTED());
    const ids = handle.exportIds('main');
    for (const id of ['main', 'free', 'section', 'k1', 'k2', 'k3']) expect(ids.has(id)).toBe(true);
  });

  it('addWidget accepts a container id as the target board — when it has room', () => {
    // NESTED's section is 3 columns × 1 row and FULL. Adding a fourth KPI used
    // to "succeed": the node became a member with no engine item, invisible,
    // and this test read the membership and called it a pass. A bounded board
    // now refuses up front, and nothing is created.
    const full = mount(NESTED());
    expect(full.handle.addWidget({ id: 'k4', kind: 'kpi', span: 1, rows: 1 }, 'section')).toBeUndefined();
    expect(full.model.getNode('k4')).toBeUndefined();
    expect(full.model.getGroup('section')!.members?.has('k4')).toBe(false);

    // The same section with a free column takes it, membership and all.
    const roomy = dashboard({
      columns: 12,
      views: [
        {
          id: 'main',
          widgets: [
            {
              id: 'section',
              span: 12,
              rows: 1,
              columns: 4,
              widgets: [
                { id: 'k1', kind: 'kpi', span: 1, rows: 1 },
                { id: 'k2', kind: 'kpi', span: 1, rows: 1 },
                { id: 'k3', kind: 'kpi', span: 1, rows: 1 },
              ],
            },
          ],
        },
      ],
    });
    const { model, handle } = mount(roomy);
    const w = handle.addWidget({ id: 'k4', kind: 'kpi', span: 1, rows: 1 }, 'section');
    expect(w).toBeDefined();
    expect(w!.cell).toEqual({ x: 3, y: 0, w: 1, h: 1 });
    expect(model.getGroup('section')!.members?.has('k4')).toBe(true);
    const snap = handle.toJSON();
    const section = snap.views[0].widgets.find((x) => x.id === 'section')!;
    expect(section.widgets?.some((x) => x.id === 'k4')).toBe(true);
  });

  it('a serialized document reloads with its nesting intact (fromDocument)', () => {
    const { model } = mount(NESTED());
    const json = JSON.stringify(new DiagramSerializer().serialize(model));
    const loaded = fromDocument(json);
    const api = makeApi(loaded.model as DiagramModel);
    loaded.finalize(api);
    const snap = loaded.handle!.toJSON();
    const main = snap.views.find((v) => v.id === 'main')!;
    const section = main.widgets.find((w) => w.id === 'section')!;
    expect(section.widgets?.map((w: DashboardWidgetSpec) => w.id).sort()).toEqual(['k1', 'k2', 'k3']);
    // the container did NOT come back as a view
    expect(snap.views.some((v) => v.id === 'section')).toBe(false);
  });

  it('a split, fit container reloads as a split, fit container (item 7 through fromDocument)', () => {
    const spec = NESTED();
    const { model, handle } = mount(spec);
    handle.setLayout('split', 'section');
    expect(handle.getLayout('section')).toBe('split');
    const json = JSON.stringify(new DiagramSerializer().serialize(model));
    const loaded = fromDocument(json);
    const api = makeApi(loaded.model as DiagramModel);
    loaded.finalize(api);
    const h = loaded.handle!;
    expect(h.getLayout('section')).toBe('split');
    expect(h.getLayout('main')).toBe('grid');
    const b = h.binderOf('section') as { getSplitTree?: () => unknown } | undefined;
    expect(typeof b?.getSplitTree).toBe('function');
    const section = h.toJSON().views[0].widgets.find((w) => w.id === 'section')!;
    expect(section.layout).toBe('split');
    expect(section.tree).toBeTruthy();
    expect(section.widgets?.map((w: DashboardWidgetSpec) => w.id).sort()).toEqual(['k1', 'k2', 'k3']);
    // …and the switch works on the loaded document too
    h.setLayout('grid', 'section');
    expect(h.getLayout('section')).toBe('grid');
    expect((h.binderOf('section') as { getSplitTree?: unknown } | undefined)?.getSplitTree).toBeUndefined();
  });
});

describe('one selection per canvas', () => {
  it('selecting on the board clears the section, and the other way round', () => {
    const { handle, api } = mount(NESTED());
    const main = handle.binderOf('main')!;
    const section = handle.binderOf('section')!;
    expect(section.selectWidget('k1')).toBe(true);
    expect(section.getSelectedWidget()).toBe('k1');
    expect(main.selectWidget('free')).toBe(true);
    expect(main.getSelectedWidget()).toBe('free');
    expect(section.getSelectedWidget()).toBeUndefined();
    expect(section.selectWidget('k2')).toBe(true);
    expect(main.getSelectedWidget()).toBeUndefined();
    expect(handle.getSelectedWidget()).toBe('k2');
    expect(api.container.style.getPropertyValue('--axdb-gap')).toMatch(/px$/);
  });
});

describe('a section is a thing to select and resize', () => {
  const settle = () => new Promise<void>((r) => setTimeout(r, 0));
  const PANEL = (onSelect?: (id: string | undefined, viewId: string) => void) =>
    dashboard({
      columns: 12,
      ...(onSelect ? { onSelect } : {}),
      widgets: [
        { id: 'box', span: 3, rows: 14, x: 0, y: 0, columns: 4, widgets: [
          { id: 'c1', kind: 'kpi', span: 3, rows: 1, x: 0, y: 0 },
          { id: 'c2', kind: 'kpi', span: 3, rows: 6, x: 0, y: 1 },
          { id: 'c3', kind: 'kpi', span: 3, rows: 7, x: 0, y: 7 },
        ] },
        { id: 'free', kind: 'line', span: 9, rows: 14, x: 3, y: 0 },
      ],
    });

  it('selectWidget takes a section; the slab overlay wears the ring; onSelect reports it', () => {
    const onSelect = jest.fn();
    const { handle, api } = mount(PANEL(onSelect));
    expect(handle.selectWidget('box')).toBe(true);
    expect(handle.getSelectedWidget()).toBe('box');
    expect(onSelect).toHaveBeenCalledWith('box', 'main');
    const slab = api.container.querySelector('.axdb-slab[data-slab-id="box"]')!;
    expect(slab).toBeTruthy();
    expect(slab.classList.contains('axdb-slab--selected')).toBe(true);
    expect(slab.querySelector('.axdb-rs')).toBeTruthy();
    // a child selection clears the section's ring (one selection per canvas)
    expect(handle.selectWidget('c2')).toBe(true);
    expect(slab.classList.contains('axdb-slab--selected')).toBe(false);
    expect(onSelect).toHaveBeenCalledWith(undefined, 'main');
    expect(onSelect).toHaveBeenLastCalledWith('c2', 'main');
  });

  it('resize() on a section commits its cell and frame as one undoable step, floored at its children', async () => {
    const { handle, api } = mount(PANEL());
    const cm = api.getEngine().commandManager;
    expect(await handle.widget('box')!.resize(3, 16)).toBe(true);
    await settle();
    expect(handle.widget('box')!.cell).toEqual({ x: 0, y: 0, w: 3, h: 16 });
    expect(handle.toJSON().views[0].widgets.find((w) => w.id === 'box')!.rows).toBe(16);
    // below the children's 14 rows: refused, nothing changes
    expect(await handle.widget('box')!.resize(3, 10)).toBe(false);
    await settle();
    expect(handle.widget('box')!.cell.h).toBe(16);
    await cm.undo();
    await settle();
    expect(handle.widget('box')!.cell).toEqual({ x: 0, y: 0, w: 3, h: 14 });
    expect(handle.toJSON().views[0].widgets.find((w) => w.id === 'box')!.rows).toBe(14);
  });
});

describe('removing a container (plan step 6, D12)', () => {
  const settle = () => new Promise<void>((r) => setTimeout(r, 0));

  it('takes the section, its children and its slab away as ONE undoable step — and undo brings the grid back live', async () => {
    const { model, handle, api } = mount(NESTED());
    const cm = api.getEngine().commandManager;
    expect(model.getGroup('section')).toBeDefined();
    handle.widget('section')!.remove();
    await settle();
    expect(model.getGroup('section')).toBeUndefined();
    expect(['k1', 'k2', 'k3'].map((id) => model.getNode(id))).toEqual([undefined, undefined, undefined]);
    expect(model.getGroup('main')!.members?.has('section')).toBe(false);
    expect(handle.widget('section')).toBeUndefined();
    expect(handle.toJSON().views[0].widgets.map((w) => w.id)).toEqual(['free']);
    expect(handle.binderOf('section')).toBeUndefined();

    await cm.undo();
    await settle();
    expect(model.getGroup('section')).toBeDefined();
    expect(['k1', 'k2', 'k3'].every((id) => !!model.getNode(id))).toBe(true);
    expect(model.getGroup('main')!.members?.has('section')).toBe(true);
    expect(handle.widget('section')).toBeDefined();
    expect(handle.binderOf('section')).toBeDefined();
    expect(handle.binderOf('section')!.cellOf('k1')).toBeDefined();
    const section = handle.toJSON().views[0].widgets.find((w) => w.id === 'section')!;
    expect(section.widgets?.map((w) => w.id).sort()).toEqual(['k1', 'k2', 'k3']);
  });
});
