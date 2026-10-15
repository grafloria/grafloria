/**
 * PLACEMENT FROM CODE, AND BOARDS WITHOUT USER HISTORY — what a page needs to
 * show another person's changes on a Kanban board in place, without
 * redeclaring the canvas:
 *
 *   place()          — a widget into any board: a list at an index, a grid at
 *                      the first free cell. By default one undo step.
 *   history: false   — on place, addWidget and remove: a system write, with no
 *                      undo step and no onLayoutChange, now or later.
 *   userHistory      — `false`: Ctrl+Z and Ctrl+Y do nothing on the board.
 */
import { CommandManager, DiagramModel, EventBus, NodeModel } from '@grafloria/engine';
import type { CanvasTool, ToolPointerEvent } from '@grafloria/renderer';
import { render } from '../grafloria';
import { dashboard, type DashboardHandle, type DashboardOptions, type DashboardSpec, type DashboardWidgetSpec } from './dashboard';
import { parentPeerOf, type DashboardGridHandle } from './grid-binder';
import type { DashboardSplitHandle } from './split-binder';
import type { SplitGroup } from './split-layout';

// No renderer routes pointer events here: the binder's tool registration is
// captured and the tool driven directly (as dashboard.kanban.spec.ts does).
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

const mounted: Array<{ dispose(): void }> = [];
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
  mounted.push(spec.handle);
  return { model, api, handle: spec.handle as DashboardHandle, manager: api.getEngine().commandManager };
}
afterEach(() => {
  for (const h of mounted.splice(0)) h.dispose();
  document.body.innerHTML = '';
  jest.restoreAllMocks();
});

const settle = () => new Promise<void>((r) => setTimeout(r, 0));
const card = (id: string, rows = 4): DashboardWidgetSpec => ({ id, kind: 'card', span: 1, rows });
const list = (id: string, cards: DashboardWidgetSpec[], maxRows = 40): DashboardWidgetSpec => ({
  id, span: 4, rows: maxRows, columns: 1, maxRows, stack: true, movable: 'row', widgets: cards,
});
/** Three Kanban lists on one row: L1 holds a, b, c; L2 holds d; L3 is empty. */
const LISTS = (extra: Partial<DashboardOptions> = {}) =>
  dashboard({
    columns: 12, gap: 8, width: 1200, height: 800, sizing: 'grow', rowHeight: 8, float: false,
    widgets: [list('L1', [card('a'), card('b', 6), card('c')]), list('L2', [card('d')]), list('L3', [])],
    ...extra,
  });

/** A list's cards, top to bottom. */
const orderOf = (model: DiagramModel, h: DashboardHandle, listId: string): string[] =>
  [...model.getGroup(listId)!.members].sort((p, q) => h.widget(p)!.cell!.y - h.widget(q)!.cell!.y);
/** Each card sits right under the one before it, from the top. */
const packed = (h: DashboardHandle, ids: string[]): boolean => {
  let y = 0;
  for (const id of ids) {
    const c = h.widget(id)!.cell!;
    if (c.y !== y || c.x !== 0) return false;
    y += c.h;
  }
  return true;
};
/** Press a card and carry it a little: a live gesture on its board. */
const hold = (model: DiagramModel, boardId: string, id: string) => {
  const tool = toolOf(boardId);
  const node = model.getNode(id)!;
  const hit = { node, empty: false };
  const x = node.position.x + node.size.width / 2;
  const y = node.position.y + node.size.height / 2;
  tool.onPointerDown?.(tev('down', x, y), hit);
  tool.onPointerMove?.(tev('move', x + 30, y + 30), hit);
  return () => tool.onPointerUp?.(tev('up', x + 30, y + 30), hit);
};
/** A hand drag of `id` from list `from` into list `to`, released — its commit not awaited. */
const dragAcross = (model: DiagramModel, from: string, id: string, to: string): void => {
  const tool = toolOf(from);
  const node = model.getNode(id)!;
  const hit = { node, empty: false };
  const a = { x: node.position.x + node.size.width / 2, y: node.position.y + node.size.height / 2 };
  const g = model.getGroup(to)!;
  const b = { x: g.position.x + g.size!.width / 2, y: g.position.y + 60 };
  tool.onPointerDown?.(tev('down', a.x, a.y), hit);
  tool.onPointerMove?.(tev('move', a.x + 20, a.y + 20), hit);
  for (let i = 1; i <= 6; i++) tool.onPointerMove?.(tev('move', a.x + ((b.x - a.x) * i) / 6, a.y + ((b.y - a.y) * i) / 6), hit);
  tool.onPointerUp?.(tev('up', b.x, b.y), hit);
};

