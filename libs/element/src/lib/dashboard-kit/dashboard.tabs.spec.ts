/**
 * TAB CONTAINERS (element 0.4.27) — `layout: 'tabs'` makes every child that
 * carries `widgets` a PAGE: one visible at a time, a strip of tabs across the
 * top, the active page persisted. DevExpress ships this as its Tab Container.
 */
import { CommandManager, DiagramModel, DiagramSerializer, EventBus, NodeModel } from '@grafloria/engine';
import { dashboard, type DashboardHandle, type DashboardSpec, type DashboardWidgetSpec } from './dashboard';
import type { CanvasTool, ToolPointerEvent } from '@grafloria/renderer';

// The binder claims widget gestures through the renderer's page-global tool
// registry; there is no renderer here to route pointer events to it, so the
// registration is wrapped and the tool driven directly.
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
  return { model, api, handle: spec.handle as DashboardHandle };
}

const PAGE = (id: string, title: string, kid: string): DashboardWidgetSpec => ({
  id,
  title,
  columns: 6,
  widgets: [{ id: kid, kind: 'kpi', span: 6, rows: 4, x: 0, y: 0 }],
});

const BOARD = (active?: string, onTabChange?: (c: string, p: string, v: string) => void) =>
  dashboard({
    columns: 12,
    width: 1200,
    height: 600,
    gap: 10,
    rowHeight: 60,
    ...(onTabChange ? { onTabChange } : {}),
    widgets: [
      { id: 'free', kind: 'line', span: 6, rows: 4, x: 0, y: 0 },
      {
        id: 'panel',
        title: 'Side panel',
        span: 6,
        rows: 4,
        x: 6,
        y: 0,
        layout: 'tabs',
        ...(active ? { active } : {}),
        widgets: [PAGE('p-one', 'Filters', 'k-one'), PAGE('p-two', 'Alerts', 'k-two'), PAGE('p-three', 'Notes', 'k-three')],
      },
    ],
  });

const PARKED = -10000;
const onCanvas = (model: DiagramModel, ids: string[]) => ids.filter((id) => (model.getNode(id)?.position.x ?? PARKED) > PARKED);
const strip = (api: { container: HTMLElement }) => api.container.querySelector('.axdb-tabs[data-tabs-id="panel"]') as HTMLElement | null;
const tabs = (api: { container: HTMLElement }) =>
  Array.from(strip(api)?.querySelectorAll('.axdb-tab') ?? []).map((t) => ({
    id: t.getAttribute('data-tab-id'),
    label: t.textContent,
    on: t.getAttribute('aria-selected') === 'true',
  }));

const mounted: DashboardHandle[] = [];
const up = (spec: DashboardSpec) => {
  const m = mount(spec);
  mounted.push(m.handle);
  return m;
};
afterEach(() => {
  for (const h of mounted.splice(0)) h.dispose();
  document.body.innerHTML = '';
});

