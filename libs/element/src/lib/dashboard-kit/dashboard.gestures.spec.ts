/**
 * A DASHBOARD OWNS ITS CONTAINER GESTURES.
 *
 * Boards, tab groups and pages are diagram groups, and the kit drives every
 * press, drag and drop on them itself — which board a widget lands on, a tab
 * group moved by its strip, a pane torn out at an edge. The diagram's generic
 * group gestures (pick a zone up and drag it; drop a box out of a zone and it
 * leaves) became the defaults, and the generic zone drag grabbed presses the
 * kit owns: eight kit-lab scenarios broke on split boards (L82 … L109). The kit
 * turns the generic ones off where it binds a board.
 */
import { CommandManager, DiagramModel, EventBus, NodeModel } from '@grafloria/engine';
import type { CanvasTool, ToolPointerEvent } from '@grafloria/renderer';
import { render } from '../grafloria';
import { dashboard, type DashboardHandle, type DashboardOptions, type DashboardSpec, type DashboardWidgetSpec } from './dashboard';

// The binder's tool registration is captured so a spec can drive a drag
// directly (no renderer routes pointer events in jsdom); it still registers.
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

describe('a dashboard turns the generic group gestures off for its canvas', () => {
  const mount = (layout: 'grid' | 'split') => {
    const el = document.createElement('div');
    el.style.width = '900px';
    el.style.height = '600px';
    document.body.appendChild(el);
    const api = render(dashboard({ layout, widgets: [{ id: 'a', kind: 'kpi' }, { id: 'b', kind: 'line' }] }) as never, el) as unknown as {
      getEngine(): { getInteractionConfig(): { enableGroupDrag?: boolean; enableGroupMembershipOnDrop?: boolean } };
    };
    return { api, el };
  };

  for (const layout of ['grid', 'split'] as const) {
    it(`${layout} board: no generic zone drag, no generic drop-to-join — the kit's own gestures decide`, () => {
      const { api, el } = mount(layout);
      const config = api.getEngine().getInteractionConfig();
      expect(config.enableGroupDrag).toBe(false);
      expect(config.enableGroupMembershipOnDrop).toBe(false);
      el.remove();
    });
  }
});

describe('disposing the instance disposes the board', () => {
  // The board's tools are process-wide and its listeners sit on the host
  // element, which outlives the instance. Left registered, a disposed board
  // kept claiming presses on the next board mounted in that element: React
  // StrictMode's double mount sent drags to a dead history, made split
  // dividers inert and painted section chrome twice.
  const { listTools } = jest.requireActual('@grafloria/renderer') as typeof import('@grafloria/renderer');
  const dashTools = () => listTools().filter((id) => id.startsWith('dashboard-'));
  for (const layout of ['grid', 'split'] as const) {
    it(`${layout}: instance.dispose() unregisters the board's tools; a re-mount in the same element owns one set`, () => {
      const el = document.createElement('div');
      document.body.appendChild(el);
      const before = dashTools().length;
      const widgets = [{ id: 'a', kind: 'kpi' }, { id: 'b', kind: 'line' }];
      const first = render(dashboard({ layout, widgets }) as never, el);
      expect(dashTools().length - before).toBe(1);
      first.dispose();
      expect(dashTools().length).toBe(before);
      const second = render(dashboard({ layout, widgets }) as never, el);
      expect(dashTools().length - before).toBe(1);
      second.dispose();
      second.dispose(); // idempotent
      expect(dashTools().length).toBe(before);
      el.remove();
    });
  }
});

/**
 * DROP TARGETS OUTSIDE THE CANVAS (`dropOut`). A taskboard's planning pane
 * lists the releases beside the board, and a card dragged onto one moves to
 * that release: the page's markup, not a board. The kit asks the page for its
 * zone under the hand while a widget is held off every board, and a release
 * over a zone that takes it snaps the card home and tells the page.
 */
