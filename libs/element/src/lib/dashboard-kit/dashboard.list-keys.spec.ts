/**
 * KEYBOARD MOVES BETWEEN LISTS, AND REFUSALS THAT SAY WHY — what a Kanban
 * board needs so a keyboard user can do what a pointer user does:
 *
 *   Ctrl+← / Ctrl+→  — the focused card to the same index (clamped) of the
 *                      next list on its row; Alt is an alias. A list that
 *                      refuses it, or is full, stops it there: it is never
 *                      passed over.
 *   Ctrl+↑ / Ctrl+↓  — the card one place up or down its own list.
 *   canDrop          — may answer a SENTENCE: the list refuses, the reason is
 *                      spoken and shown on the refused list.
 *
 * Each move is one undo step and an onLayoutChange; plain arrows are as before.
 */
import { CommandManager, DiagramModel, DiagramSerializer, EventBus, NodeModel } from '@grafloria/engine';
import type { CanvasTool, ToolPointerEvent } from '@grafloria/renderer';
import { render } from '../grafloria';
import { fromDocument } from '../load';
import { dashboard, type DashboardHandle, type DashboardOptions, type DashboardSpec, type DashboardWidgetSpec } from './dashboard';
import { liveRegionFor, KEY_REFUSAL_MS } from './keyboard';
import { peersOnCanvasOf } from './grid-binder';

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
type Api = ReturnType<typeof makeApi>;

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
  jest.useRealTimers();
});

const settle = () => new Promise<void>((r) => setTimeout(r, 0));
const card = (id: string, rows = 4): DashboardWidgetSpec => ({ id, kind: 'card', span: 1, rows, title: id.toUpperCase() });
const list = (id: string, title: string, cards: DashboardWidgetSpec[], at: { x?: number; y?: number } = {}): DashboardWidgetSpec => ({
  id, title, span: 4, rows: 40, columns: 1, maxRows: 40, stack: true, movable: 'row', widgets: cards, ...at,
});
/** Three Kanban lists on one row: Backlog holds A, B, C; In progress holds D; Done is empty. */
const LISTS = (extra: Partial<DashboardOptions> = {}, more: DashboardWidgetSpec[] = []) =>
  dashboard({
    columns: 12, gap: 8, width: 1200, height: 800, sizing: 'grow', rowHeight: 8, float: false,
    widgets: [list('L1', 'Backlog', [card('a'), card('b', 6), card('c')]), list('L2', 'In progress', [card('d')]), list('L3', 'Done', []), ...more],
    ...extra,
  });

/** A list's cards, top to bottom. */
const orderOf = (model: DiagramModel, h: DashboardHandle, listId: string): string[] =>
  [...model.getGroup(listId)!.members].sort((p, q) => h.widget(p)!.cell!.y - h.widget(q)!.cell!.y);
/** The card hosts the renderer would mount, so the keyboard has something to focus. */
function hostsFor(api: Api, ids: string[]): Map<string, HTMLElement> {
  const out = new Map<string, HTMLElement>();
  for (const id of ids) {
    const h = document.createElement('div');
    h.className = 'grafloria-node-host';
    h.setAttribute('data-node-id', id);
    api.layer.appendChild(h);
    out.set(id, h);
  }
  return out;
}
const liveText = (api: Api) => Array.from(api.container.querySelectorAll('[aria-live]')).map((el) => el.textContent).join(' ');
/** Press a key on a focused card, and let the move it starts land. */
const press = async (el: HTMLElement, key: string, mods: { ctrl?: boolean; alt?: boolean; shift?: boolean } = {}) => {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: !!mods.ctrl, altKey: !!mods.alt, shiftKey: !!mods.shift, bubbles: true, cancelable: true }));
  await settle();
  await settle();
};
const slabOf = (api: Api, id: string) => api.container.querySelector(`.axdb-slab[data-slab-id="${id}"]`) as HTMLElement;
const whyOf = (api: Api, id: string) => slabOf(api, id).querySelector(':scope > .axdb-slab-why')?.textContent ?? null;
const board = (extra: Partial<DashboardOptions> = {}, more: DashboardWidgetSpec[] = []) => {
  const m = mount(LISTS(extra, more));
  const hosts = hostsFor(m.api, ['a', 'b', 'c', 'd', ...more.flatMap((l) => (l.widgets ?? []).map((w) => w.id))]);
  m.handle.refresh();
  return { ...m, hosts, host: (id: string) => hosts.get(id)! };
};