describe('tab containers', () => {
  it('mounts one page at a time, with a tab per page', () => {
    const { api, model, handle } = up(BOARD());
    expect(tabs(api).map((t) => t.label)).toEqual(['Filters', 'Alerts', 'Notes']);
    expect(tabs(api).filter((t) => t.on).map((t) => t.id)).toEqual(['p-one']);
    expect(handle.getActiveTab('panel')).toBe('p-one');
    // only the active page's widget is on the canvas; the rest are parked
    expect(onCanvas(model, ['k-one', 'k-two', 'k-three'])).toEqual(['k-one']);
    expect(strip(api)!.getAttribute('role')).toBe('tablist');
  });

  it('honours an authored `active`, and falls back to the first page when it is not one', () => {
    expect(up(BOARD('p-three')).handle.getActiveTab('panel')).toBe('p-three');
    expect(up(BOARD('nope')).handle.getActiveTab('panel')).toBe('p-one');
  });

  it('a click on a tab switches the page and reports it', () => {
    const onTabChange = jest.fn();
    const { api, model, handle } = up(BOARD(undefined, onTabChange));
    (strip(api)!.querySelector('.axdb-tab[data-tab-id="p-two"]') as HTMLButtonElement).click();
    expect(handle.getActiveTab('panel')).toBe('p-two');
    expect(onCanvas(model, ['k-one', 'k-two', 'k-three'])).toEqual(['k-two']);
    expect(tabs(api).filter((t) => t.on).map((t) => t.id)).toEqual(['p-two']);
    expect(onTabChange).toHaveBeenCalledWith('panel', 'p-two', 'main');
    // …and the same page again is a no-op, not a second report
    (strip(api)!.querySelector('.axdb-tab[data-tab-id="p-two"]') as HTMLButtonElement).click();
    expect(onTabChange).toHaveBeenCalledTimes(1);
  });

  it('activateTab drives it from code and refuses what is not a page', () => {
    const { model, handle } = up(BOARD());
    expect(handle.activateTab('panel', 'p-three')).toBe(true);
    expect(onCanvas(model, ['k-one', 'k-two', 'k-three'])).toEqual(['k-three']);
    expect(handle.activateTab('panel', 'k-one')).toBe(false); // a widget, not a page
    expect(handle.activateTab('panel', 'nope')).toBe(false);
    expect(handle.activateTab('free', 'p-one')).toBe(false); // not a tab container
    expect(handle.getActiveTab('panel')).toBe('p-three');
    expect(handle.getActiveTab('free')).toBeUndefined();
  });

  it('the page showing survives toJSON → dashboard() and a serialized document', () => {
    const first = up(BOARD());
    first.handle.activateTab('panel', 'p-two');
    const snap = first.handle.toJSON();
    const panel = snap.views[0].widgets.find((w) => w.id === 'panel')!;
    expect(panel.layout).toBe('tabs');
    expect(panel.active).toBe('p-two');
    expect(panel.widgets?.map((p) => p.id)).toEqual(['p-one', 'p-two', 'p-three']);

    const second = up(dashboard({ ...snap }));
    expect(second.handle.getActiveTab('panel')).toBe('p-two');
    expect(onCanvas(second.model, ['k-one', 'k-two', 'k-three'])).toEqual(['k-two']);

    const json = JSON.stringify(new DiagramSerializer().serialize(first.model));
    const loaded = fromDocument(json);
    const api = makeApi(loaded.model as DiagramModel);
    loaded.finalize(api);
    mounted.push(loaded.handle as DashboardHandle);
    expect(loaded.handle!.getActiveTab('panel')).toBe('p-two');
    expect(loaded.handle!.getLayout('panel')).toBe('tabs');
  });

  it('the strip is one tab stop: only the active tab is reachable by Tab', () => {
    const { api } = up(BOARD('p-two'));
    const stops = Array.from(strip(api)!.querySelectorAll('.axdb-tab')).map((t) => (t as HTMLButtonElement).tabIndex);
    expect(stops).toEqual([-1, 0, -1]);
  });

  it('a plain widget among the pages becomes a page of its own', () => {
    const { api, model, handle } = up(
      dashboard({
        columns: 12,
        width: 1200,
        height: 600,
        rowHeight: 60,
        widgets: [
          {
            id: 'panel',
            title: 'Mixed',
            span: 12,
            rows: 4,
            x: 0,
            y: 0,
            layout: 'tabs',
            widgets: [PAGE('p-one', 'Filters', 'k-one'), { id: 'loose', kind: 'kpi', title: 'Loose', span: 6, rows: 4 }],
          },
        ],
      })
    );
    // it gets a tab of its own, named by its title…
    expect(tabs(api).map((t) => t.label)).toEqual(['Filters', 'Loose']);
    // …and it is laid out like any page instead of being stranded at the
    // board origin at its placeholder size, which is what used to happen
    expect(handle.activateTab('panel', 'loose__page')).toBe(true);
    const w = model.getNode('loose')!;
    expect(w.position.x).toBeGreaterThan(PARKED);
    expect(w.size!.width).toBeGreaterThan(200);
  });

  it('a wrapped plain child keeps the authored order among real pages', () => {
    const { api } = up(
      dashboard({
        columns: 12,
        width: 1200,
        height: 600,
        rowHeight: 60,
        widgets: [
          {
            id: 'panel',
            title: 'Mixed',
            span: 12,
            rows: 4,
            x: 0,
            y: 0,
            layout: 'tabs',
            // the PLAIN child is declared FIRST, and is wrapped as `loose__page`
            widgets: [{ id: 'loose', kind: 'kpi', title: 'Loose', span: 6, rows: 4 }, PAGE('p-one', 'Filters', 'k-one')],
          },
        ],
      })
    );
    expect(tabs(api).map((t) => t.label)).toEqual(['Loose', 'Filters']);
  });

  it('a tab container whose children are ALL plain widgets still works', () => {
    const { api, model } = up(
      dashboard({
        columns: 12,
        width: 1200,
        height: 600,
        rowHeight: 60,
        widgets: [
          { id: 'panel', title: 'All plain', span: 12, rows: 4, x: 0, y: 0, layout: 'tabs', widgets: [
            { id: 'w1', kind: 'kpi', title: 'One', span: 12, rows: 4 },
            { id: 'w2', kind: 'kpi', title: 'Two', span: 12, rows: 4 },
          ] },
        ],
      })
    );
    expect(tabs(api).map((t) => t.label)).toEqual(['One', 'Two']);
    expect(model.getNode('w1')!.size!.width).toBeGreaterThan(200);
  });

  it('the tabs come from LIVE membership, so a page that leaves takes its tab with it', () => {
    const { api, model, handle } = up(BOARD());
    expect(tabs(api).map((t) => t.label)).toEqual(['Filters', 'Alerts', 'Notes']);
    // tear p-two out of the container the way a drop on the parent board does
    model.getGroup('panel')!.removeMember('p-two');
    expect(tabs(api).map((t) => t.label)).toEqual(['Filters', 'Notes']);
    expect(handle.getActiveTab('panel')).toBe('p-one');
  });

  it('a DRAG on a tab is not a click: the page does not switch', () => {
    const { api, handle } = up(BOARD());
    const tab = strip(api)!.querySelector('.axdb-tab[data-tab-id="p-three"]') as HTMLElement;
    const at = (el: HTMLElement, type: string, x: number) =>
      el.dispatchEvent(
        Object.assign(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: 10 }), { pointerId: 1 })
      );
    at(tab, 'pointerdown', 100);
    at(tab, 'pointermove', 140); // well past the threshold
    at(tab, 'pointerup', 140);
    (tab as HTMLButtonElement).click();
    expect(handle.getActiveTab('panel')).toBe('p-one');
    // …while a press that does NOT travel is still a plain click
    const near = strip(api)!.querySelector('.axdb-tab[data-tab-id="p-two"]') as HTMLElement;
    at(near, 'pointerdown', 60);
    at(near, 'pointerup', 61);
    (near as HTMLButtonElement).click();
    expect(handle.getActiveTab('panel')).toBe('p-two');
  });

  it('a drag the board REFUSES leaves the press a plain click', () => {
    // A split board cannot place a torn-out page, so it refuses the gesture —
    // and a refused drag must not swallow the click, or a tab container on a
    // split pane would stop switching pages altogether.
    const { api, handle } = up(
      dashboard({
        columns: 12,
        width: 1200,
        height: 600,
        rowHeight: 60,
        layout: 'split',
        widgets: [
          { id: 'other', kind: 'kpi', span: 6, rows: 4, x: 0, y: 0 },
          {
            id: 'panel',
            title: 'Side panel',
            span: 6,
            rows: 4,
            x: 6,
            y: 0,
            layout: 'tabs',
            widgets: [PAGE('p-one', 'Filters', 'k-one'), PAGE('p-two', 'Alerts', 'k-two')],
          },
        ],
      })
    );
    const tab = strip(api)!.querySelector('.axdb-tab[data-tab-id="p-two"]') as HTMLElement;
    const at = (type: string, x: number) =>
      tab.dispatchEvent(
        Object.assign(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: 10 }), { pointerId: 1 })
      );
    at('pointerdown', 100);
    at('pointermove', 140);
    at('pointerup', 140);
    (tab as HTMLButtonElement).click();
    expect(handle.getActiveTab('panel')).toBe('p-two');
  });

  // -- tearing a tab out: VS Code's "drag a tab out and it becomes a group of its own" --
  // The board commits through the command manager, which settles a task later.
  const settle = () => new Promise<void>((r) => setTimeout(r, 0));
  const dragTab = async (api: { container: HTMLElement }, containerId: string, pageId: string, to: { x: number; y: number }) => {
    const tab = api.container.querySelector(`.axdb-tabs[data-tabs-id="${containerId}"] .axdb-tab[data-tab-id="${pageId}"]`) as HTMLElement;
    const ev = (el: EventTarget, type: string, x: number, y: number) =>
      el.dispatchEvent(Object.assign(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y }), { pointerId: 1 }));
    ev(tab, 'pointerdown', 700, 10);
    ev(tab, 'pointermove', 700 - 40, 10); // past the threshold: the strip hands the press to the board
    ev(window, 'pointermove', to.x, to.y);
    ev(window, 'pointerup', to.x, to.y);
    tab.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await settle();
  };
  const stripOf = (api: { container: HTMLElement }, id: string) =>
    Array.from(api.container.querySelectorAll(`.axdb-tabs[data-tabs-id="${id}"] .axdb-tab`)).map((t) => t.textContent);
  const cm = (api: ReturnType<typeof makeApi>) => api.getEngine().commandManager;

  it('a tab dragged onto the board becomes a ONE-TAB GROUP of its own, and undo puts it back', async () => {
    const { api, model, handle } = up(BOARD());
    await dragTab(api, 'panel', 'p-three', { x: 150, y: 400 });
    // the page left its container and arrived inside a new tab container
    expect(stripOf(api, 'panel')).toEqual(['Filters', 'Alerts']);
    expect(handle.getLayout('p-three__group')).toBe('tabs');
    expect(stripOf(api, 'p-three__group')).toEqual(['Notes']);
    expect(handle.getActiveTab('p-three__group')).toBe('p-three');
    expect(model.getGroup('p-three__group')!.members!.has('p-three')).toBe(true);
    expect(model.getGroup('panel')!.members!.has('p-three')).toBe(false);
    // its widget is on the canvas, under the new group's strip
    const w = model.getNode('k-three')!;
    const g = model.getGroup('p-three__group')!;
    expect(w.position.x).toBeGreaterThan(PARKED);
    expect(w.position.y).toBeGreaterThanOrEqual(g.position.y + 18);
    // it serialises as a tab container holding the page, beside the one it left
    const snap = handle.toJSON().views[0].widgets;
    const born = snap.find((x) => x.id === 'p-three__group')!;
    expect(born.layout).toBe('tabs');
    expect(born.widgets?.map((p) => p.id)).toEqual(['p-three']);
    expect(snap.find((x) => x.id === 'panel')!.widgets?.map((p) => p.id)).toEqual(['p-one', 'p-two']);
    // ONE undo: the group is gone, the tab is back, the page is parked again
    await cm(api).undo();
    await settle();
    expect(model.getGroup('p-three__group')).toBeUndefined();
    expect(stripOf(api, 'panel')).toEqual(['Filters', 'Alerts', 'Notes']);
    expect(api.container.querySelector('.axdb-tabs[data-tabs-id="p-three__group"]')).toBeNull();
    expect(handle.toJSON().views[0].widgets.some((x) => x.id === 'p-three__group')).toBe(false);
    expect(model.getGroup('panel')!.members!.has('p-three')).toBe(true);
    // …and redo brings it back exactly
    await cm(api).redo();
    await settle();
    expect(stripOf(api, 'p-three__group')).toEqual(['Notes']);
    expect(stripOf(api, 'panel')).toEqual(['Filters', 'Alerts']);
  });

  it('the torn-out group survives toJSON → dashboard() and a saved document', async () => {
    const first = up(BOARD());
    await dragTab(first.api, 'panel', 'p-two', { x: 150, y: 400 });
    const second = up(dashboard({ ...first.handle.toJSON() }));
    expect(second.handle.getLayout('p-two__group')).toBe('tabs');
    expect(stripOf(second.api, 'p-two__group')).toEqual(['Alerts']);
    expect(stripOf(second.api, 'panel')).toEqual(['Filters', 'Notes']);
    const json = JSON.stringify(new DiagramSerializer().serialize(first.model));
    const loaded = fromDocument(json);
    const api = makeApi(loaded.model as DiagramModel);
    loaded.finalize(api);
    mounted.push(loaded.handle as DashboardHandle);
    expect(loaded.handle!.getLayout('p-two__group')).toBe('tabs');
    expect(stripOf(api, 'p-two__group')).toEqual(['Alerts']);
  });

  it('tearing the LAST tab out closes the empty container, and undo reopens it', async () => {
    const { api, model, handle } = up(
      dashboard({
        columns: 12,
        width: 1200,
        height: 600,
        rowHeight: 60,
        widgets: [
          { id: 'free', kind: 'line', span: 6, rows: 4, x: 0, y: 0 },
          { id: 'solo', title: 'Solo', span: 6, rows: 4, x: 6, y: 0, layout: 'tabs', widgets: [PAGE('p-only', 'Only', 'k-only')] },
        ],
      })
    );
    await dragTab(api, 'solo', 'p-only', { x: 150, y: 400 });
    expect(model.getGroup('solo')).toBeUndefined();
    expect(api.container.querySelector('.axdb-tabs[data-tabs-id="solo"]')).toBeNull();
    expect(stripOf(api, 'p-only__group')).toEqual(['Only']);
    expect(handle.toJSON().views[0].widgets.map((x) => x.id).sort()).toEqual(['free', 'p-only__group']);
    await cm(api).undo();
    await settle();
    expect(model.getGroup('solo')!.members!.has('p-only')).toBe(true);
    expect(stripOf(api, 'solo')).toEqual(['Only']);
    expect(model.getGroup('p-only__group')).toBeUndefined();
    expect(handle.toJSON().views[0].widgets.map((x) => x.id).sort()).toEqual(['free', 'solo']);
  });

  // -- dropping a tab ONTO another group: VS Code's editor moved from the right group to the left --
  const TWO = () =>
    dashboard({
      columns: 12,
      width: 1200,
      height: 600,
      gap: 10,
      rowHeight: 60,
      widgets: [
        { id: 'left', title: 'Left group', span: 6, rows: 6, x: 0, y: 0, layout: 'tabs', widgets: [PAGE('l1', 'Sales', 'k-l1'), PAGE('l2', 'Margin', 'k-l2')] },
        { id: 'right', title: 'Right group', span: 6, rows: 6, x: 6, y: 0, layout: 'tabs', widgets: [PAGE('r1', 'Filters', 'k-r1'), PAGE('r2', 'Notes', 'k-r2')] },
      ],
    });
  const dragTabFrom = async (api: { container: HTMLElement }, containerId: string, pageId: string, from: { x: number; y: number }, to: { x: number; y: number }, via: Array<{ x: number; y: number }> = []) => {
    const tab = api.container.querySelector(`.axdb-tabs[data-tabs-id="${containerId}"] .axdb-tab[data-tab-id="${pageId}"]`) as HTMLElement;
    const ev = (el: EventTarget, type: string, x: number, y: number) =>
      el.dispatchEvent(Object.assign(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y }), { pointerId: 1 }));
    ev(tab, 'pointerdown', from.x, from.y);
    ev(tab, 'pointermove', from.x - 40, from.y);
    for (const v of via) ev(window, 'pointermove', v.x, v.y);
    ev(window, 'pointermove', to.x, to.y);
    ev(window, 'pointerup', to.x, to.y);
    tab.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await settle();
  };

  it('a tab dropped onto ANOTHER group joins it as a tab, on the end and active, in one undoable step', async () => {
    const { api, model, handle } = up(TWO());
    expect(stripOf(api, 'left')).toEqual(['Sales', 'Margin']);
    expect(handle.getActiveTab('left')).toBe('l1');
    // the right group's Notes tab, released over the CENTRE of the left group's body (its outer thirds split)
    const lf = (() => { const g = model.getGroup('left')!; return { x: g.position.x, y: g.position.y, w: g.size!.width, h: g.size!.height }; })();
    await dragTabFrom(api, 'right', 'r2', { x: 900, y: 10 }, { x: lf.x + lf.w / 2, y: lf.y + 30 + (lf.h - 30) / 2 });
    expect(stripOf(api, 'left')).toEqual(['Sales', 'Margin', 'Notes']);
    expect(stripOf(api, 'right')).toEqual(['Filters']);
    expect(handle.getActiveTab('left')).toBe('r2');
    expect(model.getGroup('left')!.members!.has('r2')).toBe(true);
    expect(model.getGroup('right')!.members!.has('r2')).toBe(false);
    expect(model.getGroup('r2__group')).toBeUndefined(); // it JOINED, it did not become a group of its own
    // its widget shows inside the left group; the page it displaced is parked
    const kr2 = model.getNode('k-r2')!;
    const left = model.getGroup('left')!;
    expect(kr2.position.x).toBeGreaterThan(PARKED);
    expect(kr2.position.x).toBeLessThan(left.position.x + left.size!.width);
    expect(onCanvas(model, ['k-l1', 'k-l2', 'k-r2'])).toEqual(['k-r2']);
    // serialised as the left group's third page
    const snap = handle.toJSON().views[0].widgets;
    expect(snap.find((w) => w.id === 'left')!.widgets?.map((p) => p.id)).toEqual(['l1', 'l2', 'r2']);
    expect(snap.find((w) => w.id === 'left')!.active).toBe('r2');
    expect(snap.find((w) => w.id === 'right')!.widgets?.map((p) => p.id)).toEqual(['r1']);
    // one undo puts it back — including which tab the left group was showing
    await cm(api).undo();
    await settle();
    expect(stripOf(api, 'left')).toEqual(['Sales', 'Margin']);
    expect(stripOf(api, 'right')).toEqual(['Filters', 'Notes']);
    expect(handle.getActiveTab('left')).toBe('l1');
    expect(model.getGroup('right')!.members!.has('r2')).toBe(true);
  });

  it('moving a group\'s LAST tab into another group closes the empty group', async () => {
    const { api, model, handle } = up(TWO());
    const centre = () => { const g = model.getGroup('left')!; return { x: g.position.x + g.size!.width / 2, y: g.position.y + 30 + (g.size!.height - 30) / 2 }; };
    await dragTabFrom(api, 'right', 'r2', { x: 900, y: 10 }, centre());
    await dragTabFrom(api, 'right', 'r1', { x: 700, y: 10 }, centre());
    expect(stripOf(api, 'left')).toEqual(['Sales', 'Margin', 'Notes', 'Filters']);
    expect(model.getGroup('right')).toBeUndefined();
    expect(api.container.querySelector('.axdb-tabs[data-tabs-id="right"]')).toBeNull();
    expect(handle.toJSON().views[0].widgets.map((w) => w.id)).toEqual(['left']);
    await cm(api).undo();
    await settle();
    expect(stripOf(api, 'right')).toEqual(['Filters']);
    expect(stripOf(api, 'left')).toEqual(['Sales', 'Margin', 'Notes']);
  });

  // -- the four gaps: an empty page closes · a widget dropped on a strip becomes a tab · reorder · a section moves --
  it('GAP 1: when a page\'s last widget leaves, the page closes — and an emptied group with it', async () => {
    const { api, model, handle } = up(
      dashboard({
        columns: 12,
        width: 1200,
        height: 600,
        rowHeight: 60,
        widgets: [
          { id: 'free', kind: 'line', span: 6, rows: 4, x: 0, y: 0 },
          { id: 'solo', title: 'Solo', span: 6, rows: 4, x: 6, y: 0, layout: 'tabs', widgets: [PAGE('p-only', 'Only', 'k-only'), PAGE('p-two', 'Two', 'k-two')] },
        ],
      })
    );
    handle.widget('k-only')!.remove();
    await settle();
    expect(model.getNode('k-only')).toBeUndefined();
    expect(model.getGroup('p-only')).toBeUndefined();
    expect(stripOf(api, 'solo')).toEqual(['Two']);
    expect(handle.getActiveTab('solo')).toBe('p-two');
    handle.widget('k-two')!.remove();
    await settle();
    expect(model.getGroup('solo')).toBeUndefined();
    expect(api.container.querySelector('.axdb-tabs[data-tabs-id="solo"]')).toBeNull();
    expect(handle.toJSON().views[0].widgets.map((w) => w.id)).toEqual(['free']);
    await cm(api).undo();
    await settle();
    expect(stripOf(api, 'solo')).toEqual(['Two']);
    expect(model.getNode('k-two')).toBeDefined();
    await cm(api).undo();
    await settle();
    expect(stripOf(api, 'solo')).toEqual(['Only', 'Two']);
    expect(model.getGroup('p-only')!.members!.has('k-only')).toBe(true);
  });

  it('GAP 2: a widget moved onto a strip becomes a new tab there, active, and undo puts it back', async () => {
    const { api, model, handle } = up(BOARD());
    expect(await handle.moveToTab('free', 'panel', 1)).toBe(true);
    await settle();
    expect(stripOf(api, 'panel')).toEqual(['Filters', 'free', 'Alerts', 'Notes']);
    expect(handle.getActiveTab('panel')).toBe('free__page');
    expect(model.getGroup('free__page')!.members!.has('free')).toBe(true);
    expect(model.getGroup('main')!.members!.has('free')).toBe(false);
    expect(handle.getLayout('free__page')).toBe('grid');
    // the widget lays out inside its new page, on the canvas
    const w = model.getNode('free')!;
    expect(w.position.x).toBeGreaterThan(PARKED);
    expect(w.size!.width).toBeGreaterThan(200);
    const snap = handle.toJSON().views[0].widgets;
    expect(snap.map((x) => x.id)).toEqual(['panel']);
    expect(snap[0].widgets?.map((p) => p.id)).toEqual(['p-one', 'free__page', 'p-two', 'p-three']);
    expect(snap[0].widgets?.[1].widgets?.map((x) => x.id)).toEqual(['free']);
    await cm(api).undo();
    await settle();
    expect(stripOf(api, 'panel')).toEqual(['Filters', 'Alerts', 'Notes']);
    expect(model.getGroup('free__page')).toBeUndefined();
    expect(model.getGroup('main')!.members!.has('free')).toBe(true);
    expect(handle.getActiveTab('panel')).toBe('p-one');
  });

  it('GAP 3: a tab reordered along its own strip keeps the order through toJSON, a saved document and undo', async () => {
    const first = up(BOARD());
    expect(first.handle.moveTab('panel', 'p-three', 0)).toBe(true);
    await settle();
    expect(stripOf(first.api, 'panel')).toEqual(['Notes', 'Filters', 'Alerts']);
    expect(first.handle.toJSON().views[0].widgets[1].widgets?.map((p) => p.id)).toEqual(['p-three', 'p-one', 'p-two']);
    const second = up(dashboard({ ...first.handle.toJSON() }));
    expect(stripOf(second.api, 'panel')).toEqual(['Notes', 'Filters', 'Alerts']);
    const json = JSON.stringify(new DiagramSerializer().serialize(first.model));
    const loaded = fromDocument(json);
    const api = makeApi(loaded.model as DiagramModel);
    loaded.finalize(api);
    mounted.push(loaded.handle as DashboardHandle);
    expect(stripOf(api, 'panel')).toEqual(['Notes', 'Filters', 'Alerts']);
    await cm(first.api).undo();
    await settle();
    expect(stripOf(first.api, 'panel')).toEqual(['Filters', 'Alerts', 'Notes']);
    expect(first.handle.moveTab('panel', 'nope', 0)).toBe(false);
  });

  it('GAP 4: a section moves as one tile, children with it, undoable', async () => {
    const { api, model, handle } = up(
      dashboard({
        columns: 12,
        width: 1200,
        height: 600,
        rowHeight: 60,
        widgets: [
          { id: 'sec', title: 'Section', span: 6, rows: 2, x: 0, y: 0, columns: 6, caption: true, widgets: [{ id: 's1', kind: 'kpi', span: 6, rows: 2, x: 0, y: 0 }] },
          { id: 'tabs', title: 'Tabs', span: 6, rows: 4, x: 6, y: 0, layout: 'tabs', widgets: [PAGE('t1', 'One', 'k1')] },
          { id: 'lone', kind: 'kpi', span: 6, rows: 2, x: 0, y: 2 },
        ],
      })
    );
    const before = { sec: { ...model.getGroup('sec')!.position }, s1: { ...model.getNode('s1')!.position } };
    expect(await handle.widget('sec')!.moveTo(0, 2)).toBe(true);
    expect(handle.widget('sec')!.cell).toEqual({ x: 0, y: 2, w: 6, h: 2 });
    // the child rode along, and the tile that was there moved out of the way
    expect(model.getNode('s1')!.position.y).toBeGreaterThan(before.s1.y);
    expect(model.getGroup('sec')!.position.y).toBeGreaterThan(before.sec.y);
    expect(handle.widget('lone')!.cell!.y).not.toBe(2);
    await cm(api).undo();
    await settle();
    expect(handle.widget('sec')!.cell).toEqual({ x: 0, y: 0, w: 6, h: 2 });
    expect(model.getNode('s1')!.position.y).toBe(before.s1.y);
    // a TAB GROUP is a section too
    expect(await handle.widget('tabs')!.moveTo(6, 4)).toBe(true);
    expect(handle.widget('tabs')!.cell).toEqual({ x: 6, y: 4, w: 6, h: 4 });
  });

  // -- the drop model the docking libraries share: edge splits, root docking, deepest target wins --
  const frameOf = (model: DiagramModel, id: string) => { const g = model.getGroup(id)!; return { x: g.position.x, y: g.position.y, w: g.size!.width, h: g.size!.height }; };
  const cellOf = (handle: DashboardHandle, id: string) => handle.widget(id)?.cell ?? null;

  it('SPLIT: a tab dropped on another group\'s RIGHT third splits it — the target keeps the left half, the page takes the right, undoable', async () => {
    const { api, model, handle } = up(TWO());
    const before = cellOf(handle, 'left')!;
    expect(before).toEqual({ x: 0, y: 0, w: 6, h: 6 });
    const f = frameOf(model, 'left');
    // the right third of the body, mid-height
    await dragTabFrom(api, 'right', 'r2', { x: 900, y: 10 }, { x: f.x + f.w * 0.9, y: f.y + 30 + (f.h - 30) * 0.5 });
    expect(stripOf(api, 'right')).toEqual(['Filters']);
    expect(stripOf(api, 'left')).toEqual(['Sales', 'Margin']); // it did NOT join
    expect(cellOf(handle, 'left')).toEqual({ x: 0, y: 0, w: 3, h: 6 });
    expect(cellOf(handle, 'r2__group')).toEqual({ x: 3, y: 0, w: 3, h: 6 });
    expect(stripOf(api, 'r2__group')).toEqual(['Notes']);
    expect(handle.getLayout('r2__group')).toBe('tabs');
    await cm(api).undo();
    await settle();
    expect(cellOf(handle, 'left')).toEqual(before);
    expect(model.getGroup('r2__group')).toBeUndefined();
    expect(stripOf(api, 'right')).toEqual(['Filters', 'Notes']);
  });

  it('SPLIT: the BOTTOM third stacks the page under the target; the top third puts it above', async () => {
    const { api, model, handle } = up(TWO());
    let f = frameOf(model, 'left');
    await dragTabFrom(api, 'right', 'r2', { x: 900, y: 10 }, { x: f.x + f.w * 0.5, y: f.y + 30 + (f.h - 30) * 0.92 });
    expect(cellOf(handle, 'left')).toEqual({ x: 0, y: 0, w: 6, h: 3 });
    expect(cellOf(handle, 'r2__group')).toEqual({ x: 0, y: 3, w: 6, h: 3 });
    await cm(api).undo();
    await settle();
    f = frameOf(model, 'left');
    await dragTabFrom(api, 'right', 'r2', { x: 900, y: 10 }, { x: f.x + f.w * 0.5, y: f.y + 30 + (f.h - 30) * 0.08 });
    expect(cellOf(handle, 'r2__group')).toEqual({ x: 0, y: 0, w: 6, h: 3 });
    expect(cellOf(handle, 'left')).toEqual({ x: 0, y: 3, w: 6, h: 3 });
  });

  it('SPLIT: the centre third still JOINS, and a group too small to halve joins instead of splitting', async () => {
    const { api, model, handle } = up(
      dashboard({
        columns: 12,
        width: 1200,
        height: 600,
        gap: 10,
        rowHeight: 60,
        widgets: [
          { id: 'thin', title: 'Thin', span: 1, rows: 6, x: 0, y: 0, layout: 'tabs', widgets: [PAGE('t1', 'One', 'k-t1')] },
          { id: 'right', title: 'Right group', span: 6, rows: 6, x: 6, y: 0, layout: 'tabs', widgets: [PAGE('r1', 'Filters', 'k-r1'), PAGE('r2', 'Notes', 'k-r2')] },
        ],
      })
    );
    const f = frameOf(model, 'thin');
    // aim at its right third: one column cannot be halved, so it joins
    await dragTabFrom(api, 'right', 'r2', { x: 900, y: 10 }, { x: f.x + f.w * 0.9, y: f.y + 30 + (f.h - 30) * 0.5 });
    expect(stripOf(api, 'thin')).toEqual(['One', 'Notes']);
    expect(cellOf(handle, 'thin')).toEqual({ x: 0, y: 0, w: 1, h: 6 });
    expect(model.getGroup('r2__group')).toBeUndefined();
  });

  it('ROOT DOCK: a tab dropped on the board\'s TOP edge docks a full-width group there, pushing the rest down', async () => {
    const { api, model, handle } = up(TWO());
    // the board group is at (0,0); the top band is the first 20 px of the visible canvas
    await dragTabFrom(api, 'right', 'r2', { x: 900, y: 10 }, { x: 300, y: 4 });
    const born = cellOf(handle, 'r2__group')!;
    expect(born.x).toBe(0);
    expect(born.y).toBe(0);
    expect(born.w).toBe(12);
    expect(born.h).toBeGreaterThanOrEqual(2);
    expect(cellOf(handle, 'left')!.y).toBe(born.h);
    expect(cellOf(handle, 'right')!.y).toBe(born.h);
    expect(stripOf(api, 'right')).toEqual(['Filters']);
    await cm(api).undo();
    await settle();
    expect(model.getGroup('r2__group')).toBeUndefined();
    expect(cellOf(handle, 'left')!.y).toBe(0);
  });

  it('ROOT DOCK: the LEFT edge docks a full-height group at column 0', async () => {
    const { api, handle } = up(TWO());
    await dragTabFrom(api, 'right', 'r2', { x: 900, y: 10 }, { x: 8, y: 200 });
    const born = cellOf(handle, 'r2__group')!;
    expect(born.x).toBe(0);
    expect(born.y).toBe(0);
    expect(born.h).toBe(6); // as tall as the board's rows
    expect(born.w).toBeGreaterThanOrEqual(2);
    expect(cellOf(handle, 'left')!.y).toBeGreaterThan(0); // pushed out of the way
  });

  it('ROOT DOCK: a ghost that sat mid-board still docks FULL width — the cell is taken in an order that fits', async () => {
    const { api, handle } = up(TWO());
    // Held below the board first: the ghost enters at the pointer's column,
    // well right of 0. Growing it to 12 columns THERE is clamped by the
    // board's edge, so the dock must move it to column 0 before it grows.
    await dragTabFrom(api, 'right', 'r2', { x: 900, y: 10 }, { x: 300, y: 4 }, [{ x: 800, y: 700 }]);
    const born = cellOf(handle, 'r2__group')!;
    expect(born).toBeTruthy();
    expect(born.x).toBe(0);
    expect(born.y).toBe(0);
    expect(born.w).toBe(12);
    expect(cellOf(handle, 'left')!.y).toBe(born.h);
    expect(cellOf(handle, 'right')!.y).toBe(born.h);
  });

  it('ROOT DOCK: the docked group takes at most HALF the board\'s rows — a split, not the page\'s full height', async () => {
    const { api, handle } = up(TWO());
    // The page is 4 rows tall plus its strip; the board is 6 rows. Docked at
    // the top it takes 3, the way VS Code's edge drop splits the area in two.
    await dragTabFrom(api, 'right', 'r2', { x: 900, y: 10 }, { x: 300, y: 4 });
    const born = cellOf(handle, 'r2__group')!;
    expect(born).toBeTruthy();
    expect(born.w).toBe(12);
    expect(born.h).toBeGreaterThanOrEqual(2);
    expect(born.h).toBeLessThanOrEqual(3);
    expect(cellOf(handle, 'left')!.y).toBe(born.h);
  });

  it('ROOT DOCK: a top dock INSERTS rows — every tile keeps its column and moves down by exactly the band\'s height', async () => {
    // The fluid-board demo's layout. The engine's push cascade resolved these
    // collisions one tile at a time and tore the KPI row apart (two of its
    // tiles ended under the chart); an edge dock shoves the whole area down
    // intact, the way VS Code's does.
    const K = (id: string, span: number, rows: number, x: number, y: number): DashboardWidgetSpec => ({ id, kind: 'kpi', span, rows, x, y });
    const { api, model, handle } = up(
      dashboard({
        columns: 12,
        width: 1200,
        height: 600,
        gap: 10,
        rowHeight: 60,
        sizing: 'grow', // the demo's board: full, and it grows
        widgets: [
          K('rev', 2, 1, 0, 0), K('cust', 2, 1, 2, 0), K('win', 2, 1, 4, 0), K('nps', 2, 1, 6, 0),
          K('trend', 6, 3, 0, 1), K('mix', 3, 3, 6, 1),
          K('reps', 5, 3, 0, 4), K('funnel', 4, 3, 5, 4),
          { id: 'ops', title: 'Operations', span: 9, rows: 1, x: 0, y: 7, columns: 9, widgets: [K('orders', 4, 1, 0, 0)] },
          { id: 'side', title: 'Side', span: 3, rows: 8, x: 9, y: 0, layout: 'tabs', widgets: [PAGE('p1', 'Filters', 'k1'), PAGE('p2', 'Alerts', 'k2')] },
        ],
      })
    );
    const rest: Record<string, { x: number; y: number; w: number; h: number }> = {};
    for (const id of ['rev', 'cust', 'win', 'nps', 'trend', 'mix', 'reps', 'funnel', 'ops', 'side']) rest[id] = cellOf(handle, id)!;
    expect(rest['trend']).toEqual({ x: 0, y: 1, w: 6, h: 3 });
    const tab = api.container.querySelector('.axdb-tabs[data-tabs-id="side"] .axdb-tab[data-tab-id="p2"]') as HTMLElement;
    expect(tab).toBeTruthy();
    await dragTabFrom(api, 'side', 'p2', { x: 1000, y: 10 }, { x: 400, y: 4 });
    const born = cellOf(handle, 'p2__group')!;
    expect(born).toBeTruthy();
    expect(born).toEqual(expect.objectContaining({ x: 0, y: 0, w: 12 }));
    for (const [id, c] of Object.entries(rest)) expect({ id, cell: cellOf(handle, id) }).toEqual({ id, cell: { ...c, y: c.y + born.h } });
    await cm(api).undo();
    await settle();
    expect(model.getGroup('p2__group')).toBeUndefined();
    for (const [id, c] of Object.entries(rest)) expect({ id, cell: cellOf(handle, id) }).toEqual({ id, cell: c });
  });

  it('an OUTSIDE widget dragged into a FULL page\'s body is taken — the page squeezes its rows and the widget under the pointer moves down', async () => {
    // The fluid demo: a 2×1 KPI dragged onto Region in the Filters page, whose
    // two 4-row KPIs fill all 8 rows. The bound page refused the adoption and
    // showed NOTHING; a fit board squeezes for a tile that arrives by hand.
    const { api, model, handle } = up(
      dashboard({
        columns: 12,
        width: 1200,
        height: 600,
        gap: 10,
        rowHeight: 60,
        sizing: 'grow',
        widgets: [
          { id: 'nps', kind: 'kpi', span: 2, rows: 1, x: 0, y: 0 },
          { id: 'side', title: 'Side', span: 3, rows: 8, x: 9, y: 0, layout: 'tabs', widgets: [
            { id: 'p1', title: 'Filters', columns: 3, widgets: [{ id: 'k1', kind: 'kpi', span: 3, rows: 4, x: 0, y: 0 }, { id: 'k2', kind: 'kpi', span: 3, rows: 4, x: 0, y: 4 }] },
            { id: 'p2', title: 'Alerts', columns: 3, widgets: [{ id: 'k3', kind: 'kpi', span: 3, rows: 8, x: 0, y: 0 }] },
          ] },
        ],
      })
    );
    const pathOf = (id: string): string | null => {
      const walk = (ws: Array<{ id: string; widgets?: unknown[] }> | undefined, path: string[]): string[] | null => {
        for (const w of ws ?? []) {
          if (w.id === id) return [...path, w.id];
          const r = walk(w.widgets as Array<{ id: string; widgets?: unknown[] }> | undefined, [...path, w.id]);
          if (r) return r;
        }
        return null;
      };
      for (const v of handle.toJSON().views) {
        const r = walk(v.widgets as Array<{ id: string; widgets?: unknown[] }>, [v.id]);
        if (r) return r.join(' > ');
      }
      return null;
    };
    expect(pathOf('nps')).toBe('main > nps');
    const page = frameOf(model, 'p1');
    const k1 = model.getNode('k1')!;
    const overK1 = { x: k1.position.x + k1.size.width / 2, y: k1.position.y + k1.size.height / 2 };
    expect(overK1.x).toBeGreaterThan(page.x);
    expect(overK1.y).toBeGreaterThan(page.y);
    const tool = toolOf('main');
    const nps = model.getNode('nps')!;
    const from = { x: nps.position.x + 20, y: nps.position.y + 20 };
    const hit = { node: nps, empty: false };
    tool.onPointerDown?.(tev('down', from.x, from.y), hit);
    tool.onPointerMove?.(tev('move', from.x + 30, from.y + 30), hit);
    tool.onPointerMove?.(tev('move', overK1.x, overK1.y), hit);
    tool.onPointerMove?.(tev('move', overK1.x + 1, overK1.y + 1), hit);
    tool.onPointerUp?.(tev('up', overK1.x + 1, overK1.y + 1), hit);
    await settle();
    expect(pathOf('nps')).toBe('main > side > p1 > nps');
    // the page took it above Region (Region moved down), and holds more rows than its 8-row design
    const k1After = cellOf(handle, 'k1')!;
    const npsAfter = cellOf(handle, 'nps')!;
    expect(k1After.y).toBeGreaterThan(0);
    expect(npsAfter.y).toBeLessThan(k1After.y);
    expect(cellOf(handle, 'k2')!.y).toBe(k1After.y + k1After.h);
    await cm(api).undo();
    await settle();
    expect(pathOf('nps')).toBe('main > nps');
    expect(cellOf(handle, 'k1')).toEqual({ x: 0, y: 0, w: 3, h: 4 });
    expect(cellOf(handle, 'k2')).toEqual({ x: 0, y: 4, w: 3, h: 4 });
  });

  it('ROOT DOCK: the bands are measured on the SCREEN — a board scrolled 30 px still docks at its visible top edge', async () => {
    const { api, handle } = up(TWO());
    // The camera sits 30 px down the board: the world point under a client
    // point is 30 px lower than it reads. Measured against the frame in world
    // space the top band would be scrolled out of reach; it is the visible
    // canvas's top 20 px, wherever the camera is.
    const rect = { left: 0, top: 0, right: 1200, bottom: 600, width: 1200, height: 600, x: 0, y: 0, toJSON: () => ({}) };
    Object.defineProperty(api.container, 'getBoundingClientRect', { value: () => rect, configurable: true });
    (api as unknown as { viewport: { clientToWorld: (x: number, y: number) => { x: number; y: number } } }).viewport.clientToWorld = (x, y) => ({ x, y: y + 30 });
    await dragTabFrom(api, 'right', 'r2', { x: 900, y: 10 }, { x: 300, y: 4 });
    const born = cellOf(handle, 'r2__group')!;
    expect(born).toBeTruthy();
    expect(born.x).toBe(0);
    expect(born.y).toBe(0);
    expect(born.w).toBe(12);
    expect(cellOf(handle, 'left')!.y).toBe(born.h);
  });

  it('ROOT DOCK: the top band beats the body of a group that sits against the board\'s edge (Dockview\'s container edges)', async () => {
    const { api, model, handle } = up(TWO());
    const f = frameOf(model, 'left');
    // 4 px inside the left group's frame, 14 px from the board's top: the band, not a split
    await dragTabFrom(api, 'right', 'r2', { x: 900, y: 10 }, { x: f.x + f.w * 0.5, y: f.y + 4 });
    const born = cellOf(handle, 'r2__group')!;
    expect(born).toBeTruthy();
    expect(born.w).toBe(12);
    expect(born.y).toBe(0);
    expect(cellOf(handle, 'left')).toEqual({ x: 0, y: born.h, w: 6, h: 6 });
  });

  it('ROOT DOCK: a strip inside the top band still wins — the tab joins that group', async () => {
    const { api, model, handle } = up(TWO());
    const f = frameOf(model, 'left');
    const strip = api.container.querySelector('.axdb-tabs[data-tabs-id="left"]') as HTMLElement;
    const r = { left: f.x, top: f.y, right: f.x + f.w, bottom: f.y + 30, width: f.w, height: 30, x: f.x, y: f.y, toJSON: () => ({}) };
    Object.defineProperty(strip, 'getBoundingClientRect', { value: () => r, configurable: true });
    await dragTabFrom(api, 'right', 'r2', { x: 900, y: 10 }, { x: f.x + f.w * 0.5, y: f.y + 4 });
    expect(model.getGroup('r2__group')).toBeUndefined();
    expect(stripOf(api, 'left')).toEqual(['Sales', 'Margin', 'Notes']);
    expect(cellOf(handle, 'left')).toEqual({ x: 0, y: 0, w: 6, h: 6 });
  });

  it('DEEPEST WINS: a tab dropped on an inner group\'s strip INSIDE its own container joins the inner group', async () => {
    const { api, model, handle } = up(
      dashboard({
        columns: 12,
        width: 1200,
        height: 600,
        gap: 10,
        rowHeight: 60,
        widgets: [
          {
            id: 'outer', title: 'Outer', span: 12, rows: 8, x: 0, y: 0, layout: 'tabs',
            widgets: [
              { id: 'p-host', title: 'Host', columns: 12, widgets: [
                { id: 'inner', title: 'Inner', span: 12, rows: 6, x: 0, y: 0, layout: 'tabs', widgets: [PAGE('i1', 'Inner A', 'k-i1'), PAGE('i2', 'Inner B', 'k-i2')] },
              ] },
              PAGE('p-loose', 'Loose', 'k-loose'),
            ],
          },
        ],
      })
    );
    expect(stripOf(api, 'outer')).toEqual(['Host', 'Loose']);
    expect(stripOf(api, 'inner')).toEqual(['Inner A', 'Inner B']);
    const f = frameOf(model, 'inner');
    // release over the inner group's BODY (its strip has no client rect in jsdom): it must join it, not read as "home"
    await dragTabFrom(api, 'outer', 'p-loose', { x: 700, y: 10 }, { x: f.x + f.w * 0.5, y: f.y + 30 + (f.h - 30) * 0.5 });
    expect(stripOf(api, 'inner')).toEqual(['Inner A', 'Inner B', 'Loose']);
    expect(stripOf(api, 'outer')).toEqual(['Host']);
    expect(handle.getActiveTab('inner')).toBe('p-loose');
    await cm(api).undo();
    await settle();
    expect(stripOf(api, 'outer')).toEqual(['Host', 'Loose']);
    expect(stripOf(api, 'inner')).toEqual(['Inner A', 'Inner B']);
  });

  it('a board with no tab container carries no strip at all', () => {
    const { api } = up(
      dashboard({ columns: 12, width: 1200, height: 600, widgets: [{ id: 'a', kind: 'kpi', span: 6, rows: 2, x: 0, y: 0 }] })
    );
    expect(api.container.querySelector('.axdb-tabs')).toBeNull();
  });
});