describe('dropOut: page zones outside every board', () => {
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
  const mounted: DashboardHandle[] = [];
  afterEach(() => {
    for (const h of mounted.splice(0)) h.dispose();
    document.body.innerHTML = '';
  });
  const mount = (spec: DashboardSpec) => {
    const model = new DiagramModel('dash');
    for (const n of spec.nodes) {
      const raw = n as { id: string; position: { x: number; y: number }; size: { width: number; height: number }; metadata: Record<string, unknown> };
      const node = new NodeModel({ id: raw.id, type: 'widget', position: { ...raw.position }, size: { ...raw.size, depth: 0 } });
      for (const [k, v] of Object.entries(raw.metadata)) node.setMetadata(k, v);
      model.addNode(node);
    }
    const bus = new EventBus();
    const manager = new CommandManager({ diagram: model, eventBus: bus });
    const container = document.createElement('div');
    document.body.appendChild(container);
    const layer = document.createElement('div');
    layer.className = 'grafloria-html-layer';
    container.appendChild(layer);
    const api = {
      getModel: () => model,
      getEngine: () => ({ commandManager: manager, eventBus: bus }),
      container,
      render: () => undefined,
      renderNow: () => undefined,
      viewport: { fitToBounds: () => undefined, clientToWorld: (x: number, y: number) => ({ x, y }) },
    };
    spec.finalize(api);
    mounted.push(spec.handle as DashboardHandle);
    return { model, api, manager, handle: spec.handle as DashboardHandle };
  };
  const settle = () => new Promise<void>((r) => setTimeout(r, 0));
  const card = (id: string): DashboardWidgetSpec => ({ id, kind: 'card', span: 1, rows: 3 });
  /** The board is 1200 wide (x 0–1200); the page's pane is far to its right: two release cards, and blank pane below them. */
  const ZONES = { x: 2000 };
  const releaseAt = (zone: 'r1' | 'r2' | 'blank') => ({ x: ZONES.x + 40, y: zone === 'r1' ? 100 : zone === 'r2' ? 300 : 700 });
  const zoneAtPoint = ({ client }: { client: { x: number; y: number } }): string | null =>
    client.x < ZONES.x ? null : client.y < 200 ? 'r1' : client.y < 400 ? 'r2' : null;
  /** Two lists and a pinned head card that may be lifted (Atloria's row head). */
  const BOARD = (extra: Partial<DashboardOptions> = {}) =>
    dashboard({
      columns: 12, gap: 8, width: 1200, height: 800, sizing: 'grow', rowHeight: 8, float: false,
      widgets: [
        { id: 'A', span: 4, rows: 24, columns: 1, maxRows: 24, pinned: true, stack: true, widgets: [card('a1'), card('a2')] },
        { id: 'B', span: 4, rows: 24, columns: 1, maxRows: 24, pinned: true, stack: true, widgets: [card('b1')] },
        { id: 'head', kind: 'card', span: 4, rows: 3, pinned: true, movable: true },
      ],
      ...extra,
    });
  const centre = (model: DiagramModel, id: string) => {
    const e = model.getNode(id) ?? model.getGroup(id)!;
    return { x: e.position.x + e.size!.width / 2, y: e.position.y + e.size!.height / 2 };
  };
  /** A hand drag of `id` (on board `from`) through each point of `path`, released at the last one. */
  const drag = async (model: DiagramModel, from: string, id: string, path: Array<{ x: number; y: number }>) => {
    const tool = toolOf(from);
    const hit = { node: model.getNode(id)!, empty: false };
    let at = centre(model, id);
    tool.onPointerDown?.(tev('down', at.x, at.y), hit);
    tool.onPointerMove?.(tev('move', at.x + 10, at.y + 10), hit);
    for (const to of path) {
      for (let i = 1; i <= 6; i++) tool.onPointerMove?.(tev('move', at.x + ((to.x - at.x) * i) / 6, at.y + ((to.y - at.y) * i) / 6), hit);
      at = to;
    }
    tool.onPointerUp?.(tev('up', at.x, at.y), hit);
    await settle();
  };
  const liveText = (api: { container: HTMLElement }) => Array.from(api.container.querySelectorAll('[aria-live]')).map((el) => el.textContent).join(' ');

  it('a card released over a zone: onDropOut with that zone, the card back on its cell, no undo step, no onLayoutChange', async () => {
    const onDropOut = jest.fn();
    const onLayoutChange = jest.fn();
    const { model, manager, handle } = mount(BOARD({ dropOut: { zoneAt: zoneAtPoint, onDropOut }, onLayoutChange }));
    const cell = handle.widget('a1')!.cell;
    const pos = { ...model.getNode('a1')!.position };
    await drag(model, 'A', 'a1', [releaseAt('r1')]);
    expect(onDropOut).toHaveBeenCalledTimes(1);
    expect(onDropOut).toHaveBeenCalledWith({ widgetId: 'a1', zone: 'r1', viewId: 'main' });
    expect(model.getGroup('A')!.members.has('a1')).toBe(true);
    expect(handle.widget('a1')!.cell).toEqual(cell);
    expect(model.getNode('a1')!.position).toEqual(pos);
    expect(manager.canUndo()).toBe(false);
    await settle();
    expect(onLayoutChange).not.toHaveBeenCalled();
  });

  it('released outside with no zone under it: home, and no call', async () => {
    const onDropOut = jest.fn();
    const { model, manager, handle } = mount(BOARD({ dropOut: { zoneAt: zoneAtPoint, onDropOut } }));
    const cell = handle.widget('a1')!.cell;
    await drag(model, 'A', 'a1', [releaseAt('r1'), releaseAt('blank')]);
    expect(onDropOut).not.toHaveBeenCalled();
    expect(model.getGroup('A')!.members.has('a1')).toBe(true);
    expect(handle.widget('a1')!.cell).toEqual(cell);
    expect(manager.canUndo()).toBe(false);
  });

  it('the hand passes over a board that refused the card, then leaves to a zone: still onDropOut', async () => {
    const onDropOut = jest.fn();
    const { model, handle } = mount(BOARD({ canDrop: ({ to }) => to !== 'B', dropOut: { zoneAt: zoneAtPoint, onDropOut } }));
    await drag(model, 'A', 'a1', [centre(model, 'b1'), releaseAt('r2')]);
    expect(onDropOut).toHaveBeenCalledWith({ widgetId: 'a1', zone: 'r2', viewId: 'main' });
    expect(model.getGroup('A')!.members.has('a1')).toBe(true);
    expect(handle.widget('a1')!.cell).toEqual({ x: 0, y: 0, w: 1, h: 3 });
  });

  it('canDropOut refusing with a sentence: the sentence is read out, and a release there snaps home without a call', async () => {
    const onDropOut = jest.fn();
    const onZoneHover = jest.fn();
    const canDropOut = jest.fn(({ zone }: { zone: string }) => (zone === 'r2' ? 'Release 2 is closed' : true));
    const { model, api, handle } = mount(BOARD({ dropOut: { zoneAt: zoneAtPoint, canDropOut, onDropOut, onZoneHover } }));
    await drag(model, 'A', 'a1', [releaseAt('r2')]);
    expect(liveText(api)).toContain('Release 2 is closed');
    expect(onZoneHover).toHaveBeenCalledWith({ widgetId: 'a1', zone: 'r2', refusal: 'Release 2 is closed' });
    expect(onDropOut).not.toHaveBeenCalled();
    expect(model.getGroup('A')!.members.has('a1')).toBe(true);
    expect(handle.widget('a1')!.cell).toEqual({ x: 0, y: 0, w: 1, h: 3 });
    // asked once for that zone, however long the hand stayed
    expect(canDropOut.mock.calls.filter((c) => c[0].zone === 'r2')).toHaveLength(1);
  });

  it('onZoneHover reports entering, changing and leaving zones, and null at release', async () => {
    const zones: Array<string | null> = [];
    const { model } = mount(BOARD({ dropOut: { zoneAt: zoneAtPoint, onDropOut: () => undefined, onZoneHover: ({ zone }) => zones.push(zone) } }));
    await drag(model, 'A', 'a1', [releaseAt('r1'), releaseAt('r2'), releaseAt('blank'), centre(model, 'b1'), releaseAt('r1')]);
    expect(zones).toEqual(['r1', 'r2', null, 'r1', null]);
  });

  it('a widget every canDrop refuses — a pinned head that may be lifted — is still dragged out to a zone, and never moves on a board', async () => {
    const onDropOut = jest.fn();
    const { model, manager, handle } = mount(BOARD({ canDrop: () => false, dropOut: { zoneAt: zoneAtPoint, onDropOut } }));
    const cell = handle.widget('head')!.cell;
    const others = ['A', 'B'].map((id) => (handle.binderOf('main') as unknown as { cellOf(id: string): unknown }).cellOf(id));
    await drag(model, 'main', 'head', [centre(model, 'A'), releaseAt('r1')]);
    expect(onDropOut).toHaveBeenCalledWith({ widgetId: 'head', zone: 'r1', viewId: 'main' });
    expect(handle.widget('head')!.cell).toEqual(cell);
    expect(['A', 'B'].map((id) => (handle.binderOf('main') as unknown as { cellOf(id: string): unknown }).cellOf(id))).toEqual(others);
    expect(manager.canUndo()).toBe(false);
    // released anywhere but a zone it just goes home: pinned is pinned
    await drag(model, 'main', 'head', [{ x: 600, y: 300 }]);
    expect(handle.widget('head')!.cell).toEqual(cell);
    expect(manager.canUndo()).toBe(false);
  });

  it('zoneAt is never asked while the hand is over a board', async () => {
    const zoneAt = jest.fn(zoneAtPoint);
    const { model } = mount(BOARD({ dropOut: { zoneAt, onDropOut: () => undefined } }));
    await drag(model, 'A', 'a1', [centre(model, 'b1'), { x: 1100, y: 150 }, centre(model, 'a2')]);
    expect(zoneAt).not.toHaveBeenCalled();
    await drag(model, 'A', 'a1', [centre(model, 'b1'), releaseAt('r1')]);
    expect(zoneAt).toHaveBeenCalled();
    const view = model.getGroup('main')!;
    const right = view.position.x + view.size!.width;
    for (const [e] of zoneAt.mock.calls) expect(e.client.x).toBeGreaterThan(right);
  });
});