describe('Ctrl+← and Ctrl+→ — a card to the next list on its row', () => {
  it('Ctrl+→ puts the card at the same index of the next list, as ONE undo step reported through onLayoutChange', async () => {
    const onLayoutChange = jest.fn();
    const { model, api, handle, manager, host } = board({ onLayoutChange });
    await press(host('a'), 'ArrowRight', { ctrl: true });
    expect(orderOf(model, handle, 'L2')).toEqual(['a', 'd']); // index 0 → index 0
    expect(orderOf(model, handle, 'L1')).toEqual(['b', 'c']);
    expect(handle.widget('b')!.cell).toMatchObject({ x: 0, y: 0 }); // the list it left closed up
    expect(liveText(api)).toContain('A moved to In progress, 1 of 2');
    expect(onLayoutChange).toHaveBeenCalled();
    const [viewId, widgets] = onLayoutChange.mock.calls.at(-1)!;
    expect(viewId).toBe('main');
    expect((widgets as DashboardWidgetSpec[]).find((w) => w.id === 'L2')!.widgets!.map((w) => w.id)).toEqual(['a', 'd']);
    await manager.undo();
    await settle();
    expect(orderOf(model, handle, 'L1')).toEqual(['a', 'b', 'c']);
    expect(orderOf(model, handle, 'L2')).toEqual(['d']);
    expect(manager.canUndo()).toBe(false);
  });

  it('the index is clamped to the list it goes to: the third card lands last in a list of one', async () => {
    const { model, handle, host } = board();
    await press(host('c'), 'ArrowRight', { ctrl: true });
    expect(orderOf(model, handle, 'L2')).toEqual(['d', 'c']);
  });

  it('Ctrl+← goes left; at the row\'s end the card stays and is told so', async () => {
    const { model, api, handle, manager, host } = board();
    await press(host('d'), 'ArrowLeft', { ctrl: true });
    expect(orderOf(model, handle, 'L1')).toEqual(['d', 'a', 'b', 'c']);
    await press(host('a'), 'ArrowLeft', { ctrl: true });
    expect(orderOf(model, handle, 'L1')).toEqual(['d', 'a', 'b', 'c']);
    expect(liveText(api)).toContain('A stays in Backlog: no list to the left');
    await manager.undo();
    await settle();
    expect(manager.canUndo()).toBe(false); // the refusal recorded nothing
  });

  it('one press moves the card once, though it reaches the list the card went to after the move has landed', async () => {
    // A real key press runs the microtasks between listeners, and every board
    // listens on the same container: the list the card landed in hears the
    // same press after the move. Dispatching that press again is the same thing.
    const { model, api, handle, host } = board();
    const ev = new KeyboardEvent('keydown', { key: 'ArrowRight', ctrlKey: true, bubbles: true, cancelable: true });
    host('a').dispatchEvent(ev);
    await settle();
    await settle();
    expect(orderOf(model, handle, 'L2')).toEqual(['a', 'd']);
    host('a').dispatchEvent(ev);
    await settle();
    await settle();
    expect(orderOf(model, handle, 'L2')).toEqual(['a', 'd']);
    expect(orderOf(model, handle, 'L3')).toEqual([]);
    expect(liveText(api)).toContain('A moved to In progress, 1 of 2');
  });

  it('a second chord while a move is still landing is ignored, not refused: one move, nothing said against it', async () => {
    const { model, api, handle, host } = board();
    const ev = () => new KeyboardEvent('keydown', { key: 'ArrowRight', ctrlKey: true, bubbles: true, cancelable: true });
    host('a').dispatchEvent(ev());
    host('a').dispatchEvent(ev()); // the same task: the first move has not landed
    await settle();
    await settle();
    expect(orderOf(model, handle, 'L2')).toEqual(['a', 'd']);
    expect(liveText(api)).not.toContain('Cannot move');
  });

  it('a board disposed while the move lands says nothing more and moves no focus, as a plain arrow does', async () => {
    for (const [key, id] of [['ArrowRight', 'a'], ['ArrowDown', 'b']] as const) {
      const { api, handle, host } = board();
      const region = liveRegionFor(api.container);
      const announce = jest.spyOn(region, 'announce');
      const announceError = jest.spyOn(region, 'announceError');
      const focus = jest.spyOn(handle, 'focusWidget');
      host(id).dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true, cancelable: true }));
      handle.dispose(); // the page unmounts the board before the move has landed
      mounted.splice(mounted.indexOf(handle), 1);
      await settle();
      await settle();
      expect(announce).not.toHaveBeenCalled();
      expect(announceError).not.toHaveBeenCalled();
      expect(focus).not.toHaveBeenCalled();
    }
  });

  it('Alt is an alias (a Mac gives Ctrl+arrows to the system)', async () => {
    const { model, handle, host } = board();
    await press(host('b'), 'ArrowRight', { alt: true });
    expect(orderOf(model, handle, 'L2')).toEqual(['d', 'b']);
  });

  it('focus follows the card: it is the tab stop of the list it went to, and keeps DOM focus', async () => {
    const { handle, host } = board();
    host('a').focus();
    await press(host('a'), 'ArrowRight', { ctrl: true });
    expect(handle.binderOf('L2')!.getFocusedWidget()).toBe('a');
    expect(host('a').getAttribute('tabindex')).toBe('0');
    expect(document.activeElement).toBe(host('a'));
    expect(host('d').getAttribute('tabindex')).toBe('-1');
    // Backlog keeps exactly one tab stop of its own
    expect(['b', 'c'].map((id) => host(id).getAttribute('tabindex')).filter((t) => t === '0')).toHaveLength(1);
  });

  it('only lists on the same row: a list below is not beside', async () => {
    const below = list('L4', 'Later', [card('e')], { x: 0, y: 40 });
    const { model, api, handle, host } = board({}, [below]);
    await press(host('e'), 'ArrowRight', { ctrl: true });
    expect(orderOf(model, handle, 'L4')).toEqual(['e']);
    expect(liveText(api)).toContain('E stays in Later: no list to the right');
  });

  it('the row is read on screen: on a right-to-left board → still goes right', async () => {
    const { model, api, handle, host } = board({ rtl: true });
    expect(model.getGroup('L1')!.position.x).toBeGreaterThan(model.getGroup('L2')!.position.x); // Backlog is on the right
    await press(host('a'), 'ArrowRight', { ctrl: true });
    expect(liveText(api)).toContain('A stays in Backlog: no list to the right');
    await press(host('a'), 'ArrowLeft', { ctrl: true });
    expect(orderOf(model, handle, 'L2')).toEqual(['a', 'd']);
  });

  it('a pinned card refuses the keyboard as it refuses the pointer', async () => {
    const { model, api, handle, host } = board();
    handle.widget('a')!.pin(true);
    await press(host('a'), 'ArrowRight', { ctrl: true });
    expect(orderOf(model, handle, 'L1')).toEqual(['a', 'b', 'c']);
    expect(liveText(api)).toContain('A is pinned');
  });

  it('a reloaded document (fromDocument) moves cards by keyboard too', async () => {
    const { model } = mount(LISTS());
    const loaded = fromDocument(JSON.stringify(new DiagramSerializer().serialize(model)));
    const api = makeApi(loaded.model as DiagramModel);
    loaded.finalize(api);
    const h = loaded.handle!;
    const hosts = hostsFor(api, ['a', 'b', 'c', 'd']);
    h.refresh();
    await press(hosts.get('a')!, 'ArrowRight', { ctrl: true });
    expect(orderOf(loaded.model as DiagramModel, h, 'L2')).toEqual(['a', 'd']);
  });
});

