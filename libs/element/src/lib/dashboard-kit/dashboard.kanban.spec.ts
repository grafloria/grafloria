/**
 * KANBAN on the pack grid — columns are one-column sections with gravity, cards
 * are widgets. Two kit features the Kanban lab found missing:
 *
 *   canDrop    — a DROP POLICY: a board may refuse a tile (a WIP limit; cards
 *                only inside columns). Refused = dims, nothing moves there, a
 *                release snaps home, never a removal, no undo step.
 *   autoHeight — CONTENT-DRIVEN HEIGHT: the kit measures a widget and sets its
 *                rows, as layout (no undo step); a full section grows its slab
 *                in the parent and gives the rows back (`fitRows`).
 */
import { CommandManager, DiagramModel, EventBus, NodeModel } from '@grafloria/engine';
import type { CanvasTool, ToolPointerEvent } from '@grafloria/renderer';
import { dashboard, type DashboardHandle, type DashboardOptions, type DashboardSpec, type DashboardWidgetSpec } from './dashboard';
import { splitLeaves, type SplitNode } from './split-layout';
import { SPLIT_TREE_KEY } from './split-binder';
import { createAutoHeight, rowsForHeight } from './auto-height';
import type { DashboardGridHandle } from './grid-binder';

// No renderer routes pointer events here: the binder's tool registration is
// captured and the tool driven directly (as dashboard.tabs.spec.ts does).
jest.mock('@grafloria/renderer', () => {
  const actual = jest.requireActual('@grafloria/renderer');
  return {
    ...actual,
    registerTool: (t: unknown) => {
      const g = globalThis as unknown as { __axdbTools?: unknown[] };
      g.__axdbTools = [...(g.__axdbTools ?? []), t];
      return actual.registerTool(t);
    },
  };
});
const splitToolOf = (groupId: string): CanvasTool => {
  const g = globalThis as unknown as { __axdbTools?: CanvasTool[] };
  const t = [...(g.__axdbTools ?? [])].reverse().find((x) => x.id.startsWith(`dashboard-split:${groupId}:`));
  if (!t) throw new Error(`no split tool registered for ${groupId}`);
  return t;
};
const toolOf = (groupId: string): CanvasTool => {
  const g = globalThis as unknown as { __axdbTools?: CanvasTool[] };
  const t = [...(g.__axdbTools ?? [])].reverse().find((x) => x.id.startsWith(`dashboard-grid:${groupId}:`));
  if (!t) throw new Error(`no binder tool registered for ${groupId}`);
  return t;
};
const tev = (type: ToolPointerEvent['type'], x: number, y: number): ToolPointerEvent => ({
  type,
  world: { x, y },
  screen: { x, y },
  modifiers: { shift: false, ctrl: false, alt: false, meta: false },
});

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
    layer,
    render: () => undefined,
    renderNow: () => undefined,
    viewport: { fitToBounds: () => undefined, clientToWorld: (x: number, y: number) => ({ x, y }) },
  };
}

function mount(spec: DashboardSpec) {
  const model = new DiagramModel('dash');
  for (const n of spec.nodes) {
    const raw = n as { id: string; position: { x: number; y: number }; size: { width: number; height: number }; metadata: Record<string, unknown> };
    const node = new NodeModel({ id: raw.id, type: 'widget', position: { ...raw.position }, size: { ...raw.size, depth: 0 } });
    for (const [k, v] of Object.entries(raw.metadata)) node.setMetadata(k, v);
    model.addNode(node);
  }
  const api = makeApi(model);
  spec.finalize(api);
  mounted.push(spec.handle as DashboardHandle);
  return { model, api, handle: spec.handle as DashboardHandle };
}
const mounted: DashboardHandle[] = [];
afterEach(() => {
  for (const h of mounted.splice(0)) h.dispose();
  document.body.innerHTML = '';
  jest.restoreAllMocks();
});

/**
 * Three columns, gravity on; A holds two cards, B one, C none. Each slab is as
 * many board rows as its inner design, so a column's rows are the board's 8 px
 * (a section's rows are squeezed into its slab — see the autoHeight docs).
 */
const BOARD = (extra: Partial<DashboardOptions> = {}) =>
  dashboard({
    columns: 12,
    gap: 8,
    width: 1200,
    height: 800,
    sizing: 'grow',
    rowHeight: 8,
    float: false,
    widgets: [
      { id: 'A', span: 4, rows: 8, columns: 1, maxRows: 8, pinned: true, widgets: [
        { id: 'a1', kind: 'card', span: 1, rows: 3 },
        { id: 'a2', kind: 'card', span: 1, rows: 3 },
      ] },
      { id: 'B', span: 4, rows: 8, columns: 1, maxRows: 8, pinned: true, widgets: [{ id: 'b1', kind: 'card', span: 1, rows: 3 }] },
      { id: 'C', span: 4, rows: 8, columns: 1, maxRows: 8, pinned: true, widgets: [] },
    ],
    ...extra,
  });

const settle = () => new Promise<void>((r) => setTimeout(r, 0));
const centre = (model: DiagramModel, id: string) => {
  const e = model.getNode(id) ?? model.getGroup(id)!;
  return { x: e.position.x + e.size!.width / 2, y: e.position.y + e.size!.height / 2 };
};
/** A hand drag of widget `id` (owned by board `from`) to `to`, through several moves. */
const drag = async (model: DiagramModel, from: string, id: string, to: { x: number; y: number }) => {
  const tool = toolOf(from);
  const node = model.getNode(id)!;
  const hit = { node, empty: false };
  const a = centre(model, id);
  tool.onPointerDown?.(tev('down', a.x, a.y), hit);
  tool.onPointerMove?.(tev('move', a.x + 20, a.y + 20), hit);
  for (let i = 1; i <= 6; i++) tool.onPointerMove?.(tev('move', a.x + ((to.x - a.x) * i) / 6, a.y + ((to.y - a.y) * i) / 6), hit);
  tool.onPointerMove?.(tev('move', to.x + 1, to.y + 1), hit);
  tool.onPointerUp?.(tev('up', to.x + 1, to.y + 1), hit);
  await settle();
};