describe('place — a widget moved into a board from code', () => {
  it('into another list at index 0: it goes first, the cards under it pack, and the list it left closes up', async () => {
    const { model, handle } = mount(LISTS());
    expect(await handle.place('c', 'L2', 0)).toBe(true);
    expect(orderOf(model, handle, 'L2')).toEqual(['c', 'd']);
    expect(packed(handle, ['c', 'd'])).toBe(true);
    expect(orderOf(model, handle, 'L1')).toEqual(['a', 'b']);
    expect(packed(handle, ['a', 'b'])).toBe(true);
    // and it is what a save writes
    const saved = handle.toJSON().views[0].widgets.find((w) => w.id === 'L2')!.widgets!;
    expect(saved.map((w) => w.id)).toEqual(['c', 'd']);
  });

  it('at an index in the middle it takes that position; past the end, or with none, it goes last', async () => {
    const { model, handle } = mount(LISTS());
    expect(await handle.place('a', 'L2', 1)).toBe(true);
    expect(await handle.place('b', 'L2', 1)).toBe(true);
    expect(orderOf(model, handle, 'L2')).toEqual(['d', 'b', 'a']);
    expect(await handle.place('c', 'L2', 99)).toBe(true);
    expect(orderOf(model, handle, 'L2')).toEqual(['d', 'b', 'a', 'c']);
    expect(await handle.place('d', 'L3')).toBe(true);
    expect(await handle.place('a', 'L3')).toBe(true);
    expect(orderOf(model, handle, 'L3')).toEqual(['d', 'a']);
    expect(packed(handle, orderOf(model, handle, 'L2'))).toBe(true);
    expect(packed(handle, ['d', 'a'])).toBe(true);
  });

  it('within its own list, the index is the position it takes: a reorder', async () => {
    const { model, handle, manager } = mount(LISTS());
    expect(await handle.place('a', 'L1', 2)).toBe(true);
    expect(orderOf(model, handle, 'L1')).toEqual(['b', 'c', 'a']);
    expect(packed(handle, ['b', 'c', 'a'])).toBe(true);
    // the position it already has: nothing to record
    expect(await handle.place('a', 'L1', 2)).toBe(true);
    await manager.undo();
    await settle();
    expect(manager.canUndo()).toBe(false);
    expect(orderOf(model, handle, 'L1')).toEqual(['a', 'b', 'c']);
  });

  it('into a board that is not a list: the first free cell; a widget already on that board stays where it is', async () => {
    const { model, handle, manager } = mount(LISTS());
    expect(await handle.place('d', 'main')).toBe(true);
    expect(model.getGroup('main')!.members.has('d')).toBe(true);
    // the lists fill the first 40 rows of all twelve columns
    expect(handle.widget('d')!.cell).toMatchObject({ x: 0, y: 40 });
    const steps = manager.getHistory().length;
    expect(await handle.place('d', 'main', 0)).toBe(true);
    expect(handle.widget('d')!.cell).toMatchObject({ x: 0, y: 40 });
    expect(manager.getHistory().length).toBe(steps);
  });

  /** Three views: a board with a list, an empty 12-column board, an empty 6-column board. */
  const SIZES = () =>
    dashboard({
      columns: 12, gap: 8, width: 1200, height: 800, sizing: 'grow', rowHeight: 8, float: false,
      views: [
        { id: 'board', widgets: [list('L1', [{ id: 'wide', kind: 'card', span: 3, rows: 5 }, card('b')]), { id: 'k', kind: 'kpi', span: 3, rows: 2 }, { id: 'huge', kind: 'kpi', span: 8, rows: 2 }] },
        { id: 'other', widgets: [] },
        { id: 'narrow', columns: 6, widgets: [] },
      ],
    });
  /** One column and the gap after it on the board card `id` now sits on, in px (the gap is 8): whole columns land within half of one. */
  const pitchOf = (model: DiagramModel, h: DashboardHandle, id: string) => (model.getNode(id)!.size.width + 8) / h.widget(id)!.cell!.w;

  it('out of a list a card keeps the width it has on screen, in the target board\'s columns — not the list\'s one cell', async () => {
    const { model, handle } = mount(SIZES());
    const inList = handle.widget('wide')!.cell!;
    expect(inList.w).toBe(1); // a list card is one cell: as wide as its list
    const width = model.getNode('wide')!.size.width;
    expect(await handle.place('wide', 'other')).toBe(true);
    const there = handle.widget('wide')!.cell!;
    expect(there.w).toBeGreaterThan(1);
    expect(there.h).toBe(inList.h);
    expect(Math.abs(model.getNode('wide')!.size.width - width)).toBeLessThanOrEqual(pitchOf(model, handle, 'wide') / 2);
    // on a board of six columns the same width is half as many of them
    const widthB = model.getNode('b')!.size.width;
    expect(await handle.place('b', 'narrow')).toBe(true);
    expect(Math.abs(model.getNode('b')!.size.width - widthB)).toBeLessThanOrEqual(pitchOf(model, handle, 'b') / 2);
    expect(handle.widget('b')!.cell!.w).toBeLessThan(there.w);
  });

  it('from any other board it keeps its cells: as the person resized it, narrowed only to a board with fewer columns', async () => {
    const { handle } = mount(SIZES());
    expect(await handle.widget('k')!.resize(5, 3)).toBe(true);
    expect(await handle.place('k', 'other')).toBe(true);
    expect(handle.widget('k')!.cell).toMatchObject({ w: 5, h: 3 });
    // wider than the board it goes to: as wide as that board, as tall as it was
    expect(await handle.place('huge', 'narrow')).toBe(true);
    expect(handle.widget('huge')!.cell).toMatchObject({ w: 6, h: 2 });
  });

  it('a full list that may grow makes the room first, in the same undo step', async () => {
    const spec = dashboard({
      columns: 12, gap: 8, width: 1200, height: 800, sizing: 'grow', rowHeight: 8, float: false,
      widgets: [list('S1', [card('s')], 8), list('S2', [card('t'), card('u')], 8)],
    });
    const { model, handle, manager } = mount(spec);
    const slab = () => (handle.binderOf('main') as DashboardGridHandle).cellOf('S2')!.h;
    const before = slab();
    expect(await handle.place('s', 'S2', 1)).toBe(true);
    expect(orderOf(model, handle, 'S2')).toEqual(['t', 's', 'u']);
    expect(packed(handle, ['t', 's', 'u'])).toBe(true);
    expect(slab()).toBeGreaterThan(before);
    await manager.undo();
    await settle();
    expect(orderOf(model, handle, 'S2')).toEqual(['t', 'u']);
    expect(model.getGroup('S1')!.members.has('s')).toBe(true);
    expect(slab()).toBe(before);
  });

  it('refuses what it cannot place: an unknown widget or board, a section, a split board', async () => {
    const { handle } = mount(LISTS());
    const before = JSON.stringify(handle.toJSON());
    expect(await handle.place('nope', 'L1')).toBe(false);
    expect(await handle.place('a', 'nope')).toBe(false);
    expect(await handle.place('L2', 'L1')).toBe(false);
    expect(JSON.stringify(handle.toJSON())).toBe(before);
    const split = mount(dashboard({ columns: 12, width: 1200, height: 600, layout: 'split', widgets: [{ id: 'k', kind: 'kpi', span: 6, rows: 2 }] }));
    expect(await split.handle.place('k', 'main')).toBe(false);
  });
});