describe('the drop policy, asked exactly as a pointer drop asks it', () => {
  it('a refusing list is announced with its reason, the card stays, and the list shows why', async () => {
    const onLayoutChange = jest.fn();
    const canDrop = jest.fn(({ to }: { to: string }) => (to === 'L2' ? 'WIP limit of 1 reached' : true));
    const { model, api, handle, manager, host } = board({ canDrop, onLayoutChange });
    await press(host('a'), 'ArrowRight', { ctrl: true });
    expect(orderOf(model, handle, 'L1')).toEqual(['a', 'b', 'c']);
    expect(liveText(api)).toContain('A stays in Backlog. In progress refuses it: WIP limit of 1 reached');
    expect(canDrop).toHaveBeenCalledWith({ widgetId: 'a', from: 'L1', to: 'L2', viewId: 'main' });
    expect(manager.canUndo()).toBe(false);
    expect(onLayoutChange).not.toHaveBeenCalled();
    // …and the nearest refusing list wears the refusal a drag over it would
    expect(slabOf(api, 'L2').classList.contains('axdb-slab--refused')).toBe(true);
    expect(whyOf(api, 'L2')).toBe('WIP limit of 1 reached');
    expect(slabOf(api, 'L2').getAttribute('title')).toBe('WIP limit of 1 reached');
    // the next key takes it away
    await press(host('a'), 'Shift');
    expect(slabOf(api, 'L2').classList.contains('axdb-slab--refused')).toBe(false);
    expect(whyOf(api, 'L2')).toBeNull();
    expect(slabOf(api, 'L2').hasAttribute('title')).toBe(false);
  });

  it('the refusal it shows goes by itself after a moment', async () => {
    const { api, host } = board({ canDrop: ({ to }) => (to === 'L1' ? true : 'Full') });
    jest.useFakeTimers();
    host('a').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', ctrlKey: true, bubbles: true, cancelable: true }));
    await jest.advanceTimersByTimeAsync(0);
    expect(whyOf(api, 'L2')).toBe('Full');
    await jest.advanceTimersByTimeAsync(KEY_REFUSAL_MS + 10);
    expect(whyOf(api, 'L2')).toBeNull();
    expect(slabOf(api, 'L2').classList.contains('axdb-slab--refused')).toBe(false);
  });

  it('a refusing list is never passed over: the card stays, though the list after it would take it', async () => {
    // On a board whose columns are states, landing two columns on is a state
    // change the person never asked for.
    const onLayoutChange = jest.fn();
    const canDrop = jest.fn(({ to }: { to: string }) => (to === 'L2' ? 'Full' : true));
    const { model, api, handle, manager, host } = board({ canDrop, onLayoutChange });
    await press(host('a'), 'ArrowRight', { ctrl: true });
    expect(orderOf(model, handle, 'L1')).toEqual(['a', 'b', 'c']);
    expect(orderOf(model, handle, 'L3')).toEqual([]);
    expect(liveText(api)).toContain('A stays in Backlog. In progress refuses it: Full');
    expect(liveText(api)).not.toContain('Done');
    expect(canDrop.mock.calls.map((c) => c[0].to)).toEqual(['L2']); // Done is never asked
    expect(manager.canUndo()).toBe(false);
    expect(onLayoutChange).not.toHaveBeenCalled();
    // pressed again, the card is still refused there: it never goes on to Done
    await press(host('a'), 'ArrowRight', { ctrl: true });
    expect(orderOf(model, handle, 'L3')).toEqual([]);
  });

  it('a full list of fixed height refuses as the policy does: "This list is full" is said and shown, and the card stays', async () => {
    const onLayoutChange = jest.fn();
    const full: DashboardWidgetSpec = { ...list('L2', 'In progress', [card('d', 38)]), sizing: 'fit' };
    const m = mount(dashboard({
      columns: 12, gap: 8, width: 1200, height: 800, sizing: 'grow', rowHeight: 8, float: false, onLayoutChange,
      widgets: [list('L1', 'Backlog', [card('a'), card('b', 6), card('c')]), full, list('L3', 'Done', [card('e', 38)])],
    }));
    const hosts = hostsFor(m.api, ['a', 'b', 'c', 'd', 'e']);
    m.handle.refresh();
    await press(hosts.get('a')!, 'ArrowRight', { ctrl: true });
    expect(orderOf(m.model, m.handle, 'L1')).toEqual(['a', 'b', 'c']);
    expect(orderOf(m.model, m.handle, 'L2')).toEqual(['d']);
    expect(orderOf(m.model, m.handle, 'L3')).toEqual(['e']); // not passed over either
    expect(liveText(m.api)).toContain('A stays in Backlog. In progress refuses it: This list is full');
    expect(slabOf(m.api, 'L2').classList.contains('axdb-slab--refused')).toBe(true);
    expect(whyOf(m.api, 'L2')).toBe('This list is full');
    expect(m.manager.canUndo()).toBe(false);
    expect(onLayoutChange).not.toHaveBeenCalled();
    // a list that may grow is never full: Done is as full as In progress, and grows to take D
    await press(hosts.get('d')!, 'ArrowRight', { ctrl: true });
    expect(orderOf(m.model, m.handle, 'L3')).toEqual(['d', 'e']);
  });

  it('false refuses without a reason: the list is named, no reason is shown on its caption', async () => {
    const { model, api, handle, host } = board({ canDrop: ({ to }) => to === 'L1' });
    await press(host('a'), 'ArrowRight', { ctrl: true });
    expect(orderOf(model, handle, 'L1')).toEqual(['a', 'b', 'c']);
    expect(liveText(api)).toContain('A stays in Backlog. In progress refuses it');
    expect(liveText(api)).not.toContain('Done');
    expect(slabOf(api, 'L2').classList.contains('axdb-slab--refused')).toBe(true);
    expect(whyOf(api, 'L2')).toBeNull();
  });
});