describe('canDrop — a board may refuse a tile', () => {
  it('a refused column: the card stays home, on its exact cell, with no undo step', async () => {
    const canDrop = jest.fn(({ to }: { to: string }) => to !== 'B');
    const { model, api, handle } = mount(BOARD({ canDrop }));
    const cell0 = handle.widget('a1')!.cell;
    await drag(model, 'A', 'a1', centre(model, 'b1'));
    expect(model.getGroup('A')!.members.has('a1')).toBe(true);
    expect(model.getGroup('B')!.members.has('a1')).toBe(false);
    expect(handle.widget('a1')!.cell).toEqual(cell0);
    expect(api.getEngine().commandManager.canUndo()).toBe(false);
  });

  it('is asked ONCE per board per drag, never for the board the tile started on, with the view and both boards', async () => {
    const canDrop = jest.fn(() => true);
    const { model } = mount(BOARD({ canDrop }));
    await drag(model, 'A', 'a1', centre(model, 'C'));
    expect(model.getGroup('C')!.members.has('a1')).toBe(true);
    const asked = canDrop.mock.calls.map((c) => (c as unknown as [{ to: string }])[0].to);
    expect(asked).not.toContain('A');
    expect(asked.filter((t) => t === 'C')).toHaveLength(1);
    expect(canDrop).toHaveBeenCalledWith({ widgetId: 'a1', from: 'A', to: 'C', viewId: 'main' });
  });

  it('an allowed column still takes the card as one undoable move', async () => {
    const { model, api } = mount(BOARD({ canDrop: ({ to }) => to !== 'main' }));
    await drag(model, 'A', 'a1', centre(model, 'C'));
    expect(model.getGroup('C')!.members.has('a1')).toBe(true);
    await api.getEngine().commandManager.undo();
    await settle();
    expect(model.getGroup('A')!.members.has('a1')).toBe(true);
  });

  it('a refused BOARD (the view below the columns) is a snap home — never a removal, whatever dragOut says', async () => {
    const onRemoveRequest = jest.fn();
    const { model, handle } = mount(BOARD({ canDrop: ({ to }) => to !== 'main', binder: { dragOut: 'remove', onRemoveRequest } }));
    const a = model.getGroup('A')!;
    const below = { x: a.position.x + a.size!.width / 2, y: a.position.y + a.size!.height + 120 };
    await drag(model, 'A', 'a1', below);
    expect(a.members.has('a1')).toBe(true);
    expect(model.getGroup(handle.activeView)!.members.has('a1')).toBe(false);
    expect(onRemoveRequest).not.toHaveBeenCalled();
  });

  it('with no canDrop the board behaves as it always did (a drop below the columns lands on the view)', async () => {
    const { model, handle } = mount(BOARD());
    const a = model.getGroup('A')!;
    await drag(model, 'A', 'a1', { x: a.position.x + a.size!.width / 2, y: a.position.y + a.size!.height + 120 });
    expect(model.getGroup(handle.activeView)!.members.has('a1')).toBe(true);
  });
});

describe('fitRows — a height written as layout', () => {
  const binder = (h: DashboardHandle, id: string) => h.binderOf(id) as DashboardGridHandle;

  it('changes the row span with NO undo step and pushes the card below', () => {
    const { api, handle } = mount(BOARD());
    const a2y = handle.widget('a2')!.cell!.y;
    expect(binder(handle, 'A').fitRows!('a1', 5)).toBe(true);
    expect(handle.widget('a1')!.cell!.h).toBe(5);
    expect(handle.widget('a2')!.cell!.y).toBe(a2y + 2);
    expect(api.getEngine().commandManager.canUndo()).toBe(false);
    // and it is what a save writes
    const a = handle.toJSON().views[0].widgets.find((w) => w.id === 'A')!;
    expect(a.widgets!.find((w) => w.id === 'a1')!.rows).toBe(5);
  });

  it('a FULL column grows its slab in the parent, and gives the rows back when the card shrinks', () => {
    const { handle } = mount(BOARD());
    const slab0 = binder(handle, 'main').cellOf('A')!.h;
    // 3 + 3 rows in an 8-row design: 9 + 3 needs 4 more rows than the design holds
    expect(binder(handle, 'A').fitRows!('a1', 9)).toBe(true);
    expect(handle.widget('a1')!.cell!.h).toBe(9);
    expect(binder(handle, 'main').cellOf('A')!.h).toBeGreaterThan(slab0);
    expect(binder(handle, 'A').fitRows!('a1', 3)).toBe(true);
    expect(binder(handle, 'main').cellOf('A')!.h).toBe(slab0);
  });

  it('addWidget into a FULL growable column makes the room — and one undo takes the card and the rows back', async () => {
    const { model, api, handle } = mount(BOARD());
    const slab0 = binder(handle, 'main').cellOf('A')!.h;
    // A holds 3 + 3 of an 8-row design: a 4-row card does not fit without growing
    const w = handle.addWidget({ id: 'new', kind: 'card', span: 1, rows: 4 }, 'A');
    await settle();
    expect(w).toBeDefined();
    expect(model.getGroup('A')!.members.has('new')).toBe(true);
    const cell = handle.widget('new')!.cell!;
    expect(cell.h).toBe(4);
    expect(cell.y).toBeGreaterThanOrEqual(6);           // below the two cards, not over them
    expect(binder(handle, 'main').cellOf('A')!.h).toBeGreaterThan(slab0);
    await api.getEngine().commandManager.undo();
    await settle();
    expect(model.getNode('new')).toBeUndefined();
    expect(binder(handle, 'main').cellOf('A')!.h).toBe(slab0);
  });

  it('a FIT column still refuses an add it has no room for', () => {
    const { handle } = mount(dashboard({
      columns: 12, gap: 8, width: 1200, height: 800, sizing: 'grow', rowHeight: 8,
      widgets: [{ id: 'F', span: 4, rows: 8, columns: 1, maxRows: 8, sizing: 'fit', widgets: [{ id: 'f1', kind: 'card', span: 1, rows: 6 }] }],
    }));
    expect(handle.addWidget({ id: 'x', kind: 'card', span: 1, rows: 4 }, 'F')).toBeUndefined();
  });

  it('answers false while a gesture is live (the caller asks again after it)', () => {
    const { model, handle } = mount(BOARD());
    const tool = toolOf('A');
    const node = model.getNode('a2')!;
    const a = centre(model, 'a2');
    tool.onPointerDown?.(tev('down', a.x, a.y), { node, empty: false });
    tool.onPointerMove?.(tev('move', a.x + 30, a.y + 30), { node, empty: false });
    expect(binder(handle, 'A').busy).toBe(true);
    expect(binder(handle, 'A').fitRows!('a1', 6)).toBe(false);
    tool.onPointerUp?.(tev('up', a.x + 30, a.y + 30), { node, empty: false });
    expect(binder(handle, 'A').busy).toBe(false);
  });
});

