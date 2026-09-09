/**
 * TAB CONTAINERS (element 0.4.27) — `layout: 'tabs'` makes every child that
 * carries `widgets` a PAGE: one visible at a time, a strip of tabs across the
 * top, the active page persisted. DevExpress ships this as its Tab Container.
 */
import { CommandManager, DiagramModel, DiagramSerializer, EventBus, NodeModel } from '@grafloria/engine';
import { dashboard, type DashboardHandle, type DashboardSpec, type DashboardWidgetSpec } from './dashboard';
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

  it('a board with no tab container carries no strip at all', () => {
    const { api } = up(
      dashboard({ columns: 12, width: 1200, height: 600, widgets: [{ id: 'a', kind: 'kpi', span: 6, rows: 2, x: 0, y: 0 }] })
    );
    expect(api.container.querySelector('.axdb-tabs')).toBeNull();
  });
});