describe('Ctrl+↑ and Ctrl+↓ — the card up or down its own list', () => {
  it('Ctrl+↓ moves it one place down: one undo step, reported, announced', async () => {
    const onLayoutChange = jest.fn();
    const { model, api, handle, manager, host } = board({ onLayoutChange });
    await press(host('b'), 'ArrowDown', { ctrl: true });
    expect(orderOf(model, handle, 'L1')).toEqual(['a', 'c', 'b']);
    expect(liveText(api)).toContain('B moved down, 3 of 3');
    expect(onLayoutChange).toHaveBeenCalled();
    await manager.undo();
    await settle();
    expect(orderOf(model, handle, 'L1')).toEqual(['a', 'b', 'c']);
    expect(manager.canUndo()).toBe(false);
  });

  it('Ctrl+↑ moves it one place up, and focus stays on it', async () => {
    const { model, api, handle, host } = board();
    host('c').focus();
    await press(host('c'), 'ArrowUp', { ctrl: true });
    expect(orderOf(model, handle, 'L1')).toEqual(['a', 'c', 'b']);
    expect(liveText(api)).toContain('C moved up, 2 of 3');
    expect(document.activeElement).toBe(host('c'));
  });

  it('at the top or the bottom it says so and nothing moves', async () => {
    const { model, api, handle, manager, host } = board();
    await press(host('a'), 'ArrowUp', { ctrl: true });
    expect(liveText(api)).toContain('A is already first in Backlog');
    await press(host('c'), 'ArrowDown', { ctrl: true });
    expect(liveText(api)).toContain('C is already last in Backlog');
    expect(orderOf(model, handle, 'L1')).toEqual(['a', 'b', 'c']);
    expect(manager.canUndo()).toBe(false);
  });

  it('the drop policy is not asked: a card can always move within the list it is in', async () => {
    const canDrop = jest.fn(() => false);
    const { model, handle, host } = board({ canDrop });
    await press(host('a'), 'ArrowDown', { ctrl: true });
    expect(orderOf(model, handle, 'L1')).toEqual(['b', 'a', 'c']);
    expect(canDrop).not.toHaveBeenCalled();
  });
});