describe('autoHeight — the kit measures the widget', () => {
  it('rowsForHeight rounds UP to whole rows, and a sub-pixel overshoot costs no row', () => {
    expect(rowsForHeight(56, 8, 8)).toBe(4); // 4 rows = 4×8 + 3×8 = 56
    expect(rowsForHeight(57, 8, 8)).toBe(5);
    expect(rowsForHeight(56.01, 8, 8)).toBe(4);
    expect(rowsForHeight(0, 8, 8)).toBe(1);
  });

  /** jsdom has no layout: a host reports `natural` px when its height is released, its cell height otherwise. */
  const stubLayout = (host: HTMLElement, natural: () => number, width = 100) => {
    Object.defineProperty(host, 'offsetHeight', { configurable: true, get: () => (host.style.height === 'auto' ? natural() : parseFloat(host.style.height) || 0) });
    Object.defineProperty(host, 'offsetWidth', { configurable: true, get: () => width });
  };
  const frames = () => new Promise<void>((r) => setTimeout(r, 60));

  it('sets each auto widget to the rows its content needs — no undo step — and re-measures after repaint()', async () => {
    const spec = BOARD({ autoHeight: true });
    const { model, api, handle } = mount(spec);
    const heights: Record<string, number> = { a1: 120, a2: 40, b1: 56 };
    for (const id of ['a1', 'a2', 'b1']) {
      const host = document.createElement('div');
      host.className = 'grafloria-node-host';
      host.dataset['nodeId'] = id;
      api.layer.appendChild(host);
      stubLayout(host, () => heights[id]!, model.getNode(id)!.size.width);
      spec.renderCustomNode(model.getNode(id), host);
    }
    await frames();
    const rowH = 8;
    const gap = 8;
    expect((handle.binderOf('A') as DashboardGridHandle).metrics().rowHeight).toBe(rowH);
    expect(handle.widget('a1')!.cell!.h).toBe(rowsForHeight(120, rowH, gap));
    expect(handle.widget('a2')!.cell!.h).toBe(rowsForHeight(40, rowH, gap));
    expect(handle.widget('b1')!.cell!.h).toBe(rowsForHeight(56, rowH, gap));
    expect(api.getEngine().commandManager.canUndo()).toBe(false);
    // the content changes (text re-wrapped, a field added): repaint re-measures
    heights['a2'] = 200;
    handle.widget('a2')!.repaint();
    await frames();
    expect(handle.widget('a2')!.cell!.h).toBe(rowsForHeight(200, rowH, gap));
    // the column grew to hold it and its rows are still the board's
    expect((handle.binderOf('A') as DashboardGridHandle).metrics().rowHeight).toBe(rowH);
  });

  it('content painted LATER (a framework portal) is measured when it arrives — the host itself never resized', async () => {
    const spec = BOARD({ autoHeight: true });
    const { model, api, handle } = mount(spec);
    const host = document.createElement('div');
    host.className = 'grafloria-node-host';
    host.dataset['nodeId'] = 'b1';
    api.layer.appendChild(host);
    let natural = 0; // empty until the "portal" paints
    stubLayout(host, () => natural, model.getNode('b1')!.size.width);
    spec.renderCustomNode(model.getNode('b1'), host);
    await frames();
    natural = 150;
    const card = document.createElement('div');
    card.textContent = 'painted by the framework';
    host.appendChild(card);
    await frames();
    expect(handle.widget('b1')!.cell!.h).toBe(rowsForHeight(150, 8, 8));
  });

  it('content that arrives for SEVERAL cards at once keeps their order — an empty host is never sized, and growth pushes the cards below', async () => {
    const spec = BOARD({ autoHeight: true });
    const { model, api, handle } = mount(spec);
    // a framework wrapper: every host is handed over EMPTY, the content comes on a later commit
    const nat: Record<string, number> = { a1: 0, a2: 0 };
    const hosts: Record<string, HTMLElement> = {};
    for (const id of ['a1', 'a2']) {
      const host = document.createElement('div');
      host.className = 'grafloria-node-host';
      host.dataset['nodeId'] = id;
      api.layer.appendChild(host);
      stubLayout(host, () => nat[id]!, model.getNode(id)!.size.width);
      spec.renderCustomNode(model.getNode(id), host);
      hosts[id] = host;
    }
    await frames();
    expect(handle.widget('a1')!.cell!.h).toBe(3); // an empty host keeps its authored rows
    nat['a1'] = 70;
    nat['a2'] = 150;
    for (const id of ['a1', 'a2']) hosts[id]!.appendChild(document.createElement('div'));
    await frames();
    const a1 = handle.widget('a1')!.cell!, a2 = handle.widget('a2')!.cell!;
    expect(a1.h).toBe(rowsForHeight(70, 8, 8));
    expect(a2.h).toBe(rowsForHeight(150, 8, 8));
    expect(a1.y).toBeLessThan(a2.y);               // the authored order holds
    expect(a2.y).toBe(a1.y + a1.h);                // and the stack has no hole
    // a second round of growth (the window narrowed) still keeps it
    nat['a1'] = 200;
    hosts['a1']!.appendChild(document.createElement('div'));
    await frames();
    expect(handle.widget('a1')!.cell!.y).toBeLessThan(handle.widget('a2')!.cell!.y);
  });

  it('a widget that opts out keeps its rows; limits still clamp an auto one', async () => {
    const spec = dashboard({
      columns: 12, gap: 8, width: 1200, height: 800, sizing: 'grow', rowHeight: 8, autoHeight: true,
      widgets: [
        { id: 'fixed', kind: 'card', span: 4, rows: 3, autoHeight: false },
        { id: 'capped', kind: 'card', span: 4, rows: 3, limits: { maxRows: 5 } },
      ],
    });
    const { model, api, handle } = mount(spec);
    for (const id of ['fixed', 'capped']) {
      const host = document.createElement('div');
      host.className = 'grafloria-node-host';
      host.dataset['nodeId'] = id;
      api.layer.appendChild(host);
      stubLayout(host, () => 300, model.getNode(id)!.size.width);
      spec.renderCustomNode(model.getNode(id), host);
    }
    await frames();
    expect(handle.widget('fixed')!.cell!.h).toBe(3);
    expect(handle.widget('capped')!.cell!.h).toBe(5);
  });

  it('a busy board is asked again after the gesture, not skipped', async () => {
    let busy = true;
    const fitRows = jest.fn(() => true);
    const fake = { busy: false, cellOf: () => ({ x: 0, y: 0, w: 1, h: 2 }), metrics: () => ({ rowHeight: 8, gap: 8 }), fitRows } as unknown as DashboardGridHandle;
    Object.defineProperty(fake, 'busy', { get: () => busy });
    const ah = createAutoHeight({ isAuto: () => true, binderOf: () => fake, worldWidthOf: () => 100, limitsOf: () => undefined });
    const host = document.createElement('div');
    document.body.appendChild(host);
    stubLayout(host, () => 88);
    ah.observe('w', host);
    ah.flush();
    expect(fitRows).not.toHaveBeenCalled();
    busy = false;
    await new Promise((r) => setTimeout(r, 200));
    expect(fitRows).toHaveBeenCalledWith('w', rowsForHeight(88, 8, 8));
    ah.dispose();
  });
});