describe('place — the history', () => {
  it('the default is ONE undo step, reported through onLayoutChange; one undo puts every card back', async () => {
    const onLayoutChange = jest.fn();
    const { model, handle, manager } = mount(LISTS({ onLayoutChange }));
    const cells0 = ['a', 'b', 'c', 'd'].map((id) => handle.widget(id)!.cell);
    expect(await handle.place('c', 'L2', 0)).toBe(true);
    expect(manager.canUndo()).toBe(true);
    expect(onLayoutChange).toHaveBeenCalledTimes(1);
    expect(onLayoutChange).toHaveBeenCalledWith('main', expect.any(Array));
    await manager.undo();
    await settle();
    expect(manager.canUndo()).toBe(false);
    expect(model.getGroup('L1')!.members.has('c')).toBe(true);
    expect(model.getGroup('L2')!.members.has('c')).toBe(false);
    expect(['a', 'b', 'c', 'd'].map((id) => handle.widget(id)!.cell)).toEqual(cells0);
    await manager.redo();
    await settle();
    expect(orderOf(model, handle, 'L2')).toEqual(['c', 'd']);
  });

  it('history: false — no undo step and no onLayoutChange; the next real change does not report it either', async () => {
    const onLayoutChange = jest.fn();
    const onSelect = jest.fn();
    const spec = dashboard({
      columns: 12, gap: 8, width: 1200, height: 800, sizing: 'grow', rowHeight: 8, float: false, onLayoutChange, onSelect,
      views: [
        { id: 'board', widgets: [list('L1', [card('a'), card('b', 6), card('c')]), list('L2', [card('d')])] },
        { id: 'other', widgets: [{ id: 'k', kind: 'kpi', span: 3, rows: 2 }] },
      ],
    });
    const { model, handle, manager } = mount(spec);
    expect(await handle.place('c', 'L2', 0, { history: false })).toBe(true);
    expect(orderOf(model, handle, 'L2')).toEqual(['c', 'd']);
    expect(packed(handle, ['c', 'd'])).toBe(true);
    expect(packed(handle, ['a', 'b'])).toBe(true);
    expect(manager.canUndo()).toBe(false);
    expect(onLayoutChange).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
    // a person's change on the other view reports that view alone
    expect(await handle.widget('k')!.moveTo(4, 0)).toBe(true);
    await settle();
    expect(onLayoutChange.mock.calls.map((c) => c[0])).toEqual(['other']);
  });

  it('history: false never clears the undo history: on a board that keeps userHistory on, the person\'s own step still undoes', async () => {
    const { model, handle, manager } = mount(LISTS());
    expect(await handle.place('c', 'L2', 0)).toBe(true);
    const steps = manager.getHistory().length;
    // another person's change arrives, on another card
    expect(await handle.place('a', 'L3', 0, { history: false })).toBe(true);
    expect(handle.addWidget(card('n'), 'L3', { history: false })).toBeDefined();
    expect(handle.widget('b')!.remove({ history: false })).toBe(true);
    expect(manager.canUndo()).toBe(true);
    expect(manager.getHistory().length).toBe(steps);
    await manager.undo();
    await settle();
    // the person's step went back; the arrived changes stayed
    expect(model.getGroup('L1')!.members.has('c')).toBe(true);
    expect(model.getGroup('L2')!.members.has('c')).toBe(false);
    expect(orderOf(model, handle, 'L3')).toEqual(['a', 'n']);
    expect(model.getNode('b')).toBeUndefined();
  });

  it('canDrop is not asked — it is the hand\'s policy — with or without history', async () => {
    const canDrop = jest.fn(() => false);
    const { model, handle } = mount(LISTS({ canDrop }));
    expect(await handle.place('c', 'L3')).toBe(true);
    expect(await handle.place('a', 'L3', 0, { history: false })).toBe(true);
    expect(orderOf(model, handle, 'L3')).toEqual(['a', 'c']);
    expect(canDrop).not.toHaveBeenCalled();
  });

  it('answers false while a gesture is live — place, history-free adds and removes — and changes nothing', async () => {
    const { model, handle, manager } = mount(LISTS());
    const release = hold(model, 'L1', 'a');
    expect((handle.binderOf('L1') as DashboardGridHandle).busy).toBe(true);
    const before = JSON.stringify(handle.toJSON());
    expect(await handle.place('d', 'L3')).toBe(false);
    expect(await handle.place('d', 'L3', 0, { history: false })).toBe(false);
    expect(handle.addWidget(card('n'), 'L3', { history: false })).toBeUndefined();
    expect(handle.widget('d')!.remove({ history: false })).toBe(false);
    expect(model.getNode('n')).toBeUndefined();
    expect(model.getGroup('L2')!.members.has('d')).toBe(true);
    release();
    await settle();
    expect(JSON.stringify(handle.toJSON().views[0].widgets.find((w) => w.id === 'L2'))).toBe(
      JSON.stringify((JSON.parse(before) as { views: Array<{ widgets: DashboardWidgetSpec[] }> }).views[0].widgets.find((w) => w.id === 'L2'))
    );
    // asked again after the gesture, it goes
    expect(await handle.place('d', 'L3')).toBe(true);
    expect(model.getGroup('L3')!.members.has('d')).toBe(true);
    expect(manager.canUndo()).toBe(true);
  });

  it('answers false while a released drag is still landing in the history, so the two never interleave', async () => {
    const { model, handle } = mount(LISTS());
    // The hand carries `a` from L1 into L3 and lets go; in the same tick — a
    // page reacting to the release — another person's change arrives.
    dragAcross(model, 'L1', 'a', 'L3');
    expect(await handle.place('d', 'L1', 0, { history: false })).toBe(false);
    expect(handle.addWidget(card('n'), 'L1', { index: 0, history: false })).toBeUndefined();
    expect(handle.widget('c')!.remove({ history: false })).toBe(false);
    await settle();
    expect(orderOf(model, handle, 'L3')).toEqual(['a']);
    expect(orderOf(model, handle, 'L1')).toEqual(['b', 'c']);
    expect(packed(handle, ['b', 'c'])).toBe(true);
    // once it has landed, the same change goes in at its place
    expect(await handle.place('d', 'L1', 0, { history: false })).toBe(true);
    expect(orderOf(model, handle, 'L1')).toEqual(['d', 'b', 'c']);
    expect(packed(handle, ['d', 'b', 'c'])).toBe(true);
  });

  it('…and that includes a page answering the drop from onLayoutChange, which fires as the commit starts', async () => {
    const answers: string[] = [];
    let h: DashboardHandle | undefined;
    const onLayoutChange = () => {
      if (answers.length === 0) answers.push(h!.addWidget(card('n'), 'L1', { index: 0, history: false }) ? 'added' : 'refused');
    };
    const { model, handle } = mount(LISTS({ onLayoutChange }));
    h = handle;
    dragAcross(model, 'L1', 'a', 'L3');
    expect(answers).toEqual(['refused']);
    await settle();
    expect(orderOf(model, handle, 'L1')).toEqual(['b', 'c']);
    expect(packed(handle, ['b', 'c'])).toBe(true);
  });

  it('answers false while an undoable call is still landing — and that call is still reported', async () => {
    const onLayoutChange = jest.fn();
    const { model, handle } = mount(LISTS({ onLayoutChange }));
    const moving = handle.place('c', 'L2', 0); // not awaited
    expect(await handle.place('a', 'L2', 0, { history: false })).toBe(false);
    expect(await moving).toBe(true);
    handle.addWidget(card('n'), 'L3');
    expect(handle.widget('b')!.remove({ history: false })).toBe(false);
    await settle();
    const sliding = handle.widget('L3')!.moveTo(4, 0); // a board's own programmatic step
    expect(handle.addWidget(card('m'), 'L3', { history: false })).toBeUndefined();
    expect(await sliding).toBe(true);
    await settle();
    // each person's change reached onLayoutChange
    const lastL = (id: string) => (onLayoutChange.mock.calls.at(-1)![1] as DashboardWidgetSpec[]).find((w) => w.id === id)!.widgets!.map((w) => w.id);
    expect(lastL('L2')).toEqual(['c', 'd']);
    expect(lastL('L3')).toEqual(['n']);
    // and the arriving change, asked again, lands where it was meant to
    expect(await handle.place('a', 'L2', 0, { history: false })).toBe(true);
    expect(orderOf(model, handle, 'L2')).toEqual(['a', 'c', 'd']);
    expect(packed(handle, ['a', 'c', 'd'])).toBe(true);
  });

  it('on a read-only document an undoable place answers false and takes no room; a history-free one applies', async () => {
    const spec = dashboard({
      columns: 12, gap: 8, width: 1200, height: 800, sizing: 'grow', rowHeight: 8, float: false,
      widgets: [list('S1', [card('s')], 8), list('S2', [card('t'), card('u')], 8)],
    });
    const { model, handle } = mount(spec);
    const slab = () => (handle.binderOf('main') as DashboardGridHandle).cellOf('S2')!.h;
    const before = slab();
    model.setReadonly(true);
    expect(await handle.place('s', 'S2', 0)).toBe(false);
    expect(slab()).toBe(before);
    expect(orderOf(model, handle, 'S2')).toEqual(['t', 'u']);
    expect(await handle.place('s', 'S2', 0, { history: false })).toBe(true);
    expect(orderOf(model, handle, 'S2')).toEqual(['s', 't', 'u']);
  });
});