describe('a keyboard move someone else\'s history-free write moved on since', () => {
  it('its undo is refused: the card stays where the other write put it, and the page is told', async () => {
    const onUndoRefused = jest.fn();
    const { model, handle, manager, host } = board({ onUndoRefused });
    await press(host('a'), 'ArrowRight', { ctrl: true });
    expect(orderOf(model, handle, 'L2')).toEqual(['a', 'd']);
    expect(await handle.place('a', 'L3', 0, { history: false })).toBe(true);
    await manager.undo();
    await settle();
    expect(['L1', 'L2', 'L3'].filter((l) => model.getGroup(l)!.members.has('a'))).toEqual(['L3']);
    expect(onUndoRefused).toHaveBeenCalledWith(expect.objectContaining({ widgetId: 'a', boardId: 'L3' }));
  });
});

describe('plain arrows behave as they always did', () => {
  it('a plain → on a list card steps by cells: one column has no cell to the right, so it is refused and stays', async () => {
    const { model, api, handle, manager, host } = board();
    await press(host('a'), 'ArrowRight');
    expect(orderOf(model, handle, 'L1')).toEqual(['a', 'b', 'c']);
    expect(liveText(api)).toContain('Cannot move A right');
    expect(manager.canUndo()).toBe(false);
  });

  it('a stack section of two columns is not a list: Ctrl+→ steps by cells there', async () => {
    const wide: DashboardWidgetSpec = { ...list('W', 'Wide', [card('w1'), card('w2')]), columns: 2 };
    const { model, api, handle, host } = board({}, [{ ...wide, x: 0, y: 40 }]);
    await press(host('w1'), 'ArrowRight', { ctrl: true });
    expect(model.getGroup('W')!.members.has('w1')).toBe(true);
    expect(liveText(api)).toContain('W1 moved to column 2');
    expect(orderOf(model, handle, 'L1')).toEqual(['a', 'b', 'c']);
  });

  it('Ctrl+arrows on a board that is not a list step by cells, as plain arrows do', async () => {
    const { api, handle } = mount(
      dashboard({ width: 1180, widgets: [{ id: 'k1', kind: 'kpi', span: 3, title: 'Revenue' }, { id: 'k2', kind: 'kpi', span: 3, title: 'Customers' }] })
    );
    const hosts = hostsFor(api, ['k1', 'k2']);
    handle.refresh();
    await press(hosts.get('k1')!, 'ArrowRight', { ctrl: true });
    expect(handle.widget('k1')!.cell).toMatchObject({ x: 3, y: 0 });
    expect(liveText(api)).toContain('Revenue moved to column 4, row 1, 3 by 1');
  });
});