// ---------------------------------------------------------------------------
// EVERY MODE. The two features were built on a grow grid with sections; these
// pin what they do everywhere else.
// ---------------------------------------------------------------------------

const K = (id: string, span: number, rows: number, x: number, y: number): DashboardWidgetSpec => ({ id, kind: 'kpi', span, rows, x, y });
/** A tab container's strip, stubbed (jsdom lays nothing out); it follows the group. */
const stubStrip = (api: { container: HTMLElement }, model: DiagramModel, id = 'side', h = 30) => {
  const g = model.getGroup(id)!;
  const strip = api.container.querySelector(`.axdb-tabs[data-tabs-id="${id}"]`) as HTMLElement;
  const live = () => ({ left: g.position.x, top: g.position.y, right: g.position.x + g.size!.width, bottom: g.position.y + h, width: g.size!.width, height: h, x: g.position.x, y: g.position.y, toJSON: () => ({}) });
  Object.defineProperty(strip, 'getBoundingClientRect', { value: () => live(), configurable: true });
  return live();
};
const marked = (api: { container: HTMLElement }, id = 'side') => !!api.container.querySelector(`.axdb-tabs[data-tabs-id="${id}"].axdb-tabs--drop`);
const at = (x: number, y: number) => ({ ...tev('move', x, y), screen: { x, y }, source: { target: null } as unknown as PointerEvent });
const TABS = (layout: 'grid' | 'split', extra: Partial<DashboardOptions> = {}) =>
  dashboard({
    columns: 12, width: 1200, height: 600, gap: 10, rowHeight: 60, sizing: 'grow', layout,
    widgets: [
      layout === 'split' ? K('nps', 6, 6, 0, 0) : K('nps', 2, 1, 0, 0),
      { id: 'side', title: 'Side', span: 6, rows: 6, x: 6, y: 0, layout: 'tabs', widgets: [{ id: 'p1', title: 'Filters', columns: 6, widgets: [K('k1', 3, 1, 0, 0)] }] },
    ],
    ...extra,
  });
const pagesOf = (model: DiagramModel) => [...(model.getGroup('side')!.members ?? [])].filter((m) => !!model.getGroup(m));

describe('canDrop in every mode', () => {
  it('GRID: a refused tab container — the strip does not mark, a release there makes no tab and no undo step', async () => {
    const canDrop = jest.fn(({ to }: { to: string }) => to !== 'side');
    const { api, model } = mount(TABS('grid', { canDrop }));
    const r = stubStrip(api, model);
    const tool = toolOf('main');
    const nps = model.getNode('nps')!;
    const hit = { node: nps } as never;
    tool.onPointerDown?.(tev('down', nps.position.x + 20, nps.position.y + 20), hit);
    tool.onPointerMove?.(tev('move', nps.position.x + 40, nps.position.y + 26), hit);
    tool.onPointerMove?.(at(r.x + r.width * 0.5, r.top + 15), hit);
    expect(marked(api)).toBe(false);
    tool.onPointerUp?.(tev('up', r.x + r.width * 0.5, r.top + 15), hit);
    await settle();
    expect(pagesOf(model)).toEqual(['p1']);
    expect(model.getGroup('main')!.members.has('nps')).toBe(true);
    expect(api.getEngine().commandManager.canUndo()).toBe(false);
    expect(canDrop).toHaveBeenCalledWith(expect.objectContaining({ widgetId: 'nps', from: 'main', to: 'side' }));
  });

  const splitStart = (tool: CanvasTool, nps: NodeModel) => {
    const hit = { node: nps } as never;
    tool.onPointerDown?.(tev('down', nps.position.x + 20, nps.position.y + 20), hit);
    tool.onPointerMove?.(at(nps.position.x + 40, nps.position.y + 30), hit);
    return hit;
  };
  const leaves = (model: DiagramModel) => splitLeaves(model.getGroup('main')!.getMetadata(SPLIT_TREE_KEY) as SplitNode | null).sort();

  it('SPLIT: a refused strip makes no tab — the pane stays where it was, no undo step', async () => {
    const { api, model } = mount(TABS('split', { canDrop: ({ to }) => to !== 'side' }));
    const r = stubStrip(api, model);
    const tool = splitToolOf('main');
    const hit = splitStart(tool, model.getNode('nps')!);
    tool.onPointerMove?.(at(r.x + r.width * 0.5, r.top + 15), hit);
    expect(marked(api)).toBe(false);
    tool.onPointerUp?.(at(r.x + r.width * 0.5, r.top + 15), hit);
    await settle();
    expect(pagesOf(model)).toEqual(['p1']);
    expect(leaves(model)).toEqual(['nps', 'side']);
    expect(api.getEngine().commandManager.canUndo()).toBe(false);
  });

  it('SPLIT: a refused PAGE does not take the widget, and a refusal is never a removal', async () => {
    const onRemoveRequest = jest.fn();
    const { api, model } = mount(TABS('split', { canDrop: ({ to }) => to !== 'p1', binder: { dragOut: 'remove', onRemoveRequest } }));
    const r = stubStrip(api, model);
    const tool = splitToolOf('main');
    const hit = splitStart(tool, model.getNode('nps')!);
    tool.onPointerMove?.(at(r.x + r.width * 0.5, r.top + 250), hit);
    tool.onPointerUp?.(at(r.x + r.width * 0.5, r.top + 250), hit);
    await settle();
    expect(model.getGroup('p1')!.members.has('nps')).toBe(false);
    expect(model.getGroup('main')!.members.has('nps')).toBe(true);
    expect(leaves(model)).toEqual(['nps', 'side']);
    expect(onRemoveRequest).not.toHaveBeenCalled();
  });

  it('SPLIT: the same page with no policy still takes the widget (the refusal is the policy, not the mode)', async () => {
    const { api, model } = mount(TABS('split'));
    const r = stubStrip(api, model);
    const tool = splitToolOf('main');
    const hit = splitStart(tool, model.getNode('nps')!);
    tool.onPointerMove?.(at(r.x + r.width * 0.5, r.top + 250), hit);
    tool.onPointerUp?.(at(r.x + r.width * 0.5, r.top + 250), hit);
    await settle();
    expect(model.getGroup('p1')!.members.has('nps')).toBe(true);
  });

  it('FLOAT: a refused column keeps the card home on a float board too', async () => {
    const { model } = mount(BOARD({ float: true, canDrop: ({ to }) => to !== 'B' }));
    await drag(model, 'A', 'a1', centre(model, 'b1'));
    expect(model.getGroup('A')!.members.has('a1')).toBe(true);
  });
});

