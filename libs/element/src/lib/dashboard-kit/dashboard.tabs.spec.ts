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

  it('a board with no tab container carries no strip at all', () => {
    const { api } = up(
      dashboard({ columns: 12, width: 1200, height: 600, widgets: [{ id: 'a', kind: 'kpi', span: 6, rows: 2, x: 0, y: 0 }] })
    );
    expect(api.container.querySelector('.axdb-tabs')).toBeNull();
  });
});