/** Press card `id` in list `from` and carry it over list `to`, in several moves: answers the release. */
const carry = (model: DiagramModel, from: string, id: string, to: string) => {
  const tool = toolOf(from);
  const node = model.getNode(id)!;
  const hit = { node, empty: false };
  const a = { x: node.position.x + node.size.width / 2, y: node.position.y + node.size.height / 2 };
  const g = model.getGroup(to)!;
  const b = { x: g.position.x + g.size!.width / 2, y: g.position.y + 60 };
  tool.onPointerDown?.(tev('down', a.x, a.y), hit);
  tool.onPointerMove?.(tev('move', a.x + 20, a.y + 20), hit);
  for (let i = 1; i <= 6; i++) tool.onPointerMove?.(tev('move', a.x + ((b.x - a.x) * i) / 6, a.y + ((b.y - a.y) * i) / 6), hit);
  for (let i = 1; i <= 3; i++) tool.onPointerMove?.(tev('move', b.x, b.y + 10 * i), hit); // wander over it
  return async () => {
    tool.onPointerUp?.(tev('up', b.x, b.y + 30), hit);
    await settle();
  };
};

describe('canDrop may answer a sentence — the pointer', () => {
  it('a sentence refuses the drop as false does: the card snaps home, with no undo step', async () => {
    const { model, handle, manager } = board({ canDrop: ({ to }) => (to === 'L2' ? 'WIP limit of 1 reached' : true) });
    await carry(model, 'L1', 'a', 'L2')();
    expect(orderOf(model, handle, 'L1')).toEqual(['a', 'b', 'c']);
    expect(orderOf(model, handle, 'L2')).toEqual(['d']);
    expect(manager.canUndo()).toBe(false);
  });

  it('while the hand is over it, the refusing list shows the reason as its title, and says it once', async () => {
    const { model, api } = board({ canDrop: ({ to }) => (to === 'L2' ? 'WIP limit of 1 reached' : true) });
    const announce = jest.spyOn(liveRegionFor(api.container), 'announce');
    const release = carry(model, 'L1', 'a', 'L2');
    expect(slabOf(api, 'L2').classList.contains('axdb-slab--refused')).toBe(true);
    expect(whyOf(api, 'L2')).toBe('WIP limit of 1 reached');
    expect(slabOf(api, 'L2').getAttribute('title')).toBe('WIP limit of 1 reached');
    const said = announce.mock.calls.map((c) => c[0]).filter((m) => m.includes('refuses'));
    expect(said).toEqual(['In progress refuses A: WIP limit of 1 reached']);
    await release();
    expect(whyOf(api, 'L2')).toBeNull();
    expect(slabOf(api, 'L2').hasAttribute('title')).toBe(false);
  });

  it('false still refuses in silence: the ring, no reason shown, nothing said', async () => {
    const { model, api } = board({ canDrop: ({ to }) => to !== 'L2' });
    const announce = jest.spyOn(liveRegionFor(api.container), 'announce');
    const release = carry(model, 'L1', 'a', 'L2');
    expect(slabOf(api, 'L2').classList.contains('axdb-slab--refused')).toBe(true);
    expect(whyOf(api, 'L2')).toBeNull();
    expect(slabOf(api, 'L2').hasAttribute('title')).toBe(false);
    expect(announce.mock.calls.some((c) => c[0].includes('refuses'))).toBe(false);
    await release();
  });
});