describe('autoHeight in every mode', () => {
  const frames = () => new Promise<void>((r) => setTimeout(r, 60));
  /** Paint hosts for `ids` whose natural height is `natural` px; counts the measurements. */
  const paint = (spec: DashboardSpec, m: ReturnType<typeof mount>, ids: string[], natural = 300) => {
    const reads = { n: 0 };
    for (const id of ids) {
      const host = document.createElement('div');
      host.className = 'grafloria-node-host';
      host.dataset['nodeId'] = id;
      m.api.layer.appendChild(host);
      Object.defineProperty(host, 'offsetHeight', {
        configurable: true,
        get: () => {
          if (host.style.height !== 'auto') return parseFloat(host.style.height) || 0;
          reads.n++;
          return natural;
        },
      });
      Object.defineProperty(host, 'offsetWidth', { configurable: true, get: () => m.model.getNode(id)!.size.width });
      spec.renderCustomNode(m.model.getNode(id), host);
    }
    return reads;
  };

  it('FIT view: ignored, with ONE warning naming why — rows squeeze to the board there', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const spec = dashboard({ columns: 12, width: 1200, height: 600, sizing: 'fit', autoHeight: true, widgets: [K('w', 4, 2, 0, 0)] });
    const m = mount(spec);
    paint(spec, m, ['w']);
    await frames();
    m.handle.widget('w')!.repaint();
    await frames();
    expect(m.handle.widget('w')!.cell!.h).toBe(2);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/autoHeight is ignored for "w".*fit/);
  });

  it('a FIT section on a grow view: ignored with a warning — that section cannot grow', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const spec = dashboard({ columns: 12, width: 1200, height: 600, sizing: 'grow', rowHeight: 8, autoHeight: true, widgets: [
      { id: 'S', span: 6, rows: 8, columns: 1, maxRows: 8, sizing: 'fit', widgets: [{ id: 'c', kind: 'card', span: 1, rows: 3 }] },
    ] });
    const m = mount(spec);
    paint(spec, m, ['c']);
    await frames();
    expect(m.handle.widget('c')!.cell!.h).toBe(3);
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/section "S".*fit/);
  });

  it('SPLIT view: ignored with a warning — a pane is the tree\'s share', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const spec = dashboard({ columns: 12, width: 1200, height: 600, sizing: 'grow', layout: 'split', autoHeight: true, widgets: [K('a', 6, 4, 0, 0), K('b', 6, 4, 6, 0)] });
    const m = mount(spec);
    const tree0 = JSON.stringify(m.model.getGroup('main')!.getMetadata(SPLIT_TREE_KEY));
    paint(spec, m, ['a', 'b']);
    await frames();
    expect(JSON.stringify(m.model.getGroup('main')!.getMetadata(SPLIT_TREE_KEY))).toBe(tree0);
    expect(warn.mock.calls.map((c) => String(c[0])).join('\n')).toMatch(/split/);
  });

  it('a TAB PAGE: ignored with a warning — a page\'s height is its container\'s', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const spec = TABS('grid', { autoHeight: true });
    const m = mount(spec);
    paint(spec, m, ['k1']);
    await frames();
    expect(m.handle.widget('k1')!.cell!.h).toBe(1);
    expect(warn.mock.calls.map((c) => String(c[0])).join('\n')).toMatch(/"k1".*tab/);
  });

  it('FLOAT grow board: sizes by content as on a gravity board', async () => {
    const spec = dashboard({ columns: 12, width: 1200, height: 600, sizing: 'grow', rowHeight: 8, gap: 8, float: true, autoHeight: true, widgets: [K('w', 4, 2, 0, 0)] });
    const m = mount(spec);
    paint(spec, m, ['w'], 120);
    await frames();
    expect(m.handle.widget('w')!.cell!.h).toBe(rowsForHeight(120, 8, 8));
    expect(m.api.getEngine().commandManager.canUndo()).toBe(false);
  });

  it('a board that never asks pays nothing: widgets without autoHeight are never measured', async () => {
    const spec = dashboard({ columns: 12, width: 1200, height: 600, sizing: 'grow', widgets: [K('w', 4, 2, 0, 0)] });
    const m = mount(spec);
    const reads = paint(spec, m, ['w']);
    await frames();
    m.handle.refresh();
    await frames();
    expect(reads.n).toBe(0);
    expect(m.handle.widget('w')!.cell!.h).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// STAGES: sections that stay put, reorder only along their row, carry a tint,
// and pack like a list.
// ---------------------------------------------------------------------------

/** Four stages on one row, each a list; `movable` / `resizable` as asked. */
const STAGES = (movable: boolean | 'row', extra: Partial<DashboardOptions> = {}) =>
  dashboard({
    columns: 12, gap: 8, width: 1200, height: 800, sizing: 'grow', rowHeight: 8, float: false,
    widgets: ['s1', 's2', 's3', 's4'].map((id, i) => ({
      id, span: 3, rows: 30, columns: 1, maxRows: 30, movable, resizable: false, stack: true, background: `rgb(${200 + i * 10}, 220, 240)`,
      caption: { text: id.toUpperCase(), height: 32 },
      widgets: [{ id: `${id}-c1`, kind: 'card', span: 1, rows: 4 }],
    })),
    ...extra,
  });
const xOrder = (model: DiagramModel) => ['s1', 's2', 's3', 's4'].map((id) => model.getGroup(id)!).sort((a, b) => a.position.x - b.position.x).map((g) => g.id);
/** Drag a section by its caption band (the band is the slab's top 32 px). */
const dragSection = async (model: DiagramModel, id: string, to: { x: number; y: number }) => {
  const g = model.getGroup(id)!;
  const tool = toolOf('main');
  const at0 = { x: g.position.x + 30, y: g.position.y + 12 };
  const band = document.querySelector(`.axdb-slab[data-slab-id="${id}"] > .axdb-slab-h`);
  const ev = (type: ToolPointerEvent['type'], x: number, y: number) => ({ ...tev(type, x, y), source: { target: band } as unknown as PointerEvent });
  const hit = { group: g, empty: false } as never;
  tool.onPointerDown?.(ev('down', at0.x, at0.y), hit);
  tool.onPointerMove?.(ev('move', at0.x + 20, at0.y + 4), hit);
  for (let i = 1; i <= 8; i++) tool.onPointerMove?.(ev('move', at0.x + ((to.x - at0.x) * i) / 8, at0.y + ((to.y - at0.y) * i) / 8), hit);
  tool.onPointerUp?.(ev('up', to.x, to.y), hit);
  await settle();
};

describe('stages — sections for a Kanban board', () => {
  it("movable 'row': a stage dragged past two others takes the slot after them; the row stays one row; ONE undo restores the order", async () => {
    const { model, api } = mount(STAGES('row'));
    const y0 = model.getGroup('s1')!.position.y;
    const s3 = model.getGroup('s3')!;
    await dragSection(model, 's1', { x: s3.position.x + s3.size!.width * 0.8, y: y0 + 300 });
    expect(xOrder(model)).toEqual(['s2', 's3', 's1', 's4']);
    expect(['s1', 's2', 's3', 's4'].every((id) => model.getGroup(id)!.position.y === y0)).toBe(true);
    // its card travelled with it
    const s1 = model.getGroup('s1')!;
    expect(model.getNode('s1-c1')!.position.x).toBeGreaterThanOrEqual(s1.position.x);
    await api.getEngine().commandManager.undo();
    await settle();
    expect(xOrder(model)).toEqual(['s1', 's2', 's3', 's4']);
  });

  it("movable 'row': a stage dragged DOWN onto another never goes inside it", async () => {
    const { model, handle } = mount(STAGES('row'));
    const s2 = model.getGroup('s2')!;
    await dragSection(model, 's4', { x: s2.position.x + 30, y: s2.position.y + 200 });
    const inside = ['s1', 's2', 's3', 's4'].some((a) => ['s1', 's2', 's3', 's4'].some((b) => a !== b && model.getGroup(a)!.members.has(b)));
    expect(inside).toBe(false);
    expect([...model.getGroup(handle.activeView)!.members].filter((m) => m.startsWith('s') && !m.includes('-'))).toHaveLength(4);
  });

  it('movable false: the caption band does not drag the stage at all', async () => {
    const { model, api } = mount(STAGES(false));
    const s3 = model.getGroup('s3')!;
    await dragSection(model, 's1', { x: s3.position.x + 50, y: s3.position.y + 20 });
    expect(xOrder(model)).toEqual(['s1', 's2', 's3', 's4']);
    expect(api.getEngine().commandManager.canUndo()).toBe(false);
  });

  it('resizable false: no edge of the stage is a handle, and its corner handle is hidden', () => {
    const { api } = mount(STAGES('row'));
    expect(api.container.querySelector('.axdb-slab[data-slab-id="s1"]')!.classList.contains('axdb-slab--fixed')).toBe(true);
  });

  it('background: each stage paints a surface under its cards, in its own colour', () => {
    const { api } = mount(STAGES('row'));
    const bg = api.container.querySelector('.axdb-group-bg[data-group-bg="s2"]') as HTMLElement | null;
    expect(bg).not.toBeNull();
    expect(bg!.style.background).toContain('rgb(210, 220, 240)');
  });

  it('stack: a card dropped far below the last card lands right after it (a list), not where the hand let go', async () => {
    const { model, handle } = mount(STAGES('row'));
    const s2 = model.getGroup('s2')!;
    await drag(model, 's1', 's1-c1', { x: s2.position.x + s2.size!.width / 2, y: s2.position.y + 400 });
    expect(model.getGroup('s2')!.members.has('s1-c1')).toBe(true);
    const below = handle.widget('s2-c1')!.cell!;
    expect(handle.widget('s1-c1')!.cell!.y).toBe(below.y + below.h);
  });

  it('a stage WITHOUT stack keeps the drop where it was aimed (boards are unchanged)', async () => {
    const spec = dashboard({
      columns: 12, gap: 8, width: 1200, height: 800, sizing: 'grow', rowHeight: 8, float: false,
      widgets: [
        { id: 'A', span: 6, rows: 30, columns: 1, maxRows: 30, widgets: [{ id: 'a1', kind: 'card', span: 1, rows: 4 }] },
        { id: 'B', span: 6, rows: 30, columns: 1, maxRows: 30, widgets: [{ id: 'b1', kind: 'card', span: 1, rows: 4 }] },
      ],
    });
    const { model, handle } = mount(spec);
    const B = model.getGroup('B')!;
    await drag(model, 'A', 'a1', { x: B.position.x + B.size!.width / 2, y: B.position.y + 300 });
    expect(handle.widget('a1')!.cell!.y).toBeGreaterThan(handle.widget('b1')!.cell!.h);
  });

  it('the drop ring: the stage a card will land in is marked mid-drag, a refusing one in the refusal colour, and the mark goes on release', () => {
    const { model, api } = mount(STAGES('row', { canDrop: ({ to }) => to !== 's3' }));
    const slab = (id: string) => api.container.querySelector(`.axdb-slab[data-slab-id="${id}"]`)!;
    const tool = toolOf('s1');
    const node = model.getNode('s1-c1')!;
    const hit = { node, empty: false };
    const a = centre(model, 's1-c1');
    const over = (id: string) => { const g = model.getGroup(id)!; return { x: g.position.x + g.size!.width / 2, y: g.position.y + 200 }; };
    tool.onPointerDown?.(tev('down', a.x, a.y), hit);
    tool.onPointerMove?.(tev('move', a.x + 20, a.y + 20), hit);
    const p2 = over('s2');
    for (let i = 1; i <= 6; i++) tool.onPointerMove?.(tev('move', a.x + ((p2.x - a.x) * i) / 6, a.y + ((p2.y - a.y) * i) / 6), hit);
    expect(slab('s2').classList.contains('axdb-slab--drop')).toBe(true);
    const p3 = over('s3');
    for (let i = 1; i <= 6; i++) tool.onPointerMove?.(tev('move', p2.x + ((p3.x - p2.x) * i) / 6, p3.y), hit);
    expect(slab('s3').classList.contains('axdb-slab--refused')).toBe(true);
    expect(slab('s2').classList.contains('axdb-slab--drop')).toBe(false);
    tool.onPointerUp?.(tev('up', p3.x, p3.y), hit);
    expect(api.container.querySelectorAll('.axdb-slab--drop, .axdb-slab--refused')).toHaveLength(0);
  });

  it('the drop ring is opt-in: a stack list rings without a policy, a plain section (no stack, no canDrop) never does', () => {
    const ringMidDrag = (stack: boolean) => {
      const { model, api } = mount(dashboard({
        columns: 12, gap: 8, width: 1200, height: 800, sizing: 'grow', rowHeight: 8, float: false,
        widgets: ['s1', 's2'].map((id) => ({
          id, span: 6, rows: 30, columns: 1, maxRows: 30, stack,
          caption: { text: id, height: 32 }, widgets: [{ id: `${id}-c1`, kind: 'card', span: 1, rows: 4 }],
        })),
      }));
      const tool = toolOf('s1');
      const hit = { node: model.getNode('s1-c1')!, empty: false };
      const a = centre(model, 's1-c1');
      const g = model.getGroup('s2')!;
      const p = { x: g.position.x + g.size!.width / 2, y: g.position.y + 200 };
      tool.onPointerDown?.(tev('down', a.x, a.y), hit);
      for (let i = 1; i <= 8; i++) tool.onPointerMove?.(tev('move', a.x + ((p.x - a.x) * i) / 8, a.y + ((p.y - a.y) * i) / 8), hit);
      const ringed = api.container.querySelectorAll('.axdb-slab--drop').length;
      tool.onPointerUp?.(tev('up', p.x, p.y), hit);
      return ringed;
    };
    expect(ringMidDrag(true)).toBe(1); // the same path reaches s2: what differs below is only the opt-in
    expect(ringMidDrag(false)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// RUNTIME SECTIONS ("Add another list") and FOOTERS ("+ Add a card").
// ---------------------------------------------------------------------------

const THREE = (extra: Partial<DashboardOptions> = {}) =>
  dashboard({
    columns: 12, gap: 8, width: 1200, height: 800, sizing: 'grow', rowHeight: 8, float: false,
    widgets: ['s1', 's2', 's3'].map((id) => ({
      id, span: 3, rows: 12, columns: 1, maxRows: 8, movable: 'row' as const, stack: true,
      caption: { text: id, height: 32 }, footer: { height: 32 },
      widgets: [{ id: `${id}-c1`, kind: 'card', span: 1, rows: 4 }],
    })),
    ...extra,
  });

describe('runtime sections and footers', () => {
  it('addWidget with `widgets` adds a SECTION in the first free cell — bound, empty, and ONE undo away from gone', async () => {
    const { model, api, handle } = mount(THREE());
    const s = handle.addWidget({ id: 's4', title: 'S4', span: 3, rows: 12, columns: 1, maxRows: 8, movable: 'row', stack: true, footer: { height: 32 }, widgets: [] });
    await settle();
    expect(s).toBeDefined();
    expect(model.getGroup('s4')).toBeDefined();
    expect(model.getGroup('main')!.members.has('s4')).toBe(true);
    expect(handle.binderOf('main')!.cellOf('s4')).toMatchObject({ x: 9, y: 0, w: 3 });
    expect(handle.binderOf('s4')).toBeDefined();
    expect(handle.toJSON().views[0].widgets.map((w) => w.id)).toContain('s4');
    // it is a real board: a card goes in
    const card = handle.addWidget({ id: 's4-c1', kind: 'card', span: 1, rows: 4 }, 's4');
    await settle();
    expect(card && model.getGroup('s4')!.members.has('s4-c1')).toBe(true);
    const cm = api.getEngine().commandManager;
    await cm.undo(); await settle();                    // the card
    await cm.undo(); await settle();                    // the section
    expect(model.getGroup('s4')).toBeUndefined();
    expect(handle.binderOf('s4')).toBeUndefined();
    expect(handle.toJSON().views[0].widgets.map((w) => w.id)).not.toContain('s4');
    await cm.redo(); await settle();
    expect(model.getGroup('main')!.members.has('s4')).toBe(true);
    expect(handle.binderOf('s4')).toBeDefined();         // re-bound by the history
  });

  it('a section with no free cell is not added', () => {
    const { handle } = mount(dashboard({ columns: 3, width: 900, height: 600, sizing: 'fit', widgets: [{ id: 'a', span: 3, rows: 4, columns: 1, widgets: [] }] }));
    // a fit board has its rows bounded: a full first row and no room below
    expect(handle.addWidget({ id: 'b', span: 3, rows: 99, columns: 1, widgets: [] })).toBeUndefined();
  });

  it('footer: the band is painted by renderFooter at the frame bottom, its height kept clear of cards, and its presses are the page\'s', () => {
    const renderFooter = jest.fn((_w: DashboardWidgetSpec, host: HTMLElement) => { host.innerHTML = '<button>+ Add a card</button>'; });
    const { model, api, handle } = mount(THREE({ renderFooter }));
    expect(renderFooter).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }), expect.any(HTMLElement));
    const band = api.container.querySelector('.axdb-slab[data-slab-id="s1"] > .axdb-slab-f') as HTMLElement;
    expect(band).not.toBeNull();
    expect(band.style.height).toBe('32px');
    // the inner board stops 32 px (caption) from the top and 32 px (footer) from the bottom
    const g = model.getGroup('s1')!;
    const f = (handle.binderOf('s1') as DashboardGridHandle).metrics().frame;
    expect(f.y).toBe(g.position.y + 32);
    expect(f.height).toBe(g.size!.height - 64);
    // a press on the footer's button is not claimed by any board tool
    const btn = band.querySelector('button')!;
    const ev = { ...tev('down', g.position.x + 20, g.position.y + g.size!.height - 10), source: { target: btn } as unknown as PointerEvent };
    expect(toolOf('main').hitTest(ev, { node: undefined, empty: true } as never)).toBe(false);
    expect(toolOf('s1').hitTest(ev, { node: undefined, empty: true } as never)).toBe(false);
  });

  it('footer: a card dropped over a stack list\'s footer lands at the end of that list', async () => {
    const { model, handle } = mount(THREE());
    const s2 = model.getGroup('s2')!;
    await drag(model, 's1', 's1-c1', { x: s2.position.x + s2.size!.width / 2, y: s2.position.y + s2.size!.height - 12 });
    expect(model.getGroup('s2')!.members.has('s1-c1')).toBe(true);
    const last = handle.widget('s2-c1')!.cell!;
    expect(handle.widget('s1-c1')!.cell!.y).toBe(last.y + last.h);
  });
});

describe('presses inside a card', () => {
  it('a press on a form field or a [data-axdb-pass] element inside a widget is the content\'s; elsewhere on the card it is the board\'s', () => {
    const { model, api } = mount(BOARD());
    const host = document.createElement('div');
    host.className = 'grafloria-node-host';
    host.dataset['nodeId'] = 'a1';
    host.innerHTML = '<div class="card"><textarea></textarea><button data-axdb-pass>done</button><button class="plain">x</button><span class="t">title</span></div>';
    api.layer.appendChild(host);
    const node = model.getNode('a1')!;
    const at = (sel: string) => ({ ...tev('down', node.position.x + 5, node.position.y + 5), source: { target: host.querySelector(sel) } as unknown as PointerEvent });
    const tool = toolOf('A');
    expect(tool.hitTest(at('textarea'), { node, empty: false } as never)).toBe(false);
    expect(tool.hitTest(at('[data-axdb-pass]'), { node, empty: false } as never)).toBe(false);
    expect(tool.hitTest(at('.plain'), { node, empty: false } as never)).toBe(true);
    expect(tool.hitTest(at('.t'), { node, empty: false } as never)).toBe(true);
  });
});

describe('lists that hug their cards', () => {
  /** Two one-column lists that hug: design of 1 row, a header and a footer band. */
  const HUG = (extra: Partial<DashboardOptions> = {}) =>
    dashboard({
      columns: 12, gap: 8, width: 1200, height: 800, sizing: 'grow', rowHeight: 8, float: false,
      widgets: ['L1', 'L2'].map((id, i) => ({
        id, span: 3, rows: (i === 0 ? 8 : 4) + 8, columns: 1, maxRows: 1, movable: 'row' as const, stack: true,
        caption: { text: id, height: 64 }, footer: { height: 64 },
        widgets: (i === 0 ? ['a', 'b'] : ['c']).map((cid) => ({ id: `${id}-${cid}`, kind: 'card', span: 1, rows: 4 })),
      })),
      ...extra,
    });
  const slabRows = (h: DashboardHandle, id: string) => (h.binderOf('main') as DashboardGridHandle).cellOf(id)!.h;

  it('a list a card left shrinks to its cards; the undo that brings it back grows it again', async () => {
    const { model, api, handle } = mount(HUG());
    const l1 = slabRows(handle, 'L1'), l2 = slabRows(handle, 'L2');
    const L2 = model.getGroup('L2')!;
    await drag(model, 'L1', 'L1-b', { x: L2.position.x + L2.size!.width / 2, y: L2.position.y + L2.size!.height - 20 });
    expect(model.getGroup('L2')!.members.has('L1-b')).toBe(true);
    expect(slabRows(handle, 'L1')).toBe(l1 - 4);                 // the hole closed
    expect(slabRows(handle, 'L2')).toBe(l2 + 4);                 // the newcomer's rows, no more
    await api.getEngine().commandManager.undo(); await settle();
    expect(model.getGroup('L1')!.members.has('L1-b')).toBe(true);
    expect(slabRows(handle, 'L1')).toBe(l1);
    expect(slabRows(handle, 'L2')).toBe(l2);
    expect(api.getEngine().commandManager.canRedo()).toBe(true);  // the fitting itself is not a step
  });

  it('a card dropped on a hugging list\'s footer lands after its last card — the list grows under the hand, the slot stays at the end', async () => {
    const { model, handle } = mount(HUG());
    const L1 = model.getGroup('L1')!;
    await drag(model, 'L2', 'L2-c', { x: L1.position.x + L1.size!.width / 2, y: L1.position.y + L1.size!.height - 20 });
    const order = ['L1-a', 'L1-b', 'L2-c'].map((id) => handle.widget(id)!.cell!.y);
    expect(order[0]).toBeLessThan(order[1]!);
    expect(order[1]).toBeLessThan(order[2]!);
  });

  it('a renderFooter that throws is reported, and the board still follows the history', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { model, api, handle } = mount(HUG({ renderFooter: () => { throw new Error('page bug'); }, onLayoutChange: jest.fn() }));
    expect(err.mock.calls.some((c) => String(c[0]).includes('renderFooter threw'))).toBe(true);
    const L2 = model.getGroup('L2')!;
    await drag(model, 'L1', 'L1-a', { x: L2.position.x + L2.size!.width / 2, y: L2.position.y + L2.size!.height - 20 });
    await api.getEngine().commandManager.undo(); await settle();
    expect(model.getGroup('L1')!.members.has('L1-a')).toBe(true);
    expect(slabRows(handle, 'L2')).toBeGreaterThan(0);
  });
});
