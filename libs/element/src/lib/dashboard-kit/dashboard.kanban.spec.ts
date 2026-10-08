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