describe('a full list of fixed height — the pointer', () => {
  /** Backlog holds A, B, C; In progress is a list of fixed height its one card fills; Done may grow and is as full. */
  const FULL = (extra: Partial<DashboardOptions> = {}) => {
    const m = mount(dashboard({
      columns: 12, gap: 8, width: 1200, height: 800, sizing: 'grow', rowHeight: 8, float: false, ...extra,
      widgets: [list('L1', 'Backlog', [card('a'), card('b', 6), card('c')]), { ...list('L2', 'In progress', [card('d', 38)]), sizing: 'fit' }, list('L3', 'Done', [card('e', 38)])],
    }));
    hostsFor(m.api, ['a', 'b', 'c', 'd', 'e']);
    m.handle.refresh();
    return m;
  };

  it('a card carried over it is refused as the keyboard is: "This list is full" is shown and said once, and the card dims', async () => {
    const { model, api } = FULL();
    const announce = jest.spyOn(liveRegionFor(api.container), 'announce');
    const release = carry(model, 'L1', 'a', 'L2');
    expect(slabOf(api, 'L2').classList.contains('axdb-slab--refused')).toBe(true);
    expect(whyOf(api, 'L2')).toBe('This list is full');
    expect(slabOf(api, 'L2').getAttribute('title')).toBe('This list is full');
    expect(announce.mock.calls.map((c) => c[0]).filter((m) => m.includes('refuses'))).toEqual(['In progress refuses A: This list is full']);
    // the main board took nothing beside the columns while the hand was there
    expect(model.getGroup('main')!.members.has('a')).toBe(false);
    await release();
    expect(whyOf(api, 'L2')).toBeNull();
  });

  it('the list is found full once a gesture: the hand wandering over it does not ask it again', async () => {
    const { model, api } = FULL();
    const peer = [...peersOnCanvasOf(api.container)].find((p) => p.group.id === 'L2')!;
    const adopt = jest.spyOn(peer, 'adopt');
    const release = carry(model, 'L1', 'a', 'L2');
    expect(adopt).toHaveBeenCalledTimes(1);
    await release();
  });

  it('released there, the card snaps home: it never drops onto the main board beside the columns', async () => {
    const onLayoutChange = jest.fn();
    const { model, handle, manager } = FULL({ onLayoutChange });
    const home = handle.widget('a')!.cell;
    await carry(model, 'L1', 'a', 'L2')();
    expect(orderOf(model, handle, 'L1')).toEqual(['a', 'b', 'c']);
    expect(handle.widget('a')!.cell).toEqual(home);
    expect(orderOf(model, handle, 'L2')).toEqual(['d']);
    expect(model.getGroup('main')!.members.has('a')).toBe(false);
    expect(manager.canUndo()).toBe(false);
    expect(onLayoutChange).not.toHaveBeenCalled();
  });

  it('a list that may grow is never full: Done takes the card, growing', async () => {
    const { model, handle } = FULL();
    await carry(model, 'L1', 'a', 'L3')();
    expect(model.getGroup('L3')!.members.has('a')).toBe(true);
    expect(orderOf(model, handle, 'L1')).toEqual(['b', 'c']);
  });

  it('a full section that is not a list is pushed by the card as before (D2): only a list refuses for being full', async () => {
    const m = mount(dashboard({
      columns: 12, gap: 8, width: 1200, height: 800, sizing: 'grow', rowHeight: 8, float: false,
      widgets: [list('L1', 'Backlog', [card('a'), card('b', 6), card('c')]), { id: 'S', title: 'Charts', span: 4, rows: 10, columns: 4, maxRows: 10, sizing: 'fit', widgets: [{ id: 'k', kind: 'kpi', span: 4, rows: 10 }] }],
    }));
    hostsFor(m.api, ['a', 'b', 'c', 'k']);
    m.handle.refresh();
    const release = carry(m.model, 'L1', 'a', 'S');
    expect(whyOf(m.api, 'S')).toBeNull();
    await release();
    expect(m.model.getGroup('main')!.members.has('a')).toBe(true);
  });
});