describe('undo after someone else\'s history-free write moved the same card', () => {
  /** The lists holding `id` now. */
  const holders = (model: DiagramModel, id: string): string[] => ['L1', 'L2', 'L3'].filter((l) => model.getGroup(l)!.members.has(id));

  it('the person\'s place is refused: the card stays where it was moved, in one list, and the page is told why', async () => {
    const onUndoRefused = jest.fn();
    const { model, handle, manager } = mount(LISTS({ onUndoRefused }));
    expect(await handle.place('c', 'L2', 0)).toBe(true);
    // another person's change arrives: the same card, on to L3
    expect(await handle.place('c', 'L3', 0, { history: false })).toBe(true);
    await manager.undo();
    await settle();
    expect(holders(model, 'c')).toEqual(['L3']);
    expect(orderOf(model, handle, 'L1')).toEqual(['a', 'b']);
    expect(packed(handle, ['a', 'b'])).toBe(true);
    expect(onUndoRefused).toHaveBeenCalledTimes(1);
    expect(onUndoRefused).toHaveBeenCalledWith({ widgetId: 'c', boardId: 'L3', reason: expect.stringMatching(/moved since.*one list/) });
    // the step is gone: a second undo does not try it again
    expect(manager.canUndo()).toBe(false);
  });

  it('a hand drag is refused the same way, and the page is told', async () => {
    const onUndoRefused = jest.fn();
    const { model, handle, manager } = mount(LISTS({ onUndoRefused }));
    dragAcross(model, 'L1', 'a', 'L3');
    await settle();
    expect(holders(model, 'a')).toEqual(['L3']);
    expect(await handle.place('a', 'L2', 0, { history: false })).toBe(true);
    await manager.undo();
    await settle();
    expect(holders(model, 'a')).toEqual(['L2']);
    expect(onUndoRefused).toHaveBeenCalledWith({ widgetId: 'a', boardId: 'L2', reason: expect.any(String) });
  });

  it('Ctrl+Z on a board that keeps the person\'s undo: refused, the card stays', async () => {
    const onUndoRefused = jest.fn();
    const el = document.createElement('div');
    document.body.appendChild(el);
    const spec = LISTS({ onUndoRefused });
    const instance = render(spec, el);
    mounted.push(instance);
    const model = instance.getModel() as unknown as DiagramModel;
    expect(await spec.handle.place('c', 'L2', 0)).toBe(true);
    expect(await spec.handle.place('c', 'L3', 0, { history: false })).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
    await settle();
    await settle();
    expect(holders(model, 'c')).toEqual(['L3']);
    expect(onUndoRefused).toHaveBeenCalledWith(expect.objectContaining({ widgetId: 'c', boardId: 'L3' }));
  });

  it('a step about another card still undoes, and nothing is refused', async () => {
    const onUndoRefused = jest.fn();
    const { model, handle, manager } = mount(LISTS({ onUndoRefused }));
    expect(await handle.place('c', 'L2', 0)).toBe(true);
    expect(await handle.place('a', 'L3', 0, { history: false })).toBe(true);
    await manager.undo();
    await settle();
    expect(holders(model, 'c')).toEqual(['L1']);
    expect(holders(model, 'a')).toEqual(['L3']);
    expect(onUndoRefused).not.toHaveBeenCalled();
  });

  it('a card moved on within the list the step put it in: refused all the same — the other person\'s place stands', async () => {
    const onUndoRefused = jest.fn();
    const { model, handle, manager } = mount(LISTS({ onUndoRefused }));
    expect(await handle.place('c', 'L2', 0)).toBe(true);
    expect(await handle.place('c', 'L2', 1, { history: false })).toBe(true);
    await manager.undo();
    await settle();
    expect(orderOf(model, handle, 'L2')).toEqual(['d', 'c']);
    expect(onUndoRefused).toHaveBeenCalledWith({ widgetId: 'c', boardId: 'L2', reason: expect.any(String) });
  });

  it('moved away and back again: still refused, though the card stands in the list the step put it in', async () => {
    const onUndoRefused = jest.fn();
    const { model, handle, manager } = mount(LISTS({ onUndoRefused }));
    expect(await handle.place('c', 'L2', 0)).toBe(true);
    expect(await handle.place('c', 'L3', 0, { history: false })).toBe(true);
    expect(await handle.place('c', 'L2', 0, { history: false })).toBe(true);
    await manager.undo();
    await settle();
    expect(holders(model, 'c')).toEqual(['L2']);
    expect(onUndoRefused).toHaveBeenCalledWith(expect.objectContaining({ widgetId: 'c', boardId: 'L2' }));
  });

  it('a step that only reordered the card is refused too: the card keeps the cell it has on the list it was moved to', async () => {
    const onUndoRefused = jest.fn();
    const { model, handle, manager } = mount(LISTS({ onUndoRefused }));
    expect(await handle.place('c', 'L1', 0)).toBe(true); // the person's step: c to the top of its own list
    expect(await handle.place('c', 'L3', 0, { history: false })).toBe(true);
    const there = handle.widget('c')!.cell;
    await manager.undo();
    await settle();
    expect(holders(model, 'c')).toEqual(['L3']);
    expect(handle.widget('c')!.cell).toEqual(there);
    expect(onUndoRefused).toHaveBeenCalledWith(expect.objectContaining({ widgetId: 'c', boardId: 'L3' }));
  });

  it('a card the step only pushed aside, moved on by someone else: refused, and that card is named', async () => {
    const onUndoRefused = jest.fn();
    const { model, handle, manager } = mount(LISTS({ onUndoRefused }));
    expect(await handle.place('a', 'L2', 0)).toBe(true); // pushes d down
    expect(await handle.place('d', 'L3', 0, { history: false })).toBe(true);
    await manager.undo();
    await settle();
    expect(holders(model, 'a')).toEqual(['L2']);
    expect(holders(model, 'd')).toEqual(['L3']);
    expect(onUndoRefused).toHaveBeenCalledWith(expect.objectContaining({ widgetId: 'd', boardId: 'L3' }));
  });
});