describe('a rendered board: the keys and the user history together', () => {
  /** A board rendered for real, so the renderer's own keys and hosts are live. */
  const renderBoard = (extra: Partial<DashboardOptions>) => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const spec = LISTS(extra);
    const instance = render(spec, el);
    mounted.push(instance);
    return { el, handle: spec.handle, model: instance.getModel() as unknown as DiagramModel };
  };
  const hostIn = (el: HTMLElement, id: string) => el.querySelector(`.grafloria-node-host[data-node-id="${id}"]`) as HTMLElement;
  const ctrlZ = async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
    await settle();
    await settle();
  };

  it('by default Ctrl+Z puts a keyboard move back, as it puts a drag back', async () => {
    const { el, model, handle } = renderBoard({});
    hostIn(el, 'a').focus();
    await press(hostIn(el, 'a'), 'ArrowRight', { ctrl: true });
    expect(orderOf(model, handle, 'L2')).toEqual(['a', 'd']);
    expect(document.activeElement).toBe(hostIn(el, 'a')); // focus followed the card on the real renderer too
    await ctrlZ();
    expect(orderOf(model, handle, 'L1')).toEqual(['a', 'b', 'c']);
  });

  it('with userHistory: false the move stays: Ctrl+Z does nothing on the board', async () => {
    const onLayoutChange = jest.fn();
    const { el, model, handle } = renderBoard({ userHistory: false, onLayoutChange });
    await press(hostIn(el, 'a'), 'ArrowRight', { ctrl: true });
    expect(orderOf(model, handle, 'L2')).toEqual(['a', 'd']);
    const reported = onLayoutChange.mock.calls.length;
    expect(reported).toBeGreaterThan(0);
    await ctrlZ();
    expect(orderOf(model, handle, 'L2')).toEqual(['a', 'd']);
    expect(onLayoutChange).toHaveBeenCalledTimes(reported);
  });
});