describe('onIdle — the board tells the page when a refused write may be made again', () => {
  it('a write refused while a released drag is still saving: told once the drop has landed, and the write then goes', async () => {
    const answers: boolean[] = [];
    let h: DashboardHandle | undefined;
    const onIdle = jest.fn(() => void h!.place('d', 'L1', 0, { history: false }).then((ok) => answers.push(ok)));
    const { model, handle } = mount(LISTS({ onIdle }));
    h = handle;
    dragAcross(model, 'L1', 'a', 'L3');
    const refused = handle.place('d', 'L1', 0, { history: false });
    expect(onIdle).not.toHaveBeenCalled();
    expect(await refused).toBe(false);
    await settle();
    expect(onIdle).toHaveBeenCalledTimes(1);
    await settle();
    // the page asked again from onIdle, and the change went in at its place
    expect(answers).toEqual([true]);
    expect(orderOf(model, handle, 'L3')).toEqual(['a']);
    expect(orderOf(model, handle, 'L1')).toEqual(['d', 'b', 'c']);
    expect(packed(handle, ['d', 'b', 'c'])).toBe(true);
  });

  it('a card held: told when it is let go, whether it was carried, only pressed or put back', async () => {
    const onIdle = jest.fn();
    const { model, handle } = mount(LISTS({ onIdle }));
    const release = hold(model, 'L1', 'a');
    expect(handle.addWidget(card('n'), 'L3', { history: false })).toBeUndefined();
    await settle();
    expect(onIdle).not.toHaveBeenCalled(); // still held: not yet
    release();
    await settle();
    expect(onIdle).toHaveBeenCalledTimes(1);
    expect(handle.addWidget(card('n'), 'L3', { history: false })).toBeDefined();
    // a press that never travels holds the board as well
    const tool = toolOf('L2');
    const node = model.getNode('d')!;
    const at = { x: node.position.x + node.size.width / 2, y: node.position.y + node.size.height / 2 };
    tool.onPointerDown?.(tev('down', at.x, at.y), { node, empty: false });
    expect(handle.widget('b')!.remove({ history: false })).toBe(false);
    await settle();
    expect(onIdle).toHaveBeenCalledTimes(1);
    tool.onPointerUp?.(tev('up', at.x, at.y), { node, empty: false });
    await settle();
    expect(onIdle).toHaveBeenCalledTimes(2);
    // carried, then put back (Escape): nothing to save, and the board is free
    hold(model, 'L1', 'b');
    expect(handle.widget('c')!.remove({ history: false })).toBe(false);
    toolOf('L1').onCancel?.();
    await settle();
    expect(onIdle).toHaveBeenCalledTimes(3);
  });

  it('a section held by its edge: told when it is let go, with nothing to save', async () => {
    const onIdle = jest.fn();
    const { model, handle, api } = mount(LISTS({ onIdle }));
    const peer = parentPeerOf(api.container, 'L3')!;
    const g = model.getGroup('L3')!;
    const bottom = { x: g.position.x + g.size!.width / 2, y: g.position.y + g.size!.height };
    expect(peer.beginSlabResize!('L3', { n: false, e: false, s: true, w: false }, tev('down', bottom.x, bottom.y))).toBe(true);
    expect(await handle.place('d', 'L3', 0, { history: false })).toBe(false);
    await settle();
    expect(onIdle).not.toHaveBeenCalled();
    peer.slabUp!();
    await settle();
    expect(onIdle).toHaveBeenCalledTimes(1);
    expect(await handle.place('d', 'L3', 0, { history: false })).toBe(true);
  });

  it('a tile held on a split section: told when it is let go, whether only pressed or carried', async () => {
    const onIdle = jest.fn();
    const split: DashboardWidgetSpec = {
      id: 'S', span: 4, rows: 20, layout: 'split',
      widgets: [{ id: 'x', kind: 'kpi', span: 2, rows: 4 }, { id: 'y', kind: 'kpi', span: 2, rows: 4 }],
    };
    const { model, handle } = mount(dashboard({
      columns: 12, gap: 8, width: 1200, height: 800, sizing: 'grow', rowHeight: 8, float: false, onIdle,
      widgets: [list('L1', [card('a'), card('b', 6)]), list('L2', []), split],
    }));
    const g = globalThis as unknown as { __axdbTools?: CanvasTool[] };
    const tool = [...(g.__axdbTools ?? [])].reverse().find((t) => t.id.startsWith('dashboard-split:S:'))!;
    const x = model.getNode('x')!;
    const hit = { node: x, empty: false };
    const at = { x: x.position.x + 10, y: x.position.y + 10 };
    // only pressed: the split board is held all the same
    tool.onPointerDown?.(tev('down', at.x, at.y), hit);
    expect(await handle.place('a', 'L2', 0, { history: false })).toBe(false);
    await settle();
    expect(onIdle).not.toHaveBeenCalled();
    tool.onPointerUp?.(tev('up', at.x, at.y), hit);
    await settle();
    expect(onIdle).toHaveBeenCalledTimes(1);
    expect(await handle.place('a', 'L2', 0, { history: false })).toBe(true);
    // carried, then put back where it was
    tool.onPointerDown?.(tev('down', at.x, at.y), hit);
    tool.onPointerMove?.(tev('move', at.x + 30, at.y + 30), hit);
    expect(handle.widget('b')!.remove({ history: false })).toBe(false);
    tool.onCancel?.();
    await settle();
    expect(onIdle).toHaveBeenCalledTimes(2);
    // a split section's step still saving holds the board as a grid board's does, and is told when it lands
    const s = handle.binderOf('S') as DashboardSplitHandle;
    const tree = s.getSplitTree() as SplitGroup;
    const saving = s.setSplitTree({ ...tree, children: [...tree.children].reverse() }); // not awaited
    expect(await handle.place('a', 'L1', 0, { history: false })).toBe(false);
    expect(onIdle).toHaveBeenCalledTimes(2);
    await saving;
    await settle();
    expect(onIdle).toHaveBeenCalledTimes(3);
    expect(await handle.place('a', 'L1', 0, { history: false })).toBe(true);
  });

  it('an undoable call still saving: told when it lands — a place, an add', async () => {
    const onIdle = jest.fn();
    const { handle } = mount(LISTS({ onIdle }));
    const moving = handle.place('c', 'L2', 0); // not awaited
    expect(handle.widget('b')!.remove({ history: false })).toBe(false);
    expect(onIdle).not.toHaveBeenCalled();
    expect(await moving).toBe(true);
    await settle();
    expect(onIdle).toHaveBeenCalledTimes(1);
    handle.addWidget(card('n'), 'L3');
    expect(handle.widget('b')!.remove({ history: false })).toBe(false);
    expect(onIdle).toHaveBeenCalledTimes(1);
    await settle();
    expect(onIdle).toHaveBeenCalledTimes(2);
  });

  it('told only when every board is free: a step that lands while a card is held waits for the card', async () => {
    const onIdle = jest.fn();
    const { model, handle } = mount(LISTS({ onIdle }));
    const moving = handle.place('c', 'L2', 0); // not awaited
    expect(handle.widget('b')!.remove({ history: false })).toBe(false);
    const release = hold(model, 'L1', 'a');
    await moving;
    await settle();
    expect(onIdle).not.toHaveBeenCalled();
    release();
    await settle();
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('the layer below: a board\'s own onIdle is told once it has settled, never while a drop is saving', async () => {
    const seen: Array<{ busy: boolean; committing: boolean }> = [];
    let h: DashboardHandle | undefined;
    const onIdle = () => {
      const b = h!.binderOf('L1') as DashboardGridHandle;
      seen.push({ busy: !!b.busy, committing: !!b.committing });
    };
    const { model, handle } = mount(LISTS({ binder: { onIdle } }));
    h = handle;
    dragAcross(model, 'L1', 'a', 'L3');
    await settle();
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((s) => !s.busy && !s.committing)).toBe(true);
  });

  it('told once, however many writes were refused; and never when nothing was refused', async () => {
    const onIdle = jest.fn();
    const { model, handle } = mount(LISTS({ onIdle }));
    // a drag, an undoable call and a history-free write alone owe the page nothing
    dragAcross(model, 'L1', 'a', 'L3');
    await settle();
    expect(await handle.place('c', 'L2', 0)).toBe(true);
    expect(await handle.place('b', 'L3', 0, { history: false })).toBe(true);
    await settle();
    expect(onIdle).not.toHaveBeenCalled();
    // three refusals during one drop: one answer
    dragAcross(model, 'L3', 'a', 'L1');
    expect(await handle.place('d', 'L1', 0, { history: false })).toBe(false);
    expect(handle.addWidget(card('n'), 'L1', { history: false })).toBeUndefined();
    expect(handle.widget('c')!.remove({ history: false })).toBe(false);
    await settle();
    await settle();
    expect(onIdle).toHaveBeenCalledTimes(1);
    // …and that answer is spent: the next drop owes nothing
    dragAcross(model, 'L1', 'a', 'L3');
    await settle();
    expect(onIdle).toHaveBeenCalledTimes(1);
  });
});

describe('addWidget and remove without history', () => {
  it('addWidget at an index into a list: it takes that position; history-free, with no undo step and no report', async () => {
    const onLayoutChange = jest.fn();
    const { model, handle, manager } = mount(LISTS({ onLayoutChange }));
    expect(handle.addWidget(card('n'), 'L1', { index: 1, history: false })).toBeDefined();
    expect(orderOf(model, handle, 'L1')).toEqual(['a', 'n', 'b', 'c']);
    expect(packed(handle, ['a', 'n', 'b', 'c'])).toBe(true);
    await settle(); // a step the history took would be recorded by now
    expect(manager.canUndo()).toBe(false);
    expect(onLayoutChange).not.toHaveBeenCalled();
    expect(handle.toJSON().views[0].widgets.find((w) => w.id === 'L1')!.widgets!.map((w) => w.id)).toEqual(['a', 'n', 'b', 'c']);
  });

  it('addWidget at an index with history is one undo step that takes the card out and the others back up', async () => {
    const { model, handle, manager } = mount(LISTS());
    expect(handle.addWidget(card('n'), 'L1', { index: 0 })).toBeDefined();
    await settle();
    expect(orderOf(model, handle, 'L1')).toEqual(['n', 'a', 'b', 'c']);
    await manager.undo();
    await settle();
    expect(model.getNode('n')).toBeUndefined();
    expect(orderOf(model, handle, 'L1')).toEqual(['a', 'b', 'c']);
    expect(packed(handle, ['a', 'b', 'c'])).toBe(true);
  });

  it('addWidget at an index of a card the list already holds: it takes that position once, and the list stays packed', () => {
    const { model, handle } = mount(LISTS());
    // the same card arriving twice (a page that applies one change again)
    expect(handle.addWidget(card('a'), 'L1', { index: 0, history: false })).toBeDefined();
    expect(orderOf(model, handle, 'L1')).toEqual(['a', 'b', 'c']);
    expect(packed(handle, ['a', 'b', 'c'])).toBe(true);
    expect(handle.addWidget(card('a'), 'L1', { index: 2, history: false })).toBeDefined();
    expect(orderOf(model, handle, 'L1')).toEqual(['b', 'c', 'a']);
    expect(packed(handle, ['b', 'c', 'a'])).toBe(true);
  });

  it('a history-free SECTION add: bound and ready for cards, with no undo step and no report', async () => {
    const onLayoutChange = jest.fn();
    const { model, handle, manager } = mount(LISTS({ onLayoutChange }));
    expect(handle.addWidget({ ...list('L4', []), widgets: [] }, 'main', { history: false })).toBeDefined();
    expect(model.getGroup('main')!.members.has('L4')).toBe(true);
    expect(handle.binderOf('L4')).toBeDefined();
    expect(handle.addWidget(card('n'), 'L4', { history: false })).toBeDefined();
    expect(model.getGroup('L4')!.members.has('n')).toBe(true);
    await settle(); // a step the history took would be recorded by now
    expect(manager.canUndo()).toBe(false);
    expect(onLayoutChange).not.toHaveBeenCalled();
  });

  it('remove({ history: false }): the card goes and its list closes up, with no undo step and no report', async () => {
    const onLayoutChange = jest.fn();
    const { model, handle, manager } = mount(LISTS({ onLayoutChange }));
    expect(handle.widget('a')!.remove({ history: false })).toBe(true);
    expect(model.getNode('a')).toBeUndefined();
    expect(handle.widget('a')).toBeUndefined();
    expect(orderOf(model, handle, 'L1')).toEqual(['b', 'c']);
    expect(packed(handle, ['b', 'c'])).toBe(true);
    // a section too
    expect(handle.widget('L3')!.remove({ history: false })).toBe(true);
    expect(model.getGroup('L3')).toBeUndefined();
    await settle(); // a step the history took would be recorded by now
    expect(manager.canUndo()).toBe(false);
    expect(onLayoutChange).not.toHaveBeenCalled();
  });

  it('remove() as before: one undo step, and true', async () => {
    const { model, handle, manager } = mount(LISTS());
    expect(handle.widget('a')!.remove()).toBe(true);
    await settle();
    expect(model.getNode('a')).toBeUndefined();
    await manager.undo();
    await settle();
    expect(model.getNode('a')).toBeDefined();
    expect(orderOf(model, handle, 'L1')).toEqual(['a', 'b', 'c']);
  });
});

describe('userHistory: false — undo, redo, the clipboard, duplicate and Delete do nothing on the board', () => {
  /** A board rendered for real, so the renderer's own keys are live. */
  const renderBoard = (extra: Partial<DashboardOptions>) => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const spec = LISTS(extra);
    const instance = render(spec, el);
    mounted.push(instance);
    return { instance, handle: spec.handle, model: instance.getModel() as unknown as DiagramModel };
  };
  /** A hand drag of `id` from list `from` into list `to`, landed. */
  const dragInto = async (model: DiagramModel, from: string, id: string, to: string) => {
    dragAcross(model, from, id, to);
    await settle();
  };
  const key = async (k: string, shift = false) => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, ctrlKey: true, shiftKey: shift, bubbles: true, cancelable: true }));
    await settle();
    await settle();
  };

  it('Ctrl+Z after a drag leaves the card where it is and fires nothing', async () => {
    const onLayoutChange = jest.fn();
    const { model, instance } = renderBoard({ userHistory: false, onLayoutChange });
    await dragInto(model, 'L1', 'a', 'L3');
    expect(model.getGroup('L3')!.members.has('a')).toBe(true);
    const reported = onLayoutChange.mock.calls.length;
    expect(reported).toBeGreaterThan(0);
    await key('z');
    expect(model.getGroup('L3')!.members.has('a')).toBe(true);
    expect(onLayoutChange).toHaveBeenCalledTimes(reported);
    // the step is still there for code; the keyboard just does not reach it
    expect(instance.getEngine().commandManager.canUndo()).toBe(true);
  });

  it('redo stays off too: Ctrl+Y and Ctrl+Shift+Z after an undo from code', async () => {
    const { model, instance } = renderBoard({ userHistory: false });
    await dragInto(model, 'L1', 'a', 'L3');
    await instance.getEngine().undo();
    await settle();
    expect(model.getGroup('L1')!.members.has('a')).toBe(true);
    await key('y');
    await key('z', true);
    expect(model.getGroup('L1')!.members.has('a')).toBe(true);
  });

  it('cut stays unbound: Ctrl+X does nothing, as on any board', async () => {
    const { model } = renderBoard({ userHistory: false });
    model.selectNode(model.getNode('a')!);
    await key('x');
    expect(['a', 'b', 'c', 'd'].every((id) => !!model.getNode(id))).toBe(true);
  });

  /** A key on the window, as a person presses it; the event, to read what the board did with it. */
  const press = async (k: string, mods: KeyboardEventInit = { ctrlKey: true }) => {
    const e = new KeyboardEvent('keydown', { key: k, ...mods, bubbles: true, cancelable: true });
    window.dispatchEvent(e);
    await settle();
    await settle();
    return e;
  };
  /** Ctrl+A, Ctrl+C, Ctrl+V, then Ctrl+D and Delete on one selected card: what a person edits with beside the moves. */
  const editKeys = async (model: DiagramModel, instance: { getEngine(): { hasClipboardData(): boolean } }) => {
    await press('a');
    const selected = model.getSelectedNodes().length;
    model.selectNode(model.getNode('a')!); // something to copy, whatever Ctrl+A did
    await press('c');
    const copied = instance.getEngine().hasClipboardData();
    const paste = await press('v');
    model.clearSelection();
    model.selectNode(model.getNode('b')!);
    await press('d');
    model.clearSelection();
    model.selectNode(model.getNode('a')!);
    await press('Delete', {});
    return { selected, copied, paste };
  };

  it('the clipboard, duplicate and Delete are off too: only the page changes the board', async () => {
    const onLayoutChange = jest.fn();
    const { model, instance } = renderBoard({ userHistory: false, onLayoutChange });
    const before = model.getNodes().map((n) => n.id).sort();
    const { selected, copied, paste } = await editKeys(model, instance);
    expect(selected).toBe(0);
    expect(copied).toBe(false);
    expect(model.getNodes().map((n) => n.id).sort()).toEqual(before);
    expect(onLayoutChange).not.toHaveBeenCalled();
    // the browser keeps the key: its own paste event follows
    expect(paste.defaultPrevented).toBe(false);
  });

  /** A key pressed while card `id` has focus: it starts there and bubbles out to the window, as a person's does. */
  const pressOn = async (id: string, k: string, mods: KeyboardEventInit = { ctrlKey: true }) => {
    const host = document.querySelector(`.grafloria-node-host[data-node-id="${id}"]`) as HTMLElement;
    host.focus();
    const e = new KeyboardEvent('keydown', { key: k, ...mods, bubbles: true, cancelable: true });
    host.dispatchEvent(e);
    await settle();
    await settle();
    return e;
  };

  it('while the board has focus, Ctrl+A, Ctrl+D, Delete and Backspace are swallowed: the board does nothing, nor does the browser', async () => {
    const onLayoutChange = jest.fn();
    const { model } = renderBoard({ userHistory: false, onLayoutChange });
    const before = model.getNodes().map((n) => n.id).sort();
    const selectAll = await pressOn('a', 'a');
    expect(selectAll.defaultPrevented).toBe(true); // no page-wide text selection
    expect(model.getSelectedNodes().length).toBeLessThanOrEqual(1); // and not every card either
    model.selectNode(model.getNode('b')!);
    const duplicate = await pressOn('b', 'd');
    expect(duplicate.defaultPrevented).toBe(true); // no bookmark dialog
    model.selectNode(model.getNode('a')!);
    const del = await pressOn('a', 'Delete', {});
    const back = await pressOn('a', 'Backspace', {});
    expect(del.defaultPrevented).toBe(true);
    expect(back.defaultPrevented).toBe(true);
    expect(model.getNodes().map((n) => n.id).sort()).toEqual(before);
    expect(onLayoutChange).not.toHaveBeenCalled();
  });

  it('…while Ctrl+C, Ctrl+X and Ctrl+V pass through to the page\'s copy, cut and paste, and the board copies nothing', async () => {
    const { model, instance } = renderBoard({ userHistory: false });
    model.selectNode(model.getNode('a')!);
    expect((await pressOn('a', 'c')).defaultPrevented).toBe(false);
    expect((await pressOn('a', 'x')).defaultPrevented).toBe(false);
    expect((await pressOn('a', 'v')).defaultPrevented).toBe(false);
    expect(instance.getEngine().hasClipboardData()).toBe(false);
    expect(model.getNode('a')).toBeDefined();
  });

  it('a person who CLICKED a card — the focus stays on the page body — has the board\'s focus too: Ctrl+A, Ctrl+D and Delete are swallowed', async () => {
    renderBoard({ userHistory: false });
    const host = document.querySelector('.grafloria-node-host[data-node-id="a"]') as HTMLElement;
    const press = (el: Element) => el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    /** A key typed with nothing focused: it starts at the body, as after a click on a card. */
    const typed = async (k: string, mods: KeyboardEventInit = { ctrlKey: true }) => {
      const e = new KeyboardEvent('keydown', { key: k, ...mods, bubbles: true, cancelable: true });
      document.body.dispatchEvent(e);
      await settle();
      return e;
    };
    (document.activeElement as HTMLElement | null)?.blur?.();
    press(host);
    expect(document.activeElement).toBe(document.body);
    expect((await typed('a')).defaultPrevented).toBe(true);
    expect((await typed('d')).defaultPrevented).toBe(true);
    expect((await typed('Delete', {})).defaultPrevented).toBe(true);
    expect((await typed('c')).defaultPrevented).toBe(false); // the clipboard keys still reach the page
    // a press on the page beside the board gives the keys back to the page
    const text = document.createElement('p');
    document.body.appendChild(text);
    press(text);
    expect((await typed('a')).defaultPrevented).toBe(false);
  });

  it('…and with the focus outside the board, Ctrl+A and Ctrl+D are the page\'s own', async () => {
    renderBoard({ userHistory: false });
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    for (const k of ['a', 'd']) {
      const e = new KeyboardEvent('keydown', { key: k, ctrlKey: true, bubbles: true, cancelable: true });
      outside.dispatchEvent(e);
      await settle();
      expect(e.defaultPrevented).toBe(false);
    }
  });

  it('…while on a default board the same keys paste, duplicate and delete, as they always did', async () => {
    const { model, instance } = renderBoard({});
    const before = model.getNodes().length;
    const { selected, copied } = await editKeys(model, instance);
    expect(selected).toBeGreaterThan(0);
    expect(copied).toBe(true);
    expect(model.getNode('a')).toBeUndefined();
    expect(model.getNodes().length).toBeGreaterThan(before);
  });

  it('by default the keys undo as they always did', async () => {
    const onLayoutChange = jest.fn();
    const { model } = renderBoard({ onLayoutChange });
    await dragInto(model, 'L1', 'a', 'L3');
    expect(model.getGroup('L3')!.members.has('a')).toBe(true);
    const reported = onLayoutChange.mock.calls.length;
    await key('z');
    expect(model.getGroup('L1')!.members.has('a')).toBe(true);
    expect(onLayoutChange.mock.calls.length).toBeGreaterThan(reported);
    await key('y');
    expect(model.getGroup('L3')!.members.has('a')).toBe(true);
  });

  it('a beforeKey passed to render() is asked too, after the board\'s: undo stays off, and the page has the other keys', async () => {
    const asked: string[] = [];
    const el = document.createElement('div');
    document.body.appendChild(el);
    const instance = render(LISTS({ userHistory: false }), el, {
      keyboard: {
        beforeKey: (_e, action) => {
          asked.push(action);
          return action === 'escape' ? false : undefined;
        },
      },
    });
    mounted.push(instance);
    const model = instance.getModel() as unknown as DiagramModel;
    await dragInto(model, 'L1', 'a', 'L3');
    await key('z');
    expect(model.getGroup('L3')!.members.has('a')).toBe(true);
    // a key the board turned off is not asked about: it does not happen
    expect(asked).not.toContain('undo');
    // the page's hook decides the keys the board leaves on: here it keeps Escape from clearing the selection
    model.selectNode(model.getNode('b')!);
    await press('Escape', {});
    expect(asked).toEqual(['escape']);
    expect(model.getSelectedNodes().map((n) => n.id)).toEqual(['b']);
  });

  it('…and keyboard: false from the caller still turns every key off', async () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const instance = render(LISTS({ userHistory: false }), el, { keyboard: false });
    mounted.push(instance);
    const model = instance.getModel() as unknown as DiagramModel;
    model.selectNode(model.getNode('b')!);
    await press('Escape', {});
    expect(model.getSelectedNodes().map((n) => n.id)).toEqual(['b']);
  });

  it('the setting is data: toJSON carries it, and a board rebuilt from it keeps it', () => {
    const { handle } = mount(LISTS({ userHistory: false }));
    const snap = handle.toJSON();
    expect(snap.userHistory).toBe(false);
    expect(dashboard({ ...snap }).renderOptions?.keyboard).toBeDefined();
    expect(LISTS().renderOptions?.keyboard).toBeUndefined();
  });
});
